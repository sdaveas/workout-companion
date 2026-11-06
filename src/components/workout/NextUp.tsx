export function NextUp({ name, detail }: { name: string; detail?: string }) {
  return (
    <div className="flex items-baseline justify-between border-t border-line pt-3">
      <span className="text-xs uppercase tracking-widest text-muted">Next</span>
      <span className="text-sm">
        {name}
        {detail && <span className="text-muted"> · {detail}</span>}
      </span>
    </div>
  );
}
