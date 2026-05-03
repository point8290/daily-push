/**
 * Resource search — finds up to 5 learning resource URLs for a concept node.
 *
 * Primary path: Google Custom Search API (GOOGLE_SEARCH_API_KEY + GOOGLE_SEARCH_CX env vars).
 * Fallback:     Wikipedia API + MDN API + arXiv API — zero API keys required.
 *
 * YouTube (optional, YOUTUBE_API_KEY):
 *   Tier 1 — pre-filters candidates via engagement stats + duration fit before returning.
 */

const FETCH_TIMEOUT_MS = 8_000;

export interface DiscoveredResource {
  url:          string;
  resourceType: 'article' | 'video' | 'course' | 'docs' | 'paper' | 'github';
  title:        string;
  snippet:      string;
}

// Domain-detection patterns for deciding which curated sources to query
const WEB_TECH_RE = /\b(html|css|javascript|typescript|react|vue|angular|node\.?js|dom|browser|http|websocket|service.?worker|web\s+api|fetch\s+api|event\s+loop)\b/i;
const ML_RE       = /\b(neural.?network|gradient|backprop|transformer|attention|embedding|convolution|lstm|bert|gpt|diffusion|reinforcement.?learning|machine.?learning|deep.?learning|llm|large.?language.?model|prompt.?engineer|vector.?dat|vector.?db|rag|retrieval.?augmented|generative.?ai|foundation.?model|language.?model|fine.?tun|non.?determin|token|inference.?latency|ai.?product|model.?api|chat.?model|completion)\b/i;

// ─── Duration ranges by depth level (seconds) ────────────────────────────────

const DEPTH_DURATION_S: Record<string, { min: number; max: number }> = {
  surface:      { min:   60, max:  480 },  //  1– 8 min
  foundational: { min:  240, max: 1080 },  //  4–18 min
  intermediate: { min:  360, max: 1800 },  //  6–30 min
  advanced:     { min:  600, max: 2400 },  // 10–40 min
  expert:       { min: 1200, max: 3600 },  // 20–60 min
};

function parseDurationSecs(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return ((+m[1] || 0) * 3600) + ((+m[2] || 0) * 60) + (+m[3] || 0);
}

// ─── Query cleaner ────────────────────────────────────────────────────────────

function cleanSearchQuery(title: string): string {
  return title
    .replace(/\s*\([^)]+\)/g, '')  // strip "(Tokens, Completions, Chat Models)"
    .replace(/\s*—.*$/, '')          // strip "— subtitle" suffixes
    .trim();
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ─── Source adapters ──────────────────────────────────────────────────────────

async function searchWikipedia(title: string): Promise<DiscoveredResource[]> {
  try {
    const q = cleanSearchQuery(title);
    const params = new URLSearchParams({
      action: 'query',
      list:   'search',
      srsearch: q,
      srlimit: '3',
      format: 'json',
      origin: '*',
    });
    const res = await fetchWithTimeout(`https://en.wikipedia.org/w/api.php?${params}`);
    if (!res.ok) return [];
    const json = await res.json() as {
      query?: { search?: Array<{ title: string; snippet: string }> }
    };
    return (json.query?.search ?? []).map((item) => ({
      url:          `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/ /g, '_'))}`,
      resourceType: 'article' as const,
      title:        item.title,
      snippet:      item.snippet.replace(/<[^>]+>/g, ''),
    }));
  } catch {
    return [];
  }
}

async function searchMDN(title: string): Promise<DiscoveredResource[]> {
  try {
    const params = new URLSearchParams({ q: cleanSearchQuery(title), locale: 'en-US' });
    const res = await fetchWithTimeout(`https://developer.mozilla.org/api/v1/search?${params}`);
    if (!res.ok) return [];
    const json = await res.json() as {
      documents?: Array<{ title: string; summary: string; mdn_url: string }>
    };
    return (json.documents ?? []).slice(0, 2).map((doc) => ({
      url:          `https://developer.mozilla.org${doc.mdn_url}`,
      resourceType: 'docs' as const,
      title:        doc.title,
      snippet:      doc.summary,
    }));
  } catch {
    return [];
  }
}

