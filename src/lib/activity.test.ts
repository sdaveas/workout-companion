import { describe, expect, it } from 'vitest';
import { activityGrid } from './activity';

/** Local noon, so a DST shift can never move the date. */
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();
const midnight = (y: number, m: number, d: number) => new Date(y, m - 1, d).getTime();

describe('activityGrid', () => {
  it('counts sessions per day and starts on a Monday', () => {
    const now = at(2026, 11, 11); // a Wednesday
    const grid = activityGrid(
      [
        { finishedAt: at(2026, 11, 11, 7) },
        { finishedAt: at(2026, 11, 11, 19) },
        { finishedAt: at(2026, 11, 9) },
      ],
      now,
      4,
    );

    expect(grid).toHaveLength(4);
    expect(grid.every((column) => column.length === 7)).toBe(true);

    const counts = new Map(grid.flat().map((c) => [c.day, c.count]));
    expect(counts.get(midnight(2026, 11, 11))).toBe(2);
    expect(counts.get(midnight(2026, 11, 9))).toBe(1);
    expect(counts.get(midnight(2026, 11, 10))).toBe(0);

    expect(new Date(grid[0][0].day).getDay()).toBe(1);
    expect(grid.flat()).toHaveLength(28);
  });

  it('ignores a session that has not finished', () => {
    const grid = activityGrid([{ finishedAt: null }], at(2026, 11, 11), 2);
    expect(grid.flat().every((c) => c.count === 0)).toBe(true);
  });
});
