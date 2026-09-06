import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

/**
 * Drives the extractor against a real, generated video so seeking runs against
 * an actual decoder. The clip is a test pattern with no person in it, so
 * MediaPipe finds no pose: that exercises the "no dancer detected" path, which
 * must still produce an evenly spaced timeline rather than dropping samples.
 */
const TEST_CLIP = fileURLToPath(new URL("./fixtures/test-clip.mp4", import.meta.url));

/** A clip that does contain a person, so real landmarks are produced. */
const PERSON_CLIP = fileURLToPath(new URL("./fixtures/person-clip.mp4", import.meta.url));

test.describe("choreography extractor", () => {
  test("loads a local video and exposes the extraction controls", async ({ page }) => {
    await page.goto("/tools/choreography");
    await expect(page.getByRole("heading", { name: "Choreography extractor" })).toBeVisible();

    // No file chosen yet, so nothing to configure.
    await expect(page.getByRole("group", { name: "Choreography" })).toHaveCount(0);

    await page.getByTestId("video-input").setInputFiles(TEST_CLIP);

    await expect(page.getByRole("group", { name: "Choreography" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Extract poses" })).toBeEnabled();

    // The title defaults to the file name, and mirrored defaults to on.
    await expect(page.getByLabel("Title")).toHaveValue("test-clip");
    await expect(page.getByRole("checkbox")).toBeChecked();
  });

  test("extracts an evenly spaced timeline from a real video", async ({ page }) => {
    test.setTimeout(120_000);

    const pageErrors: Error[] = [];
    page.on("pageerror", (error) => pageErrors.push(error));

    await page.goto("/tools/choreography");
    await page.getByTestId("video-input").setInputFiles(TEST_CLIP);
    await expect(page.getByRole("button", { name: "Extract poses" })).toBeEnabled();

    // 5 Hz over a 3 s clip keeps the run short while still crossing many seeks.
    await page.getByLabel("Sample rate (Hz)").fill("5");
    await page.getByRole("button", { name: "Extract poses" }).click();

    await expect(page.getByTestId("choreography-stats")).toBeVisible({ timeout: 90_000 });

    // 3 s at 5 Hz inclusive of t=0 is 16 samples.
    await expect(page.getByTestId("stat-samples")).toHaveText("16");
    expect(pageErrors).toHaveLength(0);

    await expect(page.getByRole("button", { name: "Download choreography JSON" })).toBeVisible();
    // The clip contains no dancer, so the tool must warn rather than pretend
    // the extraction is usable.
    await expect(page.locator(".alert--error")).toContainText("not detected");
  });

  test("downloads valid, evenly spaced choreography JSON", async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto("/tools/choreography");
    await page.getByTestId("video-input").setInputFiles(TEST_CLIP);
    await page.getByLabel("Sample rate (Hz)").fill("5");
    await page.getByLabel("Title").fill("Extractor smoke test");
    await page.getByRole("button", { name: "Extract poses" }).click();
    await expect(page.getByTestId("choreography-stats")).toBeVisible({ timeout: 90_000 });

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download choreography JSON" }).click();
    const download = await downloadPromise;

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
      version: number;
      title: string;
      mirrored: boolean;
      sampleRateHz: number;
      imageWidth: number;
      imageHeight: number;
      frames: { tMs: number; landmarks: unknown[] }[];
    };

    expect(parsed.version).toBe(1);
    expect(parsed.title).toBe("Extractor smoke test");
    expect(parsed.mirrored).toBe(true);
    expect(parsed.sampleRateHz).toBe(5);
    expect(parsed.imageWidth).toBe(320);
    expect(parsed.imageHeight).toBe(240);

    // Exact, evenly spaced timestamps are the whole point of seek-based
    // sampling; playback-based sampling would drift here.
    const timestamps = parsed.frames.map((frame) => frame.tMs);
    expect(timestamps.slice(0, 5)).toEqual([0, 200, 400, 600, 800]);
    for (let i = 1; i < timestamps.length; i++) {
      expect(timestamps[i]! - timestamps[i - 1]!).toBe(200);
    }
  });

  test("extracts real landmarks from a clip containing a person", async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto("/tools/choreography");
    await page.getByTestId("video-input").setInputFiles(PERSON_CLIP);
    await page.getByLabel("Sample rate (Hz)").fill("5");
    await page.getByRole("button", { name: "Extract poses" }).click();
    await expect(page.getByTestId("choreography-stats")).toBeVisible({ timeout: 90_000 });

    // A person is present, so the "not detected" warning must NOT appear.
    await expect(page.locator(".alert--error")).toHaveCount(0);

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download choreography JSON" }).click();
    const download = await downloadPromise;
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
      imageWidth: number;
      imageHeight: number;
      frames: {
        tMs: number;
        landmarks: { x: number; y: number; visibility: number }[];
        worldLandmarks?: unknown[];
      }[];
    };

    const populated = parsed.frames.filter((frame) => frame.landmarks.length > 0);
    expect(populated.length).toBe(parsed.frames.length);

    const first = populated[0]!;
    expect(first.landmarks).toHaveLength(33);
    expect(first.worldLandmarks).toHaveLength(33);

    // Landmarks are stored aspect-corrected: y stays within [0, 1] and x
    // spans up to the aspect ratio. This is what makes a landscape reference
    // comparable to a portrait phone capture.
    const aspectRatio = parsed.imageWidth / parsed.imageHeight;
    for (const landmark of first.landmarks) {
      expect(landmark.y).toBeGreaterThan(-0.5);
      expect(landmark.y).toBeLessThan(1.5);
      expect(landmark.x).toBeGreaterThan(-0.5);
      expect(landmark.x).toBeLessThan(aspectRatio + 0.5);
    }

    // The still image is the same in every frame, so the detected pose should
    // barely move; large drift would mean frames are being misattributed.
    const last = populated[populated.length - 1]!;
    for (let i = 0; i < 33; i++) {
      expect(Math.abs(last.landmarks[i]!.x - first.landmarks[i]!.x)).toBeLessThan(0.05);
      expect(Math.abs(last.landmarks[i]!.y - first.landmarks[i]!.y)).toBeLessThan(0.05);
    }
  });

  test("re-running the extraction reproduces the same timestamps", async ({ page }) => {
    test.setTimeout(180_000);

    await page.goto("/tools/choreography");
    await page.getByTestId("video-input").setInputFiles(TEST_CLIP);
    await page.getByLabel("Sample rate (Hz)").fill("5");

    const runOnce = async (): Promise<number[]> => {
      await page.getByRole("button", { name: /Extract poses|Extract again/ }).click();
      await expect(page.getByTestId("choreography-stats")).toBeVisible({ timeout: 90_000 });

      const downloadPromise = page.waitForEvent("download");
      await page.getByRole("button", { name: "Download choreography JSON" }).click();
      const download = await downloadPromise;
      const stream = await download.createReadStream();
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk));
      }
      const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
        frames: { tMs: number }[];
      };
      return parsed.frames.map((frame) => frame.tMs);
    };

    const first = await runOnce();
    const second = await runOnce();

    // Landmark values are not bit-reproducible (MediaPipe runs on the GPU),
    // but the sampling grid must be identical across runs.
    expect(second).toEqual(first);
  });
});
