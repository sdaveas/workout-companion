import { CLIENT_ID, SCOPE } from './config';

/**
 * Google Identity Services, loaded on demand. The script is injected on first
 * use, never at boot: a cross-origin script in <head> would stall an offline
 * start behind a request that can only fail.
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

const TOKEN_TTL_MS = 50 * 60_000;
let cached: { value: string; expiresAt: number } | null = null;

/**
 * Always called from a button, so the popup is allowed to open. The token is
 * kept for this visit only: two buttons pressed a minute apart ask Google once,
 * and nothing is stored on the device.
 */
export async function getToken(): Promise<string> {
  if (cached && performance.now() < cached.expiresAt) return cached.value;

  await loadGis();
  const value = await new Promise<string>((resolve, reject) => {
    if (!window.google?.accounts.oauth2) return reject(new Error('Google sign-in did not load.'));
    const timer = window.setTimeout(
      () => reject(new Error('Google did not answer. Try again.')),
      120_000,
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
        if (e.type === 'popup_closed' || e.type === 'popup_failed_to_open') {
          return reject(new Error('Google needs the window to stay open. Try again.'));
        }
        reject(new Error(`${e.type ?? 'error'}: ${e.message ?? 'no message'}`));
      },
    });
    client.requestAccessToken({ prompt: '' });
  });

  cached = { value, expiresAt: performance.now() + TOKEN_TTL_MS };
  return value;
}

export function forgetToken(): void {
  cached = null;
}
