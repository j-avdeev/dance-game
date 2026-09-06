import { POSE_COORDINATE_PRECISION } from "./protocol.js";
import { MIRROR_LANDMARK_PAIRS } from "./landmarks.js";
import type { Landmark, PoseFrame } from "./types.js";

/**
 * Converts landmarks normalised per axis into aspect-correct coordinates.
 *
 * MediaPipe normalises x and y to [0, 1] independently, so the same physical
 * pose yields different angles on a 9:16 phone and a 16:9 video. Scaling x by
 * the aspect ratio restores real proportions: y stays in [0, 1] and x spans
 * [0, width/height]. Without this, every angle feature is silently wrong.
 */
export function toAspectCorrectedLandmarks(
  landmarks: readonly Landmark[],
  imageWidth: number,
  imageHeight: number,
): Landmark[] {
  if (imageHeight <= 0) {
    throw new Error(`imageHeight must be positive, received ${imageHeight}`);
  }
  const aspectRatio = imageWidth / imageHeight;
  return landmarks.map((landmark) => ({
    ...landmark,
    x: landmark.x * aspectRatio,
  }));
}

/** Reverses {@link toAspectCorrectedLandmarks}, for drawing over the source frame. */
export function toNormalizedLandmarks(
  landmarks: readonly Landmark[],
  imageWidth: number,
  imageHeight: number,
): Landmark[] {
  if (imageWidth <= 0) {
    throw new Error(`imageWidth must be positive, received ${imageWidth}`);
  }
  const aspectRatio = imageWidth / imageHeight;
  return landmarks.map((landmark) => ({
    ...landmark,
    x: landmark.x / aspectRatio,
  }));
}

/**
 * Swaps semantic left/right landmarks.
 *
 * Mirror mode must swap meaning, not flip coordinates: a flip would keep
 * calling the dancer's right arm "left" and score the wrong limb.
 */
export function mirrorLandmarks(landmarks: readonly Landmark[]): Landmark[] {
  const mirrored = landmarks.slice();
  for (const [a, b] of MIRROR_LANDMARK_PAIRS) {
    const first = landmarks[a];
    const second = landmarks[b];
    if (first !== undefined && second !== undefined) {
      mirrored[a] = second;
      mirrored[b] = first;
    }
  }
  return mirrored;
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Rounds coordinates before transmission. At 15 frames per second with 33
 * landmarks, full float precision is mostly wasted bytes; 4 decimals is far
 * below the noise floor of the pose model itself.
 */
export function roundPoseFrameForTransport(
  frame: PoseFrame,
  decimals: number = POSE_COORDINATE_PRECISION,
): PoseFrame {
  return {
    ...frame,
    landmarks: frame.landmarks.map((landmark) => ({
      x: roundTo(landmark.x, decimals),
      y: roundTo(landmark.y, decimals),
      z: roundTo(landmark.z, decimals),
      visibility: roundTo(landmark.visibility, decimals),
    })),
  };
}

/**
 * Exponential moving average over landmark positions.
 *
 * `alpha` is the weight of the newest frame: 1 disables smoothing, smaller
 * values smooth harder at the cost of lag. Visibility is smoothed too, so a
 * single bad frame cannot make a limb flicker in and out of the framing rule.
 */
export function smoothLandmarks(
  previous: readonly Landmark[] | undefined,
  current: readonly Landmark[],
  alpha: number,
): Landmark[] {
  if (alpha <= 0 || alpha > 1) {
    throw new Error(`alpha must be in (0, 1], received ${alpha}`);
  }
  if (previous === undefined || previous.length !== current.length) {
    return current.slice();
  }
  return current.map((landmark, index) => {
    const last = previous[index];
    if (last === undefined) {
      return landmark;
    }
    return {
      x: last.x + alpha * (landmark.x - last.x),
      y: last.y + alpha * (landmark.y - last.y),
      z: last.z + alpha * (landmark.z - last.z),
      visibility: last.visibility + alpha * (landmark.visibility - last.visibility),
    };
  });
}
