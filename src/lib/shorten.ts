/**
 * Short share links, when the optional worker in `worker/` is deployed.
 *
 * Empty means off: every share falls back to the full link, which is the only state
 * that works with no backend at all. See `worker/README.md`.
 */
const SHORTENER = '';

/**
 * The link, shortened when the worker answers quickly. Never throws: a share is not
 * worth blocking on a network call, so a slow or missing worker just means the long
 * link goes out.
 */
export async function shorten(url: string): Promise<string | null> {
  if (!SHORTENER) return null;
  try {
    const response = await fetch(SHORTENER, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ u: url }),
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { s?: unknown };
    return typeof body.s === 'string' && body.s.startsWith('https://') ? body.s : null;
  } catch {
    return null;
  }
}
