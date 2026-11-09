# Phase status

`current: phase 6 (gated)` · protocol below is the phase gate.

| Phase | Status | Evidence | Commit |
|---|---|---|---|
| 1 Foundation | done | 17 tests, typecheck, build, Playwright smoke (error path, preview, save, reload, duplicate id) | `10a70d5` |
| 2 Engine | done | 86 tests, typecheck, build, `grep Date.now` = 1 (id fallback only), `engine/` imports no React | `426c8dd` |
| 3 Interface | done | 86 tests, typecheck, build, Playwright full run; manual: start→finish Workout B in the UI (16/16 sets), summary 16 of 16, RPE 7 + note saved, history lists it, summary reopens from IndexedDB with RPE intact, zero console errors | `e18570c` |
| 4 Recovery | done | 92 tests (4 recovery cases), typecheck, build; manual: reload mid-set at set 3 → resumed set 3 of 3 on the same exercise; pause mid-rest at 01:27 → reload → still paused at 01:27 → resume; corrupt row reported on Home and kept in storage; full workout still finishes 16/16 after both reloads; zero console errors (`scripts/phase4.mjs`) | `7a20d90` |
| 5 PWA / polish | done | 92 tests, typecheck, build; manifest + 192/512/180 PNG icons + SW controlled page; offline cold reload, set completed offline, hash navigation offline; a11y spot checks (all buttons/links named, one main landmark, lang=en); install hint + iOS limits on Home; phase 3 and 4 E2E scripts still green; zero console errors (`scripts/phase5.mjs`) | `69d44e5` |
| 6 Auto mode, one screen, back control | done | 208 tests (tempo 5, auto 18, ScreenHeader 4), typecheck, build; `grep Date.now` = 5 hits, all in `engine/ids.ts`, `hooks/useNow.ts`, `store/sessionStore.ts`; `scripts/phase6.mjs` on 390×844 and 360×640: no page scroll, stage does not clip and the reps stepper sits above the footer in ready/set/rest/after-skip/auto; auto set completed on its own (28 s → +15 s = 43 s → −15 s ×3 → break), one skip stage, finish → summary; 12 routes plus Home each have exactly one declared back target (Home none), including a reloaded `#/summary/:id` and a `#/p/…` deep link, unknown hash → Home; history lists the auto session; zero console errors; phases 3/4/5 scripts still green. Manual device run: not performed — the auto sequence was exercised end to end by `scripts/phase6.mjs`, not on a phone. | pending |

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
3. **Clock guard**: `grep -rn -F "Date.now" src` must hit only `engine/ids.ts`,
   `hooks/useNow.ts` (display-only repaint tick, §2.18) and `store/sessionStore.ts`.
   Zero hits in `screens/` — the store stamps `now`, nothing else.
4. **Record**: update the table above and the README `Status:` line. Nothing else.
5. **Commit + tag**: one commit named `phase N: <name>` whose body carries the gate evidence
   (test count, typecheck/build, manual result); `git tag phase-N`. The table update rides
   in that same commit.

Deviations are **not** fixed up at the boundary. They go into design §2.18 as an appended,
dated entry the moment they are forced, and §2–§4 and the spec are never rewritten.
