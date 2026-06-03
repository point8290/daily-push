import {
  OUTCOME_SIGNAL_MIN_SAMPLE_THRESHOLDS,
  OUTCOME_SIGNAL_PRIVATE_FIELD_DENYLIST,
  assertValidOperatorOutcomeCalibrationResponse,
  evaluateOutcomeSignalScope,
  roleMarketProfileFixtures,
  type ContractMeta,
  type OperatorOutcomeCalibrationResponse,
  type OperatorOutcomeCalibrationRoleItem,
  type OutcomeCalibrationMetricStatus,
  type OutcomeSignalInfluenceScope,
  type OutcomeSignalMetric,
  type OutcomeSignalMetricKey,
  type OutcomeSignalMetricUnit,
  type OutcomeSignalSourceBreakdown,
  type OutcomeSignalSourceType,
  type PrivacySafeOutcomeSignalAggregate,
  type RoleCategory,
  type RoleMarketProfile,
} from '@daily-push/shared';
import { config } from '../config';
import { pool } from '../db/postgres';

interface GetOperatorOutcomeCalibrationOptions {
  windowDays?: number;
  limit?: number;
}

interface OutcomeCalibrationRow {
  role_profile_id: string;
  target_role_saves: string | number | null;
  target_role_users: string | number | null;
  readiness_target_count: string | number | null;
  readiness_reports: string | number | null;
  readiness_users: string | number | null;
  upgrade_target_count: string | number | null;
  upgrade_plans: string | number | null;
  upgrade_users: string | number | null;
  linked_sprints: string | number | null;
  completed_sprints: string | number | null;
  sprint_users: string | number | null;
  reassessment_pairs: string | number | null;
  avg_reassessment_delta: string | number | null;
  reassessment_users: string | number | null;
  application_outcomes: string | number | null;
  positive_application_outcomes: string | number | null;
  application_users: string | number | null;
  feedback_count: string | number | null;
  feedback_users: string | number | null;
  avg_feedback_score: string | number | null;
  unique_users: string | number | null;
}

interface NumericOutcomeCalibrationRow {
  roleProfileId: string;
  targetRoleSaves: number;
  targetRoleUsers: number;
  readinessTargetCount: number;
  readinessReports: number;
  readinessUsers: number;
  upgradeTargetCount: number;
  upgradePlans: number;
  upgradeUsers: number;
  linkedSprints: number;
  completedSprints: number;
  sprintUsers: number;
  reassessmentPairs: number;
  avgReassessmentDelta: number | null;
  reassessmentUsers: number;
  applicationOutcomes: number;
  positiveApplicationOutcomes: number;
  applicationUsers: number;
  feedbackCount: number;
  feedbackUsers: number;
  avgFeedbackScore: number | null;
  uniqueUsers: number;
}

function buildMeta(): ContractMeta {
  return {
    contractVersion: 'role-market.v1',
    generatedAt: new Date().toISOString(),
    sourceMode: config.roleMarket.sourceMode,
    seedVersion: config.roleMarket.seedVersion,
    warnings: [],
  };
}

function toInt(value: string | number | null | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : 0;
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toFloat(value: string | number | null | undefined): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function round(value: number | null, digits = 2): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function rate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return round(numerator / denominator, 4);
}

function confidenceFromSample(sampleSize: number): number {
  return round(Math.min(0.9, 0.45 + sampleSize / 200), 2) ?? 0.45;
}

function numericRow(row: OutcomeCalibrationRow): NumericOutcomeCalibrationRow {
  return {
    roleProfileId: row.role_profile_id,
    targetRoleSaves: toInt(row.target_role_saves),
    targetRoleUsers: toInt(row.target_role_users),
    readinessTargetCount: toInt(row.readiness_target_count),
    readinessReports: toInt(row.readiness_reports),
    readinessUsers: toInt(row.readiness_users),
    upgradeTargetCount: toInt(row.upgrade_target_count),
    upgradePlans: toInt(row.upgrade_plans),
    upgradeUsers: toInt(row.upgrade_users),
    linkedSprints: toInt(row.linked_sprints),
    completedSprints: toInt(row.completed_sprints),
    sprintUsers: toInt(row.sprint_users),
    reassessmentPairs: toInt(row.reassessment_pairs),
    avgReassessmentDelta: round(toFloat(row.avg_reassessment_delta), 2),
    reassessmentUsers: toInt(row.reassessment_users),
    applicationOutcomes: toInt(row.application_outcomes),
    positiveApplicationOutcomes: toInt(row.positive_application_outcomes),
    applicationUsers: toInt(row.application_users),
    feedbackCount: toInt(row.feedback_count),
    feedbackUsers: toInt(row.feedback_users),
    avgFeedbackScore: round(toFloat(row.avg_feedback_score), 2),
    uniqueUsers: toInt(row.unique_users),
  };
}

