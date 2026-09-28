import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  buildTargetRolePlan,
  getGoalProgress,
  type GoalGapProgress,
  createTargetRoleUpgradePlan,
  decomposeTargetRoleUpgradePlan,
  generateTargetRoleProofRecommendations,
  generateTargetRoleReadiness,
  getLatestTargetRoleUpgradePlan,
  getTargetRoleMarketChange,
  getTargetRoleReadiness,
  getTargetRoleReadinessHistory,
  getTargetRoleDecompositionStatus,
  getTargetRoleEvidence,
  getTargetRoleProofEvidenceStatus,
  getTargetRoleApplications,
  getMarketRole,
  getTargetRole,
  importTargetRoleResumeEvidence,
  publishTargetRoleProofEvidence,
  reassessTargetRoleReadiness,
  retryTargetRoleUpgradePlanDecomposition,
  startTargetRoleUpgradeSprint,
  trackEvent,
  type CandidateEvidenceProfile,
  type GapToProofResponse,
  type ProofEvidenceStatusResponse,
  type ReassessmentResponse,
  type ResumeApplicationWorkspace,
  type RoleReadinessHistoryResponse,
  type RoleMarketProfile,
  type RoleReadinessReport,
  type TargetRole,
  type TargetRoleDecompositionStatusResponse,
  type TargetRoleMarketChangeResponse,
  type UpgradePlan,
} from '../api/client';
import RoleMarketPilotFeedback from '../components/RoleMarketPilotFeedback';
import DocumentDropzone from '../components/ui/DocumentDropzone';
import AppModal from '../components/ui/AppModal';
import SurfaceCard from '../components/ui/SurfaceCard';
import { readDocumentFile } from '../utils/documentText';

function formatLabel(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function scoreTone(score: number): string {
  if (score >= 82) return 'text-emerald-700 bg-emerald-50 border-emerald-200';
  if (score >= 68) return 'text-sky-700 bg-sky-50 border-sky-200';
  if (score >= 45) return 'text-amber-700 bg-amber-50 border-amber-200';
  return 'text-red-700 bg-red-50 border-red-200';
}

function deltaTone(delta: number): string {
  if (delta > 0) return 'text-emerald-700 bg-emerald-50 border-emerald-200';
  if (delta < 0) return 'text-red-700 bg-red-50 border-red-200';
  return 'text-slate-600 bg-slate-50 border-slate-200';
}

function formatDelta(delta: number | null): string {
  if (delta === null) return 'baseline';
  if (delta > 0) return `+${delta}`;
  return String(delta);
}

const VERDICT_LABEL: Record<string, string> = {
  apply_now: 'Ready to apply',
  apply_after_edits: 'Apply after a few edits',
  upgrade_first: 'Close gaps first',
};

function describeReadinessMarketSource(report: RoleReadinessReport): {
  label: string;
  detail: string;
  changeSummary: string | null;
} {
  const version = report.meta.profileVersion;
  const summary = report.meta.sourceSummary;
  const region = summary?.region ? `${summary.region} signals` : 'global signals';
  if (version) {
    return {
      label: `Reviewed market profile v${version.version}`,
      detail: [
        region,
        version.publishedAt ? `published ${formatDate(version.publishedAt)}` : null,
        summary?.sampleSize ? `${summary.sampleSize} job signals` : null,
      ].filter(Boolean).join(' - '),
      changeSummary: version.changeSummary ?? null,
    };
  }

  return {
    label:
      report.meta.sourceMode === 'curated'
        ? 'Curated market baseline'
        : `${formatLabel(report.meta.sourceMode)} market baseline`,
    detail:
      report.meta.warnings.find((warning) =>
        warning.code === 'region_unavailable' || warning.code === 'dependency_unavailable',
      )?.message ??
      `This report used the ${region} baseline available when it was generated.`,
    changeSummary: null,
  };
}

function coverageTone(status: string): string {
  if (status === 'covered') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (status === 'weak') return 'bg-amber-50 text-amber-700 border-amber-200';
  if (status === 'missing') return 'bg-red-50 text-red-700 border-red-200';
  return 'bg-slate-50 text-slate-600 border-slate-200';
}

function decompositionTone(status: string): string {
  if (status === 'completed') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (status === 'failed') return 'bg-red-50 text-red-700 border-red-200';
  if (status === 'in_progress') return 'bg-sky-50 text-sky-700 border-sky-200';
  if (status === 'not_started') return 'bg-slate-50 text-slate-500 border-slate-200';
  return 'bg-amber-50 text-amber-700 border-amber-200';
}

function pipelineLabel(status: string): string {
  if (status === 'idle') return 'Proof-task fallback';
  if (status === 'done') return 'Deeper graph ready';
  if (status === 'partial') return 'Partially decomposed';
  if (status === 'failed') return 'Fallback active';
  if (status === 'running') return 'Breaking down topics';
  return formatLabel(status);
}

type TargetRoleWorkspaceTab =
  | 'overview'
  | 'evidence'
  | 'readiness'
  | 'action_plan'
  | 'applications'
  | 'market_signals';

type RecommendedTargetRoleActionKey =
  | 'add_evidence'
  | 'generate_readiness'
  | 'generate_proof'
  | 'create_plan'
  | 'start_sprint'
  | 'continue_today'
  | 'compare_jd';

export type RoleSurface = 'all' | 'proof' | 'expectations' | 'applications';

const SURFACE_TABS: Record<RoleSurface, TargetRoleWorkspaceTab[]> = {
  all: ['overview', 'evidence', 'readiness', 'action_plan', 'applications', 'market_signals'],
  proof: ['evidence', 'readiness'],
  expectations: ['market_signals'],
  applications: ['applications'],
};

const targetRoleTabs: Array<{
  id: TargetRoleWorkspaceTab;
  label: string;
  description: string;
}> = [
  {
    id: 'overview',
    label: 'Overview',
    description: 'Status and next step',
  },
  {
    id: 'evidence',
    label: 'Proof',
    description: 'What shows you can do it',
  },
  {
    id: 'readiness',
    label: 'Readiness report',
    description: 'Score and what is missing',
  },
  {
    id: 'action_plan',
    label: 'Plan',
    description: 'Proof work and schedule',
  },
  {
    id: 'applications',
    label: 'Applications',
    description: 'Jobs you applied to',
  },
  {
    id: 'market_signals',
    label: 'The role',
    description: 'What employers expect',
  },
];

const ROLE_STATUS_LABEL: Record<string, string> = {
  saved: 'Saved',
  assessed: 'Readiness checked',
  upgrade_plan_created: 'Plan drafted',
  sprint_active: 'Plan running',
  paused: 'Paused',
  archived: 'Archived',
};

const targetRolePrimaryActionClass =
  'inline-flex items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-900/15 transition hover:-translate-y-0.5 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-60';

const targetRoleSecondaryActionClass =
  'inline-flex items-center justify-center rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:text-sky-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-100 disabled:cursor-not-allowed disabled:opacity-60';

const targetRoleInvertedActionClass =
  'inline-flex items-center justify-center rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-black/10 transition hover:-translate-y-0.5 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/30';

const targetRoleInlineActionClass =
  'mt-4 inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-700 transition hover:border-sky-300 hover:text-sky-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-100';

const targetRoleStepCardClass =
  'rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-left';

function targetRoleTabClass(active: boolean): string {
  return [
    'rounded-2xl border px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-100',
    active
      ? 'border-slate-950 bg-slate-950 text-white shadow-lg shadow-slate-900/15'
      : 'border-transparent bg-transparent text-slate-600 hover:border-slate-200 hover:bg-white hover:text-slate-950',
  ].join(' ');
}

function getRecommendedTargetRoleAction(args: {
  evidenceCount: number;
  readinessReport: RoleReadinessReport | null;
  proofResponse: GapToProofResponse | null;
  upgradePlan: UpgradePlan | null;
  targetRole: TargetRole;
}): {
  key: RecommendedTargetRoleActionKey;
  tab: TargetRoleWorkspaceTab;
  title: string;
  body: string;
  cta: string;
} {
  if (args.evidenceCount < 4) {
    return {
      key: 'add_evidence',
      tab: 'evidence',
      title: 'Add your resume or project notes first.',
      body: 'Readiness is only as good as the proof behind it. Paste a resume or a few project notes.',
      cta: 'Add proof',
    };
  }

  if (!args.readinessReport) {
    return {
      key: 'generate_readiness',
      tab: 'readiness',
      title: 'Check how ready you are.',
      body: 'See which of this role’s must-haves you already show, and which are weak or missing.',
      cta: 'Check readiness',
    };
  }

  if (!args.proofResponse && !args.upgradePlan) {
    return {
      key: 'generate_proof',
      tab: 'action_plan',
      title: args.readinessReport.recommendedNextStep,
      body: 'Turn the weakest requirements into small pieces of work that prove you can do them.',
      cta: 'Suggest proof work',
    };
  }

  if (args.proofResponse && !args.upgradePlan) {
    return {
      key: 'create_plan',
      tab: 'action_plan',
      title: 'Group the proof work into a plan.',
      body: 'A short plan with a weekly time budget makes the work easier to finish.',
      cta: 'Create plan',
    };
  }

  if (args.upgradePlan && !args.upgradePlan.linkedSprintId) {
    return {
      key: 'start_sprint',
      tab: 'action_plan',
      title: 'Start working on the plan.',
      body: 'Adds a deadline and weekly hours, and puts the first sessions on Today.',
      cta: 'Start the plan',
    };
  }

  if (args.upgradePlan?.linkedSprintId || args.targetRole.linkedSprintId) {
    return {
      key: 'continue_today',
      tab: 'action_plan',
      title: 'Keep going on Today.',
      body: 'Your plan for this role is running. Check readiness again after a few gaps close.',
      cta: 'Open Today',
    };
  }

  return {
    key: 'compare_jd',
    tab: 'applications',
    title: 'Check your resume against a real job post.',
    body: 'When you find a job you like, compare your resume with it and track the application here.',
    cta: 'Check a job post',
  };
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-slate-700">{label}</p>
        <p className="text-sm font-semibold text-slate-950">{value}</p>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-sky-500"
          style={{ width: `${Math.max(0, Math.min(value, 100))}%` }}
        />
      </div>
    </div>
  );
}

