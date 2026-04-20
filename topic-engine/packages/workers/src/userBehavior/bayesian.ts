/**
 * Bayesian belief update logic for L6 User Behavior.
 *
 * Spec:
 *   belief += 0.08 × weight × (signal − belief)
 *   edge classification: ≥0.75 → hard, ≥0.45 → soft, ≥0.20 → leads_to, else → remove
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type LearnerLevel = 'beginner' | 'intermediate' | 'advanced';

export interface LevelBelief {
  belief:      number;   // 0–1
  sampleCount: number;
}

/** Shape of concept_edges.belief_by_level JSONB column */
export type BeliefByLevel = Partial<Record<LearnerLevel, LevelBelief>>;

// ─── Thresholds ───────────────────────────────────────────────────────────────

/** Belief values at which an edge changes type or is removed. */
export const BELIEF_THRESHOLDS = {
  hard_prerequisite: 0.75,
  soft_prerequisite: 0.45,
  leads_to:          0.20,
  // below leads_to threshold → edge should be removed
} as const;

/** Minimum accumulated evidence before each action is taken. */
export const MIN_EVIDENCE = {
  edge_type_reclassification: 12,
  time_estimate_update:        8,
  missing_prerequisite_flag:   5,
  remove_prerequisite_edge:   20,
} as const;

// ─── Core formula ─────────────────────────────────────────────────────────────

/**
 * Apply one Bayesian update step.
 *
 * @param current  Existing belief + sample count for this level
 * @param signal   0–1 (0 = relationship challenged, 1 = confirmed)
 * @param weight   Job-level weight (default 1.0; 1.5 for direct outcome observations)
 */
export function updateBelief(
  current: LevelBelief,
  signal:  number,
  weight:  number,
): LevelBelief {
  const delta = 0.08 * weight * (signal - current.belief);
  return {
    belief:      Math.min(1, Math.max(0, current.belief + delta)),
    sampleCount: current.sampleCount + 1,
  };
}

// ─── Aggregation helpers ──────────────────────────────────────────────────────

/** Weighted-average belief across all learner levels (weighted by sample count). */
export function averageBelief(byLevel: BeliefByLevel): number {
  const entries = Object.values(byLevel).filter((v): v is LevelBelief => v != null);
  if (entries.length === 0) return 0.5;   // prior — no data yet
  const totalCount = entries.reduce((s, e) => s + e.sampleCount, 0);
  if (totalCount === 0) return 0.5;
  return entries.reduce((s, e) => s + e.belief * e.sampleCount, 0) / totalCount;
}

/** Total evidence (sample count) across all learner levels. */
export function totalSamples(byLevel: BeliefByLevel): number {
  return Object.values(byLevel)
    .filter((v): v is LevelBelief => v != null)
    .reduce((s, e) => s + e.sampleCount, 0);
}

// ─── Edge classification ──────────────────────────────────────────────────────

export type ClassifiedEdgeType = 'hard_prerequisite' | 'soft_prerequisite' | 'leads_to' | null;

/**
 * Determine the edge type implied by a given belief value.
 * Returns null when belief < 0.20 — the edge should be removed/deprecated.
 */
export function classifyEdgeFromBelief(belief: number): ClassifiedEdgeType {
  if (belief >= BELIEF_THRESHOLDS.hard_prerequisite) return 'hard_prerequisite';
  if (belief >= BELIEF_THRESHOLDS.soft_prerequisite) return 'soft_prerequisite';
  if (belief >= BELIEF_THRESHOLDS.leads_to)          return 'leads_to';
  return null;
}

/**
 * Returns true if the total evidence crosses a minimum threshold AND
 * the implied edge type differs from the current one — i.e. reclassification is warranted.
 */
export function shouldReclassify(
  byLevel:     BeliefByLevel,
  currentType: string,
): boolean {
  const samples = totalSamples(byLevel);
  if (samples < MIN_EVIDENCE.edge_type_reclassification) return false;
  const implied = classifyEdgeFromBelief(averageBelief(byLevel));
  return implied !== currentType;
}

/**
 * Returns true if the edge should be removed (belief < threshold AND enough evidence).
 */
export function shouldRemoveEdge(byLevel: BeliefByLevel): boolean {
  const samples = totalSamples(byLevel);
  if (samples < MIN_EVIDENCE.remove_prerequisite_edge) return false;
  return classifyEdgeFromBelief(averageBelief(byLevel)) === null;
}
