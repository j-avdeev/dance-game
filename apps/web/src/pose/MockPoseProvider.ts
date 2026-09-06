import {
  POSE_LANDMARK_COUNT,
  PoseLandmarkIndex,
  toAspectCorrectedLandmarks,
  type Landmark,
  type PoseFrame,
} from "@dance-game/core";
import type { PoseProvider } from "./PoseProvider.js";

/**
 * Deterministic synthetic pose source.
 *
 * Lets the controller UI, the render loop and end-to-end tests run without
 * MediaPipe, a camera, or a GPU. CI relies on this: no model ever runs there
 * (PLAN.md, M0 acceptance).
 */

export type MockPoseProviderOptions = {
  /** Frames per second the mock pretends to deliver. */
  fps?: number;
  /** Simulated inference cost, so FPS readouts look realistic. */
  inferenceMs?: number;
  imageWidth?: number;
  imageHeight?: number;
  /** When true, emits frames with no landmarks, as if nobody is in view. */
  emitEmptyFrames?: boolean;
};

/** A neutral standing pose in normalized coordinates, arms out to the sides. */
const BASE_POSE: ReadonlyArray<readonly [number, number]> = (() => {
  const points = new Array<readonly [number, number]>(POSE_LANDMARK_COUNT).fill([0.5, 0.5]);
  const set = (index: number, x: number, y: number): void => {
    points[index] = [x, y];
  };
  set(PoseLandmarkIndex.nose, 0.5, 0.14);
  set(PoseLandmarkIndex.leftEye, 0.47, 0.12);
  set(PoseLandmarkIndex.rightEye, 0.53, 0.12);
  set(PoseLandmarkIndex.leftEar, 0.44, 0.13);
  set(PoseLandmarkIndex.rightEar, 0.56, 0.13);
  set(PoseLandmarkIndex.mouthLeft, 0.48, 0.17);
  set(PoseLandmarkIndex.mouthRight, 0.52, 0.17);
  set(PoseLandmarkIndex.leftShoulder, 0.4, 0.28);
  set(PoseLandmarkIndex.rightShoulder, 0.6, 0.28);
  set(PoseLandmarkIndex.leftElbow, 0.32, 0.42);
  set(PoseLandmarkIndex.rightElbow, 0.68, 0.42);
  set(PoseLandmarkIndex.leftWrist, 0.26, 0.55);
  set(PoseLandmarkIndex.rightWrist, 0.74, 0.55);
  set(PoseLandmarkIndex.leftPinky, 0.24, 0.58);
  set(PoseLandmarkIndex.rightPinky, 0.76, 0.58);
  set(PoseLandmarkIndex.leftIndex, 0.25, 0.59);
  set(PoseLandmarkIndex.rightIndex, 0.75, 0.59);
  set(PoseLandmarkIndex.leftThumb, 0.27, 0.57);
  set(PoseLandmarkIndex.rightThumb, 0.73, 0.57);
  set(PoseLandmarkIndex.leftHip, 0.44, 0.56);
  set(PoseLandmarkIndex.rightHip, 0.56, 0.56);
  set(PoseLandmarkIndex.leftKnee, 0.44, 0.73);
  set(PoseLandmarkIndex.rightKnee, 0.56, 0.73);
  set(PoseLandmarkIndex.leftAnkle, 0.44, 0.9);
  set(PoseLandmarkIndex.rightAnkle, 0.56, 0.9);
  set(PoseLandmarkIndex.leftHeel, 0.43, 0.92);
  set(PoseLandmarkIndex.rightHeel, 0.57, 0.92);
  set(PoseLandmarkIndex.leftFootIndex, 0.46, 0.94);
  set(PoseLandmarkIndex.rightFootIndex, 0.54, 0.94);
  return points;
})();

/** Landmarks that swing, so the mock skeleton visibly animates. */
const ANIMATED_LANDMARKS = new Set<number>([
  PoseLandmarkIndex.leftElbow,
  PoseLandmarkIndex.rightElbow,
  PoseLandmarkIndex.leftWrist,
  PoseLandmarkIndex.rightWrist,
  PoseLandmarkIndex.leftPinky,
  PoseLandmarkIndex.rightPinky,
  PoseLandmarkIndex.leftIndex,
  PoseLandmarkIndex.rightIndex,
  PoseLandmarkIndex.leftThumb,
  PoseLandmarkIndex.rightThumb,
]);

export class MockPoseProvider implements PoseProvider {
  #seq = 0;
  #lastEmittedAtMs = Number.NEGATIVE_INFINITY;
  readonly #frameIntervalMs: number;
  readonly #options: Required<MockPoseProviderOptions>;

  constructor(options: MockPoseProviderOptions = {}) {
    this.#options = {
      fps: options.fps ?? 30,
      inferenceMs: options.inferenceMs ?? 8,
      imageWidth: options.imageWidth ?? 720,
      imageHeight: options.imageHeight ?? 1280,
      emitEmptyFrames: options.emitEmptyFrames ?? false,
    };
    this.#frameIntervalMs = 1000 / this.#options.fps;
  }

  async initialize(): Promise<void> {
    // Nothing to load; the mock exists precisely to avoid model downloads.
  }

  detect(_video: HTMLVideoElement | undefined, nowMs: number): PoseFrame | undefined {
    if (nowMs - this.#lastEmittedAtMs < this.#frameIntervalMs) {
      return undefined;
    }
    this.#lastEmittedAtMs = nowMs;

    const { imageWidth, imageHeight, inferenceMs, emitEmptyFrames } = this.#options;

    if (emitEmptyFrames) {
      return {
        seq: this.#seq++,
        capturedAtMs: nowMs,
        inferenceMs,
        imageWidth,
        imageHeight,
        landmarks: [],
      };
    }

    // A slow arm swing; deterministic in nowMs so tests stay reproducible.
    const phase = Math.sin((nowMs / 1000) * Math.PI);
    const landmarks: Landmark[] = BASE_POSE.map(([x, y], index) => ({
      x,
      y: ANIMATED_LANDMARKS.has(index) ? y - phase * 0.12 : y,
      z: 0,
      visibility: 0.95,
    }));

    return {
      seq: this.#seq++,
      capturedAtMs: nowMs,
      inferenceMs,
      imageWidth,
      imageHeight,
      landmarks: toAspectCorrectedLandmarks(landmarks, imageWidth, imageHeight),
    };
  }

  close(): void {
    this.#seq = 0;
    this.#lastEmittedAtMs = Number.NEGATIVE_INFINITY;
  }
}
