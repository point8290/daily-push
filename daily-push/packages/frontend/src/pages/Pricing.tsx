import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Badge,
  Box,
  Button,
  ButtonGroup,
  SimpleGrid,
  Stack,
  Text,
} from '@chakra-ui/react';
import { getBillingPlanState, type BillingPlan } from '../api/client';
import { useEntitlements } from '../contexts/EntitlementsContext';
import PageHeader from '../components/ui/PageHeader';
import SurfaceCard from '../components/ui/SurfaceCard';

function formatPrice(cents: number | null, interval: 'month' | 'year') {
  if (cents === null) return 'Free';
  const dollars = (cents / 100).toFixed(0);
  return `$${dollars}/${interval === 'month' ? 'mo' : 'yr'}`;
}

export default function Pricing() {
  const {
    currentPlan,
    startCheckout,
    loading: entitlementLoading,
  } = useEntitlements();
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [provider, setProvider] = useState<'manual' | 'stripe'>('manual');
  const [billingInterval, setBillingInterval] = useState<'month' | 'year'>('month');
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    getBillingPlanState()
      .then((result) => {
        setPlans(result.plans);
        setProvider(result.provider);
      })
      .catch(() => setError('Failed to load pricing right now.'));
  }, []);

  const handleUpgrade = async (planKey: 'pro' | 'sprint') => {
    setBusyPlan(planKey);
    setError('');
    try {
      const result = await startCheckout(planKey, billingInterval);
      if (result.mode === 'external') {
        window.location.assign(result.url);
        return;
      }
      setMessage(`Plan switched to ${planKey} in local billing simulation mode.`);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Could not start checkout.');
    } finally {
      setBusyPlan(null);
    }
  };

  return (
    <Stack spacing={8}>
      <PageHeader
        eyebrow="Plans"
        title="Pricing built for serious career progression"
        description="Start free, then upgrade when you want deeper feedback, better accountability, and premium outcome tooling around the roles you are targeting."
        actions={(
          <ButtonGroup isAttached variant="outline" size="sm">
            <Button
              onClick={() => setBillingInterval('month')}
              bg={billingInterval === 'month' ? 'white' : 'transparent'}
              color={billingInterval === 'month' ? 'ink.900' : 'ink.500'}
            >
              Monthly
            </Button>
            <Button
              onClick={() => setBillingInterval('year')}
              bg={billingInterval === 'year' ? 'white' : 'transparent'}
              color={billingInterval === 'year' ? 'ink.900' : 'ink.500'}
            >
              Yearly
            </Button>
          </ButtonGroup>
        )}
      />

      {provider === 'manual' && (
        <SurfaceCard px={6} py={5}>
          <Text fontSize="sm" fontWeight="800" color="accent.700">
            Local billing simulation is active
          </Text>
          <Text mt={2} fontSize="sm" color="ink.500" lineHeight="1.8">
            In this environment, plan changes apply immediately instead of redirecting to hosted checkout.
          </Text>
        </SurfaceCard>
      )}

      {message && (
        <SurfaceCard px={5} py={4} bg="rgba(236,253,245,0.88)" borderColor="green.100">
          <Text fontSize="sm" color="green.700">{message}</Text>
        </SurfaceCard>
      )}
      {error && (
        <SurfaceCard px={5} py={4} bg="rgba(254,242,242,0.92)" borderColor="red.100">
          <Text fontSize="sm" color="red.600">{error}</Text>
        </SurfaceCard>
      )}

      <SimpleGrid columns={{ base: 1, xl: 3 }} spacing={6}>
        {plans.map((plan) => {
          const price =
            billingInterval === 'month'
              ? formatPrice(plan.monthlyPriceCents, 'month')
              : formatPrice(plan.yearlyPriceCents, 'year');
          const isCurrent = currentPlan?.planKey === plan.key;

          return (
            <SurfaceCard
              key={plan.key}
              px={6}
              py={6}
              position="relative"
              overflow="hidden"
              borderColor={plan.highlight ? 'brand.200' : 'whiteAlpha.700'}
              bg={plan.highlight ? 'linear-gradient(180deg, rgba(47,140,255,0.08), rgba(255,255,255,0.96))' : 'rgba(255,255,255,0.92)'}
            >
              <Stack spacing={5} h="100%">
                <Box>
                  <Stack direction="row" justify="space-between" align="center">
                    <Text fontSize="lg" fontWeight="800" color="ink.900">
                      {plan.name}
                    </Text>
                    {isCurrent && <Badge colorScheme="blue">Current</Badge>}
                  </Stack>
                  <Text mt={3} minH="72px" fontSize="sm" lineHeight="1.8" color="ink.500">
                    {plan.description}
                  </Text>
                </Box>

                <Box>
                  <Text fontSize="4xl" fontWeight="800" letterSpacing="-0.05em" color="ink.900">
                    {price}
                  </Text>
                  <Text mt={1} fontSize="xs" textTransform="uppercase" letterSpacing="0.14em" color="ink.400">
                    {plan.key === 'free' ? 'Start here' : 'For momentum and outcomes'}
                  </Text>
                </Box>

                <Stack spacing={3} flex="1">
                  {plan.features.map((feature) => (
                    <Box key={feature} rounded="xl" bg="blackAlpha.50" px={3.5} py={3}>
                      <Text fontSize="sm" color="ink.600">
                        {feature}
                      </Text>
                    </Box>
                  ))}
                </Stack>

                {plan.key === 'free' ? (
                  <Button disabled variant="outline">
                    Free baseline
                  </Button>
                ) : (
                  <Button
                    disabled={isCurrent || entitlementLoading || busyPlan === plan.key}
                    onClick={() => handleUpgrade(plan.key as 'pro' | 'sprint')}
                  >
                    {busyPlan === plan.key
                      ? 'Updating plan...'
                      : isCurrent
                        ? 'Current plan'
                        : plan.ctaLabel}
                  </Button>
                )}
              </Stack>
            </SurfaceCard>
          );
        })}
      </SimpleGrid>

      <SurfaceCard px={6} py={5}>
        <Text fontSize="sm" color="ink.500">
          Need a quick route back? Visit{' '}
          <Text as={Link} to="/settings" color="brand.700" fontWeight="700">
            Settings
          </Text>{' '}
          to manage the current plan and billing behavior.
        </Text>
      </SurfaceCard>
    </Stack>
  );
}
