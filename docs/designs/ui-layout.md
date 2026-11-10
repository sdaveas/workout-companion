# Design — one-screen workout layout, second pass

Goal: the exercise illustration is the thing you look at during a set, and today it is the
smallest thing on the screen. This pass buys vertical space from chrome that repeats
information, and fills the break screens with the only content that is useful there: what
comes next.

## Problem

Measured at 375×667 by `scripts/qa-shots.mjs`, active set, current `HEAD`:

| Band | Height | Contents |
| --- | --- | --- |
| header | 144 | pad 16 · back row 44 · gap 4 · clock+controls row 44 · gap 8 · workout bar 4 · gap 8 · meta line 16 |
| stage | 382 | kicker 16 · clock 48 · `reps` 16 (manual only) · name row 44 · target line 20 · exercise bar 10 · illustration card 94 · stepper 86 · pads/gaps 54 |
| footer | 141 | pad 12 · primary 56 · gap 8 · skip row 48 · pad 16 · 1 border |

The illustration card is **94 px** in a manual set and **110 px** in an auto set (the `reps`
label only renders when `!auto`). The drawing inside is the card minus 26 px of inset and
border: **68 px** manual, **84 px** auto. At arm's length that is not a form cue, it is a
shape. At 360×640 it is 41 px, because the previous pass grew the stepper and `(i)` buttons
to 44 px and the stage pays for it.

Larger phone for reference: 390×844 gives a 256 px card (its `max-h-64` ceiling), 230 px of
drawing — legible, and the ceiling means extra space there is currently wasted anyway.

Three other states are wrong for reasons that share the same space:

1. **Breaks are 300+ px of nothing.** The `rest-cue` is the word `REST` centred in the
   leftover stage. Nothing says which set or which lift comes next, so the largest area on
   the screen carries one word.
2. **Between exercises the finished lift is still the loudest text.** `getCurrentExercise`
   keeps returning the finished record until `NEXT_EXERCISE`, and the stage's `<h1>`, `(i)`
   button and target line render unconditionally — so the "rest before the next exercise"
   screen headlines the exercise that is over, and `(i)` explains that one. Breaks already
   hide the *drawing*; they do not hide the *name*.
3. **The header spends 24 px on a meta line that duplicates the workout bar** (set number,
   exercise number, time left), and the manual set spends another 16 px on the word `reps`
   under a number that is obviously reps.

Non-goals: no engine change, no new screen, no scrolling, no change to auto-mode timing.

## Technical Plan

Spend space on the illustration in this order, cheapest first:

1. **Fold the meta line into the back row.** Its second line becomes
   `Set 1 / 3 · Ex 1 / 6`, and the estimated time joins the elapsed clock
   (`12:34 · 33 min left`). Saves 24. The row is already 44 px tall and holds two 12 px lines.
2. **Move `End` to the header's `actions` slot** as the same plain muted button it is today.
   Pause / Auto / Undo are the clock controls; `End` is an escape hatch. No height change.
3. **Tighten the workout header's top padding** 16 → 12 through a new explicit `dense` prop
   on `ScreenHeader` (see Detailed Implementation — not via `className`, which loses the
   cascade). Saves 4.
4. **Delete the `reps` label** under the big number (manual sets only). The target line below
   the name already says `3 × 6–10`. Saves 16.
5. **Delete the in-stage exercise progress bar.** The workout bar already draws set notches
   inside each exercise chunk and the meta line states the set. Saves 10.
6. **Tighten footer padding** `pt-3`/`pb-4` → `pt-2`/`pb-3`, safe-area max kept. Saves 8.
7. **Give the break screens content**: the word `REST` at `text-4xl` (not `text-5xl`) plus
   two short lines naming what comes next. No illustration on any break — the owner asked
   for the word instead of a figure, and a break is not a set.
8. **Hide the name / `(i)` / target block during a break** so the coming lift is the only
   name on screen.
