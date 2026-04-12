import type { ConceptNode, ConceptEdge, Community, DepthLevel } from '../types';
import { DEPTH_ORDER } from '../types';

/**
 * Community detection via iterative label propagation.
 *
 * Each node adopts the most common label among its neighbors (undirected view).
 * Ties are broken deterministically by label string comparison.
 * Runs up to MAX_ROUNDS until stable.
 *
 * Complexity: O(rounds × V × degree)
 */
const MAX_ROUNDS = 8;

export function detectCommunities(
  nodes: ConceptNode[],
  edges: ConceptEdge[]
): Community[] {
  if (nodes.length === 0) return [];

  // Initialize each node with its own label
  const label = new Map<string, string>(nodes.map((n) => [n.id, n.id]));

  // Build undirected adjacency
  const adj = new Map<string, Set<string>>(nodes.map((n) => [n.id, new Set()]));
  for (const e of edges) {
    adj.get(e.fromId)?.add(e.toId);
    adj.get(e.toId)?.add(e.fromId);
  }

  // Label propagation
  for (let round = 0; round < MAX_ROUNDS; round++) {
    let changed = false;

    // Use a fixed iteration order (sorted by id for determinism)
    for (const n of [...nodes].sort((a, b) => a.id.localeCompare(b.id))) {
      const neighbors = [...(adj.get(n.id) ?? [])];
      if (neighbors.length === 0) continue;

      // Count label frequencies
      const freq = new Map<string, number>();
      for (const nb of neighbors) {
        const l = label.get(nb)!;
        freq.set(l, (freq.get(l) ?? 0) + 1);
      }

      // Most frequent label (ties broken lexicographically for determinism)
      const best = [...freq.entries()].sort(
        (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
      )[0][0];

      if (best !== label.get(n.id)) {
        label.set(n.id, best);
        changed = true;
      }
    }

    if (!changed) break;
  }

  // Group node IDs by label
  const groups = new Map<string, string[]>();
  for (const [nodeId, l] of label) {
    if (!groups.has(l)) groups.set(l, []);
    groups.get(l)!.push(nodeId);
  }

  // Build Community objects with depth range + inferred label
  const depthOf = new Map(nodes.map((n) => [n.id, n.depthLevel]));
  const titleOf = new Map(nodes.map((n) => [n.id, n.title]));

  const communities: Community[] = [];
  let idx = 0;

  for (const [, nodeIds] of groups) {
    const depths = nodeIds
      .map((id) => DEPTH_ORDER[depthOf.get(id) ?? 'surface'])
      .sort((a, b) => a - b);

    const minOrder = depths[0];
    const maxOrder = depths[depths.length - 1];

    const minDepth = (
      Object.entries(DEPTH_ORDER).find(([, v]) => v === minOrder)?.[0] ?? 'surface'
    ) as DepthLevel;
    const maxDepth = (
      Object.entries(DEPTH_ORDER).find(([, v]) => v === maxOrder)?.[0] ?? 'expert'
    ) as DepthLevel;

    communities.push({
      id: `c${idx++}`,
      label: inferLabel(nodeIds, titleOf, minDepth),
      nodeIds,
      depthRange: { min: minDepth, max: maxDepth },
    });
  }

  // Sort communities by min depth ascending
  return communities.sort(
    (a, b) => DEPTH_ORDER[a.depthRange.min] - DEPTH_ORDER[b.depthRange.min]
  );
}

/**
 * Generates a short human-readable label for a community.
 * Uses the shallowest node's title as the anchor concept.
 */
function inferLabel(
  nodeIds: string[],
  titleOf: Map<string, string>,
  minDepth: DepthLevel
): string {
  const anchor = nodeIds
    .map((id) => titleOf.get(id) ?? id)
    .sort((a, b) => a.length - b.length)[0]; // shortest title = most likely the anchor concept

  const depthLabel: Record<DepthLevel, string> = {
    surface: 'Overview',
    foundational: 'Foundations',
    intermediate: 'Core',
    advanced: 'Advanced',
    expert: 'Expert',
  };

  return `${anchor} ${depthLabel[minDepth]}`;
}
