import { expect, test } from "@playwright/test";

/**
 * These run against the mock pose provider (`?mock=1`). MediaPipe never runs in
 * CI: it needs a real camera, a model download and GPU support.
 */
test.describe("controller debug page", () => {
  test("tracks poses and reports framing with the mock provider", async ({ page }) => {
    await page.goto("/controller/debug?mock=1");

    await expect(page.getByRole("heading", { name: "Controller debug" })).toBeVisible();
    await expect(page.getByText("Running the mock pose provider.")).toBeVisible();

    // The mock emits a fully visible body, so framing must settle on "ok"
    // once the required streak of good frames has accumulated.
    await expect(page.getByText("Full body visible")).toBeVisible({ timeout: 10_000 });

    await expect(page.getByTestId("stat-visible")).toHaveText("33 / 33");

    const fps = page.getByTestId("stat-fps");
    await expect
      .poll(async () => Number(await fps.innerText()), { timeout: 10_000 })
      .toBeGreaterThan(0);
  });

  test("does not ask for the camera when mocking", async ({ page }) => {
    await page.goto("/controller/debug?mock=1");
    await expect(page.getByRole("heading", { name: "Controller debug" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Enable camera" })).toHaveCount(0);
  });

  test("handles an unavailable camera cleanly", async ({ browser }) => {
    // No camera and no permission in CI, so getUserMedia rejects. Browsers
    // disagree on which error they throw, so this asserts the recovery path
    // rather than a specific message: an explanation plus a way to retry.
    const context = await browser.newContext();
    const page = await context.newPage();

    const pageErrors: Error[] = [];
    page.on("pageerror", (error) => pageErrors.push(error));

    await page.goto("/controller/debug");
    await page.getByRole("button", { name: "Enable camera" }).click();

    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible({ timeout: 20_000 });
    await expect(page.locator(".alert--error")).toBeVisible();
    expect(pageErrors).toHaveLength(0);

    await context.close();
  });
});