function profilesById(profiles: RoleMarketProfile[]): Map<string, RoleMarketProfile> {
  return new Map(profiles.map((profile) => [profile.id, profile]));
}

function metricStatus(params: {
  metricKey: OutcomeSignalMetricKey;
  label: string;
  value: number | null;
  unit: OutcomeSignalMetricUnit;
  sampleSize: number;
  uniqueUserCount: number;
  sourceEventCount: number;
  thresholdMet: boolean;
  influenceScopes: OutcomeSignalInfluenceScope[];
  explanation: string;
  unavailableReason?: string | null;
}): OutcomeCalibrationMetricStatus {
  return {
    metricKey: params.metricKey,
    label: params.label,
    value: params.value,
    unit: params.unit,
    sampleSize: params.sampleSize,
    uniqueUserCount: params.uniqueUserCount,
    sourceEventCount: params.sourceEventCount,
    thresholdMet: params.thresholdMet,
    influenceScopes: params.influenceScopes,
    explanation: params.explanation,
    unavailableReason: params.unavailableReason ?? null,
  };
}

function buildMetricStatuses(
  row: NumericOutcomeCalibrationRow | null,
  internalThresholdMet: boolean,
): OutcomeCalibrationMetricStatus[] {
  if (!row) {
    return [
      metricStatus({
        metricKey: 'save_to_readiness_rate',
        label: 'Saved role to readiness report',
        value: null,
        unit: 'rate',
        sampleSize: 0,
        uniqueUserCount: 0,
        sourceEventCount: 0,
        thresholdMet: false,
        influenceScopes: [],
        explanation: 'No saved target-role outcome data exists in the selected window.',
        unavailableReason: 'No target role saves are available for this role.',
      }),
      metricStatus({
        metricKey: 'application_callback_rate',
        label: 'Application outcome rate',
        value: null,
        unit: 'rate',
        sampleSize: 0,
        uniqueUserCount: 0,
        sourceEventCount: 0,
        thresholdMet: false,
        influenceScopes: [],
        explanation: 'Application outcomes will appear after users record application results.',
        unavailableReason: 'No application outcome events are available for this role.',
      }),
    ];
  }

  const internalScopes: OutcomeSignalInfluenceScope[] = internalThresholdMet
    ? ['readiness_scoring']
    : [];
  const proofScopes: OutcomeSignalInfluenceScope[] = internalThresholdMet
    ? ['proof_recommendation_ranking']
    : [];
  const readinessAndProofScopes: OutcomeSignalInfluenceScope[] = internalThresholdMet
    ? ['readiness_scoring', 'proof_recommendation_ranking']
    : [];

  return [
    metricStatus({
      metricKey: 'save_to_readiness_rate',
      label: 'Saved role to readiness report',
      value: rate(row.readinessTargetCount, row.targetRoleSaves),
      unit: 'rate',
      sampleSize: row.targetRoleSaves,
      uniqueUserCount: row.targetRoleUsers,
      sourceEventCount: row.targetRoleSaves + row.readinessReports,
      thresholdMet: internalThresholdMet,
      influenceScopes: internalScopes,
      explanation: 'How often a saved target role becomes a readiness report.',
      unavailableReason: row.targetRoleSaves === 0 ? 'No target role saves are available for this role.' : null,
    }),
    metricStatus({
      metricKey: 'readiness_to_upgrade_rate',
      label: 'Readiness report to upgrade plan',
      value: rate(row.upgradeTargetCount, row.readinessTargetCount),
      unit: 'rate',
      sampleSize: row.readinessTargetCount,
      uniqueUserCount: Math.max(row.readinessUsers, row.upgradeUsers),
      sourceEventCount: row.readinessReports + row.upgradePlans,
      thresholdMet: internalThresholdMet,
      influenceScopes: proofScopes,
      explanation: 'How often a readiness report turns into a concrete upgrade plan.',
      unavailableReason: row.readinessTargetCount === 0 ? 'No readiness reports are available for this role.' : null,
    }),
    metricStatus({
      metricKey: 'sprint_completion_rate',
      label: 'Gap-closing sprint completion',
      value: rate(row.completedSprints, row.linkedSprints),
      unit: 'rate',
      sampleSize: row.linkedSprints,
      uniqueUserCount: row.sprintUsers,
      sourceEventCount: row.linkedSprints,
      thresholdMet: internalThresholdMet,
      influenceScopes: proofScopes,
      explanation: 'How often started upgrade-plan sprints reach complete status.',
      unavailableReason: row.linkedSprints === 0 ? 'No linked upgrade sprints are available for this role.' : null,
    }),
    metricStatus({
      metricKey: 'readiness_score_delta',
      label: 'Average reassessment score movement',
      value: row.avgReassessmentDelta,
      unit: 'score_delta',
      sampleSize: row.reassessmentPairs,
      uniqueUserCount: row.reassessmentUsers,
      sourceEventCount: row.reassessmentPairs,
      thresholdMet: internalThresholdMet,
      influenceScopes: readinessAndProofScopes,
      explanation: 'Average score movement between repeated readiness assessments for the same target role.',
      unavailableReason: row.reassessmentPairs === 0 ? 'No reassessment pairs are available for this role.' : null,
    }),
    metricStatus({
      metricKey: 'application_callback_rate',
      label: 'Application outcome rate',
      value: rate(row.positiveApplicationOutcomes, row.applicationOutcomes),
      unit: 'rate',
      sampleSize: row.applicationOutcomes,
      uniqueUserCount: row.applicationUsers,
      sourceEventCount: row.applicationOutcomes,
      thresholdMet: false,
      influenceScopes: [],
      explanation:
        'Application outcomes are displayed for internal calibration only. They do not change public market profiles in this ticket.',
      unavailableReason: row.applicationOutcomes === 0 ? 'No application outcome events are available for this role.' : null,
    }),
    metricStatus({
      metricKey: 'pilot_feedback_score',
      label: 'Average pilot feedback score',
      value: row.avgFeedbackScore,
      unit: 'score',
      sampleSize: row.feedbackCount,
      uniqueUserCount: row.feedbackUsers,
      sourceEventCount: row.feedbackCount,
      thresholdMet: internalThresholdMet,
      influenceScopes: proofScopes,
      explanation: 'Average usefulness score from Role Market pilot feedback.',
      unavailableReason: row.feedbackCount === 0 ? 'No pilot feedback is available for this role.' : null,
    }),
  ];
}

