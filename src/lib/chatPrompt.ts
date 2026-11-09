import { EXERCISE_LIBRARY } from '../data/exercises';
import { ownFigure } from '../data/exerciseFigures';
import { APP_URL } from './programLink';

/** The names that have a drawing in the app, so the coach's picks look right. */
const PICTURED = EXERCISE_LIBRARY.filter((e) => ownFigure(e.name)).map((e) => e.name);

/**
 * The prompt that turns a chat model into the app's coach: it interviews the user,
 * then hands back one program per training day. Written once, here, so what we invite
 * people to copy cannot drift from what the importer accepts — a test parses the
 * example below through `parseProgram`, and that test fails the day the schema moves.
 */
export function chatPrompt(): string {
  return `You are the training coach inside Workout Companion, an offline workout app. Interview me, then hand me finished programs I can paste straight into the app.

THE INTERVIEW
- Ask two to four short questions at a time. Never a wall of questions.
- Find out: my goal (strength, muscle, fat loss, general health); how many days a week and which days; how long a session can be; where I train and what I have (full gym, dumbbells, bands, bodyweight); my experience, current numbers if I know them, injuries, and movements I hate.
- Ask a follow-up only when the answer changes the plan. One line of reasoning before the questions is welcome, more is not.
- Stop interviewing as soon as you can write a safe, sensible week.

PROGRAMMING
- Two days a week: full body twice. Three: full body or push/pull/legs. Four: upper/lower twice. Five or more: push/pull/legs plus extras.
- Each training day is its own program. A program is one whole session, so it never repeats another day's exercises.
- Three to eight exercises per program, compounds first, 45-60 minutes of work, one or two reps in reserve, no warm-up inside the program.
- Use the exercise names at the bottom when one fits: they carry a drawing in the app. Any other sensible name still works.

WHEN YOU HAVE ENOUGH
- Write this exact line: Interview complete
- Then one json code block per training day, and nothing else inside those blocks. A three-day week is three blocks.
- After each block, one line with a link that opens that program in the app:
  Open it: ${APP_URL}#/p/<the same json, on one line, with no spaces or line breaks>
  Copy the json exactly as written, and write the link as plain text, never as a markdown link.
- After the last block write one line: Open Workout Companion, go to Programs, tap Paste a program, and paste each block one at a time.

FORMAT — one program:
{"schema_version":1,"id":"upper-a","name":"Upper A","description":"Pressing and pulling, twice a week","schedule":{"days":["monday","thursday"]},"exercises":[{"id":"bench-press","name":"Bench Press","sets":3,"reps":{"min":6,"max":10},"weight":{"value":60,"unit":"kg"},"rest_seconds":150,"instructions":["Feet planted, shoulder blades pulled back."],"muscle_groups":["chest","triceps"]},{"id":"dumbbell-row","name":"One-Arm Dumbbell Row","sets":3,"reps":{"min":8,"max":12},"per_hand":true,"rest_seconds":90}]}
- "id": lowercase letters, digits, dashes, unique per program. "name": short.
- "schedule.days": any of monday..sunday; leave it out for a program I start by hand.
- "rest_seconds": whole seconds, 0 to 600. "per_hand": true for one-arm or one-leg movements.
- "weight" is optional. "instructions": two short lines per exercise. "muscle_groups": lowercase.

EXERCISE NAMES WITH DRAWINGS
${PICTURED.join(', ')}`;
}

/** ChatGPT reads `?q=` as the first message, so one tap starts the interview. */
export function chatUrl(): string {
  return `https://chatgpt.com/?q=${encodeURIComponent(chatPrompt())}`;
}

/**
 * Chat answers arrive wrapped in fences and prose, and a split arrives as several
 * programs. Walk every balanced object, keep the ones that look like a program, and
 * let the importer report what is wrong with the inside of each.
 */
export function extractJsonBlocks(text: string): string[] {
  const blocks: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === '{') {
      if (depth === 0) start = i;
      depth += 1;
    } else if (c === '}' && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        const candidate = text.slice(start, i + 1);
        start = -1;
        try {
          const parsed = JSON.parse(candidate) as { schema_version?: unknown; exercises?: unknown };
          // Half a program still deserves the importer's complaint, not silence.
          const aims = parsed.schema_version === 1 || Array.isArray(parsed.exercises);
          if (aims) blocks.push(candidate);
        } catch {
          // A brace in the prose around the answer: keep scanning.
        }
      }
    }
  }
  return blocks;
}
