# AGENTS.md

## Purpose

This repository is intended to be implemented incrementally with Codex or another coding agent. `PLAN.md` is the authoritative product and architecture plan.

## Rules for coding agents

1. Read `PLAN.md` completely before changing code.
2. Work on one milestone at a time unless explicitly asked otherwise.
3. Preserve the architecture unless there is a concrete technical reason to change it.
4. Keep scoring logic inside `packages/core` and independent of React, browser APIs, MediaPipe runtime classes, or networking.
5. Keep transport behind interfaces so WebSocket can later be replaced or supplemented by WebRTC DataChannel.
6. Raw smartphone camera frames must never be transmitted to the server or desktop in normal gameplay.
7. Prefer small, testable functions and deterministic scoring logic.
8. Keep tuning constants in configuration objects, not duplicated magic numbers.
9. Add tests for every non-trivial scoring/normalization behavior.
10. Do not disable lint/type/test rules merely to make CI green.
11. Run the relevant validation commands before finishing a task.
12. Keep dependencies minimal and justify substantial new dependencies.
13. Avoid premature optimization. Measure before introducing workers, WASM-specific tuning, or complex state management.
14. Do not commit copyrighted Just Dance media or other unlicensed commercial dance/music assets.
15. Do not add accounts, databases, leaderboards, multiplayer, or visual polish before the core milestones justify them.

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

Do not implement MediaPipe, WebSockets, choreography extraction, or scoring in M0.

Before finishing:

- run install/build/test/lint;
- fix failures rather than suppressing them;
- update README with exact local development commands;
- keep the commit focused on M0.
