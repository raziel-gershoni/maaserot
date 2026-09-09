import { NextRequest, NextResponse } from 'next/server';
import { encode } from 'next-auth/jwt';
import { validateTelegramIdToken, findOrCreateTelegramUser } from '@/lib/telegram';
import { logAuthEvent } from '@/lib/authLogger';
import type { ErrorCode } from '@/lib/errorCodes';

/**
 * The login screen resolves `?error=` through the shared code contract, so
 * every bail-out here redirects with a stable code instead of the ad-hoc
 * slugs (`config`, `missing_params`, `invalid_state`…) it could not translate.
 */
function loginRedirect(appUrl: string, code: ErrorCode) {
  return NextResponse.redirect(`${appUrl}/he/login?error=${code}`);
}

export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';
  const clientId = process.env.TELEGRAM_OAUTH_CLIENT_ID;
  const clientSecret = process.env.TELEGRAM_OAUTH_CLIENT_SECRET;
  const nextAuthSecret = process.env.NEXTAUTH_SECRET;

  if (!clientId || !clientSecret || !nextAuthSecret) {
    return loginRedirect(appUrl, 'SERVER_ERROR');
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');

  if (!code || !state) {
    return loginRedirect(appUrl, 'VALIDATION_FAILED');
  }

  // Validate state against cookie
  const storedState = request.cookies.get('tg_oauth_state')?.value;
  const codeVerifier = request.cookies.get('tg_oauth_verifier')?.value;

  if (!storedState || !codeVerifier || state !== storedState) {
    return loginRedirect(appUrl, 'VALIDATION_FAILED');
  }

  try {
    const redirectUri = `${appUrl}/api/auth/telegram-callback`;

    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth.telegram.org/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }).toString(),
    });

    if (!tokenResponse.ok) {
      console.error('Telegram token exchange failed:', await tokenResponse.text());
      return loginRedirect(appUrl, 'INVALID_CREDENTIALS');
    }

    const tokens = await tokenResponse.json();
    const idToken = tokens.id_token;

    if (!idToken) {
      return loginRedirect(appUrl, 'INVALID_CREDENTIALS');
    }

    // Validate id_token JWT via JWKS
    const payload = await validateTelegramIdToken(idToken, clientId);

    // Use payload.id (Telegram user ID), NOT payload.sub (opaque)
    const telegramId = Number(payload.id);
    if (!telegramId || isNaN(telegramId)) {
      return loginRedirect(appUrl, 'INVALID_CREDENTIALS');
    }

    // Extract user info from id_token claims
    const firstName = (payload.first_name as string) || '';
    const lastName = (payload.last_name as string) || '';
    const username = (payload.username as string) || undefined;

    const user = await findOrCreateTelegramUser({
      id: telegramId,
      first_name: firstName,
      last_name: lastName,
      username,
    });

    await logAuthEvent({
      event: 'login_success',
      email: user.email,
      userId: user.id,
      metadata: { provider: 'telegram-oauth' },
    });

    // Create NextAuth JWT session token
    const isSecure = process.env.NODE_ENV === 'production';
    const cookieName = isSecure
      ? '__Secure-authjs.session-token'
      : 'authjs.session-token';

    const sessionToken = await encode({
      token: {
        id: user.id,
        email: user.email,
        name: user.name,
        sub: user.id,
      },
      secret: nextAuthSecret,
      salt: cookieName,
    });

    // Redirect to dashboard and set session cookie
    const response = NextResponse.redirect(`${appUrl}/he`);

    // Clear OAuth cookies
    response.cookies.delete('tg_oauth_state');
    response.cookies.delete('tg_oauth_verifier');

    response.cookies.set(cookieName, sessionToken, {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'lax',
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Telegram OAuth callback error:', error);
    return loginRedirect(appUrl, 'SERVER_ERROR');
  }
}
