import type { Program } from '../engine/types';
import { parseProgram, type ParseResult } from '../schemas/program';
import { EXERCISE_LIBRARY } from '../data/exercises';
import { slug } from '../lib/buildProgram';

/** A program travels inside the link: `#/add/<payload>`. Nothing is hosted, nothing is sent. */
export const SHARE_PATH = '#/add/';

/**
 * Links are read on a phone, so the payload carries the training plan only:
 * name, day, and each exercise's name, sets, reps, weight, per-hand flag and rest.
 * Photos, instructions and notes stay with the sender — they were most of the bytes.
 * The exercise name is sent as an index into the built-in library when we know it.
 */
const VERSION = '1';

type WireExercise = [number | string, number, number, number, number, 0 | 1, number];

const nameCode = (name: string): number | string => {
  const i = EXERCISE_LIBRARY.findIndex((e) => e.name.toLowerCase() === name.trim().toLowerCase());
  return i >= 0 ? i : name.trim();
};

function toWire(program: Program): [string, string, WireExercise[]] {
  return [
    program.name,
    program.scheduleDay ?? '',
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
}

/** Wire → the canonical program JSON the importer accepts. `null` when it is not a program. */
function fromWire(wire: unknown): string | null {
  if (!Array.isArray(wire) || typeof wire[0] !== 'string' || !Array.isArray(wire[2])) return null;
  const [name, day, rows] = wire as [string, unknown, unknown[]];

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

  return JSON.stringify({
    schema_version: 1,
    id: slug(name),
    name,
    ...(typeof day === 'string' && day ? { schedule: { day } } : {}),
    exercises,
  });
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
  const json = JSON.stringify(toWire(program));
  return VERSION + toB64url(await pack(new TextEncoder().encode(json)));
}

async function readPayload(body: string): Promise<unknown> {
  const text = new TextDecoder().decode(await unpack(fromB64url(body)));
  return JSON.parse(text) as unknown;
}

export async function decodeProgram(payload: string): Promise<ParseResult> {
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
      return { ok: false, error: { kind: 'invalid_json', message: 'This is not a program link.' } };
    }
  }

  if (!Array.isArray(data)) return parseProgram(JSON.stringify(data));

  try {
    const json = fromWire(data);
    if (json == null) return { ok: false, error: { kind: 'invalid_json', message: 'This is not a program link.' } };
    return parseProgram(json);
  } catch {
    return { ok: false, error: { kind: 'invalid_json', message: 'That link is from an older version.' } };
  }
}

/**
 * Bump when the link preview card changes. Chat clients cache the unfurl per URL,
 * so a fresh query string is the only way to make them look again; the program
 * itself still lives in the hash and never touches the server.
 */
export const SHARE_VERSION = 2;

export function shareUrl(payload: string, base = location.origin + location.pathname): string {
  return `${base}?v=${SHARE_VERSION}${SHARE_PATH}${payload}`;
}
