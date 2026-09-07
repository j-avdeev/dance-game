import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { DEFAULT_SCORING_CONFIG } from "@dance-game/core";
import { useCamera } from "../hooks/useCamera.js";
import { useWakeLock } from "../hooks/useWakeLock.js";
import { usePoseTracking } from "../hooks/usePoseTracking.js";
import { MediaPipePoseProvider } from "../pose/MediaPipePoseProvider.js";
import { MockPoseProvider } from "../pose/MockPoseProvider.js";
import type { PoseProvider } from "../pose/PoseProvider.js";
import { useChoreography } from "../game/useChoreography.js";
import { useDanceGame } from "../game/useDanceGame.js";
import { buildDebugReport } from "../game/debugReport.js";
import { CameraPreview } from "../components/CameraPreview.js";
import { SkeletonOverlay } from "../components/SkeletonOverlay.js";
import { FramingStatusBadge } from "../components/FramingStatusBadge.js";
import { ScoreHud } from "../components/ScoreHud.js";
import { PerformanceSummaryPanel } from "../components/PerformanceSummary.js";
import { ScoringDebugPanel } from "../components/ScoringDebugPanel.js";

/**
 * Single-device game: reference video plus the local camera as pose source.
 *
 * This is prototype P1, the first version other people can use. The pose
 * source is local, so M5 changes only where poses come from, not how the game
 * works.
 *
 * `?mock=1` runs the deterministic pose provider, which is how the end-to-end
 * tests drive a whole run without a camera.
 * `?debug=1` opens the tuning panel.
 */

const CHOREOGRAPHY_URL = "/content/demo/choreography.json";
const VIDEO_URL = "/content/demo/demo.mp4";
const CAMERA_WIDTH = 240;
const CAMERA_HEIGHT = 427;

