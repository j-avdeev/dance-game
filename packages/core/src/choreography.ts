import { POSE_LANDMARK_COUNT } from "./landmarks.js";
import type { Choreography, ChoreographyFrame, Landmark } from "./types.js";

/**
 * Choreography file validation and lookup.
 *
 * A choreography is produced once by the extractor and then consumed by the
 * game, possibly much later and on another machine. Validating on load turns a
 * malformed or hand-edited file into a clear error instead of a scoring engine
 * that silently compares against garbage.
 */

export const CHOREOGRAPHY_VERSION = 1 as const;

export class ChoreographyValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChoreographyValidationError";
  }
}

function fail(message: string): never {
  throw new ChoreographyValidationError(message);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseLandmark(value: unknown, context: string): Landmark {
  if (typeof value !== "object" || value === null) {
    fail(`${context}: landmark must be an object`);
  }
  const candidate = value as Record<string, unknown>;
  for (const key of ["x", "y", "z", "visibility"]) {
    if (!isFiniteNumber(candidate[key])) {
      fail(`${context}: landmark.${key} must be a finite number`);
    }
  }
  return {
    x: candidate["x"] as number,
    y: candidate["y"] as number,
    z: candidate["z"] as number,
    visibility: candidate["visibility"] as number,
  };
}

function parseLandmarkArray(value: unknown, context: string): Landmark[] {
  if (!Array.isArray(value)) {
    fail(`${context}: expected an array of landmarks`);
  }
  // An empty array is legitimate: it records a moment where the extractor
  // found no dancer, which the scorer treats as an unscoreable sample.
  if (value.length !== 0 && value.length !== POSE_LANDMARK_COUNT) {
    fail(`${context}: expected 0 or ${POSE_LANDMARK_COUNT} landmarks, received ${value.length}`);
  }
  return value.map((landmark, index) => parseLandmark(landmark, `${context}[${index}]`));
}

function parseFrame(value: unknown, index: number): ChoreographyFrame {
  if (typeof value !== "object" || value === null) {
    fail(`frames[${index}]: must be an object`);
  }
  const candidate = value as Record<string, unknown>;
  if (!isFiniteNumber(candidate["tMs"])) {
    fail(`frames[${index}]: tMs must be a finite number`);
  }
  if ((candidate["tMs"] as number) < 0) {
    fail(`frames[${index}]: tMs must not be negative`);
  }

  const frame: ChoreographyFrame = {
    tMs: candidate["tMs"] as number,
    landmarks: parseLandmarkArray(candidate["landmarks"], `frames[${index}].landmarks`),
  };

  if (candidate["worldLandmarks"] !== undefined) {
    return {
      ...frame,
      worldLandmarks: parseLandmarkArray(
        candidate["worldLandmarks"],
        `frames[${index}].worldLandmarks`,
      ),
    };
  }
  return frame;
}

/**
 * Parses and validates a choreography from untrusted JSON.
 *
 * Throws {@link ChoreographyValidationError} with a specific message rather
 * than returning a partial object, so a bad file cannot reach the scorer.
 */
export function parseChoreography(value: unknown): Choreography {
  if (typeof value !== "object" || value === null) {
    fail("choreography must be an object");
  }
  const candidate = value as Record<string, unknown>;

  if (candidate["version"] !== CHOREOGRAPHY_VERSION) {
    fail(
      `unsupported choreography version ${String(candidate["version"])}; expected ${CHOREOGRAPHY_VERSION}`,
    );
  }

  for (const key of ["id", "title", "videoPath"]) {
    if (typeof candidate[key] !== "string" || (candidate[key] as string).length === 0) {
      fail(`${key} must be a non-empty string`);
    }
  }
  if (typeof candidate["mirrored"] !== "boolean") {
    fail("mirrored must be a boolean");
  }
  for (const key of ["sampleRateHz", "imageWidth", "imageHeight"]) {
    if (!isFiniteNumber(candidate[key]) || (candidate[key] as number) <= 0) {
      fail(`${key} must be a positive number`);
    }
  }

  if (!Array.isArray(candidate["frames"])) {
    fail("frames must be an array");
  }
  if (candidate["frames"].length === 0) {
    fail("frames must not be empty");
  }
  const frames = candidate["frames"].map(parseFrame);

  // The scorer binary-searches by time, so out-of-order frames would silently
  // return wrong reference poses rather than failing.
  for (let i = 1; i < frames.length; i++) {
    const previous = frames[i - 1];
    const current = frames[i];
    if (previous && current && current.tMs <= previous.tMs) {
      fail(`frames[${i}]: tMs must strictly increase (${previous.tMs} then ${current.tMs})`);
    }
  }

  let windows: Choreography["windows"];
  if (candidate["windows"] !== undefined) {
    if (!Array.isArray(candidate["windows"])) {
      fail("windows must be an array when present");
    }
    windows = candidate["windows"].map((window, index) => {
      if (typeof window !== "object" || window === null) {
        fail(`windows[${index}]: must be an object`);
      }
      const entry = window as Record<string, unknown>;
      if (!isFiniteNumber(entry["startMs"]) || !isFiniteNumber(entry["endMs"])) {
        fail(`windows[${index}]: startMs and endMs must be finite numbers`);
      }
      if ((entry["endMs"] as number) <= (entry["startMs"] as number)) {
        fail(`windows[${index}]: endMs must be greater than startMs`);
      }
      return { startMs: entry["startMs"] as number, endMs: entry["endMs"] as number };
    });
  }

  return {
    version: CHOREOGRAPHY_VERSION,
    id: candidate["id"] as string,
    title: candidate["title"] as string,
    videoPath: candidate["videoPath"] as string,
    mirrored: candidate["mirrored"] as boolean,
    sampleRateHz: candidate["sampleRateHz"] as number,
    imageWidth: candidate["imageWidth"] as number,
    imageHeight: candidate["imageHeight"] as number,
    frames,
    ...(windows ? { windows } : {}),
  };
}

/** Total duration covered by the choreography, in milliseconds. */
export function getChoreographyDurationMs(choreography: Choreography): number {
  const last = choreography.frames[choreography.frames.length - 1];
  return last?.tMs ?? 0;
}

/**
 * Finds the frame at or immediately before `tMs`.
 *
 * Binary search, because the game looks this up on every animation frame and a
 * linear scan over a multi-minute choreography would be wasteful.
 */
export function findFrameAtOrBefore(
  choreography: Choreography,
  tMs: number,
): ChoreographyFrame | undefined {
  const { frames } = choreography;
  if (frames.length === 0 || tMs < (frames[0]?.tMs ?? 0)) {
    return undefined;
  }

  let low = 0;
  let high = frames.length - 1;
  let best: ChoreographyFrame | undefined;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const frame = frames[mid];
    if (!frame) {
      break;
    }
    if (frame.tMs <= tMs) {
      best = frame;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return best;
}
