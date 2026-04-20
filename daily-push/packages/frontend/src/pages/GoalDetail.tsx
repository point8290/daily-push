import { useEffect, useRef, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  AlertDialog, AlertDialogBody, AlertDialogContent, AlertDialogFooter,
  AlertDialogHeader, AlertDialogOverlay, Button, useToast,
} from '@chakra-ui/react';
import { getGoal, confirmGoal, correctGoal, decomposeGoal, getGoalNodes, getGoalResources, retryResourceEnrichment, makePrimary, archiveGoal, deleteGoal, PipelineRun, NodeResource } from '../api/client';
import PipelineStatus from '../components/PipelineStatus';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SkillGap {
  skillArea: string;
  currentLevel: string;
  requiredLevel: string;
  priorityReason: string;
  longevity: 'high' | 'medium' | 'low';
  aiRelationship: 'amplified' | 'replaced' | 'unaffected';
}

interface LearningTopic {
  title: string;
  rationale: string;
  estimatedWeeks: number;
  priority: number;
  decompositionStatus?: 'pending' | 'in_progress' | 'completed' | 'failed';
  topicEngineId?: string | null;
}

interface Goal {
  _id: string;
  isPrimary: boolean;
  raw: { input: string };
  pipelineRun?: { status: 'running' | 'done' | 'partial' | 'failed' };
  structured: {
    title: string;
    goalType: string;
    urgency: string;
    emotionalDriver: string;
    statedWhy: string;
    successCriteria: string;
    estimatedWeeks?: number;
    confidenceLevel: number;
  };
  status: string;
  skillGaps: Array<{ _id: string; structured: SkillGap }>;
  learningTopics: Array<{ _id: string; structured: LearningTopic }>;
}

interface ConceptNode {
  id: string;
  learning_topic_id: string;
  title: string;
  description: string;
  depth_level: 'surface' | 'foundational' | 'intermediate' | 'advanced';
  boundary_type: 'core' | 'optional_depth';
  estimated_mins: number;
  longevity: string;
  ai_relationship: string;
  status: 'locked' | 'available' | 'in_progress' | 'done' | 'review_due';
  confidence: number | null;
  position: number;
  outgoing_edges: Array<{ id: string; toNodeId: string; edgeType: string }>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const urgencyLabel: Record<string, string> = {
  exploring: 'Just exploring', planning: 'Actively planning',
  urgent: 'Urgent', crisis: 'In crisis mode',
};
const driverLabel: Record<string, string> = {
  growth: 'Growth', avoidance: 'Avoiding risk', social: 'Social proof',
  validation: 'Self-validation', financial: 'Financial', curiosity: 'Curiosity',
};
const longevityColor: Record<string, string> = {
  high: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  low: 'bg-red-50 text-red-600 border-red-200',
};
const aiLabel: Record<string, string> = {
  amplified: 'AI amplifies', replaced: 'AI replaces', unaffected: 'AI-neutral',
};
const nodeStatusStyle: Record<string, string> = {
  locked:      'bg-slate-50 border-slate-200 text-slate-400',
  available:   'bg-sky-50 border-sky-200 text-sky-700',
  in_progress: 'bg-amber-50 border-amber-200 text-amber-700',
  done:        'bg-emerald-50 border-emerald-200 text-emerald-700',
  review_due:  'bg-orange-50 border-orange-200 text-orange-700',
};
const nodeStatusDot: Record<string, string> = {
  locked:      'bg-slate-300',
  available:   'bg-sky-500',
  in_progress: 'bg-amber-500',
  done:        'bg-emerald-500',
  review_due:  'bg-orange-500',
};
const depthOrder = ['surface', 'foundational', 'intermediate', 'advanced'];
const depthLabel: Record<string, string> = {
  surface: 'Surface', foundational: 'Foundational',
  intermediate: 'Intermediate', advanced: 'Advanced',
};
const decompStatusBadge: Record<string, { label: string; cls: string }> = {
  pending:     { label: 'Pending',      cls: 'text-slate-400' },
  in_progress: { label: 'Building...', cls: 'text-amber-600 animate-pulse' },
  completed:   { label: 'Ready',        cls: 'text-emerald-600' },
  failed:      { label: 'Failed',       cls: 'text-red-500' },
};

const resourceTypeIcon: Record<string, string> = {
  article: '📄', video: '🎬', course: '🎓', docs: '📚', paper: '🔬', github: '⌨️',
};

function urlDomain(url: string): string {
  try { return new URL(url).hostname.replace('www.', ''); }
  catch { return url.slice(0, 50); }
}

type TabId = 'overview' | 'concepts' | 'resources';

// ─────────────────────────────────────────────────────────────────────────────

export default function GoalDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [goal, setGoal] = useState<Goal | null>(null);
  const [nodes, setNodes] = useState<ConceptNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [decomposing, setDecomposing] = useState(false);
  const [showCorrect, setShowCorrect] = useState(false);
  const [correction, setCorrection] = useState('');
  const [correcting, setCorrecting] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  // Resources tab state
  const [resourceMap, setResourceMap] = useState<Record<string, NodeResource[]>>({});
  const [resourcesLoaded, setResourcesLoaded] = useState(false);
  const [resourcesLoading, setResourcesLoading] = useState(false);
  const [enrichmentRetrying, setEnrichmentRetrying] = useState(false);
  const [enrichmentRetryError, setEnrichmentRetryError] = useState<string | null>(null);
  const [makingPrimary, setMakingPrimary] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const toast = useToast();

