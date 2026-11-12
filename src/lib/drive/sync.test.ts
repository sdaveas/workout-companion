import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSession } from '../../engine/create';
import { reduce } from '../../engine/reduce';
import type { Program } from '../../engine/types';
import { parseProgram } from '../../schemas/program';
import { db, type SessionRow } from '../../storage/db';
import { buildBackup } from '../backup';
import { EMPTY_STATE, forgetToken, readState, writeState } from './auth';
import { sync } from './sync';

const fixture = readFileSync(new URL('../../fixtures/workout-b.json', import.meta.url), 'utf8');
const parsedFixture = parseProgram(fixture);
if (!parsedFixture.ok) throw new Error('fixture must parse');
const program: Program = { ...parsedFixture.program, updatedAt: 111 };

const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const FILES = 'https://www.googleapis.com/drive/v3/files';

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

/** GIS is stubbed so a token arrives without a script tag or a popup. */
function stubGoogle() {
  vi.stubGlobal('window', {
    google: {
      accounts: {
        oauth2: {
          initTokenClient: (config: { callback: (r: { access_token: string }) => void }) => ({
            requestAccessToken: () => config.callback({ access_token: 'token' }),
          }),
        },
      },
    },
    setTimeout,
    clearTimeout,
  });
}

function sessionRow(id: string, updatedAt: number): SessionRow {
  const state = reduce(createSession(program, updatedAt, id), { type: 'START', now: updatedAt });
  return {
    id,
    stateVersion: 1,
    programId: state.programId,
    programName: state.program.name,
    status: state.status,
    startedAt: updatedAt,
    finishedAt: null,
    state,
  };
}

type Handler = (url: string, method: string) => {
  status?: number;
  body?: unknown;
  text?: string;
  etag?: string;
};

function stubDrive(handler: Handler) {
  const calls: Array<{ url: string; method: string; body?: string }> = [];
  vi.stubGlobal('fetch', async (input: string, init: { method?: string; body?: string } = {}) => {
    const url = String(input);
    const method = init.method ?? 'GET';
    calls.push({ url, method, body: init.body });
    const reply = handler(url, method);
    const status = reply.status ?? 200;
    const headers = new Headers(reply.etag ? { etag: reply.etag } : {});
    return {
      ok: status >= 200 && status < 300,
      status,
      headers,
      json: async () => reply.body ?? {},
      text: async () => reply.text ?? JSON.stringify(reply.body ?? {}),
    } as unknown as Response;
  });
  return calls;
}

/** Folder search, file search, then the media download. */
function located(remote: { text: string; etag: string } | null): Handler {
  return (url) => {
    if (url.startsWith(`${FILES}?q=`)) {
      if (url.includes('application%2Fvnd.google-apps.folder')) {
        return { body: { files: [{ id: 'folder' }] } };
      }
      return { body: { files: remote ? [{ id: 'file' }] : [] } };
    }
    if (url.startsWith(`${FILES}/file?alt=media`)) {
      return remote ? { text: remote.text, etag: remote.etag } : { status: 404, text: 'gone' };
    }
    if (url.startsWith(UPLOAD)) return { body: { id: 'file' } };
    return { status: 404, text: `unexpected ${url}` };
  };
}

const uploads = (calls: Array<{ url: string; method: string; body?: string }>) =>
  calls.filter((call) => call.url.startsWith(UPLOAD) && call.method !== 'GET');

beforeEach(async () => {
  vi.unstubAllGlobals();
  forgetToken();
  await db.sessions.clear();
  await db.programs.clear();
  vi.stubGlobal('localStorage', memoryStorage());
  stubGoogle();
  writeState({ ...EMPTY_STATE, connected: true });
});

describe('sync', () => {
  it('does nothing when Drive is not connected', async () => {
    writeState(EMPTY_STATE);
    const calls = stubDrive(located(null));
    const result = await sync();
    expect(result.status).toBe('not-connected');
    expect(calls).toHaveLength(0);
  });

  it('refuses to overwrite a remote file it cannot read', async () => {
    const calls = stubDrive(located({ text: 'not a backup', etag: '"a"' }));
    const result = await sync();
    expect(result.status).toBe('failed');
    if (result.status === 'failed') expect(result.error).toContain('Left the Drive copy alone');
    expect(uploads(calls)).toHaveLength(0);
    expect(readState().lastError).toContain('Left the Drive copy alone');
  });

  it('skips the push when only exportedAt differs', async () => {
    await db.programs.put(program);
    const remote = buildBackup([program], [], 999);
    const calls = stubDrive(located({ text: JSON.stringify(remote), etag: '"a"' }));

    const result = await sync();

    expect(result).toMatchObject({ status: 'ok', pulled: false });
    expect(uploads(calls)).toHaveLength(0);
    expect(readState().lastSyncedAt).not.toBeNull();
  });

  it('pushes once when the remote is behind', async () => {
    await db.programs.put(program);
    const remote = buildBackup([], [], 999);
    const calls = stubDrive(located({ text: JSON.stringify(remote), etag: '"a"' }));

    const result = await sync();

    expect(result).toMatchObject({ status: 'ok', pulled: false });
    const sent = uploads(calls);
    expect(sent).toHaveLength(1);
    expect(sent[0].method).toBe('PATCH');
    expect(sent[0].body).toContain(program.id);
  });

  it('answers 412 with one full second pass that re-merges', async () => {
    await db.programs.put(program);
    const first = buildBackup([], [], 999);
    const second = buildBackup([], [sessionRow('s-late', 5000)], 1000);

    let downloads = 0;
    const calls = stubDrive((url, method) => {
      if (url.startsWith(`${FILES}?q=`)) {
        return url.includes('application%2Fvnd.google-apps.folder')
          ? { body: { files: [{ id: 'folder' }] } }
          : { body: { files: [{ id: 'file' }] } };
      }
      if (url.startsWith(`${FILES}/file?alt=media`)) {
        downloads += 1;
        return {
          text: JSON.stringify(downloads === 1 ? first : second),
          etag: downloads === 1 ? '"a"' : '"b"',
        };
      }
      if (url.startsWith(UPLOAD)) {
        return downloads === 1 ? { status: 412, text: 'precondition failed' } : { body: { id: 'file' } };
      }
      return { status: 404, text: `unexpected ${url}` };
    });

    const result = await sync();

    expect(result).toMatchObject({ status: 'ok', pulled: true });
    expect(downloads).toBe(2);
    const sent = uploads(calls);
    expect(sent).toHaveLength(2);
    // The retry pushed the merged body, not the body that lost the race.
    expect(sent[1].body).toContain('s-late');
    expect(await db.sessions.get('s-late')).toBeTruthy();
  });
});
