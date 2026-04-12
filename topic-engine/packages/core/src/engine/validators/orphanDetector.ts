import type { ConceptGraph, ConceptNode, Violation } from '../types';

export interface OrphanReport {
  removedOrphans: ConceptNode[];
  warnings: string[];
  violations: Violation[];
}

/**
 * Orphan detection: finds nodes with zero edges (not connected to anything).
 *
 * Repair strategy:
 *   - Emits llm_rewrite violation with a reconnect prompt (preferred repair)
 *   - Applies remove_node as immediate fallback so the graph stays clean
 *   - Sets requiresLLM = true in the orchestrator so the pipeline knows
 *     a better repair was available
 *
 * Edge case: if ALL nodes are orphans (no edges produced at all), keep the
 * graph as-is — removing everything is worse than an edgeless graph.
 */
export function detectAndRemoveOrphans(graph: ConceptGraph): {
  graph: ConceptGraph;
  report: OrphanReport;
} {
  const report: OrphanReport = { removedOrphans: [], warnings: [], violations: [] };

  const connected = new Set<string>();
  for (const e of graph.edges) {
    connected.add(e.fromId);
    connected.add(e.toId);
  }

  const orphans = graph.nodes.filter((n) => !connected.has(n.id));

  // Guard: if every node is an orphan, no edges were produced at all — keep graph
  if (orphans.length === graph.nodes.length) {
    report.warnings.push(
      `All ${orphans.length} nodes are disconnected — no edges produced. Keeping graph as-is.`
    );
    return { graph, report };
  }

  const existingTitles = graph.nodes
    .filter((n) => connected.has(n.id))
    .map((n) => n.title)
    .join(', ');

  for (const orphan of orphans) {
    // Emit llm_rewrite violation — a better repair is possible (reconnect)
    const violation: Violation = {
      type: 'orphaned_node',
      severity: 'warning',
      affectedNodeIds: [orphan.id],
      affectedEdgeIds: [],
      description: `"${orphan.title}" has no connections to any other concept.`,
      repair: {
        strategy: 'llm_rewrite',
        prompt:
          `The concept "${orphan.title}" exists in a graph about "${graph.topic}" ` +
          `but has no prerequisite or dependent relationships.\n` +
          `Either: (a) identify which existing node it should be a prerequisite of, ` +
          `or (b) identify which existing node should be its prerequisite.\n` +
          `Existing nodes: ${existingTitles}\n` +
          `Return: { action: "connect", fromId: string, toId: string, type: EdgeType } ` +
          `or { action: "remove" }`,
        targetNodeIds: [orphan.id],
      },
    };
    report.violations.push(violation);
    report.warnings.push(`Node "${orphan.id}" ("${orphan.title}") has no edges — removed as orphan.`);
    report.removedOrphans.push(orphan);
  }

  // Apply fallback: remove orphans so graph is clean (LLM repair can add them back later)
  const orphanIds = new Set(orphans.map((o) => o.id));
  return {
    graph: {
      ...graph,
      nodes: graph.nodes.filter((n) => !orphanIds.has(n.id)),
      edges: graph.edges.filter((e) => !orphanIds.has(e.fromId) && !orphanIds.has(e.toId)),
    },
    report,
  };
}
