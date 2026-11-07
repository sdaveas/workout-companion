import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Program } from '../engine/types';
import { parseProgram } from '../schemas/program';
import { decodeProgram, encodeProgram, shareUrl } from './share';

const fixture = readFileSync(new URL('../fixtures/workout-b.json', import.meta.url), 'utf8');
const parsed = parseProgram(fixture);
if (!parsed.ok) throw new Error('fixture must parse');
const program: Program = parsed.program;

describe('share link', () => {
  it('round-trips a program through the link payload', async () => {
    const payload = await encodeProgram(program);
    expect(payload).toMatch(/^[A-Za-z0-9_-]+$/);
    const back = await decodeProgram(payload);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.program.name).toBe(program.name);
    const plan = (p: Program) =>
      p.exercises.map((e) => [e.name, e.sets, e.reps, e.weightKg, e.perHand, e.restSeconds]);
    expect(plan(back.program)).toEqual(plan(program));
    expect(back.program.scheduleDay).toBe(program.scheduleDay);
  });

  it('keeps a realistic program link short', async () => {
    const url = shareUrl(await encodeProgram(program), 'https://example.com/app/');
    // 6 exercises used to cost ~1000 characters of payload; the compact wire form is ~200.
    expect(url.length).toBeLessThan(300);
  });

  it('rejects a link that is not a program', async () => {
    expect((await decodeProgram('not-a-payload!!')).ok).toBe(false);
    expect((await decodeProgram('aGVsbG8')).ok).toBe(false); // "hello"
  });
});
