import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import {
  AlertDialog, AlertDialogBody, AlertDialogContent, AlertDialogFooter,
  AlertDialogHeader, AlertDialogOverlay, Button, useToast,
} from '@chakra-ui/react';
import {
  archiveGoal,
  confirmGoal,
  correctGoal,
  decomposeGoal,
  deleteGoal,
  exportGoalArtifacts,
  fillResourceGaps,
  getGoal,
  getGoalNodes,
  getGoalPlanHealth,
  getGoalResources,
  getResourceCoverage,
  makePrimary,
  rebaselineGoalSprint,
  retryResourceEnrichment,
  type GoalPlanHealth,
  type GoalSprint,
  type NodeResource,
  type PipelineRun,
  type ResourceCoverage,
  trackEvent,
} from '../api/client';
import PipelineStatus from '../components/PipelineStatus';
import EmptyState from '../components/ui/EmptyState';
import PageHeader from '../components/ui/PageHeader';
import SurfaceCard from '../components/ui/SurfaceCard';
import { useEntitlements } from '../contexts/EntitlementsContext';

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
  decompositionAttempts?: number;
  lastTopicEngineAttempts?: number;
  lastDecompositionError?: string | null;
}

interface Goal {
  _id: string;
  isPrimary: boolean;
  raw: {
    input: string;
    source?: string;
    targetRoleId?: string;
    targetRoleTitle?: string;
  };
  pipelineRun?: { status: 'running' | 'done' | 'partial' | 'failed' };
  sprint?: GoalSprint | null;
  structured: {
    title: string;
    goalType: string;
    urgency: string;
    emotionalDriver: string;
    statedWhy: string;
    successCriteria: string;
    estimatedWeeks?: number;
    estimatedWeeksAtPace?: number;
    targetDate?: string | null;
    availableMinsDay?: number | null;
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
const sprintStatusBadge: Record<string, string> = {
  planned: 'bg-slate-100 text-slate-600',
  on_track: 'bg-emerald-100 text-emerald-700',
  at_risk: 'bg-amber-100 text-amber-700',
  behind: 'bg-red-100 text-red-600',
  complete: 'bg-sky-100 text-sky-700',
};
const sprintStatusLabel: Record<string, string> = {
  planned: 'Planned',
  on_track: 'On track',
  at_risk: 'At risk',
  behind: 'Behind',
  complete: 'Complete',
};

function formatAttemptLabel(topic: LearningTopic): string | null {
  const requestAttempts = topic.lastTopicEngineAttempts ?? 0;
  const totalAttempts = topic.decompositionAttempts ?? 0;

  if (requestAttempts > 0 && totalAttempts > 0) {
    return `${requestAttempts} engine attempt${requestAttempts === 1 ? '' : 's'} on run ${totalAttempts}`;
  }
  if (requestAttempts > 0) {
    return `${requestAttempts} engine attempt${requestAttempts === 1 ? '' : 's'}`;
  }
  if (totalAttempts > 0) {
    return `${totalAttempts} run${totalAttempts === 1 ? '' : 's'}`;
  }
  return null;
}

const resourceTypeIcon: Record<string, string> = {
  article: '📄', video: '🎬', course: '🎓', docs: '📚', paper: '🔬', github: '⌨️',
};

function urlDomain(url: string): string {
  try { return new URL(url).hostname.replace('www.', ''); }
  catch { return url.slice(0, 50); }
}

function formatShortDate(value: string | null | undefined): string {
  if (!value) return 'Not set';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Not set';
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

type TabId = 'overview' | 'concepts' | 'resources';

function FlowStep({
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
    current: 'border-slate-900 bg-slate-900 text-white shadow-lg shadow-slate-900/15',
    locked: 'border-slate-200 bg-white/70 text-slate-500',
  }[state];

  return (
    <div className={`rounded-2xl border px-4 py-3 ${stateClass}`}>
      <div className="flex items-center gap-3">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-black ${
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

function MetricTile({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/70 bg-white/75 px-4 py-3 shadow-sm">
      <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-slate-400">{label}</p>
      <p className="mt-2 text-lg font-black tracking-tight text-slate-900">{value}</p>
      {detail ? <p className="mt-1 text-xs leading-relaxed text-slate-500">{detail}</p> : null}
    </div>
  );
}

function ActionCard({
  eyebrow,
  title,
  description,
  action,
  tone = 'light',
}: {
  eyebrow: string;
  title: string;
  description: string;
  action: ReactNode;
  tone?: 'light' | 'dark' | 'warning';
}) {
  const toneClass = {
    light: 'border-white/70 bg-white/80',
    dark: 'border-slate-800 bg-slate-950 text-white',
    warning: 'border-amber-200 bg-amber-50',
  }[tone];

  return (
    <div className={`rounded-3xl border p-5 shadow-sm ${toneClass}`}>
      <p className={`text-[11px] font-extrabold uppercase tracking-[0.18em] ${
        tone === 'dark' ? 'text-sky-200' : tone === 'warning' ? 'text-amber-600' : 'text-slate-400'
      }`}>
        {eyebrow}
      </p>
      <p className={`mt-2 text-lg font-black tracking-tight ${
        tone === 'dark' ? 'text-white' : 'text-slate-900'
      }`}>
        {title}
      </p>
      <p className={`mt-2 text-sm leading-relaxed ${
        tone === 'dark' ? 'text-slate-300' : tone === 'warning' ? 'text-amber-800' : 'text-slate-600'
      }`}>
        {description}
      </p>
      <div className="mt-4">{action}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function GoalDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { entitlements } = useEntitlements();
  const sourceParam = new URLSearchParams(location.search).get('source');
  const fromResume = sourceParam === 'resume';

  const [goal, setGoal] = useState<Goal | null>(null);
  const fromTargetRole = sourceParam === 'target-role' || goal?.raw?.source === 'target_role';
  const [planHealth, setPlanHealth] = useState<GoalPlanHealth | null>(null);
  const [nodes, setNodes] = useState<ConceptNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingPlanHealth, setLoadingPlanHealth] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [decomposing, setDecomposing] = useState(false);
  const [rebaselining, setRebaselining] = useState(false);
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
  const [coverage, setCoverage] = useState<ResourceCoverage | null>(null);
  const [resourcesError, setResourcesError] = useState<string | null>(null);
  const [fillingGaps, setFillingGaps] = useState(false);
  const [makingPrimary, setMakingPrimary] = useState(false);
  const [exportingArtifacts, setExportingArtifacts] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const toast = useToast();
  const artifactsExportEnabled = entitlements.find(
    (entry) => entry.featureKey === 'artifacts.export.enabled',
  )?.enabled;

  useEffect(() => {
    if (!id) return;
    setLoadingPlanHealth(true);
    Promise.all([
      getGoal(id),
      getGoalNodes(id).catch(() => []),
      getGoalPlanHealth(id).catch(() => null),
    ])
      .then(([g, n, health]) => {
        setGoal(g);
        setNodes(n);
        setPlanHealth(health);
        if (g?.pipelineRun?.status === 'running') setDecomposing(true);
        void trackEvent({
          eventKey: 'goal_detail_viewed',
          goalId: id,
          properties: {
            status: g?.status ?? null,
            goalType: g?.structured?.goalType ?? null,
            nodeCount: Array.isArray(n) ? n.length : 0,
          },
        }).catch(() => {});
      })
      .catch(() => setError('Goal not found'))
      .finally(() => {
        setLoading(false);
        setLoadingPlanHealth(false);
      });
  }, [id]);

  // Lazy-load resources when tab opens
  useEffect(() => {
    if (activeTab !== 'resources' || resourcesLoaded || !id || nodes.length === 0) return;
    setResourcesLoading(true);
    setResourcesError(null);
    Promise.all([
      getGoalResources(id),
      getResourceCoverage(id).catch(() => null),
    ])
      .then(([data, cov]) => {
        setResourceMap(data);
        setCoverage(cov);
        setResourcesLoaded(true);
      })
      .catch(() => {
        setResourcesError('Failed to load resources. Switch tabs and try again.');
      })
      .finally(() => setResourcesLoading(false));
  }, [activeTab, resourcesLoaded, id, nodes.length]);

  const handleConfirm = async () => {
    if (!id) return;
    setConfirming(true);
    void trackEvent({
      eventKey: 'goal_confirm_clicked',
      goalId: id,
      properties: {
        source: 'goal_detail',
      },
    }).catch(() => {});
    try {
      await confirmGoal(id);
      navigate('/today');
    } catch { setConfirming(false); }
  };

  const handleCorrect = async () => {
    if (!id || !correction.trim()) return;
    setCorrecting(true);
    try {
      const updated = await correctGoal(id, correction);
      setGoal(updated);
      setLoadingPlanHealth(true);
      const health = await getGoalPlanHealth(id).catch(() => null);
      setPlanHealth(health);
      setCorrection('');
      setShowCorrect(false);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Correction failed');
    } finally {
      setCorrecting(false);
      setLoadingPlanHealth(false);
    }
  };

  const handleDecompose = async () => {
    if (!id) return;
    setDecomposing(true);
    setError('');
    void trackEvent({
      eventKey: 'goal_decompose_requested',
      goalId: id,
      properties: {
        source: 'goal_detail',
      },
    }).catch(() => {});
    try {
      await decomposeGoal(id);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Decomposition failed');
      setDecomposing(false);
    }
  };

  const onPipelineComplete = async (_run: PipelineRun) => {
    if (!id) return;
    const [updated, updatedNodes, updatedPlanHealth] = await Promise.all([
      getGoal(id),
      getGoalNodes(id).catch(() => []),
      getGoalPlanHealth(id).catch(() => null),
    ]);
    setGoal(updated);
    setNodes(updatedNodes);
    setPlanHealth(updatedPlanHealth);
    setDecomposing(false);
    // Invalidate cached resources so Resources tab re-fetches
    setResourcesLoaded(false);
    setResourceMap({});
  };

  const handleRebaseline = async () => {
    if (!id) return;
    setRebaselining(true);
    try {
      const health = await rebaselineGoalSprint(id);
      setPlanHealth(health);
      toast({
        title: 'Sprint forecast updated',
        status: 'success',
        duration: 2500,
        isClosable: true,
        position: 'top-right',
      });
    } catch {
      toast({
        title: 'Failed to refresh sprint forecast',
        status: 'error',
        duration: 3000,
        isClosable: true,
        position: 'top-right',
      });
    } finally {
      setRebaselining(false);
    }
  };

  const handleExportArtifacts = async () => {
    if (!id) return;
    setExportingArtifacts(true);
    setError('');
    try {
      const result = await exportGoalArtifacts(id, 'markdown');
      const objectUrl = window.URL.createObjectURL(result.blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = result.filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(objectUrl);
      toast({
        title: 'Artifact export ready',
        description: 'Your saved session work has been exported as Markdown.',
        status: 'success',
        duration: 2500,
        isClosable: true,
        position: 'top-right',
      });
    } catch (err: any) {
      const message =
        err?.response?.data?.error ?? 'Could not export artifacts right now.';
      setError(message);
      toast({
        title: 'Export failed',
        description: message,
        status: 'error',
        duration: 3000,
        isClosable: true,
        position: 'top-right',
      });
    } finally {
      setExportingArtifacts(false);
    }
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

  const handleFillGaps = async () => {
    if (!id) return;
    setFillingGaps(true);
    try {
      await fillResourceGaps(id);
      // Re-fetch coverage after 30s to reflect gap-fill progress
      setTimeout(() => {
        getResourceCoverage(id).then(setCoverage).catch(() => null);
      }, 30_000);
    } finally {
      setFillingGaps(false);
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
      setCoverage(null);
    } catch (err: any) {
      setEnrichmentRetryError(err?.response?.data?.error ?? 'Failed to start enrichment');
    } finally {
      setEnrichmentRetrying(false);
    }
  };

  // ── Loading / error states ──
  if (loading) return (
    <SurfaceCard p={{ base: 8, md: 12 }}>
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-slate-400">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-sky-500" />
        <span className="text-sm">Loading your plan...</span>
      </div>
    </SurfaceCard>
  );

  if (error && !goal) return (
    <EmptyState
      title="We couldn't load this goal"
      description={error}
      action={(
        <Button as={Link} to="/goals" colorScheme="blue">
          Back to goals
        </Button>
      )}
    />
  );

  if (!goal) return null;

  const s = goal.structured;
  const sprint = planHealth?.sprint ?? goal.sprint ?? null;
  const gaps = goal.skillGaps.map(g => g.structured).filter(Boolean);
  const topics = goal.learningTopics.map(t => t.structured).filter(Boolean).sort((a, b) => a.priority - b.priority);
  const isActive = goal.status === 'active';

  const allDecomposed = goal.learningTopics.length > 0 &&
    goal.learningTopics.every(t => t.structured?.decompositionStatus === 'completed');
  const anyDecomposed = goal.learningTopics.some(t => t.structured?.decompositionStatus === 'completed');
  const failedTopics = goal.learningTopics
    .map(t => t.structured)
    .filter((topic): topic is LearningTopic => !!topic && topic.decompositionStatus === 'failed');
  const failedTopicCount = failedTopics.length;
  const completedTopicCount = goal.learningTopics.filter(
    t => t.structured?.decompositionStatus === 'completed',
  ).length;
  const inProgressTopicCount = goal.learningTopics.filter(
    t => t.structured?.decompositionStatus === 'in_progress',
  ).length;
  const canDecompose = isActive && !allDecomposed && !decomposing;

  const nodesByDepth = depthOrder.reduce((acc, depth) => {
    acc[depth] = nodes.filter(n => n.depth_level === depth);
    return acc;
  }, {} as Record<string, ConceptNode[]>);

  // Build topicId to title map for resources tab grouping
  const topicTitleById: Record<string, string> = {};
  for (const t of goal.learningTopics) {
    topicTitleById[t._id] = t.structured?.title ?? 'Unknown topic';
  }

  const noAvailableNodesYet = nodes.length > 0 && !nodes.some(n => n.status === 'available');
  const availableNodeCount = nodes.filter(n => n.status === 'available' || n.status === 'in_progress' || n.status === 'review_due').length;
  const completedNodeCount = nodes.filter(n => n.status === 'done').length;
  const goalAccepted = isActive;
  const graphReady = nodes.length > 0;
  const hasPlanPreview =
    goalAccepted || gaps.length > 0 || topics.length > 0 || nodes.length > 0;
  const hasResources = resourcesLoaded && Object.values(resourceMap).some((items) => items.length > 0);
  const nextAction = !goalAccepted && gaps.length === 0
    ? {
        eyebrow: 'Setup incomplete',
        title: 'Finish shaping this goal',
        description: 'This goal does not have enough generated plan detail yet. Start a fresh setup so the app can produce gaps, topics, and a useful sprint path.',
        label: 'Start goal setup',
        kind: 'setup' as const,
      }
    : !goalAccepted
    ? {
        eyebrow: 'Decision needed',
        title: 'Review the generated plan',
        description: 'Confirm the strategy if it matches your intent, or correct it before the app starts shaping daily work around it.',
        label: confirming ? 'Starting your journey...' : 'This looks right - start my plan',
        kind: 'confirm' as const,
      }
    : canDecompose
      ? {
          eyebrow: 'Next unlock',
          title: anyDecomposed ? 'Continue building study nodes' : 'Build the study graph',
          description: 'Turn the high-level topics into prerequisite-ordered concepts, so Today can recommend concrete sessions.',
          label: anyDecomposed ? 'Continue building nodes' : 'Build study nodes',
          kind: 'decompose' as const,
        }
      : availableNodeCount > 0
        ? {
            eyebrow: 'Ready now',
            title: 'Start from your unlocked concepts',
            description: 'You have study nodes ready. Use Today for the session queue, or inspect Concepts if you want to understand the graph.',
            label: 'Go to Today',
            kind: 'today' as const,
          }
        : {
            eyebrow: 'Keep momentum',
            title: 'Review progress and proof',
            description: 'Use the health forecast, job gap report, and mock interview to keep this goal tied to a real outcome.',
            label: 'Open mock interview',
            kind: 'mock' as const,
          };

  const flowSteps = [
    {
      title: 'Shape',
      description: 'Goal, why, criteria',
      state: goalAccepted ? 'done' : 'current',
    },
    {
      title: 'Map',
      description: 'Topics to concepts',
      state: graphReady ? 'done' : goalAccepted ? 'current' : 'locked',
    },
    {
      title: 'Practice',
      description: 'Daily sessions',
      state: completedNodeCount > 0 ? 'done' : graphReady ? 'current' : 'locked',
    },
    {
      title: 'Prove',
      description: 'Artifacts and interviews',
      state: completedNodeCount > 0 ? 'current' : 'locked',
    },
  ] as const;

  const tabs: { id: TabId; label: string }[] = [
    { id: 'overview',   label: 'Overview' },
    { id: 'concepts',   label: `Concepts${nodes.length ? ` (${nodes.length})` : ''}` },
    { id: 'resources',  label: 'Resources' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Goal command center"
        title={s.title || 'Goal setup'}
        actions={(
          <div className="flex flex-wrap gap-2">
            <Link
              to="/goals"
              className="inline-flex items-center justify-center rounded-xl border border-black/10 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:border-sky-200 hover:text-sky-700"
            >
              Back to goals
            </Link>
            {goal.isPrimary ? (
              <span className="inline-flex items-center rounded-full bg-sky-100 px-3 py-2 text-xs font-extrabold uppercase tracking-[0.14em] text-sky-700">
                Primary
              </span>
            ) : null}
            <span className={`inline-flex items-center rounded-full px-3 py-2 text-xs font-extrabold uppercase tracking-[0.14em] ${
              isActive ? 'bg-emerald-100 text-emerald-700' : gaps.length === 0 ? 'bg-slate-100 text-slate-600' : 'bg-amber-100 text-amber-700'
            }`}>
              {isActive ? 'Active' : gaps.length === 0 ? 'Incomplete' : 'Needs review'}
            </span>
          </div>
        )}
      />

      {fromResume && (
        <SurfaceCard p={5} className="border-sky-100 bg-sky-50/80">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-700">
                Created from resume analysis
              </p>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
                We turned the resume gaps into a career goal. Review the plan before Daily Push starts scheduling daily work from it.
              </p>
            </div>
            <Link
              to="/resume"
              className="inline-flex items-center justify-center rounded-full border border-sky-200 bg-white px-4 py-2 text-sm font-black text-sky-700 hover:border-sky-300"
            >
              Back to resume report
            </Link>
          </div>
        </SurfaceCard>
      )}

      {fromTargetRole && (
        <SurfaceCard p={5} className="border-emerald-100 bg-emerald-50/80">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">
                Created from role market readiness
              </p>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
                This execution goal came from your {goal.raw?.targetRoleTitle ?? 'target role'} upgrade plan. Daily Push is turning the missing proof and interview risks into focused daily work.
              </p>
            </div>
            <Link
              to={goal.raw?.targetRoleId ? `/target-roles/${goal.raw.targetRoleId}` : '/career-market'}
              className="inline-flex items-center justify-center rounded-full border border-emerald-200 bg-white px-4 py-2 text-sm font-black text-emerald-700 hover:border-emerald-300"
            >
              Back to role workspace
            </Link>
          </div>
        </SurfaceCard>
      )}

      <SurfaceCard p={0} overflow="hidden">
        <div className={hasPlanPreview ? 'grid gap-0 lg:grid-cols-[1.45fr_0.9fr]' : ''}>
          {hasPlanPreview && (
            <div className="relative overflow-hidden bg-[radial-gradient(circle_at_12%_0%,rgba(125,211,252,0.45),transparent_34%),radial-gradient(circle_at_100%_20%,rgba(15,23,42,0.32),transparent_42%),linear-gradient(135deg,#082f49_0%,#115e75_52%,#0f172a_100%)] px-5 py-6 text-white md:px-8 md:py-8">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-white/12 px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.18em] text-cyan-50">
                  {s.goalType} goal
                </span>
                <span className="rounded-full bg-white/12 px-3 py-1 text-[11px] font-semibold text-cyan-50">
                  {urgencyLabel[s.urgency] ?? s.urgency}
                </span>
                {s.emotionalDriver ? (
                  <span className="rounded-full bg-white/12 px-3 py-1 text-[11px] font-semibold text-cyan-50">
                    {driverLabel[s.emotionalDriver] ?? s.emotionalDriver}
                  </span>
                ) : null}
              </div>
              <p className="mt-5 max-w-3xl text-2xl font-black leading-tight tracking-[-0.04em] md:mt-6 md:text-4xl">
                {s.successCriteria || 'Turn this goal into measurable daily progress.'}
              </p>
              {s.statedWhy ? (
                <p className="mt-4 max-w-2xl text-sm leading-7 text-cyan-50/80">
                  Why this matters: "{s.statedWhy}"
                </p>
              ) : null}
              <div className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
                <MetricTile
                  label="Pace"
                  value={s.estimatedWeeksAtPace ? `${s.estimatedWeeksAtPace}w` : s.estimatedWeeks ? `${s.estimatedWeeks}w` : 'TBD'}
                  detail={s.availableMinsDay ? `${s.availableMinsDay} min/day` : 'Sprint rhythm pending'}
                />
                <MetricTile label="Gaps" value={`${gaps.length}`} detail="Skill gaps mapped" />
                <MetricTile label="Topics" value={`${topics.length}`} detail={`${completedTopicCount} decomposed`} />
                <MetricTile label="Nodes" value={`${nodes.length}`} detail={`${availableNodeCount} ready now`} />
              </div>
            </div>
          )}

          <div className={`${hasPlanPreview ? 'order-first border-t border-black/5 lg:order-none lg:border-l lg:border-t-0' : ''} bg-slate-50/90 p-5`}>
            <ActionCard
              eyebrow={nextAction.eyebrow}
              title={nextAction.title}
              description={nextAction.description}
              tone={nextAction.kind === 'confirm' ? 'warning' : 'dark'}
              action={(
                nextAction.kind === 'setup' ? (
                  <Link
                    to="/goals/new"
                    className="inline-flex w-full items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-extrabold text-white transition-colors hover:bg-slate-800"
                  >
                    {nextAction.label}
                  </Link>
                ) : nextAction.kind === 'confirm' ? (
                  <button
                    onClick={handleConfirm}
                    disabled={confirming}
                    className="inline-flex w-full items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-extrabold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {nextAction.label}
                  </button>
                ) : nextAction.kind === 'decompose' ? (
                  <button
                    onClick={handleDecompose}
                    disabled={decomposing}
                    className="inline-flex w-full items-center justify-center rounded-2xl bg-white px-5 py-3 text-sm font-extrabold text-slate-950 transition-colors hover:bg-cyan-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {nextAction.label}
                  </button>
                ) : nextAction.kind === 'today' ? (
                  <Link
                    to="/today"
                    className="inline-flex w-full items-center justify-center rounded-2xl bg-white px-5 py-3 text-sm font-extrabold text-slate-950 transition-colors hover:bg-cyan-50"
                  >
                    {nextAction.label}
                  </Link>
                ) : (
                  <Link
                    to={`/mock?goalId=${id}`}
                    className="inline-flex w-full items-center justify-center rounded-2xl bg-white px-5 py-3 text-sm font-extrabold text-slate-950 transition-colors hover:bg-cyan-50"
                  >
                    {nextAction.label}
                  </Link>
                )
              )}
            />

            <div className="mt-4 grid gap-2">
              {flowSteps.map((step, index) => (
                <FlowStep
                  key={step.title}
                  index={index + 1}
                  title={step.title}
                  description={step.description}
                  state={step.state}
                />
              ))}
            </div>
          </div>
        </div>
      </SurfaceCard>

      {isActive && (
        <SurfaceCard p={2} position="sticky" top={{ base: '76px', md: '84px' }} zIndex={5}>
          <div className="flex gap-2 overflow-x-auto">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-extrabold transition-colors ${
                  activeTab === tab.id
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </SurfaceCard>
      )}

      <div className="hidden">
        <Link to="/goals" className="text-slate-400 hover:text-slate-600 text-sm inline-block">Goals</Link>
      </div>

      {/* ── Goal header ── */}
      <div className="hidden bg-gradient-to-br from-sky-600 to-indigo-600 rounded-2xl p-6 text-white mb-0">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sky-200 text-xs font-semibold uppercase tracking-widest">{s.goalType} goal</span>
          <span className="text-sky-300 text-xs">/</span>
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
      <div className="hidden border-b border-slate-200 bg-white sticky top-0 z-10 mt-4 rounded-t-xl overflow-hidden">
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
          {loadingPlanHealth && (
            <SurfaceCard p={5}>
              <div className="flex items-center gap-3 text-sm text-slate-400">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-sky-500" />
                Refreshing sprint forecast...
              </div>
            </SurfaceCard>
          )}

          {isActive && planHealth && (
            <SurfaceCard p={5}>
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                      {sprint?.templateLabel ?? 'Plan health'}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        sprintStatusBadge[planHealth.status] ?? sprintStatusBadge.planned
                      }`}
                    >
                      {sprintStatusLabel[planHealth.status] ?? sprintStatusLabel.planned}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed text-slate-600">
                    {planHealth.summary}
                  </p>
                </div>
                {planHealth.hasSprint && (
                  <button
                    onClick={handleRebaseline}
                    disabled={rebaselining}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:border-sky-200 hover:text-sky-700 disabled:opacity-50"
                  >
                    {rebaselining ? 'Refreshing...' : 'Refresh forecast'}
                  </button>
                )}
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-4">
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                    Target date
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-800">
                    {formatShortDate(planHealth.targetDate)}
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                    Forecast
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-800">
                    {formatShortDate(planHealth.forecastedCompletionDate)}
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                    Weekly rhythm
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-800">
                    {planHealth.weeklyTargetMinutes !== null
                      ? `${(planHealth.weeklyTargetMinutes / 60).toFixed(1).replace(/\.0$/, '')}h/week`
                      : 'Not set'}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {planHealth.recommendedDailyMinutes !== null
                      ? `About ${planHealth.recommendedDailyMinutes} min/day`
                      : 'Set this in sprint setup'}
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                    Progress
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-800">
                    {planHealth.completionScore}%
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {planHealth.completedNodes}/{planHealth.totalNodes} nodes done
                  </p>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Risk level</span>
                  <span>Risk {planHealth.riskScore}/100</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${
                      planHealth.riskScore >= 60
                        ? 'bg-red-500'
                        : planHealth.riskScore >= 35
                          ? 'bg-amber-500'
                          : 'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.max(planHealth.riskScore, 8)}%` }}
                  />
                </div>
                <div className="grid gap-2 text-xs text-slate-500 md:grid-cols-3">
                  <p>
                    Ready topics: <span className="font-semibold text-slate-700">{planHealth.readyTopics}/{planHealth.totalTopics}</span>
                  </p>
                  <p>
                    Available now: <span className="font-semibold text-slate-700">{planHealth.availableNodes}</span> nodes
                  </p>
                  <p>
                    Recent rhythm: <span className="font-semibold text-slate-700">{planHealth.sessionsLast7Days}</span> sessions in 7 days
                  </p>
                </div>
              </div>

              {(sprint?.targetRole || sprint?.targetCompany || sprint?.currentBlockers?.length || sprint?.successEvidence?.length) && (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-slate-100 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                      Outcome target
                    </p>
                    <p className="mt-2 text-sm text-slate-700">
                      {sprint?.targetRole ?? 'Role not set'}
                      {sprint?.targetCompany ? ` at ${sprint.targetCompany}` : ''}
                    </p>
                    {planHealth.bufferDays !== null && (
                      <p className="mt-1 text-xs text-slate-500">
                        {planHealth.bufferDays >= 0
                          ? `${planHealth.bufferDays} day${planHealth.bufferDays === 1 ? '' : 's'} of buffer left`
                          : `${Math.abs(planHealth.bufferDays)} day${Math.abs(planHealth.bufferDays) === 1 ? '' : 's'} behind target`}
                      </p>
                    )}
                  </div>
                  <div className="rounded-xl border border-slate-100 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                      Success proof
                    </p>
                    <div className="mt-2 space-y-1 text-sm text-slate-700">
                      {sprint?.successEvidence?.length
                        ? sprint.successEvidence.slice(0, 3).map((entry) => (
                            <p key={entry}>- {entry}</p>
                          ))
                        : <p className="text-slate-500">No explicit proof targets yet.</p>}
                    </div>
                  </div>
                </div>
              )}
            </SurfaceCard>
          )}

          {/* Success criteria */}
          {s.successCriteria && (
            <SurfaceCard p={5}>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">What success looks like</p>
              <p className="text-slate-700 text-sm leading-relaxed">{s.successCriteria}</p>
            </SurfaceCard>
          )}

          {/* Skill gaps */}
          {gaps.length > 0 && (
            <SurfaceCard p={5} className="space-y-3">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
                Skill gaps - {gaps.length} identified
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
                    <span className="text-slate-400">to</span>
                    <span className="capitalize font-medium text-slate-700">{gap.requiredLevel}</span>
                    <span className="text-slate-300">|</span>
                    <span className="text-slate-400">{aiLabel[gap.aiRelationship]}</span>
                  </div>
                  {gap.priorityReason && (
                    <p className="text-xs text-slate-400 leading-relaxed">{gap.priorityReason}</p>
                  )}
                </div>
              ))}
            </SurfaceCard>
          )}

          {/* Learning path */}
          {topics.length > 0 && (
            <SurfaceCard p={5} className="space-y-3">
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
                  const attemptLabel = formatAttemptLabel(topic);
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
                        {attemptLabel && (
                          <p className="text-[11px] text-slate-400 mt-2">{attemptLabel}</p>
                        )}
                        {status === 'failed' && topic.lastDecompositionError && (
                          <div className="mt-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2">
                            <p className="text-[11px] font-medium text-red-600">Needs retry</p>
                            <p className="text-[11px] text-red-500 mt-1 leading-relaxed">
                              {topic.lastDecompositionError}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
            </SurfaceCard>
          )}

          {goal.pipelineRun && goal.pipelineRun.status !== 'done' && (
            <SurfaceCard p={4} className={`${
              failedTopicCount > 0
                ? 'bg-amber-50 border-amber-200'
                : 'bg-sky-50 border-sky-200'
            }`}>
              <p className={`text-sm font-semibold ${
                failedTopicCount > 0 ? 'text-amber-900' : 'text-sky-900'
              }`}>
                {failedTopicCount > 0 ? 'Plan is partially ready' : 'Plan is still building'}
              </p>
              <p className={`text-xs mt-1 ${
                failedTopicCount > 0 ? 'text-amber-700' : 'text-sky-700'
              }`}>
                {completedTopicCount > 0 && `${completedTopicCount} topic${completedTopicCount === 1 ? '' : 's'} ready. `}
                {failedTopicCount > 0 && `${failedTopicCount} topic${failedTopicCount === 1 ? '' : 's'} need retry. `}
                {inProgressTopicCount > 0 && `${inProgressTopicCount} still building. `}
                Use the retry action below to continue building missing study nodes.
              </p>
            </SurfaceCard>
          )}

          {/* Pipeline status (active decompose) */}
          {id && decomposing && (
            <SurfaceCard p={5}>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">
                Building your study nodes
              </p>
              <PipelineStatus goalId={id} type="decompose" onComplete={onPipelineComplete} />
            </SurfaceCard>
          )}

          {/* Static partial/failed pipeline */}
          {id && !decomposing && goal?.pipelineRun &&
            (goal.pipelineRun.status === 'running' ||
             goal.pipelineRun.status === 'partial' ||
             goal.pipelineRun.status === 'failed') && (
            <SurfaceCard p={5} className="border-amber-200">
              <p className="text-xs font-semibold text-amber-600 uppercase tracking-widest mb-4">
                Pipeline needs attention
              </p>
              <PipelineStatus goalId={id} type="decompose" onComplete={onPipelineComplete} />
            </SurfaceCard>
          )}

          {/* Decompose CTA */}
          {isActive && canDecompose && !decomposing && (
            <SurfaceCard p={5} className="space-y-3 border-indigo-200 bg-indigo-50">
              <div>
                <p className="text-sm font-semibold text-indigo-900">Build your study nodes</p>
                <p className="text-xs text-indigo-600 mt-1">
                  We'll break each topic into prerequisite-ordered concept nodes, the actual things you'll study one per day.
                  {anyDecomposed && ' Some topics are already decomposed.'}
                  {failedTopicCount > 0 && ' Failed topics can be retried without rebuilding the completed ones.'}
                </p>
              </div>
              {error && <p className="text-red-600 text-xs">{error}</p>}
              <button
                onClick={handleDecompose}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-lg text-sm font-semibold transition-colors"
              >
                {anyDecomposed ? 'Continue building nodes' : 'Build study nodes'}
              </button>
            </SurfaceCard>
          )}

          {/* Correction flow */}
          {!isActive && gaps.length > 0 && (
            <div className="space-y-3">
              {showCorrect ? (
                <SurfaceCard p={5} className="space-y-3">
                  <p className="text-sm font-semibold text-slate-700">What's wrong or missing?</p>
                  <p className="text-xs text-slate-400">Tell us in plain text and we will re-derive the plan with your correction.</p>
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
                </SurfaceCard>
              ) : (
                <button
                  onClick={() => setShowCorrect(true)}
                  className="w-full text-center text-sm text-slate-400 hover:text-slate-600 py-2 border border-dashed border-slate-200 rounded-xl"
                >
                  Something wrong or missing? Correct it
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
              {confirming ? 'Starting your journey...' : 'This looks right - start my plan'}
            </button>
          )}

          {/* What you told us */}
          {goal.raw.input.trim() && (
            <details className="bg-slate-50 border border-slate-200 rounded-xl">
              <summary className="px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-widest cursor-pointer">
                What you told us
              </summary>
              <p className="px-5 pb-4 text-slate-600 text-sm leading-relaxed">{goal.raw.input}</p>
            </details>
          )}

          {/* Goal management */}
          <SurfaceCard p={5} className="space-y-3">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Manage goal</p>
            <div className="flex flex-wrap gap-2">
              {!goal.isPrimary && goal.status !== 'archived' && (
                <Button
                  size="sm"
                  colorScheme="blue"
                  variant="outline"
                  isLoading={makingPrimary}
                  loadingText="Updating..."
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
                  loadingText="Archiving..."
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
          </SurfaceCard>
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
              <Button colorScheme="red" onClick={handleDelete} isLoading={deleting} loadingText="Deleting..." size="sm">
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
            <SurfaceCard p={5}>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">
                Building your study nodes
              </p>
              <PipelineStatus goalId={id} type="decompose" onComplete={onPipelineComplete} />
            </SurfaceCard>
          )}

          {/* Decompose CTA if not started */}
          {isActive && canDecompose && !decomposing && (
            <SurfaceCard p={5} className="space-y-3 border-indigo-200 bg-indigo-50">
              <div>
                <p className="text-sm font-semibold text-indigo-900">Build your study nodes</p>
                <p className="text-xs text-indigo-600 mt-1">
                  We'll break each topic into prerequisite-ordered concept nodes, the actual things you'll study one per day.
                </p>
              </div>
              {error && <p className="text-red-600 text-xs">{error}</p>}
              <button
                onClick={handleDecompose}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-lg text-sm font-semibold transition-colors"
              >
                {anyDecomposed ? 'Continue building nodes' : 'Build study nodes'}
              </button>
            </SurfaceCard>
          )}

          {!decomposing && nodes.length === 0 && failedTopicCount > 0 && (
            <EmptyState
              title="No study nodes available yet"
              description="Topic decomposition failed before any concepts could be unlocked. Retry the failed topics above to generate your first study nodes."
              accent="warning"
            />
          )}

          {!decomposing && nodes.length > 0 && noAvailableNodesYet && (
            <EmptyState
              title="Nodes were built, but none are unlocked yet"
              description="Your concept graph exists, but no topic is currently marked available for study. This usually means decomposition completed with gaps or produced only blocked prerequisites."
              accent="warning"
            />
          )}

          {/* Node list */}
          {nodes.length > 0 && (
            <SurfaceCard p={5} className="space-y-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Concept nodes</p>
                <span className="text-xs text-slate-400">{nodes.length} nodes / {nodes.filter(n => n.status === 'done').length} done</span>
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
            </SurfaceCard>
          )}

          {nodes.length === 0 && !decomposing && !canDecompose && (
            <EmptyState
              title="No concept nodes yet"
              description="Go to Overview and build the study graph first, then the concept list will populate here."
              accent="neutral"
            />
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

          {!resourcesLoading && resourcesError && (
            <p className="text-center py-6 text-sm text-red-500">{resourcesError}</p>
          )}

          {!resourcesLoading && nodes.length === 0 && (
            <EmptyState
              title="Resources will appear after decomposition"
              description="Build your study nodes first, then the resource library for each concept will show up here."
              accent="neutral"
            />
          )}

          {!resourcesLoading && nodes.length > 0 && (
            <>
              {/* Coverage summary bar */}
              {coverage && coverage.total > 0 && (
                <SurfaceCard p={3} className="space-y-2 bg-slate-50">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-slate-600">
                        {coverage.coveredCount} / {coverage.total} nodes covered
                      </span>
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                        coverage.coveragePct >= 90
                          ? 'bg-emerald-100 text-emerald-700'
                          : coverage.coveragePct >= 70
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-red-100 text-red-600'
                      }`}>
                        {coverage.coveragePct}%
                      </span>
                    </div>
                    {(coverage.uncoveredCount + coverage.weakCount) > 0 && (
                      <button
                        onClick={handleFillGaps}
                        disabled={fillingGaps}
                        className="text-xs font-medium text-white bg-sky-600 hover:bg-sky-700
                                   px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50 shrink-0"
                      >
                        {fillingGaps ? 'Filling...' : `Fill ${coverage.uncoveredCount + coverage.weakCount} gaps`}
                      </button>
                    )}
                  </div>
                  {(coverage.uncoveredCount + coverage.weakCount) > 0 && (
                    <details className="text-xs text-slate-500">
                      <summary className="cursor-pointer hover:text-slate-700">
                        {coverage.uncoveredCount} uncovered / {coverage.weakCount} weak quality
                      </summary>
                      <ul className="mt-1.5 space-y-0.5 pl-2">
                        {coverage.nodes
                          .filter(n => n.status !== 'covered')
                          .map(n => (
                            <li key={n.nodeSlug} className="flex items-center gap-1.5">
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                n.status === 'uncovered' ? 'bg-red-400' : 'bg-amber-400'
                              }`} />
                              <span className="truncate">{n.canonicalTitle}</span>
                              <span className="text-slate-400 shrink-0">({n.depthLevel})</span>
                            </li>
                          ))
                        }
                      </ul>
                    </details>
                  )}
                </SurfaceCard>
              )}

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
                    <SurfaceCard key={topicDoc._id} p={5} className="space-y-4">
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
                    </SurfaceCard>
                  );
                })}

              {/* Topics not yet decomposed */}
              {goal.learningTopics.some(t => t.structured?.decompositionStatus !== 'completed') && (
                <p className="text-xs text-slate-400 text-center py-2">
                  Some topics haven't been decomposed yet. Their resources will appear here after building nodes.
                </p>
              )}

              {/* Empty state when resources fetched but none found */}
              {resourcesLoaded && Object.keys(resourceMap).length === 0 && (
                <EmptyState
                  title="No resources yet"
                  description="Resources are enriched after decomposition completes. Check back shortly or retry enrichment."
                  accent="neutral"
                />
              )}
            </>
          )}
        </div>
      )}

    </div>
  );
}
