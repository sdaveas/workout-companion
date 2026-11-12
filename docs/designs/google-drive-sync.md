# Google Drive sync

## Problem

Everything the app knows lives in one browser's IndexedDB, keyed by origin. A
workout logged on the phone is invisible on the Mac, and there is no way to make
it visible: the browser gives a page no folder, no Downloads listing, and no
cross-browser storage. The only transport today is a file the user carries by
hand (`Export backup` → **Import a file**), and an import **merges into**
whatever is already there, so the manual path degrades the moment both sides
have new work.

The goal is narrow: the user connects their own Google Drive once per browser,
and from then on programs and sessions appear on every device they own, without
a server, an account system, or a copy of their data on infrastructure we run.

This supersedes "Server + auth for sync — out of scope" in
`docs/designs/workout-companion.md` §805 and the 1.0 out-of-scope line in
`docs/spec.md` §247. It adds no server: the user's Drive is the server.
`README.md`, `index.html` (meta description and og tags) and `spec.md` all
advertise "No account, no sync" and are reworded as part of Phase 3.

Hard constraints, in order:

1. **No backend.** The app is a static build on GitHub Pages.
2. **Local-first.** It must work offline and in the gym basement; Drive is an
   enhancement, never a dependency.
3. **iPhone is the primary device.** Anything that only works on a desktop
   fails the main use case.
4. **The user's storage.** Not our bucket, not our database.

## Technical Plan

0. **Gate first.** Phase 0 answers four questions inside the *installed*
   home-screen web app on iOS, and the answers are recorded at the bottom of
   this document:
   - Does the GIS popup return a token in a standalone PWA at all?
   - After a cold start, does silent re-auth (`prompt: 'none'`) succeed without
     consent UI?
   - Does a Drive write-then-read round trip work?
   - Does the popup survive being opened after the GIS script was loaded
     asynchronously?

   The second is the likeliest failure: the token is memory-only, the PWA
   reloads constantly, and Safari partitions the Google session. If it degrades
   to "consent every open", the feature is worse than a file. **If Phase 0
   fails, nothing ships** — the phone keeps export/import, and Phases 1–3 are
   not built.

1. **Auth — Google Identity Services, token client.**
   - `google.accounts.oauth2.initTokenClient({ client_id, scope, callback })`.
     The explicit `Connect` click uses `prompt: ''`; every silent refresh uses
     `prompt: 'none'` and never raises UI.
   - Scope: `https://www.googleapis.com/auth/drive.file` — files this app
     creates, nothing else.
   - No client secret: a static page cannot hold one and this flow does not need
     one. The client ID is public by design and lives in
     `src/lib/drive/config.ts`, hardcoded, and both `http://localhost:5173` and
     the Pages origin are registered as authorised JS origins. (Deviation from
     the first draft, which wanted a `VITE_GOOGLE_CLIENT_ID` repo variable: a
     public string baked into the bundle gains nothing from CI plumbing and
     would break every local run where the variable is unset.)
   - The GIS script (`accounts.google.com/gsi/client`) is **injected on demand**,
     never at boot: Workbox precaches local assets only, so a boot-time
     cross-origin script would fail offline and stall startup. It is injected
     when the Settings screen mounts, so the first `Connect` click already has
     it. If the click happens before the script lands, load it and ask for a
     second tap — iOS drops user activation across an `await`, so a single tap
     cannot do both. Offline → skip sync and say nothing.
   - OAuth consent screen stays in **Testing** with the owner's address as a
     test user. No verification review; the owner does see Google's "unverified
     app" interstitial once. There is no refresh token, so the testing 7-day
     token rule does not apply; the ~1 hour access-token expiry is what bites,
     and every trigger handles it (below).
   - Token in memory only. `localStorage['wc:drive']` holds
     `{ connected, folderId, fileId, lastSyncedAt, lastError }` — Dexie's
     `SettingRow.key` is a closed union and would need a migration for no gain.
   - Every trigger begins with a silent token refresh. If that fails, `connected`
     stays true, `lastError` is set, the card shows `Reconnect`, and the next
     trigger tries again.

