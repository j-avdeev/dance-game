# Browser Dance Game — Implementation Plan

## Goal

Build a browser-based, Just-Dance-style game where a desktop/TV browser shows a reference dance video and live score, while a smartphone browser acts as the motion controller.

The phone must run pose estimation locally using MediaPipe Pose Landmarker. Raw camera video must not leave the phone. Only pose data is transmitted to the desktop.

The MVP must answer one product question: **does the scoring feel fair and fun when a person follows a dance video?**

## Core user flow

### Desktop / TV

1. Open the game.
2. Create a room.
3. Show room code + QR code.
4. Select choreography.
5. Wait for phone controller.
6. Start 3-second countdown.
7. Play reference video.
8. Show live grade, score and combo.
9. Show final score and body-part breakdown.

### Smartphone

1. Scan QR.
2. Open `/controller/:roomId`.
3. Grant camera permission.
4. Use front-facing camera by default.
5. Show camera preview + skeleton overlay.
6. Show framing guidance (full body visible, enough light, stable camera).
7. Press Ready.
8. Run MediaPipe locally and send pose frames only.
9. Never upload or stream raw camera frames.

Also provide `/controller/debug` for local pose-development without pairing.

## MVP scope

Include:

- one player;
- one desktop display + one phone controller;
- browser camera input;
- MediaPipe pose detection;
- reference choreography extraction from local/self-owned video;
- real-time pose comparison;
- timing tolerance;
- Perfect / Great / Good / Miss grades;
- score and combo;
- QR/room pairing;
- reconnect after temporary network interruption;
- scoring debug view.

Do not include yet:

- accounts/auth;
- database persistence;
- native mobile apps;
- custom ML training;
- YouTube downloading;
- copyrighted commercial dance/music assets;
- multiplayer;
- leaderboards;
- social features;
- WebRTC video streaming.

## Technical stack

Use a pnpm TypeScript workspace.

```text
apps/
  web/                 React + Vite client
  realtime/            Node.js WebSocket relay/signaling server
packages/
  core/                framework-free pose/scoring/protocol logic
content/
  demo/
    choreography.json
docs/
  scoring.md
  protocol.md
PLAN.md
AGENTS.md
```

Preferred stack:

- React + TypeScript
- Vite
- `@mediapipe/tasks-vision`
- React Router
- Zod
- Vitest
- Playwright

Keep dependencies minimal.

## Architecture

```text
PHONE
camera
  -> getUserMedia()
  -> MediaPipe Pose Landmarker
  -> PoseFrame
  -> smoothing
  -> WebSocket transport
                         \
                          -> DESKTOP PLAYER POSE BUFFER
                         /
REFERENCE CONTENT
video + choreography.json
  -> reference pose timeline
  -> scoring engine
  -> grade / score / combo
  -> desktop UI
```

The desktop video element's playback time is the canonical game clock.

For the MVP, do not synchronize absolute phone/desktop clocks. When a pose arrives at the desktop, associate it with the current video time and keep a short ring buffer.

## Core types

Keep these framework-independent in `packages/core`.

```ts
type Landmark = {
  x: number;
  y: number;
  z: number;
  visibility: number;
};

type PoseFrame = {
  seq: number;
  capturedAtMs: number;
  landmarks: Landmark[];
  worldLandmarks?: Landmark[];
};

type TimedPoseFrame = PoseFrame & {
  gameTimeMs: number;
};

type Choreography = {
  version: 1;
  id: string;
  title: string;
  videoPath: string;
  mirrored: boolean;
  sampleRateHz: number;
  frames: Array<{
    tMs: number;
    landmarks: Landmark[];
    worldLandmarks?: Landmark[];
  }>;
};

type ScoreResult = {
  total: number;
  grade: "perfect" | "great" | "good" | "miss";
  timingOffsetMs: number;
  confidence: number;
  parts: {
    leftArm: number;
    rightArm: number;
    leftLeg: number;
    rightLeg: number;
    torso: number;
    motion: number;
  };
};
```

