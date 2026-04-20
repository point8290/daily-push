import { useEffect, useRef, useState } from 'react';
import { getPipelineRun, retryDecompose, PipelineRun, PipelineStep } from '../api/client';

interface Props {
  goalId: string;
  type: 'intake' | 'decompose';
  onComplete?: (run: PipelineRun) => void;
  onRetry?: () => Promise<void>;
}

function elapsed(step: PipelineStep): string | null {
  if (!step.startedAt || !step.completedAt) return null;
  const ms = new Date(step.completedAt).getTime() - new Date(step.startedAt).getTime();
  return `${Math.round(ms / 1000)}s`;
}

function StepIcon({ status }: { status: PipelineStep['status'] }) {
  if (status === 'running') {
    return (
      <div className="w-5 h-5 border-2 border-slate-200 border-t-sky-500 rounded-full animate-spin flex-shrink-0" />
    );
  }
  if (status === 'done') {
    return (
      <svg className="w-5 h-5 text-emerald-500 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
      </svg>
    );
  }
  if (status === 'failed') {
    return (
      <svg className="w-5 h-5 text-red-500 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
      </svg>
    );
  }
  // pending
  return (
    <div className="w-5 h-5 rounded-full border-2 border-slate-300 flex-shrink-0" />
  );
}

export default function PipelineStatus({ goalId, type, onComplete, onRetry }: Props) {
  const [run, setRun] = useState<PipelineRun | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const startPolling = () => {
    stopPolling();
    const poll = async () => {
      try {
        const data = await getPipelineRun(goalId);
        setRun(data);
        if (data.status !== 'running') {
          stopPolling();
          onComplete?.(data);
        }
      } catch {
        // keep polling — transient error
      }
    };
    poll();
    intervalRef.current = setInterval(poll, 2000);
  };

  useEffect(() => {
    startPolling();
    return stopPolling;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goalId]);

  const handleRetry = async () => {
    setRetrying(true);
    setRetryError(null);
    try {
      if (onRetry) {
        await onRetry();
      } else {
        await retryDecompose(goalId);
      }
      startPolling();
    } catch (err: any) {
      setRetryError(err?.response?.data?.error ?? 'Retry failed');
    } finally {
      setRetrying(false);
    }
  };

  if (!run) {
    return (
      <div className="flex items-center gap-3 py-4">
        <div className="w-5 h-5 border-2 border-slate-200 border-t-sky-500 rounded-full animate-spin" />
        <span className="text-sm text-slate-500">Loading pipeline status...</span>
      </div>
    );
  }

  const showRetry =
    (run.status === 'partial' || run.status === 'failed') &&
    !retrying &&
    (type === 'decompose' || !!onRetry);

  const bannerConfig: Record<PipelineRun['status'], { label: string; cls: string }> = {
    running: { label: 'Running…',              cls: 'text-sky-600' },
    done:    { label: 'Complete',               cls: 'text-emerald-600' },
    partial: { label: 'Completed with errors',  cls: 'text-amber-600' },
    failed:  { label: 'Failed',                 cls: 'text-red-600' },
  };
  const banner = bannerConfig[run.status];

  // Group resource_enrichment steps separately so the list is readable
  const decomposeSteps = run.steps.filter(
    (s) => !s.id.startsWith('resource_enrichment_')
  );
  const enrichmentSteps = run.steps.filter((s) => s.id.startsWith('resource_enrichment_'));

  return (
    <div className="space-y-4">
      {/* Status banner */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {run.status === 'running' && (
            <div className="w-3 h-3 border-2 border-slate-200 border-t-sky-500 rounded-full animate-spin" />
          )}
          <span className={`text-sm font-semibold ${banner.cls}`}>{banner.label}</span>
        </div>
        {showRetry && (
          <button
            onClick={handleRetry}
            className="text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700
                       px-3 py-1.5 rounded-lg transition-colors"
          >
            Retry failed topics
          </button>
        )}
        {retrying && (
          <span className="text-xs text-slate-500 flex items-center gap-1.5">
            <div className="w-3 h-3 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
            Retrying…
          </span>
        )}
      </div>

      {retryError && (
        <p className="text-xs text-red-500">{retryError}</p>
      )}

      {/* Step list — main steps */}
      <div className="space-y-2">
        {decomposeSteps.map((step) => (
          <div key={step.id} className="flex items-start gap-3">
            <div className="pt-0.5">
              <StepIcon status={step.status} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={`text-sm ${
                  step.status === 'done'    ? 'text-slate-700' :
                  step.status === 'running' ? 'text-sky-700 font-medium' :
                  step.status === 'failed'  ? 'text-red-600' :
                  'text-slate-400'
                }`}>
                  {step.label}
                </span>
                {elapsed(step) && (
                  <span className="text-xs text-slate-400 font-mono tabular-nums">
                    {elapsed(step)}
                  </span>
                )}
              </div>
              {step.error && (
                <p className="text-xs text-red-500 mt-0.5">{step.error}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Resource enrichment steps — shown as a collapsible sub-section */}
      {enrichmentSteps.length > 0 && (
        <div className="border-t border-slate-100 pt-3">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">
            Resource enrichment
          </p>
          <div className="space-y-1.5">
            {enrichmentSteps.map((step) => (
              <div key={step.id} className="flex items-center gap-2.5">
                <StepIcon status={step.status} />
                <span className={`text-xs ${
                  step.status === 'done'    ? 'text-slate-600' :
                  step.status === 'running' ? 'text-sky-600' :
                  step.status === 'failed'  ? 'text-red-500' :
                  'text-slate-400'
                }`}>
                  {step.label}
                </span>
                {elapsed(step) && (
                  <span className="text-xs text-slate-400 font-mono tabular-nums ml-auto">
                    {elapsed(step)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
