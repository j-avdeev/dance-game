import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Unit tests live next to the code they cover, in packages/ and apps/.
    // Playwright owns e2e/, so it is excluded here.
    include: ["{apps,packages}/**/*.{test,spec}.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "e2e/**"],
    environment: "node",
  },
});
