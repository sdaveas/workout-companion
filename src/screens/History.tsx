import { ScreenHeader } from '../components/ui/ScreenHeader';
import { useEffect, useState } from 'react';
import { useSession } from '../store/sessionStore';
import { usePrograms } from '../store/programsStore';
import { useNow } from '../hooks/useNow';
import { summarize } from '../engine/summary';
import { downloadJson, historyExport } from '../lib/exportHistory';
import { shareProgram } from '../lib/shareProgram';
import { formatDate, formatDuration } from '../lib/format';

function ShareIcon() {
  return (
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
      <path d="M12 3v11" />
      <path d="m8 7 4-4 4 4" />
      <path d="M5 13v6a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6" />
    </svg>
  );
}

export function History() {
  const history = useSession((s) => s.history);
  const loadHistory = useSession((s) => s.loadHistory);
  const removeSession = useSession((s) => s.removeSession);
  const programs = usePrograms((s) => s.programs);
  const loadPrograms = usePrograms((s) => s.load);
  const [loaded, setLoaded] = useState(false);
  const [shared, setShared] = useState<string | null>(null);
  const now = useNow(60_000);

  useEffect(() => {
    void loadHistory().then(() => setLoaded(true));
    void loadPrograms();
  }, [loadHistory, loadPrograms]);

  // A session outlives its program: a deleted or renamed program simply has no
  // link to send, so match by id and let the button disappear.
  async function share(programId: string) {
    setShared(null);
    const program = programs.find((p) => p.id === programId);
    if (!program) return;
    try {
      const note = await shareProgram(program);
      if (note) setShared(note);
    } catch (err) {
      setShared(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <main className="mx-auto max-w-md px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]">
      <ScreenHeader
        back={{ to: '#/', label: 'Home' }}
        title={<h1 className="text-sm font-semibold uppercase tracking-widest">History</h1>}
        actions={
          history.length > 0 ? (
            <button
              type="button"
              onClick={() => downloadJson('workout-history.json', historyExport(history, now))}
              className="h-11 rounded-lg border border-line px-3 text-xs"
            >
              Export
            </button>
          ) : undefined
        }
      />

      {shared && (
        <p role="status" className="mt-4 text-xs text-accent">
          {shared}
        </p>
      )}

      {loaded && history.length === 0 && (
        <p className="mt-12 text-center text-sm text-muted">
          No finished sessions yet.
        </p>
      )}

      <ul className="mt-6 space-y-2">
        {history.map((row) => {
          const s = summarize(row.state, row.finishedAt ?? row.state.updatedAt);
          const canShare = programs.some((p) => p.id === row.programId);
          return (
            <li key={row.id} className="flex items-stretch gap-2">
              <a
                href={`#/summary/${row.id}`}
                className="block min-w-0 flex-1 rounded-xl border border-line bg-surface px-4 py-4"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-medium">{row.programName}</p>
                  <p className="shrink-0 text-xs text-muted">{formatDate(row.finishedAt)}</p>
                </div>
                <p className="mt-1 text-xs text-muted">
                  {formatDuration(s.durationMs)} · {s.setsCompleted} sets · {Math.round(s.volumeKg)} kg
                  {s.endedEarly && <span className="text-danger"> · ended early</span>}
                </p>
              </a>
              {canShare && (
                <button
                  type="button"
                  aria-label={`Share ${row.programName} from ${formatDate(row.finishedAt)}`}
                  onClick={() => void share(row.programId)}
                  className="flex w-11 shrink-0 items-center justify-center rounded-xl border border-line bg-surface text-muted"
                >
                  <ShareIcon />
                </button>
              )}
              <button
                type="button"
                aria-label={`Delete ${row.programName} from ${formatDate(row.finishedAt)}`}
                onClick={() => {
                  if (!confirm('Delete this session? It cannot be recovered.')) return;
                  void removeSession(row.id);
                }}
                className="w-11 shrink-0 rounded-xl border border-line bg-surface text-lg text-danger"
              >
                ×
              </button>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
