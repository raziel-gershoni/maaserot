# Maaserot

> A bilingual, mobile-first PWA that helps observant Jewish users track monthly income and calculate the maaser (10% charity tithe) they owe.

![Next.js](https://img.shields.io/badge/Next.js%2016-000?style=flat-square&logo=next.js&logoColor=white)
![React](https://img.shields.io/badge/React%2019-20232a?style=flat-square&logo=react&logoColor=61dafb)
![TypeScript](https://img.shields.io/badge/TypeScript-3178c6?style=flat-square&logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169e1?style=flat-square&logo=postgresql&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma%207-2d3748?style=flat-square&logo=prisma&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind%20v4-38bdf8?style=flat-square&logo=tailwindcss&logoColor=white)
![NextAuth.js](https://img.shields.io/badge/NextAuth.js%20v5-000?style=flat-square&logo=auth0&logoColor=white)
![Vitest](https://img.shields.io/badge/Vitest-6e9f18?style=flat-square&logo=vitest&logoColor=white)
[![demo · live](https://img.shields.io/badge/demo-live-2ea44f?style=flat-square)](https://maaserot.vercel.app)

**🔗 Live demo:** https://maaserot.vercel.app

Maaserot lets a user log each month's income, apply a configurable charity percentage (default 10%), and automatically see how much maaser remains after fixed monthly charity commitments are deducted. It supports full and partial payments, keeps an immutable audit trail of what was paid, and lets partners (spouses or family) view and settle a combined obligation together. It runs as an installable PWA and ships with a dedicated Telegram Mini App entry point.

<!-- Screenshot placeholder: leave exactly this HTML comment so the owner can drop an image in later:
     ![screenshot](docs/screenshot.png) -->

## ✨ Features

- **Income tracking** — log monthly income with a per-entry charity percentage and optional description; maaser is computed on entry.
- **Fixed charities** — register recurring monthly commitments (e.g., synagogue, kollel) that are deducted from what you owe.
- **Full and partial payments** — pay all at once or chip away with a slider for custom amounts; the outstanding balance recalculates as you go.
- **Partnerships** — invite a spouse or family member, then view and pay a single combined obligation as a group.
- **Immutable payment history** — every payment is captured as a frozen snapshot, giving a complete, tamper-resistant audit trail.
- **Bilingual, RTL-first** — Hebrew (default, right-to-left) and English, with locale-aware routing.
- **Installable PWA** — standalone display, maskable icons, and a Telegram Mini App launcher.

## 🏗️ How it works

**Everything is a group.** The payment domain is modeled around a single idea: an individual payment is just a group of one. A solo payment and an N-person partnership payment both flow through the same `GroupPaymentSnapshot` + `GroupPaymentMember` code path, eliminating the parallel "individual vs. group" branches that usually accrete in this kind of app. Each snapshot stores the full member composition as JSON for audit history, while a `GroupPaymentMember` join table backs efficient membership queries without scanning JSON.

**Money is integer-only.** Every monetary value — income, maaser, fixed charities, amounts paid — is stored in agorot (cents) as integers, so calculations never touch floating-point and never drift. Currency is formatted for display only at the edges, per locale.

**Payments are an immutable audit trail.** When a payment is made, the contributing incomes are frozen (`isFrozen`) so they can no longer be edited or deleted, and a snapshot records the totals and the per-member state at that moment. Fixed charities are deducted only on a user's *first* payment in a given month; subsequent payments that month don't double-deduct. A month's current state is always recomputed from live data plus this payment history rather than mutated in place.

**Two correct Telegram auth paths.** The app integrates Telegram twice, each validated properly. The Mini App flow verifies `initData` with HMAC-SHA256 using the `WebAppData`-derived secret key and rejects stale requests via a 5-minute `auth_date` freshness window. The web OAuth flow verifies Telegram's OIDC `id_token` against Telegram's remote JWKS (issuer and audience checked) using `jose`. Both funnel into one shared `findOrCreateTelegramUser` routine. The Mini App entry point lives outside the `/[locale]` routes so middleware can't strip the URL hash carrying `tgWebAppData`.

**Security hardening on credentials auth.** Failed logins drive an escalating account lockout — 5 attempts locks for 15 minutes, 10 for an hour, 15 for 24 hours — and a successful login resets the counter. Auth events (`login_success`, `login_failed`, `login_blocked_locked`, `register`, …) are written to a structured `AuthLog` table with IP and user-agent context, and sensitive endpoints sit behind in-memory rate limiting. An email-verification token flow (`VerificationToken` + Resend) is implemented but currently disabled behind a TODO pending Resend domain verification, so accounts are usable immediately.

## 🛠️ Tech stack

- **Frontend:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, next-intl (he/en, RTL), PWA
- **Backend/API:** Next.js Route Handlers, NextAuth.js v5 (Credentials + Telegram Mini App + Telegram OAuth/OIDC), jose, bcryptjs
- **Data:** PostgreSQL (Neon) via Prisma 7 with the `@prisma/adapter-pg` driver
- **Integrations:** Telegram Bot API (Mini App + OAuth/OIDC), Resend (transactional email)
- **Testing:** Vitest
- **Infra:** Vercel

## 🚀 Getting started

### Prerequisites

- Node.js 20+
- A PostgreSQL database (Neon, or any local/hosted Postgres)

### Environment variables

Create a `.env` file in the project root. Never commit real secret values.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `NEXTAUTH_URL` | Yes | Base URL of the app (e.g. `http://localhost:3000`) |
| `NEXTAUTH_SECRET` | Yes | NextAuth session secret (`openssl rand -base64 32`) |
| `NEXT_PUBLIC_APP_URL` | Optional | Public base URL used for client-side links and email |
| `TELEGRAM_BOT_TOKEN` | Optional | Bot token for Telegram Mini App `initData` validation |
| `TELEGRAM_OAUTH_CLIENT_ID` | Optional | Client ID for the Telegram OAuth/OIDC web flow |
| `TELEGRAM_OAUTH_CLIENT_SECRET` | Optional | Client secret for the Telegram OAuth/OIDC web flow |
| `RESEND_API_KEY` | Optional | Resend API key for transactional email |
| `FROM_EMAIL` | Optional | Sender address for transactional email |

### Install & run

```bash
# Install dependencies (also runs `prisma generate`)
npm install

# Apply the schema to your database
npx prisma migrate dev

# Start the dev server at http://localhost:3000
npm run dev

# Production build (generates client, applies migrations, builds)
npm run build
npm start
```

## 🧪 Testing

Integration tests run on **Vitest** and cover the payment engine end to end — individual payments (group of one), group payments (multiple members), mixed individual + group payments in the same month, and partial payments.

```bash
# Watch mode
npm test

# Single run
npm test -- --run

# Vitest UI
npm run test:ui
```

## 📦 Deployment

Deployed on **Vercel** with a **Neon** PostgreSQL database. The `build` script runs `prisma generate && prisma migrate deploy && next build`, so migrations are applied automatically as part of each production build.

## 📄 License

Shared publicly as a portfolio project.
