import type { ConceptEdge } from '../types';

/**
 * Brandes algorithm — betweenness centrality for a directed, unweighted graph.
 *
 * CB(v) = Σ_{s≠v≠t} [ σ(s,t|v) / σ(s,t) ]
 *
 * where σ(s,t) = number of shortest paths from s to t,
 *       σ(s,t|v) = those paths that pass through v.
 *
 * Normalized by (n−1)(n−2) so scores are in [0, 1].
 * Complexity: O(V × E)
 */
export function computeBetweenness(
  nodeIds: string[],
  edges: ConceptEdge[]
): Record<string, number> {
  const n = nodeIds.length;
  const CB = new Map<string, number>(nodeIds.map((id) => [id, 0]));

  // Build directed adjacency list
  const adj = new Map<string, string[]>(nodeIds.map((id) => [id, []]));
  for (const e of edges) {
    if (adj.has(e.fromId)) adj.get(e.fromId)!.push(e.toId);
  }

  for (const s of nodeIds) {
    // BFS from source s
    const sigma = new Map<string, number>(nodeIds.map((id) => [id, 0]));
    sigma.set(s, 1);
    const dist = new Map<string, number>(nodeIds.map((id) => [id, -1]));
    dist.set(s, 0);
    const pred = new Map<string, string[]>(nodeIds.map((id) => [id, []]));

    const queue: string[] = [s];
    const stack: string[] = [];

    while (queue.length > 0) {
      const v = queue.shift()!;
      stack.push(v);

      for (const w of adj.get(v) ?? []) {
        // First time visiting w
        if (dist.get(w) === -1) {
          dist.set(w, dist.get(v)! + 1);
          queue.push(w);
        }
        // Shortest path via v
        if (dist.get(w) === dist.get(v)! + 1) {
          sigma.set(w, sigma.get(w)! + sigma.get(v)!);
          pred.get(w)!.push(v);
        }
      }
    }

    // Back-propagate dependency
    const delta = new Map<string, number>(nodeIds.map((id) => [id, 0]));
    while (stack.length > 0) {
      const w = stack.pop()!;
      for (const v of pred.get(w)!) {
        const frac = (sigma.get(v)! / sigma.get(w)!) * (1 + delta.get(w)!);
        delta.set(v, delta.get(v)! + frac);
      }
      if (w !== s) {
        CB.set(w, CB.get(w)! + delta.get(w)!);
      }
    }
  }

  // Normalize: directed graph normalizer is (n-1)(n-2)
  const normalizer = n > 2 ? (n - 1) * (n - 2) : 1;
  const result: Record<string, number> = {};
  for (const [id, score] of CB) {
    result[id] = Math.round((score / normalizer) * 1000) / 1000;
  }
  return result;
}
