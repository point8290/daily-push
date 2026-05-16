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

function toInt(value: string | number | null | undefined): number {
  return Number.parseInt(String(value ?? 0), 10) || 0;
}

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

export async function getProductMetricsSummary(
  windowDays = 30,
): Promise<ProductMetricsSummary> {
  const normalizedWindowDays = Math.max(7, Math.min(windowDays, 90));

  const [{ rows: userRows }, { rows: activeRows }, { rows: sessionRows }, { rows: funnelRows }, { rows: premiumRows }, { rows: planRows }] =
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
           COUNT(DISTINCT user_id)::int AS unique_users
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
           COUNT(DISTINCT user_id)::int AS unique_users
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
  };
}