  useEffect(() => {
    if (!id) return;
    Promise.all([
      getGoal(id),
      getGoalNodes(id).catch(() => []),
    ])
      .then(([g, n]) => { setGoal(g); setNodes(n); })
      .catch(() => setError('Goal not found'))
      .finally(() => setLoading(false));
  }, [id]);

  // Lazy-load resources when tab opens
  useEffect(() => {
    if (activeTab !== 'resources' || resourcesLoaded || !id || nodes.length === 0) return;
    setResourcesLoading(true);
    getGoalResources(id)
      .then(data => { setResourceMap(data); setResourcesLoaded(true); })
      .catch(() => setResourcesLoaded(true))
      .finally(() => setResourcesLoading(false));
  }, [activeTab, resourcesLoaded, id, nodes.length]);

  const handleConfirm = async () => {
    if (!id) return;
    setConfirming(true);
    try {
      await confirmGoal(id);
      navigate('/');
    } catch { setConfirming(false); }
  };

  const handleCorrect = async () => {
    if (!id || !correction.trim()) return;
    setCorrecting(true);
    try {
      const updated = await correctGoal(id, correction);
      setGoal(updated);
      setCorrection('');
      setShowCorrect(false);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Correction failed');
    } finally { setCorrecting(false); }
  };

  const handleDecompose = async () => {
    if (!id) return;
    setDecomposing(true);
    setError('');
    try {
      await decomposeGoal(id);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Decomposition failed');
      setDecomposing(false);
    }
  };

  const onPipelineComplete = async (_run: PipelineRun) => {
    if (!id) return;
    const [updated, updatedNodes] = await Promise.all([
      getGoal(id),
      getGoalNodes(id).catch(() => []),
    ]);
    setGoal(updated);
    setNodes(updatedNodes);
    setDecomposing(false);
    // Invalidate cached resources so Resources tab re-fetches
    setResourcesLoaded(false);
    setResourceMap({});
  };

  const handleMakePrimary = async () => {
    if (!id) return;
    setMakingPrimary(true);
    try {
      await makePrimary(id);
      setGoal(prev => prev ? { ...prev, isPrimary: true } : prev);
      toast({ title: 'Set as primary goal', status: 'success', duration: 2500, isClosable: true, position: 'top-right' });
    } catch {
      toast({ title: 'Failed to update primary goal', status: 'error', duration: 3000, isClosable: true, position: 'top-right' });
    } finally { setMakingPrimary(false); }
  };

