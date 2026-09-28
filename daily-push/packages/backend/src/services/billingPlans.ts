export type BillingPlanKey = "free" | "pro" | "sprint";
export type BillingIntervalKey = "month" | "year" | "lifetime";
export type EntitlementResetPeriod =
  | "daily"
  | "weekly"
  | "monthly"
  | "lifetime";

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
    key: "free",
    name: "Free",
    description:
      "One direction, the daily session, and a short proof record.",
    monthlyPriceCents: null,
    yearlyPriceCents: null,
    highlight: false,
    ctaLabel: "Current baseline",
    features: [
      "One active direction",
      "Daily session and the path",
      "A short proof record",
      "Direction suggestions to choose where to build",
      "A first resume read and one saved application",
    ],
    entitlements: {
      "goals.active.max": { enabled: true, limitValue: 1, resetPeriod: null },
      "ai_checks.monthly": {
        enabled: true,
        limitValue: 10,
        resetPeriod: "monthly",
      },
      "market_recommendations.daily": {
        enabled: true,
        limitValue: 5,
        resetPeriod: "daily",
      },
      "resume_snapshots.daily": {
        enabled: true,
        limitValue: 5,
        resetPeriod: "daily",
      },
      "resume_reports.monthly": {
        enabled: true,
        limitValue: 1,
        resetPeriod: "monthly",
      },
      "tailored_resumes.monthly": {
        enabled: false,
        limitValue: 0,
        resetPeriod: "monthly",
      },
      "applications.saved.max": {
        enabled: true,
        limitValue: 1,
        resetPeriod: null,
      },
      "target_roles.saved.max": {
        enabled: true,
        limitValue: 1,
        resetPeriod: null,
      },
      "role_readiness_reports.monthly": {
        enabled: true,
        limitValue: 1,
        resetPeriod: "monthly",
      },
      "role_comparisons.monthly": {
        enabled: false,
        limitValue: 0,
        resetPeriod: "monthly",
      },
      "readiness_reassessments.monthly": {
        enabled: true,
        limitValue: 1,
        resetPeriod: "monthly",
      },
      "premium_resources.enabled": {
        enabled: false,
        limitValue: null,
        resetPeriod: null,
      },
      "weekly_reports.enabled": {
        enabled: false,
        limitValue: null,
        resetPeriod: null,
      },
      "premium_sprints.enabled": {
        enabled: false,
        limitValue: null,
        resetPeriod: null,
      },
      "gap_reports.monthly": {
        enabled: false,
        limitValue: 0,
        resetPeriod: "monthly",
      },
      "mock_interviews.monthly": {
        enabled: false,
        limitValue: 0,
        resetPeriod: "monthly",
      },
      "artifacts.export.enabled": {
        enabled: false,
        limitValue: null,
        resetPeriod: null,
      },
    },
  },
  pro: {
    key: "pro",
    name: "Pro",
    description:
      "The full record: more directions, proof you can show, and language that matches it.",
    monthlyPriceCents: 1500,
    yearlyPriceCents: 14400,
    highlight: true,
    ctaLabel: "Upgrade to Pro",
    features: [
      "More than one direction",
      "Full proof record and weekly progress",
      "Resume narrative and tailored drafts",
      "Saved applications for specific roles",
      "Direction comparisons as you choose where to build",
    ],
    entitlements: {
      "goals.active.max": {
        enabled: true,
        limitValue: null,
        resetPeriod: null,
      },
      "ai_checks.monthly": {
        enabled: true,
        limitValue: 150,
        resetPeriod: "monthly",
      },
      "market_recommendations.daily": {
        enabled: true,
        limitValue: null,
        resetPeriod: "daily",
      },
      "resume_snapshots.daily": {
        enabled: true,
        limitValue: null,
        resetPeriod: "daily",
      },
      "resume_reports.monthly": {
        enabled: true,
        limitValue: 25,
        resetPeriod: "monthly",
      },
      "tailored_resumes.monthly": {
        enabled: true,
        limitValue: 25,
        resetPeriod: "monthly",
      },
      "applications.saved.max": {
        enabled: true,
        limitValue: 20,
        resetPeriod: null,
      },
      "target_roles.saved.max": {
        enabled: true,
        limitValue: 10,
        resetPeriod: null,
      },
      "role_readiness_reports.monthly": {
        enabled: true,
        limitValue: 25,
        resetPeriod: "monthly",
      },
      "role_comparisons.monthly": {
        enabled: true,
        limitValue: 25,
        resetPeriod: "monthly",
      },
      "readiness_reassessments.monthly": {
        enabled: true,
        limitValue: 25,
        resetPeriod: "monthly",
      },
      "premium_resources.enabled": {
        enabled: true,
        limitValue: null,
        resetPeriod: null,
      },
      "weekly_reports.enabled": {
        enabled: true,
        limitValue: null,
        resetPeriod: null,
      },
      "premium_sprints.enabled": {
        enabled: false,
        limitValue: null,
        resetPeriod: null,
      },
      "gap_reports.monthly": {
        enabled: false,
        limitValue: 0,
        resetPeriod: "monthly",
      },
      "mock_interviews.monthly": {
        enabled: false,
        limitValue: 0,
        resetPeriod: "monthly",
      },
      "artifacts.export.enabled": {
        enabled: false,
        limitValue: null,
        resetPeriod: null,
      },
    },
  },
  sprint: {
    key: "sprint",
    name: "Sprint",
    description:
      "Kept for current subscribers. Includes the full record plus interview practice and export.",
    monthlyPriceCents: 4900,
    yearlyPriceCents: 47040,
    highlight: false,
    ctaLabel: "Start a Sprint",
    features: [
      "Everything in Pro",
      "Interview practice",
      "Export of the proof and voice record",
    ],
    entitlements: {
      "goals.active.max": {
        enabled: true,
        limitValue: null,
        resetPeriod: null,
      },
      "ai_checks.monthly": {
        enabled: true,
        limitValue: 400,
        resetPeriod: "monthly",
      },
      "market_recommendations.daily": {
        enabled: true,
        limitValue: null,
        resetPeriod: "daily",
      },
      "resume_snapshots.daily": {
        enabled: true,
        limitValue: null,
        resetPeriod: "daily",
      },
      "resume_reports.monthly": {
        enabled: true,
        limitValue: 50,
        resetPeriod: "monthly",
      },
      "tailored_resumes.monthly": {
        enabled: true,
        limitValue: 50,
        resetPeriod: "monthly",
      },
      "applications.saved.max": {
        enabled: true,
        limitValue: null,
        resetPeriod: null,
      },
      "target_roles.saved.max": {
        enabled: true,
        limitValue: null,
        resetPeriod: null,
      },
      "role_readiness_reports.monthly": {
        enabled: true,
        limitValue: null,
        resetPeriod: "monthly",
      },
      "role_comparisons.monthly": {
        enabled: true,
        limitValue: null,
        resetPeriod: "monthly",
      },
      "readiness_reassessments.monthly": {
        enabled: true,
        limitValue: null,
        resetPeriod: "monthly",
      },
      "premium_resources.enabled": {
        enabled: true,
        limitValue: null,
        resetPeriod: null,
      },
      "weekly_reports.enabled": {
        enabled: true,
        limitValue: null,
        resetPeriod: null,
      },
      "premium_sprints.enabled": {
        enabled: true,
        limitValue: null,
        resetPeriod: null,
      },
      "gap_reports.monthly": {
        enabled: true,
        limitValue: 10,
        resetPeriod: "monthly",
      },
      "mock_interviews.monthly": {
        enabled: true,
        limitValue: 8,
        resetPeriod: "monthly",
      },
      "artifacts.export.enabled": {
        enabled: true,
        limitValue: null,
        resetPeriod: null,
      },
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

export function getBillingPlanDefinition(
  planKey: BillingPlanKey,
): BillingPlanDefinition {
  return BILLING_PLANS[planKey];
}

export function isBillingPlanKey(value: string): value is BillingPlanKey {
  return value in BILLING_PLANS;
}

export function getUpgradePlanForFeature(
  featureKey: string,
): BillingPlanKey | null {
  const candidatePlans = listBillingPlans().filter(
    (plan) => plan.key !== "free",
  );
  for (const plan of candidatePlans) {
    const entitlement = plan.entitlements[featureKey];
    if (!entitlement) continue;
    if (
      entitlement.enabled &&
      (entitlement.limitValue === null || entitlement.limitValue > 0)
    ) {
      return plan.key;
    }
  }
  return null;
}
