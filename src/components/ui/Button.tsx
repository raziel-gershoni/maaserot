import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Spinner } from './Spinner';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'accent'
  | 'ghost'
  | 'danger'
  | 'dangerSolid';

export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-brand-ink hover:bg-brand-hover shadow-card',
  // A real secondary: surface + border. Never a solid grey fill, which reads
  // as disabled.
  secondary:
    'bg-surface text-ink border border-line-strong hover:bg-surface-sunken',
  accent: 'bg-accent text-accent-ink hover:bg-accent-hover shadow-card',
  ghost: 'text-ink-muted hover:bg-surface-sunken hover:text-ink',
  // Destructive is an outline by default — a solid red fill sits too close to
  // the clay brand to be read as a warning.
  danger:
    'text-critical border border-critical/40 hover:bg-critical-soft hover:border-critical',
  dangerSolid: 'bg-critical text-critical-ink hover:bg-critical-hover shadow-card',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-sm gap-1.5',
  md: 'h-11 px-4 text-[0.9375rem] gap-2',
  lg: 'h-13 px-5 text-base gap-2',
};

const ICON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-9 w-9',
  md: 'h-11 w-11',
  lg: 'h-13 w-13',
};

export function buttonStyles({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  icon = false,
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  icon?: boolean;
  className?: string;
} = {}) {
  return cn(
    'inline-flex items-center justify-center rounded-control font-semibold',
    'transition-[background-color,border-color,color,transform] duration-150',
    'active:scale-[0.98]',
    'disabled:pointer-events-none disabled:opacity-45',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
    icon ? ICON_SIZES[size] : SIZES[size],
    VARIANTS[variant],
    fullWidth && 'w-full',
    className
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  icon?: boolean;
  /** Shows a spinner and blocks interaction. Keeps width stable. */
  pending?: boolean;
  /** Replaces the label while `pending` is true. */
  pendingLabel?: string;
  startSlot?: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth,
  icon,
  pending,
  pendingLabel,
  startSlot,
  className,
  children,
  disabled,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      className={buttonStyles({ variant, size, fullWidth, icon, className })}
      {...props}
    >
      {pending ? (
        <>
          <Spinner size={size === 'lg' ? 'md' : 'sm'} />
          {pendingLabel ?? (icon ? null : children)}
        </>
      ) : (
        <>
          {startSlot}
          {children}
        </>
      )}
    </button>
  );
}
