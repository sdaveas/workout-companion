import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

const BASE = 'http://localhost:5183';
const fixture = await (await fetch(`${BASE}/src/fixtures/workout-b.json`)).text();

const browser = await chromium.launch({
  headless: !process.env.HEADED,
  ...(process.env.HEADED ? { channel: 'chrome' } : {}),
});
const errors = [];

const check = (cond, msg) => {
  if (!cond) throw new Error(msg);
  console.log('ok:', msg);
};

async function newPage(viewport) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  return page;
}

const noScroll = (page) =>
  page.evaluate(() => {
    const doc = document.documentElement;
    const stage = document.querySelector('[data-testid="stage"]');
    const stepper = document.querySelector('[data-testid="stepper"]');
    const footer = document.querySelector('[data-testid="footer"]');
    return {
      document: doc.scrollHeight - innerHeight,
      stage: stage ? stage.scrollHeight - stage.clientHeight : 0,
      stepperAboveFooter:
        !stepper || !footer
          ? true
          : stepper.getBoundingClientRect().bottom <= footer.getBoundingClientRect().top + 1,
    };
  });

const layoutOk = async (page, label) => {
  const m = await noScroll(page);
  check(m.document <= 1, `${label}: no page scroll (${m.document}px)`);
  check(m.stage <= 1, `${label}: stage does not clip (${m.stage}px)`);
  check(m.stepperAboveFooter, `${label}: reps stepper sits above the footer`);
};

const backLinks = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('a[aria-label^="Back to "]')].map((a) => ({
      href: a.getAttribute('href'),
      label: a.getAttribute('aria-label'),
    })),
  );

// a fresh context has its own IndexedDB, so the import happens per context
async function importFixture(page) {
  await writeFile('/tmp/wc-phase6.json', fixture, 'utf8');
  await page.goto(`${BASE}/#/settings`);
  await page.setInputFiles('#backup-file', '/tmp/wc-phase6.json');
  await page.waitForSelector('text=Imported');
}

// --- every route declares a parent; Home declares none ----------------------
const routes = [
  ['#/', null],
  ['#/programs', '#/'],
  ['#/programs/new', '#/programs'],
  ['#/programs/build', '#/programs'],
  ['#/program/workout-b', '#/programs'],
  ['#/history', '#/'],
  ['#/settings', '#/'],
  ['#/credits', '#/settings'],
  ['#/paste', '#/programs'],
  ['#/p/not-json', '#/'],
  ['#/add/not-json', '#/'],
  ['#/no-such-page', '#/'],
];

const nav = await newPage({ width: 390, height: 844 });
for (const [route, target] of routes) {
  await nav.goto(`${BASE}/${route}`);
  await nav.waitForTimeout(250);
  const links = await backLinks(nav);
  if (target === null) {
    check(links.length === 0, `${route}: root screen has no back control`);
  } else {
    check(links.length === 1, `${route}: exactly one back control`);
    check(links[0]?.href === target, `${route}: back → ${target} (${links[0]?.href})`);
  }
}
await nav.context().close();

// --- layout and the auto run at 390x844 ------------------------------------
const page = await newPage({ width: 390, height: 844 });
await importFixture(page);
await page.goto(`${BASE}/#/program/workout-b`);
await page.getByRole('button', { name: 'Start this program' }).click();
await page.waitForURL(/#\/session/);
await page.getByRole('button', { name: 'Start', exact: true }).waitFor();
await layoutOk(page, 'ready');

await page.getByRole('button', { name: 'Start', exact: true }).click();
await page.waitForSelector('text=Complete set');
await layoutOk(page, 'set');

const countdown = () => page.locator('p[role="status"]').first().textContent();
const seconds = (t) => Number(t.trim().slice(0, 2)) * 60 + Number(t.trim().slice(3));

await page.getByRole('button', { name: 'Auto', exact: true }).click();
await page.waitForSelector('text=Auto on');
await page.waitForTimeout(1100);
const before = seconds(await countdown());
check(before > 0 && before < 32, `auto set clock is counting down (${before}s)`);

await page.getByRole('button', { name: '+15s' }).click();
const raised = seconds(await countdown());
check(raised >= before + 13, `+15s adds time (${before}s → ${raised}s)`);

for (let i = 0; i < 3; i += 1) await page.getByRole('button', { name: '−15s' }).click();
await page.waitForSelector('text=Rest remaining', { timeout: 8000 });
check(true, 'the set completed on its own and the break started');
await layoutOk(page, 'rest');

await page.getByRole('button', { name: 'Skip rest' }).click();
await page.waitForTimeout(900);
check(await page.getByRole('button', { name: 'Done now' }).isVisible(), 'next set is armed for auto');
await layoutOk(page, 'set after rest');

// the one skip button takes the set, then end through the confirm overlay
await page.getByRole('button', { name: 'Skip stage' }).click();
await page.waitForTimeout(300);
await layoutOk(page, 'after skip');

await page.getByRole('button', { name: 'End' }).click();
await page.getByRole('button', { name: 'Finish & save' }).click();
await page.waitForURL(/#\/summary\//);
check(true, 'finished session lands on the summary');
const summaryBack = await backLinks(page);
check(summaryBack.length === 1 && summaryBack[0].href === '#/', 'summary has a back control to Home');

const summaryUrl = page.url();
// let the queued IndexedDB write land before the reload
await page.waitForTimeout(800);
await page.reload();
await page.waitForURL(/#\/summary\//);
await page.waitForSelector('a[aria-label="Back to Home"]');
const afterReload = await backLinks(page);
check(
  afterReload.length === 1 && afterReload[0].href === '#/',
  `reloaded summary keeps its back control (${summaryUrl})`,
);

await page.goto(`${BASE}/#/history`);
await page.waitForSelector('text=Workout B', { timeout: 5000 });
check(true, 'history lists the auto session');

// --- the same layout on the smallest screen --------------------------------
await page.setViewportSize({ width: 360, height: 640 });
await page.goto(`${BASE}/#/program/workout-b`);
await page.getByRole('button', { name: 'Start this program' }).click();
await page.waitForURL(/#\/session/);
await page.getByRole('button', { name: 'Start', exact: true }).waitFor();
await layoutOk(page, '360x640 ready');
await page.getByRole('button', { name: 'Start', exact: true }).click();
await page.waitForSelector('text=Complete set');
await layoutOk(page, '360x640 set');
await page.getByRole('button', { name: 'Auto', exact: true }).click();
await page.waitForTimeout(500);
await layoutOk(page, '360x640 auto set');
await page.context().close();

check(errors.length === 0, `no console errors (${errors.slice(0, 3).join(' | ')})`);
await browser.close();
console.log('phase6 ok');
