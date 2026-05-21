export type PlanKey = 'free' | 'pro' | 'sprint' | null | undefined;

export function hasProResumeAccess(planKey: PlanKey): boolean {
  return planKey === 'pro' || planKey === 'sprint';
}

export function hasSprintAccess(planKey: PlanKey): boolean {
  return planKey === 'sprint';
}
