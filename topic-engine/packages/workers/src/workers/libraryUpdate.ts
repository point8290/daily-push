import { Worker } from 'bullmq';
import { query } from '@topic-engine/db';
import { writeBackGraph } from '@topic-engine/memory';
import type { RunResult } from '@topic-engine/core';
import { getBullMQConnection } from '../connection';
import { QUEUE_NAMES } from '../queues';
import type { LibraryUpdateJobData } from '../queues/types';

/**
 * library:update worker
 *
 * Fully implemented in Phase 5 — moves write-back off the request path.
 *
 * Loads the RunResult from the topics table and calls writeBackGraph().
 * Threshold-gated: writeBackGraph() only processes nodes with confidence ≥ 0.55.
 *
 * Runs with concurrency=1 to avoid race conditions on concept_library upserts.
 */
export function createLibraryUpdateWorker() {
  const worker = new Worker<LibraryUpdateJobData>(
    QUEUE_NAMES.LIBRARY_UPDATE,
    async (job) => {
      const { topicId, topicTitle } = job.data;

      const rows = await query<{ result_json: RunResult }>(
        'SELECT result_json FROM topics WHERE id = $1',
        [topicId]
      );

      if (rows.length === 0) {
        console.warn(`[library:update] Topic ${topicId} not found — skipping`);
        return { skipped: true };
      }

      const graph = rows[0].result_json.graph;
      await writeBackGraph(graph, topicTitle);

      console.log(
        `[library:update] Wrote back ${graph.nodes.length} nodes for topic "${topicTitle}"`
      );

      return { nodesProcessed: graph.nodes.length };
    },
    {
      connection: getBullMQConnection(),
      concurrency: 1,   // serialise to avoid concurrent upsert conflicts
    }
  );

  worker.on('failed', (job, err) => {
    console.error(`[library:update] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
