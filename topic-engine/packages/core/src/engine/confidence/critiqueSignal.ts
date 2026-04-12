import type { CritiqueRound } from '../steps/critiqueAndPatch';

/**
 * Derives a graph-level confidence signal from the critique-refine rounds.
 *
 * CritiqueRound is graph-level (not per-node), so we apply the same signal
 * to all nodes/edges as a prior.
 *
 * Signal formula:
 *   base = quality_base - per_issue_penalty
 *   quality_base: good=0.90, needs_work=0.70, poor=0.50
 *   per_issue_penalty: min(0.20, issueCount × 0.025)
 *
 * We use the LAST round's quality — if the loop ran twice it means
 * round 1 had critical issues; the round 2 result is what matters.
 *
 * Returns a value in [0.30, 0.90].
 */
export function extractCritiqueSignal(rounds: CritiqueRound[]): number {
  if (rounds.length === 0) {
    // No critique ran (skipped) — moderate confidence
    return 0.70;
  }

  const lastRound = rounds[rounds.length - 1];

  const qualityBase =
    lastRound.quality === 'good'       ? 0.90 :
    lastRound.quality === 'needs_work' ? 0.70 :
    /* 'poor' */                         0.50;

  const issuePenalty = Math.min(0.20, lastRound.issueCount * 0.025);

  return Math.max(0.30, qualityBase - issuePenalty);
}
