import { writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { chromium } from '@playwright/test';

const BASE = process.env.BASE ?? 'http://localhost:5183';
const results = [];
const pass = (m) => results.push(['PASS', m]);
const fail = (m) => results.push(['FAIL', m]);
const ux = (m) => results.push(['UX  ', m]);
const expect = (cond, msg) => {
  (cond ? pass : fail)(msg);
  console.log(cond ? 'PASS' : 'FAIL', msg);
  return cond;
};
const report = (m) => {
  ux(m);
  console.log('UX  ', m);
};

const browser = await chromium.launch(process.env.HEADED ? { headless: false, channel: 'chrome', slowMo: 60 } : {});

/** A fresh profile: no programs, no sessions. */
async function fresh() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('dialog', (d) => d.accept());
  return { context, page, errors };
}

const program = (id, name, day, exercises) =>
  JSON.stringify({
    schema_version: 1,
    id,
    name,
    ...(day ? { schedule: { day } } : {}),
    exercises,
  });
const ex = (id, name, sets = 1, rest = 0) => ({
  id,
  name,
  sets,
  reps: { min: 5, max: 5 },
  rest_seconds: rest,
});

let seedCount = 0;
async function tmpFile(text) {
  seedCount += 1;
  const path = `/tmp/wc-seed-${process.pid}-${seedCount}.json`;
  await writeFile(path, text, 'utf8');
  return path;
}

/** Seeds a program through the same import a user would use. */
async function saveProgram(page, json) {
  const path = await tmpFile(json);
  await page.goto(`${BASE}/#/settings`);
  await page.setInputFiles('#backup-file', path);
  await page.waitForSelector('text=Imported');
}

/** Taps through a workout until it stops cycling. Returns the number of sets completed. */
async function drive(page, limit = 60) {
  let sets = 0;
  for (let i = 0; i < limit; i += 1) {
    if (page.url().includes('#/summary/')) break;
    const step = async (name) => {
      const btn = page.getByRole('button', { name }).first();
      if (await btn.isVisible().catch(() => false)) {
        await btn.click();
        return true;
      }
      return false;
    };
    if (await step('Start set')) continue;
    if (await step('Skip rest')) continue;
    if (await step('Complete set')) {
      sets += 1;
      continue;
    }
    if (await step(/^(Continue|Finish workout)$/)) continue;
    await page.waitForTimeout(40);
  }
  return sets;
}

/** Home's start button opens a preview screen; the workout itself begins from there. */
async function beginFromPreview(page) {
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.waitForSelector('text=Complete set');
}

const todayName = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][
  new Date().getDay()
];

const progress = async (page) =>
  (await page.getAttribute('[role="progressbar"]', 'aria-valuetext').catch(() => '')) ?? '';

const auditScreen = async (page, screen) => {
  const r = await page.evaluate(() => {
    const overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    const controls = [...document.querySelectorAll('button, a[href], input, select, textarea')];
    const small = controls
      .map((el) => {
        const b = el.getBoundingClientRect();
        const label = el.closest('label')?.getBoundingClientRect();
        const text = (el.getAttribute('aria-label') ?? el.textContent ?? el.getAttribute('placeholder') ?? el.tagName)
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 28);
        return {
          label: text,
          w: Math.round(b.width),
          h: Math.round(b.height),
          // an input inside a 44px label is tapped through the label
          throughLabel: Boolean(label && label.height >= 44),
        };
      })
      .filter((x) => x.h > 0 && (x.h < 44 || x.w < 44) && !x.throughLabel)
      .map(({ throughLabel, ...rest }) => rest);
    const unlabeled = [...document.querySelectorAll('button, a[href]')].filter(
      (el) => !(el.getAttribute('aria-label') ?? el.textContent ?? '').trim(),
    ).length;
    const h1 = document.querySelectorAll('h1').length;
    return { overflow, small, unlabeled, h1 };
  });
  if (r.overflow > 0) fail(`${screen}: horizontal overflow ${r.overflow}px`);
  if (r.small.length) report(`${screen}: tap targets under 44px ${JSON.stringify(r.small)}`);
  if (r.unlabeled) fail(`${screen}: ${r.unlabeled} control(s) without an accessible name`);
  return r;
};

