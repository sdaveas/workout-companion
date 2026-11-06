import Dexie, { type Table } from 'dexie';
import type { Program, WorkoutState, WorkoutStatus } from '../engine/types';

export interface SessionRow {
  id: string;
  stateVersion: 1;
  programId: string;
  programName: string;
  status: WorkoutStatus;
  startedAt: number;
  finishedAt: number | null;
  state: WorkoutState;
}

export interface SettingRow {
  key: 'activeSessionId' | 'lastSessionId' | 'seeded';
  value: string;
}

class WorkoutDB extends Dexie {
  programs!: Table<Program, string>;
  sessions!: Table<SessionRow, string>;
  settings!: Table<SettingRow, string>;

  constructor() {
    super('workout-companion');
    this.version(1).stores({
      programs: 'id, name',
      sessions: 'id, programId, status, startedAt, finishedAt',
      settings: 'key',
    });
  }
}

export const db = new WorkoutDB();
export type { Program };
