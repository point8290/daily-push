import { Resend } from 'resend';
import { config } from '../config';
import { pool } from '../db/postgres';
import { getDb } from '../db/mongo';
import { ObjectId } from 'mongodb';
import { markEmailSent } from './pipelineTracker';

const resend = new Resend(config.resend.apiKey);

export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  await resend.emails.send({
    from: config.resend.fromEmail,
    to: params.to,
    subject: params.subject,
    html: params.html,
  });
}

export async function sendPipelineCompleteEmail(
  userId: string,
  goalId: string,
  result: { nodesCreated: number; topicsDecomposed: number; topicsFailed: number }
): Promise<void> {
  if (!config.resend.apiKey) return;

  // Get user email
  const { rows } = await pool.query<{ email: string; name: string }>(
    'SELECT email, name FROM users WHERE id = $1',
    [userId]
  );
  if (!rows.length || !rows[0].email) return;
  const { email, name } = rows[0];

  // Check email preference
  const { rows: prefRows } = await pool.query<{ email_weekly_summary: boolean }>(
    'SELECT email_weekly_summary FROM user_profiles_structured WHERE user_id = $1',
    [userId]
  );
  if (prefRows.length && prefRows[0].email_weekly_summary === false) return;

  // Get goal title
  const db = getDb();
  const goal = await db.collection('goals').findOne(
    { _id: new ObjectId(goalId) },
    { projection: { 'structured.title': 1 } }
  );
  const goalTitle = goal?.structured?.title ?? 'Your goal';
  const firstName = name?.split(' ')[0] ?? 'there';
  const goalUrl = `${config.app.frontendUrl}/goals/${goalId}`;

  const { nodesCreated, topicsDecomposed, topicsFailed } = result;
  const isPartial = topicsFailed > 0;

  const subject = isPartial
    ? `Your plan is mostly ready (${topicsFailed} topic${topicsFailed > 1 ? 's' : ''} need retry) — ${goalTitle}`
    : `Your study nodes are ready — ${goalTitle}`;

  const failedSection = isPartial ? `
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:6px;
                padding:10px 14px;margin-bottom:20px;">
      <p style="font-size:13px;color:#92400e;margin:0;">
        ${topicsFailed} topic${topicsFailed > 1 ? 's' : ''} could not be decomposed.
        You can retry them from your goal page.
      </p>
    </div>` : '';

  const failedStatCard = isPartial ? `
    <div style="flex:1;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;
                padding:14px;text-align:center;">
      <p style="font-size:24px;font-weight:700;color:#dc2626;margin:0;">${topicsFailed}</p>
      <p style="font-size:12px;color:#64748b;margin:4px 0 0;">topics failed</p>
    </div>` : '';

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="font-family:system-ui,sans-serif;background:#f8fafc;margin:0;padding:32px 16px;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;
              border:1px solid #e2e8f0;overflow:hidden;">
    <div style="background:linear-gradient(135deg,#0284c7,#4f46e5);padding:24px 28px;">
      <p style="color:#bae6fd;font-size:11px;font-weight:600;letter-spacing:.08em;
                text-transform:uppercase;margin:0 0 6px;">Daily Push</p>
      <h1 style="color:#fff;font-size:20px;font-weight:700;margin:0;line-height:1.3;">
        Your learning path is ready
      </h1>
    </div>
    <div style="padding:24px 28px;">
      <p style="color:#334155;font-size:15px;margin:0 0 20px;">
        Hi ${firstName}, your study plan for <strong>${goalTitle}</strong> has been built.
      </p>
      <div style="display:flex;gap:12px;margin-bottom:20px;">
        <div style="flex:1;background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;
                    padding:14px;text-align:center;">
          <p style="font-size:24px;font-weight:700;color:#0284c7;margin:0;">${nodesCreated}</p>
          <p style="font-size:12px;color:#64748b;margin:4px 0 0;">concept nodes</p>
        </div>
        <div style="flex:1;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;
                    padding:14px;text-align:center;">
          <p style="font-size:24px;font-weight:700;color:#16a34a;margin:0;">${topicsDecomposed}</p>
          <p style="font-size:12px;color:#64748b;margin:4px 0 0;">topics ready</p>
        </div>
        ${failedStatCard}
      </div>
      ${failedSection}
      <a href="${goalUrl}"
         style="display:block;background:#0284c7;color:#fff;text-decoration:none;
                font-size:14px;font-weight:600;text-align:center;
                padding:13px 20px;border-radius:8px;">
        Start studying →
      </a>
    </div>
    <div style="padding:16px 28px;border-top:1px solid #f1f5f9;">
      <p style="font-size:11px;color:#94a3b8;margin:0;">
        Daily Push — Become the engineer AI makes powerful.
      </p>
    </div>
  </div>
</body>
</html>`;

  await sendEmail({ to: email, subject, html });
  await markEmailSent(goalId);
}
