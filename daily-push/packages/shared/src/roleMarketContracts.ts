export type ContractVersion = "role-market.v1";

export type ISODateString = string;

export type SourceMode = "curated" | "hybrid" | "live";

export type ConfidenceLevel = "low" | "medium" | "high";

export interface ContractMeta {
  contractVersion: ContractVersion;
  generatedAt: ISODateString;
  sourceMode: SourceMode;
  seedVersion: string;
  warnings: ContractWarning[];
}

export interface ContractWarning {
  code:
    | "source_stale"
    | "low_confidence"
    | "ai_summary_unavailable"
    | "partial_input"
    | "entitlement_limited"
    | "feature_flag_disabled"
    | "dependency_unavailable";
  message: string;
}

export interface SourceReference {
  id: string;
  title: string;
  url: string | null;
  publisher: string | null;
  sourceType:
    | "industry_report"
    | "job_post"
    | "company_career_page"
    | "curated_expert"
    | "user_added_jd"
    | "outcome_signal";
  region: string | null;
  publishedAt: ISODateString | null;
  capturedAt: ISODateString;
  confidence: number;
}

export interface ApiErrorResponse {
  error: {
    code:
      | "validation_error"
      | "unauthorized"
      | "forbidden"
      | "not_found"
      | "feature_disabled"
      | "quota_exceeded"
      | "dependency_unavailable"
      | "contract_validation_failed";
    message: string;
    fieldErrors?: Record<string, string>;
    featureKey?: string;
    upgradePlan?: "pro" | "sprint" | null;
    requestId?: string;
  };
}

export type RoleType = "existing" | "emerging" | "evolving";

export type AiImpact = "replaced" | "changed" | "amplified" | "created_by_ai";

export type RequirementCategory =
  | "skill"
  | "tool"
  | "domain"
  | "system_design"
  | "production"
  | "communication"
  | "business_context"
  | "ai_leverage";

export type RequirementPriority = "must_have" | "important" | "nice_to_have";

export type ProficiencyLevel = "aware" | "working" | "proficient" | "advanced";

export type RoleCategory =
  | "software_engineering"
  | "data"
  | "ai"
  | "cloud"
  | "security"
  | "product"
  | "qa"
  | "platform";

export type SeniorityBand = "junior" | "mid" | "senior" | "staff";

export interface RoleRequirement {
  id: string;
  category: RequirementCategory;
  label: string;
  description: string;
  priority: RequirementPriority;
  expectedLevel: ProficiencyLevel;
  keywords: string[];
  proofExpected: string[];
  interviewSignals: string[];
  sourceRefs: string[];
  confidence: number;
}

export interface RoleTrendSignal {
  id: string;
  label: string;
  summary: string;
  direction: "increasing" | "stable" | "declining" | "uncertain";
  impact: AiImpact;
  affectedSkills: string[];
  sourceRefs: string[];
  confidence: number;
}

export interface RoleTransitionPath {
  fromRole: string;
  fitLevel: "easy" | "moderate" | "hard";
  transferableSkills: string[];
  likelyGaps: string[];
  recommendedProof: string[];
}

export interface RoleMarketProfile {
  id: string;
  slug: string;
  title: string;
  category: RoleCategory;
  roleType: RoleType;
  aiImpact: AiImpact;
  shortDescription: string;
  marketSummary: string;
  seniorityBands: SeniorityBand[];
  requirements: RoleRequirement[];
  trendSignals: RoleTrendSignal[];
  transitionPaths: RoleTransitionPath[];
  interviewTopics: string[];
  proofExpectations: string[];
  relatedRoleIds: string[];
  sourceRefs: SourceReference[];
  lastUpdated: ISODateString;
  confidence: number;
  meta: ContractMeta;
}

export interface CandidateRoleInput {
  currentRole: string | null;
  yearsExperience: number | null;
  region: string | null;
  skills: string[];
  strongestAreas: string[];
  preferredDirections: Array<
    | "backend"
    | "frontend"
    | "full_stack"
    | "ai"
    | "cloud"
    | "security"
    | "data"
    | "platform"
    | "qa"
    | "product_engineering"
  >;
  avoidedDirections: string[];
  workStyle: Array<
    | "building_products"
    | "systems"
    | "research"
    | "customer_facing"
    | "operations"
    | "leadership"
  >;
  targetSeniority: SeniorityBand | null;
  freeTextContext: string | null;
}

export interface RoleRecommendationRequest {
  input: CandidateRoleInput;
  limit?: number;
}

export interface RoleRecommendation {
  roleProfileId: string;
  title: string;
  fitScore: number;
  transitionDifficulty: "easy" | "moderate" | "hard";
  fitReasons: string[];
  likelyGaps: string[];
  proofToBuild: string[];
  whyNow: string[];
  confidence: number;
  lockedPremiumSections?: Array<
    "full_readiness"
    | "proof_plan"
    | "role_comparison"
    | "sprint_plan"
  >;
}

