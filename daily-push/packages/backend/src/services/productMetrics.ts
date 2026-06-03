import { pool } from '../db/postgres';

const FUNNEL_STAGES = [
  { eventKey: 'goal_started', label: 'Goal started' },
  { eventKey: 'goal_processed', label: 'Goal processed' },
  { eventKey: 'goal_confirmed', label: 'Goal confirmed' },
  { eventKey: 'session_started', label: 'Session started' },
  { eventKey: 'session_completed', label: 'Session completed' },
] as const;

const PREMIUM_EVENTS = [
  { eventKey: 'billing_checkout_started', label: 'Checkout starts' },
  { eventKey: 'career_market_landing_viewed', label: 'Role Discovery views' },
  { eventKey: 'role_recommendation_generated', label: 'Role recommendations' },
  { eventKey: 'target_role_saved', label: 'Target roles saved' },
  { eventKey: 'role_readiness_generated', label: 'Role readiness reports' },
  { eventKey: 'upgrade_plan_created', label: 'Upgrade plans created' },
  { eventKey: 'upgrade_sprint_started', label: 'Upgrade sprints started' },
  { eventKey: 'market_upgrade_clicked', label: 'Role Discovery upgrade clicks' },
  { eventKey: 'checkout_started_from_market', label: 'Role Discovery checkout starts' },
  { eventKey: 'role_market_feedback_submitted', label: 'Role Discovery pilot feedback' },
  { eventKey: 'weekly_report_viewed', label: 'Weekly report views' },
  { eventKey: 'artifact_exported', label: 'Artifact exports' },
  { eventKey: 'goal_gap_report_generated', label: 'Gap reports generated' },
  { eventKey: 'mock_interview_started', label: 'Mock interviews started' },
  { eventKey: 'mock_interview_evaluated', label: 'Mock interviews evaluated' },
] as const;

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

export interface RoleMarketPilotFeedbackScoreBucket {
  score: number;
  totalResponses: number;
  responsePct: number;
}

export interface RoleMarketPilotFeedbackReasonBucket {
  reason: string;
  label: string;
  totalResponses: number;
  responsePct: number;
  averageUsefulnessScore: number;
}

export interface RoleMarketPilotFeedbackSourceBucket {
  source: string;
  ctaLocation: string;
  totalResponses: number;
  uniqueRespondents: number;
  averageUsefulnessScore: number;
}

export interface RoleMarketPilotFeedbackSummary {
  totalResponses: number;
  uniqueRespondents: number;
  averageUsefulnessScore: number;
  positiveResponsePct: number;
  lowScoreResponsePct: number;
  latestFeedbackAt: string | null;
  scoreDistribution: RoleMarketPilotFeedbackScoreBucket[];
  reasonDistribution: RoleMarketPilotFeedbackReasonBucket[];
  sourceBreakdown: RoleMarketPilotFeedbackSourceBucket[];
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
  roleMarketPilotFeedback: RoleMarketPilotFeedbackSummary;
}

interface EventAggregateRow {
  event_key: string;
  total_events: string;
  unique_users: string;
}

interface UserSummaryRow {
  total_users: string;
  new_users_window: string;
}

interface ActiveUsersRow {
  active_users_7d: string;
  active_users_30d: string;
}

interface SessionSummaryRow {
  completed_7d: string;
  completed_30d: string;
  active_session_users_30d: string;
}

interface PlanCountRow {
  plan_key: string;
  user_count: string;
}

interface RoleMarketFeedbackSummaryRow {
  total_responses: string;
  unique_respondents: string;
  average_usefulness_score: string | null;
  positive_responses: string;
  low_score_responses: string;
  scored_responses: string;
  latest_feedback_at: string | null;
}

interface RoleMarketFeedbackScoreRow {
  score: number;
  total_responses: string;
}

interface RoleMarketFeedbackReasonRow {
  reason: string;
  total_responses: string;
  average_usefulness_score: string | null;
}

interface RoleMarketFeedbackSourceRow {
  source: string;
  cta_location: string;
  total_responses: string;
  unique_respondents: string;
  average_usefulness_score: string | null;
}

const ROLE_MARKET_FEEDBACK_REASON_LABELS: Record<string, string> = {
  clear_next_step: 'Clear next step',
  role_fit_unclear: 'Role fit unclear',
  missing_market_depth: 'Missing market depth',
  proof_plan_helpful: 'Proof plan helpful',
  too_generic: 'Too generic',
};

