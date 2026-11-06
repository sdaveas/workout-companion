import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

// One source of truth for the mark: a lime dumbbell on the app's ink background.
// Content stays inside the maskable safe zone (centred 80%).
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="#0b0b0d"/>
  <g fill="#d7ff3f">
    <rect x="9" y="21" width="7" height="22" rx="2.5"/>
    <rect x="17.5" y="26" width="5" height="12" rx="2"/>
    <rect x="41.5" y="26" width="5" height="12" rx="2"/>
    <rect x="48" y="21" width="7" height="22" rx="2.5"/>
    <rect x="22" y="29.5" width="20" height="5" rx="2.5"/>
  </g>
</svg>`;

await mkdir('public/icons', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });

for (const [name, size] of [
  ['apple-touch-icon.png', 180],
  ['icon-192.png', 192],
  ['icon-512.png', 512],
]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<style>html,body{margin:0;height:100%;overflow:hidden}svg{width:100%;height:100%;display:block}</style>${svg}`,
  );
  await page.screenshot({ path: `public/icons/${name}` });
  console.log('wrote', `public/icons/${name}`, `${size}x${size}`);
}

await browser.close();
