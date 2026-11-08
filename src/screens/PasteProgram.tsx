import { useMemo, useState } from 'react';
import { describeError, parseProgram } from '../schemas/program';
import type { Program } from '../engine/types';
import { uniqueId, uniqueName, withIdentity } from '../lib/identity';
import { chatPrompt, extractJson } from '../lib/chatPrompt';
import { EXERCISE_LIBRARY } from '../data/exercises';
import { formatDays } from '../lib/format';
import { saveProgram } from '../storage/programs';
import { usePrograms } from '../store/programsStore';

/**
 * "Ask a chat model for a program, paste the answer here." Two cards: the prompt to
 * copy, and a box for what comes back. Nothing is written until the user adds it, and
 * a program that would land on an existing name or id is saved beside it instead of
 * over it.
 */
export function PasteProgram() {
  const programs = usePrograms((s) => s.programs);
  const load = usePrograms((s) => s.load);
  const prompt = useMemo(chatPrompt, []);
  const [copied, setCopied] = useState<'yes' | 'no' | null>(null);
  const [text, setText] = useState('');
  const [offer, setOffer] = useState<Program | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied('yes');
    } catch {
      // No clipboard permission: the prompt is on screen to select by hand.
      setCopied('no');
    }
  }

  function read() {
    setError(null);
    setOffer(null);
    const json = extractJson(text);
    if (!json) {
      setError('That is not JSON. Paste the whole answer, braces included.');
      return;
    }
    const parsed = parseProgram(json);
    if (!parsed.ok) {
      setError(
        describeError(parsed.error)
          .slice(0, 4)
          .map((i) => (i.path ? `${i.path}: ${i.message}` : i.message))
          .join('\n'),
      );
      return;
    }
    setOffer(parsed.program);
  }

  async function add() {
    if (!offer) return;
    setBusy(true);
    setError(null);
    try {
      const name = uniqueName(offer.name, programs.map((p) => p.name));
      const program = withIdentity(offer, name, uniqueId(name, programs.map((p) => p.id)));
      await saveProgram(program);
      await load();
      usePrograms.setState({ notice: `Program "${program.name}" added.` });
      window.location.hash = '#/programs';
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-md px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]">
      <header className="flex items-center justify-between">
        <a href="#/programs" className="flex min-h-11 min-w-11 items-center text-sm text-muted">
          ← Programs
        </a>
        <h1 className="text-sm font-semibold uppercase tracking-widest">Paste a program</h1>
        <span className="w-12" />
      </header>

      <section className="mt-5 rounded-xl border border-line bg-surface p-4">
        <p className="text-[10px] uppercase tracking-widest text-accent">Step 1</p>
        <h2 className="mt-1 text-lg font-semibold">Ask for a program</h2>
        <p className="mt-1 text-sm text-muted">
          The prompt spells out the format and the {EXERCISE_LIBRARY.length} exercise names this app
          knows, so the answer imports without edits.
        </p>
        <button
          type="button"
          onClick={() => void copy()}
          className="mt-3 h-12 w-full rounded-xl border border-line text-sm font-semibold"
        >
          Copy the prompt
        </button>
        {copied === 'yes' && (
          <p role="status" className="mt-2 text-xs text-accent">
            Copied. Paste it into ChatGPT, then bring the answer back here.
          </p>
        )}
        {copied === 'no' && (
          <p role="status" className="mt-2 text-xs text-danger">
            Copy was blocked. Open the prompt below and select it by hand.
          </p>
        )}
        <details className="mt-3">
          <summary className="min-h-11 cursor-pointer text-xs uppercase tracking-widest text-muted">
            Show the prompt
          </summary>
          <textarea
            readOnly
            value={prompt}
            aria-label="The prompt to paste into ChatGPT"
            className="mt-2 h-56 w-full rounded-lg bg-field p-3 font-mono text-base outline-none"
          />
        </details>
      </section>

      <section className="mt-4 rounded-xl border border-line bg-surface p-4">
        <p className="text-[10px] uppercase tracking-widest text-accent">Step 2</p>
        <h2 className="mt-1 text-lg font-semibold">Paste the answer</h2>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="The program JSON"
          placeholder={'{\n  "schema_version": 1,\n  …\n}'}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          className="mt-3 h-40 w-full rounded-lg bg-field p-3 font-mono text-base outline-none focus:ring-2 focus:ring-accent"
        />
        {error && (
          <p
            role="alert"
            className="mt-2 whitespace-pre-line rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger"
          >
            {error}
          </p>
        )}
        <button
          type="button"
          disabled={!text.trim()}
          onClick={read}
          className="mt-3 h-12 w-full rounded-xl bg-accent font-semibold text-ink disabled:bg-surface disabled:text-muted"
        >
          Read it
        </button>
      </section>

      {offer && (
        <section className="mt-4 rounded-xl border border-accent/50 bg-surface p-4">
          <p className="text-[10px] uppercase tracking-widest text-accent">That is a program</p>
          <p className="mt-1 text-lg font-semibold">{offer.name}</p>
          <p className="text-xs text-muted">
            {offer.exercises.length} exercise{offer.exercises.length === 1 ? '' : 's'} ·{' '}
            {formatDays(offer.scheduleDays)}
          </p>
          {offer.description && <p className="mt-2 text-sm text-muted">{offer.description}</p>}
          <ul className="mt-3 space-y-1">
            {offer.exercises.map((e) => (
              <li key={e.id} className="flex justify-between text-sm">
                <span className="truncate">{e.name}</span>
                <span className="ml-2 shrink-0 text-muted">
                  {e.sets}×{e.reps.min === e.reps.max ? e.reps.min : `${e.reps.min}–${e.reps.max}`}
                </span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            disabled={busy}
            onClick={() => void add()}
            className="mt-4 h-12 w-full rounded-xl bg-accent font-semibold text-ink disabled:bg-surface disabled:text-muted"
          >
            Add to my routines
          </button>
          <button
            type="button"
            onClick={() => setOffer(null)}
            className="mt-2 h-11 w-full text-xs text-muted underline"
          >
            Not this one
          </button>
        </section>
      )}
    </main>
  );
}
