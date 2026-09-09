import { NextResponse } from 'next/server';
import { signIn } from '@/lib/auth';
import { apiError } from '../../_lib/apiError';

export async function POST(request: Request) {
  try {
    const { initData } = await request.json();

    if (!initData || typeof initData !== 'string') {
      return apiError('VALIDATION_FAILED', 400);
    }

    if (!process.env.TELEGRAM_BOT_TOKEN) {
      return apiError('SERVER_ERROR', 500);
    }

    // Use NextAuth's signIn with the telegram provider
    // This validates initData, finds/creates user, and returns a session
    await signIn('telegram', {
      initData,
      redirect: false,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Telegram auth error:', error);
    return apiError('INVALID_CREDENTIALS', 401);
  }
}
