import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  EXERCISE_LIBRARY,
  MUSCLE_GROUP_ORDER,
  libraryExercise,
  muscleSummary,
  patternFor,
} from './exercises';
import { SHIPPED_SLUGS, easterEggFor } from './exerciseFigures';

describe('exercise library', () => {
  it('has unique names and usable defaults', () => {
    const names = EXERCISE_LIBRARY.map((e) => e.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
    for (const e of EXERCISE_LIBRARY) {
      expect(e.sets).toBeGreaterThan(0);
      expect(e.repsMin).toBeLessThanOrEqual(e.repsMax);
      expect(e.restSeconds).toBeGreaterThan(0);
      expect(MUSCLE_GROUP_ORDER).toContain(e.group);
    }
  });

  it('keeps the curated entries first, in order, because share links code them by position', () => {
    expect(EXERCISE_LIBRARY.slice(0, 30).map((e) => e.name)).toEqual([
      'Bench Press',
      'Dumbbell Floor Press',
      'Overhead Press',
      'Push-up',
      'Incline Press',
      'Triceps Pushdown',
      'Dumbbell Row',
      'Lat Pulldown',
      'Pull-up',
      'Seated Cable Row',
      'Face Pull',
      'Back Squat',
      'Goblet Squat',
      'Leg Press',
      'Bulgarian Split Squat',
      'Lunge',
      'Calf Raise',
      'Deadlift',
      'Romanian Deadlift',
      'Hip Thrust',
      'Kettlebell Swing',
      'Back Extension',
      'Bicep Curl',
      'Hammer Curl',
      'Lateral Raise',
      'Front Raise',
      'Plank',
      'Side Plank',
      'Hanging Leg Raise',
      'Crunch',
    ]);
  });

  it('offers every exercise the built-in programs use', () => {
    for (const name of [
      'Push-ups',
      'Shoulder Press',
      'Biceps Curls',
      'Plank (30 sec)',
      'One-arm Dumbbell Row',
      'Overhead Triceps Extension',
      'Dumbbell Floor Press',
    ]) {
      expect(libraryExercise(name), name).toBeDefined();
    }
  });

  it('knows the muscle each movement works', () => {
    expect(libraryExercise('Bench Press')?.muscle).toBe('Chest');
    expect(libraryExercise('Dumbbell Row')?.group).toBe('Back');
    expect(libraryExercise('Hammer Curl')?.group).toBe('Arms');
    expect(libraryExercise('Goblet Squat')?.group).toBe('Legs');
    expect(muscleSummary('Bench Press')).toMatch(/^Chest · /);
    expect(muscleSummary('Shoulder Press')).toMatch(/^Shoulders/);
    expect(muscleSummary('Something Nobody Programmed')).toBeNull();
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

describe('exercise illustrations', () => {
  const files = readdirSync('public/exercises');
  const slugsInFolder = new Set(
    files.filter((f) => f.endsWith('.svg')).map((f) => f.replace(/-[01]\.svg$/, '')),
  );

  it('ships exactly the art it claims to ship', () => {
    expect([...SHIPPED_SLUGS].sort()).toEqual([...slugsInFolder].sort());
    for (const slug of SHIPPED_SLUGS) {
      expect(files, slug).toContain(`${slug}-0.svg`);
      expect(files, slug).toContain(`${slug}-1.svg`);
    }
  });
});

describe('biceps easter egg', () => {
  it('shows up for a third of biceps visits and never elsewhere', () => {
    expect(easterEggFor('bicep-curl', 0)).toBe('easter/biceps.png');
    expect(easterEggFor('bicep-curl', 0.32)).toBe('easter/biceps.png');
    expect(easterEggFor('bicep-curl', 0.34)).toBeNull();
    expect(easterEggFor('hammer-curl', 0.1)).toBeNull();
    expect(easterEggFor('bench-press', 0.1)).toBeNull();
  });
});
