import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  getAiUsageSummary,
  getProductMetrics,
  type LlmUsageFeatureSummary,
  type LlmUsageSummary,
  type LlmUsageUserSummary,
  type ProductMetricsPremiumEvent,
  type ProductMetricsStage,
  type ProductMetricsSummary,
} from '../api/client';
import EmptyState from '../components/ui/EmptyState';
import PageHeader from '../components/ui/PageHeader';
import SurfaceCard from '../components/ui/SurfaceCard';

const WINDOW_OPTIONS = [7, 30, 60, 90];

function formatPct(value: number | null): string {
  if (value == null) return '--';
  return `${value.toFixed(1)}%`;
}

function MetricStat({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail?: string;
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
      {detail ? <p className="mt-2 text-sm leading-relaxed text-slate-500">{detail}</p> : null}
    </SurfaceCard>
  );
}

function MetricsTable({
  title,
  subtitle,
  rows,
}: {
  title: string;
  subtitle: string;
  rows: Array<ProductMetricsStage | ProductMetricsPremiumEvent>;
}) {
  return (
    <SurfaceCard p={5}>
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{title}</p>
        <p className="text-sm text-slate-500">{subtitle}</p>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-slate-400">
            <tr>
              <th className="pb-2 font-medium">Stage</th>
              <th className="pb-2 font-medium">Unique users</th>
              <th className="pb-2 font-medium">Total events</th>
              {'conversionFromPreviousPct' in rows[0] ? (
                <th className="pb-2 font-medium">Stage conversion</th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.eventKey}>
                <td className="py-3 font-medium text-slate-700">{row.label}</td>
                <td className="py-3 text-slate-600">{row.uniqueUsers}</td>
                <td className="py-3 text-slate-600">{row.totalEvents}</td>
                {'conversionFromPreviousPct' in row ? (
                  <td className="py-3 text-slate-600">
                    {formatPct(row.conversionFromPreviousPct)}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SurfaceCard>
  );
}

function UsageTable({
  title,
  subtitle,
  columns,
  rows,
}: {
  title: string;
  subtitle: string;
  columns: string[];
  rows: ReactNode;
}) {
  return (
    <SurfaceCard p={5}>
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{title}</p>
        <p className="text-sm text-slate-500">{subtitle}</p>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-slate-400">
            <tr>
              {columns.map((column) => (
                <th key={column} className="pb-2 font-medium">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">{rows}</tbody>
        </table>
      </div>
    </SurfaceCard>
  );
}

export default function ProductMetrics() {
  const [windowDays, setWindowDays] = useState(30);
  const [summary, setSummary] = useState<ProductMetricsSummary | null>(null);
  const [aiUsage, setAiUsage] = useState<LlmUsageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    Promise.all([getProductMetrics(windowDays), getAiUsageSummary(windowDays)])
      .then(([metrics, usage]) => {
        setSummary(metrics);
        setAiUsage(usage);
      })
      .catch((err: any) => {
        setError(err?.response?.data?.error ?? 'Could not load product metrics right now.');
      })
      .finally(() => setLoading(false));
  }, [windowDays]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Internal metrics"
        title="Product health dashboard"
        description="Track activation, premium usage, and plan mix without dropping into the database or reading raw event tables."
        actions={(
          <div className="flex flex-wrap gap-2">
            {WINDOW_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setWindowDays(option)}
                className={`rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
                  windowDays === option
                    ? 'bg-slate-900 text-white'
                    : 'border border-slate-200 text-slate-600 hover:border-sky-300 hover:text-sky-700'
                }`}
              >
                Last {option}d
              </button>
            ))}
          </div>
        )}
      />

      <SurfaceCard p={4}>
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <span className="text-sm text-slate-500">
            {summary
              ? `Generated ${new Date(summary.generatedAt).toLocaleString()}`
              : 'Metrics refresh whenever you switch the reporting window.'}
          </span>
          <Link to="/settings" className="text-sm font-semibold text-slate-700 hover:text-sky-700">
            Back to settings
          </Link>
        </div>
      </SurfaceCard>

      {loading ? (
        <SurfaceCard p={10}>
          <div className="text-center text-sm text-slate-400">Loading product metrics...</div>
        </SurfaceCard>
      ) : null}

      {!loading && error ? (
        <SurfaceCard p={5} className="border-red-200 bg-red-50">
          <p className="text-sm text-red-600">{error}</p>
        </SurfaceCard>
      ) : null}

      {!loading && !error && !summary ? (
        <EmptyState
          title="No metrics available"
          description="Try another reporting window or generate more product activity before checking the dashboard again."
          accent="neutral"
        />
      ) : null}

      {!loading && !error && summary ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricStat
              label="New users"
              value={summary.users.newUsersWindow}
              detail={`Created in the last ${summary.windowDays} days`}
            />
            <MetricStat
              label="Active users"
              value={summary.users.activeUsers30d}
              detail={`${summary.users.activeUsers7d} active in the last 7 days`}
            />
            <MetricStat
              label="Paying users"
              value={summary.users.payingUsers}
              detail={`Out of ${summary.users.totalUsers} total accounts`}
            />
            <MetricStat
              label="Completed sessions"
              value={summary.sessions.completed30d}
              detail={`${summary.sessions.averageCompletedPerActiveUser30d} per active learner in 30d`}
            />
          </div>

          {aiUsage ? (
            <>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <MetricStat
                  label="AI calls"
                  value={aiUsage.totals.totalCalls}
                  detail={`Metered in the last ${aiUsage.windowDays} days`}
                />
                <MetricStat label="Prompt tokens" value={aiUsage.totals.promptTokens} />
                <MetricStat label="Completion tokens" value={aiUsage.totals.completionTokens} />
                <MetricStat
                  label="Estimated cost"
                  value={`$${aiUsage.totals.estimatedCostUsd.toFixed(4)}`}
                  detail="Uses your configured per-1K token rates"
                />
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <UsageTable
                  title="AI usage by feature"
                  subtitle="Where premium token usage is going."
                  columns={['Feature', 'Calls', 'Tokens', 'Est. cost']}
                  rows={aiUsage.byFeature.map((row: LlmUsageFeatureSummary) => (
                    <tr key={row.featureKey}>
                      <td className="py-3 font-medium text-slate-700">{row.featureKey}</td>
                      <td className="py-3 text-slate-600">{row.totalCalls}</td>
                      <td className="py-3 text-slate-600">{row.totalTokens}</td>
                      <td className="py-3 text-slate-600">${row.estimatedCostUsd.toFixed(4)}</td>
                    </tr>
                  ))}
                />

                <UsageTable
                  title="AI usage by user"
                  subtitle="Top token consumers in the current window."
                  columns={['User', 'Calls', 'Tokens', 'Est. cost']}
                  rows={aiUsage.topUsers.map((row: LlmUsageUserSummary) => (
                    <tr key={row.userId}>
                      <td className="py-3 font-medium text-slate-700">{row.email ?? row.userId}</td>
                      <td className="py-3 text-slate-600">{row.totalCalls}</td>
                      <td className="py-3 text-slate-600">{row.totalTokens}</td>
                      <td className="py-3 text-slate-600">${row.estimatedCostUsd.toFixed(4)}</td>
                    </tr>
                  ))}
                />
              </div>
            </>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricStat label="Free plan" value={summary.users.planCounts.free} />
            <MetricStat label="Pro plan" value={summary.users.planCounts.pro} />
            <MetricStat label="Sprint plan" value={summary.users.planCounts.sprint} />
            <MetricStat label="Sessions in 7d" value={summary.sessions.completed7d} />
          </div>

          <MetricsTable
            title="Activation funnel"
            subtitle={`Core funnel stages for the last ${summary.windowDays} days.`}
            rows={summary.funnel}
          />

          <MetricsTable
            title="Premium feature usage"
            subtitle={`Billing and premium feature events for the last ${summary.windowDays} days.`}
            rows={summary.premiumEvents}
          />
        </>
      ) : null}
    </div>
  );
}
