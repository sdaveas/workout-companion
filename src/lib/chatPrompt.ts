import { EXERCISE_LIBRARY } from '../data/exercises';

/**
 * The text to hand a chat model. It is written once, here, so the prompt the user
 * copies cannot drift away from what the importer accepts: a test parses the example
 * below through `parseProgram`, and that test fails the day the schema moves.
 */
const EXAMPLE = `{
  "schema_version": 1,
  "id": "upper-a",
  "name": "Upper A",
  "description": "Pressing and pulling, twice a week",
  "schedule": { "days": ["monday", "thursday"] },
  "exercises": [
    {
      "id": "bench-press",
      "name": "Bench Press",
      "sets": 3,
      "reps": { "min": 6, "max": 10 },
      "weight": { "value": 60, "unit": "kg" },
      "rest_seconds": 150,
      "instructions": ["Feet planted, shoulder blades pulled back and down."],
      "muscle_groups": ["chest", "triceps"]
    },
    {
      "id": "dumbbell-row",
      "name": "Dumbbell Row",
      "sets": 3,
      "reps": { "min": 8, "max": 12 },
      "per_hand": true,
      "rest_seconds": 90
    }
  ]
}`;

export function chatPrompt(): string {
  const names = EXERCISE_LIBRARY.map((e) => e.name).join(', ');
  return `Build me a workout program for the Workout Companion app.

Reply with one json code block and nothing else: no explanation before or after it.

Rules
- "schema_version" must be 1.
- "id": lowercase letters, digits and dashes. "name": short, e.g. "Upper A".
- "schedule": { "days": ["monday", "thursday"] } with any of monday..sunday. Leave it out for a program I start by hand.
- 3 to 8 exercises. "sets" from 2 to 5. "reps": { "min": 6, "max": 10 }, whole numbers.
- "rest_seconds": whole seconds, 0 to 600.
- "weight" is optional: { "value": 20, "unit": "kg" }. Add "per_hand": true for one-arm or one-leg movements.
- "instructions": two short lines on how to do the movement. "muscle_groups": lowercase, e.g. ["chest", "triceps"].
- Use the exercise names from the list at the bottom, spelled exactly like that: those are the ones with pictures and sensible defaults.

Shape
${EXAMPLE}

Exercise names this app knows
${names}`;
}

/**
 * Chat answers arrive wrapped in fences and prose even when told not to. Take the
 * outermost object and let the importer report what is wrong with the inside.
 */
export function extractJson(text: string): string | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  return start >= 0 && end > start ? text.slice(start, end + 1) : null;
}
