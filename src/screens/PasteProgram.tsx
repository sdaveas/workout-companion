import { useMemo, useState } from 'react';
import { describeError, parseProgram } from '../schemas/program';
import type { Program } from '../engine/types';
import { uniqueId, uniqueName, withIdentity } from '../lib/identity';
import { COACH_FILE, chatPrompt, chatUrl, extractJsonBlocks } from '../lib/chatPrompt';
import { formatDays } from '../lib/format';
import { saveProgram } from '../storage/programs';
import { usePrograms } from '../store/programsStore';

/** Every json block in the text, read as a program. Errors come back as words. */
function readPrograms(text: string): { programs: Program[]; error: string | null } {
  const blocks = extractJsonBlocks(text);
  if (blocks.length === 0) {
    return { programs: [], error: 'No program in there. Paste the whole answer, json blocks included.' };
  }
  const programs: Program[] = [];
  const problems: string[] = [];
  for (const block of blocks) {
    const parsed = parseProgram(block);
    if (parsed.ok) programs.push(parsed.program);
    else
      problems.push(
        describeError(parsed.error)
          .slice(0, 3)
          .map((i) => (i.path ? `${i.path}: ${i.message}` : i.message))
          .join('\n'),
      );
  }
  return {
    programs,
    error:
      problems.length === 0
        ? null
        : `${problems.length} of ${blocks.length} could not be read:\n${problems[0]}${
            programs.length > 0 ? `\nThe other ${programs.length} below are fine.` : ''
          }`,
  };
}

/**
 * "Have a coach build the week, paste the answer here." Two cards: a link that starts
 * the interview inside ChatGPT, and a box for what comes back — one program per
 * training day. Nothing is written until the user adds it, and a program that would
 * land on an existing name or id is saved beside it instead of over it.
 *
 * `initial` is a program carried in a shared link: the second card is skipped and the
 * preview opens straight away.
 */
