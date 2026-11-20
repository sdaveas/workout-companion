// The journeys a release must not break: seed, train, recover, leave, delete,
// and every screen's way back. Replaces the six phase*/smoke/scenarios scripts,
// which died with the one-page refactor and were still listed as gates.
//
// Usage: npx vite --port 5183   then   node scripts/flows.mjs
import { chromium } from '@playwright/test';

const BASE = process.env.BASE ?? 'http://localhost:5183';
const FIXTURE = new URL('../src/fixtures/workout-b.json', import.meta.url).pathname;

const results = [];
function check(name, cond, detail = '') {
  results.push([cond ? 'PASS' : 'FAIL', name]);
  console.log(cond ? 'PASS' : 'FAIL', name, detail ? `(${detail})` : '');
}

const browser = await chromium.launch();

async function fresh() {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('dialog', (d) => d.accept());
  return { context, page, errors };
}

/** One program, through the sheet the user actually has. */
async function seed(page) {
  await page.goto(`${BASE}/#/`);
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await page.locator('dialog[open] input[type=file]').setInputFiles(FIXTURE);
  await page.getByText(/^Imported/).waitFor({ timeout: 15_000 });
  await page.keyboard.press('Escape');
}

async function startWorkout(page) {
  await page.goto(`${BASE}/#/program/workout-b`);
  await page.getByRole('button', { name: 'Start this program' }).click();
  await page.waitForURL(/#\/session/);
  await page.getByRole('button', { name: /^start$/i }).first().click();
  await page.getByText('Complete set', { exact: true }).waitFor({ timeout: 10_000 });
}

async function endSession(page) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'End session' }).click();
  await page.getByRole('button', { name: /Finish/ }).click();
  await page.waitForURL(/#\/summary\//, { timeout: 10_000 });
}

