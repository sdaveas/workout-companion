import type { ReactNode } from 'react';

interface Back {
  to: string;
  label: string;
  /** Extra work on the way out (e.g. dropping an unstarted session). */
  onSelect?: () => void;
  /** Icon only; for screens with tight header space. */
  compact?: boolean;
}

/**
 * One header for every screen. The back target is a declared parent route, never
 * `history.back()`: a reload or a shared link has no history, and iOS standalone has
 * no browser chrome. Home is the root and takes no `back`.
 */
export function ScreenHeader({
  back,
  title,
  actions,
  children,
  /** Slightly tighter top padding; exactly one pt-* class is emitted, so the override
      does not depend on stylesheet order. */
  dense = false,
  className = '',
}: {
  back?: Back;
  title?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  dense?: boolean;
  className?: string;
}) {
  return (
    <header
      className={`shrink-0 px-5 ${
        dense ? 'pt-[max(0.75rem,env(safe-area-inset-top))]' : 'pt-[max(1rem,env(safe-area-inset-top))]'
      } ${className}`}
    >
      <div className="flex min-h-11 items-center gap-2">
        {back && (
          <a
            href={back.to}
            aria-label={`Back to ${back.label}`}
            // The anchor navigates natively; the handler only does the extra work
            // (dropping an unstarted session). Preventing the default here would
            // leave the back control dead.
            onClick={back.onSelect}
            className="flex h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-xl border border-line px-3 text-sm text-muted"
          >
            <span aria-hidden>←</span>
            {!back.compact && <span>{back.label}</span>}
          </a>
        )}
        <div className="min-w-0 flex-1">{title}</div>
        {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
      </div>
      {children}
    </header>
  );
}
