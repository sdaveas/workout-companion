/** Running as the home-screen app rather than in a browser tab. */
export function isStandalone(): boolean {
  return (
    matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * iPhone or iPad, in any browser or in-app web view (they all carry the device in the
 * UA; iPadOS poses as a Mac with touch). This is where every app — Safari, the
 * home-screen app, ChatGPT's link browser — keeps its own separate storage.
 */
export function isIOS(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

const SHARED_KEY = 'wc:shared';

/**
 * Android's share sheet opens the installed app at `?text=…&url=…` (the manifest's
 * share_target). Park what came in for the paste screen and drop the query, so a
 * reload does not import it twice.
 */
export function parkSharedText(): void {
  const params = new URLSearchParams(location.search);
  const text = [params.get('title'), params.get('text'), params.get('url')].filter(Boolean).join('\n');
  if (!text) return;
  parkText(text);
  history.replaceState(null, '', `${location.pathname}#/paste`);
}

/** Hand text to the paste screen, which reads it on arrival. */
export function parkText(text: string): void {
  try {
    sessionStorage.setItem(SHARED_KEY, text);
  } catch {
    // ponytail: no storage, nothing to hand over; the paste box still takes it by hand
  }
}

/** The text parked by `parkText`, once. */
export function takeSharedText(): string | null {
  try {
    const text = sessionStorage.getItem(SHARED_KEY);
    sessionStorage.removeItem(SHARED_KEY);
    return text;
  } catch {
    return null;
  }
}
