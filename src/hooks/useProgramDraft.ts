import { useState } from 'react';
import type { Program } from '../engine/types';
import { usePrograms } from '../store/programsStore';
import { libraryExercise } from '../data/exercises';
import {
  buildProgramJson,
  draftFromProgram,
  emptyDraft,
  emptyExercise,
  type DraftExercise,
  type ProgramDraft,
} from '../lib/buildProgram';

/**
 * The editable shape of one program, shared by "build a program" and the program
 * screen so the two forms cannot drift apart.
 *
 * The draft is local until `commit()`: a restructure is one decision, not a write per
 * keystroke. `commit` goes through the importer like every other way in, so a program
 * that cannot be typed in by hand cannot be made here either.
 */
export function useProgramDraft(initial?: Program) {
  const setText = usePrograms((s) => s.setText);
  const save = usePrograms((s) => s.save);
  const [draft, setDraft] = useState<ProgramDraft>(() =>
    initial ? draftFromProgram(initial) : emptyDraft(),
  );

  const patch = (p: Partial<ProgramDraft>) => setDraft((d) => ({ ...d, ...p }));
  const patchExercise = (i: number, p: Partial<DraftExercise>) =>
    setDraft((d) => ({ ...d, exercises: d.exercises.map((e, n) => (n === i ? { ...e, ...p } : e)) }));
  const removeExercise = (i: number) =>
    setDraft((d) => ({ ...d, exercises: d.exercises.filter((_, n) => n !== i) }));
  const moveExercise = (i: number, by: -1 | 1) =>
    setDraft((d) => {
      const next = [...d.exercises];
      const [row] = next.splice(i, 1);
      next.splice(i + by, 0, row);
      return { ...d, exercises: next };
    });

  /** A library pick fills a row with name, sets, reps, rest and the per-hand flag. */
  const addFromLibrary = (name: string) => {
    const known = libraryExercise(name);
    if (!known) return -1;
    // blank rows are never saved, so they would only sit above the new exercise
    const kept = draft.exercises.filter((e) => e.name.trim()).length;
    setDraft((d) => ({
      ...d,
      exercises: [
        ...d.exercises.filter((e) => e.name.trim()),
        {
          name: known.name,
          sets: known.sets,
          repsMin: known.repsMin,
          repsMax: known.repsMax,
          weightKg: '',
          perHand: known.perHand ?? false,
          restSeconds: known.restSeconds,
        },
      ],
    }));
    return kept;
  };

  const addBlank = () => {
    const kept = draft.exercises.length;
    setDraft((d) => ({ ...d, exercises: [...d.exercises, emptyExercise()] }));
    return kept;
  };

  const ready = draft.name.trim().length > 0 && draft.exercises.some((e) => e.name.trim());

  /** Throws away local edits and starts again from what is saved. */
  const reset = () => setDraft(initial ? draftFromProgram(initial) : emptyDraft());

  async function commit(name?: string): Promise<boolean> {
    setText(buildProgramJson(draft, initial?.id, initial));
    return save({ update: initial != null, name });
  }

  return {
    draft,
    patch,
    patchExercise,
    addFromLibrary,
    addBlank,
    removeExercise,
    moveExercise,
    ready,
    commit,
    reset,
  };
}