9. **Raise the illustration ceiling** `max-h-64` → `max-h-72`, only if the overflow check
   still reads 0 on all five viewports. Without it, header savings are wasted at 390×844
   because the card already sits on 256 px.
10. **Trim the exercise SVGs to their content box.** `ExerciseMotion` draws the file with
   `maskSize: contain`, which fits the whole square *canvas* — a wide pose such as
   `push-up` (content ~351×199 inside a 512 canvas) rendered a small figure in a wide card.
   Measuring the alpha bounding box and rewriting `width`/`height`/`viewBox` makes `contain`
   fit the pose, not the canvas. **One box per exercise, shared by both poses** (the union):
   `scripts/align-art.mjs` bakes pose 2's scale relative to pose 1 into the file, and a
   per-file box would normalise that difference away. Data-only, 60 files, 30 shared boxes.

Expected result at 375×667: header 112, footer 133, stage 422, illustration card ~154,
drawing **~128 px** (manual and auto converge, because killing the `reps` label removes the
only difference between them). A `perHand` exercise lands at the same height: its hand chips
cost 38 px but its weighted stepper is one row (44 px) against bodyweight's two stacked rows
(Reps row + `Bodyweight` line), a −32 px offset. At 360×640: card ~127, drawing ~101. At 390×844: card 288,
drawing ~262.

### What must not change

- `src/engine/**` untouched. No `Date.now()` in render; timestamps and `useNow` only.
- Auto mode: `dueAction`, `useAutoAdvance`, the 250 ms tick, `STAGE_GUARD_MS`, haptics.
- One screen, no scrolling: `document.scrollHeight <= clientHeight`, stage
  `scrollHeight <= clientHeight` at 430×932, 390×844, 375×667, 360×640, 1280×800 — **in every
  stage, including `resting` and `exercise_complete`**, which are the states this pass
  changes most.
- Targets ≥ 44×44: stepper, `(i)`, `Pause`, `Auto`, `Undo`, `End`, back.
- Test hooks scripts depend on: `stage`, `stage-big` (phase 4), `footer`, `stepper`
  (phase 6). No script uses `exercise-progress` or `rest-cue`; keep both anyway — they are
  free and they document intent.
- Safe areas on header top and footer bottom.

## Alternatives

| Option | Why rejected |
| --- | --- |
| Shrink the stepper to win pixels | It is the only logged input, and 44 px targets are not negotiable on a phone held by a tired hand. |
| Let the stage scroll | Violates the one-screen requirement, which is the product. |
| Auto-hiding header | Nothing scrolls, so nothing triggers it; a timer that vanishes mid-set is worse than a small drawing. |
| Move Pause/Auto/End back into the stage | The owner explicitly asked for the controls next to the elapsed timer. |
| Drop the meta line instead of folding it | Set and exercise position was an explicit requirement. Folding keeps it for free. |
| Primary button 56 → 48 px to gain 8 | It is the most-tapped control in the app; take the 8 from padding instead. |
| Delete `Restart rest` | Saves 48 on break screens, but break screens are the ones with room to spare. Not worth the behaviour change. |
| Show the next exercise's illustration during a break | A break is rest: the owner asked for no figure there. Text only. |
| Replace `REST` with `Up next` | The owner asked for the word `REST`. Keep it, add the next-up lines under it. |
| Third header row for the set position | Adds 24 px to buy nothing over the two-line back row. |
| Paused should keep the rep target | Already does: the target line under the name is unconditional while a set is on screen. No work. |
| Leave the finished lift's name up during a break, add "up next" under it | Two names on one break screen, the wrong one louder. Hide it instead. |
| Keep `REST` on an expired break | "Rest complete / REST / Start set" reads as two contradictory states; the word belongs to a running timer. |

## Detailed Implementation

All edits in `src/screens/ActiveWorkout.tsx` unless stated.

### 1. `ScreenHeader` gets an explicit `dense` prop

`src/components/ui/ScreenHeader.tsx`: two `pt-*` arbitrary utilities on one element resolve by
stylesheet order, not by class order, so passing `className="pt-[...]"` is not a reliable
override. Add a prop and emit exactly one class:

