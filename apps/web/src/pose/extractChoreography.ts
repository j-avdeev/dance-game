import { FilesetResolver, PoseLandmarker, type NormalizedLandmark } from "@mediapipe/tasks-vision";
import {
  CHOREOGRAPHY_VERSION,
  toAspectCorrectedLandmarks,
  type Choreography,
  type ChoreographyFrame,
  type Landmark,
} from "@dance-game/core";
import { seekTo, waitForMetadata } from "./seekVideo.js";

/**
 * Extracts a reference pose timeline from a local video.
 *
 * Deliberately separate from `MediaPipePoseProvider`: that one is tuned for a
 * live camera, where it skips unchanged frames and smooths across time. Both
 * behaviours are wrong here. Extraction visits every target timestamp exactly
 * once and stores raw landmarks, so the file is reproducible and the scorer
 * decides later how to filter it.
 */

export type ExtractionOptions = {
  video: HTMLVideoElement;
  id: string;
  title: string;
  videoPath: string;
  mirrored: boolean;
  /** Samples per second along the timeline. */
  sampleRateHz: number;
  /** Seconds into the video where the choreography starts. */
  trimStartSeconds: number;
  /** Seconds into the video where it ends; defaults to the video duration. */
  trimEndSeconds?: number;
  wasmBasePath?: string;
  modelAssetPath?: string;
  onProgress?: (progress: ExtractionProgress) => void;
  signal?: AbortSignal;
};

export type ExtractionProgress = {
  completedSamples: number;
  totalSamples: number;
  /** Samples where no dancer was detected. */
  missedSamples: number;
  currentTMs: number;
};

const DEFAULT_WASM_BASE_PATH = "/mediapipe/wasm";
/**
 * The heavier model. Extraction is offline and one-off, so quality matters
 * more than speed here, unlike on the phone.
 */
const DEFAULT_MODEL_PATH =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task";

export class ExtractionAbortedError extends Error {
  constructor() {
    super("Extraction was cancelled.");
    this.name = "ExtractionAbortedError";
  }
}

function toLandmark(source: NormalizedLandmark): Landmark {
  return {
    x: source.x,
    y: source.y,
    z: source.z,
    visibility: typeof source.visibility === "number" ? source.visibility : 1,
  };
}

export async function extractChoreography(options: ExtractionOptions): Promise<Choreography> {
  const {
    video,
    id,
    title,
    videoPath,
    mirrored,
    sampleRateHz,
    trimStartSeconds,
    onProgress,
    signal,
  } = options;

  if (sampleRateHz <= 0) {
    throw new Error(`sampleRateHz must be positive, received ${sampleRateHz}`);
  }

  await waitForMetadata(video);

  const duration = video.duration;
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("The video has no usable duration.");
  }

  const endSeconds = Math.min(options.trimEndSeconds ?? duration, duration);
  if (endSeconds <= trimStartSeconds) {
    throw new Error("The trim end must come after the trim start.");
  }

  const imageWidth = video.videoWidth;
  const imageHeight = video.videoHeight;
  if (imageWidth === 0 || imageHeight === 0) {
    throw new Error("The video has no usable dimensions.");
  }

  const fileset = await FilesetResolver.forVisionTasks(
    options.wasmBasePath ?? DEFAULT_WASM_BASE_PATH,
  );
  const landmarker = await PoseLandmarker.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath: options.modelAssetPath ?? DEFAULT_MODEL_PATH,
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numPoses: 1,
    outputSegmentationMasks: false,
  });

  try {
    const intervalMs = 1000 / sampleRateHz;
    const spanMs = (endSeconds - trimStartSeconds) * 1000;
    const totalSamples = Math.floor(spanMs / intervalMs) + 1;

    const frames: ChoreographyFrame[] = [];
    let missedSamples = 0;

    for (let index = 0; index < totalSamples; index++) {
      if (signal?.aborted) {
        throw new ExtractionAbortedError();
      }

      // tMs is relative to the trimmed start, which is what the game seeks to.
      const tMs = Math.round(index * intervalMs);
      const videoTimeSeconds = trimStartSeconds + tMs / 1000;

      await seekTo(video, videoTimeSeconds);

      // MediaPipe requires strictly increasing timestamps in VIDEO mode. The
      // sample index is used rather than a wall clock so a re-run of the same
      // video feeds the model the identical sequence.
      const result = landmarker.detectForVideo(video, tMs);
      const rawLandmarks = result.landmarks[0];
      const rawWorldLandmarks = result.worldLandmarks[0];

      if (!rawLandmarks || rawLandmarks.length === 0) {
        // Record the gap rather than dropping the sample: the timeline must
        // stay evenly spaced, and the scorer needs to know the reference is
        // unusable here instead of interpolating across the hole.
        missedSamples += 1;
        frames.push({ tMs, landmarks: [] });
      } else {
        frames.push({
          tMs,
          landmarks: toAspectCorrectedLandmarks(
            rawLandmarks.map(toLandmark),
            imageWidth,
            imageHeight,
          ),
          ...(rawWorldLandmarks ? { worldLandmarks: rawWorldLandmarks.map(toLandmark) } : {}),
        });
      }

      onProgress?.({
        completedSamples: index + 1,
        totalSamples,
        missedSamples,
        currentTMs: tMs,
      });
    }

    return {
      version: CHOREOGRAPHY_VERSION,
      id,
      title,
      videoPath,
      mirrored,
      sampleRateHz,
      imageWidth,
      imageHeight,
      frames,
    };
  } finally {
    landmarker.close();
  }
}
