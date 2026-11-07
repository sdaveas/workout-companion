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

Not covered: sharing sessions/history, multi-program links, sharing with someone who has no
program space of their own. Housekeeping: opening the link and leaving without adding writes
nothing, and reload after adding does not re-prompt because the route moves to `#/programs`.
