import axios from 'axios';
import RSSParser from 'rss-parser';
import { pool } from '../db/connection';

const rssParser = new RSSParser();

const RSS_FEEDS = [
  'https://feeds.feedburner.com/ThePragmaticEngineer',
  'https://blog.bytebytego.com/feed',
  'https://changelog.com/feed',
  'https://www.infoq.com/feed/',
];

interface RawNewsItem {
  source: 'hackernews' | 'rss';
  external_id: string;
  title: string;
  url: string;
}

async function fetchHackerNews(tags: string[]): Promise<RawNewsItem[]> {
  const results: RawNewsItem[] = [];

  await Promise.allSettled(
    tags.map(async (tag) => {
      const { data } = await axios.get('https://hn.algolia.com/api/v1/search', {
        params: { tags: 'story', query: tag, hitsPerPage: 8 },
        timeout: 5000,
      });
      for (const hit of data.hits) {
        if (!hit.url) continue;
        results.push({
          source: 'hackernews',
          external_id: hit.objectID,
          title: hit.title,
          url: hit.url,
        });
      }
    })
  );

  // Deduplicate by external_id
  const seen = new Set<string>();
  return results.filter((item) => {
    if (seen.has(item.external_id)) return false;
    seen.add(item.external_id);
    return true;
  });
}

async function fetchRSSFeeds(): Promise<RawNewsItem[]> {
  const results: RawNewsItem[] = [];

  await Promise.allSettled(
    RSS_FEEDS.map(async (feedUrl) => {
      const feed = await rssParser.parseURL(feedUrl);
      for (const item of feed.items.slice(0, 5)) {
        if (!item.link || !item.title) continue;
        results.push({
          source: 'rss',
          external_id: item.guid || item.link,
          title: item.title,
          url: item.link,
        });
      }
    })
  );

  return results;
}

export async function fetchAndStoreNews(tags: string[]): Promise<number[]> {
  const [hnItems, rssItems] = await Promise.all([
    fetchHackerNews(tags),
    fetchRSSFeeds(),
  ]);

  const allItems = [...hnItems, ...rssItems];
  if (allItems.length === 0) return [];

  const conn = await pool.getConnection();
  try {
    const newIds: number[] = [];

    for (const item of allItems) {
      const [existing] = await conn.query<any[]>(
        'SELECT id FROM news_items WHERE source = ? AND external_id = ?',
        [item.source, item.external_id]
      );
      if (existing.length > 0) continue;

      const [result] = await conn.query<any>(
        'INSERT INTO news_items (source, external_id, title, url) VALUES (?, ?, ?, ?)',
        [item.source, item.external_id, item.title, item.url]
      );
      newIds.push(result.insertId);
    }

    return newIds;
  } finally {
    conn.release();
  }
}
