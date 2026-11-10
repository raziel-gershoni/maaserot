import { config } from 'dotenv';

// Loaded for anything that reads env indirectly. No test connects to a
// database: the reckoning is pure, and the payment path runs against the
// in-memory client in ./fakePrisma. That is what lets the suite run in CI
// with no secrets, and what stopped it writing to a shared database.
// Quiet, because since dotenv 17 every load announces itself, and this one
// runs once per test file.
config({ quiet: true });

// The local .env holds live secrets; a test that needs one sets its own.
delete process.env.TELEGRAM_BOT_TOKEN;
delete process.env.TELEGRAM_WEBHOOK_SECRET;
delete process.env.ANTHROPIC_API_KEY;
