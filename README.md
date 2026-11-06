# Workout Companion

Personal workout execution PWA. Import a program as JSON, run it set by set, offline.

- `docs/spec.md` — product contract (what).
- `docs/designs/workout-companion.md` — design (how, and what was rejected).
- `src/fixtures/workout-b.json` — Workout B, the primary test fixture.

Status: all five phases done — import, engine, UI, recovery, PWA. See
`docs/phase-status.md`. Programs can be pasted as JSON or built with the in-app form
(Programs → **Build it**).

Storage: everything lives in this browser profile — IndexedDB (`workout-companion`) plus a
localStorage mirror of the active session. No account, no server, no sync. A fresh profile
is seeded once with Workout A and B so the app is never empty; deleting them keeps them
deleted.

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
`index.json` through the same path as a manual paste (replace by id).

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
