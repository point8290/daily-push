import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useToast } from '@chakra-ui/react';
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.mjs?url';
import {
  createGoalFromResumeApplication,
  createResumeApplication as saveResumeApplication,
  createSprintFromResumeApplication,
  generateResumeApplicationTailoredResume,
  getResumeApplications,
  previewResumeFit,
  trackEvent,
  type ResumeApplicationWorkspace,
  type ResumeFitSnapshot,
} from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import { useEntitlements } from '../contexts/EntitlementsContext';
import SurfaceCard from '../components/ui/SurfaceCard';
import { hasProResumeAccess, hasSprintAccess } from '../utils/planAccess';

type DocumentKind = 'resume' | 'jobDescription';
type InputMode = 'upload' | 'paste';

interface StoredResumeDraft {
  resumeText: string;
  jdText: string;
  snapshot: ResumeFitSnapshot | null;
}

const DRAFT_STORAGE_KEY = 'dp_resume_funnel_draft';
const SUPPORTED_EXTENSIONS = new Set(['txt', 'md', 'markdown', 'rtf', 'pdf']);
const SUPPORTED_ACCEPT =
  '.txt,.md,.markdown,.rtf,.pdf,text/plain,text/markdown,application/rtf,application/pdf';

let pdfJsPromise: Promise<typeof import('pdfjs-dist')> | null = null;

const fitStyles: Record<ResumeFitSnapshot['fitLabel'], string> = {
  early: 'from-red-500 to-orange-500',
  building: 'from-amber-500 to-sky-500',
  close: 'from-emerald-500 to-teal-500',
};

function normalizeText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function saveDraft(draft: StoredResumeDraft) {
  sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
}

function loadDraft(): StoredResumeDraft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_STORAGE_KEY);
    return raw ? JSON.parse(raw) as StoredResumeDraft : null;
  } catch {
    return null;
  }
}

