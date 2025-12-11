import { config } from 'dotenv';

// Load environment variables from .env
config();

// Ensure we're using the development database
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL not set in environment');
}

console.log('Running tests against development database');
