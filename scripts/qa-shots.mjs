// Walks every screen and captures a screenshot + layout metrics per state.
// Usage: node scripts/qa-shots.mjs [--out /tmp/wc-review]
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const BASE = 'http://localhost:5183';
const OUT = process.argv.includes('--out')
  ? process.argv[process.argv.indexOf('--out') + 1]
  : '/tmp/wc-review';
const FULL = { width: 390, height: 844 };
const SMALL = { width: 375, height: 667 };
const TINY = { width: 360, height: 640 };
const WIDE = { width: 430, height: 932 };
const DESK = { width: 1280, height: 800 };

await mkdir(OUT, { recursive: true });
const program = await (await fetch(`${BASE}/src/fixtures/workout-b.json`)).text();
await writeFile(`${OUT}/program.json`, program);

const browser = await chromium.launch();

/** Tap the first control that exists — the footer changes with the stage. */
async function tap(page, names) {
  for (const name of names) {
    try {
      await page.getByRole('button', { name, exact: true }).click({ timeout: 2500 });
      return name;
    } catch {}
  }
  throw new Error(`none of: ${names.join(', ')}`);
}
const metrics = {};

const measure = (page) =>
  page.evaluate(() => {
    const box = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
    };
    const small = [...document.querySelectorAll('button, a, input, select')]
      .map((el) => {
        const b = el.getBoundingClientRect();
        const name = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24);
        return { name, w: Math.round(b.width), h: Math.round(b.height) };
      })
      .filter((t) => t.w > 0 && (t.w < 44 || t.h < 44));
    return {
      hash: location.hash,
      scroll: document.documentElement.scrollHeight - innerHeight,
      stageOverflow:
        document.querySelector('[data-testid="stage"]')?.scrollHeight -
          document.querySelector('[data-testid="stage"]')?.clientHeight || null,
      header: box('header'),
      footer: box('[data-testid="footer"]'),
      stage: box('[data-testid="stage"]'),
      drawing: box('.exercise-frame-base'),
      stepper: box('[data-testid="stepper"]'),
      buttons: document.querySelectorAll('button').length,
      links: document.querySelectorAll('a').length,
      smallTargets: small,
      text: document.body.innerText.replace(/\s+/g, ' ').trim().slice(0, 180),
    };
  });

async function shoot(page, name) {
  try {
    await page.waitForTimeout(220);
    await page.screenshot({ path: `${OUT}/${name}.png` });
    metrics[name] = await measure(page);
    console.log('captured', name);
  } catch (e) {
    console.log('SKIP', name, '-', e.message.split('\n')[0]);
  }
}

async function ready(page) {
  await page.goto(`${BASE}/#/settings`);
  await page.setInputFiles('#backup-file', `${OUT}/program.json`);
  await page.waitForSelector('text=Imported');
}

/** Everything that can be reached without a running session. */
async function staticScreens(page, prefix) {
  await page.goto(`${BASE}/#/`);
  await shoot(page, `${prefix}-01-home`);
  await page.goto(`${BASE}/#/programs`);
  await shoot(page, `${prefix}-02-programs`);
  await page.goto(`${BASE}/#/program/workout-b`);
  await shoot(page, `${prefix}-03-program`);
  await page.goto(`${BASE}/#/settings`);
  await shoot(page, `${prefix}-04-settings`);
  await page.goto(`${BASE}/#/history`);
  await shoot(page, `${prefix}-05-history`);
  await page.goto(`${BASE}/#/paste`);
  await shoot(page, `${prefix}-06-paste`);
  await page.goto(`${BASE}/#/programs/build`);
  await shoot(page, `${prefix}-07-build`);
}

/** The session: ready, set, auto, sheet, rest, paused, exercise break, summary. */
async function sessionScreens(page, prefix) {
  await page.goto(`${BASE}/#/program/workout-b`);
  await page.getByRole('button', { name: 'Start this program' }).click();
  await page.waitForURL(/#\/session/);
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.waitForSelector('text=Complete set');
  await shoot(page, `${prefix}-08-set`);

  await page.getByRole('button', { name: 'How to do it' }).click();
  await shoot(page, `${prefix}-09-sheet`);
  await page.getByRole('button', { name: 'Close' }).click();

  await page.getByRole('button', { name: 'Auto', exact: true }).click();
  await shoot(page, `${prefix}-10-auto`);

  await page.getByRole('button', { name: 'Pause' }).click();
  await shoot(page, `${prefix}-11-paused`);
  await page.getByRole('button', { name: 'Resume' }).click();

  await page.getByRole('button', { name: 'Done now' }).click();
  await shoot(page, `${prefix}-12-rest`);
  await page.getByRole('button', { name: 'Skip rest' }).click();

  // Two sets left in the first exercise: finish them to reach its break screen.
  await tap(page, ['Done now']);
  await tap(page, ['Skip rest']);
  await tap(page, ['Done now']);
  await shoot(page, `${prefix}-13-exercise-break`);
  await page.getByRole('button', { name: 'End' }).click();
  await page.getByRole('button', { name: 'Finish & save' }).click();
  await page.waitForURL(/#\/summary\//);
  await page.waitForTimeout(600);
  await page.reload();
  await page.waitForSelector('a[aria-label="Back to Home"]');
  await shoot(page, `${prefix}-14-summary`);
  await page.goto(`${BASE}/#/`);
  await shoot(page, `${prefix}-15-home-after`);
}

async function run(viewport, prefix, { all = true } = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await ready(page);
  if (all) await staticScreens(page, prefix);
  await sessionScreens(page, prefix);
  await ctx.close();
}

await run(WIDE, 'a-430x932');
await run(FULL, 'b-390x844');
await run(SMALL, 'c-375x667');

// Core states only on the smallest screen and on desktop.
for (const [viewport, prefix] of [
  [TINY, 'd-360x640'],
  [DESK, 'e-1280x800'],
]) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await ready(page);
  await page.goto(`${BASE}/#/`);
  await shoot(page, `${prefix}-01-home`);
  await page.goto(`${BASE}/#/program/workout-b`);
  await shoot(page, `${prefix}-03-program`);
  await sessionScreens(page, prefix);
  await ctx.close();
}

await writeFile(`${OUT}/metrics.json`, JSON.stringify(metrics, null, 2));
await browser.close();
console.log('done →', OUT);
