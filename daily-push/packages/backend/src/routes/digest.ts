import { Router, Request, Response, NextFunction } from 'express';
import { pool } from '../db/connection';
import { buildEmailHtml, getCurrentStudyItem } from '../services/digestBuilder';
import { getTopNewsItems } from '../services/newsCurator';
import { getStreakData } from '../services/streakTracker';
import { sendEmail } from '../services/emailService';
import { advanceQueue } from '../services/roadmap';

const router = Router();

router.get('/history', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const conn = await pool.getConnection();
    const [rows] = await conn.query<any[]>(
      `SELECT dd.*, si.title as study_item_title
       FROM daily_digests dd
       LEFT JOIN study_items si ON dd.study_item_id = si.id
       ORDER BY dd.sent_at DESC
       LIMIT 30`
    );
    conn.release();
    res.json(rows.map((r: any) => ({ ...r, news_item_ids: typeof r.news_item_ids === 'string' ? JSON.parse(r.news_item_ids || '[]') : (r.news_item_ids ?? []) })));
  } catch (err) { next(err); }
});

router.post('/preview', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    await advanceQueue();
    const [studyItem, newsItems, streak] = await Promise.all([
      getCurrentStudyItem(),
      getTopNewsItems(3),
      getStreakData(),
    ]);
    const html = buildEmailHtml({ studyItem, newsItems, streak });
    res.json({ studyItem, newsItems, streak, html });
  } catch (err) { next(err); }
});

router.post('/send', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const conn = await pool.getConnection();
    const [settingsRows] = await conn.query<any[]>('SELECT * FROM user_settings LIMIT 1');
    conn.release();

    if (settingsRows.length === 0 || !settingsRows[0].email) {
      res.status(400).json({ error: 'No email configured. Set up email in Settings first.' });
      return;
    }

    await advanceQueue();
    const [studyItem, newsItems, streak] = await Promise.all([
      getCurrentStudyItem(),
      getTopNewsItems(3),
      getStreakData(),
    ]);

    const html = buildEmailHtml({ studyItem, newsItems, streak });
    const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', month: 'long', day: 'numeric' });

    await sendEmail({
      to: settingsRows[0].email,
      subject: `Daily Push — ${today}`,
      html,
    });

    // Log digest
    const logConn = await pool.getConnection();
    await logConn.query(
      'INSERT INTO daily_digests (study_item_id, news_item_ids, email_status) VALUES (?, ?, ?)',
      [studyItem?.id || null, JSON.stringify(newsItems.map((n) => n.id)), 'sent']
    );
    logConn.release();

    res.json({ success: true, sent_to: settingsRows[0].email });
  } catch (err) { next(err); }
});

export default router;
