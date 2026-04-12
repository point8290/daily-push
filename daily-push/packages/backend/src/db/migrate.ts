import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import { config } from '../config';

// MySQL error codes that are safe to ignore (idempotent migration re-runs)
const IGNORABLE_CODES = new Set([
  'ER_DUP_FIELDNAME',   // 1060: Column already exists
  'ER_DUP_KEYNAME',     // 1061: Key/index already exists
  'ER_FK_DUP_NAME',     // 1826: Duplicate FK constraint name
  'ER_CANT_DROP_FIELD_OR_KEY', // 1091: Can't drop a non-existent field/key
]);

function splitStatements(sql: string): string[] {
  // Character-level parser: tracks comments AND string literals correctly
  const statements: string[] = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inLineComment = false;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (inLineComment) {
      if (ch === '\n') {
        inLineComment = false;
        current += ch; // keep the newline for readability
      }
      // Don't accumulate comment text into current
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote && ch === '-' && next === '-') {
      inLineComment = true;
      i++; // skip the second '-'
      continue;
    }

    if (ch === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
    } else if (ch === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
    } else if (ch === ';' && !inSingleQuote && !inDoubleQuote) {
      const trimmed = current.trim();
      if (trimmed) statements.push(trimmed);
      current = '';
      continue;
    }

    current += ch;
  }
  const trimmed = current.trim();
  if (trimmed) statements.push(trimmed);
  return statements;
}

async function runMigrations() {
  const conn = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    multipleStatements: false, // Run one statement at a time for better error handling
  });

  console.log('Running migrations...');
  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsDir).sort();

  for (const file of files) {
    if (!file.endsWith('.sql')) continue;
    console.log(`  → ${file}`);
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    const statements = splitStatements(sql);

    for (const stmt of statements) {
      try {
        await conn.query(stmt);
      } catch (err: any) {
        if (IGNORABLE_CODES.has(err.code)) {
          // Benign: column/key already exists from a previous migration run
          continue;
        }
        throw err;
      }
    }
  }

  await conn.end();
  console.log('✓ Migrations complete');
}

runMigrations().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
