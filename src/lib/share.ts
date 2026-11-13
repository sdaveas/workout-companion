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
/** Binary wire. `1` stays readable forever; this is what we emit. */
const VERSION_BINARY = '2';

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

interface PlanRow {
  name: string;
  sets: number;
  min: number;
  max: number;
  weightKg: number | null;
  perHand: boolean;
  rest: number;
}

/** The canonical program JSON the importer parses. Both wires end here. */
function programJson(name: string, rows: PlanRow[], day?: string): string {
  const seen = new Set<string>();
  const exercises = rows.map((row, i) => {
    let id = slug(row.name) || `exercise-${i + 1}`;
    while (seen.has(id)) id = `${id}-${i + 1}`;
    seen.add(id);
    return {
      id,
      name: row.name,
      sets: row.sets,
      reps: { min: row.min, max: row.max },
      ...(row.weightKg != null ? { weight: { value: row.weightKg, unit: 'kg' } } : {}),
      ...(row.perHand ? { per_hand: true } : {}),
      rest_seconds: row.rest,
    };
  });

  return JSON.stringify({
    schema_version: 1,
    id: slug(name),
    name,
    ...(day ? { schedule: { day } } : {}),
    exercises,
  });
}

/** Wire → the canonical program JSON the importer accepts. `null` when it is not a program. */
function fromWire(wire: unknown): { json: string; performed?: Performed } | null {
  if (!Array.isArray(wire) || typeof wire[0] !== 'string' || !Array.isArray(wire[2])) return null;
  const [name, day, rows] = wire as [string, unknown, unknown[]];
  const logged = Array.isArray(wire[3]) ? readPerformed(wire[3] as unknown[]) : undefined;

  const plan: PlanRow[] = rows.map((row) => {
    if (!Array.isArray(row) || row.length < 7) throw new Error('bad exercise');
    const [code, sets, min, max, weight, perHand, rest] = row as WireExercise;
    const exerciseName = typeof code === 'number' ? EXERCISE_LIBRARY[code]?.name : code;
    if (typeof exerciseName !== 'string' || !exerciseName) throw new Error('unknown exercise');
    return {
      name: exerciseName,
      sets,
      min,
      max,
      weightKg: typeof weight === 'number' && weight >= 0 ? weight : null,
      perHand: perHand === 1,
      rest,
    };
  });

  return {
    json: programJson(name, plan, typeof day === 'string' ? day : undefined),
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

/**
 * The binary wire. One byte of flags, then the packed bytes. Bit 1 says deflate-raw,
 * which is the whole deflate stream without gzip's 18-byte wrapper — measured 135 bytes
 * against gzip's 153 on a six-exercise session, and raw's 169. Bit 0 is gzip, read only:
 * links written before this build carry it.
 */
const FLAG_GZIP = 1;
const FLAG_DEFLATE_RAW = 2;

async function encodeBinary(programs: Program[], performed?: Performed): Promise<string> {
  const packed = packPrograms(programs, performed);
  const deflated = await deflateRaw(packed);
  const useDeflate = deflated != null && deflated.length < packed.length;
  const body = useDeflate ? deflated : packed;
  const bytes = new Uint8Array(body.length + 1);
  bytes[0] = useDeflate ? FLAG_DEFLATE_RAW : 0;
  bytes.set(body, 1);
  return VERSION_BINARY + toB64url(bytes);
}

function varint(out: number[], value: number) {
  let v = Math.max(0, Math.round(value));
  while (v >= 0x80) {
    out.push((v & 0x7f) | 0x80);
    v = Math.floor(v / 128);
  }
  out.push(v);
}

function writeString(out: number[], value: string) {
  const bytes = new TextEncoder().encode(value);
  varint(out, bytes.length);
  for (const byte of bytes) out.push(byte);
}

/** Small numbers, then strings. Throws on a payload that ends early. */
class Reader {
  private at = 0;
  constructor(private readonly bytes: Uint8Array) {}

  varint(): number {
    let shift = 0;
    let value = 0;
    for (;;) {
      if (this.at >= this.bytes.length) throw new Error('short payload');
      const byte = this.bytes[this.at++];
      value += (byte & 0x7f) * 2 ** shift;
      if ((byte & 0x80) === 0) return value;
      shift += 7;
      if (shift > 35) throw new Error('bad varint');
    }
  }

  string(): string {
    const length = this.varint();
    const end = this.at + length;
    if (end > this.bytes.length) throw new Error('short payload');
    const text = new TextDecoder().decode(this.bytes.subarray(this.at, end));
    this.at = end;
    return text;
  }
}

/** Tenths of a kilo, so 5.8 kg survives a round trip: 0 = bodyweight. */
const weightCode = (kg: number | null) => (kg == null ? 0 : Math.round(kg * 10) + 1);
const fromWeightCode = (code: number) => (code === 0 ? null : (code - 1) / 10);

function packPrograms(programs: Program[], performed?: Performed): Uint8Array {
  const out: number[] = [];
  varint(out, programs.length);

  for (const [index, program] of programs.entries()) {
    writeString(out, program.name);
    varint(out, program.exercises.length);
    for (const exercise of program.exercises) {
      // A library name is one small number; anything else travels as text.
      const code = EXERCISE_LIBRARY.findIndex(
        (e) => e.name.toLowerCase() === exercise.name.trim().toLowerCase(),
      );
      if (code >= 0) varint(out, code + 1);
      else {
        varint(out, 0);
        writeString(out, exercise.name.trim());
      }
      varint(out, exercise.sets);
      varint(out, exercise.reps.min);
      varint(out, Math.max(0, exercise.reps.max - exercise.reps.min));
      varint(out, weightCode(exercise.weightKg));
      varint(out, exercise.perHand ? 1 : 0);
      varint(out, Math.max(0, Math.round(exercise.restSeconds)));
    }

    // Numbers belong to one workout, so only a single-program link carries them.
    const logged = programs.length === 1 && index === 0 ? performed : undefined;
    if (!logged) {
      varint(out, 0);
      continue;
    }
    varint(out, 1);
    for (const sets of logged) {
      varint(out, sets ? sets.length : 0);
      for (const set of sets ?? []) {
        // A skipped set is reps 0: no completed set can have none.
        if (set == null) {
          varint(out, 0);
          varint(out, 0);
          varint(out, 0);
          continue;
        }
        varint(out, set.reps);
        varint(out, weightCode(set.weightKg));
        const hasRight = set.repsRight !== undefined;
        varint(out, hasRight ? 1 : 0);
        if (hasRight) varint(out, set.repsRight ?? 0);
      }
    }
  }

  return new Uint8Array(out);
}

function readNumbers(reader: Reader, exercises: number): Performed {
  const performed: Performed = [];
  for (let e = 0; e < exercises; e += 1) {
    const count = reader.varint();
    if (count === 0) {
      performed.push(null);
      continue;
    }
    const sets: (PerformedSet | null)[] = [];
    for (let s = 0; s < count; s += 1) {
      const reps = reader.varint();
      const weight = reader.varint();
      const flags = reader.varint();
      const repsRight = (flags & 1) === 1 ? reader.varint() : undefined;
      sets.push(
        reps === 0
          ? null
          : {
              reps,
              weightKg: fromWeightCode(weight),
              ...(repsRight === undefined ? {} : { repsRight }),
            },
      );
    }
    performed.push(sets);
  }
  return performed;
}

function unpackPrograms(bytes: Uint8Array): SharedPrograms {
  const reader = new Reader(bytes);
  const count = reader.varint();
  if (count < 1 || count > 50) throw new Error('bad program count');

  const programs: Program[] = [];
  let performed: Performed | undefined;
  for (let p = 0; p < count; p += 1) {
    const name = reader.string();
    const exerciseCount = reader.varint();
    const rows: PlanRow[] = [];
    for (let e = 0; e < exerciseCount; e += 1) {
      const code = reader.varint();
      const exerciseName = code === 0 ? reader.string() : EXERCISE_LIBRARY[code - 1]?.name;
      if (!exerciseName) throw new Error('unknown exercise');
      const sets = reader.varint();
      const min = reader.varint();
      const max = min + reader.varint();
      const weight = reader.varint();
      const flags = reader.varint();
      const rest = reader.varint();
      rows.push({
        name: exerciseName,
        sets,
        min,
        max,
        weightKg: fromWeightCode(weight),
        perHand: (flags & 1) === 1,
        rest,
      });
    }
    if (reader.varint() === 1) performed = readNumbers(reader, exerciseCount);

    const parsed = parseProgram(programJson(name, rows));
    if (!parsed.ok) return parsed;
    programs.push(parsed.program);
  }

  return { ok: true, programs, ...(performed ? { performed } : {}) };
}

async function decodeBinary(payload: string): Promise<SharedPrograms> {
  const bytes = fromB64url(payload);
  if (bytes.length < 2) throw new Error('short payload');
  const flag = bytes[0];
  const body = bytes.subarray(1);
  if ((flag & FLAG_GZIP) !== 0) return unpackPrograms(await unpack(body));
  if ((flag & FLAG_DEFLATE_RAW) !== 0) return unpackPrograms(await inflateRaw(body));
  return unpackPrograms(body);
}

/** A finished session: the same plan, plus what was logged. */
export async function encodeSession(state: WorkoutState): Promise<string> {
  return encodeBinary([state.program], performedFrom(state));
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

/** The deflate stream with no wrapper at all. `null` when this platform cannot do it. */
async function deflateRaw(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === 'undefined') return null;
  try {
    const stream = new Blob([bytes.slice()]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null; // older Safari: the link simply travels raw
  }
}

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes.slice()]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
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

/** Several programs in one link: the same pack, one count in front of them. */
export async function encodePrograms(programs: Program[]): Promise<string> {
  return encodeBinary(programs);
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
  // The binary wire first: it is what this build writes.
  if (payload.startsWith(VERSION_BINARY) && /^[A-Za-z0-9_-]+$/.test(payload.slice(1))) {
    try {
      return await decodeBinary(payload.slice(1));
    } catch {
      return notAProgram();
    }
  }

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
