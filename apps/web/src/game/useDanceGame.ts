import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_GRADING_CONFIG,
  DEFAULT_SCORING_CONFIG,
  buildScoringWindows,
  gradeForScore,
  measureTimingOffsetMs,
  scoreSample,
  summarizePerformance,
  trimmedMean,
  type Choreography,
  type GamePhase,
  type GradeEvent,
  type PoseFrame,
  type ScoringConfig,
  type TimedLandmarks,
} from "@dance-game/core";
import type { ScoredSample } from "@dance-game/core";

/**
 * The gameplay loop: video clock in, grades out.
 *
 * The desktop video's playback time is the canonical clock. Player poses are
 * stamped with it on arrival, so nothing here depends on synchronised device
 * clocks (PLAN.md, "Player pose timestamps").
 */

export type DanceGameState = {
  phase: GamePhase;
  /** Seconds remaining in the countdown; 0 outside it. */
  countdown: number;
  score: number;
  combo: number;
  maxCombo: number;
  /** Most recent grade, for the on-screen flash. */
  latestGrade: GradeEvent | undefined;
  /** Live estimate for the current second, before the window closes. */
  liveScore: number;
  events: GradeEvent[];
  samples: ScoredSample[];
  /** Unbiased lag estimates, in ms, one per scored sample. */
  measuredLags: number[];
};

const COUNTDOWN_SECONDS = 3;

/** Ring buffer of player poses, in game time. */
class PoseBuffer {
  #entries: TimedLandmarks[] = [];
  readonly #windowMs: number;

  constructor(windowMs: number) {
    this.#windowMs = windowMs;
  }

  push(entry: TimedLandmarks): void {
    // Out-of-order arrivals would break the interpolation's binary search.
    const last = this.#entries[this.#entries.length - 1];
    if (last && entry.tMs <= last.tMs) {
      return;
    }
    this.#entries.push(entry);

    const cutoff = entry.tMs - this.#windowMs;
    let dropCount = 0;
    while (dropCount < this.#entries.length && this.#entries[dropCount]!.tMs < cutoff) {
      dropCount += 1;
    }
    if (dropCount > 0) {
      this.#entries.splice(0, dropCount);
    }
  }

  get entries(): readonly TimedLandmarks[] {
    return this.#entries;
  }

  clear(): void {
    this.#entries = [];
  }
}

export type UseDanceGameOptions = {
  choreography: Choreography | undefined;
  video: HTMLVideoElement | null;
  /** Latest pose from the camera; read on every animation frame. */
  frameRef: React.RefObject<PoseFrame | undefined>;
  scoringConfig?: ScoringConfig;
};

export type UseDanceGameResult = DanceGameState & {
  start: () => void;
  pause: () => void;
  resume: () => void;
  restart: () => void;
  summary: ReturnType<typeof summarizePerformance> | undefined;
};

