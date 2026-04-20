import { Pool } from 'pg';
import { config } from '../config';

export const pool = new Pool({ connectionString: config.postgres.url });

export async function testPostgresConnection(): Promise<void> {
  const client = await pool.connect();
  await client.query('SELECT 1');
  client.release();
  console.log('✓ PostgreSQL connected');
}
