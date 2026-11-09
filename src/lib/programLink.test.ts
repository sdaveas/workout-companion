import { describe, expect, it } from 'vitest';
import { APP_URL, decodeLinkPayload } from './programLink';

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

  it('points at the deployed app', () => {
    expect(APP_URL).toBe('https://sdaveas.github.io/workout-companion/');
    expect(new URL(`${APP_URL}#/p/x`).hash).toBe('#/p/x');
  });
});
