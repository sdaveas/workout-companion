import { chromium } from '@playwright/test';

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

await page.goto('http://localhost:5183/#/programs/paste');
await page.textContent('h1');

// invalid JSON → visible path error
await page.fill('#json', JSON.stringify({ schema_version: 1, id: 'x', name: 'X', exercises: [{ id: 'a', name: 'A', sets: 0, reps: { min: 5, max: 5 }, rest_seconds: 60 }] }));
const errorText = await page.textContent('section:has-text("Invalid program")');
console.log('ERRORS:', errorText?.replace(/\s+/g, ' '));

// valid fixture → preview → save
await page.fill('#json', await (await fetch('http://localhost:5183/src/fixtures/workout-b.json')).text());
await page.waitForSelector('text=Preview');
const preview = await page.textContent('section:has-text("Preview")');
console.log('PREVIEW:', preview?.replace(/\s+/g, ' ').slice(0, 160));

await page.click('button:has-text("Save program")');
await page.waitForSelector('text=Program "Workout B" added');
console.log('SAVED: yes');

// persists across reload
await page.reload();
await page.waitForSelector('text=Saved (1)');
console.log('PERSISTED AFTER RELOAD: yes');

// duplicate id → replace flow
await page.fill('#json', await (await fetch('http://localhost:5183/src/fixtures/workout-b.json')).text());
await page.click('button:has-text("Save program")');
await page.waitForSelector('text=already exists');
console.log('DUPLICATE GUARD: yes');

await page.screenshot({ path: '/tmp/wc-programs.png', fullPage: true });
console.log('JS ERRORS:', errors.length ? errors : 'none');
await browser.close();