export function PlayPage() {
  const [searchParams] = useSearchParams();
  const useMock = searchParams.get("mock") === "1";
  const showDebug = searchParams.get("debug") === "1";

  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);

  const camera = useCamera();
  const { choreography, error: choreographyError, loading } = useChoreography(CHOREOGRAPHY_URL);

  const [provider, setProvider] = useState<PoseProvider | undefined>(undefined);
  const [providerError, setProviderError] = useState<string | undefined>(undefined);
  const [latencyOffsetMs, setLatencyOffsetMs] = useState(0);

  const cameraReady = useMock || camera.status === "ready";
  const trackingEnabled = provider !== undefined && cameraReady;
  useWakeLock(trackingEnabled);

  const pose = usePoseTracking(provider, cameraVideoRef.current, trackingEnabled);

  // The calibration slider shifts the assumed lag without touching anything
  // else, so a tester can find their own value during a run.
  const scoringConfig = useMemo(
    () => ({
      ...DEFAULT_SCORING_CONFIG,
      expectedLagMs: DEFAULT_SCORING_CONFIG.expectedLagMs + latencyOffsetMs,
    }),
    [latencyOffsetMs],
  );

  const game = useDanceGame({
    choreography,
    video: videoElement,
    frameRef: pose.frameRef,
    scoringConfig,
  });

  useEffect(() => {
    let disposed = false;
    let created: PoseProvider | undefined;

    async function initialize(): Promise<void> {
      setProviderError(undefined);
      try {
        created = useMock ? new MockPoseProvider() : new MediaPipePoseProvider();
        await created.initialize();
        if (disposed) {
          created.close();
          return;
        }
        setProvider(created);
      } catch (error) {
        if (!disposed) {
          setProviderError(
            error instanceof Error
              ? `Could not load the pose model: ${error.message}`
              : "Could not load the pose model.",
          );
        }
      }
    }

    void initialize();
    return () => {
      disposed = true;
      created?.close();
      setProvider(undefined);
    };
  }, [useMock]);

  const handleCopyReport = useCallback(
    () =>
      buildDebugReport({
        choreographyId: choreography?.id ?? "unknown",
        samples: game.samples,
        events: game.events,
        measuredLags: game.measuredLags,
        fps: pose.fps,
        inferenceMs: pose.inferenceMs,
        expectedLagMs: DEFAULT_SCORING_CONFIG.expectedLagMs,
        latencyOffsetMs,
      }),
    [
      choreography,
      game.samples,
      game.events,
      game.measuredLags,
      pose.fps,
      pose.inferenceMs,
      latencyOffsetMs,
    ],
  );

  const canStart = choreography !== undefined && trackingEnabled;

  return (
    <main className="page page--wide">
      <h1>Dance</h1>

      {loading ? <p className="alert">Loading the choreography…</p> : null}
      {choreographyError ? <p className="alert alert--error">{choreographyError}</p> : null}
      {providerError ? <p className="alert alert--error">{providerError}</p> : null}
      {camera.error ? <p className="alert alert--error">{camera.error}</p> : null}

      {!useMock && camera.status !== "ready" ? (
        <button
          type="button"
          onClick={() => void camera.start()}
          disabled={camera.status === "requesting"}
        >
          {camera.status === "requesting" ? "Requesting camera…" : "Enable camera"}
        </button>
      ) : null}

      <div className="stage">
        <div className="stage__video">
          <video
            ref={(element) => {
              videoRef.current = element;
              setVideoElement(element);
            }}
            src={VIDEO_URL}
            playsInline
            muted
            preload="auto"
            className="stage__reference"
            data-testid="reference-video"
          />

          {game.phase === "countdown" ? (
            <div className="countdown" data-testid="countdown">
              {game.countdown > 0 ? game.countdown : "Go"}
            </div>
          ) : null}

          {game.phase === "playing" || game.phase === "paused" ? (
            <ScoreHud
              score={game.score}
              combo={game.combo}
              latestGrade={game.latestGrade}
              liveScore={game.liveScore}
            />
          ) : null}
        </div>

        <div className="stage__camera">
          <div className="preview" style={{ width: CAMERA_WIDTH, height: CAMERA_HEIGHT }}>
            <CameraPreview
              videoRef={cameraVideoRef}
              stream={camera.stream}
              width={CAMERA_WIDTH}
              height={CAMERA_HEIGHT}
            />
            <SkeletonOverlay
              frameRef={pose.frameRef}
              width={CAMERA_WIDTH}
              height={CAMERA_HEIGHT}
              mirrored
              className="preview__overlay"
            />
          </div>
          <FramingStatusBadge framing={pose.framing} />
        </div>
      </div>

      <div className="controls">
        {game.phase === "idle" || game.phase === "finished" ? (
          <button type="button" onClick={game.start} disabled={!canStart} data-testid="start">
            {game.phase === "finished" ? "Dance again" : "Start"}
          </button>
        ) : null}

        {game.phase === "playing" ? (
          <button type="button" onClick={game.pause}>
            Pause
          </button>
        ) : null}

        {game.phase === "paused" ? (
          <button type="button" onClick={game.resume}>
            Resume
          </button>
        ) : null}

        {game.phase !== "idle" ? (
          <button type="button" onClick={game.restart} data-testid="restart">
            Restart
          </button>
        ) : null}
      </div>

      {game.summary ? (
        <PerformanceSummaryPanel summary={game.summary} onRestart={game.restart} />
      ) : null}

      {showDebug ? (
        <ScoringDebugPanel
          samples={game.samples}
          measuredLags={game.measuredLags}
          config={DEFAULT_SCORING_CONFIG}
          latencyOffsetMs={latencyOffsetMs}
          onLatencyOffsetChange={setLatencyOffsetMs}
          fps={pose.fps}
          inferenceMs={pose.inferenceMs}
          framing={pose.framing}
          onCopyReport={handleCopyReport}
        />
      ) : null}
    </main>
  );
}
