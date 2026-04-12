import { useEffect, useState } from 'react';
import { getCurrentItem, getStreak, getStudyItems, completeItem, skipItem, getSettings, getCategories } from '../api/client';

interface Resource {
  label: string;
  url: string;
  type: 'docs' | 'article' | 'video' | 'repo';
}

interface StudyItem {
  id: number;
  title: string;
  description: string;
  estimated_mins: number;
  topic_title: string;
  resources: Resource[];
}

interface Streak {
  current_streak: number;
  longest_streak: number;
  total_sessions: number;
}

// Extract YouTube video embed URL from a watch URL (not channel URLs)
function getYouTubeEmbedUrl(url: string): string | null {
  const match = url.match(/youtube\.com\/watch\?v=([\w-]+)/);
  if (match) return `https://www.youtube.com/embed/${match[1]}?rel=0`;
  return null;
}

function isYouTubeChannel(url: string): boolean {
  return url.includes('youtube.com/@') || url.includes('youtube.com/c/') || url.includes('youtube.com/channel/');
}

const typeIcon: Record<string, string> = {
  docs: '📄',
  article: '📰',
  video: '▶️',
  repo: '🔗',
};

const typeBadge: Record<string, string> = {
  docs: 'bg-blue-50 text-blue-700 border-blue-200',
  article: 'bg-amber-50 text-amber-700 border-amber-200',
  video: 'bg-red-50 text-red-700 border-red-200',
  repo: 'bg-slate-50 text-slate-700 border-slate-200',
};

