import { useState } from 'react';
import { useSession } from '../../store/sessionStore';
import { summarize } from '../../engine/summary';
import { shareSession } from '../../lib/shareProgram';
import { ShareIcon } from './icons';
import { formatDate, formatDuration } from '../../lib/format';
import type { SessionRow as Row } from '../../storage/db';

/**
 * One finished session: summary, its share link, and delete. The link carries the
 * session's own snapshot of the program, so a deleted or renamed program still shares
 * exactly what was done — the numbers included.
 */
export function SessionRow({ row, actions = true }: { row: Row; actions?: boolean }) {
  const removeSession = useSession((s) => s.removeSession);
  const [note, setNote] = useState<string | null>(null);

  const summary = summarize(row.state, row.finishedAt ?? row.state.updatedAt);

  async function share() {
    try {
      const message = await shareSession(row.state);
      if (message) setNote(message);
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <li className="flex flex-col gap-1">
      {actions && note && (
        <p role="status" className="px-1 text-xs text-accent">
          {note}
        </p>
      )}
      <div className="flex items-stretch gap-2">
        <a
          href={`#/summary/${row.id}`}
          className="block min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-3"
        >
          <div className="flex items-baseline justify-between gap-3">
            <p className="truncate font-medium">{row.programName}</p>
            <p className="shrink-0 text-xs text-muted">{formatDate(row.finishedAt)}</p>
          </div>
          <p className="mt-1 text-xs text-muted">
            {formatDuration(summary.durationMs)} · {summary.setsCompleted} sets
            {summary.volumeKg > 0 && ` · ${Math.round(summary.volumeKg)} kg`}
            {summary.endedEarly && <span className="text-danger"> · ended early</span>}
          </p>
        </a>
        {actions && (
          <button
            type="button"
            aria-label={`Share ${row.programName} from ${formatDate(row.finishedAt)}`}
            onClick={() => void share()}
            className="flex w-11 shrink-0 items-center justify-center rounded-xl border border-line bg-surface text-muted"
          >
            <ShareIcon />
          </button>
        )}
        {actions && (
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
        )}
      </div>
    </li>
  );
}
