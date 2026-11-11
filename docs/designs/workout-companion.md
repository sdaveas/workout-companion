# Workout Companion — Design

Implements `docs/spec.md` (the product contract). This document decides **how**, and
records what was rejected so it doesn't get re-proposed.

Status: phases 1–2 implemented (`src/schemas`, `src/storage`, `src/engine`); §2–§4 below
remain the plan for phases 3–5. Live status: `docs/phase-status.md`.

Rule of precedence: where this document and the spec disagree on a *field name* or an
API signature, this document wins (called out inline, e.g. `restDurationMs`). Where they
disagree on a *product requirement*, the spec wins — the two places we deliberately fall
short are named in §2.16, not hidden.

---

## 1. Problem

We need an app that runs one specific thing well: taking a JSON program and moving a
person through it, set by set, in a gym, on an iPhone, offline, with a phone that may be
locked, backgrounded, or reloaded mid-set.

The spec is unusually complete about *what*, but three things are genuinely undecided and
each one, decided wrong, breaks the product:

1. **Where time lives.** A timer that decrements in a JS interval dies when iOS suspends
   the tab. The spec's own formula reads `Date.now()` inside engine logic — untestable and
   non-deterministic. Time must enter the engine through the event, and remaining time
   must be *derived*, never stored.
2. **What "never advance silently" means against a state machine that says
   `resting --REST_FINISHED--> exercise_active`.** These contradict. If expiry is a
   transition, the machine advances alone. If expiry is derived, no transition is needed
   at all.
3. **What the unit of persistence is.** Normalized per-set rows mean a set can be
   half-written: the session row says resting, the sets table missed the last set. The
   first principle is "never lose progress", so the write unit must be atomic.

Everything else (React, Zustand, Dexie, Tailwind, Zod, Vite) is settled by the spec.

**Non-goal:** a nice UI. A plain UI over a correct engine is shippable; a beautiful UI
over a wrong engine wastes the workouts it records.

---

## 2. Technical Plan

### 2.1 Decisions at a glance

| Concern | Decision |
|---|---|
| Engine | Pure reducer `reduce(state, event) → state`. One file, no classes, no library. |
| Clock | Engine never reads the clock. Every event carries `now: number`; the store stamps it. |
| Rest expiry | Derived (`remainingMs(state, now) === 0`). No automatic transition. |
| Persistence unit | One `state` JSON blob per session row. IndexedDB via Dexie. |
| Writes | Immediate, serialized through one promise chain. No debounce. |
| State shape | Self-contained: program snapshot lives *inside* `WorkoutState`. |
| Undo | 10 snapshots **without** the program snapshot; only progress events push. |
| Storage tables | `programs`, `sessions`, `settings`. |
| Routing | ~30-line hash router. No router dependency. |
| UI state | Zustand holds `WorkoutState`; the reducer is the only mutator. |
| Styling | Tailwind v4 via `@tailwindcss/vite`. Tokens in one CSS file. |
| PWA | `vite-plugin-pwa` autoUpdate, single bundle (no lazy chunks). |
| Tests | Vitest on `reduce()` with fixed `now`; Playwright for the reload scenario. |

### 2.2 Module graph

```
main.tsx
  └─ App.tsx ─── useHashRoute()
       ├─ Home ────────────┐
       ├─ Programs ────────┤─ useSessionStore() ── reduce() ── engine/selectors.ts
       ├─ ActiveWorkout ───┤        │                              │
       ├─ Summary ─────────┤        │                              └─ derived, no state
       └─ History ─────────┘        ▼
                                storage/sessions.ts ── Dexie ── IndexedDB
```

Data flows one way. Components call `dispatch(type, payload)`. Nothing outside
`engine/reduce.ts` mutates state.

### 2.3 Types

```ts
// engine/types.ts

type Weekday = 'monday'|'tuesday'|'wednesday'|'thursday'|'friday'|'saturday'|'sunday';

interface ProgramExercise {
  id: string;
  name: string;
  sets: number;                       // positive integer
  reps: { min: number; max: number }; // min > 0, max >= min
  weightKg: number | null;            // normalized from kg|lb at validation
  perHand: boolean;                   // display only: "kg / hand"
  restSeconds: number;                // 0..600
  instructions: string[];
  commonMistakes: string[];
  equipment: string[];
  muscleGroups: string[];
  imageUrl: string | null;
}

interface Program {
  id: string;
  name: string;
  description: string | null;
  scheduleDay: Weekday | null;
  estimatedDurationMinutes: number | null;
  exercises: ProgramExercise[];
  raw: string;                        // original file text, for re-export/edit
}

type WorkoutStatus =
  | 'ready' | 'exercise_active' | 'resting' | 'paused'
  | 'exercise_complete' | 'completed' | 'abandoned';

interface SetRecord {
  setNumber: number;                  // 1-based
  targetReps: { min: number; max: number };
  targetWeightKg: number | null;
  actualReps: number | null;          // 0 is legal (a failed set)
  actualWeightKg: number | null;
  completed: boolean;                 // true only via COMPLETE_SET
  skipped: boolean;                   // true only via SKIP_SET / SKIP_EXERCISE / FINISH
  completedAt: number | null;
}

interface ExerciseRecord {
  exerciseId: string;
  name: string;
  sets: SetRecord[];
  skipped: boolean;
  skippedAt: number | null;
  completedAt: number | null;
}

/** Snapshot without the program or the undo stack — the unit of undo. */
type UndoEntry = Omit<WorkoutState, 'program' | 'undoStack'>;

interface WorkoutState {
  sessionId: string;
  programId: string;
  program: Program;                   // snapshot; never re-read mid-session
  status: WorkoutStatus;
  currentExerciseIndex: number;       // 0-based
  currentSetIndex: number;            // 0-based; the set in progress
  startedAt: number | null;           // null only in 'ready'
  finishedAt: number | null;
  pausedAt: number | null;
  pausedFrom: 'exercise_active' | 'resting' | null;
  totalPausedMs: number;
  restStartedAt: number | null;       // epoch ms; null when not resting
  restDurationMs: number;             // live value; differs from prescription after adjust
  restPausedMs: number | null;        // frozen remainder while paused during rest
  restCount: number;                  // increments per rest start; keys the expiry alert
  exerciseRecords: ExerciseRecord[];
  undoStack: UndoEntry[];             // max 10, oldest first
  draft: { reps: number; weightKg: number | null } | null;  // in-progress entry
  endedEarly: boolean;
  rpe: number | null;
  notes: string | null;
  updatedAt: number;
}
```