function sourceBreakdown(row: NumericOutcomeCalibrationRow): OutcomeSignalSourceBreakdown[] {
  const entries: Array<{ sourceType: OutcomeSignalSourceType; sourceEventCount: number }> = [
    { sourceType: 'target_role_save', sourceEventCount: row.targetRoleSaves },
    { sourceType: 'readiness_report', sourceEventCount: row.readinessReports },
    { sourceType: 'upgrade_plan', sourceEventCount: row.upgradePlans },
    { sourceType: 'sprint_completion', sourceEventCount: row.linkedSprints },
    { sourceType: 'reassessment_delta', sourceEventCount: row.reassessmentPairs },
    { sourceType: 'application_outcome', sourceEventCount: row.applicationOutcomes },
    { sourceType: 'pilot_feedback', sourceEventCount: row.feedbackCount },
  ];

  return entries.filter((entry) => entry.sourceEventCount > 0);
}

function aggregateMetric(params: {
  metricKey: OutcomeSignalMetricKey;
  label: string;
  value: number;
  unit: OutcomeSignalMetricUnit;
  sampleSize: number;
  uniqueUserCount: number;
  sourceEventCount: number;
  sourceTypes: OutcomeSignalSourceType[];
  influenceScopes: OutcomeSignalInfluenceScope[];
  explanation: string;
}): OutcomeSignalMetric {
  return {
    metricKey: params.metricKey,
    label: params.label,
    value: params.value,
    unit: params.unit,
    direction: params.metricKey === 'readiness_score_delta' && params.value < 0 ? 'negative' : 'positive',
    confidence: confidenceFromSample(params.sampleSize),
    sampleSize: params.sampleSize,
    uniqueUserCount: params.uniqueUserCount,
    sourceEventCount: params.sourceEventCount,
    sourceTypes: params.sourceTypes,
    influenceScopes: params.influenceScopes,
    explanation: params.explanation,
  };
}