// ---------------------------------------------------------------- scenario 1
{
  const { context, page, errors } = await fresh();
  await page.goto(`${BASE}/#/`);
  await page.waitForSelector('text=Ready to train');
  await page.waitForSelector('text=Get started');
  expect(await page.getByRole('link', { name: 'Build a program' }).isVisible(), 'first run offers the builder');
  await auditScreen(page, 'home/first-run');

  await page.getByRole('link', { name: 'Build a program' }).click();
  await page.getByPlaceholder('Workout C').fill('Scenario Day');
  await page.getByLabel('Scheduled day').selectOption('monday');
  const row = page.locator('li').filter({ hasText: 'Exercise 1' });
  await row.getByPlaceholder('Goblet Squat').fill('Squat');
  await row.getByLabel('Rest s').fill('0');
  await page.getByRole('button', { name: 'Create program' }).click();
  await page.waitForSelector('text=Program "Scenario Day" added');
  await auditScreen(page, 'programs/after-create');

  await page.getByRole('link', { name: 'Back home' }).click();
  await page.getByRole('button', { name: /Start/ }).waitFor();
  expect(await page.getByRole('button', { name: /Start/ }).isVisible(), 'home offers Start after creating');
  await page.getByRole('button', { name: /Start/ }).click();
  const backHome = page.getByRole('button', { name: '← Home' });
  await backHome.waitFor();
  expect(await backHome.isVisible(), 'starting opens the preview instead of the workout');
  await beginFromPreview(page);
  await auditScreen(page, 'workout/active');
  const completed = await drive(page);
  expect(completed === 3, `completed the programmed sets (${completed})`);
  expect(page.url().includes('#/summary/'), 'finishing opens the summary');
  await auditScreen(page, 'summary');
  await page.getByRole('button', { name: 'Done' }).click();
  await page.waitForSelector('text=Ready to train');

  await page.goto(`${BASE}/#/history`);
  await page.waitForSelector('text=Scenario Day');
  await auditScreen(page, 'history');

  // Export must produce the file the MCP reads
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export' }).click(),
  ]);
  const stream = await download.createReadStream();
  let raw = '';
  for await (const chunk of stream) raw += chunk;
  const exported = JSON.parse(raw);
  expect(download.suggestedFilename() === 'workout-history.json', `export filename (${download.suggestedFilename()})`);
  expect(
    exported.sessions.length === 1 && exported.sessions[0].summary.setsCompleted === 3,
    'the exported file carries the session summary',
  );
  expect(errors.length === 0, `no console errors (${errors.join(' | ') || 'none'})`);
  await context.close();
}

// ---------------------------------------------------------------- scenario 2
{
  const { context, page, errors } = await fresh();
  await saveProgram(page, program('rest-day', 'Rest Day', 'monday', [ex('squat', 'Squat', 2, 60)]));
  await page.goto(`${BASE}/#/`);
  await page.getByRole('button', { name: /Start/ }).click();
  await beginFromPreview(page);
  await page.getByRole('button', { name: 'Complete set' }).click();
  await page.waitForSelector('text=Rest remaining');
  expect(true, 'a completed set starts the rest timer');
  await auditScreen(page, 'workout/resting');
  await page.reload();
  await page.waitForSelector('text=Rest remaining');
  expect(true, 'reloading during rest keeps the rest screen');
  await auditScreen(page, 'workout/resting-with-undo');
  await page.getByRole('button', { name: 'Skip rest' }).click();
  await page.waitForSelector('button:has-text("Complete set")');
  expect(true, 'Skip rest returns to set entry');

  // undo: is there any way to take back the set just logged?
  await page.getByRole('button', { name: 'Complete set' }).click();
  const undo = page.getByRole('button', { name: /undo/i });
  const hasUndo = await undo.count();
  if (hasUndo === 0) report('workout: no Undo control — a mis-tapped "Complete set" cannot be taken back');
  else expect(await undo.first().isVisible(), 'Undo is reachable after logging a set');
  expect(errors.length === 0, `no console errors (${errors.join(' | ') || 'none'})`);
  await context.close();
}

