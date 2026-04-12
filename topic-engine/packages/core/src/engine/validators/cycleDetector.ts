import type { ConceptGraph, ConceptEdge, ConceptNode, Violation, DepthLevel } from '../types';
import { DEPTH_ORDER } from '../types';

// ── Edge removal priority (lowest number = remove first) ─────────────────────
// confusable first (enrichment, not a real prereq),
// then leads_to (consequence, not dependency),
// then soft_prerequisite (optional),
// then hard_prerequisite (last resort)
const EDGE_PRIORITY: Record<string, number> = {
  confusable:        1,
  leads_to:          2,
  soft_prerequisite: 3,
  hard_prerequisite: 4,
};

export interface CycleReport {
  hasCycle: boolean;
  cycleNodes: string[];
  removedEdges: ConceptEdge[];
  warnings: string[];
  violations: Violation[];
}

/**
 * Detects and repairs cycles using DFS tricolor marking.
 *
 * Repair decision tree (per cycle):
 *   1. Both edges hard_prerequisite + same depth + combined ≤ 60min  → merge_nodes
 *   2. Edges have different types                                     → reclassify weaker to leads_to
 *   3. 2-node hard+hard cycle at different depths                    → llm_rewrite (bridge node)
 *   4. Fallback                                                       → remove weakest edge
 *
 * Iterates until no cycles remain (one removal per iteration to ensure correctness).
 */
export function detectAndRepairCycles(graph: ConceptGraph): {
  graph: ConceptGraph;
  report: CycleReport;
} {
  const report: CycleReport = {
    hasCycle: false,
    cycleNodes: [],
    removedEdges: [],
    warnings: [],
    violations: [],
  };

  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));
  let edges = [...graph.edges];
  let nodes = [...graph.nodes];

  let cycleFound = true;
  let iterations = 0;
  const MAX_ITERATIONS = graph.edges.length + 1;

  while (cycleFound && iterations < MAX_ITERATIONS) {
    cycleFound = false;
    iterations++;

    const adj = buildAdj(nodes.map((n) => n.id), edges);
    const color = new Map<string, number>(); // 0=white 1=gray 2=black
    const edgeStack: ConceptEdge[] = [];

    for (const nodeId of nodes.map((n) => n.id)) {
      if (!color.has(nodeId)) {
        const backEdge = dfs(nodeId, adj, color, edgeStack);
        if (backEdge) {
          cycleFound = true;
          report.hasCycle = true;

          const cycleEdges = collectCycleEdges(backEdge, edgeStack);
          const { graph: repaired, violation } = repairCycle(
            { ...graph, nodes, edges },
            cycleEdges,
            nodeMap
          );

          nodes = repaired.nodes;
          edges = repaired.edges;
          // Update nodeMap for merged nodes
          for (const n of nodes) nodeMap.set(n.id, n);

          report.cycleNodes.push(backEdge.fromId, backEdge.toId);
          report.violations.push(violation);
          report.warnings.push(violation.description);

          if (violation.repair.strategy === 'remove_edge') {
            const repair = violation.repair;
            const removed = cycleEdges.find((e) => e.id === repair.edgeId);
            if (removed) report.removedEdges.push(removed);
          }

          break; // restart DFS after each repair
        }
      }
    }
  }

  return { graph: { ...graph, nodes, edges }, report };
}

// ── Repair strategies ─────────────────────────────────────────────────────────

