import type {
  AiImpact,
  ContractMeta,
  ISODateString,
  RequirementCategory,
  RequirementPriority,
  RoleCategory,
  RoleMarketProfile,
  RoleType,
  SeniorityBand,
  SourceMode,
  SourceReference,
} from "./roleMarketContracts";

export const MARKET_SOURCE_TYPES = [
  "job_board",
  "company_career_page",
  "occupation_taxonomy",
  "labor_stats",
  "industry_report",
  "curated_seed",
  "outcome_signal",
] as const;

export type MarketSourceType = (typeof MARKET_SOURCE_TYPES)[number];

export const MARKET_SOURCE_STATUSES = ["enabled", "disabled", "degraded"] as const;

export type MarketSourceStatus = (typeof MARKET_SOURCE_STATUSES)[number];

export const MARKET_SOURCE_AUTH_MODES = ["none", "api_key", "oauth", "manual_upload"] as const;

export type MarketSourceAuthMode = (typeof MARKET_SOURCE_AUTH_MODES)[number];

export const MARKET_SOURCE_PII_RISK_LEVELS = ["low", "medium", "high"] as const;

export type MarketSourcePiiRiskLevel = (typeof MARKET_SOURCE_PII_RISK_LEVELS)[number];

export interface MarketSource {
  id: string;
  name: string;
  type: MarketSourceType;
  status: MarketSourceStatus;
  sourceRefType: SourceReference["sourceType"];
  baseUrl: string | null;
  region: string | null;
  authMode: MarketSourceAuthMode;
  piiRiskLevel: MarketSourcePiiRiskLevel;
  freshnessSlaHours: number;
  owner: string | null;
  notes: string | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  meta: ContractMeta;
}

export const MARKET_INGESTION_RUN_STATUSES = [
  "queued",
  "running",
  "succeeded",
  "partial",
  "failed",
  "cancelled",
] as const;

export type MarketIngestionRunStatus = (typeof MARKET_INGESTION_RUN_STATUSES)[number];

export interface MarketIngestionRun {
  id: string;
  sourceId: string;
  adapterName: string;
  status: MarketIngestionRunStatus;
  requestedBy: "scheduler" | "operator" | "test_fixture";
  startedAt: ISODateString;
  completedAt: ISODateString | null;
  documentsDiscovered: number;
  documentsCreated: number;
  documentsDeduped: number;
  documentsFailed: number;
  errorSummary: string | null;
  meta: ContractMeta;
}

export const MARKET_DOCUMENT_TYPES = [
  "job_post",
  "company_career_page",
  "industry_report",
  "occupation_profile",
  "salary_benchmark",
  "outcome_signal",
  "curated_note",
] as const;

export type MarketDocumentType = (typeof MARKET_DOCUMENT_TYPES)[number];

export interface MarketRawDocument {
  id: string;
  sourceId: string;
  ingestionRunId: string;
  sourceDocumentId: string;
  documentType: MarketDocumentType;
  title: string;
  url: string | null;
  publisher: string | null;
  region: string | null;
  publishedAt: ISODateString | null;
  capturedAt: ISODateString;
  dedupeKey: string;
  checksum: string;
  extractedText: string;
  rawPayload: Record<string, unknown> | null;
  sourceRef: SourceReference;
  meta: ContractMeta;
}

export const MARKET_SIGNAL_TYPES = [
  "role_demand",
  "requirement",
  "skill",
  "tool",
  "domain",
  "seniority",
  "salary",
  "remote_policy",
  "ai_impact",
  "interview_signal",
] as const;

export type MarketSignalType = (typeof MARKET_SIGNAL_TYPES)[number];

export const MARKET_SIGNAL_DIRECTIONS = [
  "increasing",
  "stable",
  "declining",
  "uncertain",
] as const;

export type MarketSignalDirection = (typeof MARKET_SIGNAL_DIRECTIONS)[number];

