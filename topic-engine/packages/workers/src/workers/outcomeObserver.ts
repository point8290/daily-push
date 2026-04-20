/**
 * outcome:observer worker — Phase 7 (User Behavior L6)
 *
 * Runs 48 hours after a 'skip' progress event.
 *
 * Implements the skip → outcome Bayesian pattern:
 *   skip → user later succeeded at a dependent node  → signal=0 (prereq challenged,  delta ≈ −0.06)
 *   skip → user later got stuck at a dependent node  → signal=1 (prereq confirmed,   delta ≈ +0.09)
 *
 * For each edge (nodeId → dependentNode) with evidence:
 *   1. Apply belief += 0.08 × weight × (signal − belief) per learner level
 *   2. Persist updated belief_by_level to concept_edges
 *   3. If total evidence crosses the reclassification threshold → enqueue graph:recompute
 */
import { Worker } from 'bullmq';
import { query } from '@topic-engine/db';
import { getBullMQConnection } from '../connection';
import { QUEUE_NAMES } from '../queues';
import type { OutcomeObserverJobData } from '../queues/types';
import { enqueueGraphRecompute } from '../scheduler';
import { detectSkipOutcomes } from '../userBehavior/patterns';
import {
  updateBelief,
  shouldReclassify,
  MIN_EVIDENCE,
  totalSamples,
  type BeliefByLevel,
  type LearnerLevel,
} from '../userBehavior/bayesian';

// ─── DB helpers ───────────────────────────────────────────────────────────────

interface EdgeRow {
  id:             string;
  edge_type:      string;
  belief_by_level: BeliefByLevel;
  confirmations:  number;
  contradictions: number;
}

async function loadEdge(edgeId: string): Promise<EdgeRow | null> {
  const rows = await query<EdgeRow>(
    `SELECT id, edge_type, belief_by_level, confirmations, contradictions
     FROM concept_edges WHERE id = $1`,
    [edgeId],
  );
  return rows[0] ?? null;
}

async function persistBeliefUpdate(
  edgeId:         string,
  byLevel:        BeliefByLevel,
  signal:         0 | 1,
): Promise<void> {
  const confirmDelta    = signal === 1 ? 1 : 0;
  const contradictDelta = signal === 0 ? 1 : 0;

  await query(
    `UPDATE concept_edges
     SET belief_by_level = $1::jsonb,
         confirmations   = confirmations + $2,
         contradictions  = contradictions + $3,
         status = CASE
           WHEN $4::int >= 5
             AND (confirmations + contradictions + $4::int) > 0
             AND contradictions::float / (confirmations + contradictions + 1) > 0.4
           THEN 'contested'
           ELSE status
         END
     WHERE id = $5`,
    [
      JSON.stringify(byLevel),
      confirmDelta,
      contradictDelta,
      contradictDelta,
      edgeId,
    ],
  );
}

// ─── Worker factory ───────────────────────────────────────────────────────────

export function createOutcomeObserverWorker() {
  const worker = new Worker<OutcomeObserverJobData>(
    QUEUE_NAMES.OUTCOME_OBSERVER,
    async (job) => {
      const { userId, nodeId, nodeSlug, skippedAt, learnerLevel } = job.data;

      console.log(
        `[outcome:observer] Checking outcomes for user="${userId}" ` +
        `skipped="${nodeSlug}" at ${skippedAt} [level=${learnerLevel ?? 'unknown'}]`,
      );

      // 1. Detect which dependent-node outcomes we can observe
      const outcomes = await detectSkipOutcomes(userId, nodeId, skippedAt);

      if (outcomes.length === 0) {
        console.log(`[outcome:observer] No observable outcomes for "${nodeSlug}" — no edges or no user activity`);
        return { edgesUpdated: 0 };
      }

      const level = (learnerLevel ?? 'intermediate') as LearnerLevel;
      let edgesUpdated = 0;
      let recomputeTriggered = 0;

      for (const outcome of outcomes) {
        const edge = await loadEdge(outcome.edgeId);
        if (!edge) continue;

        // 2. Apply Bayesian update for this learner level
        const currentLevel: import('../userBehavior/bayesian').LevelBelief =
          edge.belief_by_level[level] ?? { belief: 0.5, sampleCount: 0 };

        const updated = updateBelief(currentLevel, outcome.signal, 1.5); // 1.5 weight for direct outcome

        const newByLevel: BeliefByLevel = {
          ...edge.belief_by_level,
          [level]: updated,
        };

        await persistBeliefUpdate(outcome.edgeId, newByLevel, outcome.signal);
        edgesUpdated++;

        const signalLabel = outcome.signal === 0 ? 'challenged' : 'confirmed';
        console.log(
          `[outcome:observer] Edge ${outcome.edgeId} (${outcome.edgeType}): ` +
          `signal=${outcome.signal} (${signalLabel}), ` +
          `belief ${currentLevel.belief.toFixed(3)} → ${updated.belief.toFixed(3)} ` +
          `[${level}, n=${updated.sampleCount}]`,
        );

        // 3. If total evidence >= threshold AND belief implies different type → trigger recompute
        const totalN = totalSamples(newByLevel);
        if (totalN >= MIN_EVIDENCE.edge_type_reclassification && shouldReclassify(newByLevel, edge.edge_type)) {
          await enqueueGraphRecompute({
            edgeId:     outcome.edgeId,
            fromNodeId: outcome.fromNodeId,
            toNodeId:   outcome.toNodeId,
            reason:     'belief_threshold_crossed',
          }).catch((err: Error) => {
            console.warn(`[outcome:observer] Failed to enqueue recompute for edge ${outcome.edgeId}: ${err.message}`);
          });
          recomputeTriggered++;
          console.log(
            `[outcome:observer] Edge ${outcome.edgeId} crossed reclassification threshold ` +
            `(n=${totalN}) — graph:recompute enqueued`,
          );
        }
      }

      return { edgesUpdated, recomputeTriggered };
    },
    {
      connection: getBullMQConnection(),
      concurrency: 10,
    },
  );

  worker.on('failed', (job, err) => {
    console.error(`[outcome:observer] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
