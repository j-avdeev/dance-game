import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  findFrameAtOrBefore,
  getChoreographyDurationMs,
  parseChoreography,
} from "./choreography.js";
import { evaluateFrameVisibility } from "./framing.js";
import { POSE_LANDMARK_COUNT } from "./landmarks.js";
import type { PoseFrame } from "./types.js";

/**
 * Guards the committed demo choreography.
 *
 * The demo is what P1 testers actually dance to, so a regression here would
 * surface as "scoring feels broken" rather than as a failing build. Loading it
 * through the real parser also keeps the file and the validator in step.
 */
const DEMO_PATH = fileURLToPath(
  new URL("../../../content/demo/choreography.json", import.meta.url),
);

const demo = parseChoreography(JSON.parse(readFileSync(DEMO_PATH, "utf8")));

describe("demo choreography", () => {
  it("parses and points at the committed video", () => {
    expect(demo.id).toBe("demo");
    expect(demo.videoPath).toBe("content/demo/demo.mp4");
    expect(demo.mirrored).toBe(true);
  });

  it("covers the 20-40 s range the plan asks of a P1 demo", () => {
    const seconds = getChoreographyDurationMs(demo) / 1000;
    expect(seconds).toBeGreaterThan(20);
    expect(seconds).toBeLessThan(60);
  });

  it("is evenly sampled at its declared rate", () => {
    const expectedGapMs = 1000 / demo.sampleRateHz;
    for (let i = 1; i < demo.frames.length; i++) {
      expect(demo.frames[i]!.tMs - demo.frames[i - 1]!.tMs).toBe(expectedGapMs);
    }
  });

  it("detects the dancer in every frame", () => {
    // The extractor stores an empty array where nobody was found. Any gap here
    // means the scorer has nothing to compare against at that moment.
    const missing = demo.frames.filter((frame) => frame.landmarks.length !== POSE_LANDMARK_COUNT);
    expect(missing).toHaveLength(0);
  });

  it("satisfies the shared framing rule throughout", () => {
    const failures = demo.frames.filter((frame) => {
      const asPoseFrame: PoseFrame = {
        seq: 0,
        capturedAtMs: 0,
        inferenceMs: 0,
        imageWidth: demo.imageWidth,
        imageHeight: demo.imageHeight,
        landmarks: frame.landmarks,
      };
      return !evaluateFrameVisibility(asPoseFrame).satisfied;
    });
    expect(failures).toHaveLength(0);
  });

  it("stores aspect-corrected coordinates", () => {
    // x spans up to the aspect ratio, y stays roughly within the frame. If the
    // correction were skipped, x would be capped at 1 for this portrait video.
    const aspectRatio = demo.imageWidth / demo.imageHeight;
    // Reduced to four numbers first: a per-landmark assertion over ~15k points
    // costs seconds and reports no better.
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const frame of demo.frames) {
      for (const landmark of frame.landmarks) {
        minX = Math.min(minX, landmark.x);
        maxX = Math.max(maxX, landmark.x);
        minY = Math.min(minY, landmark.y);
        maxY = Math.max(maxY, landmark.y);
      }
    }
    expect(minX).toBeGreaterThan(-0.5);
    expect(maxX).toBeLessThan(aspectRatio + 0.5);
    expect(minY).toBeGreaterThan(-0.5);
    expect(maxY).toBeLessThan(1.5);
    // A portrait video would cap x at 1.0 without the correction; this one
    // must exceed nothing of the sort but stay inside the corrected range.
    expect(maxX).toBeLessThanOrEqual(aspectRatio);
  });

  it("supports time lookup across its whole span", () => {
    expect(findFrameAtOrBefore(demo, 0)?.tMs).toBe(0);
    expect(findFrameAtOrBefore(demo, 1050)?.tMs).toBe(1000);
    expect(findFrameAtOrBefore(demo, getChoreographyDurationMs(demo) + 5000)?.tMs).toBe(
      getChoreographyDurationMs(demo),
    );
  });
});
