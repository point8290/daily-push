import { useCallback, useEffect, useState } from 'react';
import { fetchNews, getNewsFeed, markNewsRead, type NewsItem } from '../api/client';
import EmptyState from '../components/ui/EmptyState';
import PageHeader from '../components/ui/PageHeader';
import SurfaceCard from '../components/ui/SurfaceCard';

const LONGEVITY_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  high: { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'High longevity' },
  medium: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'Medium longevity' },
  low: { bg: 'bg-slate-100', text: 'text-slate-500', label: 'Low longevity' },
};

const NODE_STATUS_STYLES: Record<string, string> = {
  available: 'bg-sky-50 text-sky-700',
  in_progress: 'bg-yellow-50 text-yellow-700',
  done: 'bg-green-50 text-green-700',
  review_due: 'bg-orange-50 text-orange-700',
};

type Filter = 'all' | 'unread' | 'available' | 'done';

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function RefreshIcon({ spinning = false }: { spinning?: boolean }) {
  return (
    <svg
      className={spinning ? 'animate-spin' : ''}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </svg>
  );
}

function NewsStat({
  label,
  value,
  description,
}: {
  label: string;
  value: number;
  description: string;
}) {
  return (
    <SurfaceCard p={5}>
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{label}</p>
      <p
        className="mt-3 font-display text-[28px] text-slate-900"
        style={{ letterSpacing: '-0.03em', lineHeight: 1 }}
      >
        {value}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-slate-500">{description}</p>
    </SurfaceCard>
  );
}

export default function News() {
  const [feed, setFeed] = useState<NewsItem[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);

  const loadFeed = useCallback(async () => {
    try {
      const items = await getNewsFeed();
      setFeed(items);
    } catch {
      // News is supportive, not a hard blocker for the rest of the app.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFeed();
  }, [loadFeed]);

  const handleRefresh = async () => {
    setFetching(true);
    try {
      await fetchNews();
      setTimeout(() => {
        void loadFeed();
      }, 2000);
    } finally {
      setFetching(false);
    }
  };

  const handleRead = async (item: NewsItem) => {
    setFeed((prev) =>
      prev.map((current) =>
        current.id === item.id ? { ...current, readAt: new Date().toISOString() } : current,
      ),
    );

    try {
      await markNewsRead(item.id);
    } catch {
      setFeed((prev) =>
        prev.map((current) =>
          current.id === item.id ? { ...current, readAt: null } : current,
        ),
      );
    }
  };

  const unreadCount = feed.filter((item) => !item.readAt).length;
  const studyNowCount = feed.filter(
    (item) => item.nodeStatus === 'available' || item.nodeStatus === 'in_progress',
  ).length;
  const reviewCount = feed.filter(
    (item) => item.nodeStatus === 'done' || item.nodeStatus === 'review_due',
  ).length;

  const filtered = feed.filter((item) => {
    if (filter === 'unread') return !item.readAt;
    if (filter === 'available') {
      return item.nodeStatus === 'available' || item.nodeStatus === 'in_progress';
    }
    if (filter === 'done') {
      return item.nodeStatus === 'done' || item.nodeStatus === 'review_due';
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Signal feed"
        title="News that maps to your learning graph"
        description="Keep up with stories linked to the topics you are studying now, and turn them into lightweight context or review instead of passive scrolling."
        actions={(
          <button
            onClick={handleRefresh}
            disabled={fetching}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-50"
          >
            <RefreshIcon spinning={fetching} />
            {fetching ? 'Refreshing feed...' : 'Refresh feed'}
          </button>
        )}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <NewsStat
          label="Unread signals"
          value={unreadCount}
          description="Fresh stories you have not processed yet."
        />
        <NewsStat
          label="Study now"
          value={studyNowCount}
          description="Stories attached to nodes you can act on immediately."
        />
        <NewsStat
          label="Review context"
          value={reviewCount}
          description="Finished or review-due topics that reinforce spaced repetition."
        />
      </div>

      <SurfaceCard p={2}>
        <div className="flex flex-wrap gap-2">
          {([
            ['all', `All (${feed.length})`],
            ['unread', `Unread (${unreadCount})`],
            ['available', `Study now (${studyNowCount})`],
            ['done', `Review (${reviewCount})`],
          ] as [Filter, string][]).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
                filter === value
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </SurfaceCard>

      {loading ? (
        <div className="grid gap-4">
          {[1, 2, 3].map((item) => (
            <SurfaceCard key={item} p={5} className="animate-pulse">
              <div className="h-4 w-1/2 rounded bg-slate-100" />
              <div className="mt-4 h-5 w-4/5 rounded bg-slate-100" />
              <div className="mt-3 h-3 w-1/3 rounded bg-slate-100" />
            </SurfaceCard>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={feed.length === 0 ? 'No news yet' : 'No items match this filter'}
          description={
            feed.length === 0
              ? 'Refresh the feed to fetch stories for your current learning topics.'
              : 'Try a different filter to see more learning-linked stories.'
          }
          accent={feed.length === 0 ? 'neutral' : 'brand'}
        />
      ) : (
        <div className="space-y-4">
          {filtered.map((item) => {
            const longevity = item.nodeLongevity ? LONGEVITY_STYLES[item.nodeLongevity] : null;
            const statusStyle = NODE_STATUS_STYLES[item.nodeStatus] ?? 'bg-slate-100 text-slate-500';
            const isRead = Boolean(item.readAt);

            return (
              <SurfaceCard
                key={item.id}
                p={5}
                className={`transition-all ${isRead ? 'opacity-70' : 'border-sky-100/70'}`}
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-1.5">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusStyle}`}>
                        {item.nodeTitle}
                      </span>
                      {longevity && (
                        <span className={`rounded-full px-2 py-0.5 text-xs ${longevity.bg} ${longevity.text}`}>
                          {longevity.label}
                        </span>
                      )}
                    </div>

                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => !isRead && void handleRead(item)}
                      className="block text-sm font-medium leading-snug text-slate-900 hover:text-sky-600"
                    >
                      {item.title}
                    </a>

                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <span className="text-xs capitalize text-slate-400">{item.source}</span>
                      <span className="text-xs text-slate-300">/</span>
                      <span className="text-xs text-slate-400">{timeAgo(item.fetchedAt)}</span>
                      {isRead && (
                        <>
                          <span className="text-xs text-slate-300">/</span>
                          <span className="text-xs text-slate-400">Read</span>
                        </>
                      )}
                      {(item.nodeStatus === 'done' || item.nodeStatus === 'review_due') && !isRead && (
                        <>
                          <span className="text-xs text-slate-300">/</span>
                          <span className="text-xs font-medium text-emerald-600">
                            Reading bumps SR interval
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {!isRead && (
                    <button
                      onClick={() => void handleRead(item)}
                      title="Mark as read"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-400 transition-colors hover:border-emerald-400 hover:text-emerald-600"
                    >
                      <svg
                        width="13"
                        height="13"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </button>
                  )}
                </div>
              </SurfaceCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
