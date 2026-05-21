import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Badge,
  Button,
  HStack,
  SimpleGrid,
  Spinner,
  Stack,
  Text,
  Textarea,
  VStack,
} from '@chakra-ui/react';
import {
  getGoalWeeklyCheckin,
  getPrimaryGoal,
  getSessionCalendar,
  getStreak,
  getWeeklyReport,
  saveGoalWeeklyCheckin,
  type GoalWeeklyCheckinState,
  type WeeklyReport,
} from '../api/client';
import EmptyState from '../components/ui/EmptyState';
import PageHeader from '../components/ui/PageHeader';
import SurfaceCard from '../components/ui/SurfaceCard';
import { useEntitlements } from '../contexts/EntitlementsContext';

interface CalendarDay {
  date: string;
  count: number;
}

interface StreakData {
  currentStreak: number;
  lastActiveDate: string | null;
  totalSessions: number;
}

interface GoalReference {
  id: string;
  title: string;
}

const heatBg = ['var(--slate-100)', 'var(--sky-200)', 'var(--sky-400)', 'var(--sky-500)', 'var(--sky-700)'];

function heatIdx(count: number) {
  if (count === 0) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  if (count === 3) return 3;
  return 4;
}

function CalendarHeatmap({ days }: { days: CalendarDay[] }) {
  const weeks: CalendarDay[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  return (
    <div className="overflow-x-auto">
      <div style={{ display: 'flex', gap: 4 }}>
        {weeks.map((week, wi) => (
          <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {week.map((day) => (
              <div
                key={day.date}
                title={`${day.date}: ${day.count} session${day.count !== 1 ? 's' : ''}`}
                style={{ width: 14, height: 14, borderRadius: 3, background: heatBg[heatIdx(day.count)] }}
              />
            ))}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 14, fontSize: 11, color: 'var(--fg-3)' }}>
        <span>Less</span>
        {heatBg.map((color, index) => (
          <div key={index} style={{ width: 12, height: 12, borderRadius: 3, background: color }} />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}

function StatTile({
  value,
  label,
  detail,
  color = 'var(--slate-800)',
}: {
  value: string;
  label: string;
  detail?: string;
  color?: string;
}) {
  return (
    <SurfaceCard p={5}>
      <Text fontSize="xs" fontWeight="800" letterSpacing="0.14em" textTransform="uppercase" color="ink.400">
        {label}
      </Text>
      <div
        className="mt-3 font-display text-[32px]"
        style={{ color, letterSpacing: '-0.03em', lineHeight: 1 }}
      >
        {value}
      </div>
      {detail ? (
        <Text mt={2} fontSize="sm" color="ink.500" lineHeight="1.7">
          {detail}
        </Text>
      ) : null}
    </SurfaceCard>
  );
}

function formatDateRange(report: WeeklyReport | null): string {
  if (!report) return 'This week';
  return `${report.weekStart} to ${report.weekEnd}`;
}

function formatMinutes(minutes: number): string {
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const rem = minutes % 60;
    return rem === 0 ? `${hours}h` : `${hours}h ${rem}m`;
  }
  return `${minutes}m`;
}

function formatCheckinLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function WeeklyRatingRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
}) {
  return (
    <Stack spacing={3}>
      <Text fontSize="xs" fontWeight="800" letterSpacing="0.14em" textTransform="uppercase" color="ink.400">
        {label}
      </Text>
      <HStack spacing={2} flexWrap="wrap">
        {[1, 2, 3, 4, 5].map((score) => (
          <Button
            key={score}
            type="button"
            size="sm"
            minW="2.6rem"
            borderRadius="xl"
            variant={value === score ? 'solid' : 'outline'}
            colorScheme={value === score ? 'blue' : undefined}
            borderColor={value === score ? undefined : 'blackAlpha.200'}
            color={value === score ? undefined : 'ink.600'}
            onClick={() => onChange(score)}
          >
            {score}
          </Button>
        ))}
      </HStack>
    </Stack>
  );
}

export default function History() {
  const { entitlements } = useEntitlements();

  const [calendar, setCalendar] = useState<CalendarDay[]>([]);
  const [streak, setStreak] = useState<StreakData | null>(null);
  const [goal, setGoal] = useState<GoalReference | null>(null);
  const [weeklyReport, setWeeklyReport] = useState<WeeklyReport | null>(null);
  const [checkinState, setCheckinState] = useState<GoalWeeklyCheckinState | null>(null);
  const [loading, setLoading] = useState(true);
  const [reportLoading, setReportLoading] = useState(true);
  const [savingCheckin, setSavingCheckin] = useState(false);
  const [error, setError] = useState('');
  const [reportLocked, setReportLocked] = useState(false);
  const [upgradePlan, setUpgradePlan] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState('');

  const [confidence, setConfidence] = useState(3);
  const [momentum, setMomentum] = useState(3);
  const [winsText, setWinsText] = useState('');
  const [blockersText, setBlockersText] = useState('');
  const [notes, setNotes] = useState('');

  const weeklyReportsEnabled = entitlements.find(
    (entry) => entry.featureKey === 'weekly_reports.enabled',
  )?.enabled;

  const latestCheckin = weeklyReport?.latestCheckin ?? checkinState?.latestCheckin ?? null;
  const recoveryPlan = weeklyReport?.recoveryPlan ?? latestCheckin?.recoveryPlan ?? null;

  useEffect(() => {
    const loadBase = async () => {
      setLoading(true);
      try {
        const [cal, str, primaryGoal] = await Promise.all([
          getSessionCalendar(90),
          getStreak(),
          getPrimaryGoal().catch(() => null),
        ]);
        setCalendar(cal);
        setStreak(str);
        if (primaryGoal?._id) {
          setGoal({
            id: String(primaryGoal._id),
            title: primaryGoal.structured?.title ?? 'Active goal',
          });
        }
      } finally {
        setLoading(false);
      }
    };

    void loadBase();
  }, []);

  useEffect(() => {
    const hydrateForm = (state: GoalWeeklyCheckinState | null, report: WeeklyReport | null) => {
      const source = report?.latestCheckin ?? state?.latestCheckin ?? null;
      if (!source) return;
      setConfidence(source.confidence);
      setMomentum(source.momentum);
      setWinsText(source.wins.join('\n'));
      setBlockersText(source.blockers.join('\n'));
      setNotes(source.notes ?? '');
    };

    hydrateForm(checkinState, weeklyReport);
  }, [checkinState?.latestCheckin?.updatedAt, weeklyReport?.latestCheckin?.updatedAt]);

  useEffect(() => {
    if (!goal) {
      setReportLoading(false);
      return;
    }

    const loadWeeklyState = async () => {
      setReportLoading(true);
      setError('');
      setReportLocked(false);
      setUpgradePlan(null);

      try {
        const checkin = await getGoalWeeklyCheckin(goal.id);
        setCheckinState(checkin);
      } catch (err: any) {
        setError(err?.response?.data?.error ?? 'Could not load weekly check-in state.');
      }

      if (!weeklyReportsEnabled) {
        setReportLocked(true);
        setReportLoading(false);
        return;
      }

      try {
        const report = await getWeeklyReport(goal.id);
        setWeeklyReport(report);
      } catch (err: any) {
        if (err?.response?.status === 402) {
          setReportLocked(true);
          setUpgradePlan(err?.response?.data?.upgradePlan ?? 'pro');
        } else {
          setError(err?.response?.data?.error ?? 'Could not load your weekly report.');
        }
      } finally {
        setReportLoading(false);
      }
    };

    void loadWeeklyState();
  }, [goal?.id, weeklyReportsEnabled]);

  const totalMins = calendar.reduce((acc, day) => acc + day.count * 30, 0);
  const totalHours = Math.floor(totalMins / 60);
  const remMins = totalMins % 60;

  const weeklyProgressLabel = useMemo(() => {
    if (!weeklyReport?.stats.weeklyTargetMinutes) return null;
    const progress = weeklyReport.stats.weeklyTargetProgressPct;
    return progress === null ? null : `${progress}% of weekly target`;
  }, [weeklyReport?.stats.weeklyTargetProgressPct, weeklyReport?.stats.weeklyTargetMinutes]);

  const handleSaveCheckin = async () => {
    if (!goal) return;
    setSavingCheckin(true);
    setSaveMessage('');
    setError('');
    try {
      const result = await saveGoalWeeklyCheckin(goal.id, {
        confidence,
        momentum,
        wins: formatCheckinLines(winsText),
        blockers: formatCheckinLines(blockersText),
        notes: notes.trim() || null,
      });
      setCheckinState(result);
      setSaveMessage('Weekly check-in saved.');
      if (weeklyReportsEnabled) {
        const report = await getWeeklyReport(goal.id);
        setWeeklyReport(report);
      }
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Could not save weekly check-in.');
    } finally {
      setSavingCheckin(false);
    }
  };

  if (loading) {
    return (
      <SurfaceCard p={{ base: 8, md: 12 }}>
        <VStack spacing={4} minH="50vh" justify="center">
          <Spinner size="lg" color="brand.500" thickness="3px" />
          <Text fontSize="sm" color="ink.500">Loading your progress history...</Text>
        </VStack>
      </SurfaceCard>
    );
  }

  return (
    <Stack spacing={6}>
      <PageHeader
        eyebrow="Progress"
        title="History"
        description="Review consistency, capture how the week felt, and turn that signal into a tighter recovery plan for the next seven days."
        actions={(
          <HStack spacing={3} flexWrap="wrap">
            <Badge colorScheme="blue" px={3} py={1.5} rounded="full" fontSize="0.72rem">
              {streak?.currentStreak ?? 0} day streak
            </Badge>
            {goal ? (
              <Badge colorScheme="gray" px={3} py={1.5} rounded="full" fontSize="0.72rem">
                {goal.title}
              </Badge>
            ) : null}
          </HStack>
        )}
      />

      <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
        <StatTile
          value={String(streak?.currentStreak ?? 0)}
          label="Day streak"
          detail="Your current rhythm of consecutive active days."
          color="var(--sky-600)"
        />
        <StatTile
          value={String(streak?.totalSessions ?? 0)}
          label="Total sessions"
          detail="Every completed study session across the account."
        />
        <StatTile
          value={totalHours > 0 ? `${totalHours}h` : `${remMins}m`}
          label="Time studied"
          detail="Approximate study time based on recent completed sessions."
        />
      </SimpleGrid>

      <SurfaceCard p={{ base: 5, md: 6 }}>
        <Stack spacing={5}>
          <HStack justify="space-between" align={{ base: 'flex-start', md: 'center' }} flexDir={{ base: 'column', md: 'row' }} spacing={4}>
            <VStack align="flex-start" spacing={1}>
              <Text fontSize="xs" fontWeight="800" letterSpacing="0.14em" textTransform="uppercase" color="ink.400">
                Last 90 days
              </Text>
              <Text fontSize="sm" color="ink.500" lineHeight="1.7">
                Your activity heatmap shows how often you put in real reps, not just how good the plan looked on paper.
              </Text>
            </VStack>
            {streak?.lastActiveDate ? (
              <Text fontSize="sm" color="ink.500">Last session: {streak.lastActiveDate}</Text>
            ) : null}
          </HStack>

          {calendar.length > 0 ? (
            <CalendarHeatmap days={calendar} />
          ) : (
            <EmptyState
              title="No sessions yet"
              description="Once you complete a few study sessions, your consistency heatmap will appear here."
              accent="neutral"
            />
          )}
        </Stack>
      </SurfaceCard>

      {!goal ? (
        <EmptyState
          title="No active goal to review"
          description="Create or set a primary goal first so weekly check-ins and reports can stay tied to a real outcome."
          action={(
            <Button as={RouterLink} to="/goals" colorScheme="blue">
              Go to goals
            </Button>
          )}
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[0.95fr,1.05fr]">
          <div className="space-y-4">
            <SurfaceCard p={{ base: 5, md: 6 }}>
              <Stack spacing={5}>
                <HStack justify="space-between" align={{ base: 'flex-start', md: 'center' }} flexDir={{ base: 'column', md: 'row' }} spacing={4}>
                  <VStack align="flex-start" spacing={1}>
                    <Text fontSize="xs" fontWeight="800" letterSpacing="0.14em" textTransform="uppercase" color="ink.400">
                      Weekly check-in
                    </Text>
                    <Text fontSize="sm" color="ink.500" lineHeight="1.7">
                      Capture how the week felt, what moved, and what is blocking the next push on <Text as="span" fontWeight="700" color="ink.800">{goal.title}</Text>.
                    </Text>
                  </VStack>
                  <Badge
                    colorScheme={checkinState?.due ? 'orange' : 'green'}
                    px={3}
                    py={1.5}
                    rounded="full"
                    fontSize="0.72rem"
                  >
                    {checkinState?.due ? 'Due this week' : 'Checked in'}
                  </Badge>
                </HStack>

                <WeeklyRatingRow
                  label="How confident do you feel about the goal right now?"
                  value={confidence}
                  onChange={setConfidence}
                />

                <WeeklyRatingRow
                  label="How much momentum do you feel?"
                  value={momentum}
                  onChange={setMomentum}
                />

                <Stack spacing={4}>
                  <label className="space-y-2 block">
                    <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                      Wins this week
                    </span>
                    <Textarea
                      value={winsText}
                      onChange={(event) => setWinsText(event.target.value)}
                      rows={4}
                      placeholder="One line per win. Example: finished the caching module, clarified the job description, or completed three sessions."
                      resize="none"
                      borderRadius="2xl"
                      borderColor="blackAlpha.200"
                      bg="whiteAlpha.700"
                    />
                  </label>

                  <label className="space-y-2 block">
                    <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                      Blockers or friction
                    </span>
                    <Textarea
                      value={blockersText}
                      onChange={(event) => setBlockersText(event.target.value)}
                      rows={4}
                      placeholder="One line per blocker. Example: too little time after work, weak system design examples, or feeling rusty on Docker."
                      resize="none"
                      borderRadius="2xl"
                      borderColor="blackAlpha.200"
                      bg="whiteAlpha.700"
                    />
                  </label>

                  <label className="space-y-2 block">
                    <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                      Notes
                    </span>
                    <Textarea
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      rows={3}
                      placeholder="Anything else the next week's plan should remember."
                      resize="none"
                      borderRadius="2xl"
                      borderColor="blackAlpha.200"
                      bg="whiteAlpha.700"
                    />
                  </label>
                </Stack>

                {saveMessage ? <Text fontSize="sm" color="green.600">{saveMessage}</Text> : null}
                {error ? <Text fontSize="sm" color="red.500">{error}</Text> : null}

                <Button
                  type="button"
                  colorScheme="blue"
                  size="lg"
                  onClick={handleSaveCheckin}
                  isLoading={savingCheckin}
                >
                  Save weekly check-in
                </Button>
              </Stack>
            </SurfaceCard>

            {recoveryPlan ? (
              <SurfaceCard p={{ base: 5, md: 6 }}>
                <Stack spacing={5}>
                  <HStack justify="space-between" align={{ base: 'flex-start', md: 'center' }} flexDir={{ base: 'column', md: 'row' }} spacing={4}>
                    <VStack align="flex-start" spacing={1}>
                      <Text fontSize="xs" fontWeight="800" letterSpacing="0.14em" textTransform="uppercase" color="ink.400">
                        Recovery plan
                      </Text>
                      <Text fontSize="sm" color="ink.700" lineHeight="1.7">
                        {recoveryPlan.headline}
                      </Text>
                    </VStack>
                    <Badge
                      colorScheme={
                        recoveryPlan.status === 'steady'
                          ? 'green'
                          : recoveryPlan.status === 'catch_up'
                            ? 'blue'
                            : recoveryPlan.status === 'reduce_scope'
                              ? 'orange'
                              : 'red'
                      }
                      px={3}
                      py={1.5}
                      rounded="full"
                      fontSize="0.72rem"
                    >
                      {recoveryPlan.status.replace('_', ' ')}
                    </Badge>
                  </HStack>

                  <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                    <SurfaceCard p={4} bg="blackAlpha.50">
                      <Text fontSize="xs" fontWeight="800" letterSpacing="0.14em" textTransform="uppercase" color="ink.400">
                        Focus areas
                      </Text>
                      <div className="mt-3 space-y-2 text-sm text-slate-600">
                        {recoveryPlan.focusAreas.length > 0 ? (
                          recoveryPlan.focusAreas.map((item) => <p key={item}>- {item}</p>)
                        ) : (
                          <p>Keep the next sessions centered on the most important unlocked node.</p>
                        )}
                      </div>
                    </SurfaceCard>

                    <SurfaceCard p={4} bg="blackAlpha.50">
                      <Text fontSize="xs" fontWeight="800" letterSpacing="0.14em" textTransform="uppercase" color="ink.400">
                        Action list
                      </Text>
                      <div className="mt-3 space-y-2 text-sm text-slate-600">
                        {recoveryPlan.actions.map((item) => <p key={item}>- {item}</p>)}
                      </div>
                    </SurfaceCard>
                  </SimpleGrid>
                </Stack>
              </SurfaceCard>
            ) : null}
          </div>

          <div className="space-y-4">
            <SurfaceCard p={{ base: 5, md: 6 }}>
              <Stack spacing={5}>
                <HStack justify="space-between" align={{ base: 'flex-start', md: 'center' }} flexDir={{ base: 'column', md: 'row' }} spacing={4}>
                  <VStack align="flex-start" spacing={1}>
                    <Text fontSize="xs" fontWeight="800" letterSpacing="0.14em" textTransform="uppercase" color="ink.400">
                      Weekly report
                    </Text>
                    <Text fontSize="sm" color="ink.500" lineHeight="1.7">
                      {formatDateRange(weeklyReport)}
                    </Text>
                  </VStack>
                  {weeklyProgressLabel ? (
                    <Badge colorScheme="blue" px={3} py={1.5} rounded="full" fontSize="0.72rem">
                      {weeklyProgressLabel}
                    </Badge>
                  ) : null}
                </HStack>

                {reportLoading ? (
                  <HStack spacing={3} color="ink.500">
                    <Spinner size="sm" color="brand.500" thickness="3px" />
                    <Text fontSize="sm">Building your weekly report...</Text>
                  </HStack>
                ) : reportLocked ? (
                  <EmptyState
                    title="Detailed weekly reports are a Pro feature"
                    description="You can still save a weekly check-in on the left. Upgrade to unlock plan-health summaries, weekly weak areas, and a richer recovery loop."
                    accent="warning"
                    action={(
                      <Button as={RouterLink} to="/pricing" colorScheme="orange">
                        Upgrade to {upgradePlan ?? 'Pro'}
                      </Button>
                    )}
                  />
                ) : weeklyReport ? (
                  <Stack spacing={4}>
                    <SimpleGrid columns={{ base: 1, md: 3 }} spacing={3}>
                      <SurfaceCard p={4} bg="blackAlpha.50">
                        <Text fontSize="xs" fontWeight="800" letterSpacing="0.14em" textTransform="uppercase" color="ink.400">
                          Sessions
                        </Text>
                        <Text mt={2} fontSize="lg" fontWeight="700" color="ink.900">
                          {weeklyReport.stats.sessionsThisWeek}
                        </Text>
                      </SurfaceCard>
                      <SurfaceCard p={4} bg="blackAlpha.50">
                        <Text fontSize="xs" fontWeight="800" letterSpacing="0.14em" textTransform="uppercase" color="ink.400">
                          Study time
                        </Text>
                        <Text mt={2} fontSize="lg" fontWeight="700" color="ink.900">
                          {formatMinutes(weeklyReport.stats.studyMinutesThisWeek)}
                        </Text>
                      </SurfaceCard>
                      <SurfaceCard p={4} bg="blackAlpha.50">
                        <Text fontSize="xs" fontWeight="800" letterSpacing="0.14em" textTransform="uppercase" color="ink.400">
                          Risk level
                        </Text>
                        <Text mt={2} fontSize="lg" fontWeight="700" color="ink.900">
                          {weeklyReport.planHealth.riskScore}/100
                        </Text>
                      </SurfaceCard>
                    </SimpleGrid>

                    <SurfaceCard p={4}>
                      <Text fontSize="xs" fontWeight="800" letterSpacing="0.14em" textTransform="uppercase" color="ink.400">
                        Highlights
                      </Text>
                      <div className="mt-3 space-y-2 text-sm text-slate-600">
                        {weeklyReport.highlights.map((item) => <p key={item}>- {item}</p>)}
                      </div>
                    </SurfaceCard>

                    <SurfaceCard p={4}>
                      <Text fontSize="xs" fontWeight="800" letterSpacing="0.14em" textTransform="uppercase" color="ink.400">
                        Weak areas
                      </Text>
                      <div className="mt-3 space-y-2 text-sm text-slate-600">
                        {weeklyReport.weakAreas.length > 0 ? (
                          weeklyReport.weakAreas.map((item) => <p key={item}>- {item}</p>)
                        ) : (
                          <p>No major weak areas surfaced this week. Keep protecting the rhythm.</p>
                        )}
                      </div>
                    </SurfaceCard>

                    <SurfaceCard p={4}>
                      <Text fontSize="xs" fontWeight="800" letterSpacing="0.14em" textTransform="uppercase" color="ink.400">
                        Sprint health
                      </Text>
                      <SimpleGrid mt={3} columns={{ base: 1, md: 2 }} spacing={3}>
                        <SurfaceCard p={4} bg="blackAlpha.50">
                          <Text fontSize="xs" color="ink.500">Progress</Text>
                          <Text mt={2} fontSize="sm" fontWeight="700" color="ink.900">
                            {weeklyReport.planHealth.completionScore}% complete
                          </Text>
                          <Text mt={1} fontSize="xs" color="ink.500">
                            {weeklyReport.planHealth.completedNodes}/{weeklyReport.planHealth.totalNodes} nodes done
                          </Text>
                        </SurfaceCard>
                        <SurfaceCard p={4} bg="blackAlpha.50">
                          <Text fontSize="xs" color="ink.500">Weekly rhythm</Text>
                          <Text mt={2} fontSize="sm" fontWeight="700" color="ink.900">
                            {weeklyReport.planHealth.weeklyTargetMinutes
                              ? `${formatMinutes(weeklyReport.planHealth.weeklyTargetMinutes)}/week`
                              : 'Not set'}
                          </Text>
                          <Text mt={1} fontSize="xs" color="ink.500">
                            {weeklyReport.planHealth.summary}
                          </Text>
                        </SurfaceCard>
                      </SimpleGrid>
                    </SurfaceCard>
                  </Stack>
                ) : (
                  <Text fontSize="sm" color="ink.500">
                    We could not build a weekly report yet.
                  </Text>
                )}
              </Stack>
            </SurfaceCard>
          </div>
        </div>
      )}
    </Stack>
  );
}
