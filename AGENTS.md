# AGENTS.md

## Purpose

This repository is intended to be implemented incrementally with Codex or another coding agent. `PLAN.md` is the authoritative product and architecture plan. `docs/UPSTREAM.md` defines which mature upstream projects should be consulted and how they may be reused.

## Rules for coding agents

1. Read `PLAN.md` completely before changing code.
2. Read `docs/UPSTREAM.md` before implementing any milestone that touches MediaPipe, PWA behavior, browser pose rendering, TensorFlow.js/MoveNet, or WebRTC.
3. Work on one milestone at a time unless explicitly asked otherwise.
4. Preserve the architecture unless there is a concrete technical reason to change it.
5. Prefer current official APIs/documentation and maintained upstream examples over inventing infrastructure from scratch.
6. For pose tracking, use MediaPipe Tasks Vision as the default engine. Do not train or implement a custom pose model.
7. Treat `yemount/pose-animator` as a reference for browser pose/render-loop ideas only; do not copy its architecture or obsolete dependency choices wholesale.
8. For WebRTC work, inspect relevant `webrtc/samples` examples before implementing peer connection, ICE, offer/answer, or RTCDataChannel flows.
9. TensorFlow.js / MoveNet is a fallback or benchmark only. Do not add it unless measured MediaPipe limitations justify the extra dependency/runtime cost.
10. Use `vite-plugin-pwa` for the optional installable phone experience. Browser/QR usage must never depend on PWA installation.
11. Before adapting non-trivial upstream source code, inspect its current license and preserve required attribution/notices. Prefer package APIs and small adapted patterns to large copied files.
12. Do not use tiny/abandoned Just-Dance clone repositories as foundational dependencies. They may be inspected for game-feel/scoring UX ideas only.
13. Keep scoring logic inside `packages/core` and independent of React, browser APIs, MediaPipe runtime classes, or networking.
14. Convert MediaPipe results to project-owned `PoseFrame` types at the adapter boundary.
15. Keep transport behind interfaces so WebSocket can later be replaced or supplemented by WebRTC DataChannel.
16. Raw smartphone camera frames must never be transmitted to the server or desktop in normal gameplay.
17. Prefer small, testable functions and deterministic scoring logic.
18. Keep tuning constants in configuration objects, not duplicated magic numbers.
19. Add tests for every non-trivial scoring/normalization behavior.
20. Do not disable lint/type/test rules merely to make CI green.
21. Run the relevant validation commands before finishing a task.
22. Keep dependencies minimal and justify substantial new dependencies.
23. Avoid premature optimization. Measure before introducing workers, alternate pose engines, WASM-specific tuning, or complex state management.
24. Do not commit copyrighted Just Dance media or other unlicensed commercial dance/music assets.
25. Do not add accounts, databases, leaderboards, multiplayer, or visual polish before the core milestones justify them.

## Expected validation

Once the scaffold exists, the standard completion checks should be:

```bash
pnpm lint
pnpm test
pnpm build
```

If browser tests are introduced:

```bash
pnpm test:e2e
```

## First task for Codex

Implement **Milestone M0 only** from `PLAN.md`.

Create the pnpm TypeScript monorepo with:

- `apps/web`
- `apps/realtime`
- `packages/core`

Configure strict TypeScript, Vitest, ESLint/formatting, workspace scripts, and minimal CI.

Also establish the minimal PWA foundation described in M0 using `vite-plugin-pwa`:

- valid web app manifest;
- app name/start URL/display metadata;
- optional installability where supported;
- no aggressive choreography/video offline caching yet.

Do not implement MediaPipe, WebSockets, choreography extraction, or scoring in M0.

Before finishing:

- run install/build/test/lint;
- fix failures rather than suppressing them;
- update README with exact local development commands;
- keep the commit focused on M0.
