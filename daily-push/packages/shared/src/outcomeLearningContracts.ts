import type { ContractMeta, ISODateString, RoleCategory, SeniorityBand } from "./roleMarketContracts";

export const OUTCOME_SIGNAL_SOURCE_TYPES = [
  "target_role_save",
  "readiness_report",
  "upgrade_plan",
  "sprint_completion",
  "proof_artifact",
  "reassessment_delta",
  "application_outcome",
  "interview_outcome",
  "offer_outcome",
  "pilot_feedback",
] as const;

export type OutcomeSignalSourceType = (typeof OUTCOME_SIGNAL_SOURCE_TYPES)[number];

export const OUTCOME_SIGNAL_METRIC_KEYS = [
  "save_to_readiness_rate",
  "readiness_to_upgrade_rate",
  "upgrade_to_sprint_start_rate",
  "sprint_completion_rate",
  "proof_artifact_completion_rate",
  "readiness_score_delta",
  "requirement_coverage_delta",
  "application_callback_rate",
  "interview_conversion_rate",
  "offer_rate",
  "pilot_feedback_score",
  "proof_task_helpfulness_rate",
] as const;

export type OutcomeSignalMetricKey = (typeof OUTCOME_SIGNAL_METRIC_KEYS)[number];

export const OUTCOME_SIGNAL_METRIC_UNITS = [
  "rate",
  "score",
  "score_delta",
  "count",
  "percent",
  "days",
] as const;

export type OutcomeSignalMetricUnit = (typeof OUTCOME_SIGNAL_METRIC_UNITS)[number];

export const OUTCOME_SIGNAL_METRIC_DIRECTIONS = ["positive", "negative", "neutral"] as const;

export type OutcomeSignalMetricDirection = (typeof OUTCOME_SIGNAL_METRIC_DIRECTIONS)[number];

export const OUTCOME_SIGNAL_INFLUENCE_SCOPES = [
  "readiness_scoring",
  "proof_recommendation_ranking",
  "public_market_profile",
] as const;

export type OutcomeSignalInfluenceScope = (typeof OUTCOME_SIGNAL_INFLUENCE_SCOPES)[number];

export const OUTCOME_SIGNAL_REVIEW_STATUSES = [
  "not_required",
  "pending_operator_review",
  "approved",
  "rejected",
] as const;

export type OutcomeSignalReviewStatus = (typeof OUTCOME_SIGNAL_REVIEW_STATUSES)[number];

export const OUTCOME_SIGNAL_AGGREGATION_LEVELS = [
  "role",
  "role_region",
  "role_region_seniority",
] as const;

export type OutcomeSignalAggregationLevel = (typeof OUTCOME_SIGNAL_AGGREGATION_LEVELS)[number];

export const OUTCOME_SIGNAL_ANONYMIZATION_MODES = ["k_anonymized", "differentially_private"] as const;

export type OutcomeSignalAnonymizationMode = (typeof OUTCOME_SIGNAL_ANONYMIZATION_MODES)[number];

export const OUTCOME_SIGNAL_PRIVATE_FIELD_DENYLIST = [
  "userId",
  "user_id",
  "email",
  "userEmail",
  "phone",
  "resumeText",
  "rawResumeText",
  "jobDescription",
  "rawJobDescription",
  "companyName",
  "applicationNotes",
  "recruiterName",
  "coverLetterText",
  "interviewTranscript",
  "linkedInUrl",
  "githubUrl",
] as const;

export type OutcomeSignalPrivateField = (typeof OUTCOME_SIGNAL_PRIVATE_FIELD_DENYLIST)[number];

export const OUTCOME_SIGNAL_MIN_SAMPLE_THRESHOLDS = {
  readinessScoring: {
    minUniqueUsers: 10,
    minSourceEvents: 20,
  },
  proofRecommendationRanking: {
    minUniqueUsers: 10,
    minSourceEvents: 20,
  },
  publicMarketProfile: {
    minUniqueUsers: 50,
    minSourceEvents: 100,
    requiresOperatorReview: true,
  },
} as const;

export const OUTCOME_SIGNAL_SCOPE_ALLOWED_SOURCE_TYPES: Record<
  OutcomeSignalInfluenceScope,
  readonly OutcomeSignalSourceType[]
> = {
  readiness_scoring: [
    "readiness_report",
    "sprint_completion",
    "proof_artifact",
    "reassessment_delta",
    "pilot_feedback",
  ],
  proof_recommendation_ranking: [
    "upgrade_plan",
    "sprint_completion",
    "proof_artifact",
    "reassessment_delta",
    "pilot_feedback",
  ],
  public_market_profile: [
    "application_outcome",
    "interview_outcome",
    "offer_outcome",
    "pilot_feedback",
  ],
};

export interface OutcomeSignalSourceBreakdown {
  sourceType: OutcomeSignalSourceType;
  sourceEventCount: number;
}

export interface OutcomeSignalMetric {
  metricKey: OutcomeSignalMetricKey;
  label: string;
  value: number;
  unit: OutcomeSignalMetricUnit;
  direction: OutcomeSignalMetricDirection;
  confidence: number;
  sampleSize: number;
  uniqueUserCount: number;
  sourceEventCount: number;
  sourceTypes: OutcomeSignalSourceType[];
  influenceScopes: OutcomeSignalInfluenceScope[];
  explanation: string;
}

