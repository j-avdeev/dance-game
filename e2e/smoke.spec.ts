import { expect, test } from "@playwright/test";

test("host page renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Dance Game" })).toBeVisible();
});

test("play route is reachable", async ({ page }) => {
  await page.goto("/play");
  await expect(page.getByRole("heading", { name: "Play" })).toBeVisible();
});

test("web app manifest is served and valid", async ({ request }) => {
  // Installability is optional but the manifest must be correct from M0.
  const response = await request.get("/manifest.webmanifest");
  expect(response.ok()).toBeTruthy();

  const manifest = (await response.json()) as {
    name?: string;
    start_url?: string;
    display?: string;
    icons?: { src: string; sizes: string }[];
  };
  expect(manifest.name).toBe("Dance Game");
  expect(manifest.start_url).toBe("/");
  expect(manifest.display).toBe("standalone");
  expect(manifest.icons?.length).toBeGreaterThanOrEqual(2);
});

test("manifest icons resolve", async ({ request }) => {
  for (const src of ["/icons/icon-192.png", "/icons/icon-512.png"]) {
    const response = await request.get(src);
    expect(response.ok(), `${src} should be served`).toBeTruthy();
  }
});
