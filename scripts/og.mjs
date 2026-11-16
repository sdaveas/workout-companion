/**
 * Builds public/og.jpg — the static link-preview card. Scrapers never see the
 * `#` part of a share URL, so the card cannot name the workout being shared. It
 * used to show a sample program; that read as a lie in the chat. It now points
 * at the link instead of pretending to be the session.
 *
 * Run: node scripts/og.mjs   (needs the dev server's Playwright install, no server)
 */
import { chromium } from '@playwright/test';

const INK = '#0b0b0d';
const SURFACE = '#15161a';
const LINE = '#26282e';
const MUTED = '#8b8f98';
const ACCENT = '#d7ff3f';

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
  .card .big { font-size: 34px; line-height: 1.25; color: #f2f3f5; font-weight: 600; margin-top: 22px; letter-spacing: -0.5px; }
  .card .then { font-size: 20px; margin-top: 14px; }
</style>
<div class="left">
  <div class="eyebrow">OFFLINE WORKOUT GUIDE</div>
  <h1>Workout<span>Companion</span></h1>
  <div class="tag">Set by set. Rest timed.<br>Nothing to sign up for.</div>
</div>
<div class="card">
  <h2>SHARED WORKOUT</h2>
  <p class="big">See my session here.</p>
  <p class="then">Every set, rep and weight, exactly as it was done.</p>
</div>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.setContent(html);
await page.screenshot({ path: '/tmp/og.png' });
await browser.close();
console.log('wrote /tmp/og.png — now: sips -s format jpeg -s formatOptions 72 /tmp/og.png --out public/og.jpg');
