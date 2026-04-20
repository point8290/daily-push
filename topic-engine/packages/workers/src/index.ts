/**
 * Worker process entry point.
 *
 * Starts all 4 BullMQ workers. Run as a separate process from the API server.
 *
 * Usage:
 *   npm run start --workspace=@topic-engine/workers
 *
 * Env vars:
 *   REDIS_URL        Redis connection string (default: redis://localhost:6379)
 *   DATABASE_URL     PostgreSQL connection string (needed by library:update worker)
 *   OPENAI_API_KEY   Needed by library:update worker for embeddings
 */
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import { createResourceDiscoveryWorker } from './workers/resourceDiscovery';
import { createOutcomeObserverWorker }   from './workers/outcomeObserver';
import { createLibraryUpdateWorker }     from './workers/libraryUpdate';
import { createGraphRecomputeWorker }    from './workers/graphRecompute';
import { createBehaviorAnalyzeWorker }   from './workers/behaviorAnalyze';
import { closeQueues }                   from './queues';
import { closePool, closeRedis }         from '@topic-engine/db';

async function main() {
  const workers = [
    createResourceDiscoveryWorker(),
    createOutcomeObserverWorker(),
    createLibraryUpdateWorker(),
    createGraphRecomputeWorker(),
    createBehaviorAnalyzeWorker(),
  ];

  console.log('[workers] All 5 workers started and listening for jobs.');
  console.log('  resource:discovery  — concurrency=5');
  console.log('  outcome:observer    — concurrency=10 (48h delayed jobs)');
  console.log('  library:update      — concurrency=1  (serialised upserts)');
  console.log('  graph:recompute     — concurrency=3');
  console.log('  behavior:analyze    — concurrency=10 (immediate pattern analysis)');

  const shutdown = async () => {
    console.log('[workers] Shutting down...');
    await Promise.all(workers.map((w) => w.close()));
    await closeQueues();
    await closePool();
    await closeRedis();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT',  shutdown);
}

main().catch((err) => {
  console.error('[workers] Fatal startup error:', err);
  process.exit(1);
});

// Re-export scheduler + types for use by API layer
export * from './scheduler';
export * from './queues/types';
