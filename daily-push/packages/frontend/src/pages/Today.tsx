import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getToday, startSession, completeSession, checkUnderstanding, getSuggestedNextGoals, getNodeResources, NodeResource } from '../api/client';

const resourceTypeIcon: Record<string, string> = {
  article: '📄', video: '🎬', course: '🎓', docs: '📚', paper: '🔬', github: '⌨️',
};

function urlDomain(url: string): string {
  try { return new URL(url).hostname.replace('www.', ''); }
  catch { return url.slice(0, 40); }
}

// ─── Types ────────────────────────────────────────────────────────────────────

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
  surface: 'Surface', foundational: 'Foundational',
  intermediate: 'Intermediate', advanced: 'Advanced',
};

const confidenceLabels: Record<number, string> = {
  1: 'Barely recall', 2: 'Fuzzy memory', 3: 'Getting there', 4: 'Solid grasp', 5: 'Nailed it',
};

const confStyle: Record<number, { border: string; bg: string; fg: string }> = {
  1: { border: 'var(--red-400)',     bg: 'var(--red-50)',     fg: 'var(--red-600)' },
  2: { border: 'var(--orange-400)',  bg: 'var(--orange-50)',  fg: 'var(--orange-600)' },
  3: { border: 'var(--amber-400)',   bg: 'var(--amber-100)',  fg: 'var(--amber-700)' },
  4: { border: 'var(--sky-400)',     bg: 'var(--sky-50)',     fg: 'var(--sky-700)' },
  5: { border: 'var(--emerald-400)', bg: 'var(--emerald-50)', fg: 'var(--emerald-700)' },
};

const TIMEBOXES = [15, 30, 60];

// ─── Timer hook ───────────────────────────────────────────────────────────────

function useTimer(timebox: number, active: boolean) {
  const [elapsed, setElapsed] = useState(0);
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (active) {
      ref.current = setInterval(() => setElapsed(e => e + 1), 1000);
    } else {
      if (ref.current) clearInterval(ref.current);
      setElapsed(0);
    }
    return () => { if (ref.current) clearInterval(ref.current); };
  }, [active]);

  const totalSecs = timebox * 60;
  const remaining = Math.max(0, totalSecs - elapsed);
  return {
    mins: Math.floor(remaining / 60),
    secs: remaining % 60,
    pct: Math.min(100, (elapsed / totalSecs) * 100),
  };
}

