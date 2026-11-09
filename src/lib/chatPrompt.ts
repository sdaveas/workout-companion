import { APP_URL } from './programLink';

/**
 * Where the prompt sends a chat assistant. Not the Pages copy: ChatGPT will not read
 * a bare text/markdown response, but it reads the rendered file on GitHub. The app's
 * own copy is `COACH_FILE` — same content, same origin, for fetching and for people.
 */
export const COACH_URL =
  'https://github.com/sdaveas/workout-companion/blob/main/public/coach.md';

/** The same file from this deploy. Used in-app, where a fetch has to stay on-origin. */
export const COACH_FILE = `${APP_URL}coach.md`;

/**
 * What gets copied, or handed to `?q=`. Deliberately short: the interview, the json
 * format and the example live in `public/coach.md`, which a browsing assistant reads
 * in one go. The file is generated to match this app, and a test parses its example
 * through `parseProgram` — the day the schema moves, that test fails.
 */
export function chatPrompt(): string {
  return `Open ${COACH_URL} and follow it exactly.

Then interview me the way it asks, and when you have enough write "Interview complete" and one json block per training day, each followed by its app link. If you cannot open that link, say so instead of guessing.`;
}

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