function buildAggregateMetrics(
  row: NumericOutcomeCalibrationRow,
  internalThresholdMet: boolean,
): OutcomeSignalMetric[] {
  const readinessScopes: OutcomeSignalInfluenceScope[] = internalThresholdMet ? ['readiness_scoring'] : [];
  const proofScopes: OutcomeSignalInfluenceScope[] = internalThresholdMet ? ['proof_recommendation_ranking'] : [];
  const readinessAndProofScopes: OutcomeSignalInfluenceScope[] = internalThresholdMet
    ? ['readiness_scoring', 'proof_recommendation_ranking']
    : [];
  const metrics: OutcomeSignalMetric[] = [];
  const saveToReadiness = rate(row.readinessTargetCount, row.targetRoleSaves);
  const readinessToUpgrade = rate(row.upgradeTargetCount, row.readinessTargetCount);
  const sprintCompletion = rate(row.completedSprints, row.linkedSprints);
  const applicationRate = rate(row.positiveApplicationOutcomes, row.applicationOutcomes);

  if (saveToReadiness !== null) {
    metrics.push(aggregateMetric({
      metricKey: 'save_to_readiness_rate',
      label: 'Saved role to readiness report',
      value: saveToReadiness,
      unit: 'rate',
      sampleSize: row.targetRoleSaves,
      uniqueUserCount: row.targetRoleUsers,
      sourceEventCount: row.targetRoleSaves + row.readinessReports,
      sourceTypes: ['target_role_save', 'readiness_report'],
      influenceScopes: readinessScopes,
      explanation: 'Aggregate save-to-readiness conversion for internal readiness calibration.',
    }));
  }

  if (readinessToUpgrade !== null) {
    metrics.push(aggregateMetric({
      metricKey: 'readiness_to_upgrade_rate',
      label: 'Readiness report to upgrade plan',
      value: readinessToUpgrade,
      unit: 'rate',
      sampleSize: row.readinessTargetCount,
      uniqueUserCount: Math.max(row.readinessUsers, row.upgradeUsers),
      sourceEventCount: row.readinessReports + row.upgradePlans,
      sourceTypes: ['readiness_report', 'upgrade_plan'],
      influenceScopes: proofScopes,
      explanation: 'Aggregate readiness-to-upgrade conversion for internal proof recommendation calibration.',
    }));
  }

  if (sprintCompletion !== null) {
    metrics.push(aggregateMetric({
      metricKey: 'sprint_completion_rate',
      label: 'Gap-closing sprint completion',
      value: sprintCompletion,
      unit: 'rate',
      sampleSize: row.linkedSprints,
      uniqueUserCount: row.sprintUsers,
      sourceEventCount: row.linkedSprints,
      sourceTypes: ['sprint_completion'],
      influenceScopes: proofScopes,
      explanation: 'Aggregate sprint completion rate for internal proof recommendation calibration.',
    }));
  }

  if (row.avgReassessmentDelta !== null && row.reassessmentPairs > 0) {
    metrics.push(aggregateMetric({
      metricKey: 'readiness_score_delta',
      label: 'Average reassessment score movement',
      value: row.avgReassessmentDelta,
      unit: 'score_delta',
      sampleSize: row.reassessmentPairs,
      uniqueUserCount: row.reassessmentUsers,
      sourceEventCount: row.reassessmentPairs,
      sourceTypes: ['reassessment_delta'],
      influenceScopes: readinessAndProofScopes,
      explanation: 'Aggregate reassessment deltas for internal readiness and proof calibration.',
    }));
  }

  if (applicationRate !== null) {
    metrics.push(aggregateMetric({
      metricKey: 'application_callback_rate',
      label: 'Application outcome rate',
      value: applicationRate,
      unit: 'rate',
      sampleSize: row.applicationOutcomes,
      uniqueUserCount: row.applicationUsers,
      sourceEventCount: row.applicationOutcomes,
      sourceTypes: ['application_outcome'],
      influenceScopes: [],
      explanation:
        'Aggregate application outcomes are visible internally only and do not affect public role profiles in LMI-038.',
    }));
  }

  if (row.avgFeedbackScore !== null && row.feedbackCount > 0) {
    metrics.push(aggregateMetric({
      metricKey: 'pilot_feedback_score',
      label: 'Average pilot feedback score',
      value: row.avgFeedbackScore,
      unit: 'score',
      sampleSize: row.feedbackCount,
      uniqueUserCount: row.feedbackUsers,
      sourceEventCount: row.feedbackCount,
      sourceTypes: ['pilot_feedback'],
      influenceScopes: proofScopes,
      explanation: 'Aggregate pilot feedback for internal proof recommendation calibration.',
    }));
  }

  return metrics;
}

