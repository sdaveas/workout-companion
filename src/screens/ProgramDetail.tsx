import { ScreenHeader } from '../components/ui/ScreenHeader';
import { useState, type ReactNode } from 'react';
import { navigate } from '../hooks/useHashRoute';
import { usePrograms } from '../store/programsStore';
import { useSession } from '../store/sessionStore';
import { useProgramDraft } from '../hooks/useProgramDraft';
import { figureSlug } from '../data/exerciseFigures';
import { ExerciseMotion } from '../components/exercise/ExerciseMotion';
import { ExercisePicker } from '../components/programs/ExercisePicker';
import { DayChips } from '../components/programs/DayChips';
import { NameConflict } from '../components/programs/NameConflict';
import { CoachChat } from '../components/ui/CoachChat';
import { Banner } from '../components/ui/Banner';
import { formatWeight } from '../lib/format';
import { BRIEF_MAX_SESSIONS, coachBrief } from '../lib/coachBrief';
import { stashProgram } from '../lib/briefSnapshot';
import { shareProgram } from '../lib/shareProgram';
import { suggestedName } from '../lib/identity';
import type { Program } from '../engine/types';
import { ChevronIcon, ShareIcon } from '../components/ui/icons';

/**
 * One program, either being read or being changed. `#/program/<id>/edit` opens it in
 * edit mode.
 *
 * Both modes draw the same grid of cells — the read view shows the values, edit mode
 * makes the same cells editable — so nothing moves when the mode changes. See
 * docs/designs/program-screen.md.
 */
export function ProgramDetail({ id, startEditing = false }: { id: string; startEditing?: boolean }) {
  const program = usePrograms((s) => s.programs.find((p) => p.id === id) ?? null);

  if (!program) {
    return (
      <main className="mx-auto max-w-md px-5 pt-[max(1rem,env(safe-area-inset-top))]">
        <ScreenHeader back={{ to: '#/', label: 'Home', compact: true }} />
        <p className="mt-6 text-body text-muted">That program is not saved here.</p>
      </main>
    );
  }
  // Keyed on the id and mode so opening another program, or a URL that asks for the
  // edit mode, starts from that program's draft in that mode.
  return (
    <ProgramView
      key={`${program.id}:${startEditing ? 'edit' : 'view'}`}
      program={program}
      startEditing={startEditing}
    />
  );
}

/** One exercise as both modes need it: values to read, and the slot to change them in. */
interface Row {
  key: string;
  name: string;
  sets: number;
  repsMin: number;
  repsMax: number;
  /** What to show: "Bodyweight" or "20 kg". */
  weight: string;
  /** What edit mode types in: the weight without the unit, as the draft holds it. */
  weightKg: string;
  rest: number;
  perHand: boolean;
  instructions: string[];
}

