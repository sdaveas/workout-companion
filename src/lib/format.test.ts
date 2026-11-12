import { describe, expect, it } from 'vitest';
import { formatAgo } from './format';

const at = 1_700_000_000_000;
const ago = (ms: number) => formatAgo(at - ms, at);

describe('formatAgo', () => {
  it('says just now under a minute', () => {
    expect(ago(0)).toBe('just now');
    expect(ago(30_000)).toBe('just now');
  });

  it('counts minutes, hours and days', () => {
    expect(ago(3 * 60_000)).toBe('3 min ago');
    expect(ago(2 * 3_600_000)).toBe('2 h ago');
    expect(ago(26 * 3_600_000)).toBe('yesterday');
    expect(ago(3 * 86_400_000)).toBe('3 days ago');
  });

  it('never goes negative when the clocks disagree', () => {
    expect(formatAgo(at + 60_000, at)).toBe('just now');
  });
});
