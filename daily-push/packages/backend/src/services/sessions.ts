import { pool } from '../db/postgres';
import { getDb } from '../db/mongo';
import { ObjectId } from 'mongodb';
import { runUnlockLogic } from './decomposition';

// ─────────────────────────────────────────────
// SR interval ladder: days between reviews
// ─────────────────────────────────────────────

const SR_LADDER = [1, 3, 7, 14, 30];

function nextIntervalDays(currentDays: number, confidence: number): number {
  const idx = SR_LADDER.indexOf(currentDays);
  const baseIdx = idx === -1 ? 0 : idx;

  if (confidence <= 2) return SR_LADDER[0];                                    // reset to 1d
  if (confidence === 3) return SR_LADDER[baseIdx];                             // same
  if (confidence === 4) return SR_LADDER[Math.min(baseIdx + 1, SR_LADDER.length - 1)]; // next
  return SR_LADDER[Math.min(baseIdx + 2, SR_LADDER.length - 1)];              // skip one (5)
}

// ─────────────────────────────────────────────
// Create a session
// ─────────────────────────────────────────────

export async function createSession(
  userId: string,
  nodeId: string,
  sessionType: 'new' | 'review',
  timebox: number
): Promise<string> {
  // Mark node in_progress (only if it was available)
  await pool.query(
    `UPDATE concept_nodes SET status = 'in_progress'
     WHERE id = $1 AND user_id = $2 AND status IN ('available', 'review_due')`,
    [nodeId, userId]
  );

  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO study_sessions (user_id, node_id, session_type, started_at, duration_mins)
     VALUES ($1, $2, $3, NOW(), $4)
     RETURNING id`,
    [userId, nodeId, sessionType, timebox]
  );
  return rows[0].id;
}

// ─────────────────────────────────────────────
// Complete a session
// ─────────────────────────────────────────────

export interface CompleteResult {
  unlockedNodeTitles: string[];
  newMilestones: string[];
  nextNode: NodeSummary | null;
}

interface NodeSummary {
  id: string;
  title: string;
  depth_level: string;
  estimated_mins: number;
  learning_topic_id: string;
}

export async function completeSession(
  sessionId: string,
  userId: string,
  confidenceAfter: number,
  durationMins: number,
  notes: string | null
): Promise<CompleteResult> {
  // Get the session + node info
  const { rows: sessionRows } = await pool.query<{
    node_id: string;
    goal_id: string;
    session_type: string;
  }>(
    `SELECT ss.node_id, cn.goal_id, ss.session_type
     FROM study_sessions ss
     JOIN concept_nodes cn ON cn.id = ss.node_id
     WHERE ss.id = $1 AND ss.user_id = $2`,
    [sessionId, userId]
  );

  if (sessionRows.length === 0) throw new Error('Session not found');
  const { node_id, goal_id, session_type } = sessionRows[0];

  // Mark session complete
  await pool.query(
    `UPDATE study_sessions
     SET completed_at = NOW(), duration_mins = $1, confidence_after = $2, notes = $3
     WHERE id = $4`,
    [durationMins, confidenceAfter, notes, sessionId]
  );

  // Mark node done + record confidence + last studied
  await pool.query(
    `UPDATE concept_nodes
     SET status = 'done', confidence = $1, last_studied_at = NOW()
     WHERE id = $2 AND user_id = $3`,
    [confidenceAfter, node_id, userId]
  );

  // SR queue: add for new sessions, update for reviews
  if (session_type === 'new') {
    await pool.query(
      `INSERT INTO spaced_repetition_queue
         (node_id, user_id, due_at, interval_days, repetition_count, last_confidence)
       VALUES ($1, $2, NOW() + INTERVAL '1 day', 1, 1, $3)
       ON CONFLICT DO NOTHING`,
      [node_id, userId, confidenceAfter]
    );
  } else {
    const { rows: srRows } = await pool.query<{ interval_days: number }>(
      `SELECT interval_days FROM spaced_repetition_queue WHERE node_id = $1 AND user_id = $2`,
      [node_id, userId]
    );
    if (srRows.length > 0) {
      const newInterval = nextIntervalDays(srRows[0].interval_days, confidenceAfter);
      await pool.query(
        `UPDATE spaced_repetition_queue
         SET interval_days = $1,
             due_at = NOW() + ($1 || ' days')::INTERVAL,
             repetition_count = repetition_count + 1,
             last_confidence = $2
         WHERE node_id = $3 AND user_id = $4`,
        [newInterval, confidenceAfter, node_id, userId]
      );
    }
  }

  // Run unlock logic — check if completing this node unblocks dependents
  const { rows: prevAvailable } = await pool.query<{ id: string }>(
    `SELECT id FROM concept_nodes WHERE user_id = $1 AND goal_id = $2 AND status = 'available'`,
    [userId, goal_id]
  );
  const prevAvailableIds = new Set(prevAvailable.map(r => r.id));

  await runUnlockLogic(userId, goal_id);

  // Find newly unlocked nodes
  const { rows: nowAvailable } = await pool.query<{ id: string; title: string }>(
    `SELECT id, title FROM concept_nodes
     WHERE user_id = $1 AND goal_id = $2 AND status = 'available'`,
    [userId, goal_id]
  );
  const unlockedNodeTitles = nowAvailable
    .filter(r => !prevAvailableIds.has(r.id))
    .map(r => r.title);

  // Get the next node to study
  const { rows: nextRows } = await pool.query<NodeSummary>(
    `SELECT id, title, depth_level, estimated_mins, learning_topic_id
     FROM concept_nodes
     WHERE user_id = $1 AND goal_id = $2 AND status = 'available'
     ORDER BY position
     LIMIT 1`,
    [userId, goal_id]
  );

  const newMilestones = await detectMilestones(userId, goal_id);

  // Write listeners — best-effort, non-blocking
  updateDifficultyMap(userId, node_id, confidenceAfter).catch(() => {});
  if (newMilestones.includes('100% complete')) {
    writePathOutcome(userId, goal_id).catch(() => {});
  }

  return {
    unlockedNodeTitles,
    newMilestones,
    nextNode: nextRows[0] ?? null,
  };
}

// ─────────────────────────────────────────────
// concept_difficulty_map: update on session complete
// ─────────────────────────────────────────────

async function updateDifficultyMap(
  userId: string,
  nodeId: string,
  confidenceAfter: number
): Promise<void> {
  const db = getDb();

  // Get node metadata + user profile group
  const { rows: nodeRows } = await pool.query<{
    title: string; depth_level: string; learning_topic_id: string;
  }>(
    `SELECT title, depth_level, learning_topic_id FROM concept_nodes WHERE id = $1`,
    [nodeId]
  );
  if (nodeRows.length === 0) return;

  const { rows: profileRows } = await pool.query<{ seniority_level: string | null }>(
    `SELECT seniority_level FROM user_profiles_structured WHERE user_id = $1`,
    [userId]
  );
  const profileGroup = profileRows[0]?.seniority_level ?? 'unknown';

  const node = nodeRows[0];

  await db.collection('concept_difficulty_map').updateOne(
    { nodeTitle: node.title, depthLevel: node.depth_level, profileGroup },
    {
      $inc: { sessionCount: 1, totalConfidence: confidenceAfter },
      $setOnInsert: { nodeTitle: node.title, depthLevel: node.depth_level, profileGroup, createdAt: new Date() },
      $set: { updatedAt: new Date() },
    },
    { upsert: true }
  );
}

// ─────────────────────────────────────────────
// path_outcomes: write snapshot when goal is achieved
// ─────────────────────────────────────────────

async function writePathOutcome(userId: string, goalId: string): Promise<void> {
  const db = getDb();

  const goal = await db.collection('goals').findOne({ _id: new ObjectId(goalId) });
  if (!goal) return;

  const { rows: statsRows } = await pool.query<{ total: string; done: string }>(
    `SELECT COUNT(*)::TEXT AS total, COUNT(*) FILTER (WHERE status = 'done')::TEXT AS done
     FROM concept_nodes WHERE user_id = $1 AND goal_id = $2`,
    [userId, goalId]
  );

  const { rows: sessionRows } = await pool.query<{ session_count: string; total_mins: string }>(
    `SELECT COUNT(*)::TEXT AS session_count, COALESCE(SUM(duration_mins), 0)::TEXT AS total_mins
     FROM study_sessions WHERE user_id = $1 AND completed_at IS NOT NULL`,
    [userId]
  );

  const createdAt = goal.createdAt as Date;
  const achievedAt = new Date();
  const actualWeeks = createdAt
    ? Math.round((achievedAt.getTime() - createdAt.getTime()) / (7 * 24 * 60 * 60 * 1000))
    : null;

  await db.collection('path_outcomes').insertOne({
    userId,
    goalId,
    goalType: goal.structured?.goalType ?? 'unknown',
    goalTitle: goal.structured?.title ?? 'Unknown',
    totalNodes: parseInt(statsRows[0]?.total ?? '0', 10),
    doneNodes: parseInt(statsRows[0]?.done ?? '0', 10),
    estimatedWeeks: goal.structured?.estimatedWeeks ?? null,
    actualWeeks,
    totalSessions: parseInt(sessionRows[0]?.session_count ?? '0', 10),
    totalStudyMins: parseInt(sessionRows[0]?.total_mins ?? '0', 10),
    skillGaps: goal.skillGaps?.map((g: { structured: { skillArea: string } }) => g.structured?.skillArea),
    achievedAt,
  });

  // Also mark the goal as achieved
  await db.collection('goals').updateOne(
    { _id: new ObjectId(goalId) },
    { $set: { status: 'achieved', achievedAt, updatedAt: achievedAt } }
  );
}

// ─────────────────────────────────────────────
// Calendar heatmap data (last N days)
// ─────────────────────────────────────────────

export async function getCalendarData(
  userId: string,
  days = 90
): Promise<Array<{ date: string; count: number }>> {
  const { rows } = await pool.query<{ session_date: string; count: string }>(
    `SELECT DATE(completed_at)::TEXT AS session_date, COUNT(*)::TEXT AS count
     FROM study_sessions
     WHERE user_id = $1
       AND completed_at IS NOT NULL
       AND completed_at >= NOW() - ($2 || ' days')::INTERVAL
     GROUP BY session_date
     ORDER BY session_date`,
    [userId, days]
  );

  const byDate = new globalThis.Map(rows.map(r => [r.session_date, parseInt(r.count, 10)]));
  const result: Array<{ date: string; count: number }> = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    result.push({ date: d, count: byDate.get(d) ?? 0 });
  }
  return result;
}

// ─────────────────────────────────────────────
// Milestone detection
// ─────────────────────────────────────────────

const PCT_THRESHOLDS = [25, 50, 75, 100];
const DEPTH_LAYERS = ['surface', 'foundational', 'intermediate', 'advanced'] as const;

async function detectMilestones(
  userId: string,
  goalId: string
): Promise<string[]> {
  const db = getDb();

  const { rows: stats } = await pool.query<{
    total: string;
    done: string;
    depth_level: string;
    depth_total: string;
    depth_done: string;
  }>(
    `SELECT
       COUNT(*)::TEXT AS total,
       COUNT(*) FILTER (WHERE status = 'done')::TEXT AS done,
       NULL::TEXT AS depth_level,
       NULL::TEXT AS depth_total,
       NULL::TEXT AS depth_done
     FROM concept_nodes WHERE user_id = $1 AND goal_id = $2
     UNION ALL
     SELECT
       NULL, NULL,
       depth_level,
       COUNT(*)::TEXT,
       COUNT(*) FILTER (WHERE status = 'done')::TEXT
     FROM concept_nodes WHERE user_id = $1 AND goal_id = $2
     GROUP BY depth_level`,
    [userId, goalId]
  );

  const overallRow = stats.find(r => r.depth_level === null);
  const total = parseInt(overallRow?.total ?? '0', 10);
  const done = parseInt(overallRow?.done ?? '0', 10);
  const pct = total > 0 ? Math.floor((done / total) * 100) : 0;

  const goal = await db.collection('goals').findOne({ _id: new ObjectId(goalId) });
  const achieved: string[] = (goal?.milestones ?? []).map((m: { structured: { title: string } }) => m.structured?.title);

  const newMilestones: string[] = [];

  // % thresholds
  for (const threshold of PCT_THRESHOLDS) {
    const title = `${threshold}% complete`;
    if (pct >= threshold && !achieved.includes(title)) {
      newMilestones.push(title);
    }
  }

  // Layer completion
  for (const depth of DEPTH_LAYERS) {
    const depthRow = stats.find(r => r.depth_level === depth);
    if (!depthRow) continue;
    const dt = parseInt(depthRow.depth_total, 10);
    const dd = parseInt(depthRow.depth_done, 10);
    if (dt > 0 && dd === dt) {
      const title = `${depth.charAt(0).toUpperCase() + depth.slice(1)} layer complete`;
      if (!achieved.includes(title)) {
        newMilestones.push(title);
      }
    }
  }

  if (newMilestones.length > 0) {
    const now = new Date();
    await db.collection('goals').updateOne(
      { _id: new ObjectId(goalId) },
      {
        $push: {
          milestones: {
            $each: newMilestones.map((title, i) => ({
              structured: { title, triggerType: 'automatic' },
              achievedAt: now,
              sequence: (goal?.milestones?.length ?? 0) + i + 1,
            })),
          },
        },
      }
    );
  }

  return newMilestones;
}

// ─────────────────────────────────────────────
// Streak calculator
// ─────────────────────────────────────────────

export async function getStreak(userId: string): Promise<{
  currentStreak: number;
  lastActiveDate: string | null;
  totalSessions: number;
}> {
  const { rows: dateRows } = await pool.query<{ session_date: string }>(
    `SELECT DISTINCT DATE(completed_at)::TEXT AS session_date
     FROM study_sessions
     WHERE user_id = $1 AND completed_at IS NOT NULL
     ORDER BY session_date DESC`,
    [userId]
  );
  const { rows: countRows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM study_sessions WHERE user_id = $1 AND completed_at IS NOT NULL`,
    [userId]
  );

  const totalSessions = parseInt(countRows[0]?.count ?? '0', 10);
  if (dateRows.length === 0) return { currentStreak: 0, lastActiveDate: null, totalSessions };

  const lastActiveDate = dateRows[0].session_date;
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

  // Streak only counts if user was active today or yesterday
  if (lastActiveDate !== today && lastActiveDate !== yesterday) {
    return { currentStreak: 0, lastActiveDate, totalSessions };
  }

  let streak = 0;
  let expecting = lastActiveDate;
  for (const { session_date } of dateRows) {
    if (session_date === expecting) {
      streak++;
      const d = new Date(expecting);
      d.setUTCDate(d.getUTCDate() - 1);
      expecting = d.toISOString().slice(0, 10);
    } else {
      break;
    }
  }

  return { currentStreak: streak, lastActiveDate, totalSessions };
}

