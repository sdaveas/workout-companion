import { describe, expect, it } from 'vitest';
import { parseHash } from './useHashRoute';

describe('hash routes', () => {
  it('reads a screen name and one param', () => {
    expect(parseHash('#/program/workout-a')).toEqual({ name: 'program', param: 'workout-a', rest: [] });
    expect(parseHash('#/programs/build')).toEqual({ name: 'programs', param: 'build', rest: [] });
    expect(parseHash('')).toEqual({ name: 'home', param: null, rest: [] });
  });

  it('keeps what follows the param, so an edit target survives a reload', () => {
    expect(parseHash('#/programs/build/workout-a')).toEqual({
      name: 'programs',
      param: 'build',
      rest: ['workout-a'],
    });
  });

  it('keeps a pasted program whole, slashes and all', () => {
    const json = '{"name":"Day","exercises":[]}';
    expect(parseHash(`#/p/${json}`)).toEqual({ name: 'p', param: json, rest: [] });
  });
});
