import { usePrograms } from '../store/programsStore';

export function Home() {
  const programs = usePrograms((s) => s.programs);

  return (
    <main className="mx-auto max-w-md px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]">
      <p className="text-xs uppercase tracking-[0.2em] text-muted">Workout Companion</p>
      <h1 className="mt-3 text-3xl font-semibold">Ready to train</h1>

      <section className="mt-8 rounded-2xl border border-line bg-surface p-5">
        <p className="text-xs uppercase tracking-widest text-muted">Programs</p>
        <p className="mt-2 text-2xl font-semibold">
          {programs.length === 0 ? 'None yet' : `${programs.length} imported`}
        </p>
        <a
          href="#/programs"
          className="mt-5 flex h-14 items-center justify-center rounded-xl bg-accent font-semibold text-ink"
        >
          Manage programs
        </a>
      </section>

      <p className="mt-6 text-sm text-muted">
        Phase 1: import, validate and store a program. The workout engine lands next.
      </p>
    </main>
  );
}
