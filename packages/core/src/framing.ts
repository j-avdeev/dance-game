import { DEFAULT_FRAMING_CONFIG, type FramingConfig } from "./config.js";
import { PoseLandmarkIndex, REQUIRED_FRAMING_LANDMARKS } from "./landmarks.js";
import type { Landmark, PoseFrame } from "./types.js";

/**
 * Whether the player is usable right now.
 *
 * `waiting` covers both "not enough good frames yet" and "recovering", so the
 * phone and desktop can show the same message while the rule stabilises.
 */
export type FramingStatus = "ok" | "waiting" | "lost" | "no-person";

/** Why framing is not OK, so the UI can give a specific instruction. */
export type FramingIssue =
  "no-person" | "body-not-fully-visible" | "too-close" | "low-confidence" | "multiple-people";

export type FramingState = {
  status: FramingStatus;
  issues: FramingIssue[];
  /** Consecutive frames that satisfied the visibility rule. */
  goodFrameStreak: number;
  /** Timestamp of the last frame that satisfied the rule, or undefined. */
  lastGoodAtMs: number | undefined;
};

export const INITIAL_FRAMING_STATE: FramingState = {
  status: "waiting",
  issues: [],
  goodFrameStreak: 0,
  lastGoodAtMs: undefined,
};

/**
 * A pose is "too close" when the body fills so much of the frame that limbs
 * will leave it during a dance. Measured as the span from shoulders to ankles
 * relative to frame height, in aspect-corrected coordinates.
 */
const TOO_CLOSE_VERTICAL_SPAN = 0.95;

function landmarkAt(landmarks: Landmark[], index: number): Landmark | undefined {
  return landmarks[index];
}

/** Evaluates one frame against the visibility rule, without any history. */
export function evaluateFrameVisibility(
  frame: PoseFrame,
  config: FramingConfig = DEFAULT_FRAMING_CONFIG,
): { satisfied: boolean; issues: FramingIssue[] } {
  if (frame.landmarks.length === 0) {
    return { satisfied: false, issues: ["no-person"] };
  }

  const issues: FramingIssue[] = [];

  const missing = REQUIRED_FRAMING_LANDMARKS.some((index) => {
    const landmark = landmarkAt(frame.landmarks, index);
    return landmark === undefined || landmark.visibility < config.minVisibility;
  });
  if (missing) {
    issues.push("body-not-fully-visible");
  }

  const leftShoulder = landmarkAt(frame.landmarks, PoseLandmarkIndex.leftShoulder);
  const rightShoulder = landmarkAt(frame.landmarks, PoseLandmarkIndex.rightShoulder);
  const leftAnkle = landmarkAt(frame.landmarks, PoseLandmarkIndex.leftAnkle);
  const rightAnkle = landmarkAt(frame.landmarks, PoseLandmarkIndex.rightAnkle);

  if (leftShoulder && rightShoulder && leftAnkle && rightAnkle) {
    const shoulderY = (leftShoulder.y + rightShoulder.y) / 2;
    const ankleY = (leftAnkle.y + rightAnkle.y) / 2;
    if (Math.abs(ankleY - shoulderY) > TOO_CLOSE_VERTICAL_SPAN) {
      issues.push("too-close");
    }
  }

  return { satisfied: issues.length === 0, issues };
}

/**
 * Advances framing state by one frame.
 *
 * Pure and deterministic: the caller owns the state, so the phone, the desktop
 * and tests all run the identical rule (PLAN.md, "Smartphone").
 */
export function updateFramingState(
  previous: FramingState,
  frame: PoseFrame,
  nowMs: number,
  config: FramingConfig = DEFAULT_FRAMING_CONFIG,
): FramingState {
  const { satisfied, issues } = evaluateFrameVisibility(frame, config);

  if (satisfied) {
    const goodFrameStreak = previous.goodFrameStreak + 1;
    return {
      status: goodFrameStreak >= config.requiredConsecutiveFrames ? "ok" : "waiting",
      issues: [],
      goodFrameStreak,
      lastGoodAtMs: nowMs,
    };
  }

  // A brief dropout must not flip a good session straight to "lost"; only a
  // sustained failure does, so a single noisy frame does not pause the game.
  const sinceGoodMs =
    previous.lastGoodAtMs === undefined ? Number.POSITIVE_INFINITY : nowMs - previous.lastGoodAtMs;
  const lost = sinceGoodMs >= config.lostAfterMs;

  return {
    status: lost ? (issues.includes("no-person") ? "no-person" : "lost") : "waiting",
    issues,
    goodFrameStreak: 0,
    lastGoodAtMs: previous.lastGoodAtMs,
  };
}

/** Human-readable instruction for the most important current issue. */
export function describeFramingIssue(issues: readonly FramingIssue[]): string | undefined {
  if (issues.includes("no-person")) {
    return "No one detected. Step into view of the camera.";
  }
  if (issues.includes("too-close")) {
    return "Too close. Move the phone further away, about 2-3 m.";
  }
  if (issues.includes("body-not-fully-visible")) {
    return "Move so your whole body is visible, from head to feet.";
  }
  if (issues.includes("multiple-people")) {
    return "More than one person detected. Only one dancer should be in frame.";
  }
  if (issues.includes("low-confidence")) {
    return "Tracking is uncertain. Try better lighting.";
  }
  return undefined;
}
