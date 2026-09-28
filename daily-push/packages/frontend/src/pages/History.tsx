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
  VStack,
} from '@chakra-ui/react';
import {
  applyRecoveryAction,
  getGoalWeeklyCheckin,
  getPrimaryGoal,
  getSessionCalendar,
  getStreak,
  getWeeklyReport,
  type GoalWeeklyCheckinState,
  type RecoveryQuickFix,
  type WeeklyReport,
} from '../api/client';
import EmptyState from '../components/ui/EmptyState';
import PageHeader from '../components/ui/PageHeader';
import SurfaceCard from '../components/ui/SurfaceCard';
import AppModal from '../components/ui/AppModal';
import WeeklyCheckinModal from '../components/WeeklyCheckinModal';
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

function addWeeks(iso: string, weeks: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + weeks * 7);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function prettyDate(iso: string | null): string {
  if (!iso) return 'not set';
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  });
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
  const [checkinOpen, setCheckinOpen] = useState(false);
  const [pendingFix, setPendingFix] = useState<RecoveryQuickFix | null>(null);
  const [error, setError] = useState('');
  const [reportLocked, setReportLocked] = useState(false);
  const [upgradePlan, setUpgradePlan] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState('');


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

  const handleCheckinSaved = async (state: GoalWeeklyCheckinState) => {
    setCheckinState(state);
    setSaveMessage('Check-in saved. Next week’s plan now uses it.');
    if (weeklyReportsEnabled && goal) {
      setWeeklyReport(await getWeeklyReport(goal.id).catch(() => weeklyReport));
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
      setPendingFix(null);
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
        description="How often you studied, what became visible this week, and whether the pace still fits."
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
                  <span className="font-semibold text-slate-900">{weeklyReport.stats.sessionsThisWeek} session{weeklyReport.stats.sessionsThisWeek === 1 ? '' : 's'}</span>
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
                        {({ steady: 'On track', catch_up: 'Pick up the pace', reduce_scope: 'Narrow the path' } as Record<string, string>)[recoveryPlan.status] ?? 'Adjust the pace'}
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
                            onClick={() => setPendingFix(fix)}
                            disabled={applyingFix !== null}
                            className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                          >
                            {fix.label}
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
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-base font-semibold text-slate-900">
                  Weekly check-in
                  <span className={`ml-2 rounded-full px-2 py-0.5 align-middle text-xs font-semibold ${checkinState?.due ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'}`}>
                    {checkinState?.due ? 'Due this week' : 'Done'}
                  </span>
                </p>
                <p className="mt-0.5 text-sm text-slate-500">
                  {checkinState?.latestCheckin && !checkinState.due
                    ? `Sure about the goal ${checkinState.latestCheckin.confidence}/5 · momentum ${checkinState.latestCheckin.momentum}/5${checkinState.latestCheckin.blockers[0] ? ` · blocker: ${checkinState.latestCheckin.blockers[0]}` : ''}`
                    : 'Two minutes on how the week went. It shapes next week’s plan.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCheckinOpen(true)}
                className={`rounded-xl px-4 py-2.5 text-sm font-semibold ${
                  checkinState?.due
                    ? 'bg-sky-600 text-white hover:bg-sky-700'
                    : 'border border-slate-200 text-slate-700 hover:border-slate-300'
                }`}
              >
                {checkinState?.due ? 'Do check-in' : 'Edit check-in'}
              </button>
            </div>
            {saveMessage ? <p className="mt-3 text-sm text-emerald-700">{saveMessage}</p> : null}
            {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
          </SurfaceCard>

          <WeeklyCheckinModal
            goalId={goal.id}
            goalTitle={goal.title}
            isOpen={checkinOpen}
            onClose={() => setCheckinOpen(false)}
            onSaved={handleCheckinSaved}
          />

          <AppModal
            isOpen={pendingFix !== null}
            onClose={() => setPendingFix(null)}
            title={pendingFix?.label ?? ''}
            description="Here is what changes. Your finish forecast is recalculated right after."
            size="md"
            footer={(
              <>
                <button
                  type="button"
                  onClick={() => setPendingFix(null)}
                  className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:border-slate-300"
                >
                  Keep as is
                </button>
                <button
                  type="button"
                  onClick={() => pendingFix && applyFix(pendingFix)}
                  disabled={applyingFix !== null}
                  className="rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
                >
                  {applyingFix ? 'Updating…' : 'Apply change'}
                </button>
              </>
            )}
          >
            {pendingFix ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
                {pendingFix.action === 'move_date' ? (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-500">Target date</span>
                    <span className="font-semibold text-slate-900">
                      <span className="text-slate-400 line-through">{prettyDate(weeklyReport?.planHealth.targetDate ?? null)}</span>
                      {' → '}
                      {weeklyReport?.planHealth.targetDate ? addWeeks(weeklyReport.planHealth.targetDate, pendingFix.weeks) : `${pendingFix.weeks} weeks later`}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-500">Weekly study time</span>
                    <span className="font-semibold text-slate-900">
                      {weeklyReport?.planHealth.weeklyTargetMinutes ? (
                        <span className="text-slate-400 line-through">{formatMinutes(weeklyReport.planHealth.weeklyTargetMinutes)}</span>
                      ) : null}
                      {' → '}
                      {pendingFix.hours}h
                    </span>
                  </div>
                )}
                <p className="mt-3 text-slate-600">
                  {pendingFix.action === 'move_date'
                    ? 'Nothing is removed from the plan. You get more time for the same concepts.'
                    : 'Fewer hours a week means the finish date may move later. You can raise it again any time.'}
                </p>
              </div>
            ) : null}
          </AppModal>
        </div>
      )}
    </Stack>
  );
}
