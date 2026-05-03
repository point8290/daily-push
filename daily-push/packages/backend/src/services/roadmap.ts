import { pool } from '../db/connection';
import { callClaude, parseJSON, SYSTEM_PROMPT_EDUCATOR } from './claude';
import { GeneratedStudyItem, Topic } from '../types';
import { buildUserContext } from './userContext';

export async function generateStudyItems(topic: Topic, userId?: string): Promise<GeneratedStudyItem[]> {
  const contextStr = userId
    ? (await buildUserContext(userId)).toPromptString()
    : 'Learner background: software developer.';
  const userMessage = `Topic: "${topic.title}"
Description: "${topic.description || 'No description provided'}"
${contextStr}

Generate a structured study queue as JSON with this exact shape:
{
  "items": [
    {
      "title": "short specific session title",
      "description": "what to study and how in 2-3 sentences",
      "estimated_mins": 30,
      "resources": [
        { "label": "Resource Name", "url": "https://...", "type": "docs" }
      ]
    }
  ]
}

Rules:
- 4-8 items per topic
- Order from foundational to advanced
- Each item = one focused study session
- Resources must be real, specific, working URLs
- estimated_mins should be realistic (20-60)
- type must be one of: docs, article, video, repo`;

  const raw = await callClaude({
    system: SYSTEM_PROMPT_EDUCATOR,
    userMessage,
    useCache: true,
  });

  const { items } = parseJSON<{ items: GeneratedStudyItem[] }>(raw);
  return items;
}

export interface EnrichedSession {
  type: 'concept' | 'practice';
  title: string;
  description: string;
  estimated_mins: number;
  resources: { label: string; url: string; type: 'docs' | 'article' | 'video' | 'repo' }[];
}

export async function enrichStudyItems(topic: Topic, userId?: string): Promise<EnrichedSession[]> {
  const contextStr = userId
    ? (await buildUserContext(userId)).toPromptString()
    : 'Learner: software developer.';
  const userMessage = `${contextStr}

Topic: "${topic.title}"
Context: "${topic.description || ''}"

Generate exactly 2 sessions as JSON:

{
  "sessions": [
    {
      "type": "concept",
      "title": "<topic> — Concept",
      "description": "<rich multi-paragraph description, 200-300 words. Must cover: (1) Prerequisites — what the learner must already know. (2) Mental model — explain the core idea with a concrete analogy or visual. (3) Key insight — the single non-obvious thing most engineers miss. (4) What to watch for — common pitfalls or interview gotchas. (5) Self-check — 2-3 questions to test understanding. (6) Connects to — 1-2 related topics in the broader curriculum. Use plain paragraphs with labels like Prerequisites: ... Mental model: ... etc.",
      "estimated_mins": 30,
      "resources": [
        { "label": "descriptive label", "url": "https://...", "type": "video" },
        { "label": "descriptive label", "url": "https://...", "type": "article" }
      ]
    },
    {
      "type": "practice",
      "title": "<topic> — Practice",
      "description": "<rich multi-paragraph description, 150-200 words. Must cover: (1) What to build/solve — concrete task description. (2) Constraints — time limit, no lookups, or specific implementation rules. (3) Success criteria — what a good solution looks like. (4) Stretch goal — harder variant once the basic version works. Use plain paragraphs with labels like Task: ... Constraints: ... etc.",
      "estimated_mins": 45,
      "resources": [
        { "label": "descriptive label", "url": "https://...", "type": "repo" }
      ]
    }
  ]
}

Resource rules:
- Use only real, specific, working URLs — no channel homepages
- For videos: use youtube.com/watch?v=VIDEO_ID format (not channel URLs)
- For DSA practice: link to specific LeetCode problems (leetcode.com/problems/...)
- For system design: link to specific ByteByteGo or Martin Fowler articles
- For AI/ML: link to specific Anthropic docs pages or arXiv papers
- type must be: docs, article, video, or repo`;

  const raw = await callClaude({
    system: SYSTEM_PROMPT_EDUCATOR,
    userMessage,
    useCache: false,
  });

  const { sessions } = parseJSON<{ sessions: EnrichedSession[] }>(raw);
  return sessions;
}

export async function saveEnrichedSessions(
  topicId: number,
  sessions: EnrichedSession[]
): Promise<void> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Remove existing items for this topic (keep status if current)
    const [existing] = await conn.query<any[]>(
      "SELECT id, status FROM study_items WHERE topic_id = ? AND status = 'current'",
      [topicId]
    );
    const hasCurrentItem = existing.length > 0;

    await conn.query('DELETE FROM study_items WHERE topic_id = ?', [topicId]);

    for (let i = 0; i < sessions.length; i++) {
      const s = sessions[i];
      // If one of the deleted items was 'current', make the concept session current
      const status = (!hasCurrentItem) ? 'queued' : (i === 0 ? 'current' : 'queued');
      await conn.query(
        `INSERT INTO study_items (topic_id, type, title, description, resources, estimated_mins, position, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [topicId, s.type, s.title, s.description, JSON.stringify(s.resources), s.estimated_mins, i + 1, status]
      );
    }

    await conn.query(
      "UPDATE topics SET status = 'active' WHERE id = ? AND status = 'pending'",
      [topicId]
    );

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function saveGeneratedItems(
  topicId: number,
  items: GeneratedStudyItem[]
): Promise<void> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Get max position for existing items in this topic
    const [rows] = await conn.query<any[]>(
      'SELECT COALESCE(MAX(position), 0) AS max_pos FROM study_items WHERE topic_id = ?',
      [topicId]
    );
    let position = (rows[0].max_pos as number) + 1;

    for (const item of items) {
      await conn.query(
        `INSERT INTO study_items (topic_id, title, description, resources, estimated_mins, position, status)
         VALUES (?, ?, ?, ?, ?, ?, 'queued')`,
        [topicId, item.title, item.description, JSON.stringify(item.resources), item.estimated_mins, position]
      );
      position++;
    }

    // Mark topic as active if it was pending
    await conn.query(
      "UPDATE topics SET status = 'active' WHERE id = ? AND status = 'pending'",
      [topicId]
    );

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function advanceQueue(): Promise<void> {
  const conn = await pool.getConnection();
  try {
    // Check if there's already a current item
    const [current] = await conn.query<any[]>(
      "SELECT id FROM study_items WHERE status = 'current' LIMIT 1"
    );
    if (current.length > 0) return;

    // Get active category from user_settings
    const [settings] = await conn.query<any[]>(
      'SELECT active_category_id FROM user_settings LIMIT 1'
    );
    const activeCategoryId: number | null = settings[0]?.active_category_id ?? null;

    let next: any[];

    if (activeCategoryId) {
      // Only promote items from the active category
      [next] = await conn.query<any[]>(
        `SELECT si.id FROM study_items si
         JOIN topics t ON si.topic_id = t.id
         JOIN subcategories sc ON t.subcategory_id = sc.id
         WHERE si.status = 'queued'
           AND sc.category_id = ?
         ORDER BY t.position ASC, si.position ASC
         LIMIT 1`,
        [activeCategoryId]
      );
    } else {
      // No category filter — promote next queued item globally
      [next] = await conn.query<any[]>(
        `SELECT si.id FROM study_items si
         JOIN topics t ON si.topic_id = t.id
         WHERE si.status = 'queued'
         ORDER BY t.position ASC, si.position ASC
         LIMIT 1`
      );
    }

    if (next.length > 0) {
      await conn.query("UPDATE study_items SET status = 'current' WHERE id = ?", [next[0].id]);
    }
  } finally {
    conn.release();
  }
}
