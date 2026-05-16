import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '@chakra-ui/react';
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.mjs?url';
import {
  getGoalGapReport,
  rebuildGoalGapReport,
  saveGoalJobDescription,
  saveGoalRepoImport,
  saveGoalResume,
  type GoalGapReportRecord,
  type GapReportQuotaSummary,
} from '../api/client';
import EmptyState from './ui/EmptyState';
import SurfaceCard from './ui/SurfaceCard';

interface JobGapPanelProps {
  goalId: string;
  defaultTargetRole?: string | null;
  defaultTargetCompany?: string | null;
}

type ResumeInputSource = 'manual' | 'upload' | 'linkedin_paste';
type DocumentKind = 'resume' | 'jobDescription';

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

function WorkflowStep({
  index,
  title,
  description,
  state,
}: {
  index: number;
  title: string;
  description: string;
  state: 'done' | 'current' | 'locked';
}) {
  const stateClass = {
    done: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    current: 'border-slate-900 bg-slate-950 text-white shadow-lg shadow-slate-950/10',
    locked: 'border-slate-200 bg-white text-slate-500',
  }[state];

  return (
    <div className={`rounded-2xl border px-4 py-3 ${stateClass}`}>
      <div className="flex items-center gap-3">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black ${
          state === 'current' ? 'bg-white/15 text-white' : 'bg-white text-slate-800'
        }`}>
          {state === 'done' ? 'OK' : index}
        </div>
        <div>
          <p className="text-sm font-extrabold">{title}</p>
          <p className={`mt-0.5 text-xs leading-relaxed ${
            state === 'current' ? 'text-white/75' : 'text-slate-500'
          }`}>
            {description}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function JobGapPanel({
  goalId,
  defaultTargetRole = null,
  defaultTargetCompany = null,
}: JobGapPanelProps) {
  const toast = useToast();
  const [record, setRecord] = useState<GoalGapReportRecord | null>(null);
  const [quota, setQuota] = useState<GapReportQuotaSummary | null>(null);
  const [resumeText, setResumeText] = useState('');
  const [resumeSource, setResumeSource] = useState<ResumeInputSource>('manual');
  const [resumeUploadName, setResumeUploadName] = useState<string | null>(null);
  const [resumeDragActive, setResumeDragActive] = useState(false);
  const [jdUploadName, setJdUploadName] = useState<string | null>(null);
  const [jdDragActive, setJdDragActive] = useState(false);
  const [uploadingJd, setUploadingJd] = useState(false);
  const [targetRole, setTargetRole] = useState(defaultTargetRole ?? '');
  const [targetCompany, setTargetCompany] = useState(defaultTargetCompany ?? '');
  const [jdText, setJdText] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [repoContext, setRepoContext] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploadingResume, setUploadingResume] = useState(false);
  const [savingRepo, setSavingRepo] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [upgradePlan, setUpgradePlan] = useState<string | null>(null);

  const applyRecord = (nextRecord: GoalGapReportRecord) => {
    setRecord(nextRecord);
    setResumeText(nextRecord.resumeText ?? '');
    setResumeSource('manual');
    setResumeUploadName(null);
    setJdUploadName(null);
    setTargetRole(nextRecord.targetRole ?? defaultTargetRole ?? '');
    setTargetCompany(nextRecord.targetCompany ?? defaultTargetCompany ?? '');
    setJdText(nextRecord.jdText ?? '');
    setRepoUrl(REPO_EVIDENCE_ENABLED ? nextRecord.repoUrl ?? '' : '');
    setRepoContext(REPO_EVIDENCE_ENABLED ? nextRecord.repoSummary?.inputContext ?? '' : '');
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
        const nextRecord = await getGoalGapReport(goalId);
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
  }, [goalId]);

  useEffect(() => {
    if (record?.targetRole || targetRole) return;
    if (defaultTargetRole) {
      setTargetRole(defaultTargetRole);
    }
  }, [defaultTargetRole, record?.targetRole, targetRole]);

  useEffect(() => {
    if (record?.targetCompany || targetCompany) return;
    if (defaultTargetCompany) {
      setTargetCompany(defaultTargetCompany);
    }
  }, [defaultTargetCompany, record?.targetCompany, targetCompany]);

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
    const nextTargetRole = normalizeText(targetRole);
    const nextTargetCompany = normalizeText(targetCompany);
    const nextRepoUrl = REPO_EVIDENCE_ENABLED ? normalizeText(repoUrl) : null;
    const nextRepoContext = REPO_EVIDENCE_ENABLED ? normalizeText(repoContext) : null;

    if (!nextResumeText) {
      setError('Upload your resume first so we can understand your current profile.');
      return;
    }
    if (!nextJdText) {
      setError('Upload the target job description first so we know what to compare against.');
      return;
    }

    setRebuilding(true);
    setError(null);
    setUpgradePlan(null);

    try {
      const savedResumeText = normalizeText(record?.resumeText ?? '');
      const savedJdText = normalizeText(record?.jdText ?? '');
      const savedTargetRole = normalizeText(record?.targetRole ?? '');
      const savedTargetCompany = normalizeText(record?.targetCompany ?? '');
      const savedRepoUrl = REPO_EVIDENCE_ENABLED ? normalizeText(record?.repoUrl ?? '') : null;
      const savedRepoContext = REPO_EVIDENCE_ENABLED
        ? normalizeText(record?.repoSummary?.inputContext ?? '')
        : null;

      if (nextResumeText !== savedResumeText) {
        const result = await saveGoalResume(goalId, {
          rawText: nextResumeText,
          source: resumeSource,
        });
        mergeRecord({
          resumeText: nextResumeText,
          resumeSummary: result.resumeSummary,
        });
      }

      if (
        nextJdText !== savedJdText ||
        nextTargetRole !== savedTargetRole ||
        nextTargetCompany !== savedTargetCompany
      ) {
        const result = await saveGoalJobDescription(goalId, {
          targetRole: nextTargetRole,
          targetCompany: nextTargetCompany,
          jdText: nextJdText,
        });
        mergeRecord({
          targetRole: nextTargetRole ?? result.parsedJd.targetRole,
          targetCompany: nextTargetCompany,
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
        const result = await saveGoalRepoImport(goalId, {
          repoUrl: nextRepoUrl,
          repoContext: nextRepoContext,
        });
        mergeRecord({
          repoUrl: result.repoSummary.repoUrl,
          repoSummary: result.repoSummary,
        });
      }

      const result = await rebuildGoalGapReport(goalId);
      setQuota(result.quota ?? null);
      applyRecord(result);
      toast({
        title: 'Gap report ready',
        description: 'Your plan is now tied to a real target role.',
        status: 'success',
        duration: 3000,
        isClosable: true,
        position: 'top-right',
      });
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Failed to generate gap report.');
      setUpgradePlan(err?.response?.data?.upgradePlan ?? null);
    } finally {
      setRebuilding(false);
    }
  };

  const resumeSummary = record?.resumeSummary;
  const parsedJd = record?.parsedJd;
  const repoSummary = REPO_EVIDENCE_ENABLED ? record?.repoSummary : null;
  const gapReport = record?.gapReport;

  const handleSaveRepo = async () => {
    if (!REPO_EVIDENCE_ENABLED) {
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

  const normalizedResumeText = normalizeText(resumeText);
  const normalizedJdText = normalizeText(jdText);
  const hasResumeInput = !!normalizedResumeText;
  const hasTargetInput = !!normalizedJdText;
  const savedResumeText = normalizeText(record?.resumeText ?? '');
  const savedJdText = normalizeText(record?.jdText ?? '');
  const canGenerateReport =
    hasResumeInput &&
    hasTargetInput &&
    !rebuilding &&
    !savingRepo &&
    !uploadingResume &&
    !uploadingJd;
  const workflowSteps = [
    {
      title: 'Profile',
      description: hasResumeInput
        ? 'Resume uploaded'
        : 'Upload resume',
      state: hasResumeInput ? 'done' : 'current',
    },
    {
      title: 'Target',
      description: hasTargetInput
        ? 'Job description uploaded'
        : 'Upload job description',
      state: hasTargetInput ? 'done' : hasResumeInput ? 'current' : 'locked',
    },
    {
      title: 'Report',
      description: gapReport ? 'Gap report generated' : 'Generate missing skills and proof',
      state: gapReport ? 'done' : hasResumeInput && hasTargetInput ? 'current' : 'locked',
    },
  ] as const;

  return (
    <SurfaceCard p={5}>
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">
              Career gap analysis
            </span>
            <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
              Sprint feature
            </span>
          </div>
          <p className="text-sm leading-relaxed text-slate-600">
            Compare your current resume against a real job description, then turn the missing skills and proof gaps into sprint actions.
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
                  Upgrade to {upgradePlan} to unlock gap reports
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

          <div className="grid gap-3 lg:grid-cols-3">
            {workflowSteps.map((step, index) => (
              <WorkflowStep
                key={step.title}
                index={index + 1}
                title={step.title}
                description={step.description}
                state={step.state}
              />
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
            <SurfaceCard p={5} className="space-y-4 border-sky-100 bg-sky-50/40">
              <div className="flex flex-col gap-1">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-sky-700">
                  Step 1 - Current profile
                </p>
                <p className="text-lg font-extrabold tracking-[-0.03em] text-slate-900">
                  Upload the resume you would actually apply with.
                </p>
                <p className="text-sm leading-relaxed text-slate-600">
                  The app extracts and parses the document in the background. You only need to confirm the right file is loaded.
                </p>
              </div>

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
            </SurfaceCard>

            <SurfaceCard p={5} className="space-y-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-indigo-600">
                  Step 2 - Target role
                </p>
                <p className="mt-1 text-lg font-extrabold tracking-[-0.03em] text-slate-900">
                  Upload the job description for the role.
                </p>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">
                  Use the original JD document so we can parse responsibilities, must-have skills, and proof signals.
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                    Target role
                  </span>
                  <input
                    value={targetRole}
                    onChange={(event) => setTargetRole(event.target.value)}
                    placeholder="Senior Backend Engineer"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700 outline-none transition-colors focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                    Target company
                  </span>
                  <input
                    value={targetCompany}
                    onChange={(event) => setTargetCompany(event.target.value)}
                    placeholder="Optional"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700 outline-none transition-colors focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                  />
                </label>
              </div>

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
                  {uploadingJd ? 'Reading job description...' : 'Drop JD here or browse files'}
                </span>
                <span className="mt-2 block text-xs leading-relaxed text-slate-500">
                  Supports PDF, TXT, MD, and RTF. Upload the role description from the job post.
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
            </SurfaceCard>
          </div>

          {REPO_EVIDENCE_ENABLED && (
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

          <SurfaceCard p={4} className="border-slate-200 bg-slate-950 text-white">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-sky-200">
                  Step 3 - Generate report
                </p>
                <p className="mt-1 text-sm leading-relaxed text-slate-300">
                  We will parse both documents and generate missing skills, missing proof, interview risks, and sprint edits.
                </p>
              </div>
              <button
                type="button"
                onClick={handleGenerateReport}
                disabled={!canGenerateReport}
                className="inline-flex min-w-[190px] items-center justify-center rounded-2xl bg-white px-5 py-3 text-sm font-extrabold text-slate-950 transition-colors hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {rebuilding ? 'Generating...' : 'Generate gap report'}
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2 border-t border-white/10 pt-4">
              {!canGenerateReport && (
                <span className="inline-flex items-center text-xs text-slate-400">
                  Upload a resume and job description to generate the report.
                </span>
              )}
            </div>
          </SurfaceCard>

          {(resumeSummary || parsedJd || repoSummary) && (
            <div className="grid gap-4 md:grid-cols-3">
              {resumeSummary && (
                <SurfaceCard p={4}>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                    Current profile signals
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
                </SurfaceCard>
              )}

              {parsedJd && (
                <SurfaceCard p={4}>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                    Target role signals
                  </p>
                  <p className="mt-2 text-sm font-semibold text-slate-800">
                    {(parsedJd.targetRole ?? targetRole) || 'Target role'}
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
                    Sprint edits
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
              title="Generate a job-linked gap report"
              description="Add your resume and a target JD, then generate a gap report to see missing skills, missing proof, interview risks, and sprint edits."
              accent="neutral"
            />
          )}
        </div>
      )}
    </SurfaceCard>
  );
}
