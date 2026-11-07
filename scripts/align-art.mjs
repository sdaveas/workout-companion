/**
 * Puts the two poses of each exercise illustration on the same scale.
 *
 * The source drawings (bryllim/workout-guide, CC BY-SA) were traced one frame at
 * a time, and the second pose is often drawn bigger than the first — a curl whose
 * body grows 10% between poses reads as a zoom, not a rep. Automatic fitting was
 * tried and rejected: every 2D metric (pixel overlap, ink area, chamfer) rewards
 * shrinking, because a smaller drawing always sits closer to the big one. So the
 * numbers are measured and written by hand, in the table below.
 *
 * Each value scales pose 2 (`<slug>-1.svg`) about a fixed point on the floor line,
 * so the feet stay put and only the size changes. 1 means "leave it alone".
 *
 * Run: node scripts/align-art.mjs [--write]
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';

const DIR = 'public/exercises';
const WRITE = process.argv.includes('--write');

// ponytail: one anchor for every drawing. The art is one 512×512 family, so a
// shared floor line is accurate to a few px; per-pair anchors buy nothing visible
// and need a browser to measure.
const AX = 256;
const AY = 492;

/**
 * How big pose 2 is relative to pose 1, per exercise. Values under 1 shrink it.
 * Measured from the art (head width at the top of the silhouette, cross-checked
 * against a side-by-side sheet); pairs whose two poses barely differ are 1.
 */
const SCALE = {
  'back-extension': 1,
  'bench-press': 0.93,
  'bicep-curl': 0.91,
  'bulgarian-split-squat': 0.9,
  'calf-raise': 1,
  crunch: 0.9,
  deadlift: 1,
  'face-pull': 1,
  'front-raise': 0.9,
  'goblet-squat': 1.1,
  'hammer-curl': 0.91,
  'hanging-leg-raise': 0.98,
  'hip-thrust': 0.93,
  'incline-bench-press': 1,
  'kettlebell-swing': 1,
  'lat-pulldown': 0.97,
  'lateral-raise': 1,
  'leg-press': 1,
  'one-arm-dumbbell-row': 1,
  'overhead-press': 1,
  'overhead-tricep-extension': 1,
  plank: 0.97,
  'pull-up': 1,
  'push-up': 1,
  'romanian-deadlift': 1,
  'seated-row': 0.91,
  'side-plank': 1,
  squat: 1,
  'tricep-pushdown': 1,
  'walking-lunge': 0.9,
};

const MARK = '<g data-align="1"';
const UNWRAP = new RegExp(`${MARK}[^>]*>([\\s\\S]*?)</g>`, 'g');

const slugs = [...new Set(readdirSync(DIR).filter((f) => f.endsWith('-1.svg')).map((f) => f.replace(/-1\.svg$/, '')))].sort();

let changed = 0;
const missing = [];
for (const slug of slugs) {
  const s = SCALE[slug];
  if (s === undefined) {
    missing.push(slug);
    continue;
  }
  const file = `${DIR}/${slug}-1.svg`;
  const before = readFileSync(file, 'utf8');
  // Unwrap whatever we wrote last time first, so re-running never compounds.
  const bare = before.replace(UNWRAP, '$1');
  const after =
    s === 1
      ? bare
      : bare.replace(
          /(<path\b[^>]*\/>)/,
          `${MARK} transform="translate(${AX} ${AY}) scale(${s}) translate(${-AX} ${-AY})">$1</g>`,
        );
  if (after === bare && s !== 1) throw new Error(`could not wrap path in ${file}`);
  if (after !== before) {
    if (WRITE) writeFileSync(file, after);
    changed++;
    console.log(`${slug.padEnd(28)} ${s === 1 ? 'reset to 1' : `scale ${s}`}`);
  }
}

if (missing.length) console.log(`no table entry (left as is): ${missing.join(', ')}`);
console.log(WRITE ? `wrote ${changed} file(s)` : `${changed} file(s) would change — re-run with --write`);
