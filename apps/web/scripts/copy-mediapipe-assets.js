/**
 * Copies the MediaPipe Tasks Vision wasm runtime into public/.
 *
 * Self-hosting keeps the app working without a third-party CDN at runtime and
 * avoids a cross-origin dependency on the critical path. The files are build
 * output, not source, so they are gitignored and regenerated on every build.
 *
 * Each file is resolved through the package's exports map by name; the package
 * does not export `./package.json`, so its directory cannot be resolved
 * directly.
 */
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

/** Exported wasm runtime entries, as they must appear in the served directory. */
const WASM_FILES = [
  "vision_wasm_internal.js",
  "vision_wasm_internal.wasm",
  "vision_wasm_nosimd_internal.js",
  "vision_wasm_nosimd_internal.wasm",
  "vision_wasm_module_internal.js",
  "vision_wasm_module_internal.wasm",
];

const targetDir = resolve(here, "..", "public", "mediapipe", "wasm");
await mkdir(targetDir, { recursive: true });

for (const file of WASM_FILES) {
  const source = require.resolve(`@mediapipe/tasks-vision/${file}`);
  await copyFile(source, resolve(targetDir, file));
}

console.log(`[mediapipe] copied ${WASM_FILES.length} wasm runtime files to public/mediapipe/wasm`);
