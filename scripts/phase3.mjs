import { chromium } from '@playwright/test';

const BASE = 'http://localhost:5183';
const fixture = await (await fetch(`${BASE}/src/fixtures/workout-b.json`)).text();

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

const check = (cond, msg) => {
  if (!cond) throw new Error(msg);
  console.log('ok:', msg);
};

// import program
await page.goto(`${BASE}/#/programs/paste`);
await page.fill('#json', fixture);
await page.waitForSelector('text=Preview');
await page.click('button:has-text("Save program")');
await page.waitForSelector('text=Saved (1)');

// home shows today's program
await page.goto(`${BASE}/#/`);
await page.waitForSelector('text=Ready to train');
const start = page.getByRole('button', { name: /^Start/ });
check(await start.isVisible(), 'home offers a start button');
await start.click();
await page.waitForSelector('text=Complete set');

// drive the workout to the end
let sets = 0;
for (let i = 0; i < 300; i += 1) {
  if (page.url().includes('#/summary/')) break;

  const startSet = page.getByRole('button', { name: 'Start set' });
  if (await startSet.isVisible().catch(() => false)) {
    await startSet.click();
    continue;
  }
  const skipRest = page.getByRole('button', { name: 'Skip rest' }).first();
  if (await skipRest.isVisible().catch(() => false)) {
    await skipRest.click();
    continue;
  }
  const complete = page.getByRole('button', { name: 'Complete set' });
  if (await complete.isVisible().catch(() => false)) {
    sets += 1;
    await complete.click();
    continue;
  }
  const cont = page.getByRole('button', { name: /^(Continue|Finish workout)$/ });
  if (await cont.isVisible().catch(() => false)) {
    await cont.click();
    continue;
  }
  await page.waitForTimeout(50);
}

check(sets === 16, `completed ${sets} sets through the UI`);
check(page.url().includes('#/summary/'), 'finishing routes to the summary');
await page.waitForSelector('text=Session complete');
const body = await page.textContent('body');
check(/16\s*of\s*16/.test(body.replace(/\s+/g, ' ')), 'summary reports 16 of 16 sets');

// annotate RPE + notes, then Done → home
await page.getByRole('button', { name: '7', exact: true }).click();
await page.fill('#notes', 'felt solid');
await page.locator('#notes').blur();
await page.waitForTimeout(150);
await page.click('button:has-text("Done")');
await page.waitForSelector('text=Ready to train');

// history has the session; summary reopens from the DB
await page.goto(`${BASE}/#/history`);
await page.waitForSelector('text=Workout B');
check(await page.getByText('16 sets').isVisible(), 'history lists the finished session');
await page.click('text=Workout B');
await page.waitForSelector('text=Session complete');
check(await page.getByRole('button', { name: '7', exact: true }).getAttribute('aria-pressed') === 'true', 'RPE persisted');

// the delete button must not push the row off the screen
const overflowX = await page.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
);
check(overflowX === 0, `history fits a 390px viewport (overflow ${overflowX}px)`);
await page.screenshot({ path: '/tmp/wc-history.png', fullPage: true });

// delete from history: confirm, row disappears, stays gone after reload
page.once('dialog', (d) => d.accept());
await page.goto(`${BASE}/#/history`);
await page.getByRole('button', { name: /^Delete Workout B/ }).click();
await page.waitForSelector('text=No finished sessions yet');
await page.reload();
await page.waitForSelector('text=No finished sessions yet');
const rowsAfterReload = await page.locator('ul li').count();
check(rowsAfterReload === 0, `deleted session stays deleted after reload (${rowsAfterReload} rows)`);

await page.screenshot({ path: '/tmp/wc-phase3.png', fullPage: true });
console.log('JS ERRORS:', errors.length ? errors : 'none');
await browser.close();
