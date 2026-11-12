import { useState } from 'react';
import { ScreenHeader } from '../components/ui/ScreenHeader';

/**
 * Phase 0 spike for the Google Drive sync design (docs/designs/google-drive-sync.md).
 * Throwaway: it exists to answer four questions on a real iPhone, then it is deleted.
 */

const GIS = 'https://accounts.google.com/gsi/client';
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const CLIENT_KEY = 'wc:spikeClientId';

type Token = { access_token?: string; error?: string; scope?: string };

interface TokenClient {
  requestAccessToken: (over?: { prompt?: string }) => void;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (r: Token) => void;
            error_callback?: (e: { type?: string; message?: string }) => void;
          }) => TokenClient;
        };
      };
    };
  }
}

let gisLoad: Promise<void> | null = null;

/** Injected on demand: a boot-time cross-origin script would stall an offline start. */
function loadGis(): Promise<void> {
  gisLoad ??= new Promise<void>((resolve, reject) => {
    if (window.google?.accounts.oauth2) return resolve();
    const script = document.createElement('script');
    script.src = GIS;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('script blocked or offline'));
    document.head.appendChild(script);
  });
  return gisLoad;
}

function token(clientId: string, silent: boolean, timeoutMs: number): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    if (!window.google?.accounts.oauth2) return reject(new Error('GIS not loaded'));
    const timer = window.setTimeout(
      () => reject(new Error(`no callback in ${timeoutMs / 1000}s`)),
      timeoutMs,
    );
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (r) => {
        window.clearTimeout(timer);
        if (r.error) return reject(new Error(r.error));
        if (!r.access_token) return reject(new Error('no access_token'));
        resolve(r.access_token);
      },
      error_callback: (e) => {
        window.clearTimeout(timer);
        reject(new Error(`${e.type ?? 'error'}: ${e.message ?? 'no message'}`));
      },
    });
    client.requestAccessToken({ prompt: silent ? 'none' : '' });
  });
}

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

async function driveTest(t: string): Promise<string> {
  const q = encodeURIComponent(
    "name = 'Workout Companion' and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
  );
  const found = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&orderBy=modifiedTime desc`,
    { headers: auth(t) },
  );
  if (!found.ok) throw new Error(`list folders: ${found.status} ${await found.text()}`);
  const folders = (await found.json()) as { files?: Array<{ id: string }> };
  let folderId = folders.files?.[0]?.id;
  if (!folderId) {
    const made = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: { ...auth(t), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Workout Companion',
        mimeType: 'application/vnd.google-apps.folder',
      }),
    });
    if (!made.ok) throw new Error(`create folder: ${made.status} ${await made.text()}`);
    folderId = ((await made.json()) as { id: string }).id;
  }

  const made = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { ...auth(t), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'workout-companion-backup.json',
      parents: [folderId],
      mimeType: 'application/json',
    }),
  });
  if (!made.ok) throw new Error(`create file: ${made.status} ${await made.text()}`);
  const fileId = ((await made.json()) as { id: string }).id;

  const body = JSON.stringify({ hello: 'from the phone', at: Date.now() });
  const wrote = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
    { method: 'PATCH', headers: { ...auth(t), 'Content-Type': 'application/json' }, body },
  );
  if (!wrote.ok) throw new Error(`write: ${wrote.status} ${await wrote.text()}`);

  const read = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: auth(t),
  });
  if (!read.ok) throw new Error(`read: ${read.status} ${await read.text()}`);
  const back = await read.text();
  return back === body ? `wrote and read back ${body.length} bytes` : `read back differs: ${back.slice(0, 80)}`;
}

export function DriveSpike() {
  const [clientId, setClientId] = useState(() => localStorage.getItem(CLIENT_KEY) ?? '');
  const [lines, setLines] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const installed =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;

  const log = (text: string) =>
    setLines((prev) => [`${new Date().toLocaleTimeString()} ${text}`, ...prev]);

  async function run(label: string, work: () => Promise<string>) {
    setBusy(true);
    log(`${label}…`);
    const started = performance.now();
    try {
      log(`${label}: ${await work()} (${Math.round(performance.now() - started)}ms)`);
    } catch (err) {
      log(`${label} FAILED: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  const save = (id: string) => {
    setClientId(id);
    localStorage.setItem(CLIENT_KEY, id);
  };

  const withToken = (silent: boolean, work: (t: string) => Promise<string>) => async () => {
    await loadGis();
    const t = await token(clientId, silent, silent ? 30_000 : 120_000);
    log(`token: ${t.length} chars, starts ${t.slice(0, 6)}…`);
    return work(t);
  };

  return (
    <main className="mx-auto max-w-md px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]">
      <ScreenHeader
        back={{ to: '#/settings', label: 'Settings' }}
        title={<h1 className="text-sm font-semibold uppercase tracking-widest">Drive spike</h1>}
      />

      <p className="mt-4 rounded-xl border border-line bg-surface p-3 text-xs text-muted">
        {installed ? 'Installed app' : 'Browser tab'} · {navigator.userAgent.slice(0, 70)}
      </p>

      <label className="mt-4 block text-xs uppercase tracking-widest text-muted" htmlFor="cid">
        OAuth client ID
      </label>
      <input
        id="cid"
        value={clientId}
        onChange={(e) => save(e.target.value)}
        placeholder="1234-abc.apps.googleusercontent.com"
        className="mt-1 h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
      />

      <div className="mt-3 grid gap-2">
        <button
          type="button"
          disabled={busy || !clientId}
          onClick={() => void run('Request token', withToken(false, async (t) => `ok, ${t.length} chars`))}
          className="h-12 rounded-xl bg-accent font-semibold text-ink disabled:opacity-50"
        >
          Request token
        </button>
        <button
          type="button"
          disabled={busy || !clientId}
          onClick={() => void run('Silent re-auth', withToken(true, async (t) => `ok, ${t.length} chars`))}
          className="h-12 rounded-xl border border-line text-sm disabled:opacity-50"
        >
          Silent re-auth
        </button>
        <button
          type="button"
          disabled={busy || !clientId}
          onClick={() => void run('Drive write and read', withToken(true, driveTest))}
          className="h-12 rounded-xl border border-line text-sm disabled:opacity-50"
        >
          Write and read a test file
        </button>
      </div>

      <p className="mt-3 text-xs text-muted">
        Request token first, then reload the app and press Silent re-auth. Then Write and read.
      </p>

      <pre className="mt-4 whitespace-pre-wrap break-words rounded-xl border border-line bg-surface p-3 text-[11px] leading-relaxed">
        {lines.length === 0 ? 'No log yet.' : lines.join('\n')}
      </pre>
    </main>
  );
}
