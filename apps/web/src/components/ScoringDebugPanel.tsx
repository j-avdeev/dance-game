import { useCallback, useState } from "react";
import type { FramingState, ScoringConfig } from "@dance-game/core";
import type { ScoredSample } from "@dance-game/core";
import {
  buildLagHistogram,
  meanTimingOffsetMs,
  medianTimingOffsetMs,
} from "../game/debugReport.js";

/**
 * Tuning surface for the scoring model.
 *
 * The plan treats this as core infrastructure, not a nicety: `expectedLagMs`
 * is a guess until it is measured with real people, and this panel is how that
 * measurement is taken.
 */

export type ScoringDebugPanelProps = {
  samples: readonly ScoredSample[];
  /** Unbiased lag estimates, one per scored sample. */
  measuredLags: readonly number[];
  config: ScoringConfig;
  latencyOffsetMs: number;
  onLatencyOffsetChange: (value: number) => void;
  fps: number;
  inferenceMs: number;
  framing: FramingState;
  onCopyReport: () => string;
};

export function ScoringDebugPanel({
  samples,
  measuredLags,
  config,
  latencyOffsetMs,
  onLatencyOffsetChange,
  fps,
  inferenceMs,
  framing,
  onCopyReport,
}: ScoringDebugPanelProps) {
  const [copied, setCopied] = useState(false);

  const histogram = buildLagHistogram(measuredLags);
  const maxCount = histogram.reduce((best, bucket) => Math.max(best, bucket.count), 0);
  const scored = samples.filter((sample) => sample.result.total > 0);

  const handleCopy = useCallback(() => {
    const report = onCopyReport();
    // The clipboard API needs a secure context and permission; falling back
    // keeps the report reachable when it is unavailable.
    void navigator.clipboard
      ?.writeText(report)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        console.warn("[debug] clipboard unavailable; report follows");
        console.warn(report);
        setCopied(false);
      });
  }, [onCopyReport]);

  return (
    <aside className="debug" data-testid="debug-panel">
      <h2>Scoring debug</h2>

      <dl className="stats">
        <div>
          <dt>Inference</dt>
          <dd>{fps.toFixed(1)} fps</dd>
        </div>
        <div>
          <dt>Frame cost</dt>
          <dd>{inferenceMs.toFixed(1)} ms</dd>
        </div>
        <div>
          <dt>Framing</dt>
          <dd>{framing.status}</dd>
        </div>
        <div>
          <dt>Scored</dt>
          <dd data-testid="debug-scored">
            {scored.length} / {samples.length}
          </dd>
        </div>
        <div>
          <dt>Mean lag</dt>
          <dd data-testid="debug-mean-lag">{meanTimingOffsetMs(measuredLags).toFixed(0)} ms</dd>
        </div>
        <div>
          <dt>Median lag</dt>
          <dd data-testid="debug-median-lag">{medianTimingOffsetMs(measuredLags).toFixed(0)} ms</dd>
        </div>
      </dl>

      <label className="debug__slider">
        <span>
          Latency calibration: {latencyOffsetMs >= 0 ? "+" : ""}
          {latencyOffsetMs} ms (expected lag {config.expectedLagMs + latencyOffsetMs} ms)
        </span>
        <input
          type="range"
          min={-200}
          max={400}
          step={10}
          value={latencyOffsetMs}
          onChange={(event) => onLatencyOffsetChange(Number(event.target.value))}
          data-testid="latency-slider"
        />
      </label>

      <h3>Measured lag distribution</h3>
      <p className="debug__note">
        Pose match only, ignoring the timing penalty, so this measures the real lag rather than
        echoing the configured one. Slow movement makes it vaguer.
      </p>
      {histogram.length === 0 ? (
        <p className="debug__empty">No scored samples yet.</p>
      ) : (
        <ul className="histogram" data-testid="lag-histogram">
          {histogram.map((bucket) => (
            <li key={bucket.bucketMs}>
              <span className="histogram__label">{bucket.bucketMs} ms</span>
              <div className="histogram__bar">
                <div
                  className="histogram__fill"
                  style={{ width: `${maxCount === 0 ? 0 : (bucket.count / maxCount) * 100}%` }}
                />
              </div>
              <span className="histogram__count">{bucket.count}</span>
            </li>
          ))}
        </ul>
      )}

      <button type="button" onClick={handleCopy} data-testid="copy-report">
        {copied ? "Copied" : "Copy debug report"}
      </button>
    </aside>
  );
}