async function searchArXiv(title: string): Promise<DiscoveredResource[]> {
  try {
    const q = cleanSearchQuery(title);
    const params = new URLSearchParams({
      search_query: `ti:${q} OR abs:${q}`,
      start: '0',
      max_results: '3',
    });
    const res = await fetchWithTimeout(`https://export.arxiv.org/api/query?${params}`);
    if (!res.ok) return [];
    const xml = await res.text();
    const entries = xml.match(/<entry>([\s\S]*?)<\/entry>/g) ?? [];
    return entries.slice(0, 3).flatMap((entry) => {
      const titleMatch   = entry.match(/<title>([\s\S]*?)<\/title>/);
      const summaryMatch = entry.match(/<summary>([\s\S]*?)<\/summary>/);
      const idMatch      = entry.match(/<id>(https?:\/\/arxiv\.org\/abs\/[^<]+)<\/id>/);
      if (!idMatch) return [];
      return [{
        url:          idMatch[1].trim(),
        resourceType: 'paper' as const,
        title:        (titleMatch?.[1] ?? title).replace(/\s+/g, ' ').trim(),
        snippet:      (summaryMatch?.[1] ?? '').replace(/\s+/g, ' ').trim().slice(0, 300),
      }];
    });
  } catch {
    return [];
  }
}

async function googleCustomSearch(
  title: string,
  apiKey: string,
  cx: string,
): Promise<DiscoveredResource[]> {
  try {
    const params = new URLSearchParams({ key: apiKey, cx, q: title, num: '5' });
    const res = await fetchWithTimeout(`https://www.googleapis.com/customsearch/v1?${params}`);
    if (!res.ok) return [];
    const json = await res.json() as {
      items?: Array<{ title: string; snippet: string; link: string }>
    };
    return (json.items ?? []).map((item) => ({
      url:          item.link,
      resourceType: detectTypeFromUrl(item.link),
      title:        item.title,
      snippet:      item.snippet,
    }));
  } catch {
    return [];
  }
}

// ─── YouTube search with Tier 1 pre-filtering ────────────────────────────────

interface YouTubeVideoStats {
  id: string;
  statistics: { viewCount?: string; likeCount?: string; commentCount?: string };
  contentDetails: { duration: string };
}

async function fetchYouTubeVideoStats(
  videoIds: string[],
  apiKey:   string,
): Promise<Map<string, YouTubeVideoStats>> {
  try {
    const params = new URLSearchParams({
      key:  apiKey,
      part: 'statistics,contentDetails',
      id:   videoIds.join(','),
    });
    const res = await fetchWithTimeout(
      `https://www.googleapis.com/youtube/v3/videos?${params}`,
    );
    if (!res.ok) return new Map();
    const json = await res.json() as { items?: YouTubeVideoStats[] };
    const map = new Map<string, YouTubeVideoStats>();
    for (const item of json.items ?? []) map.set(item.id, item);
    return map;
  } catch {
    return new Map();
  }
}

function passesQualityFilter(
  stats:      YouTubeVideoStats,
  depthLevel: string | undefined,
): boolean {
  const views = parseInt(stats.statistics.viewCount ?? '0', 10);
  if (views < 1_000) return false;

  // Engagement: (likes + comments×3) / views — only check if both fields present
  const likes    = stats.statistics.likeCount    != null ? parseInt(stats.statistics.likeCount,    10) : null;
  const comments = stats.statistics.commentCount != null ? parseInt(stats.statistics.commentCount, 10) : null;
  if (likes !== null && comments !== null) {
    const engagement = (likes + comments * 3) / Math.max(views, 1);
    if (engagement < 0.01) return false;
  }

  // Duration fit — only reject if depthLevel is known
  if (depthLevel && DEPTH_DURATION_S[depthLevel]) {
    const secs  = parseDurationSecs(stats.contentDetails.duration);
    const range = DEPTH_DURATION_S[depthLevel];
    if (secs < range.min || secs > range.max) return false;
  }

  return true;
}

