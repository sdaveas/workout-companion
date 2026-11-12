import { useCallback, useState } from 'react';

const KEY = 'wc:keepAwake';

/** Screen-awake preference: on unless the user turned it off. Persisted, so every
    session inherits the last choice. */
export function useKeepAwake(): [boolean, () => void] {
  const [on, setOn] = useState(() => localStorage.getItem(KEY) !== '0');

  const toggle = useCallback(() => {
    setOn((prev) => {
      const next = !prev;
      localStorage.setItem(KEY, next ? '1' : '0');
      return next;
    });
  }, []);

  return [on, toggle];
}

/** Feature-detect once: an iPhone on iOS 17 has the API and ignores it, and there is
    no way to tell, but a browser without it should not show a dead button. Desktop is
    left out too — a plugged-in laptop has no screen to save. */
export const canKeepAwake = () =>
  typeof navigator !== 'undefined' &&
  'wakeLock' in navigator &&
  window.matchMedia('(pointer: coarse)').matches;
