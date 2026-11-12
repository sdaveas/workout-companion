import { useEffect } from 'react';

type Sentinel = { release: () => Promise<void>; addEventListener: (t: 'release', fn: () => void) => void } | null;

/** Screen Wake Lock, re-acquired when the page becomes visible again. */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<Sentinel> };
    };
    if (!nav.wakeLock) return;

    let sentinel: Sentinel = null;
    let cancelled = false;

    const acquire = async () => {
      try {
        sentinel = await nav.wakeLock!.request('screen');
        if (cancelled) {
          void sentinel?.release().catch(() => undefined);
          sentinel = null;
          return;
        }
        // Browser releases the lock when the tab is hidden; drop the stale
        // sentinel so onVisible can re-acquire it.
        sentinel?.addEventListener('release', () => {
          sentinel = null;
        });
      } catch {
        sentinel = null;
      }
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible' && !sentinel && !cancelled) void acquire();
    };

    void acquire();
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel?.release().catch(() => undefined);
    };
  }, [active]);
}
