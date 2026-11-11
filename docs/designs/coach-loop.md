# Coach loop — ChatGPT reads the history and rewrites the program

Status: proposed · Owner: Stelios · Supersedes nothing

## Problem

The app can already hand ChatGPT a program and take a revised one back. What it cannot do is
the thing that makes a coach worth having: **look at what actually happened in the gym and
change the plan because of it.**

Today:

- `chatPrompt()`` and `editPrompt()` (`src/lib/chatPrompt.ts:21-42`) carry **the program only**.
  No sessions, no skips, no RPE, no notes. The coach is guessing.
- `public/coach.md` has one mode: interview, then emit programs (`coach.md:24-40`). There is no
  review mode, no instruction to keep ids, and it explicitly forbids links, so a revised
  program can only come back as text.
- An incoming program updates a saved one only when **the `id` matches exactly**
  (`src/screens/PasteProgram.tsx:100-101`). A coach that renames a program, or rebuilds it with
  a fresh id, silently produces *"Add a copy instead"* and the user ends up with two programs.
- The overwrite is blind: the confirm card lists exercises, not what changed
  (`PasteProgram.tsx:320-334`).
- Skips are recorded as a fact with no reason (`src/engine/reduce.ts:215-251`); RPE and notes are
  session-level only (`engine/types.ts:95-96`). "Why did you skip the RDL on Thursday?" is
  unanswerable from the data.
- History leaves the app as a **file download** (`src/lib/exportHistory.ts`), never as text a
  chat can hold. Abandoned sessions are not even in it (`storage/sessions.ts:79-82`).
- The round trip costs: copy prompt → open ChatGPT → paste program → copy reply → paste reply →
  *Read it* → *Update*. Two taps after the paste, and `chatUrl()` hardcodes a fresh conversation
  (`chatPrompt.ts:40-42`), so a coach thread cannot be kept.
- A prose-only answer is the normal shape of a coaching reply, and the paste box treats it as an
error ("No program in there").

Goal: **one tap to hand the coach everything it needs, one paste to bring the answer back, and a
visible diff before it lands.**

## Technical Plan

Four changes, in dependency order. None of them needs a backend.

### 1. A coach brief — one text artifact, both directions

New `src/lib/coachBrief.ts`:

```ts
coachBrief(opts: { program?: Program; sessions: SessionRow[]; now: number }): string
```

Output is markdown, ~60 chars per set of history, sampled to the last 12 sessions:

```
Follow the review protocol in the coach instructions.

## Program
{"schema_version":1,"id":"upper-a",...}

## History (last 6 sessions)
2026-11-10 Upper A — 42 min, 16/18 sets, RPE 7 — "lower back tight on RDLs"
  skipped: RDL set 3; Face Pull (whole exercise)
2026-11-06 Upper A — 38 min, 14/18 sets, RPE 8, ended early
  skipped: Bench Press set 2 (shoulder)
2026-11-03 Upper A — 45 min, 18/18 sets, RPE 6

## What I want
Change the program so it survives what the history shows.
```

Rules the brief follows:

- Skips are named, not counted. `skipped: <exercise> set <n>` / `<exercise> (whole exercise)`.
- RPE and notes are always included when present, even on a clean session.
- `endedEarly` sessions are included and labelled; today's export drops them.
- Streak/no-history cases degrade to `## History\nNothing logged yet.`
- Header names the program id once, so a reply that keeps ids can be matched.

The brief is what the user copies. It replaces `editPrompt()`, which is deleted: a program with
no history in it was never the thing this loop needed.

### 2. Review protocol in `public/coach.md`

Add a `## Reviewing a program` section, keeping the interview section untouched:

1. Read `## Program` and `## History`.
2. Reply first in prose: two or three sentences on what the history says, then **three to five
   numbered changes**, each with the reason it follows from the history.
3. Ask which to apply; offer "all of them" as answer 1.
4. Only when the user agrees, print the whole updated program as one json array, **keeping the
   program `id`, its `name` and every unchanged exercise `id`**. Say once, in one line that
   keeping the ids is what makes the app update the program instead of adding a copy.
5. The json block must be in the **same reply** the user copies. A diagnosis with no program in
   it cannot be pasted: the app says "no program in that reply", which reads like a bug.
6. Same closing paste line as the interview, worded for review: paste the reply that *contains*
   the json block.

This is the piece that makes the loop conversational: the diagnosis and the argument come
*before* the JSON, so the user can push back without the app ever seeing a half-program.

### 3. Update matching that survives a coach's edits

`PasteProgram.tsx:100-101` becomes a match on the single-offer path, in this order:

1. `id` matches → **update** (today's behaviour).
2. else `sameName(saved, incoming)` (`src/lib/identity.ts`) → *"This looks like «Upper A». Update
   it, or add a copy?"*, Update primary.
3. else, only when exactly one program is saved → *"Does this replace «Upper A»?"*, **Add a copy**
   primary and Replace secondary. A rename by the coach lands here, which is the failure the
   brief's id line is meant to prevent but cannot guarantee.
4. else → add, after `uniqueName`/`uniqueId` as today.

The brief repeats the saved program's `id` *and* `name` verbatim so the coach has no excuse to
change either. Multi-offer replies keep matching by id and never prompt.

### 3b. A paste with no program should teach, not scold

`readPrograms()` finding zero blocks currently renders a parse error. Add one sentence to that
state: *"That reply has no program in it. Ask your coach for the updated program as a json block,
then paste that reply."* Nothing else changes; the blocks still parse as they do today.

### 4. Show the diff before the overwrite

New `src/lib/diffProgram.ts`:

```ts
diffPrograms(before: Program, after: Program): string[]   // "Bench Press: 3×6–8 → 3×5–6", "Face Pull: removed"
```

Rendered in the confirm card above the button, in the same voice as `planProgramUpdate`'s
`lines[]` (`src/lib/programUpdate.ts:13-19`).

Two rules that keep the diff honest:

- **Baseline is the snapshot, not the live row.** The brief's program JSON is stashed (id +
  text + timestamp) at copy time; the diff compares the reply against *that*. Otherwise a local
  edit made between copying and pasting shows up as a coach "removal".
