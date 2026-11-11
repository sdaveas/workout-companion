import { describe, expect, it } from 'vitest';
import type { Program } from '../engine/types';
import { stashProgram, stashedProgram } from './briefSnapshot';

/** The two methods the snapshot uses, so a test needs no browser. */
function memory(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
    key: (i) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  } as Storage;
}

const program: Program = {
  id: 'upper-a',
  name: 'Upper A',
  description: null,
  scheduleDays: [],
  estimatedDurationMinutes: null,
  raw: '{"schema_version":1,"id":"upper-a","name":"Upper A","exercises":[{"id":"bench","name":"Bench Press","sets":3,"reps":{"min":6,"max":10},"rest_seconds":120}]}',
  exercises: [],
};

describe('brief snapshot', () => {
  it('gives back the program that was sent', () => {
    const store = memory();
    stashProgram(store, program);
    const back = stashedProgram(store, 'upper-a');
    expect(back?.name).toBe('Upper A');
    expect(back?.exercises[0].name).toBe('Bench Press');
  });

  it('stays out of the way when nothing was sent for that program', () => {
    const store = memory();
    stashProgram(store, program);
    expect(stashedProgram(store, 'lower-a')).toBeNull();
    expect(stashedProgram(memory(), 'upper-a')).toBeNull();
  });

  it('survives junk in storage', () => {
    const store = memory();
    store.setItem('coach:brief', 'not json');
    expect(stashedProgram(store, 'upper-a')).toBeNull();
    store.setItem('coach:brief', JSON.stringify({ id: 'upper-a', raw: '{"nope":1}' }));
    expect(stashedProgram(store, 'upper-a')).toBeNull();
  });
});
