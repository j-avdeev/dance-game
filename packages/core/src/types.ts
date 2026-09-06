/**
 * Framework-free domain types shared by the phone controller, the desktop game
 * and the realtime relay.
 *
 * Nothing in this package may import React, browser APIs, MediaPipe runtime
 * classes or networking libraries. MediaPipe results are converted into these
 * types at the browser adapter boundary (see PLAN.md, "Architecture").
 */

/**
 * A single body landmark in aspect-corrected image space.
 *
 * MediaPipe normalises `x` and `y` to [0, 1] independently per axis, which
 * distorts angles differently for portrait and landscape sources. The adapter
 * is responsible for aspect correction before these values enter the core.
 */
export type Landmark = {
  x: number;
  y: number;
  /** MediaPipe depth estimate. Noisy; NOT used by v1 scoring. */
  z: number;
  /** Landmark confidence in [0, 1]. */
  visibility: number;
};

/** A pose as produced by the phone (or a local camera in single-device mode). */
export type PoseFrame = {
  /** Monotonically increasing per connection; used to drop reordered packets. */
  seq: number;
  /** Phone-side monotonic clock reading when the source frame was captured. */
  capturedAtMs: number;
  /** Time spent in pose inference for this frame. */
  inferenceMs: number;
  /** Source frame width in pixels. */
  imageWidth: number;
  /** Source frame height in pixels. */
  imageHeight: number;
  /** 33 landmarks, or an empty array when no person was detected. */
  landmarks: Landmark[];
  worldLandmarks?: Landmark[];
};

/** A pose frame placed on the desktop's game clock. */
export type TimedPoseFrame = PoseFrame & {
  /** Desktop video currentTime (ms) at the moment the frame arrived. */
  receivedAtGameTimeMs: number;
  /** Corrected estimate of when the pose was actually performed. */
  gameTimeMs: number;
};

/** One sampled reference pose from a choreography. */
export type ChoreographyFrame = {
  /** Milliseconds relative to the trimmed start of the reference video. */
  tMs: number;
  landmarks: Landmark[];
  worldLandmarks?: Landmark[];
};

/** An optional move-aligned scoring window. */
export type ScoringWindow = {
  startMs: number;
  endMs: number;
};

/** A reference dance, extracted once from a self-owned video. */
export type Choreography = {
  version: 1;
  id: string;
  title: string;
  videoPath: string;
  /**
   * True when the reference dancer faces the camera and the player is expected
   * to mirror them. The scorer swaps semantic left/right on the reference side.
   */
  mirrored: boolean;
  sampleRateHz: number;
  imageWidth: number;
  imageHeight: number;
  /** When absent, the scorer falls back to fixed-length windows. */
  windows?: ScoringWindow[];
  frames: ChoreographyFrame[];
};

/** Per-body-part similarity, each in [0, 100]. */
export type ScoreParts = {
  leftArm: number;
  rightArm: number;
  leftLeg: number;
  rightLeg: number;
  torso: number;
  motion: number;
};

/** The score of one reference sample against the best matching player pose. */
export type ScoreResult = {
  /** Final score in [0, 100], after the timing penalty. */
  total: number;
  /** Signed offset of the matched player pose; positive means the player was late. */
  timingOffsetMs: number;
  /** Aggregate landmark confidence in [0, 1]. */
  confidence: number;
  parts: ScoreParts;
};

export type Grade = "perfect" | "great" | "good" | "miss";

/** One displayed grade, aggregated from all reference samples in a window. */
export type GradeEvent = {
  windowIndex: number;
  startMs: number;
  endMs: number;
  /** Aggregated window score in [0, 100]. */
  score: number;
  grade: Grade;
  /** Combo count after this event. */
  combo: number;
  /** Points awarded for this window, including the combo multiplier. */
  points: number;
  parts: ScoreParts;
};

/** Game phases shared between the host and the controller. */
export type GamePhase = "idle" | "countdown" | "playing" | "paused" | "finished";
