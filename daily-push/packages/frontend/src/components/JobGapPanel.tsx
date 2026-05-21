import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '@chakra-ui/react';
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.mjs?url';
import {
  getGoalGapReport,
  getResumeWorkspace,
  generateTailoredResume,
  generateResumeWorkspaceTailoredResume,
  rebuildGoalGapReport,
  rebuildResumeWorkspaceGapReport,
  saveGoalJobDescription,
  saveResumeWorkspaceJobDescription,
  saveGoalRepoImport,
  saveGoalResume,
  saveResumeWorkspaceResume,
  type GoalGapReportRecord,
  type GapReportQuotaSummary,
} from '../api/client';
import EmptyState from './ui/EmptyState';
import SurfaceCard from './ui/SurfaceCard';

interface JobGapPanelProps {
  goalId?: string;
  scope?: 'goal' | 'global';
  defaultTargetRole?: string | null;
  defaultTargetCompany?: string | null;
}

type ResumeInputSource = 'manual' | 'upload' | 'linkedin_paste';
type DocumentKind = 'resume' | 'jobDescription';
type DocumentInputMode = 'upload' | 'paste';

let pdfJsPromise: Promise<typeof import('pdfjs-dist')> | null = null;

const readinessStyles: Record<string, string> = {
  early: 'bg-red-100 text-red-700',
  building: 'bg-amber-100 text-amber-700',
  close: 'bg-emerald-100 text-emerald-700',
};

const priorityStyles: Record<string, string> = {
  high: 'bg-red-50 border-red-200 text-red-700',
  medium: 'bg-amber-50 border-amber-200 text-amber-700',
  low: 'bg-sky-50 border-sky-200 text-sky-700',
};

const coverageStatusStyles: Record<string, string> = {
  covered: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  weak: 'bg-amber-50 text-amber-700 border-amber-200',
  missing: 'bg-red-50 text-red-700 border-red-200',
};

function emptyRecord(): GoalGapReportRecord {
  return {
    targetRole: null,
    targetCompany: null,
    jdText: null,
    resumeText: null,
    resumeSummary: null,
    parsedJd: null,
    repoUrl: null,
    repoSummary: null,
    gapReport: null,
    tailoredResume: null,
    tailoredResumeGeneratedAt: null,
    lastAnalyzedAt: null,
  };
}

function normalizeText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

const SUPPORTED_RESUME_EXTENSIONS = new Set(['txt', 'md', 'markdown', 'rtf', 'pdf']);
const SUPPORTED_RESUME_ACCEPT =
  '.txt,.md,.markdown,.rtf,.pdf,text/plain,text/markdown,application/rtf,application/pdf';
const REPO_EVIDENCE_ENABLED =
  import.meta.env.VITE_GAP_REPORT_REPO_EVIDENCE_ENABLED === 'true';

async function getPdfJs() {
  if (!pdfJsPromise) {
    pdfJsPromise = import('pdfjs-dist').then((pdfjs) => {
      // PDF.js needs an explicit worker path in Vite builds.
      pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;
      return pdfjs;
    });
  }
  return pdfJsPromise;
}

