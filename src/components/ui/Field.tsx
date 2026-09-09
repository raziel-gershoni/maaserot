'use client';

import { useId } from 'react';
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const CONTROL_BASE = cn(
  'w-full rounded-control border bg-surface text-ink',
  'placeholder:text-ink-faint',
  'transition-[border-color,box-shadow] duration-150',
  'focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/25',
  'disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-faint'
);

export interface FieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label: string;
  hint?: string;
  error?: string;
  /** A unit shown inside the control — ₪, %. Keeps units out of the label. */
  affix?: ReactNode;
}

export function Field({
  label,
  hint,
  error,
  affix,
  className,
  id: idProp,
  ...props
}: FieldProps) {
  const generated = useId();
  const id = idProp ?? generated;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy =
    [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') ||
    undefined;

  return (
    <div className={className}>
      <label
        htmlFor={id}
        className="mb-1.5 block text-sm font-semibold text-ink"
      >
        {label}
      </label>

      <div className="relative">
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            CONTROL_BASE,
            'h-11 px-3',
            affix && 'pe-10',
            error
              ? 'border-critical focus:border-critical focus:ring-critical/25'
              : 'border-line-strong'
          )}
          {...props}
        />
        {affix ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-sm font-medium text-ink-faint"
          >
            {affix}
          </span>
        ) : null}
      </div>

      {hint && !error ? (
        <p id={hintId} className="mt-1.5 text-xs text-ink-faint">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="mt-1.5 text-xs font-medium text-critical">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function SelectField({
  label,
  hint,
  className,
  id: idProp,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  hint?: string;
}) {
  const generated = useId();
  const id = idProp ?? generated;
  const hintId = `${id}-hint`;

  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-ink">
        {label}
      </label>
      <select
        id={id}
        aria-describedby={hint ? hintId : undefined}
        className={cn(CONTROL_BASE, 'h-11 border-line-strong px-3')}
        {...props}
      >
        {children}
      </select>
      {hint ? (
        <p id={hintId} className="mt-1.5 text-xs text-ink-faint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
