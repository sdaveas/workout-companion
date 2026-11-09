import { ScreenHeader } from '../components/ui/ScreenHeader';
import type { ReactNode } from 'react';

/**
 * The two things a workout app owes other people: credit for the artwork, and a
 * way to say thanks. Kept off Settings so that screen stays about your data.
 */
function GithubIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="h-5 w-5 shrink-0">
      <path d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.55v-1.93c-3.2.7-3.87-1.54-3.87-1.54-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.23-1.28-5.23-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .96-.31 3.15 1.18a10.9 10.9 0 0 1 5.74 0c2.19-1.49 3.15-1.18 3.15-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.43-2.69 5.41-5.25 5.69.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.55A11.5 11.5 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5Z" />
    </svg>
  );
}

function CoffeeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="h-5 w-5 shrink-0"
    >
      <path d="M4 9h11v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9Z" />
      <path d="M15 10h2.5a2.5 2.5 0 0 1 0 5H15" />
      <path d="M8 4.5c0 1-1 1.4-1 2.2M11.5 4c0 1-1 1.4-1 2.2" />
    </svg>
  );
}

function Row({ href, icon, title, note }: { href: string; icon: ReactNode; title: string; note?: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="flex min-h-14 items-center gap-3 px-4">
      <span className="text-muted">{icon}</span>
      <span className="flex-1">
        <span className="block text-sm">{title}</span>
        {note && <span className="block text-xs text-muted">{note}</span>}
      </span>
      <span aria-hidden className="text-muted">
        ↗
      </span>
    </a>
  );
}

export function Credits() {
  return (
    <main className="mx-auto max-w-md px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]">
      <ScreenHeader
        back={{ to: '#/settings', label: 'Settings' }}
        title={<h1 className="text-sm font-semibold uppercase tracking-widest">Credits</h1>}
      />

      <h2 className="mt-8 text-[10px] uppercase tracking-widest text-muted">Exercise illustrations</h2>
      <p className="mt-2 text-sm text-muted">
        Line drawings of each lift, recoloured to match the theme. Two poses per exercise, flipped
        so you can see the movement.
      </p>
      <div className="mt-3 divide-y divide-line rounded-2xl border border-line">
        <Row
          href="https://github.com/everkinetic/data"
          icon={<GithubIcon />}
          title="Everkinetic"
          note="pose artwork"
        />
        <Row
          href="https://github.com/bryllim/workout-guide"
          icon={<GithubIcon />}
          title="Bryl Lim — Workout Guide"
          note="drawings, CC BY-SA 4.0"
        />
      </div>
      <p className="mt-2 px-1 text-xs text-muted">
        Illustrations are CC BY-SA 4.0. Full notice in <code>exercises/ATTRIBUTION.txt</code>.
      </p>

      <h2 className="mt-8 text-[10px] uppercase tracking-widest text-muted">The app</h2>
      <p className="mt-2 text-sm text-muted">
        Runs entirely on this phone. Nothing you log leaves it.
      </p>
      <div className="mt-3 divide-y divide-line rounded-2xl border border-line">
        <Row
          href="https://github.com/sdaveas/workout-companion"
          icon={<GithubIcon />}
          title="Source on GitHub"
        />
        <Row
          href="https://buymeacoffee.com/br3gan"
          icon={<CoffeeIcon />}
          title="Buy me a coffee"
          note="if it saves you dragging a notebook to the gym"
        />
      </div>
    </main>
  );
}
