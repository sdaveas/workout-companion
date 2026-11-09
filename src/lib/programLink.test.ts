import { describe, expect, it } from 'vitest';
import { APP_URL, decodeLinkPayload } from './programLink';
import { parseProgram } from '../schemas/program';

/** The exact link a chat client produced, tracking parameters and all. */
const REAL_LINK =
  'https://sdaveas.github.io/workout-companion/?utm_source=chatgpt.com#/p/%7B%22schema_version%22%3A1%2C%22id%22%3A%22workout-a%22%2C%22name%22%3A%22Workout%20A%20-%20Upper%20Body%20%26%20Posterior%20Chain%22%2C%22description%22%3A%22Monday%20strength%20session%22%2C%22schedule%22%3A%7B%22day%22%3A%22monday%22%7D%2C%22exercises%22%3A%5B%7B%22id%22%3A%22pull-ups%22%2C%22name%22%3A%22Pull-up%22%2C%22sets%22%3A3%2C%22reps%22%3A%7B%22min%22%3A3%2C%22max%22%3A5%7D%2C%22rest_seconds%22%3A120%7D%2C%7B%22id%22%3A%22plank%22%2C%22name%22%3A%22Plank%22%2C%22sets%22%3A3%2C%22reps%22%3A%7B%22min%22%3A30%2C%22max%22%3A30%7D%2C%22rest_seconds%22%3A60%7D%5D%7D';

describe('a program carried in a link', () => {
  it('survives the encoding a chat client adds', () => {
    const json = '{"schema_version":1,"name":"Upper A"}';
    expect(decodeLinkPayload(encodeURIComponent(json))).toBe(json);
  });

  it('keeps raw json as it is', () => {
    const json = '{"schema_version":1,"name":"Upper A"}';
    expect(decodeLinkPayload(json)).toBe(json);
  });

  it('does not choke on a bare percent sign', () => {
    expect(decodeLinkPayload('{"note":"50% of 1RM"}')).toBe('{"note":"50% of 1RM"}');
  });

  it('survives a real chat-generated link, tracking parameters and all', () => {
    const payload = REAL_LINK.slice(REAL_LINK.indexOf('#/p/') + 4);
    const parsed = parseProgram(decodeLinkPayload(payload));
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.error));
    expect(parsed.program.name).toBe('Workout A - Upper Body & Posterior Chain');
    expect(parsed.program.scheduleDays).toEqual(['monday']);
    expect(parsed.program.exercises).toHaveLength(2);
    expect(parsed.program.exercises[1].restSeconds).toBe(60);
  });

  it('points at the deployed app', () => {
    expect(APP_URL).toBe('https://sdaveas.github.io/workout-companion/');
    expect(new URL(`${APP_URL}#/p/x`).hash).toBe('#/p/x');
  });
});
