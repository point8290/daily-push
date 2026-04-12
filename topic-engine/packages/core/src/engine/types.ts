import { z } from 'zod';

// ─── Domain primitives ────────────────────────────────────────────────────────

export const DepthLevelSchema = z.enum([
  'surface',
  'foundational',
  'intermediate',
  'advanced',
  'expert',
]);
export type DepthLevel = z.infer<typeof DepthLevelSchema>;

export const BoundaryTypeSchema = z.enum([
  'core',
  'optional_depth',
  'out_of_scope',
]);
export type BoundaryType = z.infer<typeof BoundaryTypeSchema>;

export const EdgeTypeSchema = z.enum([
  'hard_prerequisite', // cannot understand toId without fromId
  'soft_prerequisite', // fromId makes toId easier but not strictly required
  'confusable',        // learners routinely conflate these two concepts
  'leads_to',          // understanding fromId deepens understanding of toId
]);
export type EdgeType = z.infer<typeof EdgeTypeSchema>;

// ─── L4 Confidence types ──────────────────────────────────────────────────────

export interface NodeConfidence {
  /** Does this concept belong in this graph? */
  existence: number;
  /** Is the depth classification correct? */
  depthLevel: number;
  /** Is core/optional_depth/out_of_scope correct? */
  boundary: number;
  /** Is estimatedMins plausible for this depth? */
  timeEstimate: number;
  /** Weighted combination of all dimensions */
  overall: number;
  /** overall × propagated from weakest hard_prerequisite chain */
  effective: number;
}

export interface EdgeConfidence {
  /** Does this relationship genuinely exist? */
  existence: number;
  /** Is hard/soft/confusable/leads_to the right type? */
  type: number;
  /** Is fromId→toId the correct direction? */
  direction: number;
  /** Weighted combination */
  overall: number;
}

export interface DisagreementRecord {
  conceptTitle: string;
  disagreementType: 'existence' | 'depth_level' | 'boundary' | 'edge_direction' | 'edge_type';
  runAPosition: string;
  runBPosition: string;
}

export interface ConfidenceResult {
  disagreements: DisagreementRecord[];
  /** Node IDs below 0.20 overall — removed from the returned graph */
  discardedNodeIds: string[];
}

// ─── Graph nodes & edges ──────────────────────────────────────────────────────

export const ConceptNodeSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  depthLevel: DepthLevelSchema,
  boundaryType: BoundaryTypeSchema,
  estimatedMins: z.number().int().positive(),
});
// confidence is optional — populated by L4 after graph is finalised
export type ConceptNode = z.infer<typeof ConceptNodeSchema> & { confidence?: NodeConfidence };

export const ConceptEdgeSchema = z.object({
  id: z.string().min(1),
  fromId: z.string().min(1), // prerequisite concept
  toId: z.string().min(1),   // dependent concept
  type: EdgeTypeSchema,
});
// confidence is optional — populated by L4 after graph is finalised
export type ConceptEdge = z.infer<typeof ConceptEdgeSchema> & { confidence?: EdgeConfidence };

// Raw graph as produced by the LLM — no metadata yet
export const ConceptGraphSchema = z.object({
  nodes: z.array(ConceptNodeSchema).min(1),
  edges: z.array(ConceptEdgeSchema),
});
export type ConceptGraph = z.infer<typeof ConceptGraphSchema> & {
  topic: string;
  createdAt?: Date;
};

// ─── User context ─────────────────────────────────────────────────────────────

export const LearnerLevelSchema = z.enum(['beginner', 'intermediate', 'advanced']);
export type LearnerLevel = z.infer<typeof LearnerLevelSchema>;

export const LearnerGoalSchema = z.enum([
  'understand',     // build a clear mental model
  'gap_fill',       // I use this but have specific gaps
  'interview_prep', // need to explain it clearly under pressure
  'deep_dive',      // want internals and edge cases
  'teach',          // building teaching material
]);
export type LearnerGoal = z.infer<typeof LearnerGoalSchema>;