function buildAggregate(params: {
  row: NumericOutcomeCalibrationRow;
  profile: RoleMarketProfile;
  windowStart: string;
  windowEnd: string;
  meta: ContractMeta;
}): PrivacySafeOutcomeSignalAggregate | null {
  const breakdown = sourceBreakdown(params.row);
  const sourceEventCount = breakdown.reduce((sum, item) => sum + item.sourceEventCount, 0);
  if (sourceEventCount === 0) return null;

  const review = {
    status: 'not_required' as const,
    reviewedBy: null,
    reviewedAt: null,
    publicClaimAllowed: false,
    notes: 'Operator-only internal calibration aggregate. Public market profile influence is blocked in LMI-038.',
  };
  const baseDecisionInput = {
    uniqueUserCount: params.row.uniqueUsers,
    sourceEventCount,
    review,
  };
  const readinessDecision = evaluateOutcomeSignalScope(baseDecisionInput, 'readiness_scoring');
  const proofDecision = evaluateOutcomeSignalScope(baseDecisionInput, 'proof_recommendation_ranking');
  const publicDecision = evaluateOutcomeSignalScope(baseDecisionInput, 'public_market_profile');
  const internalThresholdMet = readinessDecision.allowed || proofDecision.allowed;
  const metrics = buildAggregateMetrics(params.row, internalThresholdMet);
  if (metrics.length === 0) return null;
  const blockedReasons = [
    ...readinessDecision.reasons,
    ...proofDecision.reasons,
    ...publicDecision.reasons,
    'LMI-038 is internal calibration only; no public market profile is changed by outcome aggregates.',
  ];

  return {
    id: `outcome-calibration-${params.profile.id}-${params.windowStart.slice(0, 10)}-${params.windowEnd.slice(0, 10)}`,
    roleId: params.profile.id,
    roleTitle: params.profile.title,
    region: null,
    seniorityBand: null,
    windowStart: params.windowStart,
    windowEnd: params.windowEnd,
    sampleSize: sourceEventCount,
    uniqueUserCount: params.row.uniqueUsers,
    sourceEventCount,
    sourceBreakdown: breakdown,
    metrics,
    privacy: {
      aggregationLevel: 'role',
      anonymizationMode: 'k_anonymized',
      kAnonymityThreshold: OUTCOME_SIGNAL_MIN_SAMPLE_THRESHOLDS.readinessScoring.minUniqueUsers,
      containsUserIdentifiers: false,
      containsRawResumeText: false,
      containsRawJobDescription: false,
      containsRawApplicationDetails: false,
      containsCompanyNames: false,
      privateFieldsExcluded: [...OUTCOME_SIGNAL_PRIVATE_FIELD_DENYLIST],
    },
    review,
    influencePolicy: {
      readinessScoringAllowed: readinessDecision.allowed,
      proofRecommendationRankingAllowed: proofDecision.allowed,
      publicMarketProfileAllowed: false,
      blockedReasons: [...new Set(blockedReasons)],
    },
    meta: params.meta,
  };
}

