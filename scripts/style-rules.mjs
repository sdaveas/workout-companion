// Checks the rules Home was set to: one solid accent fill per screen (it is the
// primary action), text in only the five type sizes, and — U18 — no tap target under
// 44×44. Point the first pass at another screen with `node scripts/style-rules.mjs
// '#/history'`; the size pass walks its own list.
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const BASE = 'http://localhost:5183';
const TMP = '/tmp/wc-style-rules';
const ACCENT = 'rgb(215, 255, 63)'; // --color-accent
const SIZES = ['11px', '14px', '16px', '20px']; // label, body, row, screen
const route = process.argv[2] ?? '#/';

// 2.5.8: 44 px is the thumb target. A calendar cell may be smaller only while a
// 24 px circle at its centre touches no neighbour's, i.e. centres 24 px apart.
const TARGET = 44;
const CELL_MIN = 24;
const CELL_GAP = 24;

await mkdir(TMP, { recursive: true });
const program = await (await fetch(`${BASE}/src/fixtures/workout-b.json`)).text();
await writeFile(`${TMP}/program.json`, program);

// Seeding the calendar by training would drag the whole session screen into this
// check, and one finished row is a backup, not a workout. It is the same file the
// import sheet reads.
const session = (() => {
  const p = JSON.parse(program);
  const now = Date.now();
  const state = {
    sessionId: 'session-style-rules',
    programId: p.id,
    status: 'completed',
    program: { id: p.id, name: p.name, exercises: p.exercises },
    startedAt: now - 3_600_000,
    finishedAt: now - 1_800_000,
    updatedAt: now - 1_800_000,
    exerciseRecords: [],
  };
  return {
    id: 'session-style-rules',
    programId: p.id,
    programName: p.name,
    status: 'completed',
    startedAt: state.startedAt,
    finishedAt: state.finishedAt,
    state,
  };
})();
await writeFile(
  `${TMP}/backup.json`,
  JSON.stringify({
    format: 'workout-companion-backup',
    version: 1,
    exportedAt: Date.now(),
    programs: [JSON.parse(program)],
    sessions: [session],
  }),
);

const audit = (page) =>
  page.evaluate(
    ({ ACCENT, SIZES }) => {
      const shown = (el) => el.offsetParent !== null;
      const fills = [...document.querySelectorAll('main *')].filter((el) => {
        const s = getComputedStyle(el);
        return (
          shown(el) &&
          s.backgroundColor === ACCENT &&
          (s.borderTopLeftRadius !== '0px' || el.tagName === 'BUTTON')
        );
      });
      const borders = [...document.querySelectorAll('main *')].filter(
        (el) => shown(el) && getComputedStyle(el).borderColor === ACCENT,
      );
      const off = [];
      for (const el of document.querySelectorAll('main *')) {
        if (!shown(el)) continue;
        const hasText = [...el.childNodes].some(
          (n) => n.nodeType === 3 && n.textContent.trim() !== '',
        );
        if (!hasText) continue;
        const s = getComputedStyle(el);
        if (s.fontFamily.includes('Barlow Condensed')) continue; // the display register
        if (!SIZES.includes(s.fontSize))
          off.push({ text: el.textContent.trim().slice(0, 20), size: s.fontSize });
      }
      return {
        hash: location.hash,
        accentFills: fills.map((el) => el.tagName + ':' + el.textContent.trim().slice(0, 24)),
        accentBorders: borders.map((el) => el.tagName + ':' + el.className.slice(0, 30)),
        offScale: off,
      };
    },
    { ACCENT, SIZES },
  );

/**
 * Every tappable box on the screen, measured where a thumb would land. A checkbox
 * is its label: the tick can stay 20 px while the target is a 44 px row.
 */
