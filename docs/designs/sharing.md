# Sharing a program by link

## Problem

Two people use the same deployment. One of them built a good routine and the other wants it.
Today the only path is: export a backup file, send the file, import it on the other phone —
and importing is merge-by-id, so a program with the same name silently replaces the receiver's
own copy. The same hole exists inside the builder: creating a program whose name is already
taken produced a "Replace it" button, which destroys a program the user only meant to name
something else.

## Technical Plan

**The program travels inside the link.** `#/add/<payload>`, where the payload is
`base64url(gzip(minified program JSON))`. Nothing is hosted, nothing is uploaded and no account
exists. A six-exercise program is ~1000 characters; a one-exercise program is ~220.

- `src/lib/share.ts` — `encodeProgram`, `decodeProgram` (native `CompressionStream`, with a raw
  fallback detected by the gzip magic bytes), `shareUrl`.
- `src/lib/identity.ts` — one rule for every save path: **a program never silently replaces
  another one.** Same name (case/space-insensitive), or the same id when creating, means the
  user picks a name instead.
- The receiver is never auto-imported into: `#/add/…` decodes, validates through the existing
  `parseProgram`, and renders a card with the program's contents.
- `Save` → `Add to my routines`. A clash → `NameConflict`: the reason plus a name field
  prefilled with the next free name (`Workout B (2)`), then the program is written beside the
  original under a fresh id.
- The builder uses the same `NameConflict` component and the same `conflict` state in
  `programsStore`. The old "Replace it" button is gone; editing still replaces in place because
  Edit keeps the id.
- Sharing from the phone uses `navigator.share()` with a clipboard fallback.

## Alternatives

- **Encrypting backups.** Rejected by the owner: a workout program is not secret, and the
  local database is already encrypted by iOS under the device passcode. The cost is a
  passphrase on every export/import with no threat behind it.
- **QR codes.** Rejected: on iOS the installed PWA has separate storage from Safari, so a QR
  must be scanned *in-app*, which needs a camera prompt and a JS decoder (no `BarcodeDetector`
  in WebKit). A QR holds ~1 KB. The link carries the same data and the messaging app already
  does the scanning.
- **A hosted short link / relay.** Pages cannot accept writes, so this means a second service,
  expiry states and an abuse surface. Not worth it for a link that is 1 KB.
- **Supabase (auth + sync).** Gave accounts and row-level security for free, but not
  reconciliation, and the free tier pauses after seven days of inactivity — a real failure mode
  for a workouts app. Multi-user isolation costs nothing without it.
- **Re-id on collision without asking.** First draft; the owner asked for a rename prompt
  instead, so the receiver can tell two copies apart.

## Detailed Implementation

| File | Change |
| --- | --- |
| `src/lib/share.ts` | encode/decode/`shareUrl` |
| `src/lib/identity.ts` | `sameName`, `conflictingProgram`, `uniqueName`, `uniqueId`, `renameProgram`, `withIdentity`, `suggestedName` |
| `src/components/programs/NameConflict.tsx` | the rename panel, shared by the builder and the link screen |
| `src/screens/AddShared.tsx` | `#/add` route: decode → summary → add, or rename |
| `src/store/programsStore.ts` | `conflict` replaces `duplicateId`; `save({ update, name })` |
| `src/screens/Programs.tsx` | `Share` button, conflict panel, row layout for three actions |
| `src/engine/rest.ts` | remaining rest clamped to the duration (a stale clock read showed 02:01 for a 2:00 rest) |
| `scripts/scenarios.mjs` | scenario 11: share → asks → add → clash → rename → builder duplicate name |

Not covered: sharing with someone who has no program space of their own. Housekeeping: opening
the link and leaving without adding writes nothing, and reload after adding does not re-prompt
because the route moves to `#/programs`.

---

# Revision: one link, two things to share

## Problem

Two kinds of thing get shared, and the app only knows how to send one of them.

1. **The program.** "This is what I train" — the plan, so a friend can adopt it.
2. **The workout.** The same plan, plus what actually happened: 10, 11, 12 reps instead of
   "10–12", two sets instead of three, one exercise skipped.

Today only (1) travels, and the session screens pretend (2) is the same thing: the Share
button on a history row sends the *stored* program, which is the plan the user edited since,
not the workout they did. It also disappears when the program was deleted, even though the
session still holds a full snapshot of it.

