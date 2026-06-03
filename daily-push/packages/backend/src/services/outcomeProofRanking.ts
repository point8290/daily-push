import {
  type OperatorOutcomeCalibrationRoleItem,
  type OutcomeCalibrationMetricStatus,
  type ProofRecommendation,
  type ProofTaskType,
} from '@daily-push/shared';
import { getOperatorOutcomeCalibrationResponse } from './operatorOutcomeCalibration';

const OUTCOME_RANKING_WINDOW_DAYS = 90;
const OUTCOME_RANKING_ROLE_LIMIT = 200;
const MAX_OUTCOME_BOOST = 12;
const BASELINE_POSITION_WEIGHT = 4;

export interface OutcomeProofRankingResult {
  recommendations: ProofRecommendation[];
  applied: boolean;
  explanation: string;
}

function metricByKey(
  role: OperatorOutcomeCalibrationRoleItem,
  key: string,
): OutcomeCalibrationMetricStatus | null {
  return role.metrics.find((metric) => metric.metricKey === key && metric.thresholdMet) ?? null;
}

function normalizedPositiveMetric(metric: OutcomeCalibrationMetricStatus | null): number {
  if (!metric || typeof metric.value !== 'number') return 0;
  if (metric.unit === 'score_delta') return Math.max(0, Math.min(1, metric.value / 20));
  if (metric.unit === 'score') return Math.max(0, Math.min(1, (metric.value - 3) / 2));
  return Math.max(0, Math.min(1, metric.value));
}

function boostForTaskType(
  taskType: ProofTaskType,
  metrics: {
    reassessmentDelta: number;
    sprintCompletion: number;
    readinessToUpgrade: number;
    feedbackScore: number;
  },
): number {
  const proofWorkScore =
    (metrics.reassessmentDelta * 6) +
    (metrics.sprintCompletion * 4) +
    (metrics.readinessToUpgrade * 2);
  const feedbackScore = metrics.feedbackScore * 4;
  const byType: Record<ProofTaskType, number> = {
    project: proofWorkScore,
    case_study: proofWorkScore * 0.9,
    portfolio_artifact: proofWorkScore * 0.8,
    resume_rewrite: feedbackScore + metrics.readinessToUpgrade,
    interview_story: feedbackScore + (metrics.reassessmentDelta * 2),
    learning_module: Math.max(metrics.reassessmentDelta * 2, metrics.feedbackScore),
  };

  return Math.min(MAX_OUTCOME_BOOST, byType[taskType] ?? 0);
}

export function rankProofRecommendationsWithOutcomeSignals(
  recommendations: ProofRecommendation[],
  calibration: OperatorOutcomeCalibrationRoleItem | null,
): OutcomeProofRankingResult {
  if (!calibration) {
    return {
      recommendations,
      applied: false,
      explanation: 'No outcome calibration aggregate exists for this role, so deterministic proof ranking was used.',
    };
  }

  if (!calibration.canInfluenceProofRecommendationRanking) {
    return {
      recommendations,
      applied: false,
      explanation: 'Outcome samples have not met the proof-ranking threshold, so deterministic proof ranking was used.',
    };
  }

  const metrics = {
    reassessmentDelta: normalizedPositiveMetric(metricByKey(calibration, 'readiness_score_delta')),
    sprintCompletion: normalizedPositiveMetric(metricByKey(calibration, 'sprint_completion_rate')),
    readinessToUpgrade: normalizedPositiveMetric(metricByKey(calibration, 'readiness_to_upgrade_rate')),
    feedbackScore: normalizedPositiveMetric(metricByKey(calibration, 'pilot_feedback_score')),
  };

  const hasUsefulSignal = Object.values(metrics).some((value) => value > 0);
  if (!hasUsefulSignal) {
    return {
      recommendations,
      applied: false,
      explanation: 'Outcome calibration has no positive proof-ranking signal, so deterministic proof ranking was used.',
    };
  }

  const ranked = recommendations
    .map((recommendation, index) => {
      const baselineScore = (recommendations.length - index) * BASELINE_POSITION_WEIGHT;
      const outcomeBoost = boostForTaskType(recommendation.type, metrics);
      return {
        recommendation,
        index,
        score: baselineScore + outcomeBoost,
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.index - b.index;
    })
    .map((item) => item.recommendation);

  const orderChanged = ranked.some((item, index) => item.id !== recommendations[index]?.id);
  return {
    recommendations: ranked,
    applied: orderChanged,
    explanation: orderChanged
      ? 'Aggregate outcome signals nudged proof task ordering while preserving deterministic task shape.'
      : 'Outcome signals were available, but deterministic proof ordering already matched the bounded ranking.',
  };
}

export async function getProofRankingCalibrationForRole(
  roleProfileId: string,
): Promise<OperatorOutcomeCalibrationRoleItem | null> {
  const response = await getOperatorOutcomeCalibrationResponse({
    windowDays: OUTCOME_RANKING_WINDOW_DAYS,
    limit: OUTCOME_RANKING_ROLE_LIMIT,
  });
  return response.roles.find((role) => role.roleProfileId === roleProfileId) ?? null;
}

