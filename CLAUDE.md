# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Maaserot is a charity (maaser) tracking web application that helps users calculate their monthly charity obligations based on their income. Built with Next.js 14, TypeScript, Prisma, and PostgreSQL.

## Core Concepts

### Unified Payment Model: Everything is a Group

**Key Principle**: Individual payment = group of 1, Group payment = group of N. Unified model, unified code path.

### Monthly Calculation Logic
- Users track income throughout the month
- Each income has a percentage (typically 10%) that should go to charity
- Fixed charities are monthly commitments deducted on **first payment per user**
- Calculation: `total_maaser = sum(income × %)` for all incomes
- Unpaid amount: `max(0, total_maaser - fixed_charities - total_paid)`

### Payment Flow
1. User logs income → unpaid amount calculated
2. User can make payment (full or partial):
   - **Individual payment**: GroupPaymentSnapshot with 1 member
   - **Group payment**: GroupPaymentSnapshot with N members
3. On first payment, fixed charities are deducted and frozen
4. Subsequent payments in same month do not deduct fixed charities again
5. Incomes are frozen after payment to create audit trail
6. Multiple partial payments supported

### Group Payments
- Users can share access with partners (spouses, family members)
- Dashboard shows combined view when partners are selected
- Group payments create single snapshot for all members
- Each member's first payment deducts their fixed charities
- Group unpaid = total_maaser - fixed_charities - group_paid

### Data Storage
- All monetary amounts stored in **agorot** (cents) for precision
- Month format: `"YYYY-MM"` (e.g., "2024-12")
- GroupPaymentSnapshot maintains payment history with member composition
- Incomes are frozen (isFrozen=true) after payment for audit trail

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

### Testing
```bash
# Run tests once
npm test -- --run

# Run tests in watch mode
npm test

# Run tests with UI
npm test:ui
```

Tests use Vitest and cover:
- Individual payments (group of 1)
- Group payments (multiple members)
- Mixed individual + group payments in same month
- Partial payments

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
- `src/lib/calculations.ts` - Currency formatting and month utilities
- `src/lib/monthState.ts` - Month state calculation with GroupPaymentSnapshot
- `src/lib/prisma.ts` - Prisma client singleton
- `src/lib/auth.ts` - NextAuth configuration

**API Routes**
- `src/app/api/income/route.ts` - Income CRUD operations
- `src/app/api/charities/route.ts` - Fixed charities CRUD
- `src/app/api/payment/unified/route.ts` - Unified payment API (individual & group)
- `src/app/api/auth/register/route.ts` - User registration
- `src/app/api/auth/[...nextauth]/route.ts` - NextAuth handler
- `src/app/api/shared/` - Shared access and group summary APIs

**Database Schema**
- `prisma/schema.prisma` - Prisma schema with:
  - User, Income, FixedCharity (core models)
  - GroupPaymentSnapshot, GroupPaymentMember (payment tracking)
  - SharedAccess (sharing & group features)

**Components**
- `src/components/PaymentModal.tsx` - Individual payment with slider
- `src/components/GroupPaymentModal.tsx` - Group payment with slider

**Tests**
- `tests/payment.test.ts` - Integration tests for payment scenarios
- `tests/utils.ts` - Test helper functions
- `vitest.config.ts` - Vitest configuration

**i18n**
- `src/i18n/routing.ts` - Locale routing config
- `messages/he.json` - Hebrew translations
- `messages/en.json` - English translations

### Making Payments

**Unified Payment API** (`/api/payment/unified`):
1. Receives `month`, `memberIds`, and `paymentAmount`
2. For each member:
   - Calculate current month state
   - Check for prior payments (to determine if fixed charities should be deducted)
   - Collect member states
3. Create GroupPaymentSnapshot with:
   - All member states as JSON
   - GroupPaymentMember records for efficient queries
   - Financial totals (totalGroupMaaser, totalGroupFixedCharities, groupAmountPaid)
4. Freeze all unfrozen incomes for all members
5. Return success with snapshot data

**Individual Payment**: `memberIds: [userId]` (group of 1)
**Group Payment**: `memberIds: [user1, user2, ...]` (group of N)

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
// Calculate current state for a user in a specific month
const state = await calculateCurrentMonthState(userId, month);
// Returns: {
//   totalMaaser: number,
//   fixedCharitiesTotal: number,  // From first payment or current active
//   totalPaid: number,              // Sum of solo payments
//   unpaid: number,                 // max(0, totalMaaser - fixedCharities - totalPaid)
//   snapshots: GroupPaymentSnapshot[],
//   hasPayments: boolean
// }
```

**Group Payment Snapshot Structure**
```typescript
{
  id: string,
  month: string,
  groupOwnerId: string,
  totalGroupMaaser: number,
  totalGroupFixedCharities: number,  // Sum of first-payment users' fixed charities
  groupAmountPaid: number,
  memberStates: [  // JSON array
    {
      userId: string,
      totalMaaser: number,
      fixedCharitiesTotal: number,  // 0 if not first payment
      unpaid: number
    }
  ],
  members: GroupPaymentMember[]  // For efficient queries
}
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
- email, name, passwordHash, defaultPercent, locale

**Income** - Income records (month, amount, percentage, maaser, isFrozen)
- Frozen after payment to create audit trail

**FixedCharity** - User's monthly charity commitments
- name, amount, isActive

**GroupPaymentSnapshot** - Payment tracking (unified model)
- Individual payment = 1 member, Group payment = N members
- Stores member composition, financial totals, and payment amount
- Fixed charities deducted only on user's first payment

**GroupPaymentMember** - Many-to-many helper for efficient queries
- Links users to their payment snapshots

**SharedAccess** - Share and view data with partners
- ownerId (who is sharing), viewerId (who can view)
- isSelected (for group dashboard filtering)

## Known Considerations

### Payment Architecture
- **Everything is a group**: Individual payment = GroupPaymentSnapshot with 1 member
- Unified code path eliminates special cases for individual vs group
- Fixed charities deducted only on user's **first payment in a month** (any group or solo)
- Subsequent payments do not deduct fixed charities again
- Incomes are frozen (isFrozen=true) after payment for audit trail

### Calculations
- All amounts stored as integers (agorot) to avoid floating point errors
- Unpaid calculation: `max(0, totalMaaser - fixedCharities - totalPaid)`
- Group unpaid: Sum of all members' maaser minus fixed charities minus group payments
- Solo payments (group of 1) counted in personal view only
- Group payments tracked separately by exact member composition

### Data Integrity
- GroupPaymentMember helper table enables efficient queries without JSON array scans
- Member composition stored in JSON for audit/history
- Payment snapshots are immutable once created
- Dashboard recalculates from current state + payment history
