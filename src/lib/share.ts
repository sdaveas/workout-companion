import type { Program } from '../engine/types';
import { parseProgram, type ParseResult } from '../schemas/program';

/** A program travels inside the link: `#/add/<payload>`. Nothing is hosted, nothing is sent. */
export const SHARE_PATH = '#/add/';

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
  // The canonical snake_case JSON, minified — `raw` is pretty-printed and costs ~700 bytes.
  const json = JSON.stringify(JSON.parse(program.raw) as unknown);
  return toB64url(await pack(new TextEncoder().encode(json)));
}

export async function decodeProgram(payload: string): Promise<ParseResult> {
  let text: string;
  try {
    text = new TextDecoder().decode(await unpack(fromB64url(payload)));
  } catch {
    return { ok: false, error: { kind: 'invalid_json', message: 'This is not a program link.' } };
  }
  return parseProgram(text);
}

export function shareUrl(payload: string, base = location.origin + location.pathname): string {
  return `${base}${SHARE_PATH}${payload}`;
}
