# Pre-workout preview

## Problem

Tapping "Start workout" on Home jumped straight into a running set: the timer
started, the first set was already armed, and the only way out was End →
Abandon. A user who tapped the wrong program, or who simply wanted to see what
the session contains before committing, had to destroy a live session to back
out. Worse, the confusion is silent — the abandoned session never shows in
history, so there is no trace that a workout was ever started by mistake.

A second, related gap: Home features exactly one program. When anything is
scheduled for today, every unscheduled program disappears from the screen even
though the engine lets them be started any day and the week view still lists
them.

## Technical Plan

Two changes, both client-side:

1. **Split "open a session" from "start the clock".** `sessionStore` gains
   `prepareWorkout(programId)` (loads the program, builds a `ready` state in
   memory, writes nothing) and `startWorkout()` (dispatches `START`). The
   engine already models `ready`: `createSession` returns it and `START` is the
   only legal transition out. `#/session` renders a preview when
   `status === 'ready'`.
2. **Home stops hiding programs.** The featured card stays as is; everything
   not shown in it goes into an "Also available" list, so a scheduled day
   never shadows the unscheduled ones.

A `ready` session stays in memory only. Leaving the preview (`← Home`) calls
`reset()`, so the candidate session disappears without touching storage. A
reload during the preview also loses it, which is correct: nothing was started,
so there is nothing to recover. `Home` treats `ready` as "not active", so a
stray ready state (e.g. after the browser's back button) can never show the
"In progress" card.

## Alternatives

- **A separate `#/preview/:programId` route and component.** Rejected: it would
  duplicate the exercise card, the program header, and the back/nav handling,
  while the engine's `ready` state exists precisely to describe "loaded but not
  started". Same screen, one branch.
- **Persist the ready session.** Rejected: `storage/sessions.ts` deliberately
  never stores `ready` (START is the first write). Persisting it would resurrect
  an unstarted session on reload, show "In progress" on Home, and add a second
  writer for a state that can always be rebuilt from the program id.
- **A confirmation dialog before starting.** Rejected: a modal cannot show the
  exercise, the target reps, or the rest recipe, which is what the user wants
  to check. It also adds a tap instead of replacing one.
- **Keep every program on Home in one undifferentiated list.** Rejected: the
  "today / next / done today" card is the answer to "what should I do now" and
  must stay first. The secondary list is explicitly labelled as extra options.
- **Let the preview start the timer on tap of the exercise card.** Rejected:
  an accidental tap would start the clock; a single explicit "Start" button is
  the whole point of the screen.

## Detailed Implementation

- `src/store/sessionStore.ts`
  - `prepareWorkout(programId): Promise<boolean>` — `getProgram`, `createSession`,
    `set({ state })`, no `dispatch`, no `writeSnapshot`, no `saveSession`.
    Returns `false` and sets `error` when the program is missing.
  - `startWorkout()` — `get().dispatch({ type: 'START' })`, which stamps the
    start time and performs the first write.
- `src/screens/Home.tsx`
  - `start()` awaits `prepareWorkout` and navigates to `#/session` on success
    (the preview), on failure stays put and shows the banner.
  - `active` excludes `status === 'ready'`.
  - `otherPrograms` = programs minus the featured one; rendered as
    "Also available" whenever the featured kind is not `none` (that branch
    already lists everything).
- `src/screens/ActiveWorkout.tsx`
  - `ready` header: `← Home` (resets the state, then navigates) and the program
    name; no clock, no End, no progress bar.
  - `ready` body: the same `ExerciseCard` plus `N exercises · M sets · ~T min`.
  - `ready` footer: one primary `Start` button.
- Tests: `scripts/scenarios.mjs` scenario 9 — preview appears instead of a live
  set, nothing is written to history, `← Home` leaves no "In progress", and
  Start begins the timed workout; plus the scheduled + unscheduled pair both
  being reachable from Home.
