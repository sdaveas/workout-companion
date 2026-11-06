export function Banner({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 border-b border-danger/40 bg-danger/10 px-5 py-3 text-sm text-danger"
    >
      <p className="flex-1">{message}</p>
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="shrink-0 underline">
          dismiss
        </button>
      )}
    </div>
  );
}
