'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { translateApiError } from '@/lib/errorCodes';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  Dialog,
  EmptyState,
  Field,
  PageHeader,
  SectionRule,
  Skeleton,
} from '@/components/ui';

interface User {
  id: string;
  name: string | null;
  email: string;
}

interface Partnership {
  id: string;
  user1Id: string;
  user2Id: string;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED';
  initiatedBy: string;
  user1: User;
  user2: User;
  createdAt: string;
}

interface PartnershipResponse {
  currentPartnership?: Partnership | null;
  pendingInvitations?: Partnership[];
  sentInvitations?: Partnership[];
}

type LoadStatus = 'loading' | 'ready' | 'error';
type RowAction = 'accept' | 'decline' | 'cancel';
type ErrorScope = 'received' | 'sent';

/* -------------------------------------------------------------------------- */
/* Icons — non-directional, so no rtl:rotate-180 needed.                       */
/* -------------------------------------------------------------------------- */

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

function ClockIcon() {
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
      <path d="M8 4.5V8l2.25 1.5" />
    </svg>
  );
}

function PartnersIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="9" cy="8" r="3.25" />
      <path d="M3.5 19.5a5.5 5.5 0 0111 0" />
      <path d="M16 5.4a3.25 3.25 0 010 5.2M17.5 14.6a5.5 5.5 0 013 4.9" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Pieces                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * One identity treatment for every party on the page. The email is a Latin run
 * inside Hebrew, so it is bidi-isolated — otherwise the algorithm reorders it
 * around the surrounding text.
 */
