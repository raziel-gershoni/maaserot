'use client';

import { useCallback, useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * The one modal in the app.
 *
 * Replaces four hand-rolled overlays that shared a bug: `bg-black bg-opacity-50`
 * is not a Tailwind v4 utility, so every one of them rendered a solid opaque
 * black scrim. This uses `bg-black/50`.
 *
 * Also does what none of them did: portal, focus trap, restore focus on close,
 * Esc to dismiss, body scroll lock, and `role="dialog"` with an accessible name.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  closeLabel = 'Close',
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md';
  closeLabel?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descId = useId();

  // Every call site passes a fresh arrow for onClose, so memoising the key
  // handler on the prop itself would rebuild it on each parent render. The
  // effect below would then tear down and re-run continuously while the dialog
  // is open, and its cleanup restores focus to the trigger — pulling focus out
  // of the panel on every keystroke. Read the latest onClose through a ref and
  // keep the handler genuinely stable.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;

      const items = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)
      ).filter((el) => el.offsetParent !== null);
      if (items.length === 0) return;

      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    },
    []
  );

  useEffect(() => {
    if (!open) return;

    restoreRef.current = document.activeElement as HTMLElement | null;

    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);

    // Focus the panel itself rather than the first control, so a destructive
    // confirm is never focused by default.
    const raf = requestAnimationFrame(() => panelRef.current?.focus());

    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', handleKeyDown);
      cancelAnimationFrame(raf);
      restoreRef.current?.focus?.();
    };
  }, [open, handleKeyDown]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-black/50 animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cn(
          'relative z-10 w-full animate-rise bg-surface shadow-overlay outline-none',
          'max-h-[92dvh] overflow-y-auto',
          'rounded-t-panel sm:rounded-panel',
          size === 'sm' ? 'sm:max-w-sm' : 'sm:max-w-md'
        )}
      >
        <div className="flex items-start justify-between gap-4 p-5 pb-0">
          <div className="min-w-0">
            <h2
              id={titleId}
              className="font-display text-lg font-semibold text-ink"
            >
              {title}
            </h2>
            {description ? (
              <p id={descId} className="mt-1 text-sm text-ink-muted">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="-me-1.5 -mt-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-control text-ink-faint transition-colors hover:bg-surface-sunken hover:text-ink"
          >
            <svg
              className="h-5 w-5"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </div>

        <div className="p-5">{children}</div>

        {footer ? (
          <div className="sticky bottom-0 border-t border-line bg-surface p-5 pt-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  );
}
