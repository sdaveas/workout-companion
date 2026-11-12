import { ScreenHeader } from '../components/ui/ScreenHeader';
import { useEffect, useRef, useState } from 'react';
import { useNow } from '../hooks/useNow';
import { usePrograms } from '../store/programsStore';
import { useSession } from '../store/sessionStore';
import { buildBackup } from '../lib/backup';
import { importBackupFile } from '../lib/importFile';
import { downloadJson, historyExport } from '../lib/exportHistory';
import { countSessions, loadAllSessions } from '../storage/sessions';
import { Banner } from '../components/ui/Banner';
import { getToken } from '../lib/drive/auth';
import { loadBackup, saveBackup } from '../lib/drive/files';

export function Settings() {
  const programs = usePrograms((s) => s.programs);
  const history = useSession((s) => s.history);
  const loadHistory = useSession((s) => s.loadHistory);
  const [sessions, setSessions] = useState<number | null>(null);
  const [driveBusy, setDriveBusy] = useState<'save' | 'load' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const now = useNow(60_000);

  useEffect(() => {
    void countSessions().then(setSessions).catch(() => setSessions(null));
    void loadHistory();
  }, [programs.length, loadHistory]);

  async function exportBackup() {
    setError(null);
    try {
      const rows = await loadAllSessions();
      downloadJson(
        'workout-companion-backup.json',
        buildBackup(programs, rows, now),
      );
      setNotice(
        `Exported ${programs.length} program${programs.length === 1 ? '' : 's'} and ${rows.length} session${
          rows.length === 1 ? '' : 's'
        }.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function importFile(file: File) {
    setError(null);
    setNotice(null);
    try {
      setNotice(await importBackupFile(file));
      setSessions(await countSessions());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function saveToDrive() {
    setError(null);
    setNotice(null);
    setDriveBusy('save');
    try {
      const token = await getToken();
      const rows = await loadAllSessions();
      await saveBackup(token, JSON.stringify(buildBackup(programs, rows, now)));
      setNotice(
        `Saved ${programs.length} program${programs.length === 1 ? '' : 's'} and ${rows.length} session${
          rows.length === 1 ? '' : 's'
        } to Google Drive.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDriveBusy(null);
    }
  }

  async function loadFromDrive() {
    setError(null);
    setNotice(null);
    setDriveBusy('load');
    try {
      const text = await loadBackup(await getToken());
      if (text === null) {
        setNotice('There is no copy in Google Drive yet.');
        return;
      }
      // Same path as picking a file: validate, merge by id, reload the screens.
      setNotice(await importBackupFile(new File([text], 'workout-companion-backup.json')));
      setSessions(await countSessions());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDriveBusy(null);
    }
  }

  return (
    <main className="mx-auto max-w-md px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]">
      <ScreenHeader
        back={{ to: '#/', label: 'Programs' }}
        title={<h1 className="text-sm font-semibold uppercase tracking-widest">Settings</h1>}
      />

      <section className="mt-6 rounded-2xl border border-line bg-surface p-5">
        <p className="text-xs uppercase tracking-widest text-muted">On this phone</p>
        <p className="mt-2 text-sm">
          {programs.length} program{programs.length === 1 ? '' : 's'} ·{' '}
          {sessions == null ? '…' : sessions} session{sessions === 1 ? '' : 's'}
        </p>
        <p className="mt-1 text-xs text-muted">
          Everything is stored locally. A backup is the only way to move it.
        </p>
      </section>

      <section className="mt-4 rounded-2xl border border-line bg-surface p-5">
        <p className="text-xs uppercase tracking-widest text-muted">Google Drive</p>
        <p className="mt-2 text-sm text-muted">
          A copy, not a sync: Save writes everything to one file in your own Drive, Load merges
          that file back in. Nothing happens on its own.
        </p>
        <button
          type="button"
          disabled={driveBusy !== null}
          onClick={() => void saveToDrive()}
          className="mt-4 h-12 w-full rounded-xl bg-accent font-semibold text-ink disabled:opacity-50"
        >
          {driveBusy === 'save' ? 'Saving…' : 'Save to Google Drive'}
        </button>
        <button
          type="button"
          disabled={driveBusy !== null}
          onClick={() => void loadFromDrive()}
          className="mt-2 h-12 w-full rounded-xl border border-line text-sm disabled:opacity-50"
        >
          {driveBusy === 'load' ? 'Loading…' : 'Load from Google Drive'}
        </button>
      </section>

      <section className="mt-4 rounded-2xl border border-line bg-surface p-5">
        <p className="text-xs uppercase tracking-widest text-muted">Backup</p>
        <p className="mt-2 text-sm text-muted">
          The file holds every program and every session. Importing merges by id: new items are
          added, matching ones are updated, nothing is deleted.
        </p>

        <button
          type="button"
          onClick={() => void exportBackup()}
          className="mt-4 h-12 w-full rounded-xl bg-accent font-semibold text-ink"
        >
          Export backup
        </button>

        <input
          ref={fileInput}
          id="backup-file"
          type="file"
          accept="application/json,.json"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void importFile(file);
            e.target.value = '';
          }}
        />
        <label
          htmlFor="backup-file"
          className="mt-2 flex h-12 w-full items-center justify-center rounded-xl border border-line text-sm"
        >
          Import a file
        </label>
        <p className="mt-2 text-center text-xs text-muted">
          A backup, or a single program JSON
        </p>

        {/* The history-only export used to live on the History screen. */}
        <button
          type="button"
          disabled={history.length === 0}
          onClick={() => downloadJson('workout-history.json', historyExport(history, now))}
          className="mt-3 h-11 w-full text-xs text-muted underline disabled:opacity-50"
        >
          Export history only
        </button>
      </section>

      {error && <Banner message={error} onDismiss={() => setError(null)} />}

      {notice && (
        <p
          role="status"
          className="mt-4 rounded-xl border border-accent/50 bg-surface px-4 py-3 text-sm"
        >
          {notice}
        </p>
      )}

      <a href="#/credits" className="mt-2 flex h-11 items-center justify-center text-xs text-muted underline">
        Credits
      </a>
    </main>
  );
}
