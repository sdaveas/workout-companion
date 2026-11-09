import { describe, expect, it } from 'vitest';
import { describeError, parseProgram } from '../schemas/program';
import { EXERCISE_LIBRARY } from '../data/exercises';
import { chatPrompt, chatUrl, extractJsonBlocks } from './chatPrompt';

describe('the prompt handed to a chat model', () => {
  const prompt = chatPrompt();

  it('turns the model into an interviewer that hands back programs', () => {
    expect(prompt).toMatch(/Interview complete/);
    expect(prompt).toMatch(/one json code block per training day/);
    expect(prompt).toMatch(/Paste a program/);
    expect(prompt).toContain('https://sdaveas.github.io/workout-companion/#/p/');
  });

  it('carries an example the importer accepts', () => {
    const blocks = extractJsonBlocks(prompt);
    expect(blocks).toHaveLength(1);
    const parsed = parseProgram(blocks[0]);
    if (!parsed.ok) {
      throw new Error(describeError(parsed.error).map((i) => `${i.path}: ${i.message}`).join('; '));
    }
    expect(parsed.program.scheduleDays).toEqual(['monday', 'thursday']);
    expect(parsed.program.exercises.length).toBe(2);
    expect(parsed.program.exercises[1].perHand).toBe(true);
  });

  it('names the exercises that have a drawing, and only those', () => {
    const list = prompt.slice(prompt.indexOf('EXERCISE NAMES WITH DRAWINGS'));
    expect(list).toContain('Bench Press');
    expect(list).toContain('Goblet Squat');
    // "Leg Curl" has no art, so naming it would send the model off-list.
    expect(list).not.toContain('Leg Curl');
    expect(EXERCISE_LIBRARY.some((e) => e.name === 'Goblet Squat')).toBe(true);
  });

  it('fits in a link, so one tap can open the interview', () => {
    const url = chatUrl();
    expect(url.startsWith('https://chatgpt.com/?q=')).toBe(true);
    expect(decodeURIComponent(url.split('?q=')[1])).toBe(prompt);
    expect(url.length).toBeLessThan(6000);
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
