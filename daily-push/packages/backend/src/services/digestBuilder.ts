import { pool } from '../db/connection';
import { StudyItem, NewsItem, StreakData } from '../types';
import { config } from '../config';

export interface DigestContent {
  studyItem: StudyItem | null;
  newsItems: NewsItem[];
  streak: StreakData;
}

export function buildEmailHtml(content: DigestContent): string {
  const { studyItem, newsItems, streak } = content;

  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const studySection = studyItem
    ? `
    <div style="background:#f0f9ff;border-left:4px solid #0ea5e9;padding:20px;border-radius:4px;margin-bottom:24px;">
      <h2 style="margin:0 0 4px;color:#0c4a6e;font-size:18px;">Today's Study Session</h2>
      <p style="margin:0 0 12px;color:#64748b;font-size:13px;">⏱ ${studyItem.estimated_mins} min &nbsp;|&nbsp; Topic: ${studyItem.topic_title || ''}</p>
      <h3 style="margin:0 0 8px;color:#1e293b;font-size:16px;">📚 ${studyItem.title}</h3>
      <p style="margin:0 0 16px;color:#334155;line-height:1.6;">${studyItem.description || ''}</p>
      ${
        studyItem.resources && studyItem.resources.length > 0
          ? `<div style="margin-bottom:16px;">
              <strong style="color:#475569;font-size:13px;">RESOURCES</strong>
              <ul style="margin:8px 0 0;padding-left:20px;">
                ${studyItem.resources
                  .map(
                    (r) =>
                      `<li style="margin-bottom:4px;"><a href="${r.url}" style="color:#0ea5e9;text-decoration:none;">${r.label}</a> <span style="color:#94a3b8;font-size:12px;">${r.type}</span></li>`
                  )
                  .join('')}
              </ul>
            </div>`
          : ''
      }
      <a href="${config.app.frontendUrl}?complete=${studyItem.id}"
         style="display:inline-block;background:#0ea5e9;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">
        ✓ Mark as Done
      </a>
      &nbsp;
      <a href="${config.app.frontendUrl}?skip=${studyItem.id}"
         style="display:inline-block;background:#e2e8f0;color:#475569;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">
        Skip for Today
      </a>
    </div>`
    : `<div style="background:#fef9c3;border-left:4px solid #eab308;padding:20px;border-radius:4px;margin-bottom:24px;">
        <p style="margin:0;color:#713f12;">No study items in your queue. <a href="${config.app.frontendUrl}/roadmap" style="color:#0ea5e9;">Add a topic →</a></p>
      </div>`;

  const newsSection =
    newsItems.length > 0
      ? `
    <div style="margin-bottom:24px;">
      <h2 style="color:#1e293b;font-size:18px;margin-bottom:16px;border-bottom:2px solid #e2e8f0;padding-bottom:8px;">⚡ Tech Brief</h2>
      ${newsItems
        .map(
          (item, i) => `
        <div style="margin-bottom:16px;padding-bottom:16px;${i < newsItems.length - 1 ? 'border-bottom:1px solid #f1f5f9;' : ''}">
          <p style="margin:0 0 4px;font-weight:600;color:#1e293b;">${i + 1}. ${item.title}</p>
          <p style="margin:0 0 8px;color:#475569;font-size:14px;line-height:1.5;">${item.summary || ''}</p>
          <a href="${item.url}" style="color:#0ea5e9;font-size:13px;text-decoration:none;">→ Read more</a>
        </div>`
        )
        .join('')}
    </div>`
      : '';

  const streakSection = `
    <div style="background:#f8fafc;padding:12px 16px;border-radius:6px;text-align:center;color:#64748b;font-size:13px;">
      🔥 ${streak.current_streak} day streak &nbsp;|&nbsp; ${streak.total_sessions} sessions completed
    </div>`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;margin:0;padding:20px;">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <div style="background:#0f172a;padding:20px 24px;">
      <h1 style="margin:0;color:#fff;font-size:20px;">Daily Push</h1>
      <p style="margin:4px 0 0;color:#94a3b8;font-size:13px;">${today}</p>
    </div>
    <div style="padding:24px;">
      ${studySection}
      ${newsSection}
      ${streakSection}
    </div>
  </div>
</body>
</html>`;
}

export async function getCurrentStudyItem(): Promise<StudyItem | null> {
  const conn = await pool.getConnection();
  try {
    // Check if active category filter is set
    const [settings] = await conn.query<any[]>(
      'SELECT active_category_id FROM user_settings LIMIT 1'
    );
    const activeCategoryId: number | null = settings[0]?.active_category_id ?? null;

    let rows: any[];

    if (activeCategoryId) {
      [rows] = await conn.query<any[]>(
        `SELECT si.*, t.title as topic_title
         FROM study_items si
         JOIN topics t ON si.topic_id = t.id
         JOIN subcategories sc ON t.subcategory_id = sc.id
         WHERE si.status = 'current'
           AND sc.category_id = ?
         LIMIT 1`,
        [activeCategoryId]
      );
      // Fall back to any current item if none in active category
      if (rows.length === 0) {
        [rows] = await conn.query<any[]>(
          `SELECT si.*, t.title as topic_title
           FROM study_items si
           JOIN topics t ON si.topic_id = t.id
           WHERE si.status = 'current'
           LIMIT 1`
        );
      }
    } else {
      [rows] = await conn.query<any[]>(
        `SELECT si.*, t.title as topic_title
         FROM study_items si
         JOIN topics t ON si.topic_id = t.id
         WHERE si.status = 'current'
         LIMIT 1`
      );
    }

    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      ...row,
      resources: typeof row.resources === 'string' ? JSON.parse(row.resources) : (row.resources ?? null),
    } as StudyItem;
  } finally {
    conn.release();
  }
}
