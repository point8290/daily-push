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
  type RoleMarketPilotFeedbackSummary,
} from '../api/client';
import EmptyState from '../components/ui/EmptyState';
import PageHeader from '../components/ui/PageHeader';
import SurfaceCard from '../components/ui/SurfaceCard';

const WINDOW_OPTIONS = [7, 30, 60, 90];

function formatPct(value: number | null): string {
  if (value == null) return '--';
  return `${value.toFixed(1)}%`;
}

function formatLabel(value: string): string {
  if (!value || value === 'unknown') return 'Unknown';
  return value
    .split('_')
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
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
                <th className="pb-2 font-medium">Progress from previous stage</th>
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

function RoleMarketPilotFeedbackPanel({
  feedback,
  windowDays,
}: {
  feedback: RoleMarketPilotFeedbackSummary;
  windowDays: number;
}) {
  const hasFeedback = feedback.totalResponses > 0;

  return (
    <div className="space-y-4">
      <SurfaceCard p={5}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
              Role Market pilot signal
            </p>
            <h2
              className="font-display text-2xl text-slate-900"
              style={{ letterSpacing: '-0.03em' }}
            >
              Are candidates finding the market analyzer useful?
            </h2>
            <p className="max-w-3xl text-sm leading-relaxed text-slate-500">
              Aggregated feedback from the Career Market and Target Role workspace. This avoids raw
              user notes and focuses on decision signals for the pilot.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
            {feedback.latestFeedbackAt
              ? `Latest feedback: ${new Date(feedback.latestFeedbackAt).toLocaleString()}`
              : `No feedback in the last ${windowDays} days`}
          </div>
        </div>
      </SurfaceCard>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricStat
          label="Feedback responses"
          value={feedback.totalResponses}
          detail={`${feedback.uniqueRespondents} unique respondents`}
        />
        <MetricStat
          label="Avg usefulness"
          value={hasFeedback ? `${feedback.averageUsefulnessScore.toFixed(1)} / 5` : '--'}
          detail="1 means low value, 5 means high value"
        />
        <MetricStat
          label="Positive responses"
          value={hasFeedback ? `${feedback.positiveResponsePct.toFixed(1)}%` : '--'}
          detail="Scores of 4 or 5"
        />
        <MetricStat
          label="Low-score responses"
          value={hasFeedback ? `${feedback.lowScoreResponsePct.toFixed(1)}%` : '--'}
          detail="Scores of 1 or 2"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <UsageTable
          title="Usefulness scores"
          subtitle="Distribution of 1-5 ratings."
          columns={['Score', 'Responses', 'Share']}
          rows={
            hasFeedback ? (
              feedback.scoreDistribution.map((row) => (
                <tr key={row.score}>
                  <td className="py-3 font-medium text-slate-700">{row.score} / 5</td>
                  <td className="py-3 text-slate-600">{row.totalResponses}</td>
                  <td className="py-3 text-slate-600">{row.responsePct.toFixed(1)}%</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={3} className="py-4 text-sm text-slate-400">
                  No pilot feedback yet.
                </td>
              </tr>
            )
          }
        />

        <UsageTable
          title="Feedback reasons"
          subtitle="What users say is helping or missing."
          columns={['Reason', 'Responses', 'Avg score']}
          rows={
            feedback.reasonDistribution.length > 0 ? (
              feedback.reasonDistribution.map((row) => (
                <tr key={row.reason}>
                  <td className="py-3 font-medium text-slate-700">{row.label}</td>
                  <td className="py-3 text-slate-600">
                    {row.totalResponses} ({row.responsePct.toFixed(1)}%)
                  </td>
                  <td className="py-3 text-slate-600">
                    {row.averageUsefulnessScore.toFixed(1)} / 5
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={3} className="py-4 text-sm text-slate-400">
                  No reason data yet.
                </td>
              </tr>
            )
          }
        />

        <UsageTable
          title="Feedback source"
          subtitle="Where the feedback is coming from."
          columns={['Surface', 'Responses', 'Avg score']}
          rows={
            feedback.sourceBreakdown.length > 0 ? (
              feedback.sourceBreakdown.map((row) => (
                <tr key={`${row.source}-${row.ctaLocation}`}>
                  <td className="py-3 font-medium text-slate-700">
                    {formatLabel(row.source)}
                    <span className="block text-xs font-normal text-slate-400">
                      {formatLabel(row.ctaLocation)}
                    </span>
                  </td>
                  <td className="py-3 text-slate-600">
                    {row.totalResponses} ({row.uniqueRespondents} users)
                  </td>
                  <td className="py-3 text-slate-600">
                    {row.averageUsefulnessScore.toFixed(1)} / 5
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={3} className="py-4 text-sm text-slate-400">
                  No source data yet.
                </td>
              </tr>
            )
          }
        />
      </div>
    </div>
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
        eyebrow="Usage insights"
        title="Product activity dashboard"
        description="Review signups, plan activity, session progress, and AI usage in one place."
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
          <div className="text-center text-sm text-slate-400">Loading usage insights...</div>
        </SurfaceCard>
      ) : null}

      {!loading && error ? (
        <SurfaceCard p={5} className="border-red-200 bg-red-50">
          <p className="text-sm text-red-600">{error}</p>
        </SurfaceCard>
      ) : null}

      {!loading && !error && !summary ? (
        <EmptyState
          title="No usage data available"
          description="Try another reporting window or generate more activity before checking the dashboard again."
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
                  title="AI usage by area"
                  subtitle="How AI calls are distributed across product areas."
                  columns={['Area', 'Calls', 'Tokens', 'Est. cost']}
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
            title="User journey"
            subtitle={`Key journey stages for the last ${summary.windowDays} days.`}
            rows={summary.funnel}
          />

          <MetricsTable
            title="Plan feature usage"
            subtitle={`Plan-related feature events for the last ${summary.windowDays} days.`}
            rows={summary.premiumEvents}
          />

          <RoleMarketPilotFeedbackPanel
            feedback={summary.roleMarketPilotFeedback}
            windowDays={summary.windowDays}
          />
        </>
      ) : null}
    </div>
  );
}
