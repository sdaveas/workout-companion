# Auto mode, one-screen workout, and a navigation contract — Design

Status: implemented in phase 6. Adds timed (auto) execution, a workout screen that never needs
scrolling, and a uniform back/home control on every view, on top of phases 1–5.

Read the existing engine first: `docs/spec.md` §4, `docs/designs/workout-companion.md`
§2.4–§2.8. This document keeps every rule those two set and names the one place it
deliberately bends them (§2.3: "rest never advances silently"). Where the older
design's §2.6 says "no rest between exercises", the code already does rest during
`exercise_complete` (`reduce.ts:150-166`, `rest.ts:7`); auto mode builds on the
implemented behaviour, and this line is the record of that gap.

---

## 1. Problem

The app counts reps. In the gym the user does not want to count reps, tap
"Complete set", wait for a rest timer, then tap again. They want to put the phone
down and have the session run on a clock:

1. reps become time: each set is budgeted in seconds from the prescription
   (`reps × seconds-per-rep` for that movement);
2. one tap after picking up the weight starts an auto run: set time, rest between
   sets, rest between exercises, next set — all advancing on their own;
3. at any moment the user can skip the current stage, add rest time, add set time,
   and see where they are in the stage and in the whole workout;
4. the workout fits one viewport. A previous session failed because adjusting reps
   required scrolling and the stepper was missed;
5. every view has a way back, and a view with no parent offers Home instead.

The hard part is (2). The product contract says timers never advance on their own
(spec §4: "Rest never silently advances"), and the engine deliberately has no
clock. Auto mode is a *chosen* exception, so it must be scoped: only when the user
turns it on, only on the timestamped stage clock, never a decrementing counter,
and reversible at any time.

Existing code this builds on:

- `src/engine/reduce.ts` — pure reducer, events carry `now`, `updatedAt` is the only write.
- `src/engine/rest.ts` — rest is `restStartedAt + restDurationMs`; remaining is derived.
- `src/store/sessionStore.ts` — the only place `Date.now()` enters, plus `saveSession`
  (with `engine/ids.ts` for ids and `hooks/useNow.ts` for the display tick).
- `src/screens/ActiveWorkout.tsx` — renders the visual modes and owns the footer.
- `src/data/exercises.ts` — `patternFor(name)` returns one of seven patterns or `null`.

---

## 2. Technical Plan

### 2.1 Decisions at a glance

