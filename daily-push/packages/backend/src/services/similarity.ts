import { pool } from '../db/postgres';
import { getDb } from '../db/mongo';
import { GOAL_PROFILES } from '../db/seed/goalProfiles';

// ─────────────────────────────────────────────
// Feature vector (64-dim float array)
// Encoding: deterministic, no ML dependency
// ─────────────────────────────────────────────

const GOAL_TYPES = ['career', 'project', 'skill', 'transition', 'survival', 'certification', 'identity'];
const SENIORITY   = ['junior', 'mid', 'senior', 'staff', 'lead'];
const EMPLOYMENT  = ['employed', 'unemployed', 'freelance', 'student'];
const SKILL_AREAS = [
  'system design', 'dsa', 'react', 'node.js', 'typescript', 'databases',
  'llm apis', 'rag', 'agents', 'deployment', 'leadership', 'programming',
];

function oneHot(value: string | null, options: string[]): number[] {
  const norm = (value ?? '').toLowerCase();
  return options.map(o => (norm === o ? 1 : 0));
}

function encodeMins(mins: number | null): number {
  // Normalize 0–240 to 0–1
  return Math.min(1, (mins ?? 45) / 240);
}

function encodeSkills(primaryStack: string[]): number[] {
  const norm = primaryStack.map(s => s.toLowerCase());
  return SKILL_AREAS.map(area => {
    return norm.some(s => s.includes(area) || area.includes(s)) ? 1 : 0;
  });
}

export function buildFeatureVector(profile: {
  goalType?: string | null;
  seniorityLevel?: string | null;
  employmentStatus?: string | null;
  availableMinsDay?: number | null;
  primaryStack?: string[];
}): number[] {
  const vec = [
    ...oneHot(profile.goalType ?? null, GOAL_TYPES),          // 7
    ...oneHot(profile.seniorityLevel ?? null, SENIORITY),     // 5
    ...oneHot(profile.employmentStatus ?? null, EMPLOYMENT),  // 4
    encodeMins(profile.availableMinsDay ?? null),              // 1
    ...encodeSkills(profile.primaryStack ?? []),               // 12
  ];

  // Pad to 64 dims with zeros
  while (vec.length < 64) vec.push(0);
  return vec.slice(0, 64);
}

// Store feature vector in user_similarity_index
export async function upsertSimilarityIndex(
  userId: string,
  profile: {
    goalType?: string | null;
    seniorityLevel?: string | null;
    employmentStatus?: string | null;
    availableMinsDay?: number | null;
    primaryStack?: string[];
  }
): Promise<void> {
  const vec = buildFeatureVector(profile);
  const pgVec = `[${vec.join(',')}]`;

  await pool.query(
    `INSERT INTO user_similarity_index (user_id, features, feature_meta, updated_at)
     VALUES ($1, $2::vector, $3::jsonb, NOW())
     ON CONFLICT (user_id) DO UPDATE
       SET features = $2::vector, feature_meta = $3::jsonb, updated_at = NOW()`,
    [userId, pgVec, JSON.stringify({ goalType: profile.goalType, seniorityLevel: profile.seniorityLevel })]
  );
}

// ─────────────────────────────────────────────
// Suggest next goals based on completed goal
// ─────────────────────────────────────────────

export interface GoalSuggestion {
  profileId: string;
  title: string;
  archetype: string;
  estimatedWeeks: { min: number; max: number };
  topSkills: string[];
  reason: string;
}

export async function suggestNextGoals(
  userId: string,
  completedGoalId: string
): Promise<GoalSuggestion[]> {
  const db = getDb();
  const { ObjectId } = await import('mongodb');

  // Get completed goal details
  const completedGoal = await db.collection('goals').findOne({
    _id: new ObjectId(completedGoalId),
    userId,
  });

  const completedType = completedGoal?.structured?.goalType ?? null;
  const completedSkillAreas: string[] =
    (completedGoal?.skillGaps ?? []).map((g: any) => g.structured?.skillArea ?? '');

  // Progression map: what goals naturally follow each type
  const progressionMap: Record<string, string[]> = {
    'skill':       ['career', 'project'],
    'survival':    ['career', 'skill'],
    'transition':  ['career', 'skill'],
    'career':      ['career', 'project', 'skill'],
    'project':     ['career', 'skill'],
    'certification': ['career', 'skill'],
    'identity':    ['career', 'project'],
  };

  const preferredTypes = completedType ? (progressionMap[completedType] ?? []) : [];

  // Score each profile
  const suggestions = GOAL_PROFILES
    .filter(p => p.profileId !== completedGoal?.profileId)
    .map(p => {
      let score = 0;

      // Prefer progression types
      if (preferredTypes.includes(p.goalType)) score += 2;

      // Penalise profiles with heavily overlapping skill areas (already done)
      const overlap = p.requiredSkillAreas.filter(a =>
        completedSkillAreas.some(c => c.toLowerCase().includes(a.toLowerCase()))
      ).length;
      score -= overlap * 0.5;

      // Prefer profiles that build on what was learned
      const buildOn = p.requiredSkillAreas.filter(a =>
        completedSkillAreas.some(c => {
          const cl = c.toLowerCase();
          const al = a.toLowerCase();
          // Related but not identical (e.g. "System Design" → "Distributed Systems")
          return (cl.includes('system') && al.includes('system')) ||
                 (cl.includes('react') && al.includes('frontend')) ||
                 (cl.includes('llm') && al.includes('agent'));
        })
      ).length;
      score += buildOn * 0.5;

      const minWeeks = Math.min(...p.timelineData.map(t => t.weeks));
      const maxWeeks = Math.max(...p.timelineData.map(t => t.weeks));

      return {
        profileId: p.profileId,
        title: p.title,
        archetype: p.archetype,
        estimatedWeeks: { min: minWeeks, max: maxWeeks },
        topSkills: p.requiredSkillAreas.slice(0, 3),
        reason: buildReasonText(p, completedType, buildOn),
        _score: score,
      };
    })
    .sort((a, b) => b._score - a._score)
    .slice(0, 3)
    .map(({ _score: _, ...s }) => s);

  return suggestions;
}

function buildReasonText(
  profile: (typeof GOAL_PROFILES)[0],
  completedType: string | null,
  buildOnCount: number
): string {
  if (buildOnCount > 0) return `Builds directly on skills you've just mastered.`;
  if (profile.goalType === 'career') return `Natural next step — convert your new skills into career outcomes.`;
  if (profile.goalType === 'project') return `Good time to apply your knowledge by shipping something real.`;
  return `Complementary learning path that widens your skill set.`;
}
