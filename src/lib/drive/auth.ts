import { now } from '../../engine/ids';
import { CLIENT_ID, SCOPE, STATE_KEY, TOKEN_KEY } from './config';

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
 * Tokens last about an hour, so they are kept in localStorage: an app opened
 * within the hour then syncs without touching Google at all. In an installed
 * iOS app there is no other way — see `NeedsTap`.
 */
const TOKEN_TTL_MS = 50 * 60_000;
let cached: { value: string; expiresAt: number } | null = null;

/** Google's popup needs a tap. A cold start has none, so this is not an error. */
export class NeedsTap extends Error {
  constructor() {
    super('Tap Sync now to reconnect to Google Drive.');
  }
}

function hasActivation(): boolean {
  const ua = (navigator as Navigator & { userActivation?: { isActive?: boolean } }).userActivation;
  return ua?.isActive !== false;
}

function stored(): { value: string; expiresAt: number } | null {
  if (cached) return cached;
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { value?: unknown; expiresAt?: unknown };
    if (typeof parsed.value !== 'string' || typeof parsed.expiresAt !== 'number') return null;
    if (now() >= parsed.expiresAt) return null;
    cached = { value: parsed.value, expiresAt: parsed.expiresAt };
    return cached;
  } catch {
    return null;
  }
}

/** `silent: true` shows no consent UI; it only works once this Google account has granted access. */
export async function requestToken(opts: { silent: boolean }): Promise<string> {
  const existing = stored();
  if (existing) return existing.value;
  if (opts.silent && !hasActivation()) throw new NeedsTap();

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
        // A blocked popup is not a failure the user can act on beyond tapping again.
        if (e.type === 'popup_closed' || e.type === 'popup_failed_to_open') return reject(new NeedsTap());
        reject(new Error(`${e.type ?? 'error'}: ${e.message ?? 'no message'}`));
      },
    });
    client.requestAccessToken({ prompt: opts.silent ? 'none' : '' });
  });

  cached = { value, expiresAt: now() + TOKEN_TTL_MS };
  try {
    localStorage.setItem(TOKEN_KEY, JSON.stringify(cached));
  } catch {
    // Private mode: the token still works until this page goes away.
  }
  return value;
}

/** True while a token from this session or the last hour is still good. */
export function hasToken(): boolean {
  return stored() !== null;
}

/** Called when Drive answers 401: the token died early, ask again. */
export function forgetToken(): void {
  cached = null;
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Nothing to clear.
  }
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