function buildRoleItem(params: {
  profile: RoleMarketProfile;
  row: NumericOutcomeCalibrationRow | null;
  windowStart: string;
  windowEnd: string;
  meta: ContractMeta;
}): OperatorOutcomeCalibrationRoleItem {
  const aggregate = params.row
    ? buildAggregate({
      row: params.row,
      profile: params.profile,
      windowStart: params.windowStart,
      windowEnd: params.windowEnd,
      meta: params.meta,
    })
    : null;
  const readinessAllowed = aggregate?.influencePolicy.readinessScoringAllowed ?? false;
  const proofAllowed = aggregate?.influencePolicy.proofRecommendationRankingAllowed ?? false;
  const meetsPublicSamples = Boolean(
    aggregate &&
    aggregate.uniqueUserCount >= OUTCOME_SIGNAL_MIN_SAMPLE_THRESHOLDS.publicMarketProfile.minUniqueUsers &&
    aggregate.sourceEventCount >= OUTCOME_SIGNAL_MIN_SAMPLE_THRESHOLDS.publicMarketProfile.minSourceEvents,
  );
  const metrics = buildMetricStatuses(params.row, readinessAllowed || proofAllowed);
  const thresholdStatus = !aggregate
    ? 'no_data'
    : meetsPublicSamples
      ? 'eligible_for_operator_review'
      : readinessAllowed || proofAllowed
        ? 'ready_for_internal_calibration'
        : 'below_threshold';

  return {
    roleProfileId: params.profile.id,
    roleTitle: params.profile.title,
    category: params.profile.category as RoleCategory,
    thresholdStatus,
    canInfluenceReadinessScoring: readinessAllowed,
    canInfluenceProofRecommendationRanking: proofAllowed,
    canInfluencePublicMarketProfile: false,
    publicMarketProfileBlockedReason:
      'Outcome calibration is operator-only in LMI-038. Public profile influence requires a separate reviewed publish workflow.',
    aggregate,
    metrics,
  };
}