const sizeAudit = (page) =>
  page.evaluate(
    ({ TARGET, CELL_MIN, CELL_GAP }) => {
      const gridSelector = 'section[aria-label="Training days"]';
      const name = (el) =>
        (el.getAttribute('aria-label') ||
          el.textContent ||
          el.getAttribute('type') ||
          el.tagName)
          .trim()
          .replace(/\s+/g, ' ')
          .slice(0, 28) || el.tagName;

      const selector = (el) => {
        const bits = [];
        for (let n = el, i = 0; n && i < 3; i++, n = n.parentElement) {
          let bit = n.tagName.toLowerCase();
          const aria = n.getAttribute('aria-label');
          if (aria) bit += `[aria-label="${aria.slice(0, 20)}"]`;
          else if (typeof n.className === 'string' && n.className.trim())
            bit += '.' + n.className.trim().split(/\s+/).slice(0, 2).join('.');
          bits.unshift(bit);
          if (n.tagName === 'MAIN' || n.tagName === 'DIALOG') break;
        }
        return bits.join(' > ');
      };

      const hidden = (el) => {
        const s = getComputedStyle(el);
        if (s.visibility === 'hidden' || s.display === 'none' || s.opacity === '0') return true;
        if (el.closest('[aria-hidden="true"]')) return true;
        // The file input is a 1 px proxy; the File button in front of it is the target.
        if (el.matches('input[type=file]')) return true;
        const b = el.getBoundingClientRect();
        return b.width === 0 || b.height === 0;
      };

      const box = (el) => {
        const b = el.getBoundingClientRect();
        return { x: b.x, y: b.y, w: b.width, h: b.height };
      };

      const offenders = [];
      const cells = [];
      const seen = new Set();

      for (const el of document.querySelectorAll(
        'main a, main button, main input, main select, dialog[open] a, dialog[open] button, dialog[open] input',
      )) {
        if (hidden(el)) continue;
        const target = el.matches('input[type=checkbox], input[type=radio]')
          ? (el.closest('label') ?? el)
          : el;
        if (seen.has(target)) continue;
        seen.add(target);
        if (target.closest(gridSelector)) {
          cells.push({ centre: box(target) });
          continue;
        }
        const b = box(target);
        if (b.w < TARGET - 0.01 || b.h < TARGET - 0.01)
          offenders.push({
            name: name(el),
            selector: selector(el),
            size: `${Math.round(b.w)}x${Math.round(b.h)}`,
          });
      }

      let cellSize = null;
      let between = null;
      let clipped = 0;
      if (cells.length > 0) {
        cellSize = {
          w: Math.round(Math.min(...cells.map((c) => c.centre.w))),
          h: Math.round(Math.min(...cells.map((c) => c.centre.h))),
        };
        // The column is the page minus its 20 px gutters: a grid wider than that is
        // cut off by `overflow-hidden`, which no target-size number would show.
        const main = document.querySelector('main').getBoundingClientRect();
        const right = Math.max(...cells.map((c) => c.centre.x + c.centre.w));
        clipped = Math.round((right - (main.right - 20)) * 10) / 10;
        // Nearest centres: 2.5.8 asks that a 24 px circle centred on a cell does not
        // run into its neighbour's, so the shortest centre-to-centre distance is the
        // number to print.
        let min = Infinity;
        for (let i = 0; i < cells.length; i++) {
          for (let j = i + 1; j < cells.length; j++) {
            const a = cells[i].centre;
            const b = cells[j].centre;
            const d = Math.hypot(
              a.x + a.w / 2 - (b.x + b.w / 2),
              a.y + a.h / 2 - (b.y + b.h / 2),
            );
            if (d < min) min = d;
          }
        }
        between = Math.round(min * 10) / 10;
      }

      const cellsOk =
        cells.length === 0 ||
        // 2.5.8 in full: a cell that is 24 across passes on its own; a smaller one
        // passes while its 24 px circle touches no neighbour's.
        ((cellSize.w >= CELL_MIN && cellSize.h >= CELL_MIN) || between >= CELL_GAP) &&
        clipped <= 0.5;

      return { hash: location.hash, offenders, cellSize, between, cells: cells.length, cellsOk, clipped };
    },
    { TARGET, CELL_MIN, CELL_GAP },
  );

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
let failures = 0;
const report = (name, r) => {
  const fillsOk = r.accentFills.length === 1 && /^(A|BUTTON):/.test(r.accentFills[0]);
  const ok = fillsOk && r.accentBorders.length === 0 && r.offScale.length === 0;
  if (!ok) failures++;
  console.log(
    ok ? 'PASS' : 'FAIL',
    name,
    '| accent fills:', r.accentFills,
    '| accent borders:', r.accentBorders,
    '| off-scale:', r.offScale,
  );
};

await page.goto(`${BASE}/${route}`);
await page.waitForTimeout(300);
report(`${route} empty`, await audit(page));

