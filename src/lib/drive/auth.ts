import { CLIENT_ID, SCOPE, STATE_KEY } from './config';

/**
 * Google Identity Services, loaded on demand.
 *
 * The script is injected on first use rather than at boot: a cross-origin
 * script in <head> would delay an offline start behind a request that can only
 * fail.
 */

const GIS = 'https://accounts.google.com/gsi/client';

type TokenResponse = { access_token?: string; error?: string };

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
            callback: (r: TokenResponse) => void;
            error_callback?: (e: { type?: string; message?: string }) => void;
          }) => TokenClient;
        };
      };
    };
  }
}

let gisLoad: Promise<void> | null = null;

function loadGis(): Promise<void> {
  gisLoad ??= new Promise<void>((resolve, reject) => {
    if (window.google?.accounts.oauth2) return resolve();
    const script = document.createElement('script');
    script.src = GIS;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not reach Google. Are you offline?'));
    document.head.appendChild(script);
  });
  return gisLoad;
}

/**
 * Tokens last about an hour. Kept in memory only, so a cold start asks Google
 * again — silently, which Phase 0 measured at under 2 seconds.
 */
const TOKEN_TTL_MS = 50 * 60_000;
let cached: { value: string; expiresAt: number } | null = null;

/** `silent: true` shows no consent UI; it only works once this Google account has granted access. */
export async function requestToken(opts: { silent: boolean }): Promise<string> {
  if (cached && performance.now() < cached.expiresAt) return cached.value;

  await loadGis();
  const value = await new Promise<string>((resolve, reject) => {
    if (!window.google?.accounts.oauth2) return reject(new Error('Google sign-in did not load.'));
    const timer = window.setTimeout(
      () => reject(new Error('Google did not answer. Try again.')),
      opts.silent ? 30_000 : 120_000,
    );
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: (r) => {
        window.clearTimeout(timer);
        if (r.error) return reject(new Error(r.error));
        if (!r.access_token) return reject(new Error('Google returned no token.'));
        resolve(r.access_token);
      },
      error_callback: (e) => {
        window.clearTimeout(timer);
        reject(new Error(`${e.type ?? 'error'}: ${e.message ?? 'no message'}`));
      },
    });
    client.requestAccessToken({ prompt: opts.silent ? 'none' : '' });
  });

  // performance.now(), not the wall clock: a TTL wants a monotonic clock.
  cached = { value, expiresAt: performance.now() + TOKEN_TTL_MS };
  return value;
}

/** Called when Drive answers 401: the token died early, ask again. */
export function forgetToken(): void {
  cached = null;
}

export interface DriveState {
  connected: boolean;
  lastSyncedAt: number | null;
  lastError: string | null;
}

export const EMPTY_STATE: DriveState = {
  connected: false,
  lastSyncedAt: null,
  lastError: null,
};

export function readState(): DriveState {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return EMPTY_STATE;
    const parsed = JSON.parse(raw) as Partial<DriveState>;
    return { ...EMPTY_STATE, ...parsed, connected: parsed.connected === true };
  } catch {
    return EMPTY_STATE;
  }
}

export function writeState(next: DriveState): void {
  localStorage.setItem(STATE_KEY, JSON.stringify(next));
}
