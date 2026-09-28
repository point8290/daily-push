import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import SurfaceCard from './ui/SurfaceCard';
import { getGoalWork, type WorkItem } from '../api/client';

function scoreTone(score: number | null): string {
  if (score === null) return 'bg-slate-100 text-slate-600';
  if (score >= 4) return 'bg-emerald-100 text-emerald-800';
  if (score >= 3) return 'bg-sky-100 text-sky-800';
  return 'bg-amber-100 text-amber-800';
}

/** Everything the user has written in sessions, with the feedback it got. */
export default function WorkList({ goalId }: { goalId: string }) {
  const [items, setItems] = useState<WorkItem[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    getGoalWork(goalId)
      .then(setItems)
      .catch(() => setItems([]));
  }, [goalId]);

  if (items === null) {
    return <p className="text-sm text-slate-400">Loading your work…</p>;
  }

  if (items.length === 0) {
    return (
      <SurfaceCard p={6} className="text-center">
        <p className="text-sm font-semibold text-slate-800">No written work yet</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
          Each session ends with a short write-up. It shows up here with its feedback, and good work counts as proof for your role.
        </p>
        <Link to="/today" className="mt-4 inline-block rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
          Start today&apos;s session
        </Link>
      </SurfaceCard>
    );
  }

  const proven = items.filter((item) => (item.score ?? 0) >= 4).length;

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        {items.length} piece{items.length === 1 ? '' : 's'} of work · {proven} scored 4/5 or higher and count as proof
      </p>
      {items.map((item) => {
        const expanded = open === item.id;
        return (
          <SurfaceCard key={item.id} p={4}>
            <button
              type="button"
              className="flex w-full items-start justify-between gap-3 text-left"
              onClick={() => setOpen(expanded ? null : item.id)}
              aria-expanded={expanded}
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800">{item.conceptTitle}</p>
                <p className="mt-0.5 text-xs text-slate-400">
                  {new Date(item.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  {item.content ? ` · ${item.content.trim().split(/\s+/).length} words` : ''}
                </p>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${scoreTone(item.score)}`}>
                {item.score !== null ? `${item.score}/5` : item.status === 'submitted' ? 'Not scored' : 'Draft'}
              </span>
            </button>
            {expanded && (
              <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
                {item.prompt && <p className="text-xs italic text-slate-500">{item.prompt}</p>}
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{item.content}</p>
                {item.feedback && (
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-xs font-semibold text-slate-700">Feedback</p>
                    <p className="mt-1 text-sm text-slate-600">{item.feedback}</p>
                    {item.improvements.length > 0 && (
                      <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-slate-600">
                        {item.improvements.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}
          </SurfaceCard>
        );
      })}
    </div>
  );
}
