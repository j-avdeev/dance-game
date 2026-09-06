/**
 * Landmark index constants and helpers.
 *
 * MediaPipe Pose emits 33 landmarks in a fixed order. Naming them here keeps
 * magic indices out of the scoring and rendering code, and gives us one place
 * to define the semantic left/right swap used by mirror mode.
 */

export const POSE_LANDMARK_COUNT = 33;

/** Indices into a 33-point MediaPipe pose landmark array. */
export const PoseLandmarkIndex = {
  nose: 0,
  leftEyeInner: 1,
  leftEye: 2,
  leftEyeOuter: 3,
  rightEyeInner: 4,
  rightEye: 5,
  rightEyeOuter: 6,
  leftEar: 7,
  rightEar: 8,
  mouthLeft: 9,
  mouthRight: 10,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftPinky: 17,
  rightPinky: 18,
  leftIndex: 19,
  rightIndex: 20,
  leftThumb: 21,
  rightThumb: 22,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
  leftHeel: 29,
  rightHeel: 30,
  leftFootIndex: 31,
  rightFootIndex: 32,
} as const;

export type PoseLandmarkName = keyof typeof PoseLandmarkIndex;

/**
 * Landmarks that must be visible for a pose to be scoreable. Shoulders, hips
 * and ankles together imply the whole body is in frame (PLAN.md, "Smartphone").
 */
export const REQUIRED_FRAMING_LANDMARKS: readonly number[] = [
  PoseLandmarkIndex.leftShoulder,
  PoseLandmarkIndex.rightShoulder,
  PoseLandmarkIndex.leftHip,
  PoseLandmarkIndex.rightHip,
  PoseLandmarkIndex.leftAnkle,
  PoseLandmarkIndex.rightAnkle,
];

/**
 * Pairs of landmark indices whose meaning swaps when a pose is mirrored.
 * Used by mirror mode, which must swap semantics rather than flip coordinates.
 */
export const MIRROR_LANDMARK_PAIRS: readonly (readonly [number, number])[] = [
  [PoseLandmarkIndex.leftEyeInner, PoseLandmarkIndex.rightEyeInner],
  [PoseLandmarkIndex.leftEye, PoseLandmarkIndex.rightEye],
  [PoseLandmarkIndex.leftEyeOuter, PoseLandmarkIndex.rightEyeOuter],
  [PoseLandmarkIndex.leftEar, PoseLandmarkIndex.rightEar],
  [PoseLandmarkIndex.mouthLeft, PoseLandmarkIndex.mouthRight],
  [PoseLandmarkIndex.leftShoulder, PoseLandmarkIndex.rightShoulder],
  [PoseLandmarkIndex.leftElbow, PoseLandmarkIndex.rightElbow],
  [PoseLandmarkIndex.leftWrist, PoseLandmarkIndex.rightWrist],
  [PoseLandmarkIndex.leftPinky, PoseLandmarkIndex.rightPinky],
  [PoseLandmarkIndex.leftIndex, PoseLandmarkIndex.rightIndex],
  [PoseLandmarkIndex.leftThumb, PoseLandmarkIndex.rightThumb],
  [PoseLandmarkIndex.leftHip, PoseLandmarkIndex.rightHip],
  [PoseLandmarkIndex.leftKnee, PoseLandmarkIndex.rightKnee],
  [PoseLandmarkIndex.leftAnkle, PoseLandmarkIndex.rightAnkle],
  [PoseLandmarkIndex.leftHeel, PoseLandmarkIndex.rightHeel],
  [PoseLandmarkIndex.leftFootIndex, PoseLandmarkIndex.rightFootIndex],
];

/**
 * Skeleton edges for rendering, as landmark index pairs.
 *
 * MediaPipe exposes an equivalent list as `PoseLandmarker.POSE_CONNECTIONS`,
 * but that lives in the browser runtime; core must stay free of it so the same
 * skeleton can be drawn for reference poses loaded from JSON.
 */
export const POSE_SKELETON_EDGES: readonly (readonly [number, number])[] = [
  // Face
  [0, 2],
  [2, 7],
  [0, 5],
  [5, 8],
  [9, 10],
  // Torso
  [11, 12],
  [11, 23],
  [12, 24],
  [23, 24],
  // Left arm
  [11, 13],
  [13, 15],
  [15, 17],
  [15, 19],
  [15, 21],
  [17, 19],
  // Right arm
  [12, 14],
  [14, 16],
  [16, 18],
  [16, 20],
  [16, 22],
  [18, 20],
  // Left leg
  [23, 25],
  [25, 27],
  [27, 29],
  [27, 31],
  [29, 31],
  // Right leg
  [24, 26],
  [26, 28],
  [28, 30],
  [28, 32],
  [30, 32],
];
