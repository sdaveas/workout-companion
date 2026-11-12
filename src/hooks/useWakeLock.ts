import { useEffect, useState } from 'react';

type Sentinel = {
  release: () => Promise<void>;
  addEventListener: (t: 'release', fn: () => void) => void;
} | null;

/** What the platform actually did, not what the user asked for. */
export type WakeState = 'unsupported' | 'off' | 'on' | 'blocked';

/**
 * Screen Wake Lock, re-acquired when the page becomes visible again.
 *
 * Returns the real state: iOS before 18.4 has the API and refuses the request in a
 * home screen web app, and a phone in Low Power Mode does the same, so a switch that
 * only echoed the preference would lie.
 */
export function useWakeLock(active: boolean): WakeState {
  const [state, setState] = useState<WakeState>(() =>
    typeof navigator !== 'undefined' && 'wakeLock' in navigator ? 'off' : 'unsupported',
  );

  useEffect(() => {
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<Sentinel> };
    };
    if (!nav.wakeLock) return;
    if (!active) {
      setState('off');
      return;
    }

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
          setState('off');
        });
        setState('on');
      } catch {
        sentinel = null;
        setState('blocked');
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
      sentinel = null;
    };
  }, [active]);

  return state;
}
