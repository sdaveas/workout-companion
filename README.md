# Workout Companion

https://sdaveas.github.io/workout-companion/

Personal workout execution PWA. Import a program as JSON, run it set by set, offline.

- `docs/spec.md` — product contract (what).
- `docs/designs/workout-companion.md` — design (how, and what was rejected).
- `src/fixtures/workout-b.json` — Workout B, the primary test fixture.

Status: six phases done — import, engine, UI, recovery, PWA, auto mode (timed sets,
one non-scrolling workout screen, a back control on every view) — plus phase 7 steps 1–2:
a program can copy itself and its recent history as one brief for a coach chat, and the
reply pastes back in through a diff before anything is applied. One page holds the next
workout, every program and the last few sessions; history and import/export sit behind it.
See `docs/phase-status.md`.

Storage: everything lives in this browser profile — IndexedDB (`workout-companion`) plus a
localStorage mirror of the active session. No server. A fresh profile starts empty: Home
sends you to Programs.

Moving data: **Import** / **Export** in the header. Tick programs, history, or both, then
Google Drive or a file. A copy, not a sync: nothing happens on its own, and the file is
yours to download or delete. Importing merges by id (new items added, matching ones
updated, nothing deleted) and also accepts a single program JSON. Each subset has its own
file name, so a programs-only save cannot overwrite the copy that holds history. Design,
and the reason Drive sync was dropped: `docs/designs/google-drive-sync.md`.

## Agent bridge (MCP)

Agents edit programs as files in `data/programs/<id>.json`; the app writes history to
`data/history/workout-history.json` (History → **Export**). Design and rejected
alternatives: `docs/designs/agent-bridge.md`.

```bash
npm run mcp        # stdio server; registered in ~/.config/opencode/opencode.json as "workout"
node scripts/mcp-smoke.mjs   # end-to-end check of every tool
```

Tools: `list_programs`, `get_program`, `validate_program`, `create_program`,
`update_program`, `archive_program`, `list_sessions`, `get_session`, `refresh_index`.
Validation runs the app's own importer, so the MCP cannot accept what the app rejects.

In dev, Programs shows **Sync from data/programs**: imports every file listed in
`index.json` through the same importer the builder uses (replace by id).

```bash
npm install
npm run dev        # http://localhost:5173, PWA disabled in dev
npm test           # engine + schema + storage tests
npm run typecheck
npm run build && npm run preview   # service worker, offline, installable
```

Deploy: GitHub Pages via `.github/workflows/deploy.yml` (push to `main`). One-time setup:
repo → **Settings → Pages → Source: GitHub Actions**. The workflow builds with
`BASE=/<repo>/` so assets, manifest and the service worker resolve under the project
subpath; the app is a hash router, so no 404 fallback is needed. Live at
`https://<user>.github.io/<repo>/`.
