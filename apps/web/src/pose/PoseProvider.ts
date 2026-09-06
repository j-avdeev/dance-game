import type { PoseFrame } from "@dance-game/core";

/**
 * A source of pose frames.
 *
 * MediaPipe sits behind this interface so the debug page, the game and the
 * tests can all run against a mock, and so a different engine could be
 * benchmarked later without touching callers (PLAN.md, M6).
 */
export interface PoseProvider {
  /** Loads models and prepares inference. Safe to call once. */
  initialize(): Promise<void>;
  /**
   * Runs inference on the current video frame.
   *
   * Returns undefined when the frame has not advanced since the last call, so
   * the caller can skip redundant work in a requestAnimationFrame loop.
   */
  detect(video: HTMLVideoElement, nowMs: number): PoseFrame | undefined;
  /** Releases models and native resources. */
  close(): void;
}

/** How much of the newest frame to keep when smoothing landmarks. */
export const DEFAULT_SMOOTHING_ALPHA = 0.6;
