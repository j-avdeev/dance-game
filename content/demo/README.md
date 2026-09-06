# Demo choreography

This directory holds the reference dance used by the single-device prototype (P1) and by
local development. **It is currently empty: the demo video has to be recorded by a person.**

Two files belong here once that recording exists:

| File                | Origin                                                          |
| ------------------- | --------------------------------------------------------------- |
| `demo.mp4`          | The reference video, recorded by you                            |
| `choreography.json` | Exported from `/tools/choreography` after extracting `demo.mp4` |

## Recording the video

Follow the content guidelines in [`PLAN.md`](../../PLAN.md):

- self-recorded, or otherwise licensed for redistribution. Do not commit commercial dance
  or music assets;
- one dancer, whole body visible at all times, from head to feet;
- fixed camera, no cuts, no zooming, constant orientation;
- 20 to 40 seconds long;
- the dancer faces the camera, so the exported choreography keeps `mirrored: true`;
- even lighting and a plain background make the extraction noticeably cleaner.

Simple movements work best for the first choreography. The point of P1 is to find out
whether scoring feels fair, and a busy routine makes it hard to tell whether a low score
came from the dancer or from the scoring.

## Producing choreography.json

1. Put the recording at `content/demo/demo.mp4`.
2. Run `pnpm dev` and open `/tools/choreography`.
3. Select the video, set the title, and trim to the part that should be scored.
4. Leave the sample rate at 10 Hz and mirrored on.
5. Click **Extract poses**, then play the video back. The green skeleton must track the
   dancer. If it lags, drifts or attaches to the wrong limbs, fix the recording rather
   than accepting the extraction.
6. Download the JSON and save it here as `choreography.json`.

The tool warns when the dancer was undetected in more than 5% of samples. Treat that as a
reason to re-record, not as a number to ignore: the scoring engine has nothing to compare
against for those moments.

Everything runs in the browser. The video is never uploaded.
