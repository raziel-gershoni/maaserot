import { Suspense } from 'react';
import { getCurrentMonth } from '@/lib/calculations';
import IncomeView, { IncomePageFallback } from './IncomeView';

/**
 * The current month is decided here, on the server, and handed down.
 *
 * It has to be: POST /api/income carries no month and files income by
 * `getCurrentMonth()` on the server clock. When the client derived its own
 * "now", a user whose timezone had already rolled into the next month was
 * shown an entry form for October while the server filed the income into
 * September — and the row then never appeared in the month the form claimed.
 *
 * The enclosing (dashboard)/layout.tsx awaits auth(), which reads cookies and
 * forces every route beneath it to render per request, so this is evaluated on
 * each request rather than frozen at build time.
 */
export default function IncomePage() {
  return (
    <Suspense fallback={<IncomePageFallback />}>
      <IncomeView maxMonth={getCurrentMonth()} />
    </Suspense>
  );
}
