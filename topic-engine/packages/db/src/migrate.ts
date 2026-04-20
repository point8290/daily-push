/**
 * CLI script for database migrations.
 *
 * Usage:
 *   npm run migrate              # apply all pending migrations
 *   npm run migrate -- status   # show migration status
 *
 * Requires DATABASE_URL in environment (.env at repo root).
 */
import path from 'path';
import dotenv from 'dotenv';

// Load .env from repo root
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import { runMigrations, migrationStatus } from './migrations/runner';
import { closePool } from './client';

async function main(): Promise<void> {
  const command = process.argv[2] ?? 'migrate';

  try {
    if (command === 'status') {
      await migrationStatus();
    } else {
      await runMigrations();
    }
  } finally {
    await closePool();
  }
}

main().catch((err) => {
  console.error('[migrate] Fatal error:', err.message);
  process.exit(1);
});
