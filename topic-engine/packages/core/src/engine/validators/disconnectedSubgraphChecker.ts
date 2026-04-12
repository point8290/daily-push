import type { ConceptGraph, Violation } from '../types';

export interface DisconnectedSubgraphReport {
  disconnectedNodeIds: string[];
  warnings: string[];
  violations: Violation[];
}

/**
 * Disconnected subgraph checker.
 *
 * All concept nodes should eventually lead to the root (the target topic node).
 * If a cluster of concepts has no path to the root, it's pedagogically floating —
 * learners following the main track will never encounter those concepts.
 *
 * This is distinct from orphan detection:
 *   - Orphan: zero edges at all
 *   - Disconnected subgraph: internal edges exist, but no path to the root
 *
 * Algorithm:
 *   1. Find the root node: the node with no outbound hard/soft_prerequisite edges
 *      (the target topic — nothing is "above" it in the learning path).
 *   2. Build a reverse adjacency list (flip all edge directions).
 *   3. BFS from root on the reversed graph — root can "reach back" to all prereqs.
 *   4. Any node not reached = disconnected subgraph.
 *
 * Repair: llm_rewrite — reconnecting requires semantic judgment about which
 * existing node the disconnected cluster should attach to.
 */
export function detectDisconnectedSubgraphs(graph: ConceptGraph): {
  graph: ConceptGraph;
  report: DisconnectedSubgraphReport;
} {
  const report: DisconnectedSubgraphReport = {
    disconnectedNodeIds: [],
    warnings: [],
    violations: [],
  };

  if (graph.nodes.length === 0) return { graph, report };

  const rootId = findRootNode(graph);
  if (!rootId) {
    // No clear root (all nodes have outbound edges) — graph may be a cycle,
    // which the cycle detector handles. Skip disconnected check.
    return { graph, report };
  }

  // Build reverse adjacency: for each edge A → B, add reverse B → A
  const reverseAdj = new Map<string, string[]>(
    graph.nodes.map((n) => [n.id, []])
  );
  for (const e of graph.edges) {
    if (e.type === 'hard_prerequisite' || e.type === 'soft_prerequisite' || e.type === 'leads_to') {
      reverseAdj.get(e.toId)?.push(e.fromId);
    }
  }

  // BFS from root on reversed graph
  const reachable = new Set<string>();
  const queue = [rootId];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (reachable.has(cur)) continue;
    reachable.add(cur);
    for (const neighbor of reverseAdj.get(cur) ?? []) {
      queue.push(neighbor);
    }
  }

  const disconnected = graph.nodes.filter((n) => !reachable.has(n.id));
  if (disconnected.length === 0) return { graph, report };

  const rootTitle = graph.nodes.find((n) => n.id === rootId)?.title ?? rootId;
  const disconnectedTitles = disconnected.map((n) => n.title).join(', ');

  const msg =
    `${disconnected.length} node(s) have no path to root "${rootTitle}": ${disconnectedTitles}.`;

  report.disconnectedNodeIds = disconnected.map((n) => n.id);
  report.warnings.push(msg);
  report.violations.push({
    type: 'disconnected_subgraph',
    severity: 'error',
    affectedNodeIds: disconnected.map((n) => n.id),
    affectedEdgeIds: [],
    description: msg,
    repair: {
      strategy: 'llm_rewrite',
      prompt:
        `These concepts exist in the topic "${graph.topic}" but have no path ` +
        `to the root node "${rootTitle}":\n` +
        disconnected.map((n) => `- "${n.title}" (${n.depthLevel})`).join('\n') +
        `\n\nFor each disconnected concept, determine which existing node it ` +
        `should connect to and in which direction.\n` +
        `Existing connected nodes:\n` +
        [...reachable]
          .map((id) => graph.nodes.find((n) => n.id === id))
          .filter(Boolean)
          .map((n) => `- "${n!.title}" (${n!.depthLevel})`)
          .join('\n') +
        `\nReturn: [{ fromId, toId, type }] — edges to add.`,
      targetNodeIds: disconnected.map((n) => n.id),
    },
  });

  // Graph is not mutated — LLM repair is required to reconnect these nodes.
  // The orchestrator sets requiresLLM = true.
  return { graph, report };
}

/**
 * Root node = the target topic itself.
 * Identified as the node with no outbound hard_prerequisite or soft_prerequisite edges
 * (nothing is "above" it — it's what everything else leads toward).
 * If multiple candidates exist, pick the one with the most inbound edges.
 */
function findRootNode(graph: ConceptGraph): string | null {
  const hasOutboundPrereq = new Set(
    graph.edges
      .filter(
        (e) => e.type === 'hard_prerequisite' || e.type === 'soft_prerequisite'
      )
      .map((e) => e.toId)  // toId = the dependent (not the root)
  );

  // Nodes that nothing points to as a dependent = candidate roots
  // Wait — that's wrong. Root = node that is the final destination.
  // In a prereq graph: fromId → toId means "learn from before to".
  // Root = the target topic = the node with the MOST inbound prereq edges.
  // It has no outbound prereq edges (it's the goal, not a prereq for anything).

  const hasOutboundAsPrereq = new Set(
    graph.edges
      .filter(
        (e) => e.type === 'hard_prerequisite' || e.type === 'soft_prerequisite'
      )
      .map((e) => e.fromId) // fromId = the prereq
  );

  // Candidate roots: nodes that are never a fromId (never a prerequisite for anything)
  const candidates = graph.nodes.filter((n) => !hasOutboundAsPrereq.has(n.id));

  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0].id;

  // Multiple candidates: pick the one with most inbound edges
  const inbound = new Map<string, number>(graph.nodes.map((n) => [n.id, 0]));
  for (const e of graph.edges) {
    if (e.type === 'hard_prerequisite' || e.type === 'soft_prerequisite') {
      inbound.set(e.toId, (inbound.get(e.toId) ?? 0) + 1);
    }
  }

  return candidates.sort((a, b) => (inbound.get(b.id) ?? 0) - (inbound.get(a.id) ?? 0))[0].id;
}
