import { describe, expect, it } from 'vitest';
import { createSession } from './create';
import { reduce } from './reduce';
import { rebaseRest, remainingMs, remainingSeconds, restartRest } from './rest';
import { parseProgram } from '../schemas/program';
import { readFileSync } from 'node:fs';
import type { WorkoutState } from './types';

const fixture = readFileSync(new URL('../fixtures/workout-b.json', import.meta.url), 'utf8');
const parsed = parseProgram(fixture);
if (!parsed.ok) throw new Error('fixture must parse');
const T0 = Date.UTC(2026, 10, 7, 9, 0, 0);

const resting = (): WorkoutState =>
  reduce(
    reduce(createSession(parsed.program, T0, 'sid'), { type: 'START', now: T0 }),
    { type: 'COMPLETE_SET', now: T0, reps: 8, weightKg: null },
  );

describe('remainingMs', () => {
  it('is zero outside rest', () => {
    const s = createSession(parsed.program, T0, 'sid');
    expect(remainingMs(s, T0)).toBe(0);
    expect(remainingMs(reduce(s, { type: 'START', now: T0 }), T0)).toBe(0);
  });

  it('counts down from the timestamp, never below zero', () => {
    const s = resting();
    expect(remainingMs(s, T0)).toBe(90_000);
    expect(remainingMs(s, T0 + 45_000)).toBe(45_000);
    expect(remainingMs(s, T0 + 90_000)).toBe(0);
    expect(remainingMs(s, T0 + 500_000)).toBe(0);
  });

  it('rounds up to whole seconds for display', () => {
    const s = resting();
    expect(remainingSeconds(s, T0 + 89_001)).toBe(1);
    expect(remainingSeconds(s, T0 + 89_000)).toBe(1);
    expect(remainingSeconds(s, T0 + 89_999)).toBe(1);
  });

  it('reports the frozen remainder while paused', () => {
    const paused = reduce(resting(), { type: 'PAUSE', now: T0 + 20_000 });
    expect(remainingMs(paused, T0 + 80_000)).toBe(70_000);
  });
});

describe('rebaseRest', () => {
  it('keeps the invariant endsAt = started + duration', () => {
    const s = resting();
    const r = rebaseRest(s, T0 + 10_000, 15);
    expect((r.restStartedAt ?? 0) + r.restDurationMs).toBe(T0 + 105_000);
  });

  it('never allows more than 600s remaining from now', () => {
    const s = resting();
    const r = rebaseRest(s, T0, 10_000);
    expect(r.restDurationMs).toBe(600_000);
  });

  it('never goes negative', () => {
    const s = resting();
    const r = rebaseRest(s, T0 + 500_000, -5_000);
    expect(r.restDurationMs).toBe(0);
  });
});

describe('restartRest', () => {
  it('resets to the prescribed duration and bumps restCount', () => {
    const s = resting();
    const r = restartRest(s, T0 + 5_000, 60);
    expect(r).toEqual({ restStartedAt: T0 + 5_000, restDurationMs: 60_000, restCount: s.restCount + 1 });
  });
});