// ---------------------------------------------------------------- scenario 3
{
  const { context, page } = await fresh();
  await saveProgram(page, program('long-day', 'Long Day', 'monday', [ex('a', 'Alpha', 2, 0), ex('b', 'Beta', 2, 0), ex('c', 'Gamma', 2, 0)]));
  await page.goto(`${BASE}/#/`);
  await page.getByRole('button', { name: /Start/ }).click();
  await beginFromPreview(page);
  const twoSets = async () => {
    for (let i = 0; i < 2; i += 1) {
      await page.getByRole('button', { name: 'Complete set' }).click();
      const startSet = page.getByRole('button', { name: 'Start set' });
      if (await startSet.isVisible().catch(() => false)) await startSet.click();
      const cont = page.getByRole('button', { name: 'Continue' });
      if (await cont.isVisible().catch(() => false)) await cont.click();
    }
  };
  await twoSets();
  await page.reload();
  await page.waitForSelector('text=Complete set');
  const bars = await progress(page);
  expect(/2 of 6/.test(bars), `reload mid-workout keeps progress (${bars})`);

  // leaving the workout and coming back
  await page.goto(`${BASE}/#/`);
  expect(await page.getByText('In progress').isVisible(), 'Home shows the workout in progress');
  await page.getByRole('button', { name: 'Resume workout' }).click();
  await page.waitForSelector('text=Complete set');
  expect(true, 'Resume workout returns to the live set');

  // end early
  await page.getByRole('button', { name: 'End' }).click();
  await page.getByRole('button', { name: 'Finish & save' }).click();
  await page.waitForSelector('#/summary/'.length ? 'text=Ended early' : 'text=Session complete');
  const body = (await page.textContent('body')).replace(/\s+/g, ' ');
  expect(/ended early|2 of 6/i.test(body), `ending early is labelled on the summary (${/ended early|2 of 6/i.exec(body)?.[0]})`);
  await context.close();
}

// ---------------------------------------------------------------- scenario 4
{
  const { context, page } = await fresh();

  // a broken file is reported and nothing is written
  await page.goto(`${BASE}/#/settings`);
  await page.setInputFiles('#backup-file', await tmpFile('{"schema_version":1}'));
  await page.waitForSelector('text=neither a workout program');
  expect(true, 'a broken file is reported on Settings');
  await page.goto(`${BASE}/#/programs`);
  await page.waitForSelector('text=Nothing saved yet');
  expect(true, 'a rejected file imports nothing');

  await saveProgram(page, program('tiny', 'Tiny', 'monday', [ex('a', 'Alpha')]));
  await page.goto(`${BASE}/#/programs`);
  await page.waitForSelector('text=Saved (1)');
  expect(true, 'a program file imports');

  // same id again: updated in place, not duplicated
  await saveProgram(page, program('tiny', 'Tiny again', 'monday', [ex('a', 'Alpha')]));
  await page.goto(`${BASE}/#/programs`);
  await page.waitForSelector('text=Tiny again');
  expect(
    (await page.textContent('body')).includes('Saved (1)'),
    'a re-import updates by id instead of duplicating',
  );

  // edit through the builder, then start it
  await page.getByRole('button', { name: 'Edit' }).first().click();
  await page.waitForSelector('text=Editing');
  const sets = page.locator('li').filter({ hasText: 'Exercise 1' }).getByLabel('Sets');
  await sets.fill('3');
  await page.getByRole('button', { name: 'Update program' }).click();
  await page.waitForSelector('text=updated.');
  await page.goto(`${BASE}/#/`);
  await page.getByRole('button', { name: /Start/ }).click();
  await beginFromPreview(page);
  const label = await progress(page);
  expect(/0 of 3/.test(label), `the update reached the workout (${label})`);
  await context.close();
}

