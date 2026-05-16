import { useEffect, useRef, useState } from 'react';
import { getPipelineRun, retryDecompose, type PipelineRun, type PipelineStep } from '../api/client';

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
    return <div className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-slate-200 border-t-sky-500" />;
  }
  if (status === 'done') {
    return (
      <svg className="h-5 w-5 shrink-0 text-emerald-500" viewBox="0 0 20 20" fill="currentColor">
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z"
          clipRule="evenodd"
        />
      </svg>
    );
  }
  if (status === 'failed') {
    return (
      <svg className="h-5 w-5 shrink-0 text-red-500" viewBox="0 0 20 20" fill="currentColor">
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM8.28 7.22a.75.75 0 0 0-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 1 0 1.06 1.06L10 11.06l1.72 1.72a.75.75 0 1 0 1.06-1.06L11.06 10l1.72-1.72a.75.75 0 0 0-1.06-1.06L10 8.94 8.28 7.22Z"
          clipRule="evenodd"
        />
      </svg>
    );
  }
  return <div className="h-5 w-5 shrink-0 rounded-full border-2 border-slate-300" />;
}

const bannerConfig: Record<PipelineRun['status'], { label: string; tone: string; detail: string }> = {
  running: {
    label: 'Running...',
    tone: 'text-sky-600',
    detail: 'The pipeline is actively processing and will update automatically.',
  },
  done: {
    label: 'Complete',
    tone: 'text-emerald-600',
    detail: 'This run finished successfully.',
  },
  partial: {
    label: 'Completed with issues',
    tone: 'text-amber-600',
    detail: 'Most of the work finished, but a few steps still need attention.',
  },
  failed: {
    label: 'Failed',
    tone: 'text-red-600',
    detail: 'The run stopped before completion. Retry once the blocker is resolved.',
  },
};

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
        // Keep polling through transient errors.
      }
    };

    void poll();
    intervalRef.current = setInterval(() => {
      void poll();
    }, 2000);
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
      <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-sky-500" />
        <span className="text-sm text-slate-500">Loading pipeline status...</span>
      </div>
    );
  }

  const showRetry =
    (run.status === 'partial' || run.status === 'failed') &&
    !retrying &&
    (type === 'decompose' || Boolean(onRetry));

  const banner = bannerConfig[run.status];
  const primarySteps = run.steps.filter((step) => !step.id.startsWith('resource_enrichment_'));
  const enrichmentSteps = run.steps.filter((step) => step.id.startsWith('resource_enrichment_'));

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              {run.status === 'running' ? (
                <div className="h-3 w-3 animate-spin rounded-full border-2 border-slate-200 border-t-sky-500" />
              ) : null}
              <span className={`text-sm font-semibold ${banner.tone}`}>{banner.label}</span>
            </div>
            <p className="text-xs leading-relaxed text-slate-500">{banner.detail}</p>
          </div>

          {showRetry ? (
            <button
              onClick={() => void handleRetry()}
              className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
            >
              Retry failed topics
            </button>
          ) : null}

          {retrying ? (
            <span className="inline-flex items-center gap-2 text-xs text-slate-500">
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-slate-200 border-t-indigo-500" />
              Retrying...
            </span>
          ) : null}
        </div>
      </div>

      {retryError ? <p className="text-xs text-red-500">{retryError}</p> : null}

      <div className="space-y-3">
        {primarySteps.map((step) => (
          <div key={step.id} className="rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3">
            <div className="flex items-start gap-3">
              <div className="pt-0.5">
                <StepIcon status={step.status} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`text-sm ${
                      step.status === 'done'
                        ? 'text-slate-700'
                        : step.status === 'running'
                          ? 'font-medium text-sky-700'
                          : step.status === 'failed'
                            ? 'text-red-600'
                            : 'text-slate-400'
                    }`}
                  >
                    {step.label}
                  </span>
                  {elapsed(step) ? (
                    <span className="font-mono text-xs tabular-nums text-slate-400">
                      {elapsed(step)}
                    </span>
                  ) : null}
                </div>
                {step.error ? <p className="mt-1 text-xs text-red-500">{step.error}</p> : null}
              </div>
            </div>
          </div>
        ))}
      </div>

      {enrichmentSteps.length > 0 ? (
        <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-4 py-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">
            Resource enrichment
          </p>
          <div className="space-y-2">
            {enrichmentSteps.map((step) => (
              <div key={step.id} className="flex items-center gap-2.5">
                <StepIcon status={step.status} />
                <span
                  className={`text-xs ${
                    step.status === 'done'
                      ? 'text-slate-600'
                      : step.status === 'running'
                        ? 'text-sky-600'
                        : step.status === 'failed'
                          ? 'text-red-500'
                          : 'text-slate-400'
                  }`}
                >
                  {step.label}
                </span>
                {elapsed(step) ? (
                  <span className="ml-auto font-mono text-xs tabular-nums text-slate-400">
                    {elapsed(step)}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
