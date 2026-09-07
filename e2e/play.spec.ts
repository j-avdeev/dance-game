import { expect, test } from "@playwright/test";

/**
 * Drives the single-device game with the mock pose provider.
 *
 * The mock removes the camera, the model and the GPU from the loop, so these
 * tests exercise the gameplay wiring itself: clock, scoring cadence, grades,
 * combo, summary and the debug panel.
 */

test.describe("play page", () => {
  test("loads the choreography and offers a start", async ({ page }) => {
    await page.goto("/play?mock=1");

    await expect(page.getByRole("heading", { name: "Dance" })).toBeVisible();
    await expect(page.getByTestId("reference-video")).toBeVisible();
    await expect(page.getByTestId("start")).toBeEnabled({ timeout: 30_000 });

    // The mock needs no camera, so the permission prompt must not appear.
    await expect(page.getByRole("button", { name: "Enable camera" })).toHaveCount(0);
  });

  test("counts down, scores, and reaches a final summary", async ({ page }) => {
    test.setTimeout(180_000);

    const pageErrors: Error[] = [];
    page.on("pageerror", (error) => pageErrors.push(error));

    await page.goto("/play?mock=1");
    await expect(page.getByTestId("start")).toBeEnabled({ timeout: 30_000 });

    await page.getByTestId("start").click();
    await expect(page.getByTestId("countdown")).toBeVisible();

    // Grades appear once the first window closes, a little over a second in.
    await expect(page.getByTestId("hud-grade")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("hud-score")).toBeVisible();

    // Skip most of the 44 s clip rather than waiting it out.
    await page.evaluate(() => {
      const video = document.querySelector<HTMLVideoElement>("[data-testid='reference-video']");
      if (video) {
        video.currentTime = Math.max(0, video.duration - 3);
      }
    });

    await expect(page.getByTestId("performance-summary")).toBeVisible({ timeout: 90_000 });
    await expect(page.getByTestId("summary-total")).toBeVisible();
    expect(pageErrors).toHaveLength(0);
  });

  test("pauses and resumes without losing the run", async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto("/play?mock=1");
    await expect(page.getByTestId("start")).toBeEnabled({ timeout: 30_000 });
    await page.getByTestId("start").click();
    await expect(page.getByTestId("hud-score")).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: "Pause" }).click();
    const pausedTime = await page.evaluate(
      () =>
        document.querySelector<HTMLVideoElement>("[data-testid='reference-video']")?.currentTime ??
        0,
    );

    // Paused really means paused: the clock must not advance.
    await page.waitForTimeout(1000);
    const stillTime = await page.evaluate(
      () =>
        document.querySelector<HTMLVideoElement>("[data-testid='reference-video']")?.currentTime ??
        0,
    );
    expect(Math.abs(stillTime - pausedTime)).toBeLessThan(0.1);

    await page.getByRole("button", { name: "Resume" }).click();
    await page.waitForTimeout(1000);
    const resumedTime = await page.evaluate(
      () =>
        document.querySelector<HTMLVideoElement>("[data-testid='reference-video']")?.currentTime ??
        0,
    );
    expect(resumedTime).toBeGreaterThan(pausedTime);
  });

  test("restart returns the run to the beginning", async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto("/play?mock=1");
    await expect(page.getByTestId("start")).toBeEnabled({ timeout: 30_000 });
    await page.getByTestId("start").click();
    await expect(page.getByTestId("hud-score")).toBeVisible({ timeout: 30_000 });

    await page.getByTestId("restart").click();
    await expect(page.getByTestId("countdown")).toBeVisible();

    const time = await page.evaluate(
      () =>
        document.querySelector<HTMLVideoElement>("[data-testid='reference-video']")?.currentTime ??
        99,
    );
    expect(time).toBeLessThan(0.5);
  });

  test("debug panel reports the measured lag", async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto("/play?mock=1&debug=1");
    await expect(page.getByTestId("debug-panel")).toBeVisible();
    await expect(page.getByTestId("latency-slider")).toBeVisible();

    await page.getByTestId("start").click();
    // The histogram only fills once samples have been scored, which is the
    // measurement M4 exists to produce.
    await expect(page.getByTestId("lag-histogram")).toBeVisible({ timeout: 40_000 });

    const scored = await page.getByTestId("debug-scored").innerText();
    expect(scored).toMatch(/^\d+ \/ \d+$/);

    await expect(page.getByTestId("debug-median-lag")).toContainText("ms");
  });

  test("latency slider shifts the assumed lag", async ({ page }) => {
    await page.goto("/play?mock=1&debug=1");
    await expect(page.getByTestId("latency-slider")).toBeVisible();

    await page.getByTestId("latency-slider").fill("100");
    // 200 ms default plus the 100 ms offset.
    await expect(page.getByText("expected lag 300 ms")).toBeVisible();
  });

  test("hides the debug panel without the flag", async ({ page }) => {
    await page.goto("/play?mock=1");
    await expect(page.getByTestId("debug-panel")).toHaveCount(0);
  });
});
