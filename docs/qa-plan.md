# QA plan — workout screen and the rest of the app

What "done" means, what is checked automatically, and what a human still has to look at.
The bar is not "tests pass"; it is "nothing is crowded, nothing competes, nothing is
smaller than a thumb".

## 1. Gates that must stay green

| Gate | Command | Catches |
| --- | --- | --- |
| Engine + component tests | `npm test` | state machine, timers, selectors, headers |
| Types | `npm run typecheck` | nothing structural, but cheap |
| Build + service worker | `npm run build` | broken imports, PWA manifest |
| Phase 3 E2E | `node scripts/phase3.mjs` | a whole session through the UI, history, delete |
| Phase 4 E2E | `node scripts/phase4.mjs` | reload mid-set, pause recovery, corrupt row |
| Phase 5 E2E | `node scripts/phase5.mjs` | offline shell, a11y pass |
| Phase 6 E2E | `node scripts/phase6.mjs` | auto mode, one-screen layout, every back target |
| Screenshot sweep | `node scripts/qa-shots.mjs` | layout at 5 viewports, target sizes, overflow |

`HEADED=1` on any phase script runs it in real Chrome. `scripts/qa-shots.mjs` writes
`/tmp/wc-review/*.png` plus `metrics.json` (header/footer/stage/drawing boxes, page and
stage overflow, every interactive target under 44×44).

## 2. Layout matrix

Five viewports × the screens that are actually used mid-workout. Every cell must have
page scroll 0, stage overflow 0, and the reps stepper above the footer.

| Viewport | Why |
| --- | --- |
| 430×932 | largest phone, safe areas in play |
| 390×844 | reference phone |
| 375×667 | iPhone SE class — the tight one |
| 360×640 | smallest realistic Android |
| 1280×800 | laptop, to prove the layout does not stretch into a poster |

States captured: home (empty and with history), programs, program detail, settings,
history, paste, builder, set, how-to sheet, auto set, paused, rest, exercise break,
summary.

## 3. Interaction and layout principles (from HIG, Material, WCAG 2.2 AA)

1. **Targets** ≥ 44×44 pt (iOS) / 48 dp (Android), and ≥ 8 px apart. Exception: a control
   whose visual is smaller must still have a 44 px hit area.
2. **One primary action** per screen, visually dominant, in the bottom third (thumb zone).
3. **Hierarchy**: exactly one loudest element. A countdown and a rep range must not
   compete at the same weight.
4. **Numbers that change** use `tabular-nums`; no width jitter as digits change.
5. **Contrast** ≥ 4.5:1 for body text, ≥ 3:1 for large text and icons. Theme check:
   muted `#8b8f98` on ink `#0b0b0d` = 6.07:1, on surface = 5.58:1, accent on ink = 17.1:1.
6. **Spacing rhythm** on a 4/8 px scale; no one-off paddings between screens.
7. **Consistency**: the same control (back, primary, ghost) has the same height, radius,
   weight and label position on every screen.
8. **No dead zones**: if it looks tappable it is; if it is tappable it looks it.
9. **Progressive disclosure** for anything secondary; never hide something needed mid-set.
10. **Wasted space is a bug** when it could enlarge the thing being watched.
11. **Safe areas**: `env(safe-area-inset-*)` respected on header and footer.
12. **Reduced motion**: two-pose illustrations keep flipping; everything else stops.
13. **Desktop**: content has a max width; no 1200 px-wide single column of phone UI.
14. **Every state designed**: empty, sparse, dense, loading, error.

## 4. Device checklist (only a real phone settles these)

1. Safari with the URL bar visible and collapsed — layout must not jump.
2. The drawing must visibly flip on every set, at arm's length.
3. Haptics: one buzz when a set lands, two when a break ends.
4. Screen stays awake during a session (wake lock).
5. Back control on every screen, and the phone's own back gesture does not dead-end.
6. Install as PWA from https and confirm it still fits one screen in standalone.
7. Vibration and animation under iOS "Reduce Motion" and Android "Remove animations".

## 5. Review procedure

1. Run `scripts/qa-shots.mjs`.
2. Automated pass: read `metrics.json`, fail on any non-zero overflow on the workout
   screen, any target under 44×44, any drawing smaller than 25 % of the stage height.
3. Visual pass: a vision model reviews the screenshots against section 3 with a ranked
   list, each item tied to a screenshot.
4. Reconcile: automated facts outrank visual impressions; both must agree before an item
   becomes work.
5. Write the result to `docs/ui-review.md`, pick the top five, implement as one design pass.

## 6. Pass thresholds for the polish pass

- 0 px overflow in every workout state at 390×844 and 375×667.
- 0 interactive targets under 44×44.
- The exercise drawing ≥ 25 % of stage height at 390×844, ≥ 15 % at 375×667.
- One primary button visible per state; at most one accent-filled control on screen.
- No screen scrolled without a visible reason.
- Desktop: content capped at 480 px column width.
