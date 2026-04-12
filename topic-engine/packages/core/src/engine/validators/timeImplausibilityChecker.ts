import type { ConceptGraph, Violation } from '../types';
import { PLAUSIBLE_TIME_RANGES } from '../types';

export interface TimeImplausibilityReport {
  patchedCount: number;
  warnings: string[];
  violations: Violation[];
}

/**
 * Time implausibility checker.
 *
 * Each node's estimatedMins must fall within the plausible range for its depthLevel.
 * Out-of-range values are clamped to the depth median.
 */
export function checkTimeImplausibilities(graph: ConceptGraph): {
  graph: ConceptGraph;
  report: TimeImplausibilityReport;
} {
  const report: TimeImplausibilityReport = {
    patchedCount: 0,
    warnings: [],
    violations: [],
  };

  const patchedNodes = graph.nodes.map((n) => {
    const range = PLAUSIBLE_TIME_RANGES[n.depthLevel];
    if (n.estimatedMins >= range.min && n.estimatedMins <= range.max) return n;

    report.patchedCount++;
    const msg =
      `"${n.title}" estimatedMins=${n.estimatedMins} is outside plausible range ` +
      `[${range.min}–${range.max}] for depth="${n.depthLevel}". Clamped to median ${range.median}.`;

    report.warnings.push(msg);
    report.violations.push({
      type: 'time_implausibility',
      severity: 'info',
      affectedNodeIds: [n.id],
      affectedEdgeIds: [],
      description: msg,
      repair: { strategy: 'adjust_time', nodeId: n.id, newMins: range.median },
    });

    return { ...n, estimatedMins: range.median };
  });

  return { graph: { ...graph, nodes: patchedNodes }, report };
}
