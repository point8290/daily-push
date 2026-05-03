import { pool } from '../db/postgres';
import { getDb } from '../db/mongo';

interface SkillGapSummary {
  skillArea: string;
  currentLevel: string;
  requiredLevel: string;
}

interface NodeStats {
  totalNodes: number;
  doneNodes: number;
  currentDepthLevel: string | null;
  struggleNodeTitles: string[];
  reviewDueCount: number;
}

interface SessionStats {
  recentSessionCount: number;
  avgConfidenceAfter: number | null;
  avgDurationMins: number | null;
  confidenceTrend: 'improving' | 'declining' | 'stable' | 'insufficient_data';
}

export interface UserContext {
  seniorityLevel: string | null;
  jobTitle: string | null;
  primaryStack: string[];
  availableMinsDay: number;
  yearsTotal: number | null;
  goalTitle: string | null;
  goalType: string | null;
  emotionalDriver: string | null;
  urgency: string | null;
  statedWhy: string | null;
  skillGaps: SkillGapSummary[];
  learningTopicTitles: string[];
  nodeStats: NodeStats;
  sessionStats: SessionStats;
  toPromptString(): string;
}

function deriveTrend(recentHalf: number | null, olderHalf: number | null): SessionStats['confidenceTrend'] {
  if (recentHalf == null || olderHalf == null) return 'insufficient_data';
  const delta = recentHalf - olderHalf;
  if (delta > 0.3) return 'improving';
  if (delta < -0.3) return 'declining';
  return 'stable';
}

const FALLBACK_CONTEXT: UserContext = {
  seniorityLevel: null,
  jobTitle: null,
  primaryStack: [],
  availableMinsDay: 45,
  yearsTotal: null,
  goalTitle: null,
  goalType: null,
  emotionalDriver: null,
  urgency: null,
  statedWhy: null,
  skillGaps: [],
  learningTopicTitles: [],
  nodeStats: { totalNodes: 0, doneNodes: 0, currentDepthLevel: null, struggleNodeTitles: [], reviewDueCount: 0 },
  sessionStats: { recentSessionCount: 0, avgConfidenceAfter: null, avgDurationMins: null, confidenceTrend: 'insufficient_data' },
  toPromptString: () => 'Learner: software developer.',
};

