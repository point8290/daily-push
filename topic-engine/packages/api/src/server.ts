/**
 * API server entry point.
 *
 * Usage:
 *   npm run dev --workspace=@topic-engine/api
 *
 * Env vars:
 *   PORT           Server port (default: 3000)
 *   DATABASE_URL   PostgreSQL connection string
 *   REDIS_URL      Redis connection string
 *   ANTHROPIC_API_KEY
 *   OPENAI_API_KEY (required for embeddings in L2 memory)
 */
import path from 'path';
import dotenv from 'dotenv';

// Load .env from repo root before importing anything that reads env vars
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import { buildApp } from './app';
import { closePool, closeRedis } from '@topic-engine/db';

async function main() {
  const app = await buildApp();
  const port = parseInt(process.env.PORT ?? '3000', 10);

  await app.listen({ port, host: '0.0.0.0' });

  // Graceful shutdown
  const shutdown = async () => {
    await app.close();
    await closePool();
    await closeRedis();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT',  shutdown);
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
