import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { SessionRow } from '../storage/db';
import { createSession } from '../engine/create';
import { reduce } from '../engine/reduce';
import type { Program } from '../engine/types';
import { parseProgram } from '../schemas/program';
import { buildBackup, parseBackup } from './backup';

const fixture = readFileSync(new URL('../fixtures/workout-b.json', import.meta.url), 'utf8');
const parsed = parseProgram(fixture);
if (!parsed.ok) throw new Error('fixture must parse');
const program: Program = parsed.program;

function row(): SessionRow {
  const started = reduce(createSession(program, 1000, 'sess-1'), {
    type: 'START',
    now: 1000,
  });
  return {
    id: started.sessionId,
    stateVersion: 1,
    programId: started.programId,
    programName: started.program.name,
    status: started.status,
    startedAt: started.startedAt ?? 0,
    finishedAt: null,
    state: started,
  };
}

describe('backup files', () => {
  it('round trips programs and sessions', () => {
    const text = JSON.stringify(buildBackup([program], [row()], 5000));
    const result = parseBackup(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.programs.map((p) => p.id)).toEqual([program.id]);
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0].id).toBe('sess-1');
    expect(result.sessions[0].state.program.name).toBe(program.name);
  });

  it('accepts a bare program file, the shape agents write', () => {
    const result = parseBackup(fixture);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.programs).toHaveLength(1);
    expect(result.sessions).toEqual([]);
  });

  it('rejects text that is not JSON', () => {
    const result = parseBackup('nope');
    expect(result).toEqual({ ok: false, error: 'That file is not JSON.' });
  });

  it('rejects JSON that is neither a program nor a backup', () => {
    const result = parseBackup('{"hello":"world"}');
    expect(result.ok).toBe(false);
  });

  it('names the program that is invalid', () => {
    const broken = { ...program, raw: JSON.stringify({ schema_version: 1, id: 'x' }) };
    const result = parseBackup(JSON.stringify(buildBackup([broken as unknown as Program], [], 0)));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('Program 1');
  });

  it('rejects a session whose state is not a workout', () => {
    const broken = { ...row(), state: { sessionId: 'sess-1', status: 'completed' } };
    const text = JSON.stringify(buildBackup([program], [broken as unknown as SessionRow], 0));
    const result = parseBackup(text);
    expect(result).toEqual({ ok: false, error: 'Session 1 in the backup is not valid.' });
  });

  it('rejects a newer backup version', () => {
    const text = JSON.stringify({ ...buildBackup([], [], 0), version: 7 });
    const result = parseBackup(text);
    expect(result.ok).toBe(false);
  });
});
