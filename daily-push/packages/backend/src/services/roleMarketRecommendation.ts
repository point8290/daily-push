import {
  assertValidRoleRecommendationResponse,
  validateCandidateRoleInput,
  type CandidateRoleInput,
  type ContractMeta,
  type RoleMarketProfile,
  type RoleRecommendationMarketSignal,
  type RoleRecommendationMode,
  type RoleRecommendation,
  type RoleRecommendationResponse,
  type RoleRecommendationScoreBreakdown,
  type RoleRequirement,
  type RoleRequirementCoverage,
  type RoleTransitionPath,
  type SeniorityFit,
} from '@daily-push/shared';
import { config } from '../config';
import { DependencyUnavailableError } from '../middleware/roleMarketFeature';
import { getMarketProfileRegistry, type MarketProfileRegistry } from './marketProfileRegistry';

interface RoleScoringHint {
  directions: string[];
  currentRoleTerms: string[];
  skillTerms: string[];
  workStyles: string[];
}

interface ScoredRole {
  profile: RoleMarketProfile;
  score: number;
  matchedSkillTerms: string[];
  matchedDirectionTerms: string[];
  matchedCurrentRoleTerms: string[];
  matchedWorkStyles: string[];
  requirementCoverage: RoleRequirementCoverage[];
  scoreInputs: RoleRecommendationScoreBreakdown['scoreInputs'];
  seniorityFit: SeniorityFit;
}

interface RecommendationOptions {
  mode?: RoleRecommendationMode;
  targetRoleProfileId?: string | null;
}

export class RoleRecommendationInputError extends Error {
  statusCode = 400;

  code = 'validation_error';
}

