# Workout Companion

Personal workout execution PWA. Import a program as JSON, run it set by set, offline.

- `docs/spec.md` — product contract (what).
- `docs/designs/workout-companion.md` — design (how, and what was rejected).
- `src/fixtures/workout-b.json` — Workout B, the primary test fixture.

Status: all five phases done — import, engine, UI, recovery, PWA. See
`docs/phase-status.md`.

```bash
npm install
npm run dev        # http://localhost:5173, PWA disabled in dev
npm test           # engine + schema + storage tests
npm run typecheck
npm run build && npm run preview   # service worker, offline, installable
```
