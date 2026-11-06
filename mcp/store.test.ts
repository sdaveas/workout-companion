import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  archiveProgram,
  getProgram,
  listPrograms,
  readHistory,
  saveProgram,
  validateProgram,
} from './store';

const program = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    schema_version: 1,
    id: 'workout-z',
    name: 'Workout Z',
    schedule: { day: 'friday' },
    exercises: [
      {
        id: 'squat',
        name: 'Squat',
        sets: 3,
        reps: { min: 5, max: 8 },
        weight: { value: 40, unit: 'kg' },
        rest_seconds: 120,
      },
    ],
    ...over,
  });

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'wc-mcp-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('program store', () => {
  it('creates a file, lists it, and writes the index', async () => {
    const result = await saveProgram(root, program());
    expect(result).toEqual({ ok: true, id: 'workout-z' });

    expect(await listPrograms(root)).toEqual([
      { id: 'workout-z', name: 'Workout Z', scheduleDay: 'friday', exerciseCount: 1 },
    ]);
    const index = JSON.parse(await readFile(path.join(root, 'programs', 'index.json'), 'utf8'));
    expect(index.programs[0].id).toBe('workout-z');
    expect(JSON.parse((await getProgram(root, 'workout-z')) ?? '{}').name).toBe('Workout Z');
  });

  it('refuses a duplicate id unless replace is set', async () => {
    await saveProgram(root, program());
    const again = await saveProgram(root, program({ name: 'Renamed' }));
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.issues[0].message).toContain('already exists');

    const replaced = await saveProgram(root, program({ name: 'Renamed' }), { replace: true });
    expect(replaced.ok).toBe(true);
    expect(JSON.parse((await getProgram(root, 'workout-z')) ?? '{}').name).toBe('Renamed');
  });

  it('reports the importer path on invalid input and writes nothing', async () => {
    const issues = await validateProgram(
      program({
        exercises: [{ id: 'squat', name: 'Squat', sets: 0, reps: { min: 5, max: 5 }, rest_seconds: 60 }],
      }),
    );
    expect(issues).toContainEqual({ path: 'exercises[0].sets', message: 'Expected a positive integer.' });

    const result = await saveProgram(root, '{"schema_version": 1}');
    expect(result.ok).toBe(false);
    expect(await listPrograms(root)).toEqual([]);
  });

  it('refuses an id that does not match the file being updated', async () => {
    await saveProgram(root, program());
    const result = await saveProgram(root, program({ id: 'other' }), { expectedId: 'workout-z' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0].path).toBe('id');
  });

  it('refuses ids that would escape the data directory', async () => {
    const result = await saveProgram(root, program({ id: '../evil' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0].path).toBe('id');
  });

  it('archives instead of deleting', async () => {
    await saveProgram(root, program());
    expect(await archiveProgram(root, 'workout-z')).toBe(true);
    expect(await listPrograms(root)).toEqual([]);
    expect(await getProgram(root, 'workout-z')).toBeNull();
    const archived = await readFile(path.join(root, 'programs', 'archive', 'workout-z.json'), 'utf8');
    expect(JSON.parse(archived).id).toBe('workout-z');
  });

  it('returns null when there is no history export', async () => {
    expect(await readHistory(root)).toBeNull();
  });

  it('reads an exported history file', async () => {
    await mkdir(path.join(root, 'history'), { recursive: true });
    await writeFile(
      path.join(root, 'history', 'workout-history.json'),
      JSON.stringify({ exportedAt: 1, sessions: [] }),
    );
    expect(await readHistory(root)).toEqual({ exportedAt: 1, sessions: [] });
  });
});
