import {
  resourceDiscoveryQueue,
  outcomeObserverQueue,
  libraryUpdateQueue,
  graphRecomputeQueue,
  behaviorAnalyzeQueue,
} from './queues';
import type {
  ResourceDiscoveryJobData,
  OutcomeObserverJobData,
  LibraryUpdateJobData,
  GraphRecomputeJobData,
  BehaviorAnalyzeJobData,
} from './queues/types';

// ─── Retry policies ───────────────────────────────────────────────────────────

const RETRY_POLICY = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5_000 },
};

const OUTCOME_DELAY_MS = 48 * 3600 * 1000; // 48 hours

// ─── Enqueue functions (called by API layer) ──────────────────────────────────

/**
 * Enqueue one resource:discovery job per non-out_of_scope node.
 * Call after a successful decompose — dispatches all jobs in one bulk add.
 */
export async function enqueueResourceDiscovery(
  jobs: ResourceDiscoveryJobData[]
): Promise<void> {
  if (jobs.length === 0) return;

  await resourceDiscoveryQueue.addBulk(
    jobs.map((data) => ({
      name:    'discover',
      data,
      opts:    RETRY_POLICY,
    }))
  );
}

/**
 * Enqueue an outcome:observer job with a 48-hour delay.
 * Call when a user records a 'skip' event via POST /topics/:id/progress.
 */
export async function enqueueOutcomeObserver(
  data: OutcomeObserverJobData
): Promise<void> {
  await outcomeObserverQueue.add('observe', data, {
    ...RETRY_POLICY,
    delay: OUTCOME_DELAY_MS,
  });
}

/**
 * Enqueue a library:update job.
 * Call after a successful decompose — replaces the inline writeBackGraph call.
 */
export async function enqueueLibraryUpdate(
  data: LibraryUpdateJobData
): Promise<void> {
  await libraryUpdateQueue.add('update', data, {
    ...RETRY_POLICY,
    backoff: { type: 'exponential', delay: 10_000 },
  });
}

/**
 * Enqueue a graph:recompute job.
 * Called by the outcome:observer worker (Phase 7) when edge beliefs cross a threshold.
 */
export async function enqueueGraphRecompute(
  data: GraphRecomputeJobData
): Promise<void> {
  // Deduplicate by edgeId — only one recompute per edge at a time
  await graphRecomputeQueue.add('recompute', data, {
    ...RETRY_POLICY,
    jobId: `recompute:${data.edgeId}`, // BullMQ deduplicates by jobId
  });
}

/**
 * Enqueue an immediate (no delay) behavior pattern analysis job.
 * Called by the progress route for 'complete', 'stuck', and 'revisit' events.
 */
export async function enqueueBehaviorAnalyze(
  data: BehaviorAnalyzeJobData
): Promise<void> {
  await behaviorAnalyzeQueue.add('analyze', data, RETRY_POLICY);
}
