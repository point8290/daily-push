import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useToast } from '@chakra-ui/react';
import {
  createGoalFromResumeApplication,
  createSprintFromResumeApplication,
  generateResumeApplicationTailoredResume,
  getResumeApplication,
  type ResumeApplicationWorkspace,
  type TailoredResume,
} from '../api/client';
import PageHeader from '../components/ui/PageHeader';
import SurfaceCard from '../components/ui/SurfaceCard';
import { useEntitlements } from '../contexts/EntitlementsContext';
import { hasProResumeAccess, hasSprintAccess } from '../utils/planAccess';

type WorkspaceTab = 'report' | 'resume' | 'next' | 'documents';

const tabLabels: Record<WorkspaceTab, string> = {
  report: 'Full report',
  resume: 'Tailored resume',
  next: 'Next steps',
  documents: 'Documents',
};

function readinessTone(label?: string | null) {
  if (label === 'close') return 'bg-emerald-50 text-emerald-700';
  if (label === 'building') return 'bg-amber-50 text-amber-700';
  return 'bg-orange-50 text-orange-700';
}

function buildResumeDraftText(resume: TailoredResume): string {
  return [
    resume.headline,
    '',
    resume.professionalSummary,
    '',
    'Skills',
    resume.skills.join(', '),
    '',
    'Experience',
    ...resume.experienceBullets.map((item) => `- ${item}`),
    '',
    'Projects',
    ...resume.projectBullets.map((item) => `- ${item}`),
  ].join('\n');
}

