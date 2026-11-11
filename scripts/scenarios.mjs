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
    if (await step(/^Complete (set|left hand|right hand)$/)) {
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
  await page.waitForSelector('text=/Complete (set|left hand|right hand)/');
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
          hidden: el.classList.contains('sr-only'),
        };
      })
      // sr-only controls are 1×1 on purpose; their label is the real target
      .filter((x) => x.h > 0 && (x.h < 44 || x.w < 44) && !x.throughLabel && !x.hidden)
      .map(({ throughLabel, hidden, ...rest }) => rest);
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
  expect(
    await page.getByRole('link', { name: 'Build your first program' }).isVisible(),
    'first run offers a first program',
  );
  await auditScreen(page, 'home/first-run');

  await page.getByRole('link', { name: 'Build your first program' }).click();
  expect(page.url().endsWith('#/programs/new'), 'it opens the same three ways in as the +');
  await page.getByRole('link', { name: /Build your own/ }).click();
  await page.getByPlaceholder('Workout C').fill('Scenario Day');
  await page.getByRole('group', { name: 'Scheduled day' }).getByRole('button', { name: 'Mon' }).click();
  expect(
    (await page.getByText('Exercise 1', { exact: true }).count()) === 0,
    'a new program starts with no exercise rows',
  );
  await page.getByRole('button', { name: '+ New exercise (my own)' }).click();
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
  const backHome = page.getByRole('link', { name: 'Back to Home' });
  await backHome.waitFor();
  expect(await backHome.isVisible(), 'starting opens the preview instead of the workout');
  await beginFromPreview(page);
  await auditScreen(page, 'workout/active');
  const completed = await drive(page);
  expect(completed === 3, `completed the programmed sets (${completed})`);
  expect(page.url().includes('#/summary/'), 'finishing opens the summary');
  await auditScreen(page, 'summary');
  expect(
    await page.getByText('Share this workout?').waitFor({ timeout: 5000 }).then(
      () => true,
      () => false,
    ),
    'a finished workout offers to share the program',
  );
  await page.getByLabel(/ask again/).check();
  expect(
    (await page.evaluate(() => localStorage.getItem('wc:noSharePrompt'))) === '1',
    '“don’t ask again” is remembered for the next workout',
  );
  await page.getByRole('button', { name: 'Not now' }).click();
  expect(
    (await page.getByText('Share this workout?').count()) === 0,
    'dismissing the share offer puts it away',
  );

  await page.getByRole('button', { name: 'Done' }).click();
  await page.waitForSelector('text=Ready to train');

  await page.goto(`${BASE}/#/history`);
  await page.waitForSelector('text=Scenario Day');
  expect(
    (await page.getByRole('button', { name: /^Share Scenario Day/ }).count()) === 1,
    'each history row carries its own share button',
  );
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
  const undo = page.getByRole('button', { name: /previous set|undo/i });
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
  expect(
    (await page.getByText('Manage programs').count()) === 0 &&
      (await page.getByText('Session history').count()) === 0,
    'Settings sends you nowhere else: no duplicate program/history links',
  );
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

  // a mis-tapped Complete set must be reversible
  await page.getByRole('button', { name: 'Complete set' }).click();
  const undo = page.getByRole('button', { name: 'Previous set' });
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
  expect(
    await page.getByRole('link', { name: 'Build your first program' }).isVisible(),
    'deleting the last program returns Home to the first-run state',
  );
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
  await page.getByText('Beta', { exact: true }).waitFor();
  const previewBody = (await page.textContent('body')).replace(/\s+/g, ' ');
  expect(!/Complete set/.test(previewBody), 'the preview does not begin the workout');
  expect(/Start/.test(previewBody), 'the preview offers Start');

  await page.getByRole('link', { name: 'Back to Home' }).click();
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
  await page.getByText('Alpha', { exact: true }).waitFor();

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
  await b.page.goto(`${BASE}/#/credits`);
  await b.page.waitForSelector('text=Credits');
  const href = async (name) => b.page.getByRole('link', { name }).getAttribute('href');
  expect(
    (await href('Source on GitHub')) === 'https://github.com/sdaveas/workout-companion' &&
      (await href('Buy me a coffee')) === 'https://buymeacoffee.com/br3gan' &&
      (await href('Everkinetic')) === 'https://github.com/everkinetic/data' &&
      (await href('Bryl Lim — Workout Guide')) === 'https://github.com/bryllim/workout-guide',
    'credits link to the sources and the tip jar',
  );
  await auditScreen(b.page, 'credits');
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
  await b.goto(`${BASE}/#/programs/build`);
  await b.getByPlaceholder('Workout C').fill('Leg Day');
  await b.getByRole('button', { name: '+ New exercise (my own)' }).click();
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

  // Several programs ride one link: pick two, tap once, both arrive.
  const bundle = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const c = await bundle.newPage();
  c.on('dialog', (d) => d.accept());
  await saveProgram(c, program('a-day', 'A Day', 'monday', [ex('squat', 'Squat')]));
  await saveProgram(c, program('b-day', 'B Day', 'wednesday', [ex('row', 'Row')]));
  await c.goto(`${BASE}/#/programs`);
  await c.getByRole('button', { name: 'Select' }).click();
  await c.getByRole('button', { name: /A Day/ }).click();
  await c.getByRole('button', { name: /B Day/ }).click();
  await c.getByRole('button', { name: 'Share 2' }).click();
  await c.waitForSelector('text=Link copied');
  const bundleLink = await c.evaluate(() => navigator.clipboard.readText());
  expect(
    bundleLink.includes('#/add/') && bundleLink.length < 1200,
    `two programs fit in one link (${bundleLink.length} chars)`,
  );
  expect(!bundleLink.includes('\n'), 'the clipboard holds the link alone, no caption');
  await bundle.close();

  await b.goto(bundleLink);
  await b.getByText('Someone shared these').waitFor();
  expect(
    await b.getByRole('button', { name: 'Add all 2' }).isVisible(),
    'a bundle asks once, for both',
  );
  await b.getByRole('button', { name: 'Add all 2' }).click();
  await b.waitForSelector('text=2 programs added');
  expect(await b.getByText('Saved (5)').isVisible(), 'both programs land at once');
  await receiver.close();
}

