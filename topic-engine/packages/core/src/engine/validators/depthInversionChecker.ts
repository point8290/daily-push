import type { ConceptGraph, DepthLevel, Violation } from '../types';
import { DEPTH_ORDER } from '../types';

export interface DepthInversionReport {
  inversionCount: number;
  warnings: string[];
  violations: Violation[];
}

const DEPTH_LEVELS: DepthLevel[] = [
  'surface',
  'foundational',
  'intermediate',
  'advanced',
  'expert',
];

/**
 * Returns the depth level one step shallower than the given level.
 * 'surface' is already the shallowest — returns 'surface'.
 */
function shallowerThan(level: DepthLevel): DepthLevel {
  const idx = DEPTH_LEVELS.indexOf(level);
  return DEPTH_LEVELS[Math.max(0, idx - 1)];
}

/**
 * Depth inversion checker.
 *
 * A prerequisite edge fromId → toId is inverted when:
 *   DEPTH_ORDER[from.depthLevel] > DEPTH_ORDER[to.depthLevel]
 *
 * The prerequisite must be shallower than (or equal to) what it unlocks.
 * Only hard_prerequisite and soft_prerequisite edges are checked —
 * confusable and leads_to edges don't imply ordering.
 *
 * Repair: adjust the from-node's depthLevel to shallowerThan(to.depthLevel).
 * This preserves the edge type and direction, only corrects the classification.
 */
export function checkDepthInversions(graph: ConceptGraph): {
  graph: ConceptGraph;
  report: DepthInversionReport;
} {
  const report: DepthInversionReport = {
    inversionCount: 0,
    warnings: [],
    violations: [],
  };

  const depthOf = new Map(graph.nodes.map((n) => [n.id, n.depthLevel]));
  // Collect depth adjustments: nodeId → new depth (last adjustment wins per node)
  const depthAdjustments = new Map<string, DepthLevel>();

  for (const e of graph.edges) {
    if (e.type !== 'hard_prerequisite' && e.type !== 'soft_prerequisite') continue;

    const fromDepth = depthOf.get(e.fromId);
    const toDepth = depthOf.get(e.toId);
    if (!fromDepth || !toDepth) continue;

    if (DEPTH_ORDER[fromDepth] > DEPTH_ORDER[toDepth]) {
      const newDepth = shallowerThan(toDepth);
      depthAdjustments.set(e.fromId, newDepth);
      report.inversionCount++;

      const fromTitle = graph.nodes.find((n) => n.id === e.fromId)?.title ?? e.fromId;
      const toTitle = graph.nodes.find((n) => n.id === e.toId)?.title ?? e.toId;

      const violation: Violation = {
        type: 'depth_inversion',
        severity: 'warning',
        affectedNodeIds: [e.fromId, e.toId],
        affectedEdgeIds: [e.id],
        description:
          `Depth inversion: "${fromTitle}" (${fromDepth}) is a ${e.type} of ` +
          `"${toTitle}" (${toDepth}) but is deeper. Adjusted "${fromTitle}" to ${newDepth}.`,
        repair: { strategy: 'adjust_depth', nodeId: e.fromId, newDepth },
      };

      report.violations.push(violation);
      report.warnings.push(violation.description);

      // Update the working depth map so subsequent edges see the correction
      depthOf.set(e.fromId, newDepth);
    }
  }

  const patchedNodes = graph.nodes.map((n) => {
    const newDepth = depthAdjustments.get(n.id);
    return newDepth ? { ...n, depthLevel: newDepth } : n;
  });

  return { graph: { ...graph, nodes: patchedNodes }, report };
}
