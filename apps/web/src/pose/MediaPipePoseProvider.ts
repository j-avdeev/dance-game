import {
  FilesetResolver,
  PoseLandmarker,
  type NormalizedLandmark,
  type PoseLandmarkerResult,
} from "@mediapipe/tasks-vision";
import {
  smoothLandmarks,
  toAspectCorrectedLandmarks,
  type Landmark,
  type PoseFrame,
} from "@dance-game/core";
import { DEFAULT_SMOOTHING_ALPHA, type PoseProvider } from "./PoseProvider.js";

/**
 * Pose engine backed by MediaPipe Tasks Vision.
 *
 * This class is the adapter boundary: MediaPipe runtime types stop here and
 * callers only ever see the project-owned `PoseFrame` (AGENTS.md rule 14).
 */

export type MediaPipePoseProviderOptions = {
  /**
   * Directory holding the Tasks Vision wasm files. Served from our own origin
   * so the app does not depend on a third-party CDN at runtime.
   */
  wasmBasePath?: string;
  /** Pose model to load. The lite model is the phone-friendly default. */
  modelAssetPath?: string;
  /** GPU is far faster; CPU is the fallback when GPU init fails. */
  delegate?: "GPU" | "CPU";
  /** Weight of the newest frame when smoothing; 1 disables smoothing. */
  smoothingAlpha?: number;
  minPoseDetectionConfidence?: number;
  minPosePresenceConfidence?: number;
  minTrackingConfidence?: number;
};

const DEFAULT_WASM_BASE_PATH = "/mediapipe/wasm";
const DEFAULT_MODEL_PATH =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task";

function toLandmark(source: NormalizedLandmark): Landmark {
  return {
    x: source.x,
    y: source.y,
    z: source.z,
    // Some builds omit visibility; treat a missing value as fully visible
    // rather than silently failing the framing rule for every landmark.
    visibility: typeof source.visibility === "number" ? source.visibility : 1,
  };
}

export class MediaPipePoseProvider implements PoseProvider {
  #landmarker: PoseLandmarker | undefined;
  #options: Required<
    Pick<
      MediaPipePoseProviderOptions,
      | "wasmBasePath"
      | "modelAssetPath"
      | "smoothingAlpha"
      | "minPoseDetectionConfidence"
      | "minPosePresenceConfidence"
      | "minTrackingConfidence"
    >
  > & { delegate: "GPU" | "CPU" | undefined };
  #seq = 0;
  #lastVideoTime = -1;
  #previousLandmarks: Landmark[] | undefined;
  /** The delegate actually in use, which may differ from the requested one. */
  #activeDelegate: "GPU" | "CPU" | undefined;

  constructor(options: MediaPipePoseProviderOptions = {}) {
    this.#options = {
      wasmBasePath: options.wasmBasePath ?? DEFAULT_WASM_BASE_PATH,
      modelAssetPath: options.modelAssetPath ?? DEFAULT_MODEL_PATH,
      smoothingAlpha: options.smoothingAlpha ?? DEFAULT_SMOOTHING_ALPHA,
      minPoseDetectionConfidence: options.minPoseDetectionConfidence ?? 0.5,
      minPosePresenceConfidence: options.minPosePresenceConfidence ?? 0.5,
      minTrackingConfidence: options.minTrackingConfidence ?? 0.5,
      delegate: options.delegate,
    };
  }

  /** The delegate in use after initialization, for the debug overlay. */
  get activeDelegate(): "GPU" | "CPU" | undefined {
    return this.#activeDelegate;
  }

  async #createLandmarker(delegate: "GPU" | "CPU"): Promise<PoseLandmarker> {
    const fileset = await FilesetResolver.forVisionTasks(this.#options.wasmBasePath);
    return PoseLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: this.#options.modelAssetPath,
        delegate,
      },
      runningMode: "VIDEO",
      // One dancer only; the largest/first detection wins.
      numPoses: 1,
      minPoseDetectionConfidence: this.#options.minPoseDetectionConfidence,
      minPosePresenceConfidence: this.#options.minPosePresenceConfidence,
      minTrackingConfidence: this.#options.minTrackingConfidence,
      outputSegmentationMasks: false,
    });
  }

  async initialize(): Promise<void> {
    if (this.#landmarker) {
      return;
    }

    const requested = this.#options.delegate ?? "GPU";
    try {
      this.#landmarker = await this.#createLandmarker(requested);
      this.#activeDelegate = requested;
    } catch (error) {
      // GPU init fails on some mobile browsers and in headless environments.
      // Falling back keeps the controller usable instead of dead.
      if (requested === "CPU") {
        throw error;
      }
      console.warn("[pose] GPU delegate unavailable, falling back to CPU", error);
      this.#landmarker = await this.#createLandmarker("CPU");
      this.#activeDelegate = "CPU";
    }
  }

  detect(video: HTMLVideoElement, nowMs: number): PoseFrame | undefined {
    const landmarker = this.#landmarker;
    if (!landmarker) {
      throw new Error("MediaPipePoseProvider.detect called before initialize()");
    }

    // Inference is the expensive part of the loop, so skip frames the camera
    // has not advanced yet. rAF usually runs faster than the camera delivers.
    if (video.currentTime === this.#lastVideoTime) {
      return undefined;
    }
    this.#lastVideoTime = video.currentTime;

    const imageWidth = video.videoWidth;
    const imageHeight = video.videoHeight;
    if (imageWidth === 0 || imageHeight === 0) {
      return undefined;
    }

    const startedAt = performance.now();
    let result: PoseLandmarkerResult;
    try {
      result = landmarker.detectForVideo(video, nowMs);
    } catch (error) {
      // A single failed inference must not kill the render loop.
      console.warn("[pose] detectForVideo failed", error);
      return undefined;
    }
    const inferenceMs = performance.now() - startedAt;

    const rawLandmarks = result.landmarks[0];
    if (!rawLandmarks || rawLandmarks.length === 0) {
      this.#previousLandmarks = undefined;
      return {
        seq: this.#seq++,
        capturedAtMs: nowMs,
        inferenceMs,
        imageWidth,
        imageHeight,
        landmarks: [],
      };
    }

    // Aspect-correct before smoothing, so smoothing operates on real geometry.
    const corrected = toAspectCorrectedLandmarks(
      rawLandmarks.map(toLandmark),
      imageWidth,
      imageHeight,
    );
    const smoothed = smoothLandmarks(
      this.#previousLandmarks,
      corrected,
      this.#options.smoothingAlpha,
    );
    this.#previousLandmarks = smoothed;

    const worldLandmarks = result.worldLandmarks[0];

    return {
      seq: this.#seq++,
      capturedAtMs: nowMs,
      inferenceMs,
      imageWidth,
      imageHeight,
      landmarks: smoothed,
      ...(worldLandmarks ? { worldLandmarks: worldLandmarks.map(toLandmark) } : {}),
    };
  }

  close(): void {
    this.#landmarker?.close();
    this.#landmarker = undefined;
    this.#previousLandmarks = undefined;
    this.#lastVideoTime = -1;
    this.#activeDelegate = undefined;
  }
}
