import { getDb } from '../db/mongo';
import { pool } from '../db/postgres';
import { getStreak, getCalendarData } from './sessions';

// Send weekly summary email via Resend
// Requires RESEND_API_KEY in .env and email stored on user record
export async function sendWeeklySummary(userId: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return; // silently skip if not configured

  const db = getDb();

  // Get user email
  const { rows: userRows } = await pool.query<{ email: string; name: string }>(
    `SELECT email, name FROM users WHERE id = $1`,
    [userId]
  );
  if (userRows.length === 0) return;

  // Check email preference
  const { rows: prefRows } = await pool.query<{ email_weekly_summary: boolean }>(
    `SELECT email_weekly_summary FROM user_profiles_structured WHERE user_id = $1`,
    [userId]
  );
  if (prefRows[0]?.email_weekly_summary === false) return;

  const { email, name } = userRows[0];

  // Gather stats
  const [streakData, calendarData] = await Promise.all([
    getStreak(userId),
    getCalendarData(userId, 7),
  ]);

  const sessionsThisWeek = calendarData.reduce((sum, d) => sum + d.count, 0);
  const activeGoal = await db.collection('goals').findOne({ userId, isPrimary: true, status: 'active' });

  const { rows: nodeStats } = await pool.query<{ total: string; done: string }>(
    `SELECT COUNT(*)::TEXT AS total, COUNT(*) FILTER (WHERE status = 'done')::TEXT AS done
     FROM concept_nodes WHERE user_id = $1 AND goal_id = $2`,
    [userId, activeGoal?._id?.toString() ?? '']
  );

  const totalNodes = parseInt(nodeStats[0]?.total ?? '0', 10);
  const doneNodes = parseInt(nodeStats[0]?.done ?? '0', 10);
  const pct = totalNodes > 0 ? Math.round((doneNodes / totalNodes) * 100) : 0;

  const subject = sessionsThisWeek > 0
    ? `Your week: ${sessionsThisWeek} session${sessionsThisWeek !== 1 ? 's' : ''} — keep going`
    : `Time to get back on track, ${name.split(' ')[0]}`;

  const body = `
Hi ${name.split(' ')[0]},

Here's your Daily Push weekly summary:

📚 Sessions this week: ${sessionsThisWeek}
🔥 Current streak: ${streakData.currentStreak} day${streakData.currentStreak !== 1 ? 's' : ''}
📈 Goal progress: ${doneNodes}/${totalNodes} nodes (${pct}%)

${sessionsThisWeek === 0 ? "You didn't study this week — that's okay. Start again today with just 15 minutes." : 'Great work staying consistent. Keep the momentum going.'}

Daily Push — Become the engineer AI makes powerful.
`.trim();

  // Send via Resend
  const { Resend } = await import('resend');
  const resend = new Resend(apiKey);

  await resend.emails.send({
    from: 'Daily Push <no-reply@dailypush.app>',
    to: email,
    subject,
    text: body,
  });
}
