import { DEFAULT_GRADING_CONFIG, type GradingConfig } from "./config.js";
import type { Choreography, Grade, GradeEvent, ScoreParts, ScoreResult } from "./types.js";

/**
 * Turns per-sample scores into the grades, combo and total the player sees.
 *
 * Reference samples arrive about ten times a second and individual scores are
 * noisy, so they are never displayed directly. They are aggregated into
 * windows, and each window produces exactly one grade.
 */

/** One scored reference sample, ready to be aggregated. */
export type ScoredSample = {
  /** Reference time of the sample, in choreography time. */
  tMs: number;
  result: ScoreResult;
};

/** Maps a window score onto a grade. */
export function gradeForScore(
  score: number,
  config: GradingConfig = DEFAULT_GRADING_CONFIG,
): Grade {
  if (score >= config.thresholds.perfect) {
    return "perfect";
  }
  if (score >= config.thresholds.great) {
    return "great";
  }
  if (score >= config.thresholds.good) {
    return "good";
  }
  return "miss";
}

/**
 * Mean after discarding the worst `trimFraction` of values.
 *
 * A single badly tracked frame in the middle of a good move should not decide
 * the grade for that whole second. Trimming the low end rather than using a
 * plain mean keeps one bad sample from dominating.
 */
export function trimmedMean(values: readonly number[], trimFraction: number): number {
  if (values.length === 0) {
    return 0;
  }
  if (trimFraction <= 0 || values.length === 1) {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  const sorted = [...values].sort((a, b) => a - b);
  // Always keep at least one sample, however aggressive the trim.
  const dropCount = Math.min(sorted.length - 1, Math.floor(sorted.length * trimFraction));
  const kept = sorted.slice(dropCount);
  return kept.reduce((sum, value) => sum + value, 0) / kept.length;
}

/**
 * Scoring windows for a choreography.
 *
 * Uses the choreography's own windows when present, so move-aligned grading can
 * arrive later without touching this code; otherwise falls back to fixed-length
 * windows starting at t=0.
 */
export function buildScoringWindows(
  choreography: Choreography,
  config: GradingConfig = DEFAULT_GRADING_CONFIG,
): { startMs: number; endMs: number }[] {
  if (choreography.windows && choreography.windows.length > 0) {
    return choreography.windows.map((window) => ({ ...window }));
  }

  const lastFrame = choreography.frames[choreography.frames.length - 1];
  const durationMs = lastFrame?.tMs ?? 0;
  const windows: { startMs: number; endMs: number }[] = [];
  for (let startMs = 0; startMs <= durationMs; startMs += config.gradeWindowMs) {
    windows.push({ startMs, endMs: startMs + config.gradeWindowMs });
  }
  return windows;
}

function averageParts(samples: readonly ScoredSample[]): ScoreParts {
  const empty: ScoreParts = {
    leftArm: 0,
    rightArm: 0,
    leftLeg: 0,
    rightLeg: 0,
    torso: 0,
    motion: 0,
  };
  if (samples.length === 0) {
    return empty;
  }

  const keys = Object.keys(empty) as (keyof ScoreParts)[];
  const totals = { ...empty };
  for (const sample of samples) {
    for (const key of keys) {
      totals[key] += sample.result.parts[key];
    }
  }
  for (const key of keys) {
    totals[key] /= samples.length;
  }
  return totals;
}

/**
 * Aggregates scored samples into grade events.
 *
 * Combo and points are folded in here rather than tracked by the UI, so replays
 * and tests produce identical numbers to a live session.
 */
export function aggregateGradeEvents(
  samples: readonly ScoredSample[],
  windows: readonly { startMs: number; endMs: number }[],
  config: GradingConfig = DEFAULT_GRADING_CONFIG,
): GradeEvent[] {
  const events: GradeEvent[] = [];
  let combo = 0;

  windows.forEach((window, windowIndex) => {
    const inWindow = samples.filter(
      (sample) => sample.tMs >= window.startMs && sample.tMs < window.endMs,
    );
    // A window with no reference samples is not part of the routine.
    if (inWindow.length === 0) {
      return;
    }

    const score = trimmedMean(
      inWindow.map((sample) => sample.result.total),
      config.trimFraction,
    );
    const grade = gradeForScore(score, config);

    combo = grade === "miss" ? 0 : combo + 1;

    const multiplier = Math.min(1 + combo * config.comboStep, config.comboCap);
    const points = config.gradePoints[grade] * multiplier;

    events.push({
      windowIndex,
      startMs: window.startMs,
      endMs: window.endMs,
      score,
      grade,
      combo,
      points,
      parts: averageParts(inWindow),
    });
  });

  return events;
}

export type PerformanceSummary = {
  totalScore: number;
  maxCombo: number;
  /** Count of each grade awarded. */
  grades: Record<Grade, number>;
  /** Mean per-part score across every evaluated sample. */
  parts: ScoreParts;
  /** Mean window score, in [0, 100]. */
  averageScore: number;
};

/** Final summary shown after a run. */
export function summarizePerformance(
  events: readonly GradeEvent[],
  samples: readonly ScoredSample[],
): PerformanceSummary {
  const grades: Record<Grade, number> = { perfect: 0, great: 0, good: 0, miss: 0 };
  let totalScore = 0;
  let maxCombo = 0;
  let scoreSum = 0;

  for (const event of events) {
    grades[event.grade] += 1;
    totalScore += event.points;
    maxCombo = Math.max(maxCombo, event.combo);
    scoreSum += event.score;
  }

  return {
    totalScore: Math.round(totalScore),
    maxCombo,
    grades,
    // Averaged over samples, not windows: the breakdown answers "how was my
    // left arm overall", which is a property of the whole performance.
    parts: averageParts(samples),
    averageScore: events.length > 0 ? scoreSum / events.length : 0,
  };
}
