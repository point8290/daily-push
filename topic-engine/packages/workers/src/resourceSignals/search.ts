/**
 * Resource search — finds up to 5 learning resource URLs for a concept node.
 *
 * Primary path: Google Custom Search API (GOOGLE_SEARCH_API_KEY + GOOGLE_SEARCH_CX env vars).
 * Fallback:     Wikipedia API + MDN API + arXiv API — zero API keys required.
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
 */
export async function searchResources(
  nodeTitle:       string,
  nodeDescription: string,
): Promise<DiscoveredResource[]> {
  const googleApiKey = process.env.GOOGLE_SEARCH_API_KEY;
  const googleCx     = process.env.GOOGLE_SEARCH_CX;

  if (googleApiKey && googleCx) {
    return googleCustomSearch(nodeTitle, googleApiKey, googleCx);
  }

  const combined = `${nodeTitle} ${nodeDescription}`;
  const tasks: Promise<DiscoveredResource[]>[] = [searchWikipedia(nodeTitle)];

  if (WEB_TECH_RE.test(combined)) tasks.push(searchMDN(nodeTitle));
  if (ML_RE.test(combined))       tasks.push(searchArXiv(nodeTitle));

  const arrays = await Promise.all(tasks);
  return arrays.flat().slice(0, 5);
}
