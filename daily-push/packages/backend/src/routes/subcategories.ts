import { Router, Request, Response, NextFunction } from 'express';
import { pool } from '../db/connection';

const router = Router();

// POST /subcategories
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { category_id, title, description } = req.body;
    if (!category_id || !title) { res.status(400).json({ error: 'category_id and title are required' }); return; }

    const conn = await pool.getConnection();
    const [maxPos] = await conn.query<any[]>(
      'SELECT COALESCE(MAX(position), 0) AS max FROM subcategories WHERE category_id = ?',
      [category_id]
    );
    const [result] = await conn.query<any>(
      'INSERT INTO subcategories (category_id, title, description, position) VALUES (?, ?, ?, ?)',
      [category_id, title, description || null, (maxPos[0].max as number) + 1]
    );
    const [rows] = await conn.query<any[]>('SELECT * FROM subcategories WHERE id = ?', [result.insertId]);
    conn.release();
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// PATCH /subcategories/:id
router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { title, description, position } = req.body;
    const fields: string[] = [];
    const values: any[] = [];
    if (title !== undefined) { fields.push('title = ?'); values.push(title); }
    if (description !== undefined) { fields.push('description = ?'); values.push(description); }
    if (position !== undefined) { fields.push('position = ?'); values.push(position); }
    if (fields.length === 0) { res.status(400).json({ error: 'No fields to update' }); return; }

    values.push(req.params.id);
    const conn = await pool.getConnection();
    await conn.query(`UPDATE subcategories SET ${fields.join(', ')} WHERE id = ?`, values);
    const [rows] = await conn.query<any[]>('SELECT * FROM subcategories WHERE id = ?', [req.params.id]);
    conn.release();
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /subcategories/:id
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const conn = await pool.getConnection();
    await conn.query('DELETE FROM subcategories WHERE id = ?', [req.params.id]);
    conn.release();
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