// ---------------------------------------------------------------- scenario 5
{
  const { context, page } = await fresh();
  await saveProgram(page, program('skip-day', 'Skip Day', 'monday', [ex('a', 'Alpha', 2, 0), ex('b', 'Beta', 1, 0)]));
  await page.goto(`${BASE}/#/`);
  await page.getByRole('button', { name: /Start/ }).click();
  await beginFromPreview(page);
  await page.getByRole('button', { name: 'Skip set' }).click();
  await page.waitForSelector('text=2 / 2');
  expect(true, 'Skip set advances to the next set of the same exercise');
  await page.reload();
  await page.waitForSelector('text=2 / 2');
  expect(true, 'the skipped-set position survives a reload');
  const afterSkipSet = await progress(page);
  expect(/skipped/.test(afterSkipSet), `the progress label says how many sets were skipped (${afterSkipSet})`);
  await page.getByRole('button', { name: 'Skip exercise' }).click();
  await page.waitForSelector('text=Next exercise');
  expect(true, 'Skip exercise previews the next exercise before moving on');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForSelector('text=Beta');
  expect(
    await page.getByRole('region', { name: 'Beta' }).isVisible().catch(() => false),
    'Continue after Skip exercise lands on the next exercise',
  );

  // a mis-tapped Complete set must be reversible
  await page.getByRole('button', { name: 'Complete set' }).click();
  const undo = page.getByRole('button', { name: 'Undo' });
  await undo.waitFor();
  const before = await progress(page);
  await undo.click();
  const after = await progress(page);
  expect(before !== after, `Undo takes the set back (${before} -> ${after})`);
  await context.close();
}

// ---------------------------------------------------------------- scenario 6
{
  const { context, page } = await fresh();
  await saveProgram(page, program('del-day', 'Del Day', 'monday', [ex('a', 'Alpha')]));
  await page.goto(`${BASE}/#/`);
  await page.getByRole('button', { name: /Start/ }).click();
  await beginFromPreview(page);
  await drive(page);
  await page.waitForSelector('text=Session complete');
  await page.getByRole('button', { name: 'Done' }).click();

  await page.goto(`${BASE}/#/history`);
  await page.getByText('Del Day').waitFor();
  expect(await page.getByText('Del Day').isVisible(), 'the session is listed');
  await page.getByRole('button', { name: /^Delete Del Day/ }).click();
  await page.waitForSelector('text=No finished sessions yet');
  expect(true, 'deleting a session empties history');

  await page.goto(`${BASE}/#/programs`);
  await page.getByRole('button', { name: 'Delete' }).first().click();
  await page.waitForSelector('text=Nothing saved yet');
  await page.goto(`${BASE}/#/`);
  expect(await page.getByRole('link', { name: 'Build a program' }).isVisible(), 'deleting the last program returns Home to the first-run state');
  await auditScreen(page, 'home/after-delete');
  await context.close();
}

// ---------------------------------------------------------------- scenario 7
{
  const { context, page } = await fresh();
  const many = Array.from({ length: 8 }, (_, i) => ex(`e${i}`, `Exercise ${i + 1} with a long enough name`, 1, 30));
  await saveProgram(page, program('many-day', 'Many Day', 'monday', many));
  await page.goto(`${BASE}/#/`);
  await page.getByRole('button', { name: /Start/ }).click();
  await beginFromPreview(page);
  const footer = page.getByRole('button', { name: 'Complete set' });
  const inView = await footer.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return r.bottom <= window.innerHeight + 1 && r.top >= 0;
  });
  expect(inView, 'the action button stays on screen with 8 exercises');
  await auditScreen(page, 'workout/long-program');
  await page.mouse.wheel(0, 400);
  const stillInView = await footer.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return r.bottom <= window.innerHeight + 1 && r.top >= 0;
  });
  expect(stillInView, 'the action button survives scrolling the page');
  await context.close();
}

