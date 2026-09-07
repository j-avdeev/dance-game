import { MEASUREMENT_WINDOW_MS, type GradeEvent, type ScoreParts } from "@dance-game/core";
import type { ScoredSample } from "@dance-game/core";

/**
 * Builds the report a tester pastes back with their feedback.
 *
 * P1 exists to find out whether scoring feels fair, and "it felt wrong" is
 * only actionable alongside the numbers behind it, above all the measured lag
 * (PLAN.md, Prototype P1).
 */

export type DebugReportInput = {
  choreographyId: string;
  samples: readonly ScoredSample[];
  events: readonly GradeEvent[];
  /** Unbiased lag estimates from `measureTimingOffsetMs`. */
  measuredLags: readonly number[];
  fps: number;
  inferenceMs: number;
  expectedLagMs: number;
  latencyOffsetMs: number;
};

/**
 * Distribution of measured lags, in 100 ms buckets.
 *
 * Built from `measuredLags` (see `measureTimingOffsetMs`), not from the scored
 * offsets: the scorer deliberately prefers candidates near `expectedLagMs`, so
 * its offsets cluster around the configured value and would only confirm the
 * assumption back to itself.
 */
export function buildLagHistogram(lags: readonly number[]): { bucketMs: number; count: number }[] {
  const buckets = new Map<number, number>();
  for (const lag of lags) {
    const bucket = Math.round(lag / 100) * 100;
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
  }
  return [...buckets.entries()]
    .map(([bucketMs, count]) => ({ bucketMs, count }))
    .sort((a, b) => a.bucketMs - b.bucketMs);
}

/** Mean measured lag, in ms. */
export function meanTimingOffsetMs(lags: readonly number[]): number {
  if (lags.length === 0) {
    return 0;
  }
  return lags.reduce((total, lag) => total + lag, 0) / lags.length;
}

/**
 * Median measured lag. Preferred over the mean for setting `expectedLagMs`,
 * because a few badly matched frames should not move it.
 */
export function medianTimingOffsetMs(lags: readonly number[]): number {
  if (lags.length === 0) {
    return 0;
  }
  const sorted = [...lags].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
}

/**
 * Fraction of measurements sitting in the outermost bucket.
 *
 * A pile-up at the edge means the search could not look far enough and
 * returned its own boundary, so the median is a floor rather than a value.
 * Reporting this stops a censored number being read as a measurement.
 */
export function edgePileUpRatio(lags: readonly number[]): number {
  if (lags.length === 0) {
    return 0;
  }
  const limit = MEASUREMENT_WINDOW_MS - 50;
  return lags.filter((lag) => Math.abs(lag) >= limit).length / lags.length;
}

function averageParts(samples: readonly ScoredSample[]): ScoreParts {
  const totals: ScoreParts = {
    leftArm: 0,
    rightArm: 0,
    leftLeg: 0,
    rightLeg: 0,
    torso: 0,
    motion: 0,
  };
  if (samples.length === 0) {
    return totals;
  }
  for (const sample of samples) {
    for (const key of Object.keys(totals) as (keyof ScoreParts)[]) {
      totals[key] += sample.result.parts[key] / samples.length;
    }
  }
  return totals;
}

export function buildDebugReport(input: DebugReportInput): string {
  const { samples, events, measuredLags } = input;
  const parts = averageParts(samples);
  const grades = events.reduce<Record<string, number>>((acc, event) => {
    acc[event.grade] = (acc[event.grade] ?? 0) + 1;
    return acc;
  }, {});

  const lines = [
    "Dance game debug report",
    `choreography: ${input.choreographyId}`,
    `userAgent: ${typeof navigator === "undefined" ? "unknown" : navigator.userAgent}`,
    `screen: ${typeof window === "undefined" ? "unknown" : `${window.innerWidth}x${window.innerHeight} @${window.devicePixelRatio}x`}`,
    "",
    `inference: ${input.fps.toFixed(1)} fps, ${input.inferenceMs.toFixed(1)} ms/frame`,
    `samples scored: ${samples.length}`,
    `windows graded: ${events.length}`,
    `grades: ${JSON.stringify(grades)}`,
    "",
    `expectedLagMs (configured): ${input.expectedLagMs}`,
    `latency calibration offset: ${input.latencyOffsetMs} ms`,
    `measured lag: mean ${meanTimingOffsetMs(measuredLags).toFixed(0)} ms, median ${medianTimingOffsetMs(measuredLags).toFixed(0)} ms (n=${measuredLags.length})`,
    `lag histogram: ${buildLagHistogram(measuredLags)
      .map((bucket) => `${bucket.bucketMs}:${bucket.count}`)
      .join(" ")}`,
    ...(edgePileUpRatio(measuredLags) > 0.2
      ? [
          `WARNING: ${(edgePileUpRatio(measuredLags) * 100).toFixed(0)}% of measurements sit at the search limit ` +
            `(${MEASUREMENT_WINDOW_MS} ms). The median is a floor, not a measurement. ` +
            `Tracking was probably failing, or the player was far out of time.`,
        ]
      : []),
    "",
    "per-part averages:",
    ...(Object.keys(parts) as (keyof ScoreParts)[]).map(
      (key) => `  ${key}: ${parts[key].toFixed(1)}`,
    ),
  ];

  return lines.join("\n");
}
