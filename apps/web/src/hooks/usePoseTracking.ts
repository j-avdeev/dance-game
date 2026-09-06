import { useEffect, useRef, useState } from "react";
import {
  INITIAL_FRAMING_STATE,
  updateFramingState,
  type FramingState,
  type PoseFrame,
} from "@dance-game/core";
import type { PoseProvider } from "../pose/PoseProvider.js";

/**
 * Drives the pose inference loop and exposes the latest frame plus framing.
 *
 * The frame itself is kept in a ref and mirrored into state at a throttled
 * rate: React re-rendering at inference speed would waste most of the frame
 * budget, but the canvas needs every frame, so it reads the ref directly.
 */

export type PoseTrackingStatus = "idle" | "loading" | "running" | "error";

export type PoseTrackingState = {
  status: PoseTrackingStatus;
  error: string | undefined;
  /** Smoothed inference rate, in frames per second. */
  fps: number;
  /** Rolling average inference cost, in milliseconds. */
  inferenceMs: number;
  framing: FramingState;
  /** Latest frame, updated at UI rate rather than inference rate. */
  latestFrame: PoseFrame | undefined;
};

/** How often the React-visible stats refresh. Canvas drawing is unaffected. */
const UI_UPDATE_INTERVAL_MS = 200;

export function usePoseTracking(
  provider: PoseProvider | undefined,
  video: HTMLVideoElement | null,
  enabled: boolean,
  onFrame?: (frame: PoseFrame) => void,
): PoseTrackingState & { frameRef: React.RefObject<PoseFrame | undefined> } {
  const [state, setState] = useState<PoseTrackingState>({
    status: "idle",
    error: undefined,
    fps: 0,
    inferenceMs: 0,
    framing: INITIAL_FRAMING_STATE,
    latestFrame: undefined,
  });

  const frameRef = useRef<PoseFrame | undefined>(undefined);
  const framingRef = useRef<FramingState>(INITIAL_FRAMING_STATE);
  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;

  useEffect(() => {
    if (!provider || !video || !enabled) {
      return;
    }

    let cancelled = false;
    let rafHandle = 0;
    let lastUiUpdateMs = 0;
    let smoothedFps = 0;
    let smoothedInferenceMs = 0;
    let lastFrameAtMs: number | undefined;

    const loop = (nowMs: number): void => {
      if (cancelled) {
        return;
      }
      rafHandle = requestAnimationFrame(loop);

      let frame: PoseFrame | undefined;
      try {
        frame = provider.detect(video, nowMs);
      } catch (error) {
        cancelled = true;
        setState((previous) => ({
          ...previous,
          status: "error",
          error: error instanceof Error ? error.message : "Pose detection failed.",
        }));
        return;
      }

      if (!frame) {
        return;
      }

      frameRef.current = frame;
      framingRef.current = updateFramingState(framingRef.current, frame, nowMs);
      onFrameRef.current?.(frame);

      if (lastFrameAtMs !== undefined) {
        const deltaMs = nowMs - lastFrameAtMs;
        if (deltaMs > 0) {
          const instantFps = 1000 / deltaMs;
          // Exponential smoothing; a raw per-frame value is unreadable.
          smoothedFps = smoothedFps === 0 ? instantFps : smoothedFps * 0.9 + instantFps * 0.1;
        }
      }
      lastFrameAtMs = nowMs;
      smoothedInferenceMs =
        smoothedInferenceMs === 0
          ? frame.inferenceMs
          : smoothedInferenceMs * 0.9 + frame.inferenceMs * 0.1;

      if (nowMs - lastUiUpdateMs >= UI_UPDATE_INTERVAL_MS) {
        lastUiUpdateMs = nowMs;
        setState((previous) => ({
          ...previous,
          status: "running",
          error: undefined,
          fps: smoothedFps,
          inferenceMs: smoothedInferenceMs,
          framing: framingRef.current,
          latestFrame: frameRef.current,
        }));
      }
    };

    setState((previous) => ({ ...previous, status: "running", error: undefined }));
    rafHandle = requestAnimationFrame(loop);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafHandle);
      framingRef.current = INITIAL_FRAMING_STATE;
      setState((previous) => ({ ...previous, status: "idle", fps: 0 }));
    };
  }, [provider, video, enabled]);

  return { ...state, frameRef };
}