async function searchYouTube(
  title:         string,
  apiKey:        string,
  depthLevel?:   string,
  relaxFilters?: boolean,
): Promise<DiscoveredResource[]> {
  try {
    const searchParams: Record<string, string> = {
      key:               apiKey,
      q:                 cleanSearchQuery(title),
      part:              'snippet',
      type:              'video',
      videoDuration:     'medium',
      maxResults:        relaxFilters ? '8' : '5',  // wider net on second pass
      relevanceLanguage: 'en',
    };
    // relaxFilters: drop Education-only category to broaden results for niche topics
    if (!relaxFilters) searchParams['videoCategoryId'] = '27';

    const res = await fetchWithTimeout(
      `https://www.googleapis.com/youtube/v3/search?${new URLSearchParams(searchParams)}`,
    );
    if (!res.ok) return [];

    const json = await res.json() as {
      items?: Array<{
        id:      { videoId: string };
        snippet: { title: string; description: string; channelTitle: string };
      }>
    };
    const candidates = json.items ?? [];
    if (candidates.length === 0) return [];

    // Tier 1 — batch-fetch stats + filter (skipped on relaxFilters second pass)
    if (!relaxFilters) {
      const videoIds = candidates.map((c) => c.id.videoId);
      const statsMap = await fetchYouTubeVideoStats(videoIds, apiKey);
      const passed: DiscoveredResource[] = [];
      for (const item of candidates) {
        const stats = statsMap.get(item.id.videoId);
        if (stats && !passesQualityFilter(stats, depthLevel)) continue;
        passed.push({
          url:          `https://www.youtube.com/watch?v=${item.id.videoId}`,
          resourceType: 'video' as const,
          title:        item.snippet.title,
          snippet:      `${item.snippet.description.slice(0, 200)} — ${item.snippet.channelTitle}`,
        });
        if (passed.length === 2) break;
      }
      return passed;
    }

    // relaxFilters: accept first 2 results without quality gates
    return candidates.slice(0, 2).map((item) => ({
      url:          `https://www.youtube.com/watch?v=${item.id.videoId}`,
      resourceType: 'video' as const,
      title:        item.snippet.title,
      snippet:      `${item.snippet.description.slice(0, 200)} — ${item.snippet.channelTitle}`,
    }));
  } catch {
    return [];
  }
}

function detectTypeFromUrl(url: string): DiscoveredResource['resourceType'] {
  if (/youtube\.com|youtu\.be/.test(url))                        return 'video';
  if (/github\.com/.test(url))                                   return 'github';
  if (/arxiv\.org/.test(url))                                    return 'paper';
  if (/coursera\.org|udemy\.com|edx\.org|pluralsight\.com/.test(url)) return 'course';
  if (/developer\.mozilla\.org|docs\.|\.dev\/docs/.test(url))   return 'docs';
  return 'article';
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns up to 5 learning resource URLs for a concept node.
 *
 * Uses Google Custom Search when GOOGLE_SEARCH_API_KEY + GOOGLE_SEARCH_CX are set.
 * Falls back to Wikipedia + MDN (web concepts) + arXiv (ML/CS topics).
 * Adds YouTube videos (YOUTUBE_API_KEY) with Tier 1 quality pre-filtering.
 */
export async function searchResources(
  nodeTitle:       string,
  nodeDescription: string,
  depthLevel?:     string,
  relaxFilters?:   boolean,
): Promise<DiscoveredResource[]> {
  const googleApiKey = process.env.GOOGLE_SEARCH_API_KEY;
  const googleCx     = process.env.GOOGLE_SEARCH_CX;
  const youtubeKey   = process.env.YOUTUBE_API_KEY;

  if (googleApiKey && googleCx) {
    const results = await googleCustomSearch(nodeTitle, googleApiKey, googleCx);
    if (youtubeKey) {
      const videos = await searchYouTube(nodeTitle, youtubeKey, depthLevel, relaxFilters);
      return [...results, ...videos].slice(0, 5);
    }
    return results;
  }

  const combined = `${nodeTitle} ${nodeDescription}`;
  const tasks: Promise<DiscoveredResource[]>[] = [searchWikipedia(nodeTitle)];

  if (WEB_TECH_RE.test(combined)) tasks.push(searchMDN(nodeTitle));
  if (ML_RE.test(combined))       tasks.push(searchArXiv(nodeTitle));
  if (youtubeKey)                 tasks.push(searchYouTube(nodeTitle, youtubeKey, depthLevel, relaxFilters));

  const arrays = await Promise.all(tasks);
  return arrays.flat().slice(0, 5);
}
