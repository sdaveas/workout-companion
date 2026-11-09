import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { describeError, parseProgram } from '../schemas/program';
import { EXERCISE_LIBRARY } from '../data/exercises';
import { ownFigure } from '../data/exerciseFigures';
import { COACH_FILE, COACH_URL, chatPrompt, chatUrl, extractJsonBlocks } from './chatPrompt';

/**
 * The instructions are a file in the repo, not a string in the app: a chat assistant
 * fetches them, so they must stay true on their own. These tests read the file itself.
 */
const coach = readFileSync(new URL('../../public/coach.md', import.meta.url), 'utf8');

describe('the prompt handed to a chat model', () => {
  const prompt = chatPrompt();

  it('is short, and points at instructions a chat assistant can actually read', () => {
    expect(prompt).toContain(COACH_URL);
    // A chat assistant will not read a bare markdown response, so the prompt goes to
    // the rendered file; the app's own copy stays available for fetching.
    expect(COACH_URL).toContain('github.com');
    expect(COACH_FILE.endsWith('/coach.md')).toBe(true);
    expect(prompt.length).toBeLessThan(600);
    expect(decodeURIComponent(chatUrl().split('?q=')[1])).toBe(prompt);
    expect(chatUrl().length).toBeLessThan(1500);
  });

  it('asks for the one thing the answer must say', () => {
    expect(prompt).toMatch(/Interview complete/);
    expect(prompt).toMatch(/one json block per training day/);
  });
});

describe('the coach file', () => {
  it('carries an example the importer accepts', () => {
    const blocks = extractJsonBlocks(coach);
    expect(blocks).toHaveLength(1);
    const parsed = parseProgram(blocks[0]);
    if (!parsed.ok) {
      throw new Error(describeError(parsed.error).map((i) => `${i.path}: ${i.message}`).join('; '));
    }
    expect(parsed.program.scheduleDays).toEqual(['monday', 'thursday']);
    expect(parsed.program.exercises.length).toBe(2);
    expect(parsed.program.exercises[1].perHand).toBe(true);
  });

  it('says how a program gets back into the app', () => {
    expect(coach).toContain('#/p/');
    expect(coach).toContain('Paste a program');
    expect(coach).toContain('Interview complete');
  });

  it('names the exercises that have a drawing, and only those', () => {
    const list = coach.slice(coach.indexOf('Exercise names with drawings'));
    for (const exercise of EXERCISE_LIBRARY.filter((e) => ownFigure(e.name))) {
      expect(list).toContain(exercise.name);
    }
    // "Leg Curl" has no art, so naming it would send the model off-list.
    expect(list).not.toContain('Leg Curl');
  });
});

describe('extractJsonBlocks', () => {
  const programJson = (id: string) =>
    JSON.stringify({
      schema_version: 1,
      id,
      name: id,
      exercises: [{ id: 'squat', name: 'Squat', sets: 3, reps: { min: 5, max: 5 }, rest_seconds: 90 }],
    });

  it('finds each program in a multi-day answer', () => {
    const answer = `Interview complete\n\n\`\`\`json\n${programJson('day-a')}\n\`\`\`\n\n\`\`\`json\n${programJson('day-b')}\n\`\`\`\n\nOpen the app.`;
    const blocks = extractJsonBlocks(answer);
    expect(blocks).toHaveLength(2);
    expect(JSON.parse(blocks[1]).id).toBe('day-b');
  });

  it('keeps a half-written program so the importer can say what is missing', () => {
    const blocks = extractJsonBlocks('```json\n{"schema_version":1,"id":"x","name":"X"}\n```');
    expect(blocks).toHaveLength(1);
    expect(parseProgram(blocks[0]).ok).toBe(false);
  });

  it('survives prose, braces in strings and objects that are not programs', () => {
    const answer = `Here you go: {"a":1} and {"note":"use {curly} braces"}\n${programJson('day-a')}\nEnjoy!`;
    const blocks = extractJsonBlocks(answer);
    expect(blocks).toHaveLength(1);
    expect(JSON.parse(blocks[0]).id).toBe('day-a');
  });

  it('gives up when there is no program', () => {
    expect(extractJsonBlocks('sorry, I cannot help with that')).toEqual([]);
    expect(extractJsonBlocks('')).toEqual([]);
  });
});
