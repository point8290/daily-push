import type { ConceptGraph, Violation } from '../types';

export interface GranularityReport {
  tooCoarseCount: number;
  tooFineCount: number;
  warnings: string[];
  violations: Violation[];
}

// ── Granularity signals ───────────────────────────────────────────────────────

/**
 * Too narrow: covers a single API method or trivial syntax detail.
 *   - Very short time estimate (≤8 min)
 *   - OR title contains code-specific syntax markers (brackets, backticks, method calls)
 */
const TOO_NARROW_MAX_MINS = 8;
const TOO_NARROW_SYNTAX_PATTERN = /[\[\](){}\.#@]|`[^`]+`|\b\w+\(\)/;

/**
 * Too broad: names an entire technology or field as a single node.
 *   - Very long time estimate (≥150 min)
 *   - OR title is a major technology name alone
 */
const TOO_BROAD_MIN_MINS = 150;
const TOO_BROAD_TITLE_PATTERN =
  /^(javascript|typescript|python|react|node\.?js|css|html|sql|databases?|networking|algorithms?|data structures?)$/i;

const MAX_RECOMMENDED_NODES = 30;
const MIN_RECOMMENDED_NODES = 3;

/**
 * Granularity checker.
 *
 * Two failure modes:
 *   - Too narrow: covers a single API detail, not a learnable concept
 *   - Too broad: covers an entire field — needs splitting
 *
 * Both emit llm_rewrite violations (algorithmic repair is not possible —
 * deciding what to split/merge into requires semantic judgment).
 * No mutations to the graph.
 */
export function checkGranularity(graph: ConceptGraph): {
  graph: ConceptGraph;
  report: GranularityReport;
} {
  const report: GranularityReport = {
    tooCoarseCount: 0,
    tooFineCount: 0,
    warnings: [],
    violations: [],
  };

  if (graph.nodes.length > MAX_RECOMMENDED_NODES) {
    const msg =
      `Graph has ${graph.nodes.length} nodes (recommended ≤ ${MAX_RECOMMENDED_NODES}). ` +
      `Consider merging closely related concepts.`;
    report.warnings.push(msg);
    report.violations.push({
      type: 'granularity_violation',
      severity: 'warning',
      affectedNodeIds: [],
      affectedEdgeIds: [],
      description: msg,
      repair: { strategy: 'flag', reason: msg },
    });
  }

  if (graph.nodes.length < MIN_RECOMMENDED_NODES) {
    const msg = `Graph has only ${graph.nodes.length} nodes — decomposition may be too shallow.`;
    report.warnings.push(msg);
    report.violations.push({
      type: 'granularity_violation',
      severity: 'warning',
      affectedNodeIds: [],
      affectedEdgeIds: [],
      description: msg,
      repair: { strategy: 'flag', reason: msg },
    });
  }

  for (const node of graph.nodes) {
    // ── Too narrow ────────────────────────────────────────────────────────────
    const isTooNarrow =
      node.estimatedMins <= TOO_NARROW_MAX_MINS ||
      TOO_NARROW_SYNTAX_PATTERN.test(node.title);

    if (isTooNarrow) {
      report.tooFineCount++;
      const msg =
        `"${node.title}" may be too narrow — covers a single syntax detail, not a learnable concept ` +
        `(${node.estimatedMins}min).`;
      report.warnings.push(msg);
      report.violations.push({
        type: 'granularity_violation',
        severity: 'warning',
        affectedNodeIds: [node.id],
        affectedEdgeIds: [],
        description: msg,
        repair: {
          strategy: 'llm_rewrite',
          prompt:
            `"${node.title}" seems too granular for a curriculum node in a graph about "${graph.topic}".\n` +
            `Should it be merged into a broader concept, or removed?\n` +
            `Context: it's a prerequisite in this graph. Existing related nodes:\n` +
            graph.nodes
              .filter((n) => n.id !== node.id)
              .map((n) => `- "${n.title}" (${n.depthLevel})`)
              .join('\n') +
            `\nReturn: { action: "merge", intoNodeId: string } or { action: "remove" }`,
          targetNodeIds: [node.id],
        },
      });
    }

    // ── Too broad ─────────────────────────────────────────────────────────────
    const isTooBroad =
      node.estimatedMins >= TOO_BROAD_MIN_MINS ||
      TOO_BROAD_TITLE_PATTERN.test(node.title.trim());

    if (isTooBroad) {
      report.tooCoarseCount++;
      const msg =
        `"${node.title}" may be too broad — appears to cover an entire field ` +
        `(${node.estimatedMins}min).`;
      report.warnings.push(msg);
      report.violations.push({
        type: 'granularity_violation',
        severity: 'warning',
        affectedNodeIds: [node.id],
        affectedEdgeIds: [],
        description: msg,
        repair: {
          strategy: 'llm_rewrite',
          prompt:
            `"${node.title}" is too broad as a single curriculum node in a graph about "${graph.topic}".\n` +
            `What specific aspect of "${node.title}" is actually needed as a prerequisite here?\n` +
            `Split it into 1–3 specific, focused concept nodes.\n` +
            `Return: { newNodes: [{ title, description, depthLevel, estimatedMins, boundaryType }], ` +
            `replaceNodeId: "${node.id}" }`,
          targetNodeIds: [node.id],
        },
      });
    }
  }

  return { graph, report }; // no mutations — granularity is advisory
}
