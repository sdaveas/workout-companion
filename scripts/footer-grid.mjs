import { chromium } from '@playwright/test';

const BASE = process.env.BASE ?? 'http://localhost:5183';
const FIXTURES = process.env.FIXTURES ?? 'http://localhost:5183';
const fixture = await (await fetch(`${FIXTURES}/src/fixtures/workout-b.json`)).text();

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const problems = [];

await page.goto(`${BASE}/#/programs`, { waitUntil: 'networkidle' });
// clear storage so the run is deterministic
await page.evaluate(async () => {
  const dbs = await indexedDB.databases?.() ?? [];
  for (const d of dbs) indexedDB.deleteDatabase(d.name);
});
await page.goto(`${BASE}/#/programs/new`);
await page.waitForSelector('input[type=file]');
await page.evaluate(async (txt) => {
  const input = document.querySelector('input[type=file]');
  const dt = new DataTransfer();
  dt.items.add(new File([txt], 'p.json', { type: 'application/json' }));
  input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise(r => setTimeout(r, 1200));
}, fixture);

const snap = () => page.evaluate(() => [...document.querySelectorAll('[data-testid=footer] button')].map(b => {
  const r = b.getBoundingClientRect();
  return { label: b.innerText.trim(), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), font: getComputedStyle(b).fontFamily.split(',')[0], weight: getComputedStyle(b).fontWeight };
}));
const metrics = () => page.evaluate(() => ({
  scroll: document.documentElement.scrollHeight - window.innerHeight,
  status: document.querySelector('[data-testid=footer]')?.previousElementSibling?.querySelector('[role=status]')?.innerText ?? null,
}));
const tap = async (name) => {
  const b = page.getByRole('button', { name, exact: false }).first();
  if (await b.count() === 0) return false;
  await b.click();
  await page.waitForTimeout(700);
  return true;
};

await page.goto(`${BASE}/#/program/workout-b`, { waitUntil: 'networkidle' });
const states = {};
const where = () => page.evaluate(() => ({ url: location.hash, text: document.body.innerText.slice(0, 120) }));
await tap('Start this program');
await tap('Start');
await page.waitForTimeout(900);
states.set = { footer: await snap(), page: await metrics(), at: await where() };
await tap('Complete set');
states.rest = { footer: await snap(), page: await metrics(), at: await where() };
for (let i = 0; i < 8; i++) {
  if (await tap('Skip rest') || await tap('Start set') || await tap('Complete set')) continue;
  break;
}
states.later = { footer: await snap(), page: await metrics(), at: await where() };
// Primary + previous + skip/reset timer; Auto lives in the header.
if (states.set.footer.length !== 3) problems.push(`set state has ${states.set.footer.length} footer buttons, expected 3`);
if (states.rest.footer.length !== 3) problems.push(`rest state has ${states.rest.footer.length} footer buttons, expected 3`);

const fontStatus = await page.evaluate(async () => {
  await document.fonts.load('600 16px "Barlow Condensed"');
  return [...document.fonts].map((f) => `${f.family} ${f.weight} ${f.status}`);
});
if (!fontStatus.some((f) => f.endsWith('loaded'))) problems.push(`the gym font never loaded: ${fontStatus.join(', ')}`);

const ref = states.set.footer;
for (const [name, s] of Object.entries(states)) {
  if (s.page.scroll > 1) problems.push(`${name}: page scrolls ${s.page.scroll}px`);
  for (const b of s.footer) {
    if (b.h < 44) problems.push(`${name}: ${b.label} only ${b.h}px tall`);
    if (b.font.replace(/"/g, '') !== 'Barlow Condensed') problems.push(`${name}: ${b.label} font ${b.font}`);
    const twin = ref.find(r => Math.abs(r.x - b.x) <= 2 && Math.abs(r.y - b.y) <= 2 && Math.abs(r.w - b.w) <= 2);
    if (!twin) problems.push(`${name}: ${b.label} sits at ${b.x},${b.y} ${b.w}x${b.h}, no matching slot in the set state`);
    if (b.x + b.w > 390) problems.push(`${name}: ${b.label} overflows right`);
  }
  if (s.footer.length !== ref.length) problems.push(`${name}: ${s.footer.length} footer buttons, set had ${ref.length}`);
}

console.log(JSON.stringify({ states, problems }, null, 2));
await browser.close();
process.exit(problems.length ? 1 : 0);
