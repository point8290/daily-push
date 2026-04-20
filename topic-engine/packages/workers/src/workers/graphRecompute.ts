/**
 * graph:recompute worker — Phase 7 (User Behavior L6)
 *
 * Triggered by outcome:observer when an edge's accumulated belief crosses a threshold.
 * Evaluates whether to reclassify or deprecate the edge.
 *
 * Reclassification rules (from spec):
 *   belief ≥ 0.75 → hard_prerequisite
 *   belief ≥ 0.45 → soft_prerequisite
 *   belief ≥ 0.20 → leads_to
 *   belief < 0.20 → deprecated (remove) — requires MIN_EVIDENCE.remove_prerequisite_edge (20)
 *
 * Minimum evidence: 12 events before any reclassification (20 before removal).
 *
 * Also updates library_edges.status to match when the from/to nodes exist
 * in the concept library.
 */
import { Worker } from 'bullmq';
import { query } from '@topic-engine/db';
import { getBullMQConnection } from '../connection';
import { QUEUE_NAMES } from '../queues';
import type { GraphRecomputeJobData } from '../queues/types';
import {
  averageBelief,
  totalSamples,
  classifyEdgeFromBelief,
  shouldRemoveEdge,
  MIN_EVIDENCE,
  type BeliefByLevel,
} from '../userBehavior/bayesian';

// ─── DB helpers ───────────────────────────────────────────────────────────────

interface EdgeRow {
  id:              string;
  edge_type:       string;
  belief_by_level: BeliefByLevel;
  confirmations:   number;
  contradictions:  number;
  status:          string;
  from_node_id:    string;
  to_node_id:      string;
}

async function loadEdge(edgeId: string): Promise<EdgeRow | null> {
  const rows = await query<EdgeRow>(
    `SELECT id, edge_type, belief_by_level, confirmations, contradictions, status,
            from_node_id, to_node_id
     FROM concept_edges WHERE id = $1`,
    [edgeId],
  );
  return rows[0] ?? null;
}

/**
 * Update library_edges.status when both endpoints exist in concept_library.
 * Maps deprecated → 'likely_wrong', reclassified → 'confirmed'.
 */
async function syncLibraryEdge(
  fromNodeId: string,
  toNodeId:   string,
  deprecated: boolean,
): Promise<void> {
  // Find library concept IDs matching these concept_nodes (via canonical_title join)
  const libEdgeRows = await query<{ id: string }>(
    `SELECT le.id
     FROM library_edges le
     JOIN concept_library cl_from ON cl_from.id = le.from_concept_id
     JOIN concept_library cl_to   ON cl_to.id   = le.to_concept_id
     JOIN concept_nodes cn_from   ON cn_from.canonical_title = cl_from.canonical_title
     JOIN concept_nodes cn_to     ON cn_to.canonical_title   = cl_to.canonical_title
     WHERE cn_from.id = $1 AND cn_to.id = $2`,
    [fromNodeId, toNodeId],
  );

  if (libEdgeRows.length === 0) return;

  const newStatus = deprecated ? 'likely_wrong' : 'confirmed';
  await query(
    `UPDATE library_edges SET status = $1 WHERE id = ANY($2::uuid[])`,
    [newStatus, libEdgeRows.map((r) => r.id)],
  );
}

// ─── Worker factory ───────────────────────────────────────────────────────────

export function createGraphRecomputeWorker() {
  const worker = new Worker<GraphRecomputeJobData>(
    QUEUE_NAMES.GRAPH_RECOMPUTE,
    async (job) => {
      const { edgeId, fromNodeId, toNodeId, reason } = job.data;

      console.log(
        `[graph:recompute] Edge ${edgeId} (${fromNodeId}→${toNodeId}) ` +
        `reason=${reason}`,
      );

      const edge = await loadEdge(edgeId);
      if (!edge) {
        console.warn(`[graph:recompute] Edge ${edgeId} not found — skipping`);
        return { skipped: true, reason: 'edge not found' };
      }

      const byLevel = edge.belief_by_level;
      const n       = totalSamples(byLevel);
      const belief  = averageBelief(byLevel);

      // ── Guard: minimum evidence before acting ─────────────────────────────
      if (n < MIN_EVIDENCE.edge_type_reclassification) {
        console.log(
          `[graph:recompute] Edge ${edgeId}: only ${n} samples — ` +
          `need ${MIN_EVIDENCE.edge_type_reclassification} before reclassification`,
        );
        return { acted: false, reason: 'insufficient evidence', samples: n };
      }

      // ── Check for removal ─────────────────────────────────────────────────
      if (shouldRemoveEdge(byLevel)) {
        await query(
          `UPDATE concept_edges SET status = 'deprecated' WHERE id = $1`,
          [edgeId],
        );
        await syncLibraryEdge(fromNodeId, toNodeId, true);

        console.warn(
          `[graph:recompute] Edge ${edgeId} DEPRECATED — ` +
          `belief=${belief.toFixed(3)} < 0.20 with n=${n} samples`,
        );
        return { acted: true, action: 'deprecated', belief, samples: n };
      }

      // ── Reclassify ────────────────────────────────────────────────────────
      const impliedType = classifyEdgeFromBelief(belief);
      if (!impliedType) {
        // Should not reach here given shouldRemoveEdge guard above, but be safe
        return { acted: false, reason: 'implied type is null but remove threshold not met' };
      }

      if (impliedType === edge.edge_type) {
        console.log(
          `[graph:recompute] Edge ${edgeId}: belief=${belief.toFixed(3)} ` +
          `still implies ${edge.edge_type} — no change needed`,
        );
        return { acted: false, reason: 'type unchanged', belief, samples: n };
      }

      // Different type implied → reclassify
      const wasHard = edge.edge_type === 'hard_prerequisite';
      const becomesHard = impliedType === 'hard_prerequisite';

      await query(
        `UPDATE concept_edges
         SET edge_type = $1,
             status = CASE WHEN $2::boolean THEN 'active' ELSE status END
         WHERE id = $3`,
        [impliedType, impliedType !== 'leads_to', edgeId],
      );

      await syncLibraryEdge(fromNodeId, toNodeId, false);

      console.log(
        `[graph:recompute] Edge ${edgeId} RECLASSIFIED: ` +
        `${edge.edge_type} → ${impliedType} ` +
        `(belief=${belief.toFixed(3)}, n=${n})`,
      );

      // Warn on significant structural changes
      if (wasHard && !becomesHard) {
        console.warn(
          `[graph:recompute] STRUCTURAL CHANGE: hard_prerequisite ${edgeId} ` +
          `demoted to ${impliedType} — learning paths may be affected`,
        );
      }

      return {
        acted:    true,
        action:   'reclassified',
        from:     edge.edge_type,
        to:       impliedType,
        belief,
        samples:  n,
      };
    },
    {
      connection: getBullMQConnection(),
      concurrency: 3,
    },
  );

  worker.on('failed', (job, err) => {
    console.error(`[graph:recompute] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
