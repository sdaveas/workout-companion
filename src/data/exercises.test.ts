import { describe, expect, it } from 'vitest';
import { EXERCISE_LIBRARY, libraryExercise, patternFor } from './exercises';

describe('exercise library', () => {
  it('has unique names and usable defaults', () => {
    const names = EXERCISE_LIBRARY.map((e) => e.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
    for (const e of EXERCISE_LIBRARY) {
      expect(e.sets).toBeGreaterThan(0);
      expect(e.repsMin).toBeLessThanOrEqual(e.repsMax);
      expect(e.restSeconds).toBeGreaterThan(0);
    }
  });

  it('recognises library names and the same movements typed by hand', () => {
    expect(patternFor('Dumbbell Row')).toBe('pull');
    expect(patternFor('dumbbell row')).toBe('pull');
    expect(patternFor('Barbell Bench Press')).toBe('push');
    expect(patternFor('Romanian Deadlift')).toBe('hinge');
    expect(patternFor('Cable Bicep Curl')).toBe('curl');
    expect(patternFor('Bulgarian Split Squat')).toBe('squat');
    expect(patternFor('Side Plank')).toBe('core');
    expect(patternFor('Mystery Machine')).toBeNull();
  });

  it('knows which library movements are unilateral', () => {
    expect(libraryExercise('Dumbbell Row')?.perHand).toBe(true);
    expect(libraryExercise('Bench Press')?.perHand).toBeUndefined();
  });
});
