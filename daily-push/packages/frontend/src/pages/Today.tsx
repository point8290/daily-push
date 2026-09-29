import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useActiveDirection } from '../contexts/DirectionContext';
import { useEntitlements } from '../contexts/EntitlementsContext';
import EmptyState from '../components/ui/EmptyState';
import AppModal from '../components/ui/AppModal';
import WeeklyCheckinModal from '../components/WeeklyCheckinModal';
import PageHeader from '../components/ui/PageHeader';
import SurfaceCard from '../components/ui/SurfaceCard';
import {
  completeSession,
  evaluateSessionArtifact,
  getGoalProgress,
  getGoalWeeklyCheckin,
  getNodeResources,
  getSessionTask,
  getToday,
  getWeeklyReport,
  saveSessionArtifact,
  startSession,
  trackEvent,
  type GapChange,
  type GoalGapProgress,
  type GoalWeeklyCheckinState,
  type NodeResource,
  type SessionArtifactEvaluation,
  type SessionTask,
  type WeeklyReport,
} from '../api/client';

const resourceTypeIcon: Record<string, string> = {
  article: 'DOC',
  video: 'VID',
  course: 'CRS',
  docs: 'API',
  paper: 'PDF',
  github: 'GIT',
};

const taskTypeLabel: Record<SessionTask['taskType'], string> = {
  explain: 'Explain',
  design: 'Design',
  code: 'Code',
  apply: 'Apply',
  review: 'Review',
};

function previewTaskType(node: NodeInfo, review: boolean): SessionTask['taskType'] {
  if (review) return 'review';
  const signal = `${node.title} ${node.description ?? ''}`.toLowerCase();
  if (/(design|architecture|system|scal|throughput|latency|api contract)/.test(signal)) return 'design';
  if (/(algorithm|implement|code|component|function|query|hook|schema|endpoint)/.test(signal)) return 'code';
  if (node.depth_level === 'intermediate' || node.depth_level === 'advanced') return 'apply';
  return 'explain';
}

function artifactLine(taskType: SessionTask['taskType'], title: string): string {
  switch (taskType) {
    case 'design':
      return `A design note on ${title}.`;
    case 'code':
      return `A short implementation sketch of ${title}.`;
    case 'apply':
      return `A note on how you would use ${title}.`;
    case 'review':
      return `A recall note that keeps ${title} sharp.`;
    default:
      return `A short explanation of ${title}.`;
  }
}

function voiceLine(taskType: SessionTask['taskType'], title: string): string {
  switch (taskType) {
    case 'design':
      return `Voice can cite the trade-off you chose for ${title}.`;
    case 'code':
      return `Voice can point at the sketch you wrote for ${title}.`;
    case 'apply':
      return `Voice can describe a real use of ${title}.`;
    case 'review':
      return `Voice can say you can still explain ${title}.`;
    default:
      return `Voice can use your explanation of ${title}.`;
  }
}

function urlDomain(url: string): string {
  try { return new URL(url).hostname.replace('www.', ''); }
  catch { return url.slice(0, 40); }
}

interface NodeInfo {
  id: string;
  title: string;
  description: string;
  depth_level: string;
  estimated_mins: number;
  learning_topic_id: string;
  dueAt?: string;
}

interface TodayData {
  goal: {
    id: string;
    title: string;
    status: string;
    totalNodes: number;
    doneNodes: number;
    estimatedWeeksRemaining: number;
    topicsMap: Record<string, string>;
  } | null;
  pendingGoal: {
    id: string;
    title: string;
    status: string;
  } | null;
  node: NodeInfo | null;
  reviewNode: NodeInfo | null;
  streak: number;
}

const depthLabel: Record<string, string> = {
  surface: 'Surface',
  foundational: 'Foundational',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

const confidenceLabels: Record<number, string> = {
  1: 'Barely recall',
  2: 'Fuzzy memory',
  3: 'Getting there',
  4: 'Solid grasp',
  5: 'Nailed it',
};

const confStyle: Record<number, { border: string; bg: string; fg: string }> = {
  1: { border: 'var(--red-400)', bg: 'var(--red-50)', fg: 'var(--red-600)' },
  2: { border: 'var(--orange-400)', bg: 'var(--orange-50)', fg: 'var(--orange-600)' },
  3: { border: 'var(--amber-400)', bg: 'var(--amber-100)', fg: 'var(--amber-700)' },
  4: { border: 'var(--sky-400)', bg: 'var(--sky-50)', fg: 'var(--sky-700)' },
  5: { border: 'var(--emerald-400)', bg: 'var(--emerald-50)', fg: 'var(--emerald-700)' },
};

const TIMEBOXES = [15, 30, 60];

type Stage = 'idle' | 'in_session' | 'rating' | 'done';

function useTimer(timebox: number, active: boolean) {
  const [elapsed, setElapsed] = useState(0);
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (active) {
      ref.current = setInterval(() => setElapsed((value) => value + 1), 1000);
    } else {
      if (ref.current) clearInterval(ref.current);
      setElapsed(0);
    }
    return () => {
      if (ref.current) clearInterval(ref.current);
    };
  }, [active]);

  const totalSecs = timebox * 60;
  const remaining = Math.max(0, totalSecs - elapsed);
  return {
    mins: Math.floor(remaining / 60),
    secs: remaining % 60,
    pct: Math.min(100, (elapsed / totalSecs) * 100),
  };
}