function ProgramView({ program, startEditing }: { program: Program; startEditing: boolean }) {
  const prepareWorkout = useSession((s) => s.prepareWorkout);
  const error = useSession((s) => s.error);
  const clearError = useSession((s) => s.clearError);
  const history = useSession((s) => s.history);
  const programs = usePrograms((s) => s.programs);
  const conflict = usePrograms((s) => s.conflict);
  const preview = usePrograms((s) => s.preview);
  const remove = usePrograms((s) => s.remove);
  const [starting, setStarting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [shareNote, setShareNote] = useState<string | null>(null);
  const [editing, setEditing] = useState(startEditing);
  /** Which card has its instructions open; the row keeps its height either way. */
  const [how, setHow] = useState<number | null>(null);
  const d = useProgramDraft(program);

  /** The mode lives in the URL text as well, without a navigation: a hash change would
   * remount this screen and throw the draft away. */
  const setMode = (on: boolean) => {
    // Entering edit always starts from what is saved, so a cancelled round of edits
    // does not come back.
    if (on) d.reset();
    setHow(null);
    setEditing(on);
    window.history.replaceState(null, '', `#/program/${program.id}${on ? '/edit' : ''}`);
  };

  async function saveEdits(name?: string) {
    setSaving(true);
    const ok = await d.commit(name);
    setSaving(false);
    // A name clash stops here: NameConflict asks for another name and saves again.
    if (ok) setMode(false);
  }

  /** The share sheet on a phone; the clipboard (and a note saying so) elsewhere. */
  async function share() {
    try {
      setShareNote(await shareProgram(program));
    } catch (err) {
      setShareNote(err instanceof Error ? err.message : String(err));
    }
  }

  function currentBrief(): string {
    // Baselines the diff: the coach's reply is compared with what was actually sent.
    stashProgram(window.localStorage, program);
    return coachBrief({ program, sessions: history });
  }

  /** Gone from the phone, not just from the list: confirm, then back to Home. */
  async function deleteProgram() {
    if (!confirm(`Delete "${program.name}"? Session history is kept.`)) return;
    await remove(program.id);
    navigate('#/');
  }

  async function start() {
    setStarting(true);
    const ok = await prepareWorkout(program.id);
    setStarting(false);
    if (ok) navigate('#/session');
  }

  // One list of rows for both modes, so the card markup exists once.
  const rows: Row[] = editing
    ? d.draft.exercises.map((e, i) => ({
        key: `draft-${i}`,
        name: e.name,
        sets: e.sets,
        repsMin: e.repsMin,
        repsMax: e.repsMax,
        weightKg: e.weightKg,
        weight: e.weightKg.trim() ? `${e.weightKg.trim()} kg` : 'Bodyweight',
        rest: e.restSeconds,
        perHand: e.perHand,
        instructions: [],
      }))
    : program.exercises.map((e) => ({
        key: e.id,
        name: e.name,
        sets: e.sets,
        repsMin: e.reps.min,
        repsMax: e.reps.max,
        weightKg: e.weightKg == null ? '' : String(e.weightKg),
        weight: formatWeight(e.weightKg),
        rest: e.restSeconds,
        perHand: e.perHand,
        instructions: e.instructions,
      }));

  const exerciseCount = rows.filter((r) => r.name.trim()).length;
  const sets = rows.reduce((n, r) => n + r.sets, 0);

  return (
    <main className="mx-auto max-w-md px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      <ScreenHeader
        // The list is this screen's parent, whichever card you arrived from.
        back={{ to: '#/programs', label: 'Programs', compact: true }}
        actions={
          // Both modes keep the seats: taking the buttons away would slide the title.
          <div className={editing ? 'invisible flex gap-2' : 'flex gap-2'}>
            <button
              type="button"
              aria-label="Edit this program"
              onClick={() => setMode(true)}
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-line text-muted"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
                className="h-5 w-5"
              >
                <path d="M4 20h4l10-10a2.5 2.5 0 0 0-3.5-3.5L4.5 16.5z" />
                <path d="M13.5 6.5 17.5 10.5" />
              </svg>
            </button>
            <button
              type="button"
              aria-label="Share this program"
              onClick={() => void share()}
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-line text-muted"
            >
              <ShareIcon />
            </button>
          </div>
        }
      />

      {shareNote && (
        <p role="status" className="mt-2 text-body text-accent">
          {shareNote}
        </p>
      )}

      {editing ? (
        // Same box as the h1 it replaces, so the title does not jump.
        <input
          aria-label="Program name"
          value={d.draft.name}
          onChange={(e) => d.patch({ name: e.target.value })}
          placeholder="Program name"
          className="mt-3 h-11 w-full rounded-lg bg-field px-2 text-screen font-semibold outline-none focus:ring-2 focus:ring-accent"
        />
      ) : (
        <h1 className="mt-3 flex h-11 items-center px-2 text-screen font-semibold">{program.name}</h1>
      )}

      <p className="mt-1 px-2 text-body text-muted">
        {exerciseCount} exercise{exerciseCount === 1 ? '' : 's'} · {sets} set{sets === 1 ? '' : 's'}
      </p>

      <div className="mt-3">
        <DayChips
          days={editing ? d.draft.days : program.scheduleDays}
          onChange={(days) => d.patch({ days })}
          readOnly={!editing}
        />
      </div>

      {program.description && (
        <p className="mt-3 text-body text-muted">{program.description}</p>
      )}

      {error && <Banner message={error} onDismiss={clearError} />}

      <ul className="mt-5 space-y-3">
        {rows.map((row, i) => (
          <li key={row.key} className="rounded-xl border border-line bg-surface p-3">
            <div className="flex items-center gap-3">
              <Thumb name={row.name} />
              <div className="min-w-0 flex-1">
                {editing ? (
                  <input
                    aria-label={`Exercise ${i + 1} name`}
                    value={row.name}
                    onChange={(e) => d.patchExercise(i, { name: e.target.value })}
                    placeholder="Type exercise name"
                    className="h-11 w-full rounded-lg bg-field px-2 font-medium outline-none focus:ring-2 focus:ring-accent"
                  />
                ) : (
                  <p className="flex h-11 items-center truncate px-2 text-row font-medium">{row.name}</p>
                )}
              </div>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              <NumCell
                label="Sets"
                value={row.sets}
                min={1}
                onChange={editing ? (v) => d.patchExercise(i, { sets: v }) : undefined}
              />
              <NumCell
                label="Reps min"
                value={row.repsMin}
                min={1}
                onChange={editing ? (v) => d.patchExercise(i, { repsMin: v }) : undefined}
              />
              <NumCell
                label="Reps max"
                value={row.repsMax}
                min={1}
                onChange={editing ? (v) => d.patchExercise(i, { repsMax: v }) : undefined}
              />
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              <Cell label="Weight">
                {editing ? (
                  <input
                    aria-label={`Exercise ${i + 1} weight`}
                    inputMode="decimal"
                    value={row.weightKg}
                    onChange={(e) => d.patchExercise(i, { weightKg: e.target.value })}
                    onFocus={(e) => e.currentTarget.select()}
                    placeholder="bodyweight"
                    className="h-11 w-full bg-transparent px-1 text-center tabular-nums outline-none placeholder:text-body focus:ring-2 focus:ring-accent"
                  />
                ) : (
                  <span>{row.weight}</span>
                )}
              </Cell>
              <NumCell
                label="Rest s"
                value={row.rest}
                max={600}
                onChange={editing ? (v) => d.patchExercise(i, { restSeconds: v }) : undefined}
              />
              <Cell label="×2">
                {editing ? (
                  // The label is the target: 44×44 around a 20 px box, so the tick
                  // keeps its size and the tap area is a thumb.
                  <label className="flex h-11 w-full cursor-pointer items-center justify-center">
                    <input
                      type="checkbox"
                      aria-label={`Exercise ${i + 1} is per side`}
                      checked={row.perHand}
                      onChange={(e) => d.patchExercise(i, { perHand: e.target.checked })}
                      className="h-5 w-5 accent-accent"
                    />
                  </label>
                ) : (
                  <span className={row.perHand ? 'text-accent' : 'text-muted'}>
                    {row.perHand ? '✓' : '—'}
                  </span>
                )}
              </Cell>
            </div>

            {/* One row that always takes the same height: "How" on the left, the row
                controls on the right, and blank in whichever mode does not use them. */}
            <div className="mt-2 flex h-11 items-center justify-between">
              <div className="min-w-0 flex-1">
                {!editing && row.instructions.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setHow(how === i ? null : i)}
                    aria-expanded={how === i}
                    className="flex h-11 min-w-11 items-center gap-1 text-label uppercase tracking-label text-accent"
                  >
                    How
                    <ChevronIcon
                      className={`h-3 w-3 transition-transform ${how === i ? 'rotate-180' : ''}`}
                    />
                  </button>
                )}
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  aria-label={`Move exercise ${i + 1} up`}
                  aria-hidden={!editing}
                  tabIndex={editing ? undefined : -1}
                  disabled={i === 0}
                  onClick={() => d.moveExercise(i, -1)}
                  className={`h-11 w-11 rounded-lg bg-field text-muted disabled:opacity-30 ${
                    editing ? '' : 'invisible'
                  }`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={`Move exercise ${i + 1} down`}
                  aria-hidden={!editing}
                  tabIndex={editing ? undefined : -1}
                  disabled={i === rows.length - 1}
                  onClick={() => d.moveExercise(i, 1)}
                  className={`h-11 w-11 rounded-lg bg-field text-muted disabled:opacity-30 ${
                    editing ? '' : 'invisible'
                  }`}
                >
                  ↓
                </button>
                <button
                  type="button"
                  aria-label={`Remove exercise ${i + 1}`}
                  aria-hidden={!editing}
                  tabIndex={editing ? undefined : -1}
                  onClick={() => d.removeExercise(i)}
                  className={`h-11 w-11 rounded-lg bg-field text-danger ${editing ? '' : 'invisible'}`}
                >
                  ×
                </button>
              </div>
            </div>

            {!editing && how === i && row.instructions.length > 0 && (
              <p className="pb-1 text-body leading-relaxed text-muted">{row.instructions.join(' ')}</p>
            )}
          </li>
        ))}
      </ul>

      {editing && (
        <div className="mt-4">
          <ExercisePicker onPick={(name) => d.addFromLibrary(name)} onNew={() => d.addBlank()} />
        </div>
      )}

      {editing && (
        <button
          type="button"
          onClick={() => void deleteProgram()}
          className="mt-4 h-12 w-full rounded-xl border border-danger/40 text-body font-semibold text-danger"
        >
          Delete this program
        </button>
      )}

      {editing && conflict && preview && (
        <NameConflict
          taken={conflict}
          existingNames={programs.filter((p) => p.id !== program.id).map((p) => p.name)}
          suggested={suggestedName(preview, programs.filter((p) => p.id !== program.id))}
          busy={saving}
          onSave={(name) => void saveEdits(name)}
        />
      )}

      {/* Pinned while the list scrolls past, so Start is never a scroll away. */}
      <div className="sticky bottom-0 -mx-5 mt-2 bg-ink px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        {editing ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode(false)}
              className="h-14 flex-1 rounded-xl border border-line text-body text-muted"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!d.ready || saving}
              onClick={() => void saveEdits()}
              className="h-14 flex-[2] rounded-xl bg-accent font-semibold text-ink disabled:bg-surface disabled:text-muted"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={starting}
            onClick={() => void start()}
            className="h-14 w-full rounded-xl bg-accent font-semibold text-ink disabled:bg-surface disabled:text-muted"
          >
            {starting ? 'Getting ready…' : 'Start this program'}
          </button>
        )}
      </div>

      {!editing && (
        <CoachChat
          brief={currentBrief}
          description={
            <>
              Sends this program and its last {BRIEF_MAX_SESSIONS} sessions to your coach — what
              you skipped, how hard it felt, what you wrote.
            </>
          }
          openLabel="Open ChatGPT with this program"
          // The way back is a paste, so the app waits on the paste step.
          onOpened={() => navigate(`#/paste/${program.id}`)}
        >
          <p className="mt-4 text-label uppercase tracking-label text-muted">Step 2</p>
          <h3 className="mt-1 text-body font-semibold">When the coach answers</h3>
          <p className="mt-1 text-body text-muted">
            Paste its reply and the app lists what changed before touching this program.
          </p>
          <a
            href={`#/paste/${program.id}`}
            className="mt-2 flex h-12 items-center justify-center rounded-xl border border-line text-body font-semibold"
          >
            Paste the coach’s reply
          </a>
        </CoachChat>
      )}
    </main>
  );
}

