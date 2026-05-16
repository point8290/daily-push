import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Badge,
  Button,
  FormControl,
  FormLabel,
  HStack,
  Input,
  Select,
  SimpleGrid,
  Spinner,
  Stack,
  Switch,
  Text,
  VStack,
} from '@chakra-ui/react';
import { getSettings, updateSettings } from '../api/client';
import { useEntitlements } from '../contexts/EntitlementsContext';
import PageHeader from '../components/ui/PageHeader';
import SurfaceCard from '../components/ui/SurfaceCard';

const TIMEZONES = [
  'UTC', 'Asia/Kolkata', 'Asia/Singapore', 'Asia/Tokyo',
  'Australia/Sydney', 'Europe/London', 'Europe/Berlin',
  'America/New_York', 'America/Chicago', 'America/Los_Angeles',
];

interface Settings {
  availableMinsDay: number;
  availableDaysWeek: number;
  timezone: string;
  digestTime: string | null;
  emailWeeklySummary: boolean;
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <SurfaceCard p={5}>
      <Text fontSize="xs" fontWeight="800" letterSpacing="0.14em" textTransform="uppercase" color="ink.400">
        {label}
      </Text>
      <Text mt={2} fontSize="lg" fontWeight="700" color="ink.900" letterSpacing="-0.03em">
        {value}
      </Text>
      {detail ? (
        <Text mt={1.5} fontSize="sm" color="ink.500" lineHeight="1.7">
          {detail}
        </Text>
      ) : null}
    </SurfaceCard>
  );
}