async function getPdfJs() {
  if (!pdfJsPromise) {
    pdfJsPromise = import('pdfjs-dist').then((pdfjs) => {
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

function normalizeDocumentText(value: string): string {
  return value
    .replace(/\u0000/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function getExtension(file: File): string {
  const parts = file.name.toLowerCase().split('.');
  return parts.length > 1 ? parts.pop() ?? '' : '';
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
      const pageText = normalizeDocumentText(
        textContent.items
          .map((item) => ('str' in item && typeof item.str === 'string' ? item.str : ''))
          .join(' '),
      );
      if (pageText) pageTexts.push(pageText);
    }
    return pageTexts.join('\n\n');
  } catch {
    throw new Error('Could not read that PDF. If it is scanned or image-only, paste the text instead.');
  } finally {
    await loadingTask.destroy();
  }
}

async function readDocumentFile(file: File, kind: DocumentKind): Promise<string> {
  const extension = getExtension(file);
  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    throw new Error(
      `Only PDF, TXT, MD, and RTF ${kind === 'resume' ? 'resumes' : 'job descriptions'} are supported right now.`,
    );
  }

  const text = extension === 'pdf'
    ? await extractPdfText(file)
    : normalizeDocumentText(extension === 'rtf' ? stripRtfToPlainText(await file.text()) : await file.text());

  if (text.length < (kind === 'resume' ? 10 : 20)) {
    throw new Error(`That ${kind === 'resume' ? 'resume' : 'job description'} does not have enough readable text.`);
  }
  if (text.length > (kind === 'resume' ? 40000 : 50000)) {
    throw new Error(`That ${kind === 'resume' ? 'resume' : 'job description'} is too large for one analysis.`);
  }
  return text;
}

function ResumeHeader() {
  const { user, signOut } = useAuth();

  return (
    <header className="sticky top-0 z-30 border-b border-white/50 bg-white/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 md:px-6">
        <Link to={user ? '/today' : '/resume'} className="flex items-center gap-3">
          <img src="/logo-mark.svg" alt="Daily Push" className="h-10 w-10 rounded-2xl shadow-lg" />
          <div>
            <p className="font-display text-lg font-semibold tracking-[-0.03em] text-slate-950">
              Daily Push
            </p>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
              Career progress system
            </p>
          </div>
        </Link>
        <div className="flex items-center gap-2">
          {user ? (
            <>
              <Link to="/today" className="hidden rounded-full px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 md:inline-flex">
                Today
              </Link>
              <Link to="/goals" className="hidden rounded-full px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 md:inline-flex">
                Goals
              </Link>
              <button
                type="button"
                onClick={signOut}
                className="rounded-full border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:border-slate-300"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="rounded-full px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100">
                Sign in
              </Link>
              <Link to="/login?mode=register&next=/resume" className="rounded-full bg-slate-950 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-slate-900/15">
                Save analysis
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function UploadDropzone({
  label,
  filename,
  onFile,
}: {
  label: string;
  filename: string | null;
  onFile: (file: File) => Promise<void>;
}) {
  const [dragActive, setDragActive] = useState(false);

  return (
    <label
      onDragOver={(event) => {
        event.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={async (event) => {
        event.preventDefault();
        setDragActive(false);
        const file = event.dataTransfer.files?.[0];
        if (file) await onFile(file);
      }}
      className={`flex min-h-[168px] cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed px-5 py-6 text-center transition ${
        dragActive ? 'border-sky-400 bg-sky-50' : 'border-slate-200 bg-slate-50/80 hover:border-slate-300'
      }`}
    >
      <input
        type="file"
        accept={SUPPORTED_ACCEPT}
        className="sr-only"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) await onFile(file);
        }}
      />
      <span className="rounded-full bg-white px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-slate-400 shadow-sm">
        {label}
      </span>
      <p className="mt-4 text-base font-extrabold text-slate-900">
        {filename ?? 'Drop a PDF or choose a file'}
      </p>
      <p className="mt-2 max-w-xs text-sm leading-relaxed text-slate-500">
        Text-based PDF, TXT, Markdown, and RTF files work best.
      </p>
    </label>
  );
}

function SnapshotActionCard({
  badge,
  title,
  description,
  children,
}: {
  badge: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
      <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
        {badge}
      </span>
      <h4 className="mt-3 text-base font-black tracking-[-0.03em] text-slate-950">
        {title}
      </h4>
      <p className="mt-2 min-h-[52px] text-xs leading-6 text-slate-600">
        {description}
      </p>
      <div className="mt-4">
        {children}
      </div>
    </div>
  );
}

export default function Resume() {
  const { user, loading: authLoading } = useAuth();
  const { currentPlan } = useEntitlements();
  const navigate = useNavigate();
  const toast = useToast();
  const [resumeText, setResumeText] = useState('');
  const [jdText, setJdText] = useState('');
  const [resumeMode, setResumeMode] = useState<InputMode>('upload');
  const [jdMode, setJdMode] = useState<InputMode>('upload');
  const [resumeFileName, setResumeFileName] = useState<string | null>(null);
  const [jdFileName, setJdFileName] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<ResumeFitSnapshot | null>(null);
  const [applications, setApplications] = useState<ResumeApplicationWorkspace[]>([]);
  const [activeApplication, setActiveApplication] = useState<ResumeApplicationWorkspace | null>(null);
  const [loadingApps, setLoadingApps] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [upgradePlan, setUpgradePlan] = useState<string | null>(null);

  const normalizedResumeText = useMemo(() => normalizeText(resumeText), [resumeText]);
  const normalizedJdText = useMemo(() => normalizeText(jdText), [jdText]);
  const canPreview = !!normalizedResumeText && !!normalizedJdText && !busy;
  const canGenerateTailoredResume = hasProResumeAccess(currentPlan?.planKey);
  const canCreateSprint = hasSprintAccess(currentPlan?.planKey);
  const hasSavedAnalysis = !!activeApplication?.gapReport;
  const savedStatusItems = activeApplication
    ? ([
      ['Snapshot', true],
      ['Full report', !!activeApplication.gapReport],
      ['Tailored resume', !!activeApplication.tailoredResume],
      ['Goal', !!activeApplication.linkedGoalId],
      ['Sprint', !!activeApplication.linkedSprintCreatedAt],
    ] as const)
    : [];
  const scrollToSavedAnalysis = () => {
    document.getElementById('saved-analysis')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const loadApplications = async () => {
    if (!user) return;
    setLoadingApps(true);
    try {
      const nextApplications = await getResumeApplications();
      setApplications(nextApplications);
      setActiveApplication((current) =>
        current ? nextApplications.find((item) => item.id === current.id) ?? current : nextApplications[0] ?? null,
      );
    } catch {
      setApplications([]);
    } finally {
      setLoadingApps(false);
    }
  };

  useEffect(() => {
    const draft = loadDraft();
    if (draft) {
      setResumeText(draft.resumeText);
      setJdText(draft.jdText);
      setSnapshot(draft.snapshot);
      setResumeMode('paste');
      setJdMode('paste');
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    void trackEvent({
      eventKey: 'resume_landing_viewed',
      properties: { authenticated: true },
    }).catch(() => {});
    void loadApplications();
  }, [user]);

  const handleDocumentFile = async (file: File, kind: DocumentKind) => {
    setBusy(kind === 'resume' ? 'resume-upload' : 'jd-upload');
    setError(null);
    try {
      const text = await readDocumentFile(file, kind);
      if (kind === 'resume') {
        setResumeText(text);
        setResumeFileName(file.name);
      } else {
        setJdText(text);
        setJdFileName(file.name);
      }
      setSnapshot(null);
    } catch (err: any) {
      setError(err?.message ?? 'Could not read that document.');
    } finally {
      setBusy(null);
    }
  };

  const handlePreview = async () => {
    if (!normalizedResumeText || !normalizedJdText) {
      setError('Add both your resume and the job description to generate a fit snapshot.');
      return;
    }
    setBusy('preview');
    setError(null);
    setUpgradePlan(null);
    try {
      const nextSnapshot = await previewResumeFit({
        rawText: normalizedResumeText,
        jdText: normalizedJdText,
      });
      setSnapshot(nextSnapshot);
      setActiveApplication(null);
      saveDraft({ resumeText: normalizedResumeText, jdText: normalizedJdText, snapshot: nextSnapshot });
      if (user) {
        void trackEvent({
          eventKey: 'resume_preview_generated',
          properties: {
            targetRole: nextSnapshot.targetRole,
            fitScore: nextSnapshot.fitScore,
            fitLabel: nextSnapshot.fitLabel,
          },
        }).catch(() => {});
      }
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Could not generate the resume fit snapshot.');
    } finally {
      setBusy(null);
    }
  };

  const saveAnalysis = async (redirectToWorkspace = true): Promise<ResumeApplicationWorkspace | null> => {
    if (!normalizedResumeText || !normalizedJdText) {
      setError('Add both your resume and the job description first.');
      return null;
    }
    if (!user) {
      saveDraft({ resumeText: normalizedResumeText, jdText: normalizedJdText, snapshot });
      navigate('/login?mode=register&next=/resume');
      return null;
    }

    setBusy('save');
    setError(null);
    setUpgradePlan(null);
    try {
      const result = await saveResumeApplication({
        rawText: normalizedResumeText,
        jdText: normalizedJdText,
        source: resumeFileName ? 'upload' : 'manual',
        title: snapshot?.targetRole ? `${snapshot.targetRole} application` : null,
      });
      setActiveApplication(result.application);
      await loadApplications();
      toast({
        title: 'Full analysis saved',
        description: 'Your requirement coverage report is saved and ready when you return.',
        status: 'success',
        duration: 2800,
        isClosable: true,
        position: 'top-right',
      });
      if (redirectToWorkspace) {
        navigate(`/resume/applications/${result.application.id}`);
      }
      return result.application;
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Could not save the full analysis.');
      setUpgradePlan(err?.response?.data?.upgradePlan ?? null);
      return null;
    } finally {
      setBusy(null);
    }
  };

  const ensureSavedApplication = async () => {
    if (activeApplication) return activeApplication;
    return saveAnalysis(false);
  };

  const handleCreateGoal = async () => {
    const application = await ensureSavedApplication();
    if (!application) return;
    setBusy('goal');
    setError(null);
    setUpgradePlan(null);
    try {
      const { goalId } = await createGoalFromResumeApplication(application.id);
      toast.closeAll();
      navigate(`/goals/${goalId}?source=resume`);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Could not create a career goal from this analysis.');
      setUpgradePlan(err?.response?.data?.upgradePlan ?? null);
    } finally {
      setBusy(null);
    }
  };

  const handleCreateSprint = async () => {
    const application = await ensureSavedApplication();
    if (!application) return;
    setBusy('sprint');
    setError(null);
    setUpgradePlan(null);
    try {
      const { goalId } = await createSprintFromResumeApplication(application.id);
      toast.closeAll();
      navigate(`/goals/${goalId}?source=resume`);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Could not create the sprint.');
      setUpgradePlan(err?.response?.data?.upgradePlan ?? null);
    } finally {
      setBusy(null);
    }
  };

  const handleGenerateTailoredResume = async () => {
    const application = await ensureSavedApplication();
    if (!application) return;
    setBusy('tailored-resume');
    setError(null);
    setUpgradePlan(null);
    try {
      const result = await generateResumeApplicationTailoredResume(application.id);
      setActiveApplication(result.application);
      await loadApplications();
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

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.16),transparent_32%),radial-gradient(circle_at_80%_10%,rgba(249,115,22,0.14),transparent_28%),linear-gradient(180deg,#f8fbff_0%,#eef5ff_100%)]">
      <ResumeHeader />

      <main className="mx-auto max-w-7xl px-4 py-8 md:px-6 md:py-12">
        <section className="grid gap-8 lg:grid-cols-[1.02fr_0.98fr] lg:items-center">
          <div>
            <div className="inline-flex rounded-full border border-sky-200 bg-white/70 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-sky-700 shadow-sm">
              Free resume fit snapshot
            </div>
            <h1 className="mt-5 max-w-4xl font-display text-5xl font-semibold leading-[0.93] tracking-[-0.06em] text-slate-950 md:text-7xl">
              Find out if your resume is ready for this job.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-9 text-slate-600">
              Upload your resume and a job description. Daily Push shows your fit, the highest-impact gaps,
              and the next move: save the full analysis, tailor the resume, or turn the gaps into a focused sprint.
            </p>
            <div className="mt-7 grid gap-3 sm:grid-cols-3">
              {[
                ['Resume', 'Job-specific fit and missing keywords'],
                ['Goal', 'Your long-term career outcome'],
                ['Sprint', 'A 2-8 week push to close gaps'],
              ].map(([title, body]) => (
                <SurfaceCard key={title} p={4} className="bg-white/75">
                  <p className="text-sm font-black text-slate-950">{title}</p>
                  <p className="mt-2 text-sm leading-relaxed text-slate-500">{body}</p>
                </SurfaceCard>
              ))}
            </div>
          </div>

          <SurfaceCard p={{ base: 5, md: 6 }} className="bg-white/90">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                    Step 1
                  </p>
                  <h2 className="mt-1 text-2xl font-black tracking-[-0.04em] text-slate-950">
                    Add your documents
                  </h2>
                </div>
                <p className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">
                  {user ? 'Signed in' : 'No account required'}
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <div className="mb-3 flex rounded-full bg-slate-100 p-1 text-xs font-black text-slate-500">
                    {(['upload', 'paste'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setResumeMode(mode)}
                        className={`flex-1 rounded-full px-3 py-2 capitalize ${resumeMode === mode ? 'bg-white text-slate-950 shadow-sm' : ''}`}
                      >
                        {mode} resume
                      </button>
                    ))}
                  </div>
                  {resumeMode === 'upload' ? (
                    <UploadDropzone
                      label="Resume"
                      filename={resumeFileName}
                      onFile={(file) => handleDocumentFile(file, 'resume')}
                    />
                  ) : (
                    <textarea
                      value={resumeText}
                      onChange={(event) => {
                        setResumeText(event.target.value);
                        setSnapshot(null);
                      }}
                      rows={9}
                      placeholder="Paste your resume here..."
                      className="min-h-[168px] w-full resize-y rounded-3xl border border-slate-200 bg-slate-50/80 px-4 py-4 text-sm leading-relaxed text-slate-700 outline-none transition focus:border-sky-300 focus:bg-white"
                    />
                  )}
                </div>

                <div>
                  <div className="mb-3 flex rounded-full bg-slate-100 p-1 text-xs font-black text-slate-500">
                    {(['upload', 'paste'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setJdMode(mode)}
                        className={`flex-1 rounded-full px-3 py-2 capitalize ${jdMode === mode ? 'bg-white text-slate-950 shadow-sm' : ''}`}
                      >
                        {mode === 'upload' ? 'Upload job description' : 'Paste job description'}
                      </button>
                    ))}
                  </div>
                  {jdMode === 'upload' ? (
                    <UploadDropzone
                      label="Job description"
                      filename={jdFileName}
                      onFile={(file) => handleDocumentFile(file, 'jobDescription')}
                    />
                  ) : (
                    <textarea
                      value={jdText}
                      onChange={(event) => {
                        setJdText(event.target.value);
                        setSnapshot(null);
                      }}
                      rows={9}
                      placeholder="Paste the target job description here..."
                      className="min-h-[168px] w-full resize-y rounded-3xl border border-slate-200 bg-slate-50/80 px-4 py-4 text-sm leading-relaxed text-slate-700 outline-none transition focus:border-sky-300 focus:bg-white"
                    />
                  )}
                </div>
              </div>

              {error && (
                <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                  {error}
                  {upgradePlan && (
                    <Link to="/pricing?source=resume" className="ml-2 text-red-900 underline">
                      Upgrade to {upgradePlan}
                    </Link>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={handlePreview}
                disabled={!canPreview}
                className="rounded-2xl bg-slate-950 px-5 py-4 text-sm font-black text-white shadow-xl shadow-slate-900/20 transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
              >
                {busy === 'preview' ? 'Generating snapshot...' : 'Generate free fit snapshot'}
              </button>
            </div>
          </SurfaceCard>
        </section>

        {snapshot && (
          <section className="mt-8 grid gap-6 lg:grid-cols-[0.82fr_1.18fr]">
            <SurfaceCard
              p={{ base: 5, md: 6 }}
              bg="#020617"
              color="white"
              borderColor="rgba(255,255,255,0.12)"
              className="overflow-hidden"
            >
              <p className="text-xs font-black uppercase tracking-[0.18em] text-white/50">
                Resume fit snapshot
              </p>
              <div className={`mt-5 inline-flex h-28 w-28 items-center justify-center rounded-[2rem] bg-gradient-to-br ${fitStyles[snapshot.fitLabel]} text-4xl font-black shadow-2xl`}>
                {snapshot.fitScore}
              </div>
              <h2 className="mt-5 text-3xl font-black tracking-[-0.05em]">
                {snapshot.headline}
              </h2>
              <p className="mt-4 text-sm leading-8 text-white/70">
                {snapshot.summary}
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={hasSavedAnalysis ? scrollToSavedAnalysis : () => void saveAnalysis(true)}
                  disabled={!!busy}
                  className="rounded-full bg-white px-5 py-3 text-sm font-black text-slate-950 disabled:opacity-60"
                >
                  {hasSavedAnalysis ? 'View full report' : user ? 'Save full analysis' : 'Create account to save'}
                </button>
                {canCreateSprint ? (
                  <button
                    type="button"
                    onClick={handleCreateSprint}
                    disabled={!!busy}
                    className="rounded-full border border-white/20 px-5 py-3 text-sm font-black text-white hover:bg-white/10 disabled:opacity-60"
                  >
                    Build gap-closing sprint
                  </button>
                ) : activeApplication ? (
                  <Link
                    to="/pricing?source=resume"
                    className="rounded-full border border-white/20 px-5 py-3 text-sm font-black text-white hover:bg-white/10"
                  >
                    Start Sprint plan
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => void saveAnalysis(true)}
                    disabled={!!busy}
                    className="rounded-full border border-white/20 px-5 py-3 text-sm font-black text-white hover:bg-white/10 disabled:opacity-60"
                  >
                    Save report first
                  </button>
                )}
              </div>
            </SurfaceCard>

            <div className="grid gap-5">
              <div className="grid gap-5 md:grid-cols-2">
                <SurfaceCard p={5} className="bg-white/90">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-600">
                    Strengths to lead with
                  </p>
                  <div className="mt-4 space-y-3">
                    {snapshot.topStrengths.map((item) => (
                      <p key={item} className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
                        {item}
                      </p>
                    ))}
                  </div>
                </SurfaceCard>

                <SurfaceCard p={5} className="bg-white/90">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-600">
                    Highest-impact gaps
                  </p>
                  <div className="mt-4 space-y-3">
                    {snapshot.topGaps.map((item) => (
                      <div key={`${item.name}-${item.priority}`} className="rounded-2xl bg-orange-50 px-4 py-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-black text-orange-900">{item.name}</p>
                          <span className="rounded-full bg-white px-2 py-1 text-[10px] font-black uppercase text-orange-600">
                            {item.priority}
                          </span>
                        </div>
                        <p className="mt-2 text-xs leading-relaxed text-orange-800">{item.reason}</p>
                      </div>
                    ))}
                  </div>
                </SurfaceCard>
              </div>

              <SurfaceCard p={5} className="bg-white/90">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                  What you can do next
                </p>
                <h3 className="mt-2 text-xl font-black tracking-[-0.04em] text-slate-950">
                  Choose the next step for this application
                </h3>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <SnapshotActionCard
                    badge={user ? 'Free account' : 'Account'}
                    title="Full requirement coverage"
                    description="Save the report to see each job requirement mapped to covered, weak, or missing resume evidence."
                  >
                    {hasSavedAnalysis && activeApplication ? (
                      <Link
                        to={`/resume/applications/${activeApplication.id}`}
                        className="inline-flex rounded-full bg-slate-950 px-4 py-2 text-sm font-black text-white"
                      >
                        Open full report
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void saveAnalysis(true)}
                        disabled={!!busy}
                        className="rounded-full bg-slate-950 px-4 py-2 text-sm font-black text-white disabled:opacity-60"
                      >
                        {user ? 'Save full analysis' : 'Create account to save'}
                      </button>
                    )}
                  </SnapshotActionCard>

                  <SnapshotActionCard
                    badge="Pro"
                    title="Tailored resume draft"
                    description="Generate a job-specific resume draft grounded in the evidence already present in your resume."
                  >
                    {!user || !activeApplication ? (
                      <button
                        type="button"
                        onClick={() => void saveAnalysis(true)}
                        disabled={!!busy}
                        className="rounded-full bg-slate-950 px-4 py-2 text-sm font-black text-white disabled:opacity-60"
                      >
                        {user ? 'Save analysis first' : 'Create account first'}
                      </button>
                    ) : canGenerateTailoredResume ? (
                      <button
                        type="button"
                        onClick={handleGenerateTailoredResume}
                        disabled={!!busy}
                        className="rounded-full bg-slate-950 px-4 py-2 text-sm font-black text-white disabled:opacity-60"
                      >
                        Generate resume
                      </button>
                    ) : (
                      <Link
                        to="/pricing?source=resume"
                        className="inline-flex rounded-full border border-slate-200 px-4 py-2 text-sm font-black text-slate-700 hover:border-sky-300 hover:text-sky-700"
                      >
                        Upgrade to Pro
                      </Link>
                    )}
                  </SnapshotActionCard>

                  <SnapshotActionCard
                    badge="Sprint"
                    title="Gap-closing sprint plan"
                    description="Turn the weakest requirements into a focused 2-8 week plan with proof-building tasks."
                  >
                    {!user || !activeApplication ? (
                      <button
                        type="button"
                        onClick={() => void saveAnalysis(true)}
                        disabled={!!busy}
                        className="rounded-full bg-slate-950 px-4 py-2 text-sm font-black text-white disabled:opacity-60"
                      >
                        {user ? 'Save analysis first' : 'Create account first'}
                      </button>
                    ) : canCreateSprint ? (
                      <button
                        type="button"
                        onClick={handleCreateSprint}
                        disabled={!!busy}
                        className="rounded-full bg-slate-950 px-4 py-2 text-sm font-black text-white disabled:opacity-60"
                      >
                        Build sprint
                      </button>
                    ) : (
                      <Link
                        to="/pricing?source=resume"
                        className="inline-flex rounded-full border border-slate-200 px-4 py-2 text-sm font-black text-slate-700 hover:border-sky-300 hover:text-sky-700"
                      >
                        Start Sprint plan
                      </Link>
                    )}
                  </SnapshotActionCard>

                  <SnapshotActionCard
                    badge="Sprint"
                    title="Proof builder and interview prep"
                    description="Get project ideas, interview risks, and practice focus areas based on the missing evidence in the report."
                  >
                    {!user || !activeApplication ? (
                      <button
                        type="button"
                        onClick={() => void saveAnalysis(true)}
                        disabled={!!busy}
                        className="rounded-full bg-slate-950 px-4 py-2 text-sm font-black text-white disabled:opacity-60"
                      >
                        {user ? 'Save analysis first' : 'Create account first'}
                      </button>
                    ) : canCreateSprint ? (
                      <button
                        type="button"
                        onClick={handleCreateSprint}
                        disabled={!!busy}
                        className="rounded-full bg-slate-950 px-4 py-2 text-sm font-black text-white disabled:opacity-60"
                      >
                        Plan proof work
                      </button>
                    ) : (
                      <Link
                        to="/pricing?source=resume"
                        className="inline-flex rounded-full border border-slate-200 px-4 py-2 text-sm font-black text-slate-700 hover:border-sky-300 hover:text-sky-700"
                      >
                        Unlock Sprint
                      </Link>
                    )}
                  </SnapshotActionCard>
                </div>
              </SurfaceCard>
            </div>
          </section>
        )}

        {activeApplication?.gapReport && (
          <section id="saved-analysis" className="mt-8 scroll-mt-24">
            <SurfaceCard p={{ base: 5, md: 6 }} className="bg-white/95">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                    Full resume report
                  </p>
                  <h2 className="mt-2 text-3xl font-black tracking-[-0.05em] text-slate-950">
                    {activeApplication.title}
                  </h2>
                  <p className="mt-3 max-w-3xl text-sm leading-8 text-slate-600">
                    {activeApplication.gapReport.summary}
                  </p>
                  {savedStatusItems.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {savedStatusItems.map(([label, complete]) => (
                        <span
                          key={label}
                          className={`rounded-full px-3 py-1 text-xs font-black ${
                            complete ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {complete ? 'Ready' : 'Next'}: {label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleCreateGoal}
                    disabled={!!busy}
                    className="rounded-full bg-slate-950 px-4 py-2 text-sm font-black text-white disabled:opacity-60"
                  >
                    Create career goal
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateSprint}
                    disabled={!!busy}
                    className="rounded-full border border-slate-200 px-4 py-2 text-sm font-black text-slate-700 hover:border-sky-300 hover:text-sky-700 disabled:opacity-60"
                  >
                    Turn gaps into sprint
                  </button>
                </div>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-3">
                {activeApplication.gapReport.requirementCoverage.slice(0, 6).map((item) => (
                  <div key={`${item.requirement}-${item.status}`} className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-black text-slate-900">{item.requirement}</p>
                      <span className="rounded-full bg-white px-2 py-1 text-[10px] font-black uppercase text-slate-500">
                        {item.status}
                      </span>
                    </div>
                    <p className="mt-3 text-xs leading-relaxed text-slate-600">{item.action}</p>
                  </div>
                ))}
              </div>

              {activeApplication.tailoredResume && (
                <SurfaceCard p={5} className="mt-6 bg-slate-50">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                    Tailored resume draft
                  </p>
                  <h3 className="mt-2 text-2xl font-black tracking-[-0.04em] text-slate-950">
                    {activeApplication.tailoredResume.headline}
                  </h3>
                  <p className="mt-3 text-sm leading-8 text-slate-600">
                    {activeApplication.tailoredResume.professionalSummary}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {activeApplication.tailoredResume.atsKeywords.slice(0, 14).map((keyword) => (
                      <span key={keyword} className="rounded-full bg-white px-3 py-1 text-xs font-bold text-sky-700">
                        {keyword}
                      </span>
                    ))}
                  </div>
                </SurfaceCard>
              )}
            </SurfaceCard>
          </section>
        )}

        {user && (
          <section className="mt-8">
            <SurfaceCard p={5} className="bg-white/85">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                    Saved applications
                  </p>
                  <p className="mt-2 text-sm text-slate-500">
                    Keep each job analysis organized so you can return to the report, resume draft, and next steps.
                  </p>
                </div>
                {loadingApps && <span className="text-xs font-bold text-slate-400">Loading...</span>}
              </div>
              <div className="mt-4 space-y-3">
                {applications.length === 0 ? (
                  <p className="rounded-2xl bg-slate-50 px-4 py-4 text-sm text-slate-500">
                    Save your first analysis to keep the full report and continue from where you left off.
                  </p>
                ) : applications.map((application) => (
                  <Link
                    key={application.id}
                    to={`/resume/applications/${application.id}`}
                    className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                      activeApplication?.id === application.id
                        ? 'border-sky-200 bg-sky-50'
                        : 'border-slate-100 bg-slate-50 hover:border-slate-200'
                    }`}
                  >
                    <p className="text-sm font-black text-slate-900">{application.title}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {application.targetRole ?? 'Target role'} - {application.linkedSprintCreatedAt ? 'Sprint created' : application.linkedGoalId ? 'Goal created' : 'Resume analysis'}
                    </p>
                  </Link>
                ))}
              </div>
            </SurfaceCard>
          </section>
        )}

        {snapshot && !authLoading && !user && (
          <section className="mt-8">
            <SurfaceCard p={6} className="bg-white/80 text-center">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                Ready to keep going?
              </p>
              <h2 className="mt-2 text-3xl font-black tracking-[-0.05em] text-slate-950">
                Save the analysis, then turn it into a plan.
              </h2>
              <p className="mx-auto mt-3 max-w-2xl text-sm leading-8 text-slate-600">
                The free snapshot tells you where you stand. Save the analysis to keep the full report,
                resume tailoring, goal creation, and a sprint plan in one place.
              </p>
              <Link to="/login?mode=register&next=/resume" className="mt-5 inline-flex rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-xl shadow-slate-900/20">
                Create account and continue
              </Link>
            </SurfaceCard>
          </section>
        )}
      </main>
    </div>
  );
}
