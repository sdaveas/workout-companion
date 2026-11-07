export function formatClock(ms: number): string {
  const total = Math.floor(Math.max(0, ms) / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function formatDuration(ms: number): string {
  const minutes = Math.round(Math.max(0, ms) / 60_000);
  return minutes < 1 ? '<1 min' : `${minutes} min`;
}

export function formatDate(ts: number | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

/** "2 / 6" normally, "2 / 3 · right hand" for a unilateral movement. */
export function formatSet(side: 'left' | 'right' | null | undefined, setNumber: number, totalSets: number): string {
  if (!side) return `${setNumber} / ${totalSets}`;
  const group = Math.ceil(setNumber / 2);
  const groups = Math.ceil(totalSets / 2);
  return `${group} / ${groups} · ${side} hand`;
}

export function formatWeight(kg: number | null, perHand = false): string {
  if (kg == null) return 'Bodyweight';
  return `${kg} kg${perHand ? ' / hand' : ''}`;
}

/** Programs store weekdays lowercase (they come from JSON); the UI shows them capitalized. */
export function formatDay(day: string | null): string {
  if (!day) return 'unscheduled';
  return day[0].toUpperCase() + day.slice(1);
}
