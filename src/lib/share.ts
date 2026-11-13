import type { Program, SetRecord, WorkoutState } from '../engine/types';
import { parseProgram, type ParseResult } from '../schemas/program';
import { EXERCISE_LIBRARY } from '../data/exercises';
import { slug } from '../lib/buildProgram';

/** A program travels inside the link: `#/add/<payload>`. Nothing is hosted, nothing is sent. */
export const SHARE_PATH = '#/add/';

/**
 * Links are read on a phone, so the payload carries the training plan only:
 * name and each exercise's name, sets, reps, weight, per-hand flag and rest.
 * Photos, instructions, notes and the schedule stay with the sender — they were
 * most of the bytes, and the receiver schedules the program for their own week.
 * The exercise name is sent as an index into the built-in library when we know it.
 */
const VERSION = '1';

type WireExercise = [number | string, number, number, number, number, 0 | 1, number];

/** One logged set. A unilateral movement keeps both hands: the weak side is the point. */
export interface PerformedSet {
  reps: number;
  weightKg: number | null;
  /** The other hand, when the movement is unilateral. */
  repsRight?: number;
}

/** Per exercise in program order: its sets, or `null` when the exercise was not done. */
export type Performed = ((PerformedSet | null)[] | null)[];

/** `[reps, weightKg]`, a third `repsRight`, or `null` for a set that was skipped. */
type WireSet = [number, number] | [number, number, number];
type WireProgram = [string, string, WireExercise[], ((WireSet | null)[] | null)[]?];

/**
 * A known exercise travels as its position in EXERCISE_LIBRARY, which keeps links
 * short. Positions are therefore frozen: a library entry never moves, and new ones
 * are appended. See the "curated entries first" test in data/exercises.test.ts.
 */
const nameCode = (name: string): number | string => {
  const i = EXERCISE_LIBRARY.findIndex((e) => e.name.toLowerCase() === name.trim().toLowerCase());
  return i >= 0 ? i : name.trim();
};

function toWire(program: Program, performed?: Performed): WireProgram {
  const wire: WireProgram = [
    program.name,
    // The week is the receiver's call: a solo lifter and a Monday/Wednesday/Friday
    // lifter get the same link, and the link never schedules anything for them.
    '',
    program.exercises.map((e) => [
      nameCode(e.name),
      e.sets,
      e.reps.min,
      e.reps.max,
      e.weightKg ?? -1,
      e.perHand ? 1 : 0,
      e.restSeconds,
    ]),
  ];

  // The 4th slot is optional: a link without it is the program link it always was, and a
  // build that predates it reads the first three and gets the plan.
  if (performed) {
    wire[3] = performed.map(
      (sets) =>
        sets?.map((set) =>
          set == null
            ? null
            : ([
                set.reps,
                set.weightKg ?? -1,
                ...(set.repsRight === undefined ? [] : [set.repsRight]),
              ] as WireSet),
        ) ?? null,
    );
  }
  return wire;
}

/** Wire → the canonical program JSON the importer accepts. `null` when it is not a program. */
function fromWire(wire: unknown): { json: string; performed?: Performed } | null {
  if (!Array.isArray(wire) || typeof wire[0] !== 'string' || !Array.isArray(wire[2])) return null;
  const [name, day, rows] = wire as [string, unknown, unknown[]];
  const logged = Array.isArray(wire[3]) ? readPerformed(wire[3] as unknown[]) : undefined;

  const seen = new Set<string>();
  const exercises = rows.map((row, i) => {
    if (!Array.isArray(row) || row.length < 7) throw new Error('bad exercise');
    const [code, sets, min, max, weight, perHand, rest] = row as WireExercise;
    const exerciseName = typeof code === 'number' ? EXERCISE_LIBRARY[code]?.name : code;
    if (typeof exerciseName !== 'string' || !exerciseName) throw new Error('unknown exercise');
    let id = slug(exerciseName) || `exercise-${i + 1}`;
    while (seen.has(id)) id = `${id}-${i + 1}`;
    seen.add(id);
    return {
      id,
      name: exerciseName,
      sets,
      reps: { min, max },
      ...(typeof weight === 'number' && weight >= 0
        ? { weight: { value: weight, unit: 'kg' } }
        : {}),
      ...(perHand ? { per_hand: true } : {}),
      rest_seconds: rest,
    };
  });

  return {
    json: JSON.stringify({
      schema_version: 1,
      id: slug(name),
      name,
      ...(typeof day === 'string' && day ? { schedule: { day } } : {}),
      exercises,
    }),
    ...(logged ? { performed: logged } : {}),
  };
}

function readPerformed(raw: unknown[]): Performed {
  return raw.map((entry) => {
    if (!Array.isArray(entry)) return null;
    return entry.map((set) => {
      if (!Array.isArray(set)) return null;
      const [reps, weight, right] = set as WireSet;
      if (typeof reps !== 'number') return null;
      return {
        reps,
        weightKg: typeof weight === 'number' && weight >= 0 ? weight : null,
        ...(typeof right === 'number' ? { repsRight: right } : {}),
      };
    });
  });
}

/**
 * What the sender actually did. Auto sessions log the timed target as the result, and a
 * session where nothing was completed has no report to send — both share the plan alone.
 */
