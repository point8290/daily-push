import { Router, Request, Response, NextFunction } from 'express';
import { pool } from '../db/connection';
import { advanceQueue } from '../services/roadmap';

// mysql2 auto-parses JSON columns — only parse if still a string
const parseJson = (val: any) => typeof val === 'string' ? JSON.parse(val) : (val ?? null);

const router = Router();

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const topicId = req.query.topic_id ? Number(req.query.topic_id) : null;
    const conn = await pool.getConnection();
    const [rows] = topicId
      ? await conn.query<any[]>(
          `SELECT si.*, t.title as topic_title
           FROM study_items si
           JOIN topics t ON si.topic_id = t.id
           WHERE si.topic_id = ?
           ORDER BY si.type ASC, si.position ASC`,
          [topicId]
        )
      : await conn.query<any[]>(
          `SELECT si.*, t.title as topic_title
           FROM study_items si
           JOIN topics t ON si.topic_id = t.id
           ORDER BY t.position ASC, si.position ASC`
        );
    conn.release();
    const items = rows.map((r: any) => ({
      ...r,
      resources: parseJson(r.resources),
    }));
    res.json(items);
  } catch (err) { next(err); }
});

router.get('/current', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    await advanceQueue();
    const conn = await pool.getConnection();
    const [rows] = await conn.query<any[]>(
      `SELECT si.*, t.title as topic_title
       FROM study_items si
       JOIN topics t ON si.topic_id = t.id
       WHERE si.status = 'current'
       LIMIT 1`
    );
    conn.release();
    if (rows.length === 0) { res.json(null); return; }
    const item = { ...rows[0], resources: parseJson(rows[0].resources) };
    res.json(item);
  } catch (err) { next(err); }
});

router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, position } = req.body;
    const fields: string[] = [];
    const values: any[] = [];
    if (status !== undefined) { fields.push('status = ?'); values.push(status); }
    if (position !== undefined) { fields.push('position = ?'); values.push(position); }
    if (fields.length === 0) { res.status(400).json({ error: 'No fields to update' }); return; }
    values.push(req.params.id);
    const conn = await pool.getConnection();
    await conn.query(`UPDATE study_items SET ${fields.join(', ')} WHERE id = ?`, values);
    const [rows] = await conn.query<any[]>('SELECT * FROM study_items WHERE id = ?', [req.params.id]);
    conn.release();
    res.json({ ...rows[0], resources: parseJson(rows[0].resources) });
  } catch (err) { next(err); }
});

router.post('/:id/complete', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { duration_mins, notes } = req.body;
    const today = new Date().toISOString().split('T')[0];
    const conn = await pool.getConnection();

    await conn.query("UPDATE study_items SET status = 'done' WHERE id = ?", [req.params.id]);
    await conn.query(
      `INSERT IGNORE INTO study_sessions (study_item_id, studied_at, duration_mins, notes)
       VALUES (?, ?, ?, ?)`,
      [req.params.id, today, duration_mins || null, notes || null]
    );
    conn.release();

    // Promote next item
    await advanceQueue();
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.post('/:id/skip', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const conn = await pool.getConnection();
    await conn.query("UPDATE study_items SET status = 'skipped' WHERE id = ?", [_req.params.id]);
    conn.release();
    await advanceQueue();
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
