import { useEffect, useState } from 'react';
import { getTopics, createTopic, generateQueue, decomposeWithEngine, deleteTopic } from '../api/client';

interface Topic {
  id: number; title: string; description: string;
  status: string; position: number;
  item_count: number; done_count: number;
}

type Level = 'beginner' | 'intermediate' | 'advanced';

export default function Roadmap() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [generatingId, setGeneratingId] = useState<number | null>(null);
  const [decomposingId, setDecomposingId] = useState<number | null>(null);
  const [levelMap, setLevelMap] = useState<Record<number, Level>>({});
  const [error, setError] = useState<string | null>(null);

  const load = () => getTopics().then((t: Topic[]) => setTopics(t));
  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!title.trim()) return;
    setCreating(true);
    await createTopic({ title: title.trim(), description: description.trim() || undefined });
    setTitle(''); setDescription(''); setShowForm(false);
    await load();
    setCreating(false);
  };

  const handleGenerate = async (id: number) => {
    setGeneratingId(id);
    setError(null);
    await generateQueue(id);
    await load();
    setGeneratingId(null);
  };

  const handleDecompose = async (id: number) => {
    setDecomposingId(id);
    setError(null);
    try {
      const level = levelMap[id] ?? 'intermediate';
      await decomposeWithEngine(id, level);
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Topic Engine is not reachable. Make sure it is running on port 3000.');
    } finally {
      setDecomposingId(null);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this topic and all its study items?')) return;
    await deleteTopic(id);
    await load();
  };

  const setLevel = (id: number, level: Level) =>
    setLevelMap(prev => ({ ...prev, [id]: level }));

  const statusColor: Record<string, string> = {
    pending: 'text-slate-400', active: 'text-sky-600', completed: 'text-green-600',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Roadmap</h1>
        <button onClick={() => setShowForm(!showForm)}
          className="bg-sky-600 hover:bg-sky-700 text-white px-4 py-2 rounded-lg text-sm font-semibold">
          + Add Topic
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {showForm && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <input value={title} onChange={e => setTitle(e.target.value)}
            placeholder="Topic title (e.g. 'RAG Systems')"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400" />
          <textarea value={description} onChange={e => setDescription(e.target.value)}
            placeholder="Brief description (optional — helps generate better study items)"
            rows={2}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400" />
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={creating || !title.trim()}
              className="bg-sky-600 hover:bg-sky-700 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50">
              {creating ? 'Creating...' : 'Create Topic'}
            </button>
            <button onClick={() => setShowForm(false)}
              className="bg-slate-100 text-slate-600 px-4 py-2 rounded-lg text-sm">Cancel</button>
          </div>
        </div>
      )}

      {topics.length === 0 && (
        <div className="text-center py-12 text-slate-400">
          <p className="text-lg">No topics yet.</p>
          <p className="text-sm mt-1">Add your first topic and generate a study queue.</p>
        </div>
      )}

      {topics.map((topic) => (
        <div key={topic.id} className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-start justify-between mb-2">
            <div>
              <h2 className="font-bold text-slate-900">{topic.title}</h2>
              {topic.description && <p className="text-sm text-slate-500 mt-0.5">{topic.description}</p>}
            </div>
            <div className="flex items-center gap-2 ml-4 shrink-0">
              <span className={`text-xs font-semibold capitalize ${statusColor[topic.status]}`}>{topic.status}</span>
              <button onClick={() => handleDelete(topic.id)}
                className="text-red-400 hover:text-red-600 text-xs">delete</button>
            </div>
          </div>

          {topic.item_count > 0 ? (
            <div className="mt-2">
              <div className="flex items-center gap-2 mb-1">
                <div className="flex-1 bg-slate-100 rounded-full h-1.5">
                  <div className="bg-sky-500 h-1.5 rounded-full"
                    style={{ width: `${Math.round((topic.done_count / topic.item_count) * 100)}%` }} />
                </div>
                <span className="text-xs text-slate-400">{topic.done_count}/{topic.item_count} done</span>
              </div>
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {/* Option A — Claude flat generation */}
              <button
                onClick={() => handleGenerate(topic.id)}
                disabled={generatingId === topic.id || decomposingId === topic.id}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
              >
                {generatingId === topic.id ? '✨ Generating...' : '✨ Generate with Claude'}
              </button>

              {/* Option B — Topic Engine prerequisite graph */}
              <div className="flex items-center gap-1.5">
                <select
                  value={levelMap[topic.id] ?? 'intermediate'}
                  onChange={e => setLevel(topic.id, e.target.value as Level)}
                  disabled={decomposingId === topic.id || generatingId === topic.id}
                  className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-400 disabled:opacity-50"
                >
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                </select>
                <button
                  onClick={() => handleDecompose(topic.id)}
                  disabled={decomposingId === topic.id || generatingId === topic.id}
                  className="bg-violet-600 hover:bg-violet-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
                >
                  {decomposingId === topic.id ? '🧠 Decomposing...' : '🧠 Decompose with Topic Engine'}
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
