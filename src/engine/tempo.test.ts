import { describe, expect, it } from 'vitest';
import { secondsPerRep, setBudgetSeconds } from './tempo';

const budget = (name: string, reps = 10) => setBudgetSeconds({ name, reps: { min: reps, max: reps } });

describe('seconds per rep', () => {
  it('orders patterns by movement length', () => {
    expect(secondsPerRep('Biceps Curl')).toBe(2.5);
    expect(secondsPerRep('Lateral Raise')).toBe(2.5);
    expect(secondsPerRep('Bench Press')).toBe(3);
    expect(secondsPerRep('Barbell Row')).toBe(3);
    expect(secondsPerRep('Goblet Squat')).toBe(4);
    expect(secondsPerRep('Romanian Deadlift')).toBe(4.5);
    expect(secondsPerRep('Goblet Squat')).toBeLessThan(secondsPerRep('Deadlift'));
  });

  it('checks the romanian override before the deadlift one', () => {
    expect(secondsPerRep('Romanian Deadlift')).toBe(4.5);
    expect(secondsPerRep('RDL')).toBe(4.5);
    expect(secondsPerRep('Deadlift')).toBe(5);
  });

  it('treats holds as seconds and leaves dynamic plank work alone', () => {
    expect(secondsPerRep('Plank')).toBe(1);
    expect(secondsPerRep('Side Plank')).toBe(1);
    expect(secondsPerRep('Hollow Body Hold')).toBe(1);
    expect(secondsPerRep('L-Sit Hold')).toBe(1);
    expect(secondsPerRep('Dead Hang')).toBe(1);
    expect(secondsPerRep("Farmer's Carry")).toBe(1);
    expect(secondsPerRep('Plank Jack')).toBe(3);
    expect(secondsPerRep('Side Plank Hip Dip')).toBe(3);
    expect(secondsPerRep('Hanging Leg Raise')).toBe(3);
    expect(secondsPerRep('Hang Clean')).not.toBe(1);
  });

  it('budgets a hold as its rep count in seconds', () => {
    expect(budget('Plank', 45)).toBe(45);
  });

  it('falls back to 3 s and never goes below 5 s', () => {
    expect(secondsPerRep('Mystery Movement')).toBe(3);
    expect(budget('Biceps Curl', 1)).toBe(5);
  });
});
