// Checks the two rules Home was set to: one solid accent fill per screen (it is the
// primary action), and text in only the five type sizes. Point it at another screen
// before porting: `node scripts/style-rules.mjs '#/history'`.
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const BASE = 'http://localhost:5183';
const TMP = '/tmp/wc-style-rules';
const ACCENT = 'rgb(215, 255, 63)'; // --color-accent
const SIZES = ['11px', '14px', '16px', '20px']; // label, body, row, screen
const route = process.argv[2] ?? '#/';

await mkdir(TMP, { recursive: true });
const program = await (await fetch(`${BASE}/src/fixtures/workout-b.json`)).text();
await writeFile(`${TMP}/program.json`, program);

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

await page.getByRole('button', { name: 'Import', exact: true }).click();
await page.locator('input[type=file]').setInputFiles(`${TMP}/program.json`);
await page.getByText(/^Imported/).waitFor({ timeout: 10_000 });
await page.getByRole('button', { name: 'Cancel', exact: true }).click();
await page.goto(`${BASE}/${route}`);
await page.waitForTimeout(300);
report(`${route} seeded`, await audit(page));

// The calendar stays one tab stop with arrow keys, not 126 stops.
const cells = await page.locator('section[aria-label="Training days"] button').count();
const stops = await page.locator('section[aria-label="Training days"] button[tabindex="0"]').count();
if (cells > 0) {
  const ok = stops === 1;
  if (!ok) failures++;
  console.log(ok ? 'PASS' : 'FAIL', `grid: ${stops} tab stop of ${cells} cells`);
} else {
  console.log('INFO grid: absent (nothing logged yet)');
}
await browser.close();
console.log(failures === 0 ? 'ok' : `${failures} rule failure(s)`);
process.exit(failures === 0 ? 0 : 1);
