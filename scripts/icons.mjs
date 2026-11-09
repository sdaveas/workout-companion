import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

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

/** Screenshot the mark at one size, in memory. */
async function render(page, size) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<style>html,body{margin:0;height:100%;overflow:hidden}svg{width:100%;height:100%;display:block}</style>${svg}`,
  );
  return page.screenshot();
}

/**
 * Browsers ask for /favicon.ico whether or not a <link rel="icon"> exists, and a 404
 * there is the grey globe in the tab. PNG frames are legal inside an .ico container.
 */
function ico(frames) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(frames.length, 4);
  const dir = Buffer.alloc(16 * frames.length);
  let offset = 6 + dir.length;
  frames.forEach(({ size, png }, i) => {
    const entry = dir.subarray(i * 16, (i + 1) * 16);
    entry.writeUInt8(size, 0);
    entry.writeUInt8(size, 1);
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
  });
  return Buffer.concat([header, dir, ...frames.map((f) => f.png)]);
}

await mkdir('public/icons', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });

for (const [name, size] of [
  ['apple-touch-icon.png', 180],
  ['icon-192.png', 192],
  ['icon-512.png', 512],
]) {
  await writeFile(`public/icons/${name}`, await render(page, size));
  console.log('wrote', `public/icons/${name}`, `${size}x${size}`);
}

const frames = [];
for (const size of [16, 32, 48]) frames.push({ size, png: await render(page, size) });
await writeFile('public/favicon.ico', ico(frames));
console.log('wrote public/favicon.ico 16/32/48');

await browser.close();