export function useDanceGame({
  choreography,
  video,
  frameRef,
  scoringConfig = DEFAULT_SCORING_CONFIG,
}: UseDanceGameOptions): UseDanceGameResult {
  const [phase, setPhase] = useState<GamePhase>("idle");
  const [countdown, setCountdown] = useState(0);
  const [events, setEvents] = useState<GradeEvent[]>([]);
  const [samples, setSamples] = useState<ScoredSample[]>([]);
  const [liveScore, setLiveScore] = useState(0);
  const [measuredLags, setMeasuredLags] = useState<number[]>([]);

  // Mutable game state lives in refs: the scoring loop runs at animation rate
  // and must not depend on React having re-rendered.
  const bufferRef = useRef(new PoseBuffer(scoringConfig.playerBufferMs + 500));
  const samplesRef = useRef<ScoredSample[]>([]);
  const eventsRef = useRef<GradeEvent[]>([]);
  const nextSampleIndexRef = useRef(0);
  const nextWindowIndexRef = useRef(0);
  const comboRef = useRef(0);
  const lastSeqRef = useRef(-1);
  const measuredLagsRef = useRef<number[]>([]);

  const referenceHistory = useMemo<TimedLandmarks[]>(
    () =>
      choreography
        ? choreography.frames.map((frame) => ({ tMs: frame.tMs, landmarks: frame.landmarks }))
        : [],
    [choreography],
  );

  const windows = useMemo(
    () => (choreography ? buildScoringWindows(choreography) : []),
    [choreography],
  );

  const resetRun = useCallback(() => {
    bufferRef.current.clear();
    samplesRef.current = [];
    eventsRef.current = [];
    nextSampleIndexRef.current = 0;
    nextWindowIndexRef.current = 0;
    comboRef.current = 0;
    lastSeqRef.current = -1;
    measuredLagsRef.current = [];
    setMeasuredLags([]);
    setEvents([]);
    setSamples([]);
    setLiveScore(0);
  }, []);

  const start = useCallback(() => {
    if (!video || !choreography) {
      return;
    }
    resetRun();
    video.currentTime = 0;
    video.pause();
    setCountdown(COUNTDOWN_SECONDS);
    setPhase("countdown");
  }, [video, choreography, resetRun]);

  const pause = useCallback(() => {
    video?.pause();
    setPhase((current) => (current === "playing" ? "paused" : current));
  }, [video]);

  const resume = useCallback(() => {
    setPhase((current) => {
      if (current !== "paused") {
        return current;
      }
      void video?.play().catch(() => undefined);
      return "playing";
    });
  }, [video]);

  const restart = useCallback(() => {
    start();
  }, [start]);

  // Countdown, then start playback.
  useEffect(() => {
    if (phase !== "countdown") {
      return;
    }
    if (countdown <= 0) {
      void video?.play().catch(() => undefined);
      setPhase("playing");
      return;
    }
    const timer = setTimeout(() => setCountdown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [phase, countdown, video]);

  // The scoring loop.
  useEffect(() => {
    if (phase !== "playing" || !choreography || !video) {
      return;
    }

    let rafHandle = 0;
    let cancelled = false;

    const tick = (): void => {
      if (cancelled) {
        return;
      }
      rafHandle = requestAnimationFrame(tick);

      const gameTimeMs = video.currentTime * 1000;

      // Stamp the newest pose with the video clock, minus what we know about
      // the delay between capture and now. In single-device mode there is no
      // transport, so only inference time applies.
      const frame = frameRef.current;
      if (frame && frame.seq !== lastSeqRef.current) {
        lastSeqRef.current = frame.seq;
        bufferRef.current.push({
          tMs: gameTimeMs - frame.inferenceMs,
          landmarks: frame.landmarks,
        });
      }

      // Score every reference sample whose evaluation moment has arrived.
      // Evaluating on a delay is what lets a late player still be matched.
      const frames = choreography.frames;
      let scoredAny = false;
      while (nextSampleIndexRef.current < frames.length) {
        const sample = frames[nextSampleIndexRef.current]!;
        if (sample.tMs + scoringConfig.evaluationDelayMs > gameTimeMs) {
          break;
        }
        const scoreInput = {
          referenceLandmarks: sample.landmarks,
          referenceHistory,
          referenceTMs: sample.tMs,
          playerHistory: bufferRef.current.entries,
          mirrored: choreography.mirrored,
          config: scoringConfig,
        };
        const result = scoreSample(scoreInput);
        samplesRef.current.push({ tMs: sample.tMs, result });

        // Measured separately from the score, because the scored offset is
        // pulled towards expectedLagMs by design and so cannot be used to
        // check that assumption.
        const measured = measureTimingOffsetMs(scoreInput);
        if (measured !== undefined) {
          measuredLagsRef.current.push(measured);
        }
        nextSampleIndexRef.current += 1;
        scoredAny = true;
      }

      // Close any window whose samples have all been scored.
      while (nextWindowIndexRef.current < windows.length) {
        const window = windows[nextWindowIndexRef.current]!;
        const lastScored = samplesRef.current[samplesRef.current.length - 1];
        if (!lastScored || lastScored.tMs < window.endMs) {
          break;
        }

        const inWindow = samplesRef.current.filter(
          (entry) => entry.tMs >= window.startMs && entry.tMs < window.endMs,
        );
        nextWindowIndexRef.current += 1;
        if (inWindow.length === 0) {
          continue;
        }

        const score = trimmedMean(
          inWindow.map((entry) => entry.result.total),
          DEFAULT_GRADING_CONFIG.trimFraction,
        );
        const grade = gradeForScore(score);
        comboRef.current = grade === "miss" ? 0 : comboRef.current + 1;
        const multiplier = Math.min(
          1 + comboRef.current * DEFAULT_GRADING_CONFIG.comboStep,
          DEFAULT_GRADING_CONFIG.comboCap,
        );

        const parts = inWindow.reduce(
          (acc, entry) => {
            for (const key of Object.keys(acc) as (keyof typeof acc)[]) {
              acc[key] += entry.result.parts[key] / inWindow.length;
            }
            return acc;
          },
          { leftArm: 0, rightArm: 0, leftLeg: 0, rightLeg: 0, torso: 0, motion: 0 },
        );

        eventsRef.current = [
          ...eventsRef.current,
          {
            windowIndex: nextWindowIndexRef.current - 1,
            startMs: window.startMs,
            endMs: window.endMs,
            score,
            grade,
            combo: comboRef.current,
            points: DEFAULT_GRADING_CONFIG.gradePoints[grade] * multiplier,
            parts,
          },
        ];
        setEvents(eventsRef.current);
      }

      if (scoredAny) {
        setSamples([...samplesRef.current]);
        setMeasuredLags([...measuredLagsRef.current]);
        // Live score for the window in progress, so the number moves while
        // the player dances rather than only once a second.
        const currentWindowStart =
          Math.floor(gameTimeMs / DEFAULT_GRADING_CONFIG.gradeWindowMs) *
          DEFAULT_GRADING_CONFIG.gradeWindowMs;
        const pending = samplesRef.current.filter((entry) => entry.tMs >= currentWindowStart);
        if (pending.length > 0) {
          setLiveScore(
            trimmedMean(
              pending.map((entry) => entry.result.total),
              DEFAULT_GRADING_CONFIG.trimFraction,
            ),
          );
        }
      }

      if (video.ended || nextSampleIndexRef.current >= frames.length) {
        cancelled = true;
        setPhase("finished");
      }
    };

    rafHandle = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafHandle);
    };
  }, [phase, choreography, video, frameRef, referenceHistory, windows, scoringConfig]);

  const summary = useMemo(
    () => (phase === "finished" ? summarizePerformance(events, samples) : undefined),
    [phase, events, samples],
  );

  const latestGrade = events[events.length - 1];
  const score = useMemo(
    () => Math.round(events.reduce((total, event) => total + event.points, 0)),
    [events],
  );
  const maxCombo = useMemo(
    () => events.reduce((best, event) => Math.max(best, event.combo), 0),
    [events],
  );

  return {
    phase,
    countdown,
    score,
    combo: latestGrade?.combo ?? 0,
    maxCombo,
    latestGrade,
    liveScore,
    events,
    samples,
    measuredLags,
    start,
    pause,
    resume,
    restart,
    summary,
  };
}