function toInt(value: string | number | null | undefined): number {
  return Number.parseInt(String(value ?? 0), 10) || 0;
}

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

function toFloat(value: string | number | null | undefined): number {
  const parsed = Number.parseFloat(String(value ?? 0));
  return Number.isFinite(parsed) ? parsed : 0;
}

function pct(part: number, total: number): number {
  if (total <= 0) return 0;
  return roundToOneDecimal((part / total) * 100);
}

export async function getProductMetricsSummary(
  windowDays = 30,
): Promise<ProductMetricsSummary> {
  const normalizedWindowDays = Math.max(7, Math.min(windowDays, 90));

  const [
    { rows: userRows },
    { rows: activeRows },
    { rows: sessionRows },
    { rows: funnelRows },
    { rows: premiumRows },
    { rows: planRows },
    { rows: feedbackSummaryRows },
    { rows: feedbackScoreRows },
    { rows: feedbackReasonRows },
    { rows: feedbackSourceRows },
  ] =
    await Promise.all([
      pool.query<UserSummaryRow>(
        `SELECT
           COUNT(*)::int AS total_users,
           COUNT(*) FILTER (
             WHERE created_at >= NOW() - ($1 || ' days')::INTERVAL
           )::int AS new_users_window
         FROM users`,
        [normalizedWindowDays],
      ),
      pool.query<ActiveUsersRow>(
        `SELECT
           COUNT(DISTINCT user_id) FILTER (
             WHERE created_at >= NOW() - INTERVAL '7 days'
           )::int AS active_users_7d,
           COUNT(DISTINCT user_id) FILTER (
             WHERE created_at >= NOW() - INTERVAL '30 days'
           )::int AS active_users_30d
         FROM product_events`,
      ),
      pool.query<SessionSummaryRow>(
        `SELECT
           COUNT(*) FILTER (
             WHERE completed_at >= NOW() - INTERVAL '7 days'
           )::int AS completed_7d,
           COUNT(*) FILTER (
             WHERE completed_at >= NOW() - INTERVAL '30 days'
           )::int AS completed_30d,
           COUNT(DISTINCT user_id) FILTER (
             WHERE completed_at >= NOW() - INTERVAL '30 days'
           )::int AS active_session_users_30d
         FROM study_sessions
         WHERE completed_at IS NOT NULL`,
      ),
      pool.query<EventAggregateRow>(
        `SELECT
           event_key,
           COUNT(*)::int AS total_events,
           COUNT(DISTINCT COALESCE(user_id::text, anonymous_id))::int AS unique_users
         FROM product_events
         WHERE created_at >= NOW() - ($1 || ' days')::INTERVAL
           AND event_key = ANY($2::text[])
         GROUP BY event_key`,
        [normalizedWindowDays, FUNNEL_STAGES.map((stage) => stage.eventKey)],
      ),
      pool.query<EventAggregateRow>(
        `SELECT
           event_key,
           COUNT(*)::int AS total_events,
           COUNT(DISTINCT COALESCE(user_id::text, anonymous_id))::int AS unique_users
         FROM product_events
         WHERE created_at >= NOW() - ($1 || ' days')::INTERVAL
           AND event_key = ANY($2::text[])
         GROUP BY event_key`,
        [normalizedWindowDays, PREMIUM_EVENTS.map((event) => event.eventKey)],
      ),
      pool.query<PlanCountRow>(
        `WITH latest_subscription AS (
           SELECT DISTINCT ON (user_id)
             user_id,
             plan_key,
             status
           FROM subscriptions
           ORDER BY user_id, updated_at DESC, created_at DESC
         )
         SELECT plan_key, COUNT(*)::int AS user_count
         FROM latest_subscription
         WHERE status IN ('trialing', 'active')
         GROUP BY plan_key`,
      ),
      pool.query<RoleMarketFeedbackSummaryRow>(
        `WITH feedback AS (
           SELECT
             user_id,
             anonymous_id,
             created_at,
             CASE
               WHEN (properties->>'usefulnessScore') ~ '^[1-5]$'
                 THEN (properties->>'usefulnessScore')::int
               ELSE NULL
             END AS score
           FROM product_events
           WHERE created_at >= NOW() - ($1 || ' days')::INTERVAL
             AND event_key = 'role_market_feedback_submitted'
         )
         SELECT
           COUNT(*)::int AS total_responses,
           COUNT(DISTINCT COALESCE(user_id::text, anonymous_id))::int AS unique_respondents,
           AVG(score)::numeric(10, 2) AS average_usefulness_score,
           COUNT(*) FILTER (WHERE score >= 4)::int AS positive_responses,
           COUNT(*) FILTER (WHERE score <= 2)::int AS low_score_responses,
           COUNT(score)::int AS scored_responses,
           MAX(created_at) AS latest_feedback_at
         FROM feedback`,
        [normalizedWindowDays],
      ),
      pool.query<RoleMarketFeedbackScoreRow>(
        `WITH feedback AS (
           SELECT
             CASE
               WHEN (properties->>'usefulnessScore') ~ '^[1-5]$'
                 THEN (properties->>'usefulnessScore')::int
               ELSE NULL
             END AS score
           FROM product_events
           WHERE created_at >= NOW() - ($1 || ' days')::INTERVAL
             AND event_key = 'role_market_feedback_submitted'
         )
         SELECT score, COUNT(*)::int AS total_responses
         FROM feedback
         WHERE score BETWEEN 1 AND 5
         GROUP BY score
         ORDER BY score`,
        [normalizedWindowDays],
      ),
      pool.query<RoleMarketFeedbackReasonRow>(
        `WITH feedback AS (
           SELECT
             COALESCE(NULLIF(properties->>'feedbackReason', ''), 'unknown') AS reason,
             CASE
               WHEN (properties->>'usefulnessScore') ~ '^[1-5]$'
                 THEN (properties->>'usefulnessScore')::int
               ELSE NULL
             END AS score
           FROM product_events
           WHERE created_at >= NOW() - ($1 || ' days')::INTERVAL
             AND event_key = 'role_market_feedback_submitted'
         )
         SELECT
           reason,
           COUNT(*)::int AS total_responses,
           AVG(score)::numeric(10, 2) AS average_usefulness_score
         FROM feedback
         GROUP BY reason
         ORDER BY COUNT(*) DESC, reason ASC`,
        [normalizedWindowDays],
      ),
      pool.query<RoleMarketFeedbackSourceRow>(
        `WITH feedback AS (
           SELECT
             user_id,
             anonymous_id,
             COALESCE(NULLIF(properties->>'source', ''), 'unknown') AS source,
             COALESCE(NULLIF(properties->>'ctaLocation', ''), 'unknown') AS cta_location,
             CASE
               WHEN (properties->>'usefulnessScore') ~ '^[1-5]$'
                 THEN (properties->>'usefulnessScore')::int
               ELSE NULL
             END AS score
           FROM product_events
           WHERE created_at >= NOW() - ($1 || ' days')::INTERVAL
             AND event_key = 'role_market_feedback_submitted'
         )
         SELECT
           source,
           cta_location,
           COUNT(*)::int AS total_responses,
           COUNT(DISTINCT COALESCE(user_id::text, anonymous_id))::int AS unique_respondents,
           AVG(score)::numeric(10, 2) AS average_usefulness_score
         FROM feedback
         GROUP BY source, cta_location
         ORDER BY COUNT(*) DESC, source ASC, cta_location ASC`,
        [normalizedWindowDays],
      ),
    ]);

  const userSummary = userRows[0] ?? {
    total_users: '0',
    new_users_window: '0',
  };
  const activeSummary = activeRows[0] ?? {
    active_users_7d: '0',
    active_users_30d: '0',
  };
  const sessionSummary = sessionRows[0] ?? {
    completed_7d: '0',
    completed_30d: '0',
    active_session_users_30d: '0',
  };

  const funnelLookup = new Map(
    funnelRows.map((row) => [row.event_key, row]),
  );
  const premiumLookup = new Map(
    premiumRows.map((row) => [row.event_key, row]),
  );

  const planCounts = {
    free: 0,
    pro: 0,
    sprint: 0,
    other: 0,
  };

  for (const row of planRows) {
    const count = toInt(row.user_count);
    if (row.plan_key === 'pro' || row.plan_key === 'sprint') {
      planCounts[row.plan_key] = count;
    } else {
      planCounts.other += count;
    }
  }

  const totalUsers = toInt(userSummary.total_users);
  const payingUsers = planCounts.pro + planCounts.sprint + planCounts.other;
  planCounts.free = Math.max(0, totalUsers - payingUsers);

  let previousUniqueUsers: number | null = null;
  const funnel = FUNNEL_STAGES.map((stage) => {
    const row = funnelLookup.get(stage.eventKey);
    const uniqueUsers = toInt(row?.unique_users);
    const totalEvents = toInt(row?.total_events);
    const conversionFromPreviousPct =
      previousUniqueUsers && previousUniqueUsers > 0
        ? roundToOneDecimal((uniqueUsers / previousUniqueUsers) * 100)
        : null;
    previousUniqueUsers = uniqueUsers;

    return {
      eventKey: stage.eventKey,
      label: stage.label,
      totalEvents,
      uniqueUsers,
      conversionFromPreviousPct,
    };
  });

  const premiumEvents = PREMIUM_EVENTS.map((event) => {
    const row = premiumLookup.get(event.eventKey);
    return {
      eventKey: event.eventKey,
      label: event.label,
      totalEvents: toInt(row?.total_events),
      uniqueUsers: toInt(row?.unique_users),
    };
  });

  const feedbackSummary = feedbackSummaryRows[0] ?? {
    total_responses: '0',
    unique_respondents: '0',
    average_usefulness_score: null,
    positive_responses: '0',
    low_score_responses: '0',
    scored_responses: '0',
    latest_feedback_at: null,
  };
  const feedbackTotal = toInt(feedbackSummary.total_responses);
  const scoredFeedbackTotal = toInt(feedbackSummary.scored_responses);
  const scoreLookup = new Map(feedbackScoreRows.map((row) => [row.score, row]));
  const scoreDistribution = [1, 2, 3, 4, 5].map((score) => {
    const totalResponses = toInt(scoreLookup.get(score)?.total_responses);
    return {
      score,
      totalResponses,
      responsePct: pct(totalResponses, scoredFeedbackTotal),
    };
  });
  const reasonDistribution = feedbackReasonRows.map((row) => {
    const totalResponses = toInt(row.total_responses);
    return {
      reason: row.reason,
      label: ROLE_MARKET_FEEDBACK_REASON_LABELS[row.reason] ?? row.reason,
      totalResponses,
      responsePct: pct(totalResponses, feedbackTotal),
      averageUsefulnessScore: roundToOneDecimal(toFloat(row.average_usefulness_score)),
    };
  });
  const sourceBreakdown = feedbackSourceRows.map((row) => ({
    source: row.source,
    ctaLocation: row.cta_location,
    totalResponses: toInt(row.total_responses),
    uniqueRespondents: toInt(row.unique_respondents),
    averageUsefulnessScore: roundToOneDecimal(toFloat(row.average_usefulness_score)),
  }));

  const completed30d = toInt(sessionSummary.completed_30d);
  const activeSessionUsers30d = toInt(sessionSummary.active_session_users_30d);

  return {
    generatedAt: new Date().toISOString(),
    windowDays: normalizedWindowDays,
    users: {
      totalUsers,
      newUsersWindow: toInt(userSummary.new_users_window),
      activeUsers7d: toInt(activeSummary.active_users_7d),
      activeUsers30d: toInt(activeSummary.active_users_30d),
      payingUsers,
      planCounts,
    },
    sessions: {
      completed7d: toInt(sessionSummary.completed_7d),
      completed30d,
      activeSessionUsers30d,
      averageCompletedPerActiveUser30d:
        activeSessionUsers30d > 0
          ? roundToOneDecimal(completed30d / activeSessionUsers30d)
          : 0,
    },
    funnel,
    premiumEvents,
    roleMarketPilotFeedback: {
      totalResponses: feedbackTotal,
      uniqueRespondents: toInt(feedbackSummary.unique_respondents),
      averageUsefulnessScore: roundToOneDecimal(toFloat(feedbackSummary.average_usefulness_score)),
      positiveResponsePct: pct(toInt(feedbackSummary.positive_responses), scoredFeedbackTotal),
      lowScoreResponsePct: pct(toInt(feedbackSummary.low_score_responses), scoredFeedbackTotal),
      latestFeedbackAt: feedbackSummary.latest_feedback_at,
      scoreDistribution,
      reasonDistribution,
      sourceBreakdown,
    },
  };
}