All network/choreography formats must include a version field.

## Pose normalization and features

Do not compare raw image coordinates directly.

Implement `extractPoseFeatures(frame, previousFrame?)`.

Initial features:

- elbow angles: shoulder -> elbow -> wrist;
- shoulder angles: elbow -> shoulder -> hip;
- hip angles: shoulder -> hip -> knee;
- knee angles: hip -> knee -> ankle;
- wrists relative to hip center;
- ankles relative to hip center;
- shoulder-line angle;
- hip-line angle;
- torso lean;
- wrist and ankle movement vectors.

Center pose around midpoint of hips. Normalize scale using torso length and/or shoulder width, while preserving meaningful lean/direction.

Use landmark visibility to down-weight uncertain features.

Support mirror mode by swapping semantic left/right landmarks, not only flipping CSS.

Start with configurable exponential moving average smoothing.

## Scoring v1

Scoring must be deterministic pure functions in `packages/core`.

```text
staticPoseScore = weighted similarity of angles + relative positions + torso
motionScore     = similarity of wrist/ankle movement
rawScore        = 0.80 * staticPoseScore + 0.20 * motionScore
finalScore      = rawScore * timingPenalty
```

Suggested static body weights:

- left arm: 20%
- right arm: 20%
- left leg: 17.5%
- right leg: 17.5%
- torso: 25%

Put weights in configuration.

Use smooth angle penalties (Gaussian/exponential-like), not binary thresholds.

### Timing tolerance

Maintain about 500–700 ms of player poses. Evaluate each reference sample after a short delay (start at 200 ms), search player poses in roughly `T - 200 ms ... T + 200 ms`, choose the best pose match and apply timing penalty.

Start with:

```ts
{
  evaluationDelayMs: 200,
  timingWindowMs: 200,
  timingSigmaMs: 140,
  staticPoseWeight: 0.8,
  motionWeight: 0.2
}
```

Initial grades:

```text
Perfect >= 88
Great   >= 75
Good    >= 60
Miss    < 60
```

Tune only after real test sessions.

## Choreography extraction tool

Create `/tools/choreography`.

Flow:

1. Select local video.
2. Preview it.
3. Set trim/start offset.
4. Set mirrored/non-mirrored semantics.
5. Run MediaPipe in VIDEO mode.
6. Sample around 10 FPS initially.
7. Store raw landmarks + timestamps.
8. Overlay extracted skeleton for validation.
9. Download `choreography.json`.

No server-side video processing for MVP.

## Network protocol v1

Use WebSocket first. The realtime server should only:

- create room;
- join room;
- relay controller status;
- relay pose packets;
- heartbeat;
- remove expired rooms.

No database.

Example:

```json
{ "v": 1, "type": "create-room" }
{ "v": 1, "type": "join-room", "roomId": "ABCD12" }
{ "v": 1, "type": "controller-ready", "roomId": "ABCD12" }
{ "v": 1, "type": "pose", "roomId": "ABCD12", "frame": {} }
```

Validate incoming messages and limit packet size/rate. Target about 15 pose packets/sec.

The server must never receive camera images/video.

## Milestones

### M0 — Repository scaffold

Deliver:

- pnpm workspace;
- `apps/web`;
- `apps/realtime`;
- `packages/core`;
- TypeScript strict mode;
- lint/format/test/build scripts;
- minimal CI.

Acceptance:

- install works;
- lint passes;
- tests pass;
- production build succeeds.

### M1 — Phone camera + pose tracking

Deliver:

- `/controller/debug`;
- camera permission flow;
- front camera selection;
- MediaPipe Pose Landmarker;
- 33-point skeleton overlay;
- FPS display;
- framing/visibility status;
- mock pose provider.

Acceptance:

- a real phone shows a stable full-body skeleton;
- camera frames never leave the page;
- permission denial handled cleanly.

### M2 — Choreography extractor

