import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { SessionRow } from '../storage/db';
import { createSession } from '../engine/create';
import { reduce } from '../engine/reduce';
import type { Program } from '../engine/types';
import { parseProgram } from '../schemas/program';
import { BACKUP_FORMAT, buildBackup, mergeNewest, parseBackup, parseRemote, type Backup } from './backup';

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
  it('carries each program edit time outside the program itself', () => {
    const backup = buildBackup([{ ...program, updatedAt: 1234 }], [], 5000);
    expect(backup.programUpdatedAt).toEqual({ [program.id]: 1234 });
    // Not inside the program, or re-import would fail the strict schema.
    expect(JSON.stringify(backup.programs)).not.toContain('updatedAt');
    expect(buildBackup([program], [], 5000).programUpdatedAt).toEqual({});
  });

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

describe('mergeNewest', () => {
  const empty = (over: Partial<Backup> = {}): Backup => ({
    format: BACKUP_FORMAT,
    version: 1,
    exportedAt: 1000,
    programUpdatedAt: {},
    programs: [],
    sessions: [],
    ...over,
  });

  const program = (id: string, name: string) => ({ id, name });
  const session = (id: string, updatedAt: number) => ({ id, state: { updatedAt } });

  it('takes the newer program, whichever side it is on', () => {
    const local = empty({ programs: [program('a', 'old')], programUpdatedAt: { a: 10 } });
    const remote = empty({ programs: [program('a', 'new')], programUpdatedAt: { a: 20 } });
    expect(mergeNewest(local, remote).programs).toEqual([program('a', 'new')]);
    expect(mergeNewest(remote, local).programs).toEqual([program('a', 'new')]);
  });

  it('treats a missing timestamp as 0', () => {
    const local = empty({ programs: [program('a', 'stamped')], programUpdatedAt: { a: 10 } });
    const remote = empty({ programs: [program('a', 'unstamped')] });
    expect(mergeNewest(local, remote).programs).toEqual([program('a', 'stamped')]);

    const stampedRemote = empty({ programs: [program('a', 'stamped')], programUpdatedAt: { a: 10 } });
    const unstampedLocal = empty({ programs: [program('a', 'unstamped')] });
    expect(mergeNewest(unstampedLocal, stampedRemote).programs).toEqual([program('a', 'stamped')]);
  });

  it('keeps the local row on a tie', () => {
    const local = empty({ programs: [program('a', 'mine')], programUpdatedAt: { a: 10 } });
    const remote = empty({ programs: [program('a', 'theirs')], programUpdatedAt: { a: 10 } });
    expect(mergeNewest(local, remote).programs).toEqual([program('a', 'mine')]);
  });

  it('takes the newer session and keeps local on a tie', () => {
    const local = empty({ sessions: [session('s', 5)] as never });
    const remote = empty({ sessions: [session('s', 9)] as never });
    expect(mergeNewest(local, remote).sessions).toEqual([session('s', 9)]);

    const tie = empty({ sessions: [session('s', 9)] as never });
    expect(mergeNewest(tie, remote).sessions).toEqual([session('s', 9)]);
  });

  it('never deletes: both sides survive', () => {
    const local = empty({ programs: [program('a', 'x')], sessions: [session('one', 1)] as never });
    const remote = empty({ programs: [program('b', 'y')], sessions: [session('two', 2)] as never });
    const merged = mergeNewest(local, remote);
    expect(merged.programs).toEqual([program('a', 'x'), program('b', 'y')]);
    expect(merged.sessions.map((row) => (row as { id: string }).id)).toEqual(['one', 'two']);
  });

  it('carries the newest stamp per program id', () => {
    const local = empty({ programUpdatedAt: { a: 30, b: 5 } });
    const remote = empty({ programUpdatedAt: { a: 10, b: 50, c: 7 } });
    expect(mergeNewest(local, remote).programUpdatedAt).toEqual({ a: 30, b: 50, c: 7 });
  });
});

describe('parseRemote', () => {
  it('refuses anything that is not a backup envelope', () => {
    expect(parseRemote('not json').ok).toBe(false);
    expect(parseRemote('{"hello":1}').ok).toBe(false);
    expect(parseRemote(JSON.stringify({ format: BACKUP_FORMAT, version: 2, programs: [], sessions: [] })).ok).toBe(false);
  });

  it('returns the envelope with its raw programs', () => {
    const result = parseRemote(JSON.stringify(buildBackup([program], [], 5000)));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.backup.programs).toHaveLength(1);
    expect(result.backup.sessions).toHaveLength(0);
  });
});