const ROLE_HINTS: Record<string, RoleScoringHint> = {
  role_ai_backend_engineer: {
    directions: ['backend', 'ai', 'full_stack'],
    currentRoleTerms: ['backend', 'full-stack', 'full stack', 'software engineer'],
    skillTerms: ['node', 'typescript', 'api', 'aws', 'docker', 'sql', 'rbac', 'performance', 'spring'],
    workStyles: ['building_products', 'systems'],
  },
  role_ai_platform_engineer: {
    directions: ['ai', 'platform', 'cloud'],
    currentRoleTerms: ['devops', 'platform', 'backend', 'cloud engineer'],
    skillTerms: ['aws', 'docker', 'kubernetes', 'terraform', 'jenkins', 'monitoring', 'ci/cd'],
    workStyles: ['systems', 'operations'],
  },
  role_applied_ai_engineer: {
    directions: ['ai', 'product_engineering', 'full_stack'],
    currentRoleTerms: ['full-stack', 'full stack', 'product engineer', 'backend'],
    skillTerms: ['react', 'node', 'typescript', 'api', 'product', 'workflow'],
    workStyles: ['building_products', 'customer_facing'],
  },
  role_llmops_engineer: {
    directions: ['ai', 'platform', 'cloud'],
    currentRoleTerms: ['devops', 'platform', 'backend'],
    skillTerms: ['monitoring', 'observability', 'kubernetes', 'aws', 'docker', 'logs', 'incident'],
    workStyles: ['systems', 'operations'],
  },
  role_mlops_engineer: {
    directions: ['ai', 'data', 'platform'],
    currentRoleTerms: ['data engineer', 'machine learning engineer', 'backend'],
    skillTerms: ['python', 'data pipeline', 'model', 'ml', 'feature', 'training'],
    workStyles: ['systems', 'research'],
  },
  role_cloud_security_engineer: {
    directions: ['cloud', 'security', 'platform'],
    currentRoleTerms: ['devops', 'system administrator', 'sysadmin', 'security analyst'],
    skillTerms: ['aws', 'iam', 'linux', 'networking', 'incident', 'access', 'monitoring', 'terraform'],
    workStyles: ['systems', 'operations'],
  },
  role_platform_engineer: {
    directions: ['platform', 'cloud', 'devops'],
    currentRoleTerms: ['devops', 'system administrator', 'sysadmin', 'backend', 'platform'],
    skillTerms: ['aws', 'docker', 'kubernetes', 'terraform', 'jenkins', 'ci/cd', 'monitoring'],
    workStyles: ['systems', 'operations'],
  },
  role_data_engineer: {
    directions: ['data', 'backend'],
    currentRoleTerms: ['data analyst', 'backend', 'full-stack', 'full stack'],
    skillTerms: ['sql', 'python', 'pipeline', 'data quality', 'power bi', 'dashboard'],
    workStyles: ['systems', 'building_products'],
  },
  role_analytics_engineer: {
    directions: ['data', 'product_engineering'],
    currentRoleTerms: ['data analyst', 'business analyst', 'analytics'],
    skillTerms: ['sql', 'excel', 'power bi', 'dashboard', 'metric', 'analytics', 'python'],
    workStyles: ['building_products', 'customer_facing'],
  },
  role_cybersecurity_analyst: {
    directions: ['security', 'cloud'],
    currentRoleTerms: ['qa automation', 'security analyst'],
    skillTerms: ['incident', 'logs', 'monitoring', 'networking', 'access', 'linux'],
    workStyles: ['operations', 'systems'],
  },
  role_sdet_qa_automation_engineer: {
    directions: ['qa', 'product_engineering'],
    currentRoleTerms: ['manual qa', 'qa analyst', 'tester', 'quality analyst', 'frontend'],
    skillTerms: ['manual testing', 'regression', 'postman', 'test cases', 'jira', 'api testing'],
    workStyles: ['building_products', 'operations'],
  },
  role_backend_engineer: {
    directions: ['backend', 'full_stack', 'cloud'],
    currentRoleTerms: ['full-stack', 'full stack', 'backend', 'software engineer'],
    skillTerms: ['node', 'spring', 'api', 'sql', 'mongodb', 'aws', 'docker', 'rbac', 'performance'],
    workStyles: ['systems', 'building_products'],
  },
  role_full_stack_product_engineer: {
    directions: ['full_stack', 'frontend', 'product_engineering'],
    currentRoleTerms: ['frontend', 'full-stack', 'full stack', 'backend', 'junior frontend'],
    skillTerms: ['react', 'javascript', 'typescript', 'css', 'html', 'ui', 'component', 'node'],
    workStyles: ['building_products', 'customer_facing'],
  },
  role_devops_engineer: {
    directions: ['cloud', 'platform', 'devops'],
    currentRoleTerms: ['devops', 'system administrator', 'sysadmin', 'backend'],
    skillTerms: ['aws', 'docker', 'kubernetes', 'terraform', 'jenkins', 'monitoring', 'ci/cd', 'linux'],
    workStyles: ['systems', 'operations'],
  },
  role_product_engineer: {
    directions: ['product_engineering', 'full_stack', 'frontend', 'ai'],
    currentRoleTerms: ['full-stack', 'full stack', 'frontend', 'junior frontend', 'product engineer'],
    skillTerms: ['react', 'javascript', 'typescript', 'ui', 'dashboard', 'metric', 'product'],
    workStyles: ['building_products', 'customer_facing'],
  },
};

