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
const body = async () => (await page.textContent('body')).replace(/\s+/g, ' ');
const setPos = async () => {
  const m = (await body()).match(/Set\s*(\d+)\s*\/\s*(\d+)/);
  return m ? { set: Number(m[1]), total: Number(m[2]) } : null;
};
const visible = (name) =>
  page
    .getByRole('button', { name })
    .first()
    .isVisible()
    .catch(() => false);

let sets = 0;
/** Clicks through rest / exercise-complete until Complete set is showing. */
async function settle() {
  for (let i = 0; i < 60; i += 1) {
    if (page.url().includes('#/summary/')) return;
    if (await visible('Complete set')) return;
    if (await visible('Start set')) {
      await page.getByRole('button', { name: 'Start set' }).click();
      continue;
    }
    if (await visible('Skip rest')) {
      await page.getByRole('button', { name: 'Skip rest' }).first().click();
      continue;
    }
    if (await visible(/^(Continue|Finish workout)$/)) {
      await page.getByRole('button', { name: /^(Continue|Finish workout)$/ }).click();
      continue;
    }
    await page.waitForTimeout(50);
  }
}

/** Clicks through rest / exercise-complete until Complete set is showing, then completes it. */
async function completeOneSet() {
  await settle();
  if (page.url().includes('#/summary/')) return;
  await page.getByRole('button', { name: 'Complete set' }).click();
  sets += 1;
}

// import + start
await page.goto(`${BASE}/#/programs/paste`);
await page.fill('#json', fixture);
await page.waitForSelector('text=Preview');
await page.click('button:has-text("Save program")');
await page.waitForSelector('text=Saved (1)');
await page.goto(`${BASE}/#/`);
await page.getByRole('button', { name: /^Start/ }).click();
await page.getByRole('button', { name: 'Start', exact: true }).click(); // preview
await page.waitForSelector('text=Complete set');

for (let i = 0; i < 2; i += 1) await completeOneSet();
await settle();

const before = await setPos();
const beforeName = (await page.textContent('h1')).trim();
check(before?.set === 3, `2 sets done, now on set ${before?.set}`);

// kill the tab mid-set, reload, resume exactly
await page.reload();
try {
  await page.waitForSelector('text=Complete set');
} catch (err) {
  console.log('AFTER RELOAD:', page.url(), (await body()).slice(0, 300));
  throw err;
}
const after = await setPos();
const afterName = (await page.textContent('h1')).trim();
check(after?.set === before?.set && after?.total === before?.total, 'reload restores the exact set');
check(afterName === beforeName, `reload restores the same exercise (${afterName})`);
check(!(await body()).includes('Ready to train'), 'reload lands on the active session, not Home');

// reload mid-rest, and mid-pause
await completeOneSet();
await settle();
await page.getByRole('button', { name: 'Complete set' }).click();
sets += 1;
await page.waitForSelector('text=Rest remaining');
await page.waitForTimeout(2000);
const rest1 = (await body()).match(/Rest remaining(\d{2}:\d{2})/)?.[1];
await page.getByRole('button', { name: 'Pause' }).click();
const frozen = await page.locator('p.text-6xl').textContent();
await page.reload();
await page.waitForSelector('text=Paused');
const frozenAfter = (await page.locator('p.text-6xl').textContent()).trim();
check(frozenAfter === frozen.trim(), `paused countdown survives reload (${frozenAfter})`);
await page.getByRole('button', { name: 'Resume' }).click();
await page.waitForSelector('text=Rest remaining');
const rest2 = (await body()).match(/Rest remaining(\d{2}:\d{2})/)?.[1];
const secs = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
check(
  rest1 && rest2 && Math.abs(secs(rest2) - secs(rest1)) <= 2,
  `rest resumes from the clock, not from zero (${rest1} → ${rest2})`,
);
await page.getByRole('button', { name: 'Skip rest' }).first().click();

// finish the workout after all that reloading
while (!page.url().includes('#/summary/') && sets < 20) await completeOneSet();
check(sets === 16, `finished after recovery (${sets}/16 sets)`);
await page.waitForSelector('text=Session complete');
check(/16\s*of\s*16/.test(await body()), 'summary still reports 16 of 16');
await page.click('button:has-text("Done")');

// corrupt row: unreadable state must be reported, not deleted
await page.evaluate(async () => {
  const open = indexedDB.open('workout-companion');
  const db = await new Promise((res, rej) => {
    open.onsuccess = () => res(open.result);
    open.onerror = () => rej(open.error);
  });
  const tx = db.transaction(['sessions', 'settings'], 'readwrite');
  const sessions = tx.objectStore('sessions');
  const all = await new Promise((res) => {
    const r = sessions.getAll();
    r.onsuccess = () => res(r.result);
  });
  const broken = structuredClone(all[0]);
  broken.id = 'corrupt-1';
  broken.state.sessionId = 'corrupt-1';
  broken.state.program = null;
  broken.status = 'exercise_active';
  sessions.put(broken);
  tx.objectStore('settings').put({ key: 'activeSessionId', value: 'corrupt-1' });
  await new Promise((res) => (tx.oncomplete = res));
});

await page.reload();
await page.waitForSelector('text=could not be recovered');
check(await page.getByText(/still in storage/).isVisible(), 'corrupt session is reported on Home');
const kept = await page.evaluate(async () => {
  const open = indexedDB.open('workout-companion');
  const db = await new Promise((res, rej) => {
    open.onsuccess = () => res(open.result);
    open.onerror = () => rej(open.error);
  });
  const r = db.transaction('sessions').objectStore('sessions').get('corrupt-1');
  return new Promise((res) => (r.onsuccess = () => res(Boolean(r.result))));
});
check(kept, 'corrupt row was not deleted');
check((await body()).includes('Ready to train'), 'Home still usable after a corrupt session');

await page.screenshot({ path: '/tmp/wc-phase4.png', fullPage: true });
console.log('JS ERRORS:', errors.length ? errors : 'none');
await browser.close();
