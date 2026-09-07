import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseChoreography } from "./choreography.js";
import { DEFAULT_SCORING_CONFIG } from "./config.js";
import type { TimedLandmarks } from "./features.js";
import { aggregateGradeEvents, buildScoringWindows, summarizePerformance } from "./grading.js";
import { mirrorLandmarks } from "./pose.js";
import { measureTimingOffsetMs, scoreSample } from "./scoring.js";
import type { Choreography } from "./types.js";

/**
 * End-to-end scoring against the committed demo choreography.
 *
 * The synthetic tests pin down individual behaviours; this one answers the
 * question the whole project rests on: does copying the dance beat not copying
 * it, on real pose data with real noise? A version of the engine passed every
 * synthetic test while scoring a flawless performance at 50 and standing still
 * at 45, so this check is not redundant.
 */

const DEMO_PATH = fileURLToPath(
  new URL("../../../content/demo/choreography.json", import.meta.url),
);
const demo: Choreography = parseChoreography(JSON.parse(readFileSync(DEMO_PATH, "utf8")));

const referenceHistory: TimedLandmarks[] = demo.frames.map((frame) => ({
  tMs: frame.tMs,
  landmarks: frame.landmarks,
}));

/**
 * Plays the whole choreography against a simulated player and summarises it.
 * The player stream is shifted by the expected lag, as a real dancer would be.
 */
function playThrough(playerHistory: TimedLandmarks[]) {
  const samples = demo.frames.map((frame) => ({
    tMs: frame.tMs,
    result: scoreSample({
      referenceLandmarks: frame.landmarks,
      referenceHistory,
      referenceTMs: frame.tMs,
      playerHistory,
      mirrored: demo.mirrored,
    }),
  }));
  const events = aggregateGradeEvents(samples, buildScoringWindows(demo));
  return summarizePerformance(events, samples);
}

/**
 * A player copying the dance correctly.
 *
 * The choreography is mirrored, so a player facing the screen performs the
 * mirror image of the dancer.
 */
function correctPlayer(offsetMs = DEFAULT_SCORING_CONFIG.expectedLagMs): TimedLandmarks[] {
  return referenceHistory.map((entry) => ({
    tMs: entry.tMs + offsetMs,
    landmarks: mirrorLandmarks(entry.landmarks),
  }));
}

describe("scoring the demo choreography", () => {
  it("gives a correct performance top marks", () => {
    const summary = playThrough(correctPlayer());
    expect(summary.averageScore).toBeGreaterThan(90);
    expect(summary.grades.miss).toBe(0);
  });

  it("scores deliberately wrong movement far below a correct one", () => {
    // Same dancer and same poses, played backwards: the moves are right but
    // never at the right moment.
    const reversed: TimedLandmarks[] = demo.frames.map((frame, index) => ({
      tMs: frame.tMs + DEFAULT_SCORING_CONFIG.expectedLagMs,
      landmarks: mirrorLandmarks(demo.frames[demo.frames.length - 1 - index]!.landmarks),
    }));

    const correct = playThrough(correctPlayer());
    const wrong = playThrough(reversed);

    expect(correct.averageScore - wrong.averageScore).toBeGreaterThan(25);
    expect(wrong.grades.miss).toBeGreaterThan(wrong.grades.perfect);
  });

  it("scores standing still far below dancing", () => {
    const frozenPose = mirrorLandmarks(demo.frames[0]!.landmarks);
    const standingStill: TimedLandmarks[] = referenceHistory.map((entry) => ({
      tMs: entry.tMs + DEFAULT_SCORING_CONFIG.expectedLagMs,
      landmarks: frozenPose,
    }));

    const correct = playThrough(correctPlayer());
    const still = playThrough(standingStill);

    expect(correct.averageScore - still.averageScore).toBeGreaterThan(25);
    expect(still.grades.miss).toBeGreaterThan(still.grades.perfect);
  });

  it("still rewards a player who lags more than expected", () => {
    // Reaction time varies between people; someone 100 ms slower than the
    // model assumes is still dancing correctly.
    const summary = playThrough(correctPlayer(DEFAULT_SCORING_CONFIG.expectedLagMs + 100));
    expect(summary.averageScore).toBeGreaterThan(70);
  });

  it("penalises a player who is a whole beat behind", () => {
    const onTime = playThrough(correctPlayer());
    const wayBehind = playThrough(correctPlayer(DEFAULT_SCORING_CONFIG.expectedLagMs + 800));
    expect(wayBehind.averageScore).toBeLessThan(onTime.averageScore - 20);
  });

  it("is unaffected by where the player stands", () => {
    const shifted: TimedLandmarks[] = correctPlayer().map((entry) => ({
      tMs: entry.tMs,
      landmarks: entry.landmarks.map((landmark) => ({
        ...landmark,
        x: landmark.x + 0.15,
        y: landmark.y - 0.05,
      })),
    }));

    const base = playThrough(correctPlayer());
    const moved = playThrough(shifted);
    expect(Math.abs(base.averageScore - moved.averageScore)).toBeLessThan(2);
  });

  it("recovers the player's true lag, independently of the configured one", () => {
    // M4 has to check expectedLagMs against reality. The scored offset cannot
    // do that: it is pulled towards the configured value by design, so it
    // would only echo the assumption back. This measurement ignores the
    // timing penalty and so is free to disagree.
    // 600 and 800 exceed the scoring window deliberately: a real session
    // reported 55% of samples at exactly 400 ms, the old window edge, because
    // the measurement inherited the scoring window and could not look past it.
    for (const trueLagMs of [0, 200, 400, 600, 800]) {
      const playerHistory = correctPlayer(trueLagMs);
      const measured: number[] = [];

      // Sampled across the middle of the routine, away from the ends where
      // the search window runs off the timeline.
      for (let index = 50; index < demo.frames.length - 50; index += 5) {
        const frame = demo.frames[index]!;
        const offset = measureTimingOffsetMs({
          referenceLandmarks: frame.landmarks,
          referenceHistory,
          referenceTMs: frame.tMs,
          playerHistory,
          mirrored: demo.mirrored,
          config: DEFAULT_SCORING_CONFIG,
        });
        if (offset !== undefined) {
          measured.push(offset);
        }
      }

      measured.sort((a, b) => a - b);
      const median = measured[Math.floor(measured.length / 2)]!;
      expect(Math.abs(median - trueLagMs)).toBeLessThanOrEqual(100);
    }
  });

  it("survives dropouts where the player left the frame", () => {
    // The controller sends empty landmark arrays when nobody is detected.
    const withGaps: TimedLandmarks[] = correctPlayer().map((entry, index) =>
      index % 10 === 0 ? { tMs: entry.tMs, landmarks: [] } : entry,
    );

    const summary = playThrough(withGaps);
    expect(Number.isFinite(summary.averageScore)).toBe(true);
    expect(summary.averageScore).toBeGreaterThan(60);
  });
});