function Party({ user }: { user: User }) {
  const name = user.name?.trim() ?? '';
  const display = name || user.email;
  const initial = display.charAt(0).toUpperCase();

  return (
    <div className="flex min-w-0 items-center gap-3">
      <span
        aria-hidden="true"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line bg-surface font-display text-sm font-semibold text-ink-muted"
      >
        {initial}
      </span>
      <div className="min-w-0">
        <p className="truncate font-display font-semibold text-ink">
          {name || <span className="bidi-isolate">{user.email}</span>}
        </p>
        {name ? (
          <p className="mt-0.5 truncate text-sm text-ink-muted bidi-isolate">
            {user.email}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function PartnershipSkeleton() {
  return (
    <div aria-busy="true">
      <Card>
        <Skeleton className="h-6 w-40" />
        <Skeleton className="mt-5 h-[4.5rem] w-full" />
        <Skeleton className="mt-8 h-3 w-28" />
        <Skeleton className="mt-4 h-11 w-full" />
        <Skeleton className="mt-3 h-11 w-full" />
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

export default function PartnershipPage() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const [currentPartnership, setCurrentPartnership] =
    useState<Partnership | null>(null);
  const [pendingInvitations, setPendingInvitations] = useState<Partnership[]>([]);
  const [sentInvitations, setSentInvitations] = useState<Partnership[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);

  // Nothing state-dependent renders until the first fetch resolves, so the
  // invite form can no longer flash before an existing partnership loads.
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<{ id: string; action: RowAction } | null>(
    null
  );
  const [actionError, setActionError] = useState<{
    scope: ErrorScope;
    message: string;
  } | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [leavePending, setLeavePending] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const [leaveDone, setLeaveDone] = useState(false);

  const t = useTranslations('partnership');
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('errors');
  const router = useRouter();

  /** The current user's id, from an invitation when possible, settings otherwise. */
  const resolveCurrentUserId = useCallback(
    async (data: PartnershipResponse): Promise<string | null> => {
      if (data.sentInvitations && data.sentInvitations.length > 0) {
        return data.sentInvitations[0].user1Id;
      }
      if (data.pendingInvitations && data.pendingInvitations.length > 0) {
        return data.pendingInvitations[0].user2Id;
      }
      try {
        const response = await fetch('/api/settings');
        if (!response.ok) return null;
        const settings = await response.json();
        return settings.userId ?? null;
      } catch {
        return null;
      }
    },
    []
  );

  const fetchPartnerships = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!silent) {
        setStatus('loading');
        setLoadError(null);
      }

      try {
        const response = await fetch('/api/partnership');
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(translateApiError(tErrors, data?.error));
        }

        const data: PartnershipResponse = await response.json();
        const partnership = data.currentPartnership ?? null;
        const userId = await resolveCurrentUserId(data);

        // Without an id we cannot tell which side of the partnership is the
        // viewer — better an error than naming someone as their own partner.
        if (partnership && !userId) {
          throw new Error(translateApiError(tErrors, null));
        }

        setCurrentUserId(userId);
        setCurrentPartnership(partnership);
        setPendingInvitations(data.pendingInvitations ?? []);
        setSentInvitations(data.sentInvitations ?? []);
        setLoadError(null);
        setStatus('ready');
      } catch (err) {
        const message =
          err instanceof Error && err.message
            ? err.message
            : translateApiError(tErrors, null);
        setLoadError(message);
        // A silent refresh keeps what is on screen; the message surfaces above
        // the card instead of replacing it.
        if (!silent) setStatus('error');
      }
    },
    [resolveCurrentUserId, tErrors]
  );

  useEffect(() => {
    fetchPartnerships();
  }, [fetchPartnerships]);

  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setSuccess(false), 3000);
    return () => clearTimeout(timer);
  }, [success]);

  /** The partner is whichever side of the partnership is not the viewer. */
  const getPartner = (partnership: Partnership): User | null => {
    if (!currentUserId) return null;
    return partnership.user1Id === currentUserId
      ? partnership.user2
      : partnership.user1;
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setIsLoading(true);

    try {
      const response = await fetch('/api/partnership', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partnerEmail: email }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(translateApiError(tErrors, data?.error));
        return;
      }

      setSuccess(true);
      setEmail('');
      fetchPartnerships({ silent: true });
    } catch {
      setError(translateApiError(tErrors, null));
    } finally {
      setIsLoading(false);
    }
  };

  const patchInvitation = async (
    partnershipId: string,
    action: 'accept' | 'decline',
    scope: ErrorScope
  ) => {
    setActionError(null);
    setBusy({ id: partnershipId, action });

    try {
      const response = await fetch('/api/partnership', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partnershipId, action }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setActionError({ scope, message: translateApiError(tErrors, data?.error) });
        return;
      }

      await fetchPartnerships({ silent: true });

      if (action === 'accept') {
        setAccepted(true);
        // Land on the group view the partnership just unlocked.
        setTimeout(() => router.push('/dashboard'), 500);
      }
    } catch {
      setActionError({ scope, message: translateApiError(tErrors, null) });
    } finally {
      setBusy(null);
    }
  };

  const handleAccept = (partnershipId: string) =>
    patchInvitation(partnershipId, 'accept', 'received');

  const handleDecline = (partnershipId: string) =>
    patchInvitation(partnershipId, 'decline', 'received');

  const handleLeave = async () => {
    if (!currentPartnership) return;

    setLeaveError(null);
    setLeavePending(true);

    try {
      const response = await fetch(
        `/api/partnership?id=${currentPartnership.id}`,
        { method: 'DELETE' }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setLeaveError(translateApiError(tErrors, data?.error));
        return;
      }

      setConfirmLeave(false);
      setLeaveDone(true);
      await fetchPartnerships({ silent: true });
      setTimeout(() => router.push('/dashboard'), 500);
    } catch {
      setLeaveError(translateApiError(tErrors, null));
    } finally {
      setLeavePending(false);
    }
  };

  const handleCancelInvitation = async (partnershipId: string) => {
    setActionError(null);
    setBusy({ id: partnershipId, action: 'cancel' });

    try {
      const response = await fetch(`/api/partnership?id=${partnershipId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setActionError({
          scope: 'sent',
          message: translateApiError(tErrors, data?.error),
        });
        return;
      }

      await fetchPartnerships({ silent: true });
    } catch {
      setActionError({ scope: 'sent', message: translateApiError(tErrors, null) });
    } finally {
      setBusy(null);
    }
  };

  const partner = currentPartnership ? getPartner(currentPartnership) : null;
  const hasReceived = pendingInvitations.length > 0;
  const hasSent = sentInvitations.length > 0;
  const isBusy = busy !== null;

  /* -- Received invitations: pending, so caution. -------------------------- */
  const receivedList = (
    <ul className="space-y-3">
      {pendingInvitations.map((invitation) => {
        const rowBusy = busy?.id === invitation.id;
        return (
          <li
            key={invitation.id}
            className="rounded-row border border-caution/30 bg-caution-soft p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Party user={invitation.user1} />
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => handleAccept(invitation.id)}
                  disabled={isBusy}
                  pending={rowBusy && busy?.action === 'accept'}
                >
                  {t('accept')}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => handleDecline(invitation.id)}
                  disabled={isBusy}
                  pending={rowBusy && busy?.action === 'decline'}
                >
                  {t('decline')}
                </Button>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );

  const receivedError =
    actionError?.scope === 'received' ? (
      <Alert tone="error" className="mt-3">
        {actionError.message}
      </Alert>
    ) : null;

  const statusBadge = partner ? (
    <Badge tone="success" icon={<CheckIcon />}>
      {t('partnershipActive')}
    </Badge>
  ) : hasReceived || hasSent ? (
    <Badge tone="warning" icon={<ClockIcon />}>
      {t('waitingForResponse')}
    </Badge>
  ) : (
    <Badge>{t('noPartnership')}</Badge>
  );

  return (
    <div className="px-4 py-6 sm:px-6 md:py-8">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <PageHeader title={t('title')} description={t('subtitle')} />

        {status === 'loading' ? <PartnershipSkeleton /> : null}

        {status === 'error' ? (
          <Alert
            tone="error"
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => fetchPartnerships()}
              >
                {t('retry')}
              </Button>
            }
          >
            {loadError ?? translateApiError(tErrors, null)}
          </Alert>
        ) : null}

        {status === 'ready' ? (
          <>
            {/* A refresh that failed keeps the last good data on screen. */}
            {loadError ? (
              <Alert
                tone="warning"
                action={
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => fetchPartnerships()}
                  >
                    {t('retry')}
                  </Button>
                }
              >
                {loadError}
              </Alert>
            ) : null}

            {accepted ? (
              <Alert tone="success">{t('invitationAccepted')}</Alert>
            ) : null}

            {leaveDone ? (
              <Alert tone="info">{t('partnershipEnded')}</Alert>
            ) : null}

            <Card>
              <CardHeader title={t('currentPartnership')} action={statusBadge} />

              {/* -- The current state, whatever it happens to be. --------- */}
              <div className="mt-5">
                {partner ? (
                  <>
                    <div className="rounded-row border border-positive/25 bg-positive-soft p-4">
                      <Party user={partner} />
                    </div>
                    <div className="mt-4 flex flex-wrap justify-end">
                      <Button
                        variant="danger"
                        onClick={() => {
                          setLeaveError(null);
                          setConfirmLeave(true);
                        }}
                      >
                        {t('leavePartnership')}
                      </Button>
                    </div>
                  </>
                ) : hasReceived ? (
                  <>
                    {receivedList}
                    {receivedError}
                  </>
                ) : (
                  <EmptyState
                    icon={<PartnersIcon />}
                    title={t('noPartnership')}
                    description={t('partnershipNote')}
                  />
                )}
              </div>

              {/* -- Invitations waiting on you, when a partnership already
                     exists — demoted, but still answerable. --------------- */}
              {partner && hasReceived ? (
                <section className="mt-8">
                  <SectionRule>{t('pendingInvitations')}</SectionRule>
                  <div className="mt-4">{receivedList}</div>
                  {receivedError}
                </section>
              ) : null}

              {/* -- Invite. ---------------------------------------------- */}
              {!currentPartnership ? (
                <section className="mt-8">
                  <SectionRule>{t('invitePartner')}</SectionRule>

                  <form onSubmit={handleInvite} className="mt-4 space-y-4">
                    <Field
                      label={t('partnerEmail')}
                      type="email"
                      dir="ltr"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={t('emailPlaceholder')}
                      disabled={isLoading}
                    />

                    {success ? (
                      <Alert tone="success">{t('invitationSent')}</Alert>
                    ) : null}

                    {error ? <Alert tone="error">{error}</Alert> : null}

                    <Button
                      type="submit"
                      fullWidth
                      disabled={success}
                      pending={isLoading}
                      pendingLabel={t('sending')}
                    >
                      {t('sendInvitation')}
                    </Button>
                  </form>
                </section>
              ) : null}

              {/* -- Invitations you sent: pending, so caution. ------------ */}
              {hasSent ? (
                <section className="mt-8">
                  <SectionRule>{t('sentInvitations')}</SectionRule>

                  <ul className="mt-4 space-y-3">
                    {sentInvitations.map((invitation) => (
                      <li
                        key={invitation.id}
                        className="rounded-row border border-caution/30 bg-caution-soft p-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <Party user={invitation.user2} />
                          <div className="flex flex-wrap items-center gap-3">
                            <Badge tone="warning" icon={<ClockIcon />}>
                              {t('waitingForResponse')}
                            </Badge>
                            <Button
                              variant="danger"
                              onClick={() => handleCancelInvitation(invitation.id)}
                              disabled={isBusy}
                              pending={
                                busy?.id === invitation.id &&
                                busy?.action === 'cancel'
                              }
                            >
                              {t('cancel')}
                            </Button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>

                  {actionError?.scope === 'sent' ? (
                    <Alert tone="error" className="mt-3">
                      {actionError.message}
                    </Alert>
                  ) : null}
                </section>
              ) : null}

              {/* -- What a partnership actually does. The empty state
                     already carries this copy, so it is not repeated. ----- */}
              {partner || hasReceived || hasSent ? (
                <section className="mt-8">
                  <SectionRule>{t('note')}</SectionRule>
                  <p className="mt-3 text-sm leading-relaxed text-ink-muted">
                    {t('partnershipNote')}
                  </p>
                </section>
              ) : null}
            </Card>
          </>
        ) : null}
      </div>

      <Dialog
        open={confirmLeave}
        onClose={() => {
          if (leavePending) return;
          setConfirmLeave(false);
          setLeaveError(null);
        }}
        title={t('leavePartnership')}
        description={t('leaveConfirm')}
        closeLabel={tCommon('close')}
        size="sm"
        footer={
          <div className="flex flex-wrap gap-3">
            <Button
              variant="secondary"
              className="min-w-0 flex-1 basis-32"
              onClick={() => {
                setConfirmLeave(false);
                setLeaveError(null);
              }}
              disabled={leavePending}
            >
              {tCommon('cancel')}
            </Button>
            <Button
              variant="dangerSolid"
              className="min-w-0 flex-1 basis-32"
              onClick={handleLeave}
              pending={leavePending}
            >
              {t('leavePartnership')}
            </Button>
          </div>
        }
      >
        {partner ? (
          <div className="rounded-row border border-line bg-surface-sunken p-4">
            <Party user={partner} />
          </div>
        ) : null}

        {leaveError ? (
          <Alert tone="error" className="mt-4">
            {leaveError}
          </Alert>
        ) : null}
      </Dialog>
    </div>
  );
}
