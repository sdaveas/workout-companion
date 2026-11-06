import type { WorkoutState } from './types';

/** Rest remaining in ms. Derived from timestamps — never stored as a countdown. */
export function remainingMs(s: WorkoutState, now: number): number {
  if (s.status === 'paused' && s.pausedFrom === 'resting') return s.restPausedMs ?? 0;
  if (s.status !== 'resting' || s.restStartedAt == null) return 0;
  return Math.max(0, s.restStartedAt + s.restDurationMs - now);
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
