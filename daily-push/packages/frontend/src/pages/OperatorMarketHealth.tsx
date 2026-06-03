import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getOperatorMarketAggregates,
  getOperatorMarketIngestionRuns,
  getOperatorMarketProfileDrafts,
  getOperatorMarketProfileVersions,
  getOperatorMarketSources,
  getOperatorOutcomeCalibration,
  publishOperatorMarketProfileDraft,
  rejectOperatorMarketProfileDraft,
  rollbackOperatorMarketProfileVersion,
  triggerOperatorMarketIngestion,
  type MarketIngestionRun,
  type MarketIngestionRunStatus,
  type MarketProfileRequirementDiffItem,
  type OperatorMarketAggregatesResponse,
  type OperatorMarketIngestionTriggerResponse,
  type OperatorOutcomeCalibrationResponse,
  type OperatorOutcomeCalibrationRoleItem,
  type OperatorMarketProfileDraftItem,
  type OperatorMarketProfileDraftsResponse,
  type OperatorMarketProfileVersionItem,
  type OperatorMarketProfileVersionsResponse,
  type OperatorMarketRoleAggregateItem,
  type OperatorMarketSourceHealthItem,
  type OperatorMarketSourcesResponse,
  type OperatorMarketIngestionRunsResponse,
} from '../api/client';
import EmptyState from '../components/ui/EmptyState';
import PageHeader from '../components/ui/PageHeader';
import SurfaceCard from '../components/ui/SurfaceCard';
import { useAuth } from '../contexts/AuthContext';

const RUN_STATUS_FILTERS: Array<{ value: MarketIngestionRunStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All runs' },
  { value: 'failed', label: 'Failed' },
  { value: 'partial', label: 'Partial' },
  { value: 'succeeded', label: 'Succeeded' },
  { value: 'running', label: 'Running' },
];

function formatLabel(value: string | null | undefined): string {
  if (!value) return 'Unknown';
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return 'Not yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatFreshness(hours: number | null): string {
  if (hours === null) return 'No successful run yet';
  if (hours < 1) return 'Fresh in the last hour';
  if (hours < 24) return `${Math.round(hours)}h since last success`;
  return `${Math.round(hours / 24)}d since last success`;
}

function formatAggregateFreshness(hours: number | undefined): string {
  if (hours === undefined) return 'No aggregate yet';
  if (hours < 1) return 'Updated in the last hour';
  if (hours < 24) return `${Math.round(hours)}h old`;
  return `${Math.round(hours / 24)}d old`;
}

function formatPercent(value: number | null | undefined): string {
  if (typeof value !== 'number') return '--';
  return `${Math.round(value * 100)}%`;
}