The controls are inconsistent too. Share exists on Programs rows, the program page, the workout
and history rows — as a text pill in headers and an icon in rows — and on Summary only as a
one-off prompt card that a checkbox can silence forever. There is no way to share a session
from Summary once the prompt is muted, and no way to tell the receiver that a link carries
numbers at all.

## Technical Plan

**One payload, one route, one screen.** Every share produces `#/add/<payload>`, and every
receiver lands on the same screen.

- A session travels as the *same* wire tuple with an optional 4th slot: one entry per exercise,
  or `null` when the exercise was not done. An entry is a list of sets, one per planned set, in
  order — `[reps, weightKg]` (`-1` = bodyweight) — with two escapes:
  - `null` in a set's place means that set was skipped, so "did 1, skipped 2, did 3" stays
    distinct from "did 1 and 2, skipped 3" instead of collapsing by position.
  - a third element, `[reps, weight, repsRight]`, on unilateral exercises: left and right travel
    separately, because a weak side is what a training partner actually reads for.
  No version bump: an older build reads the tuple it already knows, ignores the extra slot, and
  gets the plan — the correct degradation, since the plan is the part that is importable.
- Two sessions carry no numbers and degrade to a plain program link, because their numbers are
  not evidence: **auto sessions** record the timed target as the result (`Summary` already
  refuses to rewrite a program from them), and a session where **nothing was completed** would
  produce an empty report. Both share the plan.
- The session's program comes from `state.program` (the snapshot stored with the session), not
  from the programs table. A deleted or edited program still shares exactly what was done, and
  the "can't share, program is gone" case disappears.
- `decodePrograms` returns `performed` beside `programs`, index-aligned with
  `program.exercises`. It is `undefined` for a plain program link, so the receiver's screen can
  say "Shared program" or "Shared workout" without guessing.
- The receiver's action does not change: **Add to my routines saves the plan.** The numbers are
  shown as a report under each exercise ("they did 10, 11, 12"), never written into the targets.
  A shared workout is a report, not an edit of the receiver's prescription.
- **Header rule.** Share is the last control in the top-right, always a 44px icon box, on every
  screen that represents exactly one shareable thing: the program page, the workout, the
  summary. Screens that are containers keep their own action instead (Home: import/export,
  Programs: add, History: export). Lists share per row with the same icon.
- Summary loses the prompt card and the `wc:noSharePrompt` key; the header icon replaces both,
  and it is there for every session, not only the one that just ended.
- ActiveWorkout's `Settings` becomes a gear box so the workout header is two icons, not an icon
  beside a word.

## Alternatives

- **A second route for workouts (`#/add/<payload>/<numbers>`).** Two decoders, two screens, and
  a chat client that trims the tail of a long URL silently drops the numbers half.
- **Bumping the payload prefix to `2`.** The prefix is how the decoder tells the compact form
  from a legacy raw-JSON link; changing it makes every link already sent undecodable. The
  optional 4th slot is self-describing and costs nothing.
- **Numbers become the receiver's targets ("train what I lifted").** Tempting, and wrong: a
  light day, a deload or a bad session would be imported as a prescription. The plan is the
  portable thing; the numbers are evidence.
- **A separate "session card" screen with no import.** The receiver's real intent when opening
  a link is still "give me this routine". Two screens for one payload doubles the surface for
  no gain.
- **Sharing the stored program for a session, keeping today's behaviour.** Sends a plan the
  sender may have edited after the session, and cannot share at all once the program is gone.
- **One number per set for unilateral exercises.** Loses the left/right imbalance, which is the
  one thing a partner reading a shared workout wants from a single-arm movement; the third wire
  element costs about six characters.
- **A shorter array instead of a `null` sentinel for skipped sets.** Set numbers shift, so "did
  1, skipped 2, did 3" reads as "did 1 and 2", and the receiver sees numbers that never happened.
- **Keeping the Summary prompt card and adding the icon too.** Two entry points for one action
  on one screen, one of which can be hidden by a setting nobody can find again.

## Detailed Implementation

