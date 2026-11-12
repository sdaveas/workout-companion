import { useEffect, useState } from 'react';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { ActivityGrid } from '../components/ui/ActivityGrid';
import { SessionRow } from '../components/ui/SessionRow';
import { usePrograms } from '../store/programsStore';
import { useSession } from '../store/sessionStore';
import { useNow } from '../hooks/useNow';
import { dayKey } from '../lib/activity';
import { downloadJson, historyExport } from '../lib/exportHistory';

/**
 * The full log, with the training grid on top. The grid is the filter: tap a day
 * and the list becomes that day.
 */
export function History() {
  const history = useSession((s) => s.history);
  const loadHistory = useSession((s) => s.loadHistory);
  const loadPrograms = usePrograms((s) => s.load);
  const [loaded, setLoaded] = useState(false);
  const [day, setDay] = useState<number | null>(null);
  const now = useNow(60_000);

  useEffect(() => {
    void loadHistory().then(() => setLoaded(true));
    void loadPrograms();
  }, [loadHistory, loadPrograms]);

  const shown =
    day === null
      ? history
      : history.filter((row) => row.finishedAt != null && dayKey(row.finishedAt) === day);

  const heading =
    day === null
      ? 'All sessions'
      : new Date(day).toLocaleDateString(undefined, {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
        });

  return (
    <main className="mx-auto flex h-dvh max-w-md flex-col overflow-hidden px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      <ScreenHeader
        back={{ to: '#/', label: 'Home', compact: true }}
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

      <div className="mt-4 shrink-0">
        <ActivityGrid
          sessions={history}
          now={now}
          selected={day}
          onSelect={(picked) => setDay(day === picked ? null : picked)}
        />
      </div>

      <div className="mt-4 flex shrink-0 items-baseline justify-between">
        <p className="text-xs uppercase tracking-widest text-muted">{heading}</p>
        {day !== null && (
          <button type="button" onClick={() => setDay(null)} className="text-xs text-accent">
            Show all
          </button>
        )}
      </div>

      {loaded && shown.length === 0 && (
        <p className="mt-6 text-center text-sm text-muted">
          {day === null ? 'No finished sessions yet.' : 'Nothing logged that day.'}
        </p>
      )}

      <ul className="mt-2 min-h-0 flex-1 space-y-2 overflow-y-auto pb-2">
        {shown.map((row) => (
          <SessionRow key={row.id} row={row} />
        ))}
      </ul>

      <a
        href="#/credits"
        className="mt-1 flex h-8 shrink-0 items-center justify-center text-xs text-muted underline"
      >
        Credits
      </a>
    </main>
  );
}
