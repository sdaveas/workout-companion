# The program screen is the edit screen

## Problem

There are two screens that show the same program in two different layouts:

- `#/program/<id>` — the overview: title, day line, one card per exercise with art,
  `3 × 10–20`, weight and rest, then Start and the coach panel.
- `#/programs/build/<id>` — the builder: flat form, "Exercise 1" labels, six inputs per
  row, save button.

Editing a program means jumping between them, so the user loses the picture of what
they are editing, and every entry point has to know which screen to open. Both screens
also rebuild the same list from the same data.

## Technical Plan

One screen (`ProgramDetail`) renders a program in two modes, toggled by local state:

- **View**: the card with its cells filled in — sets, reps min/max, weight, rest, ×2.
- **Edit**: the same cards and the same cells, as inputs; the day line becomes tappable
  chips, the title becomes a name field, and the sticky Start button becomes Save / Cancel.

Nothing moves when the mode changes. Both modes render the same grid of labelled cells;
the only difference is whether a cell holds a value or an input. Anything editable has a
slot in the read view, so the edit view has no new geometry to invent.

- Route: `#/program/<id>/edit` opens in edit mode (deep link, and the back button still
  lands somewhere sane). Toggling mode inside the screen uses `history.replaceState`, so
  the URL stays honest without remounting the screen and throwing the draft away.
- Save is explicit: edits live in a draft until Save writes them. Entering edit always
  rebuilds the draft from what is saved, so a cancelled round does not come back.
- Delete lives in edit mode only: it is the one thing you do to a program, not with it.
  Confirmed with `confirm()` (session history is kept).
- Creating a new program keeps the existing builder for now; only saved programs are
  edited in place.

## Alternatives

- **Keep the builder, restyle it to look like the overview.** Rejected: two screens stay,
  and the shared list has to be duplicated to stay in sync.
- **Autosave each keystroke.** Rejected by the user: a restructure (delete three
  exercises) should be one decision, not five writes.
- **Route-driven mode change (`#/program/<id>` ↔ `#/program/<id>/edit`).** Rejected as the
  primary mechanism: a hash change remounts the screen, so the scroll position resets and
  the draft is lost. Used only for the initial state and the URL text.
- **A new `ProgramEditor` component with its own markup.** Rejected: that is how the two
  layouts drifted apart in the first place.
- **Reveal the edit fields below the read card (first attempt).** Rejected by the user:
  the cards jumped when the mode changed. Replaced by the shared grid.
- **Keep a separate Programs list screen as the place to manage.** Dropped: every program
  row on Home opens its screen, which now edits and deletes, so the list was a detour.
  Home's "Add +" is the only way in to creating one.

## Detailed Implementation

1. `src/hooks/useProgramDraft.ts` — draft state, `patch`, `patchExercise`,
   `addFromLibrary`, `addBlank`, `removeExercise`, `moveExercise`, `ready`, `commit`,
   `reset`, shared by the program screen and the (unchanged) new-program builder, so the
   two cannot drift.
2. `src/lib/buildProgram.ts` — `buildProgramJson(draft, id, base?)` carries the fields the
   form does not edit (`description`, per-exercise `instructions`,
   `estimated_duration_minutes`) over from the saved program. Today, editing a program
   silently drops them.
3. `src/screens/ProgramDetail.tsx` — `ProgramView` owns `editing`, the draft and the open
   "How"; one row list feeds both modes; sticky footer swaps Start for Save/Cancel; a
   danger button deletes the program; the coach panel hides while editing. A name clash
   on save reuses `NameConflict`.
4. `src/App.tsx` — passes `startEditing` when the route is `#/program/<id>/edit`.
5. `src/screens/Home.tsx` — program rows are links to the program screen; "Add +" opens
   the add screen; no "Manage" link to a list that no longer earns its place.
6. `src/screens/Programs.tsx` — still hosts `#/programs/new` and `#/programs/build`; the
   list itself is no longer linked from anywhere.

Checks: unit tests for the carried-over fields and for the route; a headed pass that
measures the bounding boxes of the title, meta, chips, cards, cells and footer in both
modes and asserts they are identical, then view → edit → change sets → save → view shows
the change, and edit → delete → the program is gone from Home.
