import {
  DEFAULT_BODY_PART_WEIGHTS,
  DEFAULT_SCORING_CONFIG,
  type BodyPartWeights,
  type ScoringConfig,
} from "./config.js";
import {
  angleDifference,
  extractMotionFeatures,
  extractPoseFeatures,
  interpolateLandmarksAt,
  type MotionFeatures,
  type Point,
  type PoseFeatures,
  type TimedLandmarks,
} from "./features.js";
import { mirrorLandmarks } from "./pose.js";
import type { Landmark, ScoreParts, ScoreResult } from "./types.js";

/**
 * Pose scoring.
 *
 * Every function here is pure and deterministic: the same inputs always give
 * the same score, which is what makes the tuning in M4 meaningful and the
 * tests trustworthy.
 */

/**
 * Angular error, in radians, at which a joint scores about 0.5.
 *
 * Chosen so that a visibly wrong limb is clearly penalised while ordinary
 * human variation is not. About 34 degrees.
 */
const ANGLE_TOLERANCE_RAD = 0.6;

/** Positional error, in body-scale units, at which a limb scores about 0.5. */
const POSITION_TOLERANCE = 0.35;

/** Velocity error, in body-scale units per second, scoring about 0.5. */
const VELOCITY_TOLERANCE = 1.2;

/**
 * Smooth similarity falloff.
 *
 * A Gaussian rather than a threshold: dancing is continuous, so the score
 * should degrade gradually as the pose drifts instead of flipping between
 * right and wrong at an arbitrary cutoff.
 */
function gaussianSimilarity(error: number, tolerance: number): number {
  const ratio = error / tolerance;
  return Math.exp(-0.5 * ratio * ratio);
}

function pointDistance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Mean of the given values, or `fallback` when there are none. */
function mean(values: readonly number[], fallback = 0): number {
  if (values.length === 0) {
    return fallback;
  }
  let total = 0;
  for (const value of values) {
    total += value;
  }
  return total / values.length;
}

/** Similarity of one body part, in [0, 1]. */
function scoreArm(player: PoseFeatures, reference: PoseFeatures, side: "left" | "right"): number {
  const elbowKey = side === "left" ? "leftElbow" : "rightElbow";
  const shoulderKey = side === "left" ? "leftShoulder" : "rightShoulder";
  const wristKey = side === "left" ? "leftWrist" : "rightWrist";

  return mean([
    gaussianSimilarity(
      Math.abs(angleDifference(player.angles[elbowKey], reference.angles[elbowKey])),
      ANGLE_TOLERANCE_RAD,
    ),
    gaussianSimilarity(
      Math.abs(angleDifference(player.angles[shoulderKey], reference.angles[shoulderKey])),
      ANGLE_TOLERANCE_RAD,
    ),
    // The wrist position carries where the arm actually points, which the two
    // angles alone do not pin down.
    gaussianSimilarity(
      pointDistance(player.positions[wristKey], reference.positions[wristKey]),
      POSITION_TOLERANCE,
    ),
  ]);
}

function scoreLeg(player: PoseFeatures, reference: PoseFeatures, side: "left" | "right"): number {
  const hipKey = side === "left" ? "leftHip" : "rightHip";
  const kneeKey = side === "left" ? "leftKnee" : "rightKnee";
  const ankleKey = side === "left" ? "leftAnkle" : "rightAnkle";

  return mean([
    gaussianSimilarity(
      Math.abs(angleDifference(player.angles[hipKey], reference.angles[hipKey])),
      ANGLE_TOLERANCE_RAD,
    ),
    gaussianSimilarity(
      Math.abs(angleDifference(player.angles[kneeKey], reference.angles[kneeKey])),
      ANGLE_TOLERANCE_RAD,
    ),
    gaussianSimilarity(
      pointDistance(player.positions[ankleKey], reference.positions[ankleKey]),
      POSITION_TOLERANCE,
    ),
  ]);
}

function scoreTorso(player: PoseFeatures, reference: PoseFeatures): number {
  return mean([
    gaussianSimilarity(
      Math.abs(
        angleDifference(player.orientation.shoulderLine, reference.orientation.shoulderLine),
      ),
      ANGLE_TOLERANCE_RAD,
    ),
    gaussianSimilarity(
      Math.abs(angleDifference(player.orientation.hipLine, reference.orientation.hipLine)),
      ANGLE_TOLERANCE_RAD,
    ),
    gaussianSimilarity(
      Math.abs(angleDifference(player.orientation.torsoLean, reference.orientation.torsoLean)),
      ANGLE_TOLERANCE_RAD,
    ),
  ]);
}

