import type { WorkoutState } from './types';

/** Rest remaining in ms. Derived from timestamps — never stored as a countdown. */
export function remainingMs(s: WorkoutState, now: number): number {
  if (s.status === 'paused' && (s.pausedFrom === 'resting' || s.pausedFrom === 'exercise_complete'))
    return s.restPausedMs ?? 0;
  // exercise_complete carries the break between two exercises.
  const resting = s.status === 'resting' || s.status === 'exercise_complete';
  if (!resting || s.restStartedAt == null) return 0;
  // Clamped to the duration: the display can read the clock a tick behind the dispatch,
  // which would otherwise show 02:01 for a two minute rest.
  return Math.max(0, Math.min(s.restStartedAt + s.restDurationMs - now, s.restDurationMs));
}

export function remainingSeconds(s: WorkoutState, now: number): number {
  return Math.ceil(remainingMs(s, now) / 1000);
}

/**
 * Rebase the rest onto `now` with an added/removed delta, keeping the invariant
 * `endsAt = restStartedAt + restDurationMs`.
 */
export function rebaseRest(
  s: WorkoutState,
  now: number,
  deltaSeconds: number,
): Pick<WorkoutState, 'restStartedAt' | 'restDurationMs'> {
  const endsAt = Math.max(now, (s.restStartedAt ?? now) + s.restDurationMs);
  const target = Math.min(Math.max(endsAt + deltaSeconds * 1000, now), now + 600_000);
  return { restStartedAt: now, restDurationMs: target - now };
}

export function restartRest(
  s: WorkoutState,
  now: number,
  prescribedSeconds: number,
): Pick<WorkoutState, 'restStartedAt' | 'restDurationMs' | 'restCount'> {
  return {
    restStartedAt: now,
    restDurationMs: prescribedSeconds * 1000,
    restCount: s.restCount + 1,
  };
}