function repairCycle(
  graph: ConceptGraph,
  cycleEdges: ConceptEdge[],
  nodeMap: Map<string, ConceptNode>
): { graph: ConceptGraph; violation: Violation } {
  // Find the 2 directly-cycled nodes (back-edge endpoints)
  const backEdge = cycleEdges[0];
  const nodeA = nodeMap.get(backEdge.fromId);
  const nodeB = nodeMap.get(backEdge.toId);

  // Find the reverse edge if it exists
  const reverseEdge = cycleEdges.find(
    (e) => e.fromId === backEdge.toId && e.toId === backEdge.fromId
  );

  // Strategy 1: merge — both hard_prerequisite, same depth, combined ≤ 60min
  if (
    nodeA && nodeB && reverseEdge &&
    backEdge.type === 'hard_prerequisite' &&
    reverseEdge.type === 'hard_prerequisite' &&
    nodeA.depthLevel === nodeB.depthLevel &&
    nodeA.estimatedMins + nodeB.estimatedMins <= 60
  ) {
    const merged = mergeNodes(graph, nodeA, nodeB);
    const violation: Violation = {
      type: 'cycle',
      severity: 'error',
      affectedNodeIds: [nodeA.id, nodeB.id],
      affectedEdgeIds: cycleEdges.map((e) => e.id),
      description: `Cycle between "${nodeA.title}" ↔ "${nodeB.title}" — concepts are inseparable at same depth. Merged into one node.`,
      repair: { strategy: 'merge_nodes', nodeIdA: nodeA.id, nodeIdB: nodeB.id },
    };
    return { graph: merged, violation };
  }

  // Strategy 2: reclassify — edges have different types, demote the weaker one
  if (reverseEdge && backEdge.type !== reverseEdge.type) {
    const weakerEdge =
      EDGE_PRIORITY[backEdge.type] <= EDGE_PRIORITY[reverseEdge.type]
        ? backEdge
        : reverseEdge;
    const reclassified = reclassifyEdge(graph, weakerEdge.id);
    const violation: Violation = {
      type: 'cycle',
      severity: 'error',
      affectedNodeIds: [backEdge.fromId, backEdge.toId],
      affectedEdgeIds: [weakerEdge.id],
      description: `Cycle: reclassified weaker edge "${weakerEdge.fromId}" → "${weakerEdge.toId}" (${weakerEdge.type} → leads_to).`,
      repair: { strategy: 'reclassify_edge', edgeId: weakerEdge.id, newType: 'leads_to' },
    };
    return { graph: reclassified, violation };
  }

  // Strategy 3: bridge node — 2-node hard+hard at different depths (LLM needed)
  if (
    nodeA && nodeB && reverseEdge &&
    backEdge.type === 'hard_prerequisite' &&
    reverseEdge.type === 'hard_prerequisite' &&
    nodeA.depthLevel !== nodeB.depthLevel
  ) {
    // Can't fix algorithmically — remove weakest as fallback, flag for LLM
    const weakest = findWeakestEdge(cycleEdges);
    const withoutWeakest = removeEdge(graph, weakest.id);
    const violation: Violation = {
      type: 'cycle',
      severity: 'error',
      affectedNodeIds: [nodeA.id, nodeB.id],
      affectedEdgeIds: [weakest.id],
      description: `Cycle between "${nodeA.title}" (${nodeA.depthLevel}) ↔ "${nodeB.title}" (${nodeB.depthLevel}). One likely has a simpler surface form. Edge removed; LLM bridge node repair recommended.`,
      repair: {
        strategy: 'llm_rewrite',
        prompt: buildBridgePrompt(nodeA, nodeB),
        targetNodeIds: [nodeA.id, nodeB.id],
      },
    };
    return { graph: withoutWeakest, violation };
  }

  // Strategy 4: fallback — remove weakest edge
  const weakest = findWeakestEdge(cycleEdges);
  const repaired = removeEdge(graph, weakest.id);
  const titleA = nodeMap.get(weakest.fromId)?.title ?? weakest.fromId;
  const titleB = nodeMap.get(weakest.toId)?.title ?? weakest.toId;
  const violation: Violation = {
    type: 'cycle',
    severity: 'error',
    affectedNodeIds: cycleEdges.map((e) => e.fromId),
    affectedEdgeIds: [weakest.id],
    description: `Cycle detected. Removed weakest edge "${titleA}" → "${titleB}" (${weakest.type}).`,
    repair: { strategy: 'remove_edge', edgeId: weakest.id },
  };
  return { graph: repaired, violation };
}

// ── Merge two nodes into one ──────────────────────────────────────────────────

function mergeNodes(
  graph: ConceptGraph,
  a: ConceptNode,
  b: ConceptNode
): ConceptGraph {
  const deeper = DEPTH_ORDER[a.depthLevel] >= DEPTH_ORDER[b.depthLevel] ? a : b;
  const merged: ConceptNode = {
    id: `merged-${a.id}-${b.id}`,
    title: `${a.title} & ${b.title}`,
    description: `${a.description} ${b.description}`.trim(),
    depthLevel: deeper.depthLevel,
    boundaryType: a.boundaryType === 'core' ? 'core' : b.boundaryType,
    estimatedMins: a.estimatedMins + b.estimatedMins,
  };

  const rewiredEdges = graph.edges
    .filter(
      (e) =>
        !(e.fromId === a.id && e.toId === b.id) &&
        !(e.fromId === b.id && e.toId === a.id)
    )
    .map((e) => ({
      ...e,
      fromId: e.fromId === a.id || e.fromId === b.id ? merged.id : e.fromId,
      toId: e.toId === a.id || e.toId === b.id ? merged.id : e.toId,
    }))
    // Remove self-loops created by the merge
    .filter((e) => e.fromId !== e.toId);

  return {
    ...graph,
    nodes: [...graph.nodes.filter((n) => n.id !== a.id && n.id !== b.id), merged],
    edges: rewiredEdges,
  };
}

