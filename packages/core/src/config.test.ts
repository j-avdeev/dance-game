import { describe, expect, it } from "vitest";
import {
  DEFAULT_BODY_PART_WEIGHTS,
  DEFAULT_GRADING_CONFIG,
  DEFAULT_SCORING_CONFIG,
} from "./config.js";

describe("DEFAULT_SCORING_CONFIG", () => {
  it("splits the raw score entirely between pose and motion", () => {
    const { staticPoseWeight, motionWeight } = DEFAULT_SCORING_CONFIG;
    expect(staticPoseWeight + motionWeight).toBeCloseTo(1, 10);
  });

  it("waits long enough to see a late player before evaluating a sample", () => {
    // A sample may not be scored until the whole search window has passed,
    // otherwise a player at the far end of the window is scored as a Miss.
    const { evaluationDelayMs, expectedLagMs, timingWindowMs } = DEFAULT_SCORING_CONFIG;
    expect(evaluationDelayMs).toBeGreaterThanOrEqual(expectedLagMs + timingWindowMs);
  });

  it("buffers at least as much history as the evaluation delay needs", () => {
    const { playerBufferMs, evaluationDelayMs } = DEFAULT_SCORING_CONFIG;
    expect(playerBufferMs).toBeGreaterThanOrEqual(evaluationDelayMs);
  });

  it("tolerates lateness more than earliness", () => {
    const { earlySigmaMs, lateSigmaMs } = DEFAULT_SCORING_CONFIG;
    expect(lateSigmaMs).toBeGreaterThan(earlySigmaMs);
  });
});

describe("DEFAULT_BODY_PART_WEIGHTS", () => {
  it("sums to one so the static score stays in range", () => {
    const total = Object.values(DEFAULT_BODY_PART_WEIGHTS).reduce((sum, w) => sum + w, 0);
    expect(total).toBeCloseTo(1, 10);
  });
});

describe("DEFAULT_GRADING_CONFIG", () => {
  it("orders grade thresholds from best to worst", () => {
    const { perfect, great, good } = DEFAULT_GRADING_CONFIG.thresholds;
    expect(perfect).toBeGreaterThan(great);
    expect(great).toBeGreaterThan(good);
  });

  it("awards more points for better grades", () => {
    const { perfect, great, good, miss } = DEFAULT_GRADING_CONFIG.gradePoints;
    expect(perfect).toBeGreaterThan(great);
    expect(great).toBeGreaterThan(good);
    expect(good).toBeGreaterThan(miss);
  });

  it("keeps the trimmed mean from discarding every sample", () => {
    expect(DEFAULT_GRADING_CONFIG.trimFraction).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_GRADING_CONFIG.trimFraction).toBeLessThan(1);
  });
});
