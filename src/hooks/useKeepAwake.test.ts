// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useKeepAwake } from './useKeepAwake';

afterEach(() => localStorage.clear());

describe('useKeepAwake', () => {
  it('is on by default and stays on across mounts', () => {
    const { result, unmount } = renderHook(() => useKeepAwake());
    expect(result.current[0]).toBe(true);
    unmount();

    const again = renderHook(() => useKeepAwake());
    expect(again.result.current[0]).toBe(true);
  });

  it('remembers being turned off', () => {
    const { result, unmount } = renderHook(() => useKeepAwake());
    act(() => result.current[1]());
    expect(result.current[0]).toBe(false);
    expect(localStorage.getItem('wc:keepAwake')).toBe('0');
    unmount();

    const again = renderHook(() => useKeepAwake());
    expect(again.result.current[0]).toBe(false);
  });
});
