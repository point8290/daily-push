import { useEffect, useState } from 'react';
import { getCategories, getStudyItemsByTopic, completeItem, enrichTopic } from '../api/client';

interface Resource {
  label: string;
  url: string;
  type: 'docs' | 'article' | 'video' | 'repo';
}

interface StudyItem {
  id: number;
  type: 'concept' | 'practice';
  title: string;
  description: string;
  estimated_mins: number;
  resources: Resource[];
  status: 'queued' | 'current' | 'done' | 'skipped';
}

interface Topic {
  id: number;
  title: string;
  item_count: number;
  done_count: number;
}

interface Subcategory {
  id: number;
  title: string;
  topics: Topic[];
}

interface Category {
  id: number;
  title: string;
  icon: string;
  subcategories: Subcategory[];
}

function getYouTubeEmbedUrl(url: string): string | null {
  const match = url.match(/youtube\.com\/watch\?v=([\w-]+)/);
  if (match) return `https://www.youtube.com/embed/${match[1]}?rel=0`;
  return null;
}

function isYouTubeChannel(url: string): boolean {
  return url.includes('youtube.com/@') || url.includes('youtube.com/c/') || url.includes('youtube.com/channel/');
}

const typeIcon: Record<string, string> = {
  docs: '📄', article: '📰', video: '▶️', repo: '🔗',
};

const typeBadge: Record<string, string> = {
  docs: 'bg-blue-50 text-blue-700 border-blue-200',
  article: 'bg-amber-50 text-amber-700 border-amber-200',
  video: 'bg-red-50 text-red-700 border-red-200',
  repo: 'bg-slate-50 text-slate-700 border-slate-200',
};

const LABELED_SECTIONS = ['Prerequisites', 'Mental model', 'Key insight', 'What to watch for', 'Self-check', 'Connects to', 'Task', 'Constraints', 'Success criteria', 'Stretch goal'];

function DescriptionBlock({ text }: { text: string }) {
  // Split on known section labels like "Prerequisites: ..." to render structured content
  const sectionRegex = new RegExp(`(${LABELED_SECTIONS.join('|')}):`, 'g');
  const parts = text.split(sectionRegex);

  if (parts.length <= 1) {
    // No labels found — plain paragraph
    return <p className="text-slate-700 text-sm leading-relaxed">{text}</p>;
  }

  // parts alternates: [before-first-label, label1, content1, label2, content2, ...]
  const sections: { label: string; body: string }[] = [];
  const intro = parts[0].trim();
  for (let i = 1; i < parts.length; i += 2) {
    sections.push({ label: parts[i], body: (parts[i + 1] ?? '').trim() });
  }

  return (
    <div className="space-y-3 text-sm">
      {intro && <p className="text-slate-700 leading-relaxed">{intro}</p>}
      {sections.map(({ label, body }) => (
        <div key={label}>
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</span>
          <p className="mt-0.5 text-slate-700 leading-relaxed">{body}</p>
        </div>
      ))}
    </div>
  );
}

