import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useEntitlements } from '../contexts/EntitlementsContext';
import EmptyState from '../components/ui/EmptyState';
import PageHeader from '../components/ui/PageHeader';
import SurfaceCard from '../components/ui/SurfaceCard';
import {
  completeSession,
  evaluateSessionArtifact,
  getGoalWeeklyCheckin,
  getNodeResources,
  getSuggestedNextGoals,
  getSessionTask,
  getToday,
  getWeeklyReport,
  saveSessionArtifact,
  startSession,
  trackEvent,
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
    totalNodes: number;
    doneNodes: number;
    estimatedWeeksRemaining: number;
    topicsMap: Record<string, string>;
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
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
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
          <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
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
          <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
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
        <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
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
  const { user } = useAuth();
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

  const [nextGoals, setNextGoals] = useState<Array<{
    profileId: string;
    title: string;
    archetype: string;
    estimatedWeeks: { min: number; max: number };
    topSkills: string[];
    reason: string;
  }>>([]);

  const { mins, secs, pct } = useTimer(timebox, stage === 'in_session');
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
      const todayData = await getToday();
      setData(todayData);
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
      setStage('done');

      if (result.newMilestones?.includes('100% complete') && data?.goal?.id) {
        getSuggestedNextGoals(data.goal.id).then(setNextGoals).catch(() => {});
      }

      setTimeout(async () => {
        resetSessionState();
        await load();
      }, 2500);
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
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Daily focus"
          title="Today"
          description="Start with one active goal and Daily Push will turn it into a focused study rhythm."
        />
        <EmptyState
          title="No active goal yet"
          description="Set a goal and confirm the plan to unlock your first daily session."
          accent="warning"
          action={(
            <Link
              to="/goals/new"
              className="inline-block rounded-xl bg-[var(--brand-primary)] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--brand-primary-hov)]"
            >
              Set your goal
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
          description="Your goal exists, but the concept graph still needs to be built before we can schedule the next study session."
        />
        <EmptyState
          title="Your study nodes are not built yet"
          description="Open the goal workspace, finish decomposition, and come back once the first concepts are available."
          accent="brand"
          action={(
            <Link
              to={`/goals/${data.goal.id}`}
              className="inline-block rounded-xl bg-[var(--brand-primary)] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--brand-primary-hov)]"
            >
              Go to goal
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

  if (stage === 'done' && milestones.includes('100% complete')) {
    return (
      <div className="mx-auto max-w-md space-y-6 py-8">
        <PageHeader
          eyebrow="Goal complete"
          title="You finished the whole plan"
          description="Every concept node in this learning path is complete. That is real momentum."
        />

        <SurfaceCard p={{ base: 6, md: 8 }}>
          <div className="space-y-3 text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg">
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-10 w-10 text-white"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M8 21h8" />
                <path d="M12 17v4" />
                <path d="M7 4h10v3a5 5 0 0 1-10 0V4Z" />
                <path d="M7 5H5a2 2 0 0 0 0 4h2" />
                <path d="M17 5h2a2 2 0 0 1 0 4h-2" />
              </svg>
            </div>
            <h1 className="font-display text-2xl text-slate-900" style={{ letterSpacing: '-0.02em' }}>
              Goal complete!
            </h1>
            <p className="text-sm leading-relaxed text-slate-500">
              You finished every node in your learning plan.
              <br />
              That took real commitment.
            </p>
          </div>
        </SurfaceCard>

        <div className="space-y-1 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
          {milestones.map((item) => (
            <p key={item} className="text-sm font-semibold text-amber-800">
              {item}
            </p>
          ))}
        </div>

        {nextGoals.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">What's next?</p>
            {nextGoals.map((suggestion) => (
              <Link
                key={suggestion.profileId}
                to="/goals/new"
                className="block rounded-xl border border-slate-200 bg-white p-4 shadow-[var(--shadow-xs)] transition-colors hover:border-sky-300"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">
                      {suggestion.title}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {suggestion.reason}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {suggestion.topSkills.map((skill) => (
                        <span
                          key={skill}
                          className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                  <span className="shrink-0 font-mono text-xs text-slate-400">
                    {suggestion.estimatedWeeks.min}-{suggestion.estimatedWeeks.max}w
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (stage === 'done') {
    return (
      <div className="mx-auto max-w-2xl space-y-6 py-8">
        <PageHeader
          eyebrow="Session complete"
          title={activeNode?.title ?? 'Session complete'}
          description="Your work is saved. Keep the rhythm going and let the next concept open up."
        />

        <SurfaceCard p={{ base: 6, md: 8 }} className="flex min-h-[40vh] flex-col items-center justify-center space-y-4 px-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
          <svg className="h-8 w-8 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        {unlockedTitles.length > 0 && (
          <div className="rounded-xl border border-sky-200 bg-sky-50 px-5 py-3 text-sm font-medium text-sky-700">
            Unlocked: {unlockedTitles.join(', ')}
          </div>
        )}
        {milestones.length > 0 && (
          <div className="space-y-1 rounded-xl border border-amber-300 bg-amber-50 px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-amber-600">Milestone reached</p>
            {milestones.map((item) => (
              <p key={item} className="text-sm font-semibold text-amber-800">
                {item}
              </p>
            ))}
          </div>
        )}
        </SurfaceCard>
      </div>
    );
  }

  if (stage === 'rating') {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <PageHeader
          eyebrow="Wrap up"
          title={activeNode?.title ?? 'Session wrap-up'}
          description="Lock in what you learned, then rate how solid it feels before the next session is queued."
        />

        {artifactEvaluation && <EvaluationCard evaluation={artifactEvaluation} />}

        <Card>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            Your deliverable
          </p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
            {artifactContent}
          </p>
        </Card>

        <Card className="space-y-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
              Confidence check
            </p>
            <p className="mt-1 text-sm text-slate-500">
              How confident are you that you could use or explain this concept right now?
            </p>
          </div>

          <div className="grid grid-cols-5 gap-2">
            {[1, 2, 3, 4, 5].map((value) => {
              const selected = confidence === value;
              const style = confStyle[value];
              return (
                <button
                  key={value}
                  onClick={() => setConfidence(value)}
                  style={selected ? {
                    border: `2px solid ${style.border}`,
                    background: style.bg,
                    color: style.fg,
                  } : {}}
                  className={`aspect-square rounded-xl border-2 text-[18px] font-display font-bold transition-all duration-200 ${
                    selected
                      ? 'scale-105'
                      : 'border-slate-200 bg-white text-slate-400 hover:border-slate-300'
                  }`}
                >
                  {value}
                </button>
              );
            })}
          </div>

          {confidence > 0 && (
            <p className="text-center text-sm font-medium text-slate-600">
              {confidenceLabels[confidence]}
            </p>
          )}

          <div className="space-y-2">
            <label className="block text-xs font-semibold uppercase tracking-widest text-slate-400">
              Reflection notes
            </label>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              placeholder="What clicked, what still feels weak, or what you want to revisit next time."
              className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-400"
            />
          </div>

          {error && (
            <div className="space-y-2 text-center">
              <p className="text-xs text-red-600">{error}</p>
              {currentPlan?.planKey === 'free' && (
                <Link to="/pricing" className="text-xs font-semibold text-sky-700 hover:text-sky-800">
                  Need more AI review capacity? Compare plans
                </Link>
              )}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => setStage('in_session')}
              className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-800"
            >
              Back
            </button>
            <button
              onClick={handleComplete}
              disabled={!confidence || submitting}
              className="flex-1 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-40"
            >
              {submitting ? 'Saving...' : 'Finish session'}
            </button>
          </div>
        </Card>
      </div>
    );
  }

  if (stage === 'in_session' && activeNode) {
    const radius = 52;
    const circumference = 2 * Math.PI * radius;

    return (
      <div className="space-y-6">
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
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
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
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                    What to include
                  </p>
                  <div className="mt-2 space-y-1 text-sm text-slate-700">
                    {task.instructions.map((item) => <p key={item}>- {item}</p>)}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-100 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                    Good looks like
                  </p>
                  <div className="mt-2 space-y-1 text-sm text-slate-700">
                    {task.successCriteria.map((item) => <p key={item}>- {item}</p>)}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <label className="block text-xs font-semibold uppercase tracking-widest text-slate-400">
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
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                    Why this matters
                  </p>
                  <p className="text-sm leading-relaxed text-slate-600">
                    Passive reading feels productive, but paid learning products win when users finish each session with proof.
                    This deliverable becomes that proof.
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
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
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

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Daily focus"
        title="Today"
        description={
          user?.name
            ? `Welcome back, ${user.name.split(' ')[0]}. Keep the streak alive and end this session with something concrete.`
            : 'Keep momentum by turning one learning block into a concrete artifact.'
        }
        actions={
          streak > 0 ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-right shadow-[var(--shadow-xs)]">
              <p className="font-display text-[24px] text-amber-600" style={{ lineHeight: 1 }}>
                {streak}
              </p>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-widest text-amber-700/80">
                Day streak
              </p>
            </div>
          ) : undefined
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            Plan progress
          </p>
          <p className="mt-3 font-display text-[28px] text-slate-900" style={{ letterSpacing: '-0.03em', lineHeight: 1 }}>
            {progressPct}%
          </p>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            {goal.doneNodes}/{goal.totalNodes} concept nodes complete.
          </p>
        </Card>

        <Card>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            Next move
          </p>
          <p className="mt-3 text-sm font-semibold text-slate-800">
            {node ? node.title : reviewNode ? reviewNode.title : 'No active session available'}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            {node
              ? `A focused ${timebox}-minute session is ready to turn this node into concrete output.`
              : reviewNode
                ? 'A review session is due, so the fastest win is to refresh an older concept.'
                : 'You are between unlocked tasks right now. Finish decomposition or unlock the next concept.'}
          </p>
        </Card>

        <Card>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            Weekly state
          </p>
          <p className="mt-3 text-sm font-semibold text-slate-800">
            {weeklyCheckinDue
              ? 'Check-in due'
              : weeklyRecoveryPlan
                ? weeklyRecoveryPlan.status.replace('_', ' ')
                : 'On rhythm'}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            {weeklyCheckinDue
              ? 'Capture blockers and wins before the week drifts.'
              : weeklyRecoveryPlan?.headline
                ? weeklyRecoveryPlan.headline
                : 'Your weekly report will keep shaping the next few sessions.'}
          </p>
        </Card>
      </div>

      <Card>
        <div className="mb-2.5 flex items-center justify-between">
          <p className="truncate pr-4 text-xs font-semibold uppercase tracking-widest text-slate-400">{goal.title}</p>
          <span className="shrink-0 text-xs text-slate-500">
            {goal.estimatedWeeksRemaining > 0 ? `~${goal.estimatedWeeksRemaining}w left` : 'Almost done!'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="h-[6px] flex-1 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-sky-500"
              style={{ width: `${progressPct}%`, transition: 'width var(--dur-slow) var(--ease-out)' }}
            />
          </div>
          <span className="shrink-0 font-mono text-xs tabular-nums text-slate-500">
            {goal.doneNodes}/{goal.totalNodes}
          </span>
        </div>
      </Card>

      <Card className={weeklyCheckinDue ? 'border-amber-200 bg-amber-50' : ''}>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
              Weekly check-in
            </p>
            {weeklyLoading ? (
              <p className="mt-1 text-sm text-slate-500">Loading your weekly rhythm...</p>
            ) : weeklyCheckinDue ? (
              <p className="mt-1 text-sm leading-relaxed text-slate-700">
                Your weekly check-in is due. Capture what moved, what is stuck, and tighten the next seven days before the week drifts.
              </p>
            ) : weeklyRecoveryPlan ? (
              <p className="mt-1 text-sm leading-relaxed text-slate-700">
                {weeklyRecoveryPlan.headline}
              </p>
            ) : (
              <p className="mt-1 text-sm leading-relaxed text-slate-600">
                Use the weekly check-in to turn momentum and blockers into a concrete recovery plan.
              </p>
            )}

            {!weeklyLoading && weeklyRecoveryPlan?.actions?.[0] && !weeklyCheckinDue && (
              <p className="mt-2 text-xs text-slate-500">
                Next move: {weeklyRecoveryPlan.actions[0]}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/history"
              className={`inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
                weeklyCheckinDue
                  ? 'bg-amber-500 text-white hover:bg-amber-600'
                  : 'bg-slate-900 text-white hover:bg-slate-800'
              }`}
            >
              {weeklyCheckinDue ? 'Complete check-in' : 'Open weekly review'}
            </Link>
            {!weeklyReportsEnabled && (
              <Link
                to="/pricing"
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:border-sky-300 hover:text-sky-700"
              >
                Upgrade for detailed reports
              </Link>
            )}
          </div>
        </div>
      </Card>

      <Card className={currentPlan?.planKey === 'sprint' ? '' : 'border-slate-200 bg-slate-50'}>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
              Mock interview
            </p>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              Practice system design, behavioral stories, or project deep dives against this goal.
            </p>
          </div>
          {currentPlan?.planKey === 'sprint' ? (
            <Link
              to={`/mock?goalId=${goal.id}`}
              className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
            >
              Open mock interview
            </Link>
          ) : (
            <Link
              to="/pricing"
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:border-sky-300 hover:text-sky-700"
            >
              Upgrade to Sprint
            </Link>
          )}
        </div>
      </Card>

      {node ? (
        <Card>
          <div className="mb-3.5 flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">Today</span>
            <span className="text-xs text-slate-300">/</span>
            <span className="text-xs text-slate-400">{topicTitle(node)}</span>
          </div>

          <div className="mb-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold capitalize text-slate-600">
                {depthLabel[node.depth_level] ?? node.depth_level}
              </span>
              <span className="text-xs text-slate-400">~{node.estimated_mins} min</span>
            </div>
            <h2 className="font-display text-[22px] text-slate-900" style={{ letterSpacing: '-0.01em', lineHeight: 1.2 }}>
              {node.title}
            </h2>
            {node.description && (
              <p className="mt-2 text-sm leading-relaxed text-slate-500">
                {node.description}
              </p>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-[0.7fr,1.3fr]">
            <div>
              <p className="mb-2 text-xs font-medium text-slate-400">Study for</p>
              <div className="flex gap-2 md:flex-col">
                {TIMEBOXES.map((value) => (
                  <button
                    key={value}
                    onClick={() => setTimebox(value)}
                    className={`flex-1 rounded-[10px] border py-[9px] text-[13px] font-semibold transition-all ${
                      timebox === value
                        ? 'border-sky-600 bg-sky-600 text-white'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-sky-300'
                    }`}
                  >
                    {value}m
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                Session outcome
              </p>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                This session ends with a concrete artifact and, if you want it, rubric-based AI feedback.
                You should leave with something reviewable, not just a timer that elapsed.
              </p>
            </div>
          </div>

          <button
            onClick={() => handleStartSession(node)}
            className="mt-4 w-full rounded-xl bg-sky-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-sky-700"
          >
            Start {timebox} min session
          </button>
        </Card>
      ) : (
        <EmptyState
          title="All available nodes studied"
          description={
            goal.doneNodes === goal.totalNodes
              ? 'You completed every node. Incredible work.'
              : 'Complete more sessions to unlock the next concepts.'
          }
          accent="brand"
        />
      )}

      {reviewNode && reviewNode.id !== node?.id && (
        <SurfaceCard p={5} className="space-y-3 border-orange-200 bg-orange-50">
          <span className="text-xs font-semibold uppercase tracking-widest text-orange-600">Review due</span>
          <div>
            <h3 className="mt-1 font-display text-base text-slate-800">
              {reviewNode.title}
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              {reviewNode.description}
            </p>
          </div>
          <button
            onClick={() => handleStartSession(reviewNode, true)}
            className="w-full rounded-lg bg-orange-500 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-orange-600"
          >
            Start 15 min review
          </button>
        </SurfaceCard>
      )}

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
