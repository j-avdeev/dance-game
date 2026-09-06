import { DEFAULT_SCORING_CONFIG, type ScoringConfig } from "./config.js";
import { PoseLandmarkIndex } from "./landmarks.js";
import type { Landmark } from "./types.js";

/**
 * Pose feature extraction.
 *
 * Raw image coordinates are never compared directly: two people doing the same
 * move at different distances, or standing in different parts of the frame,
 * must score the same. Features are therefore built from joint angles and from
 * positions expressed relative to the body's own size and centre.
 *
 * Input landmarks must already be aspect-corrected (see `pose.ts`). `z` is
 * deliberately unused: MediaPipe's depth estimate is too noisy to score.
 */

export type Point = { x: number; y: number };

/** Joint angles in radians, plus positions relative to the hip centre. */
export type PoseFeatures = {
  /** Angle at each joint, in radians. */
  angles: {
    leftElbow: number;
    rightElbow: number;
    leftShoulder: number;
    rightShoulder: number;
    leftHip: number;
    rightHip: number;
    leftKnee: number;
    rightKnee: number;
  };
  /** Limb endpoints relative to hip centre, scaled by body size. */
  positions: {
    leftWrist: Point;
    rightWrist: Point;
    leftAnkle: Point;
    rightAnkle: Point;
  };
  /** Whole-body orientation, in radians. */
  orientation: {
    shoulderLine: number;
    hipLine: number;
    torsoLean: number;
  };
  /**
   * Per-feature-group confidence in [0, 1], derived from landmark visibility.
   * Lets the scorer down-weight a limb the model could barely see instead of
   * treating a guess as a real disagreement.
   */
  confidence: {
    leftArm: number;
    rightArm: number;
    leftLeg: number;
    rightLeg: number;
    torso: number;
  };
  /** Distance used to normalise positions; exposed for debugging. */
  bodyScale: number;
};

/** Velocities of the extremities, in normalised units per second. */
export type MotionFeatures = {
  leftWrist: Point;
  rightWrist: Point;
  leftAnkle: Point;
  rightAnkle: Point;
};

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Interior angle at `vertex`, between the segments to `a` and `b`.
 * Returns a value in [0, PI]; 0 means fully folded, PI means straight.
 */
export function angleAt(a: Point, vertex: Point, b: Point): number {
  const v1x = a.x - vertex.x;
  const v1y = a.y - vertex.y;
  const v2x = b.x - vertex.x;
  const v2y = b.y - vertex.y;

  const magnitude = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y);
  if (magnitude < 1e-9) {
    // Coincident points carry no angular information.
    return 0;
  }

  const cosine = (v1x * v2x + v1y * v2y) / magnitude;
  // Guard against floating-point drift outside acos's domain.
  return Math.acos(Math.min(1, Math.max(-1, cosine)));
}

/** Direction of the segment a->b, in radians, wrapped to [-PI, PI]. */
export function segmentAngle(a: Point, b: Point): number {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

/** Smallest signed difference between two angles, in [-PI, PI]. */
export function angleDifference(a: number, b: number): number {
  let delta = (a - b) % (2 * Math.PI);
  if (delta > Math.PI) {
    delta -= 2 * Math.PI;
  } else if (delta < -Math.PI) {
    delta += 2 * Math.PI;
  }
  return delta;
}

function landmarkPoint(landmarks: readonly Landmark[], index: number): Point | undefined {
  const landmark = landmarks[index];
  return landmark ? { x: landmark.x, y: landmark.y } : undefined;
}

function visibilityOf(landmarks: readonly Landmark[], indices: readonly number[]): number {
  if (indices.length === 0) {
    return 0;
  }
  // The weakest landmark governs: an elbow angle is only as trustworthy as the
  // least visible of the three points that define it.
  let lowest = 1;
  for (const index of indices) {
    lowest = Math.min(lowest, landmarks[index]?.visibility ?? 0);
  }
  return lowest;
}

/**
 * Body scale used to normalise relative positions.
 *
 * Torso length and shoulder width are combined because either alone degenerates
 * for some poses: bending forward shortens the apparent torso, and turning
 * sideways collapses shoulder width.
 */
export function computeBodyScale(landmarks: readonly Landmark[]): number {
  const leftShoulder = landmarkPoint(landmarks, PoseLandmarkIndex.leftShoulder);
  const rightShoulder = landmarkPoint(landmarks, PoseLandmarkIndex.rightShoulder);
  const leftHip = landmarkPoint(landmarks, PoseLandmarkIndex.leftHip);
  const rightHip = landmarkPoint(landmarks, PoseLandmarkIndex.rightHip);

  if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) {
    return 0;
  }

  const shoulderCentre = midpoint(leftShoulder, rightShoulder);
  const hipCentre = midpoint(leftHip, rightHip);
  const torsoLength = distance(shoulderCentre, hipCentre);
  const shoulderWidth = distance(leftShoulder, rightShoulder);

  return torsoLength * 0.7 + shoulderWidth * 0.3;
}

