import { describe, expect, it } from 'vitest';
import { nextUp, weekView } from './schedule';
import type { Program, Weekday } from './types';

const program = (id: string, day: Weekday | null): Program => ({
  id,
  name: id,
  description: null,
  scheduleDay: day,
  estimatedDurationMinutes: null,
  exercises: [],
  raw: '{}',
});

// Local-time dates so weekday logic matches the device clock.
const saturday = new Date(2026, 10, 7, 9, 0, 0).getTime(); // Sat 7 Nov 2026
const T = (day: number, hour = 9) => new Date(2026, 10, day, hour).getTime();

describe('nextUp', () => {
  const b = program('workout-b', 'saturday');

  it('returns today for a program scheduled today', () => {
    expect(nextUp([b], [], saturday)).toEqual({ kind: 'today', program: b });
  });

  it('returns done_today once today’s session is completed', () => {
    expect(nextUp([b], [{ programId: 'workout-b', finishedAt: T(7, 10) }], saturday)).toEqual({
      kind: 'done_today',
      program: b,
    });
  });

  it('ignores a session from yesterday', () => {
    expect(nextUp([b], [{ programId: 'workout-b', finishedAt: T(6, 18) }], saturday)).toEqual({
      kind: 'today',
      program: b,
    });
  });

  it('looks forward for the next scheduled day', () => {
    expect(nextUp([program('a', 'monday')], [], saturday)).toEqual({
      kind: 'upcoming',
      program: program('a', 'monday'),
      weekday: 'monday',
    });
  });

  it('wraps within seven days', () => {
    const result = nextUp([program('fri', 'friday')], [], saturday);
    expect(result.kind).toBe('upcoming');
  });

  it('prefers an active session over the schedule', () => {
    expect(nextUp([b], [], saturday, { programId: 'workout-b' })).toEqual({ kind: 'resume' });
  });

  it('returns none with no scheduled programs', () => {
    expect(nextUp([program('x', null)], [], saturday)).toEqual({ kind: 'none' });
  });
});

describe('weekView', () => {
  it('always returns seven days starting Monday', () => {
    const week = weekView([program('b', 'saturday')], [], saturday);
    expect(week).toHaveLength(7);
    expect(week[0].weekday).toBe('monday');
    expect(week[5].weekday).toBe('saturday');
    expect(week[5].programs[0].done).toBe(false);
  });

  it('marks the day done when a session finished that day', () => {
    const week = weekView(
      [program('workout-b', 'saturday')],
      [{ programId: 'workout-b', finishedAt: T(7, 11) }],
      saturday,
    );
    expect(week[5].programs[0].done).toBe(true);
  });

  it('does not leak a completion into the following week', () => {
    const nextWeek = new Date(2026, 10, 14, 9).getTime(); // Sat 14 Nov
    const week = weekView(
      [program('b', 'saturday')],
      [{ programId: 'workout-b', finishedAt: T(7, 11) }],
      nextWeek,
    );
    expect(week[5].programs[0].done).toBe(false);
  });
});
