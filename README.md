# Maaserot - Charity Tracking App

A web application to track monthly income and calculate charity (maaser) obligations with support for Hebrew and English.

## Features

- **Income Tracking**: Track monthly income with customizable percentage for charity
- **Fixed Charities**: Manage fixed monthly charity commitments
- **Payment Tracking**: Flexible payment system with partial payment support
  - Individual payments (personal maaser tracking)
  - Group payments (combined family/partnership tracking)
  - Payment slider for custom amounts
- **Shared Access**: Share and view combined charity obligations with partners
- **Payment History**: Complete audit trail with frozen income snapshots
- **Multi-language**: Hebrew (RTL) and English support
- **Secure Authentication**: NextAuth.js with credentials provider

## Getting Started

### Prerequisites

- Node.js 18+ installed
- PostgreSQL database (e.g., Neon, Railway, or local)

### Installation

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:

Create a `.env` file in the root directory:

```bash
# Database (get from Neon.tech or your PostgreSQL provider)
DATABASE_URL="postgresql://user:password@host/database?sslmode=require"

# NextAuth
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-secret-here"  # Generate with: openssl rand -base64 32
```

3. Set up the database:

```bash
# Generate Prisma client
npx prisma generate

# Push schema to database
npx prisma db push

# Or create a migration
npx prisma migrate dev --name init
```

4. Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

### First Time Setup

1. Register a new account at `/register`
2. Log in at `/login`
3. You'll be redirected to the dashboard

### Adding Fixed Charities

Navigate to `/charities` to add your monthly charity commitments (e.g., synagogue, kollel).

### Logging Income

1. Go to `/income`
2. Enter income amount, percentage, and optional description
3. The system automatically calculates maaser and updates your monthly status

### Viewing Monthly Status

The dashboard shows:
- Total maaser calculated from all income
- Fixed charities deducted
- Extra amount to give
- Payment status (paid/unpaid)

## Tech Stack

- **Framework**: Next.js 14 with App Router
- **Language**: TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: NextAuth.js
- **Styling**: Tailwind CSS
- **Internationalization**: next-intl (Hebrew + English)

## Development

### Database Commands

```bash
# Generate Prisma client after schema changes
npx prisma generate

# Create a new migration
npx prisma migrate dev --name migration_name

# Open Prisma Studio (database GUI)
npx prisma studio

# Reset database (WARNING: deletes all data)
npx prisma migrate reset
```

### Testing

The project includes integration tests for payment scenarios:

```bash
# Run tests once
npm test -- --run

# Run tests in watch mode
npm test

# Run tests with UI
npm test:ui
```

Tests cover:
- Individual payments (group of 1)
- Group payments (multiple members)
- Mixed individual + group payments in same month
- Partial payments

### Build for Production

```bash
npm run build
npm start
```

## Deployment

### Recommended Stack

- **Hosting**: Vercel
- **Database**: Neon (PostgreSQL)

### Deploy to Vercel

1. Push your code to GitHub
2. Import project on Vercel
3. Add environment variables in Vercel dashboard
4. Deploy

## Documentation

See [CLAUDE.md](./CLAUDE.md) for detailed architecture and development guide.

## License

MIT
