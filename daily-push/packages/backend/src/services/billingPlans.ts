export type BillingPlanKey = 'free' | 'pro' | 'sprint';
export type BillingIntervalKey = 'month' | 'year' | 'lifetime';
export type EntitlementResetPeriod = 'daily' | 'weekly' | 'monthly' | 'lifetime';

export interface PlanEntitlementDefinition {
  enabled: boolean;
  limitValue: number | null;
  resetPeriod?: EntitlementResetPeriod | null;
}

export interface BillingPlanDefinition {
  key: BillingPlanKey;
  name: string;
  description: string;
  monthlyPriceCents: number | null;
  yearlyPriceCents: number | null;
  highlight: boolean;
  ctaLabel: string;
  features: string[];
  entitlements: Record<string, PlanEntitlementDefinition>;
}

export const BILLING_PLANS: Record<BillingPlanKey, BillingPlanDefinition> = {
  free: {
    key: 'free',
    name: 'Free',
    description: 'Start one goal, sample the AI coach, and prove the workflow fits you.',
    monthlyPriceCents: null,
    yearlyPriceCents: null,
    highlight: false,
    ctaLabel: 'Current baseline',
    features: [
      '1 active goal',
      '10 AI understanding checks each month',
      'Core daily plan and map',
      'No premium resource tools',
    ],
    entitlements: {
      'goals.active.max': { enabled: true, limitValue: 1, resetPeriod: null },
      'ai_checks.monthly': { enabled: true, limitValue: 10, resetPeriod: 'monthly' },
      'premium_resources.enabled': { enabled: false, limitValue: null, resetPeriod: null },
      'weekly_reports.enabled': { enabled: false, limitValue: null, resetPeriod: null },
      'premium_sprints.enabled': { enabled: false, limitValue: null, resetPeriod: null },
      'gap_reports.monthly': { enabled: false, limitValue: 0, resetPeriod: 'monthly' },
      'mock_interviews.monthly': { enabled: false, limitValue: 0, resetPeriod: 'monthly' },
      'artifacts.export.enabled': { enabled: false, limitValue: null, resetPeriod: null },
    },
  },
  pro: {
    key: 'pro',
    name: 'Pro',
    description: 'For engineers who want deeper feedback, richer reports, and fewer limits.',
    monthlyPriceCents: 1500,
    yearlyPriceCents: 14400,
    highlight: true,
    ctaLabel: 'Upgrade to Pro',
    features: [
      'Unlimited active goals',
      '150 AI understanding checks each month',
      'Premium resource recovery tools',
      'Weekly reports and billing management',
    ],
    entitlements: {
      'goals.active.max': { enabled: true, limitValue: null, resetPeriod: null },
      'ai_checks.monthly': { enabled: true, limitValue: 150, resetPeriod: 'monthly' },
      'premium_resources.enabled': { enabled: true, limitValue: null, resetPeriod: null },
      'weekly_reports.enabled': { enabled: true, limitValue: null, resetPeriod: null },
      'premium_sprints.enabled': { enabled: false, limitValue: null, resetPeriod: null },
      'gap_reports.monthly': { enabled: false, limitValue: 0, resetPeriod: 'monthly' },
      'mock_interviews.monthly': { enabled: false, limitValue: 0, resetPeriod: 'monthly' },
      'artifacts.export.enabled': { enabled: false, limitValue: null, resetPeriod: null },
    },
  },
  sprint: {
    key: 'sprint',
    name: 'Sprint',
    description: 'Outcome mode with career-focused assessments, richer AI tooling, and premium execution.',
    monthlyPriceCents: 4900,
    yearlyPriceCents: 47040,
    highlight: false,
    ctaLabel: 'Start a Sprint',
    features: [
      'Unlimited active goals',
      '400 AI understanding checks each month',
      'Premium resource tools',
      'Future sprint-only assessments like mock interviews and gap reports',
    ],
    entitlements: {
      'goals.active.max': { enabled: true, limitValue: null, resetPeriod: null },
      'ai_checks.monthly': { enabled: true, limitValue: 400, resetPeriod: 'monthly' },
      'premium_resources.enabled': { enabled: true, limitValue: null, resetPeriod: null },
      'weekly_reports.enabled': { enabled: true, limitValue: null, resetPeriod: null },
      'premium_sprints.enabled': { enabled: true, limitValue: null, resetPeriod: null },
      'gap_reports.monthly': { enabled: true, limitValue: 10, resetPeriod: 'monthly' },
      'mock_interviews.monthly': { enabled: true, limitValue: 8, resetPeriod: 'monthly' },
      'artifacts.export.enabled': { enabled: true, limitValue: null, resetPeriod: null },
    },
  },
};

export const KNOWN_ENTITLEMENT_KEYS = Array.from(
  new Set(
    Object.values(BILLING_PLANS).flatMap((plan) =>
      Object.keys(plan.entitlements),
    ),
  ),
);

export function listBillingPlans(): BillingPlanDefinition[] {
  return Object.values(BILLING_PLANS);
}

export function getBillingPlanDefinition(planKey: BillingPlanKey): BillingPlanDefinition {
  return BILLING_PLANS[planKey];
}

export function isBillingPlanKey(value: string): value is BillingPlanKey {
  return value in BILLING_PLANS;
}

export function getUpgradePlanForFeature(featureKey: string): BillingPlanKey | null {
  const candidatePlans = listBillingPlans().filter((plan) => plan.key !== 'free');
  for (const plan of candidatePlans) {
    const entitlement = plan.entitlements[featureKey];
    if (!entitlement) continue;
    if (entitlement.enabled && (entitlement.limitValue === null || entitlement.limitValue > 0)) {
      return plan.key;
    }
  }
  return null;
}