```tsx
dense = false,   // in the signature
className={`shrink-0 px-5 ${
  dense ? 'pt-[max(0.75rem,env(safe-area-inset-top))]' : 'pt-[max(1rem,env(safe-area-inset-top))]'
} ${className}`}
```

Default is unchanged for every other screen.

### 2. Header

```tsx
<ScreenHeader
  dense
  back={{ to: '#/', label: 'Home', compact: true, onSelect: isReady ? () => { reset(); navigate('#/'); } : undefined }}
  title={
    <div>
      <p className="truncate text-xs uppercase tracking-[0.2em] text-muted">{state.program.name}</p>
      {!isReady && <p className="truncate text-xs tabular-nums text-muted">{metaLine}</p>}
    </div>
  }
  actions={!isReady ? (
    <button
      type="button"
      onClick={() => setEnding((v) => !v)}
      aria-expanded={ending}
      className="h-11 shrink-0 rounded-xl border border-line px-3 text-sm text-muted"
    >
      End
    </button>
  ) : undefined}
>
  {!isReady && (
    <>
      <div className="mt-1 flex min-h-11 items-center gap-2">
        <p className="text-xl font-semibold tabular-nums" aria-label="elapsed time">
          {formatClock(elapsedMs(state, now))}
        </p>
        <p className="text-xs text-muted">{`${formatDuration(estimatedRemainingMs(state, now))} left`}</p>
        <div className="ml-auto flex shrink-0 gap-2">
          {/* Pause, Auto, Undo exactly as today; End removed from here */}
        </div>
      </div>
      <div className="mt-1">
        <ProgressBar … />
      </div>
    </>
  )}
</ScreenHeader>
```

`metaLine` = `Set {formatSet(null, state.currentSetIndex + 1, record?.sets.length ?? 0)} · Ex {state.currentExerciseIndex + 1} / {state.program.exercises.length}`. Pass `null` for the side: the kicker already says `Work · left hand`, and the side is what makes the line long enough to truncate `Ex n / m` at 360 px.

Notes:
- Use a plain `<button>`, not `ui/Button`: `Button` hard-codes `min-h-12`, which would make
  the row 48 px and push the header to 116.
- `estimatedRemainingMs` returns 0 on `ready`, which formats as `<1 min`; the `!isReady` guard
  is what keeps that off the pre-start screen.
- `ScreenHeader` already wraps `title` in `min-w-0 flex-1`, so `truncate` works.

### 3. Stage: hide the lift identity on breaks

Gate the name row, the `(i)` button and the target line together:

```tsx
{(inSet || isReady) && exercise && ( … name row … )}
{(inSet || isReady) && exercise && ( … target line … )}
```

The drawing is already gated on `inSet`. Delete the `reps` paragraph and the
`exercise-progress` block with `getExerciseProgress` / `getSetBoundaries` / `exerciseProgress`
/ `setMarks` from this file. `getSetBoundaries` stays (it is unit-tested); `getExerciseProgress`
and `getNextSet` have no callers and no tests once this lands, so delete them from
`src/engine/selectors.ts` and from `docs/spec.md` rather than leaving dead engine API.

### 4. Break block

Replace the `restingNow` div. `restingNow` is `!isReady && !inSet`, which is also true while
paused during a break, so classify with the pause origin, not the raw status:

```tsx
const breakSource = state.status === 'paused' ? state.pausedFrom : state.status;
const inStandingRest = breakSource === 'resting';
const inExerciseBreak = breakSource === 'exercise_complete';
const restIsTimed = state.restStartedAt != null && restLeft > 0;
const repsText = (r: { min: number; max: number }) => (r.min === r.max ? `${r.min}` : `${r.min}–${r.max}`);
```

Render (the word is gated on a *running* timer in both branches, and an exercise break only
counts if there is something coming next):

