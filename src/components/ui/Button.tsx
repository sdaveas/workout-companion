import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const styles: Record<Variant, string> = {
  primary: 'bg-accent text-ink font-semibold',
  secondary: 'border border-line bg-surface text-white',
  ghost: 'text-muted',
  danger: 'border border-line bg-surface text-danger',
};

export function Button({
  variant = 'secondary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={`min-h-12 rounded-xl px-4 text-sm disabled:opacity-40 ${styles[variant]} ${className}`}
    />
  );
}
