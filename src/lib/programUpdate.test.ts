import { describe, expect, it } from 'vitest';
import { createSession } from '../engine/create';
import { reduce } from '../engine/reduce';
import { parseProgram } from '../schemas/program';
import type { Program } from '../engine/types';
import { planProgramUpdate } from './programUpdate';

const T0 = Date.UTC(2026, 10, 7, 9, 0, 0);

const source = JSON.stringify({
  schema_version: 1,
  id: 'push',
  name: 'Push Day',
  exercises: [
    {
      id: 'press',
      name: 'Bench Press',
      sets: 2,
      reps: { min: 8, max: 10 },
      weight: { value: 20, unit: 'kg' },
      rest_seconds: 60,
    },
    {
      id: 'row',
      name: 'Dumbbell Row',
      sets: 2,
      reps: { min: 8, max: 10 },
      rest_seconds: 60,
      per_hand: true,
    },
  ],
});

const parsed = parseProgram(source);
if (!parsed.ok) throw new Error('test program must parse');
const program: Program = parsed.program;

const started = () => reduce(createSession(program, T0, 'sid'), { type: 'START', now: T0 });

describe('program update plan', () => {
  it('proposes the weight, reps and rest that were actually used, and drops a skipped exercise', () => {
    let s = started();
    s = reduce(s, { type: 'COMPLETE_SET', now: T0, reps: 6, weightKg: 22.5 });
    s = reduce(s, { type: 'ADJUST_REST', now: T0, seconds: 15 });
    s = reduce(s, { type: 'SKIP_REST', now: T0 });
    s = reduce(s, { type: 'COMPLETE_SET', now: T0, reps: 6, weightKg: 22.5 });
    s = reduce(s, { type: 'NEXT_EXERCISE', now: T0 });
    s = reduce(s, { type: 'SKIP_EXERCISE', now: T0 });
    s = reduce(s, { type: 'FINISH', now: T0 + 1000 });

    const update = planProgramUpdate(s, program);
    expect(update).not.toBeNull();
    if (!update) return;

    expect(update.lines).toHaveLength(2);
    expect(update.lines[0]).toContain('20 kg → 22.5 kg');
    expect(update.lines[0]).toContain('60s rest → 75s rest');
    expect(update.lines[0]).toContain('6 reps');
    expect(update.lines[1]).toContain('remove');

    const doc = JSON.parse(update.json);
    expect(doc.exercises).toHaveLength(1);
    expect(doc.exercises[0]).toMatchObject({
      id: 'press',
      reps: { min: 6, max: 6 },
      weight: { value: 22.5, unit: 'kg' },
      rest_seconds: 75,
    });
  });

  it('says nothing when the session matched the program', () => {
    let s = started();
    s = reduce(s, { type: 'COMPLETE_SET', now: T0, reps: 9, weightKg: 20 });
    s = reduce(s, { type: 'SKIP_REST', now: T0 });
    s = reduce(s, { type: 'COMPLETE_SET', now: T0, reps: 9, weightKg: 20 });
    s = reduce(s, { type: 'NEXT_EXERCISE', now: T0 });
    expect(planProgramUpdate(s, program)).toBeNull();
  });

  it('never proposes emptying the program', () => {
    let s = started();
    s = reduce(s, { type: 'SKIP_EXERCISE', now: T0 });
    s = reduce(s, { type: 'NEXT_EXERCISE', now: T0 });
    s = reduce(s, { type: 'SKIP_EXERCISE', now: T0 });
    s = reduce(s, { type: 'FINISH', now: T0 + 1000 });
    expect(planProgramUpdate(s, program)).toBeNull();
  });
});
