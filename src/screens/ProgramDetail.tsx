import { ScreenHeader } from '../components/ui/ScreenHeader';
import { useState } from 'react';
import { navigate } from '../hooks/useHashRoute';
import { usePrograms } from '../store/programsStore';
import { useSession } from '../store/sessionStore';
import { figureSlug } from '../data/exerciseFigures';
import { ExerciseMotion } from '../components/exercise/ExerciseMotion';
import { Banner } from '../components/ui/Banner';
import { formatDays, formatWeight } from '../lib/format';
import { BRIEF_MAX_SESSIONS, coachBrief } from '../lib/coachBrief';
import { briefChatUrl } from '../lib/chatPrompt';
import { stashProgram } from '../lib/briefSnapshot';
import { shareProgram } from '../lib/shareProgram';

/**
 * A saved program, read-only: what is in it, what it looks like, and a way to start.
 * The drawing is a static frame — this is a list, not a workout.
 */
export function ProgramDetail({ id }: { id: string }) {
  const program = usePrograms((s) => s.programs.find((p) => p.id === id) ?? null);
  const prepareWorkout = useSession((s) => s.prepareWorkout);
  const error = useSession((s) => s.error);
  const clearError = useSession((s) => s.clearError);
  const history = useSession((s) => s.history);
  const [starting, setStarting] = useState(false);
  const [copied, setCopied] = useState<'yes' | 'no' | null>(null);
  const [blocked, setBlocked] = useState('');
  const [shareNote, setShareNote] = useState<string | null>(null);

  /** The share sheet on a phone; the clipboard (and a note saying so) elsewhere. */
  async function share() {
    if (!program) return;
    try {
      setShareNote(await shareProgram(program));
    } catch (err) {
      setShareNote(err instanceof Error ? err.message : String(err));
    }
  }

  function currentBrief(): string {
    if (!program) return '';
    // Baselines the diff: the coach's reply is compared with what was actually sent.
    stashProgram(window.localStorage, program);
    return coachBrief({ program, sessions: history });
  }

  async function copyBrief(brief: string) {
    try {
      await navigator.clipboard.writeText(brief);
      setCopied('yes');
      setBlocked('');
      return true;
    } catch {
      // No clipboard permission: the brief goes on screen to select by hand.
      setCopied('no');
      setBlocked(brief);
      return false;
    }
  }

  /** One tap: the chat opens, and the brief is already typed into it when it fits. */
  async function openCoach() {
    const brief = currentBrief();
    if (!brief) return;
    const copied = await copyBrief(brief);
    window.open(briefChatUrl(brief), '_blank', 'noopener');
    // The way back is a paste, so the app waits on the paste step. When copying was
    // refused the brief is on this screen to select by hand, so stay.
    if (copied && program) navigate(`#/paste/${program.id}`);
  }

  async function copyOnly() {
    const brief = currentBrief();
    if (brief) await copyBrief(brief);
  }

  async function start() {
    if (!program) return;
    setStarting(true);
    const ok = await prepareWorkout(program.id);
    setStarting(false);
    if (ok) navigate('#/session');
  }

  if (!program) {
    return (
      <main className="mx-auto max-w-md px-5 pt-[max(1rem,env(safe-area-inset-top))]">
        <ScreenHeader back={{ to: '#/programs', label: 'Programs', compact: true }} />
        <p className="mt-6 text-sm text-muted">That program is not saved here.</p>
      </main>
    );
  }

  const sets = program.exercises.reduce((n, e) => n + e.sets, 0);

  return (
    <main className="mx-auto max-w-md px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      <ScreenHeader
        back={{ to: '#/programs', label: 'Programs', compact: true }}
        actions={
          <button
            type="button"
            onClick={() => void share()}
            className="h-11 rounded-xl border border-line px-4 text-sm"
          >
            Share
          </button>
        }
      />
      {shareNote && (
        <p role="status" className="mt-2 text-xs text-accent">
          {shareNote}
        </p>
      )}
      <h1 className="mt-3 text-2xl font-semibold">{program.name}</h1>
      <p className="mt-1 text-sm text-muted">
        {program.exercises.length} exercise{program.exercises.length === 1 ? '' : 's'} · {sets} sets ·{' '}
        {program.scheduleDays.length > 0 ? formatDays(program.scheduleDays) : 'no fixed day'}
      </p>
      {program.description && <p className="mt-3 text-sm text-muted">{program.description}</p>}

      {error && <Banner message={error} onDismiss={clearError} />}

      <ul className="mt-5 space-y-3">
        {program.exercises.map((exercise) => {
          const slug = figureSlug(exercise.name);
          return (
            // A thumbnail beside the numbers: full-width art made six lifts six screens.
            <li key={exercise.id} className="flex gap-3 rounded-xl border border-line bg-surface p-3">
              {slug ? (
                <ExerciseMotion slug={slug} className="h-24 w-24 shrink-0" />
              ) : (
                <div
                  aria-hidden
                  className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl border border-line bg-ink text-muted"
                >
                  <svg viewBox="0 0 64 64" className="h-10 w-10" fill="none" stroke="currentColor" strokeWidth="4">
                    <path d="M8 32h48M14 24v16M50 24v16M22 28v8M42 28v8" strokeLinecap="round" />
                  </svg>
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-medium leading-tight">{exercise.name}</p>
                <p className="mt-1 text-sm text-muted">
                  {exercise.sets} ×{' '}
                  {exercise.reps.min === exercise.reps.max
                    ? exercise.reps.min
                    : `${exercise.reps.min}–${exercise.reps.max}`}
                </p>
                <p className="text-xs text-muted">
                  {formatWeight(exercise.weightKg, exercise.perHand)} · {exercise.restSeconds}s rest
                </p>
                {exercise.instructions.length > 0 && (
                  <details className="mt-1">
                    <summary className="min-h-11 cursor-pointer text-xs text-accent">How</summary>
                    <p className="mt-1 text-xs leading-relaxed text-muted">
                      {exercise.instructions.join(' ')}
                    </p>
                  </details>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {/* Pinned while the list scrolls past, so Start is never a scroll away. */}
      <div className="sticky bottom-0 -mx-5 mt-2 bg-ink px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        <button
          type="button"
          disabled={starting}
          onClick={() => void start()}
          className="h-14 w-full rounded-xl bg-accent font-semibold text-ink disabled:bg-surface disabled:text-muted"
        >
          {starting ? 'Getting ready…' : 'Start this program'}
        </button>
      </div>

      <section className="mt-4 rounded-xl border border-line bg-surface p-4">
        <h2 className="text-sm font-semibold">Change it with a coach</h2>
        <p className="mt-1 text-xs text-muted">
          Sends this program and its last {BRIEF_MAX_SESSIONS} sessions to your coach — what you
          skipped, how hard it felt, what you wrote.
        </p>
        <button
          type="button"
          onClick={() => void openCoach()}
          className="mt-3 flex h-12 w-full items-center justify-center rounded-xl border border-accent text-sm font-semibold text-accent"
        >
          Open ChatGPT with this program
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
          onClick={() => void copyOnly()}
          className="mt-2 h-11 w-full text-xs text-muted underline"
        >
          Copy it only (for the chat you already have open)
        </button>

        <p className="mt-4 text-[10px] uppercase tracking-widest text-accent">Step 2</p>
        <h3 className="mt-1 text-sm font-semibold">When the coach answers</h3>
        <p className="mt-1 text-xs text-muted">
          Paste its reply and the app lists what changed before touching this program.
        </p>
        <a
          href={`#/paste/${program.id}`}
          className="mt-2 flex h-12 items-center justify-center rounded-xl border border-line text-sm font-semibold"
        >
          Paste the coach’s reply
        </a>
      </section>
    </main>
  );
}
