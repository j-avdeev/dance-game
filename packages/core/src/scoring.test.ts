import { describe, expect, it } from "vitest";
import { scoreSample, scoreStaticPose, timingPenalty } from "./scoring.js";
import { extractPoseFeatures, type TimedLandmarks } from "./features.js";
import { toAspectCorrectedLandmarks } from "./pose.js";
import { DEFAULT_SCORING_CONFIG } from "./config.js";
import { PoseLandmarkIndex, POSE_LANDMARK_COUNT } from "./landmarks.js";
import type { Landmark } from "./types.js";

/**
 * The behaviours required by PLAN.md, M3.
 *
 * These encode what "fair" means for this game, so they are written against
 * synthetic poses whose geometry is known exactly rather than against recorded
 * data whose correct score nobody can state.
 */

const L = PoseLandmarkIndex;

/** Builds a standing pose; every landmark defaults to a sensible position. */
function makePose(overrides: Partial<Record<number, [number, number]>> = {}): Landmark[] {
  const base: Record<number, [number, number]> = {
    [L.nose]: [0.5, 0.1],
    [L.leftEyeInner]: [0.48, 0.09],
    [L.leftEye]: [0.47, 0.09],
    [L.leftEyeOuter]: [0.46, 0.09],
    [L.rightEyeInner]: [0.52, 0.09],
    [L.rightEye]: [0.53, 0.09],
    [L.rightEyeOuter]: [0.54, 0.09],
    [L.leftEar]: [0.45, 0.1],
    [L.rightEar]: [0.55, 0.1],
    [L.mouthLeft]: [0.48, 0.13],
    [L.mouthRight]: [0.52, 0.13],
    [L.leftShoulder]: [0.4, 0.25],
    [L.rightShoulder]: [0.6, 0.25],
    [L.leftElbow]: [0.35, 0.4],
    [L.rightElbow]: [0.65, 0.4],
    [L.leftWrist]: [0.3, 0.55],
    [L.rightWrist]: [0.7, 0.55],
    [L.leftPinky]: [0.29, 0.58],
    [L.rightPinky]: [0.71, 0.58],
    [L.leftIndex]: [0.3, 0.59],
    [L.rightIndex]: [0.7, 0.59],
    [L.leftThumb]: [0.31, 0.57],
    [L.rightThumb]: [0.69, 0.57],
    [L.leftHip]: [0.45, 0.55],
    [L.rightHip]: [0.55, 0.55],
    [L.leftKnee]: [0.45, 0.72],
    [L.rightKnee]: [0.55, 0.72],
    [L.leftAnkle]: [0.45, 0.9],
    [L.rightAnkle]: [0.55, 0.9],
    [L.leftHeel]: [0.44, 0.92],
    [L.rightHeel]: [0.56, 0.92],
    [L.leftFootIndex]: [0.47, 0.94],
    [L.rightFootIndex]: [0.53, 0.94],
  };

  const merged = { ...base, ...overrides };
  return Array.from({ length: POSE_LANDMARK_COUNT }, (_, index) => {
    const [x, y] = merged[index] ?? [0.5, 0.5];
    return { x, y, z: 0, visibility: 1 };
  });
}

/** Moves every landmark by a fixed offset. */
function translate(landmarks: Landmark[], dx: number, dy: number): Landmark[] {
  return landmarks.map((landmark) => ({ ...landmark, x: landmark.x + dx, y: landmark.y + dy }));
}

/** Scales the pose about its centre, as if the dancer moved nearer or further. */
function scale(landmarks: Landmark[], factor: number): Landmark[] {
  const cx = 0.5;
  const cy = 0.5;
  return landmarks.map((landmark) => ({
    ...landmark,
    x: cx + (landmark.x - cx) * factor,
    y: cy + (landmark.y - cy) * factor,
  }));
}

/** Wraps a single pose as a history covering a generous time span. */
function staticHistory(landmarks: Landmark[], tMsList: number[]): TimedLandmarks[] {
  return tMsList.map((tMs) => ({ tMs, landmarks }));
}

