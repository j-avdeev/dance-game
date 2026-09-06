import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/dist-types/**",
      "**/dist-types-node/**",
      // Vendored MediaPipe wasm runtime, copied in at build time.
      "**/public/mediapipe/**",
      "**/dev-dist/**",
      "**/node_modules/**",
      "**/coverage/**",
      "**/playwright-report/**",
      "**/test-results/**",
      "**/*.tsbuildinfo",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    // The realtime server legitimately logs to stdout.
    files: ["apps/realtime/**/*.ts"],
    rules: { "no-console": "off" },
  },
  {
    // E2E specs and the manual demo generator report progress on stdout.
    files: ["e2e/**/*.ts"],
    rules: { "no-console": "off" },
  },
  {
    // Build scripts run in Node and report progress on stdout.
    files: ["**/scripts/**/*.js", "*.config.js", "*.config.ts"],
    languageOptions: {
      globals: { console: "readonly", process: "readonly" },
    },
    rules: { "no-console": "off" },
  },
  prettier,
);
