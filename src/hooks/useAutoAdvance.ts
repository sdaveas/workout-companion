import { useEffect, useRef } from 'react';
import { dueAction } from '../engine/auto';
import type { WorkoutState } from '../engine/types';
import { useSession } from '../store/sessionStore';

/** A break longer than this means the phone went away, not that the set took long. */
const HIDDEN_GAP_MS = 120_000;

const RUNNING: WorkoutState['status'][] = ['exercise_active', 'resting', 'exercise_complete'];

/**
 * Drives auto mode: one dispatch per tick, never a loop, never a clock read (the
 * `now` passed in comes from `useNow`; the store stamps the event).
 *
 * Deliberately idle while the document is hidden and it does not move its last-tick
 * mark, so the first visible tick measures the whole absence. A long absence must
 * not silently finish sets nobody performed.
 */
export function useAutoAdvance(state: WorkoutState | null, now: number): void {
  const dispatch = useSession((s) => s.dispatch);
  const lastTick = useRef<number | null>(null);
  const lastNow = useRef<number | null>(null);

  useEffect(() => {
    if (!state) return;
    if (state.mode !== 'auto' || !RUNNING.includes(state.status)) {
      lastTick.current = null;
      return;
    }
    if (document.visibilityState !== 'visible') return;
    if (lastNow.current === now) return;
    lastNow.current = now;

    if (lastTick.current == null) {
      lastTick.current = now;
      return;
    }

    const gap = now - lastTick.current;
    lastTick.current = now;
    if (gap > HIDDEN_GAP_MS) {
      // A set can't be "resumed" — its clock is already spent. A break can.
      dispatch(
        state.status === 'exercise_active' ? { type: 'STOP_AUTO' } : { type: 'PAUSE' },
      );
      return;
    }

    const action = dueAction(state, now);
    if (action) dispatch(action);
  }, [state, now, dispatch]);
}