export interface RoleRecommendationResponse {
  recommendations: RoleRecommendation[];
  interpretedInput: CandidateRoleInput;
  marketCaveat: string;
  meta: ContractMeta;
}

export interface ListRolesQuery {
  q?: string;
  category?: RoleCategory;
  roleType?: RoleType;
  aiImpact?: AiImpact;
  limit?: number;
}

export interface RoleMarketCard {
  id: string;
  slug: string;
  title: string;
  category: RoleCategory;
  roleType: RoleType;
  aiImpact: AiImpact;
  shortDescription: string;
  topRequirements: string[];
  lastUpdated: ISODateString;
  confidence: number;
}

export interface ListRolesResponse {
  roles: RoleMarketCard[];
  meta: ContractMeta;
}

export type TargetRoleStatus =
  | "saved"
  | "assessed"
  | "upgrade_plan_created"
  | "sprint_active"
  | "paused"
  | "archived";

export interface TargetRole {
  id: string;
  userId: string;
  roleProfileId: string;
  title: string;
  status: TargetRoleStatus;
  candidateInput: CandidateRoleInput | null;
  latestAssessmentId: string | null;
  linkedGoalId: string | null;
  linkedSprintId: string | null;
  createdFrom:
    | "market_analyzer"
    | "resume_analysis"
    | "manual"
    | "application_workspace";
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface CreateTargetRoleRequest {
  roleProfileId: string;
  candidateInput?: CandidateRoleInput;
  recommendationSnapshot?: RoleRecommendation;
  clientDraftId?: string;
}

export interface CreateTargetRoleResponse {
  targetRole: TargetRole;
  nextAction: "generate_readiness" | "view_workspace";
}

export type EvidenceSourceType =
  | "resume"
  | "linkedin"
  | "manual"
  | "github"
  | "portfolio"
  | "sprint_artifact"
  | "application_outcome"
  | "user_correction";

export interface EvidenceRef {
  id: string;
  sourceType: EvidenceSourceType;
  sourceId: string | null;
  sourceSection: string | null;
  originalSnippet: string;
  createdAt: ISODateString;
}

export interface EvidenceClaim {
  id: string;
  normalizedClaim: string;
  skillLabels: string[];
  roleLabels: string[];
  projectName: string | null;
  companyName: string | null;
  metric: string | null;
  senioritySignal: "none" | "some" | "strong";
  evidenceRefs: EvidenceRef[];
  confidence: number;
  userVerified: boolean;
}

export interface CandidateEvidenceProfile {
  userId: string;
  headline: string | null;
  yearsExperience: number | null;
  skills: string[];
  roles: Array<{
    title: string | null;
    company: string | null;
    dates: string | null;
    bullets: string[];
  }>;
  projects: Array<{
    name: string;
    summary: string;
    techStack: string[];
    proofLinks: string[];
  }>;
  claims: EvidenceClaim[];
  updatedAt: ISODateString;
  meta: ContractMeta;
}

export type CoverageStatus = "covered" | "weak" | "missing" | "not_applicable";

export type ReadinessVerdict = "apply_now" | "apply_after_edits" | "upgrade_first";

export interface RequirementCoverage {
  requirementId: string;
  requirementLabel: string;
  status: CoverageStatus;
  priority: RequirementPriority;
  score: number;
  matchedEvidenceClaimIds: string[];
  evidenceSnippets: string[];
  gapReason: string | null;
  suggestedAction: string;
  confidence: number;
}

export interface RoleReadinessScoreBreakdown {
  overall: number;
  skillCoverage: number;
  proofCoverage: number;
  seniorityAlignment: number;
  productionReadiness: number;
  interviewReadiness: number;
  aiLeverageReadiness: number;
}

export interface RoleReadinessReport {
  id: string;
  userId: string;
  targetRoleId: string;
  roleProfileId: string;
  verdict: ReadinessVerdict;
  label: "early" | "building" | "close" | "ready";
  summary: string;
  score: RoleReadinessScoreBreakdown;
  coverage: RequirementCoverage[];
  strengths: string[];
  criticalGaps: string[];
  missingProof: string[];
  interviewRisks: string[];
  recommendedNextStep: string;
  sourceRefs: string[];
  generatedAt: ISODateString;
  confidence: number;
  meta: ContractMeta;
}

export interface GenerateReadinessRequest {
  targetRoleId: string;
  includeAiSummary?: boolean;
}

export interface GenerateReadinessResponse {
  report: RoleReadinessReport;
  quota?: {
    featureKey: "role_readiness_reports.monthly";
    remaining: number | null;
    limitValue: number | null;
  };
}

export type ProofTaskType =
  | "project"
  | "case_study"
  | "resume_rewrite"
  | "interview_story"
  | "learning_module"
  | "portfolio_artifact";

export interface ProofRecommendation {
  id: string;
  type: ProofTaskType;
  title: string;
  gapAddressed: string;
  whyItMatters: string;
  expectedOutput: string;
  acceptanceCriteria: string[];
  estimatedHours: number;
  difficulty: "small" | "medium" | "large";
  linkedRequirementIds: string[];
}

export interface GapToProofRequest {
  targetRoleId: string;
  readinessReportId: string;
  maxItems?: number;
}

export interface GapToProofResponse {
  targetRoleId: string;
  readinessReportId: string;
  proofRecommendations: ProofRecommendation[];
  meta: ContractMeta;
}

export interface UpgradePlanTopic {
  title: string;
  rationale: string;
  linkedGap: string;
  linkedRequirementIds: string[];
  targetOutcome: string;
  estimatedWeeks: number;
  priority: number;
}

export interface UpgradePlan {
  id: string;
  userId: string;
  targetRoleId: string;
  readinessReportId: string;
  title: string;
  durationWeeks: number;
  weeklyCommitmentHours: number;
  topics: UpgradePlanTopic[];
  proofTasks: ProofRecommendation[];
  successEvidence: string[];
  risks: string[];
  linkedGoalId: string | null;
  linkedSprintId: string | null;
  createdAt: ISODateString;
  meta: ContractMeta;
}

export interface CreateUpgradePlanRequest {
  targetRoleId: string;
  readinessReportId?: string;
  durationWeeks?: 2 | 4 | 6 | 8;
  weeklyCommitmentHours?: number;
}

export interface CreateUpgradePlanResponse {
  upgradePlan: UpgradePlan;
  goalId: string | null;
  sprintId: string | null;
  nextAction: "start_sprint" | "review_plan";
}

export interface CreateGoalFromTargetRoleResponse {
  targetRoleId: string;
  upgradePlanId: string;
  goalId: string;
  goalUrl: string;
  reusedGoal: boolean;
}

export interface StartUpgradePlanSprintResponse {
  targetRoleId: string;
  upgradePlanId: string;
  goalId: string;
  sprintId: string;
  goalUrl: string;
  todayUrl: string;
  reusedGoal: boolean;
  reusedSprint: boolean;
}

export type TargetRoleDecompositionTopicStatus =
  | "not_started"
  | "pending"
  | "in_progress"
  | "completed"
  | "failed";

export type TargetRoleDecompositionPipelineStatus =
  | "idle"
  | "running"
  | "done"
  | "partial"
  | "failed";

export interface TargetRoleDecompositionTopic {
  topicId: string | null;
  title: string;
  status: TargetRoleDecompositionTopicStatus;
  nodesCreated: number;
  usingFallback: boolean;
  error: string | null;
}

export interface TargetRoleDecompositionStatusResponse {
  targetRoleId: string;
  upgradePlanId: string;
  goalId: string | null;
  pipelineStatus: TargetRoleDecompositionPipelineStatus;
  topics: TargetRoleDecompositionTopic[];
  nodesCreated: number;
  fallbackTaskCount: number;
  canStart: boolean;
  canRetry: boolean;
  message: string;
  config: {
    requestTimeoutMs: number;
    maxAttempts: number;
    topicConcurrency: number;
  };
}

export interface StartTargetRoleDecompositionResponse
  extends TargetRoleDecompositionStatusResponse {
  accepted: boolean;
  retryMode: boolean;
}

export interface ProofEvidenceStatusResponse {
  targetRoleId: string;
  linkedGoalId: string | null;
  evidenceClaimCount: number;
  publishedArtifactCount: number;
  publishableArtifactCount: number;
  latestEvidenceAt: ISODateString | null;
  latestReadinessReportId: string | null;
  reassessRecommended: boolean;
  message: string;
}

export interface PublishProofEvidenceResponse extends ProofEvidenceStatusResponse {
  publishedCount: number;
  publishedClaims: EvidenceClaim[];
}

export interface ApplicationWorkspace {
  id: string;
  userId: string;
  targetRoleId: string | null;
  companyName: string | null;
  jobTitle: string | null;
  jdText: string | null;
  resumeText: string | null;
  readinessReportId: string | null;
  tailoredResumeId: string | null;
  outcome:
    | "draft"
    | "applied"
    | "recruiter_screen"
    | "interviewing"
    | "offer"
    | "rejected"
    | "archived";
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface ReassessmentRequest {
  targetRoleId: string;
  previousReadinessReportId: string;
  includeNewProofSince?: ISODateString;
}

export interface ReassessmentResult {
  targetRoleId: string;
  previousReadinessReportId: string;
  newReadinessReportId: string;
  scoreDelta: number;
  improvedRequirements: string[];
  stillWeakRequirements: string[];
  newRecommendedActions: string[];
  summary: string;
  meta: ContractMeta;
}