// ---------------------------------------------------------------- scenario 8
{
  const { context, page } = await fresh();
  await saveProgram(page, program('unscheduled', 'Unscheduled', null, [ex('a', 'Alpha')]));
  await page.goto(`${BASE}/#/`);
  expect(await page.getByRole('button', { name: /Unscheduled/ }).isVisible(), 'an unscheduled program is startable');
  await page.getByRole('button', { name: /Unscheduled/ }).click();
  await beginFromPreview(page);
  await page.getByRole('button', { name: 'Complete set' }).click();
  await page.waitForSelector('button:has-text("Finish workout")');
  await page.getByRole('button', { name: 'Finish workout' }).click();
  await page.waitForSelector('text=Session complete');
  expect(true, 'an unscheduled program can be completed end to end');

  // abandoning a session from the End menu
  await page.getByRole('button', { name: 'Done' }).click();
  await page.goto(`${BASE}/#/`);
  await page.getByRole('button', { name: /Unscheduled/ }).click();
  await beginFromPreview(page);
  await page.getByRole('button', { name: 'End' }).click();
  await page.getByRole('button', { name: 'Abandon' }).click();
  await page.waitForSelector('text=Ready to train');
  await page.goto(`${BASE}/#/history`);
  const rows = await page.locator('ul li').count();
  expect(rows === 1, `an abandoned session stays out of history (${rows} row)`);
  await context.close();
}

// ---------------------------------------------------------------- scenario 9
{
  const { context, page, errors } = await fresh();
  await saveProgram(page, program('today-prog', 'Today Day', todayName, [ex('a', 'Alpha')]));
  await saveProgram(page, program('any-prog', 'Any Day', null, [ex('b', 'Beta')]));

  await page.goto(`${BASE}/#/`);
  await page.waitForSelector('text=Today Day');
  expect(
    await page.getByRole('button', { name: /Any Day/ }).isVisible(),
    'the unscheduled program is reachable while a scheduled one is featured',
  );
  await auditScreen(page, 'home/two-programs');

  await page.getByRole('button', { name: /Any Day/ }).click();
  await page.getByRole('region', { name: 'Beta' }).waitFor();
  const previewBody = (await page.textContent('body')).replace(/\s+/g, ' ');
  expect(!/Complete set/.test(previewBody), 'the preview does not begin the workout');
  expect(/Start/.test(previewBody), 'the preview offers Start');

  await page.getByRole('button', { name: '← Home' }).click();
  await page.waitForSelector('text=Ready to train');
  expect(
    !(await page.getByText('In progress').isVisible().catch(() => false)),
    'backing out of the preview leaves no session in progress',
  );
  await page.goto(`${BASE}/#/history`);
  const rows = await page.locator('ul li').count().catch(() => 0);
  expect(
    (await page.getByText('No finished sessions yet').isVisible().catch(() => false)) || rows === 0,
    'the preview was never saved as a session',
  );

  await page.goto(`${BASE}/#/`);
  await page.getByRole('button', { name: /Start workout/ }).click();
  await page.getByRole('region', { name: 'Alpha' }).waitFor();

  // a fast double-tap must not land on the Complete set button that replaces Start
  const startBox = await page.getByRole('button', { name: 'Start', exact: true }).boundingBox();
  const tap = () => page.mouse.click(startBox.x + startBox.width / 2, startBox.y + startBox.height / 2);
  await tap();
  await tap();
  await page.waitForSelector('[role="progressbar"]');
  const afterDoubleTap = await progress(page);
  expect(/^0 of/.test(afterDoubleTap), `a double-tap on Start logs no set (${afterDoubleTap})`);
  await page.getByLabel('elapsed time').waitFor();
  expect(await page.getByLabel('elapsed time').isVisible(), 'Start begins the timed workout');
  expect(errors.length === 0, `no console errors (${errors.join(' | ') || 'none'})`);
  await context.close();
}

// ---------------------------------------------------------------- scenario 10
{
  const a = await fresh();
  await saveProgram(a.page, program('bk-1', 'Backup One', 'monday', [ex('a', 'Alpha')]));
  await saveProgram(a.page, program('bk-2', 'Backup Two', null, [ex('b', 'Beta')]));
  await a.page.goto(`${BASE}/#/`);
  await a.page.getByRole('button', { name: /Backup Two/ }).click();
  await beginFromPreview(a.page);
  await drive(a.page);
  await a.page.waitForSelector('text=Session complete');
  await a.page.getByRole('button', { name: 'Done' }).click();

  await a.page.goto(`${BASE}/#/settings`);
  const [download] = await Promise.all([
    a.page.waitForEvent('download'),
    a.page.getByRole('button', { name: 'Export backup' }).click(),
  ]);
  expect(
    download.suggestedFilename() === 'workout-companion-backup.json',
    `backup filename (${download.suggestedFilename()})`,
  );
  const backup = await download.path();

  // a second phone: nothing installed, then one import
  const b = await fresh();
  await b.page.goto(`${BASE}/#/settings`);
  await b.page.setInputFiles('#backup-file', backup);
  await b.page.waitForSelector('text=Imported');
  await b.page.goto(`${BASE}/#/programs`);
  await b.page.waitForSelector('text=Saved (2)');
  expect(true, 'both programs arrive from the backup');
  await b.page.goto(`${BASE}/#/history`);
  await b.page.waitForSelector('text=Backup Two');
  expect(true, 'the session history arrives with the backup');
  await b.page.goto(`${BASE}/#/`);
  await b.page.getByRole('button', { name: /Backup Two/ }).click();
  await beginFromPreview(b.page);
  expect(true, 'an imported program is startable');
  await auditScreen(b.page, 'settings/after-import');
  await b.context.close();
  await a.context.close();
}