2. **Storage — one file, in the user's own Drive.**
   - Visible folder `Workout Companion`; folder query
     `name = 'Workout Companion' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
     ordered `modifiedTime desc`, first match wins.
   - File `workout-companion-backup.json`; file query
     `'<folderId>' in parents and name = 'workout-companion-backup.json' and trashed = false`.
     A match is always reused — never create a second file when one exists.
   - Both ids are cached in `wc:drive`. On a 404 for either (the user deleted or
     trashed them in Drive) re-run the search before creating anything.
   - Content: `files.get(fileId, alt=media)`; etag: `files.get(fileId, fields=id,name,etag,modifiedTime)`.
   - The file is the **existing backup format** (`buildBackup` / `parseBackup`),
     not a second schema, plus one envelope field for program timestamps (below).
     Export, import and sync all move the same object, so the manual path keeps
     working and the user can inspect, download or delete the file themselves.
   - Consequence to accept: a future `version: 2` backup breaks sync on any
     device still on v1. `parseBackup` refuses newer versions and so does sync.

3. **Merge — by id, newest wins, deterministic on ties.**
   - `mergeNewest(local: Backup, remote: Backup): Backup` lives in
     `src/lib/backup.ts` beside `buildBackup`/`parseBackup`, is **pure**, and
     writes nothing. It needs no parsing: programs are raw JSON carrying `id`,
     sessions are rows carrying `state.updatedAt`.
   - **Sessions**: the row with the greater `state.updatedAt` wins.
   - **Programs**: `Backup` gains `programUpdatedAt?: Record<string, number>` —
     an envelope field, not a field inside the program JSON, because
     `programSchema` is `z.strictObject` and would reject a modified raw on
     every device. Missing entry = `0`. `Program.updatedAt?: number` is stamped
     in `saveProgram` (the one write path the builder, importer and paste all
     funnel through); the builder is the only path that sets it, so an imported
     program counts as `0` and loses to any edited remote copy, which is the
     safe direction.
   - **Ties keep the local row** (`>` not `>=`), matching `recovery.ts`.
   - Nothing is ever deleted by a merge. Manual **import keeps its blind
     `bulkPut`** — the user picked that file on purpose; sync is the only caller
     of `mergeNewest`.

4. **When it runs.** After `recover()` resolves on app open when connected and
   a token is still cached;
   two seconds after any `saveSession` write (which covers the finish transition
   and later RPE/note edits through `editStored`); and on a manual `Sync now`.
   One sync in flight at a time — a module-level promise; a trigger during a
   running sync schedules exactly one more pass. No polling, no background sync.
   Sync reads IndexedDB, not the `wc:activeSnapshot` mirror, so a "Sync now"
   tapped mid-set can push a row one event behind; the next sync corrects it.
   After a pull that changed anything, reload `programsStore` and
   `sessionStore.loadHistory`, or Home and History stay stale.

5. **Write safety.** Pull → merge → push the merged whole, conditional on the
   file's revision: the `headRevisionId` from the search is compared with the
   one read immediately before the write. On a mismatch the retry is a **full
   second pass** (pull → merge → push), not a blind re-upload. (`If-Match` on
   the ETag was the first choice; see Deviations — a browser cannot read that
   header.) If the merged body equals the
   remote body **ignoring `exportedAt`**, skip the push: an app open must not
   burn a write. `buildBackup` stamps `exportedAt` on every call, so comparing
   raw strings would never match.

6. **Failure is quiet and never destructive.** A failed sync never deletes,
   never blocks the app, never loops. If the remote file does not parse — bad
   JSON, foreign file, or `version > 1` — **abort without pushing**; overwriting
   it is the one way to lose data. This is all-or-nothing: one corrupt program
   in the shared file stops sync on every device until a human repairs the file.
   Accepted, because the alternative is silent data loss. Settings shows the
   last successful sync time and a one-line reason when it failed, read from
   `wc:drive` on mount and rendered in the existing inline `role="status"`
   notice. A successful automatic sync says nothing.

## Alternatives

- **Manual export/import (status quo).** No infra, no auth, no merge — and one
  tap per trip. Correct if sync is used twice a month. Rejected only because it
  already loses work when both sides moved.
- **File System Access API + an iCloud Drive folder.** Near-transparent on
  desktop Chromium, zero auth, permission persisted for an installed PWA. But
  it does not exist on iOS or Safari, and Android re-grants on every cold start.
  Fails constraint 3.
- **Our own Worker + KV.** Same transparency, same merge, plus a service we own
  and pay for and a privacy surface. Worth it only if we later want sync without
  Google.
- **A BaaS (Supabase/Firebase).** Brings auth, migrations, and a data-loss
  surface that is ours. Right when other people have their own histories; wrong
  for two devices owned by one person.
- **CloudKit JS.** Apple's storage, but it is *our* CloudKit container with an
  Apple Developer account, not the user's Drive folder. Fails constraint 4.
- **Do nothing.** Honest and free; rejected because the user asked for
  cross-device history specifically.

Drive is the only route that can satisfy all four constraints at once — and
Phase 0 exists precisely because "can" is not yet "does".

## Detailed Implementation

**Phase 0 — spike (½ day, decides the rest).**
A throwaway route `#/drive-spike`, registered in `KNOWN` so the router renders
it, unlinked from every screen and deleted afterwards. Fields and buttons: a
client-ID input (saved to `localStorage`), `Request token`, `Silent re-auth`,
`Write and read a test file`, and a log pane showing what each step returned.
Deployed to Pages, tested in the installed app on the phone and in a Safari tab.
Deliverable: the four answers recorded at the bottom of this document.

**Phase 1 — connect (2–3 h).**
`src/lib/drive/auth.ts`: lazy GIS loader, `requestToken({ silent })`, in-memory
token, `readState()`/`writeState()` over `wc:drive`. `Program.updatedAt` and the
`Backup.programUpdatedAt` envelope field added; stamped in `saveProgram`.
Settings card between "On this phone" and "Backup": `Connect Google Drive` →
`Connected` + `Disconnect`. Nothing syncs yet.

