import axios from "axios";
import type {
  CandidateEvidenceProfile,
  CandidateRoleInput,
  CreateGoalFromTargetRoleResponse,
  CreateUpgradePlanResponse,
  GapToProofResponse,
  ListRolesQuery,
  ListRolesResponse,
  ProofEvidenceStatusResponse,
  PublishProofEvidenceResponse,
  CreateTargetRoleRequest,
  CreateTargetRoleResponse,
  GenerateReadinessResponse,
  RoleMarketProfile,
  RoleReadinessReport,
  RoleRecommendationResponse,
  StartUpgradePlanSprintResponse,
  StartTargetRoleDecompositionResponse,
  TargetRoleDecompositionStatusResponse,
  TargetRole,
  UpgradePlan,
} from "@daily-push/shared";

export type {
  CandidateEvidenceProfile,
  CandidateRoleInput,
  CreateGoalFromTargetRoleResponse,
  CreateUpgradePlanResponse,
  GapToProofResponse,
  GenerateReadinessResponse,
  ListRolesResponse,
  ProofEvidenceStatusResponse,
  ProofRecommendation,
  PublishProofEvidenceResponse,
  RoleMarketCard,
  RoleMarketProfile,
  RoleReadinessReport,
  RoleRecommendation,
  RoleRecommendationResponse,
  StartUpgradePlanSprintResponse,
  StartTargetRoleDecompositionResponse,
  TargetRoleDecompositionStatusResponse,
  TargetRoleDecompositionTopic,
  TargetRole,
  UpgradePlan,
} from "@daily-push/shared";

const api = axios.create({ baseURL: "/api" });

// Inject JWT on every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("dp_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Redirect to /login on 401
api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("dp_token");
      localStorage.removeItem("dp_user");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  },
);

export default api;

export const trackEvent = (data: {
  eventKey: string;
  goalId?: string;
  sessionId?: string;
  properties?: Record<string, unknown>;
}) => api.post('/events', data).then((r) => r.data);

// Auth
export const register = (data: {
  email: string;
  password: string;
  name: string;
}) => api.post("/auth/register", data).then((r) => r.data);
export const login = (data: { email: string; password: string }) =>
  api.post("/auth/login", data).then((r) => r.data);
export const getMe = () => api.get("/auth/me").then((r) => r.data);

// Intake
export const startGoalIntake = () =>
  api.post("/intake/start").then((r) => r.data);
export const saveRawInput = (
  goalId: string,
  content: string,
  source = "goal_intake",
) => api.post("/intake/raw", { goalId, content, source }).then((r) => r.data);
export const getClarifyingQuestions = (goalId: string) =>
  api.post("/intake/clarify", { goalId }).then((r) => r.data);
export type SprintType =
  | "standard"
  | "senior_engineer"
  | "ai_engineer_transition";
export type SprintStatus =
  | "planned"
  | "on_track"
  | "at_risk"
  | "behind"
  | "complete";

export interface GoalSprintInput {
  sprintType: SprintType;
  targetRole?: string | null;
  targetCompany?: string | null;
  targetDate?: string | null;
  weeklyCommitmentHours?: number | null;
  currentBlockers?: string[];
  successEvidence?: string[];
}

export interface GoalSprint {
  sprintType: SprintType;
  templateLabel: string;
  targetRole: string | null;
  targetCompany: string | null;
  targetDate: string | null;
  weeklyCommitmentHours: number | null;
  currentBlockers: string[];
  successEvidence: string[];
  status: SprintStatus;
  riskScore: number | null;
  completionScore: number | null;
  weeklyTargetMinutes: number | null;
  recommendedDailyMinutes: number | null;
  forecastedCompletionDate: string | null;
  bufferDays: number | null;
  nextReviewAt: string | null;
  createdAt: string;
  updatedAt: string;
  lastHealthComputedAt: string | null;
}

export interface GoalPlanHealth {
  hasSprint: boolean;
  sprint: GoalSprint | null;
  status: SprintStatus;
  riskScore: number;
  completionScore: number;
  weeklyTargetMinutes: number | null;
  recommendedDailyMinutes: number | null;
  estimatedWeeksTotal: number | null;
  estimatedWeeksRemaining: number | null;
  forecastedCompletionDate: string | null;
  targetDate: string | null;
  bufferDays: number | null;
  totalTopics: number;
  readyTopics: number;
  failedTopics: number;
  totalNodes: number;
  completedNodes: number;
  availableNodes: number;
  completedSessions: number;
  sessionsLast7Days: number;
  lastCompletedSessionAt: string | null;
  summary: string;
}