export interface OutcomeSignalPrivacyEnvelope {
  aggregationLevel: OutcomeSignalAggregationLevel;
  anonymizationMode: OutcomeSignalAnonymizationMode;
  kAnonymityThreshold: number;
  containsUserIdentifiers: false;
  containsRawResumeText: false;
  containsRawJobDescription: false;
  containsRawApplicationDetails: false;
  containsCompanyNames: false;
  privateFieldsExcluded: OutcomeSignalPrivateField[];
}

export interface OutcomeSignalReview {
  status: OutcomeSignalReviewStatus;
  reviewedBy: string | null;
  reviewedAt: ISODateString | null;
  publicClaimAllowed: boolean;
  notes: string | null;
}

export interface OutcomeSignalInfluencePolicy {
  readinessScoringAllowed: boolean;
  proofRecommendationRankingAllowed: boolean;
  publicMarketProfileAllowed: boolean;
  blockedReasons: string[];
}

export interface PrivacySafeOutcomeSignalAggregate {
  id: string;
  roleId: string;
  roleTitle: string;
  region: string | null;
  seniorityBand: SeniorityBand | null;
  windowStart: ISODateString;
  windowEnd: ISODateString;
  sampleSize: number;
  uniqueUserCount: number;
  sourceEventCount: number;
  sourceBreakdown: OutcomeSignalSourceBreakdown[];
  metrics: OutcomeSignalMetric[];
  privacy: OutcomeSignalPrivacyEnvelope;
  review: OutcomeSignalReview;
  influencePolicy: OutcomeSignalInfluencePolicy;
  meta: ContractMeta;
}

export type OutcomeCalibrationThresholdStatus =
  | "no_data"
  | "below_threshold"
  | "ready_for_internal_calibration"
  | "eligible_for_operator_review";

export interface OutcomeCalibrationMetricStatus {
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
  unavailableReason: string | null;
}

export interface OperatorOutcomeCalibrationRoleItem {
  roleProfileId: string;
  roleTitle: string;
  category: RoleCategory;
  thresholdStatus: OutcomeCalibrationThresholdStatus;
  canInfluenceReadinessScoring: boolean;
  canInfluenceProofRecommendationRanking: boolean;
  canInfluencePublicMarketProfile: false;
  publicMarketProfileBlockedReason: string;
  aggregate: PrivacySafeOutcomeSignalAggregate | null;
  metrics: OutcomeCalibrationMetricStatus[];
}

export interface OperatorOutcomeCalibrationSummary {
  roleCount: number;
  rolesWithOutcomeData: number;
  rolesMeetingInternalThreshold: number;
  rolesEligibleForOperatorReview: number;
  totalUniqueUsers: number;
  totalSourceEvents: number;
  windowStart: ISODateString;
  windowEnd: ISODateString;
}

export interface OperatorOutcomeCalibrationResponse {
  summary: OperatorOutcomeCalibrationSummary;
  roles: OperatorOutcomeCalibrationRoleItem[];
  meta: ContractMeta;
}

export interface OutcomeSignalScopeDecision {
  allowed: boolean;
  reasons: string[];
}

export function evaluateOutcomeSignalScope(
  aggregate: Pick<
    PrivacySafeOutcomeSignalAggregate,
    "uniqueUserCount" | "sourceEventCount" | "review"
  >,
  scope: OutcomeSignalInfluenceScope,
): OutcomeSignalScopeDecision {
  const reasons: string[] = [];

  if (scope === "readiness_scoring") {
    if (aggregate.uniqueUserCount < OUTCOME_SIGNAL_MIN_SAMPLE_THRESHOLDS.readinessScoring.minUniqueUsers) {
      reasons.push("unique user threshold not met for readiness scoring");
    }
    if (aggregate.sourceEventCount < OUTCOME_SIGNAL_MIN_SAMPLE_THRESHOLDS.readinessScoring.minSourceEvents) {
      reasons.push("source event threshold not met for readiness scoring");
    }
  }

  if (scope === "proof_recommendation_ranking") {
    if (
      aggregate.uniqueUserCount <
      OUTCOME_SIGNAL_MIN_SAMPLE_THRESHOLDS.proofRecommendationRanking.minUniqueUsers
    ) {
      reasons.push("unique user threshold not met for proof recommendation ranking");
    }
    if (
      aggregate.sourceEventCount <
      OUTCOME_SIGNAL_MIN_SAMPLE_THRESHOLDS.proofRecommendationRanking.minSourceEvents
    ) {
      reasons.push("source event threshold not met for proof recommendation ranking");
    }
  }

  if (scope === "public_market_profile") {
    if (aggregate.uniqueUserCount < OUTCOME_SIGNAL_MIN_SAMPLE_THRESHOLDS.publicMarketProfile.minUniqueUsers) {
      reasons.push("unique user threshold not met for public market profile influence");
    }
    if (aggregate.sourceEventCount < OUTCOME_SIGNAL_MIN_SAMPLE_THRESHOLDS.publicMarketProfile.minSourceEvents) {
      reasons.push("source event threshold not met for public market profile influence");
    }
    if (aggregate.review.status !== "approved" || !aggregate.review.publicClaimAllowed) {
      reasons.push("operator review approval is required before public market profile influence");
    }
  }

  return {
    allowed: reasons.length === 0,
    reasons,
  };
}
