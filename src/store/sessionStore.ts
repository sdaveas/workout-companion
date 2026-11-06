import { create } from 'zustand';
import { createSession } from '../engine/create';
import { newSessionId } from '../engine/ids';
import { reduce } from '../engine/reduce';
import type { SessionRow } from '../storage/db';
import { getProgram } from '../storage/programs';
import { loadHistory, loadSession, saveSession } from '../storage/sessions';
import type { WorkoutAction, WorkoutEvent, WorkoutState } from '../engine/types';

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

interface SessionStore {
  state: WorkoutState | null;
  error: string | null;
  history: SessionRow[];
  busy: boolean;

  beginWorkout: (programId: string) => Promise<void>;
  dispatch: (action: WorkoutAction) => void;
  editStored: (sessionId: string, action: WorkoutAction) => Promise<WorkoutState | null>;
  loadHistory: () => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

export const useSession = create<SessionStore>((set, get) => ({
  state: null,
  error: null,
  history: [],
  busy: false,

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
