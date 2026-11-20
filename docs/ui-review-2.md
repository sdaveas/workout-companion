# UI review 2 — 19 November 2026

Method: `scripts/qa-shots.mjs` captured 69 states (5 viewports × every screen, plus cold
start) against the live dev build. Four reviewers worked in parallel, one per lens —
first-run/IA, in-gym ergonomics, visual craft, accessibility — each capped at six ranked
findings and required to name the screenshot, the `file:line` and the fix. Every finding
below was re-checked against the source; the ones that could only be settled live were
measured in the browser by the reviewer and are marked **measured**.

The sweep itself was broken before this review: it seeded through `#/settings`, which the
transfer refactor deleted, so it died before its first screenshot. Fixed in `5a55a0d`,
which also added the cold-start states. Re-run with:

```bash
npx vite --port 5183
node scripts/qa-shots.mjs --out /tmp/wc-review
```

## Tier 1 — data or reach, all S

**Landed 20 Nov 2026: U1, U2, U3, U5.** Both sheets are native `<dialog>`s with an
opener restored on close (`scripts/a11y-sheets.mjs` asserts all ten behaviours), Summary
pins `Done` to the bottom, and Home's `PROGRAMS ›` heading links to `#/programs`.

**Landed 20 Nov 2026: U4, U7, U8, U9, U12, U15, U16.** The break drawing has a floor
(20.2 % / 25.4 % at 360 / 375), the grid hides itself when there are no sessions, the
calendar is one tab stop with arrow keys, the stage scrolls at 200 % text (normal type
still scrolls 0 px), the countdown is no longer a live region — a `sr-only` region keyed
to the stage, exercise and set speaks instead, `ended early` is `text-muted` everywhere,
and the summary's stat row spans its grid. `flows.mjs` asserts the last three.

**Landed 20 Nov 2026: U14.** The add-door's interview is the screen's single accent fill;
the other three stay outlined under it, and "routines" is now "programs" everywhere.

**Landed 20 Nov 2026: U6, U10.** Home was the pilot; the type scale and the accent role
now cover all nine screens and every audited state. Four size jobs instead of thirteen
one-offs, one solid fill per screen (zero where the screen only browses), and accent on
state — a pressed chip, a progress fill — is the only other place it appears.
`style-rules.mjs` audits fourteen states, a live session and a summary included.

**Landed 20 Nov 2026: U11, U18.** Every measured sub-44 target is 44×44 now (Add +, More,
Show all, How ▾, the detail row buttons, the sheet's Cancel), and the per-side box has an
`aria-label`. The day chips are seven equal columns, so Sunday stays on Monday's line at
360. `style-rules.mjs` fails on any target under 44 on a reachable screen.

**U8 superseded.** Twelve weeks at 20×20 with a 4 px gutter replaces 18 weeks at 14×14:
the spacing exception holds (24 px between centres) and the grid fits 360. 14 weeks was
tested and clips.

**Landed 20 Nov 2026: U13 (the sheet half), U17.** Inside the transfer sheet the fill is
now the file door and Google Drive is outlined under it, with one line saying Drive is
the only door that leaves the browser. One chevron glyph covers every disclosure: the
hand-typed `▾` on `How`, the UA marker on the two `<details>`, and `How` now reports
`aria-expanded`. Still open: Home's two header arrows carry no visible label (icon-only,
named for screen readers, distinguishable only by direction).

| # | Issue | Evidence | Where |
| --- | --- | --- | --- |
| U1 | **The how-to sheet is a div over a live set.** It has no `role`, no Esc and no focus trap; **measured**: with it open, Tab reached the covered `Skip set` and Enter moved the pips `Set 1/3` → `Set 2/3`. A covered control takes the keyboard's Enter. | `b-09-sheet` | `ActiveWorkout.tsx:224`, `:1156` |
| U2 | **The transfer sheet lies about being modal.** `aria-modal="true"` on a plain div: focus stays on the trigger, the first Tab lands on `Export` behind the 60 % scrim, Esc does nothing, close dumps focus to `body`. | `b-04-export-sheet` | `TransferSheet.tsx:73-90` |
| U3 | **The summary has no exit you can reach.** `Done` sits at y 655/848/875 on the three phones — below the fold on every one — while the header's back goes to `#/history` and the top-right is Share. | `b-14-summary` | `Summary.tsx:327-341` |
| U4 | **The break illustration collapses.** `flex-1` with no floor: 198 px → 50 px → 23 px as the phone goes 430 → 375 → 360. Below `qa-plan.md` §6's 15 % floor. | `d-13-exercise-break` | `ActiveWorkout.tsx:952-962` |
| U5 | **`#/programs` is unreachable.** Nothing links to it — Home's headers link to `/new`, every back link goes Home. It is the only screen with row Delete and Select. | link dump of `b-01`, `b-02` | `Home.tsx:179-184` |

## Tier 2 — comprehension, mixed effort

