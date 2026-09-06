import { defineConfig, devices } from "@playwright/test";

/**
 * E2E runs against the built app over plain HTTP. MediaPipe never runs in CI;
 * pose-dependent tests use the mock pose provider (PLAN.md, M0 acceptance).
 */
export default defineConfig({
  testDir: "./e2e",
  // The demo generator is a manual, minutes-long tool run, not a test of the
  // app. Run it explicitly: pnpm exec playwright test e2e/extract-demo.spec.ts
  testIgnore: ["**/extract-demo.spec.ts"],
  fullyParallel: true,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 2 : 0,
  reporter: process.env["CI"] ? "github" : "list",
  use: {
    baseURL: "http://localhost:4173",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm --filter @dance-game/web preview --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env["CI"],
    timeout: 120_000,
  },
});
