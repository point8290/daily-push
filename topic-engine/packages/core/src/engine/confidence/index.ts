import type { LLMProvider } from '../../llm/types';
import type { ConceptGraph, ConceptNode, ConceptEdge, ConfidenceResult } from '../types';
import type { CritiqueRound } from '../steps/critiqueAndPatch';
import { computeMultiRunConsensus } from './multiRunConsensus';
import { extractCritiqueSignal } from './critiqueSignal';
import { buildNodeConfidences, buildEdgeConfidences } from './signalCombiner';
import { propagateConfidence } from './propagation';

// ─── Thresholds (from spec) ───────────────────────────────────────────────────
const DISCARD_THRESHOLD = 0.20;

// ─── Return type ──────────────────────────────────────────────────────────────

export interface ComputeConfidenceOutput {
  /** Graph with confidence attached to every node and edge */
  graph: ConceptGraph;
  /** Summary metadata surfaced to the API consumer */
  meta: ConfidenceResult;
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * L4 Confidence Scoring.
 *
 * Computes multi-dimensional confidence for every node and edge in the graph,
 * attaches it directly to the node/edge objects, and discards nodes that fall
 * below the discard threshold (< 0.20 overall).
 *
 * Steps:
 *   1. Run 2 cheap verification passes in parallel (multi-run consensus)
 *   2. Extract graph-level critique signal from prior CritiqueRound[]
 *   3. Combine signals into per-dimension NodeConfidence / EdgeConfidence
 *   4. Propagate effective confidence through the prerequisite chain
 *   5. Discard nodes below threshold, clean up dangling edges
 *   6. Attach confidence to graph nodes and edges
 *
 * @param graph    - Validated, repaired graph from the structural validation step
 * @param topic    - Topic string (passed to verification prompt for context)
 * @param provider - LLM provider (decomposition role — same model, cheap calls)
 * @param critiqueRounds - Summary rounds from the critique-refine step
 */
export async function computeConfidence(
  graph: ConceptGraph,
  topic: string,
  provider: LLMProvider,
  critiqueRounds: CritiqueRound[]
): Promise<ComputeConfidenceOutput> {
  void topic; // used implicitly via graph.topic

  // Step 1: Multi-run consensus
  const { nodeScores, edgeScores, disagreements } = await computeMultiRunConsensus(
    graph,
    provider
  );

  // Step 2: Critique signal (scalar for the whole graph)
  const critiqueSignal = extractCritiqueSignal(critiqueRounds);

  // Step 3: Build per-node and per-edge confidences
  const nodeConf = buildNodeConfidences(graph, nodeScores, critiqueSignal);
  const edgeConf = buildEdgeConfidences(graph, edgeScores, critiqueSignal);

  // Step 4: Propagate effective confidence through hard_prerequisite chain
  const propagatedNodeConf = propagateConfidence(graph, nodeConf);

  // Step 5: Identify and discard nodes below threshold
  const discardedNodeIds = Object.entries(propagatedNodeConf)
    .filter(([, conf]) => conf.overall < DISCARD_THRESHOLD)
    .map(([nodeId]) => nodeId);

  const discardSet = new Set(discardedNodeIds);

  // Step 6: Attach confidence to nodes and edges, filtering out discarded ones
  const enrichedNodes: ConceptNode[] = graph.nodes
    .filter((n) => !discardSet.has(n.id))
    .map((n) => ({ ...n, confidence: propagatedNodeConf[n.id] }));

  const survivingNodeIds = new Set(enrichedNodes.map((n) => n.id));

  const enrichedEdges: ConceptEdge[] = graph.edges
    .filter((e) => survivingNodeIds.has(e.fromId) && survivingNodeIds.has(e.toId))
    .map((e) => ({ ...e, confidence: edgeConf[e.id] }));

  return {
    graph: { ...graph, nodes: enrichedNodes, edges: enrichedEdges },
    meta: { disagreements, discardedNodeIds },
  };
}

// ─── Re-exports ────────────────────────────────────────────────────────────────
export { extractCritiqueSignal } from './critiqueSignal';
export { propagateConfidence } from './propagation';
export { buildNodeConfidences, buildEdgeConfidences } from './signalCombiner';
export { computeMultiRunConsensus } from './multiRunConsensus';
export { runVerificationPass } from './verificationPass';
