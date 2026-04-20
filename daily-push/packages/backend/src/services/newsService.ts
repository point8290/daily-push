import axios from 'axios';
import { pool } from '../db/postgres';

const HN_API = 'https://hn.algolia.com/api/v1/search';
const FETCH_TIMEOUT_MS = 6_000;
const MAX_NODES_TO_FETCH = 15;   // cap HN API calls per refresh
const RESULTS_PER_NODE   = 5;

// ─── SR ladder (mirrors sessions.ts) ─────────────────────────────────────────

const SR_LADDER = [1, 3, 7, 14, 30];

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NewsItem {
  id:           string;
  title:        string;
  url:          string;
  source:       string;
  fetchedAt:    string;
  readAt:       string | null;
  nodeId:       string;
  nodeTitle:    string;
  nodeLongevity: 'high' | 'medium' | 'low' | null;
  nodeStatus:   string;
  nodeDepth:    string;
}

// ─── HackerNews fetch ─────────────────────────────────────────────────────────

async function fetchHN(
  query: string,
): Promise<Array<{ external_id: string; title: string; url: string }>> {
  try {
    const { data } = await axios.get(HN_API, {
      params: { tags: 'story', query, hitsPerPage: RESULTS_PER_NODE },
      timeout: FETCH_TIMEOUT_MS,
    });
    return (data.hits as Array<{ objectID: string; title: string; url: string }>)
      .filter(h => h.url)
      .map(h => ({ external_id: h.objectID, title: h.title, url: h.url }));
  } catch {
    return [];
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch HackerNews stories for each of the user's active concept nodes and
 * store them linked to the relevant node. Idempotent — skips duplicates.
 */
export async function fetchNewsForUser(userId: string): Promise<number> {
  // Nodes the user is currently working on or has completed
  const { rows: nodes } = await pool.query<{
    id: string; title: string;
  }>(
    `SELECT id, title FROM concept_nodes
     WHERE user_id = $1
       AND status IN ('available', 'in_progress', 'done', 'review_due')
     ORDER BY last_studied_at DESC NULLS LAST, position
     LIMIT $2`,
    [userId, MAX_NODES_TO_FETCH],
  );

  if (nodes.length === 0) return 0;

  // Fire all HN searches in parallel
  const results = await Promise.allSettled(
    nodes.map(n => fetchHN(n.title).then(items => ({ nodeId: n.id, items }))),
  );

  let inserted = 0;
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    const { nodeId, items } = r.value;
    for (const item of items) {
      const { rowCount } = await pool.query(
        `INSERT INTO news_items (user_id, concept_node_id, external_id, title, url)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, external_id) DO NOTHING`,
        [userId, nodeId, item.external_id, item.title, item.url],
      );
      if (rowCount && rowCount > 0) inserted++;
    }
  }

  return inserted;
}

/**
 * Return the user's news feed — items for non-locked nodes, unread first.
 */
export async function getNewsFeed(userId: string): Promise<NewsItem[]> {
  const { rows } = await pool.query<{
    id: string; title: string; url: string; source: string;
    fetched_at: string; read_at: string | null;
    node_id: string; node_title: string;
    node_longevity: 'high' | 'medium' | 'low' | null;
    node_status: string; node_depth: string;
  }>(
    `SELECT
       ni.id, ni.title, ni.url, ni.source,
       ni.fetched_at, ni.read_at,
       cn.id          AS node_id,
       cn.title       AS node_title,
       cn.longevity   AS node_longevity,
       cn.status      AS node_status,
       cn.depth_level AS node_depth
     FROM news_items ni
     JOIN concept_nodes cn ON cn.id = ni.concept_node_id
     WHERE ni.user_id = $1
       AND cn.status != 'locked'
     ORDER BY ni.read_at NULLS FIRST, ni.fetched_at DESC
     LIMIT 60`,
    [userId],
  );

  return rows.map(r => ({
    id:           r.id,
    title:        r.title,
    url:          r.url,
    source:       r.source,
    fetchedAt:    r.fetched_at,
    readAt:       r.read_at,
    nodeId:       r.node_id,
    nodeTitle:    r.node_title,
    nodeLongevity: r.node_longevity,
    nodeStatus:   r.node_status,
    nodeDepth:    r.node_depth,
  }));
}

/**
 * Mark a news item read. If its linked node is done or review_due, advance
 * the SR interval by one step (same as completing with confidence 4).
 */
export async function markRead(userId: string, itemId: string): Promise<void> {
  // Get the item and its node
  const { rows } = await pool.query<{
    concept_node_id: string; node_status: string; read_at: string | null;
  }>(
    `SELECT ni.concept_node_id, cn.status AS node_status, ni.read_at
     FROM news_items ni
     JOIN concept_nodes cn ON cn.id = ni.concept_node_id
     WHERE ni.id = $1 AND ni.user_id = $2`,
    [itemId, userId],
  );
  if (rows.length === 0) return;
  const { concept_node_id, node_status, read_at } = rows[0];

  // Mark read (idempotent)
  if (!read_at) {
    await pool.query(
      `UPDATE news_items SET read_at = NOW() WHERE id = $1 AND user_id = $2`,
      [itemId, userId],
    );
  }

  // SR bump: only for nodes that have been studied
  if (node_status === 'done' || node_status === 'review_due') {
    const { rows: srRows } = await pool.query<{ interval_days: number }>(
      `SELECT interval_days FROM spaced_repetition_queue
       WHERE node_id = $1 AND user_id = $2`,
      [concept_node_id, userId],
    );
    if (srRows.length > 0) {
      const idx = SR_LADDER.indexOf(srRows[0].interval_days);
      const base = idx === -1 ? 0 : idx;
      const newInterval = SR_LADDER[Math.min(base + 1, SR_LADDER.length - 1)];
      await pool.query(
        `UPDATE spaced_repetition_queue
         SET interval_days = $1,
             due_at = NOW() + ($1 || ' days')::INTERVAL
         WHERE node_id = $2 AND user_id = $3`,
        [newInterval, concept_node_id, userId],
      );
    }
  }
}
