import type { ConceptNode, ConceptEdge, LearningPath } from '../types';

/**
 * Topological sort via Kahn's algorithm (BFS-based).
 * Returns nodes in prerequisite-first order.
 * Only traverses hard_prerequisite + soft_prerequisite edges.
 */
export function topologicalSort(
  nodes: ConceptNode[],
  edges: ConceptEdge[]
): ConceptNode[] {
  const prereqEdges = edges.filter(
    (e) => e.type === 'hard_prerequisite' || e.type === 'soft_prerequisite'
  );

  const inDegree = new Map<string, number>(nodes.map((n) => [n.id, 0]));
  const adj = new Map<string, string[]>(nodes.map((n) => [n.id, []]));

  for (const e of prereqEdges) {
    adj.get(e.fromId)?.push(e.toId);
    inDegree.set(e.toId, (inDegree.get(e.toId) ?? 0) + 1);
  }

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const queue = nodes
    .filter((n) => (inDegree.get(n.id) ?? 0) === 0)
    .map((n) => n.id);
  const sorted: ConceptNode[] = [];

  while (queue.length > 0) {
    const id = queue.shift()!;
    const node = nodeById.get(id);
    if (node) sorted.push(node);

    for (const neighborId of adj.get(id) ?? []) {
      const deg = (inDegree.get(neighborId) ?? 1) - 1;
      inDegree.set(neighborId, deg);
      if (deg === 0) queue.push(neighborId);
    }
  }

  // If not all nodes were reached (cycle remnant after validator), append the rest
  const sortedIds = new Set(sorted.map((n) => n.id));
  for (const n of nodes) {
    if (!sortedIds.has(n.id)) sorted.push(n);
  }

  return sorted;
}

/**
 * Critical path — longest weighted path through the DAG (by estimatedMins).
 * Represents the minimum time a learner must spend to reach the root topic.
 *
 * Returns the ordered node ID sequence and total minutes.
 */
export function criticalPath(
  nodes: ConceptNode[],
  edges: ConceptEdge[]
): { path: string[]; mins: number } {
  const prereqEdges = edges.filter(
    (e) => e.type === 'hard_prerequisite' || e.type === 'soft_prerequisite'
  );

  const adj = new Map<string, string[]>(nodes.map((n) => [n.id, []]));
  const inDegree = new Map<string, number>(nodes.map((n) => [n.id, 0]));

  for (const e of prereqEdges) {
    adj.get(e.fromId)?.push(e.toId);
    inDegree.set(e.toId, (inDegree.get(e.toId) ?? 0) + 1);
  }

  const minsOf = new Map(nodes.map((n) => [n.id, n.estimatedMins]));
  // dist[v] = longest path cost to reach v (inclusive)
  const dist = new Map<string, number>(
    nodes.map((n) => [n.id, (inDegree.get(n.id) ?? 0) === 0 ? n.estimatedMins : 0])
  );
  const pred = new Map<string, string | null>(nodes.map((n) => [n.id, null]));

  // Kahn's BFS in topological order, updating longest-path distances
  const queue = nodes.filter((n) => (inDegree.get(n.id) ?? 0) === 0).map((n) => n.id);
  const tempInDegree = new Map(inDegree);

  while (queue.length > 0) {
    const u = queue.shift()!;
    for (const v of adj.get(u) ?? []) {
      const candidate = dist.get(u)! + minsOf.get(v)!;
      if (candidate > dist.get(v)!) {
        dist.set(v, candidate);
        pred.set(v, u);
      }
      const deg = (tempInDegree.get(v) ?? 1) - 1;
      tempInDegree.set(v, deg);
      if (deg === 0) queue.push(v);
    }
  }

  // Find endpoint = node with maximum dist (should be the root topic)
  let maxId = nodes[0]?.id ?? '';
  let maxDist = 0;
  for (const [id, d] of dist) {
    if (d > maxDist) {
      maxDist = d;
      maxId = id;
    }
  }

  // Trace back
  const path: string[] = [];
  let cur: string | null = maxId;
  while (cur !== null) {
    path.unshift(cur);
    cur = pred.get(cur) ?? null;
  }

  return { path, mins: maxDist };
}

/**
 * Compute distance-from-root for each node.
 * Root = node with the most inbound prerequisite edges (closest to "sink" in prereq graph).
 * Distance measured by hops backwards from root.
 */
export function distancesFromRoot(
  nodes: ConceptNode[],
  edges: ConceptEdge[]
): Map<string, number> {
  const prereqEdges = edges.filter(
    (e) => e.type === 'hard_prerequisite' || e.type === 'soft_prerequisite'
  );

  // Find root: node with most inbound hard_prerequisite edges
  const inbound = new Map<string, number>(nodes.map((n) => [n.id, 0]));
  for (const e of prereqEdges) {
    inbound.set(e.toId, (inbound.get(e.toId) ?? 0) + 1);
  }
  let rootId = nodes[0]?.id ?? '';
  let maxIn = -1;
  for (const [id, count] of inbound) {
    if (count > maxIn) {
      maxIn = count;
      rootId = id;
    }
  }

  // BFS backwards from root (via reverse edges)
  const reverseAdj = new Map<string, string[]>(nodes.map((n) => [n.id, []]));
  for (const e of prereqEdges) {
    reverseAdj.get(e.toId)?.push(e.fromId);
  }

  const dist = new Map<string, number>(nodes.map((n) => [n.id, Infinity]));
  dist.set(rootId, 0);
  const queue = [rootId];

  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const nb of reverseAdj.get(cur) ?? []) {
      if (dist.get(nb) === Infinity) {
        dist.set(nb, dist.get(cur)! + 1);
        queue.push(nb);
      }
    }
  }

  // Nodes not reachable from root (e.g. out_of_scope islands) get distance = nodes.length
  for (const n of nodes) {
    if (dist.get(n.id) === Infinity) dist.set(n.id, nodes.length);
  }

  return dist;
}

/**
 * Build fast-track and thorough-track learning paths from topological sort.
 *
 * fast_track   : only `core` boundary nodes, in topological order
 * thorough     : `core` + `optional_depth` nodes, in topological order
 */
export function buildLearningPaths(
  nodes: ConceptNode[],
  edges: ConceptEdge[]
): { fastTrack: LearningPath; thoroughTrack: LearningPath } {
  const sorted = topologicalSort(nodes, edges);

  const fastNodes = sorted.filter((n) => n.boundaryType === 'core');
  const thoroughNodes = sorted.filter(
    (n) => n.boundaryType === 'core' || n.boundaryType === 'optional_depth'
  );

  const sum = (ns: ConceptNode[]) => ns.reduce((acc, n) => acc + n.estimatedMins, 0);

  return {
    fastTrack: {
      nodes: fastNodes,
      totalMins: sum(fastNodes),
      mode: 'fast_track',
    },
    thoroughTrack: {
      nodes: thoroughNodes,
      totalMins: sum(thoroughNodes),
      mode: 'thorough',
    },
  };
}
