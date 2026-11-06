# Backup, restore, and the end of "Paste JSON"

## Problem

The app's only ways in are the builder and a textarea labelled **Paste JSON**,
which expects a hand-edited program and validates it field by field. That is a
developer tool sitting in the main navigation: the textarea is the second of two
tabs, it accepts external files through a third button, and its duplicate-id
flow asks "Replace it?" about a program the user cannot see. Meanwhile there is
no way to get the data *out*: sessions can be exported from History (for the
agent bridge) but programs cannot, so moving to a new phone means rebuilding
every program by hand, and nothing backs up history.

## Technical Plan

1. **Delete the Paste JSON tab.** Programs becomes one screen: the builder plus
   the saved list. `#/programs/paste` still resolves (deep links must not 404 on
   a PWA that caches them), it just renders the builder.
2. **Add a Settings screen** (`#/settings`) with two actions:
   - **Export backup** — one JSON file containing every program and every
     session row (completed, ended early, and abandoned alike), plus
     `format`/`version`/`exportedAt`.
   - **Import backup** — a file picker that accepts a backup **or** a single
     program JSON (the shape the MCP writes), validates the whole file first,
     then **merges by id**: new ids are added, existing ids are updated. Nothing
     is ever deleted by an import.
3. The same parser therefore covers the two things Paste JSON did — a program
   from an agent or a file — while the builder covers writing one by hand.

Import is merge-only by explicit decision: a restore that wipes data is one
mistake away from losing history that cannot be regenerated. Deleting remains a
deliberate, separate action (Programs → Delete, History → Delete).

## Alternatives

- **Keep Paste JSON and add import next to it.** Rejected: two ways to load the
  same file, one of them a textarea the user has to format. The request was to
  remove it, and the file picker is strictly a superset.
- **Backup programs only.** Rejected: history is the part that cannot be
  rebuilt. A backup that loses the record of what was trained is not a backup.
- **Replace-everything restore.** Rejected by the user: import must not delete
  anything. A user who wants a clean slate deletes the programs explicitly.
- **Automatic/periodic backups to localStorage or the File System Access API.**
  Rejected: the data already lives in IndexedDB; a second copy that the user
  cannot see is not a backup they can rely on, and the phone is the target.
- **Reuse History's Export.** Rejected: that file is the agent-bridge contract
  (`data/history/workout-history.json`, summaries only). Changing its shape
  would break the MCP tools; a backup needs full session state.
- **Import into the Programs screen.** Rejected: the file is not a program half
  the time, and Settings is where "my data" belongs once there is one screen
  whose job is the app rather than the training.

## Detailed Implementation

- `src/lib/backup.ts`
  - `buildBackup(programs, sessions, now)` → `{ format: 'workout-companion-backup', version: 1, exportedAt, programs, sessions }`.
  - `parseBackup(text)` → `{ ok: true, programs, sessions }` or `{ ok: false, error }`.
    Accepts the backup envelope, or a bare program object (then `sessions: []`),
    so an agent-written `data/programs/<id>.json` imports unchanged. Programs go
    through the existing `parseProgram`; sessions are checked with Zod for the
    fields the History and Summary screens read. The whole file is validated
    before anything is written.
- `src/storage/backup.ts` — `mergeBackup(programs, sessions)`: one Dexie
  read-write transaction, `bulkPut` both tables, returns the counts.
- `src/storage/sessions.ts` — `loadAllSessions()` and `countSessions()` so the
  export includes abandoned rows and the screen can show real counts
  (`loadHistory` intentionally hides them).
- `src/screens/Settings.tsx` — counts, Export, Import, and one status line:
  `Imported 2 programs and 3 sessions.` or the parser error. `← Home` header,
  44px controls, `input[type=file]` visually hidden behind a labelled button.
  After a successful import it reloads the programs store and session history so
  Home is correct without a reload.
- `src/App.tsx` — `settings` route. `src/screens/Home.tsx` — third nav link.
- `src/screens/Programs.tsx` — tabs, paste textarea, file loader, preview card
  and duplicate-id card deleted; the builder store's `setText`/`save` path stays
  because the builder and the dev-only `SyncFromDisk` use it.
- Tests
  - `src/lib/backup.test.ts` — round trip, single-program file, malformed JSON,
    a program with an invalid field, and a session row missing `state`.
  - `src/storage/backup.test.ts` — merge adds new ids, updates existing ones,
    and deletes nothing.
  - `scripts/scenarios.mjs` — seeding switches from the paste textarea to a
    settings import, scenario 4 becomes "import errors are reported" +
    "re-import is idempotent", and a new scenario exports a backup from one
    browser profile and imports it into a second, then starts the imported
    program.
  - `scripts/phase3.mjs`, `phase4.mjs`, `phase5.mjs`, `builder.mjs` — fixture
    loading switches to the settings import.

Not in scope: editing a stored session, per-device settings sync, and the
`activeSessionId`/`lastSessionId` keys — they describe this device's live
session, not the user's data, so they are not exported.
