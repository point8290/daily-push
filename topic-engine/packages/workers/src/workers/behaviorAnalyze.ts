/**
 * behavior:analyze worker — Phase 7 (User Behavior L6)
 *
 * Handles immediate (no delay) pattern analysis for non-skip events:
 *
 *   'stuck'    — Pattern 3: stuck despite completing all prerequisites → flag missing prereq
 *   'complete' — Pattern 4: completed in < 40% estimated time → update estimatedMins
 *   'revisit'  — Pattern 5: revisit after completion → candidate leads_to edge (N≥12)
 *
 * Unlike outcome:observer (which fires 48h later for skip events), these patterns
 * can be evaluated immediately because the relevant evidence is already in the DB.
 */
import { Worker } from 'bullmq';
import { query } from '@topic-engine/db';
import { getBullMQConnection } from '../connection';
import { QUEUE_NAMES } from '../queues';
import type { BehaviorAnalyzeJobData } from '../queues/types';
import {
  detectStuckPattern,
  detectTimeOverestimate,
  detectRevisitPattern,
} from '../userBehavior/patterns';

// ─── Pattern handlers ─────────────────────────────────────────────────────────

async function handleStuck(
  userId:  string,
  nodeId:  string,
  nodeSlug: string,
): Promise<{ action: string; stuckCount?: number }> {
  const analysis = await detectStuckPattern(userId, nodeId);

  if (!analysis.allPrereqsCompleted) {
    return { action: 'skipped', stuckCount: analysis.recentStuckCount };
  }

  if (!analysis.shouldFlagMissingPrereq) {
    console.log(
      `[behavior:analyze] stuck "${nodeSlug}": all prereqs done ` +
      `but only ${analysis.recentStuckCount}/5 events — accumulating`,
    );
    return { action: 'accumulating', stuckCount: analysis.recentStuckCount };
  }

  // Minimum evidence met — flag this node for missing prerequisite investigation
  console.warn(
    `[behavior:analyze] MISSING PREREQ FLAG: "${nodeSlug}" — ` +
    `${analysis.recentStuckCount} users stuck despite completing all known prerequisites. ` +
    `Completed node IDs: [${analysis.completedNodeIds.join(', ')}]`,
  );

  // Mark the node as needing investigation (future: LLM investigation pipeline)
  // For now: bump the node's confidence_overall downward to signal uncertainty
  await query(
    `UPDATE concept_nodes
     SET confidence_overall = LEAST(1.0, GREATEST(0.0,
           COALESCE(confidence_overall, 0.5) - 0.05
         ))
     WHERE id = $1`,
    [nodeId],
  );

  return { action: 'flagged_missing_prereq', stuckCount: analysis.recentStuckCount };
}

async function handleComplete(
  nodeId:   string,
  nodeSlug: string,
  context:  Record<string, unknown>,
): Promise<{ action: string; oldMins?: number; newMins?: number }> {
  const analysis = await detectTimeOverestimate(nodeId, context);

  if (!analysis.isUnderestimate) {
    return { action: 'skipped' };
  }

  if (!analysis.shouldUpdateTime || analysis.suggestedMins === null) {
    console.log(
      `[behavior:analyze] fast-complete "${nodeSlug}": ` +
      `${analysis.fastCompletionCount}/8 fast completions — accumulating`,
    );
    return { action: 'accumulating' };
  }

  // Update estimatedMins to median of actual fast completion times
  await query(
    `UPDATE concept_nodes SET estimated_mins = $1 WHERE id = $2`,
    [analysis.suggestedMins, nodeId],
  );

  console.log(
    `[behavior:analyze] TIME UPDATE "${nodeSlug}": ` +
    `${analysis.estimatedMins}min → ${analysis.suggestedMins}min ` +
    `(based on ${analysis.fastCompletionCount} fast completions)`,
  );

  return {
    action:  'time_updated',
    oldMins: analysis.estimatedMins,
    newMins: analysis.suggestedMins,
  };
}

async function handleRevisit(
  nodeId:   string,
  nodeSlug: string,
): Promise<{ action: string; revisitCount?: number }> {
  const analysis = await detectRevisitPattern(nodeId);

  if (!analysis.shouldFlagCandidateEdge) {
    console.log(
      `[behavior:analyze] revisit "${nodeSlug}": ` +
      `${analysis.revisitCount}/12 users — accumulating`,
    );
    return { action: 'accumulating', revisitCount: analysis.revisitCount };
  }

  // Enough revisit evidence to suggest a missing leads_to edge.
  // We log the flag here; a future version would identify the destination node
  // by looking at what users start learning immediately after the revisit.
  console.info(
    `[behavior:analyze] CANDIDATE LEADS_TO: "${nodeSlug}" — ` +
    `${analysis.revisitCount} users revisited after completion. ` +
    `This node likely leads_to something not yet in the graph.`,
  );

  return { action: 'candidate_leads_to_flagged', revisitCount: analysis.revisitCount };
}

// ─── Worker factory ───────────────────────────────────────────────────────────

export function createBehaviorAnalyzeWorker() {
  const worker = new Worker<BehaviorAnalyzeJobData>(
    QUEUE_NAMES.BEHAVIOR_ANALYZE,
    async (job) => {
      const { userId, nodeId, nodeSlug, eventType, context } = job.data;

      console.log(`[behavior:analyze] "${nodeSlug}" event=${eventType} user=${userId}`);

      switch (eventType) {
        case 'stuck':
          return handleStuck(userId, nodeId, nodeSlug);

        case 'complete':
          return handleComplete(nodeId, nodeSlug, context);

        case 'revisit':
          return handleRevisit(nodeId, nodeSlug);

        default:
          return { action: 'skipped', reason: `unhandled event type: ${eventType}` };
      }
    },
    {
      connection: getBullMQConnection(),
      concurrency: 10,
    },
  );

  worker.on('failed', (job, err) => {
    console.error(`[behavior:analyze] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
