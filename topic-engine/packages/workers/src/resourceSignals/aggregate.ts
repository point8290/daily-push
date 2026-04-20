/**
 * Signal aggregation — rolls up resource scores into per-type signals and
 * applies the confidence update to concept_nodes.
 *
 * Spec thresholds (from PLAN.md Phase 6):
 *   edge_confirmation        0.0  — always apply (confidence boost)
 *   depth_correction         0.70 — 70%+ resources agree
 *   missing_edge             0.65
 *   boundary_reconsideration 0.60
 *   missing_prerequisite     0.75 — high bar, structural change
 *   node_definition_suspect  0.0  — always flag, never auto-fix
 */
import { query } from '@topic-engine/db';
import type { ResourceScore } from './scorer';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SignalType =
  | 'edge_confirmation'
  | 'depth_correction'
  | 'missing_edge'
  | 'boundary_reconsideration'
  | 'missing_prerequisite'
  | 'node_definition_suspect';

const UPDATE_THRESHOLDS: Record<SignalType, number> = {
  edge_confirmation:        0.0,
  depth_correction:         0.70,
  missing_edge:             0.65,
  boundary_reconsideration: 0.60,
  missing_prerequisite:     0.75,
  node_definition_suspect:  0.0,
};

export interface ResourceSignal {
  type:          SignalType;
  value:         number;   // 0–1 signal strength
  applyToNodeId: string;
  notes:         string;
}

// ─── Signal generation ────────────────────────────────────────────────────────

/**
 * Inspect aggregated scores and emit per-type signals.
 * Does NOT write to the database — call applySignals() for that.
 */
export function aggregateSignals(
  nodeId:            string,
  scores:            ResourceScore[],
  currentDepthLevel: string,
): ResourceSignal[] {
  if (scores.length === 0) return [];

  const avg = (fn: (r: ResourceScore) => number) =>
    scores.reduce((s, r) => s + fn(r), 0) / scores.length;

  const avgCoverage  = avg((r) => r.coverage_score);
  const avgDepthMatch = avg((r) => r.depth_match);
  const avgQuality   = avg((r) => r.quality_score);

  const signals: ResourceSignal[] = [];

  // ── edge_confirmation: resources confirm the concept exists and is learnable ──
  signals.push({
    type:          'edge_confirmation',
    value:         avgCoverage * 0.6 + avgQuality * 0.4,
    applyToNodeId: nodeId,
    notes:         `avg coverage=${avgCoverage.toFixed(2)}, quality=${avgQuality.toFixed(2)}`,
  });

  // ── node_definition_suspect: poor coverage → concept unclear or mislabelled ──
  if (avgCoverage < 0.3) {
    signals.push({
      type:          'node_definition_suspect',
      value:         1 - avgCoverage,
      applyToNodeId: nodeId,
      notes:         `low avg coverage (${avgCoverage.toFixed(2)}) — concept title may be too narrow or unclear`,
    });
  }

  // ── depth_correction: resources consistently at wrong depth ──
  // Fires when depth_match is below the "70% agreement" threshold, inverted.
  if (avgDepthMatch < 1 - UPDATE_THRESHOLDS.depth_correction) {
    signals.push({
      type:          'depth_correction',
      value:         1 - avgDepthMatch,
      applyToNodeId: nodeId,
      notes:         `poor depth match (${avgDepthMatch.toFixed(2)}) for declared depth=${currentDepthLevel}`,
    });
  }

  // ── boundary_reconsideration: consistently low quality + coverage ──
  if (avgCoverage < 0.4 && avgQuality < 0.4) {
    signals.push({
      type:          'boundary_reconsideration',
      value:         1 - (avgCoverage + avgQuality) / 2,
      applyToNodeId: nodeId,
      notes:         'low quality + low coverage across all resources — may be out_of_scope or wrongly framed',
    });
  }

  return signals;
}

// ─── DB application ───────────────────────────────────────────────────────────

/**
 * Writes the resource confidence update to concept_nodes.
 *
 * The resource signal contributes 0.10 weight to overall confidence:
 *   overall = multiRun×0.40 + library×0.30 + critique×0.20 + resource×0.10
 *
 * At decomp time, resource defaulted to 0.50. We now replace that default
 * with the actual measured signal and apply the delta.
 */
export async function applySignals(
  nodeId: string,
  scores: ResourceScore[],
  signals: ResourceSignal[],
): Promise<void> {
  if (scores.length === 0) return;

  const avg = (fn: (r: ResourceScore) => number) =>
    scores.reduce((s, r) => s + fn(r), 0) / scores.length;

  // Weighted aggregate of the three scoring dimensions
  const resourceSignal =
    avg((r) => r.coverage_score) * 0.50 +
    avg((r) => r.depth_match)    * 0.30 +
    avg((r) => r.quality_score)  * 0.20;

  // Adjust overall confidence by the delta from the default 0.50 resource signal
  // Clamp result to [0, 1]
  await query(
    `UPDATE concept_nodes
     SET confidence_overall = LEAST(1.0, GREATEST(0.0,
           COALESCE(confidence_overall, 0.5) + ($1::float - 0.50) * 0.10
         ))
     WHERE id = $2`,
    [resourceSignal, nodeId],
  );

  // Log flagged signals — these are investigative, never auto-applied
  const flagged = signals.filter(
    (s) => s.type === 'node_definition_suspect' || s.type === 'boundary_reconsideration',
  );
  if (flagged.length > 0) {
    console.warn(
      `[resource:signals] Node ${nodeId} flagged:`,
      flagged.map((s) => `${s.type}(${s.value.toFixed(2)}): ${s.notes}`).join(' | '),
    );
  }

  const depthSignal = signals.find((s) => s.type === 'depth_correction');
  if (depthSignal) {
    console.info(
      `[resource:signals] Node ${nodeId} depth correction signal: ${depthSignal.notes}`,
    );
  }
}
