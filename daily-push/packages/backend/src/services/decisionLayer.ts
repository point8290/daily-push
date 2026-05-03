import { getDb } from "../db/mongo";
import { GOAL_PROFILES, GoalProfileDoc } from "../db/seed/goalProfiles";
import { SKILL_BANK } from "../db/seed/skillBank";
import { config } from "../config";
import { SkillGap, LearningTopic } from "./intake";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface ProfileMatch {
  profile: GoalProfileDoc | null;
  confidence: number; // 0.0 – 1.0
  matchedSignals: string[];
  source: "knowledge_layer" | "llm";
}

export interface DecisionRoute {
  action: "direct" | "confirm" | "clarify" | "llm";
  confidence: number;
  profile: GoalProfileDoc | null;
  matchedSignals: string[];
}

// ─────────────────────────────────────────────
// Goal profile matching
// ─────────────────────────────────────────────

export async function matchGoalProfile(
  rawInput: string,
): Promise<ProfileMatch> {
  const db = getDb();
  const normalized = rawInput.toLowerCase();

  let bestProfile: GoalProfileDoc | null = null;
  let bestScore = 0;
  let bestMatched: string[] = [];

  // Check MongoDB first (learned profiles from prior LLM calls)
  const learnedProfiles = await db
    .collection("goal_profiles")
    .find({})
    .toArray();
  const allProfiles: GoalProfileDoc[] = [
    ...GOAL_PROFILES,
    ...learnedProfiles.map((p) => p as unknown as GoalProfileDoc),
  ];

  for (const profile of allProfiles) {
    const matched: string[] = [];
    for (const signal of profile.signals) {
      if (normalized.includes(signal.toLowerCase())) {
        matched.push(signal);
      }
    }

    // Weighted score: matched signals / total signals, boosted if multiple match
    const raw = matched.length / profile.signals.length;
    const boost = matched.length >= 3 ? 0.15 : matched.length >= 2 ? 0.05 : 0;
    const score = Math.min(1, raw + boost);

    if (score > bestScore) {
      bestScore = score;
      bestProfile = profile;
      bestMatched = matched;
    }
  }

  return {
    profile: bestScore > 0 ? bestProfile : null,
    confidence: bestScore,
    matchedSignals: bestMatched,
    source: "knowledge_layer",
  };
}

// ─────────────────────────────────────────────
// Route decision based on confidence
// ─────────────────────────────────────────────

export function routeDecision(match: ProfileMatch): DecisionRoute {
  const { confidence, profile, matchedSignals } = match;

  if (confidence > config.decisionLayer.directThreshold) {
    return { action: "direct", confidence, profile, matchedSignals };
  }
  return { action: "llm", confidence: 0, profile: null, matchedSignals: [] };
}

// ─────────────────────────────────────────────
// Infer skill gaps from matched profile
// ─────────────────────────────────────────────

export function inferSkillGaps(
  profile: GoalProfileDoc,
  knownSkillAreas: string[] = [],
): SkillGap[] {
  return profile.typicalSkillGaps
    .filter(
      (gap) =>
        !knownSkillAreas.some(
          (k) => k.toLowerCase() === gap.skillArea.toLowerCase(),
        ),
    )
    .map((gap) => ({ ...gap, identifiedBy: "system_inferred" as const }));
}

// ─────────────────────────────────────────────
// Infer learning topics from matched profile
// ─────────────────────────────────────────────

export function inferLearningTopics(
  profile: GoalProfileDoc,
  skillGaps: SkillGap[],
): LearningTopic[] {
  const gapAreas = new Set(skillGaps.map((g) => g.skillArea.toLowerCase()));
  return profile.typicalTopics.filter((t) =>
    gapAreas.has(t.skillGapArea.toLowerCase()),
  );
}

// ─────────────────────────────────────────────
// Estimate timeline from profile data
// ─────────────────────────────────────────────

export function estimateTimelineFromProfile(
  profile: GoalProfileDoc,
  minsPerDay: number,
): number {
  const data = profile.timelineData;
  if (data.length === 0) return 16;

  // Find the two nearest bracketing points and interpolate
  const sorted = [...data].sort((a, b) => a.minsPerDay - b.minsPerDay);

  if (minsPerDay <= sorted[0].minsPerDay) return sorted[0].weeks;
  if (minsPerDay >= sorted[sorted.length - 1].minsPerDay)
    return sorted[sorted.length - 1].weeks;

  for (let i = 0; i < sorted.length - 1; i++) {
    const lo = sorted[i];
    const hi = sorted[i + 1];
    if (minsPerDay >= lo.minsPerDay && minsPerDay <= hi.minsPerDay) {
      const t = (minsPerDay - lo.minsPerDay) / (hi.minsPerDay - lo.minsPerDay);
      return Math.ceil(lo.weeks + t * (hi.weeks - lo.weeks));
    }
  }

  return 16;
}

// ─────────────────────────────────────────────
// Build assessment questions for a skill area
// ─────────────────────────────────────────────

export function buildAssessmentQuestions(
  skillAreas: string[],
  alreadyAnsweredIds: string[] = [],
): Array<{ id: string; question: string; skillArea: string; purpose: string }> {
  const questions: Array<{
    id: string;
    question: string;
    skillArea: string;
    purpose: string;
  }> = [];

  for (const area of skillAreas) {
    const entry = SKILL_BANK.find(
      (s) =>
        s.skillArea.toLowerCase() === area.toLowerCase() ||
        s.aliases.some((a) => a.toLowerCase() === area.toLowerCase()),
    );
    if (!entry) continue;

    const unanswered = entry.assessmentQuestions
      .filter((q) => !alreadyAnsweredIds.includes(q.id))
      .slice(0, 1); // one question per skill area per intake turn

    questions.push(
      ...unanswered.map((q) => ({
        id: q.id,
        question: q.question,
        skillArea: q.skillArea,
        purpose: q.purpose,
      })),
    );
  }

  return questions.slice(0, 5); // never more than 5 total
}

// ─────────────────────────────────────────────
// Save LLM-derived result back to knowledge layer
// ─────────────────────────────────────────────

export async function learnFromLLMResult(
  rawInput: string,
  matchedSignals: string[],
  skillGaps: SkillGap[],
  learningTopics: LearningTopic[],
  goalType: string,
  minsPerDay: number,
  estimatedWeeks: number,
): Promise<void> {
  const db = getDb();

  // Don't create duplicate learned profiles for very similar inputs
  const existing = await db.collection("goal_profiles").findOne({
    signals: { $elemMatch: { $in: matchedSignals.slice(0, 3) } },
  });
  if (existing) return;

  // Extract signals from the raw input (simple word extraction)
  const words = rawInput
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);

  // Deduplicate and take up to 10 new signals
  const newSignals = [...new Set([...matchedSignals, ...words.slice(0, 10)])];

  await db.collection("goal_profiles").insertOne({
    profileId: `learned_${Date.now()}`,
    title: `Learned: ${rawInput.slice(0, 60)}`,
    goalType,
    archetype: "learned",
    signals: newSignals,
    requiredSkillAreas: skillGaps.map((g) => g.skillArea),
    typicalSkillGaps: skillGaps,
    typicalTopics: learningTopics,
    timelineData: [{ minsPerDay, weeks: estimatedWeeks }],
    learnedAt: new Date(),
    source: "llm_result",
  });
}
