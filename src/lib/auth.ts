import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { compare } from 'bcryptjs';
import { prisma } from './prisma';
import { logAuthEvent } from './authLogger';
import { validateInitData } from './telegram';

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
          throw new Error('Email and password are required');
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
          throw new Error('Invalid email or password');
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
          return null;
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

          throw new Error('Invalid email or password');
        }

        // TODO: Re-enable email verification check once Resend domain is verified
        // if (!user.emailVerified) {
        //   await logAuthEvent({
        //     event: 'login_blocked_unverified',
        //     email: user.email,
        //     userId: user.id,
        //   });
        //   return null;
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
          throw new Error('Missing Telegram initData');
        }

        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        if (!botToken) {
          throw new Error('Telegram bot token not configured');
        }

        const telegramUser = validateInitData(credentials.initData as string, botToken);
        if (!telegramUser) {
          throw new Error('Invalid Telegram authentication');
        }

        // Find or create user by telegramId
        let user = await prisma.user.findUnique({
          where: { telegramId: BigInt(telegramUser.id) },
          select: { id: true, email: true, name: true },
        });

        if (!user) {
          // Create a new user for this Telegram account
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
