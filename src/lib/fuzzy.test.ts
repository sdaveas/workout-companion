import { describe, expect, it } from 'vitest';
import { fuzzyScore } from './fuzzy';

describe('fuzzyScore', () => {
  it('matches an empty query against everything', () => {
    expect(fuzzyScore('', 'Bench Press')).toBe(0);
  });

  it('finds abbreviations and misspellings as long as the letters are in order', () => {
    expect(fuzzyScore('bnchprs', 'Bench Press')).not.toBeNull();
    expect(fuzzyScore('gob sq', 'Goblet Squat')).not.toBeNull();
    expect(fuzzyScore('sq', 'Squat')).not.toBeNull();
  });

  it('rejects letters that are missing or out of order', () => {
    expect(fuzzyScore('xyz', 'Bench Press')).toBeNull();
    expect(fuzzyScore('sserp', 'Bench Press')).toBeNull();
  });

  it('ranks a real substring above a scattered match', () => {
    const direct = fuzzyScore('press', 'Bench Press')!;
    const scattered = fuzzyScore('press', 'Pause Rep External Shoulder Stretch')!;
    expect(direct).toBeGreaterThan(scattered);
  });

  it('prefers the match that starts earlier', () => {
    expect(fuzzyScore('row', 'Row')!).toBeGreaterThan(fuzzyScore('row', 'Bent Over Row')!);
  });
});
