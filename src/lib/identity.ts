import type { Program } from '../engine/types';
import { parseProgram } from '../schemas/program';

/**
 * One rule for every save path: a program never silently replaces another one.
 * Same name, or the same id when creating, means the user picks a name instead.
 */
export const sameName = (a: string, b: string): boolean =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

/** The saved program this one would clash with. `selfId` is the program being edited. */
export function conflictingProgram(
  program: Program,
  existing: readonly Program[],
  selfId?: string,
): Program | null {
  return (
    existing.find((p) => p.id !== selfId && (p.id === program.id || sameName(p.name, program.name))) ??
    null
  );
}

export function uniqueName(base: string, existing: readonly string[]): string {
  const root = base.replace(/\s*\(\d+\)\s*$/, '').trim() || 'Program';
  if (!existing.some((n) => sameName(n, root))) return root;
  for (let i = 2; i < 100; i += 1) {
    const candidate = `${root} (${i})`;
    if (!existing.some((n) => sameName(n, candidate))) return candidate;
  }
  return `${root} (copy)`;
}

const slug = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'program';

export function uniqueId(name: string, existingIds: readonly string[]): string {
  const root = slug(name);
  if (!existingIds.includes(root)) return root;
  for (let i = 2; i < 100; i += 1) {
    const candidate = `${root}-${i}`;
    if (!existingIds.includes(candidate)) return candidate;
  }
  return `${root}-copy`;
}

/** Same program under a new id and name. `raw` is rebuilt so a later edit saves what was seen. */
export function withIdentity(program: Program, name: string, id: string): Program {
  const draft = JSON.parse(program.raw) as Record<string, unknown>;
  draft.id = id;
  draft.name = name;
  const raw = JSON.stringify(draft);
  const parsed = parseProgram(raw);
  return parsed.ok ? parsed.program : { ...program, id, name, raw };
}

/**
 * A name the stored programs do not already use. Used for the "save as" field, so the
 * user starts from something valid instead of typing from scratch.
 */
export function suggestedName(program: Program, existing: readonly Program[]): string {
  return uniqueName(program.name, existing.map((p) => p.name));
}

export type RenameResult = { ok: true; program: Program } | { ok: false; error: string };

/**
 * `keepId` renames an existing program in place (the Edit path). Without it the program is
 * stored beside the others under a fresh id (a create that clashed, or a shared program).
 */
export function renameProgram(
  program: Program,
  name: string,
  existing: readonly Program[],
  opts: { keepId?: boolean } = {},
): RenameResult {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: 'Give the program a name.' };
  const others = existing.filter((p) => p.id !== program.id || !opts.keepId);
  if (others.some((p) => sameName(p.name, trimmed))) {
    return { ok: false, error: `There is already a program called "${trimmed}".` };
  }
  const id = opts.keepId ? program.id : uniqueId(trimmed, existing.map((p) => p.id));
  return { ok: true, program: withIdentity(program, trimmed, id) };
}
