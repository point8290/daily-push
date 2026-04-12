import { Router, Request, Response, NextFunction } from 'express';
import { pool } from '../db/connection';
import { fetchAndStoreNews } from '../services/newsAggregator';
import { scoreNewsItems, summarizeTopItems, getTopNewsItems } from '../services/newsCurator';

const router = Router();

router.get('/interests', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const conn = await pool.getConnection();
    const [rows] = await conn.query<any[]>('SELECT * FROM news_interests ORDER BY tag ASC');
    conn.release();
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/interests', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tag } = req.body;
    if (!tag) { res.status(400).json({ error: 'tag is required' }); return; }
    const conn = await pool.getConnection();
    const [result] = await conn.query<any>('INSERT IGNORE INTO news_interests (tag) VALUES (?)', [tag.toLowerCase()]);
    conn.release();
    res.status(201).json({ id: result.insertId, tag: tag.toLowerCase() });
  } catch (err) { next(err); }
});

router.delete('/interests/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const conn = await pool.getConnection();
    await conn.query('DELETE FROM news_interests WHERE id = ?', [req.params.id]);
    conn.release();
    res.status(204).send();
  } catch (err) { next(err); }
});

router.get('/feed', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const items = await getTopNewsItems(20);
    res.json(items);
  } catch (err) { next(err); }
});

router.post('/fetch', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const conn = await pool.getConnection();
    const [interests] = await conn.query<any[]>('SELECT tag FROM news_interests');
    conn.release();
    const tags = interests.map((r: any) => r.tag as string);

    const newIds = await fetchAndStoreNews(tags);
    await scoreNewsItems(tags);
    const topItems = await getTopNewsItems(10);
    await summarizeTopItems(topItems.map((i) => i.id));

    res.json({ fetched: newIds.length, message: 'News fetched and curated' });
  } catch (err) { next(err); }
});

export default router;