// ── Reclassify one edge to leads_to ──────────────────────────────────────────

function reclassifyEdge(graph: ConceptGraph, edgeId: string): ConceptGraph {
  return {
    ...graph,
    edges: graph.edges.map((e) =>
      e.id === edgeId ? { ...e, type: 'leads_to' as const } : e
    ),
  };
}

// ── Remove one edge ───────────────────────────────────────────────────────────

function removeEdge(graph: ConceptGraph, edgeId: string): ConceptGraph {
  return { ...graph, edges: graph.edges.filter((e) => e.id !== edgeId) };
}

// ── Pick weakest edge to remove ───────────────────────────────────────────────

function findWeakestEdge(edges: ConceptEdge[]): ConceptEdge {
  return [...edges].sort(
    (a, b) => (EDGE_PRIORITY[a.type] ?? 5) - (EDGE_PRIORITY[b.type] ?? 5)
  )[0];
}

// ── LLM bridge-node prompt ────────────────────────────────────────────────────

function buildBridgePrompt(a: ConceptNode, b: ConceptNode): string {
  return (
    `Two concepts form a mutual hard_prerequisite cycle:\n` +
    `  "${a.title}" (${a.depthLevel}, ${a.estimatedMins}min)\n` +
    `  "${b.title}" (${b.depthLevel}, ${b.estimatedMins}min)\n\n` +
    `The real teaching pattern is: one concept has a surface-level introduction\n` +
    `that is enough to unlock the other, then you revisit it deeply.\n\n` +
    `Which concept has a simpler surface form? Return:\n` +
    `{\n` +
    `  "surfaceConcept": "<title of concept with simpler form>",\n` +
    `  "surfaceNodeTitle": "<title for the surface-level node>",\n` +
    `  "surfaceNodeMins": <number>,\n` +
    `  "deepNodeTitle": "<title for the deep revisit node>",\n` +
    `  "order": ["surface_node_id", "${a.id}", "deep_node_id"]\n` +
    `}`
  );
}

// ── DFS helpers ───────────────────────────────────────────────────────────────

function buildAdj(nodeIds: string[], edges: ConceptEdge[]): Map<string, ConceptEdge[]> {
  const adj = new Map<string, ConceptEdge[]>(nodeIds.map((id) => [id, []]));
  for (const e of edges) {
    if (adj.has(e.fromId)) adj.get(e.fromId)!.push(e);
  }
  return adj;
}

/** Iterative DFS. Returns the first back-edge found, or null. */
function dfs(
  start: string,
  adj: Map<string, ConceptEdge[]>,
  color: Map<string, number>,
  edgeStack: ConceptEdge[]
): ConceptEdge | null {
  const stack: Array<[string, Iterator<ConceptEdge>, ConceptEdge | null]> = [
    [start, (adj.get(start) ?? [])[Symbol.iterator](), null],
  ];
  color.set(start, 1);

  while (stack.length > 0) {
    const top = stack[stack.length - 1];
    const [, iter] = top;
    const next = iter.next();

    if (next.done) {
      const [nodeId, , arrivalEdge] = stack.pop()!;
      color.set(nodeId, 2);
      if (arrivalEdge) edgeStack.pop();
    } else {
      const edge = next.value;
      const neighborColor = color.get(edge.toId) ?? 0;

      if (neighborColor === 1) {
        edgeStack.push(edge);
        return edge; // back edge = cycle
      }
      if (neighborColor === 0) {
        color.set(edge.toId, 1);
        edgeStack.push(edge);
        stack.push([edge.toId, (adj.get(edge.toId) ?? [])[Symbol.iterator](), edge]);
      }
    }
  }

  return null;
}

/**
 * Collect edges that form the cycle from the back-edge's toId back to fromId.
 */
function collectCycleEdges(backEdge: ConceptEdge, edgeStack: ConceptEdge[]): ConceptEdge[] {
  const cycle: ConceptEdge[] = [backEdge];
  for (let i = edgeStack.length - 1; i >= 0; i--) {
    cycle.push(edgeStack[i]);
    if (edgeStack[i].fromId === backEdge.toId) break;
  }
  return cycle;
}
