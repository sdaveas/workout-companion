/**
 * Builds public/og.jpg — the static link-preview card. Scrapers never see the
 * `#` part of a share URL, so the card cannot name the program being shared; it
 * shows what a workout looks like in the app instead.
 *
 * Run: node scripts/og.mjs   (needs the dev server's Playwright install, no server)
 */
import { chromium } from '@playwright/test';

const INK = '#0b0b0d';
const SURFACE = '#15161a';
const LINE = '#26282e';
const MUTED = '#8b8f98';
const ACCENT = '#d7ff3f';

// Workout A, as the app stores it.
const ROWS = [
  ['Push-up', '3 × 6–10', '1:30'],
  ['Dumbbell Row', '3 × 10–12', '1:30'],
  ['Shoulder Press', '2 × 8–12', '1:00'],
  ['Romanian Deadlift', '3 × 12', '1:30'],
  ['Plank', '3 × 30s', '1:00'],
];

const html = `<!doctype html><meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; }
  body {
    width: 1200px; height: 630px; display: flex; align-items: center; gap: 64px;
    padding: 0 72px; background: ${INK}; color: #fff;
    font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
    position: relative; overflow: hidden;
  }
  body::after {
    content: ''; position: absolute; right: -180px; top: -160px; width: 720px; height: 720px;
    background: radial-gradient(circle, rgba(215,255,63,.10), transparent 62%);
  }
  .left { flex: 1; z-index: 1; }
  .eyebrow { color: ${ACCENT}; font-size: 20px; font-weight: 600; letter-spacing: 5px; }
  h1 { font-size: 88px; line-height: .95; letter-spacing: -2px; font-weight: 700; margin-top: 26px; }
  h1 span { color: ${ACCENT}; display: block; }
  .tag { margin-top: 26px; font-size: 27px; color: ${MUTED}; line-height: 1.35; }
  .card {
    width: 492px; z-index: 1; background: ${SURFACE}; border: 1px solid ${LINE};
    border-radius: 26px; padding: 26px 28px 20px;
  }
  .card h2 { font-size: 15px; letter-spacing: 3.5px; color: ${ACCENT}; font-weight: 600; }
  .card p { font-size: 17px; color: ${MUTED}; margin-top: 6px; }
  .row { display: flex; align-items: baseline; gap: 12px; padding: 15px 0; border-top: 1px solid ${LINE}; }
  .row:first-of-type { margin-top: 18px; }
  .row .n { flex: 1; font-size: 22px; }
  .row .s { font-size: 20px; font-variant-numeric: tabular-nums; color: #e8e9ec; }
  .row .r { width: 74px; text-align: right; font-size: 16px; color: ${MUTED}; font-variant-numeric: tabular-nums; }
</style>
<div class="left">
  <div class="eyebrow">OFFLINE WORKOUT GUIDE</div>
  <h1>Workout<span>Companion</span></h1>
  <div class="tag">Set by set. Rest timed.<br>Nothing to sign up for.</div>
</div>
<div class="card">
  <h2>WORKOUT A</h2>
  <p>${ROWS.length} exercises &middot; sets &times; reps &middot; rest</p>
  ${ROWS.map(([n, s, r]) => `<div class="row"><span class="n">${n}</span><span class="s">${s}</span><span class="r">${r}</span></div>`).join('')}
</div>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.setContent(html);
await page.screenshot({ path: '/tmp/og.png' });
await browser.close();
console.log('wrote /tmp/og.png — now: sips -s format jpeg -s formatOptions 72 /tmp/og.png --out public/og.jpg');