  const handleArchive = async () => {
    if (!id) return;
    setArchiving(true);
    try {
      await archiveGoal(id);
      toast({ title: 'Goal archived', status: 'info', duration: 2000, isClosable: true, position: 'top-right' });
      navigate('/goals');
    } catch {
      toast({ title: 'Failed to archive goal', status: 'error', duration: 3000, isClosable: true, position: 'top-right' });
      setArchiving(false);
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    setDeleting(true);
    try {
      await deleteGoal(id);
      navigate('/goals');
    } catch {
      toast({ title: 'Failed to delete goal', status: 'error', duration: 3000, isClosable: true, position: 'top-right' });
      setDeleting(false);
    }
  };

  const handleResourceRetry = async () => {
    if (!id) return;
    setEnrichmentRetrying(true);
    setEnrichmentRetryError(null);
    try {
      await retryResourceEnrichment(id);
      setResourcesLoaded(false);
      setResourceMap({});
    } catch (err: any) {
      setEnrichmentRetryError(err?.response?.data?.error ?? 'Failed to start enrichment');
    } finally {
      setEnrichmentRetrying(false);
    }
  };

  // ── Loading / error states ──
  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3 text-slate-400">
      <div className="w-8 h-8 border-4 border-slate-200 border-t-sky-500 rounded-full animate-spin" />
      <span className="text-sm">Loading your plan...</span>
    </div>
  );

  if (error && !goal) return (
    <div className="text-center py-12">
      <p className="text-slate-500">{error}</p>
      <Link to="/goals" className="text-sky-600 text-sm mt-2 inline-block">← Back to goals</Link>
    </div>
  );

  if (!goal) return null;

  const s = goal.structured;
  const gaps = goal.skillGaps.map(g => g.structured).filter(Boolean);
  const topics = goal.learningTopics.map(t => t.structured).filter(Boolean).sort((a, b) => a.priority - b.priority);
  const isActive = goal.status === 'active';

  const allDecomposed = goal.learningTopics.length > 0 &&
    goal.learningTopics.every(t => t.structured?.decompositionStatus === 'completed');
  const anyDecomposed = goal.learningTopics.some(t => t.structured?.decompositionStatus === 'completed');
  const canDecompose = isActive && !allDecomposed && !decomposing;

  const nodesByDepth = depthOrder.reduce((acc, depth) => {
    acc[depth] = nodes.filter(n => n.depth_level === depth);
    return acc;
  }, {} as Record<string, ConceptNode[]>);

