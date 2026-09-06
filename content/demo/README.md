# Demo choreography

The reference dance used by the single-device prototype (P1) and by local development.

| File                | What it is                                                      |
| ------------------- | --------------------------------------------------------------- |
| `demo.mp4`          | The reference video, 720x1280 portrait, 44 s, H.264, 6.9 MB     |
| `choreography.json` | Pose timeline extracted from it, 443 samples at 10 Hz, mirrored |

The extraction detected the dancer in all 443 samples, and every one passes the shared
"full body visible" rule. `demoChoreography.test.ts` in `packages/core` guards that, so a
change that degrades the file fails the build rather than showing up later as scoring that
feels wrong.

The committed video is re-encoded at CRF 26. The original was 9 Mbps and 49 MB, which is
far more than pose estimation needs: extracting from both produced the same 443 usable
samples, and landmarks differed by about 7 px on average, within the model's own
frame-to-frame noise.

## Replacing the demo

Record a new video, then re-extract:

1. Save the recording as `content/demo/demo.mp4`.
2. Run `pnpm dev` and open `/tools/choreography`.
3. Select the video, set the title, and trim to the part that should be scored.
4. Leave the sample rate at 10 Hz and mirrored on.
5. Click **Extract poses**, then play the video back. The green skeleton must track the
   dancer. If it lags, drifts, or attaches to the wrong limbs, fix the recording rather
   than accepting the extraction.
6. Download the JSON and save it here as `choreography.json`.

There is also a scripted path that drives the same tool page end to end and writes the
file directly:

```bash
pnpm build
pnpm exec playwright test e2e/extract-demo.spec.ts --workers=1
```

It takes several minutes for a 44 s clip and fails if more than 5% of samples come back
without a dancer.

## What to record

Follow the content guidelines in [`PLAN.md`](../../PLAN.md):

- self-recorded, or otherwise licensed for redistribution. Do not commit commercial dance
  or music assets;
- **whole body visible at all times, including feet.** This is the constraint that matters
  most: the framing rule needs both shoulders, hips, and ankles, so a foot leaving the
  frame produces samples the scorer cannot use;
- fixed camera, no cuts, no zoom, constant orientation;
- 20 to 40 seconds;
- the dancer faces the camera, so the export keeps `mirrored: true`;
- even lighting. Avoid strong backlight, such as a bright window behind the dancer;
- clothing that contrasts with the background, and only one person in frame.

Format and resolution are flexible. H.264 MP4 plays everywhere; 720p to 1080p is plenty,
since MediaPipe downscales internally. Portrait and landscape both work, because the
extractor stores the frame size and aspect-corrects the landmarks.

Keep the first choreography simple and slow. P1 exists to find out whether scoring feels
fair, and a fast, complex routine makes it impossible to tell a scoring bug from a missed
step.

Everything runs in the browser. The video is never uploaded.
