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
 * Reflects a pose, as seen in a mirror.
 *
 * Two operations are required and neither alone is correct:
 *
 * 1. reflect x about the body's own centre, so the geometry is actually
 *    mirrored;
 * 2. swap semantic left/right indices, so the reflected right arm is called
 *    the right arm.
 *
 * Swapping indices alone leaves the body inside out: the left shoulder ends up
 * on the right of the frame, and every angle and orientation feature is wrong.
 * Reflecting alone keeps calling the dancer's right arm "left", so the scorer
 * compares the wrong limbs.
 *
 * The reflection is about the pose's own horizontal midpoint rather than the
 * frame centre, so it does not depend on where the dancer stands.
 */
export function mirrorLandmarks(landmarks: readonly Landmark[]): Landmark[] {
  if (landmarks.length === 0) {
    return [];
  }

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  for (const landmark of landmarks) {
    minX = Math.min(minX, landmark.x);
    maxX = Math.max(maxX, landmark.x);
  }
  const axis = (minX + maxX) / 2;

  const reflected = landmarks.map((landmark) => ({
    ...landmark,
    x: 2 * axis - landmark.x,
  }));

  const mirrored = reflected.slice();
  for (const [a, b] of MIRROR_LANDMARK_PAIRS) {
    const first = reflected[a];
    const second = reflected[b];
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
