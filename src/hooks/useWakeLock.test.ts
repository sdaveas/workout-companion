// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWakeLock } from './useWakeLock';

type Fake = { release: () => Promise<void>; fireRelease: () => void };

function fakeWakeLock() {
  const sentinels: Fake[] = [];
  const request = vi.fn(async () => {
    const listeners: Array<() => void> = [];
    const s: Fake = {
      release: vi.fn(async () => undefined),
      fireRelease: () => listeners.forEach((fn) => fn()),
    };
    Object.assign(s, { addEventListener: (_: 'release', fn: () => void) => listeners.push(fn) });
    sentinels.push(s);
    return s;
  });
  Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
  return { request, sentinels };
}

describe('useWakeLock', () => {
  beforeEach(() => {
    vi.stubGlobal('document', document);
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });

  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(navigator, 'wakeLock');
    vi.restoreAllMocks();
  });

  it('requests a lock while active and releases it on unmount', async () => {
    const { request, sentinels } = fakeWakeLock();
    const { unmount } = renderHook(() => useWakeLock(true));
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    unmount();
    expect(sentinels[0].release).toHaveBeenCalled();
  });

  it('does nothing when inactive', async () => {
    const { request } = fakeWakeLock();
    renderHook(() => useWakeLock(false));
    await Promise.resolve();
    expect(request).not.toHaveBeenCalled();
  });

  it('reports the real state: blocked when the platform refuses', async () => {
    Object.defineProperty(navigator, 'wakeLock', {
      value: { request: async () => Promise.reject(new Error('denied')) },
      configurable: true,
    });
    const { result } = renderHook(() => useWakeLock(true));
    await vi.waitFor(() => expect(result.current).toBe('blocked'));
    Reflect.deleteProperty(navigator, 'wakeLock');
  });

  it('re-acquires after the browser releases the lock and the page is visible again', async () => {
    const { request, sentinels } = fakeWakeLock();
    renderHook(() => useWakeLock(true));
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));

    sentinels[0].fireRelease();
    document.dispatchEvent(new Event('visibilitychange'));

    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  });
});