export default function TargetRoleWorkspace({
  roleId,
  surface = 'all',
}: {
  roleId?: string;
  surface?: RoleSurface;
} = {}) {
  const params = useParams();
  const id = roleId ?? params.id;
  const navigate = useNavigate();
  const visibleTabs = targetRoleTabs.filter((tab) => SURFACE_TABS[surface].includes(tab.id));
  const [activeTargetRoleTab, setActiveTargetRoleTab] = useState<TargetRoleWorkspaceTab>(visibleTabs[0]?.id ?? 'overview');
  const [targetRole, setTargetRole] = useState<TargetRole | null>(null);
  const [buildBusy, setBuildBusy] = useState(false);
  const [buildError, setBuildError] = useState('');
  const [planProgress, setPlanProgress] = useState<GoalGapProgress | null>(null);

  useEffect(() => {
    const goalId = targetRole?.linkedGoalId;
    if (!goalId) {
      setPlanProgress(null);
      return;
    }
    getGoalProgress(goalId).then(setPlanProgress).catch(() => setPlanProgress(null));
  }, [targetRole?.linkedGoalId]);

  const handleBuildPlan = async () => {
    if (!targetRole) return;
    setBuildBusy(true);
    setBuildError('');
    try {
      await buildTargetRolePlan(targetRole.id);
      navigate(`/path?role=${targetRole.id}`);
    } catch (err: any) {
      setBuildError(
        err?.response?.data?.error ?? 'Could not build the plan right now. Try the steps one by one below.',
      );
    } finally {
      setBuildBusy(false);
    }
  };
  const [roleProfile, setRoleProfile] = useState<RoleMarketProfile | null>(null);
  const [evidenceProfile, setEvidenceProfile] = useState<CandidateEvidenceProfile | null>(null);
  const [evidenceImportText, setEvidenceImportText] = useState('');
  const [evidenceFileName, setEvidenceFileName] = useState<string | null>(null);
  const [evidenceImportBusy, setEvidenceImportBusy] = useState(false);
  const [evidenceImportError, setEvidenceImportError] = useState('');
  const [evidenceImportMessage, setEvidenceImportMessage] = useState('');
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [readinessReport, setReadinessReport] = useState<RoleReadinessReport | null>(null);
  const [readinessBusy, setReadinessBusy] = useState(false);
  const [readinessError, setReadinessError] = useState('');
  const [readinessQuota, setReadinessQuota] = useState('');
  const [readinessHistory, setReadinessHistory] = useState<RoleReadinessHistoryResponse | null>(null);
  const [reassessment, setReassessment] = useState<ReassessmentResponse | null>(null);
  const [reassessmentBusy, setReassessmentBusy] = useState(false);
  const [reassessmentError, setReassessmentError] = useState('');
  const [reassessmentQuota, setReassessmentQuota] = useState('');
  const [proofResponse, setProofResponse] = useState<GapToProofResponse | null>(null);
  const [proofBusy, setProofBusy] = useState(false);
  const [proofError, setProofError] = useState('');
  const [upgradePlan, setUpgradePlan] = useState<UpgradePlan | null>(null);
  const [planBusy, setPlanBusy] = useState(false);
  const [planError, setPlanError] = useState('');
  const [sprintBusy, setSprintBusy] = useState(false);
  const [sprintError, setSprintError] = useState('');
  const [sprintSuccess, setSprintSuccess] = useState('');
  const [decompositionStatus, setDecompositionStatus] = useState<TargetRoleDecompositionStatusResponse | null>(null);
  const [marketChange, setMarketChange] = useState<TargetRoleMarketChangeResponse | null>(null);
  const [decompositionBusy, setDecompositionBusy] = useState(false);
  const [decompositionError, setDecompositionError] = useState('');
  const [proofEvidenceStatus, setProofEvidenceStatus] = useState<ProofEvidenceStatusResponse | null>(null);
  const [linkedApplications, setLinkedApplications] = useState<ResumeApplicationWorkspace[]>([]);
  const [proofEvidenceBusy, setProofEvidenceBusy] = useState(false);
  const [proofEvidenceError, setProofEvidenceError] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const readinessMarketSource = readinessReport
    ? describeReadinessMarketSource(readinessReport)
    : null;
  const materialMarketChange =
    marketChange?.summary.status === 'material_change'
      ? marketChange.summary
      : null;

  const trackMarketUpgradeClick = (ctaLocation: string, upgradePlanKey?: string) => {
    void trackEvent({
      eventKey: 'market_upgrade_clicked',
      properties: {
        source: 'target_role_workspace',
        ctaLocation,
        upgradePlan: upgradePlanKey ?? null,
        targetRoleId: targetRole?.id ?? null,
        roleProfileId: targetRole?.roleProfileId ?? null,
      },
    }).catch(() => {});
  };

  const scrollToEvidenceIntake = () => {
    setEvidenceOpen(true);
  };

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    getTargetRole(id)
      .then(async (role) => {
        const [profile, evidence, readiness, history, marketChangeSummary, latestPlan, proofEvidence, applications] = await Promise.all([
          getMarketRole(role.roleProfileId, { region: role.candidateInput?.region ?? undefined }),
          getTargetRoleEvidence(role.id).catch(() => null),
          getTargetRoleReadiness(role.id).catch(() => null),
          getTargetRoleReadinessHistory(role.id).catch(() => null),
          getTargetRoleMarketChange(role.id).catch(() => null),
          getLatestTargetRoleUpgradePlan(role.id).catch(() => null),
          getTargetRoleProofEvidenceStatus(role.id).catch(() => null),
          getTargetRoleApplications(role.id).catch(() => []),
        ]);
        const plan = latestPlan?.upgradePlan ?? null;
        const decomposition = plan
          ? await getTargetRoleDecompositionStatus(role.id, plan.id).catch(() => null)
          : null;
        if (!cancelled) {
          setTargetRole(role);
          setRoleProfile(profile);
          setEvidenceProfile(evidence);
          setReadinessReport(readiness?.report ?? null);
          setReadinessHistory(history);
          setMarketChange(marketChangeSummary);
          setUpgradePlan(plan);
          setDecompositionStatus(decomposition);
          setProofEvidenceStatus(proofEvidence);
          setLinkedApplications(applications);
          setError('');
        }
      })
      .catch((err: any) => {
        if (!cancelled) {
          const status = err?.response?.status;
          setError(
            status === 404
              ? 'That Target Role could not be found or is not enabled in this environment.'
              : 'Could not load this Target Role workspace.',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!targetRole || !upgradePlan || decompositionStatus?.pipelineStatus !== 'running') {
      return;
    }
    const interval = window.setInterval(() => {
      getTargetRoleDecompositionStatus(targetRole.id, upgradePlan.id)
        .then((status) => {
          setDecompositionStatus(status);
        })
        .catch(() => {});
    }, 2500);
    return () => window.clearInterval(interval);
  }, [targetRole, upgradePlan, decompositionStatus?.pipelineStatus]);

  const handleGenerateReadiness = async () => {
    if (!targetRole) return;
    setReadinessBusy(true);
    setReadinessError('');
    setReadinessQuota('');
    setReassessment(null);
    setReassessmentError('');
    setReassessmentQuota('');
    try {
      const result = await generateTargetRoleReadiness(targetRole.id, {
        includeAiSummary: false,
      });
      setReadinessReport(result.report);
      setProofResponse(null);
      setProofError('');
      setUpgradePlan(null);
      setPlanError('');
      setProofEvidenceStatus(await getTargetRoleProofEvidenceStatus(targetRole.id).catch(() => null));
      setReadinessHistory(await getTargetRoleReadinessHistory(targetRole.id).catch(() => null));
      setMarketChange(await getTargetRoleMarketChange(targetRole.id).catch(() => null));
      setTargetRole((current) =>
        current
          ? {
              ...current,
              status: current.status === 'saved' ? 'assessed' : current.status,
              latestAssessmentId: result.report.id,
              updatedAt: result.report.generatedAt,
            }
          : current,
      );
      if (result.quota?.remaining !== null && result.quota?.remaining !== undefined) {
        setReadinessQuota(`${result.quota.remaining} readiness report${result.quota.remaining === 1 ? '' : 's'} left this month.`);
      }
    } catch (err: any) {
      const apiError = err?.response?.data?.error;
      const message =
        typeof apiError === 'string'
          ? apiError
          : apiError?.message ?? 'Could not generate readiness right now.';
      setReadinessError(message);
    } finally {
      setReadinessBusy(false);
    }
  };

  const handleReassessReadiness = async () => {
    if (!targetRole || !readinessReport) return;
    setReassessmentBusy(true);
    setReassessmentError('');
    setReassessmentQuota('');
    setReadinessError('');
    try {
      const result = await reassessTargetRoleReadiness(targetRole.id, {
        previousReadinessReportId: readinessReport.id,
        includeAiSummary: false,
      });
      setReassessment(result);
      setReadinessReport(result.report);
      setProofResponse(null);
      setProofError('');
      setUpgradePlan(null);
      setPlanError('');
      setDecompositionStatus(null);
      setProofEvidenceStatus(await getTargetRoleProofEvidenceStatus(targetRole.id).catch(() => null));
      setReadinessHistory(await getTargetRoleReadinessHistory(targetRole.id).catch(() => null));
      setMarketChange(await getTargetRoleMarketChange(targetRole.id).catch(() => null));
      setTargetRole((current) =>
        current
          ? {
              ...current,
              status: current.status === 'saved' ? 'assessed' : current.status,
              latestAssessmentId: result.report.id,
              updatedAt: result.report.generatedAt,
            }
          : current,
      );
      if (result.quota?.remaining !== null && result.quota?.remaining !== undefined) {
        setReassessmentQuota(`${result.quota.remaining} reassessment${result.quota.remaining === 1 ? '' : 's'} left this month.`);
      }
    } catch (err: any) {
      const status = err?.response?.status;
      const apiError = err?.response?.data?.error;
      const message =
        typeof apiError === 'string'
          ? apiError
          : apiError?.message ?? (
              status === 402
                ? 'Reassessment is limited on your current plan.'
                : 'Could not reassess readiness right now.'
            );
      setReassessmentError(message);
    } finally {
      setReassessmentBusy(false);
    }
  };

  const handleGenerateProof = async () => {
    if (!targetRole || !readinessReport) return;
    setProofBusy(true);
    setProofError('');
    try {
      const result = await generateTargetRoleProofRecommendations(targetRole.id, {
        readinessReportId: readinessReport.id,
        maxItems: 5,
      });
      setProofResponse(result);
    } catch (err: any) {
      const apiError = err?.response?.data?.error;
      const message =
        typeof apiError === 'string'
          ? apiError
          : apiError?.message ?? 'Could not generate proof recommendations right now.';
      setProofError(message);
    } finally {
      setProofBusy(false);
    }
  };

  const handleCreateUpgradePlan = async () => {
    if (!targetRole || !readinessReport) return;
    setPlanBusy(true);
    setPlanError('');
    try {
      const result = await createTargetRoleUpgradePlan(targetRole.id, {
        readinessReportId: readinessReport.id,
        durationWeeks: 4,
        weeklyCommitmentHours: 6,
      });
      setUpgradePlan(result.upgradePlan);
      setProofResponse({
        targetRoleId: result.upgradePlan.targetRoleId,
        readinessReportId: result.upgradePlan.readinessReportId,
        proofRecommendations: result.upgradePlan.proofTasks,
        meta: result.upgradePlan.meta,
      });
      setDecompositionStatus(await getTargetRoleDecompositionStatus(targetRole.id, result.upgradePlan.id).catch(() => null));
      setTargetRole((current) =>
        current
          ? {
              ...current,
              status:
                current.status === 'saved' || current.status === 'assessed'
                  ? 'upgrade_plan_created'
                  : current.status,
              updatedAt: result.upgradePlan.createdAt,
            }
          : current,
      );
    } catch (err: any) {
      const apiError = err?.response?.data?.error;
      const message =
        typeof apiError === 'string'
          ? apiError
          : apiError?.message ?? 'Could not draft the path right now.';
      setPlanError(message);
    } finally {
      setPlanBusy(false);
    }
  };

  const handleStartSprint = async () => {
    if (!targetRole || !upgradePlan) return;
    setSprintBusy(true);
    setSprintError('');
    setSprintSuccess('');
    try {
      const result = await startTargetRoleUpgradeSprint(targetRole.id, upgradePlan.id);
      setUpgradePlan((current) =>
        current
          ? {
              ...current,
              linkedGoalId: result.goalId,
              linkedSprintId: result.sprintId,
            }
          : current,
      );
      setTargetRole((current) =>
        current
          ? {
              ...current,
              linkedGoalId: result.goalId,
              linkedSprintId: result.sprintId,
              status: 'sprint_active',
            }
          : current,
      );
      setSprintSuccess('The path is ready. Proof tasks are available today, and you can add a deeper topic breakdown from this workspace.');
      setDecompositionStatus(await getTargetRoleDecompositionStatus(targetRole.id, upgradePlan.id).catch(() => null));
      setProofEvidenceStatus(await getTargetRoleProofEvidenceStatus(targetRole.id).catch(() => null));
    } catch (err: any) {
      const status = err?.response?.status;
      const apiError = err?.response?.data?.error;
      const message =
        typeof apiError === 'string'
          ? apiError
          : apiError?.message ?? (
              status === 402
                ? 'This schedule is part of the paid record.'
                : 'Could not start the path right now.'
            );
      setSprintError(message);
    } finally {
      setSprintBusy(false);
    }
  };

  const handleDecomposeUpgradePlan = async (retryMode = false) => {
    if (!targetRole || !upgradePlan) return;
    setDecompositionBusy(true);
    setDecompositionError('');
    try {
      const result = retryMode
        ? await retryTargetRoleUpgradePlanDecomposition(targetRole.id, upgradePlan.id)
        : await decomposeTargetRoleUpgradePlan(targetRole.id, upgradePlan.id);
      setDecompositionStatus(result);
      if (result.goalId) {
        setUpgradePlan((current) =>
          current
            ? {
                ...current,
                linkedGoalId: result.goalId,
              }
            : current,
        );
        setTargetRole((current) =>
          current
            ? {
                ...current,
                linkedGoalId: result.goalId,
              }
            : current,
        );
      }
    } catch (err: any) {
      const status = err?.response?.status;
      const apiError = err?.response?.data?.error;
      const message =
        typeof apiError === 'string'
          ? apiError
          : apiError?.message ?? (
              status === 402
                ? 'Deeper topic breakdowns are part of the paid record.'
                : 'Could not start topic breakdown right now.'
            );
      setDecompositionError(message);
    } finally {
      setDecompositionBusy(false);
    }
  };

  const handlePublishProofEvidence = async () => {
    if (!targetRole) return;
    setProofEvidenceBusy(true);
    setProofEvidenceError('');
    try {
      const result = await publishTargetRoleProofEvidence(targetRole.id);
      setProofEvidenceStatus(result);
      const evidence = await getTargetRoleEvidence(targetRole.id).catch(() => null);
      if (evidence) setEvidenceProfile(evidence);
    } catch (err: any) {
      const apiError = err?.response?.data?.error;
      const message =
        typeof apiError === 'string'
          ? apiError
          : apiError?.message ?? 'Could not add proof to Evidence Vault right now.';
      setProofEvidenceError(message);
    } finally {
      setProofEvidenceBusy(false);
    }
  };

  const importEvidenceText = async (
    rawText: string,
    source: 'upload' | 'manual' | 'linkedin_paste',
  ) => {
    if (!targetRole) return;
    const normalizedText = rawText.trim();
    if (normalizedText.length < 20) {
      setEvidenceImportError('Add at least one meaningful resume or profile bullet.');
      setEvidenceImportMessage('');
      return;
    }

    setEvidenceImportBusy(true);
    setEvidenceImportError('');
    setEvidenceImportMessage('');
    try {
      const result = await importTargetRoleResumeEvidence(targetRole.id, {
        rawText: normalizedText,
        source,
      });
      setEvidenceProfile(result.evidenceProfile);
      if (source !== 'upload') setEvidenceImportText('');
      setEvidenceImportMessage(
        result.importedClaimCount > 0
          ? `${result.importedClaimCount} role evidence signal${result.importedClaimCount === 1 ? '' : 's'} imported.`
          : 'Evidence imported. Readiness will use the updated profile on the next report.',
      );
      setProofEvidenceStatus(await getTargetRoleProofEvidenceStatus(targetRole.id).catch(() => null));
    } catch (err: any) {
      const apiError = err?.response?.data?.error;
      const message =
        typeof apiError === 'string'
          ? apiError
          : apiError?.message ?? 'Could not import evidence right now.';
      setEvidenceImportError(message);
    } finally {
      setEvidenceImportBusy(false);
    }
  };

  const handleEvidenceFile = async (file: File) => {
    setEvidenceImportError('');
    setEvidenceImportMessage('');
    setEvidenceFileName(file.name);
    setEvidenceImportBusy(true);
    try {
      const text = await readDocumentFile(file, 'profileEvidence');
      await importEvidenceText(text, 'upload');
    } catch (err: any) {
      setEvidenceImportError(err?.message ?? 'Could not read that evidence file.');
      setEvidenceImportBusy(false);
    }
  };

  const handleImportPastedEvidence = async () => {
    await importEvidenceText(evidenceImportText, 'manual');
  };

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="h-72 animate-pulse rounded-[36px] bg-white/70" />
        <div className="grid gap-5 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-64 animate-pulse rounded-[32px] bg-white/70" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !targetRole) {
    return (
      <SurfaceCard p={{ base: 6, md: 8 }}>
        <p className="text-sm font-semibold text-red-500">
          Workspace unavailable
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.06em] text-slate-950">
          We could not open this Target Role.
        </h1>
        <p className="mt-3 text-sm leading-7 text-slate-600">{error}</p>
        <Link to="/target-roles" className="mt-6 inline-flex rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white">
          Back to Target Roles
        </Link>
      </SurfaceCard>
    );
  }

  const recommendedAction = getRecommendedTargetRoleAction({
    evidenceCount: evidenceProfile?.claims.length ?? 0,
    readinessReport,
    proofResponse,
    upgradePlan,
    targetRole,
  });

  const handleRecommendedAction = () => {
    setActiveTargetRoleTab(recommendedAction.tab);

    if (recommendedAction.key === 'add_evidence') {
      window.setTimeout(scrollToEvidenceIntake, 50);
      return;
    }

    if (recommendedAction.key === 'generate_readiness') {
      void handleGenerateReadiness();
      return;
    }

    if (recommendedAction.key === 'generate_proof') {
      void handleGenerateProof();
      return;
    }

    if (recommendedAction.key === 'create_plan') {
      void handleCreateUpgradePlan();
      return;
    }

    if (recommendedAction.key === 'start_sprint') {
      void handleStartSprint();
      return;
    }

    if (recommendedAction.key === 'continue_today') {
      navigate('/today');
      return;
    }

    navigate(`/resume?targetRoleId=${targetRole.id}`);
  };

  return (
    <div className="space-y-6">
      {surface === 'all' ? (
      <>
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="max-w-3xl">
          <Link to={surface === 'all' ? '/directions' : '/path'} className="text-sm font-semibold text-slate-500 hover:text-sky-700">
            {surface === 'all' ? '← Directions' : '← Path'}
          </Link>
          <h1 className="mt-2 text-3xl font-bold tracking-[-0.03em] text-slate-950 md:text-4xl">
            {targetRole.title}
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {roleProfile?.shortDescription ?? 'The role you are preparing for.'}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="rounded-full bg-sky-50 px-2.5 py-1 font-semibold text-sky-800">
              {ROLE_STATUS_LABEL[targetRole.status] ?? formatLabel(targetRole.status)}
            </span>
            <span>Saved {formatDate(targetRole.createdAt)}</span>
            <span aria-hidden="true">·</span>
            <span>
              {evidenceProfile?.claims.length
                ? `${evidenceProfile.claims.length} proof points on file`
                : 'No proof on file yet'}
            </span>
          </div>
        </div>
      </div>

      <SurfaceCard p={{ base: 5, md: 6 }}>
        <div className="grid gap-6 md:grid-cols-[1fr_minmax(0,320px)] md:items-center">
          <div>
            <p className="text-sm font-semibold text-sky-700">Next step</p>
            <h2 className="mt-1 text-xl font-bold text-slate-900">{recommendedAction.title}</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">{recommendedAction.body}</p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              {!targetRole.linkedGoalId &&
              ['generate_readiness', 'generate_proof', 'create_plan', 'start_sprint'].includes(recommendedAction.key) ? (
                <>
                  <button
                    type="button"
                    onClick={handleBuildPlan}
                    disabled={buildBusy}
                    className="rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
                  >
                    {buildBusy ? 'Building your plan… (about a minute)' : 'Build my plan in one step'}
                  </button>
                  <button
                    type="button"
                    onClick={handleRecommendedAction}
                    disabled={readinessBusy || reassessmentBusy || proofBusy || planBusy || sprintBusy}
                    className="text-sm font-semibold text-slate-600 hover:text-sky-700 disabled:opacity-60"
                  >
                    or {recommendedAction.cta.toLowerCase()} first
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={handleRecommendedAction}
                  disabled={readinessBusy || reassessmentBusy || proofBusy || planBusy || sprintBusy}
                  className="rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
                >
                  {readinessBusy
                    ? 'Checking readiness…'
                    : proofBusy
                      ? 'Suggesting proof work…'
                      : planBusy
                        ? 'Creating plan…'
                        : sprintBusy
                          ? 'Starting…'
                          : recommendedAction.cta}
                </button>
              )}
            </div>
            {buildError && <p className="mt-2 text-sm text-red-600">{buildError}</p>}
            {(readinessError || reassessmentError) && (
              <p className="mt-2 text-sm text-red-600">
                {readinessError || reassessmentError}{' '}
                <Link
                  to="/pricing?source=career-market"
                  onClick={() => trackMarketUpgradeClick('readiness_error')}
                  className="underline"
                >
                  View plans
                </Link>
              </p>
            )}
            {(readinessQuota || reassessmentQuota) && (
              <p className="mt-2 text-xs text-slate-400">{readinessQuota || reassessmentQuota}</p>
            )}
          </div>

          {planProgress && targetRole.linkedGoalId ? (
            <Link
              to={`/path?goal=${targetRole.linkedGoalId}&role=${targetRole.id}`}
              className="block rounded-2xl border border-slate-200 p-4 transition-colors hover:border-sky-300"
            >
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">Readiness for this role</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {planProgress.counts.closed + planProgress.counts.proven} of {planProgress.gaps.length} gaps closed ·{' '}
                    {planProgress.counts.proven} proven
                  </p>
                </div>
                <p className="font-display text-3xl leading-none text-slate-900">{planProgress.readinessPct}%</p>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-sky-600" style={{ width: `${planProgress.readinessPct}%` }} />
              </div>
              <p className="mt-2 text-xs font-semibold text-sky-700">Open plan →</p>
            </Link>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
              Readiness shows up here once you have a plan for this role.
            </div>
          )}
        </div>
      </SurfaceCard>
      </>
      ) : null}

      {visibleTabs.length > 1 ? (
      <div
        data-testid="target-role-tablist"
        role="tablist"
        aria-label="Role sections"
        className="flex gap-1 overflow-x-auto border-b border-slate-200"
      >
        {visibleTabs.map((tab) => {
          const active = activeTargetRoleTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              title={tab.description}
              onClick={() => setActiveTargetRoleTab(tab.id)}
              className={`-mb-px shrink-0 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
                active ? 'border-sky-600 text-sky-700' : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      ) : null}

      {activeTargetRoleTab === 'overview' && (
        <section data-section="target-role-overview" className="grid gap-5 lg:grid-cols-3">
          <SurfaceCard p={5} className="bg-white/88 lg:col-span-3">
            <p className="text-sm font-semibold text-slate-400">
              How this page works
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-slate-950">
              Get ready for the role here. Track specific jobs under Applications.
            </h2>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              Add proof, check how ready you are, and close the gaps with a plan. When a real job post comes up, compare your resume with it under Applications.
            </p>
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <div className={targetRoleStepCardClass}>
                <span className="text-sm font-semibold text-sky-700">Step 1</span>
                <span className="mt-2 block text-sm font-semibold text-slate-950">Add evidence</span>
                <span className="mt-1 block text-sm leading-6 text-slate-600">Resume lines, projects, graded work.</span>
                <button
                  type="button"
                  onClick={() => setActiveTargetRoleTab('evidence')}
                  className={targetRoleInlineActionClass}
                >
                  Open proof
                </button>
              </div>
              <div className={targetRoleStepCardClass}>
                <span className="text-sm font-semibold text-emerald-700">Step 2</span>
                <span className="mt-2 block text-sm font-semibold text-slate-950">Check readiness</span>
                <span className="mt-1 block text-sm leading-6 text-slate-600">What you show, and what is missing.</span>
                <button
                  type="button"
                  onClick={() => setActiveTargetRoleTab('readiness')}
                  className={targetRoleInlineActionClass}
                >
                  Open readiness
                </button>
              </div>
              <div className={targetRoleStepCardClass}>
                <span className="text-sm font-semibold text-amber-700">Step 3</span>
                <span className="mt-2 block text-sm font-semibold text-slate-950">Close gaps</span>
                <span className="mt-1 block text-sm leading-6 text-slate-600">A plan with daily sessions.</span>
                <button
                  type="button"
                  onClick={() => setActiveTargetRoleTab('action_plan')}
                  className={targetRoleInlineActionClass}
                >
                  Open plan
                </button>
              </div>
            </div>
          </SurfaceCard>
        </section>
      )}

      {activeTargetRoleTab === 'evidence' && (
        <section data-section="target-role-evidence">
          <SurfaceCard p={{ base: 5, md: 6 }} className="relative overflow-hidden">
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-slate-400">
                Evidence Vault
              </p>
              {proofEvidenceStatus?.reassessRecommended && (
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  Reassess recommended
                </span>
              )}
            </div>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-slate-950">
              Turn completed proof work into readiness evidence.
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
              {proofEvidenceStatus?.message ?? 'Complete proof tasks in Today, then add them here so the next readiness report can judge your improved evidence.'}
            </p>
            {proofEvidenceStatus?.latestEvidenceAt && (
              <p className="mt-2 text-xs font-bold text-slate-400">
                Latest proof evidence: {formatDate(proofEvidenceStatus.latestEvidenceAt)}
              </p>
            )}
            {proofEvidenceError && (
              <p className="mt-3 rounded-2xl border border-red-100 bg-red-50 p-3 text-sm font-bold leading-6 text-red-700">
                {proofEvidenceError}
              </p>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[420px]">
            <div className="rounded-2xl bg-slate-950 p-4 text-white">
              <p className="text-sm font-semibold text-white/45">
                Evidence claims
              </p>
              <p className="mt-2 text-3xl font-semibold">{proofEvidenceStatus?.evidenceClaimCount ?? 0}</p>
            </div>
            <div className="rounded-2xl bg-sky-50 p-4">
              <p className="text-sm font-semibold text-sky-700">
                Ready to add
              </p>
              <p className="mt-2 text-3xl font-semibold text-slate-950">{proofEvidenceStatus?.publishableArtifactCount ?? 0}</p>
            </div>
            <div className="rounded-2xl bg-emerald-50 p-4">
              <p className="text-sm font-semibold text-emerald-700">
                Published
              </p>
              <p className="mt-2 text-3xl font-semibold text-slate-950">{proofEvidenceStatus?.publishedArtifactCount ?? 0}</p>
            </div>
          </div>
        </div>
        <div
          id="target-role-evidence-intake"
          className="relative mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4"
        >
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">Add a resume or project notes</p>
            <p className="mt-0.5 text-sm text-slate-500">Readiness judges real proof, not a role title. Upload a file or paste a few bullets.</p>
            {evidenceImportMessage && !evidenceOpen && (
              <p className="mt-1 text-sm font-semibold text-emerald-700">{evidenceImportMessage}</p>
            )}
          </div>
          <button type="button" onClick={() => setEvidenceOpen(true)} className={targetRolePrimaryActionClass}>
            Add evidence
          </button>
        </div>
        <AppModal
          isOpen={evidenceOpen}
          onClose={() => setEvidenceOpen(false)}
          title="Add evidence for this role"
          description="Upload a resume, profile export or project notes. We pull out skills and outcomes as proof. Comparing against a specific job post lives under Applications."
          size="xl"
          footer={(
            <>
              {readinessReport && evidenceImportMessage ? (
                <button
                  type="button"
                  onClick={async () => { await handleReassessReadiness(); setEvidenceOpen(false); }}
                  disabled={reassessmentBusy || evidenceImportBusy}
                  className={targetRoleSecondaryActionClass}
                >
                  {reassessmentBusy ? 'Rechecking…' : 'Recheck readiness now'}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setEvidenceOpen(false)}
                className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
              >
                {evidenceImportMessage ? 'Done' : 'Close'}
              </button>
            </>
          )}
        >
          <div className="space-y-1">
    <div>
      <DocumentDropzone
        label="Role evidence"
        filename={evidenceFileName}
        title="Upload resume or profile file"
        helperText="PDF, TXT, Markdown, and RTF files are supported. Scanned PDFs may need the paste fallback."
        minHeightClassName="min-h-[190px]"
        onFile={handleEvidenceFile}
      />
    </div>
    {evidenceImportBusy && (
      <p className="mt-3 rounded-2xl border border-sky-100 bg-sky-50 p-3 text-sm font-bold leading-6 text-sky-800">
        Reading and importing evidence...
      </p>
    )}
    <details className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
      <summary className="cursor-pointer text-sm font-semibold text-slate-700">
        Paste instead
      </summary>
      <p className="mt-3 text-sm leading-6 text-slate-500">
        Use this when the source is a LinkedIn section, portfolio note, or a PDF that cannot be read automatically.
      </p>
      <textarea
        value={evidenceImportText}
        onChange={(event) => {
          setEvidenceImportText(event.target.value);
          if (evidenceImportError) setEvidenceImportError('');
          if (evidenceImportMessage) setEvidenceImportMessage('');
        }}
        rows={6}
        placeholder="Example: Owned production Node.js services, optimized dashboard APIs by 35%, designed RBAC flows, deployed with Docker/Jenkins/AWS..."
        className="mt-4 w-full resize-y rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm leading-7 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
      />
      <button
        type="button"
        onClick={handleImportPastedEvidence}
        disabled={evidenceImportBusy}
        className={`mt-3 ${targetRolePrimaryActionClass}`}
      >
        {evidenceImportBusy ? 'Importing evidence...' : 'Import pasted evidence'}
      </button>
    </details>
    {evidenceImportError && (
      <p className="mt-3 rounded-2xl border border-red-100 bg-red-50 p-3 text-sm font-bold leading-6 text-red-700">
        {evidenceImportError}
      </p>
    )}
    {evidenceImportMessage && (
      <p className="mt-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-3 text-sm font-bold leading-6 text-emerald-800">
        {evidenceImportMessage}
      </p>
    )}
          </div>
        </AppModal>
        <div className="relative mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handlePublishProofEvidence}
            disabled={proofEvidenceBusy || proofEvidenceStatus?.publishableArtifactCount === 0}
            className={targetRolePrimaryActionClass}
          >
            {proofEvidenceBusy ? 'Adding proof...' : 'Add proof to Evidence Vault'}
          </button>
          {proofEvidenceStatus?.reassessRecommended && (
            <button
              type="button"
              onClick={handleReassessReadiness}
              disabled={reassessmentBusy || !readinessReport}
              className="inline-flex rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {reassessmentBusy ? 'Reassessing...' : 'Reassess with new proof'}
            </button>
          )}
          {proofEvidenceStatus?.linkedGoalId && (
            <Link
              to={`/path?goal=${proofEvidenceStatus.linkedGoalId}&role=${targetRole.id}`}
              className="inline-flex rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:-translate-y-0.5"
            >
              Review proof tasks
            </Link>
          )}
        </div>
          </SurfaceCard>
        </section>
      )}

      {activeTargetRoleTab === 'readiness' && (
        <div data-section="target-role-readiness" className="space-y-6">
      {readinessReport ? (
        <section className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
          <SurfaceCard p={{ base: 6, md: 7 }} className="relative overflow-hidden">
            <div className="relative">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-base font-semibold text-slate-900">Why your readiness is where it is</p>
                <span className={`rounded-full border px-3 py-1 text-sm font-semibold ${scoreTone(readinessReport.score.overall)}`}>
                  {VERDICT_LABEL[readinessReport.verdict] ?? formatLabel(readinessReport.verdict)}
                </span>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                {planProgress
                  ? <>Your plan readiness is <span className="font-semibold text-slate-800">{planProgress.readinessPct}%</span> and moves as gaps close. This report is the detailed read behind it.</>
                  : <>This report explains where you stand today. Build a plan to track one readiness number as you close gaps.</>}
              </p>
              <p className="mt-3 text-xs text-slate-400">
                Checked {formatDate(readinessReport.generatedAt)} · profile match {readinessReport.score.overall}/100 · confidence {readinessReport.confidence}/100
              </p>
              <p className="mt-5 text-sm leading-6 text-slate-700">
                {readinessReport.summary}
              </p>
              {readinessMarketSource && (
                <div className="mt-5 rounded-2xl border border-slate-200 bg-white/80 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-900">
                      Market source used
                    </p>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-500">
                      {formatLabel(readinessReport.meta.sourceMode)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-bold leading-6 text-slate-700">
                    {readinessMarketSource.label}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    {readinessMarketSource.detail}
                  </p>
                  {readinessMarketSource.changeSummary && (
                    <p className="mt-3 rounded-2xl bg-sky-50 p-3 text-sm leading-6 text-sky-800">
                      Recent market change: {readinessMarketSource.changeSummary}
                    </p>
                  )}
                </div>
              )}
              {readinessReport.meta.warnings.length > 0 && (
                <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <p className="text-sm font-semibold text-amber-800">Improve report accuracy</p>
                  <p className="mt-1 text-sm leading-6 text-amber-800/80">
                    {readinessReport.meta.warnings[0].message}
                  </p>
                </div>
              )}
              {materialMarketChange && (
                <div className="mt-5 rounded-2xl border border-sky-200 bg-sky-50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-sky-950">
                        Market requirements changed since your last report
                      </p>
                      <p className="mt-1 text-sm leading-6 text-sky-800/85">
                        {materialMarketChange.summary}
                      </p>
                    </div>
                    <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-sky-700">
                      {formatLabel(materialMarketChange.materiality)} change
                    </span>
                  </div>

                  <details className="mt-4 rounded-2xl border border-sky-100 bg-white/80 p-4">
                    <summary className="cursor-pointer text-sm font-semibold text-sky-950">
                      Inspect changed requirements
                    </summary>
                    <div className="mt-4 space-y-3">
                      {materialMarketChange.signals.changedRequirements.length > 0 ? (
                        materialMarketChange.signals.changedRequirements.slice(0, 6).map((item) => (
                          <div key={`${item.changeType}-${item.label}`} className="rounded-2xl border border-slate-100 bg-white p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                              <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-500">
                                {formatLabel(item.changeType)}
                              </span>
                            </div>
                            <p className="mt-2 text-sm leading-6 text-slate-600">{item.summary}</p>
                            <p className="mt-2 text-sm font-bold text-slate-400">
                              {item.beforePriority ? formatLabel(item.beforePriority) : 'New'} to {item.afterPriority ? formatLabel(item.afterPriority) : 'Removed'}
                            </p>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm leading-6 text-slate-600">
                          No requirement text changed, but trend confidence or source-backed profile confidence changed enough to refresh the report.
                        </p>
                      )}
                      {materialMarketChange.signals.highConfidenceTrendChanges.slice(0, 3).map((change) => (
                        <p key={change} className="rounded-2xl bg-sky-50 p-3 text-sm leading-6 text-sky-800">
                          {change}
                        </p>
                      ))}
                      {materialMarketChange.signals.confidenceDrop !== null && (
                        <p className="rounded-2xl bg-amber-50 p-3 text-sm leading-6 text-amber-800">
                          Market profile confidence dropped by {Math.abs(Math.round(materialMarketChange.signals.confidenceDrop * 100))} point(s).
                        </p>
                      )}
                    </div>
                  </details>

                  <button
                    type="button"
                    onClick={handleReassessReadiness}
                    disabled={reassessmentBusy || !readinessReport}
                    className="mt-4 inline-flex w-full items-center justify-center rounded-2xl bg-sky-950 px-4 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                  >
                    {reassessmentBusy ? 'Reassessing readiness...' : 'Reassess with latest market profile'}
                  </button>
                </div>
              )}
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={scrollToEvidenceIntake}
                  className={targetRoleSecondaryActionClass}
                >
                  Add role evidence
                </button>
                <button
                  type="button"
                  onClick={handleGenerateProof}
                  disabled={proofBusy}
                  className={targetRolePrimaryActionClass}
                >
                  {proofBusy ? 'Building proof tasks...' : 'Generate proof tasks'}
                </button>
              </div>
              {proofError && (
                <p className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-bold leading-6 text-red-700">
                  {proofError}
                </p>
              )}
            </div>
          </SurfaceCard>

          <SurfaceCard p={{ base: 6, md: 7 }}>
            <p className="text-base font-semibold text-slate-900">Where the profile match comes from</p>
            <div className="mt-5 space-y-4">
              <ScoreBar label="Skill coverage" value={readinessReport.score.skillCoverage} />
              <ScoreBar label="Proof coverage" value={readinessReport.score.proofCoverage} />
              <ScoreBar label="Seniority alignment" value={readinessReport.score.seniorityAlignment} />
              <ScoreBar label="Production readiness" value={readinessReport.score.productionReadiness} />
              <ScoreBar label="Interview readiness" value={readinessReport.score.interviewReadiness} />
              <ScoreBar label="AI leverage readiness" value={readinessReport.score.aiLeverageReadiness} />
            </div>
          </SurfaceCard>
        </section>
      ) : (
        <SurfaceCard p={{ base: 6, md: 8 }} className="relative overflow-hidden">
          <div className="relative grid gap-6 lg:grid-cols-[1fr_0.55fr] lg:items-center">
            <div>
              <p className="text-sm font-semibold text-slate-400">
                Readiness
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.06em] text-slate-950">
                Find out where you stand for this role.
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
                Daily Push will compare your evidence against each role requirement and show what is covered, weak, or missing. This is the bridge from "I like this role" to "here is exactly what I should improve."
              </p>
              {(evidenceProfile?.claims.length ?? 0) < 4 && (
                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <p className="text-sm font-semibold text-amber-800">Your evidence is still light.</p>
                  <p className="mt-1 text-sm leading-6 text-amber-800/80">
                    You can generate a report now, but adding role evidence first will make the diagnosis more useful.
                  </p>
                </div>
              )}
            </div>
            <div className="grid gap-3">
              <button
                type="button"
                onClick={handleGenerateReadiness}
                disabled={readinessBusy}
                className={targetRolePrimaryActionClass}
              >
                {readinessBusy ? 'Generating readiness...' : 'Generate readiness report'}
              </button>
              <button
                type="button"
                onClick={scrollToEvidenceIntake}
                className={targetRoleSecondaryActionClass}
              >
                Add role evidence
              </button>
            </div>
          </div>
        </SurfaceCard>
      )}

      {readinessReport && (
        <section className="grid gap-5 lg:grid-cols-[1fr_0.9fr]">
          <SurfaceCard p={{ base: 5, md: 6 }} className="relative overflow-hidden">
            <div className="relative">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-slate-400">
                    Reassessment
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-slate-950">
                    Prove that your work improved readiness.
                  </h2>
                  <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
                    After adding proof to the Evidence Vault, reassess to see the score delta, upgraded requirements, and whether you should apply now or keep upgrading.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleReassessReadiness}
                  disabled={reassessmentBusy}
                  className={targetRolePrimaryActionClass}
                >
                  {reassessmentBusy ? 'Reassessing...' : 'Run reassessment'}
                </button>
              </div>
              {reassessmentError && (
                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold leading-6 text-amber-800">
                  {reassessmentError}{' '}
                  <Link
                    to="/pricing?source=career-market-reassessment"
                    onClick={() => trackMarketUpgradeClick('reassessment_error')}
                    className="underline"
                  >
                    View plans
                  </Link>
                </div>
              )}
              {reassessmentQuota && (
                <p className="mt-3 text-xs font-bold text-slate-400">{reassessmentQuota}</p>
              )}
              {reassessment ? (
                <div className="mt-5 grid gap-4 xl:grid-cols-[0.45fr_0.55fr]">
                  <div className={`rounded-[28px] border p-5 ${deltaTone(reassessment.result.scoreDelta)}`}>
                    <p className="text-sm font-semibold opacity-70">
                      Score change
                    </p>
                    <p className="mt-2 text-5xl font-semibold tracking-tight">
                      {formatDelta(reassessment.result.scoreDelta)}
                    </p>
                    <p className="mt-3 text-sm font-bold leading-6">
                      {reassessment.result.summary}
                    </p>
                  </div>
                  <div className="grid gap-3">
                    <div className="rounded-2xl bg-emerald-50 p-4">
                      <p className="text-sm font-semibold text-emerald-700">
                        Improved
                      </p>
                      <div className="mt-3 space-y-2">
                        {(reassessment.result.improvedRequirements.length
                          ? reassessment.result.improvedRequirements
                          : ['No requirement moved yet. Add stronger proof and reassess again.']
                        ).slice(0, 3).map((item) => (
                          <p key={item} className="text-sm font-bold leading-6 text-slate-700">
                            {item}
                          </p>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-2xl bg-amber-50 p-4">
                      <p className="text-sm font-semibold text-amber-700">
                        Next actions
                      </p>
                      <div className="mt-3 space-y-2">
                        {reassessment.result.newRecommendedActions.slice(0, 3).map((item) => (
                          <p key={item} className="text-sm font-bold leading-6 text-slate-700">
                            {item}
                          </p>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-5 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm font-bold leading-7 text-slate-600">
                  Your first reassessment will appear here with before/after evidence movement.
                </div>
              )}
              {reassessment?.result.stillWeakRequirements.length ? (
                <div className="mt-4 rounded-2xl bg-red-50 p-4">
                  <p className="text-sm font-semibold text-red-600">
                    Still weak
                  </p>
                  <div className="mt-3 space-y-2">
                    {reassessment.result.stillWeakRequirements.slice(0, 4).map((item) => (
                      <p key={item} className="text-sm font-bold leading-6 text-slate-700">
                        {item}
                      </p>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </SurfaceCard>

          <SurfaceCard p={{ base: 5, md: 6 }}>
            <p className="text-sm font-semibold text-slate-400">
              Readiness history
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-slate-950">
              Your score over time
            </h2>
            <div className="mt-5 space-y-3">
              {(readinessHistory?.history ?? []).length > 0 ? (
                readinessHistory!.history.slice(0, 6).map((item) => (
                  <div key={item.readinessReportId} className="flex items-center justify-between gap-4 rounded-2xl border border-slate-100 bg-white/82 p-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">
                        {item.score}/100 - {formatLabel(item.label)}
                      </p>
                      <p className="mt-1 text-xs font-bold text-slate-400">
                        {formatDate(item.generatedAt)} · {VERDICT_LABEL[item.verdict] ?? formatLabel(item.verdict)}
                      </p>
                    </div>
                    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${item.scoreDeltaFromPrevious === null ? deltaTone(0) : deltaTone(item.scoreDeltaFromPrevious)}`}>
                      {formatDelta(item.scoreDeltaFromPrevious)}
                    </span>
                  </div>
                ))
              ) : (
                <p className="rounded-2xl bg-slate-50 p-4 text-sm font-bold leading-7 text-slate-500">
                  Generate readiness to start your history.
                </p>
              )}
            </div>
          </SurfaceCard>
        </section>
      )}
        </div>
      )}

      {activeTargetRoleTab === 'action_plan' && (
        <div data-section="target-role-action-plan" className="space-y-6">
      {!readinessReport && (
        <SurfaceCard p={{ base: 5, md: 6 }} className="relative overflow-hidden">
          <div className="relative grid gap-5 lg:grid-cols-[1fr_0.55fr] lg:items-center">
            <div>
              <p className="text-sm font-semibold text-slate-400">
                Action Plan
              </p>
              <h2 className="mt-2 text-3xl font-semibold tracking-[-0.06em] text-slate-950">
                Generate readiness before planning proof work.
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
                The action plan should be based on real gaps. Generate readiness first, then turn weak requirements into proof tasks and sprint work.
              </p>
            </div>
            <div className="grid gap-3">
              <button
                type="button"
                onClick={handleGenerateReadiness}
                disabled={readinessBusy}
                className={targetRolePrimaryActionClass}
              >
                {readinessBusy ? 'Generating readiness...' : 'Generate readiness report'}
              </button>
              <button
                type="button"
                onClick={scrollToEvidenceIntake}
                className={targetRoleSecondaryActionClass}
              >
                Add role evidence first
              </button>
            </div>
          </div>
        </SurfaceCard>
      )}

      {readinessReport && !proofResponse && !upgradePlan && (
        <SurfaceCard p={{ base: 5, md: 6 }} className="relative overflow-hidden">
          <div className="relative grid gap-5 lg:grid-cols-[1fr_0.55fr] lg:items-center">
            <div>
              <p className="text-sm font-semibold text-slate-400">
                Action Plan
              </p>
              <h2 className="mt-2 text-3xl font-semibold tracking-[-0.06em] text-slate-950">
                Plan the proof work.
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
                Start from the weakest role requirements and create visible artifacts that can improve interviews, portfolio proof, and resume positioning.
              </p>
              {readinessReport.criticalGaps.length > 0 && (
                <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold leading-7 text-amber-900">
                  First gap to close: {readinessReport.criticalGaps[0]}
                </p>
              )}
            </div>
            <div className="grid gap-3">
              <button
                type="button"
                onClick={handleGenerateProof}
                disabled={proofBusy}
                className={targetRolePrimaryActionClass}
              >
                {proofBusy ? 'Building proof tasks...' : 'Generate proof tasks'}
              </button>
              <button
                type="button"
                onClick={scrollToEvidenceIntake}
                className={targetRoleSecondaryActionClass}
              >
                Add more evidence
              </button>
            </div>
          </div>
          {proofError && (
            <p className="relative mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-bold leading-6 text-red-700">
              {proofError}
            </p>
          )}
        </SurfaceCard>
      )}

      {proofResponse && (
        <SurfaceCard p={{ base: 5, md: 6 }} className="relative overflow-hidden">
          <div className="relative">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-slate-400">
                  Proof plan
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-slate-950">
                  Concrete tasks to close the biggest gaps
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
                  These are not generic learning suggestions. Each task maps back to a weak or missing role requirement and gives you a visible artifact to add to your resume, portfolio, or interview stories.
                </p>
              </div>
              <button
                type="button"
                onClick={handleCreateUpgradePlan}
                disabled={planBusy}
                className={targetRolePrimaryActionClass}
              >
                {planBusy ? 'Creating path...' : 'Draft the path'}
              </button>
            </div>
            {planError && (
              <p className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-bold leading-6 text-red-700">
                {planError}
              </p>
            )}
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              {proofResponse.proofRecommendations.map((task) => (
                <div key={task.id} className="rounded-[28px] border border-slate-100 bg-white/82 p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
                        {formatLabel(task.type)}
                      </span>
                      <h3 className="mt-3 text-lg font-semibold tracking-[-0.03em] text-slate-950">
                        {task.title}
                      </h3>
                    </div>
                    <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                      {task.estimatedHours}h - {formatLabel(task.difficulty)}
                    </span>
                  </div>
                  <p className="mt-3 text-sm font-bold leading-7 text-slate-600">
                    {task.whyItMatters}
                  </p>
                  <div className="mt-4 rounded-2xl bg-slate-50 p-4">
                    <p className="text-sm font-semibold text-slate-400">
                      Expected output
                    </p>
                    <p className="mt-2 text-sm font-bold leading-7 text-slate-700">
                      {task.expectedOutput}
                    </p>
                  </div>
                  <div className="mt-4 space-y-2">
                    {task.acceptanceCriteria.slice(0, 3).map((criterion) => (
                      <p key={criterion} className="text-sm font-bold leading-6 text-slate-600">
                        {criterion}
                      </p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </SurfaceCard>
      )}

      {readinessReport && !upgradePlan && targetRole && (
        <RoleMarketPilotFeedback
          source="target_role_workspace"
          ctaLocation="readiness_report"
          roleProfileId={targetRole.roleProfileId}
          targetRoleId={targetRole.id}
        />
      )}

      {upgradePlan && (
        <SurfaceCard p={{ base: 5, md: 6 }} className="relative overflow-hidden">
          <div className="relative">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-slate-400">
                  Path
                </p>
                <h2 className="mt-2 text-3xl font-semibold tracking-[-0.06em] text-slate-950">
                  {upgradePlan.title}
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
                  A focused path for turning gaps into visible proof. Review it before you start.
                </p>
              </div>
              <div className="flex flex-col items-start gap-2 sm:items-end">
                <button
                  type="button"
                  onClick={handleStartSprint}
                  disabled={sprintBusy}
                  className={targetRolePrimaryActionClass}
                >
                  {sprintBusy ? 'Starting path...' : upgradePlan.linkedSprintId ? 'Continue path' : 'Start this path'}
                </button>
                {upgradePlan.linkedGoalId && (
                  <Link
                    to={`/path?goal=${upgradePlan.linkedGoalId}&role=${targetRole.id}`}
                    className="text-sm font-semibold text-slate-500 hover:text-sky-700"
                  >
                    Open path
                  </Link>
                )}
              </div>
            </div>
            {sprintError && (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold leading-6 text-amber-800">
                {sprintError}{' '}
                <Link
                  to="/pricing?source=career-market-sprint"
                  onClick={() => trackMarketUpgradeClick('sprint_error', 'sprint')}
                  className="underline"
                >
                  See plans
                </Link>
              </div>
            )}
            {sprintSuccess && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold leading-6 text-emerald-800">
                <span>{sprintSuccess}</span>
                <Link to="/today" className="rounded-full bg-white px-3 py-2 text-sm font-semibold text-emerald-700">
                  Go to Today
                </Link>
              </div>
            )}
            <div className="mt-5 grid gap-4 lg:grid-cols-3">
              <div className="rounded-2xl bg-slate-950 p-5 text-white">
                <p className="text-sm font-semibold text-white/45">
                  Duration
                </p>
                <p className="mt-2 text-3xl font-semibold">{upgradePlan.durationWeeks} weeks</p>
              </div>
              <div className="rounded-2xl bg-sky-50 p-5">
                <p className="text-sm font-semibold text-sky-700">
                  Weekly pace
                </p>
                <p className="mt-2 text-3xl font-semibold text-slate-950">
                  {upgradePlan.weeklyCommitmentHours}h
                </p>
              </div>
              <div className="rounded-2xl bg-emerald-50 p-5">
                <p className="text-sm font-semibold text-emerald-700">
                  Proof tasks
                </p>
                <p className="mt-2 text-3xl font-semibold text-slate-950">
                  {upgradePlan.proofTasks.length}
                </p>
              </div>
            </div>
            <div className="mt-5 rounded-[28px] border border-slate-100 bg-white/88 p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-slate-400">
                      Topic breakdown
                    </p>
                    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                      decompositionStatus
                        ? decompositionTone(decompositionStatus.pipelineStatus === 'done' ? 'completed' : decompositionStatus.pipelineStatus)
                        : decompositionTone('not_started')
                    }`}>
                      {pipelineLabel(decompositionStatus?.pipelineStatus ?? 'idle')}
                    </span>
                  </div>
                  <h3 className="mt-2 text-xl font-semibold tracking-[-0.04em] text-slate-950">
                    Keep fallback proof tasks, add deeper study nodes when needed.
                  </h3>
                  <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
                    {decompositionStatus?.message ?? 'Your proof tasks work immediately. Topic Engine can turn the plan into a richer concept graph without blocking the sprint.'}
                  </p>
                  {decompositionStatus && (
                    <p className="mt-2 text-xs font-bold text-slate-400">
                      Timeout {decompositionStatus.config.requestTimeoutMs}ms · {decompositionStatus.config.maxAttempts} attempt{decompositionStatus.config.maxAttempts === 1 ? '' : 's'} · {decompositionStatus.config.topicConcurrency} topic{decompositionStatus.config.topicConcurrency === 1 ? '' : 's'} at a time
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleDecomposeUpgradePlan(false)}
                    disabled={decompositionBusy || decompositionStatus?.pipelineStatus === 'running' || decompositionStatus?.canStart === false}
                    className={targetRolePrimaryActionClass}
                  >
                    {decompositionBusy && !decompositionStatus?.canRetry ? 'Starting...' : 'Build topic graph'}
                  </button>
                  {decompositionStatus?.canRetry && (
                    <button
                      type="button"
                      onClick={() => handleDecomposeUpgradePlan(true)}
                      disabled={decompositionBusy}
                      className={targetRoleSecondaryActionClass}
                    >
                      {decompositionBusy ? 'Retrying...' : 'Retry failed topics'}
                    </button>
                  )}
                  {decompositionStatus?.goalId && (
                    <Link
                      to={`/path?goal=${decompositionStatus.goalId}&role=${targetRole.id}`}
                      className={targetRoleSecondaryActionClass}
                    >
                      Open goal
                    </Link>
                  )}
                </div>
              </div>
              {decompositionError && (
                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold leading-6 text-amber-800">
                  {decompositionError}{' '}
                  <Link
                    to="/pricing?source=career-market-topic-breakdown"
                    onClick={() => trackMarketUpgradeClick('topic_breakdown_error', 'sprint')}
                    className="underline"
                  >
                    See plans
                  </Link>
                </div>
              )}
              {decompositionStatus && (
                <div className="mt-5 grid gap-3 md:grid-cols-3">
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-sm font-semibold text-slate-400">
                      Study nodes
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-slate-950">{decompositionStatus.nodesCreated}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-sm font-semibold text-slate-400">
                      Fallback tasks
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-slate-950">{decompositionStatus.fallbackTaskCount}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-sm font-semibold text-slate-400">
                      Topics ready
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-slate-950">
                      {decompositionStatus.topics.filter((topic) => topic.status === 'completed').length}/{decompositionStatus.topics.length}
                    </p>
                  </div>
                </div>
              )}
              {decompositionStatus?.topics.length ? (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {decompositionStatus.topics.map((topic) => (
                    <div key={`${topic.topicId ?? topic.title}-${topic.status}`} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="text-sm font-semibold leading-6 text-slate-800">{topic.title}</p>
                        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${decompositionTone(topic.status)}`}>
                          {topic.usingFallback ? 'fallback active' : formatLabel(topic.status)}
                        </span>
                      </div>
                      <p className="mt-2 text-xs font-bold text-slate-500">
                        {topic.nodesCreated} node{topic.nodesCreated === 1 ? '' : 's'} {topic.error ? `· ${topic.error}` : ''}
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="mt-5 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
              <div className="space-y-3">
                {upgradePlan.topics.map((topic) => (
                  <div key={`${topic.priority}-${topic.title}`} className="rounded-[28px] border border-slate-100 bg-white/85 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <h3 className="text-lg font-semibold tracking-[-0.03em] text-slate-950">
                        Focus {topic.priority}: {topic.title}
                      </h3>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
                        {topic.estimatedWeeks} week{topic.estimatedWeeks === 1 ? '' : 's'}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-bold leading-7 text-slate-600">
                      {topic.rationale}
                    </p>
                    <p className="mt-3 rounded-2xl bg-slate-50 p-3 text-sm font-bold leading-6 text-slate-700">
                      Outcome: {topic.targetOutcome}
                    </p>
                  </div>
                ))}
              </div>
              <div className="space-y-4">
                <div className="rounded-[28px] bg-emerald-50 p-5">
                  <p className="text-sm font-semibold text-emerald-700">
                    Success evidence
                  </p>
                  <div className="mt-3 space-y-2">
                    {upgradePlan.successEvidence.slice(0, 5).map((item) => (
                      <p key={item} className="text-sm font-bold leading-6 text-slate-700">
                        {item}
                      </p>
                    ))}
                  </div>
                </div>
                <div className="rounded-[28px] bg-amber-50 p-5">
                  <p className="text-sm font-semibold text-amber-700">
                    Scope to watch
                  </p>
                  <div className="mt-3 space-y-2">
                    {(upgradePlan.risks.length ? upgradePlan.risks : ['Keep the scope small enough to finish and document.']).slice(0, 5).map((item) => (
                      <p key={item} className="text-sm font-bold leading-6 text-slate-700">
                        {item}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </SurfaceCard>
      )}

      {upgradePlan && targetRole && (
        <RoleMarketPilotFeedback
          source="upgrade_plan"
          ctaLocation="upgrade_plan_card"
          roleProfileId={targetRole.roleProfileId}
          targetRoleId={targetRole.id}
        />
      )}
        </div>
      )}

      {activeTargetRoleTab === 'readiness' && readinessReport && (
        <section className="grid gap-5 lg:grid-cols-3">
          <SurfaceCard p={5}>
            <p className="text-sm font-semibold text-emerald-600">
              Strengths
            </p>
            <div className="mt-4 space-y-3">
              {(readinessReport.strengths.length ? readinessReport.strengths : ['No strong requirement coverage yet.']).map((item) => (
                <p key={item} className="rounded-2xl bg-emerald-50 p-3 text-sm font-bold leading-6 text-slate-700">
                  {item}
                </p>
              ))}
            </div>
          </SurfaceCard>
          <SurfaceCard p={5}>
            <p className="text-sm font-semibold text-red-500">
              Critical gaps
            </p>
            <div className="mt-4 space-y-3">
              {(readinessReport.criticalGaps.length ? readinessReport.criticalGaps : ['No critical gaps found in this report.']).slice(0, 4).map((item) => (
                <p key={item} className="rounded-2xl bg-red-50 p-3 text-sm font-bold leading-6 text-slate-700">
                  {item}
                </p>
              ))}
            </div>
          </SurfaceCard>
          <SurfaceCard p={5}>
            <p className="text-sm font-semibold text-amber-600">
              Interview risks
            </p>
            <div className="mt-4 space-y-3">
              {(readinessReport.interviewRisks.length ? readinessReport.interviewRisks : ['No major interview risks found yet.']).slice(0, 4).map((item) => (
                <p key={item} className="rounded-2xl bg-amber-50 p-3 text-sm font-bold leading-6 text-slate-700">
                  {item}
                </p>
              ))}
            </div>
          </SurfaceCard>
        </section>
      )}

      {activeTargetRoleTab === 'applications' && (
      <section data-section="target-role-applications" className="grid gap-5 lg:grid-cols-2">
        <SurfaceCard p={5} className="bg-white/88">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-400">
                Applications
              </p>
              <h3 className="mt-2 text-xl font-semibold tracking-[-0.04em] text-slate-950">
                Company-specific applications
              </h3>
              <p className="mt-3 text-sm leading-7 text-slate-600">
                Use this Target Role for broad preparation, then link each company/JD-specific resume analysis here.
              </p>
            </div>
            <Link
              to={`/resume?targetRoleId=${targetRole.id}`}
              className={targetRolePrimaryActionClass}
            >
              Compare a company JD
            </Link>
          </div>
          <div className="mt-5 space-y-3">
            {linkedApplications.length === 0 ? (
              <p className="rounded-2xl bg-slate-50 p-4 text-sm font-bold leading-7 text-slate-500">
                No linked applications yet. Start one when you have a specific company job description.
              </p>
            ) : linkedApplications.slice(0, 4).map((application) => (
              <Link
                key={application.id}
                to={`/resume/applications/${application.id}`}
                className="block rounded-2xl border border-slate-100 bg-slate-50 p-4 transition hover:border-sky-200 hover:bg-sky-50"
              >
                <p className="text-sm font-semibold text-slate-950">{application.title}</p>
                <p className="mt-1 text-xs font-bold text-slate-500">
                  {application.targetCompany ?? application.targetRole ?? 'Company application'} - {application.linkedSprintCreatedAt ? 'Path started' : application.linkedGoalId ? 'Path drafted' : 'Resume report saved'}
                </p>
              </Link>
            ))}
          </div>
        </SurfaceCard>
        <SurfaceCard p={5} className="bg-sky-50/78">
          <p className="text-sm font-semibold text-sky-700">
            What belongs here
          </p>
          <h3 className="mt-2 text-xl font-semibold tracking-[-0.04em] text-slate-950">
            One broad role, many company comparisons.
          </h3>
          <p className="mt-3 text-sm leading-7 text-slate-700">
            Use this tab only when there is a specific company job description. Broad role readiness and proof planning stay in the earlier tabs, so each application can focus on fit, resume language, and missing JD evidence.
          </p>
        </SurfaceCard>
      </section>
      )}

      {activeTargetRoleTab === 'readiness' && readinessReport && (
        <SurfaceCard p={{ base: 5, md: 6 }}>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-slate-400">
                Requirement coverage
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-slate-950">
                What is covered, weak, or missing
              </h2>
            </div>
            <button
              type="button"
              onClick={handleGenerateProof}
              disabled={proofBusy}
              className="inline-flex rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {proofBusy ? 'Building...' : 'Build proof plan'}
            </button>
          </div>
          <div className="mt-5 space-y-4">
            {readinessReport.coverage.map((item) => (
              <div key={item.requirementId} className="rounded-[28px] border border-slate-100 bg-slate-50/70 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-slate-950">
                      {item.requirementLabel}
                    </h3>
                    <p className="mt-1 text-sm font-semibold text-slate-400">
                      {formatLabel(item.priority)} · confidence {item.confidence}/100
                    </p>
                  </div>
                  <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${coverageTone(item.status)}`}>
                    {formatLabel(item.status)} · {item.score}
                  </span>
                </div>
                {item.evidenceSnippets.length > 0 ? (
                  <div className="mt-4 rounded-2xl bg-white p-4">
                    <p className="text-sm font-semibold text-slate-400">
                      Evidence
                    </p>
                    <p className="mt-2 text-sm font-bold leading-7 text-slate-700">
                      {item.evidenceSnippets[0]}
                    </p>
                  </div>
                ) : (
                  <p className="mt-4 rounded-2xl bg-white p-4 text-sm font-bold leading-7 text-slate-500">
                    No source-backed evidence found for this requirement yet.
                  </p>
                )}
                {item.gapReason && (
                  <p className="mt-3 text-sm font-bold leading-7 text-red-700">
                    {item.gapReason}
                  </p>
                )}
                <p className="mt-3 text-sm font-bold leading-7 text-slate-700">
                  Next action: {item.suggestedAction}
                </p>
              </div>
            ))}
          </div>
        </SurfaceCard>
      )}

      {activeTargetRoleTab === 'market_signals' && roleProfile && (
        <section data-section="target-role-market-signals" className="grid gap-5 lg:grid-cols-[1fr_0.9fr]">
          <SurfaceCard p={6}>
            <p className="text-sm font-semibold text-slate-400">
              Role requirements
            </p>
            <div className="mt-5 space-y-3">
              {roleProfile.requirements.map((requirement) => (
                <div key={requirement.id} className="rounded-2xl bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-base font-semibold text-slate-950">{requirement.label}</h3>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-500">
                      {formatLabel(requirement.priority)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-7 text-slate-600">{requirement.description}</p>
                </div>
              ))}
            </div>
          </SurfaceCard>

          <SurfaceCard p={6}>
            <p className="text-sm font-semibold text-slate-400">
              Evidence profile
            </p>
            <div className="mt-5 space-y-4">
              <div className="rounded-2xl bg-sky-50 p-4">
                <p className="text-sm font-semibold text-sky-700">
                  Current signal
                </p>
                <p className="mt-2 text-sm font-bold text-slate-700">
                  {evidenceProfile?.headline ?? targetRole.candidateInput?.currentRole ?? 'Not enough profile evidence yet'}
                </p>
                {typeof evidenceProfile?.yearsExperience === 'number' && (
                  <p className="mt-1 text-xs font-bold text-slate-500">
                    {evidenceProfile.yearsExperience}+ years experience
                  </p>
                )}
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-400">
                  Skills understood
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(evidenceProfile?.skills ?? targetRole.candidateInput?.skills ?? []).slice(0, 12).map((skill) => (
                    <span key={skill} className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-600">
                      {skill}
                    </span>
                  ))}
                  {(evidenceProfile?.skills ?? targetRole.candidateInput?.skills ?? []).length === 0 && (
                    <span className="text-sm font-bold text-slate-500">No skills saved yet</span>
                  )}
                </div>
              </div>
              <div className="rounded-2xl bg-emerald-50 p-4">
                <p className="text-sm font-semibold text-emerald-700">
                  Proof snippets
                </p>
                <div className="mt-3 space-y-3">
                  {(evidenceProfile?.claims ?? []).slice(0, 3).map((claim) => (
                    <div key={claim.id} className="rounded-2xl bg-white p-3">
                      <p className="text-sm font-bold leading-6 text-slate-700">
                        {claim.normalizedClaim}
                      </p>
                      <p className="mt-1 text-xs font-bold text-slate-400">
                        {claim.userVerified ? 'Verified' : 'Source-backed'} evidence
                      </p>
                    </div>
                  ))}
                  {(evidenceProfile?.claims ?? []).length === 0 && (
                    <p className="text-sm font-bold leading-6 text-slate-500">
                      Add role evidence above to generate evidence-backed readiness.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </SurfaceCard>
        </section>
      )}
    </div>
  );
}
