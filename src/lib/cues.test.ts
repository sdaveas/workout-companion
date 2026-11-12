// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class FakeAudioContext {
  state = 'running';
  currentTime = 0;
  destination = {};
  oscillators: number[] = [];
  resumed = 0;
  createOscillator() {
    this.oscillators.push(1);
    return {
      type: '',
      frequency: { value: 0 },
      connect: (node: unknown) => node,
      start: () => undefined,
      stop: () => undefined,
    };
  }
  createGain() {
    return {
      gain: { setValueAtTime: () => undefined, exponentialRampToValueAtTime: () => undefined },
      connect: (node: unknown) => node,
    };
  }
  resume() {
    this.resumed++;
    return Promise.resolve();
  }
}

let vibrate: ReturnType<typeof vi.fn>;
let ctx: FakeAudioContext;

beforeEach(() => {
  localStorage.clear();
  vibrate = vi.fn();
  Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
  ctx = new FakeAudioContext();
  vi.stubGlobal('AudioContext', function () {
    return ctx;
  });
  vi.resetModules();
});

afterEach(() => {
  Reflect.deleteProperty(navigator, 'vibrate');
  vi.unstubAllGlobals();
});

const load = async () => (await import('./cues')).cue;

describe('cue', () => {
  it('confirms a logged set with one short buzz and one blip', async () => {
    const cue = await load();
    cue('set');
    expect(vibrate).toHaveBeenCalledWith(120);
    expect(ctx.oscillators.length).toBe(1);
  });

  it('plays a forced cue even with both switches off', async () => {
    const cue = await load();
    localStorage.setItem('wc:sound', '0');
    localStorage.setItem('wc:vibrate', '0');
    cue('set', true);
    expect(ctx.oscillators.length).toBe(1);
    expect(vibrate).toHaveBeenCalledWith(120);
  });

  it('revives a suspended context on later taps, not only the first', async () => {
    await load();
    ctx.state = 'suspended';
    window.dispatchEvent(new Event('pointerdown'));
    expect(ctx.resumed).toBe(1);
    window.dispatchEvent(new Event('pointerdown'));
    expect(ctx.resumed).toBe(2);
  });

  it('counts down: two notes at ten, one per second at three, two and one', async () => {
    const cue = await load();
    cue('ten');
    expect(ctx.oscillators.length).toBe(2);
    cue('tick');
    cue('tick');
    cue('tick');
    expect(ctx.oscillators.length).toBe(5);
    expect(vibrate).toHaveBeenLastCalledWith(60);
  });

  it('marks the end with the two-note pattern', async () => {
    const cue = await load();
    cue('end');
    expect(vibrate).toHaveBeenCalledWith([200, 100, 200]);
    expect(ctx.oscillators.length).toBe(2);
  });

  it('honours each switch on its own', async () => {
    localStorage.setItem('wc:vibrate', '0');
    const cue = await load();

    cue('set');
    expect(vibrate).not.toHaveBeenCalled();
    expect(ctx.oscillators.length).toBe(1);

    localStorage.setItem('wc:sound', '0');
    cue('set');
    expect(ctx.oscillators.length).toBe(1);
  });
});
