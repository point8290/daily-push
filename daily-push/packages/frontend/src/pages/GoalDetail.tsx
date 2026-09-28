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
  getGoalProgress,
  getGoalResources,
  getResourceCoverage,
  makePrimary,
  rebaselineGoalSprint,
  retryResourceEnrichment,
  type GoalGapProgress,
  type GoalPlanHealth,
  type GoalSprint,
  type NodeResource,
  type PipelineRun,
  type ResourceCoverage,
  trackEvent,
} from '../api/client';
import PipelineStatus from '../components/PipelineStatus';
import GapBoard from '../components/GapBoard';
import WorkList from '../components/WorkList';
import EmptyState from '../components/ui/EmptyState';
import PageHeader from '../components/ui/PageHeader';
import SurfaceCard from '../components/ui/SurfaceCard';
import AppModal from '../components/ui/AppModal';
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
  ownWords?: string | null;
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
  exploring: 'Exploring', planning: 'Planning',
  urgent: 'Time-sensitive', crisis: 'Time-sensitive',
};
const driverLabel: Record<string, string> = {
  growth: 'Growth', avoidance: 'Steadier ground', social: 'Reputation',
  validation: 'Craft', financial: 'Financial', curiosity: 'Curiosity',
};
const longevityColor: Record<string, string> = {
  high: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  low: 'bg-red-50 text-red-600 border-red-200',
};
const aiLabel: Record<string, string> = {
  amplified: 'Judgment-heavy', replaced: 'AI-assisted', unaffected: 'Foundational',
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

type TabId = 'overview' | 'concepts' | 'work' | 'resources';

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
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
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
      <p className="text-xs font-semibold text-slate-400">{label}</p>
      <p className="mt-2 text-lg font-semibold tracking-tight text-slate-900">{value}</p>
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
    <div className={`rounded-2xl border p-5 shadow-sm ${toneClass}`}>
      <p className={`text-[11px] font-extrabold uppercase tracking-[0.18em] ${
        tone === 'dark' ? 'text-sky-200' : tone === 'warning' ? 'text-amber-600' : 'text-slate-400'
      }`}>
        {eyebrow}
      </p>
      <p className={`mt-2 text-lg font-semibold tracking-tight ${
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

export default function GoalDetail({ goalId }: { goalId?: string } = {}) {
  const params = useParams<{ id: string }>();
  const id = goalId ?? params.id;
  const navigate = useNavigate();
  const location = useLocation();
  const { entitlements } = useEntitlements();
  const sourceParam = new URLSearchParams(location.search).get('source');
  const fromResume = sourceParam === 'resume';

  const [goal, setGoal] = useState<Goal | null>(null);
  const fromTargetRole = sourceParam === 'target-role' || goal?.raw?.source === 'target_role';
  const [planHealth, setPlanHealth] = useState<GoalPlanHealth | null>(null);
  const [gapProgress, setGapProgress] = useState<GoalGapProgress | null>(null);
  const [nodes, setNodes] = useState<ConceptNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingPlanHealth, setLoadingPlanHealth] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [decomposing, setDecomposing] = useState(false);
  const [rebaselining, setRebaselining] = useState(false);
  const [showCorrect, setShowCorrect] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
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
  const premiumResourcesEnabled = entitlements.find(
    (entry) => entry.featureKey === 'premium_resources.enabled',
  )?.enabled;

  const loadGapProgress = () => {
    if (!id) return;
    getGoalProgress(id)
      .then(setGapProgress)
      .catch(() => setGapProgress(null));
  };

  useEffect(loadGapProgress, [id]);

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
      const confirmed = await getGoal(id);
      setGoal(confirmed);
      setConfirming(false);
      // Start building the study graph straight away. Sending the user to Today
      // first only showed "your study nodes are not built yet".
      await handleDecompose();
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
  const availableNodeCount = nodes.filter(n => n.status === 'available' || n.status === 'in_progress').length;
  const completedNodeCount = nodes.filter(n => n.status === 'done' || n.status === 'review_due').length;
  const goalAccepted = isActive;
  const graphReady = nodes.length > 0;
  const hasPlanPreview =
    goalAccepted || gaps.length > 0 || topics.length > 0 || nodes.length > 0;
  const hasResources = resourcesLoaded && Object.values(resourceMap).some((items) => items.length > 0);
  const nextAction = !goalAccepted && gaps.length === 0
    ? {
        eyebrow: 'Setup incomplete',
        title: 'Finish setting up this goal',
        description: 'The plan for this goal was not generated. Run the setup again to get skill gaps, topics and a schedule.',
        label: 'Start goal setup',
        kind: 'setup' as const,
      }
    : !goalAccepted
    ? {
        eyebrow: 'Your turn',
        title: 'Review your plan',
        description: 'Check the topics and skill gaps below. If they look right, start the plan. If not, tell us what to change first.',
        label: confirming ? 'Starting your journey...' : 'This looks right - start my plan',
        kind: 'confirm' as const,
      }
    : decomposing || inProgressTopicCount > 0
      ? {
          eyebrow: 'In progress',
          title: 'Building your study map',
          description: 'Each topic is being broken into small concepts. This takes a few minutes; you can leave this page and come back.',
          label: 'Building...',
          kind: 'building' as const,
        }
    : canDecompose
      ? {
          eyebrow: 'Next step',
          title: anyDecomposed ? 'Finish building your study map' : 'Build your study map',
          description: 'Break each topic into small concepts in the right order, so Today can plan your sessions. It takes a few minutes.',
          label: anyDecomposed ? 'Finish building' : 'Build study map',
          kind: 'decompose' as const,
        }
      : availableNodeCount > 0
        ? {
            eyebrow: 'Next step',
            title: 'Pick up your next session',
            description: `${availableNodeCount} concepts are unlocked. Today picks the best one for your next session.`,
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
    { id: 'work',       label: 'Your work' },
    { id: 'resources',  label: 'Resources' },
  ];

  const actionButtonClass =
    'inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60';
  const primaryButton = `${actionButtonClass} bg-sky-600 text-white hover:bg-sky-700`;
  const darkButton = `${actionButtonClass} bg-slate-900 text-white hover:bg-slate-800`;
  const nextActionButton =
    nextAction.kind === 'setup' ? (
      <Link to="/goals/new" className={darkButton}>{nextAction.label}</Link>
    ) : nextAction.kind === 'confirm' ? (
      <button onClick={handleConfirm} disabled={confirming} className={darkButton}>{nextAction.label}</button>
    ) : nextAction.kind === 'building' ? (
      <button disabled className={`${actionButtonClass} bg-slate-100 text-slate-600`}>
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-sky-500" />
        {nextAction.label}
      </button>
    ) : nextAction.kind === 'decompose' ? (
      <button onClick={handleDecompose} disabled={decomposing} className={primaryButton}>{nextAction.label}</button>
    ) : nextAction.kind === 'today' ? (
      <Link to="/today" className={primaryButton}>{nextAction.label}</Link>
    ) : (
      <Link to={`/mock?goalId=${id}`} className={primaryButton}>{nextAction.label}</Link>
    );
  const statusChip = isActive
    ? { label: 'Active', cls: 'bg-emerald-100 text-emerald-700' }
    : gaps.length === 0
      ? { label: 'Setup incomplete', cls: 'bg-slate-100 text-slate-600' }
      : { label: 'Needs your review', cls: 'bg-amber-100 text-amber-800' };
  const goalProgressPct = nodes.length ? Math.round((completedNodeCount / nodes.length) * 100) : 0;
  // Weeks until the plan-health forecast, so this matches Today and Plan health.
  const forecastIso = planHealth?.forecastedCompletionDate ?? sprint?.forecastedCompletionDate ?? null;
  const forecastMs = forecastIso ? new Date(forecastIso).getTime() : NaN;
  const paceWeeks = Number.isFinite(forecastMs)
    ? Math.max(1, Math.ceil((forecastMs - Date.now()) / (7 * 24 * 60 * 60 * 1000)))
    : s.estimatedWeeksAtPace ?? s.estimatedWeeks;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Path"
        title={s.title || 'Goal setup'}
        description={
          goal.ownWords
            ? `In your words: “${goal.ownWords.length > 220 ? `${goal.ownWords.slice(0, 217).trim()}…` : goal.ownWords}”`
            : s.successCriteria || undefined
        }
        actions={(
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusChip.cls}`}>{statusChip.label}</span>
            <Link
              to="/directions"
              className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600 transition-colors hover:border-sky-200 hover:text-sky-700"
            >
              Directions
            </Link>
          </div>
        )}
      />

      {fromResume && (
        <SurfaceCard p={5} className="border-sky-100 bg-sky-50/80">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold text-sky-700">
                Created from resume analysis
              </p>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
                We turned the resume gaps into a career goal. Review the plan before Daily Push starts scheduling daily work from it.
              </p>
            </div>
            <Link
              to="/resume"
              className="inline-flex items-center justify-center rounded-full border border-sky-200 bg-white px-4 py-2 text-sm font-semibold text-sky-700 hover:border-sky-300"
            >
              Back to resume report
            </Link>
          </div>
        </SurfaceCard>
      )}

      {fromTargetRole && (
        <p className="-mt-2 text-sm text-slate-600">
          Plan for{' '}
          <Link
            to={goal.raw?.targetRoleId ? `/target-roles/${goal.raw.targetRoleId}` : '/career-market'}
            className="font-semibold text-sky-700 hover:underline"
          >
            {goal.raw?.targetRoleTitle ?? 'your target role'} →
          </Link>
          <span className="text-slate-400"> · readiness, proof and applications live on the role page</span>
        </p>
      )}

      {/* Next step: the one thing to do on this goal */}
      <SurfaceCard p={5} className={nextAction.kind === 'confirm' ? 'border-amber-200 bg-amber-50/60' : ''}>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-sky-700">{nextAction.eyebrow}</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{nextAction.title}</p>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-600">{nextAction.description}</p>
          </div>
          <div className="shrink-0">{nextActionButton}</div>
        </div>
        <ol className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-slate-100 pt-3 text-xs" aria-label="Goal stages">
          {flowSteps.map((step, index) => (
            <li key={step.title} className="flex items-center gap-2">
              {index > 0 && <span className="text-slate-300" aria-hidden>→</span>}
              <span
                className={
                  step.state === 'done'
                    ? 'font-semibold text-emerald-700'
                    : step.state === 'current'
                      ? 'font-semibold text-slate-900'
                      : 'text-slate-400'
                }
              >
                {step.state === 'done' ? '✓ ' : ''}
                {step.title}
              </span>
            </li>
          ))}
        </ol>
      </SurfaceCard>

      {hasPlanPreview && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <GoalStat
            label="Progress"
            value={graphReady ? `${goalProgressPct}%` : '–'}
            detail={graphReady ? `${completedNodeCount} of ${nodes.length} concepts` : 'Map not built yet'}
          />
          <GoalStat label="Ready now" value={`${availableNodeCount}`} detail="concepts unlocked" />
          {gapProgress ? (
            <GoalStat
              label="Gaps closed"
              value={`${gapProgress.counts.closed + gapProgress.counts.proven}/${gapProgress.gaps.length}`}
              detail={`${gapProgress.readinessPct}% plan readiness`}
            />
          ) : (
            <GoalStat label="Topics" value={`${completedTopicCount}/${topics.length}`} detail="broken into concepts" />
          )}
          <GoalStat
            label="Time left"
            value={paceWeeks ? `~${paceWeeks} week${paceWeeks === 1 ? '' : 's'}` : '–'}
            detail={s.availableMinsDay ? `at ${s.availableMinsDay} min/day` : 'set during setup'}
          />
        </div>
      )}

      {isActive && (
        <div className="flex gap-1 border-b border-slate-200" role="tablist">
          {tabs.map(tab => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
                activeTab === tab.id
                  ? 'border-sky-600 text-sky-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
          <Link
            to={goalId ? '#path-map' : '/map'}
            className="-mb-px border-b-2 border-transparent px-4 py-2.5 text-sm font-semibold text-slate-500 hover:text-slate-800"
          >
            Map
          </Link>
        </div>
      )}

      {activeTab === 'work' && id && <WorkList goalId={id} />}

      {/* ══════════════════════════════════════════
          OVERVIEW TAB
      ══════════════════════════════════════════ */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          {/* Skill gaps */}
          {gapProgress && id && gapProgress.gaps.length > 0 && (
            <GapBoard goalId={id} progress={gapProgress} onChanged={loadGapProgress} />
          )}
          {!gapProgress && gaps.length > 0 && (
            <SurfaceCard p={5} className="space-y-3">
              <p className="text-sm font-semibold text-slate-800">Skill gaps this plan closes</p>
              <ul className="divide-y divide-slate-100">
                {gaps.map((gap, i) => (
                  <li key={i} className="py-2.5 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className="text-sm font-medium text-slate-800">{gap.skillArea}</span>
                      <span className="text-xs text-slate-500">
                        <span className="capitalize">{gap.currentLevel}</span> →{' '}
                        <span className="font-semibold capitalize text-slate-700">{gap.requiredLevel}</span>
                      </span>
                    </div>
                    {gap.priorityReason && (
                      <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{gap.priorityReason}</p>
                    )}
                  </li>
                ))}
              </ul>
            </SurfaceCard>
          )}

          {loadingPlanHealth && (
            <SurfaceCard p={5}>
              <div className="flex items-center gap-3 text-sm text-slate-400">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-sky-500" />
                Refreshing forecast...
              </div>
            </SurfaceCard>
          )}

          {isActive && planHealth && (
            <SurfaceCard p={5} className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-slate-800">Plan health</p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      sprintStatusBadge[planHealth.status] ?? sprintStatusBadge.planned
                    }`}
                  >
                    {sprintStatusLabel[planHealth.status] ?? sprintStatusLabel.planned}
                  </span>
                </div>
                {planHealth.hasSprint && (
                  <button
                    onClick={handleRebaseline}
                    disabled={rebaselining}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:border-sky-200 hover:text-sky-700 disabled:opacity-50"
                  >
                    {rebaselining ? 'Refreshing...' : 'Refresh forecast'}
                  </button>
                )}
              </div>
              <p className="text-sm leading-relaxed text-slate-600">{planHealth.summary}</p>
              <details className="group">
                <summary className="cursor-pointer text-xs font-semibold text-slate-500 hover:text-slate-800">Dates and pace</summary>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-4">
                <GoalFact label="Target date" value={formatShortDate(planHealth.targetDate)} />
                <GoalFact label="Forecast finish" value={formatShortDate(planHealth.forecastedCompletionDate)} />
                <GoalFact
                  label="Weekly time"
                  value={
                    planHealth.weeklyTargetMinutes !== null
                      ? `${(planHealth.weeklyTargetMinutes / 60).toFixed(1).replace(/\.0$/, '')} h/week`
                      : 'Not set'
                  }
                />
                <GoalFact
                  label="Buffer"
                  value={
                    planHealth.bufferDays === null
                      ? '–'
                      : planHealth.bufferDays >= 0
                        ? `${planHealth.bufferDays} days spare`
                        : `${Math.abs(planHealth.bufferDays)} days behind`
                  }
                />
              </dl>
              </details>
            </SurfaceCard>
          )}

          {/* Learning path */}
          {topics.length > 0 && (
            <SurfaceCard p={5}>
              <details>
              <summary className="flex cursor-pointer items-baseline justify-between">
                <span className="text-sm font-semibold text-slate-800">Learning path</span>
                <span className="text-xs text-slate-500">{topics.length} topics, in order · show</span>
              </summary>
              <ol className="mt-4 space-y-4">
                {goal.learningTopics
                  .map(t => t.structured)
                  .filter(Boolean)
                  .sort((a, b) => a.priority - b.priority)
                  .map((topic, i) => {
                    const status = topic.decompositionStatus ?? 'pending';
                    const badge = decompStatusBadge[status];
                    return (
                      <li key={i} className="flex gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-100 text-xs font-bold text-sky-700">
                          {i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                            <span className="text-sm font-semibold text-slate-800">{topic.title}</span>
                            <span className="text-xs text-slate-500">
                              <span className={`font-medium ${badge.cls}`}>{badge.label}</span> · {topic.estimatedWeeks}w
                            </span>
                          </div>
                          <p className="mt-1 text-xs leading-relaxed text-slate-500">{topic.rationale}</p>
                          {status === 'failed' && topic.lastDecompositionError && (
                            <p className="mt-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-[11px] text-red-600">
                              Needs a retry: {topic.lastDecompositionError}
                            </p>
                          )}
                        </div>
                      </li>
                    );
                  })}
              </ol>
              </details>
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
              <p className="text-sm font-semibold text-slate-400 mb-4">
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
              <p className="text-sm font-semibold text-amber-600 mb-4">
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
              <button
                onClick={() => setShowCorrect(true)}
                className="w-full rounded-xl border border-dashed border-slate-200 py-2 text-center text-sm text-slate-500 hover:text-slate-700"
              >
                Something wrong or missing? Correct it
              </button>
              <AppModal
                isOpen={showCorrect}
                onClose={() => setShowCorrect(false)}
                title="Correct the plan"
                description="Tell us what is wrong or missing in plain words. We rebuild the plan with your correction."
                closeOnOverlayClick={false}
                footer={(
                  <>
                    <button
                      onClick={() => setShowCorrect(false)}
                      className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCorrect}
                      disabled={correcting || !correction.trim()}
                      className="rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
                    >
                      {correcting ? 'Rebuilding plan…' : 'Update plan'}
                    </button>
                  </>
                )}
              >
                <textarea
                  value={correction}
                  onChange={e => setCorrection(e.target.value)}
                  rows={5}
                  autoFocus
                  placeholder="e.g. I have 5 years of experience, not 3. I already know Docker well."
                  className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
                />
                {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
              </AppModal>
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
          {goal.raw.input.trim() && !goal.ownWords && (
            <details className="bg-slate-50 border border-slate-200 rounded-xl">
              <summary className="px-5 py-3 text-sm font-semibold text-slate-400 cursor-pointer">
                What you told us
              </summary>
              <p className="px-5 pb-4 text-slate-600 text-sm leading-relaxed">{goal.raw.input}</p>
            </details>
          )}

          {/* Goal management */}
          <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
            <span className="mr-auto text-xs text-slate-400">Plan settings</span>
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
                  onClick={() => setShowArchiveConfirm(true)}
                >
                  Archive plan
                </Button>
              )}
              <Button
                size="sm"
                colorScheme="red"
                variant="ghost"
                onClick={() => setShowDeleteConfirm(true)}
              >
                Delete plan
              </Button>
            </div>
          </div>
        </div>
      )}

      <AppModal
        isOpen={showArchiveConfirm}
        onClose={() => setShowArchiveConfirm(false)}
        title="Archive this plan?"
        description="It stops showing on Today and in your daily sessions. Your progress is kept, and it still shows under All plans."
        size="md"
        footer={(
          <>
            <button
              onClick={() => setShowArchiveConfirm(false)}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600"
            >
              Cancel
            </button>
            <button
              onClick={async () => { await handleArchive(); setShowArchiveConfirm(false); }}
              disabled={archiving}
              className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {archiving ? 'Archiving…' : 'Archive plan'}
            </button>
          </>
        )}
      >
        <p className="text-sm text-slate-600">{goal.structured?.title}</p>
      </AppModal>

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
              Delete plan
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
              <p className="text-sm font-semibold text-slate-400 mb-4">
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
                <p className="text-sm font-semibold text-slate-400">Concept nodes</p>
                <span className="text-xs text-slate-400">{nodes.length} nodes / {nodes.filter(n => n.status === 'done').length} done</span>
              </div>

              {depthOrder.map(depth => {
                const depthNodes = nodesByDepth[depth];
                if (!depthNodes || depthNodes.length === 0) return null;
                return (
                  <div key={depth} className="space-y-2">
                    <p className="text-sm font-semibold text-slate-500">
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
                {!premiumResourcesEnabled ? (
                  <Link to="/pricing?source=resources" className="shrink-0 text-xs font-semibold text-sky-700 hover:underline">
                    Refreshing resources is on Pro
                  </Link>
                ) : (
                <button
                  onClick={handleResourceRetry}
                  disabled={enrichmentRetrying}
                  className="text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700
                             px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 shrink-0"
                >
                  {enrichmentRetrying ? 'Starting...' : 'Re-fetch resources'}
                </button>
                )}
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
                      <p className="text-sm font-semibold text-slate-500">
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

function GoalStat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white px-4 py-3 shadow-[var(--shadow-xs)]">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-slate-900">{value}</p>
      <p className="mt-0.5 text-xs text-slate-500">{detail}</p>
    </div>
  );
}

function GoalFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold text-slate-800">{value}</dd>
    </div>
  );
}
