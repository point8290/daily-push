import { Router, Request, Response, NextFunction } from 'express';
import { pool } from '../db/connection';

const router = Router();

// GET /categories — full nested tree: categories → subcategories → topics (with item counts)
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const conn = await pool.getConnection();

    const [categories] = await conn.query<any[]>(
      'SELECT * FROM categories ORDER BY position ASC, id ASC'
    );

    const [subcategories] = await conn.query<any[]>(
      'SELECT * FROM subcategories ORDER BY position ASC, id ASC'
    );

    const [topics] = await conn.query<any[]>(
      `SELECT t.*,
              COUNT(si.id) AS item_count,
              SUM(CASE WHEN si.status = 'done' THEN 1 ELSE 0 END) AS done_count
       FROM topics t
       LEFT JOIN study_items si ON si.topic_id = t.id
       GROUP BY t.id
       ORDER BY t.position ASC`
    );

    conn.release();

    // Build nested structure
    const topicsBySubcat = topics.reduce((acc: Record<number, any[]>, t: any) => {
      const key = t.subcategory_id ?? 0;
      if (!acc[key]) acc[key] = [];
      acc[key].push({ ...t, item_count: Number(t.item_count), done_count: Number(t.done_count) });
      return acc;
    }, {});

    const subcatsByCategory = subcategories.reduce((acc: Record<number, any[]>, s: any) => {
      if (!acc[s.category_id]) acc[s.category_id] = [];
      acc[s.category_id].push({ ...s, topics: topicsBySubcat[s.id] ?? [] });
      return acc;
    }, {});

    const tree = categories.map((c: any) => ({
      ...c,
      subcategories: subcatsByCategory[c.id] ?? [],
    }));

    res.json(tree);
  } catch (err) { next(err); }
});

// GET /categories/:id/tree — single category full tree
router.get('/:id/tree', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const conn = await pool.getConnection();

    const [cats] = await conn.query<any[]>('SELECT * FROM categories WHERE id = ?', [req.params.id]);
    if (cats.length === 0) { conn.release(); res.status(404).json({ error: 'Category not found' }); return; }

    const [subcategories] = await conn.query<any[]>(
      'SELECT * FROM subcategories WHERE category_id = ? ORDER BY position ASC, id ASC',
      [req.params.id]
    );

    const subcatIds = subcategories.map((s: any) => s.id);
    let topics: any[] = [];

    if (subcatIds.length > 0) {
      const [rows] = await conn.query<any[]>(
        `SELECT t.*,
                COUNT(si.id) AS item_count,
                SUM(CASE WHEN si.status = 'done' THEN 1 ELSE 0 END) AS done_count
         FROM topics t
         LEFT JOIN study_items si ON si.topic_id = t.id
         WHERE t.subcategory_id IN (?)
         GROUP BY t.id
         ORDER BY t.position ASC`,
        [subcatIds]
      );
      topics = rows;
    }

    conn.release();

    const topicsBySubcat = topics.reduce((acc: Record<number, any[]>, t: any) => {
      const key = t.subcategory_id;
      if (!acc[key]) acc[key] = [];
      acc[key].push({ ...t, item_count: Number(t.item_count), done_count: Number(t.done_count) });
      return acc;
    }, {});

    const result = {
      ...cats[0],
      subcategories: subcategories.map((s: any) => ({
        ...s,
        topics: topicsBySubcat[s.id] ?? [],
      })),
    };

    res.json(result);
  } catch (err) { next(err); }
});

// POST /categories
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { title, icon, description } = req.body;
    if (!title) { res.status(400).json({ error: 'title is required' }); return; }

    const conn = await pool.getConnection();
    const [maxPos] = await conn.query<any[]>('SELECT COALESCE(MAX(position), 0) AS max FROM categories');
    const [result] = await conn.query<any>(
      'INSERT INTO categories (title, icon, description, position) VALUES (?, ?, ?, ?)',
      [title, icon || '📚', description || null, (maxPos[0].max as number) + 1]
    );
    const [rows] = await conn.query<any[]>('SELECT * FROM categories WHERE id = ?', [result.insertId]);
    conn.release();
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// PATCH /categories/:id
router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { title, icon, description, position } = req.body;
    const fields: string[] = [];
    const values: any[] = [];
    if (title !== undefined) { fields.push('title = ?'); values.push(title); }
    if (icon !== undefined) { fields.push('icon = ?'); values.push(icon); }
    if (description !== undefined) { fields.push('description = ?'); values.push(description); }
    if (position !== undefined) { fields.push('position = ?'); values.push(position); }
    if (fields.length === 0) { res.status(400).json({ error: 'No fields to update' }); return; }

    values.push(req.params.id);
    const conn = await pool.getConnection();
    await conn.query(`UPDATE categories SET ${fields.join(', ')} WHERE id = ?`, values);
    const [rows] = await conn.query<any[]>('SELECT * FROM categories WHERE id = ?', [req.params.id]);
    conn.release();
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /categories/:id
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const conn = await pool.getConnection();
    await conn.query('DELETE FROM categories WHERE id = ?', [req.params.id]);
    conn.release();
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