/** Similarity of movement, in [0, 1]. */
export function scoreMotion(player: MotionFeatures, reference: MotionFeatures): number {
  const keys = ["leftWrist", "rightWrist", "leftAnkle", "rightAnkle"] as const;
  return mean(
    keys.map((key) =>
      gaussianSimilarity(pointDistance(player[key], reference[key]), VELOCITY_TOLERANCE),
    ),
  );
}

export type StaticScore = {
  /** Visibility-weighted overall similarity, in [0, 1]. */
  total: number;
  /** Per-part similarity, in [0, 1], before visibility weighting. */
  parts: Omit<ScoreParts, "motion">;
  /** Aggregate confidence of the comparison, in [0, 1]. */
  confidence: number;
};

/**
 * Compares two poses, part by part.
 *
 * Parts the model could barely see contribute proportionally less, so a limb
 * hidden behind the body cannot drag the score down as if the player had moved
 * it wrongly.
 */
export function scoreStaticPose(
  player: PoseFeatures,
  reference: PoseFeatures,
  weights: BodyPartWeights = DEFAULT_BODY_PART_WEIGHTS,
): StaticScore {
  const parts = {
    leftArm: scoreArm(player, reference, "left"),
    rightArm: scoreArm(player, reference, "right"),
    leftLeg: scoreLeg(player, reference, "left"),
    rightLeg: scoreLeg(player, reference, "right"),
    torso: scoreTorso(player, reference),
  };

  // Confidence combines both sides: a part is only trustworthy when it was
  // visible in the player's capture and in the reference.
  const confidences = {
    leftArm: Math.min(player.confidence.leftArm, reference.confidence.leftArm),
    rightArm: Math.min(player.confidence.rightArm, reference.confidence.rightArm),
    leftLeg: Math.min(player.confidence.leftLeg, reference.confidence.leftLeg),
    rightLeg: Math.min(player.confidence.rightLeg, reference.confidence.rightLeg),
    torso: Math.min(player.confidence.torso, reference.confidence.torso),
  };

  // Weighted geometric mean rather than arithmetic.
  //
  // With an arithmetic mean, one completely wrong limb costs only its own
  // weight: a player holding an arm in entirely the wrong place still scored
  // ~87, comfortably inside "Great". The geometric mean makes parts multiply,
  // so a part that is badly wrong pulls the whole score down, and a player who
  // is uniformly close beats one who nails three parts and ignores two. That
  // matches how a person judges whether a dance was copied.
  //
  // Scores are floored before the log: a zero would otherwise annihilate the
  // product, making every other part irrelevant.
  const MIN_PART_SCORE = 0.02;

  let logTotal = 0;
  let weightSum = 0;
  for (const key of ["leftArm", "rightArm", "leftLeg", "rightLeg", "torso"] as const) {
    const weight = weights[key] * confidences[key];
    if (weight <= 0) {
      continue;
    }
    logTotal += weight * Math.log(Math.max(parts[key], MIN_PART_SCORE));
    weightSum += weight;
  }

  return {
    // Every part invisible means no evidence either way, not a zero score.
    total: weightSum > 1e-9 ? Math.exp(logTotal / weightSum) : 0,
    parts,
    confidence: weightSum,
  };
}

/**
 * Timing penalty for a player pose performed `offsetMs` after the reference.
 *
 * Positive offsets mean the player was late, which is the normal case: people
 * following a video react to it. The penalty is therefore centred on
 * `expectedLagMs`, not on zero, and is asymmetric, because falling further
 * behind is more forgivable than anticipating a move.
 */
export function timingPenalty(
  offsetMs: number,
  config: ScoringConfig = DEFAULT_SCORING_CONFIG,
): number {
  const deviation = offsetMs - config.expectedLagMs;
  const sigma = deviation >= 0 ? config.lateSigmaMs : config.earlySigmaMs;
  return gaussianSimilarity(Math.abs(deviation), sigma);
}

/**
 * Best-matching offset ignoring the timing penalty, in ms.
 *
 * The normal score deliberately prefers candidates near `expectedLagMs`, so
 * its reported offset clusters around whatever lag is configured and cannot be
 * used to check that value. This search weighs pose similarity alone, so the
 * answer is independent of the assumption being tested.
 *
 * Returns undefined when no candidate could be scored. Accuracy depends on the
 * dance actually changing within the window: for slow movement several
 * candidates look alike and the estimate is correspondingly vague.
 */
export function measureTimingOffsetMs(input: SampleScoreInput): number | undefined {
  const config = input.config ?? DEFAULT_SCORING_CONFIG;
  const flattened: ScoringConfig = {
    ...config,
    // Wide enough to be flat across the search window.
    earlySigmaMs: 1e6,
    lateSigmaMs: 1e6,
  };
  const result = scoreSample({ ...input, config: flattened });
  return result.total > 0 ? result.timingOffsetMs : undefined;
}