// ─────────────────────────────────────────────
// Today data: goal + next node + review + streak
// ─────────────────────────────────────────────

export interface TodayData {
  goal: {
    id: string;
    title: string;
    totalNodes: number;
    doneNodes: number;
    estimatedWeeksRemaining: number;
    topicsMap: Record<string, string>; // learningTopicId → topic title
  } | null;
  node: (NodeSummary & { description: string }) | null;
  reviewNode: (NodeSummary & { description: string; dueAt: string }) | null;
  streak: number;
}

export async function getTodayData(userId: string): Promise<TodayData> {
  const db = getDb();

  // Get primary active goal from MongoDB
  const goal = await db.collection('goals').findOne({ userId, isPrimary: true, status: 'active' });
  if (!goal) return { goal: null, node: null, reviewNode: null, streak: 0 };

  const goalId = goal._id.toString();

  // Node stats
  const { rows: statsRows } = await pool.query<{ total: string; done: string }>(
    `SELECT
       COUNT(*) FILTER (WHERE goal_id = $1)::TEXT AS total,
       COUNT(*) FILTER (WHERE goal_id = $1 AND status = 'done')::TEXT AS done
     FROM concept_nodes WHERE user_id = $2`,
    [goalId, userId]
  );
  const totalNodes = parseInt(statsRows[0]?.total ?? '0', 10);
  const doneNodes = parseInt(statsRows[0]?.done ?? '0', 10);

  // Build topic title map
  const topicsMap: Record<string, string> = {};
  for (const t of goal.learningTopics ?? []) {
    if (t._id && t.structured?.title) {
      topicsMap[t._id.toString()] = t.structured.title;
    }
  }

  // Estimate weeks remaining (rough: remaining nodes × median 30 mins ÷ user's mins/day)
  const { rows: profileRows } = await pool.query<{ available_mins_day: number }>(
    `SELECT available_mins_day FROM user_profiles_structured WHERE user_id = $1`,
    [userId]
  );
  const minsDay = profileRows[0]?.available_mins_day ?? 45;
  const remainingNodes = totalNodes - doneNodes;
  const estimatedWeeksRemaining = remainingNodes > 0
    ? Math.ceil((remainingNodes * 30) / (minsDay * 5)) // 5 days/week
    : 0;

  // Next node to study (available, lowest position)
  const { rows: nodeRows } = await pool.query<NodeSummary & { description: string }>(
    `SELECT id, title, description, depth_level, estimated_mins, learning_topic_id
     FROM concept_nodes
     WHERE user_id = $1 AND goal_id = $2 AND status = 'available'
     ORDER BY position
     LIMIT 1`,
    [userId, goalId]
  );

  // Review due (earliest overdue from SR queue)
  const { rows: reviewRows } = await pool.query<NodeSummary & { description: string; due_at: string }>(
    `SELECT cn.id, cn.title, cn.description, cn.depth_level, cn.estimated_mins,
            cn.learning_topic_id, srq.due_at::TEXT AS due_at
     FROM spaced_repetition_queue srq
     JOIN concept_nodes cn ON cn.id = srq.node_id
     WHERE srq.user_id = $1 AND srq.due_at <= NOW()
       AND cn.status != 'in_progress'
     ORDER BY srq.due_at
     LIMIT 1`,
    [userId]
  );

  const { currentStreak } = await getStreak(userId);

  return {
    goal: {
      id: goalId,
      title: goal.structured?.title ?? 'Your goal',
      totalNodes,
      doneNodes,
      estimatedWeeksRemaining,
      topicsMap,
    },
    node: nodeRows[0]
      ? { ...nodeRows[0] }
      : null,
    reviewNode: reviewRows[0]
      ? { ...reviewRows[0], dueAt: reviewRows[0].due_at }
      : null,
    streak: currentStreak,
  };
}
