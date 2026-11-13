import { afterEach, describe, expect, it, vi } from 'vitest';
import { shorten } from './shorten';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('short share links', () => {
  it('is off until a worker is configured', async () => {
    // SHORTENER is empty in the shipped build, so nothing is even attempted.
    expect(await shorten('https://example.com/#/add/x')).toBeNull();
  });
});