async function fetchOutcomeCalibrationRows(windowStart: string): Promise<NumericOutcomeCalibrationRow[]> {
  const { rows } = await pool.query<OutcomeCalibrationRow>(
    `WITH target_roles AS (
       SELECT
         role_profile_id,
         COUNT(*)::int AS target_role_saves,
         COUNT(DISTINCT user_id)::int AS target_role_users
       FROM candidate_target_roles
       WHERE created_at >= $1::timestamptz
       GROUP BY role_profile_id
     ),
     readiness AS (
       SELECT
         role_profile_id,
         COUNT(DISTINCT target_role_id)::int AS readiness_target_count,
         COUNT(*)::int AS readiness_reports,
         COUNT(DISTINCT user_id)::int AS readiness_users
       FROM candidate_role_assessments
       WHERE created_at >= $1::timestamptz
       GROUP BY role_profile_id
     ),
     upgrades AS (
       SELECT
         ctr.role_profile_id,
         COUNT(DISTINCT cup.target_role_id)::int AS upgrade_target_count,
         COUNT(*)::int AS upgrade_plans,
         COUNT(DISTINCT cup.user_id)::int AS upgrade_users
       FROM candidate_upgrade_plans cup
       INNER JOIN candidate_target_roles ctr ON ctr.id = cup.target_role_id
       WHERE cup.created_at >= $1::timestamptz
       GROUP BY ctr.role_profile_id
     ),
     sprints AS (
       SELECT
         ctr.role_profile_id,
         COUNT(gs.id)::int AS linked_sprints,
         COUNT(gs.id) FILTER (WHERE gs.status = 'complete')::int AS completed_sprints,
         COUNT(DISTINCT gs.user_id)::int AS sprint_users
       FROM candidate_upgrade_plans cup
       INNER JOIN candidate_target_roles ctr ON ctr.id = cup.target_role_id
       INNER JOIN goal_sprints gs ON gs.id = cup.linked_sprint_id
       WHERE gs.created_at >= $1::timestamptz
       GROUP BY ctr.role_profile_id
     ),
     reassessment_pairs AS (
       SELECT
         ctr.role_profile_id,
         crh.user_id,
         crh.target_role_id,
         crh.overall_score,
         LAG(crh.overall_score) OVER (
           PARTITION BY crh.user_id, crh.target_role_id
           ORDER BY crh.created_at ASC
         ) AS previous_score,
         crh.created_at
       FROM candidate_readiness_history crh
       INNER JOIN candidate_target_roles ctr ON ctr.id = crh.target_role_id
     ),
     reassessments AS (
       SELECT
         role_profile_id,
         COUNT(*)::int AS reassessment_pairs,
         AVG(overall_score - previous_score)::float AS avg_reassessment_delta,
         COUNT(DISTINCT user_id)::int AS reassessment_users
       FROM reassessment_pairs
       WHERE created_at >= $1::timestamptz
         AND previous_score IS NOT NULL
       GROUP BY role_profile_id
     ),
     application_outcomes AS (
       SELECT
         properties->>'roleProfileId' AS role_profile_id,
         COUNT(*)::int AS application_outcomes,
         COUNT(*) FILTER (
           WHERE event_key IN ('interview_outcome_recorded', 'offer_outcome_recorded')
             OR LOWER(COALESCE(properties->>'outcome', '')) IN (
               'callback',
               'interview',
               'interview_invite',
               'onsite',
               'offer',
               'accepted',
               'positive'
             )
         )::int AS positive_application_outcomes,
         COUNT(DISTINCT user_id)::int AS application_users
       FROM product_events
       WHERE created_at >= $1::timestamptz
         AND event_key IN (
           'application_outcome_recorded',
           'interview_outcome_recorded',
           'offer_outcome_recorded'
         )
         AND properties->>'roleProfileId' IS NOT NULL
       GROUP BY properties->>'roleProfileId'
     ),
     feedback AS (
       SELECT
         properties->>'roleProfileId' AS role_profile_id,
         COUNT(*)::int AS feedback_count,
         COUNT(DISTINCT user_id)::int AS feedback_users,
         AVG(
           CASE
             WHEN (properties->>'usefulnessScore') ~ '^[1-5]$'
               THEN (properties->>'usefulnessScore')::int
             ELSE NULL
           END
         )::float AS avg_feedback_score
       FROM product_events
       WHERE created_at >= $1::timestamptz
         AND event_key = 'role_market_feedback_submitted'
         AND properties->>'roleProfileId' IS NOT NULL
       GROUP BY properties->>'roleProfileId'
     ),
     unique_users AS (
       SELECT role_profile_id, user_id FROM candidate_target_roles
       WHERE created_at >= $1::timestamptz
       UNION
       SELECT role_profile_id, user_id FROM candidate_role_assessments
       WHERE created_at >= $1::timestamptz
       UNION
       SELECT ctr.role_profile_id, cup.user_id
       FROM candidate_upgrade_plans cup
       INNER JOIN candidate_target_roles ctr ON ctr.id = cup.target_role_id
       WHERE cup.created_at >= $1::timestamptz
       UNION
       SELECT properties->>'roleProfileId' AS role_profile_id, user_id
       FROM product_events
       WHERE created_at >= $1::timestamptz
         AND user_id IS NOT NULL
         AND properties->>'roleProfileId' IS NOT NULL
         AND event_key IN (
           'role_market_feedback_submitted',
           'application_outcome_recorded',
           'interview_outcome_recorded',
           'offer_outcome_recorded'
         )
     ),
     unique_user_counts AS (
       SELECT role_profile_id, COUNT(DISTINCT user_id)::int AS unique_users
       FROM unique_users
       WHERE role_profile_id IS NOT NULL
       GROUP BY role_profile_id
     ),
     role_keys AS (
       SELECT role_profile_id FROM target_roles
       UNION SELECT role_profile_id FROM readiness
       UNION SELECT role_profile_id FROM upgrades
       UNION SELECT role_profile_id FROM sprints
       UNION SELECT role_profile_id FROM reassessments
       UNION SELECT role_profile_id FROM application_outcomes
       UNION SELECT role_profile_id FROM feedback
     )
     SELECT
       rk.role_profile_id,
       COALESCE(tr.target_role_saves, 0) AS target_role_saves,
       COALESCE(tr.target_role_users, 0) AS target_role_users,
       COALESCE(r.readiness_target_count, 0) AS readiness_target_count,
       COALESCE(r.readiness_reports, 0) AS readiness_reports,
       COALESCE(r.readiness_users, 0) AS readiness_users,
       COALESCE(u.upgrade_target_count, 0) AS upgrade_target_count,
       COALESCE(u.upgrade_plans, 0) AS upgrade_plans,
       COALESCE(u.upgrade_users, 0) AS upgrade_users,
       COALESCE(s.linked_sprints, 0) AS linked_sprints,
       COALESCE(s.completed_sprints, 0) AS completed_sprints,
       COALESCE(s.sprint_users, 0) AS sprint_users,
       COALESCE(rs.reassessment_pairs, 0) AS reassessment_pairs,
       rs.avg_reassessment_delta,
       COALESCE(rs.reassessment_users, 0) AS reassessment_users,
       COALESCE(ao.application_outcomes, 0) AS application_outcomes,
       COALESCE(ao.positive_application_outcomes, 0) AS positive_application_outcomes,
       COALESCE(ao.application_users, 0) AS application_users,
       COALESCE(f.feedback_count, 0) AS feedback_count,
       COALESCE(f.feedback_users, 0) AS feedback_users,
       f.avg_feedback_score,
       COALESCE(uuc.unique_users, 0) AS unique_users
     FROM role_keys rk
     LEFT JOIN target_roles tr ON tr.role_profile_id = rk.role_profile_id
     LEFT JOIN readiness r ON r.role_profile_id = rk.role_profile_id
     LEFT JOIN upgrades u ON u.role_profile_id = rk.role_profile_id
     LEFT JOIN sprints s ON s.role_profile_id = rk.role_profile_id
     LEFT JOIN reassessments rs ON rs.role_profile_id = rk.role_profile_id
     LEFT JOIN application_outcomes ao ON ao.role_profile_id = rk.role_profile_id
     LEFT JOIN feedback f ON f.role_profile_id = rk.role_profile_id
     LEFT JOIN unique_user_counts uuc ON uuc.role_profile_id = rk.role_profile_id
     WHERE rk.role_profile_id IS NOT NULL`,
    [windowStart],
  );

  return rows.map(numericRow);
}