function formatSalary(value: number | null): string {
  if (value === null) return 'Unknown';
  return new Intl.NumberFormat(undefined, {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

function formatMetricValue(value: number | null, unit: string): string {
  if (value === null) return '--';
  if (unit === 'rate' || unit === 'percent') return formatPercent(value);
  if (unit === 'score_delta') return `${value > 0 ? '+' : ''}${value.toFixed(1)} pts`;
  if (unit === 'score') return value.toFixed(1);
  return value.toLocaleString();
}

function statusClass(status: string): string {
  if (status === 'healthy' || status === 'succeeded') return 'bg-emerald-50 text-emerald-700 border-emerald-100';
  if (status === 'degraded' || status === 'partial' || status === 'running') return 'bg-amber-50 text-amber-700 border-amber-100';
  if (status === 'down' || status === 'failed' || status === 'cancelled') return 'bg-red-50 text-red-700 border-red-100';
  if (status === 'disabled') return 'bg-slate-100 text-slate-500 border-slate-200';
  return 'bg-sky-50 text-sky-700 border-sky-100';
}

function validationClass(status: string | null): string {
  if (status === 'passed') return 'bg-emerald-50 text-emerald-700 border-emerald-100';
  if (status === 'passed_with_warnings') return 'bg-amber-50 text-amber-700 border-amber-100';
  if (status === 'blocked') return 'bg-red-50 text-red-700 border-red-100';
  return 'bg-slate-100 text-slate-500 border-slate-200';
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
      <p className="mt-3 font-display text-[30px] text-slate-950" style={{ letterSpacing: '-0.04em', lineHeight: 1 }}>
        {value}
      </p>
      {detail ? <p className="mt-2 text-sm leading-relaxed text-slate-500">{detail}</p> : null}
    </SurfaceCard>
  );
}

function DraftRequirementList({
  title,
  items,
}: {
  title: string;
  items: MarketProfileRequirementDiffItem[];
}) {
  return (
    <div className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
      <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">{title}</p>
      <div className="mt-3 space-y-2">
        {items.length === 0 ? (
          <p className="text-sm text-slate-400">No changes in this group.</p>
        ) : items.slice(0, 4).map((item) => (
          <div key={`${title}-${item.label}`} className="rounded-2xl bg-white p-3 shadow-sm">
            <p className="text-sm font-bold text-slate-800">{item.label}</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">{item.changeSummary}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function DraftReviewCard({
  item,
  onPublish,
  onReject,
}: {
  item: OperatorMarketProfileDraftItem;
  onPublish: (profileVersionId: string, reason: string) => Promise<void>;
  onReject: (profileVersionId: string, reason: string) => Promise<void>;
}) {
  const [rejectReason, setRejectReason] = useState('');
  const [publishReason, setPublishReason] = useState('Reviewed validation, diff, and source coverage.');
  const [actionBusy, setActionBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const validation = item.draftVersion.validationResult;
  const diff = item.draftVersion.profileDiff;
  const findings = validation?.findings ?? [];
  const blockers = findings.filter((finding) => finding.severity === 'blocker');
  const warnings = findings.filter((finding) => finding.severity === 'warning');
  const canPublish = item.canPublish;
  const sourceRefs = item.draftVersion.sourceRefs;
  const handlePublish = async () => {
    setActionBusy(true);
    setActionMessage('');
    setActionError('');
    try {
      await onPublish(item.draftVersion.id, publishReason);
      setActionMessage('Draft published and previous published version archived.');
    } catch (err: any) {
      setActionError(err?.response?.data?.error ?? 'Could not publish this draft.');
    } finally {
      setActionBusy(false);
    }
  };
  const handleReject = async () => {
    setActionBusy(true);
    setActionMessage('');
    setActionError('');
    try {
      await onReject(item.draftVersion.id, rejectReason);
      setActionMessage('Draft rejected and audit trail updated.');
    } catch (err: any) {
      setActionError(err?.response?.data?.error ?? 'Could not reject this draft.');
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <SurfaceCard p={5}>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex flex-wrap gap-2">
            <span className={`rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.12em] ${validationClass(item.validationStatus)}`}>
              {item.validationStatus ? formatLabel(item.validationStatus) : 'Not validated'}
            </span>
            <span className={`rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.12em] ${
              item.materiality === 'high'
                ? 'border-red-100 bg-red-50 text-red-700'
                : item.materiality === 'medium'
                  ? 'border-amber-100 bg-amber-50 text-amber-700'
                  : item.materiality === 'low'
                    ? 'border-sky-100 bg-sky-50 text-sky-700'
                    : 'border-slate-200 bg-slate-100 text-slate-500'
            }`}>
              {item.materiality ? `${formatLabel(item.materiality)} materiality` : 'No diff yet'}
            </span>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-slate-500">
              Version {item.draftVersion.version}
            </span>
          </div>
          <h3 className="mt-4 text-2xl font-black tracking-[-0.05em] text-slate-950">{item.roleTitle}</h3>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-500">
            {item.draftVersion.changeSummary}
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-3 xl:min-w-[28rem]">
          <div className="rounded-3xl bg-slate-50 p-4 text-center">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Blockers</p>
            <p className="mt-2 text-2xl font-black text-slate-950">{item.blockerCount}</p>
          </div>
          <div className="rounded-3xl bg-slate-50 p-4 text-center">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Warnings</p>
            <p className="mt-2 text-2xl font-black text-slate-950">{item.warningCount}</p>
          </div>
          <div className="rounded-3xl bg-slate-50 p-4 text-center">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Sources</p>
            <p className="mt-2 text-2xl font-black text-slate-950">{item.sourceRefCount}</p>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4">
          <div className="rounded-3xl border border-slate-100 bg-white p-4">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Validation findings</p>
            <div className="mt-3 space-y-2">
              {findings.length === 0 ? (
                <p className="rounded-2xl bg-emerald-50 p-3 text-sm font-bold text-emerald-700">
                  No validation findings. This draft is ready for operator review.
                </p>
              ) : (
                [...blockers, ...warnings, ...findings.filter((finding) => finding.severity === 'info')].slice(0, 8).map((finding) => (
                  <div key={finding.id} className={`rounded-2xl p-3 text-sm leading-6 ${
                    finding.severity === 'blocker'
                      ? 'bg-red-50 text-red-700'
                      : finding.severity === 'warning'
                        ? 'bg-amber-50 text-amber-700'
                        : 'bg-sky-50 text-sky-700'
                  }`}>
                    <p className="font-black">{formatLabel(finding.code)} at {finding.path}</p>
                    <p className="mt-1 font-medium">{finding.message}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          {diff ? (
            <div className="grid gap-4 lg:grid-cols-3">
              <DraftRequirementList title="Added requirements" items={diff.requirements.added} />
              <DraftRequirementList title="Removed requirements" items={diff.requirements.removed} />
              <DraftRequirementList title="Changed requirements" items={diff.requirements.changed} />
            </div>
          ) : (
            <p className="rounded-3xl bg-slate-50 p-4 text-sm text-slate-500">
              No structured diff is attached to this draft yet.
            </p>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Current vs draft</p>
            <div className="mt-3 grid gap-3">
              <div className="rounded-2xl bg-white p-3">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Current published</p>
                <p className="mt-2 text-sm font-bold text-slate-700">
                  {item.currentPublishedVersion
                    ? `Version ${item.currentPublishedVersion.version}, published ${formatDateTime(item.currentPublishedVersion.publishedAt)}`
                    : 'No published live profile yet. Draft compares against curated baseline.'}
                </p>
              </div>
              <div className="rounded-2xl bg-white p-3">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Draft</p>
                <p className="mt-2 text-sm font-bold text-slate-700">
                  Version {item.draftVersion.version}, created {formatDateTime(item.draftVersion.createdAt)}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-100 bg-white p-4">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Source coverage</p>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-2xl bg-slate-50 p-3">
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Total</p>
                <p className="mt-2 text-lg font-black text-slate-950">{item.sourceRefCount}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-3">
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Missing</p>
                <p className="mt-2 text-lg font-black text-slate-950">{item.missingSourceRefCount}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-3">
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Stale</p>
                <p className="mt-2 text-lg font-black text-slate-950">{item.staleSourceRefCount}</p>
              </div>
            </div>
            <div className="mt-3 space-y-2">
              {sourceRefs.slice(0, 4).map((sourceRef) => (
                <div key={sourceRef.id} className="rounded-2xl bg-slate-50 p-3">
                  <p className="text-sm font-bold text-slate-800">{sourceRef.title}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-400">
                    {formatLabel(sourceRef.sourceType)} · {sourceRef.publisher ?? 'Unknown publisher'} · confidence {formatPercent(sourceRef.confidence)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-100 bg-slate-950 p-4 text-white">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-white/45">Review actions</p>
            <p className="mt-2 text-sm leading-6 text-white/70">
              Publish is available only when validation passes. Reject always requires a reason and writes an audit row.
            </p>
            <div className="mt-4 flex flex-col gap-3">
              <label>
                <span className="text-xs font-black uppercase tracking-[0.14em] text-white/45">Publish note</span>
                <textarea
                  value={publishReason}
                  onChange={(event) => setPublishReason(event.target.value)}
                  placeholder="Why this draft is safe to publish"
                  className="mt-2 min-h-20 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white outline-none placeholder:text-white/35"
                />
              </label>
              <button
                type="button"
                disabled={!canPublish || publishReason.trim().length < 4 || actionBusy}
                onClick={handlePublish}
                className="rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-black text-slate-950 transition-colors hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/50"
                title={canPublish ? 'Publish this reviewed market profile.' : 'Resolve validation blockers before publishing.'}
              >
                {actionBusy ? 'Working...' : canPublish ? 'Publish reviewed draft' : 'Publish blocked by validation'}
              </button>
              <label>
                <span className="text-xs font-black uppercase tracking-[0.14em] text-white/45">Reject reason</span>
                <textarea
                  value={rejectReason}
                  onChange={(event) => setRejectReason(event.target.value)}
                  placeholder="Required before rejecting a draft"
                  className="mt-2 min-h-24 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white outline-none placeholder:text-white/35"
                />
              </label>
              <button
                type="button"
                disabled={rejectReason.trim().length < 4 || actionBusy}
                onClick={handleReject}
                className="rounded-2xl bg-white/10 px-4 py-3 text-sm font-black text-white transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:text-white/50"
                title={rejectReason.trim() ? 'Reject this draft with an audit reason.' : 'A reason is required before rejecting a draft.'}
              >
                {actionBusy ? 'Working...' : 'Reject draft'}
              </button>
              {actionMessage ? (
                <p className="rounded-2xl bg-emerald-400/15 p-3 text-sm font-bold leading-6 text-emerald-100">{actionMessage}</p>
              ) : null}
              {actionError ? (
                <p className="rounded-2xl bg-red-400/15 p-3 text-sm font-bold leading-6 text-red-100">{actionError}</p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </SurfaceCard>
  );
}

function DraftReviewPanel({
  response,
  onPublish,
  onReject,
}: {
  response: OperatorMarketProfileDraftsResponse | null;
  onPublish: (profileVersionId: string, reason: string) => Promise<void>;
  onReject: (profileVersionId: string, reason: string) => Promise<void>;
}) {
  const drafts = response?.drafts ?? [];
  const blockedCount = drafts.filter((item) => item.blockerCount > 0).length;
  const publishableCount = drafts.filter((item) => item.canPublish).length;
  const highMaterialityCount = drafts.filter((item) => item.materiality === 'high').length;

  return (
    <SurfaceCard p={5}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Draft review queue</p>
          <h2 className="mt-3 text-3xl font-black tracking-[-0.05em] text-slate-950">
            Review generated market profiles before publishing
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-500">
            Inspect validation blockers, requirement diffs, and source coverage. This review surface uses profile-level summaries only and does not expose raw job payloads.
          </p>
        </div>
        <div className="grid min-w-72 grid-cols-3 gap-2 text-center">
          <div className="rounded-3xl bg-slate-50 p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Drafts</p>
            <p className="mt-2 text-2xl font-black text-slate-950">{drafts.length}</p>
          </div>
          <div className="rounded-3xl bg-slate-50 p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Publishable</p>
            <p className="mt-2 text-2xl font-black text-slate-950">{publishableCount}</p>
          </div>
          <div className="rounded-3xl bg-slate-50 p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">High impact</p>
            <p className="mt-2 text-2xl font-black text-slate-950">{highMaterialityCount}</p>
          </div>
        </div>
      </div>

      {blockedCount > 0 ? (
        <p className="mt-5 rounded-3xl bg-red-50 p-4 text-sm font-bold leading-6 text-red-700">
          {blockedCount} draft(s) have publish blockers. Fix validation findings before enabling publish.
        </p>
      ) : null}

      <div className="mt-5 grid gap-4">
        {drafts.length === 0 ? (
          <p className="rounded-3xl bg-slate-50 p-5 text-sm leading-7 text-slate-500">
            No profile drafts are waiting for review. Generate a draft from an aggregate first.
          </p>
        ) : drafts.map((item) => (
          <DraftReviewCard
            key={item.draftVersion.id}
            item={item}
            onPublish={onPublish}
            onReject={onReject}
          />
        ))}
      </div>
    </SurfaceCard>
  );
}

function ProfileRollbackCard({
  item,
  onRollback,
}: {
  item: OperatorMarketProfileVersionItem;
  onRollback: (profileVersionId: string, reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const version = item.profileVersion;
  const currentVersion = item.currentPublishedVersion;
  const canRollback = item.canRollback && reason.trim().length >= 4 && !busy;

  const handleRollback = async () => {
    setBusy(true);
    setMessage('');
    setError('');
    try {
      await onRollback(version.id, reason);
      setMessage('Rollback completed. Public market profile now points to this version.');
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Could not roll back to this version.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-3xl border border-slate-100 bg-white p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap gap-2">
            <span className={`rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.12em] ${statusClass(version.status)}`}>
              {item.isCurrentPublished ? 'Current live' : formatLabel(version.status)}
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-slate-500">
              Version {version.version}
            </span>
            <span className={`rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.12em] ${
              item.canRollback
                ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
                : 'border-slate-200 bg-slate-50 text-slate-500'
            }`}>
              {item.canRollback ? 'Rollback candidate' : 'Not rollbackable'}
            </span>
          </div>
          <h3 className="mt-4 text-xl font-black tracking-[-0.04em] text-slate-950">{item.roleTitle}</h3>
          <p className="mt-2 text-sm leading-7 text-slate-500">
            {version.changeSummary || 'No change summary is attached to this profile version.'}
          </p>
          <p className="mt-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
            Published {formatDateTime(version.publishedAt)} - confidence {formatPercent(version.validationResult?.confidence)}
          </p>
        </div>
        <div className="rounded-3xl bg-slate-50 p-4 lg:min-w-72">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Current published</p>
          <p className="mt-2 text-sm font-bold leading-6 text-slate-700">
            {currentVersion
              ? `Version ${currentVersion.version}, published ${formatDateTime(currentVersion.publishedAt)}`
              : 'No current published version found for this role.'}
          </p>
          {version.rollbackOfVersionId ? (
            <p className="mt-2 text-xs font-bold leading-5 text-slate-400">
              Last rollback replaced {version.rollbackOfVersionId}.
            </p>
          ) : null}
        </div>
      </div>

      {item.canRollback ? (
        <div className="mt-4 rounded-3xl border border-slate-100 bg-slate-950 p-4 text-white">
          <label>
            <span className="text-xs font-black uppercase tracking-[0.14em] text-white/45">Rollback reason</span>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Why this older profile should become the live version again"
              className="mt-2 min-h-20 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white outline-none placeholder:text-white/35"
            />
          </label>
          <button
            type="button"
            disabled={!canRollback}
            onClick={handleRollback}
            className="mt-3 rounded-2xl bg-amber-300 px-4 py-3 text-sm font-black text-slate-950 transition-colors hover:bg-amber-200 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/50"
          >
            {busy ? 'Rolling back...' : 'Roll back to this version'}
          </button>
          {message ? (
            <p className="mt-3 rounded-2xl bg-emerald-400/15 p-3 text-sm font-bold leading-6 text-emerald-100">{message}</p>
          ) : null}
          {error ? (
            <p className="mt-3 rounded-2xl bg-red-400/15 p-3 text-sm font-bold leading-6 text-red-100">{error}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ProfileRollbackPanel({
  response,
  onRollback,
}: {
  response: OperatorMarketProfileVersionsResponse | null;
  onRollback: (profileVersionId: string, reason: string) => Promise<void>;
}) {
  const versions = response?.versions ?? [];
  const currentCount = versions.filter((item) => item.isCurrentPublished).length;
  const rollbackCandidates = versions.filter((item) => item.canRollback);

  return (
    <SurfaceCard p={5}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Rollback control</p>
          <h2 className="mt-3 text-3xl font-black tracking-[-0.05em] text-slate-950">
            Restore a previous published profile
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-500">
            Use rollback when a newly published market profile should be replaced by a previously approved version. Rollback requires a reason and writes an audit row.
          </p>
        </div>
        <div className="grid min-w-72 grid-cols-3 gap-2 text-center">
          <div className="rounded-3xl bg-slate-50 p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Versions</p>
            <p className="mt-2 text-2xl font-black text-slate-950">{versions.length}</p>
          </div>
          <div className="rounded-3xl bg-slate-50 p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Current</p>
            <p className="mt-2 text-2xl font-black text-slate-950">{currentCount}</p>
          </div>
          <div className="rounded-3xl bg-slate-50 p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Rollback</p>
            <p className="mt-2 text-2xl font-black text-slate-950">{rollbackCandidates.length}</p>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-4">
        {versions.length === 0 ? (
          <p className="rounded-3xl bg-slate-50 p-5 text-sm leading-7 text-slate-500">
            No published or archived profile versions exist yet. Publish a reviewed draft first.
          </p>
        ) : versions.map((item) => (
          <ProfileRollbackCard
            key={item.profileVersion.id}
            item={item}
            onRollback={onRollback}
          />
        ))}
      </div>
    </SurfaceCard>
  );
}

function AggregateRoleCard({ item }: { item: OperatorMarketRoleAggregateItem }) {
  const aggregate = item.latestAggregate;
  const hasLowConfidence = aggregate ? aggregate.confidence < 0.7 : false;
  const isStale = aggregate ? aggregate.freshnessHours > 168 : false;
  const qualityLabel = !aggregate
    ? 'No aggregate'
    : hasLowConfidence || isStale
      ? 'Needs review'
      : 'Inspect';

  return (
    <SurfaceCard p={5}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap gap-2">
            <span className={`rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.12em] ${
              !aggregate
                ? 'border-slate-200 bg-slate-100 text-slate-500'
                : hasLowConfidence || isStale
                  ? 'border-amber-100 bg-amber-50 text-amber-700'
                  : 'border-emerald-100 bg-emerald-50 text-emerald-700'
            }`}>
              {qualityLabel}
            </span>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-slate-500">
              {formatLabel(item.category)}
            </span>
          </div>
          <h3 className="mt-4 text-2xl font-black tracking-[-0.05em] text-slate-950">{item.roleTitle}</h3>
          <p className="mt-2 text-sm leading-7 text-slate-500">
            {aggregate
              ? `Window ${new Date(aggregate.windowStart).toLocaleDateString()} to ${new Date(aggregate.windowEnd).toLocaleDateString()}.`
              : 'No source-backed aggregate has been generated for this role yet.'}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center lg:min-w-72">
          <div className="rounded-3xl bg-slate-50 px-3 py-4">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Samples</p>
            <p className="mt-2 text-lg font-black text-slate-950">{aggregate?.sampleSize ?? 0}</p>
          </div>
          <div className="rounded-3xl bg-slate-50 px-3 py-4">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Sources</p>
            <p className="mt-2 text-lg font-black text-slate-950">{aggregate?.sourceCount ?? 0}</p>
          </div>
          <div className="rounded-3xl bg-slate-50 px-3 py-4">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Confidence</p>
            <p className="mt-2 text-lg font-black text-slate-950">{formatPercent(aggregate?.confidence)}</p>
          </div>
        </div>
      </div>

      {aggregate ? (
        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          <div className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Top skills</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {aggregate.topSkills.length === 0 ? (
                <span className="text-sm text-slate-400">No skill signals yet.</span>
              ) : aggregate.topSkills.slice(0, 6).map((skill) => (
                <span key={`${skill.skillId ?? skill.label}-${skill.label}`} className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm">
                  {skill.label} · {skill.mentionCount}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Requirement signals</p>
            <div className="mt-3 space-y-2">
              {aggregate.requirements.length === 0 ? (
                <span className="text-sm text-slate-400">No requirement signals yet.</span>
              ) : aggregate.requirements.slice(0, 3).map((requirement) => (
                <div key={requirement.label} className="rounded-2xl bg-white p-3 shadow-sm">
                  <p className="text-sm font-bold text-slate-800">{requirement.label}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-400">
                    {formatLabel(requirement.priority)} · {formatLabel(requirement.category)} · {requirement.mentionCount} mentions
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-100 bg-white p-4">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Seniority and work policy</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                {aggregate.seniority.length === 0 ? (
                  <p className="text-sm text-slate-400">No seniority distribution yet.</p>
                ) : aggregate.seniority.map((item) => (
                  <div key={item.seniorityBand}>
                    <div className="flex justify-between text-xs font-bold text-slate-500">
                      <span>{formatLabel(item.seniorityBand)}</span>
                      <span>{formatPercent(item.share)}</span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-slate-100">
                      <div className="h-2 rounded-full bg-sky-500" style={{ width: formatPercent(item.share) }} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                {aggregate.remotePolicy.length === 0 ? (
                  <p className="text-sm text-slate-400">No work-policy distribution yet.</p>
                ) : aggregate.remotePolicy.map((item) => (
                  <div key={item.policy}>
                    <div className="flex justify-between text-xs font-bold text-slate-500">
                      <span>{formatLabel(item.policy)}</span>
                      <span>{formatPercent(item.share)}</span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-slate-100">
                      <div className="h-2 rounded-full bg-emerald-500" style={{ width: formatPercent(item.share) }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-100 bg-white p-4">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Salary and freshness</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl bg-slate-50 p-3">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Salary signal</p>
                <p className="mt-2 text-sm font-black text-slate-800">
                  {aggregate.salary[0]
                    ? `${formatSalary(aggregate.salary[0].salaryMin)} - ${formatSalary(aggregate.salary[0].salaryMax)}`
                    : 'No salary signal'}
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-3">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Freshness</p>
                <p className="mt-2 text-sm font-black text-slate-800">{formatAggregateFreshness(aggregate.freshnessHours)}</p>
              </div>
            </div>
            {aggregate.meta.warnings.length > 0 ? (
              <div className="mt-3 space-y-2">
                {aggregate.meta.warnings.map((warning) => (
                  <p key={`${warning.code}-${warning.message}`} className="rounded-2xl bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-700">
                    {warning.message}
                  </p>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </SurfaceCard>
  );
}

function AggregateInspectionPanel({
  response,
  region,
  onRegionChange,
}: {
  response: OperatorMarketAggregatesResponse | null;
  region: string;
  onRegionChange: (value: string) => void;
}) {
  const items = response?.aggregates ?? [];
  const withAggregates = items.filter((item) => item.latestAggregate).length;
  const lowConfidence = items.filter((item) => (item.latestAggregate?.confidence ?? 1) < 0.7).length;
  const stale = items.filter((item) => (item.latestAggregate?.freshnessHours ?? 0) > 168).length;

  return (
    <SurfaceCard p={5}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Aggregate inspection</p>
          <h2 className="mt-3 text-3xl font-black tracking-[-0.05em] text-slate-950">
            Latest role-level market signals
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-500">
            Review aggregate quality before profile synthesis. This view shows source-backed summaries only, not raw job payloads.
          </p>
        </div>
        <label className="min-w-64">
          <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Region filter</span>
          <input
            value={region}
            onChange={(event) => onRegionChange(event.target.value)}
            placeholder="Optional, for example India"
            className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-sky-300"
          />
        </label>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-4">
        <div className="rounded-3xl bg-slate-50 p-4">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Roles checked</p>
          <p className="mt-2 text-2xl font-black text-slate-950">{items.length}</p>
        </div>
        <div className="rounded-3xl bg-slate-50 p-4">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Aggregates ready</p>
          <p className="mt-2 text-2xl font-black text-slate-950">{withAggregates}</p>
        </div>
        <div className="rounded-3xl bg-slate-50 p-4">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Low confidence</p>
          <p className="mt-2 text-2xl font-black text-slate-950">{lowConfidence}</p>
        </div>
        <div className="rounded-3xl bg-slate-50 p-4">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Stale windows</p>
          <p className="mt-2 text-2xl font-black text-slate-950">{stale}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-4">
        {items.length === 0 ? (
          <p className="rounded-3xl bg-slate-50 p-5 text-sm leading-7 text-slate-500">
            No aggregate records are available yet. Run ingestion, normalize signals, then run aggregation.
          </p>
        ) : items.map((item) => (
          <AggregateRoleCard key={item.roleProfileId} item={item} />
        ))}
      </div>
    </SurfaceCard>
  );
}

function OutcomeCalibrationRoleCard({ item }: { item: OperatorOutcomeCalibrationRoleItem }) {
  const statusLabel = item.thresholdStatus === 'eligible_for_operator_review'
    ? 'Review eligible'
    : item.thresholdStatus === 'ready_for_internal_calibration'
      ? 'Internal ready'
      : item.thresholdStatus === 'below_threshold'
        ? 'Low sample'
        : 'No data';
  const statusTone = item.thresholdStatus === 'eligible_for_operator_review'
    ? 'border-sky-100 bg-sky-50 text-sky-700'
    : item.thresholdStatus === 'ready_for_internal_calibration'
      ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
      : item.thresholdStatus === 'below_threshold'
        ? 'border-amber-100 bg-amber-50 text-amber-700'
        : 'border-slate-200 bg-slate-100 text-slate-500';

  return (
    <SurfaceCard p={5}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap gap-2">
            <span className={`rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.12em] ${statusTone}`}>
              {statusLabel}
            </span>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-slate-500">
              {formatLabel(item.category)}
            </span>
          </div>
          <h3 className="mt-4 text-2xl font-black tracking-[-0.05em] text-slate-950">{item.roleTitle}</h3>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-500">
            {item.aggregate
              ? `Aggregated from ${item.aggregate.sourceEventCount} outcome events across ${item.aggregate.uniqueUserCount} users. No user-level rows or raw application details are exposed.`
              : 'No aggregate outcome data is available for this role in the selected window.'}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center lg:min-w-80">
          <div className="rounded-3xl bg-slate-50 px-3 py-4">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Users</p>
            <p className="mt-2 text-lg font-black text-slate-950">{item.aggregate?.uniqueUserCount ?? 0}</p>
          </div>
          <div className="rounded-3xl bg-slate-50 px-3 py-4">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Events</p>
            <p className="mt-2 text-lg font-black text-slate-950">{item.aggregate?.sourceEventCount ?? 0}</p>
          </div>
          <div className="rounded-3xl bg-slate-50 px-3 py-4">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Public</p>
            <p className="mt-2 text-lg font-black text-slate-950">Blocked</p>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-3 xl:grid-cols-3">
        {item.metrics.map((metric) => (
          <div key={`${item.roleProfileId}-${metric.metricKey}`} className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">{metric.label}</p>
                <p className="mt-2 text-2xl font-black text-slate-950">
                  {formatMetricValue(metric.value, metric.unit)}
                </p>
              </div>
              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${
                metric.thresholdMet
                  ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
                  : 'border-amber-100 bg-amber-50 text-amber-700'
              }`}>
                {metric.thresholdMet ? 'Usable' : 'Sample gated'}
              </span>
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-500">
              {metric.unavailableReason ?? metric.explanation}
            </p>
            {metric.influenceScopes.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {metric.influenceScopes.map((scope) => (
                  <span key={scope} className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500 shadow-sm">
                    {formatLabel(scope)}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {item.aggregate ? (
        <div className="mt-4 rounded-3xl border border-slate-100 bg-white p-4">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Source breakdown</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {item.aggregate.sourceBreakdown.map((source) => (
              <span key={`${item.roleProfileId}-${source.sourceType}`} className="rounded-full bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-600">
                {formatLabel(source.sourceType)} Â· {source.sourceEventCount}
              </span>
            ))}
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-500">
            {item.publicMarketProfileBlockedReason}
          </p>
        </div>
      ) : null}
    </SurfaceCard>
  );
}

function OutcomeCalibrationPanel({ response }: { response: OperatorOutcomeCalibrationResponse | null }) {
  const roles = response?.roles ?? [];
  const summary = response?.summary;

  return (
    <SurfaceCard p={5}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Outcome calibration</p>
          <h2 className="mt-3 text-3xl font-black tracking-[-0.05em] text-slate-950">
            Internal learning signals
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-500">
            These aggregates show whether product outcomes can calibrate private readiness scoring and proof ranking. They do not publish market claims or expose raw application details.
          </p>
        </div>
        <div className="rounded-3xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-500 lg:max-w-sm">
          <p className="font-bold text-slate-800">Public profile updates are blocked here.</p>
          <p className="mt-2 leading-6">
            Outcome-derived public claims require a separate operator review workflow and are not changed by this dashboard.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-5">
        <div className="rounded-3xl bg-slate-50 p-4">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Roles</p>
          <p className="mt-2 text-2xl font-black text-slate-950">{summary?.roleCount ?? 0}</p>
        </div>
        <div className="rounded-3xl bg-slate-50 p-4">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">With data</p>
          <p className="mt-2 text-2xl font-black text-slate-950">{summary?.rolesWithOutcomeData ?? 0}</p>
        </div>
        <div className="rounded-3xl bg-slate-50 p-4">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Internal ready</p>
          <p className="mt-2 text-2xl font-black text-slate-950">{summary?.rolesMeetingInternalThreshold ?? 0}</p>
        </div>
        <div className="rounded-3xl bg-slate-50 p-4">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Users</p>
          <p className="mt-2 text-2xl font-black text-slate-950">{summary?.totalUniqueUsers ?? 0}</p>
        </div>
        <div className="rounded-3xl bg-slate-50 p-4">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Events</p>
          <p className="mt-2 text-2xl font-black text-slate-950">{summary?.totalSourceEvents ?? 0}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-4">
        {roles.length === 0 ? (
          <p className="rounded-3xl bg-slate-50 p-5 text-sm leading-7 text-slate-500">
            No outcome calibration records are available yet. As users save roles, generate readiness reports, complete sprints, reassess, and submit feedback, aggregate-only signals will appear here.
          </p>
        ) : roles.map((item) => (
          <OutcomeCalibrationRoleCard key={item.roleProfileId} item={item} />
        ))}
      </div>
    </SurfaceCard>
  );
}

interface ManualIngestionInput {
  query: string;
  roleProfileId?: string | null;
  region?: string | null;
  country?: string | null;
  limit?: number;
  pageLimit?: number;
}

function SourceHealthCard({
  item,
  runs,
  onRunSample,
}: {
  item: OperatorMarketSourceHealthItem;
  runs: MarketIngestionRun[];
  onRunSample: (sourceId: string, input: ManualIngestionInput) => Promise<OperatorMarketIngestionTriggerResponse>;
}) {
  const latestFailure = runs.find((run) => run.status === 'failed' || run.status === 'cancelled') ?? null;
  const failureCount = runs.filter((run) => run.status === 'failed' || run.status === 'cancelled').length;
  const { source, health, latestRun } = item;
  const [query, setQuery] = useState('');
  const [roleProfileId, setRoleProfileId] = useState('');
  const [region, setRegion] = useState(source.region ?? '');
  const [country, setCountry] = useState('');
  const [limit, setLimit] = useState(5);
  const [pageLimit, setPageLimit] = useState(1);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState('');
  const [runError, setRunError] = useState('');
  const canRun = source.status === 'enabled' && query.trim().length >= 2 && !running;

  const handleRunSample = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setRunning(true);
    setMessage('');
    setRunError('');
    try {
      const response = await onRunSample(source.id, {
        query,
        roleProfileId: roleProfileId.trim() || null,
        region: region.trim() || null,
        country: country.trim() || null,
        limit,
        pageLimit,
      });
      const result = response.result;
      if (response.status === 'already_running') {
        setMessage('A run is already active for this source. Refreshing the run history.');
      } else if (result) {
        setMessage(
          `Run ${response.run.status}: ${result.documentsDiscovered} found, ${result.documentsCreated} new, ${result.documentsDeduped} deduped, ${result.documentsFailed} failed.`,
        );
      } else {
        setMessage(`Run ${response.run.status}.`);
      }
    } catch (err: any) {
      setRunError(err?.response?.data?.error ?? 'Could not start sample ingestion.');
    } finally {
      setRunning(false);
    }
  };

  return (
    <SurfaceCard p={5} className="overflow-hidden">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap gap-2">
            <span className={`rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.12em] ${statusClass(health.status)}`}>
              {formatLabel(health.status)}
            </span>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-slate-500">
              {formatLabel(source.type)}
            </span>
          </div>
          <h3 className="mt-4 text-2xl font-black tracking-[-0.05em] text-slate-950">{source.name}</h3>
          <p className="mt-2 text-sm leading-7 text-slate-500">
            {source.region ?? 'Global'} source. SLA: {source.freshnessSlaHours}h. Auth mode: {formatLabel(source.authMode)}.
          </p>
        </div>
        <div className="rounded-3xl bg-slate-950 px-5 py-4 text-white lg:min-w-44">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/45">Freshness</p>
          <p className="mt-2 text-sm font-bold leading-6 text-white/75">{formatFreshness(health.freshnessAgeHours)}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-3xl bg-slate-50 p-4">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Last success</p>
          <p className="mt-2 text-sm font-bold text-slate-700">{formatDateTime(health.lastSuccessfulRunAt)}</p>
        </div>
        <div className="rounded-3xl bg-slate-50 p-4">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Last failure</p>
          <p className="mt-2 text-sm font-bold text-slate-700">{formatDateTime(latestFailure?.completedAt ?? latestFailure?.startedAt)}</p>
        </div>
        <div className="rounded-3xl bg-slate-50 p-4">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Recent failures</p>
          <p className="mt-2 text-sm font-bold text-slate-700">{failureCount} in current window</p>
        </div>
        <div className="rounded-3xl bg-slate-50 p-4">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Latest run output</p>
          <p className="mt-2 text-sm font-bold text-slate-700">
            {health.documentsLastRun} docs / {health.signalsLastRun} signals
          </p>
        </div>
      </div>

      <form onSubmit={handleRunSample} className="mt-5 rounded-3xl border border-slate-100 bg-slate-50 p-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Manual sample ingestion</p>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Run a small, bounded source check before enabling scheduled ingestion.
            </p>
          </div>
          <button
            type="submit"
            disabled={!canRun}
            className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white transition-colors hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {running ? 'Running...' : 'Run sample'}
          </button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <label className="xl:col-span-2">
            <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Role query</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Senior backend engineer"
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-sky-300"
            />
          </label>
          <label>
            <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Region</span>
            <input
              value={region}
              onChange={(event) => setRegion(event.target.value)}
              placeholder="Bengaluru"
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-sky-300"
            />
          </label>
          <label>
            <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Country</span>
            <input
              value={country}
              onChange={(event) => setCountry(event.target.value.toLowerCase())}
              placeholder="in"
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-sky-300"
            />
          </label>
          <label>
            <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Limit</span>
            <select
              value={limit}
              onChange={(event) => setLimit(Number(event.target.value))}
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-sky-300"
            >
              {[3, 5, 10, 25].map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Pages</span>
            <select
              value={pageLimit}
              onChange={(event) => setPageLimit(Number(event.target.value))}
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-sky-300"
            >
              {[1, 2, 3].map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>
          <label className="md:col-span-2 xl:col-span-3">
            <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Role profile ID</span>
            <input
              value={roleProfileId}
              onChange={(event) => setRoleProfileId(event.target.value)}
              placeholder="Optional, for example role_ai_backend_engineer"
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-sky-300"
            />
          </label>
        </div>
        {source.status !== 'enabled' ? (
          <p className="mt-3 rounded-2xl bg-amber-50 p-3 text-sm font-bold leading-6 text-amber-700">
            Enable this source before running ingestion.
          </p>
        ) : null}
        {message ? (
          <p className="mt-3 rounded-2xl bg-emerald-50 p-3 text-sm font-bold leading-6 text-emerald-700">{message}</p>
        ) : null}
        {runError ? (
          <p className="mt-3 rounded-2xl bg-red-50 p-3 text-sm font-bold leading-6 text-red-700">{runError}</p>
        ) : null}
      </form>

      <div className="mt-5 rounded-3xl border border-slate-100 bg-white p-4">
        <div className="grid gap-3 text-sm md:grid-cols-4">
          <div>
            <p className="font-black text-slate-400">Latest run</p>
            <p className="mt-1 font-bold text-slate-700">{latestRun ? formatLabel(latestRun.status) : 'None yet'}</p>
          </div>
          <div>
            <p className="font-black text-slate-400">Started</p>
            <p className="mt-1 font-bold text-slate-700">{formatDateTime(latestRun?.startedAt)}</p>
          </div>
          <div>
            <p className="font-black text-slate-400">Discovered / created</p>
            <p className="mt-1 font-bold text-slate-700">
              {latestRun ? `${latestRun.documentsDiscovered} / ${latestRun.documentsCreated}` : '--'}
            </p>
          </div>
          <div>
            <p className="font-black text-slate-400">Deduped / failed</p>
            <p className="mt-1 font-bold text-slate-700">
              {latestRun ? `${latestRun.documentsDeduped} / ${latestRun.documentsFailed}` : '--'}
            </p>
          </div>
        </div>
        {health.errorSummary ? (
          <p className="mt-4 rounded-2xl bg-red-50 p-3 text-sm font-bold leading-6 text-red-700">
            {health.errorSummary}
          </p>
        ) : null}
      </div>
    </SurfaceCard>
  );
}

function RunsTable({ runs }: { runs: MarketIngestionRun[] }) {
  return (
    <SurfaceCard p={5}>
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Recent ingestion runs</p>
        <p className="text-sm text-slate-500">Run history excludes config snapshots and internal metadata.</p>
      </div>
      <div className="mt-5 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-slate-400">
            <tr>
              <th className="pb-2 font-medium">Source</th>
              <th className="pb-2 font-medium">Status</th>
              <th className="pb-2 font-medium">Started</th>
              <th className="pb-2 font-medium">Documents</th>
              <th className="pb-2 font-medium">Error</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {runs.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-5 text-sm text-slate-400">
                  No ingestion runs match this filter yet.
                </td>
              </tr>
            ) : (
              runs.map((run) => (
                <tr key={run.id}>
                  <td className="py-3 font-medium text-slate-700">{run.sourceId}</td>
                  <td className="py-3">
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-black uppercase tracking-[0.12em] ${statusClass(run.status)}`}>
                      {formatLabel(run.status)}
                    </span>
                  </td>
                  <td className="py-3 text-slate-600">{formatDateTime(run.startedAt)}</td>
                  <td className="py-3 text-slate-600">
                    {run.documentsDiscovered} found / {run.documentsCreated} new / {run.documentsFailed} failed
                  </td>
                  <td className="max-w-md py-3 text-slate-500">{run.errorSummary ?? '--'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </SurfaceCard>
  );
}

export default function OperatorMarketHealth() {
  const { user, loading: authLoading } = useAuth();
  const [sourcesResponse, setSourcesResponse] = useState<OperatorMarketSourcesResponse | null>(null);
  const [runsResponse, setRunsResponse] = useState<OperatorMarketIngestionRunsResponse | null>(null);
  const [aggregatesResponse, setAggregatesResponse] = useState<OperatorMarketAggregatesResponse | null>(null);
  const [outcomeCalibrationResponse, setOutcomeCalibrationResponse] = useState<OperatorOutcomeCalibrationResponse | null>(null);
  const [draftsResponse, setDraftsResponse] = useState<OperatorMarketProfileDraftsResponse | null>(null);
  const [versionsResponse, setVersionsResponse] = useState<OperatorMarketProfileVersionsResponse | null>(null);
  const [runStatus, setRunStatus] = useState<MarketIngestionRunStatus | 'all'>('all');
  const [aggregateRegion, setAggregateRegion] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (authLoading || !user?.isOperator) {
      if (!authLoading) setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    Promise.all([
      getOperatorMarketSources(),
      getOperatorMarketIngestionRuns({
        limit: 75,
        ...(runStatus === 'all' ? {} : { status: runStatus }),
      }),
      getOperatorMarketAggregates({
        limit: 50,
        region: aggregateRegion.trim() || null,
      }),
      getOperatorOutcomeCalibration({ limit: 50, windowDays: 90 }),
      getOperatorMarketProfileDrafts({ limit: 25 }),
      getOperatorMarketProfileVersions({ limit: 50 }),
    ])
      .then(([sources, runs, aggregates, outcomeCalibration, drafts, versions]) => {
        setSourcesResponse(sources);
        setRunsResponse(runs);
        setAggregatesResponse(aggregates);
        setOutcomeCalibrationResponse(outcomeCalibration);
        setDraftsResponse(drafts);
        setVersionsResponse(versions);
      })
      .catch((err: any) => {
        const message = err?.response?.data?.error ?? 'Could not load market source health right now.';
        setError(message);
      })
      .finally(() => setLoading(false));
  }, [aggregateRegion, authLoading, runStatus, user?.isOperator]);

  const runsBySource = useMemo(() => {
    const map = new Map<string, MarketIngestionRun[]>();
    (runsResponse?.runs ?? []).forEach((run) => {
      map.set(run.sourceId, [...(map.get(run.sourceId) ?? []), run]);
    });
    return map;
  }, [runsResponse]);

  const sources = sourcesResponse?.sources ?? [];
  const runs = runsResponse?.runs ?? [];
  const unhealthyCount = sources.filter((item) => item.health.status === 'degraded' || item.health.status === 'down').length;
  const latestFailureCount = runs.filter((run) => run.status === 'failed' || run.status === 'cancelled').length;
  const refreshOperatorData = async () => {
    const [sources, nextRuns, aggregates, outcomeCalibration, drafts, versions] = await Promise.all([
      getOperatorMarketSources(),
      getOperatorMarketIngestionRuns({
        limit: 75,
        ...(runStatus === 'all' ? {} : { status: runStatus }),
      }),
      getOperatorMarketAggregates({
        limit: 50,
        region: aggregateRegion.trim() || null,
      }),
      getOperatorOutcomeCalibration({ limit: 50, windowDays: 90 }),
      getOperatorMarketProfileDrafts({ limit: 25 }),
      getOperatorMarketProfileVersions({ limit: 50 }),
    ]);
    setSourcesResponse(sources);
    setRunsResponse(nextRuns);
    setAggregatesResponse(aggregates);
    setOutcomeCalibrationResponse(outcomeCalibration);
    setDraftsResponse(drafts);
    setVersionsResponse(versions);
  };
  const handleRunSample = async (sourceId: string, input: ManualIngestionInput) => {
    const response = await triggerOperatorMarketIngestion(sourceId, input);
    try {
      await refreshOperatorData();
    } catch {
      setError('Sample run finished, but the refreshed source health could not be loaded.');
    }
    return response;
  };
  const handlePublishDraft = async (profileVersionId: string, reason: string) => {
    await publishOperatorMarketProfileDraft(profileVersionId, { reason });
    await refreshOperatorData();
  };
  const handleRejectDraft = async (profileVersionId: string, reason: string) => {
    await rejectOperatorMarketProfileDraft(profileVersionId, { reason });
    await refreshOperatorData();
  };
  const handleRollbackProfileVersion = async (profileVersionId: string, reason: string) => {
    await rollbackOperatorMarketProfileVersion(profileVersionId, { reason });
    await refreshOperatorData();
  };

  if (!authLoading && !user?.isOperator) {
    return (
      <SurfaceCard p={{ base: 6, md: 8 }}>
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Operator access</p>
        <h1 className="mt-3 font-display text-4xl text-slate-950" style={{ letterSpacing: '-0.05em' }}>
          Market source health is restricted.
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-500">
          This workspace is for configured operators who monitor ingestion health, source freshness, and failed runs.
        </p>
        <Link to="/settings" className="mt-5 inline-flex rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white">
          Back to settings
        </Link>
      </SurfaceCard>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operator tools"
        title="Market intelligence operations"
        description="Monitor source health, inspect role-level aggregates, and catch low-confidence signals before profile drafts are generated."
        actions={(
          <div className="flex flex-wrap gap-2">
            {RUN_STATUS_FILTERS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setRunStatus(option.value)}
                className={`rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
                  runStatus === option.value
                    ? 'bg-slate-900 text-white'
                    : 'border border-slate-200 text-slate-600 hover:border-sky-300 hover:text-sky-700'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      />

      <SurfaceCard p={4}>
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <span className="text-sm text-slate-500">
            {sourcesResponse
              ? `Checked ${new Date(sourcesResponse.meta.generatedAt).toLocaleString()}`
              : 'Source health refreshes when this page loads or when you change the run filter.'}
          </span>
          <div className="flex gap-3 text-sm font-semibold">
            <Link to="/metrics" className="text-slate-700 hover:text-sky-700">Product metrics</Link>
            <Link to="/settings" className="text-slate-700 hover:text-sky-700">Settings</Link>
          </div>
        </div>
      </SurfaceCard>

      {loading ? (
        <SurfaceCard p={10}>
          <div className="text-center text-sm text-slate-400">Loading market source health...</div>
        </SurfaceCard>
      ) : null}

      {!loading && error ? (
        <SurfaceCard p={5} className="border-amber-200 bg-amber-50">
          <p className="text-sm font-bold text-amber-800">{error}</p>
          <p className="mt-2 text-sm leading-7 text-amber-700">
            If this environment has not enabled operator review yet, set `FEATURE_ROLE_MARKET_OPERATOR_REVIEW=true` and configure `OPERATOR_EMAILS`.
          </p>
        </SurfaceCard>
      ) : null}

      {!loading && !error && sources.length === 0 ? (
        <EmptyState
          title="No market sources configured yet"
          description="Live ingestion is not enabled for any source in this environment. Add source configuration first, then this page will show freshness, failures, and document counts."
          accent="neutral"
        />
      ) : null}

      {!loading && !error ? (
        <DraftReviewPanel
          response={draftsResponse}
          onPublish={handlePublishDraft}
          onReject={handleRejectDraft}
        />
      ) : null}

      {!loading && !error ? (
        <ProfileRollbackPanel
          response={versionsResponse}
          onRollback={handleRollbackProfileVersion}
        />
      ) : null}

      {!loading && !error ? (
        <OutcomeCalibrationPanel response={outcomeCalibrationResponse} />
      ) : null}

      {!loading && !error ? (
        <AggregateInspectionPanel
          response={aggregatesResponse}
          region={aggregateRegion}
          onRegionChange={setAggregateRegion}
        />
      ) : null}

      {!loading && !error && sources.length > 0 ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricStat label="Configured sources" value={sources.length} detail="Sources visible to operators" />
            <MetricStat label="Healthy sources" value={sources.filter((item) => item.health.status === 'healthy').length} />
            <MetricStat label="Need attention" value={unhealthyCount} detail="Degraded or down" />
            <MetricStat label="Recent failures" value={latestFailureCount} detail="In the selected run window" />
          </div>

          <div className="grid gap-4">
            {sources.map((item) => (
              <SourceHealthCard
                key={item.source.id}
                item={item}
                runs={runsBySource.get(item.source.id) ?? []}
                onRunSample={handleRunSample}
              />
            ))}
          </div>

          <RunsTable runs={runs} />
        </>
      ) : null}
    </div>
  );
}