function stripRtfToPlainText(value: string): string {
  return value
    .replace(/\\par[d]?/gi, '\n')
    .replace(/\\tab/gi, ' ')
    .replace(/\\'[0-9a-fA-F]{2}/g, ' ')
    .replace(/\\[a-z]+-?\d* ?/gi, ' ')
    .replace(/[{}]/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function getResumeUploadExtension(file: File): string {
  const parts = file.name.toLowerCase().split('.');
  return parts.length > 1 ? parts.pop() ?? '' : '';
}

function normalizeResumeUploadText(value: string): string {
  return value
    .replace(/\u0000/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await getPdfJs();
  const pdfData = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjs.getDocument({ data: pdfData });

  try {
    const document = await loadingTask.promise;
    const pageTexts: string[] = [];

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const pageText = normalizeResumeUploadText(
        textContent.items
          .map((item) => ('str' in item && typeof item.str === 'string' ? item.str : ''))
          .join(' '),
      );

      if (pageText) {
        pageTexts.push(pageText);
      }
    }

    return pageTexts.join('\n\n');
  } catch {
    throw new Error(
      'Could not read that PDF resume. If it is scanned or image-only, paste the text into the field instead.',
    );
  } finally {
    await loadingTask.destroy();
  }
}

async function readUploadedDocumentFile(
  file: File,
  kind: DocumentKind,
): Promise<string> {
  const extension = getResumeUploadExtension(file);
  if (!SUPPORTED_RESUME_EXTENSIONS.has(extension)) {
    throw new Error(
      `Only .txt, .md, .rtf, and .pdf ${kind === 'resume' ? 'resumes' : 'job descriptions'} are supported right now. For DOCX files, export as PDF or paste through a text file for now.`,
    );
  }

  let normalized = '';
  if (extension === 'pdf') {
    normalized = normalizeResumeUploadText(await extractPdfText(file));
  } else {
    const rawText = await file.text();
    normalized = normalizeResumeUploadText(
      extension === 'rtf' ? stripRtfToPlainText(rawText) : rawText,
    );
  }

  if (!normalized || normalized.length < 10) {
    throw new Error(
      `That ${kind === 'resume' ? 'resume' : 'job description'} did not contain enough readable text to analyze. Try a text-based PDF or text export.`,
    );
  }

  if (normalized.length > 40000) {
    throw new Error(
      `That ${kind === 'resume' ? 'resume' : 'job description'} is too large to analyze in one pass. Trim it to the most relevant content and try again.`,
    );
  }

  return normalized;
}

function formatTimestamp(value: string | null): string {
  if (!value) return 'Not analyzed yet';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Not analyzed yet';
  return parsed.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function JobGapPanel({
  goalId,
  scope = 'goal',
  defaultTargetRole = null,
}: JobGapPanelProps) {
  const toast = useToast();
  const [record, setRecord] = useState<GoalGapReportRecord | null>(null);
  const [quota, setQuota] = useState<GapReportQuotaSummary | null>(null);
  const [resumeText, setResumeText] = useState('');
  const [resumeSource, setResumeSource] = useState<ResumeInputSource>('manual');
  const [resumeInputMode, setResumeInputMode] = useState<DocumentInputMode>('upload');
  const [resumeUploadName, setResumeUploadName] = useState<string | null>(null);
  const [resumeDragActive, setResumeDragActive] = useState(false);
  const [jdInputMode, setJdInputMode] = useState<DocumentInputMode>('upload');
  const [jdUploadName, setJdUploadName] = useState<string | null>(null);
  const [jdDragActive, setJdDragActive] = useState(false);
  const [uploadingJd, setUploadingJd] = useState(false);
  const [jdText, setJdText] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [repoContext, setRepoContext] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploadingResume, setUploadingResume] = useState(false);
  const [savingRepo, setSavingRepo] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [generatingResume, setGeneratingResume] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [upgradePlan, setUpgradePlan] = useState<string | null>(null);
  const isGlobalScope = scope === 'global';
  const repoEvidenceEnabled = REPO_EVIDENCE_ENABLED && !isGlobalScope;

  const applyRecord = (nextRecord: GoalGapReportRecord) => {
    setRecord(nextRecord);
    setResumeText(nextRecord.resumeText ?? '');
    setResumeSource('manual');
    setResumeUploadName(null);
    setJdUploadName(null);
    setJdText(nextRecord.jdText ?? '');
    setRepoUrl(repoEvidenceEnabled ? nextRecord.repoUrl ?? '' : '');
    setRepoContext(repoEvidenceEnabled ? nextRecord.repoSummary?.inputContext ?? '' : '');
  };

  const mergeRecord = (patch: Partial<GoalGapReportRecord>) => {
    setRecord((current) => ({
      ...emptyRecord(),
      ...(current ?? {}),
      ...patch,
    }));
  };

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        if (!isGlobalScope && !goalId) {
          throw new Error('Goal id is required for goal resume analysis.');
        }
        const nextRecord = isGlobalScope
          ? await getResumeWorkspace()
          : await getGoalGapReport(goalId as string);
        if (cancelled) return;
        applyRecord(nextRecord);
      } catch (err: any) {
        if (cancelled) return;
        setError(err?.response?.data?.error ?? 'Failed to load career targeting data.');
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [goalId, isGlobalScope]);

  const handleResumeFileSelected = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    await handleResumeFile(file);
  };

  const handleResumeFile = async (file: File) => {
    setUploadingResume(true);
    setError(null);
    setUpgradePlan(null);
    try {
      const nextResumeText = await readUploadedDocumentFile(file, 'resume');
      setResumeText(nextResumeText);
      setResumeSource('upload');
      setResumeUploadName(file.name);
      toast({
        title: 'Resume file loaded',
        description: `${file.name} was converted into editable resume text.`,
        status: 'success',
        duration: 2500,
        isClosable: true,
        position: 'top-right',
      });
    } catch (err: any) {
      setError(err?.message ?? 'Could not read that resume file.');
    } finally {
      setUploadingResume(false);
    }
  };

  const handleResumeDrop = async (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setResumeDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    await handleResumeFile(file);
  };

  const handleJdFileSelected = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    await handleJdFile(file);
  };

  const handleJdFile = async (file: File) => {
    setUploadingJd(true);
    setError(null);
    setUpgradePlan(null);
    try {
      const nextJdText = await readUploadedDocumentFile(file, 'jobDescription');
      setJdText(nextJdText);
      setJdUploadName(file.name);
      toast({
        title: 'Job description loaded',
        description: `${file.name} is ready to parse against your resume.`,
        status: 'success',
        duration: 2500,
        isClosable: true,
        position: 'top-right',
      });
    } catch (err: any) {
      setError(err?.message ?? 'Could not read that job description file.');
    } finally {
      setUploadingJd(false);
    }
  };

  const handleJdDrop = async (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setJdDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    await handleJdFile(file);
  };

  const handleGenerateReport = async () => {
    const nextResumeText = normalizeText(resumeText);
    const nextJdText = normalizeText(jdText);
    const nextRepoUrl = repoEvidenceEnabled ? normalizeText(repoUrl) : null;
    const nextRepoContext = repoEvidenceEnabled ? normalizeText(repoContext) : null;

    if (!nextResumeText) {
      setError('Upload or paste your resume first so we can understand your current profile.');
      return;
    }
    if (!nextJdText) {
      setError('Upload or paste the target job description first so we know what to compare against.');
      return;
    }

    setRebuilding(true);
    setGeneratingResume(false);
    setError(null);
    setUpgradePlan(null);

    try {
      const savedResumeText = normalizeText(record?.resumeText ?? '');
      const savedJdText = normalizeText(record?.jdText ?? '');
      const savedRepoUrl = repoEvidenceEnabled ? normalizeText(record?.repoUrl ?? '') : null;
      const savedRepoContext = repoEvidenceEnabled
        ? normalizeText(record?.repoSummary?.inputContext ?? '')
        : null;

      if (nextResumeText !== savedResumeText) {
        const result = isGlobalScope
          ? await saveResumeWorkspaceResume({
              rawText: nextResumeText,
              source: resumeSource,
            })
          : await saveGoalResume(goalId as string, {
              rawText: nextResumeText,
              source: resumeSource,
            });
        mergeRecord({
          resumeText: nextResumeText,
          resumeSummary: result.resumeSummary,
        });
      }

      if (nextJdText !== savedJdText) {
        const result = isGlobalScope
          ? await saveResumeWorkspaceJobDescription({
              targetRole: null,
              targetCompany: null,
              jdText: nextJdText,
            })
          : await saveGoalJobDescription(goalId as string, {
              targetRole: null,
              targetCompany: null,
              jdText: nextJdText,
            });
        mergeRecord({
          targetRole: result.parsedJd.targetRole,
          targetCompany: null,
          jdText: nextJdText,
          parsedJd: result.parsedJd,
        });
      }

      if (
        nextRepoUrl &&
        (
          nextRepoUrl !== savedRepoUrl ||
          nextRepoContext !== savedRepoContext
        )
      ) {
        const result = await saveGoalRepoImport(goalId as string, {
          repoUrl: nextRepoUrl,
          repoContext: nextRepoContext,
        });
        mergeRecord({
          repoUrl: result.repoSummary.repoUrl,
          repoSummary: result.repoSummary,
        });
      }

      const gapResult = isGlobalScope
        ? await rebuildResumeWorkspaceGapReport()
        : await rebuildGoalGapReport(goalId as string);
      setQuota(gapResult.quota ?? null);
      applyRecord(gapResult);
      setGeneratingResume(true);
      const resumeResult = isGlobalScope
        ? await generateResumeWorkspaceTailoredResume()
        : await generateTailoredResume(goalId as string);
      applyRecord({
        ...resumeResult,
        gapReport: resumeResult.gapReport ?? gapResult.gapReport,
      });
      toast({
        title: 'Resume analysis ready',
        description: 'Your gap report and tailored resume draft are ready.',
        status: 'success',
        duration: 3000,
        isClosable: true,
        position: 'top-right',
      });
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Failed to generate resume analysis.');
      setUpgradePlan(err?.response?.data?.upgradePlan ?? null);
    } finally {
      setGeneratingResume(false);
      setRebuilding(false);
    }
  };

  const resumeSummary = record?.resumeSummary;
  const parsedJd = record?.parsedJd;
  const repoSummary = repoEvidenceEnabled ? record?.repoSummary : null;
  const gapReport = record?.gapReport;
  const tailoredResume = record?.tailoredResume;

  const handleSaveRepo = async () => {
    if (!repoEvidenceEnabled) {
      setError('Repository evidence is currently disabled for gap reports.');
      return;
    }

    const nextRepoUrl = normalizeText(repoUrl);
    const nextRepoContext = normalizeText(repoContext);
    if (!nextRepoUrl) {
      setError('Add a repository URL before saving repo evidence.');
      return;
    }

    setSavingRepo(true);
    setError(null);
    setUpgradePlan(null);
    try {
      if (!goalId) {
        setError('Repository evidence is only available inside a goal.');
        return;
      }
      const result = await saveGoalRepoImport(goalId, {
        repoUrl: nextRepoUrl,
        repoContext: nextRepoContext,
      });
      mergeRecord({
        repoUrl: result.repoSummary.repoUrl,
        repoSummary: result.repoSummary,
      });
      toast({
        title: 'Repo evidence saved',
        description: 'Your repository signals are ready to influence the gap report.',
        status: 'success',
        duration: 2500,
        isClosable: true,
        position: 'top-right',
      });
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Failed to save repository evidence.');
      setUpgradePlan(err?.response?.data?.upgradePlan ?? null);
    } finally {
      setSavingRepo(false);
    }
  };

  const handleCopyTailoredResume = async () => {
    if (!tailoredResume) return;
    const text = [
      tailoredResume.headline,
      '',
      'Professional Summary',
      tailoredResume.professionalSummary,
      '',
      'Skills',
      tailoredResume.skills.join(', '),
      '',
      'Experience Bullets',
      ...tailoredResume.experienceBullets.map((item) => `- ${item}`),
      '',
      'Project Bullets',
      ...tailoredResume.projectBullets.map((item) => `- ${item}`),
      '',
      'Evidence to verify',
      ...tailoredResume.missingEvidenceWarnings.map((item) => `- ${item}`),
    ].join('\n');

    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: 'Tailored resume copied',
        status: 'success',
        duration: 2200,
        isClosable: true,
        position: 'top-right',
      });
    } catch {
      setError('Could not copy the tailored resume. Select the text manually and copy it.');
    }
  };

  const normalizedResumeText = normalizeText(resumeText);
  const normalizedJdText = normalizeText(jdText);
  const hasResumeInput = !!normalizedResumeText;
  const hasTargetInput = !!normalizedJdText;
  const hasGeneratedAnalysis = !!gapReport || !!tailoredResume;
  const savedResumeText = normalizeText(record?.resumeText ?? '');
  const savedJdText = normalizeText(record?.jdText ?? '');
  const canGenerateReport =
    hasResumeInput &&
    hasTargetInput &&
    !rebuilding &&
    !generatingResume &&
    !savingRepo &&
    !uploadingResume &&
    !uploadingJd;
  const workflowSteps = [
    {
      title: 'Profile',
      description: hasResumeInput
        ? 'Resume added'
        : 'Add resume',
      state: hasResumeInput ? 'done' : 'current',
    },
    {
      title: 'Target',
      description: hasTargetInput
        ? 'Job description added'
        : 'Add job description',
      state: hasTargetInput ? 'done' : hasResumeInput ? 'current' : 'locked',
    },
  ] as const;

  return (
    <SurfaceCard p={5}>
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">
              Resume
            </span>
            <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
              Detailed resume analysis
            </span>
          </div>
          <p className="text-sm leading-relaxed text-slate-600">
                  Upload or paste a resume and job description to find gaps and generate a tailored resume draft.
          </p>
        </div>
        <p className="text-xs text-slate-400">
          Last analyzed: {formatTimestamp(record?.lastAnalyzedAt ?? null)}
        </p>
      </div>

      {loading ? (
        <SurfaceCard p={4} className="mt-4 bg-slate-50/80">
          <div className="flex items-center gap-3 text-sm text-slate-400">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-sky-500" />
            Loading target-role context...
          </div>
        </SurfaceCard>
      ) : (
        <div className="mt-4 space-y-4">
          {error && (
            <SurfaceCard p={3} className="border-red-200 bg-red-50 text-sm text-red-700">
              <p>{error}</p>
              {upgradePlan && (
                <Link
                  to="/pricing"
                  className="mt-2 inline-flex items-center text-xs font-semibold text-red-700 hover:text-red-800"
                >
                  Upgrade to {upgradePlan} for detailed resume analysis
                </Link>
              )}
            </SurfaceCard>
          )}

          {quota && (
            <SurfaceCard p={3} className="border-sky-200 bg-sky-50 text-xs text-sky-700">
              {quota.remaining === null
                ? 'Gap reports are available without a monthly cap on your current plan.'
                : `${quota.remaining} gap report${quota.remaining === 1 ? '' : 's'} remaining this month.`}
            </SurfaceCard>
          )}

          <SurfaceCard p={5} className="space-y-5 border-sky-100 bg-sky-50/35">
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-sky-700">
                  Application documents
                </p>
                <p className="mt-1 text-xl font-extrabold tracking-[-0.03em] text-slate-900">
                  Add resume and job description
                </p>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">
                  We parse both documents, identify gaps, and generate a tailored resume draft.
                </p>
              </div>
              <div className="flex w-full gap-2 md:w-auto">
                {workflowSteps.map((step, index) => (
                  <div
                    key={step.title}
                    className={`flex-1 rounded-2xl border px-3 py-2 text-xs font-bold md:min-w-[132px] ${
                      step.state === 'done'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                        : step.state === 'current'
                          ? 'border-slate-900 bg-slate-950 text-white'
                          : 'border-slate-200 bg-white text-slate-500'
                    }`}
                  >
                    <span className="mr-2">{index + 1}</span>
                    {step.title}
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <div className="space-y-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                    Resume
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    Upload a file or paste the resume you would actually apply with.
                  </p>
                </div>

                <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
                  {(['upload', 'paste'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setResumeInputMode(mode)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-extrabold transition-colors ${
                        resumeInputMode === mode
                          ? 'bg-slate-950 text-white'
                          : 'text-slate-500 hover:text-slate-900'
                      }`}
                    >
                      {mode === 'upload' ? 'Upload' : 'Paste'}
                    </button>
                  ))}
                </div>

                {hasGeneratedAnalysis && hasResumeInput && resumeInputMode === 'upload' ? (
                  <div className="rounded-3xl border border-emerald-100 bg-emerald-50/70 px-4 py-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-extrabold text-emerald-900">
                          Resume saved
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-emerald-700">
                          We will use this saved resume for the current analysis.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setResumeInputMode('paste')}
                        className="inline-flex items-center justify-center rounded-xl bg-white px-3 py-2 text-xs font-extrabold text-emerald-800 transition-colors hover:bg-emerald-100"
                      >
                        Edit resume
                      </button>
                    </div>
                  </div>
                ) : resumeInputMode === 'upload' ? (
                  <>
                    <label
                      onDragOver={(event) => {
                        event.preventDefault();
                        setResumeDragActive(true);
                      }}
                      onDragLeave={() => setResumeDragActive(false)}
                      onDrop={handleResumeDrop}
                      className={`block cursor-pointer rounded-3xl border-2 border-dashed px-5 py-6 text-center transition-colors ${
                        resumeDragActive
                          ? 'border-sky-500 bg-white'
                          : 'border-sky-200 bg-white/75 hover:border-sky-400'
                      }`}
                    >
                      <input
                        type="file"
                        accept={SUPPORTED_RESUME_ACCEPT}
                        onChange={handleResumeFileSelected}
                        className="hidden"
                      />
                      <span className="text-sm font-extrabold text-slate-900">
                        {uploadingResume ? 'Reading resume...' : 'Drop resume here or browse files'}
                      </span>
                      <span className="mt-2 block text-xs leading-relaxed text-slate-500">
                        Supports PDF, TXT, MD, and RTF. For DOCX, export to PDF first.
                      </span>
                      {uploadingResume && (
                        <span className="mx-auto mt-4 block h-5 w-5 animate-spin rounded-full border-2 border-sky-100 border-t-sky-600" />
                      )}
                    </label>

                    {resumeUploadName && (
                      <p className="text-sm font-semibold text-emerald-700">
                        {resumeUploadName} uploaded
                      </p>
                    )}
                  </>
                ) : (
                  <textarea
                    value={resumeText}
                    onChange={(event) => {
                      setResumeText(event.target.value);
                      setResumeSource('manual');
                      setResumeUploadName(null);
                    }}
                    placeholder="Paste your resume text here."
                    rows={10}
                    className="w-full rounded-3xl border border-sky-200 bg-white/90 px-4 py-4 text-sm leading-relaxed text-slate-700 outline-none transition-colors placeholder:text-slate-400 focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                  />
                )}
              </div>

              <div className="space-y-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                    Job description
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    Upload a file or paste the job description for the role you want to target.
                  </p>
                </div>

              <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
                {(['upload', 'paste'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setJdInputMode(mode)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-extrabold transition-colors ${
                      jdInputMode === mode
                        ? 'bg-slate-950 text-white'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    {mode === 'upload' ? 'Upload' : 'Paste'}
                  </button>
                ))}
              </div>

              {hasGeneratedAnalysis && hasTargetInput && jdInputMode === 'upload' ? (
                <div className="rounded-3xl border border-emerald-100 bg-emerald-50/70 px-4 py-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-extrabold text-emerald-900">
                        Job description saved
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-emerald-700">
                        We will compare against this saved job description.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setJdInputMode('paste')}
                      className="inline-flex items-center justify-center rounded-xl bg-white px-3 py-2 text-xs font-extrabold text-emerald-800 transition-colors hover:bg-emerald-100"
                    >
                      Edit job description
                    </button>
                  </div>
                </div>
              ) : jdInputMode === 'upload' ? (
                <>
                  <label
                    onDragOver={(event) => {
                      event.preventDefault();
                      setJdDragActive(true);
                    }}
                    onDragLeave={() => setJdDragActive(false)}
                    onDrop={handleJdDrop}
                    className={`block cursor-pointer rounded-3xl border-2 border-dashed px-5 py-6 text-center transition-colors ${
                      jdDragActive
                        ? 'border-indigo-500 bg-indigo-50'
                        : 'border-indigo-200 bg-indigo-50/50 hover:border-indigo-400'
                    }`}
                  >
                    <input
                      type="file"
                      accept={SUPPORTED_RESUME_ACCEPT}
                      onChange={handleJdFileSelected}
                      className="hidden"
                    />
                    <span className="text-sm font-extrabold text-slate-900">
                      {uploadingJd ? 'Reading job description...' : 'Drop job description here or browse files'}
                    </span>
                    <span className="mt-2 block text-xs leading-relaxed text-slate-500">
                      Supports PDF, TXT, MD, and RTF. Upload the role description from the job listing.
                    </span>
                    {uploadingJd && (
                      <span className="mx-auto mt-4 block h-5 w-5 animate-spin rounded-full border-2 border-indigo-100 border-t-indigo-600" />
                    )}
                  </label>

                  {jdUploadName && (
                    <p className="text-sm font-semibold text-emerald-700">
                      {jdUploadName} uploaded
                    </p>
                  )}
                </>
              ) : (
                <textarea
                  value={jdText}
                  onChange={(event) => {
                    setJdText(event.target.value);
                    setJdUploadName(null);
                  }}
                  placeholder="Paste the full job description here."
                  rows={10}
                  className="w-full rounded-3xl border border-indigo-200 bg-white/90 px-4 py-4 text-sm leading-relaxed text-slate-700 outline-none transition-colors placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                />
              )}
              </div>
            </div>

            <div className="rounded-2xl bg-slate-950 px-4 py-4 text-white">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm leading-relaxed text-slate-300">
                    {canGenerateReport
                      ? hasGeneratedAnalysis
                        ? 'Documents are ready. Regenerate the analysis when you update the resume or job description.'
                        : 'Both documents are ready. Generate the gap report and tailored resume.'
                      : 'Upload or paste both documents to generate the report and tailored resume.'}
                </p>
                <button
                  type="button"
                  onClick={handleGenerateReport}
                  disabled={!canGenerateReport}
                  className="inline-flex items-center justify-center rounded-xl bg-white px-4 py-2.5 text-sm font-extrabold text-slate-950 transition-colors hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {rebuilding
                      ? generatingResume
                        ? 'Generating resume...'
                        : 'Analyzing fit...'
                      : hasGeneratedAnalysis
                        ? 'Regenerate analysis'
                        : 'Generate gap report and resume'}
                </button>
              </div>
            </div>
          </SurfaceCard>

          {repoEvidenceEnabled && (
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
              <label className="space-y-2">
                <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                  Repo URL
                </span>
                <input
                  value={repoUrl}
                  onChange={(event) => setRepoUrl(event.target.value)}
                  placeholder="https://github.com/you/project"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700 outline-none transition-colors focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                />
              </label>

              <label className="space-y-2">
                <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                  What this repo proves
                </span>
                <textarea
                  value={repoContext}
                  onChange={(event) => setRepoContext(event.target.value)}
                  placeholder="Optional: explain the scope, outcomes, architecture, or what parts you personally owned."
                  rows={4}
                  className="w-full rounded-2xl border border-slate-200 px-3 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                />
              </label>
            </div>
          )}

          {(resumeSummary || parsedJd || repoSummary) && (
            <div className="grid gap-4 md:grid-cols-3">
              {resumeSummary && (
                <SurfaceCard p={4}>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                    Resume understanding
                  </p>
                  {resumeSummary.headline && (
                    <p className="mt-2 text-sm font-semibold text-slate-800">
                      {resumeSummary.headline}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {resumeSummary.coreSkills.map((skill) => (
                      <span
                        key={skill}
                        className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                  <div className="mt-3 space-y-2 text-xs text-slate-500">
                    {resumeSummary.yearsExperience !== null && (
                      <p>{resumeSummary.yearsExperience}+ years experience detected.</p>
                    )}
                    {resumeSummary.evidenceAreas.slice(0, 3).map((item) => (
                      <p key={item}>- {item}</p>
                    ))}
                  </div>
                  {resumeSummary.experienceItems && resumeSummary.experienceItems.length > 0 && (
                    <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                        Roles found
                      </p>
                      <div className="mt-2 space-y-1 text-xs text-slate-600">
                        {resumeSummary.experienceItems.slice(0, 3).map((item, index) => (
                          <p key={`${item.company}-${item.role}-${index}`}>
                            {[item.role, item.company].filter(Boolean).join(' at ') || 'Experience item'}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                  {resumeSummary.projectItems && resumeSummary.projectItems.length > 0 && (
                    <div className="mt-3 rounded-xl bg-sky-50 px-3 py-2">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-sky-700">
                        Projects found
                      </p>
                      <div className="mt-2 space-y-1 text-xs text-sky-800">
                        {resumeSummary.projectItems.slice(0, 3).map((item, index) => (
                          <p key={`${item.name}-${index}`}>
                            {item.name ?? item.description ?? 'Project item'}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                </SurfaceCard>
              )}

              {parsedJd && (
                <SurfaceCard p={4}>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                    Job description understanding
                  </p>
                  <p className="mt-2 text-sm font-semibold text-slate-800">
                    {(parsedJd.targetRole ?? defaultTargetRole) || 'Target role'}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {parsedJd.mustHaveSkills.map((skill) => (
                      <span
                        key={skill}
                        className="rounded-full bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                  <div className="mt-3 space-y-2 text-xs text-slate-500">
                    {parsedJd.evidenceSignals.slice(0, 3).map((item) => (
                      <p key={item}>- {item}</p>
                    ))}
                  </div>
                </SurfaceCard>
              )}

              {repoSummary && (
                <SurfaceCard p={4}>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                    Repo evidence
                  </p>
                  <p className="mt-2 text-sm font-semibold text-slate-800">
                    {repoSummary.repoName ?? 'Repository'}
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-slate-500">
                    {repoSummary.summary}
                  </p>
                  {repoSummary.inspectedFiles.length > 0 && (
                    <p className="mt-2 text-[11px] text-slate-400">
                      Inspected: {repoSummary.inspectedFiles.slice(0, 4).join(', ')}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {repoSummary.demonstratedSkills.map((skill) => (
                      <span
                        key={skill}
                        className="rounded-full bg-sky-50 px-2 py-1 text-xs font-medium text-sky-700"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                  <div className="mt-3 space-y-2 text-xs text-slate-500">
                    {repoSummary.evidenceSignals.slice(0, 3).map((item) => (
                      <p key={item}>- {item}</p>
                    ))}
                  </div>
                </SurfaceCard>
              )}
            </div>
          )}

          {gapReport ? (
            <SurfaceCard p={5} className="bg-slate-50/80">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                      Gap report
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        readinessStyles[gapReport.readinessLabel] ?? readinessStyles.building
                      }`}
                    >
                      {gapReport.readinessLabel}
                    </span>
                  </div>
                  <p className="text-sm text-slate-700">{gapReport.summary}</p>
                </div>
                <SurfaceCard p={3} className="text-right">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                    Confidence
                  </p>
                  <p className="mt-1 text-lg font-semibold text-slate-800">
                    {gapReport.confidence}%
                  </p>
                </SurfaceCard>
              </div>

              {gapReport.requirementCoverage?.length > 0 && (
                <SurfaceCard p={4} className="mt-4 bg-white">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                        Requirement coverage
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        What the job asks for, whether your resume proves it, and the next best action.
                      </p>
                    </div>
                    <p className="text-xs font-semibold text-slate-400">
                      Full fit analysis
                    </p>
                  </div>

                  <div className="mt-4 space-y-3">
                    {gapReport.requirementCoverage.map((item) => (
                      <div
                        key={`${item.requirement}-${item.status}`}
                        className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4"
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="text-sm font-extrabold text-slate-900">
                              {item.requirement}
                            </p>
                            {item.resumeEvidence && (
                              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                                Evidence found: {item.resumeEvidence}
                              </p>
                            )}
                            {item.sourceSnippet && (
                              <p className="mt-2 rounded-xl bg-white px-3 py-2 text-xs leading-relaxed text-slate-500">
                                Source: {item.sourceSnippet}
                              </p>
                            )}
                          </div>
                          <div className="flex shrink-0 gap-2">
                            <span
                              className={`rounded-full border px-2 py-1 text-[11px] font-bold uppercase tracking-wide ${
                                coverageStatusStyles[item.status] ?? coverageStatusStyles.missing
                              }`}
                            >
                              {item.status}
                            </span>
                            <span
                              className={`rounded-full border px-2 py-1 text-[11px] font-bold uppercase tracking-wide ${
                                priorityStyles[item.priority] ?? priorityStyles.medium
                              }`}
                            >
                              {item.priority}
                            </span>
                            {typeof item.confidence === 'number' && (
                              <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                                {item.confidence}%
                              </span>
                            )}
                          </div>
                        </div>
                        <p className="mt-3 rounded-xl bg-white px-3 py-2 text-xs font-medium leading-relaxed text-slate-600">
                          Next action: {item.action}
                        </p>
                      </div>
                    ))}
                  </div>
                </SurfaceCard>
              )}

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <SurfaceCard p={4}>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                    Strengths to lean on
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {gapReport.strengths.map((item) => (
                      <span
                        key={item}
                        className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </SurfaceCard>

                <SurfaceCard p={4}>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                    Recommended improvements
                  </p>
                  <div className="mt-3 space-y-2 text-sm text-slate-600">
                    {gapReport.sprintEdits.map((item) => (
                      <p key={item}>- {item}</p>
                    ))}
                  </div>
                </SurfaceCard>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <SurfaceCard p={4}>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                    Missing skills
                  </p>
                  <div className="mt-3 space-y-3">
                    {gapReport.missingSkills.map((item) => (
                      <div
                        key={`${item.name}-${item.reason}`}
                        className={`rounded-xl border p-3 text-sm ${priorityStyles[item.priority] ?? priorityStyles.medium}`}
                      >
                        <p className="font-semibold">{item.name}</p>
                        <p className="mt-1 text-xs leading-relaxed">{item.reason}</p>
                      </div>
                    ))}
                  </div>
                </SurfaceCard>

                <SurfaceCard p={4}>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                    Missing proof
                  </p>
                  <div className="mt-3 space-y-3">
                    {gapReport.missingProof.map((item) => (
                      <div
                        key={`${item.area}-${item.evidenceNeeded}`}
                        className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700"
                      >
                        <p className="font-semibold text-slate-800">{item.area}</p>
                        <p className="mt-1 text-xs leading-relaxed text-slate-600">
                          {item.reason}
                        </p>
                        <p className="mt-2 text-xs font-medium text-sky-700">
                          Evidence to create: {item.evidenceNeeded}
                        </p>
                      </div>
                    ))}
                  </div>
                </SurfaceCard>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <SurfaceCard p={4}>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                    Interview risks
                  </p>
                  <div className="mt-3 space-y-2 text-sm text-slate-600">
                    {gapReport.interviewRisks.map((item) => (
                      <p key={item}>- {item}</p>
                    ))}
                  </div>
                </SurfaceCard>

                <SurfaceCard p={4}>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                    Portfolio move
                  </p>
                  <p className="mt-3 text-sm leading-relaxed text-slate-600">
                    {gapReport.portfolioSuggestion ?? 'Document one recent project with clearer outcomes and trade-offs.'}
                  </p>
                </SurfaceCard>
              </div>

              {repoSummary && (
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <SurfaceCard p={4}>
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                      Repo strengths
                    </p>
                    <div className="mt-3 space-y-2 text-sm text-slate-600">
                      {repoSummary.strengthAreas.map((item) => (
                        <p key={item}>- {item}</p>
                      ))}
                    </div>
                  </SurfaceCard>

                  <SurfaceCard p={4}>
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                      Repo evidence gaps
                    </p>
                    <div className="mt-3 space-y-2 text-sm text-slate-600">
                      {(repoSummary.missingSignals.length > 0
                        ? repoSummary.missingSignals
                        : repoSummary.recommendedArtifacts
                      ).map((item) => (
                        <p key={item}>- {item}</p>
                      ))}
                    </div>
                  </SurfaceCard>
                </div>
              )}
            </SurfaceCard>
          ) : (
            <EmptyState
              title="Your analysis will appear here"
              description="Upload or paste both documents to see role gaps, requirement coverage, and a tailored resume draft grounded in your actual experience."
              accent="neutral"
            />
          )}

          {tailoredResume && (
            <SurfaceCard p={5} className="bg-white">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                    Tailored resume draft
                  </p>
                  <h3 className="mt-2 text-xl font-extrabold tracking-[-0.03em] text-slate-900">
                    {tailoredResume.headline}
                  </h3>
                  <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
                    {tailoredResume.professionalSummary}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCopyTailoredResume}
                  className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:border-sky-300 hover:text-sky-700"
                >
                  Copy resume draft
                </button>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <SurfaceCard p={4}>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                    Skills to emphasize
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {tailoredResume.skills.map((skill) => (
                      <span
                        key={skill}
                        className="rounded-full bg-sky-50 px-2 py-1 text-xs font-medium text-sky-700"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </SurfaceCard>

                <SurfaceCard p={4}>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                    ATS keywords
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {tailoredResume.atsKeywords.map((keyword) => (
                      <span
                        key={keyword}
                        className="rounded-full bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700"
                      >
                        {keyword}
                      </span>
                    ))}
                  </div>
                </SurfaceCard>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <SurfaceCard p={4}>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                    Experience bullets
                  </p>
                  <div className="mt-3 space-y-2 text-sm text-slate-600">
                    {tailoredResume.experienceBullets.map((item) => (
                      <p key={item}>- {item}</p>
                    ))}
                  </div>
                </SurfaceCard>

                <SurfaceCard p={4}>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                    Project bullets
                  </p>
                  <div className="mt-3 space-y-2 text-sm text-slate-600">
                    {tailoredResume.projectBullets.map((item) => (
                      <p key={item}>- {item}</p>
                    ))}
                  </div>
                </SurfaceCard>
              </div>

              {tailoredResume.missingEvidenceWarnings.length > 0 && (
                <SurfaceCard p={4} className="mt-4 border-amber-200 bg-amber-50">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-amber-700">
                    Evidence to add before applying
                  </p>
                  <div className="mt-3 space-y-2 text-sm text-amber-800">
                    {tailoredResume.missingEvidenceWarnings.map((item) => (
                      <p key={item}>- {item}</p>
                    ))}
                  </div>
                </SurfaceCard>
              )}

              {tailoredResume.bulletEvidence && tailoredResume.bulletEvidence.length > 0 && (
                <SurfaceCard p={4} className="mt-4 border-emerald-200 bg-emerald-50/70">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-700">
                    Evidence lock
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-emerald-800">
                    These generated bullets are tied back to source evidence from the uploaded resume.
                  </p>
                  <div className="mt-3 space-y-3">
                    {tailoredResume.bulletEvidence.slice(0, 6).map((item) => (
                      <div key={`${item.bullet}-${item.sourceSnippet}`} className="rounded-xl bg-white/80 p-3 text-xs text-emerald-900">
                        <p className="font-bold">{item.bullet}</p>
                        <p className="mt-1 leading-relaxed text-emerald-700">
                          Source: {item.sourceSnippet}
                        </p>
                      </div>
                    ))}
                  </div>
                </SurfaceCard>
              )}

              {tailoredResume.coverNote && (
                <p className="mt-4 text-xs leading-relaxed text-slate-500">
                  {tailoredResume.coverNote}
                </p>
              )}
            </SurfaceCard>
          )}
        </div>
      )}
    </SurfaceCard>
  );
}
