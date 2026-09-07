import { describe, expect, it } from "vitest";
import type { ScoredSample } from "@dance-game/core";
import {
  buildDebugReport,
  edgePileUpRatio,
  buildLagHistogram,
  meanTimingOffsetMs,
  medianTimingOffsetMs,
} from "./debugReport.js";

/**
 * These numbers decide `expectedLagMs`, which is the constant the plan says
 * must be set from real measurements before M5. Getting them wrong would send
 * the tuning in the wrong direction, so the arithmetic is pinned down here.
 */

function sample(tMs: number, timingOffsetMs: number, total = 80): ScoredSample {
  return {
    tMs,
    result: {
      total,
      timingOffsetMs,
      confidence: 1,
      parts: {
        leftArm: total,
        rightArm: total,
        leftLeg: total,
        rightLeg: total,
        torso: total,
        motion: total,
      },
    },
  };
}

describe("meanTimingOffsetMs", () => {
  it("averages the measured lags", () => {
    expect(meanTimingOffsetMs([100, 200, 300])).toBeCloseTo(200, 6);
  });

  it("returns zero when nothing was measured", () => {
    expect(meanTimingOffsetMs([])).toBe(0);
  });
});

describe("medianTimingOffsetMs", () => {
  it("is unmoved by a few extreme values", () => {
    // The median is preferred for setting expectedLagMs precisely because a
    // handful of badly matched frames should not move it.
    const lags = [180, 200, 210, 190, 2000];
    // Sorted: 180, 190, 200, 210, 2000. The outlier sits at the end and
    // cannot move the middle value, unlike the mean which it drags past 500.
    expect(medianTimingOffsetMs(lags)).toBe(200);
    expect(meanTimingOffsetMs(lags)).toBeGreaterThan(500);
  });

  it("averages the middle pair for an even count", () => {
    expect(medianTimingOffsetMs([100, 200])).toBe(150);
  });

  it("returns zero for no values", () => {
    expect(medianTimingOffsetMs([])).toBe(0);
  });
});

describe("buildLagHistogram", () => {
  it("buckets lags to the nearest 100 ms, in order", () => {
    expect(buildLagHistogram([180, 210, 240, 90, 320])).toEqual([
      { bucketMs: 100, count: 1 },
      { bucketMs: 200, count: 3 },
      { bucketMs: 300, count: 1 },
    ]);
  });

  it("returns nothing for no measurements", () => {
    expect(buildLagHistogram([])).toEqual([]);
  });
});

describe("edgePileUpRatio", () => {
  it("detects measurements stacked at the search limit", () => {
    // The failure mode seen in a real session: the search could not look far
    // enough, so it returned its own boundary and the median read as a value.
    const lags = [200, 300, 1200, 1200, 1200];
    expect(edgePileUpRatio(lags)).toBeCloseTo(0.6, 6);
  });

  it("is zero for a well-spread distribution", () => {
    expect(edgePileUpRatio([100, 200, 300, 400])).toBe(0);
  });

  it("is zero for no measurements", () => {
    expect(edgePileUpRatio([])).toBe(0);
  });
});

describe("buildDebugReport", () => {
  const input = {
    choreographyId: "demo",
    samples: [sample(0, 190), sample(100, 210)],
    events: [],
    measuredLags: [190, 210],
    fps: 28.4,
    inferenceMs: 21.3,
    expectedLagMs: 200,
    latencyOffsetMs: 0,
  };

  it("includes the measured lag, which is the point of the report", () => {
    const report = buildDebugReport(input);
    expect(report).toContain("measured lag: mean 200 ms, median 200 ms (n=2)");
    expect(report).toContain("expectedLagMs (configured): 200");
  });

  it("includes device and performance context", () => {
    const report = buildDebugReport(input);
    expect(report).toContain("userAgent:");
    expect(report).toContain("28.4 fps");
  });

  it("includes the per-part averages", () => {
    const report = buildDebugReport(input);
    expect(report).toContain("per-part averages:");
    expect(report).toContain("leftArm: 80.0");
  });

  it("warns when the measurement is censored rather than measured", () => {
    const report = buildDebugReport({
      ...input,
      measuredLags: [1200, 1200, 1200, 200],
    });
    expect(report).toContain("WARNING");
    expect(report).toContain("floor, not a measurement");
  });

  it("stays quiet when the distribution is healthy", () => {
    expect(buildDebugReport(input)).not.toContain("WARNING");
  });

  it("does not throw when nothing was scored", () => {
    expect(() =>
      buildDebugReport({ ...input, samples: [], events: [], measuredLags: [] }),
    ).not.toThrow();
  });
});
