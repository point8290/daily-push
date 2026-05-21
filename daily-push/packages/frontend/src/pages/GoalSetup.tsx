import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Badge,
  Box,
  Button,
  Center,
  Circle,
  FormControl,
  FormLabel,
  Heading,
  HStack,
  Input,
  SimpleGrid,
  Spinner,
  Stack,
  Text,
  Textarea,
} from '@chakra-ui/react';
import {
  type GoalSprintInput,
  type SprintType,
  getClarifyingQuestions,
  processIntake,
  saveRawInput,
  startGoalIntake,
  trackEvent,
} from '../api/client';
import PipelineStatus from '../components/PipelineStatus';
import PageHeader from '../components/ui/PageHeader';
import SurfaceCard from '../components/ui/SurfaceCard';
import { useEntitlements } from '../contexts/EntitlementsContext';

interface Question {
  id: string;
  question: string;
  purpose: string;
  optional: boolean;
}

interface SprintFormState {
  sprintType: SprintType;
  targetRole: string;
  targetCompany: string;
  targetDate: string;
  weeklyCommitmentHours: string;
  currentBlockers: string;
  successEvidence: string;
}

const QUICK_PICKS = [
  'Get a senior engineering job at a product company',
  'Build and ship an AI-powered product',
  'Get promoted to senior / staff engineer',
  'Transition from backend to full-stack',
  'Become an AI/LLM engineer',
];

const SPRINT_OPTIONS: Array<{
  value: SprintType;
  label: string;
  description: string;
  premium: boolean;
}> = [
  {
    value: 'standard',
    label: 'Execution Sprint',
    description:
      'A focused push with a deadline, weekly commitment, and progress forecast.',
    premium: false,
  },
  {
    value: 'senior_engineer',
    label: 'Senior Engineer Sprint',
    description:
      'Bias the plan toward senior-level expectations, systems thinking, and promotion readiness.',
    premium: true,
  },
  {
    value: 'ai_engineer_transition',
    label: 'AI Engineer Transition Sprint',
    description:
      'Bias the roadmap toward LLM tooling, applied AI workflows, and AI-role transition work.',
    premium: true,
  },
];

const DEFAULT_SPRINT_FORM: SprintFormState = {
  sprintType: 'standard',
  targetRole: '',
  targetCompany: '',
  targetDate: '',
  weeklyCommitmentHours: '6',
  currentBlockers: '',
  successEvidence: '',
};

type Step = 'goal' | 'clarify' | 'sprint' | 'processing' | 'done';

