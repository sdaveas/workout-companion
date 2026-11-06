export function prefetchImages(program: { exercises: Array<{ imageUrl: string | null }> }): void {
  if (!('serviceWorker' in navigator)) return;
  for (const exercise of program.exercises) {
    if (!exercise.imageUrl) continue;
    // Best effort: the service worker caches it; a failure just means the placeholder shows.
    void fetch(exercise.imageUrl, { mode: 'cors', credentials: 'omit' }).catch(() => undefined);
  }
}
