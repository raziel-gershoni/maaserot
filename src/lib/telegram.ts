import crypto from 'crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { prisma } from './prisma';
import { logAuthEvent } from './authLogger';

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

/**
 * Validate a Telegram OIDC id_token JWT via JWKS.
 * Returns the payload with Telegram user info.
 */
export async function validateTelegramIdToken(idToken: string, clientId: string) {
  const jwks = createRemoteJWKSet(
    new URL('https://oauth.telegram.org/.well-known/jwks.json')
  );
  const { payload } = await jwtVerify(idToken, jwks, {
    issuer: 'https://oauth.telegram.org',
    audience: clientId,
  });
  return payload;
}

/**
 * Find or create a user by Telegram ID.
 * Shared by Mini App provider and OIDC callback.
 */
export async function findOrCreateTelegramUser(telegramUser: TelegramUser): Promise<{
  id: string;
  email: string;
  name: string | null;
}> {
  let user = await prisma.user.findUnique({
    where: { telegramId: BigInt(telegramUser.id) },
    select: { id: true, email: true, name: true },
  });

  if (!user) {
    const displayName = [telegramUser.first_name, telegramUser.last_name]
      .filter(Boolean)
      .join(' ');
    const placeholderEmail = `tg_${telegramUser.id}@telegram.user`;

    user = await prisma.user.create({
      data: {
        email: placeholderEmail,
        name: displayName || `Telegram User ${telegramUser.id}`,
        telegramId: BigInt(telegramUser.id),
        telegramUsername: telegramUser.username || null,
        locale: telegramUser.language_code === 'he' ? 'he' : 'he',
      },
      select: { id: true, email: true, name: true },
    });

    await logAuthEvent({
      event: 'register',
      email: placeholderEmail,
      userId: user.id,
      metadata: { provider: 'telegram', telegramId: telegramUser.id.toString() },
    });
  } else {
    // Update username if changed
    if (telegramUser.username) {
      await prisma.user.update({
        where: { telegramId: BigInt(telegramUser.id) },
        data: { telegramUsername: telegramUser.username },
      });
    }
  }

  return user;
}

/**
 * Validate Telegram Mini App initData using HMAC-SHA256.
 * See: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function validateInitData(initData: string, botToken: string): TelegramUser | null {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;

  // Build the data-check-string: sorted key=value pairs (excluding hash), joined by \n
  const entries: string[] = [];
  params.forEach((value, key) => {
    if (key !== 'hash') {
      entries.push(`${key}=${value}`);
    }
  });
  entries.sort();
  const dataCheckString = entries.join('\n');

  // secret_key = HMAC-SHA256("WebAppData", bot_token)
  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();

  // computed_hash = HMAC-SHA256(secret_key, data_check_string)
  const computedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  if (computedHash !== hash) {
    return null;
  }

  // Check auth_date is not too old (allow 5 minutes)
  const authDate = params.get('auth_date');
  if (authDate) {
    const authTimestamp = parseInt(authDate, 10);
    const now = Math.floor(Date.now() / 1000);
    if (now - authTimestamp > 300) {
      return null;
    }
  }

  // Parse user data
  const userParam = params.get('user');
  if (!userParam) return null;

  try {
    return JSON.parse(userParam) as TelegramUser;
  } catch {
    return null;
  }
}
