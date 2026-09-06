import { describeFramingIssue, type FramingState } from "@dance-game/core";

const STATUS_LABEL: Record<FramingState["status"], string> = {
  ok: "Full body visible",
  waiting: "Checking framing",
  lost: "Tracking lost",
  "no-person": "No one in frame",
};

export function FramingStatusBadge({ framing }: { framing: FramingState }) {
  const hint = describeFramingIssue(framing.issues);
  return (
    <div className={`framing framing--${framing.status}`}>
      <strong>{STATUS_LABEL[framing.status]}</strong>
      {hint ? <span>{hint}</span> : null}
    </div>
  );
}
