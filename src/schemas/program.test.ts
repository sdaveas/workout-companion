import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { describeError, formatPath, parseProgram } from './program';

const fixture = readFileSync(new URL('../fixtures/workout-b.json', import.meta.url), 'utf8');

const withExercise = (patch: Record<string, unknown>, index = 0) => {
  const doc = JSON.parse(fixture);
  Object.assign(doc.exercises[index], patch);
  return JSON.stringify(doc);
};

const issuesOf = (text: string) => {
  const r = parseProgram(text);
  if (r.ok) throw new Error('expected failure');
  return describeError(r.error);
};

describe('parseProgram', () => {
  it('reads a multi-day schedule, and still reads a single-day file', () => {
    const file = JSON.parse(fixture) as Record<string, unknown>;

    const multi = parseProgram(JSON.stringify({ ...file, schedule: { days: ['monday', 'thursday'] } }));
    if (!multi.ok) throw new Error('expected ok');
    expect(multi.program.scheduleDays).toEqual(['monday', 'thursday']);

    const legacy = parseProgram(JSON.stringify({ ...file, schedule: { day: 'monday' } }));
    if (!legacy.ok) throw new Error('expected ok');
    expect(legacy.program.scheduleDays).toEqual(['monday']);

    // A file that carries both is read once per day, in order.
    const both = parseProgram(
      JSON.stringify({ ...file, schedule: { day: 'monday', days: ['monday', 'thursday'] } }),
    );
    if (!both.ok) throw new Error('expected ok');
    expect(both.program.scheduleDays).toEqual(['monday', 'thursday']);
  });

  it('parses the Workout B fixture', () => {
    const r = parseProgram(fixture);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.program.name).toBe('Workout B');
    expect(r.program.scheduleDays).toEqual(['saturday']);
    expect(r.program.exercises).toHaveLength(6);
    expect(r.program.exercises.reduce((n, e) => n + e.sets, 0)).toBe(16);
    expect(r.program.exercises[1].weightKg).toBe(5.8);
    expect(r.program.exercises[1].perHand).toBe(true);
    expect(r.program.exercises[0].weightKg).toBeNull();
  });

  it('normalizes lb to kg', () => {
    const r = parseProgram(withExercise({ weight: { value: 12.79, unit: 'lb', per_hand: false } }));
    expect(r.ok && r.program.exercises[0].weightKg).toBe(5.8);
  });

  it('rejects duplicate exercise ids', () => {
    expect(issuesOf(withExercise({ id: 'push-ups' }, 1))[0]).toMatchObject({
      path: 'exercises[1].id',
      message: 'Duplicate exercise id "push-ups".',
    });
  });

  it('rejects max reps below min reps', () => {
    expect(issuesOf(withExercise({ reps: { min: 12, max: 10 } }))[0].path).toBe('exercises[0].reps.max');
  });

  it('rejects sets that are not a positive integer', () => {
    const issues = issuesOf(withExercise({ sets: 0 }));
    expect(issues[0]).toEqual({ path: 'exercises[0].sets', message: 'Expected a positive integer.' });
  });

  it('rejects rest over 600 seconds', () => {
    expect(issuesOf(withExercise({ rest_seconds: 601 }))[0].path).toBe('exercises[0].rest_seconds');
  });

  it('rejects negative weight', () => {
    expect(issuesOf(withExercise({ weight: { value: -1, unit: 'kg' } }))[0].path).toBe(
      'exercises[0].weight.value',
    );
  });

  it('rejects non-http image urls', () => {
    expect(issuesOf(withExercise({ image_url: 'javascript:alert(1)' }))[0].message).toMatch(
      /valid http\(s\) URL/,
    );
  });

  it('rejects unknown keys instead of dropping them', () => {
    expect(issuesOf(withExercise({ weight: { value: 5.8, unit: 'kg', per_handd: true } }))[0]).toMatchObject({
      path: 'exercises[0].weight',
    });
  });

  it('rejects an unsupported schema version with the received value', () => {
    const doc = JSON.parse(fixture);
    doc.schema_version = 2;
    expect(issuesOf(JSON.stringify(doc))[0].message).toContain('Unsupported schema version 2');
  });

  it('rejects invalid JSON', () => {
    expect(issuesOf('{ nope')).toEqual([
      { path: '', message: expect.stringContaining('Not valid JSON') },
    ]);
  });

  it('rejects a non-object document', () => {
    expect(issuesOf('[]')[0].message).toMatch(/top level/);
  });

  it('rejects a program with no exercises', () => {
    const doc = JSON.parse(fixture);
    doc.exercises = [];
    expect(issuesOf(JSON.stringify(doc))[0].path).toBe('exercises');
  });
});

describe('formatPath', () => {
  it('brackets numeric segments', () => {
    expect(formatPath(['exercises', 2, 'sets'])).toBe('exercises[2].sets');
    expect(formatPath(['name'])).toBe('name');
    expect(formatPath([])).toBe('');
  });
});
