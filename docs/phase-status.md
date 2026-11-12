# Phase status

`current: Google Drive sync phase 1 (connect) done; phase 2 (sync engine) next. Phase 7 steps 1–2 done, gate uncommitted.` · protocol below is the phase gate.

| Phase | Status | Evidence | Commit |
|---|---|---|---|
| 1 Foundation | done | 17 tests, typecheck, build, Playwright smoke (error path, preview, save, reload, duplicate id) | `10a70d5` |
| 2 Engine | done | 86 tests, typecheck, build, `grep Date.now` = 1 (id fallback only), `engine/` imports no React | `426c8dd` |
| 3 Interface | done | 86 tests, typecheck, build, Playwright full run; manual: start→finish Workout B in the UI (16/16 sets), summary 16 of 16, RPE 7 + note saved, history lists it, summary reopens from IndexedDB with RPE intact, zero console errors | `e18570c` |
| 4 Recovery | done | 92 tests (4 recovery cases), typecheck, build; manual: reload mid-set at set 3 → resumed set 3 of 3 on the same exercise; pause mid-rest at 01:27 → reload → still paused at 01:27 → resume; corrupt row reported on Home and kept in storage; full workout still finishes 16/16 after both reloads; zero console errors (`scripts/phase4.mjs`) | `7a20d90` |
| 5 PWA / polish | done | 92 tests, typecheck, build; manifest + 192/512/180 PNG icons + SW controlled page; offline cold reload, set completed offline, hash navigation offline; a11y spot checks (all buttons/links named, one main landmark, lang=en); install hint + iOS limits on Home; phase 3 and 4 E2E scripts still green; zero console errors (`scripts/phase5.mjs`) | `69d44e5` |
| 6 Auto mode, one screen, back control | done | 210 tests (tempo 5, auto 18, ScreenHeader 4), typecheck, build; `grep Date.now` = 5 hits, all in `engine/ids.ts`, `hooks/useNow.ts`, `store/sessionStore.ts`; `scripts/phase6.mjs` on 390×844 and 360×640: no page scroll, stage does not clip and the reps stepper sits above the footer in ready/set/rest/after-skip/auto; auto set completed on its own (28 s → +15 s = 43 s → −15 s ×3 → break), one skip stage, finish → summary; 12 routes plus Home each have exactly one declared back target (Home none), including a reloaded `#/summary/:id` and a `#/p/…` deep link, unknown hash → Home; history lists the auto session; zero console errors; phases 3/4/5 scripts still green. Manual device run: opened the deployed build on the phone, started a workout, ran sets and rests; footer grid, auto toggle, per-hand sets and the lighter gym face all read as one screen (`yes seems smooth`). Follow-ups from that run: the footer grid is identical in set/rest/break (`scripts/footer-grid.mjs`), the closing hand ticks for 600 ms, primary CTAs carry the gym face, and a deploy now reloads a controlled page once so the phone stops running a stale bundle. | `phase-6` tag |

| 7 Coach loop | steps 1–2 done | `coachBrief()` builds the program + last 12 sessions as one markdown brief: skips named (`Romanian Deadlift (whole exercise)`), RPE, note quoted, weights lifted, ended-early only when an exercise was never touched, 8 KB cap; 10 tests. Program detail: "Copy for my coach" (program + its history, falls back to a selectable text box when the clipboard is refused) and a bare ChatGPT link. `coach.md` gains `## Reviewing a program`: prose diagnosis + 3–5 numbered changes, wait, then the whole program with `id`/`name`/exercise ids kept, json in the same reply; a paste with no json block now says how to ask for one (`NO_PROGRAM_HINT`). `editPrompt()` deleted. Step 2: `diffPrograms()` compares the coach's reply with the snapshot taken at copy time (`briefSnapshot`), so an edit made in between is never blamed on the coach; the confirm card lists what changes (sets, reps, weight, rest, per-hand, added, removed, rename, one line for a reorder) or says the program is unchanged. One tap opens ChatGPT with the brief already typed in (`?q=`, capped at 6 KB — past that it goes to the clipboard and the app says so); "Copy it only" stays for an open thread. Program detail also carries Step 2 — "Paste the coach’s reply" — and the paste screen names the program the coach was given, so the way back is on the same screen as the way out. 232 tests, typecheck, build; phase 3/4/5/6, footer-grid, scenarios 153/153. The UI review patch (26 files) lands on top: set pips and bigger art in the session, thumbnails and a pinned Start on program detail, Share and clipboard-intake paths, a draft that carries the last set's weight and reps into the next, and no "rewrite the program" offer after an early finish. 233 tests, every script still green. Deviation, recorded not fixed: `grep Date.now` now also hits `src/lib/coachBrief.ts` (the "Today is …" line in a copied brief, display only — the store still stamps every event). | — |
| D1 Drive sync: connect | done | 246 tests, typecheck, build; `src/lib/drive/{config,auth}.ts` (lazy GIS, `requestToken({silent})`, in-memory token, `wc:drive` state); `Program.updatedAt` stamped in `store/programsStore.ts`; `Backup.programUpdatedAt` filled by `buildBackup` (+1 test); Settings card between "On this phone" and "Backup": Connect → Connected + Disconnect; Phase 0 spike deleted, so `grep Date.now` has zero `screens/` hits (five hits: the three allowed files plus the two recorded deviations). Nothing syncs yet. | `drive-sync-phase-1` |

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
   `hooks/useNow.ts` (display-only repaint tick, §2.18) and `store/sessionStore.ts`,
   plus the two recorded deviations: `lib/coachBrief.ts` (the "Today is …" line of a
   copied brief, display only) and `store/programsStore.ts` (the program edit stamp,
   `docs/designs/google-drive-sync.md` §Deviations).
   Zero hits in `screens/` — the store stamps `now`, nothing else.
4. **Record**: update the table above and the README `Status:` line. Nothing else.
5. **Commit + tag**: one commit named `phase N: <name>` whose body carries the gate evidence
   (test count, typecheck/build, manual result); `git tag phase-N`. The table update rides
   in that same commit.

Deviations are **not** fixed up at the boundary. They go into design §2.18 as an appended,
dated entry the moment they are forced, and §2–§4 and the spec are never rewritten.