export async function buildUserContext(userId: string, goalId?: string): Promise<UserContext> {
  try {
    // Round 1: MongoDB — fetch specific goal if goalId provided, else primary active goal
    const { ObjectId } = await import('mongodb');
    const mongoQuery = goalId
      ? { _id: new ObjectId(goalId), userId }
      : { userId, isPrimary: true, status: 'active' };

    const goal = await getDb().collection('goals').findOne(
      mongoQuery,
      {
        projection: {
          'structured.title': 1,
          'structured.goalType': 1,
          'structured.emotionalDriver': 1,
          'structured.urgency': 1,
          'structured.statedWhy': 1,
          'skillGaps': 1,
          'learningTopics': 1,
        },
      }
    );

    const resolvedGoalId = goalId ?? goal?._id?.toString() ?? null;

    // Round 2: PostgreSQL — 4 queries in parallel, all scoped to the resolved goal
    const [profileResult, nodeAggResult, struggleResult, sessionResult] = await Promise.all([
      pool.query<{
        seniority_level: string | null;
        job_title: string | null;
        primary_stack: string[] | string | null;
        available_mins_day: number | null;
        years_total: number | null;
      }>(
        `SELECT seniority_level, job_title, primary_stack,
                COALESCE(available_mins_day, 45) AS available_mins_day, years_total
         FROM user_profiles_structured WHERE user_id = $1 LIMIT 1`,
        [userId]
      ),

      resolvedGoalId
        ? pool.query<{
            total_nodes: string;
            done_nodes: string;
            review_due_count: string;
            current_depth_level: string | null;
          }>(
            `SELECT
               COUNT(*) AS total_nodes,
               COUNT(*) FILTER (WHERE status = 'done') AS done_nodes,
               COUNT(*) FILTER (WHERE status = 'review_due') AS review_due_count,
               MODE() WITHIN GROUP (ORDER BY depth_level)
                 FILTER (WHERE status IN ('available', 'in_progress')) AS current_depth_level
             FROM concept_nodes WHERE user_id = $1 AND goal_id = $2`,
            [userId, resolvedGoalId]
          )
        : Promise.resolve({ rows: [] }),

      resolvedGoalId
        ? pool.query<{ title: string }>(
            `SELECT title FROM concept_nodes
             WHERE user_id = $1 AND goal_id = $2 AND status = 'done' AND confidence <= 2
             ORDER BY last_studied_at DESC NULLS LAST LIMIT 5`,
            [userId, resolvedGoalId]
          )
        : Promise.resolve({ rows: [] }),

      // Session stats scoped to this goal's nodes to prevent cross-goal bleed
      resolvedGoalId
        ? pool.query<{
            session_count: string;
            avg_confidence_after: string | null;
            avg_duration_mins: string | null;
            recent_half_avg: string | null;
            older_half_avg: string | null;
          }>(
            `SELECT
               COUNT(*) AS session_count,
               ROUND(AVG(confidence_after)::numeric, 2) AS avg_confidence_after,
               ROUND(AVG(duration_mins)::numeric, 1) AS avg_duration_mins,
               AVG(confidence_after) FILTER (WHERE rn <= 10) AS recent_half_avg,
               AVG(confidence_after) FILTER (WHERE rn > 10) AS older_half_avg
             FROM (
               SELECT ss.confidence_after, ss.duration_mins,
                      ROW_NUMBER() OVER (ORDER BY ss.completed_at DESC) AS rn
               FROM study_sessions ss
               JOIN concept_nodes cn ON cn.id = ss.node_id
               WHERE ss.user_id = $1 AND cn.goal_id = $2 AND ss.completed_at IS NOT NULL
               LIMIT 20
             ) sub`,
            [userId, resolvedGoalId]
          )
        : Promise.resolve({ rows: [] }),
    ]);

    const profile = profileResult.rows[0] ?? null;
    const nodeAgg = nodeAggResult.rows[0] ?? null;
    const struggleNodes = struggleResult.rows.map((r) => r.title);
    const sessionRow = sessionResult.rows[0] ?? null;

    const rawStack = profile?.primary_stack;
    const primaryStack: string[] = Array.isArray(rawStack)
      ? rawStack
      : typeof rawStack === 'string'
      ? (JSON.parse(rawStack || '[]') as string[])
      : [];

    const skillGaps: SkillGapSummary[] = (goal?.skillGaps ?? []).slice(0, 4).map((g: any) => ({
      skillArea: g?.structured?.skillArea ?? g?.skillArea ?? '',
      currentLevel: g?.structured?.currentLevel ?? g?.currentLevel ?? '',
      requiredLevel: g?.structured?.requiredLevel ?? g?.requiredLevel ?? '',
    })).filter((g: SkillGapSummary) => g.skillArea);

    const learningTopicTitles: string[] = (goal?.learningTopics ?? []).slice(0, 5).map(
      (t: any) => t?.structured?.title ?? t?.title ?? ''
    ).filter(Boolean);

    const recentHalf = sessionRow?.recent_half_avg ? parseFloat(sessionRow.recent_half_avg) : null;
    const olderHalf = sessionRow?.older_half_avg ? parseFloat(sessionRow.older_half_avg) : null;

    const nodeStats: NodeStats = {
      totalNodes: parseInt(nodeAgg?.total_nodes ?? '0', 10),
      doneNodes: parseInt(nodeAgg?.done_nodes ?? '0', 10),
      currentDepthLevel: nodeAgg?.current_depth_level ?? null,
      struggleNodeTitles: struggleNodes,
      reviewDueCount: parseInt(nodeAgg?.review_due_count ?? '0', 10),
    };

    const sessionStats: SessionStats = {
      recentSessionCount: parseInt(sessionRow?.session_count ?? '0', 10),
      avgConfidenceAfter: sessionRow?.avg_confidence_after ? parseFloat(sessionRow.avg_confidence_after) : null,
      avgDurationMins: sessionRow?.avg_duration_mins ? parseFloat(sessionRow.avg_duration_mins) : null,
      confidenceTrend: deriveTrend(recentHalf, olderHalf),
    };

    const ctx: UserContext = {
      seniorityLevel: profile?.seniority_level ?? null,
      jobTitle: profile?.job_title ?? null,
      primaryStack,
      availableMinsDay: profile?.available_mins_day ?? 45,
      yearsTotal: profile?.years_total ?? null,
      goalTitle: goal?.structured?.title ?? null,
      goalType: goal?.structured?.goalType ?? null,
      emotionalDriver: goal?.structured?.emotionalDriver ?? null,
      urgency: goal?.structured?.urgency ?? null,
      statedWhy: goal?.structured?.statedWhy ?? null,
      skillGaps,
      learningTopicTitles,
      nodeStats,
      sessionStats,
      toPromptString() {
        return buildPromptString(this);
      },
    };

    return ctx;
  } catch {
    return FALLBACK_CONTEXT;
  }
}

