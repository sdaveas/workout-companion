import { useEffect, useRef } from 'react';
import { useSession } from '../../store/sessionStore';
import { remainingMs, remainingSeconds } from '../../engine/rest';
import { getNextSet } from '../../engine/selectors';
import { formatClock, formatSet } from '../../lib/format';
import type { WorkoutState } from '../../engine/types';
import { Button } from '../ui/Button';

export function RestTimer({
  state,
  now,
  variant = 'set',
}: {
  state: WorkoutState;
  now: number;
  /** 'exercise' is the break between two exercises: no Pause, the footer moves on. */
  variant?: 'set' | 'exercise';
}) {
  const between = variant === 'exercise';
  const dispatch = useSession((s) => s.dispatch);
  const alerted = useRef<number | null>(null);
  const remaining = remainingMs(state, now);
  const next = getNextSet(state);

  useEffect(() => {
    if (remaining > 0 || alerted.current === state.restCount) return;
    alerted.current = state.restCount;
    navigator.vibrate?.([200, 100, 200]);
  }, [remaining, state.restCount]);

  return (
    <div className="flex flex-col items-center pt-6 text-center">
      <p className="text-xs uppercase tracking-[0.2em] text-muted">
        {remaining > 0
          ? between
            ? 'Rest before the next exercise'
            : 'Rest remaining'
          : between
            ? 'Rest done'
            : 'Rest complete'}
      </p>

      <p
        className={`mt-4 font-semibold tabular-nums ${remaining > 0 ? 'text-7xl' : 'text-4xl'}`}
        role="status"
        aria-live={remaining > 0 ? 'off' : 'polite'}
      >
        {remaining > 0 ? formatClock(remaining) : between ? 'Continue when ready' : 'Start when ready'}
      </p>

      {next && !between && (
        <p className="mt-4 text-sm text-muted">
          Next: {next.exerciseName} · set {formatSet(next.side, next.setNumber, next.totalSets)}
        </p>
      )}

      {remaining > 0 ? (
        <>
          <div className={`mt-6 grid w-full gap-2 ${between ? 'grid-cols-2' : 'grid-cols-3'}`}>
            <Button onClick={() => dispatch({ type: 'ADJUST_REST', seconds: -15 })}>−15s</Button>
            {!between && <Button onClick={() => dispatch({ type: 'PAUSE' })}>Pause</Button>}
            <Button onClick={() => dispatch({ type: 'ADJUST_REST', seconds: 15 })}>+15s</Button>
          </div>
          <div className="mt-2 grid w-full grid-cols-2 gap-2">
            <Button
              variant="ghost"
              className="col-span-2"
              onClick={() => dispatch({ type: 'RESTART_REST' })}
            >
              Restart rest
            </Button>
          </div>
        </>
      ) : (
        <p className="mt-2 text-sm text-muted">
          Best set: start the next set when you are ready.
        </p>
      )}
      <p className="mt-6 text-xs text-muted">
        {remainingSeconds(state, now)}s left · rest never advances on its own
      </p>
    </div>
  );
}
