'use client';

import { useState, useEffect } from 'react';
import { Badge, Button } from '@/components/ui';

interface RemindPartnerButtonProps {
  translations: {
    remindPartner: string;
    reminderSent: string;
    reminderFailed: string;
  };
}

/* -------------------------------------------------------------------------- */
/* Icons — non-directional, so no rtl:rotate-180 needed.                       */
/* -------------------------------------------------------------------------- */

function BellIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 2a4 4 0 00-4 4c0 3-1 4-1 4h10s-1-1-1-4a4 4 0 00-4-4z" />
      <path d="M6.75 12.5a1.5 1.5 0 002.5 0" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 8.5l3.5 3.5L13 5" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="6" />
      <path d="M8 5v3.5M8 11h.01" />
    </svg>
  );
}

/**
 * The reminder keeps its name through the whole flow: the button always reads
 * "remind", and the outcome is announced beside it as a status pill rather
 * than by repainting the control green or red.
 */
export default function RemindPartnerButton({ translations }: RemindPartnerButtonProps) {
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [cooldown, setCooldown] = useState(false);

  useEffect(() => {
    if (status === 'sent' || status === 'error') {
      const timer = setTimeout(() => setStatus('idle'), 3000);
      return () => clearTimeout(timer);
    }
  }, [status]);

  useEffect(() => {
    if (cooldown) {
      const timer = setTimeout(() => setCooldown(false), 60000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  const handleClick = async () => {
    setStatus('sending');
    try {
      const res = await fetch('/api/notify/remind', { method: 'POST' });
      if (res.ok) {
        setStatus('sent');
        setCooldown(true);
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    }
  };

  const disabled = status === 'sending' || cooldown;

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <span role="status" aria-live="polite">
        {status === 'sent' ? (
          <Badge tone="success" icon={<CheckIcon />}>
            {translations.reminderSent}
          </Badge>
        ) : null}
        {status === 'error' ? (
          <Badge tone="critical" icon={<AlertIcon />}>
            {translations.reminderFailed}
          </Badge>
        ) : null}
      </span>

      <Button
        variant="secondary"
        size="sm"
        className="whitespace-nowrap"
        startSlot={<BellIcon />}
        pending={status === 'sending'}
        disabled={disabled}
        onClick={handleClick}
      >
        {translations.remindPartner}
      </Button>
    </div>
  );
}
