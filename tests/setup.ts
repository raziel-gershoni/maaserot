import { config } from 'dotenv';

// Loaded for anything that reads env indirectly. No test connects to a
// database: the reckoning is pure, and the payment path runs against the
// in-memory client in ./fakePrisma. That is what lets the suite run in CI
// with no secrets, and what stopped it writing to a shared database.
config();
