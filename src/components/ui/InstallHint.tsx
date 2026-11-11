import { useState } from 'react';
import { isIOS, isStandalone } from '../../lib/device';

const KEY = 'wc:installHintDismissed';

/** iOS install instructions + the limits that matter (no JS while suspended). */
export function InstallHint() {
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(KEY) === '1');

  // The steps (Share → Add to Home Screen) are iOS's; elsewhere the browser offers install.
  if (dismissed || !isIOS() || isStandalone()) return null;

  return (
    <section className="mt-8 border-t border-line pt-4">
      <p className="text-xs uppercase tracking-widest text-muted">Install</p>
      <p className="mt-2 text-sm">
        In Safari: Share → <span className="text-white">Add to Home Screen</span>. Works
        offline after the first load.
      </p>
      <p className="mt-2 text-xs text-muted">
        iOS pauses apps in the background; the rest timer is timestamp-based, so it is still
        correct when you come back. No vibration on iPhone — the on-screen alert is the
        signal.
      </p>
      <button
        type="button"
        onClick={() => {
          localStorage.setItem(KEY, '1');
          setDismissed(true);
        }}
        className="mt-3 min-h-11 text-sm text-muted underline"
      >
        Dismiss
      </button>
    </section>
  );
}
