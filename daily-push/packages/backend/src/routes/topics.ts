import { Router, Request, Response, NextFunction } from 'express';
import { pool } from '../db/connection';
import { generateStudyItems, saveGeneratedItems, enrichStudyItems, saveEnrichedSessions } from '../services/roadmap';

const router = Router();

router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const conn = await pool.getConnection();
    const [rows] = await conn.query<any[]>(
      `SELECT t.*, COUNT(si.id) as item_count,
              SUM(CASE WHEN si.status = 'done' THEN 1 ELSE 0 END) as done_count
       FROM topics t
       LEFT JOIN study_items si ON si.topic_id = t.id
       GROUP BY t.id
       ORDER BY t.position ASC`
    );
    conn.release();
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { title, description } = req.body;
    if (!title) { res.status(400).json({ error: 'title is required' }); return; }

    const conn = await pool.getConnection();
    const [maxPos] = await conn.query<any[]>('SELECT COALESCE(MAX(position), 0) AS max FROM topics');
    const [result] = await conn.query<any>(
      'INSERT INTO topics (title, description, position) VALUES (?, ?, ?)',
      [title, description || null, (maxPos[0].max as number) + 1]
    );
    const [rows] = await conn.query<any[]>('SELECT * FROM topics WHERE id = ?', [result.insertId]);
    conn.release();
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { title, description, position, status } = req.body;
    const fields: string[] = [];
    const values: any[] = [];

    if (title !== undefined) { fields.push('title = ?'); values.push(title); }
    if (description !== undefined) { fields.push('description = ?'); values.push(description); }
    if (position !== undefined) { fields.push('position = ?'); values.push(position); }
    if (status !== undefined) { fields.push('status = ?'); values.push(status); }

    if (fields.length === 0) { res.status(400).json({ error: 'No fields to update' }); return; }

    values.push(req.params.id);
    const conn = await pool.getConnection();
    await conn.query(`UPDATE topics SET ${fields.join(', ')} WHERE id = ?`, values);
    const [rows] = await conn.query<any[]>('SELECT * FROM topics WHERE id = ?', [req.params.id]);
    conn.release();
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const conn = await pool.getConnection();
    await conn.query('DELETE FROM topics WHERE id = ?', [req.params.id]);
    conn.release();
    res.status(204).send();
  } catch (err) { next(err); }
});

router.post('/:id/generate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const conn = await pool.getConnection();
    const [rows] = await conn.query<any[]>('SELECT * FROM topics WHERE id = ?', [req.params.id]);
    conn.release();

    if (rows.length === 0) { res.status(404).json({ error: 'Topic not found' }); return; }

    const topic = rows[0];
    const items = await generateStudyItems(topic);
    await saveGeneratedItems(topic.id, items);
    res.json({ generated: items.length, items });
  } catch (err) { next(err); }
});

router.post('/:id/enrich', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const conn = await pool.getConnection();
    const [rows] = await conn.query<any[]>('SELECT * FROM topics WHERE id = ?', [req.params.id]);
    conn.release();

    if (rows.length === 0) { res.status(404).json({ error: 'Topic not found' }); return; }

    const topic = rows[0];
    const sessions = await enrichStudyItems(topic);
    await saveEnrichedSessions(topic.id, sessions);
    res.json({ enriched: sessions.length, sessions });
  } catch (err) { next(err); }
});

export default router;
