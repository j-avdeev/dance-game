import { useCallback, useEffect, useRef, useState } from "react";
import { getChoreographyDurationMs, parseChoreography, type Choreography } from "@dance-game/core";
import {
  ExtractionAbortedError,
  extractChoreography,
  type ExtractionProgress,
} from "../pose/extractChoreography.js";
import { ChoreographyPreview } from "../components/ChoreographyPreview.js";

/**
 * Turns a self-owned local video into a reference pose timeline.
 *
 * The video is read with an object URL and never uploaded: extraction runs
 * entirely in this tab (PLAN.md, "No server-side video processing for MVP").
 */

const PREVIEW_WIDTH = 480;

type ToolStatus = "idle" | "ready" | "extracting" | "done" | "error";

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "choreography"
  );
}

export function ChoreographyToolPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const objectUrlRef = useRef<string | undefined>(undefined);
  const abortRef = useRef<AbortController | undefined>(undefined);

  const [status, setStatus] = useState<ToolStatus>("idle");
  const [error, setError] = useState<string | undefined>(undefined);
  const [fileName, setFileName] = useState<string | undefined>(undefined);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [videoSize, setVideoSize] = useState<{ width: number; height: number } | undefined>(
    undefined,
  );

  const [title, setTitle] = useState("");
  const [mirrored, setMirrored] = useState(true);
  const [sampleRateHz, setSampleRateHz] = useState(10);
  const [trimStartSeconds, setTrimStartSeconds] = useState(0);
  const [trimEndSeconds, setTrimEndSeconds] = useState(0);

  const [progress, setProgress] = useState<ExtractionProgress | undefined>(undefined);
  const [choreography, setChoreography] = useState<Choreography | undefined>(undefined);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, []);

  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
    }
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;

    setChoreography(undefined);
    setProgress(undefined);
    setError(undefined);
    setFileName(file.name);
    setTitle((current) => current || file.name.replace(/\.[^.]+$/, ""));

    const video = videoRef.current;
    if (video) {
      video.src = url;
      video.load();
    }
  }, []);

  const handleMetadata = useCallback(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    setDurationSeconds(video.duration);
    setTrimStartSeconds(0);
    setTrimEndSeconds(video.duration);
    setVideoSize({ width: video.videoWidth, height: video.videoHeight });
    setStatus("ready");
  }, []);

  const handleExtract = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !fileName) {
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setStatus("extracting");
    setError(undefined);
    setChoreography(undefined);
    setProgress(undefined);

    // Playback would fight the extractor for control of currentTime.
    const wasPaused = video.paused;
    video.pause();

    try {
      const result = await extractChoreography({
        video,
        id: slugify(fileName),
        title: title || fileName,
        videoPath: `content/demo/${fileName}`,
        mirrored,
        sampleRateHz,
        trimStartSeconds,
        trimEndSeconds,
        onProgress: setProgress,
        signal: controller.signal,
      });

      // Validate our own output before offering it for download: a file that
      // fails to load later is far more confusing than one that fails now.
      setChoreography(parseChoreography(result));
      setStatus("done");
    } catch (caught) {
      if (caught instanceof ExtractionAbortedError) {
        setStatus("ready");
        return;
      }
      setError(caught instanceof Error ? caught.message : "Extraction failed.");
      setStatus("error");
    } finally {
      abortRef.current = undefined;
      if (!wasPaused) {
        void video.play().catch(() => undefined);
      }
    }
  }, [fileName, title, mirrored, sampleRateHz, trimStartSeconds, trimEndSeconds]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleDownload = useCallback(() => {
    if (!choreography) {
      return;
    }
    const blob = new Blob([JSON.stringify(choreography, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${choreography.id}.choreography.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [choreography]);

  const previewHeight = videoSize
    ? Math.round((PREVIEW_WIDTH * videoSize.height) / videoSize.width)
    : 270;

  const missedRatio =
    progress && progress.completedSamples > 0
      ? progress.missedSamples / progress.completedSamples
      : 0;

  return (
    <main className="page page--wide">
      <h1>Choreography extractor</h1>
      <p>
        Select a self-recorded video and extract a reference pose timeline. The video is read
        locally and never uploaded.
      </p>

      <input
        type="file"
        accept="video/*"
        onChange={handleFileChange}
        aria-label="Reference video"
        data-testid="video-input"
      />

      {error ? <p className="alert alert--error">{error}</p> : null}

      <div className="preview" style={{ width: PREVIEW_WIDTH, height: previewHeight }}>
        <video
          ref={videoRef}
          onLoadedMetadata={handleMetadata}
          controls
          playsInline
          muted
          width={PREVIEW_WIDTH}
          height={previewHeight}
          style={{ width: PREVIEW_WIDTH, height: previewHeight, objectFit: "contain" }}
        />
        {choreography ? (
          <ChoreographyPreview
            choreography={choreography}
            video={videoRef.current}
            trimStartSeconds={trimStartSeconds}
            width={PREVIEW_WIDTH}
            height={previewHeight}
          />
        ) : null}
      </div>

      {status !== "idle" ? (
        <fieldset className="field-grid" disabled={status === "extracting"}>
          <legend>Choreography</legend>

          <label>
            <span>Title</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>

          <label>
            <span>Sample rate (Hz)</span>
            <input
              type="number"
              min={1}
              max={30}
              value={sampleRateHz}
              onChange={(event) => setSampleRateHz(Number(event.target.value))}
            />
          </label>

          <label>
            <span>Trim start (s)</span>
            <input
              type="number"
              min={0}
              max={durationSeconds}
              step={0.1}
              value={trimStartSeconds}
              onChange={(event) => setTrimStartSeconds(Number(event.target.value))}
            />
          </label>

          <label>
            <span>Trim end (s)</span>
            <input
              type="number"
              min={0}
              max={durationSeconds}
              step={0.1}
              value={trimEndSeconds}
              onChange={(event) => setTrimEndSeconds(Number(event.target.value))}
            />
          </label>

          <label className="field-grid__checkbox">
            <input
              type="checkbox"
              checked={mirrored}
              onChange={(event) => setMirrored(event.target.checked)}
            />
            <span>
              Mirrored: the dancer faces the camera and the player mirrors them. Leave this on
              unless the reference was filmed from behind.
            </span>
          </label>
        </fieldset>
      ) : null}

      {status === "ready" || status === "done" || status === "error" ? (
        <button type="button" onClick={() => void handleExtract()} disabled={!fileName}>
          {status === "done" ? "Extract again" : "Extract poses"}
        </button>
      ) : null}

      {status === "extracting" ? (
        <>
          <p className="alert" data-testid="extraction-progress">
            Extracting {progress ? `${progress.completedSamples} / ${progress.totalSamples}` : "…"}
            {progress && progress.missedSamples > 0
              ? ` · ${progress.missedSamples} samples with no dancer`
              : null}
          </p>
          <button type="button" onClick={handleCancel}>
            Cancel
          </button>
        </>
      ) : null}

      {choreography ? (
        <>
          <dl className="stats" data-testid="choreography-stats">
            <div>
              <dt>Samples</dt>
              <dd data-testid="stat-samples">{choreography.frames.length}</dd>
            </div>
            <div>
              <dt>Duration</dt>
              <dd>{(getChoreographyDurationMs(choreography) / 1000).toFixed(1)} s</dd>
            </div>
            <div>
              <dt>Source</dt>
              <dd>
                {choreography.imageWidth}&times;{choreography.imageHeight}
              </dd>
            </div>
            <div>
              <dt>Missed samples</dt>
              <dd>{progress?.missedSamples ?? 0}</dd>
            </div>
          </dl>

          {missedRatio > 0.05 ? (
            <p className="alert alert--error">
              The dancer was not detected in {(missedRatio * 100).toFixed(0)}% of samples. Check
              framing and lighting before using this choreography.
            </p>
          ) : null}

          <p>Play the video above: the green skeleton should track the dancer.</p>

          <button type="button" onClick={handleDownload}>
            Download choreography JSON
          </button>
        </>
      ) : null}
    </main>
  );
}