export interface ResumeSummary {
  headline: string | null;
  yearsExperience: number | null;
  coreSkills: string[];
  strengths: string[];
  evidenceAreas: string[];
  gapsOrConcerns: string[];
  resumeSections?: {
    summary: string | null;
    skills: string[];
    experience: string[];
    projects: string[];
    education: string[];
    certifications: string[];
  };
  experienceItems?: Array<{
    company: string | null;
    role: string | null;
    dates: string | null;
    bullets: string[];
    technologies: string[];
    quantifiedOutcomes: string[];
  }>;
  projectItems?: Array<{
    name: string | null;
    description: string | null;
    techStack: string[];
    bullets: string[];
    links: string[];
  }>;
  evidenceClaims?: Array<{
    claim: string;
    sourceSection: string | null;
    sourceSnippet: string;
    confidence: number;
  }>;
}

export interface JdRequirement {
  requirement: string;
  type: "skill" | "experience" | "responsibility" | "domain" | "seniority" | "tool" | "soft_skill";
  priority: "required" | "preferred" | "nice_to_have";
  keywords: string[];
  evidenceNeeded: string;
}

export interface ParsedJobDescription {
  targetRole: string | null;
  senioritySignal: string | null;
  mustHaveSkills: string[];
  preferredSkills: string[];
  evidenceSignals: string[];
  responsibilities: string[];
  hiringGoals: string[];
  jdRequirements?: JdRequirement[];
}

export interface GapReportItem {
  name: string;
  reason: string;
  priority: "high" | "medium" | "low";
}

export interface MissingProofItem {
  area: string;
  evidenceNeeded: string;
  reason: string;
}

export interface RequirementCoverageItem {
  requirement: string;
  status: "covered" | "weak" | "missing";
  priority: "high" | "medium" | "low";
  resumeEvidence: string | null;
  sourceSnippet?: string | null;
  sourceSection?: string | null;
  confidence?: number;
  action: string;
}

export interface GoalGapReport {
  targetRole: string | null;
  readinessLabel: "early" | "building" | "close";
  summary: string;
  requirementCoverage: RequirementCoverageItem[];
  strengths: string[];
  missingSkills: GapReportItem[];
  missingProof: MissingProofItem[];
  sprintEdits: string[];
  interviewRisks: string[];
  portfolioSuggestion: string | null;
  confidence: number;
}

export interface TailoredResume {
  targetRole: string | null;
  headline: string;
  professionalSummary: string;
  skills: string[];
  experienceBullets: string[];
  projectBullets: string[];
  missingEvidenceWarnings: string[];
  atsKeywords: string[];
  bulletEvidence?: Array<{
    bullet: string;
    sourceSnippet: string;
  }>;
  coverNote: string | null;
}

export interface ResumeFitSnapshot {
  targetRole: string | null;
  fitScore: number;
  fitLabel: "early" | "building" | "close";
  headline: string;
  summary: string;
  topStrengths: string[];
  topGaps: Array<{
    name: string;
    reason: string;
    priority: "high" | "medium" | "low";
  }>;
  missingKeywords: string[];
  premiumPreview: string[];
}

export type RepoSummarySource =
  | "github_readme"
  | "notes_only"
  | "mixed"
  | "url_only";

export interface RepoSummary {
  repoUrl: string;
  repoName: string | null;
  inputContext: string | null;
  summary: string;
  inspectedFiles: string[];
  demonstratedSkills: string[];
  strengthAreas: string[];
  evidenceSignals: string[];
  missingSignals: string[];
  recommendedArtifacts: string[];
  confidence: number;
  source: RepoSummarySource;
}

export interface GoalGapReportRecord {
  targetRole: string | null;
  targetCompany: string | null;
  jdText: string | null;
  resumeText: string | null;
  resumeSummary: ResumeSummary | null;
  parsedJd: ParsedJobDescription | null;
  repoUrl: string | null;
  repoSummary: RepoSummary | null;
  gapReport: GoalGapReport | null;
  tailoredResume: TailoredResume | null;
  tailoredResumeGeneratedAt: string | null;
  lastAnalyzedAt: string | null;
}

