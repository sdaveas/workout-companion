import { useEffect, useState } from 'react';
import { useSession } from '../store/sessionStore';
import { useNow } from '../hooks/useNow';
import { summarize } from '../engine/summary';
import { downloadJson, historyExport } from '../lib/exportHistory';
import { formatDate, formatDuration } from '../lib/format';

export function History() {
  const history = useSession((s) => s.history);
  const loadHistory = useSession((s) => s.loadHistory);
  const [loaded, setLoaded] = useState(false);
  const now = useNow(60_000);

  useEffect(() => {
    void loadHistory().then(() => setLoaded(true));
  }, [loadHistory]);

  return (
    <main className="mx-auto max-w-md px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]">
      <header className="flex items-center justify-between">
        <a href="#/" className="text-sm text-muted">
          ← Home
        </a>
        <h1 className="text-sm font-semibold uppercase tracking-widest">History</h1>
        {history.length > 0 ? (
          <button
            type="button"
            onClick={() => downloadJson('workout-history.json', historyExport(history, now))}
            className="h-11 rounded-lg border border-line px-3 text-xs"
          >
            Export
          </button>
        ) : (
          <span className="w-12" />
        )}
      </header>

      {loaded && history.length === 0 && (
        <p className="mt-12 text-center text-sm text-muted">
          No finished sessions yet.
        </p>
      )}

      <ul className="mt-6 space-y-2">
        {history.map((row) => {
          const s = summarize(row.state, row.finishedAt ?? row.state.updatedAt);
          return (
            <li key={row.id}>
              <a
                href={`#/summary/${row.id}`}
                className="block rounded-xl border border-line bg-surface px-4 py-4"
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
            </li>
          );
        })}
      </ul>
    </main>
  );
}