export async function getOperatorOutcomeCalibrationResponse(
  options: GetOperatorOutcomeCalibrationOptions = {},
): Promise<OperatorOutcomeCalibrationResponse> {
  const now = new Date();
  const boundedWindowDays = Math.max(7, Math.min(365, options.windowDays ?? 90));
  const windowStartDate = new Date(now.getTime() - boundedWindowDays * 24 * 60 * 60 * 1000);
  const windowStart = windowStartDate.toISOString();
  const windowEnd = now.toISOString();
  const meta = buildMeta();
  const rows = await fetchOutcomeCalibrationRows(windowStart);
  const rowByRoleId = new Map(rows.map((row) => [row.roleProfileId, row]));
  const profileMap = profilesById(roleMarketProfileFixtures);
  const unknownProfiles: RoleMarketProfile[] = rows
    .filter((row) => !profileMap.has(row.roleProfileId))
    .map((row) => ({
      ...roleMarketProfileFixtures[0],
      id: row.roleProfileId,
      title: row.roleProfileId,
      category: 'software_engineering',
    }));
  const profiles = [...roleMarketProfileFixtures, ...unknownProfiles];
  const limit = Math.max(1, Math.min(200, options.limit ?? 50));
  const roles = profiles
    .map((profile) => buildRoleItem({
      profile,
      row: rowByRoleId.get(profile.id) ?? null,
      windowStart,
      windowEnd,
      meta,
    }))
    .sort((a, b) => {
      const aEvents = a.aggregate?.sourceEventCount ?? 0;
      const bEvents = b.aggregate?.sourceEventCount ?? 0;
      if (aEvents !== bEvents) return bEvents - aEvents;
      return a.roleTitle.localeCompare(b.roleTitle);
    })
    .slice(0, limit);

  const response: OperatorOutcomeCalibrationResponse = {
    summary: {
      roleCount: roles.length,
      rolesWithOutcomeData: roles.filter((role) => role.aggregate).length,
      rolesMeetingInternalThreshold: roles.filter(
        (role) => role.canInfluenceReadinessScoring || role.canInfluenceProofRecommendationRanking,
      ).length,
      rolesEligibleForOperatorReview: roles.filter(
        (role) => role.thresholdStatus === 'eligible_for_operator_review',
      ).length,
      totalUniqueUsers: roles.reduce((sum, role) => sum + (role.aggregate?.uniqueUserCount ?? 0), 0),
      totalSourceEvents: roles.reduce((sum, role) => sum + (role.aggregate?.sourceEventCount ?? 0), 0),
      windowStart,
      windowEnd,
    },
    roles,
    meta,
  };

  assertValidOperatorOutcomeCalibrationResponse(response);
  return response;
}