export type SampleScoreInput = {
  /** Reference pose for this sample. */
  referenceLandmarks: readonly Landmark[];
  /** Reference timeline, for reference motion. */
  referenceHistory: readonly TimedLandmarks[];
  /** Time of this reference sample, in choreography time. */
  referenceTMs: number;
  /** Player poses, in choreography time, covering the search window. */
  playerHistory: readonly TimedLandmarks[];
  /** True when the reference dancer faces the camera and is mirrored. */
  mirrored: boolean;
  config?: ScoringConfig;
  weights?: BodyPartWeights;
};

/**
 * Scores one reference sample against the best matching player pose.
 *
 * Searches a window centred on the expected lag and keeps the candidate with
 * the highest final score. Returning the best match, rather than the closest
 * in time, is what lets a player who is consistently a little late still score
 * well.
 */
export function scoreSample(input: SampleScoreInput): ScoreResult {
  const config = input.config ?? DEFAULT_SCORING_CONFIG;
  const weights = input.weights ?? DEFAULT_BODY_PART_WEIGHTS;

  const emptyResult: ScoreResult = {
    total: 0,
    timingOffsetMs: 0,
    confidence: 0,
    parts: { leftArm: 0, rightArm: 0, leftLeg: 0, rightLeg: 0, torso: 0, motion: 0 },
  };

  if (input.referenceLandmarks.length === 0) {
    return emptyResult;
  }

  // Mirror the reference, not the player: the dancer's left hand corresponds
  // to the player's right, and swapping semantics is the only way to compare
  // the correct limbs.
  const referenceLandmarks = input.mirrored
    ? mirrorLandmarks(input.referenceLandmarks)
    : input.referenceLandmarks;

  const referenceFeatures = extractPoseFeatures(referenceLandmarks);
  if (!referenceFeatures) {
    return emptyResult;
  }

  const referenceMotion = extractMotionFeatures(
    input.mirrored
      ? input.referenceHistory.map((entry) => ({
          tMs: entry.tMs,
          landmarks:
            entry.landmarks.length > 0 ? mirrorLandmarks(entry.landmarks) : entry.landmarks,
        }))
      : input.referenceHistory,
    input.referenceTMs,
    config,
  );

  const windowStart = input.referenceTMs + config.expectedLagMs - config.timingWindowMs;
  const windowEnd = input.referenceTMs + config.expectedLagMs + config.timingWindowMs;

  // Evaluate the candidates actually present in the window, plus its centre and
  // edges, so a sparse player stream still gets a fair look.
  const candidateTimes = new Set<number>();
  for (const entry of input.playerHistory) {
    if (entry.tMs >= windowStart && entry.tMs <= windowEnd) {
      candidateTimes.add(entry.tMs);
    }
  }
  candidateTimes.add(input.referenceTMs + config.expectedLagMs);

  let best: ScoreResult | undefined;
  // Tracked separately on the 0-1 scale. `ScoreResult.total` is reported as
  // 0-100, and comparing against that directly would mean every candidate
  // after the first loses, leaving the earliest pose to win by accident.
  let bestFinalScore = Number.NEGATIVE_INFINITY;

  for (const candidateTMs of candidateTimes) {
    const playerLandmarks = interpolateLandmarksAt(input.playerHistory, candidateTMs);
    if (!playerLandmarks || playerLandmarks.length === 0) {
      continue;
    }

    const playerFeatures = extractPoseFeatures(playerLandmarks);
    if (!playerFeatures) {
      continue;
    }

    const staticScore = scoreStaticPose(playerFeatures, referenceFeatures, weights);

    const playerMotion = extractMotionFeatures(input.playerHistory, candidateTMs, config);
    // With no motion data on either side there is nothing to compare, so fall
    // back to the static score rather than inventing a penalty.
    const motionScore =
      playerMotion && referenceMotion ? scoreMotion(playerMotion, referenceMotion) : undefined;

    const rawScore =
      motionScore === undefined
        ? staticScore.total
        : config.staticPoseWeight * staticScore.total + config.motionWeight * motionScore;

    const offsetMs = candidateTMs - input.referenceTMs;
    const finalScore = rawScore * timingPenalty(offsetMs, config);

    if (finalScore > bestFinalScore) {
      bestFinalScore = finalScore;
      best = {
        total: finalScore * 100,
        timingOffsetMs: offsetMs,
        confidence: staticScore.confidence,
        parts: {
          leftArm: staticScore.parts.leftArm * 100,
          rightArm: staticScore.parts.rightArm * 100,
          leftLeg: staticScore.parts.leftLeg * 100,
          rightLeg: staticScore.parts.rightLeg * 100,
          torso: staticScore.parts.torso * 100,
          motion: (motionScore ?? 0) * 100,
        },
      };
    }
  }

  return best ?? emptyResult;
}