export default function Dashboard() {
  const [item, setItem] = useState<StudyItem | null>(null);
  const [streak, setStreak] = useState<Streak | null>(null);
  const [queue, setQueue] = useState<StudyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);
  const [activeCategory, setActiveCategory] = useState<{ id: number; title: string; icon: string } | null>(null);

  const load = async () => {
    setLoading(true);
    const [cur, str, all, settings, categories] = await Promise.all([
      getCurrentItem(), getStreak(), getStudyItems(), getSettings(), getCategories(),
    ]);
    setItem(cur);
    setStreak(str);
    setQueue(
      (all as any[])
        .filter((i: any) => i.id !== cur?.id && i.status !== 'done' && i.status !== 'current')
        .slice(0, 5)
    );
    const activeCatId = settings?.active_category_id;
    if (activeCatId) {
      const found = (categories as any[]).find((c: any) => c.id === activeCatId);
      setActiveCategory(found ?? null);
    } else {
      setActiveCategory(null);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Handle deep-link from email
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const completeId = params.get('complete');
    const skipId = params.get('skip');
    if (completeId) { completeItem(parseInt(completeId)).then(load); window.history.replaceState({}, '', '/'); }
    if (skipId) { skipItem(parseInt(skipId)).then(load); window.history.replaceState({}, '', '/'); }
  }, []);

  const handleComplete = async () => {
    if (!item) return;
    setCompleting(true);
    await completeItem(item.id);
    await load();
    setCompleting(false);
  };

  const handleSkip = async () => {
    if (!item) return;
    await skipItem(item.id);
    await load();
  };

  if (loading) {
    return <div className="text-slate-400 text-sm py-8 text-center">Loading...</div>;
  }

  // Separate embeddable videos from link resources
  const embeddableVideos = item?.resources?.filter(r => r.type === 'video' && getYouTubeEmbedUrl(r.url)) ?? [];
  const linkResources = item?.resources?.filter(r => !getYouTubeEmbedUrl(r.url)) ?? [];

  return (
    <div className="space-y-5">

      {/* Active category banner */}
      {activeCategory && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-indigo-50 border border-indigo-200 rounded-lg text-sm">
          <span className="text-base">{activeCategory.icon}</span>
          <span className="text-indigo-700 font-medium">Focusing on: {activeCategory.title}</span>
          <a href="/courses" className="ml-auto text-indigo-500 hover:text-indigo-700 text-xs font-medium underline">
            Browse courses →
          </a>
        </div>
      )}
      {!activeCategory && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm">
          <span className="text-slate-500">All categories active.</span>
          <a href="/courses" className="ml-auto text-sky-500 hover:text-sky-700 text-xs font-medium underline">
            Browse courses →
          </a>
        </div>
      )}

      {/* Streak bar */}
      {streak && (
        <div className="flex gap-3">
          <div className="bg-white rounded-lg border border-slate-200 px-4 py-2.5 flex items-center gap-2.5">
            <span className="text-xl">🔥</span>
            <div>
              <div className="text-xl font-bold text-slate-900 leading-none">{streak.current_streak}</div>
              <div className="text-xs text-slate-400 mt-0.5">day streak</div>
            </div>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 px-4 py-2.5 flex items-center gap-2.5">
            <span className="text-xl">✅</span>
            <div>
              <div className="text-xl font-bold text-slate-900 leading-none">{streak.total_sessions}</div>
              <div className="text-xs text-slate-400 mt-0.5">sessions done</div>
            </div>
          </div>
        </div>
      )}

      {/* No item state */}
      {!item && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-8 text-center">
          <p className="text-amber-700 font-medium">No study item in queue.</p>
          <p className="text-amber-600 text-sm mt-1">
            Go to <a href="/roadmap" className="underline font-medium">Roadmap</a> to add topics.
          </p>
        </div>
      )}

      {/* Main study session card */}
      {item && (
        <div className="bg-white rounded-xl border border-sky-200 shadow-sm overflow-hidden">

          {/* Header */}
          <div className="bg-gradient-to-r from-sky-600 to-indigo-600 px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sky-200 text-xs font-semibold uppercase tracking-widest mb-1">
                  Today's Session · {item.topic_title}
                </p>
                <h2 className="text-white text-xl font-bold leading-snug">{item.title}</h2>
              </div>
              <div className="text-right shrink-0 ml-4">
                <div className="text-white text-2xl font-bold leading-none">{item.estimated_mins}</div>
                <div className="text-sky-200 text-xs">min</div>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-6">

            {/* Description */}
            <div>
              <p className="text-slate-700 leading-relaxed text-sm">{item.description}</p>
            </div>

            {/* Embedded YouTube Videos */}
            {embeddableVideos.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Watch</h3>
                {embeddableVideos.map((r, i) => (
                  <div key={i} className="rounded-lg overflow-hidden border border-slate-200">
                    <iframe
                      src={getYouTubeEmbedUrl(r.url)!}
                      title={r.label}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      className="w-full aspect-video"
                    />
                    <div className="px-3 py-2 bg-slate-50 text-xs text-slate-500">{r.label}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Resource links */}
            {linkResources.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Resources</h3>
                <div className="grid gap-2">
                  {linkResources.map((r, i) => (
                    <a
                      key={i}
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:border-sky-300 hover:bg-sky-50 transition-colors group"
                    >
                      <span className="text-lg">{typeIcon[r.type] ?? '🔗'}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 group-hover:text-sky-700 truncate">
                          {r.label}
                        </p>
                        <p className="text-xs text-slate-400 truncate">{r.url}</p>
                      </div>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${typeBadge[r.type] ?? typeBadge.docs} shrink-0`}>
                        {r.type}
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* YouTube channel links (can't embed, show as cards) */}
            {item.resources?.filter(r => r.type === 'video' && isYouTubeChannel(r.url)).length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Watch on YouTube</h3>
                <div className="grid gap-2">
                  {item.resources
                    .filter(r => r.type === 'video' && isYouTubeChannel(r.url))
                    .map((r, i) => (
                      <a
                        key={i}
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 p-3 rounded-lg border border-red-100 bg-red-50 hover:bg-red-100 transition-colors group"
                      >
                        <svg className="w-5 h-5 text-red-600 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                        </svg>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-red-800 truncate">{r.label}</p>
                          <p className="text-xs text-red-400 truncate">{r.url}</p>
                        </div>
                        <span className="text-xs text-red-600 font-medium shrink-0">Open →</span>
                      </a>
                    ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-2 border-t border-slate-100">
              <button
                onClick={handleComplete}
                disabled={completing}
                className="flex-1 bg-sky-600 hover:bg-sky-700 text-white py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50 transition-colors"
              >
                {completing ? 'Marking done...' : '✓ Mark as Done'}
              </button>
              <button
                onClick={handleSkip}
                className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors"
              >
                Skip
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Up Next queue */}
      {queue.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Up Next</h3>
          <ul className="space-y-2.5">
            {queue.map((q, i) => (
              <li key={q.id} className="flex items-center gap-3 text-sm">
                <span className="text-slate-300 w-4 shrink-0 text-center">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-700 truncate">{q.title}</p>
                  <p className="text-slate-400 text-xs">{q.topic_title}</p>
                </div>
                <span className="text-slate-300 text-xs shrink-0">{q.estimated_mins}m</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
