import { pool } from '../db/connection';
import { callClaude, parseJSON, SYSTEM_PROMPT_CURATOR } from './claude';
import { NewsItem } from '../types';

export async function scoreNewsItems(tags: string[]): Promise<void> {
  const conn = await pool.getConnection();
  try {
    const [unscoredItems] = await conn.query<any[]>(
      'SELECT id, external_id, title FROM news_items WHERE relevance = 0 ORDER BY fetched_at DESC LIMIT 50'
    );

    if (unscoredItems.length === 0) return;

    const itemList = unscoredItems
      .map((i: any) => `[${i.id}] ${i.title}`)
      .join('\n');

    const userMessage = `Score these tech news items 0-10 for relevance to a developer learning: ${tags.join(', ')}.

Higher scores for: practical engineering content, new tools/frameworks, AI/ML advances, system design insights.
Lower scores for: company news, funding announcements, opinion pieces, non-technical content.

Items:
${itemList}

Return JSON: { "scores": { "<id>": <score> } }`;

    const raw = await callClaude({
      system: SYSTEM_PROMPT_CURATOR,
      userMessage,
      useCache: true,
    });

    const { scores } = parseJSON<{ scores: Record<string, number> }>(raw);

    for (const [id, score] of Object.entries(scores)) {
      await conn.query('UPDATE news_items SET relevance = ? WHERE id = ?', [score, parseInt(id)]);
    }
  } finally {
    conn.release();
  }
}

export async function summarizeTopItems(itemIds: number[]): Promise<void> {
  if (itemIds.length === 0) return;

  const conn = await pool.getConnection();
  try {
    const placeholders = itemIds.map(() => '?').join(',');
    const [items] = await conn.query<any[]>(
      `SELECT id, title, url FROM news_items WHERE id IN (${placeholders}) AND summary IS NULL`,
      itemIds
    );

    if (items.length === 0) return;

    const itemList = items
      .map((i: any) => `[${i.id}] ${i.title}\n${i.url}`)
      .join('\n\n');

    const userMessage = `Summarize each news item in 1-2 sentences for a senior developer.
Focus on: what it is, why it matters technically, what action to take.
Be concrete and specific — no fluff.

Items:
${itemList}

Return JSON: { "summaries": { "<id>": "<summary>" } }`;

    const raw = await callClaude({
      system: SYSTEM_PROMPT_CURATOR,
      userMessage,
      useCache: true,
    });

    const { summaries } = parseJSON<{ summaries: Record<string, string> }>(raw);

    for (const [id, summary] of Object.entries(summaries)) {
      await conn.query('UPDATE news_items SET summary = ? WHERE id = ?', [summary, parseInt(id)]);
    }
  } finally {
    conn.release();
  }
}

export async function getTopNewsItems(limit = 3): Promise<NewsItem[]> {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query<any[]>(
      `SELECT * FROM news_items
       WHERE relevance > 0
       ORDER BY relevance DESC, fetched_at DESC
       LIMIT ?`,
      [limit]
    );
    return rows as NewsItem[];
  } finally {
    conn.release();
  }
}
