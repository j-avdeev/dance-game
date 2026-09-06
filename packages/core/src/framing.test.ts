import { describe, expect, it } from "vitest";
import {
  INITIAL_FRAMING_STATE,
  describeFramingIssue,
  evaluateFrameVisibility,
  updateFramingState,
  type FramingState,
} from "./framing.js";
import { DEFAULT_FRAMING_CONFIG } from "./config.js";
import { PoseLandmarkIndex, POSE_LANDMARK_COUNT } from "./landmarks.js";
import type { Landmark, PoseFrame } from "./types.js";

function frameWith(landmarks: Landmark[]): PoseFrame {
  return {
    seq: 0,
    capturedAtMs: 0,
    inferenceMs: 10,
    imageWidth: 720,
    imageHeight: 1280,
    landmarks,
  };
}

/** A well-framed body: everything visible, shoulders and ankles well apart. */
function goodBody(): Landmark[] {
  const landmarks: Landmark[] = Array.from({ length: POSE_LANDMARK_COUNT }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0,
    visibility: 0.9,
  }));
  landmarks[PoseLandmarkIndex.leftShoulder] = { x: 0.4, y: 0.3, z: 0, visibility: 0.9 };
  landmarks[PoseLandmarkIndex.rightShoulder] = { x: 0.6, y: 0.3, z: 0, visibility: 0.9 };
  landmarks[PoseLandmarkIndex.leftAnkle] = { x: 0.45, y: 0.9, z: 0, visibility: 0.9 };
  landmarks[PoseLandmarkIndex.rightAnkle] = { x: 0.55, y: 0.9, z: 0, visibility: 0.9 };
  return landmarks;
}

const emptyFrame = frameWith([]);

describe("evaluateFrameVisibility", () => {
  it("accepts a fully visible body", () => {
    expect(evaluateFrameVisibility(frameWith(goodBody()))).toEqual({ satisfied: true, issues: [] });
  });

  it("reports no-person for an empty landmark array", () => {
    const result = evaluateFrameVisibility(emptyFrame);
    expect(result.satisfied).toBe(false);
    expect(result.issues).toEqual(["no-person"]);
  });

  it("rejects a body whose ankles are not confidently visible", () => {
    const landmarks = goodBody();
    landmarks[PoseLandmarkIndex.leftAnkle] = { x: 0.45, y: 0.9, z: 0, visibility: 0.2 };
    const result = evaluateFrameVisibility(frameWith(landmarks));
    expect(result.satisfied).toBe(false);
    expect(result.issues).toContain("body-not-fully-visible");
  });

  it("flags a body that fills the frame as too close", () => {
    const landmarks = goodBody();
    landmarks[PoseLandmarkIndex.leftShoulder] = { x: 0.4, y: 0.01, z: 0, visibility: 0.9 };
    landmarks[PoseLandmarkIndex.rightShoulder] = { x: 0.6, y: 0.01, z: 0, visibility: 0.9 };
    landmarks[PoseLandmarkIndex.leftAnkle] = { x: 0.45, y: 0.99, z: 0, visibility: 0.9 };
    landmarks[PoseLandmarkIndex.rightAnkle] = { x: 0.55, y: 0.99, z: 0, visibility: 0.9 };
    expect(evaluateFrameVisibility(frameWith(landmarks)).issues).toContain("too-close");
  });

  it("does not throw when landmarks are truncated", () => {
    // Defensive: a malformed frame must degrade, never crash the render loop.
    expect(() =>
      evaluateFrameVisibility(frameWith([{ x: 0, y: 0, z: 0, visibility: 1 }])),
    ).not.toThrow();
  });
});

describe("updateFramingState", () => {
  const good = frameWith(goodBody());

  function advance(
    state: FramingState,
    frame: PoseFrame,
    times: number,
    startMs = 0,
  ): FramingState {
    let next = state;
    for (let i = 0; i < times; i++) {
      next = updateFramingState(next, frame, startMs + i * 33);
    }
    return next;
  }

  it("waits for the required streak before reporting ok", () => {
    const almost = advance(
      INITIAL_FRAMING_STATE,
      good,
      DEFAULT_FRAMING_CONFIG.requiredConsecutiveFrames - 1,
    );
    expect(almost.status).toBe("waiting");

    const settled = updateFramingState(almost, good, 1000);
    expect(settled.status).toBe("ok");
  });

  it("tolerates a single dropped frame without going lost", () => {
    // One noisy frame is normal; pausing the game for it would be unusable.
    const settled = advance(INITIAL_FRAMING_STATE, good, 10);
    const blip = updateFramingState(settled, emptyFrame, 400);
    expect(blip.status).toBe("waiting");
  });

  it("reports lost once the person is gone for longer than the grace period", () => {
    const settled = advance(INITIAL_FRAMING_STATE, good, 10);
    const lastGood = settled.lastGoodAtMs ?? 0;
    const gone = updateFramingState(
      settled,
      emptyFrame,
      lastGood + DEFAULT_FRAMING_CONFIG.lostAfterMs,
    );
    expect(gone.status).toBe("no-person");
  });

  it("requires the full streak again after recovering", () => {
    const settled = advance(INITIAL_FRAMING_STATE, good, 10);
    const dropped = updateFramingState(settled, emptyFrame, 500);
    expect(dropped.goodFrameStreak).toBe(0);

    const recovering = updateFramingState(dropped, good, 533);
    expect(recovering.status).toBe("waiting");
  });

  it("reports no-person from the very first frame when nobody is there", () => {
    expect(updateFramingState(INITIAL_FRAMING_STATE, emptyFrame, 0).status).toBe("no-person");
  });
});

describe("describeFramingIssue", () => {
  it("prioritises no-person over other issues", () => {
    expect(describeFramingIssue(["too-close", "no-person"])).toMatch(/No one detected/);
  });

  it("returns undefined when there is nothing to fix", () => {
    expect(describeFramingIssue([])).toBeUndefined();
  });
});
