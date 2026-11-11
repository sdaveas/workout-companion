/** Where the app lives for everyone who is not on localhost. Links are written to it. */
export const APP_URL = 'https://sdaveas.github.io/workout-companion/';

/**
 * A program carried in a link. Chat clients and browsers percent-encode the hash on
 * their own schedule, so take it either way — a bare "%" in a lift name must not throw.
 */
export function decodeLinkPayload(param: string): string {
  try {
    return decodeURIComponent(param);
  } catch {
    return param;
  }
}

/**
 * The `#/add/…` hash of a friend's share link inside pasted text, or null. Pasting
 * the link in the app opens it there, in the app's own storage.
 */
export function addLinkHash(text: string): string | null {
  return text.match(/#\/add\/[\w-]+/)?.[0] ?? null;
}