const ARCHETYPE_GAPS_AND_PROOF: Array<{
  terms: string[];
  gaps: string[];
  proof: string[];
}> = [
  {
    terms: ['manual qa', 'qa analyst', 'tester'],
    gaps: ['test automation', 'coding', 'CI quality gates', 'test framework design'],
    proof: ['Build a Playwright or Cypress API test suite with a CI quality gate.'],
  },
  {
    terms: ['data analyst', 'business analyst', 'power bi'],
    gaps: ['semantic modeling', 'data quality', 'pipeline ownership', 'dbt or version control'],
    proof: ['Create an analytics model with metric documentation and data quality checks.'],
  },
  {
    terms: ['system administrator', 'sysadmin', 'linux'],
    gaps: ['Infrastructure as Code', 'Kubernetes', 'CI/CD', 'cloud IAM', 'developer platform thinking'],
    proof: ['Deploy a Terraform-backed cloud reference architecture with monitoring and access controls.'],
  },
  {
    terms: ['junior frontend', 'frontend developer'],
    gaps: ['backend basics', 'product metrics', 'end-to-end feature ownership', 'testing', 'business context'],
    proof: ['Ship an end-to-end feature with API integration, analytics events, and a product case study.'],
  },
  {
    terms: ['devops', 'kubernetes', 'terraform'],
    gaps: ['developer platform thinking', 'AI infrastructure', 'LLM operations', 'governance', 'cost controls'],
    proof: ['Build a self-service platform workflow with AI service observability and guardrails.'],
  },
  {
    terms: ['full-stack', 'full stack', 'backend engineer', 'node'],
    gaps: ['LLM evaluation', 'AI reliability', 'system design', 'source-backed proof', 'architecture case study'],
    proof: ['Build an AI-backed workflow with typed output validation and a system design case study.'],
  },
];

function buildMeta(sourceMode = config.roleMarket.sourceMode): ContractMeta {
  return {
    contractVersion: 'role-market.v1',
    generatedAt: new Date().toISOString(),
    sourceMode,
    seedVersion: config.roleMarket.seedVersion,
    warnings: [],
  };
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9+#./-]+/g, ' ').trim();
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    const key = normalize(trimmed);
    if (trimmed && !seen.has(key)) {
      seen.add(key);
      result.push(trimmed);
    }
  }
  return result;
}

function inputText(input: CandidateRoleInput): string {
  return [
    input.currentRole,
    input.region,
    ...input.skills,
    ...input.strongestAreas,
    ...input.preferredDirections,
    ...input.avoidedDirections,
    ...input.workStyle,
    input.targetSeniority,
    input.freeTextContext,
  ]
    .filter((value): value is string => Boolean(value))
    .join(' ');
}

function positiveInputText(input: CandidateRoleInput): string {
  return [
    input.currentRole,
    input.region,
    ...input.skills,
    ...input.strongestAreas,
    ...input.preferredDirections,
    ...input.workStyle,
    input.targetSeniority,
    input.freeTextContext,
  ]
    .filter((value): value is string => Boolean(value))
    .join(' ');
}

function countMatches(text: string, terms: string[]): string[] {
  const normalizedText = normalize(text);
  return uniqueStrings(
    terms.filter((term) => normalizedText.includes(normalize(term))),
  );
}

function requirementTerms(requirement: RoleRequirement): string[] {
  return uniqueStrings([
    requirement.label,
    requirement.description,
    requirement.category,
    requirement.expectedLevel,
    ...requirement.keywords,
    ...requirement.proofExpected,
    ...requirement.interviewSignals,
  ]);
}

function candidateEvidenceText(input: CandidateRoleInput): string {
  return [
    input.currentRole,
    input.freeTextContext,
    ...input.skills,
    ...input.strongestAreas,
    ...input.preferredDirections,
    ...input.workStyle,
  ]
    .filter((value): value is string => Boolean(value))
    .join(' ');
}

function buildRequirementCoverage(
  profile: RoleMarketProfile,
  input: CandidateRoleInput,
): RoleRequirementCoverage[] {
  const text = candidateEvidenceText(input);
  return profile.requirements.map((requirement) => {
    const matchedTerms = countMatches(text, requirementTerms(requirement));
    const strongMatch =
      matchedTerms.length >= 2 ||
      (requirement.priority !== 'must_have' && matchedTerms.length >= 1);
    const status = strongMatch ? 'matched' : matchedTerms.length > 0 ? 'weak' : 'missing';
    const suggestedAction =
      status === 'matched'
        ? `Turn ${requirement.label} into a concrete project or production story.`
        : status === 'weak'
          ? `Strengthen ${requirement.label} with source-backed proof and interview examples.`
          : `Build visible proof for ${requirement.label}; this is a market requirement for ${profile.title}.`;

    return {
      requirementId: requirement.id,
      label: requirement.label,
      priority: requirement.priority,
      status,
      matchedTerms,
      candidateSignals: matchedTerms.slice(0, 5),
      suggestedAction,
      confidence: Number(
        Math.max(0.35, Math.min(0.92, requirement.confidence - (status === 'missing' ? 0.18 : status === 'weak' ? 0.08 : 0))).toFixed(2),
      ),
    };
  });
}

