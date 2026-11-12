import { z } from 'zod';
import type { Program } from '../engine/types';
import type { SessionRow } from '../storage/db';
import { parseProgram } from '../schemas/program';

export const BACKUP_FORMAT = 'workout-companion-backup';

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: 1;
  exportedAt: number;
  /**
   * Program id → when it was last edited here. It cannot ride inside a program:
   * the program schema is strict, so an extra field would break re-import.
   */
  programUpdatedAt?: Record<string, number>;
  /** The program exactly as it was imported (snake_case), so a backup re-imports. */
  programs: unknown[];
  sessions: SessionRow[];
}

export type ParsedBackup =
  | { ok: true; programs: Program[]; sessions: SessionRow[] }
  | { ok: false; error: string };

export function buildBackup(programs: Program[], sessions: SessionRow[], now: number): Backup {
  const programUpdatedAt: Record<string, number> = {};
  for (const program of programs) {
    if (program.updatedAt != null) programUpdatedAt[program.id] = program.updatedAt;
  }
  return {
    format: BACKUP_FORMAT,
    version: 1,
    exportedAt: now,
    programUpdatedAt,
    programs: programs.map((p) => JSON.parse(p.raw) as unknown),
    sessions,
  };
}

function idOf(item: unknown): string | null {
  if (item && typeof item === 'object') {
    const id = (item as { id?: unknown }).id;
    if (typeof id === 'string') return id;
  }
  return null;
}

function sessionStamp(row: unknown): number {
  if (row && typeof row === 'object') {
    const state = (row as { state?: { updatedAt?: unknown } }).state;
    if (state && typeof state.updatedAt === 'number') return state.updatedAt;
  }
  return 0;
}

/**
 * Sync's merge: by id, newer wins, ties keep the local row. Pure — it writes
 * nothing. Nothing is ever deleted, and an id missing a timestamp counts as 0.
 */
export function mergeNewest(local: Backup, remote: Backup): Backup {
  const localStamps = local.programUpdatedAt ?? {};
  const remoteStamps = remote.programUpdatedAt ?? {};

  const programUpdatedAt: Record<string, number> = { ...remoteStamps };
  for (const [id, stamp] of Object.entries(localStamps)) {
    if (!(id in remoteStamps) || stamp > remoteStamps[id]) programUpdatedAt[id] = stamp;
  }

  const remotePrograms = new Map<string, unknown>();
  for (const program of remote.programs) {
    const id = idOf(program);
    if (id) remotePrograms.set(id, program);
  }

  const programs: unknown[] = [];
  const seen = new Set<string>();
  for (const program of local.programs) {
    const id = idOf(program);
    if (!id) {
      programs.push(program);
      continue;
    }
    seen.add(id);
    const other = remotePrograms.get(id);
    const takeRemote = other !== undefined && (remoteStamps[id] ?? 0) > (localStamps[id] ?? 0);
    programs.push(takeRemote ? other : program);
  }
  for (const program of remote.programs) {
    const id = idOf(program);
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    programs.push(program);
  }

  const remoteSessions = new Map<string, unknown>();
  for (const session of remote.sessions) {
    const id = idOf(session);
    if (id) remoteSessions.set(id, session);
  }

  const sessions: unknown[] = [];
  const seenSessions = new Set<string>();
  for (const session of local.sessions) {
    const id = idOf(session);
    if (!id) {
      sessions.push(session);
      continue;
    }
    seenSessions.add(id);
    const other = remoteSessions.get(id);
    sessions.push(other !== undefined && sessionStamp(other) > sessionStamp(session) ? other : session);
  }
  for (const session of remote.sessions) {
    const id = idOf(session);
    if (id && seenSessions.has(id)) continue;
    if (id) seenSessions.add(id);
    sessions.push(session);
  }

  return {
    format: BACKUP_FORMAT,
    version: 1,
    exportedAt: Math.max(local.exportedAt, remote.exportedAt),
    programUpdatedAt,
    programs,
    sessions: sessions as SessionRow[],
  };
}

/** Sync's reader. The envelope is validated by `parseBackup`; this keeps its raw programs. */
export function parseRemote(
  text: string,
): { ok: true; backup: Backup } | { ok: false; error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'The Drive file is not JSON.' };
  }
  if (!raw || typeof raw !== 'object' || (raw as { format?: unknown }).format !== BACKUP_FORMAT) {
    return { ok: false, error: 'The Drive file is not a Workout Companion backup.' };
  }
  const parsed = parseBackup(text);
  if (!parsed.ok) return parsed;
  return { ok: true, backup: raw as Backup };
}

// Only the fields History and Summary read. The rest of the state rides along untouched.
const statuses = [
  'ready',
  'exercise_active',
  'resting',
  'paused',
  'exercise_complete',
  'completed',
  'abandoned',
] as const;

const sessionSchema = z
  .object({
    id: z.string().min(1),
    programId: z.string(),
    programName: z.string(),
    status: z.enum(statuses),
    startedAt: z.number(),
    finishedAt: z.number().nullable(),
    state: z
      .object({
        sessionId: z.string(),
        status: z.enum(statuses),
        program: z
          .object({ id: z.string(), name: z.string(), exercises: z.array(z.unknown()) })
          .passthrough(),
        exerciseRecords: z.array(z.unknown()),
      })
      .passthrough(),
  })
  .passthrough();

const envelopeSchema = z
  .object({
    format: z.literal(BACKUP_FORMAT),
    version: z.number().int().positive(),
    programs: z.array(z.unknown()),
    sessions: z.array(z.unknown()),
  })
  .passthrough();

function programsFrom(raw: unknown[]): { ok: true; programs: Program[] } | { ok: false; error: string } {
  const programs: Program[] = [];
  for (const [index, item] of raw.entries()) {
    const parsed = parseProgram(JSON.stringify(item));
    if (!parsed.ok) {
      const detail = 'issues' in parsed.error
        ? parsed.error.issues.map((i) => `${i.path} ${i.message}`).join(', ')
        : parsed.error.kind;
      return { ok: false, error: `Program ${index + 1} is not valid: ${detail}` };
    }
    programs.push(parsed.program);
  }
  return { ok: true, programs };
}

/**
 * Reads a backup file or a single program file. Everything is validated before the
 * caller writes anything, so a bad row in the middle cannot leave a half import.
 */
export function parseBackup(text: string): ParsedBackup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'That file is not JSON.' };
  }
  if (raw === null || typeof raw !== 'object') {
    return { ok: false, error: 'That file does not contain a program or a backup.' };
  }

  const envelope = envelopeSchema.safeParse(raw);
  if (envelope.success) {
    if (envelope.data.version > 1) {
      return { ok: false, error: `Backup version ${envelope.data.version} is newer than this app.` };
    }
    const programs = programsFrom(envelope.data.programs);
    if (!programs.ok) return programs;

    const sessions: SessionRow[] = [];
    for (const [index, item] of envelope.data.sessions.entries()) {
      const session = sessionSchema.safeParse(item);
      if (!session.success) {
        return { ok: false, error: `Session ${index + 1} in the backup is not valid.` };
      }
      // The fields the screens read are checked above; the rest of the state rides along.
      sessions.push({ ...session.data, stateVersion: 1 } as unknown as SessionRow);
    }
    return { ok: true, programs: programs.programs, sessions };
  }

  // A bare program file (what an agent writes to data/programs/<id>.json).
  const single = parseProgram(text);
  if (single.ok) return { ok: true, programs: [single.program], sessions: [] };

  return {
    ok: false,
    error: 'That file is neither a workout program nor a Workout Companion backup.',
  };
}
