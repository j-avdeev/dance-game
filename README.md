# Dance Game

Browser-based dance game inspired by motion-controlled rhythm games.

A smartphone browser acts as the motion controller: it uses the phone camera and MediaPipe Pose Landmarker locally, then sends only pose landmarks to the desktop game. Raw camera video stays on the phone.

The desktop browser plays a reference choreography and scores the player's pose, motion, and timing in real time.

## Project status

**M4 complete**: the game is playable at `/play` on a single device with a camera. Phone/desktop pairing (M5) is next.

Start with [`PLAN.md`](./PLAN.md). Coding agents should also read [`AGENTS.md`](./AGENTS.md) before making changes.

## Requirements

- Node.js 22 or newer
- pnpm 11 or newer

## Local development

```bash
pnpm install
pnpm dev            # web on https://localhost:5173, relay on http://localhost:8080
pnpm dev --host     # also expose on the LAN, so a phone can reach it
```

The dev server serves **HTTPS** because `getUserMedia` requires a secure context; a phone opening a plain `http://<lan-ip>:5173` gets no camera at all. The certificate is self-signed, so the phone shows a warning once, which you accept manually.

On iOS, where self-signed certificates are painful, run a tunnel instead and disable dev HTTPS:

```bash
DANCE_GAME_DEV_HTTPS=false pnpm dev --host
cloudflared tunnel --url http://localhost:5173
```

Then set `VITE_PUBLIC_WEB_URL` to the tunnel address so the pairing QR code points somewhere the phone can reach. See [`.env.example`](./.env.example).

## Validation

```bash
pnpm lint        # eslint + prettier
pnpm typecheck   # tsc across all workspace projects
pnpm test        # vitest unit tests
pnpm build       # production build of every package and app
pnpm test:e2e    # playwright, against the built app
```

Playwright needs its browser once: `pnpm exec playwright install chromium`.

MediaPipe never runs in CI. End-to-end tests cover routing and the PWA manifest, and pose-dependent tests will use the mock pose provider.

## Layout

```text
apps/web/         React + Vite client (host, player, controller, extractor)
apps/realtime/    Node WebSocket relay and signaling server
packages/core/    framework-free pose, scoring and protocol logic
content/demo/     self-recorded reference video and choreography JSON
e2e/              Playwright specs
```

## Routes

| Route                 | Purpose                           | Milestone |
| --------------------- | --------------------------------- | --------- |
| `/`                   | Desktop host: room, QR, gameplay  | M5        |
| `/play`               | Single-device game (prototype P1) | done      |
| `/controller/:roomId` | Phone controller, paired          | M5        |
| `/controller/debug`   | Pose development without pairing  | done      |
| `/tools/choreography` | Choreography extractor            | done      |

Append `?mock=1` to `/controller/debug` to run the deterministic mock pose provider instead of MediaPipe. It needs no camera, no model download and no GPU, which is how the end-to-end tests exercise the page.

## Testing pose tracking on a phone

1. Run `pnpm dev --host` and note the `https://<lan-ip>:5173` address.
2. Open `https://<lan-ip>:5173/controller/debug` on the phone and accept the certificate warning once.
3. Allow camera access, then prop the phone 2-3 m away at roughly waist height.
4. The framing badge turns green once your whole body is visible, from head to feet.

The pose model is about 6 MB and downloads on first use. The MediaPipe wasm runtime is served from this app rather than a CDN: `pnpm dev` and `pnpm build` copy it into `apps/web/public/mediapipe/`, which is generated and gitignored.

## Making a choreography

Open `/tools/choreography`, select a self-recorded video, and extract a reference pose
timeline. Sampling is seek-based, so timestamps are exact and a re-run reproduces the same
grid. Play the video back afterwards: the green skeleton must track the dancer.

A demo dance is committed at `content/demo/`: a 44 s portrait clip and its extracted
timeline, 443 samples at 10 Hz with the dancer detected in every one. See
[`content/demo/README.md`](./content/demo/README.md) to replace it.

## Playing it

```bash
pnpm dev
```

Open `https://localhost:5173/play`, allow the camera, stand back so your whole body is in
frame, and press Start.

| Query flag | Effect                                                          |
| ---------- | --------------------------------------------------------------- |
| `?mock=1`  | Synthetic poses instead of the camera; no model or GPU needed   |
| `?debug=1` | Tuning panel: measured lag, calibration slider, copyable report |

[`docs/TESTING.md`](./docs/TESTING.md) is the kit to hand to a tester.

## Scoring

The scoring engine lives in `packages/core` and is pure and deterministic. See
[`docs/scoring.md`](./docs/scoring.md) for how a performance becomes a number and why the
model is built the way it is.

The engine is validated against the committed demo choreography, not only synthetic poses:
a correct performance averages 100 with no misses, while dancing the wrong moves or
standing still both score below 60.

## MVP principle

Prove that scoring feels fair before spending time on graphics, multiplayer, accounts, leaderboards, or a large choreography library.
