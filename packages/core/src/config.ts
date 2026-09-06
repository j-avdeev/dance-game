/**
 * Tuning constants for scoring and grading.
 *
 * Every value here is expected to change once real test sessions exist
 * (see PLAN.md, "Prototype P1"). Keep them in these objects rather than
 * duplicating literals across the scoring code.
 */

/** Timing and similarity weights used when scoring a single reference sample. */
export type ScoringConfig = {
  /**
   * Typical player lag behind the reference video, in ms. A person following a
   * video is systematically late by roughly 150-300 ms, so the search window is
   * centred here rather than on the reference timestamp itself.
   */
  expectedLagMs: number;
  /** Half-width of the pose search window around the expected lag. */
  timingWindowMs: number;
  /** Gaussian sigma applied when the player is early. */
  earlySigmaMs: number;
  /** Gaussian sigma applied when the player is late; wider, because lateness is normal. */
  lateSigmaMs: number;
  /** How long after a reference timestamp the sample is evaluated. */
  evaluationDelayMs: number;
  /** How much player pose history the desktop keeps. */
  playerBufferMs: number;
  /** Weight of static pose similarity in the raw score. */
  staticPoseWeight: number;
  /** Weight of motion (velocity) similarity in the raw score. */
  motionWeight: number;
  /** Look-back used to compute landmark velocities. */
  motionLookbackMs: number;
  /** Landmarks below this visibility are down-weighted. */
  minVisibility: number;
};

export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  expectedLagMs: 200,
  timingWindowMs: 200,
  earlySigmaMs: 120,
  lateSigmaMs: 160,
  evaluationDelayMs: 550,
  playerBufferMs: 1000,
  staticPoseWeight: 0.8,
  motionWeight: 0.2,
  motionLookbackMs: 150,
  minVisibility: 0.5,
};

/** Relative importance of each body part within the static pose score. */
export type BodyPartWeights = {
  leftArm: number;
  rightArm: number;
  leftLeg: number;
  rightLeg: number;
  torso: number;
};

export const DEFAULT_BODY_PART_WEIGHTS: BodyPartWeights = {
  leftArm: 0.2,
  rightArm: 0.2,
  leftLeg: 0.175,
  rightLeg: 0.175,
  torso: 0.25,
};

/** How per-sample scores become the grades, combo and total the player sees. */
export type GradingConfig = {
  /** Length of a fixed scoring window when the choreography defines none. */
  gradeWindowMs: number;
  /** Fraction of lowest per-sample scores dropped before averaging a window. */
  trimFraction: number;
  /** Minimum window score for each grade, checked from best to worst. */
  thresholds: { perfect: number; great: number; good: number };
  /** Base points per grade, before the combo multiplier. */
  gradePoints: Record<"perfect" | "great" | "good" | "miss", number>;
  /** Multiplier added per combo step. */
  comboStep: number;
  /** Maximum combo multiplier. */
  comboCap: number;
};

export const DEFAULT_GRADING_CONFIG: GradingConfig = {
  gradeWindowMs: 1000,
  trimFraction: 0.2,
  thresholds: { perfect: 88, great: 75, good: 60 },
  gradePoints: { perfect: 100, great: 70, good: 40, miss: 0 },
  comboStep: 0.02,
  comboCap: 1.5,
};

/**
 * Framing rule shared by the phone and the desktop, so both agree on when a
 * player is usable (PLAN.md, "Smartphone").
 */
export type FramingConfig = {
  /** Minimum visibility for a required landmark to count as visible. */
  minVisibility: number;
  /** Consecutive good frames before framing is reported as OK. */
  requiredConsecutiveFrames: number;
  /** How long framing may be bad before the status becomes "lost". */
  lostAfterMs: number;
};

export const DEFAULT_FRAMING_CONFIG: FramingConfig = {
  minVisibility: 0.5,
  requiredConsecutiveFrames: 10,
  lostAfterMs: 1000,
};
