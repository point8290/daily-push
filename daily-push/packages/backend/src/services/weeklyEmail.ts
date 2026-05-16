import { pool } from '../db/postgres';
import { config } from '../config';
import { getWeeklyReport } from './weeklyCheckins';
import { getEntitlementSummary } from './entitlements';
import { trackProductEvent } from './productEvents';

type WeeklySummarySkipReason =
  | 'missing_api_key'
  | 'user_missing'
  | 'email_missing'
  | 'preference_disabled'
  | 'feature_locked'
  | 'no_report'
  | 'not_due'
  | 'already_sent';

export interface WeeklySummaryDispatchResult {
  status: 'sent' | 'skipped';
  reason?: WeeklySummarySkipReason;
  goalId?: string;
  weekStart?: string;
}

interface WeeklySummaryUserRow {
  email: string | null;
  name: string | null;
  timezone: string | null;
  digest_time: string | null;
  email_weekly_summary: boolean | null;
}

interface WeeklySummaryDeliveryRow {
  id: string;
  delivery_status: 'processing' | 'sent' | 'failed';
  updated_at: string;
}

function normalizeTimeZone(value: string | null | undefined): string {
  const candidate = value?.trim() || 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return 'UTC';
  }
}

function normalizeDigestTime(raw: string | null | undefined): string {
  const value = raw?.trim() || config.weeklySummary.defaultDigestTime;
  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (!match) {
    return config.weeklySummary.defaultDigestTime;
  }

  const hours = Math.min(Math.max(parseInt(match[1], 10), 0), 23);
  const minutes = Math.min(Math.max(parseInt(match[2], 10), 0), 59);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function getLocalDateParts(
  now: Date,
  timeZone: string,
): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
} {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  });

  const parts = formatter.formatToParts(now);
  const values = new Map<string, string>();
  for (const part of parts) {
    if (part.type !== 'literal') {
      values.set(part.type, part.value);
    }
  }

  const weekdayMap: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };

  return {
    year: Number(values.get('year') ?? '1970'),
    month: Number(values.get('month') ?? '1'),
    day: Number(values.get('day') ?? '1'),
    hour: Number(values.get('hour') ?? '0'),
    minute: Number(values.get('minute') ?? '0'),
    weekday: weekdayMap[values.get('weekday') ?? 'Mon'] ?? 1,
  };
}

function getLocalWeekStart(now: Date, timeZone: string): string {
  const local = getLocalDateParts(now, timeZone);
  const date = new Date(Date.UTC(local.year, local.month - 1, local.day));
  date.setUTCDate(date.getUTCDate() - local.weekday + 1);
  return date.toISOString().slice(0, 10);
}

function isDigestTimeReached(now: Date, timeZone: string, digestTime: string): boolean {
  const local = getLocalDateParts(now, timeZone);
  const [targetHourRaw, targetMinuteRaw] = digestTime.split(':');
  const targetMinutes =
    (parseInt(targetHourRaw ?? '8', 10) * 60) +
    parseInt(targetMinuteRaw ?? '0', 10);
  const currentMinutes = (local.hour * 60) + local.minute;
  return currentMinutes >= targetMinutes;
}

async function getWeeklySummaryUser(
  userId: string,
): Promise<WeeklySummaryUserRow | null> {
  const { rows } = await pool.query<WeeklySummaryUserRow>(
    `SELECT
       u.email,
       u.name,
       ups.timezone,
       ups.digest_time::text,
       ups.email_weekly_summary
     FROM users u
     LEFT JOIN user_profiles_structured ups
       ON ups.user_id = u.id
     WHERE u.id = $1
     LIMIT 1`,
    [userId],
  );

  return rows[0] ?? null;
}

