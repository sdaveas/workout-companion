import { create } from 'zustand';
import { createSession } from '../engine/create';
import { newSessionId } from '../engine/ids';
import { reduce } from '../engine/reduce';
import type { SessionRow } from '../storage/db';
import { getProgram } from '../storage/programs';
import { loadHistory, loadSession, saveSession, clearSetting, writeSnapshot } from '../storage/sessions';
import { recoverSession } from '../storage/recovery';
import type { WorkoutAction, WorkoutEvent, WorkoutState } from '../engine/types';

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

interface SessionStore {
  state: WorkoutState | null;
  error: string | null;
  history: SessionRow[];
  busy: boolean;
  restoring: boolean;

  beginWorkout: (programId: string) => Promise<void>;
  dispatch: (action: WorkoutAction) => void;
  editStored: (sessionId: string, action: WorkoutAction) => Promise<WorkoutState | null>;
  recover: () => Promise<void>;
  loadHistory: () => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

export const useSession = create<SessionStore>((set, get) => ({
  state: null,
  error: null,
  history: [],
  busy: false,
  restoring: true,

  async beginWorkout(programId) {
    set({ busy: true });
    try {
      const program = await getProgram(programId);
      if (!program) throw new Error('Program not found.');
      const state = createSession(program, Date.now(), newSessionId());
      set({ state, error: null, busy: false });
      get().dispatch({ type: 'START' });
    } catch (err) {
      set({ error: message(err), busy: false });
    }
  },

  dispatch(action) {
    const prev = get().state;
    if (!prev) return;

    let next: WorkoutState;
    try {
      next = reduce(prev, { ...action, now: Date.now() } as WorkoutEvent);
    } catch (err) {
      set({ error: message(err) });
      return;
    }

    set({ state: next, error: null });
    writeSnapshot(next);
    void saveSession(next).catch((err) => set({ error: `Not saving: ${message(err)}` }));
  },

  /** Annotate a session that is no longer the live one (e.g. opened from history). */
  async editStored(sessionId, action) {
    try {
      const row = await loadSession(sessionId);
      if (!row) return null;
      const next = reduce(row.state, { ...action, now: Date.now() } as WorkoutEvent);
      await saveSession(next);
      if (get().state?.sessionId === sessionId) set({ state: next });
      return next;
    } catch (err) {
      set({ error: message(err) });
      return null;
    }
  },

  /** Startup: pick up the active session, if any. Never overwrites one. */
  async recover() {
    if (get().state) {
      set({ restoring: false });
      return;
    }
    try {
      const found = await recoverSession();
      if (found.kind === 'restored') {
        set({ state: found.row.state, error: null, restoring: false });
        return;
      }
      if (found.kind === 'stale') {
        await clearSetting('activeSessionId');
      }
      if (found.kind === 'corrupt') {
        set({
          error: `A saved session could not be recovered (${found.reason}). It is still in storage; starting a workout begins a new session.`,
        });
      }
      set({ restoring: false });
    } catch (err) {
      set({ error: `Could not open saved sessions: ${message(err)}`, restoring: false });
    }
  },

  async loadHistory() {
    try {
      set({ history: await loadHistory() });
    } catch (err) {
      set({ error: message(err) });
    }
  },

  clearError: () => set({ error: null }),
  reset: () => set({ state: null, error: null }),
}));
