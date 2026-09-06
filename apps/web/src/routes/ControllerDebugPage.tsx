import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PoseLandmarkIndex } from "@dance-game/core";
import { useCamera } from "../hooks/useCamera.js";
import { useWakeLock } from "../hooks/useWakeLock.js";
import { usePoseTracking } from "../hooks/usePoseTracking.js";
import { MediaPipePoseProvider } from "../pose/MediaPipePoseProvider.js";
import { MockPoseProvider } from "../pose/MockPoseProvider.js";
import type { PoseProvider } from "../pose/PoseProvider.js";
import { CameraPreview } from "../components/CameraPreview.js";
import { SkeletonOverlay } from "../components/SkeletonOverlay.js";
import { FramingStatusBadge } from "../components/FramingStatusBadge.js";

/**
 * Pose development view: camera, skeleton, FPS and framing, without pairing.
 *
 * `?mock=1` swaps MediaPipe for the deterministic mock provider, which is how
 * end-to-end tests exercise this page without a camera, a model or a GPU.
 */

const PREVIEW_WIDTH = 320;
const PREVIEW_HEIGHT = 569; // 9:16, matching the requested camera constraints.

export function ControllerDebugPage() {
  const [searchParams] = useSearchParams();
  const useMock = searchParams.get("mock") === "1";

  const videoRef = useRef<HTMLVideoElement>(null);
  const camera = useCamera();
  const [provider, setProvider] = useState<PoseProvider | undefined>(undefined);
  const [providerError, setProviderError] = useState<string | undefined>(undefined);
  const [initializing, setInitializing] = useState(false);

  // The mock needs no camera, so tracking can start immediately.
  const cameraReady = useMock || camera.status === "ready";
  const tracking = provider !== undefined && cameraReady;
  const wakeLock = useWakeLock(tracking);

  const pose = usePoseTracking(provider, videoRef.current, tracking);

  useEffect(() => {
    let disposed = false;
    let created: PoseProvider | undefined;

    async function initialize(): Promise<void> {
      setInitializing(true);
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
      } finally {
        if (!disposed) {
          setInitializing(false);
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

  const handleStart = useCallback(() => {
    void camera.start();
  }, [camera]);

  // Any failed start offers a retry, not just the errors we can name. Browsers
  // disagree on which DOMException they throw, and headless Chrome reports a
  // plain "Not supported", which must not leave the page with no way forward.
  const cameraFailed =
    camera.status === "denied" || camera.status === "unavailable" || camera.status === "error";

  const activeDelegate =
    provider instanceof MediaPipePoseProvider ? provider.activeDelegate : undefined;

  const visibleLandmarks = useMemo(() => {
    const frame = pose.latestFrame;
    if (!frame) {
      return 0;
    }
    return frame.landmarks.filter((landmark) => landmark.visibility >= 0.5).length;
  }, [pose.latestFrame]);

  const ankleVisibility = useMemo(() => {
    const frame = pose.latestFrame;
    const left = frame?.landmarks[PoseLandmarkIndex.leftAnkle]?.visibility ?? 0;
    const right = frame?.landmarks[PoseLandmarkIndex.rightAnkle]?.visibility ?? 0;
    return Math.min(left, right);
  }, [pose.latestFrame]);

  return (
    <main className="page">
      <h1>Controller debug</h1>
      <p>
        Local pose development without pairing. The camera stream never leaves this device.
        {useMock ? " Running the mock pose provider." : null}
      </p>

      {providerError ? <p className="alert alert--error">{providerError}</p> : null}
      {camera.error ? <p className="alert alert--error">{camera.error}</p> : null}
      {initializing ? <p className="alert">Loading the pose model…</p> : null}

      {!useMock && camera.status !== "ready" ? (
        <button type="button" onClick={handleStart} disabled={camera.status === "requesting"}>
          {cameraFailed
            ? "Try again"
            : camera.status === "requesting"
              ? "Requesting camera…"
              : "Enable camera"}
        </button>
      ) : null}

      <div className="preview" style={{ width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT }}>
        <CameraPreview
          videoRef={videoRef}
          stream={camera.stream}
          width={PREVIEW_WIDTH}
          height={PREVIEW_HEIGHT}
        />
        <SkeletonOverlay
          frameRef={pose.frameRef}
          width={PREVIEW_WIDTH}
          height={PREVIEW_HEIGHT}
          mirrored
          className="preview__overlay"
        />
      </div>

      <FramingStatusBadge framing={pose.framing} />

      <dl className="stats" data-testid="pose-stats">
        <div>
          <dt>Inference FPS</dt>
          <dd data-testid="stat-fps">{pose.fps.toFixed(1)}</dd>
        </div>
        <div>
          <dt>Inference time</dt>
          <dd>{pose.inferenceMs.toFixed(1)} ms</dd>
        </div>
        <div>
          <dt>Visible landmarks</dt>
          <dd data-testid="stat-visible">{visibleLandmarks} / 33</dd>
        </div>
        <div>
          <dt>Ankle visibility</dt>
          <dd>{ankleVisibility.toFixed(2)}</dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd>
            {pose.latestFrame
              ? `${pose.latestFrame.imageWidth}×${pose.latestFrame.imageHeight}`
              : "—"}
          </dd>
        </div>
        <div>
          <dt>Delegate</dt>
          <dd>{useMock ? "mock" : (activeDelegate ?? "—")}</dd>
        </div>
        <div>
          <dt>Screen wake lock</dt>
          <dd data-testid="stat-wakelock">
            {!wakeLock.supported ? "unsupported" : wakeLock.active ? "held" : "released"}
          </dd>
        </div>
      </dl>
    </main>
  );
}
