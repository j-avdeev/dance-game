# Browser Dance Game — Implementation Plan

## Goal

Build a browser-based, Just-Dance-style game where a desktop/TV browser shows a reference dance video and live score, while a smartphone browser acts as the motion controller.

The phone runs pose estimation locally using MediaPipe Pose Landmarker. Raw camera video must not leave the phone. Only pose data is transmitted to the desktop.

No native app installation is required. First use must work from a normal HTTPS URL opened by scanning a QR code. The phone experience should also be installable as an optional PWA for returning users.

The MVP must answer one product question: **does the scoring feel fair and fun when a person follows a dance video?**

To answer it early, the plan defines two runnable prototype checkpoints (see [Prototype checkpoints](#prototype-checkpoints)): **P1** is a single-device version playable from a public HTTPS URL after M4; **P2** adds phone pairing after M5.

## Upstream reuse strategy

This project should reuse mature libraries and proven browser patterns instead of reimplementing computer vision, PWA plumbing, or WebRTC from scratch.

Read [`docs/UPSTREAM.md`](./docs/UPSTREAM.md) before implementing milestones that touch those areas.

Primary upstream projects:

- `google-ai-edge/mediapipe` — primary pose engine and current browser pose-processing patterns.
- `yemount/pose-animator` — reference only for webcam/pose/render-loop ideas; do not adopt its architecture wholesale.
- `webrtc/samples` — reference for WebRTC peer connection, ICE and RTCDataChannel implementation in M7.
- `vite-pwa/vite-plugin-pwa` — optional installable phone/PWA experience.
- `tensorflow/tfjs-models` / MoveNet — benchmark/fallback only if measured MediaPipe problems justify it.

Do **not** make the project a fork of a tiny abandoned Just-Dance clone. Small dance demos may be inspected for UX/scoring ideas, but our choreography format, normalization, timing, scoring and protocol remain project-owned.

Before copying non-trivial upstream code, inspect its current license and preserve required attribution/notices. Prefer maintained packages and documented examples over copied source.

## Core user flow

### Physical setup

The phone is the camera, so it is placed away from the player, not held:

- phone 2–3 m from the player, roughly waist height, portrait orientation, propped so it does not move;
- player faces the desktop/TV screen and is fully in the phone frame (head to feet);
- reasonable lighting, no strong backlight.

Because the phone is far away, its own screen is only useful during setup. **The desktop is the primary framing feedback surface** once the controller is connected.

### Desktop / TV

1. Open the game in a browser.
2. Create a room.
3. Show room code + QR code.
4. Select choreography.
5. Wait for phone controller. Once connected, show the player's live skeleton and framing status (full body visible / too close / low confidence / lost) on the big screen as normal UI, not only in the debug overlay.
6. Start 3-second countdown.
7. Play reference video.
8. Show live grade, score and combo.
9. Show final score and body-part breakdown.

For MVP, desktop Chrome/Edge or a laptop connected to a TV is the primary display target. Native Smart-TV browser compatibility is a later hardening target because TV browsers vary significantly.

### Smartphone

1. Scan QR; no typing of a URL should normally be required.
2. Open `/controller/:roomId` in the browser.
3. Grant camera permission.
4. Use front-facing camera by default.
5. Show camera preview + skeleton overlay (preview is mirrored for display only; landmarks are used as delivered by MediaPipe).
6. Show framing guidance (full body visible, enough light, stable camera).
7. Press Ready.
8. Acquire a Screen Wake Lock so the phone does not lock and suspend the camera during play; re-acquire on `visibilitychange`.
9. Run MediaPipe locally and send pose frames only.
10. Never upload or stream raw camera frames.

**"Full body visible"** is defined once and shared by phone and desktop: both shoulders, both hips and both ankles have `visibility > 0.5` for 10 consecutive frames. Loss of that condition for >1 s changes framing status to "lost".

Also provide `/controller/debug` for local pose development without pairing.

The controller should be installable as a PWA, but installation is always optional. The QR-flow must work without installation.

## MVP scope

Include:

- one player;
- one desktop display + one phone controller;
- browser camera input;
- MediaPipe pose detection;
- optional PWA installability on phone;
- reference choreography extraction from local/self-owned video;
- real-time pose comparison;
- timing tolerance, including an explicit expected player lag;
- Perfect / Great / Good / Miss grades;
- score and combo;
- QR/room pairing;
- reconnect after temporary network interruption;
- scoring debug view;
- a single-device play mode (`/play`) used for P1 and for local development.

Do not include yet:

- accounts/auth;
- database persistence;
- mandatory native mobile apps;
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
    demo.mp4           self-recorded reference video (see Content guidelines)
docs/
  scoring.md
  protocol.md
  TESTING.md           tester kit for P1/P2
  UPSTREAM.md
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
- Playwright (e2e runs only against the mock pose provider; no MediaPipe in CI)
- `vite-plugin-pwa`
- `ws` (realtime server)
- `qrcode` (QR rendering on the host)
- `@vitejs/plugin-basic-ssl` or mkcert for dev HTTPS

Keep dependencies minimal. Do not add TensorFlow.js, a state-management framework, or another heavy runtime without a concrete measured need.

## Architecture

```text
PHONE
camera
  -> getUserMedia()
  -> MediaPipe Pose Landmarker
  -> project PoseFrame adapter (aspect-corrected coords, image size)
  -> smoothing
  -> PoseTransport (WebSocket for MVP)
                         \
                          -> DESKTOP PLAYER POSE BUFFER (~1 s ring buffer)
                         /
REFERENCE CONTENT
video + choreography.json
  -> reference pose timeline
  -> scoring engine (per-sample scores)
  -> grade aggregation (grade events, combo, total)
  -> desktop UI
```

The desktop video element's playback time is the canonical game clock. Drive the evaluation loop from `requestAnimationFrame` reading `video.currentTime`; do not rely on the `timeupdate` event (it fires at ~4 Hz).

### Player pose timestamps

For the MVP, do not synchronize absolute phone/desktop clocks. Instead:

- each pose carries `capturedAtMs` from the phone's monotonic clock;
- on arrival the desktop records `receivedAtGameTimeMs = video.currentTime * 1000`;
- the transport estimates one-way delay from periodic ping/pong round trips (`estimatedTransportDelayMs = RTT / 2`, smoothed); phone inference time is included in the per-frame `inferenceMs` field;
- `gameTimeMs = receivedAtGameTimeMs - estimatedTransportDelayMs - inferenceMs`.

In single-device mode (`/play`) the transport delay is zero and only inference time is subtracted. This keeps the M4 and M5 timing behaviour comparable.

Keep about 1 s of player poses in a ring buffer.

MediaPipe-specific runtime objects must not leak into `packages/core`; convert them into project-owned types at the browser adapter boundary.

## Core types

Keep these framework-independent in `packages/core`.

```ts
type Landmark = {
  x: number;
  y: number;
  z: number; // MediaPipe depth estimate; noisy, NOT used by v1 scoring
  visibility: number;
};

type PoseFrame = {
  seq: number;
  capturedAtMs: number;
  inferenceMs: number; // time spent in pose inference for this frame
  imageWidth: number; // source frame size, needed for aspect-correct geometry
  imageHeight: number;
  landmarks: Landmark[]; // 33 entries, or [] when no person was detected
  worldLandmarks?: Landmark[];
};

type TimedPoseFrame = PoseFrame & {
  receivedAtGameTimeMs: number;
  gameTimeMs: number; // corrected estimate of when the pose was performed
};

type Choreography = {
  version: 1;
  id: string;
  title: string;
  videoPath: string;
  mirrored: boolean; // true: dancer faces the camera; player mirrors them
  sampleRateHz: number;
  imageWidth: number;
  imageHeight: number;
  windows?: Array<{ startMs: number; endMs: number }>; // optional move windows; default = fixed windows
  frames: Array<{
    tMs: number; // relative to video currentTime, after trim offset
    landmarks: Landmark[];
    worldLandmarks?: Landmark[];
  }>;
};

type ScoreResult = {
  total: number;
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

type Grade = "perfect" | "great" | "good" | "miss";

type GradeEvent = {
  windowIndex: number;
  startMs: number;
  endMs: number;
  score: number; // aggregated 0..100
  grade: Grade;
  combo: number;
  points: number;
  parts: ScoreResult["parts"];
};
```

All network/choreography formats must include a version field.

## Pose normalization and features

Do not compare raw image coordinates directly.

### Coordinate space

MediaPipe image landmarks are normalized to `[0, 1]` independently per axis, so a portrait phone frame (9:16) and a landscape reference video (16:9) distort angles differently. The adapter must convert to **aspect-correct coordinates** (multiply `x` by `imageWidth / imageHeight`, or convert to pixels and rescale) before any feature is computed.

v1 scoring uses **2D aspect-corrected image landmarks** only. `worldLandmarks` are stored in the choreography for later experiments but are not scored, and `z` is not used in any v1 feature.

### Features

Implement `extractPoseFeatures(frame, previousFrames)`.

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
- wrist and ankle velocities.

Center pose around midpoint of hips. Normalize scale using torso length and/or shoulder width, while preserving meaningful lean/direction.

**Motion features are velocities**, in normalized units per second, computed over a fixed look-back (start with 150 ms) using interpolated frames. Player frames (~15 Hz) and reference frames (~10 Hz) have different spacing, so raw frame-to-frame deltas must never be compared directly.

Use landmark visibility to down-weight uncertain features. A frame with empty `landmarks` (no person) produces a zero-confidence result, never an exception.

### Mirror mode

`Choreography.mirrored = true` means the reference dancer faces the camera and the player is expected to mirror them (dancer's left hand corresponds to the player's right hand). The scorer implements this by swapping semantic left/right landmarks on the **reference** side before feature extraction, not by flipping CSS. The phone's mirrored preview is display-only.

Start with configurable exponential moving average smoothing.

## Scoring v1

Scoring must be deterministic pure functions in `packages/core`.

```text
staticPoseScore = weighted similarity of angles + relative positions + torso
motionScore     = similarity of wrist/ankle velocities
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

### Timing tolerance and expected lag

A person following a video is systematically **late** by roughly 150–300 ms (perception + reaction), even when dancing well. The timing model must treat that lag as normal rather than penalizing it:

- `expectedLagMs` is the centre of the search; the search window for reference sample `T` is `T + expectedLagMs ± timingWindowMs`;
- the timing penalty is measured from that centre, and being late is tolerated more than being early (`lateSigmaMs > earlySigmaMs`);
- each reference sample is evaluated `evaluationDelayMs` after `T`, which must be at least `expectedLagMs + timingWindowMs + transport margin`;
- within the window, choose the player pose with the best `finalScore` (after timing penalty).

Start with:

```ts
{
  expectedLagMs: 200,
  timingWindowMs: 200,
  earlySigmaMs: 120,
  lateSigmaMs: 160,
  evaluationDelayMs: 550,
  playerBufferMs: 1000,
  staticPoseWeight: 0.8,
  motionWeight: 0.2
}
```

The debug overlay shows the measured offset between the best-matching player pose and the reference. **M4 must measure the real lag distribution with several people before any threshold is tuned**; P1 testing feeds the final `expectedLagMs` and a per-session latency calibration slider is available in the debug panel from M4.

### Grade events and aggregation

Per-sample scores (~10 per second) are noisy and are never shown directly. They are aggregated into **scoring windows**:

- default: fixed windows of `gradeWindowMs: 1000` starting at choreography `tMs = 0`; if `Choreography.windows` is present, use those instead (move-aligned windows come later, produced by the extractor);
- each window emits one `GradeEvent` whose `score` is the trimmed mean (drop lowest 20%) of the `finalScore` values inside it;
- grade thresholds apply to the window score;
- combo: +1 on Good or better, reset to 0 on Miss;
- points per window: `gradePoints[grade] * min(1 + combo * comboStep, comboCap)`; total score is the sum;
- the final body-part breakdown is the mean of per-part scores over all evaluated samples.

Start with:

```ts
{
  gradeWindowMs: 1000,
  trimFraction: 0.2,
  gradePoints: { perfect: 100, great: 70, good: 40, miss: 0 },
  comboStep: 0.02,
  comboCap: 1.5
}
```

Initial grades (window score):

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
3. Set trim/start offset (`tMs` in the output is relative to the trimmed start, which is what the desktop player seeks to).
4. Set mirrored/non-mirrored semantics.
5. Run MediaPipe in VIDEO mode, following current MediaPipe Tasks Vision patterns.
6. Sample around 10 FPS using **seek-based sampling**: set `video.currentTime` to each target `tMs`, wait for `seeked`, then run inference. Do not sample from live playback; timestamps must be exact.
7. Store raw landmarks + timestamps + `imageWidth`/`imageHeight`.
8. Overlay extracted skeleton for validation.
9. Download `choreography.json`.

No server-side video processing for MVP.

## Network protocol v1

Use WebSocket first. WebRTC is deliberately postponed until scoring and pairing work reliably.

The transport is behind a project-owned interface from M5 onward:

```ts
interface PoseTransport {
  connect(roomId: string, clientToken?: string): Promise<void>;
  send(frame: PoseFrame): void;
  onGameState(handler: (state: GameState) => void): void;
  close(): void;
  readonly estimatedTransportDelayMs: number;
}
```

`WebSocketPoseTransport` is the first implementation. A `LocalPoseTransport` (in-process, zero delay) backs `/play`.

The realtime server should only:

- create room;
- join room;
- relay controller status;
- relay pose packets;
- relay host game state to the controller;
- heartbeat and ping/pong;
- keep rooms alive for a short grace period after a disconnect, then remove expired rooms.

No database.

Client → server:

```json
{ "v": 1, "type": "create-room" }
{ "v": 1, "type": "join-room", "roomId": "ABCD12", "clientToken": "..." }
{ "v": 1, "type": "controller-ready", "roomId": "ABCD12", "imageWidth": 720, "imageHeight": 1280 }
{ "v": 1, "type": "pose", "roomId": "ABCD12", "frame": {} }
{ "v": 1, "type": "game-state", "roomId": "ABCD12", "phase": "countdown" }
{ "v": 1, "type": "ping", "sentAtMs": 123456 }
```

Server → client:

```json
{ "v": 1, "type": "room-created", "roomId": "ABCD12", "clientToken": "..." }
{ "v": 1, "type": "room-joined", "roomId": "ABCD12", "clientToken": "..." }
{ "v": 1, "type": "controller-joined" }
{ "v": 1, "type": "controller-left" }
{ "v": 1, "type": "host-left" }
{ "v": 1, "type": "game-state", "phase": "playing" }
{ "v": 1, "type": "pong", "sentAtMs": 123456 }
{ "v": 1, "type": "error", "code": "room-not-found" }
```

Rules:

- `phase` is one of `idle | countdown | playing | paused | finished`; the controller runs inference only in `countdown` and `playing`.
- `clientToken` is issued on create/join and is reused on reconnect so the server can re-attach the same role. Rooms survive a disconnect for `roomGraceMs` (start with 5 minutes) and expire after inactivity. A host reload with a stored token resumes the same room.
- `pose.frame.landmarks` may be empty (no person detected); the desktop scores that as a Miss instead of freezing.
- Round coordinates to 4 decimals. `imageWidth`/`imageHeight` are sent once in `controller-ready`, not per packet.
- Validate incoming messages and limit packet size/rate. Target about 15 pose packets/sec.
- Host behaviour on controller loss: show "controller lost" and auto-pause if no pose/heartbeat for >2 s; resume when it returns.

The server must never receive camera images/video.

## Milestones

### M0 — Repository scaffold + PWA foundation

Deliver:

- pnpm workspace;
- `apps/web`;
- `apps/realtime`;
- `packages/core`;
- TypeScript strict mode;
- lint/format/test/build scripts;
- minimal CI (Playwright e2e uses the mock pose provider only);
- dev HTTPS for the web app and `wss://` for the realtime dev server (see [Local development and deployment](#local-development-and-deployment));
- `PUBLIC_WEB_URL` / `PUBLIC_WS_URL` configuration;
- Web App Manifest/PWA foundation using `vite-plugin-pwa`;
- app name/start URL/display metadata, without complex offline caching.

Upstream/reference:

- Vite/React official patterns;
- `vite-pwa/vite-plugin-pwa` for manifest/installability.

Acceptance:

- install works;
- lint passes;
- tests pass;
- production build succeeds;
- `pnpm dev --host` serves HTTPS reachable from a phone on the same LAN;
- web app has a valid manifest and can become installable where supported;
- normal browser usage does not depend on installation.

### M1 — Phone camera + pose tracking

Deliver:

- `/controller/debug`;
- camera permission flow;
- front camera selection;
- MediaPipe Pose Landmarker with `numPoses: 1` (first/largest detection wins; framing status warns when a second person is likely);
- adapter producing `PoseFrame` with aspect-correct coordinates, `imageWidth`/`imageHeight`, `inferenceMs`;
- 33-point skeleton overlay;
- FPS display;
- framing/visibility status using the shared "full body visible" rule;
- Screen Wake Lock while tracking, re-acquired on `visibilitychange`;
- mock pose provider.

Upstream/reference:

- use current `google-ai-edge/mediapipe` / MediaPipe Tasks Vision browser APIs as authoritative;
- inspect `yemount/pose-animator` only for useful camera/render-loop/skeleton ideas;
- do not copy obsolete PoseNet/TensorFlow.js choices from older examples;
- MDN Screen Wake Lock API.

Acceptance:

- a real phone shows a stable full-body skeleton;
- camera frames never leave the page;
- permission denial handled cleanly;
- the phone does not lock while tracking is active;
- controller works both from a normal browser tab and installed-PWA launch where supported.

### M2 — Choreography extractor

Deliver:

- `/tools/choreography`;
- local video selection;
- seek-based pose extraction;
- JSON export;
- overlay validation;
- mirror metadata;
- one committed demo choreography in `content/demo` (see Content guidelines).

Upstream/reference:

- follow current MediaPipe VIDEO-mode patterns rather than inventing frame/video inference lifecycle.

Acceptance:

- a short test dance becomes choreography JSON with exact `tMs` values; landmark values are reproducible within tolerance across runs (MediaPipe inference is not bit-deterministic);
- reloading JSON reproduces aligned skeletons over video.

### M3 — Scoring engine

Deliver:

- feature extraction;
- aspect correction and scale/translation normalization;
- visibility weighting;
- mirror support;
- pose similarity;
- motion (velocity) similarity;
- temporal matching with expected lag;
- grade aggregation, combo and total score;
- debug breakdown.

Upstream/reference:

- scoring remains project-owned;
- small dance-game repos may be inspected for ideas only, never imported as scoring dependencies.

Required tests:

- identical pose scores near max;
- translation does not materially change score;
- scale/distance does not materially change score;
- same pose captured at 9:16 and 16:9 scores near max;
- wrong arm lowers corresponding component;
- low-visibility landmarks do not crash scoring;
- empty landmarks produce a zero-confidence result, not an exception;
- mirror mode swaps semantics correctly;
- a pose consistently `expectedLagMs` late scores near max;
- slightly late pose remains scoreable;
- very late pose is penalized;
- grade aggregation is deterministic for a given input sequence;
- combo increments on Good+ and resets on Miss.

### M4 — Single-device playable prototype

Deliver:

- `/play` route: reference video player + local camera pose source through `LocalPoseTransport`;
- countdown;
- grade events, score, combo;
- pause/restart;
- final summary with body-part breakdown;
- scoring debug panel (`?debug=1`) including a latency calibration slider and the measured lag histogram;
- "copy debug report" button (device, FPS, average timing offset, per-part averages).

Reference:

- Pose Animator may inspire visualization/render-loop patterns only; gameplay/scoring architecture remains ours.

Acceptance:

- correct imitation clearly scores better than intentionally incorrect movement;
- the measured lag of at least 3 people is recorded and used to confirm or adjust `expectedLagMs`.

This is the first major product checkpoint and the basis of **Prototype P1**. Do not spend heavily on networking/polish before this feels believable.

### M5 — Phone/desktop pairing

Deliver:

- room creation;
- QR code encoding `PUBLIC_WEB_URL`;
- controller join page;
- WebSocket relay implementing protocol v1;
- `PoseTransport` interface with `WebSocketPoseTransport`;
- ready state and host → controller game state;
- live pose forwarding with transport delay estimation;
- player skeleton and framing status on the desktop;
- reconnect with `clientToken` and auto-pause on controller loss;
- host diagnostics.

Acceptance:

- separate phone + desktop pair successfully;
- phone normally joins by scanning QR, not typing an address;
- gameplay works without transmitting raw video;
- temporary disconnect can recover where possible;
- scoring feel is comparable to `/play` after transport delay correction.

Keep the WebSocket protocol intentionally simple and project-owned. Do not add WebRTC yet. This milestone produces **Prototype P2**.

### M6 — Browser/performance/PWA hardening

Test at minimum:

- Android Chrome;
- iPhone Safari;
- desktop Chrome.

Also investigate actual target Smart-TV browsers only after the desktop/laptop display path is stable.

Handle:

- permission denial;
- unavailable camera;
- phone rotation;
- background tab / installed-PWA lifecycle, including wake lock re-acquisition;
- network disconnect;
- video buffering;
- slow inference;
- camera cleanup on unmount;
- PWA update/reload behavior.

Use HTTPS in production.

Measure MediaPipe performance before considering another engine. If MediaPipe is inadequate on an important device class, benchmark `tensorflow/tfjs-models` MoveNet behind a `PoseProvider` interface before deciding to add it.

### M7 — WebRTC DataChannel

Only after M5/M6 are stable.

Add `WebRtcPoseTransport` as a second implementation of the `PoseTransport` interface defined in M5. Keep `WebSocketPoseTransport` as fallback/debug transport. Reuse the realtime server for signaling only.

Upstream/reference:

- inspect and follow relevant `webrtc/samples` patterns for `RTCPeerConnection`, offer/answer, ICE and RTCDataChannel lifecycle;
- do not design those flows from scratch if an official sample covers them.

Raw camera video is still never transmitted; DataChannel carries pose packets only.

Scoring code must not change.

### M8 — Polish

After scoring is validated:

- animated grades;
- combo effects;
- performance summary;
- move-aligned scoring windows produced by the extractor;
- choreography selection;
- difficulty metadata;
- optional install/home-screen UX polish;
- eventually multiplayer.

Small dance-game demos may be inspected for interaction/game-feel ideas, but should not become dependencies without explicit review.

## Prototype checkpoints

### Prototype P1: first testable version (after M4)

P1 is the first version of the application that other people can use. It is the M4 single-device build deployed to a public HTTPS URL with one demo choreography bundled. A tester opens the URL on a laptop with a webcam (or on a phone alone, in the same tab), presses Play, follows the video, and gets live grades, score, combo and a final summary. There is no room/QR pairing yet; the pose source is the local camera through `LocalPoseTransport`.

Nothing in P1 is throwaway: M5 only swaps the local transport for the WebSocket one.

Scope, in order (thin vertical slice):

1. M0 scaffold including dev HTTPS.
2. M1 reduced to: camera permission, MediaPipe live-stream mode, skeleton overlay, FPS, wake lock, mock pose provider. PWA install polish can wait.
3. M2 reduced to: extract one demo choreography once and commit the JSON. The tool UI may stay rough.
4. M3 in full, with tests.
5. M4 `/play` with the debug panel and "copy debug report".
6. Deploy the static build to any static host over HTTPS (no relay needed). Add a `pnpm deploy` script or CI job.
7. Tester kit in `docs/TESTING.md`: setup (2–3 m from the camera, full body visible, lighting), what to try (follow properly, then deliberately wrong, then lag on purpose), and a feedback template (fairness 1–5, which grades felt wrong, device/browser, FPS from the overlay, pasted debug report).

Acceptance:

- opens from a plain HTTPS URL on desktop Chrome, Android Chrome and iOS Safari without install;
- correct imitation scores clearly higher than wrong movement for at least 3 different people;
- measured lag distribution from testers is recorded and used to set `expectedLagMs` before M5;
- no crash when the person leaves the frame or the camera is denied.

### Prototype P2: paired version (after M5)

P2 = P1 + phone pairing, deployed with the relay behind WSS. Same tester kit plus pairing, reconnect and "does it feel the same as single-device" questions. Milestone order stays M4 → P1 → M5 → P2 → M6.

## Local development and deployment

`getUserMedia` requires a secure context, so a phone opening `http://<lan-ip>:5173` gets no camera. HTTPS is needed from M1, not only in production.

Local:

```bash
pnpm install
pnpm dev            # web on https://localhost:5173 (self-signed), realtime on wss://localhost:8080
pnpm dev --host     # expose on LAN; phone opens https://<lan-ip>:5173 after trusting the cert once
pnpm build && pnpm preview
```

- Use `@vitejs/plugin-basic-ssl` or mkcert for the dev certificate; document the one-time trust step on Android and iOS.
- Offer a tunnel alternative (cloudflared/ngrok) for iOS, where self-signed certificates are painful.
- The host must not assume `window.location` is reachable from the phone. QR codes and the transport use `PUBLIC_WEB_URL` / `PUBLIC_WS_URL`, which default to the current origin in production and to the LAN address in dev.

Routes: `/` (host), `/play` (single-device game), `/controller/:roomId`, `/controller/debug`, `/tools/choreography`.

Deployment target for the MVP: static web build on any HTTPS static host plus one small Node relay behind WSS (or a single Node server serving both). P1 needs only the static part.

### Hosting choice

**Static web app (P1): Cloudflare Pages.** Free, deploys from CI on push, gives a stable HTTPS URL for the QR code and for `PUBLIC_WEB_URL`. Serve the demo video from Cloudflare R2 (free egress) if it grows beyond a few MB. GitHub Pages is an equivalent free fallback if Cloudflare Pages is ever unavailable.

**Relay (P2 and later), options considered:**

| Option                                                         | Cost                       | Notes                                                                                                                                                                                          |
| -------------------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Laptop + Cloudflare Tunnel (`cloudflared`) or Tailscale Funnel | free                       | Fastest way to get a real HTTPS/WSS URL for the first P2 sessions, no deploy step, WebSockets work. Only reachable while the machine is on; good for early testing, not for a persistent link. |
| Fly.io small machine                                           | ~$2–3/mo                   | Cheapest always-on option; pick a region near testers to keep the pose-relay hop short.                                                                                                        |
| Render or Koyeb free tier                                      | free                       | Fine for testing; Render's free tier sleeps after idle, which causes a 30–60 s cold start right when someone scans the QR code.                                                                |
| Hetzner or DigitalOcean VPS + Caddy                            | ~€4–6/mo                   | Most control; one box can serve both the static build and the relay, Caddy handles TLS automatically. More ops work than the alternatives.                                                     |
| Cloudflare Workers + Durable Objects                           | free tier, then ~$5/mo     | Lowest latency and a natural one-object-per-room model, but requires rewriting the relay from Node `ws` to the Workers runtime. Only worth it if committing fully to Cloudflare.               |
| Home mini-PC/Raspberry Pi + Cloudflare Tunnel                  | domain cost only (~$10/yr) | Permanent free self-hosting; availability depends on the home connection.                                                                                                                      |

Chosen path: **Cloudflare Pages for the static app**, and for the relay start with a **laptop + Cloudflare Tunnel** for P2 test sessions, then move to **Fly.io** once an always-on relay is needed. Revisit if traffic or latency requirements change.

A real domain is worth buying early: iOS Safari is unfriendly to self-signed certificates, and every option above works smoothly once there is a real hostname to point at.

## Content guidelines

The demo choreography in `content/demo` must be:

- self-recorded or otherwise licensed for redistribution (no commercial dance/music assets, see `AGENTS.md`);
- one dancer, full body visible at all times, fixed camera, no cuts, landscape or portrait but constant;
- 20–40 s long for P1;
- recorded with the dancer facing the camera and `mirrored: true`, unless deliberately testing the non-mirrored case.

## Debug tooling is mandatory

Create a developer overlay showing:

- reference skeleton;
- player skeleton;
- selected player timestamp;
- timing offset and the running lag histogram;
- estimated transport delay and inference time;
- total score;
- per-limb score;
- visibility and framing status;
- packet rate;
- inference FPS;
- active scoring parameters, with a latency calibration slider.

Treat this as core infrastructure for tuning scoring.

## Privacy/security

- Raw camera video stays on phone.
- Do not store live player poses by default.
- Explicit camera permission required.
- Room codes are random, short-lived, and expire.
- Validate/rate-limit realtime messages.
- Do not accept arbitrary remote video URLs in MVP choreography tool.
- PWA/service-worker caching must not accidentally persist camera data or live pose streams.

## Codex execution rules

Implement one milestone at a time, in order.

For each milestone:

1. Read this entire plan and `AGENTS.md`.
2. Read `docs/UPSTREAM.md` and inspect the upstream references relevant to the milestone.
3. Prefer current official APIs/examples over old blog/tutorial code.
4. Inspect existing project code first.
5. Implement the smallest complete vertical slice.
6. Add/update tests.
7. Run lint, tests and production build.
8. Fix failures instead of disabling tests.
9. Update progress notes if useful.
10. Commit with a focused message.

Do not build the whole application in one giant pass.

When adapting non-trivial code from an upstream repository, check its license and retain required notices/attribution. Do not paste large chunks merely because they work; adapt the smallest pattern that fits our architecture.

## Definition of MVP done

MVP is done when:

- desktop creates room + QR;
- phone joins without installing an app;
- phone camera tracks one full body;
- raw camera video never leaves phone;
- controller is optionally installable as a PWA on supported phones;
- desktop plays one reference choreography;
- player poses reach desktop at stable rate;
- scoring tolerates modest timing error, and a typical player lagging the video by ~200 ms is not penalized into Miss;
- Perfect/Great/Good/Miss works;
- score + combo work;
- correct imitation consistently beats deliberately incorrect movement;
- framing feedback is visible on the desktop;
- debug overlay explains scoring;
- app runs over HTTPS on real phone + desktop.
