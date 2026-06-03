import type {
  OperatorOutcomeCalibrationResponse,
  PrivacySafeOutcomeSignalAggregate,
} from "./outcomeLearningContracts";

export const privacySafeOutcomeSignalAggregateFixture: PrivacySafeOutcomeSignalAggregate = {
  id: "outcome-aggregate-senior-backend-india-2026-05",
  roleId: "senior-backend-engineer",
  roleTitle: "Senior Backend Engineer",
  region: "India",
  seniorityBand: "senior",
  windowStart: "2026-05-01T00:00:00.000Z",
  windowEnd: "2026-05-26T00:00:00.000Z",
  sampleSize: 128,
  uniqueUserCount: 64,
  sourceEventCount: 142,
  sourceBreakdown: [
    {
      sourceType: "readiness_report",
      sourceEventCount: 64,
    },
    {
      sourceType: "reassessment_delta",
      sourceEventCount: 36,
    },
    {
      sourceType: "proof_artifact",
      sourceEventCount: 28,
    },
    {
      sourceType: "pilot_feedback",
      sourceEventCount: 14,
    },
  ],
  metrics: [
    {
      metricKey: "readiness_score_delta",
      label: "Average readiness score movement after proof work",
      value: 12.4,
      unit: "score_delta",
      direction: "positive",
      confidence: 0.78,
      sampleSize: 64,
      uniqueUserCount: 64,
      sourceEventCount: 100,
      sourceTypes: ["readiness_report", "reassessment_delta", "proof_artifact"],
      influenceScopes: ["readiness_scoring", "proof_recommendation_ranking"],
      explanation:
        "Aggregated reassessment deltas suggest source-backed proof tasks improved private readiness scores.",
    },
    {
      metricKey: "proof_task_helpfulness_rate",
      label: "Users rating proof tasks as useful",
      value: 0.71,
      unit: "rate",
      direction: "positive",
      confidence: 0.72,
      sampleSize: 42,
      uniqueUserCount: 32,
      sourceEventCount: 42,
      sourceTypes: ["pilot_feedback", "proof_artifact"],
      influenceScopes: ["proof_recommendation_ranking"],
      explanation:
        "Aggregated pilot feedback can reorder proof recommendations but cannot become a market claim.",
    },
  ],
  privacy: {
    aggregationLevel: "role_region_seniority",
    anonymizationMode: "k_anonymized",
    kAnonymityThreshold: 10,
    containsUserIdentifiers: false,
    containsRawResumeText: false,
    containsRawJobDescription: false,
    containsRawApplicationDetails: false,
    containsCompanyNames: false,
    privateFieldsExcluded: [
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
    ],
  },
  review: {
    status: "not_required",
    reviewedBy: null,
    reviewedAt: null,
    publicClaimAllowed: false,
    notes: "Internal calibration aggregate only.",
  },
  influencePolicy: {
    readinessScoringAllowed: true,
    proofRecommendationRankingAllowed: true,
    publicMarketProfileAllowed: false,
    blockedReasons: ["public market profile influence requires operator review and public-source outcome metrics"],
  },
  meta: {
    contractVersion: "role-market.v1",
    generatedAt: "2026-05-26T00:00:00.000Z",
    sourceMode: "live",
    seedVersion: "outcome-learning.v1",
    warnings: [],
  },
};

export const publicReviewedOutcomeSignalAggregateFixture: PrivacySafeOutcomeSignalAggregate = {
  ...privacySafeOutcomeSignalAggregateFixture,
  id: "outcome-aggregate-senior-backend-india-public-2026-05",
  sampleSize: 160,
  uniqueUserCount: 72,
  sourceEventCount: 122,
  sourceBreakdown: [
    {
      sourceType: "application_outcome",
      sourceEventCount: 55,
    },
    {
      sourceType: "interview_outcome",
      sourceEventCount: 42,
    },
    {
      sourceType: "offer_outcome",
      sourceEventCount: 25,
    },
  ],
  metrics: [
    {
      metricKey: "interview_conversion_rate",
      label: "Interview callback rate after role-aligned proof work",
      value: 0.22,
      unit: "rate",
      direction: "positive",
      confidence: 0.68,
      sampleSize: 72,
      uniqueUserCount: 72,
      sourceEventCount: 122,
      sourceTypes: ["application_outcome", "interview_outcome", "offer_outcome"],
      influenceScopes: ["public_market_profile"],
      explanation:
        "Operator-reviewed aggregate outcome signal may inform public confidence copy without exposing individuals.",
    },
  ],
  review: {
    status: "approved",
    reviewedBy: "operator:market-review",
    reviewedAt: "2026-05-26T00:00:00.000Z",
    publicClaimAllowed: true,
    notes: "Reviewed for aggregate-only public market confidence calibration.",
  },
  influencePolicy: {
    readinessScoringAllowed: false,
    proofRecommendationRankingAllowed: false,
    publicMarketProfileAllowed: true,
    blockedReasons: [],
  },
};

