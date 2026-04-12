import type { ConceptGraph, ConceptNode, NodeConfidence, EdgeConfidence } from '../types';
import { PLAUSIBLE_TIME_RANGES } from '../types';
import type { NodeConsensusScores, EdgeConsensusScores } from './multiRunConsensus';

// ─── Weights (from spec) ──────────────────────────────────────────────────────
const WEIGHTS = {
  multiRun:  0.40,
  library:   0.30, // defaults to 0.50 until L2 (semantic memory) is built
  critique:  0.20,
  resource:  0.10, // defaults to 0.50 until L5 (resource signals) is built
} as const;

/** Library signal placeholder until L2 is built */
const LIBRARY_DEFAULT = 0.50;
/** Resource signal placeholder until L5 is built */
const RESOURCE_DEFAULT = 0.50;

// ─── Time estimate confidence ──────────────────────────────────────────────────

/**
 * Computes a confidence score for a node's time estimate using the plausible
 * time ranges defined in PLAUSIBLE_TIME_RANGES.
 *
 *   Within median ± 20%            → 0.85
 *   Within plausible [min, max]    → 0.65
 *   Outside plausible range        → 0.35
 */
function timeEstimateConfidence(node: ConceptNode): number {
  const range = PLAUSIBLE_TIME_RANGES[node.depthLevel];
  const mins = node.estimatedMins;

  const medianLow  = range.median * 0.80;
  const medianHigh = range.median * 1.20;

  if (mins >= medianLow && mins <= medianHigh) return 0.85;
  if (mins >= range.min  && mins <= range.max)  return 0.65;
  return 0.35;
}

// ─── Per-dimension overall ─────────────────────────────────────────────────────

/**
 * Combines the 4 signals for one scalar using the spec weights.
 * library and resource default to their placeholders until those layers exist.
 */
function overallSignal(multiRun: number, critique: number): number {
  return (
    multiRun          * WEIGHTS.multiRun  +
    LIBRARY_DEFAULT   * WEIGHTS.library   +
    critique          * WEIGHTS.critique  +
    RESOURCE_DEFAULT  * WEIGHTS.resource
  );
}

// ─── Main exports ─────────────────────────────────────────────────────────────

/**
 * Builds the initial NodeConfidence for every node in the graph.
 * `effective` is set to `overall` here — propagation.ts updates it after.
 */
export function buildNodeConfidences(
  graph: ConceptGraph,
  nodeConsensus: Record<string, NodeConsensusScores>,
  critiqueSignal: number
): Record<string, NodeConfidence> {
  const result: Record<string, NodeConfidence> = {};

  for (const node of graph.nodes) {
    const c = nodeConsensus[node.id] ?? { existence: 0.5, depthLevel: 0.5, boundary: 0.5 };

    const existence   = overallSignal(c.existence,  critiqueSignal);
    const depthLevel  = overallSignal(c.depthLevel, critiqueSignal);
    const boundary    = overallSignal(c.boundary,   critiqueSignal);
    const timeEstimate = timeEstimateConfidence(node);

    // overall = average of all 4 dimensions
    const overall = (existence + depthLevel + boundary + timeEstimate) / 4;

    result[node.id] = {
      existence,
      depthLevel,
      boundary,
      timeEstimate,
      overall,
      effective: overall, // will be updated by propagation
    };
  }

  return result;
}

/**
 * Builds the EdgeConfidence for every edge in the graph.
 */
export function buildEdgeConfidences(
  graph: ConceptGraph,
  edgeConsensus: Record<string, EdgeConsensusScores>,
  critiqueSignal: number
): Record<string, EdgeConfidence> {
  const result: Record<string, EdgeConfidence> = {};

  for (const edge of graph.edges) {
    const c = edgeConsensus[edge.id] ?? { existence: 0.5, type: 0.5, direction: 0.5 };

    const existence = overallSignal(c.existence, critiqueSignal);
    const type      = overallSignal(c.type,      critiqueSignal);
    const direction = overallSignal(c.direction, critiqueSignal);

    const overall = (existence + type + direction) / 3;

    result[edge.id] = { existence, type, direction, overall };
  }

  return result;
}