  // Build topicId → title map for Resources tab grouping
  const topicTitleById: Record<string, string> = {};
  for (const t of goal.learningTopics) {
    topicTitleById[t._id] = t.structured?.title ?? 'Unknown topic';
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: 'overview',   label: 'Overview' },
    { id: 'concepts',   label: `Concepts${nodes.length ? ` (${nodes.length})` : ''}` },
    { id: 'resources',  label: 'Resources' },
  ];

  return (
    <div className="space-y-0">
      <div className="mb-4">
        <Link to="/goals" className="text-slate-400 hover:text-slate-600 text-sm inline-block">← Goals</Link>
      </div>

      {/* ── Goal header ── */}
      <div className="bg-gradient-to-br from-sky-600 to-indigo-600 rounded-2xl p-6 text-white mb-0">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sky-200 text-xs font-semibold uppercase tracking-widest">{s.goalType} goal</span>
          <span className="text-sky-300 text-xs">·</span>
          <span className="text-sky-200 text-xs">{urgencyLabel[s.urgency] ?? s.urgency}</span>
          {isActive && <span className="ml-auto text-xs bg-emerald-500 text-white px-2 py-0.5 rounded-full font-semibold">Active</span>}
        </div>
        <h1 className="text-2xl font-bold leading-snug">{s.title}</h1>
        {s.statedWhy && <p className="text-sky-100 text-sm mt-3 italic">"{s.statedWhy}"</p>}
        {s.emotionalDriver && (
          <p className="text-sky-200 text-xs mt-2">Motivation: {driverLabel[s.emotionalDriver] ?? s.emotionalDriver}</p>
        )}
      </div>

      {/* ── Tab bar ── */}
      <div className="flex border-b border-slate-200 bg-white sticky top-0 z-10 mt-4 rounded-t-xl overflow-hidden">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-5 py-3 text-sm font-semibold transition-colors border-b-2 -mb-px ${
              activeTab === tab.id
                ? 'border-sky-600 text-sky-700'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════
          OVERVIEW TAB
      ══════════════════════════════════════════ */}
      {activeTab === 'overview' && (
        <div className="space-y-4 pt-4">

          {/* Success criteria */}
          {s.successCriteria && (
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">What success looks like</p>
              <p className="text-slate-700 text-sm leading-relaxed">{s.successCriteria}</p>
            </div>
          )}

          {/* Skill gaps */}
          {gaps.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
                Skill gaps — {gaps.length} identified
              </p>
              {gaps.map((gap, i) => (
                <div key={i} className="border border-slate-100 rounded-lg p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-800 text-sm">{gap.skillArea}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${longevityColor[gap.longevity]}`}>
                      {gap.longevity} longevity
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="capitalize">{gap.currentLevel}</span>
                    <span className="text-slate-300">→</span>
                    <span className="capitalize font-medium text-slate-700">{gap.requiredLevel}</span>
                    <span className="text-slate-300">·</span>
                    <span className="text-slate-400">{aiLabel[gap.aiRelationship]}</span>
                  </div>
                  {gap.priorityReason && (
                    <p className="text-xs text-slate-400 leading-relaxed">{gap.priorityReason}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Learning path */}
          {topics.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Your learning path</p>
                {s.estimatedWeeks && (
                  <span className="text-xs text-slate-500 font-medium">~{s.estimatedWeeks} weeks</span>
                )}
              </div>
              {goal.learningTopics
                .map(t => t.structured)
                .filter(Boolean)
                .sort((a, b) => a.priority - b.priority)
                .map((topic, i) => {
                  const status = topic.decompositionStatus ?? 'pending';
                  const badge = decompStatusBadge[status];
                  return (
                    <div key={i} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className="w-6 h-6 rounded-full bg-sky-100 text-sky-700 text-xs font-bold flex items-center justify-center shrink-0">
                          {i + 1}
                        </div>
                        {i < topics.length - 1 && <div className="w-px flex-1 bg-slate-100 my-1" />}
                      </div>
                      <div className="pb-3 flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold text-slate-800 text-sm">{topic.title}</span>
                          <div className="flex items-center gap-2 ml-2 shrink-0">
                            <span className={`text-xs font-medium ${badge.cls}`}>{badge.label}</span>
                            <span className="text-xs text-slate-400">{topic.estimatedWeeks}w</span>
                          </div>
                        </div>
                        <p className="text-xs text-slate-500 leading-relaxed">{topic.rationale}</p>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}

          {/* Pipeline status (active decompose) */}
          {id && decomposing && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-[var(--shadow-xs)]">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">
                Building your study nodes
              </p>
              <PipelineStatus goalId={id} type="decompose" onComplete={onPipelineComplete} />
            </div>
          )}

          {/* Static partial/failed pipeline */}
          {id && !decomposing && goal?.pipelineRun &&
            (goal.pipelineRun.status === 'partial' || goal.pipelineRun.status === 'failed') && (
            <div className="bg-white border border-amber-200 rounded-xl p-5">
              <p className="text-xs font-semibold text-amber-600 uppercase tracking-widest mb-4">
                Pipeline — needs attention
              </p>
              <PipelineStatus goalId={id} type="decompose" onComplete={onPipelineComplete} />
            </div>
          )}

          {/* Decompose CTA */}
          {isActive && canDecompose && !decomposing && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-5 space-y-3">
              <div>
                <p className="text-sm font-semibold text-indigo-900">Build your study nodes</p>
                <p className="text-xs text-indigo-600 mt-1">
                  We'll break each topic into prerequisite-ordered concept nodes — the actual things you'll study, one per day.
                  {anyDecomposed && ' Some topics are already decomposed.'}
                </p>
              </div>
              {error && <p className="text-red-600 text-xs">{error}</p>}
              <button
                onClick={handleDecompose}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-lg text-sm font-semibold transition-colors"
              >
                {anyDecomposed ? 'Continue building nodes →' : 'Build study nodes →'}
              </button>
            </div>
          )}

          {/* Correction flow */}
          {!isActive && (
            <div className="space-y-3">
              {showCorrect ? (
                <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                  <p className="text-sm font-semibold text-slate-700">What's wrong or missing?</p>
                  <p className="text-xs text-slate-400">Tell us in plain text — we'll re-derive the plan with your correction.</p>
                  <textarea
                    value={correction}
                    onChange={e => setCorrection(e.target.value)}
                    rows={3}
                    placeholder="e.g. I actually have 5 years of experience, not 3..."
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 resize-none"
                  />
                  {error && <p className="text-red-600 text-xs">{error}</p>}
                  <div className="flex gap-2">
                    <button
                      onClick={handleCorrect}
                      disabled={correcting || !correction.trim()}
                      className="flex-1 bg-sky-600 hover:bg-sky-700 text-white py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
                    >
                      {correcting ? 'Re-deriving plan...' : 'Update plan'}
                    </button>
                    <button onClick={() => setShowCorrect(false)} className="px-4 py-2 text-slate-500 text-sm border border-slate-200 rounded-lg">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowCorrect(true)}
                  className="w-full text-center text-sm text-slate-400 hover:text-slate-600 py-2 border border-dashed border-slate-200 rounded-xl"
                >
                  Something wrong or missing? Correct it →
                </button>
              )}
            </div>
          )}

          {/* Confirm CTA */}
          {!isActive && gaps.length > 0 && (
            <button
              onClick={handleConfirm}
              disabled={confirming}
              className="w-full bg-sky-600 hover:bg-sky-700 text-white py-3.5 rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors"
            >
              {confirming ? 'Starting your journey...' : 'This looks right — start my plan →'}
            </button>
          )}

          {/* What you told us */}
          <details className="bg-slate-50 border border-slate-200 rounded-xl">
            <summary className="px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-widest cursor-pointer">
              What you told us
            </summary>
            <p className="px-5 pb-4 text-slate-600 text-sm leading-relaxed">{goal.raw.input}</p>
          </details>

          {/* Goal management */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Manage goal</p>
            <div className="flex flex-wrap gap-2">
              {!goal.isPrimary && goal.status !== 'archived' && (
                <Button
                  size="sm"
                  colorScheme="blue"
                  variant="outline"
                  isLoading={makingPrimary}
                  loadingText="Updating…"
                  onClick={handleMakePrimary}
                >
                  Make primary
                </Button>
              )}
              {goal.status !== 'archived' && (
                <Button
                  size="sm"
                  variant="outline"
                  isLoading={archiving}
                  loadingText="Archiving…"
                  onClick={handleArchive}
                >
                  Archive goal
                </Button>
              )}
              <Button
                size="sm"
                colorScheme="red"
                variant="ghost"
                onClick={() => setShowDeleteConfirm(true)}
              >
                Delete goal
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Chakra AlertDialog for delete */}
      <AlertDialog
        isOpen={showDeleteConfirm}
        leastDestructiveRef={cancelRef}
        onClose={() => setShowDeleteConfirm(false)}
        isCentered
      >
        <AlertDialogOverlay>
          <AlertDialogContent borderRadius="xl" mx={4}>
            <AlertDialogHeader fontSize="lg" fontWeight="bold" pb={2}>
              Delete goal
            </AlertDialogHeader>
            <AlertDialogBody fontSize="sm" color="gray.600">
              This will permanently delete <strong>{goal.structured?.title}</strong> along with all concept nodes, sessions, and progress. This cannot be undone.
            </AlertDialogBody>
            <AlertDialogFooter gap={3}>
              <Button ref={cancelRef} onClick={() => setShowDeleteConfirm(false)} size="sm" variant="outline">
                Cancel
              </Button>
              <Button colorScheme="red" onClick={handleDelete} isLoading={deleting} loadingText="Deleting…" size="sm">
                Delete permanently
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>

      {/* ══════════════════════════════════════════
          CONCEPTS TAB
      ══════════════════════════════════════════ */}
      {activeTab === 'concepts' && (
        <div className="space-y-4 pt-4">

          {/* Pipeline status during decompose */}
          {id && decomposing && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-[var(--shadow-xs)]">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">
                Building your study nodes
              </p>
              <PipelineStatus goalId={id} type="decompose" onComplete={onPipelineComplete} />
            </div>
          )}

          {/* Decompose CTA if not started */}
          {isActive && canDecompose && !decomposing && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-5 space-y-3">
              <div>
                <p className="text-sm font-semibold text-indigo-900">Build your study nodes</p>
                <p className="text-xs text-indigo-600 mt-1">
                  We'll break each topic into prerequisite-ordered concept nodes — the actual things you'll study, one per day.
                </p>
              </div>
              {error && <p className="text-red-600 text-xs">{error}</p>}
              <button
                onClick={handleDecompose}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-lg text-sm font-semibold transition-colors"
              >
                {anyDecomposed ? 'Continue building nodes →' : 'Build study nodes →'}
              </button>
            </div>
          )}

          {/* Node list */}
          {nodes.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Concept nodes</p>
                <span className="text-xs text-slate-400">{nodes.length} nodes · {nodes.filter(n => n.status === 'done').length} done</span>
              </div>

              {depthOrder.map(depth => {
                const depthNodes = nodesByDepth[depth];
                if (!depthNodes || depthNodes.length === 0) return null;
                return (
                  <div key={depth} className="space-y-2">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
                      {depthLabel[depth]} <span className="font-normal text-slate-400">({depthNodes.length})</span>
                    </p>
                    {depthNodes.map(node => (
                      <div
                        key={node.id}
                        className={`flex items-start gap-3 p-3 rounded-lg border ${nodeStatusStyle[node.status]}`}
                      >
                        <div className="mt-0.5 shrink-0">
                          <div className={`w-2 h-2 rounded-full ${nodeStatusDot[node.status]}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium leading-snug">{node.title}</span>
                            <span className="text-xs text-slate-400 shrink-0">{node.estimated_mins}m</span>
                          </div>
                          {node.status !== 'locked' && node.description && (
                            <p className="text-xs text-slate-500 mt-1 leading-relaxed">{node.description}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}

              <div className="flex flex-wrap gap-3 pt-1 border-t border-slate-100">
                {Object.entries(nodeStatusDot).map(([status, dot]) => (
                  <div key={status} className="flex items-center gap-1.5 text-xs text-slate-400">
                    <div className={`w-2 h-2 rounded-full ${dot}`} />
                    <span className="capitalize">{status.replace('_', ' ')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {nodes.length === 0 && !decomposing && !canDecompose && (
            <div className="text-center py-12 text-slate-400 text-sm">
              No concept nodes yet. Go to Overview to build them.
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════
          RESOURCES TAB
      ══════════════════════════════════════════ */}
      {activeTab === 'resources' && (
        <div className="space-y-4 pt-4">
          {resourcesLoading && (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-[3px] border-slate-200 border-t-sky-500 rounded-full animate-spin" />
            </div>
          )}

          {!resourcesLoading && nodes.length === 0 && (
            <div className="text-center py-12 text-slate-400 text-sm">
              Build your study nodes first, then resources will appear here.
            </div>
          )}

          {!resourcesLoading && nodes.length > 0 && (
            <>
              {/* Re-fetch button */}
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-slate-400">
                  Resources are discovered after decomposition. Re-fetch if they're missing or outdated.
                </p>
                <button
                  onClick={handleResourceRetry}
                  disabled={enrichmentRetrying}
                  className="text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700
                             px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 shrink-0"
                >
                  {enrichmentRetrying ? 'Starting...' : 'Re-fetch resources'}
                </button>
              </div>
              {enrichmentRetryError && (
                <p className="text-xs text-red-500">{enrichmentRetryError}</p>
              )}

              {/* Group nodes by topic */}
              {goal.learningTopics
                .filter(t => t.structured?.decompositionStatus === 'completed')
                .map(topicDoc => {
                  const topicNodes = nodes.filter(n => n.learning_topic_id === topicDoc._id);
                  if (topicNodes.length === 0) return null;

                  const topicHasResources = topicNodes.some(n => (resourceMap[n.id] ?? []).length > 0);

                  return (
                    <div key={topicDoc._id} className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
                        {topicDoc.structured?.title ?? 'Topic'}
                      </p>

                      {!topicHasResources && resourcesLoaded && (
                        <p className="text-xs text-slate-400 italic">
                          Resources not yet enriched for this topic.
                        </p>
                      )}

                      {topicNodes.map(node => {
                        const nodeResources = resourceMap[node.id] ?? [];
                        if (nodeResources.length === 0 && resourcesLoaded) return null;
                        return (
                          <div key={node.id} className="space-y-2">
                            <div className="flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-full shrink-0 ${nodeStatusDot[node.status]}`} />
                              <p className="text-sm font-semibold text-slate-800">{node.title}</p>
                              <span className="text-[10px] text-slate-400 ml-auto">{depthLabel[node.depth_level]}</span>
                            </div>
                            {nodeResources.map((r, i) => (
                              <a
                                key={i}
                                href={r.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-start gap-3 p-3 border border-slate-100 rounded-lg hover:border-sky-200 transition-colors group"
                              >
                                <span className="text-base mt-0.5">{resourceTypeIcon[r.resourceType] ?? '🔗'}</span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium text-slate-700 truncate group-hover:text-sky-700">
                                    {urlDomain(r.url)}
                                  </p>
                                  <div className="flex items-center gap-3 mt-1">
                                    <span className="text-[10px] text-slate-400 capitalize">{r.resourceType}</span>
                                    <span className="text-[10px] text-slate-400">Coverage {Math.round(r.coverageScore * 100)}%</span>
                                    <span className="text-[10px] text-slate-400">Depth {Math.round(r.depthMatch * 100)}%</span>
                                  </div>
                                </div>
                                <span className="text-xs font-mono text-slate-400 shrink-0 mt-0.5">
                                  {Math.round(r.qualityScore * 100)}%
                                </span>
                              </a>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}

              {/* Topics not yet decomposed */}
              {goal.learningTopics.some(t => t.structured?.decompositionStatus !== 'completed') && (
                <p className="text-xs text-slate-400 text-center py-2">
                  Some topics haven't been decomposed yet — their resources will appear here after building nodes.
                </p>
              )}

              {/* Empty state when resources fetched but none found */}
              {resourcesLoaded && Object.keys(resourceMap).length === 0 && (
                <div className="text-center py-8 space-y-2">
                  <p className="text-slate-500 text-sm font-medium">No resources yet</p>
                  <p className="text-slate-400 text-xs">Resources are enriched after decomposition completes. Check back shortly.</p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