Deviations from the spec's field list, all deliberate: `restDurationMs` (15 s math on
seconds drifts), `draft` and `endedEarly` (spec has no home for either), and
`restAcknowledgedFor` dropped as redundant (`REST_DONE` *is* the acknowledgement).

`sessionId` is `crypto.randomUUID()`, with a
`Math.random().toString(36).slice(2) + Date.now().toString(36)` fallback for iOS < 15.4. A
`ready` state is **never persisted** — `START` is the first write (also the first event
the spec's persistence list names). Reloading before `START` loses nothing.

`currentSetIndex` is **incremented by the event that finishes a set** (`COMPLETE_SET`,
`SKIP_SET`), immediately. During `resting` it therefore already points at the upcoming
set, which is what the "next set" preview renders. `REST_DONE` and `SKIP_REST` change
only `status`.

### 2.4 Session construction

`engine/create.ts` owns the one place a state is born:

```ts
export function createSession(program: Program, now: number, sessionId: string): WorkoutState {
  return {
    sessionId, programId: program.id, program,
    status: 'ready',
    currentExerciseIndex: 0, currentSetIndex: 0,
    startedAt: null, finishedAt: null, pausedAt: null, pausedFrom: null, totalPausedMs: 0,
    restStartedAt: null, restDurationMs: 0, restPausedMs: null, restCount: 0,
    exerciseRecords: program.exercises.map(e => ({
      exerciseId: e.id, name: e.name, skipped: false, skippedAt: null, completedAt: null,
      sets: Array.from({ length: e.sets }, (_, i) => ({
        setNumber: i + 1, targetReps: e.reps, targetWeightKg: e.weightKg,
        actualReps: null, actualWeightKg: null,
        completed: false, skipped: false, completedAt: null,
      })),
    })),
    undoStack: [],
    draft: draftFor(program.exercises[0]),
    endedEarly: false, rpe: null, notes: null, updatedAt: now,
  };
}

const draftFor = (e: ProgramExercise) => ({ reps: e.reps.min, weightKg: e.weightKg });
```

`START` does **not** push an undo entry (there is nothing to undo back to that is not
"no session"). The plan name is passed explicitly; the store generates it.

Store entry point:

```ts
async function beginWorkout(programId: string) {
  const program = await getProgram(programId);
  set({ state: createSession(program, Date.now(), newId()) });
  dispatch({ type: 'START' });        // first persistence happens here
}
```

Home only offers `beginWorkout` when no active session exists, so the `START` guard is a
second line of defence, not the primary one.

### 2.5 Events

Every member carries `now`. The public API takes `Omit<WorkoutEvent, 'now'>`, so the
store is the only clock reader.

```ts
type WorkoutEvent =
  | { type: 'START'; now: number }
  | { type: 'COMPLETE_SET'; now: number; reps: number; weightKg: number | null }
  | { type: 'SKIP_SET'; now: number }
  | { type: 'UPDATE_SET_RESULT'; now: number; exerciseIndex: number; setNumber: number; reps: number; weightKg: number | null }
  | { type: 'SET_DRAFT'; now: number; reps: number; weightKg: number | null }
  | { type: 'PAUSE'; now: number }
  | { type: 'RESUME'; now: number }
  | { type: 'ADJUST_REST'; now: number; seconds: number }   // ±15, clamped
  | { type: 'RESTART_REST'; now: number }
  | { type: 'REST_DONE'; now: number }                      // requires remainingMs === 0
  | { type: 'SKIP_REST'; now: number }
  | { type: 'NEXT_EXERCISE'; now: number }
  | { type: 'SKIP_EXERCISE'; now: number }
  | { type: 'FINISH'; now: number }
  | { type: 'UNDO'; now: number }
  | { type: 'SET_RPE'; now: number; rpe: number | null }    // integer 1..10 or null
  | { type: 'SET_NOTES'; now: number; notes: string }       // ≤ 2000 chars
  | { type: 'ABANDON'; now: number };
```

`UPDATE_SET_RESULT` carries `exerciseIndex` **and** `setNumber` (1-based), because a
`setNumber` alone addresses six different sets in Workout B. The spec's
`updateSetResult(setNumber, result)` is under-specified; this is the corrected signature.

### 2.6 Transition table — every event, every state

`✗` = `InvalidTransition` thrown, state untouched.

| Event | ready | exercise_active | resting | paused | exercise_complete | completed | abandoned |
|---|---|---|---|---|---|---|---|
| START | → exercise_active | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| COMPLETE_SET | ✗ | → resting / exercise_active / exercise_complete | ✗ | ✗ | ✗ | ✗ | ✗ |
| SKIP_SET | ✗ | → exercise_active / exercise_complete | ✗ | ✗ | ✗ | ✗ | ✗ |
| UPDATE_SET_RESULT | ✗ | ✓ | ✓ | ✗ | ✓ | ✓ | ✗ |
| SET_DRAFT | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| PAUSE | ✗ | → paused | → paused | ✗ | ✗ | ✗ | ✗ |
| RESUME | ✗ | ✗ | ✗ | → pausedFrom | ✗ | ✗ | ✗ |
| ADJUST_REST | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ |
| RESTART_REST | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ |
| REST_DONE | ✗ | ✗ | → exercise_active `[remainingMs === 0]` | ✗ | ✗ | ✗ | ✗ |
| SKIP_REST | ✗ | ✗ | → exercise_active | ✗ | ✗ | ✗ | ✗ |
| NEXT_EXERCISE | ✗ | ✗ | ✗ | ✗ | → exercise_active / completed | ✗ | ✗ |
| SKIP_EXERCISE | ✗ | → exercise_complete | → exercise_complete | ✗ | ✗ | ✗ | ✗ |
| FINISH | ✗ | → completed | → completed | → completed | → completed | ✗ | ✗ |
| UNDO | ✗ | ✓ | ✓ | ✗ | ✓ | ✗ | ✗ |
| SET_RPE | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ |
| SET_NOTES | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ |
| ABANDON | ✗ | → abandoned | → abandoned | → abandoned | → abandoned | ✗ | ✗ |

Non-obvious cells:

- **Two ways to finish, one flag.** `NEXT_EXERCISE` on the last exercise is the normal
  completion: `status = 'completed'`, `finishedAt = now`, `endedEarly = false`. That is
  the `CONTINUE` button on the last exercise. `FINISH` is the "end it now" action
  (always available in the workout's overflow menu): it marks every remaining set
  `skipped`, sets `finishedAt = now`, and sets
  `endedEarly = exerciseRecords.some(r => r.sets.some(s => !s.completed))`. So a `FINISH`
  pressed after the last set was completed correctly records a normal completion, and a
  `FINISH` pressed in exercise 2 records an early end. Both land in history and both get
  a summary.
- **`SKIP_SET`** is the spec's "skip set" (spec §5 lists it, spec §10's action list
  forgets it). It marks the current set `skipped`, increments the index, and does **not**
  start a rest — you skipped it, you're not recovering from it. Last set → 
  `exercise_complete`.
- **`FINISH` and `ABANDON` are legal from `paused`.** Pause must not be a trap; a user who
  pauses and then decides to stop would otherwise have to resume first.
- **`UPDATE_SET_RESULT`** targets `exerciseRecords[exerciseIndex].sets[setNumber - 1]`,
  requires that set to be recorded (`completed || skipped`), requires `reps >= 0`, and
  may set or clear `actualWeightKg`. It cannot un-complete a set, so volume can only be
  corrected, never resurrected. Legal on `completed` so the summary can fix a typo; the
  store re-saves the row without touching `activeSessionId`.
- **`SET_RPE` / `SET_NOTES`** are legal only on `completed` — they are the summary
  screen's annotations. They stay editable when the summary is reopened from History,
  which is why a reload between finishing and rating loses nothing.
- **`SET_DRAFT`** persists the in-progress reps/weight stepper values (spec principle 3:
  progress is never lost after a refresh). It writes the row like any other event; one
  extra `put` per stepper tap is fine at this scale. `draft` is reset by
  `COMPLETE_SET`/`SKIP_SET`/`NEXT_EXERCISE` to the new set's prescription.
- **`UNDO` push policy**, explicit: only progress events push a snapshot —
  `COMPLETE_SET`, `SKIP_SET`, `SKIP_EXERCISE`, `NEXT_EXERCISE`, `FINISH`. Pause, rest
  adjustments, drafts, edits and annotations do not. This is what makes "UNDO from
  `resting` un-completes the set" true: the snapshot was taken before the set was
  recorded, and it also restores the pre-rest status, because both happened in one event.
  Empty stack → `InvalidTransition` (visible banner). `START` pushes nothing.
- **No rest between exercises.** `exercise_complete` waits for a tap; a second timer there
  would be a second thing to get wrong and is absent from the spec's diagram.

### 2.7 Rest timer and rest math

Expiry is **not** an event:

```ts
function remainingMs(s: WorkoutState, now: number): number {
  if (s.status === 'paused' && s.pausedFrom === 'resting') return s.restPausedMs ?? 0;
  if (s.status !== 'resting' || s.restStartedAt == null) return 0;
  return Math.max(0, s.restStartedAt + s.restDurationMs - now);
}
const remainingSeconds = (s: WorkoutState, now: number) => Math.ceil(remainingMs(s, now) / 1000);
```

The UI repaints on a 250 ms tick while `resting`. When the count hits 0 the screen shows
"REST COMPLETE" plus a tap target for the next set. Nothing moves until `REST_DONE`. A
backgrounded tab needs no reconciliation pass at all: nothing was counting, and the first
paint after `visibilitychange` derives the right number.

`ADJUST_REST` keeps the invariant `endsAt = restStartedAt + restDurationMs` by rebasing
onto `now`:

```ts
const endsAt = Math.max(now, (restStartedAt ?? now) + restDurationMs);
const target = Math.min(Math.max(endsAt + seconds * 1000, now), now + 600_000);
// restStartedAt = now; restDurationMs = target - now
```

`+15` on an expired rest gives 15 s. The clamp is **per adjustment** (never more than 600 s
remaining after the tap); ten `+15` taps do give a 10-minute rest, which is the user's
business, not a state bug. `−15` on an expired rest leaves `restDurationMs: 0` and
`status: 'resting'` — the next tap is `REST_DONE`, which the guard allows at 0.

`RESTART_REST` rebases to the prescription:
`restStartedAt = now; restDurationMs = exercise.restSeconds * 1000; restPausedMs = null`.

Pause during rest freezes the remainder (`restPausedMs = endsAt - now`, `restStartedAt =
null`); resume sets `restStartedAt = now`, `restDurationMs = restPausedMs`,
`restPausedMs = null`. Both pause paths add to `totalPausedMs` on resume
(`totalPausedMs += now - pausedAt`), which is what keeps elapsed time honest.

`restCount` increments on every rest start and on `RESTART_REST`. The UI keeps
`{ lastAlertedRestCount }` in a ref, so the expiry state and the vibration fire exactly
once per rest. That is the whole alert mechanism — no engine state needed.

### 2.8 Derived values

```ts
elapsedMs(s, now) =
  s.startedAt == null ? 0
  : (s.finishedAt ?? now) - s.startedAt - s.totalPausedMs
    - (s.pausedAt != null ? now - s.pausedAt : 0);

volumeKg = Σ (actualWeightKg ?? 0) * (actualReps ?? 0) over sets where completed
```

Volume never doubles for `perHand` or unilateral movements: reps are recorded as performed
and the weight stored is the number the user entered. Stated in `summary.ts` so nobody
"fixes" it later.

`engine/progress.ts` (the spec §6 metrics, all computed from completed sessions of one
program):

| Metric | Formula |
|---|---|
| `totalReps` | Σ `actualReps` over completed sets |
| `volumeKg` | as above, summed across sessions |
| `highestWeightKg` | `max(actualWeightKg)` over completed sets with a weight |
| `bestRepsAtWeight` | group by `actualWeightKg`; max `actualReps` per weight |
| `completionRate(session)` | `completedSets / prescribedSets` |
| `avgDurationMs` | mean `elapsedMs` of completed sessions |

Surfaced as a header strip on History (per selected program) and as the summary's
"vs previous session" delta (reps, volume, duration). No PR badges, no charts — the spec
asks for numbers, not a dashboard.

### 2.9 Persistence

```ts
// storage/db.ts
db.version(1).stores({
  programs: 'id, name',
  sessions: 'id, programId, status, startedAt, finishedAt',
  settings: 'key',
});

type ProgramRow = Program;

interface SessionRow {
  id: string;                // = state.sessionId
  stateVersion: 1;
  programId: string;
  programName: string;       // for list rendering without parsing the blob
  status: WorkoutStatus;
  startedAt: number;
  finishedAt: number | null;
  state: WorkoutState;       // the whole blob
}

interface SettingRow { key: 'activeSessionId' | 'lastSessionId'; value: string }
```

`finishedAt` is indexed; queries use
`db.sessions.where('programId').equals(id).filter(r => r.status === 'completed')` and sort
in memory. At ~10² rows, no compound index earns its keep.

Recovery is one `get()`. A session is either written or not — there is no half-written
configuration, which is the failure mode normalized tables invite.

Writes: `saveSession(state)` is chained on a module-level promise so out-of-order
completion can't clobber a newer state. Every action writes. A blob is ~2–6 KB; Dexie
`put` on that is sub-millisecond and happens after paint. Debouncing would add a window in
which the last set is lost, which is the thing we promised not to lose.

Two actions need the pointer, and they go through the same chain:

```ts
// START
db.transaction('rw', db.sessions, db.settings, async () => {
  await db.sessions.put(row);
  await db.settings.put({ key: 'activeSessionId', value: row.id });
});
// completed / abandoned
db.transaction('rw', db.sessions, db.settings, async () => {
  await db.sessions.put(row);
  await db.settings.delete('activeSessionId');
  await db.settings.put({ key: 'lastSessionId', value: row.id });
});
```

Because the queue is a promise chain, a `COMPLETE_SET` dispatched immediately after
`START` waits for the transaction — no interleaving, no stale row.

Program edits never touch `sessions.state.program`; that is the snapshot.

IndexedDB unavailable: `saveSession` no-ops, `dbAvailable` flips to `false`, and a sticky
"not saving on this device" banner appears. A workout with a warning beats no workout. The
banner is driven by `dbAvailable`, never by the error slot, so a transient failure doesn't
claim the database is gone.

Two tabs over one row is out of scope: no tab identity, no lock, last write wins. The row
is always whole, so the loser is a *set*, never a corrupt session. Stated in the README.

### 2.10 Validation

`schemas/program.ts`:

1. `JSON.parse` in `try` → `InvalidJson` (with the parser's message).
2. **Version pre-pass** before Zod: read `schema_version` from the raw object; if it isn't
   `1`, fail with `Unsupported schema version 2 — this build understands version 1`. Zod's
   literal error can't echo the received value, which is why this isn't a schema rule.
   `z.literal(1)` stays in the schema as a guard.
3. Zod object, **`.strict()` on the program and on each exercise**, plus `.superRefine`
   for duplicate exercise ids and `max >= min`. Strict is required by spec §3 ("nothing
   invalid is silently dropped"): a typo'd `per_handd` must be an error, not a silently
   bilateral exercise. Forward compatibility is `schema_version`'s job, not Zod's
   tolerance.
4. `lb → kg`: `Math.round(value * 0.45359237 * 100) / 100`. `Program.raw` keeps the text.
5. Errors render with a **bracket-aware path formatter**:

```ts
const formatPath = (p: (string | number)[]) =>
  p.reduce<string>((acc, seg) =>
    typeof seg === 'number' ? `${acc}[${seg}]` : acc ? `${acc}.${seg}` : seg, '');
// ["exercises", 2, "sets"] → "exercises[2].sets: Expected a positive integer."
```

Indices are 0-based, matching the spec's own example (`exercises[2]` is the third
exercise). RPE range is checked in `SET_RPE`, not in the program schema.

Importing a program whose `id` already exists: error with two explicit choices —
**Replace** (overwrites `programs`, never touches sessions) or **Import as new** (the user
edits the id). Editing an existing program that changes its `id` is rejected with the same
choice. Deleting a program asks for confirmation and **keeps its sessions**; history
renders them from the row's stored `programName`.

### 2.11 Schedule / Home

`engine/schedule.ts`, pure and testable:

```ts
type NextUp =
  | { kind: 'resume' }                                        // active session exists
  | { kind: 'today'; program: Program }
  | { kind: 'upcoming'; program: Program; weekday: Weekday }
  | { kind: 'done_today'; program: Program; lastSession: SessionRow }
  | { kind: 'none' };

nextUp(programs: Program[], sessions: SessionRow[], now: number): NextUp
weekView(programs, sessions, now): Array<{ weekday: Weekday; program: Program; done: boolean }>
```

Rule, in order: an active session → `resume`. A program scheduled today with no completed
session since the start of today (local time) → `today`. A program scheduled today that has
one → `done_today`, and Home also shows the next scheduled program below it. Otherwise
scan forward 1–6 days → `upcoming`. No programs → `none` (Home shows the program list).
Two programs on the same weekday both appear in `weekView`; `nextUp` picks the one with the
earlier `id` in sort order (stable and documented; the user controls it by renaming).

Day boundaries are the device's local time, midnight to midnight. Weekday comes from
`Date.getDay()`; DST is irrelevant because only calendar day/weekday matter. Wall-clock
changes (NTP correction, manual clock) shift remaining rest and elapsed time — accepted,
not defended against; a monotonic clock doesn't exist across an iOS suspension.

`weekView` renders only programs the app knows. The spec's Home mock includes "Tennis"
entries that are not imported programs; that is the one visual gap in §2.16.

### 2.12 UI

Five hash routes: `#/`, `#/programs`, `#/session`, `#/summary/<id>`, `#/history`.
`useHashRoute` splits `location.hash.slice(1)` on `/` into `{ name, param }` and
re-renders on `hashchange`. No router library, no history API games.

Active workout switches its body on `status`:

- `ready` → immediately redirects to `#/` (a `ready` state only exists for the tick
  between `beginWorkout` and `START`).
- `exercise_active` → exercise card (image, name, instructions, muscle groups, common
  mistakes and equipment behind a disclosure), set X of Y, reps stepper from `draft`,
  weight stepper from `draft` (hidden entirely for bodyweight), `COMPLETE SET` pinned above
  the safe-area inset, `SKIP SET` as a secondary action.
- `resting` → giant mm:ss, `−15 / pause / +15`, `restart`, next-set preview, `SKIP REST`.
  At zero: "REST COMPLETE" + `START SET`.
- `paused` → dimmed card with the frozen countdown, `RESUME`, and `End workout`.
- `exercise_complete` → exercise done, next exercise name, `CONTINUE` (last exercise:
  `CONTINUE` dispatches `NEXT_EXERCISE` and finishes normally).
- `abandoned` → redirect to `#/`.
- `completed` → redirect to `#/summary/<sessionId>`.

An always-present overflow item `End workout` opens a sheet with **Finish and save** and
**Abandon without saving**.

Layout: `100dvh`, `padding-bottom: env(safe-area-inset-bottom)`, primary action in the
bottom quarter, 56 px buttons, steppers with `inputmode="numeric"`. iPhone specifics:
`viewport-fit=cover`, `overscroll-behavior: none`, `-webkit-tap-highlight-color:
transparent`, no hover-only affordances, `touch-action: manipulation`.

State is never signalled by color alone: badges carry words ("COMPLETED", "SKIPPED"),
progress exposes `aria-valuenow`/`aria-valuetext`, and the countdown is `aria-live="off"`
with a single `role="status"` announcement at expiry (a live region firing four times a
second is unusable with VoiceOver).

`useWakeLock`: requested in `exercise_active`, `resting` and `paused`; released on
`completed`/`abandoned`/unmount; re-requested on `visibilitychange → visible`.

`useNow(ms)` is used at 1 s in `exercise_active` (elapsed header) and 250 ms in `resting`.
Not used while paused.

Summary route: if `store.state?.sessionId === param` use it, otherwise `loadSession(param)`
from Dexie. Editable set results (`UPDATE_SET_RESULT`) and RPE/notes work in both paths by
reducing and saving the row; `completed` sessions are never re-opened as active sessions,
so `activeSessionId` is untouched. `Done` routes home — persistence already happened,
there is no "save" button and no unsaved state.

History: grouped per program by default (spec §2: "accessible per program") with a program
filter; each row shows date, duration, sets, volume, and an `ended early` marker. Tapping
opens the summary in edit mode (same route). Abandoned rows are not listed — kept in the
database on purpose (never delete user data), invisible in v1.

### 2.13 Errors

`engine/errors.ts`: `InvalidJson`, `UnsupportedVersion`, `SchemaError` (carries the issue
list), `DuplicateProgramId`, `InvalidTransition`, `StorageUnavailable`. All render as a
banner or an inline error list; none are swallowed. `bootstrap()` handles
corrupt pointers and blobs:

```ts
const ptr = await getSetting('activeSessionId');
if (!ptr) return;
const row = await db.sessions.get(ptr);
if (!row) { await clearSetting('activeSessionId'); return; }
const parsed = SessionStateSchema.safeParse(row.state);      // schemas/session.ts
if (!parsed.success) return showCorruptSession(row);         // keep, never delete
hydrate(parsed.data);
route('#');            // spec §3.1: Home shows a prominent Resume card
```

Corrupt session UI: "Saved session could not be read", with **Download raw JSON** and
**Discard session** (explicit confirm). A blob with a newer `stateVersion` is reported as
"created by a newer version of the app" and left untouched — never migrated downward.

### 2.14 PWA

`vite-plugin-pwa`, `registerType: 'autoUpdate'`; precache `index.html`, JS, CSS, fonts and
`src/assets/exercises/*`; runtime `CacheFirst` (1 year) for remote `image_url` assets.
Icons: 192/512 + `apple-touch-icon` 180. `display: standalone`, dark `theme_color`.

No route-level code splitting, on purpose: a single JS bundle means an auto-activated new
service worker can never leave an open tab asking for a chunk that no longer exists. The
tab keeps running the JS it loaded; the next launch gets the new build.

Offline images need a first successful fetch: `prefetchImages(program)` fetches each
`image_url` into the cache on import (best effort, non-blocking). Any URL that was never
fetched renders the bundled placeholder — never a broken image.

Known iOS limits, stated in the install sheet: no JS while suspended (the timer is
timestamp-derived, so this is covered), no background notifications,
`navigator.vibrate` unsupported in iOS Safari (feature-detect; the visual alert is the real
signal).

### 2.15 Testing

**Engine (Vitest, fixed `now`, no DOM).** Spec §12 cases 1–9, 11, 12 map to `reduce()`.
The other three belong elsewhere and are listed there:

| Spec case | Layer |
|---|---|
| 1–9, 11, 12 | `engine/__tests__` |
| 10 reload restores session | integration (`fake-indexeddb`) |
| 13 invalid JSON rejected | `schemas/__tests__` |
| 14 history unchanged after program edit | integration |

Extra engine tests: every forbidden cell of the transition table throws; normal completion
via `NEXT_EXERCISE` leaves `endedEarly === false`; `FINISH` mid-workout sets it true and
skips the rest; `SKIP_SET` doesn't start a rest; `ADJUST_REST` clamps and works on an
expired rest; `RESTART_REST` restores the prescription; pause during rest preserves the
remainder to the millisecond; `totalPausedMs` excludes paused time; `SET_DRAFT` survives a
round-trip and is reset on set advance; `UNDO` from `resting` un-completes the set and
returns to `exercise_active`; `UNDO` from `completed` throws; `UPDATE_SET_RESULT` addresses
exercise 0 set 1 while exercise 3 is current; volume ignores `perHand`; a state
round-tripped through `JSON.stringify`/`parse` yields identical selector output.

`schemas/__tests__`: duplicate ids, `max < min`, rest 601, negative weight, `bad image
url`, unknown `schema_version`, unknown key (`per_handd`) rejected, and an **lb fixture**
that must normalize to 5.8 kg from 12.79 lb.

**Integration.** `saveSession → loadActiveSession`; `START` writes row + pointer in one
transaction; `COMPLETE_SET` immediately after `START` doesn't read a stale row; corrupt
blob → recovery UI, row preserved; program edit leaves the session blob byte-identical.

**E2E (Playwright, iPhone 13 preset).** Import fixture → start → complete one set →
sample the countdown twice and assert it decreases → reload mid-rest → **Home shows
Resume** → tap Resume → assert remaining is ≤ pre-reload and > 0 → `SKIP_REST` → complete
the remaining 15 sets → summary shows **16 sets** (Workout B is 3+3+3+3+2+2) → History
lists it under the program.

### 2.16 Known spec deviations

Two, both product-visible, both accepted for v1:

1. **Non-app week entries** (the spec's "Tennis" rows) are not representable. The week
   list shows only imported programs.
2. **`UPDATE_SET_RESULT` requires an exercise index** in addition to the spec's
   `setNumber`. Without it the action can't address a set.

### 2.17 Phases and estimates

| Phase | Work | Done when | Est. |
|---|---|---|---|
| 1 Foundation | Vite/TS/Tailwind, Zod schema, import + preview, Dexie, fixture | Valid program persists; invalid shows `exercises[2].sets`-style errors | 4–5 h |
| 2 Engine | types, create, reduce, rest, selectors, summary, progress, schedule, unit tests | ~35 engine tests green; `engine/` imports no React | 6–8 h |
| 3 Interface | 5 screens, rest timer, set entry, summary, history | Full workout start→finish by hand | 5–8 h |
| 4 Recovery | write-through store, pointer transactions, recovery + corrupt UI | Kill tab mid-set, reload, resume exactly | 2–3 h |
| 5 PWA/polish | manifest, SW, icons, wake lock, a11y pass, Playwright | Installable, offline, E2E green | 3–5 h |

Total ~20–29 h. Phases 1–2 are independent of 3: build and test the engine without a
browser.

### 2.18 Implementation deviations

Appended during implementation; §2–§4 above are not rewritten.

**2026-11-06 — `elapsedMs` moved to `engine/time.ts`.** §4.1 put it in
`selectors.ts`, but `summary.ts` needs it and `selectors.ts` imports `summarize`, which is
an import cycle (works in ESM, breaks Vitest's module graph in confusing ways). `time.ts`
is the smallest fix. Not revisited: merging the two files would drag summary math into
selectors and make the import surface worse.

**2026-11-06 — `formatPath` accepts `PropertyKey[]`.** Zod v4's `issue.path` is
`PropertyKey[]`, so numeric segments are not guaranteed to be `number` by the type. Symbols
are stringified. Behaviour for real paths is unchanged; only the signature widened.

**2026-11-06 — `newSessionId()` lives in `engine/ids.ts`, not `create.ts`.** §2.4 implied
`createSession` also minted the id. It takes the id instead, so tests can pin it; the
generator sits beside `draftFor` in `ids.ts`. Not revisited: a generator inside the
constructor makes deterministic tests need injection anyway.

**2026-11-06 — added `InvalidArgument`.** §2.13 listed `InvalidTransition` only. Bad
payloads (negative reps, `setNumber` that was never recorded, RPE 11) are a different
failure from a bad state, and the UI shows them differently (dismissible banner vs. the
state is simply not wrong). Both live in `engine/errors.ts`.

**2026-11-06 — `schedule.ts` takes the active session as an argument.** §2.11 returned
`{ kind: 'resume' }` and carried `lastSession` on `done_today`. `nextUp(programs, sessions,
now, activeSession?)` takes the active session explicitly, so the function stays a pure
function of its inputs and Home passes the store's state; `done_today` carries only the
program (Home links the last session separately from history). `weekView` returns one entry
per weekday with a `programs[]` list, because §2.11 already required two programs on the
same weekday to both appear.

**2026-11-06 — `hooks/useNow.ts` reads the clock.** The clock guard allows `Date.now` in
`engine/ids.ts` and `store/sessionStore.ts` only; `useNow` adds a third, display-only hit.
It is a repaint tick: it returns a number used for rendering and never feeds the reducer,
and every state transition still gets its `now` from the store. Removing it would mean
threading a "tick" event through the store on a 250 ms timer, which is more machinery for
no correctness gain.

**2026-11-06 — localStorage mirror in front of IndexedDB.** §2.12 made the Dexie row the
only copy. IndexedDB writes are asynchronous and queued, so a tap followed within a few
milliseconds by a reload or a killed tab could lose that transition even though the UI had
already applied it (observed at the phase-4 gate: skip-rest then reload restored the
resting state). `writeSnapshot` now mirrors the live state to `localStorage` synchronously
on every transition, and `recoverSession` prefers the mirror when its `updatedAt` is newer
than the row's, then writes it back to Dexie. Dexie remains the durable copy and the
history/summary source; the mirror exists only for the active session and is removed on
`completed`/`abandoned`. Not revisited: localStorage is ~5 MB and the state is a few KB,
so quota is not a concern, and storing nothing but the active session keeps the copy
surface small.

**2026-11-06 — PWA verified by assertions, not Lighthouse; icons generated.** §4.8 mapped
phase 5 to "Lighthouse", but Lighthouse needs a separate Chrome install and audits a
generic installability checklist that the phase-5 Playwright script asserts directly
(manifest fields, icon PNG magic bytes, an active service worker controlling the page, a
cold offline reload, a set completed offline). No lint score is recorded. Icons have no
source SVG in the repo: `scripts/icons.mjs` renders one inline mark to 180/192/512 PNGs, so
regenerating them is one command. §2.14 also precached `src/assets/exercises/*`; that
directory does not exist because no exercise images ship with the app — every image is a
remote `image_url` (cached on import) or the bundled placeholder.

**2026-11-06 — post-phase-5: in-app program builder.** The spec only defines JSON
import, but authoring JSON by hand was the last place the product dropped the user into a
text editor. `ProgramBuilder` collects name, day, and per-exercise sets/reps/weight/rest,
then emits the same JSON shape and runs it through `parseProgram` before saving — so the
builder cannot create a program the importer would reject, and the paste path keeps
working. It covers the fields a session needs; instructions, mistakes, equipment and
images are still JSON-only, which is why the paste tab stays the default. Not revisited:
a full editor would duplicate the schema in UI state for fields the workout screen barely
uses.

**2026-11-06 — post-phase-5: file-backed MCP (`data/`, not a socket).** Agents write
programs to `data/programs/<id>.json`; the app writes history to
`data/history/workout-history.json` (History → **Export**), which the MCP reads. The server
imports `parseProgram`, so it cannot accept a program the app rejects, and it resolves its
data root from its own path (`WC_DATA_DIR` overrides it for tests). No live bridge and no
database: the app never writes `data/programs`, so there is no two-writer conflict. Full
design and rejected alternatives: `docs/designs/agent-bridge.md`.

---

**2026-11-11 — the next set's draft starts from the set just logged.** §4 reset `draft`
to the new set's prescription, so a weight bumped on set 1 fell back on every later set.
`completeSet` now seeds the draft with the reps and weight just recorded; a new exercise
still starts from `draftFor`. Summary no longer offers to rewrite the program after an
early finish: `finish` marks every unreached lift skipped, which read as "remove it".

## 3. Alternatives

**XState for the machine.** Rejected. Seven states and 19 events fit in a 250-line
reducer; XState adds a dependency, a visual editor nobody will open, and makes "every event
carries `now`" awkward. Revisit only if the machine grows parallel regions.

**`Date.now()` inside the engine** (the spec's literal formula). Rejected for the same
reason we'd reject `Math.random()`: tests can't construct "timer expired 3 s ago" without
sleeping. Clock injection costs one field per event.

**Storing `remainingSeconds` and decrementing it.** Rejected. Wrong the moment the tab is
suspended, and every recovery path then has to guess how long the app was gone. Derived
remaining has no recovery path at all — that's the feature.

**Auto-advancing on rest expiry.** Rejected despite the spec's diagram. The user is mid-rep
or re-racking a dumbbell; a screen that moves on its own loses their place.

**Normalized per-set tables.** Rejected: multi-table writes need a transaction to stay
consistent, and a transaction that fails mid-set leaves a session claiming a set it didn't
record. One blob is atomic by construction, single-fetch recovery, exportable for
debugging. Cost: no SQL aggregation — irrelevant at ~10² sessions. Upgrade path: derive
normalized tables from blobs if a real analytics need appears.

**Full-state undo snapshots including the program.** Rejected: 10 copies of the program
snapshot would be ~30 KB and rewritten on every tap. `UndoEntry` omits `program`, which is
immutable for the session; `UNDO` re-attaches it.

**Undo on every event** (text-editor semantics). Rejected: undoing a `+15` tap instead of
the set you just logged is actively confusing. Only progress events push.

**`zustand/persist` middleware.** Rejected: targets localStorage, writes the whole store on
every change including transient UI state, and has no transactional story.

**React Router / TanStack Router.** Rejected. Five screens, no shared deep links, recovery
driven by IndexedDB. A hash listener is ~30 lines and adds no bundle.

**Program editor as a form.** Rejected for v1: the JSON *is* the editor. "Edit" reopens
`Program.raw`, validates, saves. A form UI doubles the surface area and drifts from the
schema.

**Class-based engine with internal `setInterval`.** Rejected: untestable, and the interval
is exactly the thing that dies in the background.

**Server + auth for sync.** Out of scope by spec, and a backend would create a second
source of truth for the same session.

**lb as a first-class unit through the engine.** Rejected — one canonical unit at the
boundary removes a unit bug class from volume and PR math.

**Two-tab support.** Rejected for v1. Web Locks would serialize writes but not merge two
divergent sessions; the honest answer is "one tab".

**Route-level code splitting.** Rejected: a single bundle removes the stale-chunk failure
mode under `autoUpdate`, and the app is small enough that it doesn't matter.

---

## 4. Detailed Implementation

### 4.1 Files

```
src/
  main.tsx                    # createRoot, SW registration, bootstrap()
  App.tsx                     # hash route switch + shell
  index.css                   # Tailwind v4 + tokens (colors, spacing, safe areas)
  engine/
    types.ts
    errors.ts                 # InvalidTransition, InvalidJson, SchemaError, …
    create.ts                 # createSession(), draftFor()
    reduce.ts                 # reducer + guards (the product)
    rest.ts                   # remainingMs, adjust, restart, pause/resume math
    selectors.ts              # current exercise/set, progress, next exercise
    summary.ts                # volume, duration, completion rate, deltas
    progress.ts               # spec §6 aggregates per program
    schedule.ts               # nextUp, weekView
    __tests__/{engine,rest,schedule}.test.ts
  schemas/
    program.ts                # parse: JSON → version pre-pass → Zod → normalize
    session.ts                # SessionStateSchema, stateVersion 1
    __tests__/program.test.ts
  storage/
    db.ts
    programs.ts
    sessions.ts               # save/load/resume/complete + queue + images
  store/
    sessionStore.ts
  hooks/
    useNow.ts
    useWakeLock.ts
    useHashRoute.ts
  screens/{Home,Programs,ActiveWorkout,Summary,History}.tsx
  components/
    ui/{Button,Stepper,Sheet,Banner}.tsx
    exercise/{ExerciseCard,ExerciseImage,InstructionList,ExerciseDetails}.tsx
    workout/{SetEntry,RestTimer,ProgressBar,NextUp}.tsx
  assets/exercises/*.svg
  fixtures/workout-b.json     # spec §4.1 JSON: ids, instructions, schedule: saturday
e2e/workout.spec.ts
docs/{spec.md,designs/workout-companion.md}
```

### 4.2 Scaffold commands (phase 1)

```bash
npm create vite@latest . -- --template react-ts
npm i zustand dexie zod
npm i -D tailwindcss @tailwindcss/vite vite-plugin-pwa vitest fake-indexeddb \
        @testing-library/react @testing-library/user-event jsdom @playwright/test
```

`vite.config.ts`: `plugins: [react(), tailwindcss(), VitePWA({ registerType: 'autoUpdate',
manifest, workbox: { globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'] } })]`.

### 4.3 Reducer

```ts
export function reduce(state: WorkoutState, e: WorkoutEvent): WorkoutState {
  const next = nextState(state, e);              // per-branch, starts from {...state, updatedAt: e.now}
  if (!next) throw new InvalidTransition(state.status, e.type);
  return next;
}

function nextState(s: WorkoutState, e: WorkoutEvent): WorkoutState | null {
  switch (e.type) {
    case 'START':             return s.status === 'ready' ? start(s, e) : null;
    case 'COMPLETE_SET':      return inStatus(s, ['exercise_active']) && completeSet(s, e);
    case 'SKIP_SET':          return inStatus(s, ['exercise_active']) && skipSet(s, e);
    case 'UPDATE_SET_RESULT': return inStatus(s, ['exercise_active','resting','exercise_complete','completed']) && updateSetResult(s, e);
    case 'SET_DRAFT':         return inStatus(s, ['exercise_active']) && setDraft(s, e);
    case 'PAUSE':             return inStatus(s, ['exercise_active','resting']) && pause(s, e);
    case 'RESUME':            return s.status === 'paused' ? resume(s, e) : null;
    case 'ADJUST_REST':       return inStatus(s, ['resting']) && adjustRest(s, e);
    case 'RESTART_REST':      return inStatus(s, ['resting']) && restartRest(s, e);
    case 'REST_DONE':         return s.status === 'resting' && remainingMs(s, e.now) === 0 ? beginSet(s, e) : null;
    case 'SKIP_REST':         return inStatus(s, ['resting']) && beginSet(s, e);
    case 'NEXT_EXERCISE':     return inStatus(s, ['exercise_complete']) && nextExercise(s, e);
    case 'SKIP_EXERCISE':     return inStatus(s, ['exercise_active','resting']) && skipExercise(s, e);
    case 'FINISH':            return inStatus(s, ['exercise_active','resting','paused','exercise_complete']) && finish(s, e);
    case 'UNDO':              return inStatus(s, ['exercise_active','resting','exercise_complete']) && undo(s, e);
    case 'SET_RPE':           return s.status === 'completed' ? setRpe(s, e) : null;
    case 'SET_NOTES':         return s.status === 'completed' ? { ...s, updatedAt: e.now, notes: e.notes.slice(0, 2000) } : null;
    case 'ABANDON':           return inStatus(s, ['exercise_active','resting','paused','exercise_complete']) && abandon(s, e);
  }
}

const inStatus = (s: WorkoutState, allowed: WorkoutStatus[]) => allowed.includes(s.status);
```

`null` from a branch is the invalid transition, so the table in §2.6 and the guard list
above are the same list — one place to check either against the other. Every branch
returns a fresh object (the store relies on reference change to re-render).

Branch bodies worth pinning:

- `completeSet`: write the set record (`actualReps`, `actualWeightKg`, `completed: true`,
  `completedAt`), `currentSetIndex += 1`, push undo snapshot, then more sets →
  `startRest(restSeconds)` (0 s → stay `exercise_active`) / last set → `status =
  'exercise_complete'`, `currentSetIndex` stays pinned at the last index,
  `exerciseRecords[i].completedAt = now`. Reset `draft` to the new set's prescription.
- `skipSet`: mark `skipped: true`, `completedAt: now`, `currentSetIndex += 1`, push undo,
  **no rest**; last set → `exercise_complete` with `exerciseRecords[i].skipped = true`.
- `nextExercise`: last exercise → `status = 'completed'`, `finishedAt = now`,
  `endedEarly = false`, rest fields cleared. Otherwise `currentExerciseIndex += 1`,
  `currentSetIndex = 0`, `status = 'exercise_active'`, `draft = draftFor(next)`.
- `skipExercise`: mark every not-completed set of the current exercise
  `skipped: true, skippedAt: now`, `exercise.skipped = true`, `status =
  'exercise_complete'`, clear rest, push undo.
- `finish`: for every exercise from the current position onward, mark not-completed sets
  skipped; `endedEarly = any set !completed`; `finishedAt = now`; `status = 'completed'`;
  push undo.
- `undo`: pop newest `UndoEntry`; empty → `null` (invalid). Result:
  `{ ...entry, program: s.program, undoStack: rest }`.
- `abandon`: `status = 'abandoned'`, `finishedAt = now`, clear rest/pause fields.
- `startRest(sec)`: `sec === 0` → no rest fields, `restCount` unchanged; else
  `status = 'resting'`, `restStartedAt = now`, `restDurationMs = sec * 1000`,
  `restCount += 1`.

### 4.4 Store

```ts
dispatch(event: Omit<WorkoutEvent, 'now'>) {
  const now = Date.now();
  const prev = get().state;
  if (!prev) return;
  let next: WorkoutState;
  try { next = reduce(prev, { ...event, now } as WorkoutEvent); }
  catch (err) { set({ error: err }); return; }        // visible banner, state untouched
  set({ state: next, error: null });
  void saveSession(next).catch(err => set({ dbAvailable: false, error: err }));
}
```

`InvalidTransition` and storage errors both land in `error` and render as a dismissible
banner with the last good state intact. `saveSession` resolves early and leaves
`dbAvailable` false once the database has failed, so the sticky banner is the durable
signal and `error` is the one-off one.

`beginWorkout(programId)` is the only way a session starts. `resumeSession()` hydrates from
`loadActiveSession()`. `editCompleted(sessionId, event)` loads the row, reduces, saves —
used by the summary's edit controls when the session isn't the one in memory.

### 4.5 Phase 1 detail — import flow

`Programs.tsx` has three panels in one screen (no extra routes): paste/file input, the
validation result, and the save/preview panel. File input accepts `.json` via
`<input type="file" accept="application/json">` plus a paste textarea; both feed the same
`parseProgram(text)`. On success the preview shows name, schedule day, estimated duration,
and each exercise's normalized `sets × reps`, weight with the `/ hand` suffix when
`perHand`, and rest. On failure it shows the issue list with formatted paths. Save writes
`programs` and calls `prefetchImages`. Existing programs list below with Edit (prefills
the textarea with `raw`) and Delete (confirm).

### 4.6 Phase 5 detail — a11y and mobile checklist

`npm run preview -- --host` on a real iPhone over the LAN, installed to the Home Screen,
then: one-handed reach of the primary button, safe-area insets under the notch and home
indicator, no horizontal scroll at 320 px width, 44 px minimum targets (measured), VoiceOver
read-through of exercise → set → button, reduced-motion honoured (`prefers-reduced-motion`
kills the progress animation and the countdown pulse), and one full workout with the phone
face-down for 90 s to confirm the timer survives a locked screen.

### 4.7 Risks

1. **iOS suspension** — handled structurally. The only user-visible consequence is that
   the expiry alert appears on return, not while backgrounded. Stated in UI copy.
2. **Safari evicting IndexedDB for unused sites (7-day rule)** — installed PWAs are exempt;
   a browser tab isn't. v1 accepts this (the app is used weekly by design). Upgrade path:
   history export to JSON (not in v1).
3. **SW autoUpdate with an open tab** — handled by the single-bundle rule in §2.14; the
   tab keeps its JS, the next launch gets the new build.
4. **Reps entry is the whole UX** — preseeded to `reps.min` and the prescribed weight, so
   the default action is one tap; steppers, not keyboards.
5. **`UPDATE_SET_RESULT` cannot resurrect a skipped set** — accepted; that needs `UNDO`,
   which is unavailable once finished.
6. **One tab assumed** — stated, not mitigated.
7. **Wall-clock jumps** shift timers — accepted; there is no monotonic clock across a
   suspension.

### 4.8 Acceptance mapping

| Spec §13 criterion | Where it's proven |
|---|---|
| JSON import, understandable errors | Phase 1 + `schemas/__tests__` |
| Programs saved/reopened, history, snapshot immutability | `storage` integration tests |
| Current exercise visible, reps/weights recordable, skip, undo | Phase 3 + engine tests |
| Rest timer correct, accurate across background/reload | `rest.test.ts` + Playwright reload |
| Pause/resume, session recovery, completed sessions saved | `reduce.ts` + bootstrap |
| PWA installable, offline, iPhone layout, a11y | Phase 5 checklist, Lighthouse, Playwright |
| Engine tests pass | `npm test` |