function inferSeniorityFit(profile: RoleMarketProfile, input: CandidateRoleInput): SeniorityFit {
  if (!input.targetSeniority) return 'unknown';
  if (profile.seniorityBands.includes(input.targetSeniority)) return 'aligned';
  const order = ['junior', 'mid', 'senior', 'staff'];
  const targetIndex = order.indexOf(input.targetSeniority);
  const nearestProfileIndex = Math.min(
    ...profile.seniorityBands
      .map((band) => order.indexOf(band))
      .filter((index) => index >= 0),
  );
  if (targetIndex < 0 || !Number.isFinite(nearestProfileIndex)) return 'unknown';
  return targetIndex < nearestProfileIndex ? 'stretch' : 'mismatch';
}

function scoreRole(profile: RoleMarketProfile, input: CandidateRoleInput): ScoredRole {
  const hints = ROLE_HINTS[profile.id] ?? {
    directions: [profile.category],
    currentRoleTerms: [profile.title],
    skillTerms: profile.requirements.flatMap((requirement) => requirement.keywords),
    workStyles: [],
  };
  const candidateText = inputText(input);
  const preferredText = input.preferredDirections.join(' ');
  const avoidedText = input.avoidedDirections.join(' ');
  const currentRoleText = input.currentRole ?? '';
  const skillText = [...input.skills, ...input.strongestAreas, input.freeTextContext ?? ''].join(' ');
  const workStyleText = input.workStyle.join(' ');
  const requirementCoverage = buildRequirementCoverage(profile, input);
  const matchedRequirementCount = requirementCoverage.filter(
    (coverage) => coverage.status === 'matched',
  ).length;
  const weakRequirementCount = requirementCoverage.filter(
    (coverage) => coverage.status === 'weak',
  ).length;
  const requirementTermsFromProfile = profile.requirements.flatMap(requirementTerms);

  const matchedSkillTerms = countMatches(
    skillText,
    uniqueStrings([...requirementTermsFromProfile, ...hints.skillTerms]),
  );
  const matchedDirectionTerms = countMatches(preferredText, hints.directions);
  const matchedCurrentRoleTerms = countMatches(currentRoleText, hints.currentRoleTerms);
  const matchedWorkStyles = countMatches(workStyleText, hints.workStyles);
  const seniorityFit = inferSeniorityFit(profile, input);

  let score = 28 + profile.confidence * 10;
  score += Math.min(30, matchedSkillTerms.length * 6);
  score += Math.min(18, matchedRequirementCount * 5 + weakRequirementCount * 2);
  score += Math.min(26, matchedDirectionTerms.length * 13);
  score += Math.min(24, matchedCurrentRoleTerms.length * 12);
  score += Math.min(10, matchedWorkStyles.length * 5);

  if (input.targetSeniority && profile.seniorityBands.includes(input.targetSeniority)) {
    score += 4;
  }

  if (countMatches(candidateText, [profile.title, profile.category]).length > 0) {
    score += 4;
  }

  const avoidedMatches = countMatches(avoidedText, [
    profile.title,
    profile.category,
    ...hints.directions,
    ...hints.currentRoleTerms,
  ]);
  score -= Math.min(35, avoidedMatches.length * 15);

  return {
    profile,
    score,
    matchedSkillTerms,
    matchedDirectionTerms,
    matchedCurrentRoleTerms,
    matchedWorkStyles,
    requirementCoverage,
    seniorityFit,
    scoreInputs: {
      requirementMatch: Math.min(18, matchedRequirementCount * 5 + weakRequirementCount * 2),
      directionMatch: Math.min(26, matchedDirectionTerms.length * 13),
      currentRoleMatch: Math.min(24, matchedCurrentRoleTerms.length * 12),
      seniorityMatch: input.targetSeniority && profile.seniorityBands.includes(input.targetSeniority) ? 4 : 0,
      workStyleMatch: Math.min(10, matchedWorkStyles.length * 5),
      marketConfidence: Number((profile.confidence * 10).toFixed(2)),
    },
  };
}

