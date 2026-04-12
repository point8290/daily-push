import { Router, Request, Response, NextFunction } from 'express';
import { pool } from '../db/connection';
import { getStreakData, getCalendarData } from '../services/streakTracker';

const router = Router();

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string || '1');
    const limit = parseInt(req.query.limit as string || '20');
    const offset = (page - 1) * limit;

    const conn = await pool.getConnection();
    const [rows] = await conn.query<any[]>(
      `SELECT ss.*, si.title as study_item_title, t.title as topic_title
       FROM study_sessions ss
       JOIN study_items si ON ss.study_item_id = si.id
       JOIN topics t ON si.topic_id = t.id
       ORDER BY ss.studied_at DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );
    const [countRows] = await conn.query<any[]>('SELECT COUNT(*) as total FROM study_sessions');
    conn.release();
    res.json({ sessions: rows, total: countRows[0].total, page, limit });
  } catch (err) { next(err); }
});

router.get('/streak', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const streak = await getStreakData();
    res.json(streak);
  } catch (err) { next(err); }
});

router.get('/calendar', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const days = parseInt(req.query.days as string || '90');
    const calendar = await getCalendarData(days);
    res.json(calendar);
  } catch (err) { next(err); }
});

export default router;
