import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { PaymentError, deletePayment, recordPayment } from '@/lib/payments';
import { apiError } from '../../_lib/apiError';

/**
 * Transport only. Authorization, the reckoning, atomicity and the freeze pair
 * all live in @/lib/payments, so they can be tested without HTTP — and so this
 * route can no longer be handed a memberIds array it does not check.
 */

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return apiError('UNAUTHORIZED', 401);
    }

    const { month, memberIds, paymentAmount } = await request.json();

    const snapshot = await recordPayment(session.user.id, {
      month,
      memberIds,
      paymentAmount,
    });

    return NextResponse.json({ success: true, snapshot });
  } catch (error) {
    if (error instanceof PaymentError) {
      return apiError(error.code, error.status);
    }
    console.error('Payment error:', error);
    return apiError('SERVER_ERROR', 500);
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return apiError('UNAUTHORIZED', 401);
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    await deletePayment(session.user.id, id ?? '');

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof PaymentError) {
      return apiError(error.code, error.status);
    }
    console.error('Delete payment error:', error);
    return apiError('SERVER_ERROR', 500);
  }
}
