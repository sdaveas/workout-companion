import { useState, type ReactNode } from 'react';
import { briefChatUrl } from '../../lib/chatPrompt';

/**
 * "Discuss it with a coach": one tap opens ChatGPT with the brief already typed in,
 * the brief also goes on the clipboard, and when the clipboard is refused the text
 * appears on screen to select by hand.
 *
 * Both screens that offer it (a program, a finished session) pass the same way, so the
 * two cannot drift. Whatever comes after — for a program, the paste-it-back step — is
 * `children`.
 */
export function CoachChat({
  brief,
  description,
  openLabel,
  onOpened,
  children,
}: {
  /** Built at tap time: it must reflect the data on screen right now. */
  brief: () => string;
  description: ReactNode;
  openLabel: string;
  /** After the chat opened and the clipboard took it (e.g. move to the paste step). */
  onOpened?: () => void;
  children?: ReactNode;
}) {
  const [copied, setCopied] = useState<'yes' | 'no' | null>(null);
  const [blocked, setBlocked] = useState('');

  /** Returns false when the clipboard refused, which is not an error: the text is shown. */
  async function copy(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      setCopied('yes');
      setBlocked('');
      return true;
    } catch {
      setCopied('no');
      setBlocked(text);
      return false;
    }
  }

  /** One tap: the chat opens, and the brief is already typed into it when it fits. */
  async function open() {
    const text = brief();
    if (!text) return;
    // Open before awaiting anything: iOS drops the tap's activation at the first await,
    // and a window.open without it is silently ignored — the button looks dead.
    window.open(briefChatUrl(text), '_blank', 'noopener');
    const took = await copy(text);
    if (took) onOpened?.();
  }

  return (
    <section className="mt-4 rounded-xl border border-line bg-surface p-4">
      <h2 className="text-sm font-semibold">Discuss it with a coach</h2>
      <p className="mt-1 text-xs text-muted">{description}</p>
      <button
        type="button"
        onClick={() => void open()}
        className="mt-3 flex h-12 w-full items-center justify-center rounded-xl border border-accent text-sm font-semibold text-accent"
      >
        {openLabel}
      </button>
      {copied === 'no' && (
        <>
          <p className="mt-2 text-xs text-muted">
            Copying is blocked here. Select the brief below and paste it by hand.
          </p>
          <textarea
            readOnly
            value={blocked}
            onFocus={(e) => e.currentTarget.select()}
            className="mt-2 h-40 w-full rounded-xl border border-line bg-field p-2 text-xs"
          />
        </>
      )}
      <button
        type="button"
        onClick={() => void copy(brief())}
        className="mt-2 h-11 w-full text-xs text-muted underline"
      >
        Copy it only (for the chat you already have open)
      </button>
      {copied === 'yes' && (
        <p role="status" className="mt-1 text-center text-xs text-accent">
          Copied. Paste it as your next message in the chat.
        </p>
      )}
      {children}
    </section>
  );
}
