'use client';

import { useTranslations } from 'next-intl';
import { Button, Dialog } from '@/components/ui';

interface ConfirmDialogProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  isLoading?: boolean;
}

/**
 * The one destructive confirmation. Every call site today is a delete or a
 * leave, so the confirm is `dangerSolid` — the one place the design system
 * allows a filled critical button.
 *
 * Previously a hand-rolled overlay whose `bg-black bg-opacity-50` compiled to
 * nothing under Tailwind v4, so the page behind it went solid black. `Dialog`
 * owns the scrim, portal, focus trap, focus restore, Esc and scroll lock now.
 */
export default function ConfirmDialog({
  isOpen,
  onConfirm,
  onCancel,
  title,
  message,
  confirmLabel,
  cancelLabel,
  isLoading,
}: ConfirmDialogProps) {
  const tCommon = useTranslations('common');

  // Esc and the scrim must not abandon a request that is already in flight —
  // the cancel button was already disabled for the same reason.
  const handleClose = () => {
    if (!isLoading) onCancel();
  };

  return (
    <Dialog
      open={isOpen}
      onClose={handleClose}
      title={title}
      size="sm"
      closeLabel={tCommon('close')}
      footer={
        <div className="flex flex-wrap gap-3">
          <Button
            variant="secondary"
            className="min-w-0 grow basis-32"
            onClick={onCancel}
            disabled={isLoading}
          >
            {cancelLabel}
          </Button>
          <Button
            variant="dangerSolid"
            className="min-w-0 grow basis-32"
            onClick={onConfirm}
            pending={isLoading}
            pendingLabel={tCommon('processing')}
          >
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <p className="text-sm leading-relaxed text-ink-muted">{message}</p>
    </Dialog>
  );
}
