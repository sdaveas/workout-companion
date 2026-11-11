import { writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:5183';
const fixture = await (await fetch(`${BASE}/src/fixtures/workout-b.json`)).text();
const fixtureProgram = JSON.parse(fixture);
const total = fixtureProgram.exercises.reduce(
  (n, e) => n + e.sets * (e.weight?.per_hand ? 2 : 1),
  0,
);
const completeSet = /^Complete (set|left hand|right hand)$/;

const browser = await chromium.launch({
  headless: !process.env.HEADED,
  ...(process.env.HEADED ? { channel: 'chrome' } : {}),
});
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
// The set count is the pips' label ("Set 2 / 3") beside the exercise name.
const setPos = async () => {
  const pips = page.locator('[role=img][aria-label^="Set "]').first();
  const label = (await pips.count()) ? await pips.getAttribute('aria-label') : '';
  const m = (label ?? '').match(/Set\s*(\d+)\s*\/\s*(\d+)/);
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
    if (await visible(completeSet)) return;
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
  const button = page.getByRole('button', { name: completeSet });
  const closingHand = /hand/i.test((await button.textContent()) ?? '');
  await button.click();
  sets += 1;
  // A two-hand set holds the closing hand for 600 ms before the break starts.
  if (closingHand) await page.waitForTimeout(700);
}

// import + start
const fixturePath = '/tmp/wc-fixture.json';
await writeFile(fixturePath, fixture, 'utf8');
await page.goto(`${BASE}/#/settings`);
await page.setInputFiles('#backup-file', fixturePath);
await page.waitForSelector('text=Imported');
await page.goto(`${BASE}/#/programs`);
await page.waitForSelector('text=Saved (1)');
await page.goto(`${BASE}/#/`);
await page.getByRole('button', { name: /^Start/ }).click();
await page.getByRole('button', { name: 'Start', exact: true }).click(); // preview
await page.waitForSelector(`text=${completeSet}`);

for (let i = 0; i < 2; i += 1) await completeOneSet();
await settle();

const before = await setPos();
const beforeName = (await page.textContent('h1')).trim();
check(before?.set === 3, `2 sets done, now on set ${before?.set}`);

// kill the tab mid-set, reload, resume exactly
await page.reload();
try {
  await page.waitForSelector(`text=${completeSet}`);
} catch (err) {
  console.log('AFTER RELOAD:', page.url(), (await body()).slice(0, 300));
  throw err;
}
const after = await setPos();
const afterName = (await page.textContent('h1')).trim();
check(after?.set === before?.set && after?.total === before?.total, 'reload restores the exact set');
check(afterName === beforeName, `reload restores the same exercise (${afterName})`);
check(!(await body()).includes('Ready to train'), 'reload lands on the active session, not Home');

// reload mid-rest, with auto stopped and restarted
// a per-hand exercise needs a second tap before the break starts
for (let i = 0; i < 3 && !(await visible('Skip rest')); i += 1) {
  await settle();
  if (page.url().includes('#/summary/')) break;
  const handButton = page.getByRole('button', { name: completeSet });
  const handClosing = /hand/i.test((await handButton.textContent()) ?? '');
  await handButton.click();
  sets += 1;
  await page.waitForTimeout(handClosing ? 700 : 60);
}
await page.waitForSelector('text=Rest remaining');
await page.waitForTimeout(2000);
const rest1 = (await body()).match(/Rest remaining(\d{2}:\d{2})/)?.[1];
const secs = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
await page.getByRole('button', { name: 'Start auto' }).click();
await page.waitForTimeout(1200);
const restAuto = (await body()).match(/Rest remaining(\d{2}:\d{2})/)?.[1];
check(
  rest1 && restAuto && secs(rest1) - secs(restAuto) >= 1,
  `the rest clock runs with auto on (${rest1} → ${restAuto})`,
);
await page.getByRole('button', { name: 'Stop auto' }).click();
await page.waitForTimeout(1200);
const restStopped = (await body()).match(/Rest remaining(\d{2}:\d{2})/)?.[1];
check(
  restAuto && restStopped && secs(restAuto) - secs(restStopped) >= 1,
  `stopping auto leaves the rest clock running (${restAuto} → ${restStopped})`,
);
await page.reload();
await page.waitForSelector('text=Rest remaining');
const rest2 = (await body()).match(/Rest remaining(\d{2}:\d{2})/)?.[1];
check(
  rest2 && Math.abs(secs(rest2) - secs(restStopped)) <= 2,
  `rest resumes from the clock after a reload (${restStopped} → ${rest2})`,
);
await page.getByRole('button', { name: 'Skip rest' }).first().click();

// finish the workout after all that reloading
while (!page.url().includes('#/summary/') && sets < total + 5) await completeOneSet();
check(sets === total, `finished after recovery (${sets}/${total} sets)`);
await page.waitForSelector('text=Session complete');
check(new RegExp(`${total}\\s*of\\s*${total}`).test(await body()), `summary still reports ${total} of ${total}`);
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
