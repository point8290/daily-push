import { Queue } from 'bullmq';
import { getBullMQConnection } from '../connection';
import type {
  ResourceDiscoveryJobData,
  OutcomeObserverJobData,
  LibraryUpdateJobData,
  GraphRecomputeJobData,
  BehaviorAnalyzeJobData,
} from './types';

// ─── Queue names ──────────────────────────────────────────────────────────────

export const QUEUE_NAMES = {
  RESOURCE_DISCOVERY: 'resource-discovery',
  OUTCOME_OBSERVER:   'outcome-observer',
  LIBRARY_UPDATE:     'library-update',
  GRAPH_RECOMPUTE:    'graph-recompute',
  BEHAVIOR_ANALYZE:   'behavior-analyze',
} as const;

// ─── Queue singletons ─────────────────────────────────────────────────────────
// Queues are lightweight (no long-lived connections) — safe to create once
// and reuse across the process lifetime.

const connection = getBullMQConnection();

const defaultJobOptions = {
  removeOnComplete: { count: 500 },   // keep last 500 completed jobs for inspection
  removeOnFail:     { count: 1000 },  // keep more failed jobs for debugging
};

export const resourceDiscoveryQueue = new Queue<ResourceDiscoveryJobData>(
  QUEUE_NAMES.RESOURCE_DISCOVERY,
  { connection, defaultJobOptions }
);

export const outcomeObserverQueue = new Queue<OutcomeObserverJobData>(
  QUEUE_NAMES.OUTCOME_OBSERVER,
  { connection, defaultJobOptions }
);

export const libraryUpdateQueue = new Queue<LibraryUpdateJobData>(
  QUEUE_NAMES.LIBRARY_UPDATE,
  { connection, defaultJobOptions }
);

export const graphRecomputeQueue = new Queue<GraphRecomputeJobData>(
  QUEUE_NAMES.GRAPH_RECOMPUTE,
  { connection, defaultJobOptions }
);

export const behaviorAnalyzeQueue = new Queue<BehaviorAnalyzeJobData>(
  QUEUE_NAMES.BEHAVIOR_ANALYZE,
  { connection, defaultJobOptions }
);

/** Close all queue connections — call during graceful shutdown. */
export async function closeQueues(): Promise<void> {
  await Promise.all([
    resourceDiscoveryQueue.close(),
    outcomeObserverQueue.close(),
    libraryUpdateQueue.close(),
    graphRecomputeQueue.close(),
    behaviorAnalyzeQueue.close(),
  ]);
}
