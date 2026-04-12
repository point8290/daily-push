import { pool } from '../db/connection';
import { advanceQueue } from '../services/roadmap';
import { fetchAndStoreNews } from '../services/newsAggregator';
import { scoreNewsItems, summarizeTopItems, getTopNewsItems } from '../services/newsCurator';
import { buildEmailHtml, getCurrentStudyItem } from '../services/digestBuilder';
import { getStreakData } from '../services/streakTracker';
import { sendEmail } from '../services/emailService';

export async function runDailyDigest(): Promise<void> {
  console.log('[digest] Starting daily digest job...');

  const conn = await pool.getConnection();
  const [settingsRows] = await conn.query<any[]>('SELECT * FROM user_settings LIMIT 1');
  const [interestRows] = await conn.query<any[]>('SELECT tag FROM news_interests');
  conn.release();

  if (settingsRows.length === 0 || !settingsRows[0].email) {
    console.log('[digest] No email configured, skipping.');
    return;
  }

  const tags = interestRows.map((r: any) => r.tag as string);

  // Step 1: Fetch and curate news
  console.log('[digest] Fetching news...');
  await fetchAndStoreNews(tags);
  await scoreNewsItems(tags);
  const topItems = await getTopNewsItems(10);
  await summarizeTopItems(topItems.map((i) => i.id));

  // Step 2: Get study item
  await advanceQueue();
  const studyItem = await getCurrentStudyItem();

  // Step 3: Build and send email
  const [newsItems, streak] = await Promise.all([getTopNewsItems(3), getStreakData()]);
  const html = buildEmailHtml({ studyItem, newsItems, streak });
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', month: 'long', day: 'numeric' });

  await sendEmail({
    to: settingsRows[0].email,
    subject: `Daily Push — ${today}`,
    html,
  });

  // Step 4: Log digest
  const logConn = await pool.getConnection();
  await logConn.query(
    'INSERT INTO daily_digests (study_item_id, news_item_ids, email_status) VALUES (?, ?, ?)',
    [studyItem?.id || null, JSON.stringify(newsItems.map((n) => n.id)), 'sent']
  );
  logConn.release();

  console.log(`[digest] Sent to ${settingsRows[0].email}`);
}
