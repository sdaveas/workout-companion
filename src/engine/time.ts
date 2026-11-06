import type { WorkoutState } from './types';

export function elapsedMs(s: WorkoutState, now: number): number {
  if (s.startedAt == null) return 0;
  const paused = s.totalPausedMs + (s.pausedAt != null ? now - s.pausedAt : 0);
  return Math.max(0, (s.finishedAt ?? now) - s.startedAt - paused);
}
