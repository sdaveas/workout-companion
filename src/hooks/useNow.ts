import { useEffect, useState } from 'react';

/** A repaint tick. Drives display only — never state. */
export function useNow(intervalMs: number, active = true): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    setNow(Date.now());
    // Back from a locked screen: repaint immediately instead of waiting for the tick.
    const onVisible = () => {
      if (document.visibilityState === 'visible') setNow(Date.now());
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [intervalMs, active]);

  return now;
}