// ---------------------------------------------------------------- scenario 13: per-hand sets
{
  const { context, page } = await fresh();
  const oneArm = { ...ex('a', 'One-arm Row', 2, 90), weight: { value: 10, unit: 'kg', per_hand: true } };
  await saveProgram(page, program('arms', 'Arms', 'monday', [oneArm]));
  await page.goto(`${BASE}/#/`);
  await page.getByRole('button', { name: /Start/ }).click();
  await beginFromPreview(page);

  expect(await page.getByText('Left hand').first().isVisible(), 'a per-hand set shows a left-hand tick');
  expect(await page.getByText('Right hand').first().isVisible(), 'a per-hand set shows a right-hand tick');
  expect(
    await page.getByRole('button', { name: 'Complete left hand' }).isVisible(),
    'the button names the hand being worked',
  );

  await page.getByRole('button', { name: 'Complete left hand' }).click();
  expect(
    await page.getByRole('button', { name: 'Complete right hand' }).isVisible(),
    'the left tick advances to the right hand',
  );
  expect(
    !(await page.getByText('Rest remaining').isVisible().catch(() => false)),
    'no rest between the two hands',
  );
  await auditScreen(page, 'workout/per-hand-left');

  await page.getByRole('button', { name: 'Complete right hand' }).click();
  await page.waitForSelector('text=Rest remaining');
  expect(true, 'the break comes after the right hand');
  await auditScreen(page, 'workout/per-hand-rest');
  await context.close();
}

