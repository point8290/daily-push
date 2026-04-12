import type { LLMProvider } from '../../llm/types';
import type { ConceptGraph, DisagreementRecord } from '../types';
import { runVerificationPass } from './verificationPass';
import type { NodePassScores, EdgePassScores } from './verificationPass';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NodeConsensusScores {
  /** Averaged across both verification passes */
  existence: number;
  depthLevel: number;
  boundary: number;
}

export interface EdgeConsensusScores {
  existence: number;
  type: number;
  direction: number;
}

export interface MultiRunResult {
  nodeScores: Record<string, NodeConsensusScores>;
  edgeScores: Record<string, EdgeConsensusScores>;
  disagreements: DisagreementRecord[];
}

// ─── Disagreement detection ────────────────────────────────────────────────────

/** Two passes disagree when |scoreA - scoreB| > 0.5 (one 'yes', one 'no') */
const DISAGREEMENT_THRESHOLD = 0.5;

function detectNodeDisagreements(
  nodeTitle: string,
  passA: NodePassScores,
  passB: NodePassScores
): DisagreementRecord[] {
  const records: DisagreementRecord[] = [];

  if (Math.abs(passA.existence - passB.existence) >= DISAGREEMENT_THRESHOLD) {
    records.push({
      conceptTitle: nodeTitle,
      disagreementType: 'existence',
      runAPosition: passA.existence >= 0.75 ? 'belongs in graph' : passA.existence <= 0.25 ? 'does not belong' : 'uncertain',
      runBPosition: passB.existence >= 0.75 ? 'belongs in graph' : passB.existence <= 0.25 ? 'does not belong' : 'uncertain',
    });
  }

  if (Math.abs(passA.depthLevel - passB.depthLevel) >= DISAGREEMENT_THRESHOLD) {
    records.push({
      conceptTitle: nodeTitle,
      disagreementType: 'depth_level',
      runAPosition: passA.depthLevel >= 0.75 ? 'depth correct' : 'depth incorrect',
      runBPosition: passB.depthLevel >= 0.75 ? 'depth correct' : 'depth incorrect',
    });
  }

  if (Math.abs(passA.boundary - passB.boundary) >= DISAGREEMENT_THRESHOLD) {
    records.push({
      conceptTitle: nodeTitle,
      disagreementType: 'boundary',
      runAPosition: passA.boundary >= 0.75 ? 'boundary correct' : 'boundary incorrect',
      runBPosition: passB.boundary >= 0.75 ? 'boundary correct' : 'boundary incorrect',
    });
  }

  return records;
}

function detectEdgeDisagreements(
  fromTitle: string,
  toTitle: string,
  passA: EdgePassScores,
  passB: EdgePassScores
): DisagreementRecord[] {
  const records: DisagreementRecord[] = [];
  const label = `${fromTitle} → ${toTitle}`;

  if (Math.abs(passA.type - passB.type) >= DISAGREEMENT_THRESHOLD) {
    records.push({
      conceptTitle: label,
      disagreementType: 'edge_type',
      runAPosition: passA.type >= 0.75 ? 'type correct' : 'type incorrect',
      runBPosition: passB.type >= 0.75 ? 'type correct' : 'type incorrect',
    });
  }

  if (Math.abs(passA.direction - passB.direction) >= DISAGREEMENT_THRESHOLD) {
    records.push({
      conceptTitle: label,
      disagreementType: 'edge_direction',
      runAPosition: passA.direction >= 0.75 ? 'direction correct' : 'direction may be reversed',
      runBPosition: passB.direction >= 0.75 ? 'direction correct' : 'direction may be reversed',
    });
  }

  return records;
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Efficient multi-run consensus using 2 cheap verification passes.
 *
 * Strategy (from spec):
 *   - 1 full decomp already done in pipeline (temperature=0.4)
 *   - Pass A: temperature=0  (deterministic verification)
 *   - Pass B: temperature=0.3 (slight variation to detect brittleness)
 *   - Cost: ~1.2× vs 3× for 3 full decompositions
 *
 * Averages the two pass scores per dimension.
 * Disagreements (|A-B| ≥ 0.5) are recorded for the API consumer.
 */
export async function computeMultiRunConsensus(
  graph: ConceptGraph,
  provider: LLMProvider
): Promise<MultiRunResult> {
  // Run both passes in parallel — they are independent
  const [passA, passB] = await Promise.all([
    runVerificationPass(graph, provider, 0),
    runVerificationPass(graph, provider, 0.3),
  ]);

  const nodeIndex = new Map(graph.nodes.map((n) => [n.id, n.title]));
  const edgeIndex = new Map(
    graph.edges.map((e) => [
      e.id,
      { from: nodeIndex.get(e.fromId) ?? e.fromId, to: nodeIndex.get(e.toId) ?? e.toId },
    ])
  );

  // Aggregate node scores
  const nodeScores: Record<string, NodeConsensusScores> = {};
  const disagreements: DisagreementRecord[] = [];

  for (const node of graph.nodes) {
    const a = passA.nodeScores[node.id] ?? { existence: 0.5, depthLevel: 0.5, boundary: 0.5 };
    const b = passB.nodeScores[node.id] ?? { existence: 0.5, depthLevel: 0.5, boundary: 0.5 };

    nodeScores[node.id] = {
      existence:  (a.existence  + b.existence)  / 2,
      depthLevel: (a.depthLevel + b.depthLevel) / 2,
      boundary:   (a.boundary   + b.boundary)   / 2,
    };

    disagreements.push(...detectNodeDisagreements(node.title, a, b));
  }

  // Aggregate edge scores
  const edgeScores: Record<string, EdgeConsensusScores> = {};

  for (const edge of graph.edges) {
    const a = passA.edgeScores[edge.id] ?? { existence: 0.5, type: 0.5, direction: 0.5 };
    const b = passB.edgeScores[edge.id] ?? { existence: 0.5, type: 0.5, direction: 0.5 };
    const info = edgeIndex.get(edge.id)!;

    edgeScores[edge.id] = {
      existence: (a.existence + b.existence) / 2,
      type:      (a.type      + b.type)      / 2,
      direction: (a.direction + b.direction) / 2,
    };

    disagreements.push(...detectEdgeDisagreements(info.from, info.to, a, b));
  }

  return { nodeScores, edgeScores, disagreements };
}