```tsx
{restingNow && (
  <div data-testid="rest-cue" className="mt-2 flex min-h-0 flex-1 flex-col items-center justify-center gap-3 text-center">
    {restIsTimed && (inStandingRest || (inExerciseBreak && !!nextExercise)) && (
      <p className="text-4xl font-semibold uppercase tracking-[0.3em] text-muted">Rest</p>
    )}
    <div className="min-w-0 space-y-1">
      {inStandingRest && exercise && (
        <>
          <p className="text-base font-semibold">{`Next · set ${formatSet(side, state.currentSetIndex + 1, record?.sets.length ?? 0)}`}</p>
          <p className="truncate text-sm text-muted">{exercise.name} · {repsText(exercise.reps)} reps</p>
        </>
      )}
      {inExerciseBreak && nextExercise && (
        <>
          <p className="text-base font-semibold">{`Up next · ${nextExercise.name}`}</p>
          <p className="truncate text-sm text-muted">
            {nextExercise.sets} × {repsText(nextExercise.reps)} · {formatWeight(nextExercise.weightKg, nextExercise.perHand)}
          </p>
        </>
      )}
      {inExerciseBreak && !nextExercise && <p className="text-base font-semibold">Last exercise done</p>}
    </div>
  </div>
)}
```

Rules encoded above:
- The word `REST` appears only when a break timer is running. An expired rest (`restLeft === 0`,
  kicker "Rest complete", footer "Start set") must not still shout `REST`; and after the last
  set of the final exercise the engine keeps a real rest clock
  (`auto.ts:76-79`, `auto.test.ts:93`), so `restIsTimed` alone is not enough — the exercise
  break also requires `nextExercise`.
- Pausing during an exercise break keeps `Up next`, because `breakSource` uses `pausedFrom`.
- Fixed-rep exercises print `10`, not `10–10`. (The stage target line keeps its existing
  `10–10` form; normalising it is a copy change outside this pass.)
- No set ordinal on the exercise break: an ordinal computed from the current record would
  name the finished exercise's sets, not the next one. A guessed ordinal is worse than none.

### 5. Footer and the End panel

Footer: `pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]` (the skip row is 48 px because
`Button` sets `min-h-12`).

The confirm panel is `absolute inset-x-5 bottom-24` and would now sit inside a 133 px footer.
Move it to `bottom-44` (176 px), which clears the footer at every size including a 34 px
home-indicator inset. The error banner is already at `bottom-44` and needs no change.

### 6. Illustration ceiling

In the `inSet` block, `max-h-64` → `max-h-72` on both `ExerciseMotion` and `ExerciseImage`.
Revert `max-h-72` alone if the 430×932 or 1280×800 overflow check fails; keep the rest.

## Verify

Dev server: `npm run dev -- --port 5183` (the scripts hard-code 5183; `npm run dev` alone
serves 5173).

`scripts/phase6.mjs` has no 375×667 section and its `noScroll` helper returns only
`{document, stage, stepperAboveFooter}`. Extend it:

```js
// noScroll now also returns:
header: document.querySelector('header')?.getBoundingClientRect().height ?? 0,
art: document.querySelector('[data-testid="stage"] .exercise-frame-base')?.getBoundingClientRect().height ?? 0,

const layoutOk = async (page, label, minArt = 0) => {
  const m = await noScroll(page);
  check(m.document <= 1, `${label}: no page scroll (${m.document}px)`);
  check(m.stage <= 1, `${label}: stage does not clip (${m.stage}px)`);
  check(m.stepperAboveFooter, `${label}: reps stepper sits above the footer`);
  check(m.header <= 116, `${label}: header is compact (${m.header}px)`);
  if (minArt > 0) check(m.art >= minArt, `${label}: illustration is legible (${m.art}px)`);
};
```

`art` is the masked layer's box, not the visible figure — the figure check is the visual
one. The threshold is viewport-specific: 120 at 390×844 and 375×667, 100 at 360×640.

Then add a second workout block at `375×667` (a new page, same fixture) next to the existing
`360×640` block, and assert both break states — standing rest and `exercise_complete` — on
the 375 block, since this pass adds ~40 px to exactly those screens:

