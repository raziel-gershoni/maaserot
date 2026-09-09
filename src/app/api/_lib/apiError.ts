import { NextResponse } from 'next/server';
import type { ErrorCode } from '@/lib/errorCodes';

/**
 * Every route answers a failure with a stable machine code, never prose.
 *
 * The client turns the code into a translated sentence through
 * `translateApiError`, so a Hebrew reader never gets an English error — and
 * two routes stop shipping raw i18n keys as their error text.
 *
 * `extra` carries the machine-readable detail a few screens still need
 * alongside the code (a Zod `details` tree, a rate-limit `resetAt`). It must
 * never carry a user-facing sentence.
 *
 * `_lib` is a Next.js private folder: nothing under it is routed.
 */
export function apiError(
  code: ErrorCode,
  status: number,
  extra?: Record<string, unknown>
) {
  return NextResponse.json({ error: code, ...extra }, { status });
}