function performedFrom(state: WorkoutState): Performed | undefined {
  if (state.mode === 'auto') return undefined;

  const performed: Performed = state.exerciseRecords.map((record) => {
    if (record.skipped) return null;
    // A unilateral set is two rows (one per hand) under the same set number.
    const bySet = new Map<number, SetRecord[]>();
    for (const set of record.sets) {
      const group = bySet.get(set.setNumber);
      if (group) group.push(set);
      else bySet.set(set.setNumber, [set]);
    }
    return [...bySet.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, group]) => {
        const done = group.filter((set) => set.completed);
        if (done.length === 0) return null;
        const left = done.find((set) => set.side === 'left') ?? done[0];
        const right = done.find((set) => set.side === 'right');
        return {
          reps: left.actualReps ?? 0,
          weightKg: left.actualWeightKg,
          ...(right ? { repsRight: right.actualReps ?? 0 } : {}),
        };
      });
  });

  return performed.some((sets) => sets?.some((set) => set != null)) ? performed : undefined;
}

/** A finished session: the same tuple, plus what was logged. */
export async function encodeSession(state: WorkoutState): Promise<string> {
  const wire = toWire(state.program, performedFrom(state));
  return VERSION + toB64url(await pack(new TextEncoder().encode(JSON.stringify(wire))));
}

function toB64url(bytes: Uint8Array): string {
  let binary = '';
  // Chunked: String.fromCharCode(...bytes) blows the stack on a large program.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('not base64url');
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** gzip when the platform has it (Safari 16.4+), otherwise raw bytes — the gzip magic tells them apart. */
async function pack(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream === 'undefined') return bytes;
  const stream = new Blob([bytes.slice()]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function unpack(bytes: Uint8Array): Promise<Uint8Array> {
  const gzipped = bytes[0] === 0x1f && bytes[1] === 0x8b;
  if (!gzipped) return bytes;
  if (typeof DecompressionStream === 'undefined') throw new Error('gzip unsupported');
  const stream = new Blob([bytes.slice()]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function encodeProgram(program: Program): Promise<string> {
  return encodePrograms([program]);
}

/** Several programs in one link: the same wire rows, one array around them. */
export async function encodePrograms(programs: Program[]): Promise<string> {
  const wire = programs.length === 1 ? toWire(programs[0]) : programs.map((p) => toWire(p));
  return VERSION + toB64url(await pack(new TextEncoder().encode(JSON.stringify(wire))));
}

async function readPayload(body: string): Promise<unknown> {
  const text = new TextDecoder().decode(await unpack(fromB64url(body)));
  return JSON.parse(text) as unknown;
}

export type SharedPrograms =
  | { ok: true; programs: Program[]; performed?: Performed }
  | Extract<ParseResult, { ok: false }>;

/** One link, one program or many. A single program reads exactly as it always did. */
export async function decodePrograms(payload: string): Promise<SharedPrograms> {
  let data: unknown;
  try {
    // Version-less links predate the compact format; they carry the program JSON itself.
    data =
      payload.startsWith(VERSION) && /^[A-Za-z0-9_-]+$/.test(payload.slice(VERSION.length))
        ? await readPayload(payload.slice(VERSION.length))
        : await readPayload(payload);
  } catch {
    try {
      data = await readPayload(payload);
    } catch {
      return notAProgram();
    }
  }

  if (!Array.isArray(data)) {
    const parsed = parseProgram(JSON.stringify(data));
    return parsed.ok ? { ok: true, programs: [parsed.program] } : parsed;
  }

  // Program JSON itself, or an array of it, from a link written before the wire form.
  if (data.length > 0 && typeof data[0] === 'object' && !Array.isArray(data[0])) {
    const programs: Program[] = [];
    for (const item of data) {
      const parsed = parseProgram(JSON.stringify(item));
      if (!parsed.ok) return parsed;
      programs.push(parsed.program);
    }
    return { ok: true, programs };
  }

  // Wire rows: one tuple, or an array of tuples when several programs were shared.
  const tuples = Array.isArray(data[0]) ? data : [data];
  const programs: Program[] = [];
  let performed: Performed | undefined;
  for (const [index, tuple] of tuples.entries()) {
    try {
      const read = fromWire(tuple);
      if (read == null) return notAProgram();
      const parsed = parseProgram(read.json);
      if (!parsed.ok) return parsed;
      programs.push(parsed.program);
      // Numbers belong to one workout, so they only ride a single-program link.
      if (tuples.length === 1) performed = read.performed;
    } catch {
      return {
        ok: false,
        error: {
          kind: 'invalid_json',
          message: tuples.length === 1 ? 'That link is from an older version.' : `Program ${index + 1} in that link is not readable.`,
        },
      };
    }
  }
  return programs.length > 0 ? { ok: true, programs, ...(performed ? { performed } : {}) } : notAProgram();
}

function notAProgram(): SharedPrograms {
  return { ok: false, error: { kind: 'invalid_json', message: 'This is not a program link.' } };
}

/** The first program in a link — the older, single-program callers. */
export async function decodeProgram(payload: string): Promise<ParseResult> {
  const result = await decodePrograms(payload);
  if (!result.ok) return result;
  return { ok: true, program: result.programs[0] };
}

/**
 * Bump when the link preview card changes. Chat clients cache the unfurl per URL,
 * so a fresh query string is the only way to make them look again; the program
 * itself still lives in the hash and never touches the server.
 */
export const SHARE_VERSION = 4;

export function shareUrl(payload: string, base = location.origin + location.pathname): string {
  return `${base}?v=${SHARE_VERSION}${SHARE_PATH}${payload}`;
}
