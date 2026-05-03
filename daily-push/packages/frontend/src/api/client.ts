import axios from "axios";

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
export const processIntake = (goalId: string) =>
  api.post("/intake/process", { goalId }).then((r) => r.data);

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

// Goals
export const getGoals = () => api.get("/goals").then((r) => r.data);
export const getPrimaryGoal = () =>
  api.get("/goals/primary").then((r) => r.data);
export const getGoal = (id: string) =>
  api.get(`/goals/${id}`).then((r) => r.data);
export const confirmGoal = (id: string, data?: { availableMinsDay?: number }) =>
  api.post(`/goals/${id}/confirm`, data ?? {}).then((r) => r.data);
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
export const startSession = (
  nodeId: string,
  sessionType: "new" | "review",
  timebox: number,
) =>
  api.post("/sessions", { nodeId, sessionType, timebox }).then((r) => r.data);
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
      },
  );

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