async function claimWeeklySummaryDelivery(params: {
  userId: string;
  goalId: string;
  weekStart: string;
  timeZone: string;
  digestTime: string;
}): Promise<{ deliveryId: string } | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: existingRows } = await client.query<WeeklySummaryDeliveryRow>(
      `SELECT id, delivery_status, updated_at::text
         FROM weekly_summary_deliveries
        WHERE user_id = $1
          AND goal_id = $2
          AND week_start = $3
          AND delivery_channel = 'email'
        FOR UPDATE`,
      [params.userId, params.goalId, params.weekStart],
    );

    const existing = existingRows[0] ?? null;
    if (!existing) {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO weekly_summary_deliveries
           (user_id, goal_id, week_start, delivery_channel, delivery_status, timezone, digest_time, metadata, created_at, updated_at)
         VALUES
           ($1, $2, $3, 'email', 'processing', $4, $5, '{}'::jsonb, NOW(), NOW())
         RETURNING id`,
        [
          params.userId,
          params.goalId,
          params.weekStart,
          params.timeZone,
          params.digestTime,
        ],
      );

      await client.query('COMMIT');
      return { deliveryId: rows[0].id };
    }

    const updatedAt = new Date(existing.updated_at);
    const staleProcessing =
      existing.delivery_status === 'processing' &&
      Number.isFinite(updatedAt.getTime()) &&
      (Date.now() - updatedAt.getTime()) > (2 * 60 * 60 * 1000);

    if (existing.delivery_status === 'failed' || staleProcessing) {
      await client.query(
        `UPDATE weekly_summary_deliveries
            SET delivery_status = 'processing',
                timezone = $2,
                digest_time = $3,
                metadata = '{}'::jsonb,
                updated_at = NOW(),
                sent_at = NULL
          WHERE id = $1`,
        [existing.id, params.timeZone, params.digestTime],
      );
      await client.query('COMMIT');
      return { deliveryId: existing.id };
    }

    await client.query('COMMIT');
    return null;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function markWeeklySummarySent(params: {
  deliveryId: string;
  subject: string;
  metadata: Record<string, unknown>;
}): Promise<void> {
  await pool.query(
    `UPDATE weekly_summary_deliveries
        SET delivery_status = 'sent',
            subject = $2,
            metadata = $3::jsonb,
            updated_at = NOW(),
            sent_at = NOW()
      WHERE id = $1`,
    [params.deliveryId, params.subject, JSON.stringify(params.metadata)],
  );
}

async function markWeeklySummaryFailed(params: {
  deliveryId: string;
  metadata: Record<string, unknown>;
}): Promise<void> {
  await pool.query(
    `UPDATE weekly_summary_deliveries
        SET delivery_status = 'failed',
            metadata = $2::jsonb,
            updated_at = NOW()
      WHERE id = $1`,
    [params.deliveryId, JSON.stringify(params.metadata)],
  );
}

export async function sendWeeklySummary(
  userId: string,
  options?: {
    now?: Date;
    force?: boolean;
    transport?: 'live' | 'dry-run';
  },
): Promise<WeeklySummaryDispatchResult> {
  const now = options?.now ?? new Date();
  const transport = options?.transport ?? 'live';
  if (transport === 'live' && !config.resend.apiKey) {
    return { status: 'skipped', reason: 'missing_api_key' };
  }

  const user = await getWeeklySummaryUser(userId);
  if (!user) {
    return { status: 'skipped', reason: 'user_missing' };
  }
  if (!user.email?.trim()) {
    return { status: 'skipped', reason: 'email_missing' };
  }
  if (user.email_weekly_summary === false) {
    return { status: 'skipped', reason: 'preference_disabled' };
  }

  const weeklyReports = await getEntitlementSummary(
    userId,
    'weekly_reports.enabled',
  );
  if (!weeklyReports.enabled) {
    return { status: 'skipped', reason: 'feature_locked' };
  }

  const report = await getWeeklyReport(userId);
  if (!report) {
    return { status: 'skipped', reason: 'no_report' };
  }

  const timeZone = normalizeTimeZone(user.timezone);
  const digestTime = normalizeDigestTime(user.digest_time);
  const weekStart = getLocalWeekStart(now, timeZone);
  if (!options?.force && !isDigestTimeReached(now, timeZone, digestTime)) {
    return {
      status: 'skipped',
      reason: 'not_due',
      goalId: report.goalId,
      weekStart,
    };
  }

  const claim = await claimWeeklySummaryDelivery({
    userId,
    goalId: report.goalId,
    weekStart,
    timeZone,
    digestTime,
  });

  if (!claim) {
    return {
      status: 'skipped',
      reason: 'already_sent',
      goalId: report.goalId,
      weekStart,
    };
  }

  const firstName = user.name?.split(' ')[0] ?? 'there';
  const sessionsThisWeek = report.stats.sessionsThisWeek;
  const subject =
    sessionsThisWeek > 0
      ? `Your week: ${sessionsThisWeek} session${sessionsThisWeek !== 1 ? 's' : ''} - keep going`
      : `Time to get back on track, ${firstName}`;

  const recoverySteps =
    report.recoveryPlan.actions.length > 0
      ? report.recoveryPlan.actions
          .slice(0, 3)
          .map((item, index) => `${index + 1}. ${item}`)
          .join('\n')
      : '1. Open Daily Push and complete one focused session.';

  const body = `
Hi ${firstName},

Here's your Daily Push weekly summary:

- Goal: ${report.goalTitle}
- Sessions this week: ${report.stats.sessionsThisWeek}
- Study minutes: ${report.stats.studyMinutesThisWeek}
- Current streak: ${report.stats.currentStreak} day${report.stats.currentStreak !== 1 ? 's' : ''}
- Goal progress: ${report.planHealth.completedNodes}/${report.planHealth.totalNodes} nodes (${report.planHealth.completionScore}%)
- Risk level: ${report.planHealth.riskScore}/100

Recovery plan:
${recoverySteps}

${report.recoveryPlan.headline}

Daily Push - Become the engineer AI makes powerful.
`.trim();

  try {
    if (transport === 'live') {
      const { Resend } = await import('resend');
      const resend = new Resend(config.resend.apiKey);

      await resend.emails.send({
        from: config.resend.fromEmail,
        to: user.email,
        subject,
        text: body,
      });
    }

    await markWeeklySummarySent({
      deliveryId: claim.deliveryId,
      subject,
      metadata: {
        transport,
        goalTitle: report.goalTitle,
        reportWeekStart: report.weekStart,
        reportWeekEnd: report.weekEnd,
        sessionsThisWeek: report.stats.sessionsThisWeek,
        studyMinutesThisWeek: report.stats.studyMinutesThisWeek,
        riskScore: report.planHealth.riskScore,
      },
    });

    void trackProductEvent({
      userId,
      goalId: report.goalId,
      eventKey: 'weekly_summary_sent',
      properties: {
        weekStart,
        reportWeekStart: report.weekStart,
        timeZone,
        digestTime,
        sessionsThisWeek,
      },
    });

    return { status: 'sent', goalId: report.goalId, weekStart };
  } catch (error) {
    await markWeeklySummaryFailed({
      deliveryId: claim.deliveryId,
      metadata: {
        error: (error as Error).message,
        failedAt: new Date().toISOString(),
      },
    });

    void trackProductEvent({
      userId,
      goalId: report.goalId,
      eventKey: 'weekly_summary_failed',
      properties: {
        weekStart,
        timeZone,
        digestTime,
        error: (error as Error).message,
      },
    });

    throw error;
  }
}
