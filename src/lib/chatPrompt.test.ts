import { describe, expect, it } from 'vitest';
import { describeError, parseProgram } from '../schemas/program';
import { EXERCISE_LIBRARY } from '../data/exercises';
import { chatPrompt, extractJson } from './chatPrompt';

describe('the prompt handed to a chat model', () => {
  const prompt = chatPrompt();
  const namesBlock = prompt.slice(prompt.indexOf('Exercise names this app knows'));
  const shape = prompt.slice(prompt.indexOf('Shape\n') + 6, prompt.indexOf('Exercise names this app knows'));

  it('carries an example the importer accepts', () => {
    const parsed = parseProgram(extractJson(shape) ?? '');
    if (!parsed.ok) {
      throw new Error(describeError(parsed.error).map((i) => `${i.path}: ${i.message}`).join('; '));
    }
    expect(parsed.program.exercises.length).toBeGreaterThan(1);
    expect(parsed.program.scheduleDays).toEqual(['monday', 'thursday']);
  });

  it('lists every exercise name the app knows, so the model can pick one', () => {
    const names = namesBlock.trim().split('\n').slice(1).join(' ').split(', ');
    expect(names).toHaveLength(EXERCISE_LIBRARY.length);
    expect(names).toContain('Bench Press');
    expect(names).toContain('Goblet Squat');
  });
});

describe('extractJson', () => {
  it('takes the object out of a fence', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('ignores chatter around the object', () => {
    expect(extractJson('Here you go:\n{"a":1}\nEnjoy!')).toBe('{"a":1}');
  });

  it('gives up when there is no object', () => {
    expect(extractJson('sorry, I cannot help with that')).toBeNull();
    expect(extractJson('')).toBeNull();
  });
});