function transitionPathMatchScore(currentRole: string, fromRole: string): number {
  const current = normalize(currentRole);
  const from = normalize(fromRole);
  if (!current || !from) return 0;
  if (current.includes(from) || from.includes(current)) return 4;

  const currentTokens = current.split(/\s+/).filter(Boolean);
  const fromTokens = from.split(/\s+/).filter(Boolean);
  return fromTokens.filter((token) => currentTokens.includes(token)).length;
}

function bestTransitionPath(
  profile: RoleMarketProfile,
  input: CandidateRoleInput,
): RoleTransitionPath | null {
  if (!input.currentRole) return null;
  let bestPath: RoleTransitionPath | null = null;
  let bestScore = 0;
  for (const path of profile.transitionPaths) {
    const score = transitionPathMatchScore(input.currentRole, path.fromRole);
    if (score > bestScore) {
      bestPath = path;
      bestScore = score;
    }
  }
  return bestScore >= 2 ? bestPath : null;
}

function inferTransitionDifficulty(
  profile: RoleMarketProfile,
  input: CandidateRoleInput,
  score: number,
): RoleTransitionPath['fitLevel'] {
  const transitionPath = bestTransitionPath(profile, input);
  if (transitionPath) return transitionPath.fitLevel;

  const current = normalize(input.currentRole ?? '');
  if (current.includes('manual qa') || current.includes('qa analyst')) {
    if (profile.id === 'role_product_engineer') return 'hard';
  }
  if (current.includes('data analyst') && profile.id === 'role_data_engineer') {
    return 'moderate';
  }
  if (current.includes('devops') && profile.id === 'role_devops_engineer') return 'easy';
  if (current.includes('devops') && profile.id === 'role_ai_platform_engineer') return 'moderate';
  if (current.includes('system administrator') || current.includes('sysadmin')) {
    if (
      profile.id === 'role_devops_engineer' ||
      profile.id === 'role_platform_engineer' ||
      profile.id === 'role_cloud_security_engineer'
    ) {
      return 'moderate';
    }
  }
  if (current.includes('junior frontend') || current.includes('frontend')) {
    if (
      profile.id === 'role_full_stack_product_engineer' ||
      profile.id === 'role_product_engineer'
    ) {
      return 'moderate';
    }
    if (profile.id === 'role_backend_engineer') return 'hard';
  }

  if (score >= 78) return 'easy';
  if (score >= 58) return 'moderate';
  return 'hard';
}

function archetypeGapsAndProof(input: CandidateRoleInput): { gaps: string[]; proof: string[] } {
  const text = positiveInputText(input);
  const matched = ARCHETYPE_GAPS_AND_PROOF.filter((archetype) =>
    countMatches(text, archetype.terms).length > 0,
  );

  return {
    gaps: uniqueStrings(matched.flatMap((archetype) => archetype.gaps)),
    proof: uniqueStrings(matched.flatMap((archetype) => archetype.proof)),
  };
}

