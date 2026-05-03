/**
 * Content extraction — fetches a URL and returns its text content (first 3000 chars).
 *
 * Per-type strategies:
 *   Wikipedia → Wikipedia API (clean plaintext, no HTML)
 *   arXiv     → arXiv Atom API (abstract only)
 *   GitHub    → raw README.md via raw.githubusercontent.com
 *   YouTube   → Tier 2: Data API (snippet + statistics + contentDetails)
 *               Tier 3: youtube-transcript (real transcript, no auth)
 *               Fallback: oEmbed (title + author only)
 *   HTML      → fetch + strip HTML + extract main content
 */
const FETCH_TIMEOUT_MS = 10_000;
const MAX_CONTENT_CHARS = 3_000;

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        'User-Agent': 'TopicEngine/1.0 (educational resource indexer)',
        ...(init?.headers ?? {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

// ─── HTML stripping ───────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Heuristically pull the main prose area out of an HTML page. */
function extractMainContent(html: string): string {
  const mainMatch =
    html.match(/<main[^>]*>([\s\S]*?)<\/main>/i) ??
    html.match(/<article[^>]*>([\s\S]*?)<\/article>/i) ??
    html.match(/<div[^>]*(?:id|class)="[^"]*(?:content|main|body|post)[^"]*"[^>]*>([\s\S]*?)<\/div>/i);

  return stripHtml(mainMatch ? mainMatch[1] : html).slice(0, MAX_CONTENT_CHARS);
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function formatDuration(iso: string): string {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return '';
  const h = +m[1] || 0;
  const min = +m[2] || 0;
  const sec = +m[3] || 0;
  if (h > 0) return `${h}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${min}:${String(sec).padStart(2, '0')}`;
}

// ─── Per-type extractors ──────────────────────────────────────────────────────

async function extractHtml(url: string): Promise<string> {
  const res = await fetchWithTimeout(url);
  if (!res.ok) return '';
  const html = await res.text();
  return extractMainContent(html);
}

async function extractWikipedia(url: string): Promise<string> {
  const match = url.match(/\/wiki\/(.+)$/);
  if (!match) return extractHtml(url);
  const title = decodeURIComponent(match[1]);
  const params = new URLSearchParams({
    action: 'query',
    titles: title,
    prop: 'extracts',
    exintro: '1',       // introductory section only
    explaintext: '1',   // plain text, no HTML
    format: 'json',
    origin: '*',
  });
  const res = await fetchWithTimeout(`https://en.wikipedia.org/w/api.php?${params}`);
  if (!res.ok) return '';
  const json = await res.json() as {
    query?: { pages?: Record<string, { extract?: string }> }
  };
  const page = Object.values(json.query?.pages ?? {})[0];
  return (page?.extract ?? '').slice(0, MAX_CONTENT_CHARS);
}

async function extractArXiv(url: string): Promise<string> {
  const match = url.match(/arxiv\.org\/abs\/(.+)$/);
  if (!match) return extractHtml(url);
  const params = new URLSearchParams({ id_list: match[1] });
  const res = await fetchWithTimeout(`https://export.arxiv.org/api/query?${params}`);
  if (!res.ok) return '';
  const xml = await res.text();
  const title   = xml.match(/<title>([\s\S]*?)<\/title>/)?.[1]   ?? '';
  const summary = xml.match(/<summary>([\s\S]*?)<\/summary>/)?.[1] ?? '';
  return `${title.trim()}\n\n${summary.trim()}`.slice(0, MAX_CONTENT_CHARS);
}

async function extractGitHub(url: string): Promise<string> {
  const match = url.match(/github\.com\/([^/]+)\/([^/?#]+)/);
  if (!match) return extractHtml(url);
  const [, owner, repo] = match;
  const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/README.md`;
  const res = await fetchWithTimeout(rawUrl);
  if (!res.ok) return '';
  const text = await res.text();
  // Strip image/badge markdown but keep prose
  return text
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[!\[.*?\]\(.*?\)\]\(.*?\)/g, '')
    .slice(0, MAX_CONTENT_CHARS);
}

async function extractYouTube(url: string): Promise<string> {
  const apiKey  = process.env.YOUTUBE_API_KEY;
  const videoId = url.match(/[?&]v=([^&]+)/)?.[1];

  // ── Tier 2: Data API — rich metadata ──────────────────────────────────────
  if (apiKey && videoId) {
    const params = new URLSearchParams({
      key:  apiKey,
      id:   videoId,
      part: 'snippet,statistics,contentDetails',
    });
    const res = await fetchWithTimeout(
      `https://www.googleapis.com/youtube/v3/videos?${params}`,
    );
    if (res.ok) {
      const json = await res.json() as {
        items?: Array<{
          snippet: {
            title:        string;
            description:  string;
            channelTitle: string;
            tags?:        string[];
          };
          statistics: {
            viewCount?:    string;
            likeCount?:    string;
            commentCount?: string;
          };
          contentDetails: {
            duration: string;
            caption:  string;
          };
        }>
      };
      const item = json.items?.[0];
      if (item) {
        const { snippet, statistics, contentDetails } = item;

        // Compute engagement %
        const views    = parseInt(statistics.viewCount    ?? '0', 10);
        const likes    = parseInt(statistics.likeCount    ?? '0', 10);
        const comments = parseInt(statistics.commentCount ?? '0', 10);
        const engagementPct = views > 0
          ? (((likes + comments * 3) / views) * 100).toFixed(1) + '%'
          : 'n/a';

        const duration    = formatDuration(contentDetails.duration);
        const hasCaptions = contentDetails.caption === 'true';
        const hasChapters = /\b\d{1,2}:\d{2}\b/.test(snippet.description);
        const tags        = (snippet.tags ?? []).slice(0, 10).join(', ');

        // ── Tier 3: Transcript via YouTube timedtext API (no auth, no package) ──
        let transcriptExcerpt = '';
        try {
          const tRes = await fetchWithTimeout(
            `https://www.youtube.com/api/timedtext?lang=en&v=${videoId}`,
          );
          if (tRes.ok) {
            const xml = await tRes.text();
            const texts = [...xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)]
              .map((m) => m[1].replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/<[^>]+>/g, '').trim())
              .filter(Boolean);
            if (texts.length > 0) {
              const text = texts.join(' ').replace(/\s+/g, ' ');
              transcriptExcerpt = `\n\nTranscript (excerpt):\n${text.slice(0, 1_000)}`;
            }
          }
        } catch {
          // fail-open — no transcript is fine
        }

        // Build content block with budgeted sections
        const header = [
          `Video: ${snippet.title}`,
          `Channel: ${snippet.channelTitle} | Views: ${formatViews(views)} | Likes: ${formatViews(likes)} | Comments: ${formatViews(comments)}`,
          `Duration: ${duration} | Captions: ${hasCaptions ? 'yes' : 'no'} | Chapters: ${hasChapters ? 'yes' : 'no'} | Engagement: ${engagementPct}`,
        ].join('\n');

        const descBudget = MAX_CONTENT_CHARS - header.length - tags.length - transcriptExcerpt.length - 50;
        const description = snippet.description.slice(0, Math.max(descBudget, 200));

        return [
          header,
          '',
          'Description:',
          description,
          tags ? `\nTags: ${tags}` : '',
          transcriptExcerpt,
        ].join('\n').slice(0, MAX_CONTENT_CHARS);
      }
    }
  }

  // ── Fallback: oEmbed (no key required) ────────────────────────────────────
  const params = new URLSearchParams({ url, format: 'json' });
  const res = await fetchWithTimeout(`https://www.youtube.com/oembed?${params}`);
  if (!res.ok) return '';
  const json = await res.json() as { title?: string; author_name?: string };
  return `Video: ${json.title ?? ''} by ${json.author_name ?? 'unknown'}`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch and extract text content from a URL.
 * Returns up to MAX_CONTENT_CHARS (3000) characters of the most relevant content.
 * Never throws — returns '' on any network or parse failure.
 */
export async function extractContent(url: string, resourceType: string): Promise<string> {
  try {
    if (/en\.wikipedia\.org\/wiki\//.test(url))                    return await extractWikipedia(url);
    if (/arxiv\.org\/abs\//.test(url))                             return await extractArXiv(url);
    if (/github\.com\//.test(url) && resourceType === 'github')    return await extractGitHub(url);
    if (/youtube\.com|youtu\.be/.test(url))                        return await extractYouTube(url);
    return await extractHtml(url);
  } catch {
    return '';
  }
}
