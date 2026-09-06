# Dance Game

Browser-based dance game inspired by motion-controlled rhythm games.

A smartphone browser acts as the motion controller: it uses the phone camera and MediaPipe Pose Landmarker locally, then sends only pose landmarks to the desktop game. Raw camera video stays on the phone.

The desktop browser plays a reference choreography and scores the player's pose, motion, and timing in real time.

## Project status

Planning / initial implementation.

Start with [`PLAN.md`](./PLAN.md). Codex should also read [`AGENTS.md`](./AGENTS.md) before making changes.

## Intended stack

- TypeScript
- pnpm workspace
- React + Vite
- MediaPipe Tasks Vision
- Node.js WebSocket relay for the MVP
- Vitest
- Playwright

## MVP principle

Prove that scoring feels fair before spending time on graphics, multiplayer, accounts, leaderboards, or a large choreography library.
