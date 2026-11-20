// Both sheets must be real modals: focus starts inside, Tab cannot leave, Esc closes
// and hands focus back. Usage: node scripts/a11y-sheets.mjs (dev server on 5183).
import { chromium } from '@playwright/test';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = 'http://localhost:5183';
let failed = 0;

function check(name, ok, detail = '') {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();

/** Where focus is, in words, so a failure names the culprit. */
const focused = () =>
  page.evaluate(() => {
    const el = document.activeElement;
    if (!el) return 'none';
    const name = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ');
    return `${el.tagName}#${name.slice(0, 40)}`;
  });

/** Is the active element inside the open modal dialog? */
const focusInDialog = () =>
  page.evaluate(() => {
    const dialog = document.querySelector('dialog[open]');
    return !!dialog && dialog.contains(document.activeElement);
  });

/**
 * The name of a page control focused while the dialog is open, or null. `body` is the
 * browser-chrome step of the Tab cycle, not the page behind the sheet.
 */
const focusEscaped = () =>
  page.evaluate(() => {
    const dialog = document.querySelector('dialog[open]');
    const el = document.activeElement;
    if (!dialog) return 'no open dialog';
    if (!el || el === document.body || el === document.documentElement) return null;
    if (dialog.contains(el)) return null;
    const name = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ');
    return `${el.tagName}#${name.slice(0, 40)}`;
  });

const openDialogCount = () => page.evaluate(() => document.querySelectorAll('dialog[open]').length);

/** True once `locator` itself is the active element; React's unmount runs after the close. */
async function waitForFocus(locator, timeout = 2000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await locator.evaluate((el) => el === document.activeElement).catch(() => false)) return true;
    await page.waitForTimeout(50);
  }
  return false;
}

async function seed() {
  const program = await (await fetch(`${BASE}/src/fixtures/workout-b.json`)).text();
  const dir = await mkdtemp(join(tmpdir(), 'wc-a11y-'));
  const file = join(dir, 'workout-b.json');
  await writeFile(file, program);
  await page.goto(`${BASE}/#/`);
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles(file);
  await page.getByText(/^Imported/).waitFor({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
}

// ── U2: transfer sheet ────────────────────────────────────────────────────────
await page.goto(`${BASE}/#/`);
const exportButton = page.getByRole('button', { name: 'Export', exact: true });
await exportButton.click();
await page.waitForSelector('dialog[open]');

check('transfer: focus moves into the dialog', await focusInDialog(), await focused());

const left = [];
for (let i = 0; i < 5; i++) {
  await page.keyboard.press('Tab');
  const escaped = await focusEscaped();
  if (escaped) left.push(`${i + 1}:${escaped}`);
}
check('transfer: 5× Tab never reaches the page behind', left.length === 0, left.join(', '));

await page.keyboard.press('Escape');
await page.waitForFunction(() => !document.querySelector('dialog[open]'), null, { timeout: 2000 });
check('transfer: Escape closes it', (await openDialogCount()) === 0);
check('transfer: focus returns to the Export button', await waitForFocus(exportButton), await focused());

// ── U1: how-to sheet over a live set ─────────────────────────────────────────
await seed();
await page.goto(`${BASE}/#/program/workout-b`);
await page.getByRole('button', { name: 'Start this program' }).click();
await page.waitForURL(/#\/session/);
await page.getByRole('button', { name: 'Start', exact: true }).click();
await page.waitForSelector('text=Complete set');

const pips = () => page.locator('[role="img"][aria-label^="Set "]').first().getAttribute('aria-label');
const pipsBefore = await pips();

const howToButton = page.getByRole('button', { name: 'How to do it' });
await howToButton.click();
await page.waitForSelector('dialog[open]');
check('how-to: focus moves into the dialog', await focusInDialog(), await focused());

const seen = [];
let sawSkip = false;
const escaped = [];
for (let i = 0; i < 5; i++) {
  await page.keyboard.press('Tab');
  const name = await focused();
  seen.push(name);
  if (name === 'BUTTON#Skip set') sawSkip = true;
  const outside = await focusEscaped();
  if (outside) escaped.push(outside);
}
check('how-to: 5× Tab never lands on Skip set', !sawSkip, seen.join(' → '));
check('how-to: 5× Tab never reaches the page behind', escaped.length === 0, escaped.join(', '));
check('how-to: set pips unchanged after Tabbing', (await pips()) === pipsBefore, `${pipsBefore} → ${await pips()}`);

await page.keyboard.press('Escape');
await page.waitForFunction(() => !document.querySelector('dialog[open]'), null, { timeout: 2000 });
check('how-to: Escape closes it', (await openDialogCount()) === 0);
check('how-to: focus returns to the i button', await waitForFocus(howToButton), await focused());

await browser.close();
console.log(failed === 0 ? 'ALL PASS' : `${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
