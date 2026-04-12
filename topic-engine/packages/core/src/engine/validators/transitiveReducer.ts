import type { ConceptGraph, ConceptEdge, Violation } from '../types';

export interface TransitiveReductionReport {
  removedCount: number;
  warnings: string[];
  violations: Violation[];
}

/**
 * Transitive reduction for hard_prerequisite edges only.
 *
 * An edge A → C is redundant if there is already a path A → B → C through
 * other hard_prerequisite edges. Removing it simplifies the graph without
 * losing reachability.
 *
 * Complexity: O(E × (V + E)) — acceptable for graphs up to ~100 nodes.
 */
export function transitiveReduce(graph: ConceptGraph): {
  graph: ConceptGraph;
  report: TransitiveReductionReport;
} {
  const report: TransitiveReductionReport = {
    removedCount: 0,
    warnings: [],
    violations: [],
  };

  const hardEdges = graph.edges.filter((e) => e.type === 'hard_prerequisite');
  const redundantIds = new Set<string>();

  for (const edge of hardEdges) {
    if (redundantIds.has(edge.id)) continue;

    const edgesWithout = hardEdges.filter(
      (e) => e.id !== edge.id && !redundantIds.has(e.id)
    );
    if (isReachable(edge.fromId, edge.toId, edgesWithout)) {
      redundantIds.add(edge.id);
      report.removedCount++;

      const fromTitle = graph.nodes.find((n) => n.id === edge.fromId)?.title ?? edge.fromId;
      const toTitle = graph.nodes.find((n) => n.id === edge.toId)?.title ?? edge.toId;
      const msg =
        `Transitive reduction: removed redundant hard_prerequisite ` +
        `"${fromTitle}" → "${toTitle}" (already reachable via intermediate nodes).`;

      report.warnings.push(msg);
      report.violations.push({
        type: 'redundant_edge',
        severity: 'info',
        affectedNodeIds: [edge.fromId, edge.toId],
        affectedEdgeIds: [edge.id],
        description: msg,
        repair: { strategy: 'remove_edge', edgeId: edge.id },
      });
    }
  }

  return {
    graph: { ...graph, edges: graph.edges.filter((e) => !redundantIds.has(e.id)) },
    report,
  };
}

function isReachable(from: string, to: string, edges: ConceptEdge[]): boolean {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (!adj.has(e.fromId)) adj.set(e.fromId, []);
    adj.get(e.fromId)!.push(e.toId);
  }

  const visited = new Set<string>();
  const queue = [from];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur === to) return true;
    if (visited.has(cur)) continue;
    visited.add(cur);
    for (const neighbor of adj.get(cur) ?? []) queue.push(neighbor);
  }
  return false;
}