function SessionCard({
  item,
  onDone,
}: {
  item: StudyItem;
  onDone: () => void;
}) {
  const [completing, setCompleting] = useState(false);
  const isDone = item.status === 'done';

  const embeddableVideos = item.resources?.filter(r => r.type === 'video' && getYouTubeEmbedUrl(r.url)) ?? [];
  const channelVideos = item.resources?.filter(r => r.type === 'video' && isYouTubeChannel(r.url)) ?? [];
  const linkResources = item.resources?.filter(r => !getYouTubeEmbedUrl(r.url) && !(r.type === 'video' && isYouTubeChannel(r.url))) ?? [];

  const handleComplete = async () => {
    setCompleting(true);
    await completeItem(item.id);
    onDone();
    setCompleting(false);
  };

  const tagColor = item.type === 'concept'
    ? 'bg-indigo-100 text-indigo-700'
    : 'bg-emerald-100 text-emerald-700';

  return (
    <div className={`border rounded-xl overflow-hidden ${isDone ? 'border-slate-200 opacity-60' : 'border-slate-200'}`}>
      {/* Session header */}
      <div className={`px-4 py-3 flex items-center gap-3 ${item.type === 'concept' ? 'bg-indigo-50' : 'bg-emerald-50'}`}>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${tagColor}`}>
          {item.type === 'concept' ? '📖 CONCEPT' : '⚒ PRACTICE'}
        </span>
        <span className="text-sm font-semibold text-slate-800 flex-1">{item.title}</span>
        <span className="text-xs text-slate-400 shrink-0">{item.estimated_mins} min</span>
        {isDone && <span className="text-emerald-500 text-sm font-bold shrink-0">✓ Done</span>}
      </div>

      <div className="p-4 space-y-4">
        <DescriptionBlock text={item.description} />

        {/* Embedded videos */}
        {embeddableVideos.map((r, i) => (
          <div key={i} className="rounded-lg overflow-hidden border border-slate-200">
            <iframe
              src={getYouTubeEmbedUrl(r.url)!}
              title={r.label}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="w-full aspect-video"
            />
            <div className="px-3 py-1.5 bg-slate-50 text-xs text-slate-500">{r.label}</div>
          </div>
        ))}

        {/* YouTube channel cards */}
        {channelVideos.map((r, i) => (
          <a
            key={i}
            href={r.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-3 rounded-lg border border-red-100 bg-red-50 hover:bg-red-100 transition-colors"
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

        {/* Other resource links */}
        {linkResources.length > 0 && (
          <div className="space-y-1.5">
            {linkResources.map((r, i) => (
              <a
                key={i}
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-2.5 rounded-lg border border-slate-200 hover:border-sky-300 hover:bg-sky-50 transition-colors group"
              >
                <span className="text-base">{typeIcon[r.type] ?? '🔗'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-800 group-hover:text-sky-700 truncate">{r.label}</p>
                  <p className="text-xs text-slate-400 truncate">{r.url}</p>
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${typeBadge[r.type] ?? typeBadge.docs} shrink-0`}>
                  {r.type}
                </span>
              </a>
            ))}
          </div>
        )}

        {!isDone && (
          <button
            onClick={handleComplete}
            disabled={completing}
            className={`w-full py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 ${
              item.type === 'concept'
                ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white'
            }`}
          >
            {completing ? 'Marking done...' : `✓ Mark ${item.type === 'concept' ? 'Concept' : 'Practice'} Done`}
          </button>
        )}
      </div>
    </div>
  );
}

