import { useState } from 'react';
import { usePrograms } from '../../store/programsStore';

type State = 'idle' | 'busy' | 'done' | 'none';

/** Dev only: import everything the MCP wrote into data/programs. Never ships. */
export function SyncFromDisk() {
  const programs = usePrograms((s) => s.programs);
  const setText = usePrograms((s) => s.setText);
  const save = usePrograms((s) => s.save);
  const [state, setState] = useState<State>('idle');
  const [count, setCount] = useState(0);

  if (!import.meta.env.DEV) return null;

  async function sync() {
    if (programs.length > 0 && !confirm('Replace programs that share an id with the files on disk?')) {
      return;
    }
    setState('busy');
    try {
      const res = await fetch('/data/programs/index.json', { cache: 'no-store' });
      if (!res.ok) {
        setState('none');
        return;
      }
      const index = (await res.json()) as { programs?: Array<{ id: string }> };
      let saved = 0;
      for (const entry of index.programs ?? []) {
        const file = await fetch(`/data/programs/${entry.id}.json`, { cache: 'no-store' });
        if (!file.ok) continue;
        setText(await file.text());
        await save(true);
        saved += 1;
      }
      setCount(saved);
      setState('done');
    } catch {
      setState('none');
    }
  }

  return (
    <div className="mt-3 text-xs text-muted">
      <button
        type="button"
        disabled={state === 'busy'}
        onClick={() => void sync()}
        className="min-h-11 underline"
      >
        {state === 'busy' ? 'Syncing…' : 'Sync from data/programs (dev)'}
      </button>
      {state === 'done' && <span className="ml-2 text-accent">imported {count}</span>}
      {state === 'none' && <span className="ml-2">no data/programs on this server</span>}
    </div>
  );
}
