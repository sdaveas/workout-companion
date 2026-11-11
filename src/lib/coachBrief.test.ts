import { describe, expect, it } from 'vitest';
import type { Program, WorkoutState } from '../engine/types';
import { createSession } from '../engine/create';
import { reduce } from '../engine/reduce';
import type { SessionRow } from '../storage/db';
import { BRIEF_MAX_SESSIONS, NO_PROGRAM_HINT, coachBrief } from './coachBrief';

const program: Program = {
  id: 'upper-a',
  name: 'Upper A',
  description: null,
  scheduleDays: [],
  estimatedDurationMinutes: null,
  raw: '{"schema_version":1,"id":"upper-a"}',
  exercises: [
    {
      id: 'bench',
      name: 'Bench Press',
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
    {
      id: 'face-pull',
      name: 'Face Pull',
      sets: 1,
      reps: { min: 10, max: 10 },
      weightKg: 10,
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

/** A finished session: start, log the first set, optionally skip the second, finish. */
function session(opts: {
  id: string;
  at: number;
  reps?: number;
  weight?: number;
  skip?: boolean;
  rpe?: number;
  notes?: string;
  abandon?: boolean;
}): SessionRow {
  let state: WorkoutState = reduce(createSession(program, opts.at, opts.id), {
    type: 'START',
    now: opts.at,
  });
  state = reduce(state, {
    type: 'COMPLETE_SET',
    reps: opts.reps ?? 5,
    weightKg: opts.weight ?? 40,
    now: opts.at + 60_000,
  });
  if (state.status === 'exercise_complete') {
    state = reduce(state, { type: 'NEXT_EXERCISE', now: opts.at + 90_000 });
  }
  if (opts.skip) state = reduce(state, { type: 'SKIP_SET', now: opts.at + 120_000 });
  state = reduce(state, { type: 'FINISH', now: opts.at + 1_800_000 });
  if (opts.rpe != null) state = reduce(state, { type: 'SET_RPE', rpe: opts.rpe, now: opts.at + 1_900_000 });
  if (opts.notes) state = reduce(state, { type: 'SET_NOTES', notes: opts.notes, now: opts.at + 2_000_000 });
  return {
    id: opts.id,
    stateVersion: 1,
    programId: program.id,
    programName: program.name,
    status: state.status,
    startedAt: opts.at,
    finishedAt: opts.at + 1_800_000,
    state: opts.abandon ? { ...state, status: 'abandoned' } : state,
  };
}

describe('coachBrief', () => {
  it('names the program so a reply can keep its id', () => {
    const brief = coachBrief({ program, sessions: [] });
    expect(brief).toContain('id: upper-a');
    expect(brief).toContain('name: Upper A');
    expect(brief).toContain('"schema_version":1');
  });

  it('says so when nothing has been logged', () => {
    const brief = coachBrief({ program, sessions: [] });
    expect(brief).toContain('## History\nNothing logged yet.');
    expect(brief).not.toContain('undefined');
  });

  it('carries the numbers that make a coach useful: sets, RPE and the note', () => {
    const brief = coachBrief({
      program,
      sessions: [session({ id: 's1', at: Date.UTC(2026, 10, 9), rpe: 7, notes: 'lower back tight' })],
    });
    expect(brief).toMatch(/1\/2 sets/);
    expect(brief).toContain('RPE 7');
    expect(brief).toContain('"lower back tight"');
  });

  it('names what was skipped instead of counting it', () => {
    const brief = coachBrief({
      program,
      sessions: [session({ id: 's1', at: Date.UTC(2026, 10, 9), skip: true })],
    });
    expect(brief).toContain('skipped: Face Pull');
    expect(brief).not.toMatch(/skipped: \d/);
  });

  it('keeps the weight that was actually lifted', () => {
    const brief = coachBrief({
      program,
      sessions: [session({ id: 's1', at: Date.UTC(2026, 10, 9), weight: 42.5, reps: 5 })],
    });
    expect(brief).toContain('Bench Press 42.5kg×5');
  });

  it('marks a session that was ended early', () => {
    const brief = coachBrief({
      program,
      sessions: [session({ id: 's1', at: Date.UTC(2026, 10, 9), abandon: true })],
    });
    expect(brief).toContain('ended early');
  });

  it('newest first, and only this program', () => {
    const other = {
      ...session({ id: 's2', at: Date.UTC(2026, 10, 1) }),
      programId: 'other',
      programName: 'Other',
    };
    const brief = coachBrief({
      program,
      sessions: [
        session({ id: 'old', at: Date.UTC(2026, 10, 1), notes: 'older note' }),
        session({ id: 'new', at: Date.UTC(2026, 10, 9), notes: 'newer note' }),
        other,
      ],
    });
    expect(brief).not.toContain('Other');
    expect(brief.indexOf('newer note')).toBeLessThan(brief.indexOf('older note'));
  });

  it(`samples to ${BRIEF_MAX_SESSIONS} sessions and stays under 8 KB`, () => {
    const rows = Array.from({ length: 40 }, (_, i) =>
      session({
        id: `s${i}`,
        at: Date.UTC(2026, 0, 1) + i * 86_400_000,
        rpe: 7,
        notes: 'a note that is long enough to matter when forty of them stack up',
        skip: i % 2 === 0,
      }),
    );
    const brief = coachBrief({ program, sessions: rows });
    expect(brief.length).toBeLessThan(8000);
    expect(brief.match(/RPE 7/g)?.length ?? 0).toBeLessThanOrEqual(BRIEF_MAX_SESSIONS);
  });

  it('works without a program: history and advice only', () => {
    const brief = coachBrief({
      program: null,
      sessions: [session({ id: 's1', at: Date.UTC(2026, 10, 9) })],
    });
    expect(brief).not.toContain('## Program');
    expect(brief).toContain('## History');
    expect(brief).toContain('Tell me what the history says');
  });

  it('the no-program hint names the fix', () => {
    expect(NO_PROGRAM_HINT).toContain('json block');
  });
});