| Concern | Decision |
|---|---|
| Seconds per rep | Derived at runtime from the movement pattern + a short, ordered override list. No program schema change. |
| Set budget | `round(reps.max × secondsPerRep)`, clamped to ≥5 s. The max of the range, so the budget holds the top of the prescription. |
| Held exercises | An explicit name list (plank, holds, carries, dead hang, wall sit, L-sit): `secondsPerRep = 1`, because their `reps` already mean seconds. |
| Auto state | `mode`, `stageStartedAt`, `stageDurationMs`, `stagePausedMs` on `WorkoutState`. Stage remaining = same math as rest. |
| Auto transitions | A pure `dueAction(state, now)` selector returns an **existing** action; a hook dispatches it. |
| New engine events | `START_AUTO`, `STOP_AUTO`, `EXTEND_STAGE` only. |
| Manual mode | No auto advance, no stage clock. **No engine behaviour changes at all** except the new optional fields. |
| Final exercise's break | The engine still records it (an existing test pins it); `dueAction` ignores it when there is no next exercise, so auto never waits. |
| Advance anchor | Every new stage anchors at `now`, so a long background gap advances one stage, never a cascade. |
| Hidden page | The driver does nothing while the document is hidden; on return, a >120 s absence turns auto off for a set and freezes a rest. |
| Reps recorded | Natural expiry records `reps.max` (the budget's target). "Done now" records the draft. Skip records skipped. |
| Visibility | Elapsed, stage countdown, set X of Y, exercise X of Y, projected time left — one non-scrolling column. |
| Layout | `h-dvh` + `overflow-hidden`; the middle is `min-h-0`; instructions and the End confirm are overlays. |
| Navigation | One `ScreenHeader`. Every route declares its parent; Home is the fallback. No `history.back()`. |
| Persistence | New fields are optional; old sessions and backups load unchanged. No DB version bump. |

### 2.2 Seconds per rep — the numbers and why

A rep is budgeted as a whole (concentric + eccentric + transition). The literature
supports 2–6 s for controlled training: reps outside ~0.5–8 s are either ballistic
or pointless slow, and >10 s per rep buys nothing (GymAware, "Slow vs Fast reps");
the tempo review in *Sports Medicine* (PMC8310485) uses 2–3 s per phase as its
comparison baseline; the practical default is a controlled ~2 s eccentric with an
intent-driven concentric (Brookbush Institute). Hypertrophy is similar across
tempos when effort is equal (Stronger by Science), so this table is a *budget*, not
a prescription — it only has to be close enough that the timer ends near the last
rep.

| Pattern | s / rep | Reasoning |
|---|---|---|
| `curl` (biceps, triceps, wrist, calf) | 2.5 | Short range, small joint: ~1 s up, ~1.5 s down. Matches the "biceps ~2 s" intuition. |
| `raise` (lateral/front/rear raise, shrug, fly) | 2.5 | Same short lever, controlled. |
| `push` (press, push-up, dip) | 3 | ~1 s up, ~2 s down; longer path than a curl. |
| `pull` (row, pulldown, chin-up) | 3 | Pull + controlled lower. |
| `core` (crunch, rollout, leg raise) | 3 | Slow, deliberate; holds are handled separately. |
| `squat` (squat, lunge, leg press, step-up) | 4 | Two-joint, long range; heavy squats are slower than presses. |
| `hinge` (deadlift, RDL, hip thrust, good morning) | 4.5 | Brace + long pull; deadlift resets on the floor each rep. |
| unknown name / `null` pattern | 3 | Middle of the evidence range. |

Overrides are checked in order, first match wins, case-insensitive:

| # | Match | s / rep | Why |
|---|---|---|---|
| 1 | `HOLD` = `/\b(side plank\|plank\|hollow( body)? hold\|l-sit hold\|pallof hold\|superman hold\|plate pinch hold\|pinch hold\|static hold\|dead hang\|active hang\|bar hang\|farmer'?s? carry\|suitcase carry\|wall sit)\b/`, **unless** `DYNAMIC_PLANK` = `/\bplank (hip )?(jack\|shoulder tap\|walk\|walkout\|up\|dip)\b/` matches | 1 | `reps` is already seconds. The exclusion keeps dynamic work (plank jack, side plank hip dip) at 3 s/rep. |
| 2 | `/\b(romanian deadlift\|rdl)\b/` | 4.5 | No floor reset, still long. **Must precede `deadlift`.** |
| 3 | `/\bdeadlift\b/` | 5 | Floor reset between reps. |
| 4 | `/\b(kettlebell )?swing\b/` | 2 | Ballistic hinge. |

The list is explicit rather than a bare `\b(hold|carry|hang)\b`: "Hanging Leg Raise"
and "Hanging Knee Raise" are rep work at 3 s, "Hang Clean" is not a hold, and
"Hanging" must not match `hang` (no word boundary after it). Tests pin all traps,
including the catalog's "Hollow Body Hold", "L-Sit Hold" and "Side Plank Hip Dip".

Implementation: `src/engine/tempo.ts`

```ts
export function secondsPerRep(name: string): number
export function setBudgetSeconds(exercise: Pick<ProgramExercise, 'name' | 'reps'>): number
```

`setBudgetSeconds` returns `Math.max(5, Math.round(reps.max * secondsPerRep(name)))`,
in **seconds**. It imports `ProgramExercise` and `patternFor` only; `data/exercises`
is a pure table with no React or storage, so this is a new but acceptable
engine → data edge. `time.ts` inherits it through `estimatedRemainingMs`.

### 2.3 Auto mode: time-driven without breaking the clock rule

The engine still never reads the clock and still stores no countdown. A stage is
the same shape as rest:

```
remaining = max(0, min(stageStartedAt + stageDurationMs − now, stageDurationMs))
```

The upper clamp matters: the display tick can be a few ms behind the dispatch that
starts a stage, and without it a 30 s stage would briefly read `00:31`. The stage
clock is **only meaningful** while `mode === 'auto'` and
`status === 'exercise_active'`; it is set when such a stage starts, cleared when it
ends, and frozen in `stagePausedMs` while paused. Rest reuses the existing
`restStartedAt` / `restDurationMs`. `exercise_complete` already carries the
between-exercise break in those rest fields.

Progression is derived due-ness plus an explicit dispatch:

```ts
// src/engine/auto.ts
export function dueAction(s: WorkoutState, now: number): WorkoutAction | null
```

| State, auto | Condition | Returned action |
|---|---|---|
| `exercise_active` | `stageStartedAt != null` and stage remaining 0 | `COMPLETE_SET` with `reps.max` and `draft?.weightKg ?? ex.weightKg` |
| `exercise_active` | `stageStartedAt == null` (clock not started) | `null` — never fire on a missing clock |
| `resting` | rest remaining 0 | `REST_DONE` |
| `exercise_complete` | no next exercise, **or** rest remaining 0, **or** no rest clock | `NEXT_EXERCISE` |
| anything else, or `mode !== 'auto'` | — | `null` |

The final-exercise row is what prevents a ghost break before "Finish". The engine
still records that rest (an existing per-hand test pins `restDurationMs`, and manual
mode's UI already hides it); auto simply does not wait on it.

The caller (`useAutoAdvance`) ticks at 250 ms while auto is on and dispatches at
most one action per `now` value (a ref). Every branch changes status or restarts a
clock, so the next tick's `dueAction` is null; there is no loop. This keeps the
reducer deterministic and testable with fixed `now`, and makes auto mode exactly as
recoverable as the rest timer: reload mid-set, the stage clock is in the saved
state, the remaining time is recomputed.

**Reps recorded.** The budget is built from `reps.max`, so natural expiry records
`reps.max`: the clock is the rep counter. **Done now** records the draft stepper's
value (`draft?.reps ?? ex.reps.min`, `draft?.weightKg ?? ex.weightKg ?? null`), and
the stepper stays live during an auto set. A stepper change alone does not affect
natural expiry. The summary shows one line on auto sessions
(`Auto session · reps are the timed target`) so History is not silently comparing
two different things.

Three controls are all the new reducer surface:

- `START_AUTO` — allowed from `exercise_active`, `resting`, `exercise_complete`;
  rejected from `ready`, `paused`, `completed`, `abandoned`. Sets `mode='auto'`.
  Only in `exercise_active` does it also start a clock:
  `stageStartedAt=now`, `stageDurationMs=setBudgetSeconds(exercise) * 1000`,
  `stagePausedMs=null`. Mid-rest, only `mode` flips: the running rest keeps its
  clock and will now auto-advance.
- `STOP_AUTO` — allowed from `exercise_active`, `resting`, `exercise_complete`.
  `mode='manual'`, stage clock cleared; a rest already running keeps running but
  stops auto-advancing. Switching is disabled while paused (the chip is hidden);
  the mode survives the pause.
- `EXTEND_STAGE { seconds }` — auto + `exercise_active` only. Rebases the stage onto
  `now` with ±seconds, clamped to `[now, now + 600 s]`, exactly like `rebaseRest`.
  A `−15 s` that reaches zero therefore ends the set on the next tick. Rest keeps
  using `ADJUST_REST`; the screen routes ± by status.

Stage clock bookkeeping in existing transitions (all take `now`):

| Transition | Stage clock / rest |
|---|---|
| `START` | none (manual) |
| `COMPLETE_SET` with rest | none; rest starts |
| `COMPLETE_SET` without rest, more sets | new stage at `now` if auto |
| `SKIP_SET` | new stage at `now` if auto, no rest (unchanged) |
| `REST_DONE` / `SKIP_REST` → `beginSet` | new stage at `now` if auto |
| `NEXT_EXERCISE` | new stage at `now` if auto |
| `SKIP_EXERCISE` | stage cleared |
| `PAUSE` (set, auto) | `stagePausedMs = remaining`, clock cleared |
| `PAUSE` (rest-like) | `restPausedMs = remaining`, rest clock cleared; `null` when there was no rest clock at all |
| `RESUME` | restore `status` from `pausedFrom`; a set stage restarts with `stageStartedAt = now`, `stageDurationMs = stagePausedMs` only when `pausedFrom === 'exercise_active' && mode === 'auto'`; a rest restarts only when `restPausedMs != null` (never invent a `restStartedAt` for a rest that never ran) |
| `UNDO` | restore the snapshot, then **turn auto off**: `mode='manual'`, stage clock cleared, a rest re-anchored at `now` if it had one |
| `FINISH` / `ABANDON` / `STOP_AUTO` | cleared |

Undo is a deliberate manual correction, and it is the one place where an anchor
cannot be trusted: a restored stage may have no clock, a zero clock, or a rest that
already expired, and any of those would make the driver fire again 250 ms later.
Turning auto off on undo makes the next action the user's, and one tap of the Auto
chip re-arms it.

"Cleared" always means `{ stageStartedAt: null, stageDurationMs: 0, stagePausedMs: null }`,
mirroring `clearedRest()`.

**Pause from the between-exercise break.** Today `PAUSE` is legal only from
`exercise_active` and `resting`. Auto mode needs to pause a break too, so add
`exercise_complete` to the legal statuses: `pausedFrom` becomes
`'exercise_active' | 'resting' | 'exercise_complete' | null`, `remainingMs` returns
`restPausedMs` when paused from either rest-like status, and `RESUME` restores the
status recorded in `pausedFrom`. No other behaviour changes.

**Silent advance, revisited.** Spec §4 forbids it because a resting user should
never be moved on without knowing. Auto mode is the user asking to be moved on;
the contract is amended only here, and only while `mode === 'auto'`. Manual mode
does not auto-advance at all.

**Hidden page.** Timers are throttled to ~1/min on Android and suspended on iOS, so
a hidden page must not be allowed to advance stages. `useAutoAdvance` does nothing
and **does not update its last-tick ref** while `document.visibilityState !== 'visible'`.
The 250 ms tick (`useNow`) also re-ticks on `visibilitychange`, so the first visible
tick arrives immediately and sees the whole absence as a gap:

- gap ≤ 120 s → apply `dueAction` normally (a screen lock during a set is fine);
- gap > 120 s and `exercise_active` → `STOP_AUTO` (auto off, clock cleared; the
  user re-arms with one tap). `PAUSE` is not used here because the stage is already
  past due, so the frozen remainder would be 0 and resuming would log a set nobody did;
- gap > 120 s and `resting` / `exercise_complete` → `PAUSE`. A rest that is past
  due resumes at 0 and ends immediately, which is correct: the break is over.

The ref is also reset whenever the status is `paused`, `ready` or `completed`, so
resuming never triggers an immediate re-pause.

**Boundary guard.** A user tapping **Done now** at the exact moment the countdown
hits zero would otherwise complete whatever stage the auto step just started (a
right hand, or the next set when rest is 0). Every auto stage has a start time, so
the primary button is disabled for the first 700 ms of a stage, mirroring today's
`justStarted` guard on the workout start.

### 2.4 Controls and what "skip a stage" means

One `skipAction(s)` selector maps the one button to the existing actions:

| Status | Action |
|---|---|
| `exercise_active` | `SKIP_SET` (records the set skipped) |
| `resting` | `SKIP_REST` |
| `exercise_complete` | `NEXT_EXERCISE` |

Per status, the screen offers exactly one primary and at most three secondaries
(one 44 px row, never a 2×2 grid):

| Status | Primary | Secondaries |
|---|---|---|
| `ready` | **Start** | — |
| `exercise_active` (manual) | **Complete set** / **Complete left hand** / **Complete right hand** (labels kept) | Skip set · Skip exercise · Pause |
| `exercise_active` (auto) | **Done now** | Skip stage · Skip exercise · Pause |
| `resting` | **Start set** when the clock is at 0, else **Skip rest** | Restart rest · Pause |
| `exercise_complete` | **Continue** / **Finish workout** | Restart rest (only while a break runs) · Pause |
| `paused` | **Resume** | — |

**Auto** is a header chip (`Auto` → `Auto on`) next to Undo and End, shown in the
three running statuses only (hidden in `ready` and `paused`). Turning it on during
a set starts that set's clock from zero; time already spent is not credited,
because manual mode has no set start time.

`−15 s` / `+15 s` sit beside the countdown in the stage panel, not in the footer:
they route to `EXTEND_STAGE` (set) or `ADJUST_REST` (rest), and are hidden when
there is no running clock (manual set, expired rest).

### 2.5 One-screen layout

`ActiveWorkout` becomes a fixed grid, never a scroll container:

```
main   h-dvh flex flex-col overflow-hidden relative
├ header (shrink-0)    [←] program · elapsed    [Auto][Undo][End]
│                      progress bar (1 px) · "Set 2/3 · Exercise 3/6 · ~12 min left"
├ <stage> (flex-1 min-h-0 overflow-hidden px-5)   ← the only flexible row
│   kicker + big number (text-6xl)
│   [−15s] [+15s]        (only while a clock runs)
│   exercise name <h1> (one line, truncate) + "10–12 reps · 5.8 kg"
│   illustration (h-20; hidden under 700 px viewport height)
│   SetEntry compact: [− 10 +] reps | [− 5.8 +] kg   (44 px targets)
│   "How to do it" → <details> with an absolutely positioned, self-scrolling panel
└ footer (shrink-0)      one primary (h-14) + one row of secondaries (h-11)
```

Height budget at 360×640 (small Android, worst case): header ~92 px, footer
~136 px, stage ~412 px. Stage content: kicker 20 + number 64 + name 28 + target
20 + steppers 72 + how-to 40 + gaps 40 ≈ 284 px, image hidden. Fits with ~120 px
to spare.

Rules: `main` is `h-dvh` **not** `min-h-dvh`; the middle row is `min-h-0`;
`Banner` errors render as an absolutely positioned toast above the footer, and the
End confirm renders as an absolutely positioned panel, so neither changes the
layout. The set's hand folds into the kicker instead of a separate 44 px row.
`SetEntry` gains a `compact` variant: two side-by-side columns with the label above
each stepper and 44 px buttons; a bodyweight exercise collapses to one column.
That is the control that was missed before, so it never leaves the viewport.

The illustration must be constrained for real: `ExerciseMotion` currently hardcodes
`aspect-[3/2] w-full` (233 px tall at 390 px width), and every exercise in Workout B
renders through it. It gains a `className` prop (default unchanged) and the stage
passes `h-20` + `object-contain`, so the compact slot is 80 px. `ExerciseImage`
gets the same optional class.

Rest copy is unchanged on purpose: the kicker stays **Rest remaining** /
**Rest before the next exercise** and the countdown is the next sibling element, so
`scripts/phase4.mjs`'s `/Rest remaining(\d{2}:\d{2})/` still matches. The paused
countdown keeps the single `p.text-6xl`.

What each status shows in the big slot:

| Status | Big slot | Under it |
|---|---|---|
| `ready` | the exercise name (as `<h1>`) | "6 exercises · 16 sets · ~40 min" and the compact illustration; Start in the footer |
| set, manual | `10–12` (target reps) | exercise name, prescription |
| set, auto | countdown `00:36` | exercise name, prescription |
| rest / break | countdown, or "Start when ready" at 0 | next set / next exercise |
| paused | frozen countdown (or the target if manual) | "Paused · Resume when ready" |

The steppers and footer do not move between modes or stages; the thumb learns one
screen.

### 2.6 Time in the whole workout

`estimatedRemainingMs(state, now)` in `src/engine/time.ts` (imports `tempo` and
`rest`; pure otherwise). It walks the **set records**, so per-hand rows each count:

```
0 when ready / completed / abandoned

for every set row from the current position onward that is not completed and not
skipped:
    first uncompleted row, and mode auto and (exercise_active or paused from it)
        → autoRemainingMs(s, now)          (frozen remainder, not a fresh budget)
    otherwise
        → setBudgetSeconds(exercise) * 1000
    plus exercise.restSeconds * 1000 unless the row is a 'left' hand or the last
    row of the program

plus remainingMs(s, now) when resting, exercise_complete, or paused from either
```

The rest is added on top of the set budget, not instead of it: while resting, the
set being waited for still has to be performed. The row that just finished is
already `completed`, so its post-set rest is not added twice. `restUsed`
adjustments are ignored; the projection uses prescriptions.

Displayed as `~12 min left` in the header strip, and `~finish 18:42` when combined
with the wall clock.

### 2.7 Navigation contract

Every view has a back control. The target is a **declared parent route**, never
`history.back()`: the app is a hash router inside a PWA, so a reload or a shared
link has no history to go back to, and iOS standalone has no browser chrome. Where
a view has no parent, the control is Home. Home itself is the root and needs
neither.

| Route | Control | Target |
|---|---|---|
| `#/` Home | none (it is the root) | — |
| `#/programs` | ← Home | `#/` |
| `#/programs/new` | ← Programs | `#/programs` |
| `#/programs/build` | ← Programs | `#/programs` |
| `#/program/:id` | ← Programs | `#/programs` |
| `#/session` | ← Home | `#/` (a started session stays alive; Home offers Resume. In `ready`, leaving resets it as today) |
| `#/summary/:id` | ← Home | `#/` |
| `#/history` | ← Home | `#/` |
| `#/settings` | ← Home | `#/` |
| `#/credits` | ← Settings | `#/settings` |
| `#/paste` | ← Programs | `#/programs` |
| `#/p/:payload` (deep link) | ← Home | `#/` |
| `#/add/:payload` | ← Home | `#/` |
| unknown hash | ← Home | `#/` |

The control is the same everywhere: `← <label>`, a 44×44 minimum target, a real
`<a href="#/...">` so it works with the browser and TalkBack/VoiceOver, and
`aria-label="Back to <target>"`. Labels stay one word (`Home`, `Programs`,
`Settings`) so the header fits 360 px.

`ScreenHeader` owns the row: `back?: { to; label; onSelect? }`, `title`, optional
`actions`. `onSelect` exists for the one screen that must do something on the way
out: leaving `#/session` in `ready` calls `reset()`. It renders as an `<a>` and
calls `preventDefault()` only when a handler is supplied. The title slot is
`min-w-0 flex-1 truncate`, and workout action chips use compact padding, because
360 px minus four 44 px controls leaves ~80 px for the name.

`#/paste` and `#/p/:payload` share `PasteProgram`; it branches on `initial`:
`#/p/…` → Home, `#/paste` → Programs. Unknown hashes currently render nothing;
`App.tsx` gets an explicit fallback screen (`<main>` + `ScreenHeader` + a Home
link) instead of the implicit Home branch.

### 2.8 Risks and limits

- Reps recorded on natural expiry are the prescription's max, not a count. The
  summary says so; History should not compare auto and manual volume. Auto sessions
  also skip the "keep today's numbers?" program-update prompt, because their reps
  are a target, not a measurement.
- The tempo table is a heuristic. The user can always +15 s or −15 s.
- Auto mode still cannot run with the phone locked (iOS suspends JS); hidden time
  before the pause is detected still counts toward the workout clock, because the
  page was never told when it stopped. The state on return is correct, the elapsed
  number can be generous.
- No notification outside the app (spec §9). One vibration per rest expiry and per
  set completion, where the browser allows it.

---

## 3. Alternatives (rejected)

1. **A decrementing timer in state (`setInterval` mutating `remaining`).**
   Dies on iOS suspension and drifts after reload; the whole app already avoids
   this for rest. Rejected — timestamps only.
2. **The reducer advances itself when `now` passes the deadline (a `tick` on
   render).** Same silent behaviour with none of the observability: hidden
   transitions, untestable, impossible to pause at the boundary. Rejected.
3. **`seconds_per_rep` / `duration_seconds` in the program JSON (schema v2).**
   Forces every saved program, backup, share link and coach prompt to migrate, and
   asks a human to hand-write tempo. Rejected: derived table, override list.
4. **Seconds per muscle group.** Deadlift and hip thrust are both
   glutes/hamstrings but 5 s vs 4.5 s; muscle is the wrong axis. Rejected.
5. **One global seconds-per-rep setting.** The user would have to change it per
   exercise, which is the work auto mode exists to remove. Rejected.
6. **Reps replaced by seconds in the record.** Volume, history comparison and the
   summary all use reps. Seconds are the *timing budget*; reps stay the record.
   Rejected.
7. **Estimate actual reps from the elapsed time.** A fabricated count is worse than
   a stated convention. Recording `reps.max` on natural expiry and the draft on
   early done is a convention the summary labels. Rejected.
8. **Auto mode as its own route/screen.** Two copies of recovery, wake lock and
   persistence. Rejected: one screen, one state machine, a `mode` field.
9. **A modal sheet per transition.** Extra taps in the middle of a set, against
   spec §8. Rejected: the stage panel changes in place; only End and the
   instructions are overlays.
10. **Notification API / background vibration to announce the end of a stage.**
    iOS PWAs do not run JS while suspended and cannot vibrate on a timer without
    user activation. Rejected; the wake lock and timestamp reconciliation remain
    the mechanism, as in spec §9.
11. **Auto starts at `START`.** The user is not under the bar yet; the first set
    would burn its budget while they set up. Rejected: auto starts on a tap after
    the workout has started.
12. **Keep the scrollable page and pin the stepper with `position: sticky`.**
    Sticky controls still lose the exercise name and timer, and iOS keyboard
    handling makes the sticky offset unreliable. Rejected: a fixed-height grid.
13. **A separate "seconds" field shown instead of reps in the workout UI.** The
    user still has to record what they did; the timer plus the live stepper is the
    honest pair. Rejected as redundant.
14. **Per-set `startedAt` in manual mode.** It would only power a manual stopwatch
    nobody asked for, and adds a field to every saved session. Rejected: manual
    shows the target reps; the workout clock is already in the header.
15. **`history.back()` for the back control.** Breaks after a reload, on a shared
    link, and in iOS standalone; it also returns to a *session* the user just left.
    Rejected: declared parent routes, Home as the fallback.
16. **Relying on the browser/PWA affordance instead of an in-app control.** iOS
    standalone has no back chrome and the Android gesture exits the PWA. Rejected.
17. **A per-screen custom back link (what exists today).** Labels and targets drift
    (`← Home`, `← Programs`, `← Add a program`) and Summary has none. Rejected:
    one `ScreenHeader` with a route table.
18. **Keeping auto on through `UNDO`.** A restored stage can be expiring, absent or
    zero-length, and the driver would fire 250 ms later. Rejected: undo returns to
    manual; one tap re-arms auto.

---

## 4. Detailed Implementation

Order matters: engine → tests → hook → screen → navigation → E2E. Every step
leaves `npm test` green.

### 4.1 `src/engine/tempo.ts` (new, ~55 lines)

- `PATTERN_SECONDS: Record<MotionPattern, number>` = the table in §2.2.
- `DEFAULT_SECONDS = 3`, `HOLD`, `DYNAMIC_PLANK`, `OVERRIDES` in the §2.2 order.
- `secondsPerRep(name)` → hold (unless dynamic plank) → first override →
  `patternFor(name)` (if non-null) → `DEFAULT_SECONDS`.
- `setBudgetSeconds(exercise)` → `max(5, round(reps.max × secondsPerRep(name)))`.

### 4.2 `src/engine/types.ts`

Add to `WorkoutState`, all optional so pre-auto sessions load:

```ts
mode?: 'manual' | 'auto';
stageStartedAt?: number | null;
stageDurationMs?: number;
stagePausedMs?: number | null;
```

Widen `pausedFrom` to `'exercise_active' | 'resting' | 'exercise_complete' | null`.

Add events:

```ts
| { type: 'START_AUTO'; now: number }
| { type: 'STOP_AUTO'; now: number }
| { type: 'EXTEND_STAGE'; now: number; seconds: number }
```

`WorkoutAction` already derives the no-`now` forms from this union.

### 4.3 `src/engine/auto.ts` (new, ~70 lines)

- `autoRemainingMs(s, now)` — the clamped formula in §2.3; 0 when `mode !== 'auto'`
  or there is no clock.
- `dueAction(s, now)` — the §2.3 table, gated on `mode === 'auto'`.
- `skipAction(s)` — the §2.4 table.
- `startStage(s, now)` (exported for `reduce`): the clock fields when
  `mode === 'auto'`, else the cleared clock.

### 4.4 `src/engine/reduce.ts`

- `START_AUTO`, `STOP_AUTO`, `EXTEND_STAGE` cases with the status guards above.
- `completeSet` / `skipSet` / `beginSet` (gains `now`) / `nextExercise`: apply
  `startStage` to the stage that comes next. `completeSet`'s rest logic is **not**
  changed.
- `pause`: legal from `exercise_complete` too; pause a set clock only when auto;
  `restPausedMs = null` when there was no rest clock.
- `resume`: restore `status` from `pausedFrom`; restore the stage clock only for
  `pausedFrom === 'exercise_active' && mode === 'auto'`; restore a rest only when
  `restPausedMs != null`.
- `skipExercise`: clear the stage clock.
- `undo(s, now)`: restore, `mode='manual'`, cleared stage clock, re-anchor a rest
  at `now` if it had one.
- `finish`, `abandon`: clear the stage clock.
- `createSession`: `mode: 'manual'`, cleared clock.

### 4.5 `src/engine/time.ts`

- `estimatedRemainingMs(s, now)` exactly as §2.6. Imports `remainingMs`,
  `autoRemainingMs`, `setBudgetSeconds`; no React, no storage.

### 4.6 `src/hooks/useAutoAdvance.ts` (new, ~55 lines)

```ts
useAutoAdvance(state, now): void
```

- Active only while `mode === 'auto'` and `status` is a running status.
- Does nothing while `document.visibilityState !== 'visible'` and leaves the
  last-tick ref alone; listens to `visibilitychange` to force a tick on return.
- First visible tick after mount records the ref without a gap check.
- Gap > 120 s: `STOP_AUTO` from `exercise_active`, `PAUSE` from rest-like states;
  then return.
- Resets the ref when the status is not running.
- Otherwise dispatches `dueAction(state, now)`, at most once per `now` value.
- No `Date.now()` — it uses the `now` passed in.

`ActiveWorkout` passes its 250 ms tick and widens that tick's condition to
`resting || exercise_complete || pausedInRest || mode === 'auto'`. The 1000 ms tick
stays for the workout clock.

### 4.7 `src/components/workout/SetEntry.tsx`

- Add `compact?: boolean`: one row, two columns, label above each stepper, 44 px
  buttons, `text-xl` value; one column when the exercise has no weight. Same
  `onChange` contract.

### 4.8 Screens and navigation

`src/screens/ActiveWorkout.tsx` + new `src/components/workout/WorkoutStage.tsx`

- Rebuild to the §2.5 grid; one stage panel renders every status so the steppers
  and footer never move.
- Keep the visible words the E2E scripts pin: **Complete set** / **Complete left
  hand** / **Complete right hand** in manual mode, **Rest remaining** and **Rest
  before the next exercise** as kickers (immediately followed by the countdown
  element), the `text-6xl` countdown, and an `<h1>` carrying the exercise name
  (`phase4.mjs` reads it). "Done now" appears only in auto.
  `scripts/phase3.mjs`, `phase4.mjs`, `phase5.mjs` must pass unchanged.
- Footer per §2.4; header per §2.5 and §2.7.
- Instructions: `<details>` with an absolutely positioned, self-scrolling panel;
  End confirm: absolutely positioned panel.
- Wake lock: add `exercise_complete` to the active condition (it is a 60–180 s
  break, and losing the lock there can suspend the timers).
- Vibration: one haptic on rest expiry (keyed by `restCount`) and one on set
  completion (keyed by `getWorkoutProgress().done`, ref initialised to null).
- `RestTimer.tsx` and `NextUp.tsx` fold into the stage panel and are deleted (one
  call site each). `ExerciseCard.tsx` is replaced by `WorkoutStage`; keep
  `ExerciseMotion` and `ExerciseDetails`, and give `ExerciseMotion` /
  `ExerciseImage` an optional class so the stage slot is 80 px, not 233 px.
- Guard the primary button for 700 ms after an auto stage starts.

`src/components/ui/ScreenHeader.tsx` (new, ~35 lines) + apply to every screen

- Props: `back?: { to: string; label: string; onSelect?: () => void }`,
  `title?: ReactNode`, `actions?: ReactNode`, `className?: string`.
- Renders `<header>` with a 44 px `<a href={to} aria-label={`Back to ${label}`}>←
  {label}</a>`, a `min-w-0 flex-1 truncate` title, then actions.
- Home passes no `back`. All other screens pass the §2.7 parent.
- Replace the ad-hoc headers in `Programs`, `ProgramDetail`, `History`, `Settings`,
  `Credits`, `AddShared`, `PasteProgram`, `Summary`; use it in `ActiveWorkout`.
  `Programs` keeps `← Programs` for `new`/`build`/edit and `← Home` for the list;
  `PasteProgram` branches on `initial` as in §2.7.
- `src/App.tsx`: explicit fallback screen for an unknown route (main + header +
  Home link) instead of rendering nothing.

`src/screens/ActiveWorkout.tsx` (continued)

- The `ready` back control passes `onSelect: reset` so a preview is not left in
  memory; a started session navigates home without reset and is resumable.

`src/screens/Summary.tsx`

- Add the `ScreenHeader` back control.
- When `mode === 'auto'`, one line under the title — `Auto session · reps are the
  timed target` — and skip the `planProgramUpdate` "keep today's numbers?" prompt
  (the reps are a target, not a measurement).

`vite.config.ts`

- Widen `test.include` to `['src/**/*.test.{ts,tsx}', 'mcp/**/*.test.ts']` so the
  component test runs.

### 4.9 Tests

`src/engine/tempo.test.ts`
- curl/raise < push/pull < squat < hinge; deadlift > goblet squat > curl.
- **Romanian Deadlift 4.5, Deadlift 5** (override order).
- **Hanging Leg Raise 3**, **Plank Jack 3**, **Hollow Body Hold 1**, **L-Sit Hold 1**,
  **Side Plank Hip Dip 3**, Plank 30–60 → 60 s, Hang Clean 2.5/3 (not a hold).
- Unknown name → 3 s; per-hand does not change the budget.
- `setBudgetSeconds` never returns <5.

`src/engine/auto.test.ts`
- `START_AUTO` from active starts a clock; from `ready`/`paused` throws; from
  `resting` only flips `mode` and keeps the rest clock.
- `dueAction` is null before the deadline and with no clock; `COMPLETE_SET` after,
  with `reps.max`.
- Set with rest → `resting`; at expiry `REST_DONE`; after `beginSet` the next stage
  clock starts at `now`.
- Final set of the **final** exercise → `exercise_complete`; `dueAction` is
  `NEXT_EXERCISE` even while the recorded rest is still running.
- Final set of a non-final exercise waits for its break.
- `EXTEND_STAGE +15` adds 15 s; `−15` clamps at 0 (the next tick completes the set);
  capped at 600 s.
- `PAUSE` freezes the stage; `RESUME` restarts the full remaining; elapsed excludes
  the pause.
- `PAUSE` from `exercise_complete` works and `RESUME` returns to it; pausing a break
  with no rest clock does not invent one on resume.
- `STOP_AUTO` clears the clock and `dueAction` returns null during the rest.
- `UNDO` turns auto off, clears the stage clock, and does not immediately re-fire.
- Serialise → `JSON.parse` → `dueAction` still correct (reload parity).
- State without `mode` behaves as manual (no `dueAction`, no throw).
- `skipAction` for `exercise_active`, `resting`, `exercise_complete`.
- `estimatedRemainingMs` is 0 when `ready`, > 0 and < the full prescription after
  `START`, drops after a completed set, freezes while paused, and counts both hands
  of a per-hand exercise but only one rest.

`src/components/ui/ScreenHeader.test.tsx`
- Renders a link with the right `href` and `aria-label`; no `back` → no link.
- `onSelect` prevents navigation and calls the handler.

`scripts/phase6.mjs` (Playwright, mirrors `phase5.mjs`)
- Two contexts: 390×844 and 360×640.
- No document scroll on ready, set, rest, exercise-complete
  (`documentElement.scrollHeight <= innerHeight + 1`); the stage container does not
  clip (`stage.scrollHeight <= stage.clientHeight + 1`); the reps stepper's bounding
  box sits above the footer.
- Start Workout B → Auto → the set completes without a tap; the rest stage appears;
  `+15s` raises the countdown; Skip stage moves on; the session finishes; History
  lists it; zero console errors.
- Every route in §2.7 renders exactly one back link with the declared target,
  including a reloaded `#/summary/:id`, a bare `#/p/<payload>` deep link and an
  unknown hash.
- Re-run `scripts/phase3.mjs`, `phase4.mjs`, `phase5.mjs` unchanged.

### 4.10 Edge cases the tests must pin

| Case | Expected |
|---|---|
| Rest 0 s between sets | no rest stage; next set's clock starts at the set's completion |
| Last set, last exercise | `exercise_complete` → `NEXT_EXERCISE` with no wait, despite the recorded rest |
| Per-hand exercise | two stages (left, right) each budgeted separately; no rest between hands |
| Hold exercise (plank / L-sit) | budget is the rep number, i.e. seconds |
| Auto off during a set | clock cleared, rest still runs but stops auto-advancing |
| Auto on mid-rest | rest keeps its clock and auto-advances; no set clock until it ends |
| Auto on mid-set | the clock starts fresh at that moment |
| Reload mid-set | remaining time recomputed from the saved clock, not restarted |
| Hidden 5 min during a set | one `STOP_AUTO`; the set is not completed |
| Hidden 5 min during a break | one `PAUSE`; no exercise is skipped |
| Undo in auto | auto turns off; the restored state does not fire |
| Old saved session (no `mode`) | treated as manual, renders, completes |
| `draft` null on an active set | completion falls back to `reps.min` / `weightKg` |
| Tap at the countdown boundary | the new stage is protected for 700 ms |
| Deep link / reload on any route | the back control still points at its parent |

### 4.11 What does not change

Program JSON, backups, share links, the coach prompt, the MCP tools, the summary
shape, the storage schema and `SessionRow.stateVersion`. Reps stay the unit of
record; the timer is a budget. `Home`, `Programs` and the builder keep their
behaviour; only their header markup moves to `ScreenHeader`.

### 4.12 Acceptance

1. `npm test`, `npm run typecheck`, `npm run build` green.
2. `grep -rn -F "Date.now" src` still hits only `engine/ids.ts`, `hooks/useNow.ts`,
   `store/sessionStore.ts` (the new hook takes `now`; it does not read the clock).
3. On 390×844 and 360×640, no document scroll in any stage, the stage itself does
   not clip, and the reps stepper is visible during a set without scrolling.
4. Every route in §2.7 has exactly one back control with its declared target; Home
   has none.
5. `scripts/phase6.mjs` passes and `scripts/phase3.mjs`, `phase4.mjs`,
   `phase5.mjs` still pass unchanged.
6. Manual: run Workout B in auto from the first set to summary; record the stage
   sequence, one skip and one +15 s in `docs/phase-status.md`.
7. Append a **phase 6 — Auto mode, one screen, back control** row to
   `docs/phase-status.md` with its gate evidence (test count, typecheck/build,
   manual result, E2E). The old design's §2.17 is not rewritten; §4.12 here is the
   phase-6 clause list.
