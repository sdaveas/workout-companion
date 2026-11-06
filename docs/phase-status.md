# Phase status

`current: phase 4 (gated)` · protocol below is the phase gate.

| Phase | Status | Evidence | Commit |
|---|---|---|---|
| 1 Foundation | done | 17 tests, typecheck, build, Playwright smoke (error path, preview, save, reload, duplicate id) | `10a70d5` |
| 2 Engine | done | 86 tests, typecheck, build, `grep Date.now` = 1 (id fallback only), `engine/` imports no React | `426c8dd` |
| 3 Interface | done | 86 tests, typecheck, build, Playwright full run; manual: start→finish Workout B in the UI (16/16 sets), summary 16 of 16, RPE 7 + note saved, history lists it, summary reopens from IndexedDB with RPE intact, zero console errors | `e18570c` |
| 4 Recovery | done | 92 tests (4 recovery cases), typecheck, build; manual: reload mid-set at set 3 → resumed set 3 of 3 on the same exercise; pause mid-rest at 01:27 → reload → still paused at 01:27 → resume; corrupt row reported on Home and kept in storage; full workout still finishes 16/16 after both reloads; zero console errors (`scripts/phase4.mjs`) | `7a20d90` |
| 5 PWA / polish | not started | — | — |

## Phase gate (run before starting the next phase)

0. **Delegate the verdict**: `Use the phase-gate subagent` (`.opencode/agents/phase-gate.md`,
   model `deepseek-v4-pro`). It reads this file, design §2.17/§4.8 and spec §13, runs the
   checks below, and returns `GATE: pass|fail` plus one next action. The primary agent
   applies findings; it does not grade its own phase.
1. **Triad**: `npm test` green, `npm run typecheck` clean, `npm run build` succeeds.
2. **Phase clause**: satisfy every clause of that phase's *Done when* row in design §2.17.
   For phases 3–5 one clause is manual and must be recorded here verbatim, e.g.
   `manual: start→finish Workout B in preview; reload mid-rest at set 4 → Resume showed 7s`.
   A green triad alone is **not** a completed phase once the UI exists.
3. **Clock guard**: `grep -rn "Date.now" src` must hit only `engine/ids.ts`,
   `hooks/useNow.ts` (display-only repaint tick, §2.18) and `store/sessionStore.ts`.
   Zero hits in `screens/` — the store stamps `now`, nothing else.
4. **Record**: update the table above and the README `Status:` line. Nothing else.
5. **Commit + tag**: one commit named `phase N: <name>` whose body carries the gate evidence
   (test count, typecheck/build, manual result); `git tag phase-N`. The table update rides
   in that same commit.

Deviations are **not** fixed up at the boundary. They go into design §2.18 as an appended,
dated entry the moment they are forced, and §2–§4 and the spec are never rewritten.
