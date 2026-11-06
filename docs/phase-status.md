# Phase status

`current: phase 3 (not started)` · protocol below is the phase gate.

| Phase | Status | Evidence | Commit |
|---|---|---|---|
| 1 Foundation | done | 17 tests, typecheck, build, Playwright smoke (error path, preview, save, reload, duplicate id) | `10a70d5` |
| 2 Engine | done | 86 tests, typecheck, build, `grep Date.now` = 1 (id fallback only), `engine/` imports no React | `61869fc` |
| 3 Interface | not started | — | — |
| 4 Recovery | not started | — | — |
| 5 PWA / polish | not started | — | — |

## Phase gate (run before starting the next phase)

1. **Triad**: `npm test` green, `npm run typecheck` clean, `npm run build` succeeds.
2. **Phase clause**: satisfy every clause of that phase's *Done when* row in design §2.17.
   For phases 3–5 one clause is manual and must be recorded here verbatim, e.g.
   `manual: start→finish Workout B in preview; reload mid-rest at set 4 → Resume showed 7s`.
   A green triad alone is **not** a completed phase once the UI exists.
3. **Clock guard**: `grep -rn "Date.now" src` must hit only `engine/ids.ts` and
   `store/sessionStore.ts`. Zero hits in `screens/` — the store stamps `now`, nothing else.
4. **Record**: update the table above and the README `Status:` line. Nothing else.
5. **Commit + tag**: one commit named `phase N: <name>` whose body carries the gate evidence
   (test count, typecheck/build, manual result); `git tag phase-N`. The table update rides
   in that same commit.

Deviations are **not** fixed up at the boundary. They go into design §2.18 as an appended,
dated entry the moment they are forced, and §2–§4 and the spec are never rewritten.
