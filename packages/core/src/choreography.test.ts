import { describe, expect, it } from "vitest";
import {
  ChoreographyValidationError,
  findFrameAtOrBefore,
  getChoreographyDurationMs,
  parseChoreography,
} from "./choreography.js";
import { POSE_LANDMARK_COUNT } from "./landmarks.js";
import type { Choreography } from "./types.js";

const landmarks = () =>
  Array.from({ length: POSE_LANDMARK_COUNT }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.9 }));

function validChoreography(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 1,
    id: "demo",
    title: "Demo dance",
    videoPath: "content/demo/demo.mp4",
    mirrored: true,
    sampleRateHz: 10,
    imageWidth: 1280,
    imageHeight: 720,
    frames: [
      { tMs: 0, landmarks: landmarks() },
      { tMs: 100, landmarks: landmarks() },
      { tMs: 200, landmarks: landmarks() },
    ],
    ...overrides,
  };
}

describe("parseChoreography", () => {
  it("accepts a well-formed choreography", () => {
    const parsed = parseChoreography(validChoreography());
    expect(parsed.id).toBe("demo");
    expect(parsed.frames).toHaveLength(3);
    expect(parsed.mirrored).toBe(true);
  });

  it("rejects an unsupported version", () => {
    // Version is the upgrade hatch; silently accepting a future file would
    // let a changed format reach the scorer unnoticed.
    expect(() => parseChoreography(validChoreography({ version: 2 }))).toThrow(
      /unsupported choreography version 2/,
    );
  });

  it("rejects frames that do not strictly increase in time", () => {
    // The lookup binary-searches, so unordered frames would return wrong poses
    // rather than failing outright.
    const broken = validChoreography({
      frames: [
        { tMs: 0, landmarks: landmarks() },
        { tMs: 200, landmarks: landmarks() },
        { tMs: 100, landmarks: landmarks() },
      ],
    });
    expect(() => parseChoreography(broken)).toThrow(/must strictly increase/);
  });

  it("rejects duplicate timestamps", () => {
    const broken = validChoreography({
      frames: [
        { tMs: 0, landmarks: landmarks() },
        { tMs: 0, landmarks: landmarks() },
      ],
    });
    expect(() => parseChoreography(broken)).toThrow(/must strictly increase/);
  });

  it("rejects a wrong landmark count", () => {
    const broken = validChoreography({
      frames: [{ tMs: 0, landmarks: [{ x: 0, y: 0, z: 0, visibility: 1 }] }],
    });
    expect(() => parseChoreography(broken)).toThrow(/expected 0 or 33 landmarks/);
  });

  it("allows an empty landmark array, meaning no dancer was detected", () => {
    const parsed = parseChoreography(
      validChoreography({
        frames: [
          { tMs: 0, landmarks: [] },
          { tMs: 100, landmarks: landmarks() },
        ],
      }),
    );
    expect(parsed.frames[0]?.landmarks).toEqual([]);
  });

  it("rejects non-finite coordinates", () => {
    const bad = landmarks();
    bad[0] = { x: Number.NaN, y: 0.5, z: 0, visibility: 1 };
    expect(() =>
      parseChoreography(validChoreography({ frames: [{ tMs: 0, landmarks: bad }] })),
    ).toThrow(/must be a finite number/);
  });

  it("rejects an empty frame list", () => {
    expect(() => parseChoreography(validChoreography({ frames: [] }))).toThrow(/must not be empty/);
  });

  it("rejects non-positive image dimensions", () => {
    expect(() => parseChoreography(validChoreography({ imageHeight: 0 }))).toThrow(
      /imageHeight must be a positive number/,
    );
  });

  it("rejects a missing title", () => {
    expect(() => parseChoreography(validChoreography({ title: "" }))).toThrow(/title/);
  });

  it("throws a typed error so callers can distinguish bad files", () => {
    expect(() => parseChoreography(null)).toThrow(ChoreographyValidationError);
  });

  it("round-trips through JSON", () => {
    const original = parseChoreography(validChoreography());
    const restored = parseChoreography(JSON.parse(JSON.stringify(original)));
    expect(restored).toEqual(original);
  });

  it("validates optional scoring windows", () => {
    const parsed = parseChoreography(validChoreography({ windows: [{ startMs: 0, endMs: 1000 }] }));
    expect(parsed.windows).toEqual([{ startMs: 0, endMs: 1000 }]);

    expect(() =>
      parseChoreography(validChoreography({ windows: [{ startMs: 500, endMs: 100 }] })),
    ).toThrow(/endMs must be greater than startMs/);
  });
});

describe("findFrameAtOrBefore", () => {
  const choreography: Choreography = parseChoreography(
    validChoreography({
      frames: [
        { tMs: 0, landmarks: landmarks() },
        { tMs: 100, landmarks: landmarks() },
        { tMs: 200, landmarks: landmarks() },
        { tMs: 300, landmarks: landmarks() },
      ],
    }),
  );

  it("returns the exact frame on a boundary", () => {
    expect(findFrameAtOrBefore(choreography, 200)?.tMs).toBe(200);
  });

  it("returns the preceding frame between samples", () => {
    expect(findFrameAtOrBefore(choreography, 150)?.tMs).toBe(100);
  });

  it("returns undefined before the first frame", () => {
    const shifted = parseChoreography(
      validChoreography({ frames: [{ tMs: 500, landmarks: landmarks() }] }),
    );
    expect(findFrameAtOrBefore(shifted, 100)).toBeUndefined();
  });

  it("clamps to the last frame past the end", () => {
    expect(findFrameAtOrBefore(choreography, 99_999)?.tMs).toBe(300);
  });

  it("agrees with a linear scan across the whole timeline", () => {
    // Guards the binary search against off-by-one errors at every position.
    for (let t = -50; t <= 350; t += 10) {
      const expected = [...choreography.frames].reverse().find((frame) => frame.tMs <= t);
      expect(findFrameAtOrBefore(choreography, t)?.tMs).toBe(expected?.tMs);
    }
  });
});

describe("getChoreographyDurationMs", () => {
  it("reports the last timestamp", () => {
    expect(getChoreographyDurationMs(parseChoreography(validChoreography()))).toBe(200);
  });
});