// --- 1. seed and list -------------------------------------------------------
{
  const { context, page, errors } = await fresh();
  await seed(page);
  await page.goto(`${BASE}/#/`);
  await page.getByRole('link', { name: /PROGRAMS/i }).click();
  await page.waitForURL(/#\/programs/);
  await page.getByRole('button', { name: 'Delete' }).first().waitFor({ timeout: 10_000 });
  const rows = await page.getByRole('button', { name: 'Delete' }).count();
  check('seeded program lists with its row actions', rows === 1, `${rows} row`);

  await page.getByRole('button', { name: 'Delete' }).first().click();
  await page.waitForTimeout(800);
  check('Delete removes the program', (await page.getByRole('button', { name: 'Delete' }).count()) === 0);
  check('no errors while seeding and deleting', errors.length === 0, errors.slice(0, 2).join(' | '));
  await context.close();
}

// --- 2. a session, end to end ----------------------------------------------
{
  const { context, page, errors } = await fresh();
  await seed(page);
  await startWorkout(page);
  await page.getByText('Complete set', { exact: true }).click();
  await endSession(page);

  const done = await page.getByRole('button', { name: 'Done', exact: true }).boundingBox();
  check('Done is on screen without scrolling', done.y + done.height <= 844, `bottom ${Math.round(done.y + done.height)}/844`);

  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.waitForURL(/#\/$/);
  await page.getByText(/ended early/i).first().waitFor({ timeout: 10_000 });
  check('the session shows on Home', true);

  await page.goto(`${BASE}/#/history`);
  await page.getByText('Workout B').first().waitFor({ timeout: 10_000 });
  check('the session shows in History', true);
  check('no errors through the session', errors.length === 0, errors.slice(0, 2).join(' | '));
  await context.close();
}

// --- 2b. the clock announces nothing, the stage does (U12) ------------------
{
  const { context, page, errors } = await fresh();
  await seed(page);
  await startWorkout(page);
  const live = page.getByTestId('stage-live');
  const said = await live.innerText();
  check('the live region says what set is up', /Set .+\. .+ reps\./.test(said), said);
  check('the clock is not itself a live region', (await page.getByTestId('stage-big').getAttribute('role')) === null);
  await page.waitForTimeout(2200);
  check('a ticking clock does not re-announce', (await live.innerText()) === said);
  await page.getByText('Complete set', { exact: true }).click();
  await page.waitForTimeout(500);
  check('a completed set does announce', (await live.innerText()) !== said, await live.innerText());
  check('no errors while announcing', errors.length === 0, errors.slice(0, 2).join(' | '));
  await context.close();
}

// --- 2c. at 200% text the stage still scrolls to its last row (U9) ----------
{
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      document.documentElement.style.fontSize = '32px';
    });
  });
  await seed(page);
  await startWorkout(page);
  const zoom = await page.evaluate(() => {
    const stage = document.querySelector('[data-testid=stage]');
    const box = stage.getBoundingClientRect();
    stage.scrollTop = stage.scrollHeight;
    const last = stage.lastElementChild?.getBoundingClientRect();
    return {
      overflow: stage.scrollHeight - stage.clientHeight,
      reachable: !!last && last.bottom <= box.bottom + 1,
      across: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
  check('200% text: the stage scrolls', zoom.overflow > 0, `${zoom.overflow}px`);
  check('200% text: its last row is reachable', zoom.reachable);
  check('200% text: nothing runs off the side', zoom.across === 0, `${zoom.across}px`);
  await context.close();
}

// --- 3. reload mid-set keeps the work --------------------------------------
{
  const { context, page, errors } = await fresh();
  await seed(page);
  await startWorkout(page);
  await page.getByText('Complete set', { exact: true }).click();
  await page.waitForTimeout(500);

  await page.reload();
  // Completing a set lands in rest, so the restored screen's action is whichever
  // stage the session was in — not necessarily "Complete set".
  const live = page.getByRole('button', { name: /^(Complete set|Skip rest|Done now)$/ });
  await live.first().waitFor({ timeout: 20_000 });
  const stillRunning = /#\/session/.test(page.url());
  check('a reload mid-set restores the running session', stillRunning, page.url().split('#')[1] ?? '');
  check('no errors on recovery', errors.length === 0, errors.slice(0, 2).join(' | '));
  await context.close();
}

// --- 4. every screen can get back ------------------------------------------
{
  const { context, page } = await fresh();
  await seed(page);
  const routes = [
    ['#/programs', '#/'],
    ['#/program/workout-b', '#/programs'],
    ['#/history', '#/'],
    ['#/programs/new', '#/programs'],
    ['#/credits', '#/'],
  ];
  for (const [route, parent] of routes) {
    await page.goto(`${BASE}/${route}`);
    const back = page.locator('a[aria-label^="Back to"]').first();
    const found = await back
      .getAttribute('href', { timeout: 5000 })
      .catch(() => null);
    check(`${route} → ${parent}`, found === parent, found ?? 'no back link');
  }
  await context.close();
}

// --- 5. the calendar is one tab stop and arrows move it ---------------------
{
  const { context, page } = await fresh();
  await seed(page);
  await startWorkout(page);
  await page.getByText('Complete set', { exact: true }).click();
  await endSession(page);
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.waitForURL(/#\/$/);

  await page.locator('[data-i]').first().waitFor({ timeout: 10_000 });
  const cells = await page.locator('[data-i]').count();
  const tabbable = await page.evaluate(
    () => [...document.querySelectorAll('[data-i]')].filter((e) => e.tabIndex === 0).length,
  );
  // Weeks of history is a density decision, not a contract: assert the shape.
  check('calendar renders whole weeks and is one tab stop', cells > 0 && cells % 7 === 0 && tabbable === 1, `${cells} cells, ${tabbable} tabbable`);

  await page.locator('[data-i][tabindex="0"]').focus();
  const start = await page.evaluate(() => document.activeElement?.getAttribute('data-i'));
  await page.keyboard.press('ArrowLeft');
  const moved = await page.evaluate(() => document.activeElement?.getAttribute('data-i'));
  check('arrow keys move the day cursor', start !== moved, `${start} → ${moved}`);
  await context.close();
}

await browser.close();
const failed = results.filter(([k]) => k === 'FAIL');
console.log(failed.length === 0 ? `\nALL PASS (${results.length})` : `\n${failed.length} FAILED of ${results.length}`);
process.exit(failed.length === 0 ? 0 : 1);
