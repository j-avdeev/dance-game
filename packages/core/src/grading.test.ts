import { describe, expect, it } from "vitest";
import {
  aggregateGradeEvents,
  buildScoringWindows,
  gradeForScore,
  summarizePerformance,
  trimmedMean,
  type ScoredSample,
} from "./grading.js";
import { DEFAULT_GRADING_CONFIG } from "./config.js";
import { parseChoreography } from "./choreography.js";
import { POSE_LANDMARK_COUNT } from "./landmarks.js";
import type { ScoreResult } from "./types.js";

function result(total: number): ScoreResult {
  return {
    total,
    timingOffsetMs: 200,
    confidence: 1,
    parts: {
      leftArm: total,
      rightArm: total,
      leftLeg: total,
      rightLeg: total,
      torso: total,
      motion: total,
    },
  };
}

/** Samples at 10 Hz, all with the same score. */
function samplesAt(scores: number[], startMs = 0, stepMs = 100): ScoredSample[] {
  return scores.map((score, index) => ({
    tMs: startMs + index * stepMs,
    result: result(score),
  }));
}

const landmarks = () =>
  Array.from({ length: POSE_LANDMARK_COUNT }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 1 }));

function choreographyOfDuration(durationMs: number) {
  const frames = [];
  for (let tMs = 0; tMs <= durationMs; tMs += 100) {
    frames.push({ tMs, landmarks: landmarks() });
  }
  return parseChoreography({
    version: 1,
    id: "test",
    title: "Test",
    videoPath: "test.mp4",
    mirrored: false,
    sampleRateHz: 10,
    imageWidth: 720,
    imageHeight: 1280,
    frames,
  });
}

describe("gradeForScore", () => {
  it("maps scores onto the configured thresholds", () => {
    expect(gradeForScore(95)).toBe("perfect");
    expect(gradeForScore(88)).toBe("perfect");
    expect(gradeForScore(87.9)).toBe("great");
    expect(gradeForScore(75)).toBe("great");
    expect(gradeForScore(60)).toBe("good");
    expect(gradeForScore(59.9)).toBe("miss");
    expect(gradeForScore(0)).toBe("miss");
  });
});

describe("trimmedMean", () => {
  it("drops the worst samples before averaging", () => {
    // One badly tracked frame in an otherwise good second must not decide the
    // grade for that second.
    const values = [10, 90, 92, 94, 96];
    expect(trimmedMean(values, 0.2)).toBeGreaterThan(90);
  });

  it("matches the plain mean when nothing is trimmed", () => {
    expect(trimmedMean([10, 20, 30], 0)).toBeCloseTo(20, 10);
  });

  it("keeps at least one value however aggressive the trim", () => {
    expect(trimmedMean([42], 0.9)).toBe(42);
    expect(trimmedMean([10, 20], 0.99)).toBe(20);
  });

  it("returns zero for no values", () => {
    expect(trimmedMean([], 0.2)).toBe(0);
  });
});

describe("buildScoringWindows", () => {
  it("covers the choreography in fixed windows by default", () => {
    const windows = buildScoringWindows(choreographyOfDuration(3000));
    expect(windows).toHaveLength(4);
    expect(windows[0]).toEqual({ startMs: 0, endMs: 1000 });
    expect(windows[3]).toEqual({ startMs: 3000, endMs: 4000 });
  });

  it("prefers the choreography's own windows when present", () => {
    // Move-aligned windows arrive later from the extractor; this code must not
    // need changing when they do.
    const base = choreographyOfDuration(3000);
    const withWindows = parseChoreography({
      ...JSON.parse(JSON.stringify(base)),
      windows: [
        { startMs: 0, endMs: 1500 },
        { startMs: 1500, endMs: 3000 },
      ],
    });
    expect(buildScoringWindows(withWindows)).toEqual([
      { startMs: 0, endMs: 1500 },
      { startMs: 1500, endMs: 3000 },
    ]);
  });
});