// ---------------------------------------------------------------- scenario 11: sharing
{
  // Phone A shares; phone B receives. Same device would already know the program.
  const sender = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const a = await sender.newPage();
  a.on('dialog', (d) => d.accept());
  await saveProgram(a, program('leg-day', 'Leg Day', 'monday', [ex('squat', 'Squat')]));
  await a.goto(`${BASE}/#/programs`);
  await a.getByRole('button', { name: 'Share' }).first().click();
  await a.waitForSelector('text=copied');
  const link = await a.evaluate(() => navigator.clipboard.readText());
  expect(link.includes('#/add/'), 'sharing copies a link with the program inside it');
  expect(link.length < 1200, `the link stays short enough to send (${link.length} chars)`);
  await sender.close();

  const receiver = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const b = await receiver.newPage();
  b.on('dialog', (d) => d.accept());

  await b.goto(link);
  await b.getByText('Someone shared this').waitFor();
  expect(
    await b.getByRole('button', { name: 'Add to my routines' }).isVisible(),
    'a shared link asks before adding',
  );
  await b.goto(`${BASE}/#/programs`);
  await b.waitForSelector('text=Nothing saved yet');
  expect(true, 'opening a shared link does not import on its own');

  await b.goto(link);
  await b.getByRole('button', { name: 'Add to my routines' }).click();
  await b.waitForSelector('text=Saved (1)');
  expect(true, 'adding a shared program saves it');

  // The same link again clashes: ask for another name, never overwrite.
  await b.goto(link);
  await b.getByText('You already have a program with this name.').waitFor();
  const suggested = await b.getByLabel('New name').inputValue();
  expect(suggested === 'Leg Day (2)', `the clash suggests a free name (${suggested})`);
  await b.getByRole('button', { name: 'Save with this name' }).click();
  await b.waitForSelector('text=Saved (2)');
  expect(await b.getByText('Leg Day (2)', { exact: true }).isVisible(), 'the copy lands beside the original');

  // The builder refuses a duplicate name the same way — and no longer offers to replace.
  await b.goto(`${BASE}/#/programs`);
  await b.getByPlaceholder('Workout C').fill('Leg Day');
  await b.locator('li').filter({ hasText: 'Exercise 1' }).getByPlaceholder('Goblet Squat').fill('Press');
  await b.getByRole('button', { name: 'Create program' }).click();
  await b.getByText('A program called').waitFor();
  expect(
    (await b.getByRole('button', { name: 'Replace it' }).count()) === 0,
    'a duplicate name no longer offers to overwrite',
  );
  const nextName = await b.getByLabel('New name').inputValue();
  expect(nextName === 'Leg Day (3)', `the builder suggests the next free name (${nextName})`);
  await b.getByRole('button', { name: 'Save with this name' }).click();
  await b.waitForSelector('text=Saved (3)');
  expect(true, 'saving under the suggested name keeps every program');
  await receiver.close();
}

await browser.close();
const counts = results.reduce((acc, [k]) => ({ ...acc, [k]: (acc[k] ?? 0) + 1 }), {});
console.log('\nSUMMARY', JSON.stringify(counts));
for (const [kind, msg] of results.filter(([k]) => k !== 'PASS')) console.log(`${kind} ${msg}`);
