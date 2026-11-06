import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Program } from '../engine/types';
import { createSession } from '../engine/create';
import { reduce } from '../engine/reduce';
import { readHistory } from '../../mcp/store';
import type { SessionRow } from '../storage/db';
import { historyExport } from './exportHistory';

const program: Program = {
  id: 'p',
  name: 'P',
  description: null,
  scheduleDay: null,
  estimatedDurationMinutes: null,
  raw: '{}',
  exercises: [
    {
      id: 'squat',
      name: 'Squat',
      sets: 1,
      reps: { min: 5, max: 5 },
      weightKg: 40,
      perHand: false,
      restSeconds: 0,
      instructions: [],
      commonMistakes: [],
      equipment: [],
      muscleGroups: [],
      imageUrl: null,
    },
  ],
};

describe('historyExport', () => {
  it('writes what the MCP reads, with the summary shape the app renders', () => {
    const started = reduce(createSession(program, 1_000, 's1'), { type: 'START', now: 1_000 });
    const done = reduce(
      reduce(started, { type: 'COMPLETE_SET', now: 2_000, reps: 5, weightKg: 40 }),
      { type: 'NEXT_EXERCISE', now: 2_000 },
    );
    const row: SessionRow = {
      id: 's1',
      stateVersion: 1,
      programId: 'p',
      programName: 'P',
      status: done.status,
      startedAt: 1_000,
      finishedAt: done.finishedAt,
      state: done,
    };

    const file = historyExport([row], 3_000);
    expect(file.exportedAt).toBe(3_000);
    expect(file.sessions[0]).toMatchObject({ id: 's1', programId: 'p', programName: 'P' });
    expect(file.sessions[0].summary.setsCompleted).toBe(1);
    expect(file.sessions[0].summary.volumeKg).toBe(200);
  });

  it('is the file the MCP reads back unchanged', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'wc-export-'));
    try {
      await mkdir(path.join(root, 'history'), { recursive: true });
      const file = historyExport([], 7_000);
      await writeFile(path.join(root, 'history', 'workout-history.json'), JSON.stringify(file));
      expect(await readHistory(root)).toEqual(file);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
