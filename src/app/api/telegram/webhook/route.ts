import { NextResponse } from 'next/server';

const APP_URL = process.env.NEXTAUTH_URL || 'https://maaserot.vercel.app';

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Handle /start command — send welcome message with "Open App" button
    if (body.message?.text === '/start') {
      const chatId = body.message.chat.id;
      const botToken = process.env.TELEGRAM_BOT_TOKEN;

      if (!botToken) {
        return NextResponse.json({ ok: true });
      }

      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: 'ברוכים הבאים למעשרות! 🎯\nלחצו על הכפתור למטה לפתיחת האפליקציה.',
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: 'פתח את מעשרות',
                  web_app: { url: APP_URL },
                },
              ],
            ],
          },
        }),
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Telegram webhook error:', error);
    return NextResponse.json({ ok: true });
  }
}