function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <SurfaceCard p={5} className={className}>
      {children}
    </SurfaceCard>
  );
}

function EvaluationCard({ evaluation }: { evaluation: SessionArtifactEvaluation }) {
  return (
    <div className={`space-y-4 rounded-2xl border p-4 ${
      evaluation.correct
        ? 'border-emerald-200 bg-emerald-50'
        : 'border-amber-200 bg-amber-50'
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-500">
            AI review
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-800">
            {evaluation.feedback}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">
          {evaluation.score}/5
        </span>
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        {evaluation.rubricScores.map((dimension) => (
          <div key={dimension.dimension} className="rounded-xl border border-white/70 bg-white/60 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold capitalize text-slate-700">
                {dimension.dimension}
              </span>
              <span className="text-xs font-mono text-slate-500">{dimension.score}/5</span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              {dimension.feedback}
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl bg-white/70 px-3 py-3">
          <p className="text-xs font-semibold text-slate-400">
            Working
          </p>
          <div className="mt-2 space-y-1 text-sm text-slate-700">
            {evaluation.strengths.length > 0 ? (
              evaluation.strengths.map((item) => <p key={item}>- {item}</p>)
            ) : (
              <p>Keep the parts that already feel clear and concrete.</p>
            )}
          </div>
        </div>
        <div className="rounded-xl bg-white/70 px-3 py-3">
          <p className="text-xs font-semibold text-slate-400">
            Tighten
          </p>
          <div className="mt-2 space-y-1 text-sm text-slate-700">
            {evaluation.improvements.length > 0 ? (
              evaluation.improvements.map((item) => <p key={item}>- {item}</p>)
            ) : (
              <p>Add one more example or trade-off before you move on.</p>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-white/80 bg-white/70 px-3 py-3">
        <p className="text-xs font-semibold text-slate-400">
          Retry prompt
        </p>
        <p className="mt-1 text-sm leading-relaxed text-slate-700">
          {evaluation.retryPrompt}
        </p>
      </div>
    </div>
  );
}

export default function Today() {
  const [searchParams] = useSearchParams();
  const preferredNodeId = searchParams.get('node');
  const direction = useActiveDirection();
  const { currentPlan, entitlements } = useEntitlements();

  const [data, setData] = useState<TodayData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [weeklyReport, setWeeklyReport] = useState<WeeklyReport | null>(null);
  const [weeklyCheckin, setWeeklyCheckin] = useState<GoalWeeklyCheckinState | null>(null);
  const [weeklyLoading, setWeeklyLoading] = useState(false);

  const [activeNode, setActiveNode] = useState<NodeInfo | null>(null);
  const [isReview, setIsReview] = useState(false);
  const [timebox, setTimebox] = useState(30);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const [confidence, setConfidence] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);
  const [unlockedTitles, setUnlockedTitles] = useState<string[]>([]);
  const [milestones, setMilestones] = useState<string[]>([]);
  const [gapChanges, setGapChanges] = useState<GapChange[]>([]);
  const [requeued, setRequeued] = useState(false);
  const [gapProgress, setGapProgress] = useState<GoalGapProgress | null>(null);
  const [sessionStartedAt, setSessionStartedAt] = useState<Date | null>(null);
  const [resources, setResources] = useState<NodeResource[]>([]);
  const [task, setTask] = useState<SessionTask | null>(null);
  const [taskLoading, setTaskLoading] = useState(false);
  const [artifactContent, setArtifactContent] = useState('');
  const [artifactEvaluation, setArtifactEvaluation] =
    useState<SessionArtifactEvaluation | null>(null);
  const [savingArtifact, setSavingArtifact] = useState(false);
  const [evaluatingArtifact, setEvaluatingArtifact] = useState(false);
  const [movingToRating, setMovingToRating] = useState(false);
  const [notes, setNotes] = useState('');
  const [checkinOpen, setCheckinOpen] = useState(false);

  const { mins, secs, pct } = useTimer(timebox, stage === 'in_session' || stage === 'rating');
  const weeklyReportsEnabled = entitlements.find(
    (entry) => entry.featureKey === 'weekly_reports.enabled',
  )?.enabled;
  const aiChecksEntitlement = entitlements.find(
    (entry) => entry.featureKey === 'ai_checks.monthly',
  );

  const resetSessionState = () => {
    setStage('idle');
    setActiveNode(null);
    setIsReview(false);
    setSessionId(null);
    setConfidence(0);
    setUnlockedTitles([]);
    setMilestones([]);
    setSessionStartedAt(null);
    setResources([]);
    setTask(null);
    setTaskLoading(false);
    setArtifactContent('');
    setArtifactEvaluation(null);
    setSavingArtifact(false);
    setEvaluatingArtifact(false);
    setMovingToRating(false);
    setNotes('');
  };

  const load = async () => {
    setLoading(true);
    try {
      const todayData = await getToday(preferredNodeId ?? undefined);
      setData(todayData);
      if (todayData.goal?.id) {
        getGoalProgress(todayData.goal.id).then(setGapProgress).catch(() => setGapProgress(null));
      }
      void trackEvent({
        eventKey: 'today_viewed',
        goalId: todayData.goal?.id,
        properties: {
          hasGoal: !!todayData.goal,
          hasNode: !!todayData.node,
          hasReviewNode: !!todayData.reviewNode,
          streak: todayData.streak,
        },
      }).catch(() => {});
    } catch {
      setError("Failed to load today's session");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const goalId = data?.goal?.id;

    if (!goalId) {
      setWeeklyReport(null);
      setWeeklyCheckin(null);
      return;
    }

    const loadWeeklyState = async () => {
      setWeeklyLoading(true);
      try {
        if (weeklyReportsEnabled) {
          try {
            const report = await getWeeklyReport(goalId);
            setWeeklyReport(report);
          } catch {
            setWeeklyReport(null);
          }
        } else {
          setWeeklyReport(null);
        }

        const checkin = await getGoalWeeklyCheckin(goalId);
        setWeeklyCheckin(checkin);
      } catch {
        setWeeklyCheckin(null);
      } finally {
        setWeeklyLoading(false);
      }
    };

    void loadWeeklyState();
  }, [data?.goal?.id, weeklyReportsEnabled]);

  const handleStartSession = async (node: NodeInfo, review = false) => {
    if (!data?.goal?.id) return;

    setError('');
    setActiveNode(node);
    setIsReview(review);
    setStage('in_session');
    setSessionStartedAt(new Date());
    setTaskLoading(true);
    setArtifactContent('');
    setArtifactEvaluation(null);
    setNotes('');
    setResources([]);

    void trackEvent({
      eventKey: review ? 'review_session_requested' : 'study_session_requested',
      goalId: data.goal.id,
      properties: {
        nodeId: node.id,
        depthLevel: node.depth_level,
        estimatedMins: node.estimated_mins,
        timebox,
      },
    }).catch(() => {});

    try {
      const { sessionId: sid } = await startSession(
        node.id,
        review ? 'review' : 'new',
        timebox,
      );
      setSessionId(sid);

      const [taskPayload, nodeResources] = await Promise.all([
        getSessionTask(sid),
        getNodeResources(data.goal.id, node.id).catch(() => []),
      ]);

      setTask(taskPayload);
      setArtifactContent(taskPayload.artifact?.content ?? '');
      setArtifactEvaluation(taskPayload.artifact?.evaluation ?? null);
      if (taskPayload.artifact?.evaluation && !confidence) {
        setConfidence(taskPayload.artifact.evaluation.score);
      }
      setResources(nodeResources);
    } catch {
      setError('Could not start this session right now. Try again.');
      resetSessionState();
    } finally {
      setTaskLoading(false);
    }
  };

  const persistArtifact = async () => {
    if (!sessionId || !artifactContent.trim()) {
      throw new Error('Write your deliverable before continuing.');
    }

    setSavingArtifact(true);
    try {
      const updatedTask = await saveSessionArtifact(sessionId, artifactContent.trim());
      setTask(updatedTask);
      setArtifactContent(updatedTask.artifact?.content ?? artifactContent.trim());
      return updatedTask;
    } finally {
      setSavingArtifact(false);
    }
  };

  const handleEvaluateArtifact = async () => {
    if (!sessionId) return;
    if (artifactContent.trim().length < 25) {
      setError('Write a bit more before requesting AI review.');
      return;
    }

    setError('');
    setEvaluatingArtifact(true);
    try {
      void trackEvent({
        eventKey: 'artifact_review_requested',
        goalId: data?.goal?.id,
        sessionId,
        properties: {
          contentLength: artifactContent.trim().length,
          taskType: task?.taskType ?? null,
        },
      }).catch(() => {});

      const evaluation = await evaluateSessionArtifact(sessionId, artifactContent.trim());
      setArtifactEvaluation(evaluation);
      if (!confidence) {
        setConfidence(evaluation.score);
      }
      if (evaluation.quota) {
        void trackEvent({
          eventKey: 'artifact_review_completed',
          goalId: data?.goal?.id,
          sessionId,
          properties: {
            score: evaluation.score,
            remainingChecks: evaluation.quota.remaining,
          },
        }).catch(() => {});
      }
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Could not review your artifact right now.');
    } finally {
      setEvaluatingArtifact(false);
    }
  };

  const handleMoveToRating = async () => {
    if (artifactContent.trim().length < 25) {
      setError('Your session should end with a real deliverable. Add a bit more detail first.');
      return;
    }

    setError('');
    setMovingToRating(true);
    try {
      await persistArtifact();
      setStage('rating');
    } catch (err: any) {
      setError(err?.message ?? 'Could not save your work right now.');
    } finally {
      setMovingToRating(false);
    }
  };

  const handleComplete = async () => {
    if (!confidence || !activeNode || !sessionId) return;

    setSubmitting(true);
    setError('');

    try {
      if (artifactContent.trim().length >= 25) {
        await persistArtifact();
      }

      const durationMins = sessionStartedAt
        ? Math.max(1, Math.round((Date.now() - sessionStartedAt.getTime()) / 60_000))
        : timebox;

      const result = await completeSession(
        sessionId,
        confidence,
        durationMins,
        notes.trim() || undefined,
      );

      setUnlockedTitles(result.unlockedNodeTitles ?? []);
      setMilestones(result.newMilestones ?? []);
      setGapChanges(result.gapChanges ?? []);
      setRequeued(Boolean(result.requeued));
      setStage('done');
    } catch {
      setError('Failed to save session. Try again.');
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-7 w-7 animate-spin rounded-full border-[3px] border-slate-200 border-t-sky-500" />
      </div>
    );
  }

  if (!data?.goal) {
    if (data?.pendingGoal) {
      return (
        <div className="space-y-6">
          <PageHeader
            eyebrow="Path review"
            title="Your path is waiting for review"
            description="Confirm the path when it matches the direction you want to build."
          />
          <EmptyState
            title={data.pendingGoal.title}
            description="This direction is not active yet. Today schedules a session after you confirm the path."
            accent="brand"
            action={(
              <Link
                to={`/path?goal=${data.pendingGoal.id}`}
                className="inline-block rounded-xl bg-[var(--brand-primary)] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--brand-primary-hov)]"
              >
                Review path
              </Link>
            )}
          />
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Daily focus"
          title="Today"
          description="Choose a direction, confirm the path, and Today will hold one session."
        />
        <EmptyState
          title="No active direction yet"
          description="Name where you want leverage. Confirming the path unlocks the first session."
          accent="warning"
          action={(
            <Link
              to="/directions"
              className="inline-block rounded-xl bg-[var(--brand-primary)] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--brand-primary-hov)]"
            >
              Choose a direction
            </Link>
          )}
        />
      </div>
    );
  }

  if (data.goal.totalNodes === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Daily focus"
          title="Today"
          description="The direction is saved. The path still needs its concept graph before Today can schedule a session."
        />
        <EmptyState
          title="The path is not built yet"
          description="Open the path, finish the concept graph, and come back when the first session is ready."
          accent="brand"
          action={(
            <Link
              to={`/path?goal=${data.goal.id}`}
              className="inline-block rounded-xl bg-[var(--brand-primary)] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--brand-primary-hov)]"
            >
              Open path
            </Link>
          )}
        />
      </div>
    );
  }

  const { goal, node, reviewNode, streak } = data;
  const progressPct =
    goal.totalNodes > 0
      ? Math.round((goal.doneNodes / goal.totalNodes) * 100)
      : 0;
  const topicTitle = (item: NodeInfo) =>
    goal.topicsMap[item.learning_topic_id] ?? 'Your learning path';
  const weeklyRecoveryPlan =
    weeklyReport?.recoveryPlan ?? weeklyCheckin?.latestCheckin?.recoveryPlan ?? null;
  const weeklyCheckinDue = weeklyReport?.checkinDue ?? weeklyCheckin?.due ?? false;

  if (stage === 'done' && activeNode) {
    const kind = task?.taskType ?? previewTaskType(activeNode, isReview);
    const directionName = direction.roleTitle ?? direction.goalTitle ?? goal.title;
    const pathComplete = milestones.includes('100% complete');
    return (
      <div className="mx-auto max-w-2xl space-y-6 py-8">
        <PageHeader
          eyebrow={pathComplete ? 'Path complete' : 'Session complete'}
          title={activeNode.title}
          description={
            pathComplete
              ? 'Every concept on this path is complete. This session is still on the record.'
              : 'This session is on the record.'
          }
        />
        <SurfaceCard p={{ base: 6, md: 8 }}>
          <div className="space-y-4 text-sm leading-7 text-slate-600">
            <p>
              <span className="font-semibold text-slate-900">{directionName}.</span>
              {' '}Added to Proof: {artifactLine(kind, activeNode.title)}
            </p>
            {task?.prompt ? <p>{task.prompt}</p> : null}
            <p>{voiceLine(kind, activeNode.title)}</p>
            {requeued ? (
              <p>You rated this low, so it stays on the path and comes back to keep the concept sharp.</p>
            ) : null}
            {unlockedTitles.length > 0 ? (
              <p>Next on the path: {unlockedTitles.join(', ')}.</p>
            ) : null}
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/proof" className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
              Open proof
            </Link>
            <Link to="/voice" className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">
              Open voice
            </Link>
          </div>
        </SurfaceCard>
      </div>
    );
  }

  const ratingModal = (
    <AppModal
      isOpen={stage === 'rating'}
      onClose={() => setStage('in_session')}
      title="Wrap up this session"
      description={activeNode ? `How solid does “${activeNode.title}” feel now? Your answer decides what comes next.` : undefined}
      closeOnOverlayClick={false}
      footer={(
        <>
          <button
            type="button"
            onClick={() => setStage('in_session')}
            className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:border-slate-300"
          >
            Back to session
          </button>
          <button
            type="button"
            onClick={handleComplete}
            disabled={!confidence || submitting}
            className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
          >
            {submitting ? 'Saving…' : 'Finish session'}
          </button>
        </>
      )}
    >
      <div className="space-y-5">
        {artifactEvaluation && <EvaluationCard evaluation={artifactEvaluation} />}

        <div>
          <p className="text-sm font-semibold text-slate-800">Could you use or explain this right now?</p>
          <div className="mt-2 grid grid-cols-5 gap-2">
            {[1, 2, 3, 4, 5].map((value) => {
              const selected = confidence === value;
              const style = confStyle[value];
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setConfidence(value)}
                  aria-pressed={selected}
                  style={selected ? { border: `2px solid ${style.border}`, background: style.bg, color: style.fg } : {}}
                  className={`h-12 rounded-xl border-2 font-display text-lg font-semibold transition-all ${
                    selected ? '' : 'border-slate-200 bg-white text-slate-400 hover:border-slate-300'
                  }`}
                >
                  {value}
                </button>
              );
            })}
          </div>
          <p className="mt-2 min-h-[1.25rem] text-sm text-slate-600">
            {confidence > 0
              ? confidenceLabels[confidence]
              : 'Pick 1–5. A 1 or 2 keeps this concept open for another pass tomorrow.'}
          </p>
        </div>

        <label className="block space-y-1.5">
          <span className="text-sm font-semibold text-slate-800">
            Notes for next time <span className="font-normal text-slate-400">(optional)</span>
          </span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
            placeholder="What clicked, what still feels weak."
            className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-400"
          />
        </label>

        <details className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <summary className="cursor-pointer text-sm font-semibold text-slate-600">Your write-up</summary>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{artifactContent}</p>
        </details>

        {error && (
          <div className="space-y-1">
            <p className="text-sm text-red-600">{error}</p>
            {currentPlan?.planKey === 'free' && (
              <Link to="/pricing" className="text-xs font-semibold text-sky-700 hover:text-sky-800">
                Need more AI reviews? Compare plans
              </Link>
            )}
          </div>
        )}
      </div>
    </AppModal>
  );

  if ((stage === 'in_session' || stage === 'rating') && activeNode) {
    const radius = 52;
    const circumference = 2 * Math.PI * radius;

    return (
      <div className="space-y-6">
        {ratingModal}
        <PageHeader
          eyebrow={isReview ? 'Review session' : 'Live session'}
          title={activeNode.title}
          description="Stay with one concept, finish the deliverable, and use review only if it will sharpen the output."
          actions={(
            <button
              onClick={() => resetSessionState()}
              className="inline-flex items-center justify-center rounded-xl border border-black/10 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:border-sky-200 hover:text-sky-700"
            >
              Stop session
            </button>
          )}
        />

        <SurfaceCard p={{ base: 5, md: 6 }}>
          <div className="flex flex-col items-center space-y-5 py-2">
            <div className="relative h-[132px] w-[132px]">
              <svg className="-rotate-90 h-[132px] w-[132px]" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r={radius} fill="none" stroke="var(--slate-200)" strokeWidth="8" />
                <circle
                  cx="60"
                  cy="60"
                  r={radius}
                  fill="none"
                  stroke={pct >= 100 ? 'var(--emerald-500)' : 'var(--sky-500)'}
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={circumference * (1 - pct / 100)}
                  style={{ transition: 'stroke-dashoffset 1s linear' }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-display text-[24px] font-mono tabular-nums text-slate-800">
                  {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
                </span>
                <span className="text-xs text-slate-400">{timebox}m session</span>
              </div>
            </div>

            <div className="text-center">
              <p className="font-display text-[18px] text-slate-900">{activeNode.title}</p>
              <p className="mt-0.5 text-xs capitalize text-slate-400">
                {depthLabel[activeNode.depth_level] ?? activeNode.depth_level}
              </p>
            </div>

            {activeNode.description && (
              <div className="max-w-md rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-600">
                {activeNode.description}
              </div>
            )}
          </div>
        </SurfaceCard>

        {taskLoading ? (
          <Card className="flex items-center gap-3">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-sky-500" />
            <div>
              <p className="text-sm font-semibold text-slate-800">Preparing your task</p>
              <p className="text-xs text-slate-500">
                Turning this study block into a concrete deliverable.
              </p>
            </div>
          </Card>
        ) : task ? (
          <div className="grid gap-4 lg:grid-cols-[1.1fr,0.9fr]">
            <Card className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-400">
                    Deliverable
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {taskTypeLabel[task.taskType]} task
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                  {task.suggestedLength}
                </span>
              </div>

              <div className="rounded-xl border border-sky-100 bg-sky-50 px-4 py-4">
                <p className="text-sm leading-relaxed text-slate-700">
                  {task.prompt}
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-slate-100 p-3">
                  <p className="text-xs font-semibold text-slate-400">
                    What to include
                  </p>
                  <div className="mt-2 space-y-1 text-sm text-slate-700">
                    {task.instructions.map((item) => <p key={item}>- {item}</p>)}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-100 p-3">
                  <p className="text-xs font-semibold text-slate-400">
                    Good looks like
                  </p>
                  <div className="mt-2 space-y-1 text-sm text-slate-700">
                    {task.successCriteria.map((item) => <p key={item}>- {item}</p>)}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <label className="block text-sm font-semibold text-slate-400">
                    Your artifact
                  </label>
                  <span className="text-[11px] text-slate-400">
                    {artifactContent.trim().length} chars
                  </span>
                </div>
                <textarea
                  value={artifactContent}
                  onChange={(event) => setArtifactContent(event.target.value)}
                  rows={10}
                  placeholder="Write the deliverable here. This session should end with something concrete you can review later."
                  className="w-full resize-none rounded-xl border border-slate-200 px-3 py-3 text-sm leading-relaxed text-slate-700 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-400"
                />
              </div>

              {error && (
                <div className="space-y-2">
                  <p className="text-xs text-red-600">{error}</p>
                  {currentPlan?.planKey === 'free' && (
                    <Link to="/pricing" className="text-xs font-semibold text-sky-700 hover:text-sky-800">
                      Need more AI review capacity? Compare plans
                    </Link>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => { void persistArtifact().catch((err) => setError(err?.message ?? 'Could not save your draft.')); }}
                  disabled={savingArtifact || artifactContent.trim().length < 10}
                  className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-800 disabled:opacity-40"
                >
                  {savingArtifact ? 'Saving...' : 'Save draft'}
                </button>
                <button
                  onClick={handleEvaluateArtifact}
                  disabled={evaluatingArtifact || artifactContent.trim().length < 25}
                  className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-40"
                >
                  {evaluatingArtifact ? 'Reviewing...' : 'Get AI review'}
                </button>
                <button
                  onClick={handleMoveToRating}
                  disabled={movingToRating || artifactContent.trim().length < 25}
                  className="flex-1 rounded-xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-sky-700 disabled:opacity-40"
                >
                  {movingToRating ? 'Saving...' : 'Continue to wrap-up'}
                </button>
              </div>

              {aiChecksEntitlement && (
                <p className="text-[11px] text-slate-400">
                  {aiChecksEntitlement.remaining == null
                    ? 'AI review is available without a monthly limit on your plan.'
                    : `${aiChecksEntitlement.remaining} AI review checks left this month.`}
                </p>
              )}
            </Card>

            <div className="space-y-4">
              {artifactEvaluation ? (
                <EvaluationCard evaluation={artifactEvaluation} />
              ) : (
                <Card className="space-y-3">
                  <p className="text-sm font-semibold text-slate-400">
                    Why this matters
                  </p>
                  <p className="text-sm leading-relaxed text-slate-600">
                    Passive reading can feel productive, but real progress shows up when you finish each session with proof.
                    This deliverable becomes that proof for interviews, projects, and your resume.
                  </p>
                  <div className="space-y-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-3 text-sm text-slate-600">
                    {task.rubric.map((dimension) => (
                      <div key={dimension.key}>
                        <p className="font-semibold text-slate-700 capitalize">
                          {dimension.label}
                        </p>
                        <p className="text-xs leading-relaxed text-slate-500">
                          {dimension.description}
                        </p>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {resources.length > 0 && (
                <Card className="space-y-3">
                  <p className="text-sm font-semibold text-slate-400">
                    Resources
                  </p>
                  {resources.slice(0, 4).map((resource, index) => (
                    <a
                      key={index}
                      href={resource.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 transition-colors hover:border-sky-300"
                    >
                      <span className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-500">
                        {resourceTypeIcon[resource.resourceType] ?? 'LINK'}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-slate-700 group-hover:text-sky-700">
                          {urlDomain(resource.url)}
                        </p>
                        <p className="text-[10px] capitalize text-slate-400">
                          {resource.resourceType}
                        </p>
                      </div>
                      <span className="shrink-0 font-mono text-[10px] text-slate-400">
                        {Math.round(resource.qualityScore * 100)}%
                      </span>
                    </a>
                  ))}
                </Card>
              )}
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  const mockEnabled = entitlements.find(
    (entry) => entry.featureKey === 'mock_interviews.monthly',
  )?.enabled;
  const weeksLeftLabel =
    goal.estimatedWeeksRemaining > 0 ? `~${goal.estimatedWeeksRemaining} weeks left` : 'Almost done';
  const directionName = direction.roleTitle ?? direction.goalTitle ?? goal.title;
  const previewKind = node ? previewTaskType(node, false) : 'explain';

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={directionName}
        title="Today"
        description={
          node
            ? `${node.title} is next. The write-up lands on Proof, and Voice can cite it.`
            : 'Nothing is unlocked right now. A review keeps a finished concept sharp, or the path can open the next one.'
        }
      />

      {node ? (
        <Card className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="rounded-full bg-sky-50 px-2.5 py-0.5 font-semibold text-sky-700">
              {depthLabel[node.depth_level] ?? node.depth_level}
            </span>
            <span>~{node.estimated_mins} min</span>
            <span className="text-slate-300">·</span>
            <span className="truncate">{topicTitle(node)}</span>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{directionName}</p>
            <h2 className="mt-1 font-display text-[24px] text-slate-900" style={{ letterSpacing: '-0.01em', lineHeight: 1.2 }}>
              {node.title}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
              {node.description || 'This is the next unlocked concept on the path.'}
            </p>
          </div>

          <div className="space-y-1 text-sm leading-6 text-slate-600">
            <p>
              <span className="font-semibold text-slate-900">Proof.</span>
              {' '}{artifactLine(previewKind, node.title)}
            </p>
            <p>
              <span className="font-semibold text-slate-900">Voice.</span>
              {' '}{voiceLine(previewKind, node.title)}
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1" role="group" aria-label="Session length">
              {TIMEBOXES.map((value) => (
                <button
                  key={value}
                  onClick={() => setTimebox(value)}
                  aria-pressed={timebox === value}
                  className={`rounded-lg px-4 py-2 text-[13px] font-semibold transition-colors ${
                    timebox === value ? 'bg-white text-sky-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {value} min
                </button>
              ))}
            </div>
            <button
              onClick={() => handleStartSession(node)}
              className="rounded-xl bg-sky-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-sky-700 sm:ml-auto"
            >
              Start {timebox} min session
            </button>
          </div>
        </Card>
      ) : (
        <EmptyState
          title={goal.doneNodes === goal.totalNodes ? 'Every concept on this path is done' : 'Nothing unlocked right now'}
          description={
            goal.doneNodes === goal.totalNodes
              ? 'The path is complete. Proof holds the write-ups, and Voice can cite them.'
              : 'A review keeps a finished concept sharp, or the path can open the next set of concepts.'
          }
          accent="brand"
        />
      )}

      {reviewNode && reviewNode.id !== node?.id && (
        <Card className="flex flex-col gap-3 border-orange-200 bg-orange-50 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-orange-700">Keep this sharp</p>
            <p className="mt-0.5 truncate font-semibold text-slate-800">{reviewNode.title}</p>
            <p className="mt-0.5 text-sm text-slate-600">One recall pass so the concept stays ready to explain.</p>
          </div>
          <button
            onClick={() => handleStartSession(reviewNode, true)}
            className="shrink-0 rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-orange-600"
          >
            Start 15 min review
          </button>
        </Card>
      )}

      {/* 2. Where the goal stands */}
      <Link to={`/path?goal=${goal.id}`} className="block rounded-[20px] transition-shadow hover:shadow-md">
        <Card className="space-y-3">
          <div className="flex items-baseline justify-between gap-4">
            <p className="truncate text-sm font-semibold text-slate-800">{goal.title}</p>
            <span className="shrink-0 text-xs font-medium text-sky-700">Open path →</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-sky-500"
              style={{ width: `${Math.max(progressPct, 2)}%`, transition: 'width var(--dur-slow) var(--ease-out)' }}
            />
          </div>
          <p className="text-xs text-slate-500">
            {goal.doneNodes} of {goal.totalNodes} concepts done · {weeksLeftLabel}
            {streak > 0 ? ` · ${streak}-day streak` : ''}
          </p>
          {gapProgress && gapProgress.gaps.length > 0 && (
            <p className="text-xs text-slate-500">
              <span className="font-semibold text-slate-700">{gapProgress.readinessPct}% ready</span>
              {' · '}
              {gapProgress.counts.closed + gapProgress.counts.proven} of {gapProgress.gaps.length} gaps closed
              {gapProgress.gaps.find((gap) => gap.needsPractice)
                ? ` · practice needed: ${gapProgress.gaps.find((gap) => gap.needsPractice)?.skillArea}`
                : ''}
            </p>
          )}
        </Card>
      </Link>

      {/* 3. Things for this week */}
      <Card className="divide-y divide-slate-100 !py-1">
        <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-800">
              Weekly check-in{weeklyCheckinDue ? <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">Due</span> : null}
            </p>
            <p className="mt-0.5 text-sm text-slate-500">
              {weeklyLoading
                ? 'Loading your week…'
                : weeklyCheckinDue
                  ? 'Two minutes: what became visible, and whether the pace still fits.'
                  : weeklyRecoveryPlan?.headline ?? 'The pace is holding this week.'}
            </p>
          </div>
          {weeklyCheckinDue ? (
            <button
              type="button"
              onClick={() => setCheckinOpen(true)}
              className="shrink-0 rounded-xl bg-amber-500 px-4 py-2 text-center text-sm font-semibold text-white transition-colors hover:bg-amber-600"
            >
              Do check-in
            </button>
          ) : (
            <Link
              to="/history"
              className="shrink-0 rounded-xl border border-slate-200 px-4 py-2 text-center text-sm font-semibold text-slate-700 transition-colors hover:border-sky-300 hover:text-sky-700"
            >
              Weekly review
            </Link>
          )}
          <WeeklyCheckinModal
            goalId={goal.id}
            goalTitle={goal.title}
            isOpen={checkinOpen}
            onClose={() => setCheckinOpen(false)}
            onSaved={(state) => {
              setWeeklyCheckin(state);
              setWeeklyReport((report) => (report ? { ...report, checkinDue: false } : report));
            }}
          />
        </div>

        <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-800">Mock interview</p>
            <p className="mt-0.5 text-sm text-slate-500">Practise system design or behavioural questions for this goal.</p>
          </div>
          <Link
            to={mockEnabled ? `/mock?goalId=${goal.id}` : '/pricing'}
            className="shrink-0 rounded-xl border border-slate-200 px-4 py-2 text-center text-sm font-semibold text-slate-700 transition-colors hover:border-sky-300 hover:text-sky-700"
          >
            {mockEnabled ? 'Start practice' : 'See plans'}
          </Link>
        </div>
      </Card>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
