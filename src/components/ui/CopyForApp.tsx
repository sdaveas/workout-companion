import { useState } from 'react';
import { isIOS, isStandalone } from '../../lib/device';

/** "Add" is the main action, or waits beside the question below until it is answered. */
export const ADD_PRIMARY =
  'mt-4 h-12 w-full rounded-xl bg-accent font-semibold text-ink disabled:bg-surface disabled:text-muted';
export const ADD_SECONDARY =
  'mt-4 h-12 w-full rounded-xl border border-line text-sm font-semibold disabled:text-muted';

/**
 * On iOS every web app keeps its own storage: Safari, the home-screen app and a chat
 * app's link browser. A program link opened outside the home-screen app cannot reach
 * that app's data — only the clipboard can. Whether the reader has the app is
 * something the page cannot tell, so it asks.
 */
export function showCopyForApp(): boolean {
  return isIOS() && !isStandalone();
}

const CHOICE = 'h-12 flex-1 rounded-xl border border-accent px-2 text-sm font-semibold text-accent';

export function CopyForApp({ onHere }: { onHere: () => void }) {
  const [copied, setCopied] = useState<'yes' | 'no' | null>(null);
  if (!showCopyForApp()) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(location.href);
      setCopied('yes');
    } catch {
      setCopied('no');
    }
  }

  return (
    <section className="mt-4 rounded-xl border border-accent/50 bg-surface p-4">
      <p className="text-sm font-semibold">Where do you use Workout Companion?</p>
      <p className="mt-1 text-xs text-muted">
        On iPhone the home-screen app keeps its own storage, so a program added here would not
        show up there.
      </p>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => void copy()} className={CHOICE}>
          Home-screen app
        </button>
        <button type="button" onClick={onHere} className={CHOICE}>
          This browser
        </button>
      </div>
      {copied === 'yes' && (
        <p role="status" className="mt-2 text-xs text-accent">
          Copied. Open Workout Companion and go to Programs → + → Paste a link.
        </p>
      )}
      {copied === 'no' && (
        <p role="status" className="mt-2 text-xs text-danger">
          Copy was blocked. Press and hold the address bar to copy the link instead.
        </p>
      )}
    </section>
  );
}