function splitLines(value: string): string[] {
  return value
    .split(/\r?\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export default function GoalSetup() {
  const navigate = useNavigate();
  const { entitlements } = useEntitlements();
  const [step, setStep] = useState<Step>('goal');
  const [goalText, setGoalText] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [sprintForm, setSprintForm] = useState<SprintFormState>(DEFAULT_SPRINT_FORM);
  const [error, setError] = useState('');
  const [upgradePlan, setUpgradePlan] = useState<string | null>(null);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [currentGoalId, setCurrentGoalId] = useState<string | null>(null);

  const premiumSprintEnabled =
    entitlements.find((entry) => entry.featureKey === 'premium_sprints.enabled')
      ?.enabled ?? false;

  const buildSprintConfig = (): GoalSprintInput => ({
    sprintType: sprintForm.sprintType,
    targetRole: sprintForm.targetRole.trim() || null,
    targetCompany: sprintForm.targetCompany.trim() || null,
    targetDate: sprintForm.targetDate || null,
    weeklyCommitmentHours: sprintForm.weeklyCommitmentHours.trim()
      ? Number(sprintForm.weeklyCommitmentHours)
      : null,
    currentBlockers: splitLines(sprintForm.currentBlockers),
    successEvidence: splitLines(sprintForm.successEvidence),
  });

  useEffect(() => {
    (async () => {
      try {
        const { goalId } = await startGoalIntake();
        setCurrentGoalId(goalId);
        void trackEvent({
          eventKey: 'goal_setup_viewed',
          goalId,
          properties: {
            step: 'goal',
          },
        }).catch(() => {});
      } catch (err: any) {
        setUpgradePlan(err?.response?.data?.upgradePlan ?? null);
        setError(err?.response?.data?.error ?? 'Failed to initialize goal');
      }
    })();
  }, []);

  const handleGoalSubmit = async () => {
    if (!goalText.trim() || !currentGoalId) return;
    setError('');
    setUpgradePlan(null);
    setLoadingQuestions(true);
    try {
      await saveRawInput(currentGoalId, goalText.trim(), 'goal_intake');
      void trackEvent({
        eventKey: 'goal_text_submitted',
        goalId: currentGoalId,
        properties: {
          goalTextLength: goalText.trim().length,
        },
      }).catch(() => {});
      const { questions: qs } = await getClarifyingQuestions(currentGoalId);
      setQuestions(qs);
      setStep('clarify');
    } catch (err: any) {
      setUpgradePlan(err?.response?.data?.upgradePlan ?? null);
      setError(err?.response?.data?.error ?? 'Something went wrong');
    } finally {
      setLoadingQuestions(false);
    }
  };

  const goToSprintStep = async (trackingEventKey: string) => {
    if (!currentGoalId) return;
    void trackEvent({
      eventKey: trackingEventKey,
      goalId: currentGoalId,
      properties: {
        totalQuestions: questions.length,
      },
    }).catch(() => {});
    setStep('sprint');
  };

  const handleClarifySubmit = async () => {
    if (!currentGoalId) return;
    setError('');
    setUpgradePlan(null);
    try {
      const answered = questions.filter((question) => answers[question.id]?.trim());
      for (const question of answered) {
        const content = `${question.question}\n${answers[question.id].trim()}`;
        await saveRawInput(currentGoalId, content, 'clarification');
      }
      void trackEvent({
        eventKey: 'goal_clarify_submitted',
        goalId: currentGoalId,
        properties: {
          answeredCount: answered.length,
          totalQuestions: questions.length,
        },
      }).catch(() => {});
      setStep('sprint');
    } catch (err: any) {
      setUpgradePlan(err?.response?.data?.upgradePlan ?? null);
      setError(err?.response?.data?.error ?? 'Processing failed');
      setStep('clarify');
    }
  };

  const skipClarify = async () => {
    setError('');
    setUpgradePlan(null);
    await goToSprintStep('goal_clarify_skipped');
  };

  const selectSprintType = (sprintType: SprintType, premium: boolean) => {
    if (premium && !premiumSprintEnabled) {
      setUpgradePlan('sprint');
      setError('Premium sprint templates are available on the Sprint plan.');
      return;
    }

    setError('');
    setUpgradePlan(null);
    setSprintForm((prev) => ({ ...prev, sprintType }));

    if (currentGoalId) {
      void trackEvent({
        eventKey: 'goal_sprint_template_selected',
        goalId: currentGoalId,
        properties: {
          sprintType,
          premiumTemplate: premium,
        },
      }).catch(() => {});
    }
  };

  const runIntake = async () => {
    if (!currentGoalId) return;
    setStep('processing');
    const sprintConfig = buildSprintConfig();

    void trackEvent({
      eventKey: 'goal_processing_started',
      goalId: currentGoalId,
      properties: {
        step: 'processing',
        sprintType: sprintConfig.sprintType,
        hasTargetDate: !!sprintConfig.targetDate,
        weeklyCommitmentHours: sprintConfig.weeklyCommitmentHours,
      },
    }).catch(() => {});

    await processIntake(currentGoalId, sprintConfig);
  };

  const handleSprintSubmit = async () => {
    if (!currentGoalId) return;
    setError('');
    setUpgradePlan(null);

    const sprintConfig = buildSprintConfig();
    if (
      (sprintConfig.sprintType === 'senior_engineer' ||
        sprintConfig.sprintType === 'ai_engineer_transition') &&
      !premiumSprintEnabled
    ) {
      setUpgradePlan('sprint');
      setError('Upgrade to Sprint to use this template.');
      return;
    }

    try {
      void trackEvent({
        eventKey: 'goal_sprint_submitted',
        goalId: currentGoalId,
        properties: {
          sprintType: sprintConfig.sprintType,
          hasTargetRole: !!sprintConfig.targetRole,
          hasTargetDate: !!sprintConfig.targetDate,
          weeklyCommitmentHours: sprintConfig.weeklyCommitmentHours,
          blockerCount: sprintConfig.currentBlockers?.length ?? 0,
        },
      }).catch(() => {});
      await runIntake();
    } catch (err: any) {
      setUpgradePlan(err?.response?.data?.upgradePlan ?? null);
      setError(err?.response?.data?.error ?? 'Processing failed');
      setStep('sprint');
    }
  };

  const stepEntries = [
    { id: 'goal', label: 'Goal' },
    { id: 'clarify', label: 'Context' },
    { id: 'sprint', label: 'Plan' },
  ] as const;
  const currentStepIndex = stepEntries.findIndex((entry) => entry.id === step);

  const ErrorPanel = error ? (
    <SurfaceCard
      px={4}
      py={4}
      bg="rgba(254,242,242,0.92)"
      borderColor="red.100"
    >
      <Text fontSize="sm" color="red.600">
        {error}
      </Text>
      {upgradePlan && (
        <Button
          as={Link}
          to="/pricing"
          variant="ghost"
          color="brand.700"
          px={0}
          mt={2}
          h="auto"
          _hover={{ bg: 'transparent', color: 'brand.800' }}
        >
          Upgrade to {upgradePlan}
        </Button>
      )}
    </SurfaceCard>
  ) : null;

  if (step === 'processing' || step === 'done') {
    if (!currentGoalId) {
      return (
        <Center minH="60vh">
          <Stack spacing={4} align="center">
            <Spinner size="xl" color="brand.500" thickness="4px" />
            <Text fontWeight="700" color="ink.700">
              Analysing your goal...
            </Text>
            <Text fontSize="sm" color="ink.400">
              This usually takes 10–20 seconds.
            </Text>
          </Stack>
        </Center>
      );
    }

    if (step === 'done') {
      return (
        <Center minH="60vh">
          <Stack spacing={4} align="center" textAlign="center">
            <Circle size="16" bg="green.50" color="green.500">
              <svg className="h-8 w-8" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                  clipRule="evenodd"
                />
              </svg>
            </Circle>
            <Heading size="md" letterSpacing="-0.03em" color="ink.900">
              Your career plan is ready
            </Heading>
            <Text fontSize="sm" color="ink.500">
              Redirecting you to the goal workspace...
            </Text>
          </Stack>
        </Center>
      );
    }

    return (
      <Stack maxW="3xl" mx="auto" spacing={6}>
        <PageHeader
          eyebrow="Planning"
          title="Building your career plan"
          description="Analysing your goal, shaping the learning path, and forecasting the pace you need."
        />
        <SurfaceCard px={6} py={6}>
          <PipelineStatus
            goalId={currentGoalId}
            type="intake"
            onRetry={async () => {
              await processIntake(currentGoalId, buildSprintConfig());
            }}
            onComplete={(run) => {
              if (run.status === 'failed' || run.status === 'partial') return;
              setStep('done');
              setTimeout(() => navigate(`/goals/${currentGoalId}`), 1200);
            }}
          />
        </SurfaceCard>
        <Button variant="ghost" alignSelf="flex-start" onClick={() => setStep('sprint')}>
          Back to plan setup
        </Button>
      </Stack>
    );
  }

  return (
    <Stack maxW="4xl" mx="auto" spacing={8}>
      <PageHeader
        eyebrow="New goal"
        title="Create a career goal"
        description="A goal is your long-term career outcome. You can add an execution sprint after the goal is clear."
      />

      <SurfaceCard px={{ base: 4, md: 6 }} py={5}>
        <HStack spacing={0} align="center" w="full">
          {stepEntries.map((entry, index) => {
            const isComplete = currentStepIndex > index;
            const isCurrent = step === entry.id;

            return (
              <HStack
                key={entry.id}
                spacing={{ base: 2, md: 3 }}
                flex="1"
                minW={0}
              >
                <Circle
                  size={{ base: '8', md: '8' }}
                  flexShrink={0}
                  bg={isCurrent ? 'brand.600' : isComplete ? 'green.500' : 'blackAlpha.100'}
                  color={isCurrent || isComplete ? 'white' : 'ink.400'}
                  fontSize="sm"
                  fontWeight="800"
                >
                  {isComplete ? (
                    <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path
                        fillRule="evenodd"
                        d="M16.704 5.29a1 1 0 0 1 .006 1.414l-7.25 7.31a1 1 0 0 1-1.42 0L3.29 9.22a1 1 0 1 1 1.42-1.41l4.04 4.07 6.54-6.59a1 1 0 0 1 1.414 0Z"
                        clipRule="evenodd"
                      />
                    </svg>
                  ) : index + 1}
                </Circle>
                <Box minW={0}>
                  <Text
                    fontSize={{ base: '10px', md: 'xs' }}
                    fontWeight="800"
                    letterSpacing={{ base: '0.1em', md: '0.14em' }}
                    textTransform="uppercase"
                    color={isCurrent ? 'brand.700' : 'ink.400'}
                    noOfLines={1}
                  >
                    {entry.label}
                  </Text>
                </Box>
                {index < stepEntries.length - 1 && (
                  <Box h="1px" flex="1" minW={{ base: 3, md: 10 }} bg="blackAlpha.100" />
                )}
              </HStack>
            );
          })}
        </HStack>
      </SurfaceCard>

      {step === 'goal' && (
        <Stack spacing={6}>
          <SurfaceCard px={{ base: 5, md: 7 }} py={{ base: 6, md: 7 }}>
            <Stack spacing={5}>
              <Box>
                <Heading size="md" letterSpacing="-0.03em" color="ink.900">
                  What are you trying to achieve?
                </Heading>
                <Text mt={2} fontSize="sm" lineHeight="1.8" color="ink.500">
                  Tell us your situation, where you are now, and what success looks
                  like. We'll turn it into a career goal you can plan around.
                </Text>
              </Box>

              <FormControl>
                <Textarea
                  value={goalText}
                  onChange={(event) => setGoalText(event.target.value)}
                  rows={6}
                  placeholder="e.g. I'm a mid-level backend developer at a startup, been here 3 years. I want to move to a senior role at a bigger company. I have about 45 mins a day to study and I need a plan I can actually stick to."
                />
              </FormControl>

              <Box>
                <Text
                  mb={3}
                  fontSize="xs"
                  fontWeight="800"
                  letterSpacing="0.16em"
                  textTransform="uppercase"
                  color="ink.400"
                >
                  Or pick a strong starting point
                </Text>
                <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                  {QUICK_PICKS.map((pick) => (
                    <Button
                      key={pick}
                      variant="outline"
                      justifyContent="flex-start"
                      h="auto"
                      py={4}
                      px={4}
                      whiteSpace="normal"
                      textAlign="left"
                      onClick={() => {
                        setGoalText(pick);
                        if (currentGoalId) {
                          void trackEvent({
                            eventKey: 'goal_quick_pick_selected',
                            goalId: currentGoalId,
                            properties: {
                              quickPick: pick,
                            },
                          }).catch(() => {});
                        }
                      }}
                    >
                      {pick}
                    </Button>
                  ))}
                </SimpleGrid>
              </Box>
            </Stack>
          </SurfaceCard>

          {ErrorPanel}

          <Button
            onClick={handleGoalSubmit}
            isLoading={loadingQuestions}
            loadingText="Reading your goal"
            isDisabled={!goalText.trim()}
            alignSelf="flex-start"
          >
            Continue
          </Button>
        </Stack>
      )}

      {step === 'clarify' && (
        <Stack spacing={6}>
          <SurfaceCard px={{ base: 5, md: 7 }} py={{ base: 6, md: 7 }}>
            <Stack spacing={5}>
              {questions.length === 0 ? (
                <>
                  <Box>
                    <Heading size="md" letterSpacing="-0.03em" color="ink.900">
                      We already have enough context
                    </Heading>
                    <Text mt={2} fontSize="sm" lineHeight="1.8" color="ink.500">
                      One more step and we’ll turn this into a practical plan.
                    </Text>
                  </Box>

                  <Button onClick={skipClarify} alignSelf="flex-start">
                    Continue to plan options
                  </Button>
                </>
              ) : (
                <>
                  <Box>
                    <Heading size="md" letterSpacing="-0.03em" color="ink.900">
                      A few quick questions
                    </Heading>
                    <Text mt={2} fontSize="sm" lineHeight="1.8" color="ink.500">
                      These sharpen the roadmap. Skip anything you don’t want to answer.
                    </Text>
                  </Box>

                  <Stack spacing={5}>
                    {questions.map((question) => (
                      <FormControl key={question.id}>
                        <FormLabel fontSize="sm" fontWeight="700" color="ink.700">
                          {question.question}
                          {question.optional && (
                            <Text as="span" ml={2} fontSize="xs" fontWeight="500" color="ink.400">
                              Optional
                            </Text>
                          )}
                        </FormLabel>
                        <Textarea
                          value={answers[question.id] ?? ''}
                          onChange={(event) =>
                            setAnswers((prev) => ({
                              ...prev,
                              [question.id]: event.target.value,
                            }))
                          }
                          rows={3}
                        />
                        {question.purpose && (
                          <Text mt={2} fontSize="xs" color="ink.400">
                            {question.purpose}
                          </Text>
                        )}
                      </FormControl>
                    ))}
                  </Stack>
                </>
              )}
            </Stack>
          </SurfaceCard>

          {ErrorPanel}

          {questions.length > 0 && (
            <HStack spacing={3} align="stretch">
              <Button flex="1" onClick={handleClarifySubmit}>
                Continue
              </Button>
              <Button variant="outline" onClick={skipClarify}>
                Skip
              </Button>
            </HStack>
          )}
        </Stack>
      )}

      {step === 'sprint' && (
        <Stack spacing={6}>
          <SurfaceCard px={{ base: 5, md: 7 }} py={{ base: 6, md: 7 }}>
            <Stack spacing={6}>
              <Box>
                <Heading size="md" letterSpacing="-0.03em" color="ink.900">
                  Add an execution sprint
                </Heading>
                <Text mt={2} fontSize="sm" lineHeight="1.8" color="ink.500">
                  A goal is the destination. A sprint is the focused push:
                  target role, deadline, weekly rhythm, and proof you will create.
                </Text>
              </Box>

              {!premiumSprintEnabled && (
                <SurfaceCard px={4} py={4} bg="rgba(255,251,235,0.92)" borderColor="orange.100">
                  <Text fontSize="sm" fontWeight="800" color="accent.700">
                    Execution Sprint is included right now
                  </Text>
                  <Text mt={2} fontSize="sm" color="ink.500">
                    Premium templates like Senior Engineer Sprint and AI Engineer Transition Sprint unlock on the Sprint plan.
                  </Text>
                </SurfaceCard>
              )}

              <SimpleGrid columns={{ base: 1, lg: 3 }} spacing={4}>
                {SPRINT_OPTIONS.map((option) => {
                  const selected = sprintForm.sprintType === option.value;
                  const locked = option.premium && !premiumSprintEnabled;

                  return (
                    <SurfaceCard
                      key={option.value}
                      px={5}
                      py={5}
                      borderColor={selected ? 'brand.300' : locked ? 'orange.100' : 'whiteAlpha.700'}
                      bg={selected ? 'linear-gradient(180deg, rgba(47,140,255,0.08), rgba(255,255,255,0.96))' : 'rgba(255,255,255,0.92)'}
                      cursor="pointer"
                      onClick={() => selectSprintType(option.value, option.premium)}
                    >
                      <Stack spacing={3}>
                        <HStack justify="space-between" align="flex-start">
                          <Text fontSize="md" fontWeight="800" color="ink.900">
                            {option.label}
                          </Text>
                          {option.premium && (
                            <Badge colorScheme={locked ? 'orange' : 'green'}>
                              {locked ? 'Sprint plan' : 'Unlocked'}
                            </Badge>
                          )}
                        </HStack>
                        <Text fontSize="sm" lineHeight="1.8" color="ink.500">
                          {option.description}
                        </Text>
                      </Stack>
                    </SurfaceCard>
                  );
                })}
              </SimpleGrid>

              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={5}>
                <FormControl>
                  <FormLabel fontSize="sm" fontWeight="700" color="ink.700">
                    Target role
                  </FormLabel>
                  <Input
                    value={sprintForm.targetRole}
                    onChange={(event) =>
                      setSprintForm((prev) => ({
                        ...prev,
                        targetRole: event.target.value,
                      }))
                    }
                    placeholder="Senior Backend Engineer"
                  />
                </FormControl>

                <FormControl>
                  <FormLabel fontSize="sm" fontWeight="700" color="ink.700">
                    Target company
                  </FormLabel>
                  <Input
                    value={sprintForm.targetCompany}
                    onChange={(event) =>
                      setSprintForm((prev) => ({
                        ...prev,
                        targetCompany: event.target.value,
                      }))
                    }
                    placeholder="Optional"
                  />
                </FormControl>

                <FormControl>
                  <FormLabel fontSize="sm" fontWeight="700" color="ink.700">
                    Target date
                  </FormLabel>
                  <Input
                    type="date"
                    value={sprintForm.targetDate}
                    onChange={(event) =>
                      setSprintForm((prev) => ({
                        ...prev,
                        targetDate: event.target.value,
                      }))
                    }
                  />
                </FormControl>

                <FormControl>
                  <FormLabel fontSize="sm" fontWeight="700" color="ink.700">
                    Weekly commitment
                  </FormLabel>
                  <Input
                    type="number"
                    min={1}
                    max={40}
                    value={sprintForm.weeklyCommitmentHours}
                    onChange={(event) =>
                      setSprintForm((prev) => ({
                        ...prev,
                        weeklyCommitmentHours: event.target.value,
                      }))
                    }
                    placeholder="6"
                  />
                  <Text mt={2} fontSize="xs" color="ink.400">
                    Hours per week you can realistically sustain.
                  </Text>
                </FormControl>
              </SimpleGrid>

              <FormControl>
                <FormLabel fontSize="sm" fontWeight="700" color="ink.700">
                  Current blockers
                </FormLabel>
                <Textarea
                  value={sprintForm.currentBlockers}
                  onChange={(event) =>
                    setSprintForm((prev) => ({
                      ...prev,
                      currentBlockers: event.target.value,
                    }))
                  }
                  rows={4}
                  placeholder="One per line. e.g. no system design reps yet, weak portfolio proof, inconsistent study habit"
                />
              </FormControl>

              <FormControl>
                <FormLabel fontSize="sm" fontWeight="700" color="ink.700">
                  What would prove success?
                </FormLabel>
                <Textarea
                  value={sprintForm.successEvidence}
                  onChange={(event) =>
                    setSprintForm((prev) => ({
                      ...prev,
                      successEvidence: event.target.value,
                    }))
                  }
                  rows={4}
                  placeholder="One per line. e.g. pass two senior mock interviews, ship one strong portfolio project, get recruiter responses"
                />
              </FormControl>
            </Stack>
          </SurfaceCard>

          {ErrorPanel}

          <HStack spacing={3} align="stretch">
            <Button flex="1" onClick={handleSprintSubmit}>
              Build my plan
            </Button>
            <Button variant="outline" onClick={() => setStep('clarify')}>
              Back
            </Button>
          </HStack>
        </Stack>
      )}
    </Stack>
  );
}