export default function Settings() {
  const {
    currentPlan,
    entitlements,
    startCheckout,
    openBillingPortal,
    refreshEntitlements,
  } = useEntitlements();
  const [form, setForm] = useState<Settings>({
    availableMinsDay: 45,
    availableDaysWeek: 5,
    timezone: 'UTC',
    digestTime: null,
    emailWeeklySummary: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [billingBusy, setBillingBusy] = useState<string | null>(null);
  const [billingMessage, setBillingMessage] = useState('');

  useEffect(() => {
    getSettings().then((s: Settings) => {
      setForm(s);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    void refreshEntitlements().catch(() => {});
  }, [refreshEntitlements]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError('');
    try {
      await updateSettings(form);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      setSaveError(err?.response?.data?.error ?? 'Failed to save settings. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  const aiChecks = entitlements.find((entry) => entry.featureKey === 'ai_checks.monthly');
  const activeGoalLimit = entitlements.find((entry) => entry.featureKey === 'goals.active.max');
  const weeklyReports = entitlements.find((entry) => entry.featureKey === 'weekly_reports.enabled');

  const handleUpgrade = async (planKey: 'pro' | 'sprint') => {
    setBillingBusy(planKey);
    setBillingMessage('');
    try {
      const result = await startCheckout(planKey);
      if (result.mode === 'external') {
        window.location.assign(result.url);
        return;
      }
      setBillingMessage(`Plan updated to ${planKey}.`);
    } catch (err: any) {
      setBillingMessage(err?.response?.data?.error ?? 'Could not update your plan.');
    } finally {
      setBillingBusy(null);
    }
  };

  const handleManageBilling = async () => {
    setBillingBusy('manage');
    setBillingMessage('');
    try {
      const result = await openBillingPortal();
      setBillingMessage(
        result.mode === 'manual'
          ? 'Billing controls are available in local simulation mode for now.'
          : 'Billing portal opened in a new tab.',
      );
      if (result.mode === 'external') {
        window.open(result.url, '_blank', 'noopener,noreferrer');
      }
    } catch (err: any) {
      setBillingMessage(err?.response?.data?.error ?? 'Could not open billing management.');
    } finally {
      setBillingBusy(null);
    }
  };

  if (loading) {
    return (
      <SurfaceCard p={{ base: 8, md: 12 }}>
        <VStack spacing={4} minH="40vh" justify="center">
          <Spinner size="lg" color="brand.500" thickness="3px" />
          <Text fontSize="sm" color="ink.500">Loading your settings...</Text>
        </VStack>
      </SurfaceCard>
    );
  }

  const planName = currentPlan?.plan.name ?? 'Free';
  const planTone = currentPlan?.planKey === 'sprint'
    ? 'orange'
    : currentPlan?.planKey === 'pro'
      ? 'blue'
      : 'gray';

  return (
    <form onSubmit={handleSave}>
      <Stack spacing={6}>
        <PageHeader
          eyebrow="Account"
          title="Settings"
          description="Tune your cadence, keep billing in view, and control the communication rhythm that powers your weekly execution loop."
          actions={(
            <>
              <Badge colorScheme={planTone} px={3} py={1.5} rounded="full" fontSize="0.72rem" textTransform="uppercase" letterSpacing="0.12em">
                {planName}
              </Badge>
              <Button
                as={RouterLink}
                to="/pricing"
                variant="outline"
                borderColor="blackAlpha.200"
                color="ink.700"
                _hover={{ borderColor: 'brand.300', color: 'brand.700' }}
              >
                View pricing
              </Button>
            </>
          )}
        />

        <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
          <MetricCard
            label="Active goal limit"
            value={activeGoalLimit?.limitValue == null ? 'Unlimited' : `${activeGoalLimit.limitValue} goals`}
            detail="How many outcome tracks you can run in parallel."
          />
          <MetricCard
            label="AI checks remaining"
            value={aiChecks?.remaining == null ? 'Unlimited' : `${aiChecks.remaining} left`}
            detail="Used for premium evaluations, reports, and coaching feedback."
          />
          <MetricCard
            label="Weekly reports"
            value={weeklyReports?.enabled ? 'Unlocked' : 'Locked'}
            detail="Controls email summaries, recovery plans, and manager-style reporting."
          />
        </SimpleGrid>

        <SurfaceCard p={{ base: 5, md: 6 }}>
          <Stack spacing={5}>
            <HStack justify="space-between" align={{ base: 'flex-start', md: 'center' }} flexDir={{ base: 'column', md: 'row' }} spacing={4}>
              <VStack align="flex-start" spacing={1}>
                <Text fontSize="xs" fontWeight="800" letterSpacing="0.14em" textTransform="uppercase" color="ink.400">
                  Plan and billing
                </Text>
                <Text fontSize="sm" color="ink.500" lineHeight="1.7">
                  Upgrade when you need more checks, richer feedback loops, or the full Sprint workflow.
                </Text>
              </VStack>
              <Button
                as={RouterLink}
                to="/pricing"
                variant="ghost"
                color="brand.700"
                _hover={{ bg: 'brand.50' }}
              >
                Compare plans
              </Button>
            </HStack>

            <HStack spacing={3} flexWrap="wrap">
              {currentPlan?.planKey !== 'pro' ? (
                <Button
                  type="button"
                  colorScheme="blue"
                  onClick={() => handleUpgrade('pro')}
                  isLoading={billingBusy === 'pro'}
                  isDisabled={billingBusy !== null}
                >
                  Upgrade to Pro
                </Button>
              ) : null}
              {currentPlan?.planKey !== 'sprint' ? (
                <Button
                  type="button"
                  variant="outline"
                  borderColor="blackAlpha.200"
                  color="ink.700"
                  onClick={() => handleUpgrade('sprint')}
                  isLoading={billingBusy === 'sprint'}
                  isDisabled={billingBusy !== null}
                >
                  Unlock Sprint
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                color="ink.600"
                onClick={handleManageBilling}
                isLoading={billingBusy === 'manage'}
                isDisabled={billingBusy !== null}
              >
                Manage billing
              </Button>
            </HStack>

            {billingMessage ? (
              <Text fontSize="sm" color={billingMessage.includes('Could not') ? 'red.500' : 'green.600'}>
                {billingMessage}
              </Text>
            ) : null}
          </Stack>
        </SurfaceCard>

        <SurfaceCard p={{ base: 5, md: 6 }}>
          <HStack justify="space-between" align={{ base: 'flex-start', md: 'center' }} flexDir={{ base: 'column', md: 'row' }} spacing={4}>
            <VStack align="flex-start" spacing={1}>
              <Text fontSize="xs" fontWeight="800" letterSpacing="0.14em" textTransform="uppercase" color="ink.400">
                Internal metrics
              </Text>
              <Text fontSize="sm" color="ink.500" lineHeight="1.7">
                Inspect activation, premium usage, and the health of the monetization funnel without leaving the app.
              </Text>
            </VStack>
            <Button
              as={RouterLink}
              to="/metrics"
              variant="outline"
              borderColor="blackAlpha.200"
              color="ink.700"
            >
              Open metrics
            </Button>
          </HStack>
        </SurfaceCard>

        <SimpleGrid columns={{ base: 1, xl: 2 }} spacing={6}>
          <SurfaceCard p={{ base: 5, md: 6 }}>
            <Stack spacing={5}>
              <VStack align="flex-start" spacing={1}>
                <Text fontSize="xs" fontWeight="800" letterSpacing="0.14em" textTransform="uppercase" color="ink.400">
                  Study schedule
                </Text>
                <Text fontSize="sm" color="ink.500" lineHeight="1.7">
                  These values shape forecasts, sprint pacing, and how aggressively the app schedules your next steps.
                </Text>
              </VStack>

              <FormControl>
                <FormLabel fontSize="sm" color="ink.700">Minutes per day</FormLabel>
                <Input
                  type="number"
                  min={5}
                  max={480}
                  value={form.availableMinsDay}
                  onChange={(e) => setForm((f) => ({ ...f, availableMinsDay: parseInt(e.target.value, 10) || 45 }))}
                  maxW="11rem"
                  bg="whiteAlpha.700"
                  borderColor="blackAlpha.200"
                />
                <Text mt={2} fontSize="xs" color="ink.400">
                  Used to estimate how much momentum you can sustain each week.
                </Text>
              </FormControl>

              <FormControl>
                <FormLabel fontSize="sm" color="ink.700">Days per week</FormLabel>
                <HStack spacing={2} flexWrap="wrap">
                  {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                    <Button
                      key={d}
                      type="button"
                      size="sm"
                      minW="2.5rem"
                      borderRadius="full"
                      variant={form.availableDaysWeek === d ? 'solid' : 'ghost'}
                      colorScheme={form.availableDaysWeek === d ? 'blue' : undefined}
                      onClick={() => setForm((f) => ({ ...f, availableDaysWeek: d }))}
                    >
                      {d}
                    </Button>
                  ))}
                </HStack>
              </FormControl>
            </Stack>
          </SurfaceCard>

          <SurfaceCard p={{ base: 5, md: 6 }}>
            <Stack spacing={5}>
              <VStack align="flex-start" spacing={1}>
                <Text fontSize="xs" fontWeight="800" letterSpacing="0.14em" textTransform="uppercase" color="ink.400">
                  Timezone and communication
                </Text>
                <Text fontSize="sm" color="ink.500" lineHeight="1.7">
                  Keep digests and weekly recaps aligned with your local workday so reminders land at the right moment.
                </Text>
              </VStack>

              <FormControl>
                <FormLabel fontSize="sm" color="ink.700">Timezone</FormLabel>
                <Select
                  value={form.timezone}
                  onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
                  bg="whiteAlpha.700"
                  borderColor="blackAlpha.200"
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>{tz}</option>
                  ))}
                </Select>
              </FormControl>

              <FormControl>
                <FormLabel fontSize="sm" color="ink.700">Daily digest time</FormLabel>
                <Input
                  type="time"
                  value={form.digestTime ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, digestTime: e.target.value || null }))}
                  maxW="11rem"
                  bg="whiteAlpha.700"
                  borderColor="blackAlpha.200"
                />
              </FormControl>

              <HStack justify="space-between" align="center" rounded="2xl" bg="blackAlpha.50" px={4} py={3}>
                <VStack align="flex-start" spacing={0.5}>
                  <Text fontSize="sm" fontWeight="600" color="ink.800">Weekly summary email</Text>
                  <Text fontSize="xs" color="ink.500">
                    Send sprint health, recovery notes, and progress highlights.
                  </Text>
                </VStack>
                <Switch
                  colorScheme="blue"
                  isChecked={form.emailWeeklySummary}
                  onChange={() => setForm((f) => ({ ...f, emailWeeklySummary: !f.emailWeeklySummary }))}
                />
              </HStack>
            </Stack>
          </SurfaceCard>
        </SimpleGrid>

        <SurfaceCard p={{ base: 5, md: 6 }}>
          <HStack justify="space-between" align={{ base: 'flex-start', md: 'center' }} flexDir={{ base: 'column', md: 'row' }} spacing={4}>
            <VStack align="flex-start" spacing={1}>
              <Text fontSize="sm" fontWeight="700" color="ink.900">Save your operating rhythm</Text>
              <Text fontSize="sm" color="ink.500" lineHeight="1.7">
                These settings directly affect sprint forecasts, report timing, and how the app shapes your daily workload.
              </Text>
              {saved ? <Text fontSize="sm" color="green.600">Settings saved.</Text> : null}
              {saveError ? <Text fontSize="sm" color="red.500">{saveError}</Text> : null}
            </VStack>

            <Button type="submit" colorScheme="blue" size="lg" isLoading={saving}>
              Save settings
            </Button>
          </HStack>
        </SurfaceCard>
      </Stack>
    </form>
  );
}
