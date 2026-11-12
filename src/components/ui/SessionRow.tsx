import { useState } from 'react';
import { usePrograms } from '../../store/programsStore';
import { useSession } from '../../store/sessionStore';
import { summarize } from '../../engine/summary';
import { shareProgram } from '../../lib/shareProgram';
import { formatDate, formatDuration } from '../../lib/format';
import type { SessionRow as Row } from '../../storage/db';

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

/**
 * One finished session: summary, the program's share link, and delete. A session
 * outlives its program, so a deleted or renamed program simply has no link to
 * send and the button disappears.
 */
export function SessionRow({ row, actions = true }: { row: Row; actions?: boolean }) {
  const programs = usePrograms((s) => s.programs);
  const removeSession = useSession((s) => s.removeSession);
  const [note, setNote] = useState<string | null>(null);

  const summary = summarize(row.state, row.finishedAt ?? row.state.updatedAt);
  const canShare = programs.some((p) => p.id === row.programId);

  async function share() {
    const program = programs.find((p) => p.id === row.programId);
    if (!program) return;
    try {
      const message = await shareProgram(program);
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
        {actions && canShare && (
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
