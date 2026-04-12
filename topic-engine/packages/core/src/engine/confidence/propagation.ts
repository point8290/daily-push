import type { ConceptGraph, NodeConfidence } from '../types';

/**
 * Propagates confidence through the prerequisite graph.
 *
 * Formula (from spec):
 *   effective = overall × 0.7 + overall × weakest_hard_prereq_effective × 0.3
 *
 * Nodes with no hard_prerequisite inbound edges: effective = overall
 *
 * Algorithm:
 *   1. Topological sort of nodes (Kahn's algorithm)
 *   2. Walk in topological order (prerequisites before dependents)
 *   3. For each node, find all hard_prerequisite predecessors
 *      and apply the propagation formula using the weakest one
 *
 * The graph is already a validated DAG at this point (cycle detector ran first).
 */
export function propagateConfidence(
  graph: ConceptGraph,
  nodeConfidence: Record<string, NodeConfidence>
): Record<string, NodeConfidence> {
  const result = { ...nodeConfidence };

  // Build predecessor maps for hard_prerequisite edges only
  // hardPreds[nodeId] = list of fromId (nodes that must be learned first)
  const hardPreds = new Map<string, string[]>();
  for (const node of graph.nodes) {
    hardPreds.set(node.id, []);
  }
  for (const edge of graph.edges) {
    if (edge.type === 'hard_prerequisite') {
      hardPreds.get(edge.toId)?.push(edge.fromId);
    }
  }

  // Topological sort using Kahn's algorithm
  // in-degree = number of hard_prerequisite predecessors
  const inDegree = new Map<string, number>();
  for (const node of graph.nodes) {
    inDegree.set(node.id, hardPreds.get(node.id)?.length ?? 0);
  }

  const queue: string[] = [];
  for (const [nodeId, deg] of inDegree) {
    if (deg === 0) queue.push(nodeId);
  }

  const topoOrder: string[] = [];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);
    topoOrder.push(nodeId);

    // Find all nodes that have this as a hard prerequisite
    for (const edge of graph.edges) {
      if (edge.type === 'hard_prerequisite' && edge.fromId === nodeId) {
        const deg = (inDegree.get(edge.toId) ?? 1) - 1;
        inDegree.set(edge.toId, deg);
        if (deg <= 0 && !visited.has(edge.toId)) {
          queue.push(edge.toId);
        }
      }
    }
  }

  // Add any nodes not reached (e.g., isolated via non-hard edges only)
  for (const node of graph.nodes) {
    if (!visited.has(node.id)) {
      topoOrder.push(node.id);
    }
  }

  // Walk in topological order, propagating effective confidence
  for (const nodeId of topoOrder) {
    const preds = hardPreds.get(nodeId) ?? [];
    const conf = result[nodeId];
    if (!conf) continue;

    if (preds.length === 0) {
      // No hard prerequisites — effective equals overall
      result[nodeId] = { ...conf, effective: conf.overall };
    } else {
      // Find the weakest effective score among all hard prerequisite predecessors
      const weakestPredEffective = preds.reduce((weakest, predId) => {
        const predConf = result[predId];
        const predEffective = predConf?.effective ?? 0.5;
        return Math.min(weakest, predEffective);
      }, 1.0);

      // effective = overall×0.7 + overall×weakest×0.3
      const effective = conf.overall * 0.7 + conf.overall * weakestPredEffective * 0.3;
      result[nodeId] = { ...conf, effective };
    }
  }

  return result;
}
