import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import {
  Badge,
  Button,
  HStack,
  Input,
  Spinner,
  Stack,
  Text,
  Textarea,
  VStack,
} from '@chakra-ui/react';
import { useEntitlements } from '../contexts/EntitlementsContext';
import {
  evaluateMockInterview,
  getGoal,
  getMockInterviewHistory,
  getMockInterviewRun,
  getPrimaryGoal,
  startMockInterview,
  submitMockInterviewAnswer,
  trackEvent,
  type MockInterviewHistoryItem,
  type MockInterviewMode,
  type MockInterviewRun,
} from '../api/client';
import EmptyState from '../components/ui/EmptyState';
import PageHeader from '../components/ui/PageHeader';
import SurfaceCard from '../components/ui/SurfaceCard';

interface GoalSummary {
  id: string;
  title: string;
  targetRole: string | null;
}

const MODE_OPTIONS: Array<{
  mode: MockInterviewMode;
  label: string;
  description: string;
}> = [
  {
    mode: 'system_design',
    label: 'System Design',
    description: 'Practice clarifying requirements, architecture choices, trade-offs, and scaling decisions.',
  },
  {
    mode: 'behavioral',
    label: 'Behavioral',
    description: 'Sharpen ownership, leadership, conflict, and impact stories for promotion or interviews.',
  },
  {
    mode: 'project_deep_dive',
    label: 'Project Deep Dive',
    description: 'Defend one project end to end: what you owned, how it worked, and what changed because of it.',
  },
];

const MODE_LABELS: Record<MockInterviewMode, string> = {
  system_design: 'System Design',
  behavioral: 'Behavioral',
  project_deep_dive: 'Project Deep Dive',
};

const verdictStyles: Record<string, string> = {
  needs_work: 'bg-red-100 text-red-700',
  solid: 'bg-amber-100 text-amber-700',
  strong: 'bg-emerald-100 text-emerald-700',
};

