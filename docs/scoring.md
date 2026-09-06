# Scoring

How a performance becomes a number. Every function described here lives in `packages/core`
and is pure, so a replay produces exactly the numbers a live session did.

## The pipeline

```text
player poses ──┐
               ├─> features ──> per-sample score ──> grade windows ──> score, combo, summary
reference   ───┘
```

1. **Features** (`features.ts`). Joint angles, limb positions relative to the hip centre, and
   body orientation. Positions are divided by a body scale built from torso length and
   shoulder width, so the same move scores the same whether the dancer is near or far, left
   or right of frame.
2. **Per-sample score** (`scoring.ts`). Each reference sample is compared against the best
   matching player pose inside a timing window.
3. **Grade windows** (`grading.ts`). About ten scores per second are aggregated into one
   grade per second, which is what the player actually sees.

## Why these choices

**Angles and relative positions, never raw coordinates.** Two people performing the same
move from different distances produce completely different pixel coordinates. Comparing
raw positions would score the room, not the dance.

**Gaussian falloff, not thresholds.** Dancing is continuous. A limb 30 degrees off should
score a little worse than one 25 degrees off, not fall off a cliff at an arbitrary cutoff.

**Weighted geometric mean across body parts.** With an arithmetic mean, one completely
wrong limb costs only its own weight: a player holding an arm in entirely the wrong place
still scored about 87, comfortably inside Great. The geometric mean makes parts multiply,
so being badly wrong anywhere pulls the whole score down, and a player who is uniformly
close beats one who nails three parts and ignores two.

**Visibility weighting.** A limb the model could barely see contributes proportionally
less. Otherwise a hidden arm reads as a mistake the player never made.

**The timing model is centred on lag, not on zero.** This is the single most important
decision in the engine. A person following a video is systematically 150 to 300 ms late,
because they have to see a move before copying it. Scoring against zero offset would
grade good dancing as a Miss. The penalty peaks at `expectedLagMs` and is asymmetric:
falling further behind is more forgivable than anticipating a move nobody has shown yet.

**Best match within the window, not nearest in time.** Within the search window the engine
keeps the highest-scoring candidate. That is what lets a player who is consistently a
little off-tempo still score well.

**Trimmed mean inside a window.** One badly tracked frame in an otherwise good second
should not decide the grade for that second, so the worst 20% are dropped before
averaging.

## Tuning constants

Config lives in `config.ts`. The tolerances in `scoring.ts` are the ones most likely to
need adjusting after real testing:

| Constant              | Value | Meaning                                         |
| --------------------- | ----- | ----------------------------------------------- |
| `ANGLE_TOLERANCE_RAD` | 0.6   | Angular error scoring about 0.5, roughly 34 deg |
| `POSITION_TOLERANCE`  | 0.35  | Positional error scoring about 0.5, body units  |
| `VELOCITY_TOLERANCE`  | 1.2   | Velocity error scoring about 0.5, body units/s  |
| `expectedLagMs`       | 200   | Assumed player reaction delay                   |
| `timingWindowMs`      | 200   | Half-width of the pose search window            |

**These are starting points, not measurements.** The plan is explicit that M4 must record
the real lag distribution from several people before any threshold is tuned. The debug
overlay exposes the matched offset for exactly that purpose.

## What the tests establish

`scoring.test.ts` covers the individual behaviours on synthetic poses whose geometry is
known exactly: translation and scale invariance, aspect-ratio invariance, per-limb blame,
mirror semantics, low-visibility handling, and the timing curve.

`scoringRealData.test.ts` plays the committed demo choreography end to end and checks that
copying the dance beats not copying it, on real pose data with real noise.

That second file is not redundant. An earlier version of the engine passed every synthetic
test while scoring a flawless performance at 50 out of 100 and standing still at 45. Two
bugs caused it:

- the best-candidate comparison compared a 0-1 value against a 0-100 one, so the first
  candidate in the window always won regardless of quality;
- `mirrorLandmarks` swapped left/right indices without reflecting the coordinates, leaving
  the body inside out and every angle feature wrong.

Both were invisible to unit tests that never asked the end-to-end question.

## Known limits

- **`expectedLagMs` is a guess** until measured with real players in M4.
- **Only 2D is used.** MediaPipe's depth estimate is too noisy to score, so a move toward
  or away from the camera reads as no movement. World landmarks are stored in the
  choreography for a later revisit.
- **Fixed one-second windows** do not align to musical beats. The choreography format
  already supports explicit windows, so move-aligned grading can arrive without changing
  the grading code.
