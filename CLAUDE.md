# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Maaserot is a charity (maaser) tracking web application that helps users calculate their monthly charity obligations based on their income. Built with Next.js 14, TypeScript, Prisma, and PostgreSQL.

## Core Concepts

### Monthly Calculation Logic
- Users track income throughout the month
- Each income has a percentage (typically 10%) that should go to charity
- Fixed charities are monthly commitments that are always paid
- Calculation: `total_maaser = sum(income × %)` for all incomes
- Extra to give: `max(0, total_maaser - fixed_charities)`
- Status: "unpaid" if extra_to_give > 0, otherwise no marker needed

### Payment Flow
1. User logs income → month state recalculated
2. If extra_to_give > 0 → status becomes "unpaid"
3. User marks month as "paid"
4. More income same month (after paid) → adds to extra without fixed charity deduction
5. Month boundaries: each month starts fresh, but unpaid status can carry over

### Data Storage
- All monetary amounts stored in **agorot** (cents) for precision
- Month format: `"YYYY-MM"` (e.g., "2024-12")
- MonthState maintains snapshot of calculations and fixed charities for history

## Development Commands

### Setup
```bash
# Install dependencies
npm install

# Set up database (create .env with DATABASE_URL first)
npx prisma generate
npx prisma db push  # or npx prisma migrate dev

# Run development server
npm run dev
```

### Database
```bash
# Generate Prisma client after schema changes
npx prisma generate

# Create new migration
npx prisma migrate dev --name migration_name

# Reset database (WARNING: deletes all data)
npx prisma migrate reset

# Open Prisma Studio (database GUI)
npx prisma studio
```

### Build & Deploy
```bash
# Build for production
npm run build

# Start production server
npm start

# Type checking
npx tsc --noEmit

# Linting
npm run lint
```

## Architecture

### Tech Stack
- **Framework**: Next.js 14 (App Router)
- **Database**: PostgreSQL (Neon)
- **ORM**: Prisma
- **Auth**: NextAuth.js v5 (credentials provider)
- **i18n**: next-intl (Hebrew RTL + English)
- **Styling**: Tailwind CSS

### Key Files

**Core Logic**
- `src/lib/calculations.ts` - Monthly maaser calculation engine
- `src/lib/prisma.ts` - Prisma client singleton
- `src/lib/auth.ts` - NextAuth configuration

**API Routes**
- `src/app/api/income/route.ts` - Income CRUD + month state recalculation
- `src/app/api/charities/route.ts` - Fixed charities CRUD
- `src/app/api/month/route.ts` - Month state GET/UPDATE (mark as paid)
- `src/app/api/auth/register/route.ts` - User registration
- `src/app/api/auth/[...nextauth]/route.ts` - NextAuth handler

**Database Schema**
- `prisma/schema.prisma` - Prisma schema with User, Income, FixedCharity, MonthState, SharedAccess models

**i18n**
- `src/i18n/routing.ts` - Locale routing config
- `messages/he.json` - Hebrew translations
- `messages/en.json` - English translations

### Adding Income
When POST to `/api/income`:
1. Income record created with amount, percentage, calculated maaser
2. All incomes for current month fetched
3. Active fixed charities fetched
4. Month state calculated using `calculateMonthState()`
5. MonthState upserted with new values

### Important Patterns

**Currency Handling**
```typescript
// Always store in agorot (cents)
const agorot = shekelAmount * 100;

// Display with formatCurrency()
formatCurrency(agorot, locale); // Returns formatted string
```

**Month State Calculation**
```typescript
calculateMonthState(
  incomes,              // Array of {amount, percentage}
  fixedCharities,       // Array of {name, amount}
  isPaidAlready         // boolean - affects fixed charity deduction
);
```

**Authentication**
All protected routes must check session:
```typescript
const session = await getServerSession(authOptions);
if (!session?.user?.id) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```

## Environment Variables

Required in `.env`:
```bash
DATABASE_URL="postgresql://user:password@host/database?sslmode=require"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="generate-with-openssl-rand-base64-32"
```

## Internationalization

- Default locale: Hebrew (`he`)
- Supported locales: Hebrew, English
- RTL automatically applied for Hebrew
- Route structure: `/[locale]/...` (e.g., `/he/dashboard`, `/en/dashboard`)

## Database Models

**User** - Authentication + settings
**Income** - Income records (month, amount, percentage, maaser)
**FixedCharity** - User's monthly charity commitments
**MonthState** - Monthly calculation snapshot (totalMaaser, fixedCharitiesTotal, extraToGive, isPaid)
**SharedAccess** - Share month data with other users (future feature)

## Known Considerations

- Amounts must be integers (agorot) to avoid floating point errors
- Month state only created when income exists
- Fixed charities are always paid regardless of maaser amount
- If maaser < fixed charities, extraToGive = 0 (nothing extra to give)
- After marking month as "paid", new income doesn't deduct fixed charities again