```js
await page.getByRole('button', { name: 'Done now' }).click();   // into the rest
await page.waitForSelector('text=Rest remaining');
await layoutOk(page, label + ' rest');
// …and after the last set of the exercise, before tapping Continue:
await layoutOk(page, label + ' exercise break');
```

`qa-shots.mjs` measures `stageOverflow` in `exercise_complete` at all five viewports
(430×932, 390×844, 375×667, 360×640, 1280×800); `phase6.mjs` asserts it at 375×667.

`.exercise-frame-base` exists only in the masked branch of `ExerciseMotion`; the fixture's
first two exercises (`push-up`, `bench-press` — "Dumbbell Floor Press" resolves through the
family table) both have slugs. `art >= minArt` only runs on set states, because the easter-egg
`<img>` branch for curls renders no such element and would report 0.

Acceptance at 375×667:

| Check | Today | After |
| --- | --- | --- |
| header | 144 | ≤ 116 (expected 112) |
| footer | 141 | ≤ 136 (expected 133) |
| page scroll, every stage | 0 | 0 |
| stage overflow, every stage | 0 | 0 |
| targets < 44 px | 0 | 0 |
| drawing box, bodyweight exercise | 68 | ≥ 120 (measured 134) |
| drawing box, `perHand` exercise | — (untested today) | ≥ 120 |
| drawing box at 390×844 | 230 | 262 |
| drawing box at 360×640 | 41 | ≥ 100 (measured 107) |
| stage overflow in `exercise_complete`, all five viewports | 0 | 0 |

Run, in order: `npm test` (209), `npm run typecheck`, `node scripts/phase6.mjs`,
`HEADED=1 node scripts/phase6.mjs`, `node scripts/phase4.mjs` (paused timer still freezes,
reload restores the exact set), `node scripts/phase3.mjs`, `node scripts/qa-shots.mjs`.
For the visual check, compare `c-375x667-08-set`, `-10-auto`, `-12-rest`,
`-13-exercise-break` against the copies in `/tmp/wc-review/`.

## Result

Implemented as written, plus the SVG trim. Measured after the change (`qa-shots.mjs`):
header 144 → 112, footer 141 → 133, drawing box 68 → 134 at 375×667 and 230 → 262 at
390×844, 0 px page scroll, 0 px stage overflow, 0 targets under 44 px, `phase3`/`phase4`/`phase6`
green, 209 tests green.

## Risks

- **Weighted stepper width (fixed during implementation).** The weighted column is ~148 px at
  375 and ~141 px at 360, which could not hold the `Weight / hand` label, two 44 px buttons
  and `5.8 kg / hand` — the label wrapped and made the row 84 px tall instead of 44, costing
  the drawing 40 px. The label was redundant: `formatWeight` already prints the unit. Fixed by
  rendering it `sr-only` in `CompactStepper` (`showLabel={false}`) and dropping the
  `/ hand` suffix from the compact display (the target line above keeps it), with
  `min-w-0 flex-1 truncate` on the value so it can never wrap. Measured result: the weighted
  `perHand` exercise now draws 134 px at 375×667, the same as bodyweight.
- **`art` measures the mask box, not the figure.** The SVG trim is what makes the figure
  fill the box; if the two ever drift apart again, the number to trust is the screenshot.
- **`End` has `aria-expanded` but no `aria-controls`.** Pre-existing and untouched here; the
  confirm panel and the error banner also share `bottom-44`, so they can overlap. Worth a
  follow-up, not part of this pass.
- **Easter-egg image branch.** `ExerciseMotion` renders an `<img>` for a curl (1 in 10), with
  no `.exercise-frame-base`. The visual check must not treat that as a regression.
- **390×844 gains nothing without `max-h-72`.** The card is already on its ceiling; if the
  taller viewports clip after the change, revert that one class and accept 230 there.
- **Digit width.** The meta line is `tabular-nums` and truncated; the only thing that can
  push it is a long program name, and `truncate` handles it.