function scoreTwoPoses(
  player: Landmark[],
  reference: Landmark[],
  options: { mirrored?: boolean; playerOffsetMs?: number } = {},
): ReturnType<typeof scoreSample> {
  const referenceTMs = 1000;
  const offset = options.playerOffsetMs ?? DEFAULT_SCORING_CONFIG.expectedLagMs;

  // Dense histories on both sides so motion features are always available.
  const referenceHistory = staticHistory(reference, [600, 800, 1000, 1200, 1400]);
  const playerHistory = staticHistory(player, [
    referenceTMs + offset - 400,
    referenceTMs + offset - 200,
    referenceTMs + offset,
    referenceTMs + offset + 200,
  ]);

  return scoreSample({
    referenceLandmarks: reference,
    referenceHistory,
    referenceTMs,
    playerHistory,
    mirrored: options.mirrored ?? false,
  });
}

describe("scoreSample", () => {
  it("scores an identical pose near the maximum", () => {
    const pose = makePose();
    const result = scoreTwoPoses(pose, pose);
    expect(result.total).toBeGreaterThan(95);
  });

  it("is unaffected by where the dancer stands in the frame", () => {
    // Two people doing the same move on opposite sides of the room are doing
    // the same move.
    const pose = makePose();
    const identical = scoreTwoPoses(pose, pose).total;
    const translated = scoreTwoPoses(translate(pose, 0.2, -0.05), pose).total;
    expect(Math.abs(translated - identical)).toBeLessThan(1);
  });

  it("is unaffected by how far the dancer stands from the camera", () => {
    const pose = makePose();
    const identical = scoreTwoPoses(pose, pose).total;
    const nearer = scoreTwoPoses(scale(pose, 1.3), pose).total;
    const further = scoreTwoPoses(scale(pose, 0.75), pose).total;
    expect(Math.abs(nearer - identical)).toBeLessThan(1);
    expect(Math.abs(further - identical)).toBeLessThan(1);
  });

  it("scores the same pose captured at different aspect ratios alike", () => {
    // A portrait phone and a landscape reference must agree, which only holds
    // because features are built from aspect-corrected coordinates.
    const raw = makePose();
    const portrait = toAspectCorrectedLandmarks(raw, 720, 1280);
    const landscape = toAspectCorrectedLandmarks(raw, 1280, 720);

    const portraitScore = scoreTwoPoses(portrait, portrait).total;
    const crossScore = scoreTwoPoses(portrait, landscape).total;
    // Aspect correction cannot make different framings identical, but both
    // must remain clearly "the same pose" rather than reading as a mistake.
    expect(portraitScore).toBeGreaterThan(95);
    expect(crossScore).toBeGreaterThan(60);
  });

  it("penalises the wrong arm and blames that arm", () => {
    const reference = makePose();
    const wrongLeftArm = makePose({
      [L.leftElbow]: [0.42, 0.15],
      [L.leftWrist]: [0.45, 0.05],
    });

    const identical = scoreTwoPoses(reference, reference).total;
    const result = scoreTwoPoses(wrongLeftArm, reference);

    // One wrong limb out of five costs real score without being fatal; what
    // matters is that it is clearly separated from a correct performance.
    expect(result.total).toBeLessThan(identical - 10);
    // The breakdown must point at the limb that actually moved.
    expect(result.parts.leftArm).toBeLessThan(60);
    expect(result.parts.rightArm).toBeGreaterThan(90);
  });

  it("separates degrees of wrongness across the grade range", () => {
    // The property the whole game rests on: more wrong must score lower, with
    // enough spread that the grade thresholds mean something.
    const reference = makePose();
    const oneArmWrong = makePose({
      [L.leftElbow]: [0.25, 0.25],
      [L.leftWrist]: [0.1, 0.25],
    });
    const bothArmsWrong = makePose({
      [L.leftElbow]: [0.42, 0.15],
      [L.leftWrist]: [0.45, 0.05],
      [L.rightElbow]: [0.58, 0.15],
      [L.rightWrist]: [0.55, 0.05],
    });
    const nothingMatches = makePose({
      [L.leftElbow]: [0.25, 0.25],
      [L.leftWrist]: [0.1, 0.25],
      [L.rightElbow]: [0.75, 0.25],
      [L.rightWrist]: [0.9, 0.25],
      [L.leftKnee]: [0.3, 0.65],
      [L.leftAnkle]: [0.2, 0.75],
      [L.rightKnee]: [0.7, 0.65],
      [L.rightAnkle]: [0.8, 0.75],
    });

    const scores = [reference, oneArmWrong, bothArmsWrong, nothingMatches].map(
      (pose) => scoreTwoPoses(pose, reference).total,
    );

    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]!).toBeLessThan(scores[i - 1]!);
    }
    // Copying the dance must clearly beat ignoring it.
    expect(scores[0]! - scores[scores.length - 1]!).toBeGreaterThan(35);
  });

  it("penalises a wrong leg and blames that leg", () => {
    const reference = makePose();
    const wrongRightLeg = makePose({
      [L.rightKnee]: [0.72, 0.6],
      [L.rightAnkle]: [0.85, 0.66],
    });

    const result = scoreTwoPoses(wrongRightLeg, reference);
    expect(result.parts.rightLeg).toBeLessThan(60);
    expect(result.parts.leftLeg).toBeGreaterThan(90);
  });

  it("does not crash on low-visibility landmarks, and trusts them less", () => {
    const reference = makePose();
    const hiddenArm = makePose({
      [L.leftElbow]: [0.2, 0.2],
      [L.leftWrist]: [0.1, 0.1],
    }).map((landmark, index) =>
      index === L.leftElbow || index === L.leftWrist || index === L.leftShoulder
        ? { ...landmark, visibility: 0.05 }
        : landmark,
    );

    const result = scoreTwoPoses(hiddenArm, reference);
    expect(Number.isFinite(result.total)).toBe(true);
    // The arm is in the wrong place but was barely seen, so the overall score
    // must not collapse the way it would for a confidently wrong limb.
    expect(result.total).toBeGreaterThan(70);
  });

  it("returns a zero-confidence result when no one was detected", () => {
    const reference = makePose();
    const result = scoreSample({
      referenceLandmarks: reference,
      referenceHistory: staticHistory(reference, [800, 1000, 1200]),
      referenceTMs: 1000,
      playerHistory: [{ tMs: 1200, landmarks: [] }],
      mirrored: false,
    });
    expect(result.total).toBe(0);
    expect(result.confidence).toBe(0);
  });

  it("returns zero when the reference itself has no pose", () => {
    const player = makePose();
    const result = scoreSample({
      referenceLandmarks: [],
      referenceHistory: [],
      referenceTMs: 1000,
      playerHistory: staticHistory(player, [1000, 1200, 1400]),
      mirrored: false,
    });
    expect(result.total).toBe(0);
  });

  describe("mirror mode", () => {
    /** Raises one arm, so the two sides are clearly distinguishable. */
    const raisedLeftArm = makePose({
      [L.leftElbow]: [0.33, 0.2],
      [L.leftWrist]: [0.3, 0.08],
    });
    const raisedRightArm = makePose({
      [L.rightElbow]: [0.67, 0.2],
      [L.rightWrist]: [0.7, 0.08],
    });

    it("expects the opposite arm when the reference is mirrored", () => {
      // The dancer raises their left arm facing the camera; the player facing
      // the screen should raise their right.
      const matching = scoreTwoPoses(raisedRightArm, raisedLeftArm, { mirrored: true }).total;
      const sameSide = scoreTwoPoses(raisedLeftArm, raisedLeftArm, { mirrored: true }).total;
      expect(matching).toBeGreaterThan(sameSide);
    });

    it("expects the same arm when the reference is not mirrored", () => {
      const sameSide = scoreTwoPoses(raisedLeftArm, raisedLeftArm, { mirrored: false }).total;
      const opposite = scoreTwoPoses(raisedRightArm, raisedLeftArm, { mirrored: false }).total;
      expect(sameSide).toBeGreaterThan(opposite);
    });
  });

  describe("timing", () => {
    it("does not penalise a player lagging by the expected amount", () => {
      // The central requirement from the plan review: a typical player is
      // ~200 ms late and must still be able to score top marks.
      const pose = makePose();
      const result = scoreTwoPoses(pose, pose, {
        playerOffsetMs: DEFAULT_SCORING_CONFIG.expectedLagMs,
      });
      expect(result.total).toBeGreaterThan(95);
    });

    it("still scores a slightly-off-tempo player well", () => {
      const pose = makePose();
      const result = scoreTwoPoses(pose, pose, {
        playerOffsetMs: DEFAULT_SCORING_CONFIG.expectedLagMs + 100,
      });
      expect(result.total).toBeGreaterThan(70);
    });

    it("penalises a player who is far too late", () => {
      const pose = makePose();
      const onTime = scoreTwoPoses(pose, pose, {
        playerOffsetMs: DEFAULT_SCORING_CONFIG.expectedLagMs,
      }).total;
      const veryLate = scoreTwoPoses(pose, pose, { playerOffsetMs: 900 }).total;
      expect(veryLate).toBeLessThan(onTime * 0.7);
    });

    it("reports the offset of the pose it matched", () => {
      const pose = makePose();
      const result = scoreTwoPoses(pose, pose, { playerOffsetMs: 200 });
      expect(result.timingOffsetMs).toBeGreaterThan(0);
      expect(result.timingOffsetMs).toBeLessThanOrEqual(400);
    });
  });

  it("is deterministic", () => {
    const player = makePose({ [L.leftWrist]: [0.32, 0.5] });
    const reference = makePose();
    const first = scoreTwoPoses(player, reference);
    const second = scoreTwoPoses(player, reference);
    expect(second).toEqual(first);
  });
});