function buildFitReasons(scoredRole: ScoredRole, input: CandidateRoleInput): string[] {
  const reasons: string[] = [];
  const currentRole = input.currentRole ?? 'current role';
  const strongest = input.strongestAreas.slice(0, 2).join(' and ');
  const skills = scoredRole.matchedSkillTerms.slice(0, 3).join(', ');

  if (skills) {
    reasons.push(
      `Your ${skills} experience maps to ${scoredRole.profile.title} requirements.`,
    );
  }
  if (strongest) {
    reasons.push(
      `Your strongest areas in ${strongest} give this path candidate-specific evidence.`,
    );
  }
  if (scoredRole.matchedCurrentRoleTerms.length > 0) {
    reasons.push(`${currentRole} is a realistic starting point for this transition.`);
  }
  if (scoredRole.matchedDirectionTerms.length > 0) {
    reasons.push(
      `This role aligns with your preferred direction: ${scoredRole.matchedDirectionTerms.join(', ')}.`,
    );
  }

  return reasons.slice(0, 3);
}

function buildLikelyGaps(profile: RoleMarketProfile, input: CandidateRoleInput): string[] {
  const transitionPath = bestTransitionPath(profile, input);
  const archetype = archetypeGapsAndProof(input);
  const requirementGaps = profile.requirements
    .slice(0, 2)
    .map((requirement) => requirement.label);

  return uniqueStrings([
    ...archetype.gaps,
    ...(transitionPath?.likelyGaps ?? []),
    ...requirementGaps,
  ]).slice(0, 5);
}

function buildProofToBuild(profile: RoleMarketProfile, input: CandidateRoleInput): string[] {
  const transitionPath = bestTransitionPath(profile, input);
  const archetype = archetypeGapsAndProof(input);

  return uniqueStrings([
    ...archetype.proof,
    ...(transitionPath?.recommendedProof ?? []),
    ...profile.proofExpectations.map((proof) => `Build or document proof of ${proof}.`),
  ]).slice(0, 4);
}

function buildWhyNow(profile: RoleMarketProfile): string[] {
  const trend = profile.trendSignals[0];
  return [
    `Market signals suggest ${profile.title} is worth tracking: ${trend?.summary ?? profile.marketSummary}`,
  ];
}

function buildScoreBreakdown(scoredRole: ScoredRole): RoleRecommendationScoreBreakdown {
  const matchedRequirements = scoredRole.requirementCoverage.filter(
    (coverage) => coverage.status === 'matched',
  );
  const weakRequirements = scoredRole.requirementCoverage.filter(
    (coverage) => coverage.status === 'weak',
  );
  const missingRequirements = scoredRole.requirementCoverage.filter(
    (coverage) => coverage.status === 'missing',
  );

  return {
    matchedRequirements,
    weakRequirements,
    missingRequirements,
    matchedSkills: scoredRole.matchedSkillTerms.slice(0, 8),
    matchedDirections: scoredRole.matchedDirectionTerms,
    seniorityFit: scoredRole.seniorityFit,
    scoreInputs: scoredRole.scoreInputs,
  };
}

function buildMarketSignal(profile: RoleMarketProfile): RoleRecommendationMarketSignal {
  const sourceSummary = profile.meta.sourceSummary;
  const profileVersion = profile.meta.profileVersion;
  return {
    sourceMode: profile.meta.sourceMode,
    region: sourceSummary?.region ?? null,
    sourceCount: sourceSummary?.sourceCount ?? null,
    sampleSize: sourceSummary?.sampleSize ?? null,
    freshnessHours: sourceSummary?.freshnessHours ?? null,
    profileVersionId: profileVersion?.profileVersionId ?? null,
    publishedAt: profileVersion?.publishedAt ?? null,
    changeSummary: profileVersion?.changeSummary ?? null,
    diffMateriality: profileVersion?.diffMateriality ?? null,
    warnings: profile.meta.warnings,
  };
}