export const UserContextSchema = z.object({
  rawInput: z.string(),
  level: LearnerLevelSchema.nullable().optional(),
  goal: LearnerGoalSchema.nullable().optional(),
  specificGap: z.string().nullable().optional(),
  needsQuiz: z.boolean().optional(),
});
export type UserContext = z.infer<typeof UserContextSchema>;

// ─── Pipeline context (passed through each step) ──────────────────────────────

export interface PipelineContext {
  topic: string;
  userContext: UserContext;
  graph?: ConceptGraph;
  // Populated by later layers
  analytics?: GraphAnalytics;
}

// ─── Topology analytics (populated by Layer 7) ────────────────────────────────

export interface LearningPath {
  nodes: ConceptNode[];
  totalMins: number;
  mode: 'fast_track' | 'thorough';
}

export interface Community {
  id: string;
  label: string;
  nodeIds: string[];
  depthRange: { min: DepthLevel; max: DepthLevel };
}

export interface GraphAnalytics {
  centrality: Record<string, number>;        // nodeId → betweenness score 0-1
  communities: Community[];
  criticalPath: string[];                    // ordered node IDs
  criticalPathMins: number;
  totalMins: number;
  fastTrack: LearningPath;
  thoroughTrack: LearningPath;
  nodeFeatures: Record<string, {
    centrality: number;
    communityId: string;
    unlocksCount: number;
    isOnCriticalPath: boolean;
    distanceFromRoot: number;
  }>;
}

// ─── Structural Validation types ─────────────────────────────────────────────

export type ViolationType =
  | 'cycle'
  | 'orphaned_node'
  | 'depth_inversion'
  | 'time_implausibility'
  | 'redundant_edge'
  | 'disconnected_subgraph'
  | 'granularity_violation';

export type RepairAction =
  | { strategy: 'remove_edge';     edgeId: string }
  | { strategy: 'remove_node';     nodeId: string }
  | { strategy: 'adjust_depth';    nodeId: string; newDepth: DepthLevel }
  | { strategy: 'adjust_time';     nodeId: string; newMins: number }
  | { strategy: 'add_edge';        from: string; to: string; type: EdgeType }
  | { strategy: 'merge_nodes';     nodeIdA: string; nodeIdB: string }
  | { strategy: 'reclassify_edge'; edgeId: string; newType: EdgeType }
  | { strategy: 'llm_rewrite';     prompt: string; targetNodeIds: string[] }
  | { strategy: 'flag';            reason: string };

export interface Violation {
  type: ViolationType;
  severity: 'error' | 'warning' | 'info';
  affectedNodeIds: string[];
  affectedEdgeIds: string[];
  description: string;
  repair: RepairAction;
}

export interface StructuralValidationResult {
  /** True only if no error-severity violations remain after repair */
  valid: boolean;
  violations: Violation[];
  repairedGraph: ConceptGraph;
  /** True if any violation needs an LLM call to fully resolve */
  requiresLLM: boolean;
  /** Flattened warning strings — backward compat with pipeline */
  warnings: string[];
  stats: {
    cyclesRepaired: number;
    orphansRemoved: number;
    depthInversionsFixed: number;
    timingsPatched: number;
    transitiveEdgesRemoved: number;
    granularityWarnings: number;
    disconnectedFixed: number;
  };
}

// ─── Depth ordering (used by validators + topology) ───────────────────────────

export const DEPTH_ORDER: Record<DepthLevel, number> = {
  surface:       1,
  foundational:  2,
  intermediate:  3,
  advanced:      4,
  expert:        5,
};

export const PLAUSIBLE_TIME_RANGES: Record<
  DepthLevel,
  { min: number; max: number; median: number }
> = {
  surface:       { min: 5,  max: 20,  median: 10 },
  foundational:  { min: 15, max: 45,  median: 25 },
  intermediate:  { min: 25, max: 75,  median: 40 },
  advanced:      { min: 40, max: 120, median: 60 },
  expert:        { min: 60, max: 180, median: 90 },
};
