import { ScreenHeader } from '../components/ui/ScreenHeader';
import { useEffect, useMemo, useRef, useState } from 'react';
import { describeError, parseProgram } from '../schemas/program';
import type { Program } from '../engine/types';
import { uniqueId, uniqueName, withIdentity } from '../lib/identity';
import { COACH_FILE, chatPrompt, chatUrl, extractJsonBlocks } from '../lib/chatPrompt';
import { NO_PROGRAM_HINT } from '../lib/coachBrief';
import { diffPrograms } from '../lib/diffProgram';
import { stashedId, stashedProgram } from '../lib/briefSnapshot';
import { formatDays } from '../lib/format';
import { saveProgram } from '../storage/programs';
import { withDays } from '../lib/schedule';
import { usePrograms } from '../store/programsStore';
import { takeSharedText } from '../lib/device';
import { addLinkHash } from '../lib/programLink';
import { ADD_PRIMARY, ADD_SECONDARY, CopyForApp, showCopyForApp } from '../components/ui/CopyForApp';


/** Every json block in the text, read as a program. Errors come back as words. */
function readPrograms(text: string): { programs: Program[]; error: string | null } {
  const blocks = extractJsonBlocks(text);
  if (blocks.length === 0) {
    return { programs: [], error: NO_PROGRAM_HINT };
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
  // A trip to ChatGPT is why Step 2 exists; mark it so the way back is obvious.
  const [sent, setSent] = useState(false);
  const answer = useRef<HTMLTextAreaElement>(null);
  // A link opened outside the home-screen app on iOS may be in the wrong storage: ask
  // first; "here" makes Add the main action again.
  const [here, setHere] = useState(false);
  const bridge = !!initial && showCopyForApp() && !here;

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

  /** Read a reply, a program, or a program link — whatever came in. */
  function take(raw: string) {
    // A friend's share link (`#/add/…`) is opened here, in this app's storage.
    const link = addLinkHash(raw);
    if (link) {
      window.location.hash = link;
      return;
    }
    setText(raw);
    const result = readPrograms(raw);
    setOffers(result.programs);
    setError(result.error);
  }

  const read = () => take(text);

  /** One tap back from the chat: iOS shows its own "Paste" bubble to allow it. */
  async function pasteClipboard() {
    try {
      take(await navigator.clipboard.readText());
    } catch {
      // Refused or unsupported: the box takes a long-press paste.
      answer.current?.focus();
    }
  }

  // What Android's share sheet handed the installed app (see `parkSharedText`).
  useEffect(() => {
    const shared = takeSharedText();
    if (shared) take(shared);
    // ponytail: run once on arrival; `take` only sets state
  }, []);

  /** A coach reply for a program already saved here: same id means a change, not a copy. */
  const updating =
    offers.length === 1 ? (programs.find((p) => p.id === offers[0].id) ?? null) : null;

  /** The program whose brief was copied last: arriving here is usually about updating it. */
  const updateTarget = useMemo(() => {
    const id = stashedId(window.localStorage);
    return id ? (programs.find((p) => p.id === id) ?? null) : null;
  }, [programs]);

  // The reply is the only thing to do on this visit; the coach card above is history.
  useEffect(() => {
    if (updateTarget) answer.current?.scrollIntoView({ block: 'center' });
  }, [updateTarget]);

  /** What the reply would change, against the program as it was when the brief was copied. */
  const changes = useMemo(() => {
    if (!updating || offers.length !== 1) return null;
    const before = stashedProgram(window.localStorage, updating.id) ?? updating;
    return diffPrograms(before, offers[0]);
  }, [updating, offers]);

  async function add(mode: 'update' | 'copy' = 'update') {
    if (offers.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === 'update' && updating) {
        // The days stay as they were set here: a chat never sees them.
        const next =
          offers[0].scheduleDays.length === 0
            ? withDays(offers[0], updating.scheduleDays)
            : offers[0];
        await saveProgram(next, { replace: true });
        await load();
        usePrograms.setState({ notice: `Program "${next.name}" updated.` });
        window.location.hash = '#/programs';
        return;
      }
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
      <ScreenHeader
        back={initial ? { to: '#/', label: 'Programs' } : { to: '#/programs', label: 'Programs' }}
        title={
          <h1 className="text-sm font-semibold uppercase tracking-widest">
            {initial ? 'Shared program' : 'Paste a program'}
          </h1>
        }
      />

      {!initial && (
        <section className="mt-5 rounded-xl border border-line bg-surface p-4">
          <p className="text-[10px] uppercase tracking-widest text-accent">Step 1</p>
          <h2 className="mt-1 text-lg font-semibold">Talk to a coach</h2>
          <p className="mt-1 text-sm text-muted">
            ChatGPT asks about your goal, days, equipment and time, then hands back one card per
            training day, each followed by that day's program. Copy the whole answer and paste it
            below.
          </p>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              setSent(true);
              // The app keeps its place while the chat opens over it, so Step 2 is
              // already in view when the reader comes back.
              requestAnimationFrame(() => answer.current?.scrollIntoView({ block: 'center' }));
            }}
            className="mt-3 flex h-12 w-full items-center justify-center rounded-xl bg-accent font-semibold text-ink"
          >
            Open ChatGPT
          </a>
          {sent && (
            <button
              type="button"
              onClick={() => {
                answer.current?.scrollIntoView({ block: 'center' });
                answer.current?.focus();
              }}
              className="mt-2 text-xs text-accent underline"
            >
              Back from ChatGPT? Paste it in Step 2.
            </button>
          )}
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

      {bridge && <CopyForApp onHere={() => setHere(true)} />}

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

      {!initial && updateTarget && (
        <p className="mt-4 rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-xs">
          Last sent to your coach: «{updateTarget.name}». A reply that keeps its id updates it —
          you see what changes first. Anything else is added as a copy.
        </p>
      )}

      {!initial && (
        <section
          className={`mt-4 rounded-xl border bg-surface p-4 ${
            (sent || updateTarget) && !text ? 'border-accent ring-2 ring-accent' : 'border-line'
          }`}
        >
          <p className="text-[10px] uppercase tracking-widest text-accent">Step 2</p>
          <h2 className="mt-1 text-lg font-semibold">Paste the answer</h2>
          <p className="mt-1 text-sm text-muted">
            Copy the whole answer in ChatGPT, then tap below. Every program in it is read, a
            three-day week in one go.
          </p>
          <button
            type="button"
            onClick={() => void pasteClipboard()}
            className="mt-3 h-12 w-full rounded-xl bg-accent font-semibold text-ink"
          >
            Paste from clipboard
          </button>
          <textarea
            ref={answer}
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label="The coach's answer"
            placeholder={'**Workout A — Monday**\n7 exercises · approximately 40 minutes\n{"schema_version":1,…}'}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            className="mt-3 h-40 w-full resize-none rounded-lg bg-field p-3 font-mono text-base outline-none focus:ring-2 focus:ring-accent"
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
            className="mt-3 h-12 w-full rounded-xl border border-line text-sm font-semibold disabled:text-muted"
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
          {updating && (
            <>
              {changes && (
                <div className="mt-3 rounded-lg border border-line bg-field px-3 py-2">
                  <p className="text-[10px] uppercase tracking-widest text-muted">What changes</p>
                  {changes.length === 0 ? (
                    <p className="mt-1 text-xs text-muted">
                      Nothing. This is the program you sent, written back as it was.
                    </p>
                  ) : (
                    <ul className="mt-1 space-y-1 text-xs">
                      {changes.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              <p className="mt-3 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-xs">
                This replaces the copy saved here. The days you picked stay as they are.
              </p>
            </>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => void add(updating ? 'update' : 'copy')}
            className={bridge ? ADD_SECONDARY : ADD_PRIMARY}
          >
            {updating
              ? `Update "${updating.name}"`
              : offers.length === 1
                ? 'Add to my routines'
                : `Add all ${offers.length}`}
          </button>
          {updating && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void add('copy')}
              className="mt-2 h-11 w-full text-xs text-muted underline"
            >
              Add a copy instead
            </button>
          )}
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
