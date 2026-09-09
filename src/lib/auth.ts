import NextAuth, { CredentialsSignin } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { compare } from 'bcryptjs';
import { prisma } from './prisma';
import { logAuthEvent } from './authLogger';
import { validateInitData, findOrCreateTelegramUser } from './telegram';
import type { ErrorCode } from './errorCodes';

/**
 * The one way `authorize` reports a rejected sign-in.
 *
 * next-auth only forwards a reason to the browser when the thrown error is a
 * `CredentialsSignin` — anything else is flattened to `Configuration`, which
 * is how a locked account used to reach the login screen as "wrong password".
 * Auth.js copies `code` verbatim into the redirect URL, so this puts a stable
 * `ErrorCode` there and the login screen translates it.
 *
 * The client sees `error: 'CredentialsSignin'` plus `code: '<ERROR_CODE>'`.
 */
class AuthCodeError extends CredentialsSignin {
  constructor(code: ErrorCode) {
    super(code);
    this.code = code;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  pages: {
    signIn: '/he/login',
  },
  session: {
    strategy: 'jwt',
  },
  providers: [
    Credentials({
      id: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new AuthCodeError('VALIDATION_FAILED');
        }

        const user = await prisma.user.findUnique({
          where: {
            email: credentials.email as string,
          },
          select: {
            id: true,
            email: true,
            name: true,
            passwordHash: true,
            emailVerified: true,
            lockedUntil: true,
            failedLoginAttempts: true,
          },
        });

        if (!user || !user.passwordHash) {
          // Never distinguish an unknown address from a wrong password.
          throw new AuthCodeError('INVALID_CREDENTIALS');
        }

        // Check if account is locked
        if (user.lockedUntil && user.lockedUntil > new Date()) {
          const minutesRemaining = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
          // Log locked account attempt
          await logAuthEvent({
            event: 'login_blocked_locked',
            email: user.email,
            userId: user.id,
            metadata: { minutesRemaining },
          });
          // Was `return null`, which reached the browser as a generic
          // credentials failure. The lock is already disclosed by
          // /api/auth/check-status, so naming it here changes nothing but the
          // message the person gets.
          throw new AuthCodeError('ACCOUNT_LOCKED');
        }

        const isPasswordValid = await compare(
          credentials.password as string,
          user.passwordHash
        );

        if (!isPasswordValid) {
          // Increment failed login attempts
          const newFailedAttempts = user.failedLoginAttempts + 1;
          let lockedUntil: Date | null = null;

          // Lock account based on failed attempts
          if (newFailedAttempts >= 15) {
            lockedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
          } else if (newFailedAttempts >= 10) {
            lockedUntil = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
          } else if (newFailedAttempts >= 5) {
            lockedUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
          }

          await prisma.user.update({
            where: { id: user.id },
            data: {
              failedLoginAttempts: newFailedAttempts,
              lockedUntil,
            },
          });

          // Log failed login attempt
          await logAuthEvent({
            event: 'login_failed',
            email: user.email,
            userId: user.id,
            metadata: {
              failedAttempts: newFailedAttempts,
              willLockAt: lockedUntil ? lockedUntil.toISOString() : null,
            },
          });

          throw new AuthCodeError('INVALID_CREDENTIALS');
        }

        // TODO: Re-enable email verification check once Resend domain is
        // verified. Left disabled deliberately: no verification mail is sent
        // today, so enforcing it would lock every existing account out. When
        // it comes back it throws EMAIL_NOT_VERIFIED, which the login screen
        // already answers with a "resend verification" action. Until then that
        // case reaches the screen through /api/auth/check-status.
        // if (!user.emailVerified) {
        //   await logAuthEvent({
        //     event: 'login_blocked_unverified',
        //     email: user.email,
        //     userId: user.id,
        //   });
        //   throw new AuthCodeError('EMAIL_NOT_VERIFIED');
        // }

        // Reset failed login attempts on successful login
        if (user.failedLoginAttempts > 0) {
          await prisma.user.update({
            where: { id: user.id },
            data: {
              failedLoginAttempts: 0,
              lockedUntil: null,
            },
          });
        }

        // Log successful login
        await logAuthEvent({
          event: 'login_success',
          email: user.email,
          userId: user.id,
        });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
        };
      },
    }),
    Credentials({
      id: 'telegram',
      credentials: {
        initData: { label: 'Telegram initData', type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.initData) {
          throw new AuthCodeError('VALIDATION_FAILED');
        }

        // A missing bot token is a deployment fault, not a rejected sign-in,
        // so it stays a plain error: next-auth reports it as `Configuration`
        // and logs it loudly on the server.
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        if (!botToken) {
          throw new Error('Telegram bot token not configured');
        }

        const telegramUser = validateInitData(credentials.initData as string, botToken);
        if (!telegramUser) {
          throw new AuthCodeError('INVALID_CREDENTIALS');
        }

        const user = await findOrCreateTelegramUser(telegramUser);

        await logAuthEvent({
          event: 'login_success',
          email: user.email,
          userId: user.id,
          metadata: { provider: 'telegram' },
        });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
});
