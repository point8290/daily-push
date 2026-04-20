/**
 * Content extraction — fetches a URL and returns its text content (first 3000 chars).
 *
 * Per-type strategies:
 *   Wikipedia → Wikipedia API (clean plaintext, no HTML)
 *   arXiv     → arXiv Atom API (abstract only)
 *   GitHub    → raw README.md via raw.githubusercontent.com
 *   YouTube   → oEmbed (title + author; transcripts require OAuth)
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
