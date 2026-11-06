# Workout Companion — Implementation Specification v1.0

Source of truth for the product contract. Condensed from the user's spec, complete on
every requirement that code or tests must satisfy. The design doc that implements this
is `docs/designs/workout-companion.md`.

**Product:** a personal workout *execution* app. Import a program as JSON; the app
guides the user through exercises, sets, rest and transitions. Not a social network,
not a general fitness tracker, not an AI chatbot.

**Platform:** web, mobile-first PWA, primary device iPhone. Client-side only, no backend.

## 1. Core principles

1. The user always knows what to do next.
2. Every workout is executable offline.
3. Progress is never lost after refresh or accidental closure.
4. Timers stay accurate when the tab is backgrounded.
5. The engine is deterministic and testable without React.
6. UI is optimized for one-handed mobile use.

## 2. Screens

**Home** — app header, next scheduled workout, start/resume button, this week's
schedule, last session summary, link to program management. If an unfinished session
exists, a prominent **Resume Workout** replaces Start as the default action.

Reference layout:

```text
WORKOUT COMPANION

UP NEXT
Saturday · Workout B

Full Body
6 exercises · ~40 minutes

[ START WORKOUT ]

THIS WEEK
Monday       Workout A     Completed
Tuesday      Tennis
Thursday     Tennis
Saturday     Workout B     Upcoming

LAST SESSION
Workout A
42 minutes · 6 exercises
```

The week list in this example contains activities the app does not model (Tennis). v1
renders only imported programs there; non-app entries are a display gap, not a data
model requirement.

**Program manager** — import JSON from file or pasted text, validate, show errors with
field paths, preview, save, edit, delete. Multiple programs. No natural-language input.

**Active workout** — full viewport, minimal chrome. Shows workout name + elapsed time,
overall progress, exercise name, image, instructions, set X of Y, target reps,
prescribed weight, complete-set button, rest timer, next-exercise preview. Three visual
modes: exercise, rest, exercise-complete. Completing a set must never require a screen
change.

**Summary** — duration, exercises completed, sets completed, sets skipped, actual reps,
actual weights, total volume, comparison with previous session, optional RPE 1–10, save
and return home.

**History** — completed sessions accessible per program.

## 3. Workout JSON contract

```json
{
  "schema_version": 1,
  "id": "workout-b",
  "name": "Workout B",
  "description": "Full body strength training",
  "schedule": { "day": "saturday" },
  "estimated_duration_minutes": 40,
  "exercises": [
    {
      "id": "floor-press",
      "name": "Dumbbell Floor Press",
      "sets": 3,
      "reps": { "min": 10, "max": 12 },
      "weight": { "value": 5.8, "unit": "kg", "per_hand": true },
      "rest_seconds": 90,
      "instructions": ["Keep your body straight"],
      "image_url": "https://example.com/press.png",
      "muscle_groups": ["chest", "triceps"]
    }
  ]
}
```

Required: `schema_version`, `id`, `name`, `exercises[]`; per exercise `id`, `name`,
`sets`, `reps`, `rest_seconds`.
Optional: `description`, `schedule.day` (one of `monday`…`sunday`),
`estimated_duration_minutes`, `weight` (`value`, `unit` `kg|lb`, `per_hand`),
`instructions[]`, `image_url`, `muscle_groups[]`, `common_mistakes[]`, `equipment[]`.

Validation rules: exercise ids unique per program; `sets` positive integer; reps
`min > 0`; `max >= min`; `rest_seconds` integer 0–600; `weight.value >= 0`; image URL
valid http(s); unknown `schema_version` rejected with a useful error. Errors are
actionable with field paths, e.g. `exercises[2].sets: Expected a positive integer.`
Nothing invalid is silently dropped.

## 4. Engine

Statuses: `ready | exercise_active | resting | paused | exercise_complete | completed |
abandoned`.

State carries: `sessionId`, `programId`, `status`, `currentExerciseIndex`,
`currentSetIndex`, `startedAt`, `pausedAt`, `totalPausedMs`, `restStartedAt`,
`restDurationSeconds`, `exerciseRecords[]`, `updatedAt`.

Transitions:

```
ready --START--> exercise_active --COMPLETE_SET--> resting --REST_FINISHED--> exercise_active
exercise_active --COMPLETE_SET on last set--> exercise_complete --NEXT--> exercise_active
exercise_complete --(last exercise)--> completed
any active/resting --PAUSE--> paused --RESUME--> previous
resting --SKIP_REST--> exercise_active
active/resting --SKIP_EXERCISE--> exercise_complete
```

Also: `UNDO_LAST_SET`, `UPDATE_SET_RESULT`, `ADJUST_REST`, `ABANDON_SESSION`. Invalid
transitions are rejected, not ignored silently.

Set completion records actual reps and actual weight (both may differ from the
prescription), marks the set complete, then rests or advances.

Rest timer math, timestamps only — never a decrementing counter:

```ts
const remaining = Math.max(0, Math.ceil((restStartedAt + restDurationSeconds * 1000 - Date.now()) / 1000));
```

UI may repaint every 250–500 ms; the timestamp is the source of truth. On return from
background (Page Visibility API), recompute, detect expiry, and show the correct state.
Reload must recover the same remaining time.

Rest controls: pause, resume, skip rest, +15 s, −15 s, restart. Rest **never silently
advances** to the next set: expiry shows an alert (visual, vibration where available)
and waits for the user.

## 5. Persistence

