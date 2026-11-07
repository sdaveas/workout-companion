# Program updates after a workout

## Problem

The program says 3 × 8–10 at 20 kg and 90 s rest. On the day the user does 6 reps at 22.5 kg
and takes 105 s. Today that knowledge dies with the session: the program keeps lying, and the
user edits it by hand or never does.

We want to ask, once, at the end of a workout: keep today's numbers? Nothing is written without
an explicit tap.

## Technical Plan

1. **Remember the rest actually taken.** `ADJUST_REST` and `RESTART_REST` write
   `restUsed[exerciseIndex]` (seconds). Only adjustments are recorded, so an untouched rest never
   shows up as a change. `restUsed` is optional in the persisted state; old sessions read as empty.
2. **Derive a plan, don't apply it.** `planProgramUpdate(session, program)` in
   `src/lib/programUpdate.ts` returns `{ name, lines, json }` or `null`:
   - weight → the value every completed set used, when it differs from the program
   - reps → the performed min–max, **only when it fell outside the prescribed range**
   - rest → `restUsed[i]`, when it differs
   - an exercise the user skipped → removed
   - no changes, or a plan that would empty the program → `null`
3. **Mutate the stored program, not the session's copy.** The raw JSON comes from the program
   currently in storage, matched by exercise id, so edits made after the workout started survive.
   Weight keeps the unit the program was written in (lb stays lb).
4. **Ask on the summary.** A panel lists the lines and offers "Update the program" /
   "Keep it as it was". Only the session that just finished offers it — reopening history does not.
   Applying goes through the existing `setText` + `save({ update: true })`, so the id, the name
   and the conflict rules are unchanged.

## Alternatives

- **Auto-apply everything.** Rejected: rewrites the plan on a bad day, and it is exactly the
  silent overwrite we promised never to do.
- **Always rewrite reps to what was done.** Rejected: 9 reps inside 8–10 means the plan worked;
  rewriting the target to 9–9 there destroys the intent. Only a miss (6 of 8, 12 of 10) rewrites.
- **Track a rest preference as ±deltas.** Rejected: the final duration is the preference; deltas
  need explaining in the UI and produce the same number.
- **Remove skipped exercises without asking.** Rejected: skipping because the rack was busy is not
  a statement about the program. It is offered as one line of a confirmed plan instead.
- **Store the plan and apply it later from history.** Rejected: a stale plan against a program the
  user has since edited is a bug factory.

## Detailed Implementation

- `src/engine/types.ts` — `WorkoutState.restUsed?: number[]`.
- `src/engine/reduce.ts` — `rememberRest()` used by `adjustRest()` and `restart()`.
- `src/lib/programUpdate.ts` — the planner, pure, on raw JSON.
- `src/screens/Summary.tsx` — the panel, wiring to the programs store.
- `src/lib/programUpdate.test.ts` — weight/reps/rest/remove, no-change, never-empty.
- `scripts/scenarios.mjs` scenario 15 — 2 exercises, reps short, +15 s rest, accept, verify the
  builder shows 6 reps and 75 s.
