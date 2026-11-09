# UI review — workout companion

Method: `scripts/qa-shots.mjs` captures 65 states (5 viewports × every screen), records
layout boxes and every interactive target under 44 px, then two vision models reviewed the
screenshots against the HIG/Material/WCAG rubric in `docs/qa-plan.md`. Every claim was
re-checked against the DOM before it became work.

## Verified and fixed

| # | Issue | Evidence | Fix |
| --- | --- | --- | --- |
| 1 | Workout route was the only screen with no column cap: 1214 px-wide drawing on a laptop | `e-1280x800-08-set.png`, `main` width 1280 | `max-w-md` on the workout `main` |
| 2 | "How to do it" (i) was 32×32 | `metrics.json` small targets | 44×44 |
| 3 | Reps ± steppers were 36×36 | `metrics.json` | 44×44 |
| 4 | Bodyweight sets printed `6×0`, and the summary showed `Volume 0 kg` | summary text from a device run | weight dropped when zero, volume card hidden when 0 |
| 5 | Dev-only "Sync from data/programs (dev)" link shipped in the UI | `b-390x844-02-programs.png` | `import.meta.env.DEV` |

After the fixes: 0 targets under 44 px at 390×844, 375×667 and 1280×800; desktop main
capped at 448 px; workout stage overflow still 0.

## Verified, not yet fixed (design decisions, not bugs)

1. **Header is 144 px of a 667 px screen (22 %).** Program name, elapsed clock, Pause, Auto,
   Undo, End, a progress bar and the set/exercise line. On 375×667 this is why the drawing
   drops to 68 px. Merging the elapsed clock into the progress line would free ~44 px.
2. **The break screen is mostly empty.** `REST` in a 300 px gap, nothing about what comes
   next. The same gap on the desktop run is ~500 px. Filling it with the next exercise
   (name, target, drawing) turns dead space into preparation.
3. **Between exercises the card still shows the finished lift.** `getCurrentExercise`
   returns the exercise you just finished while the label says the break is before the
   next one.
4. **The how-to sheet is a full screen**, content at the top, `Close` top-right — the
   furthest point from a thumb. A bottom sheet with a 44 pt close bar fixes reach.
5. **Program detail cards:** artwork ~450 px tall pushes sets/rest/`How` below the fold,
   so six exercises need six scrolls. Cap the art, put `3 × 6–10 · 90 s rest` on the card.
6. **Pause loses the rep target.** With auto on, a paused set shows only the frozen clock;
   the target should stay visible.
7. **Home copy:** "Start anyway" and the three-paragraph Install block. The block is
   permanently in the bottom third of the busiest screen.
8. **The disabled primary reads as broken.** `Complete set` is accent at 40 % opacity for
   the first second (double-tap guard). Keep the guard, soften the look.

## Rejected after checking

- "Empty history screen is blank" — the empty state exists; the capture ran before
  IndexedDB loaded. Real issue is smaller: there is no loading placeholder, so a slow
  device shows a blank frame.
- "Primary button looks muddy/disabled" — genuine at capture time only (the 700 ms guard).
  Tracked above as item 8.
- "Delete the REST watermark" — `REST` was requested by the product owner; item 2 above
  keeps the word and spends the rest of the space.

## Plan

**Phase A — done in this pass.** The five fixes above.

**Phase B — layout pass (needs a design note + `/goldfish`).** Header compaction, break
screen content, next-exercise card, paused state context. One change set, because they all
trade the same vertical space.

**Phase C — secondary screens.** Program card density, how-to as a bottom sheet, Home copy,
loading placeholder.

Thresholds for B: drawing ≥ 25 % of stage height at 390×844 and ≥ 15 % at 375×667; header
≤ 110 px; no screen scrolled without reason.