IndexedDB via Dexie. Persist after every meaningful event: start, complete set, skip
set/exercise, pause, resume, change weight/reps, complete exercise, complete workout.
Store a **program snapshot** with each session so later program edits never rewrite
history. Transactional writes for related records.

Recovery on startup: find active/paused session → load latest state → reconcile timer →
show Resume. Never overwrite an unfinished session.

## 6. Records

Per set: `setNumber`, `targetReps {min,max}`, `actualReps`, `actualWeightKg`,
`completed`, `completedAt`. Per session: program snapshot, start/finish timestamps,
exercise order, actual sets and reps, actual weights, skipped exercises, notes, RPE.
Progress: best reps at weight, highest weight, total reps, volume (weight × reps),
session duration, completion rate. Unilateral exercises: never double-count weight.

## 7. Visual guidance

Per exercise: name, image/illustration, target muscles, instructions, common mistakes,
optional equipment. Assets stored or cached locally for offline use. Missing image
shows a clean placeholder, never a broken image. No external image API during a workout.
Image must not push primary controls below the fold.

## 8. UX / design system

Premium, minimal, "focused training instrument". Dark theme default, high contrast,
neutral backgrounds, one accent color, large numeric typography, large touch targets.

Mobile: full-height layout, safe areas respected, ≥44×44 px targets, no horizontal
scroll, one-handed reach, no hover-dependent interaction, minimal modals, primary action
in a consistent location.

Accessibility: semantic HTML, keyboard navigation, labels, contrast, reduced motion,
visible focus, screen-reader descriptions, state never conveyed by color alone.

## 9. PWA

Manifest, service worker, icons, offline app shell, cached assets, IndexedDB, install
instructions. Usable offline after first install. iOS cannot run JS while suspended, so
timestamps are authoritative. Screen Wake Lock where available, graceful fallback. Do
not promise background notifications or continuous vibration on iOS.

## 10. Engine API

Actions: `startWorkout(programId)`, `completeSet(actualReps, actualWeightKg)`,
`pauseWorkout()`, `resumeWorkout()`, `skipRest()`, `adjustRest(seconds)`,
`skipExercise()`, `undoLastSet()`, `updateSetResult(setNumber, result)`,
`finishWorkout()`, `abandonWorkout()`.
Selectors: `getCurrentExercise()`, `getCurrentSet()`, `getExerciseProgress()`,
`getWorkoutProgress()`, `getRemainingRestSeconds()`, `getNextExercise()`,
`getSessionSummary()`.

UI dispatches actions; no component mutates session records.

## 11. Errors to handle

Invalid JSON, unsupported schema version, duplicate exercise ids, missing required
fields, corrupt saved session, IndexedDB unavailable, interrupted save, reload during
active workout, timer expiry while backgrounded, missing image, starting a workout while
one is active. Errors are visible, understandable, recoverable. Never silently delete an
active session.

## 12. Tests

Engine unit tests without React: start state; complete set records reps; complete set
starts configured rest; rest expiry enables next set; last set advances exercise; final
exercise ends session; pause/resume keep timer correct; +/− rest works; undo restores
previous valid state; refresh restores session; backgrounded timer reconciles; skipped
exercise recorded; invalid JSON rejected; history unchanged after program edit.

E2E (Playwright): import Workout B → start → complete set → verify timer → reload →
resume → finish → verify summary and stored history.

## 13. Acceptance criteria

JSON import works; validation errors understandable; programs saved and reopened;
sessions start; current exercise always visible; actual reps and weights recordable;
rest timer correct; timer accurate across backgrounding and reload; pause/resume work;
exercises skippable; sets undoable; active sessions recoverable; completed sessions
saved; history accessible; PWA installable; offline after install; mobile layout works
on iPhone; engine tests pass.

## 14. Phases

1. **Foundation** — Vite + React + TS, Tailwind, structure, Zod schemas, import +
   validation, IndexedDB. *Deliverable: imports, validates, stores programs.*
2. **Engine** — state machine, progression, set records, timer, pause/resume, undo,
   skip, unit tests. *Deliverable: engine works with no UI.*
3. **Interface** — home, program manager, active workout, rest timer, summary.
   *Deliverable: end-to-end workout.*
4. **Persistence/recovery** — persist transitions, recovery, timer reconciliation,
   transactions, error recovery. *Deliverable: reliable interrupt recovery.*
5. **PWA/polish** — manifest, SW, icons, wake lock, responsive, a11y, Playwright.
   *Deliverable: installable offline app.*

## 15. Out of scope for 1.0

Accounts, cloud sync, AI coaching, natural-language input, nutrition, social, sharing,
Apple Watch, wearables, auto exercise recognition, video recording, payments.

## 16. Fixture — Workout B, Full Body

| Exercise | Sets × reps | Weight | Rest |
|---|---|---|---|
| Push-ups | 3 × 6–10 | — | 90 s |
| Dumbbell Floor Press | 3 × 10–12 | 5.8 kg per hand | 90 s |
| One-arm Dumbbell Row | 3 × 10–12 | 5.8 kg | 90 s |
| Goblet Squat | 3 × 10–12 | 5.8 kg | 90 s |
| Overhead Triceps Extension | 2 × 10–12 | 5.8 kg | 60 s |
| Biceps Curl | 2 × 10–12 | 5.8 kg per hand | 60 s |

Prescriptions are defaults; actual weights and reps are editable during the session.

## 17. Engineering principle

**The engine is the product; the UI is its interface.** Correctness of transitions,
persistence and timing beats visual complexity.
