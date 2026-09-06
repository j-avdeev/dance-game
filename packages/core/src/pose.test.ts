import { describe, expect, it } from "vitest";
import {
  mirrorLandmarks,
  roundPoseFrameForTransport,
  smoothLandmarks,
  toAspectCorrectedLandmarks,
  toNormalizedLandmarks,
} from "./pose.js";
import { PoseLandmarkIndex, POSE_LANDMARK_COUNT } from "./landmarks.js";
import type { Landmark, PoseFrame } from "./types.js";

const landmark = (x: number, y: number, visibility = 1): Landmark => ({ x, y, z: 0, visibility });

function fullBody(overrides: Partial<Record<number, Landmark>> = {}): Landmark[] {
  const landmarks = Array.from({ length: POSE_LANDMARK_COUNT }, () => landmark(0.5, 0.5));
  for (const [index, value] of Object.entries(overrides)) {
    landmarks[Number(index)] = value as Landmark;
  }
  return landmarks;
}

describe("toAspectCorrectedLandmarks", () => {
  it("scales x by the aspect ratio so proportions are physical", () => {
    // A landscape 16:9 frame stretches x; correcting restores real geometry.
    const corrected = toAspectCorrectedLandmarks([landmark(0.5, 0.5)], 1920, 1080);
    expect(corrected[0]?.x).toBeCloseTo(0.5 * (1920 / 1080), 10);
    expect(corrected[0]?.y).toBeCloseTo(0.5, 10);
  });

  it("preserves a square frame unchanged", () => {
    const corrected = toAspectCorrectedLandmarks([landmark(0.25, 0.75)], 512, 512);
    expect(corrected[0]?.x).toBeCloseTo(0.25, 10);
  });

  it("round-trips through toNormalizedLandmarks", () => {
    const original = [landmark(0.3, 0.6), landmark(0.9, 0.1)];
    const restored = toNormalizedLandmarks(
      toAspectCorrectedLandmarks(original, 720, 1280),
      720,
      1280,
    );
    expect(restored[0]?.x).toBeCloseTo(0.3, 10);
    expect(restored[1]?.x).toBeCloseTo(0.9, 10);
  });

  it("makes the same physical pose comparable across aspect ratios", () => {
    // The whole point of aspect correction: a portrait phone and a landscape
    // reference video must produce the same geometry for the same pose.
    const portrait = toAspectCorrectedLandmarks(
      [landmark(0.5, 0.2), landmark(0.5, 0.8)],
      720,
      1280,
    );
    const landscape = toAspectCorrectedLandmarks(
      [landmark(0.28125, 0.2), landmark(0.28125, 0.8)],
      1280,
      720,
    );
    const portraitDx = (portrait[1]?.x ?? 0) - (portrait[0]?.x ?? 0);
    const landscapeDx = (landscape[1]?.x ?? 0) - (landscape[0]?.x ?? 0);
    expect(portraitDx).toBeCloseTo(landscapeDx, 10);
  });

  it("rejects a zero-height frame instead of producing Infinity", () => {
    expect(() => toAspectCorrectedLandmarks([landmark(0.5, 0.5)], 720, 0)).toThrow(/imageHeight/);
  });
});

describe("mirrorLandmarks", () => {
  it("swaps semantic left and right, not coordinates", () => {
    const landmarks = fullBody({
      [PoseLandmarkIndex.leftWrist]: landmark(0.1, 0.2),
      [PoseLandmarkIndex.rightWrist]: landmark(0.9, 0.8),
    });
    const mirrored = mirrorLandmarks(landmarks);
    expect(mirrored[PoseLandmarkIndex.leftWrist]).toEqual(landmark(0.9, 0.8));
    expect(mirrored[PoseLandmarkIndex.rightWrist]).toEqual(landmark(0.1, 0.2));
  });

  it("leaves centre-line landmarks alone", () => {
    const landmarks = fullBody({ [PoseLandmarkIndex.nose]: landmark(0.5, 0.1) });
    expect(mirrorLandmarks(landmarks)[PoseLandmarkIndex.nose]).toEqual(landmark(0.5, 0.1));
  });

  it("is its own inverse", () => {
    const landmarks = fullBody({
      [PoseLandmarkIndex.leftAnkle]: landmark(0.2, 0.95),
      [PoseLandmarkIndex.rightAnkle]: landmark(0.8, 0.93),
    });
    expect(mirrorLandmarks(mirrorLandmarks(landmarks))).toEqual(landmarks);
  });
});

describe("smoothLandmarks", () => {
  it("passes the first frame through untouched", () => {
    const current = [landmark(0.4, 0.6)];
    expect(smoothLandmarks(undefined, current, 0.5)).toEqual(current);
  });

  it("blends towards the newest frame", () => {
    const smoothed = smoothLandmarks([landmark(0, 0)], [landmark(1, 1)], 0.25);
    expect(smoothed[0]?.x).toBeCloseTo(0.25, 10);
  });

  it("disables smoothing at alpha 1", () => {
    const smoothed = smoothLandmarks([landmark(0, 0)], [landmark(1, 1)], 1);
    expect(smoothed[0]?.x).toBeCloseTo(1, 10);
  });

  it("restarts cleanly when the landmark count changes", () => {
    // Happens whenever the person leaves and re-enters the frame.
    const current = [landmark(0.5, 0.5)];
    expect(smoothLandmarks([landmark(0, 0), landmark(0, 0)], current, 0.5)).toEqual(current);
  });

  it("rejects an out-of-range alpha", () => {
    expect(() => smoothLandmarks(undefined, [landmark(0, 0)], 0)).toThrow(/alpha/);
    expect(() => smoothLandmarks(undefined, [landmark(0, 0)], 1.5)).toThrow(/alpha/);
  });
});

describe("roundPoseFrameForTransport", () => {
  const frame: PoseFrame = {
    seq: 1,
    capturedAtMs: 1000,
    inferenceMs: 12.3456,
    imageWidth: 720,
    imageHeight: 1280,
    landmarks: [{ x: 0.123456789, y: 0.987654321, z: -0.5555555, visibility: 0.912345 }],
  };

  it("rounds coordinates to the transport precision", () => {
    const rounded = roundPoseFrameForTransport(frame);
    expect(rounded.landmarks[0]).toEqual({
      x: 0.1235,
      y: 0.9877,
      z: -0.5556,
      visibility: 0.9123,
    });
  });

  it("leaves frame metadata untouched", () => {
    const rounded = roundPoseFrameForTransport(frame);
    expect(rounded.seq).toBe(frame.seq);
    expect(rounded.capturedAtMs).toBe(frame.capturedAtMs);
    expect(rounded.imageWidth).toBe(frame.imageWidth);
  });

  it("handles a frame with no person", () => {
    const empty = roundPoseFrameForTransport({ ...frame, landmarks: [] });
    expect(empty.landmarks).toEqual([]);
  });
});
