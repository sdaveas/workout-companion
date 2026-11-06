# Workout Companion

Personal workout execution PWA. Import a program as JSON, run it set by set, offline.

- `docs/spec.md` — product contract (what).
- `docs/designs/workout-companion.md` — design (how, and what was rejected).
- `src/fixtures/workout-b.json` — Workout B, the primary test fixture.

Status: phases 1–2 done (JSON import + pure engine). Current phase: 3 (interface).
See `docs/phase-status.md`.

```bash
npm create vite@latest . -- --template react-ts   # then §4.2 of the design doc
```
