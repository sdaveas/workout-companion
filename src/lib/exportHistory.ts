import { summarize } from '../engine/summary';
import type { SessionRow } from '../storage/db';

/**
 * The file the MCP reads (data/history/workout-history.json). `summary` is the exact
 * shape the summary screen renders, so an agent sees what the user sees.
 */
export function historyExport(rows: SessionRow[], now: number) {
  return {
    exportedAt: now,
    sessions: rows.map((row) => ({
      id: row.id,
      programId: row.programId,
      programName: row.programName,
      startedAt: row.startedAt,
      finishedAt: row.finishedAt,
      summary: summarize(row.state, row.finishedAt ?? row.state.updatedAt),
    })),
  };
}

export function downloadJson(filename: string, value: unknown): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