export default function ResumeApplication() {
  const { applicationId } = useParams<{ applicationId: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const { currentPlan } = useEntitlements();
  const [application, setApplication] = useState<ResumeApplicationWorkspace | null>(null);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('report');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [upgradePlan, setUpgradePlan] = useState<string | null>(null);

  const statusItems = useMemo(() => {
    if (!application) return [];
    return [
      ['Target Role', !!application.targetRoleId],
      ['Full report', !!application.gapReport],
      ['Tailored resume', !!application.tailoredResume],
      ['Goal', !!application.linkedGoalId],
      ['Sprint', !!application.linkedSprintCreatedAt],
    ] as const;
  }, [application]);

  useEffect(() => {
    if (!applicationId) return;
    setLoading(true);
    setError('');
    getResumeApplication(applicationId)
      .then(setApplication)
      .catch(() => setError('Could not load this resume application.'))
      .finally(() => setLoading(false));
  }, [applicationId]);

  const handleGenerateTailoredResume = async () => {
    if (!application) return;
    setBusy('tailored-resume');
    setError('');
    setUpgradePlan(null);
    try {
      const result = await generateResumeApplicationTailoredResume(application.id);
      setApplication(result.application);
      setActiveTab('resume');
      toast({
        title: 'Tailored resume draft ready',
        status: 'success',
        duration: 2500,
        isClosable: true,
        position: 'top-right',
      });
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Could not generate the tailored resume.');
      setUpgradePlan(err?.response?.data?.upgradePlan ?? null);
    } finally {
      setBusy(null);
    }
  };

  const handleCreateGoal = async () => {
    if (!application) return;
    if (application.linkedGoalId) {
      navigate(`/goals/${application.linkedGoalId}?source=resume`);
      return;
    }
    setBusy('goal');
    setError('');
    setUpgradePlan(null);
    try {
      const { goalId } = await createGoalFromResumeApplication(application.id);
      toast.closeAll();
      navigate(`/goals/${goalId}?source=resume`);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Could not create a career goal from this report.');
      setUpgradePlan(err?.response?.data?.upgradePlan ?? null);
    } finally {
      setBusy(null);
    }
  };

  const handleCreateSprint = async () => {
    if (!application) return;
    if (application.linkedGoalId && application.linkedSprintCreatedAt) {
      navigate(`/goals/${application.linkedGoalId}?source=resume`);
      return;
    }
    setBusy('sprint');
    setError('');
    setUpgradePlan(null);
    try {
      const { goalId } = await createSprintFromResumeApplication(application.id);
      toast.closeAll();
      navigate(`/goals/${goalId}?source=resume`);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Could not create the sprint from this report.');
      setUpgradePlan(err?.response?.data?.upgradePlan ?? null);
    } finally {
      setBusy(null);
    }
  };

  const handleCopyResume = async () => {
    if (!application?.tailoredResume) return;
    try {
      await navigator.clipboard.writeText(buildResumeDraftText(application.tailoredResume));
      toast({
        title: 'Resume draft copied',
        status: 'success',
        duration: 2200,
        isClosable: true,
        position: 'top-right',
      });
    } catch {
      toast({
        title: 'Could not copy resume draft',
        description: 'Your browser blocked clipboard access. You can still select and copy the draft manually.',
        status: 'error',
        duration: 3200,
        isClosable: true,
        position: 'top-right',
      });
    }
  };

  if (loading) {
    return (
      <SurfaceCard p={6}>
        <p className="text-sm font-semibold text-slate-500">Loading resume application...</p>
      </SurfaceCard>
    );
  }

  if (!application) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Resume application"
          title="Application not found"
          description={error || 'This saved resume analysis is not available.'}
          actions={(
            <Link to="/resume" className="rounded-full bg-slate-950 px-4 py-2 text-sm font-black text-white">
              Back to resume
            </Link>
          )}
        />
      </div>
    );
  }

  const gapReport = application.gapReport;
  const tailoredResume = application.tailoredResume;
  const canGenerateTailoredResume = hasProResumeAccess(currentPlan?.planKey);
  const canCreateSprint = hasSprintAccess(currentPlan?.planKey);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Resume application"
        title={application.title}
        description="A saved workspace for one resume and one job description. Use it to review coverage, generate a tailored draft, and turn the gaps into a plan."
        actions={(
          <>
            <Link to="/resume" className="rounded-full border border-black/10 px-4 py-2 text-sm font-black text-slate-700 hover:border-sky-200 hover:text-sky-700">
              New fit check
            </Link>
            {application.linkedGoalId ? (
              <Link to={`/goals/${application.linkedGoalId}?source=resume`} className="rounded-full bg-slate-950 px-4 py-2 text-sm font-black text-white">
                Open goal
              </Link>
            ) : null}
            {application.targetRoleId ? (
              <Link to={`/target-roles/${application.targetRoleId}`} className="rounded-full border border-black/10 px-4 py-2 text-sm font-black text-slate-700 hover:border-sky-200 hover:text-sky-700">
                Open Target Role
              </Link>
            ) : null}
          </>
        )}
      />

      {error && (
        <SurfaceCard p={4} className="border-red-100 bg-red-50">
          <p className="text-sm font-semibold text-red-700">
            {error}
            {upgradePlan ? (
              <Link to="/pricing?source=resume" className="ml-2 text-red-900 underline">
                Upgrade to {upgradePlan}
              </Link>
            ) : null}
          </p>
        </SurfaceCard>
      )}

      {application.targetRoleId && (
        <SurfaceCard p={5} className="border-sky-100 bg-sky-50/80">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-700">
                Linked Target Role
              </p>
              <h2 className="mt-2 text-2xl font-black tracking-[-0.04em] text-slate-950">
                {application.targetRoleTitle ?? application.targetRole ?? 'Target Role'}
              </h2>
              <p className="mt-2 text-sm leading-7 text-slate-600">
                This workspace is for one company/job description. The linked Target Role tracks the broader role direction, proof work, and readiness over time.
              </p>
            </div>
            <Link
              to={`/target-roles/${application.targetRoleId}`}
              className="inline-flex rounded-full bg-white px-4 py-2 text-sm font-black text-sky-700 shadow-sm"
            >
              View role workspace
            </Link>
          </div>
        </SurfaceCard>
      )}

      <SurfaceCard p={5} className="bg-white/90">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {statusItems.map(([label, ready]) => (
              <span
                key={label}
                className={`rounded-full px-3 py-1 text-xs font-black ${ready ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}
              >
                {ready ? 'Ready' : 'Next'}: {label}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {canGenerateTailoredResume ? (
              <button
                type="button"
                onClick={handleGenerateTailoredResume}
                disabled={!!busy}
                className="rounded-full border border-slate-200 px-4 py-2 text-sm font-black text-slate-700 hover:border-sky-300 hover:text-sky-700 disabled:opacity-60"
              >
                {tailoredResume ? 'Regenerate resume' : 'Generate tailored resume'}
              </button>
            ) : (
              <Link
                to="/pricing?source=resume"
                className="rounded-full border border-slate-200 px-4 py-2 text-sm font-black text-slate-700 hover:border-sky-300 hover:text-sky-700"
              >
                Upgrade to Pro
              </Link>
            )}
            <button
              type="button"
              onClick={handleCreateGoal}
              disabled={!!busy}
              className="rounded-full bg-slate-950 px-4 py-2 text-sm font-black text-white disabled:opacity-60"
            >
              {application.linkedGoalId ? 'Open career goal' : 'Create career goal'}
            </button>
            {canCreateSprint || application.linkedSprintCreatedAt ? (
              <button
                type="button"
                onClick={handleCreateSprint}
                disabled={!!busy}
                className="rounded-full border border-slate-200 px-4 py-2 text-sm font-black text-slate-700 hover:border-sky-300 hover:text-sky-700 disabled:opacity-60"
              >
                {application.linkedSprintCreatedAt ? 'Open sprint plan' : 'Turn gaps into sprint'}
              </button>
            ) : (
              <Link
                to="/pricing?source=resume"
                className="rounded-full border border-slate-200 px-4 py-2 text-sm font-black text-slate-700 hover:border-sky-300 hover:text-sky-700"
              >
                Start Sprint plan
              </Link>
            )}
          </div>
        </div>
      </SurfaceCard>

      <SurfaceCard p={2} className="bg-white/80">
        <div className="grid gap-2 md:grid-cols-4">
          {(Object.keys(tabLabels) as WorkspaceTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`rounded-2xl px-4 py-3 text-sm font-black transition ${
                activeTab === tab ? 'bg-slate-950 text-white shadow-lg shadow-slate-900/10' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              {tabLabels[tab]}
            </button>
          ))}
        </div>
      </SurfaceCard>

      {activeTab === 'report' && gapReport && (
        <div className="space-y-6">
          <SurfaceCard p={{ base: 5, md: 6 }} className="bg-white/95">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                  Full resume report
                </p>
                <h2 className="mt-2 text-3xl font-black tracking-[-0.05em] text-slate-950">
                  {gapReport.targetRole ?? application.targetRole ?? 'Target role'} readiness
                </h2>
                <p className="mt-3 max-w-3xl text-sm leading-8 text-slate-600">
                  {gapReport.summary}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className={`rounded-full px-3 py-1 text-xs font-black uppercase ${readinessTone(gapReport.readinessLabel)}`}>
                  {gapReport.readinessLabel}
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
                  {gapReport.confidence}% confidence
                </span>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {gapReport.requirementCoverage.map((item) => (
                <div key={`${item.requirement}-${item.status}`} className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-black text-slate-900">{item.requirement}</p>
                    <span className="rounded-full bg-white px-2 py-1 text-[10px] font-black uppercase text-slate-500">
                      {item.status}
                    </span>
                  </div>
                  {item.resumeEvidence ? (
                    <p className="mt-3 text-xs leading-relaxed text-slate-500">
                      Evidence: {item.resumeEvidence}
                    </p>
                  ) : null}
                  <p className="mt-3 text-xs leading-relaxed text-slate-700">{item.action}</p>
                </div>
              ))}
            </div>
          </SurfaceCard>

          <div className="grid gap-6 lg:grid-cols-3">
            <SurfaceCard p={5} className="bg-white/90">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-600">Strengths</p>
              <div className="mt-4 space-y-2">
                {gapReport.strengths.map((item) => (
                  <p key={item} className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{item}</p>
                ))}
              </div>
            </SurfaceCard>
            <SurfaceCard p={5} className="bg-white/90">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-600">Gaps to close</p>
              <div className="mt-4 space-y-2">
                {gapReport.missingSkills.map((item) => (
                  <div key={item.name} className="rounded-2xl bg-orange-50 px-4 py-3">
                    <p className="text-sm font-black text-orange-900">{item.name}</p>
                    <p className="mt-1 text-xs leading-relaxed text-orange-800">{item.reason}</p>
                  </div>
                ))}
              </div>
            </SurfaceCard>
            <SurfaceCard p={5} className="bg-white/90">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Interview risks</p>
              <div className="mt-4 space-y-2">
                {gapReport.interviewRisks.map((item) => (
                  <p key={item} className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">{item}</p>
                ))}
              </div>
            </SurfaceCard>
          </div>
        </div>
      )}

      {activeTab === 'resume' && (
        <SurfaceCard p={{ base: 5, md: 6 }} className="bg-white/95">
          {tailoredResume ? (
            <div>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                    Tailored resume draft
                  </p>
                  <h2 className="mt-2 text-3xl font-black tracking-[-0.05em] text-slate-950">
                    {tailoredResume.headline}
                  </h2>
                  <p className="mt-3 max-w-3xl text-sm leading-8 text-slate-600">
                    {tailoredResume.professionalSummary}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCopyResume}
                  className="rounded-full bg-slate-950 px-4 py-2 text-sm font-black text-white"
                >
                  Copy resume draft
                </button>
              </div>

              <div className="mt-6 grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
                <div className="space-y-5">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-700">ATS keywords</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {tailoredResume.atsKeywords.map((keyword) => (
                        <span key={keyword} className="rounded-full bg-sky-50 px-3 py-1 text-xs font-bold text-sky-700">{keyword}</span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Do not fake these</p>
                    <div className="mt-3 space-y-2">
                      {tailoredResume.missingEvidenceWarnings.map((warning) => (
                        <p key={warning} className="rounded-2xl bg-orange-50 px-4 py-3 text-sm font-semibold text-orange-800">{warning}</p>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Experience bullets</p>
                    <div className="mt-3 space-y-2">
                      {tailoredResume.experienceBullets.map((bullet) => (
                        <p key={bullet} className="rounded-2xl bg-slate-50 px-4 py-3 text-sm leading-7 text-slate-700">- {bullet}</p>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Project bullets</p>
                    <div className="mt-3 space-y-2">
                      {tailoredResume.projectBullets.map((bullet) => (
                        <p key={bullet} className="rounded-2xl bg-slate-50 px-4 py-3 text-sm leading-7 text-slate-700">- {bullet}</p>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                Tailored resume
              </p>
              <h2 className="mt-2 text-3xl font-black tracking-[-0.05em] text-slate-950">
                Generate a resume draft for this job.
              </h2>
              <p className="mx-auto mt-3 max-w-2xl text-sm leading-8 text-slate-600">
                The draft will use the saved report and stay grounded in evidence from your original resume.
              </p>
              {canGenerateTailoredResume ? (
                <button
                  type="button"
                  onClick={handleGenerateTailoredResume}
                  disabled={!!busy}
                  className="mt-5 rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-xl shadow-slate-900/15 disabled:opacity-60"
                >
                  Generate tailored resume
                </button>
              ) : (
                <Link
                  to="/pricing?source=resume"
                  className="mt-5 inline-flex rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-xl shadow-slate-900/15"
                >
                  Upgrade to Pro
                </Link>
              )}
            </div>
          )}
        </SurfaceCard>
      )}

      {activeTab === 'next' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <SurfaceCard p={6} className="bg-white/95">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
              Career goal
            </p>
            <h2 className="mt-2 text-2xl font-black tracking-[-0.04em] text-slate-950">
              Turn this report into a plan.
            </h2>
            <p className="mt-3 text-sm leading-8 text-slate-600">
              Create a goal when you want Daily Push to organize the missing requirements into milestones and daily sessions.
            </p>
            <button
              type="button"
              onClick={handleCreateGoal}
              disabled={!!busy}
              className="mt-5 rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white disabled:opacity-60"
            >
              {application.linkedGoalId ? 'Open career goal' : 'Create career goal'}
            </button>
          </SurfaceCard>

          <SurfaceCard p={6} className="bg-white/95">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-600">
              Gap-closing sprint
            </p>
            <h2 className="mt-2 text-2xl font-black tracking-[-0.04em] text-slate-950">
              Convert gaps into a 2-8 week push.
            </h2>
            <p className="mt-3 text-sm leading-8 text-slate-600">
              Sprint adds accountability, proof-building tasks, and interview readiness around the weakest parts of this report.
            </p>
            {canCreateSprint || application.linkedSprintCreatedAt ? (
              <button
                type="button"
                onClick={handleCreateSprint}
                disabled={!!busy}
                className="mt-5 rounded-full border border-slate-200 px-5 py-3 text-sm font-black text-slate-700 hover:border-sky-300 hover:text-sky-700 disabled:opacity-60"
              >
                {application.linkedSprintCreatedAt ? 'Open sprint plan' : 'Turn gaps into sprint'}
              </button>
            ) : (
              <Link
                to="/pricing?source=resume"
                className="mt-5 inline-flex rounded-full border border-slate-200 px-5 py-3 text-sm font-black text-slate-700 hover:border-sky-300 hover:text-sky-700"
              >
                Start Sprint plan
              </Link>
            )}
          </SurfaceCard>

          {gapReport?.portfolioSuggestion ? (
            <SurfaceCard p={6} className="bg-sky-50/80 lg:col-span-2">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-700">
                Proof builder preview
              </p>
              <h3 className="mt-2 text-xl font-black tracking-[-0.04em] text-slate-950">
                {gapReport.portfolioSuggestion}
              </h3>
              {gapReport.sprintEdits.length > 0 ? (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {gapReport.sprintEdits.map((item) => (
                    <p key={item} className="rounded-2xl bg-white/80 px-4 py-3 text-sm font-semibold text-slate-700">{item}</p>
                  ))}
                </div>
              ) : null}
            </SurfaceCard>
          ) : null}
        </div>
      )}

      {activeTab === 'documents' && (
        <SurfaceCard p={{ base: 5, md: 6 }} className="bg-white/95">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
            Source documents
          </p>
          <h2 className="mt-2 text-3xl font-black tracking-[-0.05em] text-slate-950">
            Resume and job description saved.
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-8 text-slate-600">
            We do not show raw document text here because it is not useful for reviewing the report. Start a revised fit check if you want to compare an updated resume or a different job description.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link to="/resume" className="rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white">
              Start revised fit check
            </Link>
            <button
              type="button"
              onClick={() => setActiveTab('report')}
              className="rounded-full border border-slate-200 px-5 py-3 text-sm font-black text-slate-700 hover:border-sky-300 hover:text-sky-700"
            >
              Back to report
            </button>
          </div>
        </SurfaceCard>
      )}
    </div>
  );
}
