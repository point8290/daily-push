import { useEffect, useState } from 'react';
import { getNewsInterests, addNewsInterest, deleteNewsInterest, getNewsFeed, fetchNews } from '../api/client';

interface Interest { id: number; tag: string; }
interface NewsItem { id: number; title: string; url: string; summary: string; relevance: number; source: string; }

export default function News() {
  const [interests, setInterests] = useState<Interest[]>([]);
  const [feed, setFeed] = useState<NewsItem[]>([]);
  const [newTag, setNewTag] = useState('');
  const [fetching, setFetching] = useState(false);

  const load = async () => {
    const [i, f] = await Promise.all([getNewsInterests(), getNewsFeed()]);
    setInterests(i);
    setFeed(f);
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    if (!newTag.trim()) return;
    await addNewsInterest(newTag.trim().toLowerCase());
    setNewTag('');
    await load();
  };

  const handleDelete = async (id: number) => {
    await deleteNewsInterest(id);
    await load();
  };

  const handleFetch = async () => {
    setFetching(true);
    await fetchNews();
    await load();
    setFetching(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">News</h1>
        <button onClick={handleFetch} disabled={fetching}
          className="bg-sky-600 hover:bg-sky-700 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50">
          {fetching ? 'Fetching...' : '↻ Refresh Feed'}
        </button>
      </div>

      {/* Interest Tags */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Your Interests</h2>
        <div className="flex flex-wrap gap-2 mb-3">
          {interests.map((i) => (
            <span key={i.id} className="flex items-center gap-1 bg-sky-50 text-sky-700 border border-sky-200 px-3 py-1 rounded-full text-sm">
              {i.tag}
              <button onClick={() => handleDelete(i.id)} className="text-sky-400 hover:text-red-500 ml-1">×</button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input value={newTag} onChange={e => setNewTag(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            placeholder="Add tag (e.g. rust, kubernetes)"
            className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400" />
          <button onClick={handleAdd} className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-1.5 rounded-lg text-sm font-semibold">
            Add
          </button>
        </div>
      </div>

      {/* News Feed */}
      <div className="space-y-3">
        {feed.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-400">
            <p>No news items yet.</p>
            <p className="text-sm mt-1">Hit "Refresh Feed" to fetch and curate the latest items.</p>
          </div>
        ) : (
          feed.map((item) => (
            <div key={item.id} className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <a href={item.url} target="_blank" rel="noopener noreferrer"
                    className="font-medium text-slate-900 hover:text-sky-600 text-sm leading-snug line-clamp-2">
                    {item.title}
                  </a>
                  {item.summary && (
                    <p className="text-slate-500 text-xs mt-1 leading-relaxed">{item.summary}</p>
                  )}
                  <span className="text-slate-300 text-xs mt-1 inline-block">{item.source}</span>
                </div>
                <div className="shrink-0">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    item.relevance >= 7 ? 'bg-green-100 text-green-700' :
                    item.relevance >= 4 ? 'bg-yellow-100 text-yellow-700' :
                    'bg-slate-100 text-slate-400'
                  }`}>{item.relevance}/10</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
