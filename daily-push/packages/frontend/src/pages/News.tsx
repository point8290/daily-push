import { useEffect, useState, useCallback } from 'react';
import { getNewsFeed, fetchNews, markNewsRead, type NewsItem } from '../api/client';

// ── Longevity badge ───────────────────────────────────────────────────────────

const LONGEVITY_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  high:   { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'High longevity' },
  medium: { bg: 'bg-amber-50',   text: 'text-amber-700',   label: 'Medium longevity' },
  low:    { bg: 'bg-slate-100',  text: 'text-slate-500',   label: 'Low longevity' },
};

const NODE_STATUS_STYLES: Record<string, string> = {
  available:   'bg-sky-50 text-sky-700',
  in_progress: 'bg-yellow-50 text-yellow-700',
  done:        'bg-green-50 text-green-700',
  review_due:  'bg-orange-50 text-orange-700',
};

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

type Filter = 'all' | 'unread' | 'available' | 'done';

// ── Component ─────────────────────────────────────────────────────────────────

export default function News() {
  const [feed, setFeed]       = useState<NewsItem[]>([]);
  const [filter, setFilter]   = useState<Filter>('all');
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);

  const loadFeed = useCallback(async () => {
    try {
      const items = await getNewsFeed();
      setFeed(items);
    } catch { /* non-critical */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadFeed(); }, [loadFeed]);

  const handleRefresh = async () => {
    setFetching(true);
    try {
      await fetchNews();
      // Poll for results — fetch is background, give it 2s then reload
      setTimeout(loadFeed, 2000);
    } finally {
      setFetching(false);
    }
  };

  const handleRead = async (item: NewsItem) => {
    // Optimistically mark read in UI
    setFeed(prev => prev.map(i => i.id === item.id ? { ...i, readAt: new Date().toISOString() } : i));
    try {
      await markNewsRead(item.id);
    } catch {
      // Revert on error
      setFeed(prev => prev.map(i => i.id === item.id ? { ...i, readAt: null } : i));
    }
  };

  const filtered = feed.filter(item => {
    if (filter === 'unread')    return !item.readAt;
    if (filter === 'available') return item.nodeStatus === 'available' || item.nodeStatus === 'in_progress';
    if (filter === 'done')      return item.nodeStatus === 'done' || item.nodeStatus === 'review_due';
    return true;
  });

  const unreadCount = feed.filter(i => !i.readAt).length;

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">News</h1>
          <p className="text-sm text-slate-500 mt-0.5">Stories linked to your learning topics</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={fetching}
          className="flex items-center gap-2 bg-slate-900 hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 transition-colors"
        >
          <span className={fetching ? 'animate-spin inline-block' : ''}>↻</span>
          {fetching ? 'Fetching…' : 'Refresh'}
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit">
        {([
          ['all',       `All (${feed.length})`],
          ['unread',    `Unread (${unreadCount})`],
          ['available', 'Study now'],
          ['done',      'Review'],
        ] as [Filter, string][]).map(([val, label]) => (
          <button
            key={val}
            onClick={() => setFilter(val)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
              filter === val
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Feed */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white border border-slate-200 rounded-xl p-4 animate-pulse">
              <div className="h-4 bg-slate-100 rounded w-3/4 mb-2" />
              <div className="h-3 bg-slate-100 rounded w-1/3" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
          <p className="text-slate-500 font-medium">
            {feed.length === 0 ? 'No news yet' : 'No items match this filter'}
          </p>
          {feed.length === 0 && (
            <p className="text-slate-400 text-sm mt-1">
              Hit Refresh to fetch stories for your current learning topics.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(item => {
            const longevity = item.nodeLongevity ? LONGEVITY_STYLES[item.nodeLongevity] : null;
            const statusStyle = NODE_STATUS_STYLES[item.nodeStatus] ?? 'bg-slate-100 text-slate-500';
            const isRead = !!item.readAt;

            return (
              <div
                key={item.id}
                className={`bg-white border rounded-xl p-4 transition-opacity ${
                  isRead ? 'border-slate-100 opacity-60' : 'border-slate-200'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    {/* Node badge row */}
                    <div className="flex flex-wrap items-center gap-1.5 mb-2">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusStyle}`}>
                        {item.nodeTitle}
                      </span>
                      {longevity && (
                        <span className={`text-xs px-2 py-0.5 rounded-full ${longevity.bg} ${longevity.text}`}>
                          {longevity.label}
                        </span>
                      )}
                    </div>

                    {/* Title */}
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => !isRead && handleRead(item)}
                      className="font-medium text-slate-900 hover:text-sky-600 text-sm leading-snug block"
                    >
                      {item.title}
                    </a>

                    {/* Meta row */}
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-xs text-slate-400 capitalize">{item.source}</span>
                      <span className="text-xs text-slate-300">·</span>
                      <span className="text-xs text-slate-400">{timeAgo(item.fetchedAt)}</span>
                      {item.readAt && (
                        <>
                          <span className="text-xs text-slate-300">·</span>
                          <span className="text-xs text-slate-400">Read</span>
                        </>
                      )}
                      {(item.nodeStatus === 'done' || item.nodeStatus === 'review_due') && !isRead && (
                        <>
                          <span className="text-xs text-slate-300">·</span>
                          <span className="text-xs text-emerald-600 font-medium">Reading bumps SR interval</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Read button */}
                  {!isRead && (
                    <button
                      onClick={() => handleRead(item)}
                      title="Mark as read"
                      className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full border border-slate-200 text-slate-400 hover:border-emerald-400 hover:text-emerald-600 transition-colors"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