await page.getByRole('button', { name: 'Transfer', exact: true }).click();
await page.locator('input[type=file]').setInputFiles(`${TMP}/program.json`);
await page.getByText(/^Imported/).waitFor({ timeout: 10_000 });
await page.getByRole('button', { name: 'Cancel', exact: true }).click();
await page.goto(`${BASE}/${route}`);
await page.waitForTimeout(300);
report(`${route} seeded`, await audit(page));

// The calendar stays one tab stop with arrow keys, not 84 stops.
const cells = await page.locator('section[aria-label="Training days"] button').count();
const stops = await page.locator('section[aria-label="Training days"] button[tabindex="0"]').count();
if (cells > 0) {
  const ok = stops === 1;
  if (!ok) failures++;
  console.log(ok ? 'PASS' : 'FAIL', `grid: ${stops} tab stop of ${cells} cells`);
} else {
  console.log('INFO grid: absent (nothing logged yet)');
}
await ctx.close();

// --- U18: every tap target is at least 44x44 --------------------------------
// Screens this owns. `#/programs` is one line away when its own pass lands.
const screens = [
  ['#/', 'home'],
  ['#/history', 'history'],
  ['#/program/workout-b', 'program'],
  ['#/program/workout-b/edit', 'program edit'],
];

const sizeCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const sizes = await sizeCtx.newPage();

console.log('\ntargets at 390x844');

/** One screen: fail on any box under TARGET, print the calendar's numbers. */
async function checkSizes(label) {
  const r = await sizeAudit(sizes);
  // The calendar is the one thing that may be under 44; its own numbers are checked.
  const ok = r.offenders.length === 0 && r.cellsOk;
  if (!ok) failures++;
  console.log(ok ? 'PASS' : 'FAIL', `${label} (${r.hash})`);
  for (const o of r.offenders) console.log(`  ${o.size.padEnd(9)} ${o.name}  ←  ${o.selector}`);
  if (r.cells > 0) {
    const cut = r.clipped > 0.5 ? `, CUT OFF by ${r.clipped} px` : '';
    console.log(
      r.cellsOk ? 'PASS' : 'FAIL',
      `  calendar: ${r.cells} cells ${r.cellSize.w}x${r.cellSize.h}, ${r.between} px between centres${cut}`,
    );
  } else if (/^#\/(history)?$/.test(r.hash)) console.log('  calendar: absent (nothing logged yet)');
}

// Cold start, before anything is imported.
await sizes.goto(`${BASE}/#/`);
await sizes.waitForTimeout(300);
await checkSizes('home empty');

// One backup: a program and one finished session, so the calendar is on screen.
await sizes.getByRole('button', { name: 'Transfer', exact: true }).click();
await sizes.locator('dialog[open] input[type=file]').setInputFiles(`${TMP}/backup.json`);
await sizes.getByText(/^Imported/).waitFor({ timeout: 10_000 });
await sizes.getByRole('button', { name: 'Cancel', exact: true }).click();

for (const [path, label] of screens) {
  await sizes.goto(`${BASE}/${path}`);
  await sizes.waitForTimeout(300);
  await checkSizes(label);
}

// The sheet is a screen: it carries its own close button.
await sizes.goto(`${BASE}/#/`);
await sizes.waitForTimeout(300);
await sizes.getByRole('button', { name: 'Transfer', exact: true }).click();
// The sheet is one control with two directions; both faces are measured.
await sizes.waitForTimeout(200);
await checkSizes('transfer sheet, import');
await sizes.getByRole('button', { name: 'export', exact: true }).click();
await sizes.waitForTimeout(150);
await checkSizes('transfer sheet, export');

// History's filtered state has the one control Home does not: Show all.
await sizes.keyboard.press('Escape');
await sizes.goto(`${BASE}/#/history`);
await sizes.waitForTimeout(300);
await sizes.locator('[data-i][tabindex="0"]').click();
await sizes.waitForTimeout(200);
await checkSizes('history filtered');

// Narrowest phone the sweep shoots: the grid has to fit 320 px, not just 350.
await sizes.setViewportSize({ width: 360, height: 640 });
await sizes.goto(`${BASE}/#/`);
await sizes.waitForTimeout(300);
await checkSizes('home at 360');

await sizeCtx.close();
await browser.close();
console.log(failures === 0 ? 'ok' : `${failures} rule failure(s)`);
process.exit(failures === 0 ? 0 : 1);