// ---------------------------------------------------------------- scenario 12: rest between exercises
{
  const { context, page } = await fresh();
  await saveProgram(page, program('two-days', 'Two Days', 'monday', [ex('a', 'Alpha', 2, 90), ex('b', 'Beta', 2, 90)]));
  await page.goto(`${BASE}/#/`);
  await page.getByRole('button', { name: /Start/ }).click();
  await beginFromPreview(page);

  await page.getByRole('button', { name: 'Complete set' }).click();
  await page.waitForSelector('text=Rest remaining');
  await page.getByRole('button', { name: 'Skip rest' }).click();
  await page.getByRole('button', { name: 'Complete set' }).click(); // last set of Alpha

  await page.waitForSelector('text=Rest before the next exercise');
  expect(true, 'finishing an exercise starts a rest before the next one');
  const clock = (await page.textContent('body')).match(/Rest before the next exercise(\d{2}:\d{2})/)?.[1];
  expect(clock === '01:30' || clock === '01:29', `the break uses the exercise rest (${clock})`);
  expect(
    await page.getByRole('button', { name: 'Continue' }).isVisible(),
    'Continue stays available during the break',
  );

  await page.getByRole('button', { name: '+15s' }).click();
  const bumped = (await page.textContent('body')).match(/Rest before the next exercise(\d{2}:\d{2})/)?.[1];
  expect(bumped === '01:45' || bumped === '01:44', `the break can be extended (${bumped})`);
  await auditScreen(page, 'workout/between-exercises');

  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForSelector('text=Beta');
  expect(true, 'Continue starts the next exercise immediately');
  await context.close();
}

