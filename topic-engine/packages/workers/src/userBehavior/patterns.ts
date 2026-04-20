/**
 * Pattern detection — queries event history to detect the 5 L6 user behavior patterns.
 *
 * Pattern table (from spec):
 *   skip → success at dependent  →  hard prereq challenged  (signal = 0, delta ≈ −0.06)
 *   skip → failure at dependent  →  hard prereq confirmed   (signal = 1, delta ≈ +0.09)
 *   stuck despite all prereqs    →  flag missing prereq
 *   complete in < 40% est. time  →  time overestimate → update estimatedMins
 *   revisit after completion     →  candidate leads_to edge (needs N=12)
 */
import { query } from '@topic-engine/db';

// ─── Pattern 1 & 2: skip outcomes ────────────────────────────────────────────

export interface SkipOutcome {
  edgeId:      string;     // concept_edges.id
  fromNodeId:  string;     // the skipped node (prerequisite)
  toNodeId:    string;     // dependent node
  edgeType:    string;
  /** signal=0 → prereq challenged (user succeeded without it) */
  /** signal=1 → prereq confirmed  (user got stuck without it) */
  signal:      0 | 1;
}

/**
 * 48 hours after a skip event, look at whether the user attempted dependent
 * nodes and what happened. Returns one outcome per edge where we have evidence.
 */
export async function detectSkipOutcomes(
  userId:      string,
  nodeId:      string,   // the skipped node
  skippedAt:   string,   // ISO timestamp
): Promise<SkipOutcome[]> {
  // Find all edges where nodeId is the prerequisite (from_node_id = nodeId)
  const edges = await query<{
    id:          string;
    from_node_id: string;
    to_node_id:   string;
    edge_type:    string;
  }>(
    `SELECT id, from_node_id, to_node_id, edge_type
     FROM concept_edges
     WHERE from_node_id = $1
       AND edge_type IN ('hard_prerequisite', 'soft_prerequisite')
       AND status = 'active'`,
    [nodeId],
  );

  if (edges.length === 0) return [];

  const toNodeIds = edges.map((e) => e.to_node_id);

  // Check if user had events on dependent nodes after the skip
  const dependentEvents = await query<{
    node_id:    string;
    event_type: string;
    weight:     number;
  }>(
    `SELECT node_id, event_type, weight
     FROM user_behavior_events
     WHERE user_id = $1
       AND node_id = ANY($2::uuid[])
       AND created_at > $3::timestamptz
     ORDER BY created_at ASC`,
    [userId, toNodeIds, skippedAt],
  );

  const outcomes: SkipOutcome[] = [];

  for (const edge of edges) {
    const events = dependentEvents.filter((e) => e.node_id === edge.to_node_id);
    if (events.length === 0) continue;   // no data — skip this edge

    // 'complete' → user succeeded without the prereq → signal=0 (challenged)
    // 'stuck'    → user hit difficulty → signal=1 (confirmed)
    const hasComplete = events.some((e) => e.event_type === 'complete');
    const hasStuck    = events.some((e) => e.event_type === 'stuck');

    if (hasComplete) {
      outcomes.push({ edgeId: edge.id, fromNodeId: edge.from_node_id, toNodeId: edge.to_node_id, edgeType: edge.edge_type, signal: 0 });
    } else if (hasStuck) {
      outcomes.push({ edgeId: edge.id, fromNodeId: edge.from_node_id, toNodeId: edge.to_node_id, edgeType: edge.edge_type, signal: 1 });
    }
  }

  return outcomes;
}

// ─── Pattern 3: stuck despite all prereqs ────────────────────────────────────

export interface StuckAnalysis {
  /** True if user has completed all known prerequisites for this node */
  allPrereqsCompleted: boolean;
  /** Number of 'stuck' events on this node across all users recently */
  recentStuckCount: number;
  /** Whether the stuck count has crossed the minimum evidence threshold (5) */
  shouldFlagMissingPrereq: boolean;
  /** Node IDs the user has completed — context for LLM investigation */
  completedNodeIds: string[];
}

