import type { RunResult } from '../packages/core/src/engine/pipeline';

export interface GroundTruth {
  id: string;
  topic: string;
  userInput: string;
  expectedIntent: {
    level?: string;
    goal?: string;
  };
  mustIncludeNodes: string[];
  mustIncludeEdgeTypes: string[];
  graphAssertions: {
    minNodes: number;
    maxNodes: number;
    mustBeDAG: boolean;
    rootNodeId: string;
    coreNodesMustHaveInboundEdges: boolean;
  };
  validators: {
    noCycles: boolean;
    noOrphans: boolean;
    noDepthInversions: boolean;
    timingsPlausible: boolean;
  };
}

export interface ScoreBreakdown {
  total: number;          // 0–100
  intentScore: number;    // 0–20
  nodeScore: number;      // 0–30 (coverage of mustIncludeNodes)
  edgeTypeScore: number;  // 0–10 (coverage of mustIncludeEdgeTypes)
  graphScore: number;     // 0–20 (assertion checks)
  validationScore: number; // 0–20 (no warnings from validator)
  passed: boolean;
  failures: string[];
}

/**
 * Scores a RunResult against a ground-truth fixture.
 * Returns a 0–100 score with a breakdown.
 */
export function score(result: RunResult, gt: GroundTruth): ScoreBreakdown {
  const failures: string[] = [];
  let intentScore = 0;
  let nodeScore = 0;
  let edgeTypeScore = 0;
  let graphScore = 0;
  let validationScore = 0;

  // ── Intent (20 pts) ───────────────────────────────────────────────────────
  if (gt.expectedIntent.level) {
    if (result.intent.level === gt.expectedIntent.level) {
      intentScore += 10;
    } else {
      failures.push(`Intent level: expected "${gt.expectedIntent.level}", got "${result.intent.level}"`);
    }
  } else {
    intentScore += 10; // no expectation — full credit
  }

  if (gt.expectedIntent.goal) {
    if (result.intent.goal === gt.expectedIntent.goal) {
      intentScore += 10;
    } else {
      failures.push(`Intent goal: expected "${gt.expectedIntent.goal}", got "${result.intent.goal}"`);
    }
  } else {
    intentScore += 10;
  }

  // ── Node coverage (30 pts) ────────────────────────────────────────────────
  const nodeIds = new Set(result.graph.nodes.map((n) => n.id));
  // Fuzzy match: any segment of the required ID appears in any actual node ID (and vice versa).
  // "microtask" matches "microtask-queue"; "vector" matches "vector-database".
  const fuzzyNodeMatch = (required: string): boolean => {
    if (nodeIds.has(required)) return true;
    const reqParts = required.split('-');
    for (const id of nodeIds) {
      if (id.includes(required) || required.includes(id)) return true;
      // Any segment of required matches any segment of id
      const idParts = id.split('-');
      if (reqParts.some((rp) => idParts.some((ip) => ip === rp && rp.length > 3))) return true;
    }
    return false;
  };
  const matchedNodes = gt.mustIncludeNodes.filter(fuzzyNodeMatch);
  nodeScore = Math.round((matchedNodes.length / Math.max(gt.mustIncludeNodes.length, 1)) * 30);
  if (matchedNodes.length < gt.mustIncludeNodes.length) {
    const missed = gt.mustIncludeNodes.filter((n) => !matchedNodes.includes(n));
    failures.push(`Missing expected nodes: ${missed.join(', ')}`);
  }

  // ── Edge type coverage (10 pts) ───────────────────────────────────────────
  const edgeTypes = new Set(result.graph.edges.map((e) => e.type));
  const matchedEdgeTypes = gt.mustIncludeEdgeTypes.filter((t) => edgeTypes.has(t as never));
  edgeTypeScore = Math.round(
    (matchedEdgeTypes.length / Math.max(gt.mustIncludeEdgeTypes.length, 1)) * 10
  );
  if (matchedEdgeTypes.length < gt.mustIncludeEdgeTypes.length) {
    const missed = gt.mustIncludeEdgeTypes.filter((t) => !matchedEdgeTypes.includes(t));
    failures.push(`Missing edge types: ${missed.join(', ')}`);
  }

  // ── Graph assertions (20 pts, 5 pts each) ────────────────────────────────
  const { nodes, edges } = result.graph;
  const ga = gt.graphAssertions;

  if (nodes.length >= ga.minNodes && nodes.length <= ga.maxNodes) {
    graphScore += 5;
  } else {
    failures.push(
      `Node count ${nodes.length} outside expected [${ga.minNodes}–${ga.maxNodes}]`
    );
  }

  // Root node exists (fuzzy)
  const rootExists =
    nodeIds.has(ga.rootNodeId) ||
    [...nodeIds].some((id) => id.includes(ga.rootNodeId) || ga.rootNodeId.includes(id));
  if (rootExists) {
    graphScore += 5;
  } else {
    failures.push(`Root node "${ga.rootNodeId}" not found in graph`);
  }

  // Is DAG (no cycles — validated already, but check warnings)
  const cycleWarnings = result.warnings.filter((w) => w.toLowerCase().includes('cycle'));
  if (ga.mustBeDAG && cycleWarnings.length === 0) {
    graphScore += 5;
  } else if (ga.mustBeDAG) {
    failures.push(`Graph had cycles that needed repair: ${cycleWarnings.length} cycle(s)`);
  } else {
    graphScore += 5;
  }

  // Core nodes have inbound edges
  if (ga.coreNodesMustHaveInboundEdges) {
    const inbound = new Set(edges.map((e) => e.toId));
    const coreNodes = nodes.filter((n) => n.boundaryType === 'core');
    const allCoreHaveInbound = coreNodes.every((n) => inbound.has(n.id));
    if (allCoreHaveInbound) {
      graphScore += 5;
    } else {
      const missing = coreNodes.filter((n) => !inbound.has(n.id)).map((n) => n.id);
      failures.push(`Core nodes without inbound edges: ${missing.join(', ')}`);
    }
  } else {
    graphScore += 5;
  }

  // ── Validation score (20 pts) ─────────────────────────────────────────────
  // Fewer warnings = higher score
  const warningCount = result.warnings.length;
  if (warningCount === 0) {
    validationScore = 20;
  } else if (warningCount <= 2) {
    validationScore = 15;
  } else if (warningCount <= 5) {
    validationScore = 10;
  } else {
    validationScore = 5;
    failures.push(`${warningCount} validation warnings — graph needed significant repair`);
  }

  const total = intentScore + nodeScore + edgeTypeScore + graphScore + validationScore;

  return {
    total,
    intentScore,
    nodeScore,
    edgeTypeScore,
    graphScore,
    validationScore,
    passed: total >= 70 && failures.length <= 2,
    failures,
  };
}
