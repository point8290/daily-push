import { ObjectId } from "mongodb";
import { getDb } from "../db/mongo";
import { pool } from "../db/postgres";
import { callClaude, parseJSON } from "./claude";
import { upsertSimilarityIndex } from "./similarity";
import { config } from "../config";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface RawInput {
  _id?: ObjectId;
  type: "text" | "form_answer" | "conversation";
  source: "goal_intake" | "clarification" | "correction";
  content: string;
  capturedAt: Date;
}

export interface ClarifyingQuestion {
  id: string;
  question: string;
  purpose:
    | "timeline"
    | "current_skills"
    | "available_time"
    | "goal_specifics"
    | "constraints";
  optional: boolean;
}

export interface ExtractedProfile {
  jobTitle: string | null;
  roleType: "engineer" | "analyst" | "pm" | "designer" | "other" | null;
  seniorityLevel: "junior" | "mid" | "senior" | "staff" | "lead" | null;
  yearsTotal: number | null;
  employmentStatus: "employed" | "unemployed" | "freelance" | "student" | null;
  primaryStack: string[];
  availableMinsDay: number | null;
  availableDaysWeek: number | null;
  timezone: string | null;
  derivationConfidence: number;
  uncertainFields: string[];
}

export interface ClassifiedGoal {
  title: string;
  goalType:
    | "career"
    | "project"
    | "skill"
    | "transition"
    | "survival"
    | "certification"
    | "identity";
  timeHorizon:
    | "immediate"
    | "short_term"
    | "medium_term"
    | "long_term"
    | "ongoing";
  urgency: "exploring" | "planning" | "urgent" | "crisis";
  emotionalDriver:
    | "growth"
    | "avoidance"
    | "social"
    | "validation"
    | "financial"
    | "curiosity";
  statedWhy: string;
  successCriteria: string;
  targetDate: string | null;
  targetDateFlexibility: "fixed" | "flexible" | "none";
  confidenceLevel: number;
}

export interface SkillGap {
  skillArea: string;
  skillCategory:
    | "engineering"
    | "tools"
    | "soft_skills"
    | "domain"
    | "ai_native";
  currentLevel: "none" | "aware" | "familiar" | "proficient" | "expert";
  requiredLevel: "aware" | "familiar" | "proficient" | "expert";
  priority: number;
  priorityReason: string;
  longevity: "high" | "medium" | "low";
  aiRelationship: "amplified" | "replaced" | "unaffected";
  identifiedBy:
    | "assessment"
    | "resume_parse"
    | "system_inferred"
    | "user_added";
}

export interface LearningTopic {
  title: string;
  skillGapArea: string;
  rationale: string;
  estimatedWeeks: number;
  priority: number;
}

export interface Plan {
  skillGaps: SkillGap[];
  learningTopics: LearningTopic[];
  estimatedWeeks: number;
  estimatedWeeksAtPace: number; // adjusted for user's mins/day
  availableMinsDay: number;
}

// ─────────────────────────────────────────────
// Raw input storage
// ─────────────────────────────────────────────

export async function saveRawInput(
  userId: string,
  input: Omit<RawInput, "_id" | "capturedAt">,
) {
  const db = getDb();
  const doc = { ...input, capturedAt: new Date() };
  await db
    .collection("user_raw_inputs")
    .updateOne(
      { userId },
      { $push: { inputs: doc } as any, $setOnInsert: { userId } },
      { upsert: true },
    );
  return doc;
}

export async function getRawInputs(userId: string): Promise<RawInput[]> {
  const db = getDb();
  const record = await db.collection("user_raw_inputs").findOne({ userId });
  return (record?.inputs as RawInput[]) ?? [];
}

// ─────────────────────────────────────────────
// Goal-scoped input storage (Phase 1)
// ─────────────────────────────────────────────

export async function saveGoalInput(
  goalId: string,
  userId: string,
  input: Omit<RawInput, "_id" | "capturedAt">,
) {
  const db = getDb();
  const doc = { ...input, capturedAt: new Date() };
  await db.collection("goal_raw_inputs").updateOne(
    { goalId, userId },
    {
      $push: { inputs: doc } as any,
      $setOnInsert: { goalId, userId },
    },
    { upsert: true },
  );
  return doc;
}

