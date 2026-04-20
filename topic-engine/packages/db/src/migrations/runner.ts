import fs from 'fs';
import path from 'path';
import { pool } from '../client';

// ─── Migration runner ─────────────────────────────────────────────────────────

const MIGRATIONS_DIR = path.resolve(__dirname, '../../migrations');

interface MigrationFile {
  version: string;   // e.g. "001_create_extensions"
  filePath: string;
}

function readMigrationFiles(): MigrationFile[] {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort(); // lexicographic sort: 001_ before 002_ etc.

  return files.map((f) => ({
    version: f.replace(/\.sql$/, ''),
    filePath: path.join(MIGRATIONS_DIR, f),
  }));
}

async function appliedVersions(): Promise<Set<string>> {
  try {
    const result = await pool().query<{ version: string }>(
      'SELECT version FROM schema_migrations ORDER BY version'
    );
    return new Set(result.rows.map((r) => r.version));
  } catch {
    // schema_migrations doesn't exist yet — that's OK, 001 will create it
    return new Set();
  }
}

/**
 * Runs all pending migrations in order.
 * Each migration is applied in its own transaction.
 * The migration version is recorded in schema_migrations after success.
 *
 * Idempotent: already-applied migrations are skipped.
 */
export async function runMigrations(): Promise<void> {
  const files = readMigrationFiles();
  const applied = await appliedVersions();

  const pending = files.filter((f) => !applied.has(f.version));

  if (pending.length === 0) {
    console.log('[migrate] All migrations already applied.');
    return;
  }

  for (const migration of pending) {
    console.log(`[migrate] Applying ${migration.version}...`);
    const sql = fs.readFileSync(migration.filePath, 'utf8');

    const client = await pool().connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (version) VALUES ($1)',
        [migration.version]
      );
      await client.query('COMMIT');
      console.log(`[migrate] ✓ ${migration.version}`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`[migrate] ✗ ${migration.version} failed:`, (err as Error).message);
      throw err;
    } finally {
      client.release();
    }
  }

  console.log(`[migrate] Done. Applied ${pending.length} migration(s).`);
}

/**
 * Lists all migrations and their status (applied / pending).
 */
export async function migrationStatus(): Promise<void> {
  const files = readMigrationFiles();
  const applied = await appliedVersions();

  console.log('\nMigration status:');
  for (const f of files) {
    const status = applied.has(f.version) ? '✓ applied' : '  pending';
    console.log(`  ${status}  ${f.version}`);
  }
  console.log();
}