export const lowSampleOutcomeSignalAggregateFixture: PrivacySafeOutcomeSignalAggregate = {
  ...privacySafeOutcomeSignalAggregateFixture,
  id: "outcome-aggregate-low-sample",
  sampleSize: 6,
  uniqueUserCount: 4,
  sourceEventCount: 6,
  sourceBreakdown: [
    {
      sourceType: "pilot_feedback",
      sourceEventCount: 6,
    },
  ],
  metrics: [
    {
      metricKey: "pilot_feedback_score",
      label: "Pilot feedback score",
      value: 4.3,
      unit: "score",
      direction: "positive",
      confidence: 0.4,
      sampleSize: 6,
      uniqueUserCount: 4,
      sourceEventCount: 6,
      sourceTypes: ["pilot_feedback"],
      influenceScopes: [],
      explanation: "Low-sample feedback is visible internally but cannot influence scoring or public claims.",
    },
  ],
  influencePolicy: {
    readinessScoringAllowed: false,
    proofRecommendationRankingAllowed: false,
    publicMarketProfileAllowed: false,
    blockedReasons: [
      "unique user threshold not met",
      "source event threshold not met",
      "operator review approval is required before public market profile influence",
    ],
  },
};

export const outcomeLearningGoldenFixtures = {
  privacySafeOutcomeSignalAggregate: privacySafeOutcomeSignalAggregateFixture,
  publicReviewedOutcomeSignalAggregate: publicReviewedOutcomeSignalAggregateFixture,
  lowSampleOutcomeSignalAggregate: lowSampleOutcomeSignalAggregateFixture,
};

export const operatorOutcomeCalibrationResponseFixture: OperatorOutcomeCalibrationResponse = {
  summary: {
    roleCount: 2,
    rolesWithOutcomeData: 2,
    rolesMeetingInternalThreshold: 1,
    rolesEligibleForOperatorReview: 1,
    totalUniqueUsers: 68,
    totalSourceEvents: 148,
    windowStart: "2026-05-01T00:00:00.000Z",
    windowEnd: "2026-05-26T00:00:00.000Z",
  },
  roles: [
    {
      roleProfileId: "senior-backend-engineer",
      roleTitle: "Senior Backend Engineer",
      category: "software_engineering",
      thresholdStatus: "ready_for_internal_calibration",
      canInfluenceReadinessScoring: true,
      canInfluenceProofRecommendationRanking: true,
      canInfluencePublicMarketProfile: false,
      publicMarketProfileBlockedReason:
        "Outcome calibration is operator-only until a separate public-claim review workflow approves it.",
      aggregate: privacySafeOutcomeSignalAggregateFixture,
      metrics: [
        {
          metricKey: "save_to_readiness_rate",
          label: "Saved role to readiness report",
          value: 0.62,
          unit: "rate",
          sampleSize: 64,
          uniqueUserCount: 64,
          sourceEventCount: 100,
          thresholdMet: true,
          influenceScopes: ["readiness_scoring"],
          explanation: "Enough aggregate usage exists for private readiness calibration.",
          unavailableReason: null,
        },
        {
          metricKey: "readiness_score_delta",
          label: "Average reassessment score movement",
          value: 12.4,
          unit: "score_delta",
          sampleSize: 64,
          uniqueUserCount: 64,
          sourceEventCount: 100,
          thresholdMet: true,
          influenceScopes: ["readiness_scoring", "proof_recommendation_ranking"],
          explanation: "Enough reassessment data exists for internal calibration.",
          unavailableReason: null,
        },
      ],
    },
    {
      roleProfileId: "frontend-engineer",
      roleTitle: "Frontend Engineer",
      category: "software_engineering",
      thresholdStatus: "below_threshold",
      canInfluenceReadinessScoring: false,
      canInfluenceProofRecommendationRanking: false,
      canInfluencePublicMarketProfile: false,
      publicMarketProfileBlockedReason:
        "Outcome calibration is operator-only and this role has not met sample thresholds.",
      aggregate: lowSampleOutcomeSignalAggregateFixture,
      metrics: [
        {
          metricKey: "application_callback_rate",
          label: "Application callback rate",
          value: null,
          unit: "rate",
          sampleSize: 0,
          uniqueUserCount: 0,
          sourceEventCount: 0,
          thresholdMet: false,
          influenceScopes: [],
          explanation: "Application outcomes will appear after users record outcomes.",
          unavailableReason: "No application outcome events are available for this role in the selected window.",
        },
      ],
    },
  ],
  meta: {
    contractVersion: "role-market.v1",
    generatedAt: "2026-05-26T00:00:00.000Z",
    sourceMode: "live",
    seedVersion: "outcome-learning.v1",
    warnings: [],
  },
};

export const outcomeLearningOperatorGoldenFixtures = {
  operatorOutcomeCalibrationResponse: operatorOutcomeCalibrationResponseFixture,
};
