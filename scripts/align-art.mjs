/**
 * Aligns the two poses of each exercise illustration.
 *
 * The source drawings were traced one frame at a time, so a pair can be drawn at
 * slightly different scales or offsets — a curl where the body grows 10% between
 * poses reads as a zoom, not a rep. This finds, per pair, the scale + shift of the
 * second pose that best matches the first (a coarse search over renders), and bakes
 * it into the SVG as a transform. Only applied when it clearly helps.
 *
 * Run: node scripts/align-art.mjs [--write]
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const DIR = 'public/exercises';
const WRITE = process.argv.includes('--write');
const SIZE = 512;
const DOWN = 4; // compare at 128×128

const slugs = [
  ...new Set(readdirSync(DIR).filter((f) => f.endsWith('.svg')).map((f) => f.replace(/-[01]\.svg$/, ''))),
].sort();

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent('<body></body>');

const plan = await page.evaluate(
  async ({ slugs, dirFiles, size, down }) => {
    const load = async (markup) => {
      const img = new Image();
      img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(markup)));
      await img.decode();
      const c = document.createElement('canvas');
      c.width = size / down;
      c.height = size / down;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0, c.width, c.height);
      return g.getImageData(0, 0, c.width, c.height).data;
    };

    // mean absolute difference over pixels where either drawing has ink
    const score = (a, b, s, dx, dy) => {
      const n = size / down;
      const c = size / 2 / down;
      let err = 0;
      let ink = 0;
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          const sx = Math.round(c + (x - c) / s - dx / down);
          const sy = Math.round(c + (y - c) / s - dy / down);
          const va = a[(y * n + x) * 4 + 3];
          const vb = sx >= 0 && sy >= 0 && sx < n && sy < n ? b[(sy * n + sx) * 4 + 3] : 0;
          if (va || vb) {
            ink++;
            err += Math.abs(va - vb);
          }
        }
      }
      return ink ? err / ink : 255;
    };

    const out = [];
    for (const slug of slugs) {
      const a = await load(dirFiles[slug][0]);
      const b = await load(dirFiles[slug][1]);
      const base = score(a, b, 1, 0, 0);
      let best = { s: 1, dx: 0, dy: 0, err: base };
      for (let s = 0.9; s <= 1.1001; s += 0.02) {
        for (let dx = -60; dx <= 60; dx += 6) {
          for (let dy = -60; dy <= 60; dy += 6) {
            const err = score(a, b, s, dx, dy);
            if (err < best.err) best = { s: +s.toFixed(2), dx, dy, err };
          }
        }
      }
      // refine around the winner
      for (let s = best.s - 0.02; s <= best.s + 0.021; s += 0.01) {
        for (let dx = best.dx - 6; dx <= best.dx + 6; dx += 2) {
          for (let dy = best.dy - 6; dy <= best.dy + 6; dy += 2) {
            const err = score(a, b, s, dx, dy);
            if (err < best.err) best = { s: +s.toFixed(2), dx, dy, err };
          }
        }
      }
      out.push({ slug, base: Math.round(base), ...best, err: Math.round(best.err), gain: 1 - best.err / base });
    }
    return out;
  },
  {
    slugs,
    dirFiles: Object.fromEntries(
      slugs.map((s) => [`${s}`, [`${s}-0.svg`, `${s}-1.svg`].map((f) => readFileSync(`${DIR}/${f}`, 'utf8'))]),
    ),
    size: SIZE,
    down: DOWN,
  },
);

await browser.close();

for (const p of plan) {
  console.log(
    `${p.slug.padEnd(28)} scale ${p.s}  shift ${String(p.dx).padStart(4)},${String(p.dy).padStart(4)}` +
      `  err ${String(p.base).padStart(3)} -> ${String(p.err).padStart(3)}  (-${Math.round(p.gain * 100)}%)`,
  );
}

if (WRITE) {
  const c = SIZE / 2;
  for (const p of plan) {
    if (p.gain < 0.12 || (p.s === 1 && p.dx === 0 && p.dy === 0)) continue;
    const tx = p.dx + c - p.s * c;
    const ty = p.dy + c - p.s * c;
    const transform = `translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${p.s})`;
    const file = `${DIR}/${p.slug}-1.svg`;
    const svg = readFileSync(file, 'utf8');
    if (svg.includes('<g transform')) continue;
    // the files are a single self-closing <path>; wrap it so the pose is transformed
    const patched = svg.replace(/(<path\b[^>]*\/>)/, `<g transform="${transform}">$1</g>`);
    if (patched === svg) throw new Error(`could not wrap path in ${file}`);
    writeFileSync(file, patched);
  }
  console.log('wrote transforms');
}