| File | Change |
| --- | --- |
| `src/lib/share.ts` | `Performed`/`PerformedSet` types; optional 4th wire slot (set `null`, unilateral third element); `encodeSession(state)`; `decodePrograms` returns `performed` |
| `src/lib/shareProgram.ts` | `shareSession(state)` beside `shareProgram` |
| `src/screens/AddShared.tsx` | "Shared workout" heading and the sender's numbers under each exercise |
| `src/screens/Summary.tsx` | header Share icon via `ScreenHeader`'s existing `actions`; prompt card and `wc:noSharePrompt` deleted |
| `src/components/ui/SessionRow.tsx` | shares the snapshot + numbers; no longer hides when the program is gone |
| `src/screens/ProgramDetail.tsx` | Share is the icon box, not a text pill |
| `src/screens/ActiveWorkout.tsx` | Share icon; Settings becomes a gear icon |
| `src/components/ui/icons.tsx` | one `ShareIcon`/`GearIcon`, replacing the copy inside `SessionRow` |
| `src/lib/share.test.ts` | round trip: program link has no `performed`; session link does; skipped set and skipped exercise survive; auto and nothing-done share the plan only |

Verified by measurement on the live build: every header share control is a 44×44 box at
`y=16`, rightmost in its row.

---

# Revision: short links, when the owner wants them

## Problem

A program link is 269 characters, a workout link 308. In a chat that is four lines of
blue text. The payload is already near its floor: 204 characters for six exercises,
gzip-compressed, base64url-encoded, and a binary wire format was measured at 163 — a 20%
saving that would break every link already sent, so it was rejected.

The remaining 58 characters are the deployment itself:
`https://sdaveas.github.io/workout-companion/?v=4#/add/`. Shortening past that means
storing a mapping somewhere, and this app has no backend by design.

## Technical Plan

**An optional worker the owner deploys, never a service we run.** `worker/shorten.js` is
a Cloudflare Worker with one KV namespace:

- `POST /` with `{ "u": "<full link>" }` → `{ "s": "https://<worker>/aB3xK9p" }`.
- `GET /aB3xK9p` → `302`, `Location` = the full link. A redirect's Location may carry a
  fragment, so `#/add/<payload>` survives the hop.
- Ids are 7 characters from an alphabet without `0/o/1/l`, because a link gets read aloud.
- It only accepts links to this deployment, so it is not an open redirector.
- Entries live five years; the free plan covers 100k opens and 1k shares a day.

**Off by default.** `SHORTENER` in `src/lib/shorten.ts` is empty, and then no request is
made at all. Set it to the deployed origin and the app starts shortening. Every failure
— offline, blocked, worker deleted, slow — falls back to the full link, so sharing never
depends on the worker existing. That keeps the local-first rule: the worker is an
enhancement, exactly like Drive is.

## Alternatives

- **A public shortener (is.gd, TinyURL, cleanuri, spoo.me).** Measured: is.gd and TinyURL
  send no CORS header for our origin, cleanuri answered 504, spoo.me works (`*`) but is a
  small free service that also becomes the owner of every link. A link that dies when a
  stranger's side project dies is worse than a long link.
- **A binary wire format.** 204 → 163 characters (20%). It needs a new payload version,
  which makes links already sent undecodable by cached builds, for one saved line.
- **A custom domain.** 58 characters of every link become ~20, with no backend and no
  link rot. The best lever if the owner wants it, and it is a DNS decision, not code.
- **Static redirect pages on GitHub Pages.** One file per share, i.e. a commit per share,
  which needs a write token in the client. No.
- **Storing the payload in the path (`/add/<payload>`) instead of the fragment.** GitHub
  Pages 404s every unknown path; the app is a fragment-routed SPA.

## Detailed Implementation

| File | Change |
| --- | --- |
| `worker/shorten.js` | POST to store, GET to redirect, CORS pinned to the Pages origin |
| `worker/wrangler.toml` | the KV binding and worker name |
| `worker/README.md` | the four deploy commands, and what it changes |
| `src/lib/shorten.ts` | `shorten(url)`, off when `SHORTENER` is empty, never throws |
| `src/lib/shareProgram.ts` | `send()` shortens once, before the share sheet or the clipboard |

Verified: with `SHORTENER` empty the share path is unchanged (long link, numbers in the
sheet's text). The worker itself is verified after `wrangler deploy`.