| # | Issue | Evidence | Where |
| --- | --- | --- | --- |
| U6 | **The accent has no role.** 0–4 filled accents per screen across 25 `bg-accent` sites in 5 recipes: Home has none, the paste screen has two primaries, the empty Programs state's add-icon is the loudest object on it. | `b-01`, `b-06`, `f-02` | `src/index.css`, per-screen |
| U7 | **Empty screens still draw the data grid.** 126 grey cells are the largest object on a fresh Home, at 1.33:1; the only text says "MY WORKOUTS". Program and History empty states are a sentence and a lime CTA. | `f-01`, `b-05` | `Home.tsx:221-242`, `ActivityGrid.tsx:5` |
| U8 | **126 tab stops before the log.** Every calendar cell is a 14×14 button with `aria-label`; History has 130 stops before the first row, Home's first program link is stop 7. Also 2.5.8 (14 px target) and 1.4.11 for `accent/30` at 2.40:1. | `metrics.json`, `b-05` | `ActivityGrid.tsx:85-93` |
| U9 | **200 % text destroys the workout screen** (**measured**): stage 347 px client / 422 px scroll with `overflow:hidden`, stepper at y 672 under a stage ending at 579 — name, drawing and target clipped. | live at 390×844 | `ActiveWorkout.tsx:666`, `:757` |
| U10 | **No label size.** 13 type sizes, four tracking values, the same label job at 10 px and 12 px, the program name at 14/20/24/30. | `b-*` set | `ProgramDetail.tsx:472` and throughout |
| U11 | **Day chips wrap.** Six chips at 44–51 px plus 6 px gaps = 368 in a 350 gutter; Sunday drops to a second line. `grid-cols-7` fixes it. | `b-03` | `components/programs/DayChips.tsx:30` |
| U12 | **The live region is inverted.** The only `role="status"` is the big number: 4 rewrites in 4 s on rest, 90 in a break. A completed set announces nothing and focus falls to `body`. | `ActiveWorkout.tsx:769` | same |

## Tier 3 — nits and consistency, all S

| # | Issue | Evidence | Where |
| --- | --- | --- | --- |
| U13 | Import/Export are two unlabelled arrows, and inside the sheet the accent button is Google Drive — an OAuth popup in an app that says nothing leaves the browser. | `b-01`, `b-04` | `Home.tsx:133-152`, `TransferSheet.tsx:106-133` |
| U14 | "Build your first program" opens a chooser of four equal outlined doors with no primary, and the flow is then called Build/Add/New/Create, later "routines". | `f-01` → chooser → `f-04` | `AddProgram.tsx:54-99` |
| U15 | Same session reads `ended early` in danger red on Home and lime on Summary — the last screen uses an error colour for a normal outcome. | `b-15`, `b-14` | `Summary.tsx`, `Home.tsx` |
| U16 | Summary stat grid: three stats in a four-cell grid, so every bodyweight session leaves half a row empty. | `b-14` | `Summary.tsx:196` |
| U17 | Three disclosure mechanisms: UA `<details>` marker, hand-typed `▾`, and a text `←` next to stroked SVG icons. | `b-03`, `b-07` | `ProgramDetail.tsx:318-331` |
| U18 | Sub-44 targets: `Add +` 33×16, `More` 29×16, `Show all` 47×16, `How ▾` 34×16, detail row buttons 36×44, per-side checkbox 20×20 with no label, sheet `Cancel` 44×20. | `metrics.json` | `Home.tsx:181,217`, `History.tsx:85`, `ProgramDetail.tsx:304,324,341`, `TransferSheet.tsx:90` |

## Disproved — do not chase

- **Digit jitter.** `tabular-nums` on every changing number, all five viewports.
- **Green focus ring stuck on the auto-mode screen.** A capture artifact of the Escape key
  closing the gear dialog; a real touch tap and a scrim tap both leave `outline: none`.
- **Layout overflow.** 0 page scroll and 0 stage overflow in every workout state.
- **Text contrast.** Clean throughout: muted 5.08–6.07:1, accent 17.10:1, danger 5.97:1.
  The contrast failures are non-text only (U8's tint ramp).

## Already known — still open, not re-litigated

From `ui-review.md`: the 144 px header, the empty break screen (U4 sharpens it), the
finished lift shown during an exercise break, the how-to sheet as a full screen,
program-detail art pushing sets below the fold, the paused set losing its target, the
persistent Install block, and disabled primaries at 40 % opacity (U6 relates).

One correction to that document: it claims **0 targets under 44 px**. `How ▾` is 34×16 on
every viewport (U18), so that line is wrong as written.

## Suggested first batch

1. **U1 + U2** — one `<dialog>` pattern for both sheets. Kills a wrong-set risk and a
   focus trap bug with one change.
2. **U3** — sticky `Done` on Summary. One class change, fixes the last screen of every
   workout.
3. **U5** — make the PROGRAMS heading a link to `#/programs`. One `<a>`, unlocks Delete.