function toRecommendation(scoredRole: ScoredRole, input: CandidateRoleInput): RoleRecommendation {
  const fitScore = Math.max(20, Math.min(92, Math.round(scoredRole.score * 0.72 + 18)));
  return {
    roleProfileId: scoredRole.profile.id,
    title: scoredRole.profile.title,
    fitScore,
    transitionDifficulty: inferTransitionDifficulty(scoredRole.profile, input, scoredRole.score),
    fitReasons: buildFitReasons(scoredRole, input),
    likelyGaps: buildLikelyGaps(scoredRole.profile, input),
    proofToBuild: buildProofToBuild(scoredRole.profile, input),
    whyNow: buildWhyNow(scoredRole.profile),
    confidence: Math.max(
      0.45,
      Math.min(0.86, Number((scoredRole.profile.confidence - 0.04).toFixed(2))),
    ),
    scoreBreakdown: buildScoreBreakdown(scoredRole),
    marketSignal: buildMarketSignal(scoredRole.profile),
    lockedPremiumSections: ['full_readiness', 'proof_plan', 'sprint_plan'],
  };
}

export function generateRoleRecommendationsFromProfiles(
  profiles: RoleMarketProfile[],
  input: CandidateRoleInput,
  limit = 3,
  options: RecommendationOptions = {},
): RoleRecommendationResponse {
  const validation = validateCandidateRoleInput(input);
  if (!validation.valid) {
    throw new RoleRecommendationInputError(validation.errors.join('; '));
  }

  if (profiles.length === 0) {
    throw new DependencyUnavailableError('Role Market profiles are unavailable.');
  }

  const safeLimit = Math.max(1, Math.min(limit, 6));
  const mode: RoleRecommendationMode =
    options.mode === 'target_fit' && options.targetRoleProfileId ? 'target_fit' : 'discovery';
  const scoredRoles = profiles
    .map((profile) => scoreRole(profile, input))
    .sort((a, b) => b.score - a.score || a.profile.title.localeCompare(b.profile.title))
  const selectedRole =
    mode === 'target_fit'
      ? scoredRoles.find(
          (role) =>
            role.profile.id === options.targetRoleProfileId ||
            role.profile.slug === options.targetRoleProfileId,
        )
      : null;
  const orderedRoles =
    selectedRole
      ? [
          selectedRole,
          ...scoredRoles.filter((role) => role.profile.id !== selectedRole.profile.id),
        ]
      : scoredRoles;
  const recommendations = orderedRoles
    .slice(0, safeLimit)
    .map((scoredRole) => toRecommendation(scoredRole, input));

  const response: RoleRecommendationResponse = {
    recommendationMode: mode,
    targetRoleProfileId: selectedRole?.profile.id ?? null,
    recommendations,
    interpretedInput: input,
    marketCaveat:
      mode === 'target_fit'
        ? 'This fit check uses the selected role profile, market signals, and your stated background. Treat it as directional guidance, not a hiring outcome promise.'
        : 'These recommendations use market profile signals and your stated background. Treat them as directional guidance, not a promise of hiring outcomes.',
    meta: {
      ...buildMeta(profiles[0]?.meta.sourceMode ?? config.roleMarket.sourceMode),
      sourceSummary: profiles[0]?.meta.sourceSummary ?? null,
      profileVersion: profiles[0]?.meta.profileVersion ?? null,
      warnings: uniqueStrings(profiles.flatMap((profile) => profile.meta.warnings.map((warning) => warning.message)))
        .map((message) =>
          profiles.flatMap((profile) => profile.meta.warnings).find((warning) => warning.message === message),
        )
        .filter((warning): warning is NonNullable<typeof warning> => Boolean(warning)),
    },
  };

  assertValidRoleRecommendationResponse(response);
  return response;
}

export async function generateRoleRecommendations(
  input: CandidateRoleInput,
  limit = 3,
  registry: MarketProfileRegistry = getMarketProfileRegistry(),
  options: RecommendationOptions = {},
): Promise<RoleRecommendationResponse> {
  const profiles = await registry.listProfiles({ region: input.region ?? null });
  return generateRoleRecommendationsFromProfiles(profiles, input, limit, options);
}
