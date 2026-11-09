import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';

const BASE = 'http://localhost:5184';
const fixture = await readFile('src/fixtures/workout-b.json', 'utf8');
const APP = `${BASE}/`;

const browser = await chromium.launch({
  headless: !process.env.HEADED,
  ...(process.env.HEADED ? { channel: 'chrome' } : {}),
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && !m.text().includes('Failed to load resource') && errors.push(m.text()));

const check = (cond, msg) => {
  if (!cond) throw new Error(msg);
  console.log('ok:', msg);
};
const body = async () => (await page.textContent('body')).replace(/\s+/g, ' ');

await page.goto(APP);
await page.waitForSelector('text=Ready to train');

// manifest is real and installable-shaped
const manifest = await page.evaluate(async () => (await fetch('/manifest.webmanifest')).json());
check(manifest.name === 'Workout Companion', 'manifest name');
const startUrl = await page.evaluate((url) => new URL(url, location.href).href, manifest.start_url);
check(manifest.display === 'standalone' && startUrl === new URL(APP).href, `standalone, start_url -> ${startUrl}`);
const sizes = manifest.icons.map((i) => i.sizes);
check(sizes.includes('192x192') && sizes.includes('512x512'), `icons: ${sizes.join(', ')}`);

// icons are real PNGs and reachable
for (const src of ['/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png']) {
  const bytes = await page.evaluate(async (url) => {
    const r = await fetch(url);
    return [...new Uint8Array(await r.arrayBuffer()).slice(0, 8)];
  }, src);
  check(bytes.join(',') === '137,80,78,71,13,10,26,10', `${src} is a PNG`);
}

// the tab icon browsers ask for on their own is a real .ico (header: reserved 0, type 1)
const ico = await page.evaluate(async () => {
  const r = await fetch('/favicon.ico');
  return [...new Uint8Array(await r.arrayBuffer()).slice(0, 4)];
});
check(ico.join(',') === '0,0,1,0', 'favicon.ico is an icon');

// service worker registers, activates, then controls the page after a reload
await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
await page.reload();
await page.waitForSelector('text=Ready to train');
check(await page.evaluate(() => navigator.serviceWorker.controller != null), 'service worker controls the page');

// a11y spot checks on the shell
const a11y = await page.evaluate(() => ({
  unnamed: [...document.querySelectorAll('button, a')].filter(
    (el) => !(el.textContent || '').trim() && !el.getAttribute('aria-label'),
  ).length,
  main: document.querySelectorAll('main').length,
  lang: document.documentElement.lang,
}));
check(a11y.unnamed === 0, 'every button and link has an accessible name');
check(a11y.main === 1 && a11y.lang === 'en', 'one main landmark, lang set');

// import while online
const fixturePath = '/tmp/wc-fixture.json';
await writeFile(fixturePath, fixture, 'utf8');
await page.goto(`${APP}#/settings`);
await page.setInputFiles('#backup-file', fixturePath);
await page.waitForSelector('text=Imported');
await page.goto(`${APP}#/programs`);
await page.waitForSelector('text=Saved (1)');

// go offline: cold reload, start and complete a set
await context.setOffline(true);
await page.goto(APP);
await page.reload();
await page.waitForSelector('text=Ready to train');
check(true, 'app shell loads offline (cold reload)');
await page.getByRole('button', { name: /^Start/ }).click();
await page.getByRole('button', { name: 'Start', exact: true }).click(); // preview
await page.waitForSelector('text=Complete set');
await page.getByRole('button', { name: 'Complete set' }).click();
await page.waitForSelector('text=Rest remaining');
check(true, 'a set can be completed offline');
await page.goto(`${APP}#/history`);
await page.waitForSelector('h1:has-text("History")');
check(true, 'hash navigation works offline');
await context.setOffline(false);

await page.screenshot({ path: '/tmp/wc-phase5.png', fullPage: true });
console.log('JS ERRORS:', errors.length ? errors : 'none');
await browser.close();
