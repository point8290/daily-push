import type { ConceptGraph, Violation, StructuralValidationResult } from '../types';
import { detectAndRepairCycles } from './cycleDetector';
import { detectAndRemoveOrphans } from './orphanDetector';
import { checkDepthInversions } from './depthInversionChecker';
import { checkTimeImplausibilities } from './timeImplausibilityChecker';
import { transitiveReduce } from './transitiveReducer';
import { checkGranularity } from './granularityChecker';
import { detectDisconnectedSubgraphs } from './disconnectedSubgraphChecker';

/**
 * StructuralValidator — runs all 7 validators and applies algorithmic repairs.
 *
 * Run order (each step receives the graph repaired by the previous step):
 *   1. Cycle detection          — must run first; other checks assume DAG
 *   2. Orphan removal           — clean islands after cycle repair
 *   3. Disconnected subgraphs   — find clusters with no path to root
 *   4. Depth inversion          — correct depth levels
 *   5. Time implausibility      — clamp estimatedMins
 *   6. Transitive reduction     — must run after cycles are gone
 *   7. Granularity              — advisory only, no mutations
 *
 * After applying all algorithmic repairs, cycles and disconnected subgraphs
 * are re-checked — a repair can introduce a new violation.
 *
 * Violations with strategy 'llm_rewrite' or 'flag' are not applied to the
 * graph automatically. They set requiresLLM = true so the pipeline can
 * optionally invoke targeted LLM repair calls.
 */
export class StructuralValidator {
  validate(graph: ConceptGraph): StructuralValidationResult {
    const allViolations: Violation[] = [];
    const stats = {
      cyclesRepaired: 0,
      orphansRemoved: 0,
      depthInversionsFixed: 0,
      timingsPatched: 0,
      transitiveEdgesRemoved: 0,
      granularityWarnings: 0,
      disconnectedFixed: 0,
    };

    let g = graph;

    // ── 1. Cycle detection ──────────────────────────────────────────────────
    const { graph: g1, report: cycleReport } = detectAndRepairCycles(g);
    g = g1;
    allViolations.push(...cycleReport.violations);
    stats.cyclesRepaired = cycleReport.removedEdges.length;

    // ── 2. Orphan removal ───────────────────────────────────────────────────
    const { graph: g2, report: orphanReport } = detectAndRemoveOrphans(g);
    g = g2;
    allViolations.push(...orphanReport.violations);
    stats.orphansRemoved = orphanReport.removedOrphans.length;

    // ── 3. Disconnected subgraphs ───────────────────────────────────────────
    const { graph: g3, report: disconnectedReport } = detectDisconnectedSubgraphs(g);
    g = g3;
    allViolations.push(...disconnectedReport.violations);
    stats.disconnectedFixed = disconnectedReport.disconnectedNodeIds.length;

    // ── 4. Depth inversion ──────────────────────────────────────────────────
    const { graph: g4, report: depthReport } = checkDepthInversions(g);
    g = g4;
    allViolations.push(...depthReport.violations);
    stats.depthInversionsFixed = depthReport.inversionCount;

    // ── 5. Time implausibility ──────────────────────────────────────────────
    const { graph: g5, report: timeReport } = checkTimeImplausibilities(g);
    g = g5;
    allViolations.push(...timeReport.violations);
    stats.timingsPatched = timeReport.patchedCount;

    // ── 6. Transitive reduction ─────────────────────────────────────────────
    const { graph: g6, report: transReport } = transitiveReduce(g);
    g = g6;
    allViolations.push(...transReport.violations);
    stats.transitiveEdgesRemoved = transReport.removedCount;

    // ── 7. Granularity (advisory) ───────────────────────────────────────────
    const { graph: g7, report: granReport } = checkGranularity(g);
    g = g7;
    allViolations.push(...granReport.violations);
    stats.granularityWarnings = granReport.tooCoarseCount + granReport.tooFineCount;

    // ── Re-run critical checks after repairs ────────────────────────────────
    // A merge, reclassify, or depth adjustment can introduce new issues.
    const { graph: gFinal, report: residualCycles } = detectAndRepairCycles(g);
    g = gFinal;
    if (residualCycles.violations.length > 0) {
      allViolations.push(...residualCycles.violations);
      stats.cyclesRepaired += residualCycles.removedEdges.length;
    }

    const { report: residualDisconnected } = detectDisconnectedSubgraphs(g);
    if (residualDisconnected.violations.length > 0) {
      allViolations.push(...residualDisconnected.violations);
    }

    // ── Determine requiresLLM ───────────────────────────────────────────────
    const requiresLLM = allViolations.some(
      (v) =>
        v.repair.strategy === 'llm_rewrite' ||
        v.repair.strategy === 'flag'
    );

    // ── Determine valid ─────────────────────────────────────────────────────
    // Valid = no error-severity violations remain in the final graph
    const hasErrors = allViolations.some((v) => v.severity === 'error');

    // Backward-compat warnings array
    const warnings = allViolations.map((v) => v.description);

    return {
      valid: !hasErrors,
      violations: allViolations,
      repairedGraph: g,
      requiresLLM,
      warnings,
      stats,
    };
  }
}

// ── Functional wrapper for pipeline.ts backward compatibility ─────────────────
export function validateGraph(graph: ConceptGraph): StructuralValidationResult {
  return new StructuralValidator().validate(graph);
}

// ── Re-export individual validators ──────────────────────────────────────────
export { detectAndRepairCycles } from './cycleDetector';
export { detectAndRemoveOrphans } from './orphanDetector';
export { checkDepthInversions } from './depthInversionChecker';
export { checkTimeImplausibilities } from './timeImplausibilityChecker';
export { transitiveReduce } from './transitiveReducer';
export { checkGranularity } from './granularityChecker';
export { detectDisconnectedSubgraphs } from './disconnectedSubgraphChecker';