export async function getGoalInputs(
  goalId: string,
  userId: string,
): Promise<RawInput[]> {
  const db = getDb();
  const record = await db
    .collection("goal_raw_inputs")
    .findOne({ goalId, userId });
  return (record?.inputs as RawInput[]) ?? [];
}

export interface GoalCorrection {
  _id?: ObjectId;
  correctionText: string;
  field?: string;
  timestamp: Date;
}

export async function saveGoalCorrection(
  goalId: string,
  userId: string,
  correction: Omit<GoalCorrection, "_id" | "timestamp">,
) {
  const db = getDb();
  const doc = { ...correction, timestamp: new Date() };
  await db.collection("goal_corrections").updateOne(
    { goalId, userId },
    {
      $push: { corrections: doc } as any,
      $setOnInsert: { goalId, userId },
    },
    { upsert: true },
  );
  return doc;
}

export async function getGoalCorrections(
  goalId: string,
  userId: string,
): Promise<GoalCorrection[]> {
  const db = getDb();
  const record = await db
    .collection("goal_corrections")
    .findOne({ goalId, userId });
  return (record?.corrections as GoalCorrection[]) ?? [];
}

// ─────────────────────────────────────────────
// Claude: generate clarifying questions
// ─────────────────────────────────────────────

export async function generateClarifyingQuestions(
  rawInputs: RawInput[],
): Promise<ClarifyingQuestion[]> {
  const inputSummary = rawInputs.map((i) => i.content).join("\n\n---\n\n");

  const text = await callClaude({
    system: `You determine what clarifying questions to ask a developer about their upskilling goal.
Output a JSON array only. No prose, no markdown, no code fences.`,
    userMessage: `What the user has shared so far:
${inputSummary}

Based on this, determine what is still unclear and important. Generate 0 to 5 targeted questions.
- Never ask about things already answered
- Never ask more than 5 questions
- Ask nothing if you have enough to build a solid plan
- Focus on: timeline, available time, current skill level, goal specifics, constraints

Return a JSON array:
[
  {
    "id": "timeline",
    "question": "When do you need to achieve this by?",
    "purpose": "timeline",
    "optional": true
  }
]

Return [] if you have enough information.`,
    useCache: true,
  });

  try {
    return parseJSON<ClarifyingQuestion[]>(text);
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────
// Claude: profile extraction
// ─────────────────────────────────────────────

export async function extractProfile(
  rawInputs: RawInput[],
): Promise<ExtractedProfile> {
  const inputSummary = rawInputs.map((i) => i.content).join("\n\n---\n\n");

  const text = await callClaude({
    system: `You extract structured developer profiles from what people share about themselves.
Output JSON only. No prose, no markdown, no code fences.`,
    userMessage: `Everything this person has shared:
${inputSummary}

Extract their profile. For any field not mentioned, use null.
derivationConfidence: 0.0–1.0, how confident you are in the overall extraction.
uncertainFields: list fields you are unsure about.

Return JSON:
{
  "jobTitle": "Software Engineer",
  "roleType": "engineer",   // must be one of: engineer, analyst, pm, designer, other
  "seniorityLevel": "mid",
  "yearsTotal": 3,
  "employmentStatus": "employed",
  "primaryStack": ["Node.js", "React"],
  "availableMinsDay": 45,
  "availableDaysWeek": 5,
  "timezone": "Asia/Kolkata",
  "derivationConfidence": 0.75,
  "uncertainFields": ["availableMinsDay"]
}`,
    useCache: true,
  });

  return parseJSON<ExtractedProfile>(text);
}

function detectPrimaryStack(text: string): string[] {
  const stackSignals: Array<{ label: string; patterns: RegExp[] }> = [
    { label: "React", patterns: [/\breact\b/, /\bnext\.?js\b/] },
    { label: "Node.js", patterns: [/\bnode\.?js\b/, /\bnode\b/] },
    { label: "TypeScript", patterns: [/\btypescript\b/, /\bts\b/] },
    { label: "JavaScript", patterns: [/\bjavascript\b/, /\bjs\b/] },
    { label: "Python", patterns: [/\bpython\b/] },
    { label: "Java", patterns: [/\bjava\b/] },
    { label: "Docker", patterns: [/\bdocker\b/] },
    { label: "PostgreSQL", patterns: [/\bpostgres\b/, /\bpostgresql\b/] },
    { label: "MongoDB", patterns: [/\bmongodb\b/, /\bmongo\b/] },
    { label: "AWS", patterns: [/\baws\b/, /\bamazon web services\b/] },
  ];

  return stackSignals
    .filter((entry) => entry.patterns.some((pattern) => pattern.test(text)))
    .map((entry) => entry.label);
}

export function extractProfileHeuristically(
  rawInputs: RawInput[],
): ExtractedProfile {
  const allText = rawInputs.map((i) => i.content).join(" ");
  const normalized = allText.toLowerCase();

  const roleType: ExtractedProfile["roleType"] = /\b(engineer|developer|swe)\b/.test(normalized)
    ? "engineer"
    : /\b(product manager|pm)\b/.test(normalized)
      ? "pm"
      : /\bdesigner\b/.test(normalized)
        ? "designer"
        : /\banalyst\b/.test(normalized)
          ? "analyst"
          : normalized.trim()
            ? "other"
            : null;

  const seniorityLevel: ExtractedProfile["seniorityLevel"] =
    /\bstaff engineer\b/.test(normalized)
      ? "staff"
      : /\btech lead\b|\blead engineer\b|\blead\b/.test(normalized)
        ? "lead"
        : /\bsenior engineer\b|\bsenior\b/.test(normalized)
          ? "senior"
          : /\bmid level\b|\bmid-level\b|\bcurrently mid\b|\bmid\b/.test(normalized)
            ? "mid"
            : /\bjunior\b|\bcurrently junior\b/.test(normalized)
              ? "junior"
              : null;

  const availableMinsDayMatch = normalized.match(
    /(\d{1,3})\s*(minutes|minute|mins|min)\s*(a|per)?\s*day/,
  );
  const availableDaysWeekMatch = normalized.match(
    /(\d)\s*(days)\s*(a|per)?\s*week/,
  );
  const yearsTotalMatch = normalized.match(/(\d{1,2})\+?\s*(years|year|yrs)/);

  const availableMinsDay = availableMinsDayMatch
    ? parseInt(availableMinsDayMatch[1], 10)
    : null;
  const availableDaysWeek = availableDaysWeekMatch
    ? parseInt(availableDaysWeekMatch[1], 10)
    : null;
  const yearsTotal = yearsTotalMatch
    ? parseInt(yearsTotalMatch[1], 10)
    : null;

  const primaryStack = detectPrimaryStack(normalized);

  let jobTitle: string | null = null;
  if (/\bfrontend (developer|engineer)\b/.test(normalized)) {
    jobTitle = "Frontend Developer";
  } else if (/\bbackend (developer|engineer)\b/.test(normalized)) {
    jobTitle = "Backend Developer";
  } else if (/\bfull ?stack (developer|engineer)\b/.test(normalized)) {
    jobTitle = "Fullstack Developer";
  } else if (/\bsoftware engineer\b/.test(normalized)) {
    jobTitle = "Software Engineer";
  } else if (/\bdeveloper\b/.test(normalized)) {
    jobTitle = "Developer";
  }

  const employmentStatus: ExtractedProfile["employmentStatus"] =
    /\bfreelance|freelancer\b/.test(normalized)
      ? "freelance"
      : /\bstudent\b/.test(normalized)
        ? "student"
        : /\bunemployed\b|\bout of work\b/.test(normalized)
          ? "unemployed"
          : normalized.trim()
            ? "employed"
            : null;

  const uncertainFields: string[] = [];
  if (!jobTitle) uncertainFields.push("jobTitle");
  if (!seniorityLevel) uncertainFields.push("seniorityLevel");
  if (!yearsTotal) uncertainFields.push("yearsTotal");
  if (!availableMinsDay) uncertainFields.push("availableMinsDay");
  if (!availableDaysWeek) uncertainFields.push("availableDaysWeek");
  if (primaryStack.length === 0) uncertainFields.push("primaryStack");

  const knownFieldCount = [
    jobTitle,
    roleType,
    seniorityLevel,
    yearsTotal,
    employmentStatus,
    primaryStack.length > 0 ? primaryStack : null,
    availableMinsDay,
    availableDaysWeek,
  ].filter(Boolean).length;

  return {
    jobTitle,
    roleType,
    seniorityLevel,
    yearsTotal,
    employmentStatus,
    primaryStack,
    availableMinsDay,
    availableDaysWeek,
    timezone: null,
    derivationConfidence: Math.min(0.85, 0.35 + knownFieldCount * 0.08),
    uncertainFields,
  };
}

// ─────────────────────────────────────────────
// Claude: goal classification
// ─────────────────────────────────────────────

export async function classifyGoal(
  rawInputs: RawInput[],
  profile: ExtractedProfile,
): Promise<ClassifiedGoal> {
  const goalText = rawInputs
    .filter((i) => i.source === "goal_intake")
    .map((i) => i.content)
    .join("\n\n");

  const allText = rawInputs.map((i) => i.content).join("\n\n---\n\n");

  const text = await callClaude({
    system: `You classify and structure developer goals from free-text descriptions.
Output JSON only. No prose, no markdown, no code fences.`,
    userMessage: `User profile:
${JSON.stringify(profile, null, 2)}

Everything the user shared:
${allText}

Their primary goal statement:
${goalText}

Classify and structure this goal. Infer emotionalDriver and statedWhy from their language — never ask explicitly.
confidenceLevel 1–5: how confident you are this classification is correct.

Return JSON:
{
  "title": "Get a senior backend engineering job at a product company",
  "goalType": "career",
  "timeHorizon": "medium_term",
  "urgency": "planning",
  "emotionalDriver": "growth",
  "statedWhy": "I want to prove I can work at a top company",
  "successCriteria": "Receive and accept an offer from a target company",
  "targetDate": null,
  "targetDateFlexibility": "flexible",
  "confidenceLevel": 4
}`,
    useCache: true,
  });

  return parseJSON<ClassifiedGoal>(text);
}

// ─────────────────────────────────────────────
// Save profile to PostgreSQL
// ─────────────────────────────────────────────

export async function saveProfile(
  userId: string,
  profile: ExtractedProfile,
  rawInputIds: string[],
) {
  const { rows: existing } = await pool.query(
    "SELECT id FROM user_profiles_structured WHERE user_id = $1",
    [userId],
  );

  const ALLOWED_ROLE_TYPES = new Set([
    "engineer",
    "analyst",
    "pm",
    "designer",
    "other",
  ]);
  const safeRoleType =
    profile.roleType && ALLOWED_ROLE_TYPES.has(profile.roleType)
      ? profile.roleType
      : "engineer";

  const values = [
    userId,
    profile.jobTitle,
    safeRoleType,
    profile.seniorityLevel,
    profile.yearsTotal,
    profile.employmentStatus,
    JSON.stringify(profile.primaryStack),
    profile.availableMinsDay,
    profile.availableDaysWeek,
    profile.timezone,
    JSON.stringify(rawInputIds),
    new Date().toISOString(),
    config.llm.model,
  ];

  if (existing.length > 0) {
    await pool.query(
      `UPDATE user_profiles_structured SET
        job_title=$2, role_type=$3, seniority_level=$4, years_total=$5,
        employment_status=$6, primary_stack=$7,
        available_mins_day=$8, available_days_week=$9, timezone=$10,
        derived_from=$11, derived_at=$12, derived_by=$13,
        updated_at=NOW()
       WHERE user_id=$1`,
      values,
    );
  } else {
    await pool.query(
      `INSERT INTO user_profiles_structured
        (user_id, job_title, role_type, seniority_level, years_total, employment_status,
         primary_stack, available_mins_day, available_days_week, timezone,
         derived_from, derived_at, derived_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      values,
    );
  }

  // Best-effort similarity index update (non-blocking)
  upsertSimilarityIndex(userId, {
    seniorityLevel: profile.seniorityLevel,
    employmentStatus: profile.employmentStatus,
    availableMinsDay: profile.availableMinsDay,
    primaryStack: profile.primaryStack,
  }).catch(() => {});
}

// ─────────────────────────────────────────────
// Save goal to MongoDB
// ─────────────────────────────────────────────

export async function createGoalDocument(
  userId: string,
  rawInput: string,
  classified: ClassifiedGoal,
): Promise<string> {
  const db = getDb();
  const now = new Date();

  const doc = {
    userId,
    raw: {
      input: rawInput,
      capturedAt: now,
      source: "goal_intake",
    },
    structured: {
      ...classified,
      targetDate: classified.targetDate
        ? new Date(classified.targetDate)
        : null,
      derivedBy: config.llm.model,
      derivedAt: now,
    },
    skillGaps: [],
    learningTopics: [],
    milestones: [],
    adjustments: [],
    reflections: [],
    status: "assessing",
    stage: "intention",
    isPrimary: true,
    createdAt: now,
    updatedAt: now,
    achievedAt: null,
    abandonedAt: null,
    abandonedReason: null,
  };

  // Mark any existing primary goals as non-primary
  await db
    .collection("goals")
    .updateMany({ userId, isPrimary: true }, { $set: { isPrimary: false } });

  const result = await db.collection("goals").insertOne(doc);
  return result.insertedId.toString();
}

// ─────────────────────────────────────────────
// Claude: gap analysis
// ─────────────────────────────────────────────

export async function analyzeSkillGaps(
  rawInputs: RawInput[],
  profile: ExtractedProfile,
  goal: ClassifiedGoal,
): Promise<SkillGap[]> {
  const allText = rawInputs.map((i) => i.content).join("\n\n---\n\n");

  const text = await callClaude({
    system: `You identify skill gaps between where a developer is now and what they need to achieve their goal.
Output a JSON array only. No prose, no markdown, no code fences.`,
    userMessage: `User profile:
${JSON.stringify(profile, null, 2)}

Their goal:
${JSON.stringify(goal, null, 2)}

Everything they shared:
${allText}

Identify skill gaps — what they need to learn to achieve this goal but don't yet know well enough.
Rules:
- Max 6 gaps
- Order by priority (1 = most critical)
- currentLevel must be honest based on what they shared; default to "none" if not mentioned
- longevity: "high" if AI amplifies this skill, "low" if AI replaces it
- aiRelationship: "amplified" if this skill becomes more valuable with AI, "replaced" if AI does it, "unaffected" otherwise

Return JSON array:
[
  {
    "skillArea": "System Design",
    "skillCategory": "engineering",
    "currentLevel": "aware",
    "requiredLevel": "proficient",
    "priority": 1,
    "priorityReason": "Core requirement for senior roles — expected in every interview",
    "longevity": "high",
    "aiRelationship": "amplified",
    "identifiedBy": "system_inferred"
  }
]`,
    useCache: true,
  });

  return parseJSON<SkillGap[]>(text);
}

// ─────────────────────────────────────────────
// Claude: topic mapping
// ─────────────────────────────────────────────

export async function mapLearningTopics(
  skillGaps: SkillGap[],
  profile: ExtractedProfile,
  goal: ClassifiedGoal,
): Promise<LearningTopic[]> {
  const text = await callClaude({
    system: `You map skill gaps to specific learning topics for a developer's upskilling plan.
Output a JSON array only. No prose, no markdown, no code fences.`,
    userMessage: `User profile:
${JSON.stringify(profile, null, 2)}

Goal: ${goal.title}

Skill gaps (ordered by priority):
${JSON.stringify(skillGaps, null, 2)}

Map each skill gap to one learning topic. Rules:
- Max 5 topics
- Name topics specifically for this user's context (not generic)
- Order by dependency — foundational topics first
- estimatedWeeks: realistic at 60 mins/day; adjust for complexity
- rationale: explain why this specific user needs this, referencing their situation

Return JSON array:
[
  {
    "title": "System Design for Backend Engineers",
    "skillGapArea": "System Design",
    "rationale": "You've built APIs but haven't designed systems at scale. This is what separates mid from senior at product companies.",
    "estimatedWeeks": 6,
    "priority": 1
  }
]`,
    useCache: true,
  });

  return parseJSON<LearningTopic[]>(text);
}

// ─────────────────────────────────────────────
// Timeline calculator
// ─────────────────────────────────────────────

export function calculateTimeline(
  topics: LearningTopic[],
  availableMinsDay: number | null,
): {
  estimatedWeeks: number;
  estimatedWeeksAtPace: number;
  availableMinsDay: number;
} {
  const baseWeeks = topics.reduce((sum, t) => sum + t.estimatedWeeks, 0);
  const minsDay = availableMinsDay ?? 45;
  // Base estimate is at 60 mins/day. Scale proportionally.
  const adjustedWeeks = Math.ceil(baseWeeks * (60 / minsDay));
  return {
    estimatedWeeks: baseWeeks,
    estimatedWeeksAtPace: adjustedWeeks,
    availableMinsDay: minsDay,
  };
}

// ─────────────────────────────────────────────
// Update goal document with full plan
// ─────────────────────────────────────────────

export async function updateGoalWithPlan(
  goalId: string,
  skillGaps: SkillGap[],
  learningTopics: LearningTopic[],
  timeline: {
    estimatedWeeks: number;
    estimatedWeeksAtPace: number;
    availableMinsDay: number;
  },
  goalClassification?: ClassifiedGoal,
): Promise<void> {
  const db = getDb();
  const { ObjectId } = await import("mongodb");

  const gapDocs = skillGaps.map((gap, i) => ({
    _id: new ObjectId(),
    raw: null,
    structured: { ...gap, status: "pending", userConfirmed: false },
    userConfirmed: false,
  }));

  const topicDocs = learningTopics.map((topic, i) => ({
    _id: new ObjectId(),
    skillGapId:
      gapDocs.find((g) => g.structured.skillArea === topic.skillGapArea)?._id ??
      null,
    raw: null,
    structured: {
      ...topic,
      topicEngineId: null,
      decompositionStatus: "pending",
      decompositionAttempts: 0,
      lastTopicEngineAttempts: 0,
      lastDecompositionAttemptAt: null,
      lastDecompositionCompletedAt: null,
      lastDecompositionDurationMs: null,
      lastDecompositionError: null,
      status: "pending",
      position: i + 1,
      actualWeeks: null,
    },
    createdAt: new Date(),
    completedAt: null,
  }));

  const updateObj: any = {
    skillGaps: gapDocs,
    learningTopics: topicDocs,
    status: "planning",
    stage: "planning",
    updatedAt: new Date(),
  };

  // If goalClassification provided, set full structured object; otherwise just update timeline
  if (goalClassification) {
    updateObj.structured = {
      ...goalClassification,
      targetDate: goalClassification.targetDate
        ? new Date(goalClassification.targetDate)
        : null,
      estimatedWeeks: timeline.estimatedWeeks,
      estimatedWeeksAtPace: timeline.estimatedWeeksAtPace,
      availableMinsDay: timeline.availableMinsDay,
      derivedBy: config.llm.model,
      derivedAt: new Date(),
    };
  } else {
    // Fallback: just update timeline fields
    updateObj["structured.estimatedWeeks"] = timeline.estimatedWeeksAtPace;
    updateObj["structured.availableMinsDay"] = timeline.availableMinsDay;
  }

  await db
    .collection("goals")
    .updateOne({ _id: new ObjectId(goalId) }, { $set: updateObj });
}
