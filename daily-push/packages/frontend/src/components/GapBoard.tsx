import { useState } from 'react';
import { Link } from 'react-router-dom';
import SurfaceCard from './ui/SurfaceCard';
import {
  applyRecoveryAction,
  type GapProgress,
  type GapStatus,
  type GoalGapProgress,
} from '../api/client';

export const GAP_STATUS_STYLE: Record<GapStatus, { label: string; cls: string; hint: string }> = {
  open: { label: 'Open', cls: 'bg-slate-100 text-slate-600', hint: 'Not started' },
  closing: { label: 'Closing', cls: 'bg-sky-100 text-sky-800', hint: 'Some concepts done' },
  closed: { label: 'Closed', cls: 'bg-emerald-100 text-emerald-800', hint: 'All concepts done' },
  proven: { label: 'Proven', cls: 'bg-violet-100 text-violet-800', hint: 'Done, with proof' },
};

const SOURCE_LABEL: Record<string, string> = {
  resume_parse: 'from your resume check',
  mock_interview: 'from a mock interview',
  system_inferred: 'from your role',
  user_stated: 'you added',
};

function gapProgressLine(gap: GapProgress): string {
  if (gap.conceptsTotal === 0) {
    if (gap.lastMock) return `Last mock ${gap.lastMock.score}/5. A 4/5 mock proves it.`;
    return 'Practice with a mock interview to close this.';
  }
  const parts = [`${gap.conceptsDone} of ${gap.conceptsTotal} concepts done`];
  if (gap.proofCount > 0) parts.push(`${gap.proofCount} proof`);
  return parts.join(' · ');
}

const EVENT_SOURCE_LABEL: Record<string, string> = {
  session: 'after a session',
  graded_work: 'after graded work',
  mock_interview: 'after a mock interview',
  view: '',
};

export default function GapBoard({
  goalId,
  progress,
  onChanged,
}: {
  goalId: string;
  progress: GoalGapProgress;
  onChanged?: () => void;
}) {
  const [busyGap, setBusyGap] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const closedCount = progress.counts.closed + progress.counts.proven;

  const focus = async (gapId: string) => {
    setBusyGap(gapId);
    setMessage(null);
    try {
      const result = await applyRecoveryAction(goalId, { action: 'focus_gap', gapId });
      setMessage(result.applied);
      onChanged?.();
    } catch {
      setMessage('Could not reorder the plan. Try again.');
    } finally {
      setBusyGap(null);
    }
  };

  return (
    <SurfaceCard p={5} className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-800">Gaps this plan closes</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {closedCount} of {progress.gaps.length} closed. Readiness moves as gaps close and get proof.
          </p>
        </div>
        <div className="text-right">
          <p className="font-display text-3xl leading-none text-slate-900">{progress.readinessPct}%</p>
          <p className="mt-1 text-xs text-slate-500">plan readiness</p>
        </div>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
        <div className="h-full rounded-full bg-sky-600" style={{ width: `${progress.readinessPct}%` }} />
      </div>

      <ul className="divide-y divide-slate-100">
        {progress.gaps.map((gap) => {
          const style = GAP_STATUS_STYLE[gap.status];
          const pct = gap.conceptsTotal > 0 ? Math.round((gap.conceptsDone / gap.conceptsTotal) * 100) : 0;
          return (
            <li key={gap.gapId} className="py-3 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${style.cls}`} title={style.hint}>
                    {style.label}
                  </span>
                  <span className="truncate text-sm font-medium text-slate-800">{gap.skillArea}</span>
                </div>
                <span className="text-xs text-slate-500">
                  {gap.currentLevel && gap.requiredLevel ? (
                    <>
                      <span className="capitalize">{gap.currentLevel}</span> →{' '}
                      <span className="font-semibold capitalize text-slate-700">{gap.requiredLevel}</span>
                    </>
                  ) : null}
                </span>
              </div>
              {gap.conceptsTotal > 0 && (
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                  <div className="h-full rounded-full bg-sky-400" style={{ width: `${pct}%` }} />
                </div>
              )}
              <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-slate-500">
                  {gapProgressLine(gap)}
                  {gap.identifiedBy && SOURCE_LABEL[gap.identifiedBy] ? ` · ${SOURCE_LABEL[gap.identifiedBy]}` : ''}
                </p>
                <div className="flex items-center gap-3">
                  {gap.needsPractice && (
                    <Link to="/mock" className="text-xs font-semibold text-amber-700 hover:underline">
                      Needs practice
                    </Link>
                  )}
                  {gap.priority !== 1 && gap.status !== 'closed' && gap.status !== 'proven' && (
                    <button
                      type="button"
                      onClick={() => focus(gap.gapId)}
                      disabled={busyGap !== null}
                      className="text-xs font-semibold text-sky-700 hover:underline disabled:opacity-50"
                    >
                      {busyGap === gap.gapId ? 'Moving…' : 'Focus on this next'}
                    </button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {message && <p className="text-xs font-semibold text-emerald-700">{message}</p>}

      {progress.recentEvents.filter((event) => event.source !== 'view').length > 0 && (
        <div className="border-t border-slate-100 pt-3">
          <p className="text-sm font-semibold text-slate-400">Recent changes</p>
          <ul className="mt-2 space-y-1">
            {progress.recentEvents
              .filter((event) => event.source !== 'view')
              .slice(0, 4)
              .map((event, index) => (
                <li key={`${event.createdAt}-${index}`} className="text-xs text-slate-600">
                  <span className="font-medium text-slate-800">{event.skillArea}</span>{' '}
                  {event.fromStatus === event.toStatus && typeof event.detail?.priorityTo === 'number'
                    ? 'moved to the top of your plan'
                    : `moved to ${GAP_STATUS_STYLE[(event.toStatus as GapStatus)]?.label.toLowerCase() ?? event.toStatus}`}{' '}
                  {EVENT_SOURCE_LABEL[event.source] ?? ''}
                  <span className="text-slate-400"> · {new Date(event.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                </li>
              ))}
          </ul>
        </div>
      )}
    </SurfaceCard>
  );
}