// ─── Shared primitives ────────────────────────────────────────────────────────

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white border border-slate-200 rounded-2xl p-5 shadow-[var(--shadow-xs)] ${className}`}>
      {children}
    </div>
  );
}

type Stage = 'idle' | 'in_session' | 'rating' | 'done';

// ─── Main component ───────────────────────────────────────────────────────────

export default function Today() {
  const { user } = useAuth();

  const [data, setData] = useState<TodayData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
  const [checkAnswer, setCheckAnswer] = useState('');
  const [checkResult, setCheckResult] = useState<{ score: number; feedback: string; correct?: boolean } | null>(null);
  const [checking, setChecking] = useState(false);
  const [resources, setResources] = useState<NodeResource[]>([]);

  const [nextGoals, setNextGoals] = useState<Array<{
    profileId: string; title: string; archetype: string;
    estimatedWeeks: { min: number; max: number }; topSkills: string[]; reason: string;
  }>>([]);

  const { mins, secs, pct } = useTimer(timebox, stage === 'in_session');

  const load = async () => {
    setLoading(true);
    try { setData(await getToday()); }
    catch { setError('Failed to load today\'s session'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleStartSession = async (node: NodeInfo, review = false) => {
    setActiveNode(node);
    setIsReview(review);
    setStage('in_session');
    setSessionStartedAt(new Date());
    setResources([]);
    try {
      const { sessionId: sid } = await startSession(node.id, review ? 'review' : 'new', timebox);
      setSessionId(sid);
    } catch { /* continue regardless */ }
    if (data?.goal?.id) {
      getNodeResources(data.goal.id, node.id).then(setResources).catch(() => {});
    }
  };

  const handleComplete = async () => {
    if (!confidence || !activeNode) return;
    setSubmitting(true);
    try {
      const durationMins = sessionStartedAt
        ? Math.max(1, Math.round((Date.now() - sessionStartedAt.getTime()) / 60_000))
        : timebox;

      let unlocked: string[] = [], newMilestones: string[] = [];
      if (sessionId) {
        const result = await completeSession(sessionId, confidence, durationMins);
        unlocked = result.unlockedNodeTitles ?? [];
        newMilestones = result.newMilestones ?? [];
      }

      setUnlockedTitles(unlocked);
      setMilestones(newMilestones);
      setStage('done');

      if (newMilestones.includes('100% complete') && data?.goal?.id) {
        getSuggestedNextGoals(data.goal.id).then(setNextGoals).catch(() => {});
      }

      setTimeout(async () => {
        setStage('idle');
        setActiveNode(null);
        setSessionId(null);
        setConfidence(0);
        setUnlockedTitles([]);
        setMilestones([]);
        setCheckAnswer('');
        setCheckResult(null);
        setNextGoals([]);
        await load();
      }, 2500);
    } catch {
      setError('Failed to save session. Try again.');
      setSubmitting(false);
    }
  };

  // ── Loading ──
  if (loading) return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="w-7 h-7 border-[3px] border-slate-200 border-t-sky-500 rounded-full animate-spin" />
    </div>
  );

  // ── No active goal ──
  if (!data?.goal) return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl text-slate-900" style={{ letterSpacing: '-0.02em' }}>Today</h1>
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-8 text-center space-y-3">
        <p className="text-amber-700 font-medium">No active goal yet.</p>
        <p className="text-amber-600 text-sm">Set a goal and confirm the plan to start learning.</p>
        <Link to="/goals/new" className="inline-block mt-2 bg-sky-600 hover:bg-sky-700 text-white px-5 py-2 rounded-lg text-sm font-semibold transition-colors">
          Set your goal →
        </Link>
      </div>
    </div>
  );

  // ── No nodes decomposed yet ──
  if (data.goal.totalNodes === 0) return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl text-slate-900" style={{ letterSpacing: '-0.02em' }}>Today</h1>
      <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-8 text-center space-y-3">
        <p className="text-indigo-700 font-medium">Your study nodes aren't built yet.</p>
        <p className="text-indigo-600 text-sm">Go to your goal and build the concept nodes first.</p>
        <Link to={`/goals/${data.goal.id}`} className="inline-block mt-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-lg text-sm font-semibold transition-colors">
          Go to goal →
        </Link>
      </div>
    </div>
  );

  const { goal, node, reviewNode, streak } = data;
  const progressPct = goal.totalNodes > 0 ? Math.round((goal.doneNodes / goal.totalNodes) * 100) : 0;
  const topicTitle = (n: NodeInfo) => goal.topicsMap[n.learning_topic_id] ?? 'Your learning path';

  // ─────────────────────────────────────────────
  // DONE — goal complete
  // ─────────────────────────────────────────────
  if (stage === 'done' && milestones.includes('100% complete')) return (
    <div className="space-y-6 max-w-md mx-auto py-8">
      <div className="text-center space-y-3">
        <div className="w-20 h-20 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full flex items-center justify-center mx-auto shadow-lg">
          <span className="text-4xl">🏆</span>
        </div>
        <h1 className="font-display text-2xl text-slate-900" style={{ letterSpacing: '-0.02em' }}>Goal complete!</h1>
        <p className="text-slate-500 text-sm leading-relaxed">
          You finished every node in your learning plan.<br />That took real commitment.
        </p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 space-y-1">
        {milestones.map(m => (
          <p key={m} className="text-sm font-semibold text-amber-800">{m}</p>
        ))}
      </div>

      {nextGoals.length > 0 && (
        <div className="space-y-3">
          <p className="eyebrow">What's next?</p>
          {nextGoals.map(g => (
            <Link key={g.profileId} to="/goals/new" className="block bg-white border border-slate-200 rounded-xl p-4 hover:border-sky-300 transition-colors shadow-[var(--shadow-xs)]">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-800 text-sm">{g.title}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{g.reason}</p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {g.topSkills.map(s => (
                      <span key={s} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{s}</span>
                    ))}
                  </div>
                </div>
                <span className="text-xs text-slate-400 shrink-0 font-mono">{g.estimatedWeeks.min}–{g.estimatedWeeks.max}w</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );

  // ─────────────────────────────────────────────
  // DONE — session complete
  // ─────────────────────────────────────────────
  if (stage === 'done') return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4 px-4">
      <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center">
        <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <div>
        <p className="font-display text-xl text-slate-900">Session complete</p>
        <p className="text-slate-500 text-sm mt-1">{activeNode?.title}</p>
      </div>
      {unlockedTitles.length > 0 && (
        <div className="bg-sky-50 border border-sky-200 rounded-xl px-5 py-3 text-sm text-sky-700 font-medium">
          Unlocked: {unlockedTitles.join(', ')}
        </div>
      )}
      {milestones.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl px-5 py-4 space-y-1">
          <p className="eyebrow text-amber-600">Milestone reached</p>
          {milestones.map(m => (
            <p key={m} className="text-sm font-semibold text-amber-800">{m}</p>
          ))}
        </div>
      )}
    </div>
  );

  // ─────────────────────────────────────────────
  // RATING
  // ─────────────────────────────────────────────
  if (stage === 'rating') return (
    <div className="space-y-6 max-w-md mx-auto">
      <div className="text-center pt-4">
        <p className="eyebrow">Rate your understanding</p>
        <p className="font-display text-xl text-slate-900 mt-1.5">{activeNode?.title}</p>
      </div>

      <div className="grid grid-cols-5 gap-2">
        {[1, 2, 3, 4, 5].map(n => {
          const sel = confidence === n;
          const s = confStyle[n];
          return (
            <button
              key={n}
              onClick={() => setConfidence(n)}
              style={sel ? { border: `2px solid ${s.border}`, background: s.bg, color: s.fg } : {}}
              className={`aspect-square rounded-xl border-2 text-[18px] font-display font-bold transition-all duration-200 ${
                sel ? 'scale-105' : 'border-slate-200 bg-white text-slate-400 hover:border-slate-300'
              }`}
            >
              {n}
            </button>
          );
        })}
      </div>

      {confidence > 0 && (
        <p className="text-center text-sm font-medium text-slate-600">{confidenceLabels[confidence]}</p>
      )}

      <div className="space-y-2">
        <p className="text-xs font-medium text-slate-400">Explain it back (optional — get AI feedback)</p>
        <textarea
          value={checkAnswer}
          onChange={e => setCheckAnswer(e.target.value)}
          placeholder={`How would you explain "${activeNode?.title}" to a colleague?`}
          className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-400 resize-none"
          rows={3}
        />
        {checkAnswer.trim().length > 10 && !checkResult && (
          <button
            onClick={async () => {
              if (!sessionId || checking) return;
              setChecking(true);
              try {
                const r = await checkUnderstanding(sessionId, checkAnswer);
                setCheckResult(r);
                if (!confidence) setConfidence(r.score);
              } finally { setChecking(false); }
            }}
            disabled={checking}
            className="text-xs text-sky-600 font-medium hover:text-sky-700 transition-colors"
          >
            {checking ? 'Checking...' : 'Get feedback →'}
          </button>
        )}
        {checkResult && (
          <div className={`rounded-xl px-4 py-3 text-sm border ${
            checkResult.correct ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-amber-50 border-amber-200 text-amber-700'
          }`}>
            <span className="font-semibold">{checkResult.correct ? 'Good understanding' : 'Keep refining'}</span>
            {' — '}{checkResult.feedback}
          </div>
        )}
      </div>

      {error && <p className="text-red-600 text-xs text-center">{error}</p>}

      <button
        onClick={handleComplete}
        disabled={!confidence || submitting}
        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-[13px] rounded-xl text-sm font-semibold disabled:opacity-40 transition-colors"
      >
        {submitting ? 'Saving...' : 'Submit →'}
      </button>
    </div>
  );

  // ─────────────────────────────────────────────
  // IN_SESSION
  // ─────────────────────────────────────────────
  if (stage === 'in_session' && activeNode) {
    const r = 52, circ = 2 * Math.PI * r;
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <button
            onClick={() => { setStage('idle'); setActiveNode(null); setSessionId(null); }}
            className="text-slate-400 hover:text-slate-600 text-sm transition-colors"
          >
            ← Stop session
          </button>
          <span className="text-xs text-slate-400">{isReview ? 'Review' : 'New concept'}</span>
        </div>

        <div className="flex flex-col items-center space-y-5 py-6">
          {/* Circular timer */}
          <div className="relative w-[132px] h-[132px]">
            <svg className="w-[132px] h-[132px] -rotate-90" viewBox="0 0 120 120">
              <circle cx="60" cy="60" r={r} fill="none" stroke="var(--slate-200)" strokeWidth="8" />
              <circle
                cx="60" cy="60" r={r} fill="none"
                stroke={pct >= 100 ? 'var(--emerald-500)' : 'var(--sky-500)'}
                strokeWidth="8" strokeLinecap="round"
                strokeDasharray={circ}
                strokeDashoffset={circ * (1 - pct / 100)}
                style={{ transition: 'stroke-dashoffset 1s linear' }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-display text-[24px] text-slate-800 font-mono tabular-nums">
                {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
              </span>
              <span className="text-xs text-slate-400">{timebox}m session</span>
            </div>
          </div>

          <div className="text-center">
            <p className="font-display text-[18px] text-slate-900">{activeNode.title}</p>
            <p className="text-xs text-slate-400 mt-0.5 capitalize">{depthLabel[activeNode.depth_level] ?? activeNode.depth_level}</p>
          </div>

          {activeNode.description && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm text-slate-600 leading-relaxed max-w-md">
              {activeNode.description}
            </div>
          )}

          {resources.length > 0 && (
            <div className="w-full max-w-md space-y-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Resources</p>
              {resources.slice(0, 4).map((r, i) => (
                <a
                  key={i}
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3 hover:border-sky-300 transition-colors group"
                >
                  <span className="text-base">{resourceTypeIcon[r.resourceType] ?? '🔗'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-700 truncate group-hover:text-sky-700">
                      {urlDomain(r.url)}
                    </p>
                    <p className="text-[10px] text-slate-400 capitalize">{r.resourceType}</p>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono shrink-0">
                    {Math.round(r.qualityScore * 100)}%
                  </span>
                </a>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={() => setStage('rating')}
          className="w-full bg-slate-900 hover:bg-slate-800 text-white py-[13px] rounded-xl text-sm font-semibold transition-colors"
        >
          Mark complete →
        </button>
      </div>
    );
  }

  // ─────────────────────────────────────────────
  // IDLE
  // ─────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* Greeting + streak */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-[28px] text-slate-900" style={{ letterSpacing: '-0.02em', lineHeight: 1.15 }}>Today</h1>
          <p className="text-slate-500 text-sm mt-1">
            {user?.name ? `Good work, ${user.name.split(' ')[0]}` : 'Keep going'}
          </p>
        </div>
        {streak > 0 && (
          <div className="text-right">
            <p className="font-display text-[26px] text-amber-500" style={{ lineHeight: 1 }}>{streak}</p>
            <p className="text-xs text-slate-400 mt-0.5">day streak</p>
          </div>
        )}
      </div>

      {/* Goal progress */}
      <Card>
        <div className="flex items-center justify-between mb-2.5">
          <p className="eyebrow truncate pr-4">{goal.title}</p>
          <span className="text-xs text-slate-500 shrink-0">
            {goal.estimatedWeeksRemaining > 0 ? `~${goal.estimatedWeeksRemaining}w left` : 'Almost done!'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex-1 bg-slate-100 rounded-full h-[6px] overflow-hidden">
            <div
              className="bg-sky-500 h-full rounded-full"
              style={{ width: `${progressPct}%`, transition: 'width var(--dur-slow) var(--ease-out)' }}
            />
          </div>
          <span className="text-xs text-slate-500 font-mono tabular-nums shrink-0">{goal.doneNodes}/{goal.totalNodes}</span>
        </div>
      </Card>

      {/* Today's node */}
      {node ? (
        <Card>
          <div className="flex items-center gap-2 mb-3.5">
            <span className="eyebrow">Today</span>
            <span className="text-slate-200 text-xs">·</span>
            <span className="text-xs text-slate-400">{topicTitle(node)}</span>
          </div>

          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-semibold capitalize">
                {depthLabel[node.depth_level] ?? node.depth_level}
              </span>
              <span className="text-xs text-slate-400">~{node.estimated_mins} min</span>
            </div>
            <h2 className="font-display text-[22px] text-slate-900" style={{ letterSpacing: '-0.01em', lineHeight: 1.2 }}>{node.title}</h2>
            {node.description && (
              <p className="text-sm text-slate-500 mt-2 leading-relaxed">{node.description}</p>
            )}
          </div>

          <p className="text-xs font-medium text-slate-400 mb-2">Study for</p>
          <div className="flex gap-2 mb-4">
            {TIMEBOXES.map(t => (
              <button
                key={t}
                onClick={() => setTimebox(t)}
                className={`flex-1 py-[9px] rounded-[10px] text-[13px] font-semibold border transition-all ${
                  timebox === t
                    ? 'bg-sky-600 text-white border-sky-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-sky-300'
                }`}
              >
                {t}m
              </button>
            ))}
          </div>

          <button
            onClick={() => handleStartSession(node)}
            className="w-full bg-sky-600 hover:bg-sky-700 text-white py-3 rounded-xl text-sm font-semibold transition-colors"
          >
            Start {timebox}min session →
          </button>
        </Card>
      ) : (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center space-y-2">
          <p className="text-emerald-700 font-semibold">All available nodes studied!</p>
          <p className="text-emerald-600 text-sm">
            {goal.doneNodes === goal.totalNodes
              ? "You've completed every node. Incredible work."
              : 'Complete more sessions to unlock the next concepts.'}
          </p>
        </div>
      )}

      {/* Review card */}
      {reviewNode && reviewNode.id !== node?.id && (
        <div className="bg-orange-50 border border-orange-200 rounded-2xl p-5 space-y-3">
          <span className="eyebrow text-orange-600">Review due</span>
          <div>
            <h3 className="font-display text-base text-slate-800 mt-1">{reviewNode.title}</h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">{reviewNode.description}</p>
          </div>
          <button
            onClick={() => handleStartSession(reviewNode, true)}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white py-2.5 rounded-lg text-sm font-semibold transition-colors"
          >
            Start 15min review →
          </button>
        </div>
      )}

      {error && (
        <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
      )}
    </div>
  );
}
