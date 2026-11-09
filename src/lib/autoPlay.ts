import type { WorkoutState } from '../engine/types';
import { remainingMs } from '../engine/rest';
import { getNextExercise } from '../engine/selectors';

/**
 * The only button auto-play is allowed to press: the affirmative "next" action once a
 * rest runs out. Never "Complete set" — logging the lift stays the user's job — and
 * never the last Continue, because finishing a workout stays a deliberate act.
 *
 * Returns the action to dispatch, or null when the user should press something.
 */
export function autoStep(
  state: WorkoutState | null,
  now: number,
  auto: boolean,
): 'REST_DONE' | 'NEXT_EXERCISE' | null {
  if (!auto || !state) return null;
  if (state.status === 'resting') return remainingMs(state, now) === 0 ? 'REST_DONE' : null;
  if (state.status === 'exercise_complete') {
    const lastOne = getNextExercise(state) == null;
    return remainingMs(state, now) === 0 && !lastOne ? 'NEXT_EXERCISE' : null;
  }
  return null;
}