// ---------------------------------------------------------------- scenario 14: exercise library
{
  const { context, page } = await fresh();
  await page.goto(`${BASE}/#/programs/build`);
  // the whole library is in a scrollable window, not the first 20
  await page.getByLabel('Search exercises').waitFor();
  const list = page.getByRole('list', { name: 'Exercises' });
  expect(
    (await list.getByRole('listitem').count()) > 100,
    'the list holds the whole library',
  );
  expect(
    await list.evaluate((el) => el.scrollHeight > el.clientHeight),
    'the list is a scrollable window',
  );

  // the muscle chips narrow the list before typing
  await page.getByRole('button', { name: 'Arms', exact: true }).click();
  expect(
    (await page.getByRole('button', { name: 'Bicep Curl', exact: true }).count()) === 1,
    'a muscle filter keeps that muscle',
  );
  expect(
    (await page.getByRole('button', { name: 'Bench Press', exact: true }).count()) === 0,
    'a muscle filter drops the other muscles',
  );
  await page.getByRole('button', { name: 'Arms', exact: true }).click();
  expect(
    (await page.getByRole('button', { name: 'Arms', exact: true }).getAttribute('aria-pressed')) ===
      'false',
    'tapping the filter again clears it',
  );

  // and the search is fzf, not exact: bnchprs finds Bench Press
  await page.getByLabel('Search exercises').fill('bnchprs');
  expect(
    (await page.getByRole('button', { name: 'Bench Press', exact: true }).count()) === 1,
    'a fuzzy search finds the exercise',
  );

  // the ⓘ opens a how-to sheet: figures, muscles, prescription, execution
  const sheet = page.getByRole('dialog');
  await page.getByRole('button', { name: 'How to do Bench Press', exact: true }).click();
  await sheet.waitFor();
  const sheetText = (await sheet.textContent()).replace(/\s+/g, ' ');
  expect(sheetText.includes('Chest'), 'the sheet names the muscles');
  expect(/02:30|2:30/.test(sheetText), 'the sheet shows the default prescription');
  expect(sheetText.includes('shoulder blades'), 'the sheet shows hand-written execution');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  expect((await sheet.count()) === 0, 'the sheet closes');

  await page.getByLabel('Search exercises').fill('dumbbell row');
  await page.getByRole('button', { name: 'Dumbbell Row', exact: true }).click();
  const row = page.locator('li').filter({ hasText: 'Exercise 1' });
  expect(
    (await row.getByPlaceholder('Goblet Squat').inputValue()) === 'Dumbbell Row',
    'the library fills the exercise name',
  );
  expect((await row.getByLabel('Sets').inputValue()) === '3', 'the library fills the sets');
  expect((await row.getByLabel('Rest s').inputValue()) === '90', 'the library fills the rest');
  expect(await row.getByRole('checkbox').isChecked(), 'the library marks a per-hand movement');

  await page.getByLabel('Search exercises').fill('bench');
  await page.getByRole('button', { name: 'Bench Press', exact: true }).click();
  const secondRow = page.locator('li').filter({ hasText: 'Exercise 2' });
  expect(
    (await secondRow.getByPlaceholder('Goblet Squat').inputValue()) === 'Bench Press',
    'a second pick appends another exercise',
  );
  await auditScreen(page, 'programs/library');

  await page.getByPlaceholder('Workout C').fill('Library Day');
  await page
    .getByRole('group', { name: 'Scheduled day' })
    .getByRole('button', { name: todayName[0].toUpperCase() + todayName.slice(1, 3) })
    .click();
  await page.getByRole('button', { name: 'Create program' }).click();
  await page.waitForSelector('text=Program "Library Day" added');

  await page.goto(`${BASE}/#/`);
  await page.getByRole('button', { name: /^Start/ }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.waitForSelector('text=/Complete (left|right) hand/');
  const figure = (await page.locator('.exercise-flip').getAttribute('style')) ?? '';
  expect(figure.includes('exercises/'), 'the workout shows an exercise figure');
  expect(figure.includes('dumbbell-row'), 'Dumbbell Row shows the row poses');
  const titleBlock = await page.locator('[data-testid="stage"] h1').locator('xpath=..').textContent();
  expect(titleBlock?.includes('[1 / 3]'), 'the workout names the set it is on');
  const target = await page
    .locator('[data-testid="stage"] h1')
    .locator('xpath=following::p[1]')
    .textContent();
  expect(target?.includes('8–12'), 'the workout names the reps it wants');
  await auditScreen(page, 'workout/motion');
  await context.close();
}

// ---------------------------------------------------------------- scenario 15: keep today's numbers
{
  const { context, page } = await fresh();
  const press = {
    ...ex('press', 'Bench Press', 1, 60),
    reps: { min: 8, max: 10 },
    weight: { value: 20, unit: 'kg' },
  };
  const pull = { ...ex('pull', 'Dumbbell Row', 1, 60), reps: { min: 8, max: 10 }, weight: { value: 20, unit: 'kg', per_hand: true } };
  await saveProgram(page, program('push', 'Push Day', 'monday', [press, pull]));
  await page.goto(`${BASE}/#/`);
  await page.getByRole('button', { name: /Start/ }).click();
  await beginFromPreview(page);

  // two reps short of the prescription, and a longer break than the program says
  await page.getByRole('button', { name: 'Decrease Reps' }).click();
  await page.getByRole('button', { name: 'Decrease Reps' }).click();
  await page.getByRole('button', { name: 'Complete set' }).click();
  // between exercises the break sits on the "exercise complete" screen
  await page.waitForSelector('text=Rest before the next exercise');
  await page.getByRole('button', { name: '+15s' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Complete left hand' }).click();
  await page.getByRole('button', { name: 'Complete right hand' }).click();
  await page.getByRole('button', { name: 'Finish workout' }).click();

  await page.waitForSelector('text=Session complete');
  expect(await page.getByText("Keep today's numbers?").isVisible(), 'the summary offers to keep the session');
  const panel = (await page.textContent('body')).replace(/\s+/g, ' ');
  expect(/60s rest → 75s rest/.test(panel), `the longer break is offered (${panel.match(/60s rest[^,]*/)?.[0]})`);
  expect(/8–10 reps → 6 reps/.test(panel), 'the missed reps are offered');
  await auditScreen(page, 'summary/update-offer');

  await page.getByRole('button', { name: 'Update the program' }).click();
  await page.waitForSelector("text=Program updated with today's numbers.");
  expect(true, 'the program is updated on request');

  await page.goto(`${BASE}/#/programs`);
  await page.getByRole('button', { name: 'Edit' }).first().click();
  const row = page.locator('li').filter({ hasText: 'Exercise 1' });
  expect((await row.getByLabel('Reps min').inputValue()) === '6', 'the new reps stuck');
  expect((await row.getByLabel('Rest s').inputValue()) === '75', 'the new rest stuck');
  await context.close();
}

// ---------------------------------------------------------------- scenario 16: the coach, the paste box, the link
{
  const { context, page } = await fresh();
  await page.goto(`${BASE}/#/programs`);
  await page.getByRole('link', { name: 'Add a program' }).click();
  await page.getByRole('link', { name: /Talk to a ChatGPT/ }).click();
  await page.getByLabel("The coach's answer").waitFor();
  await auditScreen(page, 'paste');

  const href = await page.getByRole('link', { name: 'Open ChatGPT' }).getAttribute('href');
  expect(href.startsWith('https://chatgpt.com/?q='), 'the coach opens in one tap');
  const asked = decodeURIComponent(href.split('?q=')[1]);
  expect(
    asked.includes('github.com/sdaveas/workout-companion') && asked.includes('coach.md'),
    'the prompt is one line pointing at the coach file a chat can read',
  );
  expect(asked.length < 600, `the prompt is short enough to copy (${asked.length} chars)`);

  // Going to ChatGPT marks Step 2, so the way back is obvious.
  await page.getByRole('link', { name: 'Open ChatGPT' }).evaluate((el) => {
    el.addEventListener('click', (e) => e.preventDefault(), { once: true });
    el.click();
  });
  expect(
    await page.getByText('Back from ChatGPT', { exact: false }).isVisible(),
    'leaving for ChatGPT points at Step 2',
  );
  const step2 = (await page.locator('section', { hasText: 'Paste the answer' }).getAttribute('class')) ?? '';
  expect(step2.includes('ring-accent'), 'Step 2 is the loudest thing when you come back');
  const coach = await (await page.request.get(`${BASE}/coach.md`)).text();
  expect(coach.includes('Interview complete'), 'the coach file interviews before it writes programs');
  expect(coach.includes('code block tagged json'), 'it asks for one json block per day');
  expect(coach.includes('approximately 40 minutes'), 'each card says how long the session takes');
  expect(!coach.includes('#/p/'), 'it never hands out a link, which opens the wrong copy');

  const day = (id, name, d) => program(id, name, d, [ex(`${id}-squat`, 'Squat', 3, 90)]);
  const answer = [
    'Interview complete',
    '```json',
    day('day-a', 'Day A', 'monday'),
    '```',
    '```json',
    day('day-b', 'Day B', 'wednesday'),
    '```',
    '```json',
    day('day-c', 'Day C', 'friday'),
    '```',
    'Open Workout Companion, go to Programs, tap Paste a program.',
  ].join('\n');

  await page.getByLabel("The coach's answer").fill(answer);
  await page.getByRole('button', { name: 'Read it' }).click();
  expect(await page.getByText('3 programs').isVisible(), 'three days read back as three programs');
  await page.getByRole('button', { name: 'Add all 3' }).click();
  await page.waitForSelector('text=3 programs added');
  expect(await page.getByText('Saved (3)').isVisible(), 'all three land in the list');

  // One block can hold every day, the way the coach now answers.
  await page.goto(`${BASE}/#/paste`);
  await page
    .getByLabel("The coach's answer")
    .fill(`\`\`\`json\n[${day('arr-a', 'Arr A', 'monday')},${day('arr-b', 'Arr B', 'tuesday')}]\n\`\`\``);
  await page.getByRole('button', { name: 'Read it' }).click();
  expect(await page.getByText('2 programs').isVisible(), 'one array reads back as two days');

  // Several programs can be sent as one backup file.
  await page.goto(`${BASE}/#/programs`);
  await page.getByRole('button', { name: 'Select' }).click();
  await page.getByRole('button', { name: /Day A/ }).click();
  await page.getByRole('button', { name: /Day B/ }).click();
  expect(await page.getByRole('button', { name: 'Share 2' }).isEnabled(), 'pick two and share them together');
  await page.getByRole('button', { name: 'Cancel' }).click();
  expect(await page.getByRole('button', { name: 'Share 2' }).isHidden(), 'cancel leaves the list alone');

  // A half-written program is named as the problem; the good ones still import.
  await page.goto(`${BASE}/#/paste`);
  await page
    .getByLabel("The coach's answer")
    .fill(
      `\`\`\`json\n${day('day-d', 'Day D', 'saturday')}\n\`\`\`\n\`\`\`json\n{"schema_version":1,"id":"broken","name":"Broken"}\n\`\`\``,
    );
  await page.getByRole('button', { name: 'Read it' }).click();
  expect(
    (await page.getByRole('alert').innerText()).includes('1 of 2'),
    'the importer says which block is broken',
  );
  await page.getByRole('button', { name: 'Add to my routines' }).click();
  await page.waitForSelector('text=Program "Day D" added');
  expect(true, 'the readable program still goes in');

  // The coach's card: the program rides inside the link, with no block in sight.
  await page.goto(`${BASE}/#/paste`);
  const card = [
    'Interview complete',
    '',
    '**Workout A — Monday**',
    '7 exercises · approximately 40 minutes',
    `[Open Workout A](${BASE}/#/p/${encodeURIComponent(day('card-day', 'Workout A', 'monday'))})`,
  ].join('\n');
  await page.getByLabel("The coach's answer").fill(card);
  await page.getByRole('button', { name: 'Read it' }).click();
  expect(
    await page.getByText('That is a program').isVisible(),
    'a card whose link carries the program is read back',
  );
  await page.getByRole('button', { name: 'Add to my routines' }).click();
  await page.waitForSelector('text=Program "Workout A" added');
  expect(true, 'the card imports without a json block');

  // The same paste again lands beside it, never over it.
  await page.goto(`${BASE}/#/paste`);
  await page.getByLabel("The coach's answer").fill(day('day-a', 'Day A', 'monday'));
  await page.getByRole('button', { name: 'Read it' }).click();
  await page.getByRole('button', { name: 'Add a copy instead' }).click();
  await page.waitForSelector('text=Program "Day A (2)" added');
  expect(true, 'a repeated paste is saved as a copy');

  // A link written by the coach opens the same preview with nothing to type. Chat
  // clients add their own tracking parameters before the hash; they must not matter.
  await page.goto(
    `${BASE}/?utm_source=chatgpt.com#/p/${encodeURIComponent(day('link-day', 'Linked Day', 'sunday'))}`,
  );
  await page.getByText('That is a program').waitFor();
  expect(
    await page.getByText('Linked Day', { exact: true }).isVisible(),
    'a program link opens its own preview',
  );
  await page.getByRole('button', { name: 'Add to my routines' }).click();
  await page.waitForSelector('text=Program "Linked Day" added');
  expect(true, 'the linked program can be added');

  // A truncated link says so instead of pretending.
  await page.goto(`${BASE}/#/p/%7B%22schema_version%22`);
  expect(
    await page
      .getByText('This link did not carry a program')
      .waitFor({ timeout: 5000 })
      .then(() => true, () => false),
    'a broken link explains itself',
  );
  await context.close();
}

// ---------------------------------------------------------------- scenario 18: reading a saved program
{
  const { context, page } = await fresh();
  await saveProgram(
    page,
    program('read-day', 'Read Day', 'monday', [ex('sq', 'Squat', 3, 90), ex('bp', 'Bench Press', 3, 120)]),
  );
  await page.goto(`${BASE}/#/programs`);
  await page.getByRole('link', { name: /Read Day/ }).click();
  await page.getByRole('button', { name: 'Start this program' }).waitFor();
  expect(page.url().includes('#/program/read-day'), 'tapping a program name opens its overview');
  await auditScreen(page, 'program/detail');

  const body = await page.textContent('body');
  expect(body.includes('Bench Press') && body.includes('Read Day'), 'the overview lists the whole program');
  expect(body.includes('3 × 5'), 'sets and reps are spelled out');
  expect(
    (await page.locator('.exercise-frame').count()) > 0,
    'the overview draws the exercises',
  );

  await page.getByRole('button', { name: 'Start this program' }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).waitFor();
  expect(true, 'the overview can start the workout');
  await context.close();
}

// ---------------------------------------------------------------- scenario 19: the three ways in
{
  const { context, page } = await fresh();
  await page.goto(`${BASE}/#/programs`);
  await page.getByText('Nothing saved yet').waitFor();

  const plus = page.getByRole('link', { name: 'Add a program' });
  expect(
    ((await plus.getAttribute('class')) ?? '').includes('bg-accent'),
    'with nothing saved, the + is the loudest thing on the screen',
  );
  await plus.click();
  await page.getByRole('link', { name: /Build your own/ }).waitFor();
  await auditScreen(page, 'programs/new');
  expect(page.url().endsWith('#/programs/new'), 'the + opens the three ways in');

  const doors = await page.textContent('body');
  expect(
    ['Talk to a ChatGPT', 'Build your own', 'Import a program'].every((name) => doors.includes(name)),
    'all three doors are named',
  );

  // A file goes in without leaving the door it came through.
  await page.setInputFiles(
    'input[type=file]',
    await tmpFile(program('door-day', 'Door Day', 'tuesday', [ex('sq', 'Squat')])),
  );
  await page.waitForSelector('text=Saved (1)');
  expect(true, 'Import a program takes a file straight away');

  // One saved program is already enough to pick from.
  expect(await page.getByRole('button', { name: 'Select' }).isVisible(), 'Select sits by Saved (n)');

  const calm = (await page.getByRole('link', { name: 'Add a program' }).getAttribute('class')) ?? '';
  expect(!calm.includes('bg-accent'), 'the + steps back once something is saved');

  // "Add another" is the same door, not the builder.
  await page.getByRole('button', { name: 'Add another' }).click();
  await page.getByRole('link', { name: /Build your own/ }).waitFor();
  expect(page.url().endsWith('#/programs/new'), '"Add another" opens the three ways in too');

  await page.getByRole('link', { name: /Build your own/ }).click();
  await page.waitForSelector('text=New program');
  expect(page.url().endsWith('#/programs/build'), 'Build your own goes to the builder');

  // The builder's way back is the programs list.
  await page.getByRole('link', { name: 'Back to Programs' }).click();
  await page.waitForURL(/#\/programs$/);
  expect(page.url().endsWith('#/programs'), 'the builder leads back to the list');

  await page.goto(`${BASE}/#/programs/new`);
  await page.getByRole('link', { name: /Talk to a ChatGPT/ }).click();
  await page.getByLabel("The coach's answer").waitFor();
  expect(page.url().endsWith('#/paste'), 'Talk to a ChatGPT opens the interview');
  await context.close();
}

// ---------------------------------------------------------------- scenario 20: a coach edits a saved program
{
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const page = await context.newPage();
  page.on('dialog', (d) => d.accept());
  await saveProgram(page, program('edit-day', 'Edit Day', 'monday', [ex('sq', 'Squat'), ex('row', 'Row')]));

  await page.goto(`${BASE}/#/program/edit-day`);
  await page.getByRole('button', { name: 'Copy for my coach' }).click();
  await page.getByText('Copied — paste it in ChatGPT').waitFor();
  const sent = await page.evaluate(() => navigator.clipboard.readText());
  expect(sent.includes('edit-day'), 'the saved program travels to the chat');
  expect(/## Program/.test(sent), 'the brief names the program block the coach reads');
  expect(/## History/.test(sent), 'the brief carries what happened in the gym');
  expect(/## What I want/.test(sent), 'the brief says what is wanted back');

  // The coach answers with the same program, one exercise lighter: that is an edit.
  await page.goto(`${BASE}/#/paste`);
  await page
    .getByLabel("The coach's answer")
    .fill(program('edit-day', 'Edit Day', 'monday', [ex('sq', 'Squat')]));
  await page.getByRole('button', { name: 'Read it' }).click();
  expect(
    await page.getByRole('button', { name: 'Update "Edit Day"' }).isVisible(),
    'a program already saved here is offered as an update',
  );
  expect(
    await page.getByText('Row: removed').isVisible(),
    'the update says what changes before anything is written',
  );
  await page.getByRole('button', { name: 'Update "Edit Day"' }).click();
  await page.waitForSelector('text=updated');
  expect(await page.getByText('Saved (1)').isVisible(), 'it replaces instead of piling up a copy');
  expect(
    await page.getByText('1 exercise · mon').isVisible(),
    'the new shape lands and the day it was given stays',
  );
  await context.close();
}

await browser.close();
const counts = results.reduce((acc, [k]) => ({ ...acc, [k]: (acc[k] ?? 0) + 1 }), {});
console.log('\nSUMMARY', JSON.stringify(counts));
for (const [kind, msg] of results.filter(([k]) => k !== 'PASS')) console.log(`${kind} ${msg}`);
