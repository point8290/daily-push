import { Pool, type PoolConfig } from 'pg';

// ─── Connection pool (singleton) ──────────────────────────────────────────────

let _pool: Pool | null = null;

/**
 * Returns the shared PostgreSQL connection pool.
 * Reads DATABASE_URL from the environment (set in .env).
 *
 * The pool is created lazily on first access and reused across calls.
 * Call pool().end() in process shutdown handlers.
 */
export function pool(): Pool {
  if (!_pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        'DATABASE_URL environment variable is not set. ' +
        'Copy .env.example to .env and fill in the value.'
      );
    }

    const config: PoolConfig = {
      connectionString,
      max: 10,               // max pool size
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    };

    _pool = new Pool(config);

    // Log unexpected pool errors rather than crashing the process
    _pool.on('error', (err) => {
      console.error('[db] Unexpected pool error:', err.message);
    });
  }

  return _pool;
}

/**
 * Gracefully closes the connection pool.
 * Call this in process.on('SIGTERM') / process.on('SIGINT') handlers.
 */
export async function closePool(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}

/**
 * Convenience wrapper: run a single parameterised query and return rows.
 *
 * @example
 * const rows = await query<{ id: string }>('SELECT id FROM topics WHERE title = $1', [title]);
 */
export async function query<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  const result = await pool().query(sql, params);
  return result.rows as T[];
}

/**
 * Convenience wrapper: run a query inside a serialisable transaction.
 * Rolls back automatically if the callback throws.
 * Returns whatever the callback returns.
 *
 * @example
 * await transaction(async (q) => {
 *   await q('INSERT INTO topics ...', [...]);
 *   await q('INSERT INTO concept_nodes ...', [...]);
 * });
 *
 * @example Returning a value:
 * const id = await transaction(async (q) => {
 *   const rows = await q('INSERT INTO ... RETURNING id', [...]);
 *   return (rows[0] as { id: string }).id;
 * });
 */
export async function transaction<T = void>(
  fn: (query: (sql: string, params?: unknown[]) => Promise<unknown[]>) => Promise<T>
): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn((sql, params) => client.query(sql, params).then((r) => r.rows));
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