Deliver:

- `/tools/choreography`;
- local video selection;
- pose extraction;
- JSON export;
- overlay validation;
- mirror metadata.

Acceptance:

- a short test dance becomes deterministic choreography JSON;
- reloading JSON reproduces aligned skeletons over video.

### M3 — Scoring engine

Deliver:

- feature extraction;
- scale/translation normalization;
- visibility weighting;
- mirror support;
- pose similarity;
- motion similarity;
- temporal matching;
- grade mapping;
- debug breakdown.

Required tests:

- identical pose scores near max;
- translation does not materially change score;
- scale/distance does not materially change score;
- wrong arm lowers corresponding component;
- low-visibility landmarks do not crash scoring;
- mirror mode swaps semantics correctly;
- slightly late pose remains scoreable;
- very late pose is penalized.

### M4 — Single-device playable prototype

Deliver:

- reference video player;
- local camera pose source;
- countdown;
- score;
- grade feedback;
- combo;
- pause/restart;
- scoring debug panel.

Acceptance:

- correct imitation clearly scores better than intentionally incorrect movement.

This is the first major product checkpoint. Do not spend heavily on networking/polish before this feels believable.

### M5 — Phone/desktop pairing

Deliver:

- room creation;
- QR code;
- controller join page;
- WebSocket relay;
- ready state;
- live pose forwarding;
- reconnect;
- host diagnostics.

Acceptance:

- separate phone + desktop pair successfully;
- gameplay works without transmitting raw video;
- temporary disconnect can recover where possible.

### M6 — Browser/performance hardening

Test at minimum:

- Android Chrome;
- iPhone Safari;
- desktop Chrome.

Handle:

- permission denial;
- unavailable camera;
- phone rotation;
- background tab;
- network disconnect;
- video buffering;
- slow inference;
- camera cleanup on unmount.

Use HTTPS in production.

### M7 — WebRTC DataChannel

Only after M5/M6 are stable.

Introduce:

```ts
interface PoseTransport {
  connect(roomId: string): Promise<void>;
  send(frame: PoseFrame): void;
  close(): void;
}
```

Keep WebSocket as one implementation and add WebRTC DataChannel as another. Reuse realtime server for signaling only.

Scoring code must not change.

### M8 — Polish

After scoring is validated:

- animated grades;
- combo effects;
- performance summary;
- calibration;
- latency calibration;
- choreography selection;
- difficulty metadata;
- eventually multiplayer.

## Debug tooling is mandatory

Create a developer overlay showing:

- reference skeleton;
- player skeleton;
- selected player timestamp;
- timing offset;
- total score;
- per-limb score;
- visibility;
- packet rate;
- inference FPS;
- active scoring parameters.

Treat this as core infrastructure for tuning scoring.

## Privacy/security

- Raw camera video stays on phone.
- Do not store live player poses by default.
- Explicit camera permission required.
- Room codes are random, short-lived, and expire.
- Validate/rate-limit realtime messages.
- Do not accept arbitrary remote video URLs in MVP choreography tool.

## Codex execution rules

Implement one milestone at a time, in order.

For each milestone:

1. Read this entire plan and `AGENTS.md`.
2. Inspect existing code first.
3. Implement the smallest complete vertical slice.
4. Add/update tests.
5. Run lint, tests and production build.
6. Fix failures instead of disabling tests.
7. Update progress notes if useful.
8. Commit with a focused message.

Do not build the whole application in one giant pass.

## Definition of MVP done

MVP is done when:

- desktop creates room + QR;
- phone joins;
- phone camera tracks one full body;
- raw camera video never leaves phone;
- desktop plays one reference choreography;
- player poses reach desktop at stable rate;
- scoring tolerates modest timing error;
- Perfect/Great/Good/Miss works;
- score + combo work;
- correct imitation consistently beats deliberately incorrect movement;
- debug overlay explains scoring;
- app runs over HTTPS on real phone + desktop.
