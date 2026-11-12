import { ScreenHeader } from '../components/ui/ScreenHeader';
import { useEffect, useRef, useState } from 'react';
import { useNow } from '../hooks/useNow';
import { usePrograms } from '../store/programsStore';
import { buildBackup } from '../lib/backup';
import { importBackupFile } from '../lib/importFile';
import { downloadJson } from '../lib/exportHistory';
import { countSessions, loadAllSessions } from '../storage/sessions';
import { Banner } from '../components/ui/Banner';
import {
  EMPTY_STATE,
  forgetToken,
  readState,
  requestToken,
  writeState,
  type DriveState,
} from '../lib/drive/auth';
import { sync } from '../lib/drive/sync';

export function Settings() {
  const programs = usePrograms((s) => s.programs);
  const [sessions, setSessions] = useState<number | null>(null);
  const [drive, setDrive] = useState<DriveState>(readState);
  const [driveBusy, setDriveBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const now = useNow(60_000);

  useEffect(() => {
    void countSessions().then(setSessions).catch(() => setSessions(null));
  }, [programs.length]);

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

  async function syncNow() {
    setError(null);
    setNotice(null);
    setSyncing(true);
    try {
      const result = await sync();
      setDrive(readState());
      if (result.status === 'failed') setError(result.error);
      else if (result.status === 'offline') setNotice('Offline — nothing was synced.');
      else if (result.pulled) setNotice('Synced. Newer items from Drive were added.');
      else setNotice('Synced. This phone was already up to date.');
    } finally {
      setSyncing(false);
    }
  }

  async function connectDrive() {
    setError(null);
    setNotice(null);
    setDriveBusy(true);
    try {
      await requestToken({ silent: false });
      writeState({ ...readState(), connected: true, lastError: null });
      setDrive(readState());
      await syncNow();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDriveBusy(false);
    }
  }

  function disconnectDrive() {
    forgetToken();
    writeState(EMPTY_STATE);
    setDrive(EMPTY_STATE);
    setNotice('Disconnected. The copy in Drive was left alone.');
  }

  return (
    <main className="mx-auto max-w-md px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]">
      <ScreenHeader
        back={{ to: '#/', label: 'Home' }}
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
        {drive.connected ? (
          <>
            <p className="mt-2 text-sm">Connected</p>
            <p className="mt-1 text-xs text-muted">
              {drive.lastSyncedAt
                ? `Last synced ${new Date(drive.lastSyncedAt).toLocaleString()}.`
                : 'Not synced yet.'}{' '}
              This phone keeps the real copy; Drive holds a mirror.
            </p>
            {drive.lastError && <p className="mt-2 text-xs text-red-400">{drive.lastError}</p>}
            <button
              type="button"
              disabled={syncing}
              onClick={() => void syncNow()}
              className="mt-4 h-12 w-full rounded-xl bg-accent font-semibold text-ink disabled:opacity-50"
            >
              {syncing ? 'Syncing…' : 'Sync now'}
            </button>
            <button
              type="button"
              onClick={disconnectDrive}
              className="mt-2 h-12 w-full rounded-xl border border-line text-sm"
            >
              Disconnect
            </button>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-muted">
              Keeps a copy of your programs and sessions in your own Google Drive, so every device
              shows the same thing. This phone stays the master copy.
            </p>
            <button
              type="button"
              disabled={driveBusy}
              onClick={() => void connectDrive()}
              className="mt-4 h-12 w-full rounded-xl bg-accent font-semibold text-ink disabled:opacity-50"
            >
              {driveBusy ? 'Connecting…' : 'Connect Google Drive'}
            </button>
          </>
        )}
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