export interface NormalizedMarketSignal {
  id: string;
  sourceId: string;
  ingestionRunId: string;
  rawDocumentId: string;
  sourceDocumentId: string;
  sourceRef: SourceReference;
  signalType: MarketSignalType;
  canonicalRoleId: string | null;
  observedRoleTitle: string;
  canonicalSkillId: string | null;
  normalizedLabel: string;
  requirementCategory: RequirementCategory | null;
  requirementPriority: RequirementPriority | null;
  seniorityBand: SeniorityBand | null;
  region: string | null;
  value: string;
  keywords: string[];
  evidenceText: string;
  direction: MarketSignalDirection;
  observedAt: ISODateString;
  confidence: number;
  meta: ContractMeta;
}

export interface RoleTaxonomyRecord {
  id: string;
  slug: string;
  title: string;
  category: RoleCategory;
  roleType: RoleType;
  aliases: string[];
  relatedRoleIds: string[];
  sourceRefs: SourceReference[];
  confidence: number;
  updatedAt: ISODateString;
  meta: ContractMeta;
}

export interface SkillTaxonomyRecord {
  id: string;
  slug: string;
  canonicalLabel: string;
  aliases: string[];
  categories: RequirementCategory[];
  relatedSkillIds: string[];
  sourceRefs: SourceReference[];
  confidence: number;
  updatedAt: ISODateString;
  meta: ContractMeta;
}

export interface RoleDemandAggregate {
  score: number;
  direction: MarketSignalDirection;
  sampleSize: number;
  sourceDiversity: number;
  confidence: number;
}

export interface SkillDemandAggregate {
  skillId: string | null;
  label: string;
  category: RequirementCategory | null;
  mentionCount: number;
  demandShare: number;
  direction: MarketSignalDirection;
  sourceRefIds: string[];
  confidence: number;
}

export interface RequirementDemandAggregate {
  label: string;
  category: RequirementCategory;
  priority: RequirementPriority;
  mentionCount: number;
  keywords: string[];
  sourceRefIds: string[];
  confidence: number;
}

export interface SeniorityDemandAggregate {
  seniorityBand: SeniorityBand;
  share: number;
  mentionCount: number;
  sourceRefIds: string[];
  confidence: number;
}

export type RemotePolicyValue = "remote" | "hybrid" | "on-site" | "unknown";

export interface RemotePolicyDemandAggregate {
  policy: RemotePolicyValue;
  share: number;
  mentionCount: number;
  sourceRefIds: string[];
  confidence: number;
}

export interface SalaryDemandAggregate {
  label: string;
  salaryMin: number | null;
  salaryMax: number | null;
  mentionCount: number;
  sourceRefIds: string[];
  confidence: number;
}

export interface AiImpactAggregate {
  impact: AiImpact;
  summary: string;
  affectedSkills: string[];
  sourceRefIds: string[];
  confidence: number;
}

export interface RoleMarketSignalAggregate {
  id: string;
  roleProfileId: string;
  roleTitle: string;
  category: RoleCategory;
  region: string | null;
  sourceMode: SourceMode;
  windowStart: ISODateString;
  windowEnd: ISODateString;
  sampleSize: number;
  sourceCount: number;
  sourceRefs: SourceReference[];
  demand: RoleDemandAggregate;
  topSkills: SkillDemandAggregate[];
  requirements: RequirementDemandAggregate[];
  seniority: SeniorityDemandAggregate[];
  remotePolicy: RemotePolicyDemandAggregate[];
  salary: SalaryDemandAggregate[];
  aiImpact: AiImpactAggregate[];
  freshnessHours: number;
  confidence: number;
  generatedAt: ISODateString;
  meta: ContractMeta;
}

export const ROLE_MARKET_PROFILE_VERSION_STATUSES = [
  "draft",
  "in_review",
  "published",
  "rejected",
  "archived",
] as const;

export type RoleMarketProfileVersionStatus =
  (typeof ROLE_MARKET_PROFILE_VERSION_STATUSES)[number];

export type MarketProfileDiffMateriality = "low" | "medium" | "high";

export interface MarketProfileRequirementSnapshot {
  requirementId: string | null;
  label: string;
  category: RequirementCategory;
  priority: RequirementPriority;
  keywords: string[];
  sourceRefIds: string[];
  confidence: number;
}