function buildPromptString(ctx: UserContext): string {
  const lines: string[] = ['Learner profile:'];

  const seniority = ctx.seniorityLevel ?? 'unknown seniority';
  const years = ctx.yearsTotal ? ` (${ctx.yearsTotal} years total)` : '';
  lines.push(`- Seniority: ${seniority}${years}`);
  if (ctx.jobTitle) lines.push(`- Role: ${ctx.jobTitle}`);
  if (ctx.primaryStack.length > 0) lines.push(`- Stack: ${ctx.primaryStack.join(', ')}`);
  lines.push(`- Available time: ${ctx.availableMinsDay} mins/day`);

  if (ctx.goalTitle) {
    lines.push('', `Current goal: "${ctx.goalTitle}"`);
    const meta: string[] = [];
    if (ctx.goalType) meta.push(`Type: ${ctx.goalType}`);
    if (ctx.urgency) meta.push(`Urgency: ${ctx.urgency}`);
    if (meta.length) lines.push(`- ${meta.join(' | ')}`);
    if (ctx.statedWhy) lines.push(`- Why they care: "${ctx.statedWhy}"`);
    if (ctx.skillGaps.length > 0) {
      const gapStr = ctx.skillGaps
        .map((g) => `${g.skillArea} (${g.currentLevel} → ${g.requiredLevel})`)
        .join(', ');
      lines.push(`- Key skill gaps: ${gapStr}`);
    }
    if (ctx.learningTopicTitles.length > 0) {
      lines.push(`- Learning topics: ${ctx.learningTopicTitles.join(', ')}`);
    }
  }

  const { nodeStats } = ctx;
  if (nodeStats.totalNodes > 0) {
    lines.push('', 'Progress snapshot:');
    lines.push(`- Nodes: ${nodeStats.doneNodes} done / ${nodeStats.totalNodes} total`);
    if (nodeStats.currentDepthLevel) lines.push(`- Currently studying: ${nodeStats.currentDepthLevel} depth concepts`);
    if (nodeStats.reviewDueCount > 0) lines.push(`- Nodes to review: ${nodeStats.reviewDueCount} due`);
    if (nodeStats.struggleNodeTitles.length > 0) {
      lines.push(`- Struggling with: ${nodeStats.struggleNodeTitles.join(', ')} (confidence ≤ 2 after review)`);
    }
  }

  const { sessionStats } = ctx;
  if (sessionStats.recentSessionCount > 0) {
    lines.push('', `Session pattern (last ${sessionStats.recentSessionCount} sessions):`);
    if (sessionStats.avgConfidenceAfter != null) {
      lines.push(`- Avg confidence after: ${sessionStats.avgConfidenceAfter}/5 (${sessionStats.confidenceTrend})`);
    }
    if (sessionStats.avgDurationMins != null) {
      lines.push(`- Avg session duration: ${sessionStats.avgDurationMins} mins`);
    }
  }

  return lines.join('\n');
}
