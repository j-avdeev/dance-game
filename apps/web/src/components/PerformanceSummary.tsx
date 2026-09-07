import type { ScoreParts } from "@dance-game/core";
import type { summarizePerformance } from "@dance-game/core";

const PART_LABEL: Record<keyof ScoreParts, string> = {
  leftArm: "Left arm",
  rightArm: "Right arm",
  leftLeg: "Left leg",
  rightLeg: "Right leg",
  torso: "Torso",
  motion: "Movement",
};

export type PerformanceSummaryProps = {
  summary: ReturnType<typeof summarizePerformance>;
  onRestart: () => void;
};

/** End-of-run breakdown: total, grades and per-body-part averages. */
export function PerformanceSummaryPanel({ summary, onRestart }: PerformanceSummaryProps) {
  const parts = Object.keys(PART_LABEL) as (keyof ScoreParts)[];

  return (
    <section className="summary" data-testid="performance-summary">
      <h2>Final score</h2>
      <p className="summary__total" data-testid="summary-total">
        {summary.totalScore}
      </p>

      <dl className="stats">
        <div>
          <dt>Average</dt>
          <dd>{summary.averageScore.toFixed(0)}</dd>
        </div>
        <div>
          <dt>Best combo</dt>
          <dd>{summary.maxCombo}</dd>
        </div>
        <div>
          <dt>Perfect</dt>
          <dd>{summary.grades.perfect}</dd>
        </div>
        <div>
          <dt>Great</dt>
          <dd>{summary.grades.great}</dd>
        </div>
        <div>
          <dt>Good</dt>
          <dd>{summary.grades.good}</dd>
        </div>
        <div>
          <dt>Miss</dt>
          <dd>{summary.grades.miss}</dd>
        </div>
      </dl>

      <h3>By body part</h3>
      <ul className="breakdown">
        {parts.map((part) => (
          <li key={part}>
            <span>{PART_LABEL[part]}</span>
            <div className="breakdown__bar" aria-hidden="true">
              <div
                className="breakdown__fill"
                style={{ width: `${Math.max(0, Math.min(100, summary.parts[part]))}%` }}
              />
            </div>
            <strong>{summary.parts[part].toFixed(0)}</strong>
          </li>
        ))}
      </ul>

      <button type="button" onClick={onRestart}>
        Dance again
      </button>
    </section>
  );
}
