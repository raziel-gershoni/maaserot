import { NextResponse } from 'next/server';
import crypto from 'crypto';

function base64url(buffer: Buffer): string {
  return buffer.toString('base64url');
}

export async function GET() {
  const clientId = process.env.TELEGRAM_OAUTH_CLIENT_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  if (!clientId || !appUrl) {
    return NextResponse.json(
      { error: 'Telegram OAuth not configured' },
      { status: 500 }
    );
  }

  // Generate state (32 bytes hex)
  const state = crypto.randomBytes(32).toString('hex');

  // Generate PKCE code_verifier (43 random chars, base64url)
  const codeVerifier = base64url(crypto.randomBytes(32));

  // Generate code_challenge = base64url(SHA256(code_verifier))
  const codeChallenge = base64url(
    crypto.createHash('sha256').update(codeVerifier).digest()
  );

  const redirectUri = `${appUrl}/api/auth/telegram-callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid profile',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  const authUrl = `https://oauth.telegram.org/auth?${params.toString()}`;

  const response = NextResponse.redirect(authUrl);

  // Store state and code_verifier in httpOnly cookies (5 min TTL)
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 300, // 5 minutes
  };

  response.cookies.set('tg_oauth_state', state, cookieOptions);
  response.cookies.set('tg_oauth_verifier', codeVerifier, cookieOptions);

  return response;
}
