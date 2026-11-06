import { useState } from 'react';

export function ExerciseImage({ src, alt }: { src: string | null; alt: string }) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        aria-hidden
        className="flex h-40 w-full items-center justify-center rounded-2xl border border-line bg-surface text-muted"
      >
        <svg viewBox="0 0 64 64" className="h-16 w-16" fill="none" stroke="currentColor" strokeWidth="3">
          <rect x="4" y="26" width="8" height="12" rx="2" />
          <rect x="52" y="26" width="8" height="12" rx="2" />
          <path d="M12 32h40" strokeLinecap="round" />
        </svg>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      onError={() => setFailed(true)}
      className="h-40 w-full rounded-2xl border border-line object-cover"
    />
  );
}
