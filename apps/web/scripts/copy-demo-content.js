/**
 * Copies the demo choreography and its video into public/.
 *
 * They live in content/demo/ as project data, but the app has to serve them
 * over HTTP. Copying at build time keeps one canonical copy in the repo rather
 * than duplicating a 7 MB video, so the files here are generated and
 * gitignored.
 */
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const sourceDir = resolve(here, "..", "..", "..", "content", "demo");
const targetDir = resolve(here, "..", "public", "content", "demo");

const FILES = ["choreography.json", "demo.mp4"];

await mkdir(targetDir, { recursive: true });
for (const file of FILES) {
  await copyFile(resolve(sourceDir, file), resolve(targetDir, file));
}

console.log(`[content] copied ${FILES.length} demo files to public/content/demo`);
