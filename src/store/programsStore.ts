import { create } from 'zustand';
import type { Program } from '../engine/types';
import { describeError, parseProgram, type ProgramIssue } from '../schemas/program';
import { conflictingProgram, renameProgram } from '../lib/identity';
import {
  deleteProgram,
  DuplicateProgramId,
  listPrograms,
  saveProgram,
} from '../storage/programs';
import { prefetchImages } from '../lib/images';
import { now } from '../engine/ids';

interface ProgramsStore {
  programs: Program[];
  text: string;
  preview: Program | null;
  issues: ProgramIssue[];
  /** The name that is already in use, when a save was stopped by it. */
  conflict: string | null;
  notice: string | null;
  loaded: boolean;

  load: () => Promise<void>;
  setText: (text: string) => void;
  /**
   * Writes the preview. `name` retries a stopped save under another name.
   * `update` is the Edit path: the same id is kept and the stored row is replaced.
   * Returns true when the program was written.
   */
  save: (opts?: { update?: boolean; name?: string }) => Promise<boolean>;
  remove: (id: string) => Promise<void>;
  clear: () => void;
}

const empty = {
  text: '',
  preview: null,
  issues: [] as ProgramIssue[],
  conflict: null,
  notice: null,
};

export const usePrograms = create<ProgramsStore>((set, get) => ({
  programs: [],
  loaded: false,
  ...empty,

  async load() {
    set({ programs: await listPrograms(), loaded: true });
  },

  setText(text) {
    const result = parseProgram(text);
    if (result.ok) {
      set({ text, preview: result.program, issues: [], conflict: null, notice: null });
    } else {
      set({ text, preview: null, issues: describeError(result.error), conflict: null });
    }
  },

  async save(opts = {}) {
    const { preview } = get();
    if (!preview) return false;
    const update = opts.update ?? false;
    const existing = get().programs;

    let target = preview;
    if (opts.name !== undefined) {
      const renamed = renameProgram(preview, opts.name, existing, { keepId: update });
      if (!renamed.ok) {
        set({ conflict: opts.name.trim(), notice: null });
        return false;
      }
      target = renamed.program;
    } else {
      // "Workout B" already saved → the id and the name both clash; ask for a name instead
      // of overwriting, which is what "Replace it" used to do.
      const clash = conflictingProgram(preview, existing, update ? preview.id : undefined);
      if (clash) {
        set({ conflict: clash.name, notice: null });
        return false;
      }
    }

    // The stamp lives outside `raw`: the program schema is strict, so an extra field
    // inside the file would make a program that this app itself wrote fail to import.
    target = { ...target, updatedAt: now() };

    try {
      await saveProgram(target, { replace: update });
      prefetchImages(target);
      set({ ...empty, notice: `Program "${target.name}" ${update ? 'updated' : 'added'}.` });
      await get().load();
      return true;
    } catch (err) {
      if (err instanceof DuplicateProgramId) {
        set({ conflict: target.name, notice: null });
      } else {
        set({ notice: null, issues: [{ path: 'storage', message: (err as Error).message }] });
      }
      return false;
    }
  },

  async remove(id) {
    await deleteProgram(id);
    if (get().preview?.id === id) set({ ...empty });
    await get().load();
  },

  clear() {
    set({ ...empty });
  },
}));
