import { summarize } from '../engine/summary';
import type { Program } from '../engine/types';
import type { SessionRow } from '../storage/db';
import { formatDate, formatDuration } from './format';
import { COACH_URL } from './chatPrompt';

/** A coach reads the last few weeks, not the whole archive. */
export const BRIEF_MAX_SESSIONS = 12;

/** Past this the clipboard gets sticky and the coach starts skimming. */
const BRIEF_MAX_CHARS = 8000;

const dateOf = (row: SessionRow) => row.finishedAt ?? row.startedAt ?? row.state.updatedAt;

/** "RDL set 3; Face Pull (whole exercise)" — named, because a count tells a coach nothing. */
function skipLine(row: SessionRow): string | null {
  const summary = summarize(row.state, dateOf(row));
  const parts: string[] = [];
  for (const exercise of summary.exercises) {
    if (exercise.skipped) {
      parts.push(`${exercise.name} (whole exercise)`);
      continue;
    }
    for (const set of exercise.sets) {
      if (set.skipped && !set.completed) parts.push(`${exercise.name} set ${set.setNumber}`);
    }
  }
  if (parts.length === 0) return null;
  return `  skipped: ${parts.join('; ')}`;
}

/** "Bench Press 40kg×8,8,7; Row 14kg×10,10" — only sets that were actually lifted. */
function liftedLine(row: SessionRow): string | null {
  const summary = summarize(row.state, dateOf(row));
  const lifts: string[] = [];
  for (const exercise of summary.exercises) {
    const done = exercise.sets.filter((s) => s.completed);
    if (done.length === 0) continue;
    const withWeight = done.filter((s) => s.actualWeightKg != null);
    if (withWeight.length === 0) continue;
    const weights = [...new Set(withWeight.map((s) => s.actualWeightKg))];
    const reps = withWeight.map((s) => s.actualReps ?? 0).join(',');
    lifts.push(`${exercise.name} ${weights.join('/')}kg×${reps}`);
  }
  if (lifts.length === 0) return null;
  return `  lifted: ${lifts.join('; ')}`;
}

/** One line per session: when, how long, how much of it, how hard, and what was said. */
function sessionLines(row: SessionRow): string[] {
  const at = dateOf(row);
  const summary = summarize(row.state, at);
  const prescribed = summary.setsCompleted + summary.setsSkipped;
  const parts = [
    formatDate(at),
    row.programName,
    formatDuration(summary.durationMs),
    `${summary.setsCompleted}/${prescribed} sets`,
  ];
  if (summary.rpe != null) parts.push(`RPE ${summary.rpe}`);
  // A skipped set is not an early end; an exercise that was never touched is.
  const quit =
    summary.status === 'abandoned' ||
    summary.exercises.some((e) => e.sets.length > 0 && e.sets.every((x) => !x.completed && !x.skipped));
  if (quit) parts.push('ended early');
  const note = summary.notes?.trim();
  const line = `${parts.join(' · ')}${note ? ` — "${note}"` : ''}`;
  return [line, skipLine(row), liftedLine(row)].filter((x): x is string => !!x);
}

/**
 * What the user copies to their coach: the program, what actually happened in the gym
 * since, and one sentence saying what is wanted back. The coach contract in
 * `public/coach.md` reads this; a test keeps the two in step.
 */
export function coachBrief({
  program,
  sessions,
  now = Date.now(),
}: {
  program: Program | null;
  sessions: SessionRow[];
  now?: number;
}): string {
  const mine = program ? sessions.filter((row) => row.programId === program.id) : sessions;
  const recent = [...mine].sort((a, b) => dateOf(b) - dateOf(a));

  const blocks: string[] = [];
  if (program) {
    blocks.push(`## Program\nid: ${program.id}\nname: ${program.name}\n${program.raw}`);
  }

  const history: string[] = [];
  for (const row of recent.slice(0, BRIEF_MAX_SESSIONS)) {
    const lines = sessionLines(row);
    const next = [...history, ...lines].join('\n');
    if (blocks.join('\n\n').length + next.length > BRIEF_MAX_CHARS) break;
    history.push(...lines);
  }

  const historyBlock =
    history.length > 0
      ? `## History\n${history.join('\n')}`
      : '## History\nNothing logged yet.';

  const want = program
    ? '## What I want\nChange the program so it survives what the history shows.'
    : '## What I want\nTell me what the history says, then what you would change.';

  // The URL travels in the brief, so a coach that has never seen the file still knows
  // the protocol it is being asked to follow.
  const head = `Open ${COACH_URL} and follow its review protocol. Today is ${formatDate(now)}.`;
  return [head, ...blocks, historyBlock, want].join('\n\n');
}

/** What the paste box shows when a reply has no program in it. */
export const NO_PROGRAM_HINT =
  'That reply has no program in it. Ask your coach for the updated program as a json block, then paste that reply.';
