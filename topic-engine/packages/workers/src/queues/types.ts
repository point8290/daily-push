// ─── Job data types for all 4 queues ─────────────────────────────────────────

/**
 * resource:discovery
 * Dispatched after pipeline: 1 job per non-out_of_scope node.
 * Worker (Phase 6): fetches + scores external learning resources for this concept.
 */
export interface ResourceDiscoveryJobData {
  topicId:         string;   // topics.id UUID
  nodeId:          string;   // concept_nodes.id UUID
  nodeSlug:        string;   // kebab-case LLM id, e.g. "event-loop"
  nodeTitle:       string;
  nodeDescription: string;
  depthLevel:      string;
}

/**
 * outcome:observer
 * Dispatched on 'skip' progress events with a 48-hour delay.
 * Worker (Phase 7): checks whether the user later succeeded at a dependent node,
 * then applies a Bayesian belief update to the prerequisite edge.
 */
export interface OutcomeObserverJobData {
  userId:       string;
  topicId:      string;   // topics.id UUID
  nodeId:       string;   // concept_nodes.id UUID for the skipped node
  nodeSlug:     string;
  skippedAt:    string;   // ISO timestamp
  learnerLevel: string | null;
}

/**
 * library:update
 * Dispatched after each successful decomposition.
 * Worker: loads the full graph from DB and calls writeBackGraph().
 * Threshold-gated: only writes concepts with confidence ≥ 0.55.
 */
export interface LibraryUpdateJobData {
  topicId:    string;   // topics.id UUID
  topicTitle: string;
}

/**
 * graph:recompute
 * Dispatched when an edge's accumulated belief crosses a reclassification threshold.
 * Worker (Phase 7): evaluates whether to promote, demote, or remove the edge.
 */
export interface GraphRecomputeJobData {
  edgeId:     string;   // concept_edges.id UUID
  fromNodeId: string;   // concept_nodes.id UUID
  toNodeId:   string;   // concept_nodes.id UUID
  reason:     'belief_threshold_crossed' | 'manual';
}

/**
 * behavior:analyze
 * Dispatched immediately (no delay) on non-skip user progress events.
 * Worker (Phase 7): detects stuck / fast-complete / revisit patterns and
 * applies Bayesian updates or flags issues accordingly.
 */
export interface BehaviorAnalyzeJobData {
  userId:       string;
  nodeId:       string;       // concept_nodes.id UUID
  nodeSlug:     string;
  topicId:      string;       // topics.id UUID
  eventType:    'complete' | 'stuck' | 'revisit';
  learnerLevel: string | null;
  context:      Record<string, unknown>;   // timeSpentMins, prereqsCompleted, etc.
}
