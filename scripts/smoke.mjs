import { writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:5183';
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

await page.goto(`${BASE}/#/settings`);
await page.textContent('h1');
console.log('SETTINGS SCREEN: yes');

// invalid file → visible error, nothing imported
const bad = '/tmp/wc-smoke-bad.json';
await writeFile(bad, '{"schema_version":1}');
await page.setInputFiles('#backup-file', bad);
await page.waitForSelector('text=neither a workout program');
console.log('INVALID FILE REPORTED:', (await page.textContent('text=neither a workout program'))?.trim().slice(0, 80));

// a program file imports
const fixture = await (await fetch(`${BASE}/src/fixtures/workout-b.json`)).text();
const good = '/tmp/wc-smoke-good.json';
await writeFile(good, fixture);
await page.setInputFiles('#backup-file', good);
await page.waitForSelector('text=Imported');
console.log('IMPORTED:', (await page.textContent('text=Imported'))?.trim());

// persists across reload
await page.reload();
await page.goto(`${BASE}/#/programs`);
await page.waitForSelector('text=Saved (1)');
console.log('PERSISTED AFTER RELOAD: yes');

// re-import is idempotent, not a duplicate
await page.goto(`${BASE}/#/settings`);
await page.setInputFiles('#backup-file', good);
await page.waitForSelector('text=Imported');
await page.goto(`${BASE}/#/programs`);
await page.waitForSelector('text=Saved (1)');
console.log('RE-IMPORT IS IDEMPOTENT: yes');

await page.screenshot({ path: '/tmp/wc-programs.png', fullPage: true });
console.log('JS ERRORS:', errors.length ? errors : 'none');
await browser.close();
