import type { ConceptGraph, GraphAnalytics } from '../types';
import { computeBetweenness } from './centrality';
import { detectCommunities } from './communities';
import { criticalPath, buildLearningPaths, distancesFromRoot } from './learningPaths';

/**
 * Computes full topology analytics for a validated ConceptGraph.
 * All algorithms are pure functions — no LLM calls.
 *
 * Populates GraphAnalytics:
 *   centrality      — Brandes betweenness, normalized [0, 1]
 *   communities     — label propagation clusters
 *   criticalPath    — longest weighted DAG path (prerequisite order)
 *   fastTrack       — core nodes only, topological order
 *   thoroughTrack   — core + optional_depth nodes, topological order
 *   nodeFeatures    — per-node derived features for downstream consumers
 */
export function computeTopology(graph: ConceptGraph): GraphAnalytics {
  const { nodes, edges } = graph;
  const nodeIds = nodes.map((n) => n.id);

  // ── Betweenness centrality ─────────────────────────────────────────────────
  const centrality = computeBetweenness(nodeIds, edges);

  // ── Community detection ────────────────────────────────────────────────────
  const communities = detectCommunities(nodes, edges);

  // ── Critical path + learning paths ────────────────────────────────────────
  const { path: critPathIds, mins: critPathMins } = criticalPath(nodes, edges);
  const { fastTrack, thoroughTrack } = buildLearningPaths(nodes, edges);

  // ── Per-node distances from root ───────────────────────────────────────────
  const dists = distancesFromRoot(nodes, edges);

  // ── Total minutes (all core + optional_depth) ─────────────────────────────
  const totalMins = nodes
    .filter((n) => n.boundaryType !== 'out_of_scope')
    .reduce((acc, n) => acc + n.estimatedMins, 0);

  // ── Community index (nodeId → communityId) ────────────────────────────────
  const nodeCommunity = new Map<string, string>();
  for (const c of communities) {
    for (const id of c.nodeIds) {
      nodeCommunity.set(id, c.id);
    }
  }

  // ── Outbound edge counts (how many concepts a node unlocks) ───────────────
  const unlocksCount = new Map<string, number>(nodeIds.map((id) => [id, 0]));
  for (const e of edges) {
    if (e.type === 'hard_prerequisite' || e.type === 'soft_prerequisite') {
      unlocksCount.set(e.fromId, (unlocksCount.get(e.fromId) ?? 0) + 1);
    }
  }

  const critPathSet = new Set(critPathIds);

  // ── nodeFeatures ──────────────────────────────────────────────────────────
  const nodeFeatures: GraphAnalytics['nodeFeatures'] = {};
  for (const n of nodes) {
    nodeFeatures[n.id] = {
      centrality: centrality[n.id] ?? 0,
      communityId: nodeCommunity.get(n.id) ?? 'c0',
      unlocksCount: unlocksCount.get(n.id) ?? 0,
      isOnCriticalPath: critPathSet.has(n.id),
      distanceFromRoot: dists.get(n.id) ?? 0,
    };
  }

  return {
    centrality,
    communities,
    criticalPath: critPathIds,
    criticalPathMins: critPathMins,
    totalMins,
    fastTrack,
    thoroughTrack,
    nodeFeatures,
  };
}

export { computeBetweenness } from './centrality';
export { detectCommunities } from './communities';
export { criticalPath, buildLearningPaths, topologicalSort, distancesFromRoot } from './learningPaths';
