import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

/**
 * One-off generator for the committed demo choreography.
 *
 * Not part of the normal suite: it needs the demo video present and takes
 * minutes to run. It drives the real tool page through the file picker, so the
 * output is exactly what a person would get from the UI, then saves the
 * download into content/demo.
 *
 * Run with:
 *   pnpm exec playwright test e2e/extract-demo.spec.ts --workers=1
 */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_VIDEO = resolve(repoRoot, process.env["DEMO_VIDEO"] ?? "content/demo/demo.mp4");
const OUTPUT_PATH = resolve(
  repoRoot,
  process.env["DEMO_OUTPUT"] ?? "content/demo/choreography.json",
);

test("generate demo choreography", async ({ page }) => {
  test.setTimeout(1_800_000);

  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/tools/choreography");
  await page.getByTestId("video-input").setInputFiles(SOURCE_VIDEO);

  await page.getByLabel("Title").fill("Demo dance");
  await page.getByLabel("Sample rate (Hz)").fill("10");
  await expect(page.getByRole("checkbox")).toBeChecked();

  await page.getByRole("button", { name: "Extract poses" }).click();
  await expect(page.getByTestId("choreography-stats")).toBeVisible({ timeout: 1_500_000 });

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download choreography JSON" }).click();
  const download = await downloadPromise;

  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  const json = Buffer.concat(chunks).toString("utf8");
  const choreography = JSON.parse(json) as {
    frames: { tMs: number; landmarks: unknown[] }[];
    imageWidth: number;
    imageHeight: number;
  };

  const missed = choreography.frames.filter((frame) => frame.landmarks.length === 0).length;
  const missedRatio = missed / choreography.frames.length;
  console.log(
    `[demo] ${choreography.frames.length} samples, ${missed} missed ` +
      `(${(missedRatio * 100).toFixed(1)}%), ${choreography.imageWidth}x${choreography.imageHeight}`,
  );

  expect(pageErrors).toEqual([]);
  // A high miss rate means the recording needs fixing, not that the file
  // should be committed anyway.
  expect(missedRatio).toBeLessThan(0.05);

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, json.endsWith("\n") ? json : `${json}\n`, "utf8");
});
