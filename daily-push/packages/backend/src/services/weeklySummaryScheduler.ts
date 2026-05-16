import { pool } from '../db/postgres';
import { config } from '../config';
import { sendWeeklySummary } from './weeklyEmail';

interface WeeklySummaryRecipientRow {
  id: string;
}

export async function runWeeklySummaryCycle(now = new Date()): Promise<void> {
  if (!config.weeklySummary.enabled || !config.resend.apiKey) {
    return;
  }

  const { rows } = await pool.query<WeeklySummaryRecipientRow>(
    `SELECT u.id
       FROM users u
       LEFT JOIN user_profiles_structured ups
         ON ups.user_id = u.id
      WHERE u.email IS NOT NULL
        AND COALESCE(ups.email_weekly_summary, TRUE) = TRUE
      ORDER BY u.created_at ASC`,
  );

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const result = await sendWeeklySummary(row.id, { now });
      if (result.status === 'sent') {
        sent += 1;
      } else {
        skipped += 1;
      }
    } catch (error) {
      failed += 1;
      console.error(
        `[weekly-summary] Failed for user ${row.id}:`,
        (error as Error).message,
      );
    }
  }

  if (sent > 0 || failed > 0) {
    console.log(
      `[weekly-summary] Cycle complete: sent=${sent} skipped=${skipped} failed=${failed}`,
    );
  }
}

export function startWeeklySummaryScheduler(): void {
  if (!config.weeklySummary.enabled) {
    return;
  }

  void runWeeklySummaryCycle().catch((error) => {
    console.error('[weekly-summary] Initial cycle failed:', error);
  });

  setInterval(() => {
    void runWeeklySummaryCycle().catch((error) => {
      console.error('[weekly-summary] Scheduled cycle failed:', error);
    });
  }, config.weeklySummary.checkIntervalMs);
}
