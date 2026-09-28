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
  applyRecoveryAction,
  getGoalWeeklyCheckin,
  getPrimaryGoal,
  getSessionCalendar,
  getStreak,
  getWeeklyReport,
  saveGoalWeeklyCheckin,
  type GoalWeeklyCheckinState,
  type RecoveryQuickFix,
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
      <Text fontSize="sm" fontWeight="700" color="ink.400">
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
      <Text fontSize="sm" fontWeight="700" color="ink.400">
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
  const [applyingFix, setApplyingFix] = useState<string | null>(null);
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

  const applyFix = async (fix: RecoveryQuickFix) => {
    if (!goal) return;
    setApplyingFix(fix.action);
    setSaveMessage('');
    setError('');
    try {
      const result = await applyRecoveryAction(
        goal.id,
        fix.action === 'move_date'
          ? { action: 'move_date', weeks: fix.weeks }
          : { action: 'reduce_hours', hours: fix.hours },
      );
      setSaveMessage(`${result.applied}. Your plan was updated.`);
      if (weeklyReportsEnabled) {
        setWeeklyReport(await getWeeklyReport(goal.id));
      }
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Could not update the plan.');
    } finally {
      setApplyingFix(null);
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
        title="Progress"
        description="How often you studied, how this week went, and what to change next week."
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
          detail="Days in a row with at least one session."
          color="var(--sky-600)"
        />
        <StatTile
          value={String(streak?.totalSessions ?? 0)}
          label="Total sessions"
          detail="Sessions you have finished so far."
        />
        <StatTile
          value={totalHours > 0 ? `${totalHours}h` : `${remMins}m`}
          label="Time studied"
          detail="Estimated from your finished sessions."
        />
      </SimpleGrid>

      <SurfaceCard p={{ base: 5, md: 6 }}>
        <Stack spacing={5}>
          <HStack justify="space-between" align={{ base: 'flex-start', md: 'center' }} flexDir={{ base: 'column', md: 'row' }} spacing={4}>
            <VStack align="flex-start" spacing={1}>
              <Text fontSize="sm" fontWeight="700" color="ink.400">
                Last 90 days
              </Text>
              <Text fontSize="sm" color="ink.500" lineHeight="1.7">
                Each square is a day. Darker means more study that day.
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
        <div className="space-y-4">
          <SurfaceCard p={{ base: 5, md: 6 }}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-900">This week</p>
                <p className="mt-0.5 text-sm text-slate-500">{formatDateRange(weeklyReport)}</p>
              </div>
              {weeklyProgressLabel ? (
                <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-800">{weeklyProgressLabel}</span>
              ) : null}
            </div>

            {reportLoading ? (
              <HStack spacing={3} color="ink.500" mt={4}>
                <Spinner size="sm" color="brand.500" thickness="3px" />
                <Text fontSize="sm">Building your weekly report...</Text>
              </HStack>
            ) : reportLocked ? (
              <div className="mt-4">
                <EmptyState
                  title="Weekly reports are a Pro feature"
                  description="You can still save a weekly check-in below. Pro adds a weekly summary, weak areas and a plan for next week."
                  accent="warning"
                  action={(
                    <Button as={RouterLink} to="/pricing" colorScheme="orange">
                      Upgrade to {upgradePlan ?? 'Pro'}
                    </Button>
                  )}
                />
              </div>
            ) : weeklyReport ? (
              <div className="mt-4 space-y-5">
                <p className="text-sm text-slate-600">
                  <span className="font-semibold text-slate-900">{weeklyReport.stats.sessionsThisWeek} sessions</span>
                  {' · '}
                  <span className="font-semibold text-slate-900">{formatMinutes(weeklyReport.stats.studyMinutesThisWeek)}</span> studied
                  {' · '}
                  {weeklyReport.planHealth.completedNodes}/{weeklyReport.planHealth.totalNodes} concepts done
                  {weeklyReport.planHealth.weeklyTargetMinutes
                    ? ` · target ${formatMinutes(weeklyReport.planHealth.weeklyTargetMinutes)}/week`
                    : ''}
                </p>
                <div className="grid gap-5 md:grid-cols-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">What went well</p>
                    <ul className="mt-2 space-y-1.5 text-sm text-slate-600">
                      {weeklyReport.highlights.length > 0
                        ? weeklyReport.highlights.map((item) => <li key={item}>{item}</li>)
                        : <li>Nothing logged yet this week.</li>}
                    </ul>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Weak spots</p>
                    <ul className="mt-2 space-y-1.5 text-sm text-slate-600">
                      {weeklyReport.weakAreas.length > 0
                        ? weeklyReport.weakAreas.map((item) => <li key={item}>{item}</li>)
                        : <li>Nothing stood out this week.</li>}
                    </ul>
                  </div>
                </div>

                {recoveryPlan ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900">Next week</p>
                      <span className="text-xs font-semibold text-slate-500">
                        {({ steady: 'On track', catch_up: 'Catch up', reduce_scope: 'Trim scope' } as Record<string, string>)[recoveryPlan.status] ?? 'Restart gently'}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-700">{recoveryPlan.headline}</p>
                    <ul className="mt-3 space-y-1.5 text-sm text-slate-600">
                      {recoveryPlan.actions.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                    {(recoveryPlan.quickFixes ?? []).length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {(recoveryPlan.quickFixes ?? []).map((fix) => (
                          <button
                            key={fix.action}
                            type="button"
                            onClick={() => applyFix(fix)}
                            disabled={applyingFix !== null}
                            className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                          >
                            {applyingFix === fix.action ? 'Updating…' : fix.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            ) : (
              <Text fontSize="sm" color="ink.500" mt={4}>
                No report yet. Finish a session and check back.
              </Text>
            )}
          </SurfaceCard>

          <SurfaceCard p={{ base: 5, md: 6 }}>
            <details open={Boolean(checkinState?.due)}>
              <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
                <span>
                  <span className="block text-base font-semibold text-slate-900">Weekly check-in</span>
                  <span className="block text-sm text-slate-500">Two minutes on how the week went. It shapes next week.</span>
                </span>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${checkinState?.due ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'}`}>
                  {checkinState?.due ? 'Due this week' : 'Done · edit'}
                </span>
              </summary>
              <Stack spacing={5} mt={5}>
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
                    <span className="text-xs font-semibold text-slate-400">
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
                    <span className="text-xs font-semibold text-slate-400">
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
                    <span className="text-xs font-semibold text-slate-400">
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
            </details>
          </SurfaceCard>
        </div>
      )}
    </Stack>
  );
}