export interface MarketProfileRequirementDiffItem {
  label: string;
  before: MarketProfileRequirementSnapshot | null;
  after: MarketProfileRequirementSnapshot | null;
  changeSummary: string;
}

export interface MarketProfileStringListDiff {
  added: string[];
  removed: string[];
  unchangedCount: number;
}

export interface MarketProfileSourceRefDiff {
  addedSourceRefIds: string[];
  removedSourceRefIds: string[];
  unchangedCount: number;
}

export interface MarketProfileConfidenceDiff {
  before: number;
  after: number;
  delta: number;
}

export interface MarketProfileDiff {
  profileVersionId: string;
  roleProfileId: string;
  previousProfileVersionId: string | null;
  generatedAt: ISODateString;
  materiality: MarketProfileDiffMateriality;
  summary: string;
  requirements: {
    added: MarketProfileRequirementDiffItem[];
    removed: MarketProfileRequirementDiffItem[];
    changed: MarketProfileRequirementDiffItem[];
  };
  topSkills: MarketProfileStringListDiff;
  proofExpectations: MarketProfileStringListDiff;
  trendSignals: MarketProfileStringListDiff;
  sourceRefs: MarketProfileSourceRefDiff;
  confidence: MarketProfileConfidenceDiff;
  meta: ContractMeta;
}

export interface RoleMarketProfileVersion {
  id: string;
  roleProfileId: string;
  version: number;
  status: RoleMarketProfileVersionStatus;
  sourceMode: SourceMode;
  profile: RoleMarketProfile;
  aggregateId: string | null;
  previousVersionId: string | null;
  sourceRefs: SourceReference[];
  changeSummary: string;
  profileDiff: MarketProfileDiff | null;
  validationResult: MarketProfileValidationResult | null;
  createdBy: string;
  createdAt: ISODateString;
  reviewedBy: string | null;
  reviewedAt: ISODateString | null;
  publishedAt: ISODateString | null;
  rollbackOfVersionId: string | null;
  meta: ContractMeta;
}

export const MARKET_PROFILE_VALIDATION_SEVERITIES = [
  "blocker",
  "warning",
  "info",
] as const;

export type MarketProfileValidationSeverity =
  (typeof MARKET_PROFILE_VALIDATION_SEVERITIES)[number];

export const MARKET_PROFILE_VALIDATION_STATUSES = [
  "passed",
  "passed_with_warnings",
  "blocked",
] as const;

export type MarketProfileValidationStatus =
  (typeof MARKET_PROFILE_VALIDATION_STATUSES)[number];

export interface MarketProfileValidationFinding {
  id: string;
  severity: MarketProfileValidationSeverity;
  code:
    | "missing_source_reference"
    | "stale_source"
    | "low_confidence"
    | "unsupported_claim"
    | "invalid_contract"
    | "unsafe_copy"
    | "sample_too_small";
  message: string;
  path: string;
  sourceRefIds: string[];
}

export interface MarketProfileValidationResult {
  profileVersionId: string;
  status: MarketProfileValidationStatus;
  canPublish: boolean;
  checkedAt: ISODateString;
  findings: MarketProfileValidationFinding[];
  sourceIntegrity: {
    sourceRefCount: number;
    missingSourceRefCount: number;
    staleSourceRefCount: number;
  };
  freshnessHours: number;
  confidence: number;
  meta: ContractMeta;
}

export const MARKET_SOURCE_HEALTH_STATUSES = [
  "healthy",
  "degraded",
  "down",
  "disabled",
  "unknown",
] as const;

export type MarketSourceHealthStatus = (typeof MARKET_SOURCE_HEALTH_STATUSES)[number];

export interface MarketSourceHealth {
  sourceId: string;
  status: MarketSourceHealthStatus;
  checkedAt: ISODateString;
  latestRunId: string | null;
  latestRunStatus: MarketIngestionRunStatus | null;
  lastSuccessfulRunAt: ISODateString | null;
  consecutiveFailures: number;
  freshnessAgeHours: number | null;
  documentsLastRun: number;
  signalsLastRun: number;
  errorSummary: string | null;
  meta: ContractMeta;
}

