# Testing the dance game (prototype P1)

Thanks for trying this. The prototype exists to answer one question: **does the scoring
feel fair?** Everything else, graphics included, comes later.

You need a laptop or phone with a camera and about ten minutes.

## Setup

1. Open the link you were sent. Nothing to install.
2. Allow camera access when asked. Video never leaves your device; only the positions of
   your joints are used, and nothing is uploaded.
3. Prop the device **2 to 3 m away**, roughly waist height, so your **whole body from head
   to feet** is in the camera view. This is the one setup detail that really matters.
4. Stand facing the screen with room to move your arms.
5. The badge under the camera preview turns green when your framing is right. Wait for
   that before starting.

Good lighting helps. Avoid standing with a bright window behind you, which silhouettes you
and makes tracking worse.

## What to try

Do all four, in this order. The comparison between them is the useful part.

1. **Follow the dance properly.** One full run, doing your genuine best.
2. **Deliberately dance wrong.** Move to a different rhythm, or use the wrong arm on
   purpose. The score should drop clearly.
3. **Stand completely still** for about ten seconds mid-song. This should score badly.
4. **Lag on purpose.** Copy each move about half a second late. Note whether that feels
   unfairly punished.

## Sending feedback

Open the page again with `?debug=1` on the end of the address, do one more run, then press
**Copy debug report** and paste the result along with your answers below.

```text
Fairness, 1 to 5 (5 = felt completely fair):

Did the score match how well you thought you danced?

Which moments felt wrong, and what were you doing at the time?

Did anything feel unresponsive or delayed?

Device and browser:

Anything else:

--- paste the debug report here ---
```

The single most useful line in that report is `measured lag`. It records how far behind
the video you actually were, and it is what the timing model gets tuned against. The value
is currently assumed to be 200 ms for everyone, which is a guess until enough people have
run this.

## Known rough edges

These are known and do not need reporting:

- No music, and no visual polish. The reference video plays silently.
- One short demo dance only.
- Scores near the boundary between two grades can flicker between them.
- Movement directly toward or away from the camera is barely detected, because the
  prototype scores in two dimensions only.
- The first load downloads about 6 MB of pose model and 7 MB of video.

Please do report: crashes, a frozen skeleton, the camera failing to start, scores that
stay at zero, or anything that made you stop and wonder whether the game was broken.