describe("timingPenalty", () => {
  it("peaks at the expected lag rather than at zero offset", () => {
    const atExpected = timingPenalty(DEFAULT_SCORING_CONFIG.expectedLagMs);
    const atZero = timingPenalty(0);
    expect(atExpected).toBeCloseTo(1, 5);
    expect(atZero).toBeLessThan(atExpected);
  });

  it("forgives lateness more than earliness", () => {
    const deviation = 150;
    const late = timingPenalty(DEFAULT_SCORING_CONFIG.expectedLagMs + deviation);
    const early = timingPenalty(DEFAULT_SCORING_CONFIG.expectedLagMs - deviation);
    expect(late).toBeGreaterThan(early);
  });

  it("decays smoothly rather than cutting off", () => {
    const values = [0, 100, 200, 300, 400, 500].map((offset) => timingPenalty(offset));
    for (const value of values) {
      expect(value).toBeGreaterThan(0);
      expect(value).toBeLessThanOrEqual(1);
    }
    // Monotonic decay once past the peak.
    expect(values[2]).toBeGreaterThan(values[3]!);
    expect(values[3]).toBeGreaterThan(values[4]!);
  });
});

describe("scoreStaticPose", () => {
  it("ignores parts that neither capture could see", () => {
    const visible = extractPoseFeatures(makePose())!;
    const invisible = extractPoseFeatures(
      makePose().map((landmark) => ({ ...landmark, visibility: 0 })),
    )!;

    const result = scoreStaticPose(invisible, visible);
    // No usable evidence anywhere, so confidence collapses and the score is
    // not presented as agreement.
    expect(result.confidence).toBeLessThan(0.01);
    expect(result.total).toBe(0);
  });

  it("keeps per-part scores independent of the weighting", () => {
    const reference = extractPoseFeatures(makePose())!;
    const player = extractPoseFeatures(makePose({ [L.leftWrist]: [0.3, 0.1] }))!;
    const result = scoreStaticPose(player, reference);
    expect(result.parts.rightArm).toBeGreaterThan(0.95);
    expect(result.parts.leftArm).toBeLessThan(result.parts.rightArm);
  });
});