export function PasteProgram({ initial }: { initial?: string }) {
  const programs = usePrograms((s) => s.programs);
  const load = usePrograms((s) => s.load);
  const prompt = useMemo(chatPrompt, []);
  const url = useMemo(chatUrl, []);
  const [copied, setCopied] = useState<'yes' | 'no' | null>(null);
  const [copiedFull, setCopiedFull] = useState<'yes' | 'no' | null>(null);
  const [text, setText] = useState(initial ?? '');
  const [offers, setOffers] = useState<Program[]>(() => (initial ? readPrograms(initial).programs : []));
  const [error, setError] = useState<string | null>(() => (initial ? readPrograms(initial).error : null));
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

  /** The whole coach, for an assistant that cannot open the link on its own. */
  async function copyFull() {
    try {
      const response = await fetch(COACH_FILE);
      if (!response.ok) throw new Error(String(response.status));
      await navigator.clipboard.writeText(await response.text());
      setCopiedFull('yes');
    } catch {
      setCopiedFull('no');
    }
  }

  function read() {
    const result = readPrograms(text);
    setOffers(result.programs);
    setError(result.error);
  }

  async function add() {
    if (offers.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const names = programs.map((p) => p.name);
      const ids = programs.map((p) => p.id);
      const added: string[] = [];
      for (const offer of offers) {
        const name = uniqueName(offer.name, names);
        const program = withIdentity(offer, name, uniqueId(name, ids));
        await saveProgram(program);
        names.push(name);
        ids.push(program.id);
        added.push(name);
      }
      await load();
      usePrograms.setState({
        notice:
          added.length === 1
            ? `Program "${added[0]}" added.`
            : `${added.length} programs added: ${added.join(', ')}.`,
      });
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
        <h1 className="text-sm font-semibold uppercase tracking-widest">
          {initial ? 'Shared program' : 'Paste a program'}
        </h1>
        <span className="w-12" />
      </header>

      {!initial && (
        <section className="mt-5 rounded-xl border border-line bg-surface p-4">
          <p className="text-[10px] uppercase tracking-widest text-accent">Step 1</p>
          <h2 className="mt-1 text-lg font-semibold">Talk to a coach</h2>
          <p className="mt-1 text-sm text-muted">
            ChatGPT asks about your goal, days, equipment and time, then hands back one tappable
            link per training day. Each one opens the app with that session ready to add.
          </p>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 flex h-12 w-full items-center justify-center rounded-xl bg-accent font-semibold text-ink"
          >
            Open ChatGPT
          </a>
          <button
            type="button"
            onClick={() => void copy()}
            className="mt-2 h-12 w-full rounded-xl border border-line text-sm font-semibold"
          >
            Copy the prompt
          </button>
          {copied === 'yes' && (
            <p role="status" className="mt-2 text-xs text-accent">
              Copied. Paste it into any chat assistant, then bring the answer back here.
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
              className="mt-2 h-32 w-full rounded-lg bg-field p-3 font-mono text-base outline-none"
            />
            <button
              type="button"
              onClick={() => void copyFull()}
              className="mt-2 h-11 w-full rounded-lg border border-line text-xs font-semibold"
            >
              Copy the full instructions instead
            </button>
            {copiedFull === 'yes' && (
              <p role="status" className="mt-2 text-xs text-accent">
                Copied the whole coach, for an assistant that cannot open links.
              </p>
            )}
            {copiedFull === 'no' && (
              <p role="status" className="mt-2 text-xs text-danger">
                Could not fetch them.{' '}
                <a href={COACH_FILE} className="underline">
                  Open the file
                </a>{' '}
                and copy it by hand.
              </p>
            )}
          </details>
        </section>
      )}

      {initial && error && (
        <section className="mt-5 rounded-xl border border-line bg-surface p-4">
          <p className="text-sm font-semibold text-danger">This link did not carry a program</p>
          <p className="mt-1 whitespace-pre-line text-xs text-danger">{error}</p>
          <a
            href="#/paste"
            className="mt-3 flex h-12 w-full items-center justify-center rounded-xl border border-line text-sm font-semibold"
          >
            Paste it by hand instead
          </a>
        </section>
      )}

      {!initial && (
        <section className="mt-4 rounded-xl border border-line bg-surface p-4">
          <p className="text-[10px] uppercase tracking-widest text-accent">Step 2</p>
          <h2 className="mt-1 text-lg font-semibold">Paste the answer</h2>
          <p className="mt-1 text-sm text-muted">
            The whole answer: every program in it is read, whether it comes as a card, a link or a
            json block. A three-day week goes in one go.
          </p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label="The coach's answer"
            placeholder={'**Workout A — Monday**\n7 exercises · approximately 40 minutes\nOpen Workout A: https://…'}
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
      )}

      {offers.length > 0 && (
        <section className="mt-4 rounded-xl border border-accent/50 bg-surface p-4">
          <p className="text-[10px] uppercase tracking-widest text-accent">
            {offers.length === 1 ? 'That is a program' : `${offers.length} programs`}
          </p>
          <ul className="mt-2 space-y-3">
            {offers.map((offer) => (
              <li key={offer.id}>
                <p className="text-lg font-semibold">{offer.name}</p>
                <p className="text-xs text-muted">
                  {offer.exercises.length} exercise{offer.exercises.length === 1 ? '' : 's'} ·{' '}
                  {formatDays(offer.scheduleDays)}
                </p>
                {offer.description && <p className="mt-1 text-sm text-muted">{offer.description}</p>}
                {offers.length === 1 && (
                  <ul className="mt-3 space-y-1">
                    {offer.exercises.map((e) => (
                      <li key={e.id} className="flex justify-between text-sm">
                        <span className="truncate">{e.name}</span>
                        <span className="ml-2 shrink-0 text-muted">
                          {e.sets}×
                          {e.reps.min === e.reps.max ? e.reps.min : `${e.reps.min}–${e.reps.max}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
          <button
            type="button"
            disabled={busy}
            onClick={() => void add()}
            className="mt-4 h-12 w-full rounded-xl bg-accent font-semibold text-ink disabled:bg-surface disabled:text-muted"
          >
            {offers.length === 1 ? 'Add to my routines' : `Add all ${offers.length}`}
          </button>
          <button
            type="button"
            onClick={() => setOffers([])}
            className="mt-2 h-11 w-full text-xs text-muted underline"
          >
            Not this one
          </button>
        </section>
      )}
    </main>
  );
}
