# Upstream projects and reference implementations

This project should reuse mature libraries and proven browser patterns rather than inventing computer-vision or WebRTC plumbing from scratch. At the same time, it should **not** become a fork of an abandoned dance-game demo.

Before copying non-trivial code from any upstream repository, inspect its current license and preserve required notices/attribution. Prefer importing maintained packages and adapting documented examples over copying large source files.

## Primary upstream: MediaPipe

Repository: https://github.com/google-ai-edge/mediapipe
Package used by this project: `@mediapipe/tasks-vision`

Use for:

- Pose Landmarker setup in the browser;
- camera/live-stream pose inference;
- VIDEO-mode processing for choreography extraction;
- landmark definitions and visibility/confidence semantics;
- browser/WASM initialization patterns;
- performance and lifecycle patterns.

Milestones: **M1, M2, M6**.

Rules:

- MediaPipe is the default pose engine for the MVP.
- Do not implement a custom pose neural network.
- Do not add TensorFlow.js merely because an example uses it.
- Keep MediaPipe runtime objects at the browser adapter boundary; convert results to project-owned `PoseFrame` types before they enter `packages/core`.

## Browser pose-loop reference: Pose Animator

Repository: https://github.com/yemount/pose-animator

Use as a **reference implementation**, not a dependency or architectural base.

Useful ideas to inspect:

- webcam -> pose -> render loop;
- live skeleton/landmark rendering;
- requestAnimationFrame/video timing patterns;
- handling interactive pose-driven browser graphics;
- mobile-browser considerations.

Milestones: **M1, M4, M6**.

Rules:

- Do not copy its entire architecture.
- It predates the current MediaPipe Tasks Vision API, so prefer current MediaPipe APIs when they differ.
- Reuse concepts, not obsolete dependency choices.

## WebRTC reference: WebRTC Samples

Repository: https://github.com/webrtc/samples
Live examples: https://webrtc.github.io/samples/

Use for:

- `RTCPeerConnection` lifecycle;
- offer/answer exchange;
- ICE candidate handling;
- RTCDataChannel setup and events;
- connection-state diagnostics;
- browser interoperability patterns.

Milestone: **M7**.

Rules:

- Do not invent WebRTC signaling/data-channel flows from memory when an official sample demonstrates the required behavior.
- WebRTC is an optimization/transport upgrade, not an MVP prerequisite.
- Keep `WebSocketPoseTransport` working as fallback/debug transport.
- Raw camera video is not sent through WebRTC; only pose packets use DataChannel.

## PWA integration: Vite Plugin PWA

Repository: https://github.com/vite-pwa/vite-plugin-pwa

Use for:

- Web App Manifest generation/integration;
- installable phone experience;
- app name/icons/start URL/display mode;
- service-worker integration where useful.

Milestones: **M0/M1**, with browser hardening in **M6**.

Rules:

- Installation must always remain optional; first use works from a QR-scanned HTTPS URL with no app-store install.
- Avoid aggressive offline caching of choreography/video assets until cache behavior and storage size are intentionally designed.
- Camera/network functionality must still fail clearly when required connectivity or permissions are absent.

## Optional fallback/benchmark: TensorFlow.js pose models

Repository: https://github.com/tensorflow/tfjs-models
Relevant area: pose detection / MoveNet.

Use only if measurement shows MediaPipe has a concrete problem on target devices, for example:

- unacceptable FPS/latency;
- browser compatibility issue;
- unacceptable landmark quality for our scoring use case.

Possible use:

- A/B benchmark against MediaPipe on the same recorded/test poses;
- fallback engine behind a `PoseProvider` interface.

Rules:

- Do not ship both engines by default in the MVP.
- Do not add TensorFlow.js until there is benchmark evidence justifying the extra bundle/runtime complexity.

## Small dance-game/demo repositories

Small Just-Dance-like GitHub projects can be inspected for ideas such as:

- grading labels;
- combo UX;
- pose-score visualization;
- choreography file ideas;
- timing-window approaches.

They must **not** be treated as trusted dependencies or foundations unless separately reviewed for maintenance, tests, architecture and license.

The distinctive project logic should remain ours:

- choreography data model;
- pose normalization;
- feature extraction;
- temporal matching;
- scoring/fairness logic;
- grades and combo behavior;
- debug/tuning tools;
- phone/desktop protocol.

## Milestone reference map

- **M0**: React/Vite/TypeScript; add basic optional PWA manifest/installability with `vite-plugin-pwa`.
- **M1**: current MediaPipe Tasks Vision docs/examples first; Pose Animator only for rendering/loop ideas.
- **M2**: MediaPipe VIDEO-mode patterns for deterministic choreography extraction.
- **M3**: project-owned scoring engine; no upstream scoring dependency.
- **M4**: project-owned gameplay loop; Pose Animator may inform visualization only.
- **M5**: project-owned simple WebSocket room/relay protocol.
- **M6**: MediaPipe/mobile-browser performance practices; test PWA lifecycle and camera cleanup.
- **M7**: follow `webrtc/samples` for DataChannel/ICE/peer-connection implementation.
- **M8**: project-owned product/game UX; small dance demos may be mined for ideas only.

## Decision rule for Codex

When implementing a milestone:

1. Read the relevant section of `PLAN.md`.
2. Read this file's upstream mapping for that milestone.
3. Prefer the current official API/documentation of the primary upstream project.
4. Inspect reference repos for concrete patterns before writing equivalent infrastructure from scratch.
5. Adapt only the smallest useful pattern into our architecture.
6. Record any substantial copied/adapted code and its license/attribution.
7. Keep our domain types and scoring engine independent of vendor-specific runtime classes.