- **A reorder is a change.** `diffPrograms` reports moved exercises and a renamed program, not
  just sets/reps/weight. An empty diff still allows the write — it just says *"Nothing changed —
  write it anyway?"* instead of claiming the coach sent nothing.

### 5. Skip reasons — deferred, not built here

The tempting addition is `skipReasons` on `WorkoutState` plus a `SET_SKIP_REASON` event. Cut from
this plan: it is the largest engine change on the list, it lands in the most delicate file
(`reduce.ts`), and the session `notes` field already carries the answer — the brief quotes it, and
"skipped: Face Pull" next to "face pull pinched my shoulder" is most of the value at no engine
cost. Revisit only if real sessions show people leaving notes empty.

### 6. Two entry points, one copy action, no forced new chat

- **History → "Copy for my coach"**: brief for the program of the **most recently trained
  session** — the one the question is about — plus its sessions. No program at all only when
  nothing has ever been trained.
- **Program detail → "Copy for my coach"** (replaces today's "Copy for ChatGPT"): brief with that
  program plus its sessions.

Both copy the brief and open `https://chatgpt.com` **bare**. They never force `?q=`: that starts a
new thread and throws away the coaching conversation the user has been building. One line of
nearby text tells the user what to do next ("Paste it into your coach chat; ask for the updated
program when you want one").

The `?q=` builders stay for first contact (`chatPrompt()`), which genuinely is a new conversation.
The 1500-character guard on that URL stays as it is.

## Alternatives

**MCP connector as the primary path.** `mcp/server.ts` already exposes programs and sessions to a
desktop client. Rejected as the primary loop: the data lives in the phone's IndexedDB, so a Mac
MCP server can only see what was exported by hand — it adds a step, not removes one. It stays as
an opt-in for desktop-only users; nothing in this plan blocks it.

**Share links (`#/p/<payload>`).** ChatGPT cannot fetch a link, and `coach.md:35` already forbids
printing one because a link opened in the phone's browser lands in a different storage bucket.
Rejected.

**Embedded model API in the app.** Would remove the copy/paste entirely, but needs a key, a
network dependency in an offline-first app, and per-token cost. Rejected for now; revisit only if
the paste loop is measurably the thing that stops usage.

**File upload of JSON history to ChatGPT.** Works today (Settings → Export). Rejected as the
primary path because it costs a file picker on a phone and ChatGPT shows the JSON as an
attachment the user cannot read or edit.

**Sending the whole session JSON instead of a written brief.** Rejected: 20+ sessions of raw
`SessionRow` is tens of KB of keys the coach does not need, and it buries the three facts that
matter (skipped, RPE, note).

## Detailed Implementation

### Files

| File | Change |
|---|---|
| `src/lib/coachBrief.ts` | new — `coachBrief()`, `historyLines()`, `programBlock()`, char budget + last-12 sampling |
| `src/lib/coachBrief.test.ts` | new — empty history, one clean session, skips named, notes quoted, ended-early labelled, 30 sessions sample to 12, brief stays under 8 KB |
| `src/lib/diffProgram.ts` | new — exercise added/removed, sets/reps/weight/rest changed |
| `src/lib/diffProgram.test.ts` | new — no-change returns `[]`, rename-only, reorder-only |
| `src/lib/chatPrompt.ts` | delete `editPrompt()`; keep `chatPrompt()` and `chatUrl()` |
| `public/coach.md` | new `## Reviewing a program` section |
| `src/screens/PasteProgram.tsx` | same-name match branch, diff card, update button label |
| `src/screens/ProgramDetail.tsx` | "Copy for my coach" → brief + open chat |
| `src/screens/History.tsx` | "Copy for my coach" |
| `src/screens/PasteProgram.tsx` | one line of guidance when a paste has no json block |
| `src/lib/briefSnapshot.ts` | new — stash the brief's program text (id, raw, copiedAt) for the diff baseline |

No engine changes. `WorkoutState`, `reduce.ts` and `Summary.tsx` are untouched by this phase.

### Tests and gates

- Unit: `coachBrief`, `diffProgram` (including reorder and rename), `coach.md` still parses its own
  example (`chatPrompt.test.ts:35-45`) and now also contains the id-keeping sentence.
- Scenario: `scripts/scenarios.mjs` gains "brief names the skipped exercise", "same-name reply
  offers Update", "diff lists the changed exercise".
- Manual: one real session with a skip + RPE + note, brief copied, ChatGPT reply pasted, diff
  read, update applied, history still attached to the program.

### Sequencing

1. `coachBrief` + **Program detail** entry point + `coach.md` review section. This is the shortest
   working loop: it always has a program id in the brief, so the reply can update in place. The
   History entry point lands in the same step but is only useful once step 2 exists.
2. `diffProgram` + snapshot baseline + confirm card.
3. Same-name and single-saved-program matching.
4. "No program in that reply" guidance.
5. Verify (and only then fix) the `restUsed` index question.

### Open questions

- Should the brief include *all* programs or only the one being reviewed? Plan says one program +
  its sessions; the History entry point sends none and lets the coach ask.
- Sample by last-N sessions or last-N weeks? Plan: last 12 sessions or 8 weeks, whichever is
  shorter, so a deload block does not fall out of the window.
- Do we let the coach propose an exercise the app has no drawing for? Yes — names outside the
  library already work, they just render without art.