export async function detectStuckPattern(
  userId:  string,
  nodeId:  string,
): Promise<StuckAnalysis> {
  // Find all hard/soft prerequisite edges pointing to this node
  const prereqEdges = await query<{ from_node_id: string }>(
    `SELECT from_node_id FROM concept_edges
     WHERE to_node_id = $1
       AND edge_type IN ('hard_prerequisite', 'soft_prerequisite')
       AND status = 'active'`,
    [nodeId],
  );

  const prereqNodeIds = prereqEdges.map((e) => e.from_node_id);

  // Check which prerequisites this user has completed
  let completedPrereqIds: string[] = [];
  if (prereqNodeIds.length > 0) {
    const completions = await query<{ node_id: string }>(
      `SELECT DISTINCT node_id FROM user_behavior_events
       WHERE user_id = $1
         AND node_id = ANY($2::uuid[])
         AND event_type = 'complete'`,
      [userId, prereqNodeIds],
    );
    completedPrereqIds = completions.map((r) => r.node_id);
  }

  const allPrereqsCompleted =
    prereqNodeIds.length === 0 ||
    prereqNodeIds.every((id) => completedPrereqIds.includes(id));

  // Count recent stuck events on this node across all users (30-day window)
  const stuckResult = await query<{ cnt: string }>(
    `SELECT COUNT(*) AS cnt FROM user_behavior_events
     WHERE node_id = $1
       AND event_type = 'stuck'
       AND created_at > NOW() - INTERVAL '30 days'`,
    [nodeId],
  );
  const recentStuckCount = parseInt(stuckResult[0]?.cnt ?? '0', 10);

  // Get all node IDs this user has completed (context for LLM investigation)
  const allCompleted = await query<{ node_id: string }>(
    `SELECT DISTINCT node_id FROM user_behavior_events
     WHERE user_id = $1 AND event_type = 'complete'`,
    [userId],
  );

  return {
    allPrereqsCompleted,
    recentStuckCount,
    shouldFlagMissingPrereq: allPrereqsCompleted && recentStuckCount >= 5,
    completedNodeIds: allCompleted.map((r) => r.node_id),
  };
}

// ─── Pattern 4: complete in < 40% estimated time ─────────────────────────────

export interface TimeOverestimateAnalysis {
  estimatedMins:      number;
  actualMins:         number | null;
  isUnderestimate:    boolean;
  fastCompletionCount: number;   // how many users completed this fast
  shouldUpdateTime:   boolean;   // true if fastCompletionCount >= 8
  suggestedMins:      number | null;   // median actual time across fast completions
}

export async function detectTimeOverestimate(
  nodeId:      string,
  contextJson: Record<string, unknown>,
): Promise<TimeOverestimateAnalysis> {
  const nodeRow = await query<{ estimated_mins: number }>(
    `SELECT estimated_mins FROM concept_nodes WHERE id = $1`,
    [nodeId],
  );
  const estimatedMins = nodeRow[0]?.estimated_mins ?? 0;
  const actualMins = typeof contextJson['timeSpentMins'] === 'number'
    ? (contextJson['timeSpentMins'] as number)
    : null;

  const threshold = estimatedMins * 0.4;
  const isUnderestimate = actualMins !== null && actualMins < threshold;

  // Count completions across all users where time < 40% of estimated
  const fastRows = await query<{ cnt: string; median_mins: number }>(
    `SELECT COUNT(*) AS cnt,
            PERCENTILE_CONT(0.5) WITHIN GROUP (
              ORDER BY (context->>'timeSpentMins')::float
            ) AS median_mins
     FROM user_behavior_events
     WHERE node_id = $1
       AND event_type = 'complete'
       AND (context->>'timeSpentMins')::float IS NOT NULL
       AND (context->>'timeSpentMins')::float < $2`,
    [nodeId, threshold],
  );

  const fastCompletionCount = parseInt(fastRows[0]?.cnt ?? '0', 10);
  const suggestedMins = fastCompletionCount >= 8
    ? Math.max(1, Math.round(fastRows[0]?.median_mins ?? estimatedMins))
    : null;

  return {
    estimatedMins,
    actualMins,
    isUnderestimate,
    fastCompletionCount,
    shouldUpdateTime: fastCompletionCount >= 8,
    suggestedMins,
  };
}

// ─── Pattern 5: revisit after completion ─────────────────────────────────────

export interface RevisitAnalysis {
  /** How many distinct users have revisited this node after completing it */
  revisitCount: number;
  /** Whether this pattern is significant enough to flag a candidate leads_to edge */
  shouldFlagCandidateEdge: boolean;
}

export async function detectRevisitPattern(nodeId: string): Promise<RevisitAnalysis> {
  // Count distinct users who revisited this node after completing it
  const result = await query<{ cnt: string }>(
    `SELECT COUNT(DISTINCT r.user_id) AS cnt
     FROM user_behavior_events r
     JOIN user_behavior_events c ON c.user_id = r.user_id AND c.node_id = r.node_id
     WHERE r.node_id = $1
       AND r.event_type = 'revisit'
       AND c.event_type = 'complete'
       AND c.created_at < r.created_at`,
    [nodeId],
  );

  const revisitCount = parseInt(result[0]?.cnt ?? '0', 10);

  return {
    revisitCount,
    shouldFlagCandidateEdge: revisitCount >= 12,
  };
}
