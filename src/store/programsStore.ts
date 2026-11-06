import { create } from 'zustand';
import type { Program } from '../engine/types';
import { describeError, parseProgram, type ProgramIssue } from '../schemas/program';
import {
  deleteProgram,
  DuplicateProgramId,
  listPrograms,
  saveProgram,
} from '../storage/programs';
import { seedIfEmpty } from '../storage/seed';
import { prefetchImages } from '../lib/images';

interface ProgramsStore {
  programs: Program[];
  text: string;
  preview: Program | null;
  issues: ProgramIssue[];
  duplicateId: string | null;
  notice: string | null;
  loaded: boolean;

  load: () => Promise<void>;
  setText: (text: string) => void;
  save: (replace?: boolean) => Promise<void>;
  remove: (id: string) => Promise<void>;
  clear: () => void;
}

const empty = {
  text: '',
  preview: null,
  issues: [] as ProgramIssue[],
  duplicateId: null,
  notice: null,
};

export const usePrograms = create<ProgramsStore>((set, get) => ({
  programs: [],
  loaded: false,
  ...empty,

  async load() {
    await seedIfEmpty();
    set({ programs: await listPrograms(), loaded: true });
  },

  setText(text) {
    const result = parseProgram(text);
    if (result.ok) {
      set({ text, preview: result.program, issues: [], duplicateId: null, notice: null });
    } else {
      set({ text, preview: null, issues: describeError(result.error), duplicateId: null });
    }
  },

  async save(replace = false) {
    const { preview } = get();
    if (!preview) return;
    try {
      await saveProgram(preview, { replace });
      prefetchImages(preview);
      set({ ...empty, notice: `Saved "${preview.name}".` });
      await get().load();
    } catch (err) {
      if (err instanceof DuplicateProgramId) {
        set({ duplicateId: err.id, notice: null });
      } else {
        set({ notice: null, issues: [{ path: 'storage', message: (err as Error).message }] });
      }
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
