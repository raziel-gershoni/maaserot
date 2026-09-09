/**
 * API error contract.
 *
 * Routes return a stable machine code; the client translates it. Previously
 * every route returned an English prose sentence that was rendered verbatim to
 * Hebrew users — and two of them returned raw i18n keys.
 *
 * Add a code here, add it to `errors` in BOTH `messages/he.json` and
 * `messages/en.json`.
 */
export const ERROR_CODES = [
  'UNAUTHORIZED',
  'VALIDATION_FAILED',
  'INVALID_CREDENTIALS',
  'EMAIL_NOT_VERIFIED',
  'ACCOUNT_LOCKED',
  'EMAIL_TAKEN',
  'USER_NOT_FOUND',
  'WEAK_PASSWORD',
  'INVALID_PASSWORD',
  'TOKEN_INVALID',
  'TOKEN_EXPIRED',
  'RATE_LIMITED',
  'INCOME_NOT_FOUND',
  'CANNOT_EDIT_FROZEN_INCOME',
  'CANNOT_DELETE_FROZEN_INCOME',
  'CHARITY_NOT_FOUND',
  'CANNOT_INVITE_SELF',
  'ALREADY_HAS_PARTNERSHIP',
  'PARTNERSHIP_NOT_FOUND',
  'NOTHING_TO_PAY',
  'SERVER_ERROR',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

const CODE_SET: ReadonlySet<string> = new Set(ERROR_CODES);

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && CODE_SET.has(value);
}

/**
 * Turn whatever a route returned into a translated, user-facing sentence.
 * Anything unrecognised — a network failure, an unexpected shape, a legacy
 * prose error — falls back to the generic message rather than leaking English.
 */
export function translateApiError(
  t: (key: string) => string,
  value: unknown
): string {
  return isErrorCode(value) ? t(value) : t('SERVER_ERROR');
}
