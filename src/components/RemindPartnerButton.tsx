'use client';

import { useState, useEffect } from 'react';

interface RemindPartnerButtonProps {
  translations: {
    remindPartner: string;
    reminderSent: string;
    reminderFailed: string;
  };
}

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

  const label =
    status === 'sending' ? '...'
    : status === 'sent' ? translations.reminderSent
    : status === 'error' ? translations.reminderFailed
    : translations.remindPartner;

  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      className={`px-4 py-2 rounded-lg text-sm font-medium transition active:scale-95 ${
        status === 'sent'
          ? 'bg-green-600 text-white'
          : status === 'error'
          ? 'bg-red-600 text-white'
          : disabled
          ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
          : 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-200 dark:hover:bg-indigo-900/70'
      }`}
    >
      {label}
    </button>
  );
}
