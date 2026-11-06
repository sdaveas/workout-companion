import { chromium } from '@playwright/test';

const BASE = 'http://localhost:5183';
// HEADED=1 opens a real Chrome window so the UI can be watched while it runs.
const browser = await chromium.launch(
  process.env.HEADED ? { headless: false, channel: 'chrome', slowMo: 150 } : {},
);
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

const check = (cond, msg) => {
  if (!cond) throw new Error(msg);
  console.log('ok:', msg);
};

await page.goto(`${BASE}/#/`);
await page.waitForLoadState('networkidle');
await page.getByRole('link', { name: 'Build a program' }).click();
check(page.url().endsWith('#/programs/build'), 'empty Home sends the user to the Build it tab');

const buildTab = page.getByRole('tab', { name: 'Build it' });
check((await buildTab.getAttribute('aria-selected')) === 'true', 'Build it is the first and default tab');
check(
  (await page.getByPlaceholder('Workout C').inputValue()) === 'My workout',
  'default program name is "My workout"',
);
await page.getByPlaceholder('Workout C').fill('Builder Day');
await page.getByLabel('Scheduled day').selectOption('thursday');

const first = page.locator('li').filter({ hasText: 'Exercise 1' });
await first.getByPlaceholder('Goblet Squat').fill('Front Squat');
await first.getByLabel('Sets').fill('4');
await first.getByLabel('Reps min').fill('5');
await first.getByLabel('Reps max').fill('5');
await first.getByLabel('Weight kg').fill('60');
await first.getByLabel('Rest s').fill('120');

await page.getByRole('button', { name: '+ Add exercise' }).click();
const second = page.locator('li').filter({ hasText: 'Exercise 2' });
await second.getByPlaceholder('Goblet Squat').fill('Inverted Row');

await page.getByRole('button', { name: 'Create program' }).click();
await page.waitForSelector('text=Program "Builder Day" added');
check(await page.getByRole('link', { name: 'Back home' }).isVisible(), 'confirmation offers Back home');
check(await page.getByRole('button', { name: 'Add another' }).isVisible(), 'confirmation offers Add another');

const saved = await page.textContent('section:has-text("Saved (1)")');
check(/Builder Day/.test(saved) && /2 exercises/.test(saved), 'program saved with 2 exercises');

// the built program is complete enough to train
await page.goto(`${BASE}/#/`);
await page.getByRole('button', { name: /^Start/ }).click();
await page.waitForSelector('text=Complete set');
check((await page.textContent('h1')).includes('Front Squat'), 'first exercise is the first row');
check(await page.getByText('4').first().isVisible(), '4 sets carried through');
await page.getByRole('button', { name: 'Complete set' }).click();
await page.waitForSelector('text=Rest remaining');
const rest = (await page.textContent('body')).match(/Rest remaining(\d{2}:\d{2})/)?.[1];
// a second can elapse between the tap and the assertion, especially with slowMo
check(rest === '02:00' || rest === '01:59', `rest is the 120s from the form (${rest})`);

await page.screenshot({ path: '/tmp/wc-builder.png', fullPage: true });
// an invalid program must keep what the user typed
await page.goto(`${BASE}/#/programs/build`);
await page.getByLabel('Program name').fill('Keep me');
const row = page.locator('li').filter({ hasText: 'Exercise 1' });
await row.getByPlaceholder('Goblet Squat').fill('Squat');
await row.getByLabel('Sets').fill('0');
await page.getByRole('button', { name: 'Create program' }).click();
await page.waitForSelector('text=Invalid program');
check(
  (await page.getByLabel('Program name').inputValue()) === 'Keep me',
  'a rejected program keeps the form filled',
);
check((await row.getByPlaceholder('Goblet Squat').inputValue()) === 'Squat', 'exercise rows survive the error');

console.log('JS ERRORS:', errors.length ? errors : 'none');
await browser.close();