export interface ResumeApplicationWorkspace extends GoalGapReportRecord {
  id: string;
  title: string;
  linkedGoalId: string | null;
  linkedSprintCreatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GapReportQuotaSummary {
  featureKey: string;
  remaining: number | null;
  limitValue: number | null;
}

export interface GoalGapReportResponse extends GoalGapReportRecord {
  quota?: GapReportQuotaSummary;
}

export type MockInterviewMode =
  | "system_design"
  | "behavioral"
  | "project_deep_dive";

export interface MockInterviewTurn {
  id: string;
  turnIndex: number;
  role: "interviewer" | "candidate";
  content: string;
  createdAt: string;
}

export interface MockInterviewScoreDimension {
  dimension: "structure" | "depth" | "communication" | "ownership";
  score: number;
  feedback: string;
}

export interface MockInterviewEvaluation {
  overallScore: number;
  verdict: "needs_work" | "solid" | "strong";
  summary: string;
  rubricScores: MockInterviewScoreDimension[];
  strengths: string[];
  improvements: string[];
  retryPlan: string[];
  suggestedSprintEdits: string[];
}

export interface MockInterviewRun {
  id: string;
  goalId: string;
  mode: MockInterviewMode;
  status: "in_progress" | "completed" | "abandoned";
  targetRole: string | null;
  focusArea: string | null;
  openingPrompt: string;
  latestPrompt: string;
  transcriptSummary: string | null;
  turnCount: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  turns: MockInterviewTurn[];
  evaluation: MockInterviewEvaluation | null;
}

export interface MockInterviewHistoryItem {
  id: string;
  goalId: string;
  mode: MockInterviewMode;
  status: "in_progress" | "completed" | "abandoned";
  targetRole: string | null;
  focusArea: string | null;
  overallScore: number | null;
  transcriptSummary: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface MockInterviewRunResponse extends MockInterviewRun {
  quota?: GapReportQuotaSummary;
}

export interface WeeklyRecoveryPlan {
  status: "steady" | "catch_up" | "reduce_scope" | "critical";
  headline: string;
  catchUpMinutes: number | null;
  focusAreas: string[];
  actions: string[];
  riskSummary: string;
  shouldReduceScope: boolean;
  nextReviewDate: string | null;
}

export interface WeeklyCheckinRecord {
  weekStart: string;
  confidence: number;
  momentum: number;
  blockers: string[];
  wins: string[];
  notes: string | null;
  recoveryPlan: WeeklyRecoveryPlan | null;
  createdAt: string;
  updatedAt: string;
}

export interface GoalWeeklyCheckinState {
  due: boolean;
  weekStart: string;
  latestCheckin: WeeklyCheckinRecord | null;
}

export interface WeeklyReport {
  goalId: string;
  goalTitle: string;
  targetRole: string | null;
  weekStart: string;
  weekEnd: string;
  checkinDue: boolean;
  latestCheckin: WeeklyCheckinRecord | null;
  recoveryPlan: WeeklyRecoveryPlan;
  planHealth: GoalPlanHealth;
  stats: {
    sessionsThisWeek: number;
    reviewSessionsThisWeek: number;
    studyMinutesThisWeek: number;
    averageConfidence: number | null;
    currentStreak: number;
    totalSessions: number;
    weeklyTargetMinutes: number | null;
    weeklyTargetProgressPct: number | null;
  };
  highlights: string[];
  weakAreas: string[];
}

export const processIntake = (
  goalId: string,
  sprintConfig?: GoalSprintInput,
) =>
  api.post("/intake/process", { goalId, sprintConfig }).then((r) => r.data);

// Pipeline types
export type PipelineStepStatus = "pending" | "running" | "done" | "failed";
export type PipelineRunStatus = "running" | "done" | "partial" | "failed";
export interface PipelineStep {
  id: string;
  label: string;
  status: PipelineStepStatus;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}
export interface PipelineRun {
  type: "intake" | "decompose";
  status: PipelineRunStatus;
  steps: PipelineStep[];
  startedAt: string;
  completedAt?: string;
  emailSent: boolean;
}

export interface BillingPlan {
  key: "free" | "pro" | "sprint";
  name: string;
  description: string;
  monthlyPriceCents: number | null;
  yearlyPriceCents: number | null;
  highlight: boolean;
  ctaLabel: string;
  features: string[];
}

export interface BillingSubscription {
  id: string;
  provider: "manual" | "stripe";
  plan_key: "free" | "pro" | "sprint";
  status: string;
  interval_key: "month" | "year" | "lifetime";
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

export interface CurrentPlanState {
  planKey: "free" | "pro" | "sprint";
  source: "free" | "subscription";
  plan: BillingPlan;
  subscription: BillingSubscription | null;
}

export interface EntitlementSummary {
  featureKey: string;
  enabled: boolean;
  limitValue: number | null;
  resetPeriod: "daily" | "weekly" | "monthly" | "lifetime" | null;
  sourcePlanKey: "free" | "pro" | "sprint";
  expiresAt: string | null;
  usage: number;
  remaining: number | null;
}

// Goals
export const getGoals = () => api.get("/goals").then((r) => r.data);
export const getPrimaryGoal = () =>
  api.get("/goals/primary").then((r) => r.data);
export const getGoal = (id: string) =>
  api.get(`/goals/${id}`).then((r) => r.data);
export const confirmGoal = (id: string, data?: { availableMinsDay?: number }) =>
  api.post(`/goals/${id}/confirm`, data ?? {}).then((r) => r.data);
export const saveGoalSprint = (id: string, data: GoalSprintInput) =>
  api
    .post(`/goals/${id}/sprint`, data)
    .then((r) => r.data as { sprint: GoalSprint | null; planHealth: GoalPlanHealth });
export const getGoalPlanHealth = (id: string) =>
  api.get(`/goals/${id}/plan-health`).then((r) => r.data as GoalPlanHealth);
export const rebaselineGoalSprint = (id: string, data?: Partial<GoalSprintInput>) =>
  api
    .post(`/goals/${id}/rebaseline`, data ?? {})
    .then((r) => r.data as GoalPlanHealth);
export const correctGoal = (id: string, correction: string) =>
  api.post(`/goals/${id}/correct`, { correction }).then((r) => r.data);
export const decomposeGoal = (id: string) =>
  api.post(`/goals/${id}/decompose`).then((r) => r.data);
export const getGoalNodes = (id: string) =>
  api.get(`/goals/${id}/nodes`).then((r) => r.data);
export const getPipelineRun = (id: string) =>
  api.get(`/goals/${id}/pipeline`).then((r) => r.data as PipelineRun);
export const retryDecompose = (id: string) =>
  api.post(`/goals/${id}/decompose/retry`).then((r) => r.data);
export const saveGoalResume = (
  id: string,
  data: {
    rawText: string;
    source?: "upload" | "linkedin_paste" | "manual";
  },
) =>
  api
    .post(`/goals/${id}/resume`, data)
    .then((r) => r.data as { resumeId: string; resumeSummary: ResumeSummary });
export const saveGoalJobDescription = (
  id: string,
  data: {
    targetRole?: string | null;
    targetCompany?: string | null;
    jdText: string;
  },
) =>
  api
    .post(`/goals/${id}/job-description`, data)
    .then((r) => r.data as { parsedJd: ParsedJobDescription });
export const saveGoalRepoImport = (
  id: string,
  data: {
    repoUrl: string;
    repoContext?: string | null;
  },
) =>
  api
    .post(`/goals/${id}/repo-import`, data)
    .then((r) => r.data as { repoSummary: RepoSummary });
export const getGoalGapReport = (id: string) =>
  api.get(`/goals/${id}/gap-report`).then((r) => r.data as GoalGapReportRecord);
export const rebuildGoalGapReport = (id: string) =>
  api
    .post(`/goals/${id}/gap-report/rebuild`)
    .then((r) => r.data as GoalGapReportResponse);
export const generateTailoredResume = (id: string) =>
  api
    .post(`/goals/${id}/tailored-resume`)
    .then((r) => r.data as GoalGapReportRecord);
export const getResumeWorkspace = () =>
  api.get("/resume/workspace").then((r) => r.data as GoalGapReportRecord);
export const saveResumeWorkspaceResume = (
  data: {
    rawText: string;
    source?: "upload" | "linkedin_paste" | "manual";
  },
) =>
  api
    .post("/resume/resume", data)
    .then((r) => r.data as { resumeId: string; resumeSummary: ResumeSummary });
export const saveResumeWorkspaceJobDescription = (
  data: {
    targetRole?: string | null;
    targetCompany?: string | null;
    jdText: string;
  },
) =>
  api
    .post("/resume/job-description", data)
    .then((r) => r.data as { parsedJd: ParsedJobDescription });
export const rebuildResumeWorkspaceGapReport = () =>
  api
    .post("/resume/gap-report/rebuild")
    .then((r) => r.data as GoalGapReportResponse);
export const generateResumeWorkspaceTailoredResume = () =>
  api
    .post("/resume/tailored-resume")
    .then((r) => r.data as GoalGapReportRecord);
export const previewResumeFit = (data: {
  rawText: string;
  jdText: string;
}) =>
  api
    .post("/resume/preview", data)
    .then((r) => r.data as ResumeFitSnapshot);

export const getMarketRoles = (params?: ListRolesQuery) =>
  api
    .get("/market/roles", { params })
    .then((r) => r.data as ListRolesResponse);
export const getMarketRole = (roleId: string) =>
  api
    .get(`/market/roles/${roleId}`)
    .then((r) => r.data as RoleMarketProfile);
export const recommendMarketRoles = (data: {
  input: CandidateRoleInput;
  limit?: number;
}) =>
  api
    .post("/market/recommend-roles", data)
    .then((r) => r.data as RoleRecommendationResponse);
export const getTargetRoles = () =>
  api
    .get("/target-roles")
    .then((r) => r.data as TargetRole[]);
export const getTargetRole = (id: string) =>
  api
    .get(`/target-roles/${id}`)
    .then((r) => r.data as TargetRole);
export const getTargetRoleEvidence = (id: string) =>
  api
    .get(`/target-roles/${id}/evidence`)
    .then((r) => r.data as CandidateEvidenceProfile);
export const getTargetRoleReadiness = (id: string) =>
  api
    .get(`/target-roles/${id}/readiness`)
    .then((r) => r.data as { report: RoleReadinessReport });
export const generateTargetRoleReadiness = (
  id: string,
  data: { includeAiSummary?: boolean } = {},
) =>
  api
    .post(`/target-roles/${id}/readiness`, data)
    .then((r) => r.data as GenerateReadinessResponse);
export const generateTargetRoleProofRecommendations = (
  id: string,
  data: { readinessReportId?: string; maxItems?: number } = {},
) =>
  api
    .post(`/target-roles/${id}/proof-recommendations`, data)
    .then((r) => r.data as GapToProofResponse);
export const createTargetRoleUpgradePlan = (
  id: string,
  data: {
    readinessReportId?: string;
    durationWeeks?: 2 | 4 | 6 | 8;
    weeklyCommitmentHours?: number;
  } = {},
) =>
  api
    .post(`/target-roles/${id}/create-upgrade-plan`, data)
    .then((r) => r.data as CreateUpgradePlanResponse);
export const getLatestTargetRoleUpgradePlan = (id: string) =>
  api
    .get(`/target-roles/${id}/upgrade-plan`)
    .then((r) => r.data as { upgradePlan: UpgradePlan });
export const createTargetRoleGoal = (
  id: string,
  data: { upgradePlanId?: string } = {},
) =>
  api
    .post(`/target-roles/${id}/create-goal`, data)
    .then((r) => r.data as CreateGoalFromTargetRoleResponse);
export const startTargetRoleUpgradeSprint = (
  id: string,
  upgradePlanId: string,
) =>
  api
    .post(`/target-roles/${id}/upgrade-plans/${upgradePlanId}/start-sprint`)
    .then((r) => r.data as StartUpgradePlanSprintResponse);
export const getTargetRoleProofEvidenceStatus = (id: string) =>
  api
    .get(`/target-roles/${id}/proof-evidence`)
    .then((r) => r.data as ProofEvidenceStatusResponse);
export const publishTargetRoleProofEvidence = (id: string) =>
  api
    .post(`/target-roles/${id}/proof-evidence/publish`)
    .then((r) => r.data as PublishProofEvidenceResponse);
export const getTargetRoleDecompositionStatus = (
  id: string,
  upgradePlanId: string,
) =>
  api
    .get(`/target-roles/${id}/upgrade-plans/${upgradePlanId}/decomposition`)
    .then((r) => r.data as TargetRoleDecompositionStatusResponse);
export const decomposeTargetRoleUpgradePlan = (
  id: string,
  upgradePlanId: string,
) =>
  api
    .post(`/target-roles/${id}/upgrade-plans/${upgradePlanId}/decompose`)
    .then((r) => r.data as StartTargetRoleDecompositionResponse);
export const retryTargetRoleUpgradePlanDecomposition = (
  id: string,
  upgradePlanId: string,
) =>
  api
    .post(`/target-roles/${id}/upgrade-plans/${upgradePlanId}/decompose/retry`)
    .then((r) => r.data as StartTargetRoleDecompositionResponse);
export const saveTargetRole = (data: CreateTargetRoleRequest) =>
  api
    .post("/target-roles", data)
    .then((r) => r.data as CreateTargetRoleResponse);
export const getResumeApplications = () =>
  api
    .get("/resume/applications")
    .then((r) => r.data as ResumeApplicationWorkspace[]);
export const getResumeApplication = (id: string) =>
  api
    .get(`/resume/applications/${id}`)
    .then((r) => r.data as ResumeApplicationWorkspace);
export const createResumeApplication = (data: {
  rawText: string;
  jdText: string;
  source?: "upload" | "linkedin_paste" | "manual";
  title?: string | null;
}) =>
  api
    .post("/resume/applications", data)
    .then((r) => r.data as {
      application: ResumeApplicationWorkspace;
      quota?: GapReportQuotaSummary;
    });
export const generateResumeApplicationTailoredResume = (id: string) =>
  api
    .post(`/resume/applications/${id}/tailored-resume`)
    .then((r) => r.data as {
      application: ResumeApplicationWorkspace;
      quota?: GapReportQuotaSummary;
    });
export const createGoalFromResumeApplication = (id: string) =>
  api
    .post(`/resume/applications/${id}/create-goal`)
    .then((r) => r.data as { goalId: string });
export const createSprintFromResumeApplication = (id: string) =>
  api
    .post(`/resume/applications/${id}/create-sprint`)
    .then((r) => r.data as { goalId: string; sprint: GoalSprint | null; planHealth: GoalPlanHealth });
export const getGoalWeeklyCheckin = (id: string) =>
  api.get(`/goals/${id}/checkin`).then((r) => r.data as GoalWeeklyCheckinState);
export const saveGoalWeeklyCheckin = (
  id: string,
  data: {
    confidence: number;
    momentum: number;
    blockers?: string[] | string;
    wins?: string[] | string;
    notes?: string | null;
  },
) =>
  api.post(`/goals/${id}/checkin`, data).then((r) => r.data as GoalWeeklyCheckinState);
export const getGoalRecoveryPlan = (
  id: string,
  data?: {
    confidence?: number;
    momentum?: number;
    blockers?: string[] | string;
    wins?: string[] | string;
    notes?: string | null;
  },
) =>
  api
    .post(`/goals/${id}/recovery-plan`, data ?? {})
    .then((r) => r.data as WeeklyRecoveryPlan);
export const makePrimary = (id: string) =>
  api.post(`/goals/${id}/make-primary`).then((r) => r.data);
export const archiveGoal = (id: string) =>
  api.post(`/goals/${id}/archive`).then((r) => r.data);
export const deleteGoal = (id: string) =>
  api.delete(`/goals/${id}`).then((r) => r.data);

export interface NodeResource {
  url: string;
  resourceType: "article" | "video" | "course" | "docs" | "paper" | "github";
  coverageScore: number;
  depthMatch: number;
  qualityScore: number;
}
export const getGoalResources = (goalId: string) =>
  api
    .get(`/goals/${goalId}/resources`)
    .then((r) => r.data as Record<string, NodeResource[]>);
export const getNodeResources = (goalId: string, nodeId: string) =>
  api
    .get(`/goals/${goalId}/nodes/${nodeId}/resources`)
    .then((r) => r.data as NodeResource[]);
export const retryResourceEnrichment = (goalId: string) =>
  api
    .post(`/goals/${goalId}/resources/retry`)
    .then((r) => r.data as { enqueued: number });

export interface ResourceCoverageNode {
  nodeSlug:       string;
  canonicalTitle: string;
  depthLevel:     string;
  resourceCount:  number;
  maxQuality:     number | null;
  status:         'covered' | 'weak' | 'uncovered';
}
export interface ResourceCoverage {
  total:          number;
  coveredCount:   number;
  weakCount:      number;
  uncoveredCount: number;
  coveragePct:    number;
  nodes:          ResourceCoverageNode[];
}
export const getResourceCoverage = (goalId: string) =>
  api.get(`/goals/${goalId}/resources/coverage`).then((r) => r.data as ResourceCoverage);
export const fillResourceGaps = (goalId: string) =>
  api.post(`/goals/${goalId}/resources/fill-gaps`).then((r) => r.data);

// Today
export const getToday = () => api.get("/today").then((r) => r.data);

// Sessions
export interface SessionRubricDimension {
  key: "correctness" | "clarity" | "depth" | "application";
  label: string;
  description: string;
}

export interface SessionArtifactEvaluation {
  score: number;
  feedback: string;
  correct: boolean;
  rubricScores: Array<{
    dimension: SessionRubricDimension["key"];
    score: number;
    feedback: string;
  }>;
  strengths: string[];
  improvements: string[];
  retryPrompt: string;
  quota?: {
    featureKey: string;
    remaining: number | null;
    limitValue: number | null;
  };
}

export interface SessionTask {
  sessionId: string;
  nodeId: string;
  goalId: string;
  taskType: "explain" | "design" | "code" | "apply" | "review";
  artifactType: "text" | "notes" | "plan" | "code";
  title: string;
  prompt: string;
  instructions: string[];
  successCriteria: string[];
  suggestedLength: string;
  rubric: SessionRubricDimension[];
  artifact: {
    content: string | null;
    status: "draft" | "submitted" | "evaluated";
    score: number | null;
    feedback: string | null;
    evaluation: SessionArtifactEvaluation | null;
  } | null;
}

export interface GoalArtifactExportResult {
  blob: Blob;
  filename: string;
  contentType: string;
}

export interface ProductMetricsStage {
  eventKey: string;
  label: string;
  totalEvents: number;
  uniqueUsers: number;
  conversionFromPreviousPct: number | null;
}

export interface ProductMetricsPremiumEvent {
  eventKey: string;
  label: string;
  totalEvents: number;
  uniqueUsers: number;
}

export interface ProductMetricsSummary {
  generatedAt: string;
  windowDays: number;
  users: {
    totalUsers: number;
    newUsersWindow: number;
    activeUsers7d: number;
    activeUsers30d: number;
    payingUsers: number;
    planCounts: {
      free: number;
      pro: number;
      sprint: number;
      other: number;
    };
  };
  sessions: {
    completed7d: number;
    completed30d: number;
    activeSessionUsers30d: number;
    averageCompletedPerActiveUser30d: number;
  };
  funnel: ProductMetricsStage[];
  premiumEvents: ProductMetricsPremiumEvent[];
}

export interface LlmUsageFeatureSummary {
  featureKey: string;
  totalCalls: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

export interface LlmUsageUserSummary {
  userId: string;
  email: string | null;
  totalCalls: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

export interface LlmUsageSummary {
  generatedAt: string;
  windowDays: number;
  totals: {
    totalCalls: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimatedCostUsd: number;
  };
  byFeature: LlmUsageFeatureSummary[];
  topUsers: LlmUsageUserSummary[];
}

export const startSession = (
  nodeId: string,
  sessionType: "new" | "review",
  timebox: number,
) =>
  api.post("/sessions", { nodeId, sessionType, timebox }).then((r) => r.data);
export const getSessionTask = (sessionId: string) =>
  api.get(`/sessions/${sessionId}/task`).then((r) => r.data as SessionTask);
export const saveSessionArtifact = (sessionId: string, content: string) =>
  api
    .post(`/sessions/${sessionId}/artifact`, { content })
    .then((r) => r.data as SessionTask);
export const evaluateSessionArtifact = (
  sessionId: string,
  content?: string,
) =>
  api
    .post(`/sessions/${sessionId}/evaluate-artifact`, content === undefined ? {} : { content })
    .then((r) => r.data as SessionArtifactEvaluation);
export const exportGoalArtifacts = (
  goalId: string,
  format: "markdown" | "json" = "markdown",
) =>
  api
    .get(`/goals/${goalId}/artifacts/export`, {
      params: { format },
      responseType: "blob",
    })
    .then((r) => {
      const disposition = String(r.headers["content-disposition"] ?? "");
      const filenameMatch = disposition.match(/filename=\"?([^\";]+)\"?/i);
      return {
        blob: r.data as Blob,
        filename:
          filenameMatch?.[1] ??
          `goal-artifacts.${format === "json" ? "json" : "md"}`,
        contentType: String(
          r.headers["content-type"] ?? "application/octet-stream",
        ),
      } as GoalArtifactExportResult;
    });
export const completeSession = (
  sessionId: string,
  confidenceAfter: number,
  durationMins: number,
  notes?: string,
) =>
  api
    .patch(`/sessions/${sessionId}/complete`, {
      confidenceAfter,
      durationMins,
      notes,
    })
    .then((r) => r.data);
export const getSessionCalendar = (days = 90) =>
  api
    .get(`/sessions/calendar?days=${days}`)
    .then((r) => r.data as Array<{ date: string; count: number }>);
export const getStreak = () => api.get("/sessions/streak").then((r) => r.data);
export const checkUnderstanding = (sessionId: string, answer: string) =>
  api.post(`/sessions/${sessionId}/check`, { answer }).then(
    (r) =>
      r.data as {
        score: number;
        feedback: string;
        correct: boolean;
        rubricScores?: Array<{
          dimension: "correctness" | "clarity" | "depth" | "application";
          score: number;
          feedback: string;
        }>;
        strengths?: string[];
        improvements?: string[];
        retryPrompt?: string;
        quota?: {
          featureKey: string;
          remaining: number | null;
          limitValue: number | null;
        };
      },
  );

// Mock interviews
export const startMockInterview = (data: {
  goalId: string;
  mode: MockInterviewMode;
  targetRole?: string | null;
  focusArea?: string | null;
  promptContext?: string | null;
}) =>
  api
    .post("/mock/start", data)
    .then((r) => r.data as MockInterviewRunResponse);
export const getMockInterviewRun = (runId: string) =>
  api.get(`/mock/${runId}`).then((r) => r.data as MockInterviewRun);
export const submitMockInterviewAnswer = (runId: string, answer: string) =>
  api
    .post(`/mock/${runId}/answer`, { answer })
    .then((r) => r.data as MockInterviewRun);
export const evaluateMockInterview = (runId: string) =>
  api
    .post(`/mock/${runId}/evaluate`)
    .then((r) => r.data as MockInterviewRun);
export const getMockInterviewHistory = (goalId?: string) =>
  api
    .get("/mock/history", { params: goalId ? { goalId } : {} })
    .then((r) => r.data as MockInterviewHistoryItem[]);

// Weekly reports
export const getWeeklyReport = (goalId?: string) =>
  api
    .get("/reports/weekly", { params: goalId ? { goalId } : {} })
    .then((r) => r.data as WeeklyReport);
export const getProductMetrics = (windowDays = 30) =>
  api
    .get("/reports/product-metrics", { params: { windowDays } })
    .then((r) => r.data as ProductMetricsSummary);
export const getAiUsageSummary = (windowDays = 30) =>
  api
    .get("/reports/ai-usage", { params: { windowDays } })
    .then((r) => r.data as LlmUsageSummary);

// Reflections
export const getReflectionPrompt = (goalId: string) =>
  api.get(`/goals/${goalId}/reflection/prompt`).then(
    (r) =>
      r.data as {
        due: boolean;
        prompt: { question: string; context: string } | null;
      },
  );
export const saveReflection = (
  goalId: string,
  data: {
    answer: string;
    promptQuestion: string;
    momentumRating?: number;
    relevanceRating?: number;
  },
) => api.post(`/goals/${goalId}/reflection`, data).then((r) => r.data);

// Next goal suggestions
export const getSuggestedNextGoals = (goalId: string) =>
  api.get(`/goals/${goalId}/suggest-next`).then(
    (r) =>
      r.data as Array<{
        profileId: string;
        title: string;
        archetype: string;
        estimatedWeeks: { min: number; max: number };
        topSkills: string[];
        reason: string;
      }>,
  );

// News
export interface NewsItem {
  id: string;
  title: string;
  url: string;
  source: string;
  fetchedAt: string;
  readAt: string | null;
  nodeId: string;
  nodeTitle: string;
  nodeLongevity: "high" | "medium" | "low" | null;
  nodeStatus: string;
  nodeDepth: string;
}
export const getNewsFeed = () =>
  api.get("/news/feed").then((r) => r.data as NewsItem[]);
export const fetchNews = () => api.post("/news/fetch").then((r) => r.data);
export const markNewsRead = (id: string) =>
  api.post(`/news/${id}/read`).then((r) => r.data);

// Settings
export const getSettings = () => api.get("/settings").then((r) => r.data);
export const updateSettings = (patch: {
  availableMinsDay?: number;
  availableDaysWeek?: number;
  timezone?: string;
  digestTime?: string | null;
  emailWeeklySummary?: boolean;
}) => api.patch("/settings", patch).then((r) => r.data);

// Billing and entitlements
export const getMyEntitlements = () =>
  api.get("/me/entitlements").then(
    (r) =>
      r.data as {
        currentPlan: CurrentPlanState;
        entitlements: EntitlementSummary[];
      },
  );

export const getBillingPlanState = () =>
  api.get("/billing/plan").then(
    (r) =>
      r.data as {
        currentPlan: CurrentPlanState;
        plans: BillingPlan[];
        provider: "manual" | "stripe";
      },
  );

export const createCheckoutSession = (
  planKey: "pro" | "sprint",
  intervalKey: "month" | "year" = "month",
) =>
  api.post("/billing/checkout-session", { planKey, intervalKey }).then(
    (r) =>
      r.data as {
        checkoutSessionId: string;
        provider: "manual" | "stripe";
        url: string;
        mode: "manual" | "external";
        planKey: "pro" | "sprint";
        intervalKey: "month" | "year";
        autoActivated: boolean;
        currentPlan: CurrentPlanState;
        entitlements: EntitlementSummary[];
      },
  );

export const createBillingPortalSession = () =>
  api.post("/billing/portal-session").then(
    (r) =>
      r.data as {
        provider: "manual" | "stripe";
        url: string;
        mode: "manual" | "external";
        currentPlan: CurrentPlanState;
      },
  );