/** Hip midpoint, the origin all relative positions are measured from. */
export function computeHipCentre(landmarks: readonly Landmark[]): Point | undefined {
  const leftHip = landmarkPoint(landmarks, PoseLandmarkIndex.leftHip);
  const rightHip = landmarkPoint(landmarks, PoseLandmarkIndex.rightHip);
  return leftHip && rightHip ? midpoint(leftHip, rightHip) : undefined;
}

/**
 * Extracts scoring features from a single pose.
 *
 * Returns undefined when the pose cannot be normalised at all, which happens
 * for an empty landmark array or a torso the model could not locate. Callers
 * treat that as an unscoreable sample rather than an error.
 */
export function extractPoseFeatures(landmarks: readonly Landmark[]): PoseFeatures | undefined {
  if (landmarks.length === 0) {
    return undefined;
  }

  const hipCentre = computeHipCentre(landmarks);
  const bodyScale = computeBodyScale(landmarks);
  if (!hipCentre || bodyScale < 1e-6) {
    // Without a torso there is no meaningful scale, and relative positions
    // would explode. Better to report nothing than to report noise.
    return undefined;
  }

  const point = (index: number): Point => landmarkPoint(landmarks, index) ?? { x: 0, y: 0 };
  const relative = (index: number): Point => {
    const p = point(index);
    return { x: (p.x - hipCentre.x) / bodyScale, y: (p.y - hipCentre.y) / bodyScale };
  };

  const L = PoseLandmarkIndex;

  const leftShoulder = point(L.leftShoulder);
  const rightShoulder = point(L.rightShoulder);
  const leftHip = point(L.leftHip);
  const rightHip = point(L.rightHip);
  const shoulderCentre = midpoint(leftShoulder, rightShoulder);

  return {
    angles: {
      leftElbow: angleAt(leftShoulder, point(L.leftElbow), point(L.leftWrist)),
      rightElbow: angleAt(rightShoulder, point(L.rightElbow), point(L.rightWrist)),
      leftShoulder: angleAt(point(L.leftElbow), leftShoulder, leftHip),
      rightShoulder: angleAt(point(L.rightElbow), rightShoulder, rightHip),
      leftHip: angleAt(leftShoulder, leftHip, point(L.leftKnee)),
      rightHip: angleAt(rightShoulder, rightHip, point(L.rightKnee)),
      leftKnee: angleAt(leftHip, point(L.leftKnee), point(L.leftAnkle)),
      rightKnee: angleAt(rightHip, point(L.rightKnee), point(L.rightAnkle)),
    },
    positions: {
      leftWrist: relative(L.leftWrist),
      rightWrist: relative(L.rightWrist),
      leftAnkle: relative(L.leftAnkle),
      rightAnkle: relative(L.rightAnkle),
    },
    orientation: {
      shoulderLine: segmentAngle(leftShoulder, rightShoulder),
      hipLine: segmentAngle(leftHip, rightHip),
      torsoLean: segmentAngle(hipCentre, shoulderCentre),
    },
    confidence: {
      leftArm: visibilityOf(landmarks, [L.leftShoulder, L.leftElbow, L.leftWrist]),
      rightArm: visibilityOf(landmarks, [L.rightShoulder, L.rightElbow, L.rightWrist]),
      leftLeg: visibilityOf(landmarks, [L.leftHip, L.leftKnee, L.leftAnkle]),
      rightLeg: visibilityOf(landmarks, [L.rightHip, L.rightKnee, L.rightAnkle]),
      torso: visibilityOf(landmarks, [L.leftShoulder, L.rightShoulder, L.leftHip, L.rightHip]),
    },
    bodyScale,
  };
}

