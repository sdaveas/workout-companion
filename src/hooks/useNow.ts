import { useEffect, useState } from 'react';

/** A repaint tick. Drives display only — never state. */
export function useNow(intervalMs: number, active = true): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    setNow(Date.now());
    return () => clearInterval(id);
  }, [intervalMs, active]);

  return now;
}