**Phase 2 — sync engine (3–4 h).**
`src/lib/drive/files.ts`: `locate()` (folder then file, both by name),
`download()`, `createFile()` (`multipart/related`) and
`updateFile(expectedRevision)` (one media PATCH, guarded by a revision check). `src/lib/drive/sync.ts`: `sync()` = refresh token →
pull → `mergeNewest` → persist → push, with the 412 second pass and the
in-flight guard. `mergeNewest` is pure and lives in `src/lib/backup.ts`.

**Phase 3 — surface and tests (2 h).**
`Last synced 2 minutes ago` (new `formatAgo()` in `src/lib/format.ts`; no
relative-time helper exists), a `Sync now` action, the failure line, and the
copy changes to README/`index.html`/`spec.md`. Tests: newer row wins; tie keeps
local; a missing `programUpdatedAt` entry counts as `0`; no row is ever deleted;
a 412 retries exactly once and the retry re-merges; an unparseable remote aborts
without uploading; the push is skipped when only `exportedAt` differs. GIS
stubbed on `globalThis.google`, Drive stubbed at `fetch`.

**Non-goals, stated so they are not re-proposed:**
- **Deletes do not propagate, and a delete is not durable.** Deleting a session
  or program on one device is undone by the next sync — on that same device,
  because the Drive copy brings it back. A tombstone table is the upgrade path.
- No realtime, no conflict UI, and no field-level merge: correcting set 2 on the
  phone while adding a note to the same session on the Mac keeps one row
  wholesale, so one of those edits is lost.
- `updatedAt` is wall-clock `Date.now()`; a device with a fast clock wins ties
  it should lose.
- One Google account per browser; the account is not recorded, so switching
  accounts on one browser silently switches Drives.
- One provider. Not iCloud, not Dropbox, not a folder the user picks.
- An in-progress session syncs as a row, but the other device will not resume
  it: `activeSessionId` is a setting, not part of the backup.
- One file, whole-backup uploads. It grows with history; multipart is fine well
  past personal scale (5 MB), and resumable upload is the upgrade.

**Cost:** Phase 0 half a day including the device test, Phases 1–3 about a day.
No infrastructure, no secrets, one public client ID registered against the Pages
origin.

## Phase 0 answers

Run on an iPhone (iOS 18.7) against the installed home-screen app, 2026-11-12:

- Popup returns a token in the installed PWA: **yes** — 338 chars in 1.8 s, no
  consent UI (the grant already existed on the Google account from an earlier
  Safari-tab run, so the popup was invisible).
- Silent re-auth after a cold start: **yes** — 1.95 s, then 1.8 s on a second
  cold start, no consent UI.
- Drive write then read: **yes** — 45 bytes written and read back in 5.3 s, with
  the `Workout Companion` folder created on the first call.
- Popup after an async script load: **yes** — the GIS script is injected on
  demand and the token still came back.

Consequence: the route is alive, and the popup is not the risk it was assumed to
be. Phase 1 proceeds.

## Deviations

- **Client ID hardcoded** in `src/lib/drive/config.ts` instead of a
  `VITE_GOOGLE_CLIENT_ID` repo variable. It is public by design; a variable
  would only add a way for local builds to come up without a Drive card.
- **`engine/ids.ts` gained `now()`**, the one wall clock, and both the program
  stamp and `lastSyncedAt` import it. No new file reads `Date.now` directly, so
  the clock guard keeps its three allowed files plus the phase-7
  `lib/coachBrief.ts` deviation. The token TTL uses `performance.now()`, which
  is the correct clock for a TTL anyway.
- **The Drive file is found by name on every sync**, not by an id cached in
  `wc:drive` (the first draft cached `folderId`/`fileId`). Two searches cost
  nothing at this frequency and make a deleted or renamed folder self-healing
  instead of a permanent failure.
- **The push is a plain `uploadType=media` PATCH**, not `multipart/related`:
  only the bytes change, the name and parent never do, and the conditional
  `If-Match` works the same.
- **Conditional writes use `headRevisionId`, not `If-Match`/ETag.** Drive does
  return an ETag header, but a browser cannot read it: CORS exposes only a
  small safelisted set and Drive does not add ETag to it. The first deployed
  sync failed with "Drive returned no ETag" on the phone. The revision id is in
  the JSON body, so `updateFile` compares it one request before the write. The
  window is one request wide; a lost race is not fatal, because the merge is a
  union and the next sync from either device puts the missing rows back.
- **The access token is persisted** (`wc:driveToken`, ~50 min) and a silent
  request with no cached token and no user activation throws `NeedsTap` instead
  of opening a popup. Measured on the phone: an installed iOS app that syncs on
  a cold start has no user gesture, so Google's popup is blocked and GIS
  answers `popup_closed`. Sync treats that as "nothing to report" — it is not
  a failure and does not write `lastError`. Consequence: an app opened more than
  an hour after the last sync does not sync by itself; the first tap (Sync now,
  or any workout write) does. This is the honest limit of iOS standalone PWAs,
  not a bug to chase.