/** A pose paired with the time it was performed. */
export type TimedLandmarks = {
  tMs: number;
  landmarks: readonly Landmark[];
};

/**
 * Velocities of the extremities, in body-scale units per second.
 *
 * Computed over a fixed look-back rather than between adjacent frames: the
 * player streams at ~15 Hz and the reference is sampled at 10 Hz, so raw
 * frame-to-frame deltas describe different time spans and cannot be compared.
 */
export function extractMotionFeatures(
  history: readonly TimedLandmarks[],
  atMs: number,
  config: ScoringConfig = DEFAULT_SCORING_CONFIG,
): MotionFeatures | undefined {
  const current = interpolateLandmarksAt(history, atMs);
  const past = interpolateLandmarksAt(history, atMs - config.motionLookbackMs);
  if (!current || !past) {
    return undefined;
  }

  const currentFeatures = extractPoseFeatures(current);
  const pastFeatures = extractPoseFeatures(past);
  if (!currentFeatures || !pastFeatures) {
    return undefined;
  }

  const seconds = config.motionLookbackMs / 1000;
  const velocity = (a: Point, b: Point): Point => ({
    x: (a.x - b.x) / seconds,
    y: (a.y - b.y) / seconds,
  });

  return {
    leftWrist: velocity(currentFeatures.positions.leftWrist, pastFeatures.positions.leftWrist),
    rightWrist: velocity(currentFeatures.positions.rightWrist, pastFeatures.positions.rightWrist),
    leftAnkle: velocity(currentFeatures.positions.leftAnkle, pastFeatures.positions.leftAnkle),
    rightAnkle: velocity(currentFeatures.positions.rightAnkle, pastFeatures.positions.rightAnkle),
  };
}

/**
 * Landmarks at an arbitrary time, linearly interpolated between samples.
 *
 * Returns undefined outside the covered range, or when either neighbouring
 * sample has no detected pose: interpolating across a gap would invent a
 * dancer who was never there.
 */
export function interpolateLandmarksAt(
  history: readonly TimedLandmarks[],
  atMs: number,
): readonly Landmark[] | undefined {
  if (history.length === 0) {
    return undefined;
  }

  const first = history[0];
  const last = history[history.length - 1];
  if (!first || !last || atMs < first.tMs || atMs > last.tMs) {
    return undefined;
  }

  // Binary search for the sample at or before atMs.
  let low = 0;
  let high = history.length - 1;
  let index = 0;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const sample = history[mid];
    if (!sample) {
      break;
    }
    if (sample.tMs <= atMs) {
      index = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const before = history[index];
  if (!before) {
    return undefined;
  }
  if (before.tMs === atMs || index === history.length - 1) {
    return before.landmarks.length > 0 ? before.landmarks : undefined;
  }

  const after = history[index + 1];
  if (!after) {
    return undefined;
  }
  if (before.landmarks.length === 0 || after.landmarks.length === 0) {
    return undefined;
  }
  if (before.landmarks.length !== after.landmarks.length) {
    return before.landmarks;
  }

  const span = after.tMs - before.tMs;
  const t = span <= 0 ? 0 : (atMs - before.tMs) / span;
  return before.landmarks.map((landmark, i) => {
    const next = after.landmarks[i];
    if (!next) {
      return landmark;
    }
    return {
      x: landmark.x + t * (next.x - landmark.x),
      y: landmark.y + t * (next.y - landmark.y),
      z: landmark.z + t * (next.z - landmark.z),
      visibility: Math.min(landmark.visibility, next.visibility),
    };
  });
}