describe("aggregateGradeEvents", () => {
  const windows = [
    { startMs: 0, endMs: 1000 },
    { startMs: 1000, endMs: 2000 },
    { startMs: 2000, endMs: 3000 },
  ];

  it("emits one grade per window", () => {
    const samples = samplesAt(Array.from({ length: 30 }, () => 90));
    const events = aggregateGradeEvents(samples, windows);
    expect(events).toHaveLength(3);
    expect(events.every((event) => event.grade === "perfect")).toBe(true);
  });

  it("builds the combo on Good or better", () => {
    const samples = samplesAt(Array.from({ length: 30 }, () => 80));
    const events = aggregateGradeEvents(samples, windows);
    expect(events.map((event) => event.combo)).toEqual([1, 2, 3]);
  });

  it("resets the combo on a Miss and rebuilds afterwards", () => {
    const samples = [
      ...samplesAt(
        Array.from({ length: 10 }, () => 90),
        0,
      ),
      ...samplesAt(
        Array.from({ length: 10 }, () => 20),
        1000,
      ),
      ...samplesAt(
        Array.from({ length: 10 }, () => 90),
        2000,
      ),
    ];
    const events = aggregateGradeEvents(samples, windows);
    expect(events.map((event) => event.grade)).toEqual(["perfect", "miss", "perfect"]);
    expect(events.map((event) => event.combo)).toEqual([1, 0, 1]);
  });

  it("awards no points for a Miss", () => {
    const samples = samplesAt(Array.from({ length: 10 }, () => 10));
    const events = aggregateGradeEvents(samples, [windows[0]!]);
    expect(events[0]?.points).toBe(0);
  });

  it("caps the combo multiplier", () => {
    // A long run must not let points grow without bound.
    const manyWindows = Array.from({ length: 200 }, (_, i) => ({
      startMs: i * 1000,
      endMs: (i + 1) * 1000,
    }));
    const samples = manyWindows.flatMap((window) =>
      samplesAt(
        Array.from({ length: 10 }, () => 95),
        window.startMs,
      ),
    );
    const events = aggregateGradeEvents(samples, manyWindows);
    const maxPoints = Math.max(...events.map((event) => event.points));
    expect(maxPoints).toBeLessThanOrEqual(
      DEFAULT_GRADING_CONFIG.gradePoints.perfect * DEFAULT_GRADING_CONFIG.comboCap + 1e-9,
    );
  });

  it("skips windows with no reference samples", () => {
    // A gap in the choreography is not a window the player can fail.
    const samples = samplesAt(
      Array.from({ length: 10 }, () => 90),
      0,
    );
    const events = aggregateGradeEvents(samples, windows);
    expect(events).toHaveLength(1);
    expect(events[0]?.windowIndex).toBe(0);
  });

  it("assigns each sample to exactly one window", () => {
    // Boundaries are half-open, so a sample at 1000 ms belongs to the second
    // window only. Double-counting would quietly distort every grade.
    const samples = samplesAt([90, 90, 20], 900, 100);
    const events = aggregateGradeEvents(samples, windows);
    expect(events[0]?.score).toBe(90);
    expect(events[1]?.score).toBeLessThan(90);
  });

  it("is deterministic", () => {
    const samples = samplesAt([88, 42, 91, 77, 95, 60, 83, 70, 99, 55]);
    const first = aggregateGradeEvents(samples, windows);
    const second = aggregateGradeEvents(samples, windows);
    expect(second).toEqual(first);
  });
});

describe("summarizePerformance", () => {
  it("totals points, tracks the best combo and counts grades", () => {
    const windows = [
      { startMs: 0, endMs: 1000 },
      { startMs: 1000, endMs: 2000 },
      { startMs: 2000, endMs: 3000 },
    ];
    const samples = [
      ...samplesAt(
        Array.from({ length: 10 }, () => 95),
        0,
      ),
      ...samplesAt(
        Array.from({ length: 10 }, () => 95),
        1000,
      ),
      ...samplesAt(
        Array.from({ length: 10 }, () => 20),
        2000,
      ),
    ];
    const events = aggregateGradeEvents(samples, windows);
    const summary = summarizePerformance(events, samples);

    expect(summary.grades.perfect).toBe(2);
    expect(summary.grades.miss).toBe(1);
    expect(summary.maxCombo).toBe(2);
    expect(summary.totalScore).toBeGreaterThan(0);
  });

  it("averages the body-part breakdown over every sample", () => {
    const samples = [...samplesAt([100, 100, 100, 100, 100]), ...samplesAt([0, 0, 0, 0, 0], 500)];
    const events = aggregateGradeEvents(samples, [{ startMs: 0, endMs: 1000 }]);
    const summary = summarizePerformance(events, samples);
    expect(summary.parts.leftArm).toBeCloseTo(50, 6);
  });

  it("handles a run with no events", () => {
    const summary = summarizePerformance([], []);
    expect(summary.totalScore).toBe(0);
    expect(summary.maxCombo).toBe(0);
    expect(summary.averageScore).toBe(0);
  });
});