/** A labelled cell. Both modes use the same box; only what sits inside it changes. */
function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="block">
      <span className="text-label uppercase tracking-label text-muted">{label}</span>
      <div className="mt-1 flex h-11 w-full items-center justify-center rounded-lg bg-field px-2 text-row tabular-nums">
        {children}
      </div>
    </div>
  );
}

/** A number cell: an input while editing, the same box with the value in it while not. */
function NumCell({
  label,
  value,
  onChange,
  min = 0,
  max,
}: {
  label: string;
  value: number;
  /** Omitted in the read view, which is the whole difference between the two modes. */
  onChange?: (n: number) => void;
  min?: number;
  max?: number;
}) {
  if (!onChange) return <Cell label={label}>{value}</Cell>;
  return (
    <label className="block">
      <span className="text-label uppercase tracking-label text-muted">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(Number(e.target.value))}
        onFocus={(e) => e.currentTarget.select()}
        className="mt-1 h-11 w-full rounded-lg bg-field px-2 text-center tabular-nums outline-none focus:ring-2 focus:ring-accent"
      />
    </label>
  );
}

/** The drawing, or a neutral bar when nothing honest can be drawn for that name. */
function Thumb({ name }: { name: string }) {
  const slug = figureSlug(name);
  if (slug) return <ExerciseMotion slug={slug} className="h-16 w-16 shrink-0" />;
  return (
    <div
      aria-hidden
      className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-line bg-ink text-muted"
    >
      <svg viewBox="0 0 64 64" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="4">
        <path d="M8 32h48M14 24v16M50 24v16M22 28v8M42 28v8" strokeLinecap="round" />
      </svg>
    </div>
  );
}