export default function Courses() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<Set<number>>(new Set());
  const [expandedSubcats, setExpandedSubcats] = useState<Set<number>>(new Set());
  const [selectedTopicId, setSelectedTopicId] = useState<number | null>(null);
  const [selectedTopicTitle, setSelectedTopicTitle] = useState('');
  const [topicItems, setTopicItems] = useState<StudyItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [enriching, setEnriching] = useState(false);

  useEffect(() => {
    getCategories().then((data: Category[]) => {
      setCategories(data);
      // Auto-expand first category
      if (data.length > 0) {
        setExpandedCategories(new Set([data[0].id]));
        if (data[0].subcategories?.length > 0) {
          setExpandedSubcats(new Set([data[0].subcategories[0].id]));
        }
      }
    });
  }, []);

  const loadTopic = async (topicId: number, topicTitle: string) => {
    setSelectedTopicId(topicId);
    setSelectedTopicTitle(topicTitle);
    setLoadingItems(true);
    const items = await getStudyItemsByTopic(topicId);
    setTopicItems(items);
    setLoadingItems(false);
  };

  const refreshItems = async () => {
    if (selectedTopicId === null) return;
    const items = await getStudyItemsByTopic(selectedTopicId);
    setTopicItems(items);
    // Also refresh the category tree to update done_counts
    const data = await getCategories();
    setCategories(data);
  };

  const handleEnrich = async () => {
    if (selectedTopicId === null) return;
    setEnriching(true);
    await enrichTopic(selectedTopicId);
    await refreshItems();
    setEnriching(false);
  };

  const toggleCategory = (id: number) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSubcat = (id: number) => {
    setExpandedSubcats(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const conceptItem = topicItems.find(i => i.type === 'concept');
  const practiceItem = topicItems.find(i => i.type === 'practice');

  return (
    <div className="flex h-[calc(100vh-60px)] overflow-hidden -mx-4 -my-8">

      {/* Sidebar */}
      <aside className="w-72 shrink-0 border-r border-slate-200 bg-white overflow-y-auto">
        <div className="px-4 py-3 border-b border-slate-100">
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-widest">Courses</h2>
        </div>

        <div className="py-2">
          {categories.map(cat => {
            const isCatOpen = expandedCategories.has(cat.id);
            const totalTopics = cat.subcategories.reduce((s, sc) => s + sc.topics.length, 0);
            const doneTopics = cat.subcategories.reduce(
              (s, sc) => s + sc.topics.filter(t => t.done_count >= t.item_count && t.item_count > 0).length,
              0
            );

            return (
              <div key={cat.id}>
                {/* Category row */}
                <button
                  onClick={() => toggleCategory(cat.id)}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-slate-50 transition-colors"
                >
                  <span className="text-base">{cat.icon}</span>
                  <span className="flex-1 text-sm font-semibold text-slate-800 truncate">{cat.title}</span>
                  <span className="text-xs text-slate-400 shrink-0">{doneTopics}/{totalTopics}</span>
                  <span className={`text-slate-400 text-xs transition-transform ${isCatOpen ? 'rotate-90' : ''}`}>▶</span>
                </button>

                {isCatOpen && cat.subcategories.map(sc => {
                  const isScOpen = expandedSubcats.has(sc.id);

                  return (
                    <div key={sc.id}>
                      {/* Subcategory row */}
                      <button
                        onClick={() => toggleSubcat(sc.id)}
                        className="w-full flex items-center gap-2 pl-8 pr-4 py-2 text-left hover:bg-slate-50 transition-colors"
                      >
                        <span className={`text-slate-400 text-xs transition-transform ${isScOpen ? 'rotate-90' : ''}`}>▶</span>
                        <span className="flex-1 text-xs font-semibold text-slate-600 truncate">{sc.title}</span>
                        <span className="text-xs text-slate-300 shrink-0">{sc.topics.length}</span>
                      </button>

                      {isScOpen && sc.topics.map(topic => {
                        const isDone = topic.done_count >= topic.item_count && topic.item_count > 0;
                        const isSelected = selectedTopicId === topic.id;

                        return (
                          <button
                            key={topic.id}
                            onClick={() => loadTopic(topic.id, topic.title)}
                            className={`w-full flex items-center gap-2 pl-12 pr-4 py-2 text-left transition-colors ${
                              isSelected
                                ? 'bg-sky-50 border-r-2 border-sky-500'
                                : 'hover:bg-slate-50'
                            }`}
                          >
                            <span className={`text-xs shrink-0 ${isDone ? 'text-emerald-500' : 'text-slate-300'}`}>
                              {isDone ? '●' : '○'}
                            </span>
                            <span className={`flex-1 text-xs truncate ${isSelected ? 'text-sky-700 font-medium' : 'text-slate-600'}`}>
                              {topic.title}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </aside>

      {/* Content panel */}
      <main className="flex-1 overflow-y-auto bg-slate-50">
        {!selectedTopicId ? (
          <div className="flex items-center justify-center h-full text-center p-8">
            <div>
              <p className="text-4xl mb-3">📚</p>
              <p className="text-slate-500 font-medium">Select a topic from the sidebar</p>
              <p className="text-slate-400 text-sm mt-1">Each topic has a concept session and a practice session</p>
            </div>
          </div>
        ) : loadingItems ? (
          <div className="flex items-center justify-center h-full">
            <span className="text-slate-400 text-sm">Loading...</span>
          </div>
        ) : (
          <div className="p-6 space-y-5 max-w-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold text-slate-900">{selectedTopicTitle}</h1>
                {topicItems.length === 0 && (
                  <p className="text-slate-400 text-sm mt-2">No study sessions found for this topic.</p>
                )}
              </div>
              <button
                onClick={handleEnrich}
                disabled={enriching}
                title="Regenerate concept + practice sessions with deep, structured content using Claude"
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-600 disabled:opacity-50 transition-colors"
              >
                {enriching ? (
                  <>
                    <svg className="w-3.5 h-3.5 animate-spin text-slate-400" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                    </svg>
                    Regenerating…
                  </>
                ) : (
                  <>✨ Regenerate</>
                )}
              </button>
            </div>

            {conceptItem && (
              <SessionCard key={conceptItem.id} item={conceptItem} onDone={refreshItems} />
            )}
            {practiceItem && (
              <SessionCard key={practiceItem.id} item={practiceItem} onDone={refreshItems} />
            )}

            {/* Any extra items not typed concept/practice */}
            {topicItems
              .filter(i => i.type !== 'concept' && i.type !== 'practice')
              .map(item => (
                <SessionCard key={item.id} item={item} onDone={refreshItems} />
              ))}
          </div>
        )}
      </main>
    </div>
  );
}
