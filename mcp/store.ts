import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { describeError, parseProgram, type ProgramIssue } from '../src/schemas/program';
import type { SessionSummary } from '../src/engine/summary';

export interface StoredProgram {
  id: string;
  name: string;
  scheduleDay: string | null;
  exerciseCount: number;
}

export type SaveResult = { ok: true; id: string } | { ok: false; issues: ProgramIssue[] };

export interface HistorySession {
  id: string;
  programId: string;
  programName: string;
  startedAt: number | null;
  finishedAt: number | null;
  summary: SessionSummary;
}

export interface HistoryFile {
  exportedAt: number;
  sessions: HistorySession[];
}

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

const programsDir = (root: string) => path.join(root, 'programs');
const archiveDir = (root: string) => path.join(programsDir(root), 'archive');
const fileFor = (root: string, id: string) => path.join(programsDir(root), `${id}.json`);
const historyFile = (root: string) => path.join(root, 'history', 'workout-history.json');

const badId = (id: string): ProgramIssue => ({
  path: 'id',
  message: `Invalid program id ${JSON.stringify(id)} — use letters, digits, dot, dash or underscore (max 64).`,
});

async function jsonFiles(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return [];
  const names = await readdir(dir);
  return names.filter((n) => n.endsWith('.json')).map((n) => path.join(dir, n));
}

/**
 * The importer is the only validator: a program the MCP accepts is a program the app
 * accepts. The file keeps the caller's shape (pretty-printed), not the internal one.
 */
async function validate(
  text: string,
  expectedId?: string,
): Promise<{ issues: ProgramIssue[]; id: string }> {
  const parsed = parseProgram(text);
  if (!parsed.ok) return { issues: describeError(parsed.error), id: '' };
  if (expectedId != null && parsed.program.id !== expectedId) {
    return {
      issues: [{ path: 'id', message: `Program id is "${parsed.program.id}" but the tool was called for "${expectedId}".` }],
      id: parsed.program.id,
    };
  }
  return { issues: [], id: parsed.program.id };
}

export async function validateProgram(
  text: string,
  expectedId?: string,
): Promise<ProgramIssue[]> {
  return (await validate(text, expectedId)).issues;
}

export async function listPrograms(root: string): Promise<StoredProgram[]> {
  const out: StoredProgram[] = [];
  for (const file of await jsonFiles(programsDir(root))) {
    const text = await readFile(file, 'utf8');
    const parsed = parseProgram(text);
    if (!parsed.ok) continue;
    out.push({
      id: parsed.program.id,
      name: parsed.program.name,
      scheduleDay: parsed.program.scheduleDay,
      exerciseCount: parsed.program.exercises.length,
    });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

export async function getProgram(root: string, id: string): Promise<string | null> {
  if (!ID_PATTERN.test(id)) return null;
  try {
    return await readFile(fileFor(root, id), 'utf8');
  } catch {
    return null;
  }
}

export async function saveProgram(
  root: string,
  text: string,
  options: { replace?: boolean; expectedId?: string } = {},
): Promise<SaveResult> {
  const { issues, id } = await validate(text, options.expectedId);
  if (issues.length > 0) return { ok: false, issues };
  if (!ID_PATTERN.test(id)) return { ok: false, issues: [badId(id)] };

  const file = fileFor(root, id);
  if (existsSync(file) && !options.replace) {
    return {
      ok: false,
      issues: [{ path: 'id', message: `"${id}" already exists. Pass replace: true to overwrite it.` }],
    };
  }

  await mkdir(programsDir(root), { recursive: true });
  await writeFile(file, `${JSON.stringify(JSON.parse(text), null, 2)}\n`, 'utf8');
  await writeIndex(root);
  return { ok: true, id };
}

export async function archiveProgram(root: string, id: string): Promise<boolean> {
  if (!ID_PATTERN.test(id)) return false;
  const file = fileFor(root, id);
  if (!existsSync(file)) return false;
  await mkdir(archiveDir(root), { recursive: true });
  await rename(file, path.join(archiveDir(root), `${id}.json`));
  await writeIndex(root);
  return true;
}

export async function writeIndex(root: string): Promise<void> {
  const programs = await listPrograms(root);
  const body = { updatedAt: Date.now(), programs };
  await mkdir(programsDir(root), { recursive: true });
  await writeFile(path.join(programsDir(root), 'index.json'), `${JSON.stringify(body, null, 2)}\n`, 'utf8');
}

export async function readHistory(root: string): Promise<HistoryFile | null> {
  try {
    return JSON.parse(await readFile(historyFile(root), 'utf8')) as HistoryFile;
  } catch {
    return null;
  }
}
