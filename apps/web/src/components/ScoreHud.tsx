import type { GradeEvent } from "@dance-game/core";

const GRADE_LABEL: Record<GradeEvent["grade"], string> = {
  perfect: "Perfect",
  great: "Great",
  good: "Good",
  miss: "Miss",
};

export type ScoreHudProps = {
  score: number;
  combo: number;
  latestGrade: GradeEvent | undefined;
  liveScore: number;
};

/** Live score, combo and the most recent grade. */
export function ScoreHud({ score, combo, latestGrade, liveScore }: ScoreHudProps) {
  return (
    <div className="hud">
      <div className="hud__score">
        <span className="hud__label">Score</span>
        <strong data-testid="hud-score">{score}</strong>
      </div>

      {latestGrade ? (
        // Keyed by window so React remounts it, replaying the flash animation
        // on every grade rather than only the first.
        <div
          key={latestGrade.windowIndex}
          className={`hud__grade hud__grade--${latestGrade.grade}`}
          data-testid="hud-grade"
        >
          {GRADE_LABEL[latestGrade.grade]}
        </div>
      ) : null}

      {combo > 1 ? (
        <div className="hud__combo" data-testid="hud-combo">
          {combo}× combo
        </div>
      ) : null}

      <div className="hud__meter" aria-hidden="true">
        <div
          className="hud__meter-fill"
          style={{ width: `${Math.max(0, Math.min(100, liveScore))}%` }}
        />
      </div>
    </div>
  );
}