export interface OperatorMarketSourceHealthItem {
  source: MarketSource;
  health: MarketSourceHealth;
  latestRun: MarketIngestionRun | null;
}

export interface OperatorMarketSourcesResponse {
  sources: OperatorMarketSourceHealthItem[];
  meta: ContractMeta;
}

export interface OperatorMarketIngestionRunsResponse {
  runs: MarketIngestionRun[];
  meta: ContractMeta;
}

export interface OperatorMarketRoleAggregateItem {
  roleProfileId: string;
  roleTitle: string;
  category: RoleCategory;
  latestAggregate: RoleMarketSignalAggregate | null;
}

export interface OperatorMarketAggregatesResponse {
  aggregates: OperatorMarketRoleAggregateItem[];
  meta: ContractMeta;
}

export interface OperatorMarketProfileDraftItem {
  roleProfileId: string;
  roleTitle: string;
  category: RoleCategory;
  draftVersion: RoleMarketProfileVersion;
  currentPublishedVersion: RoleMarketProfileVersion | null;
  validationStatus: MarketProfileValidationStatus | null;
  canPublish: boolean;
  blockerCount: number;
  warningCount: number;
  sourceRefCount: number;
  staleSourceRefCount: number;
  missingSourceRefCount: number;
  materiality: MarketProfileDiffMateriality | null;
}

export interface OperatorMarketProfileDraftsResponse {
  drafts: OperatorMarketProfileDraftItem[];
  meta: ContractMeta;
}

export interface OperatorMarketProfileVersionItem {
  roleProfileId: string;
  roleTitle: string;
  category: RoleCategory;
  profileVersion: RoleMarketProfileVersion;
  currentPublishedVersion: RoleMarketProfileVersion | null;
  isCurrentPublished: boolean;
  canRollback: boolean;
}

export interface OperatorMarketProfileVersionsResponse {
  versions: OperatorMarketProfileVersionItem[];
  meta: ContractMeta;
}

export interface OperatorMarketProfileActionResponse {
  profileVersion: RoleMarketProfileVersion;
  auditAction: MarketReviewAction;
  meta: ContractMeta;
}

export const OPERATOR_MARKET_INGESTION_TRIGGER_STATUSES = [
  "started",
  "already_running",
] as const;

export type OperatorMarketIngestionTriggerStatus =
  (typeof OPERATOR_MARKET_INGESTION_TRIGGER_STATUSES)[number];

export interface OperatorMarketIngestionTriggerResult {
  documentsDiscovered: number;
  documentsCreated: number;
  documentsDeduped: number;
  documentsFailed: number;
  warnings: string[];
}

export interface OperatorMarketIngestionTriggerResponse {
  status: OperatorMarketIngestionTriggerStatus;
  run: MarketIngestionRun;
  result: OperatorMarketIngestionTriggerResult | null;
  meta: ContractMeta;
}

export const MARKET_REVIEW_ACTIONS = [
  "submit_for_review",
  "approve",
  "reject",
  "publish",
  "rollback",
  "archive",
  "request_changes",
] as const;

export type MarketReviewActionType = (typeof MARKET_REVIEW_ACTIONS)[number];

export interface MarketReviewAction {
  id: string;
  profileVersionId: string;
  action: MarketReviewActionType;
  actorUserId: string;
  reason: string;
  beforeStatus: RoleMarketProfileVersionStatus;
  afterStatus: RoleMarketProfileVersionStatus;
  createdAt: ISODateString;
  meta: ContractMeta;
}

export interface MarketSourceFetchRequest {
  source: MarketSource;
  runId: string;
  since: ISODateString | null;
  limit: number;
  query?: string | null;
  roleProfileId?: string | null;
  region?: string | null;
  country?: string | null;
  page?: number;
  pageLimit?: number;
  dryRun: boolean;
}

export interface MarketSourceFetchResult {
  sourceId: string;
  runId: string;
  documents: MarketRawDocument[];
  health: MarketSourceHealth;
  warnings: string[];
}