function formatTimestamp(value: string | null): string {
  if (!value) return 'Not yet';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Not yet';
  return parsed.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatRelativeDate(value: string | null): string {
  if (!value) return 'In progress';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'In progress';
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function EvaluationCard({ run }: { run: MockInterviewRun }) {
  const evaluation = run.evaluation;
  if (!evaluation) return null;

  return (
    <SurfaceCard p={{ base: 5, md: 6 }}>
      <Stack spacing={5}>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                Scorecard
              </span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${verdictStyles[evaluation.verdict] ?? verdictStyles.solid}`}>
                {evaluation.verdict.replace('_', ' ')}
              </span>
            </div>
            <p className="text-sm leading-relaxed text-slate-700">{evaluation.summary}</p>
          </div>
          <div className="rounded-xl bg-slate-50 px-3 py-2 text-right">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
              Overall
            </p>
            <p className="mt-1 text-xl font-semibold text-slate-800">
              {evaluation.overallScore}/5
            </p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {evaluation.rubricScores.map((dimension) => (
            <div key={dimension.dimension} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold capitalize text-slate-800">
                  {dimension.dimension}
                </p>
                <span className="text-xs font-mono text-slate-500">{dimension.score}/5</span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">{dimension.feedback}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-700">
              Strengths
            </p>
            <div className="mt-3 space-y-2 text-sm text-emerald-800">
              {evaluation.strengths.length > 0 ? (
                evaluation.strengths.map((item) => <p key={item}>- {item}</p>)
              ) : (
                <p>There is useful signal here to build on.</p>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-amber-700">
              Tighten next
            </p>
            <div className="mt-3 space-y-2 text-sm text-amber-800">
              {evaluation.improvements.length > 0 ? (
                evaluation.improvements.map((item) => <p key={item}>- {item}</p>)
              ) : (
                <p>Keep making the answer more concrete and easier to follow.</p>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
              Retry plan
            </p>
            <div className="mt-3 space-y-2 text-sm text-slate-600">
              {evaluation.retryPlan.map((item) => <p key={item}>- {item}</p>)}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
              Sprint edits
            </p>
            <div className="mt-3 space-y-2 text-sm text-slate-600">
              {evaluation.suggestedSprintEdits.length > 0 ? (
                evaluation.suggestedSprintEdits.map((item) => <p key={item}>- {item}</p>)
              ) : (
                <p>Keep practicing this mode weekly until the story sounds natural.</p>
              )}
            </div>
          </div>
        </div>
      </Stack>
    </SurfaceCard>
  );
}

export default function MockInterview() {
  const [searchParams] = useSearchParams();
  const { currentPlan, entitlements } = useEntitlements();

  const [goal, setGoal] = useState<GoalSummary | null>(null);
  const [loadingGoal, setLoadingGoal] = useState(true);
  const [history, setHistory] = useState<MockInterviewHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [run, setRun] = useState<MockInterviewRun | null>(null);
  const [mode, setMode] = useState<MockInterviewMode>('system_design');
  const [focusArea, setFocusArea] = useState('');
  const [promptContext, setPromptContext] = useState('');
  const [answer, setAnswer] = useState('');
  const [starting, setStarting] = useState(false);
  const [sending, setSending] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [error, setError] = useState('');
  const [upgradePlan, setUpgradePlan] = useState<string | null>(null);
  const [remainingInterviews, setRemainingInterviews] = useState<number | null | undefined>(undefined);

  const mockEntitlement = entitlements.find(
    (entry) => entry.featureKey === 'mock_interviews.monthly',
  );

  const goalIdFromQuery = searchParams.get('goalId');
  const runIdFromQuery = searchParams.get('runId');

  const loadHistory = async (goalId: string) => {
    setHistoryLoading(true);
    try {
      const items = await getMockInterviewHistory(goalId);
      setHistory(items);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const loadGoal = async () => {
      setLoadingGoal(true);
      setError('');
      try {
        const data = goalIdFromQuery ? await getGoal(goalIdFromQuery) : await getPrimaryGoal();
        if (!data?._id) {
          throw new Error('No active goal found');
        }
        const loadedGoal = {
          id: String(data._id),
          title: data.structured?.title ?? 'Active goal',
          targetRole: data.sprint?.targetRole ?? null,
        };
        if (cancelled) return;
        setGoal(loadedGoal);
        setPromptContext((current) => current || `Goal: ${loadedGoal.title}`);
        void loadHistory(loadedGoal.id);

        void trackEvent({
          eventKey: 'mock_interview_viewed',
          goalId: loadedGoal.id,
          properties: {
            hasRunId: !!runIdFromQuery,
            planKey: currentPlan?.planKey ?? null,
          },
        }).catch(() => {});
      } catch {
        if (!cancelled) {
          setError('Set or choose a goal before starting a mock interview.');
        }
      } finally {
        if (!cancelled) {
          setLoadingGoal(false);
        }
      }
    };

    void loadGoal();
    return () => {
      cancelled = true;
    };
  }, [goalIdFromQuery, currentPlan?.planKey, runIdFromQuery]);

  useEffect(() => {
    if (!goal || !runIdFromQuery) return;
    getMockInterviewRun(runIdFromQuery)
      .then((loadedRun) => {
        setRun(loadedRun);
        setMode(loadedRun.mode);
        setFocusArea(loadedRun.focusArea ?? '');
      })
      .catch(() => {});
  }, [goal?.id, runIdFromQuery]);

  useEffect(() => {
    if (mockEntitlement) {
      setRemainingInterviews(mockEntitlement.remaining);
    }
  }, [mockEntitlement?.remaining, mockEntitlement]);

  const latestInterviewerPrompt = useMemo(() => {
    if (!run) return null;
    const interviewerTurns = run.turns.filter((turn) => turn.role === 'interviewer');
    return interviewerTurns[interviewerTurns.length - 1] ?? null;
  }, [run]);

  const handleStart = async () => {
    if (!goal) return;
    setStarting(true);
    setError('');
    setUpgradePlan(null);
    try {
      const result = await startMockInterview({
        goalId: goal.id,
        mode,
        targetRole: goal.targetRole,
        focusArea: focusArea.trim() || undefined,
        promptContext: promptContext.trim() || undefined,
      });
      setRun(result);
      setAnswer('');
      setRemainingInterviews(result.quota?.remaining ?? remainingInterviews);
      await loadHistory(goal.id);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Could not start the mock interview.');
      setUpgradePlan(err?.response?.data?.upgradePlan ?? null);
    } finally {
      setStarting(false);
    }
  };

  const handleSubmitAnswer = async () => {
    if (!run || !answer.trim()) return;
    setSending(true);
    setError('');
    try {
      const updatedRun = await submitMockInterviewAnswer(run.id, answer.trim());
      setRun(updatedRun);
      setAnswer('');
      if (goal) {
        await loadHistory(goal.id);
      }
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Could not save that answer.');
    } finally {
      setSending(false);
    }
  };

  const handleEvaluate = async () => {
    if (!run) return;
    setEvaluating(true);
    setError('');
    try {
      const updatedRun = await evaluateMockInterview(run.id);
      setRun(updatedRun);
      if (goal) {
        await loadHistory(goal.id);
      }
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Could not score this mock interview yet.');
    } finally {
      setEvaluating(false);
    }
  };

  const handleLoadHistoryItem = async (historyItem: MockInterviewHistoryItem) => {
    try {
      const loadedRun = await getMockInterviewRun(historyItem.id);
      setRun(loadedRun);
      setMode(loadedRun.mode);
      setFocusArea(loadedRun.focusArea ?? '');
      setError('');
    } catch {
      setError('Could not load that interview run.');
    }
  };

  if (loadingGoal) {
    return (
      <SurfaceCard p={{ base: 8, md: 12 }}>
        <VStack spacing={4} minH="50vh" justify="center">
          <Spinner size="lg" color="brand.500" thickness="3px" />
          <Text fontSize="sm" color="ink.500">Preparing your mock interview workspace...</Text>
        </VStack>
      </SurfaceCard>
    );
  }

  if (!goal) {
    return (
      <Stack spacing={6}>
        <PageHeader
          eyebrow="Interview practice"
          title="Mock Interview"
          description="Practice like the outcome matters, then turn the scorecard into better sprint decisions."
        />
        <EmptyState
          title="No active goal found"
          description="Start or choose a goal first so the mock interview can stay tied to a real outcome."
          accent="warning"
          action={(
            <Button as={RouterLink} to="/goals" colorScheme="orange">
              Go to goals
            </Button>
          )}
        />
      </Stack>
    );
  }

  return (
    <Stack spacing={6}>
      <PageHeader
        eyebrow="Interview practice"
        title="Mock Interview"
        description={`Practice against ${goal.title}${goal.targetRole ? ` and your ${goal.targetRole} target` : ''}. Each run stays connected to a real outcome instead of generic prep.`}
        actions={(
          <HStack spacing={3} flexWrap="wrap">
            <Badge colorScheme="blue" px={3} py={1.5} rounded="full" fontSize="0.72rem">
              {remainingInterviews == null ? 'Unlimited quota' : `${remainingInterviews} left this month`}
            </Badge>
            <Badge colorScheme="gray" px={3} py={1.5} rounded="full" fontSize="0.72rem">
              {currentPlan?.plan?.name ?? 'Free'}
            </Badge>
          </HStack>
        )}
      />

      {error ? (
        <SurfaceCard p={4}>
          <Stack spacing={2}>
            <Text fontSize="sm" color="red.600">{error}</Text>
            {upgradePlan ? (
              <Button as={RouterLink} to="/pricing" size="sm" colorScheme="red" variant="ghost" alignSelf="flex-start">
                Upgrade to {upgradePlan}
              </Button>
            ) : null}
          </Stack>
        </SurfaceCard>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[0.95fr,1.05fr]">
        <div className="space-y-4">
          <SurfaceCard p={{ base: 5, md: 6 }}>
            <Stack spacing={5}>
              <HStack justify="space-between" align={{ base: 'flex-start', md: 'center' }} flexDir={{ base: 'column', md: 'row' }} spacing={4}>
                <VStack align="flex-start" spacing={1}>
                  <Text fontSize="xs" fontWeight="800" letterSpacing="0.14em" textTransform="uppercase" color="ink.400">
                    New run
                  </Text>
                  <Text fontSize="sm" color="ink.500" lineHeight="1.7">
                    Choose the kind of interview pressure you want to practice today.
                  </Text>
                </VStack>
                {currentPlan?.planKey !== 'sprint' ? (
                  <Button as={RouterLink} to="/pricing" size="sm" variant="ghost" color="brand.700">
                    Sprint only
                  </Button>
                ) : null}
              </HStack>

              <Stack spacing={3}>
                {MODE_OPTIONS.map((option) => (
                  <button
                    key={option.mode}
                    type="button"
                    onClick={() => setMode(option.mode)}
                    className={`w-full rounded-2xl border p-4 text-left transition-colors ${
                      mode === option.mode
                        ? 'border-sky-300 bg-sky-50'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <p className="text-sm font-semibold text-slate-800">{option.label}</p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-500">{option.description}</p>
                  </button>
                ))}
              </Stack>

              <Stack spacing={4}>
                <label className="space-y-2 block">
                  <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                    Focus area
                  </span>
                  <Input
                    value={focusArea}
                    onChange={(event) => setFocusArea(event.target.value)}
                    placeholder="Example: job scheduling system, stakeholder conflict, or architecture trade-offs"
                    borderRadius="xl"
                    borderColor="blackAlpha.200"
                    bg="whiteAlpha.700"
                  />
                </label>

                <label className="space-y-2 block">
                  <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                    Context to keep in mind
                  </span>
                  <Textarea
                    value={promptContext}
                    onChange={(event) => setPromptContext(event.target.value)}
                    rows={4}
                    placeholder="Optional: mention the kind of company, your role target, or what you want the interviewer to press on."
                    resize="none"
                    borderRadius="2xl"
                    borderColor="blackAlpha.200"
                    bg="whiteAlpha.700"
                  />
                </label>
              </Stack>

              <Button
                onClick={handleStart}
                isLoading={starting}
                colorScheme="blue"
                size="lg"
              >
                Start mock interview
              </Button>
            </Stack>
          </SurfaceCard>

          <SurfaceCard p={{ base: 5, md: 6 }}>
            <Stack spacing={5}>
              <VStack align="flex-start" spacing={1}>
                <Text fontSize="xs" fontWeight="800" letterSpacing="0.14em" textTransform="uppercase" color="ink.400">
                  Recent runs
                </Text>
                <Text fontSize="sm" color="ink.500" lineHeight="1.7">
                  Reload a scorecard or continue reviewing the transcript from a past run.
                </Text>
              </VStack>

              {historyLoading ? (
                <HStack spacing={3} color="ink.500">
                  <Spinner size="sm" color="brand.500" thickness="3px" />
                  <Text fontSize="sm">Loading history...</Text>
                </HStack>
              ) : history.length > 0 ? (
                <Stack spacing={3}>
                  {history.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => { void handleLoadHistoryItem(item); }}
                      className="w-full rounded-2xl border border-slate-200 p-4 text-left transition-colors hover:border-sky-300"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-800">
                            {MODE_LABELS[item.mode]}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {item.focusArea || item.targetRole || 'General practice'}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-mono text-slate-500">
                            {item.overallScore ? `${item.overallScore}/5` : '...'}
                          </p>
                          <p className="text-[11px] text-slate-400">
                            {formatRelativeDate(item.completedAt)}
                          </p>
                        </div>
                      </div>
                      {item.transcriptSummary ? (
                        <p className="mt-2 text-xs leading-relaxed text-slate-500">
                          {item.transcriptSummary}
                        </p>
                      ) : null}
                    </button>
                  ))}
                </Stack>
              ) : (
                <EmptyState
                  title="No mock interviews yet"
                  description="Start one to build your first scorecard and create a repeatable practice loop."
                  accent="neutral"
                />
              )}
            </Stack>
          </SurfaceCard>
        </div>

        <div className="space-y-4">
          {run ? (
            <>
              <SurfaceCard p={{ base: 5, md: 6 }}>
                <Stack spacing={5}>
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                          {MODE_LABELS[run.mode]}
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          run.status === 'completed'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-sky-100 text-sky-700'
                        }`}>
                          {run.status === 'completed' ? 'Scored' : 'Live'}
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-relaxed text-slate-600">
                        {run.focusArea || run.targetRole || 'General interview practice'}
                      </p>
                    </div>
                    <div className="text-right text-xs text-slate-400">
                      <p>Started {formatTimestamp(run.createdAt)}</p>
                      <p className="mt-1">Turns: {run.turnCount}</p>
                    </div>
                  </div>

                  <Stack spacing={3}>
                    {run.turns.map((turn) => (
                      <div
                        key={turn.id}
                        className={`rounded-2xl border p-4 ${
                          turn.role === 'interviewer'
                            ? 'border-sky-200 bg-sky-50'
                            : 'border-slate-200 bg-slate-50'
                        }`}
                      >
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                            {turn.role === 'interviewer' ? 'Interviewer' : 'You'}
                          </p>
                          <span className="text-[11px] text-slate-400">
                            {formatTimestamp(turn.createdAt)}
                          </span>
                        </div>
                        <p className="text-sm leading-relaxed text-slate-700">{turn.content}</p>
                      </div>
                    ))}
                  </Stack>

                  {run.status === 'in_progress' ? (
                    <Stack spacing={4}>
                      {latestInterviewerPrompt ? (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                          <p className="text-[11px] font-semibold uppercase tracking-widest text-amber-700">
                            Current question
                          </p>
                          <p className="mt-2 text-sm leading-relaxed text-amber-900">
                            {latestInterviewerPrompt.content}
                          </p>
                        </div>
                      ) : null}

                      <label className="space-y-2 block">
                        <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                          Your answer
                        </span>
                        <Textarea
                          value={answer}
                          onChange={(event) => setAnswer(event.target.value)}
                          rows={8}
                          placeholder="Answer as if this were a real interview. Make your structure, trade-offs, and ownership visible."
                          resize="none"
                          borderRadius="2xl"
                          borderColor="blackAlpha.200"
                          bg="whiteAlpha.700"
                        />
                      </label>

                      <HStack spacing={3} flexWrap="wrap">
                        <Button
                          onClick={handleSubmitAnswer}
                          isLoading={sending}
                          isDisabled={answer.trim().length < 20}
                          variant="outline"
                          borderColor="blackAlpha.200"
                          color="ink.700"
                        >
                          Send answer
                        </Button>
                        <Button
                          onClick={handleEvaluate}
                          isLoading={evaluating}
                          isDisabled={run.turnCount === 0}
                          colorScheme="gray"
                          bg="ink.900"
                          _hover={{ bg: 'ink.800' }}
                        >
                          Score this run
                        </Button>
                      </HStack>
                    </Stack>
                  ) : null}
                </Stack>
              </SurfaceCard>

              {run.evaluation ? <EvaluationCard run={run} /> : null}
            </>
          ) : (
            <EmptyState
              title="No active mock interview yet"
              description="Start a run on the left, and the transcript plus scorecard will appear here."
              accent="neutral"
            />
          )}
        </div>
      </div>
    </Stack>
  );
}
