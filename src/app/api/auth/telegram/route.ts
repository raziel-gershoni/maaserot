import { NextResponse } from 'next/server';
import { signIn } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const { initData } = await request.json();

    if (!initData || typeof initData !== 'string') {
      return NextResponse.json(
        { error: 'Missing initData' },
        { status: 400 }
      );
    }

    if (!process.env.TELEGRAM_BOT_TOKEN) {
      return NextResponse.json(
        { error: 'Telegram not configured' },
        { status: 500 }
      );
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
    return NextResponse.json(
      { error: 'Authentication failed' },
      { status: 401 }
    );
  }
}
