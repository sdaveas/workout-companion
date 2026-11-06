# Workout Companion

Personal workout execution PWA. Import a program as JSON, run it set by set, offline.

- `docs/spec.md` — product contract (what).
- `docs/designs/workout-companion.md` — design (how, and what was rejected).
- `src/fixtures/workout-b.json` — Workout B, the primary test fixture.

Status: phases 1–3 done (JSON import, pure engine, full workout UI). Current phase: 4 (recovery).
See `docs/phase-status.md`.

```bash
npm create vite@latest . -- --template react-ts   # then §4.2 of the design doc
```
