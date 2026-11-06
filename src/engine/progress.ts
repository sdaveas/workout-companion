import type { WorkoutState } from './types';

export interface ProgramProgress {
  sessionsCount: number;
  totalReps: number;
  volumeKg: number;
  highestWeightKg: number | null;
  bestRepsAtWeight: Array<{ weightKg: number; reps: number }>;
  avgDurationMs: number;
  completionRate: number;
  lastSessionAt: number | null;
}

export function programProgress(states: WorkoutState[], programId: string): ProgramProgress {
  const done = states.filter((s) => s.programId === programId && s.status === 'completed');
  const sets = done.flatMap((s) => s.exerciseRecords.flatMap((r) => r.sets));
  const completed = sets.filter((x) => x.completed);

  const best = new Map<number, number>();
  for (const x of completed) {
    if (x.actualWeightKg == null) continue;
    const prev = best.get(x.actualWeightKg) ?? 0;
    best.set(x.actualWeightKg, Math.max(prev, x.actualReps ?? 0));
  }

  const durations = done.map((s) => (s.finishedAt ?? 0) - (s.startedAt ?? 0) - s.totalPausedMs);
  const prescribed = sets.length;

  return {
    sessionsCount: done.length,
    totalReps: completed.reduce((n, x) => n + (x.actualReps ?? 0), 0),
    volumeKg: completed.reduce((n, x) => n + (x.actualWeightKg ?? 0) * (x.actualReps ?? 0), 0),
    highestWeightKg: completed.reduce<number | null>(
      (max, x) => (x.actualWeightKg == null ? max : Math.max(max ?? 0, x.actualWeightKg)),
      null,
    ),
    bestRepsAtWeight: [...best.entries()]
      .map(([weightKg, reps]) => ({ weightKg, reps }))
      .sort((a, b) => a.weightKg - b.weightKg),
    avgDurationMs: durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0,
    completionRate: prescribed === 0 ? 0 : completed.length / prescribed,
    lastSessionAt: done.reduce<number | null>(
      (last, s) => Math.max(last ?? 0, s.finishedAt ?? 0) || null,
      null,
    ),
  };
}
