import type {
  CandidateRoleInput,
  RoleRecommendation,
  RoleTransitionPath,
} from "./roleMarketContracts";
import { ROLE_MARKET_BANNED_CERTAINTY_PHRASES } from "./roleMarketCopySafety";
import { roleMarketSeedProfiles } from "./roleMarketSeedProfiles";
import { validateCandidateRoleInput } from "./roleMarketValidation";

export type GoldenCandidateId =
  | "golden_full_stack_backend_senior"
  | "golden_manual_qa_to_sdet"
  | "golden_data_analyst_to_analytics_engineer"
  | "golden_sysadmin_to_platform"
  | "golden_junior_frontend_to_product_engineer"
  | "golden_devops_to_ai_platform";

export interface GoldenRecommendationExpectations {
  topRoleIds: string[];
  acceptableRoleIds: string[];
  badRecommendationRoleIds: string[];
  likelyGapKeywords: string[];
  transitionDifficultyByRoleId: Record<string, RoleTransitionPath["fitLevel"]>;
  proofSuggestionKeywords: string[];
}

export interface GoldenEvaluationRubric {
  topN: number;
  minExpectedGapKeywordMatches: number;
  minExpectedProofKeywordMatches: number;
  requireSourceBackedRoles: boolean;
  requireSignalLanguageInWhyNow: boolean;
  personalizationRequiredTerms: string[];
  practicalActionVerbs: string[];
  bannedCertaintyPhrases: string[];
}

export interface GoldenCandidateEvaluationFixture {
  id: GoldenCandidateId;
  title: string;
  candidateSegment: string;
  whyThisFixtureMatters: string;
  input: CandidateRoleInput;
  expected: GoldenRecommendationExpectations;
  rubric: GoldenEvaluationRubric;
}

export interface GoldenFixtureValidationResult {
  valid: boolean;
  errors: string[];
}

export interface GoldenRecommendationCheck {
  name: string;
  passed: boolean;
  message: string;
}

export interface GoldenRecommendationEvaluationResult {
  fixtureId: GoldenCandidateId;
  passed: boolean;
  score: number;
  checks: GoldenRecommendationCheck[];
}

const defaultPracticalActionVerbs = [
  "build",
  "ship",
  "create",
  "publish",
  "document",
  "rewrite",
  "automate",
  "deploy",
  "practice",
  "implement",
];

function rubric(input: {
  personalizationRequiredTerms: string[];
  topN?: number;
  minExpectedGapKeywordMatches?: number;
  minExpectedProofKeywordMatches?: number;
}): GoldenEvaluationRubric {
  return {
    topN: input.topN ?? 3,
    minExpectedGapKeywordMatches: input.minExpectedGapKeywordMatches ?? 2,
    minExpectedProofKeywordMatches: input.minExpectedProofKeywordMatches ?? 2,
    requireSourceBackedRoles: true,
    requireSignalLanguageInWhyNow: true,
    personalizationRequiredTerms: input.personalizationRequiredTerms,
    practicalActionVerbs: defaultPracticalActionVerbs,
    bannedCertaintyPhrases: ROLE_MARKET_BANNED_CERTAINTY_PHRASES,
  };
}

export const roleMarketGoldenCandidateFixtures: GoldenCandidateEvaluationFixture[] = [
  {
    id: "golden_full_stack_backend_senior",
    title: "Senior full-stack engineer repositioning toward backend-heavy AI product work",
    candidateSegment: "5-year full-stack/backend candidate with production systems experience",
    whyThisFixtureMatters:
      "This is the core Daily Push user: good experience, fuzzy market direction, and a need for sharper positioning.",
    input: {
      currentRole: "Senior Full-stack Engineer",
      yearsExperience: 5,
      region: "India",
      skills: [
        "Node.js",
        "React",
        "Angular",
        "Spring Boot",
        "AWS",
        "Docker",
        "Jenkins",
        "SQL",
        "MongoDB",
      ],
      strongestAreas: [
        "IoT license management",
        "API performance optimization",
        "dashboard systems",
        "auth and RBAC",
        "production debugging",
      ],
      preferredDirections: ["backend", "ai", "full_stack", "cloud"],
      avoidedDirections: ["pure research", "manual testing"],
      workStyle: ["building_products", "systems"],
      targetSeniority: "senior",
      freeTextContext:
        "Wants to switch jobs and reposition from generic MERN/full-stack into senior backend or AI-enabled product engineering.",
    },
    expected: {
      topRoleIds: [
        "role_backend_engineer",
        "role_ai_backend_engineer",
        "role_full_stack_product_engineer",
      ],
      acceptableRoleIds: ["role_platform_engineer", "role_devops_engineer", "role_product_engineer"],
      badRecommendationRoleIds: [
        "role_mlops_engineer",
        "role_cybersecurity_analyst",
        "role_analytics_engineer",
      ],
      likelyGapKeywords: [
        "LLM evaluation",
        "AI reliability",
        "system design",
        "source-backed proof",
        "architecture case study",
      ],
      transitionDifficultyByRoleId: {
        role_backend_engineer: "easy",
        role_ai_backend_engineer: "moderate",
        role_full_stack_product_engineer: "easy",
      },
      proofSuggestionKeywords: [
        "AI-backed workflow",
        "typed output validation",
        "architecture write-up",
        "system design case study",
        "production metrics",
      ],
    },
    rubric: rubric({
      personalizationRequiredTerms: ["node", "react", "aws", "iot", "api", "dashboard", "rbac"],
    }),
  },
  {
    id: "golden_manual_qa_to_sdet",
    title: "Manual QA analyst moving into SDET and automation",
    candidateSegment: "Manual tester with API testing and domain context but limited coding proof",
    whyThisFixtureMatters:
      "The system must avoid pushing every non-developer into AI roles and instead recommend a realistic upgrade path.",
    input: {
      currentRole: "Manual QA Analyst",
      yearsExperience: 4,
      region: "India",
      skills: ["manual testing", "regression testing", "Postman", "SQL basics", "Jira", "test cases"],
      strongestAreas: [
        "release validation",
        "API testing",
        "bug reporting",
        "test scenario design",
      ],
      preferredDirections: ["qa", "product_engineering"],
      avoidedDirections: ["data science", "pure backend", "cloud infrastructure"],
      workStyle: ["building_products", "operations"],
      targetSeniority: "mid",
      freeTextContext:
        "Wants to stay close to product quality but become more technical and less replaceable.",
    },
    expected: {
      topRoleIds: ["role_sdet_qa_automation_engineer"],
      acceptableRoleIds: ["role_product_engineer", "role_full_stack_product_engineer"],
      badRecommendationRoleIds: [
        "role_ai_platform_engineer",
        "role_mlops_engineer",
        "role_cloud_security_engineer",
      ],
      likelyGapKeywords: [
        "test automation",
        "coding",
        "CI",
        "quality gates",
        "framework design",
      ],
      transitionDifficultyByRoleId: {
        role_sdet_qa_automation_engineer: "moderate",
        role_product_engineer: "hard",
      },
      proofSuggestionKeywords: [
        "Playwright",
        "Cypress",
        "API test suite",
        "CI quality gate",
        "defect prevention",
      ],
    },
    rubric: rubric({
      personalizationRequiredTerms: ["qa", "postman", "regression", "test", "jira"],
    }),
  },
  {
    id: "golden_data_analyst_to_analytics_engineer",
    title: "Data analyst upgrading into analytics engineering",
    candidateSegment: "Analyst with dashboard and SQL strength who needs production-grade data proof",
    whyThisFixtureMatters:
      "This protects the engine from recommending broad AI/data science paths when analytics engineering is a cleaner fit.",
    input: {
      currentRole: "Data Analyst",
      yearsExperience: 3,
      region: "India",
      skills: ["SQL", "Excel", "Power BI", "Python basics", "dashboarding", "business metrics"],
      strongestAreas: [
        "stakeholder reporting",
        "metric definitions",
        "dashboard analysis",
        "ad hoc SQL",
      ],
      preferredDirections: ["data", "product_engineering"],
      avoidedDirections: ["infrastructure", "security", "frontend-heavy work"],
      workStyle: ["building_products", "customer_facing"],
      targetSeniority: "mid",
      freeTextContext:
        "Wants to move beyond reporting into trusted data models, data products, and better-paying analytics roles.",
    },
    expected: {
      topRoleIds: ["role_analytics_engineer", "role_data_engineer"],
      acceptableRoleIds: ["role_product_engineer"],
      badRecommendationRoleIds: [
        "role_cloud_security_engineer",
        "role_llmops_engineer",
        "role_platform_engineer",
      ],
      likelyGapKeywords: [
        "semantic modeling",
        "data quality",
        "pipeline",
        "dbt",
        "version control",
      ],
      transitionDifficultyByRoleId: {
        role_analytics_engineer: "easy",
        role_data_engineer: "moderate",
      },
      proofSuggestionKeywords: [
        "analytics model",
        "metric documentation",
        "data quality checks",
        "dashboard trust",
        "SQL project",
      ],
    },
    rubric: rubric({
      personalizationRequiredTerms: ["sql", "power bi", "dashboard", "metric", "analysis"],
    }),
  },
  {
    id: "golden_sysadmin_to_platform",
    title: "Sysadmin or IT operations candidate moving into platform/cloud",
    candidateSegment: "Operations-heavy profile with Linux, networking, and monitoring experience",
    whyThisFixtureMatters:
      "The engine needs to recognize infrastructure-adjacent candidates and guide them into cloud/platform proof, not generic coding roles.",
    input: {
      currentRole: "System Administrator",
      yearsExperience: 6,
      region: "India",
      skills: ["Linux", "networking", "shell scripting", "monitoring", "incident response", "AWS basics"],
      strongestAreas: [
        "server operations",
        "deployment troubleshooting",
        "uptime monitoring",
        "access management",
      ],
      preferredDirections: ["cloud", "platform", "security"],
      avoidedDirections: ["frontend", "data analysis", "product design"],
      workStyle: ["operations", "systems"],
      targetSeniority: "senior",
      freeTextContext:
        "Wants to convert operations experience into cloud, DevOps, or platform engineering roles.",
    },
    expected: {
      topRoleIds: ["role_devops_engineer", "role_platform_engineer", "role_cloud_security_engineer"],
      acceptableRoleIds: ["role_cybersecurity_analyst"],
      badRecommendationRoleIds: [
        "role_full_stack_product_engineer",
        "role_analytics_engineer",
        "role_applied_ai_engineer",
      ],
      likelyGapKeywords: [
        "Infrastructure as Code",
        "Kubernetes",
        "CI/CD",
        "cloud IAM",
        "developer platform",
      ],
      transitionDifficultyByRoleId: {
        role_devops_engineer: "moderate",
        role_platform_engineer: "moderate",
        role_cloud_security_engineer: "moderate",
      },
      proofSuggestionKeywords: [
        "Terraform",
        "CI/CD pipeline",
        "observability",
        "cloud reference architecture",
        "self-service deployment",
      ],
    },
    rubric: rubric({
      personalizationRequiredTerms: ["linux", "network", "monitoring", "incident", "aws"],
    }),
  },
  {
    id: "golden_junior_frontend_to_product_engineer",
    title: "Junior frontend engineer growing into product engineering",
    candidateSegment: "Early-career frontend candidate who needs broader product and backend proof",
    whyThisFixtureMatters:
      "This checks that the engine gives an achievable growth path instead of over-indexing on senior AI/platform roles.",
    input: {
      currentRole: "Junior Frontend Developer",
      yearsExperience: 1.5,
      region: "India",
      skills: ["React", "JavaScript", "CSS", "HTML", "basic TypeScript", "responsive UI"],
      strongestAreas: ["UI implementation", "component building", "responsive layouts"],
      preferredDirections: ["frontend", "full_stack", "product_engineering"],
      avoidedDirections: ["security operations", "data engineering", "infrastructure"],
      workStyle: ["building_products", "customer_facing"],
      targetSeniority: "mid",
      freeTextContext:
        "Wants to become more valuable than a UI ticket executor and move toward product ownership.",
    },
    expected: {
      topRoleIds: ["role_full_stack_product_engineer", "role_product_engineer"],
      acceptableRoleIds: ["role_sdet_qa_automation_engineer", "role_backend_engineer"],
      badRecommendationRoleIds: [
        "role_ai_platform_engineer",
        "role_mlops_engineer",
        "role_cloud_security_engineer",
      ],
      likelyGapKeywords: [
        "backend basics",
        "product metrics",
        "end-to-end feature",
        "testing",
        "business context",
      ],
      transitionDifficultyByRoleId: {
        role_full_stack_product_engineer: "moderate",
        role_product_engineer: "moderate",
        role_backend_engineer: "hard",
      },
      proofSuggestionKeywords: [
        "end-to-end feature",
        "analytics event",
        "API integration",
        "user problem",
        "case study",
      ],
    },
    rubric: rubric({
      personalizationRequiredTerms: ["react", "javascript", "css", "ui", "component"],
    }),
  },
  {
    id: "golden_devops_to_ai_platform",
    title: "DevOps engineer moving toward platform and AI infrastructure",
    candidateSegment: "Cloud automation candidate with a strong infrastructure base",
    whyThisFixtureMatters:
      "This validates that AI platform is recommended to infrastructure-capable candidates, not only app developers.",
    input: {
      currentRole: "DevOps Engineer",
      yearsExperience: 5,
      region: "India",
      skills: [
        "AWS",
        "Docker",
        "Kubernetes",
        "Terraform",
        "Jenkins",
        "monitoring",
        "incident response",
      ],
      strongestAreas: [
        "deployment automation",
        "cloud infrastructure",
        "CI/CD",
        "observability",
        "release reliability",
      ],
      preferredDirections: ["platform", "cloud", "ai"],
      avoidedDirections: ["frontend-heavy roles", "business analyst roles"],
      workStyle: ["systems", "operations"],
      targetSeniority: "senior",
      freeTextContext:
        "Wants to move from deployment ownership into platform engineering and AI infrastructure enablement.",
    },
    expected: {
      topRoleIds: ["role_platform_engineer", "role_ai_platform_engineer", "role_devops_engineer"],
      acceptableRoleIds: ["role_llmops_engineer", "role_cloud_security_engineer"],
      badRecommendationRoleIds: [
        "role_analytics_engineer",
        "role_full_stack_product_engineer",
        "role_product_engineer",
      ],
      likelyGapKeywords: [
        "developer platform",
        "AI infrastructure",
        "LLM operations",
        "governance",
        "platform product thinking",
      ],
      transitionDifficultyByRoleId: {
        role_devops_engineer: "easy",
        role_platform_engineer: "easy",
        role_ai_platform_engineer: "moderate",
      },
      proofSuggestionKeywords: [
        "self-service platform",
        "deployment template",
        "AI service observability",
        "cost controls",
        "guardrails",
      ],
    },
    rubric: rubric({
      personalizationRequiredTerms: ["aws", "docker", "kubernetes", "terraform", "ci/cd", "observability"],
    }),
  },
];

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9+#./-]+/g, " ").trim();
}

function textContainsAny(text: string, terms: string[]): boolean {
  const normalizedText = normalize(text);
  return terms.some((term) => normalizedText.includes(normalize(term)));
}

function countMatchedTerms(text: string, terms: string[]): number {
  const normalizedText = normalize(text);
  return terms.filter((term) => normalizedText.includes(normalize(term))).length;
}

function recommendationText(recommendations: RoleRecommendation[]): string {
  return recommendations
    .flatMap((recommendation) => [
      recommendation.title,
      ...recommendation.fitReasons,
      ...recommendation.likelyGaps,
      ...recommendation.proofToBuild,
      ...recommendation.whyNow,
    ])
    .join(" ");
}

function pushCheck(
  checks: GoldenRecommendationCheck[],
  name: string,
  passed: boolean,
  message: string,
): void {
  checks.push({ name, passed, message });
}

export function getGoldenCandidateFixture(
  fixtureId: GoldenCandidateId,
): GoldenCandidateEvaluationFixture | undefined {
  return roleMarketGoldenCandidateFixtures.find((fixture) => fixture.id === fixtureId);
}

export function validateGoldenCandidateFixture(
  fixture: GoldenCandidateEvaluationFixture,
  validRoleIds = new Set(roleMarketSeedProfiles.map((profile) => profile.id)),
): GoldenFixtureValidationResult {
  const errors: string[] = [];
  const inputResult = validateCandidateRoleInput(fixture.input, `${fixture.id}.input`);

  errors.push(...inputResult.errors);

  if (!fixture.id) errors.push("fixture.id is required");
  if (!fixture.title) errors.push(`${fixture.id}.title is required`);
  if (!fixture.candidateSegment) errors.push(`${fixture.id}.candidateSegment is required`);
  if (!fixture.whyThisFixtureMatters) {
    errors.push(`${fixture.id}.whyThisFixtureMatters is required`);
  }

  const expected = fixture.expected;
  if (!expected.topRoleIds.length) errors.push(`${fixture.id}.expected.topRoleIds is required`);
  if (!expected.badRecommendationRoleIds.length) {
    errors.push(`${fixture.id}.expected.badRecommendationRoleIds is required`);
  }
  if (!expected.likelyGapKeywords.length) {
    errors.push(`${fixture.id}.expected.likelyGapKeywords is required`);
  }
  if (!expected.proofSuggestionKeywords.length) {
    errors.push(`${fixture.id}.expected.proofSuggestionKeywords is required`);
  }

  const referencedRoleIds = [
    ...expected.topRoleIds,
    ...expected.acceptableRoleIds,
    ...expected.badRecommendationRoleIds,
    ...Object.keys(expected.transitionDifficultyByRoleId),
  ];

  referencedRoleIds.forEach((roleId) => {
    if (!validRoleIds.has(roleId)) {
      errors.push(`${fixture.id} references unknown role profile ${roleId}`);
    }
  });

  expected.topRoleIds.forEach((roleId) => {
    if (expected.badRecommendationRoleIds.includes(roleId)) {
      errors.push(`${fixture.id} cannot mark ${roleId} as both expected and bad`);
    }
  });

  if (fixture.rubric.topN < 1) errors.push(`${fixture.id}.rubric.topN must be at least 1`);
  if (!fixture.rubric.personalizationRequiredTerms.length) {
    errors.push(`${fixture.id}.rubric.personalizationRequiredTerms is required`);
  }
  if (!fixture.rubric.practicalActionVerbs.length) {
    errors.push(`${fixture.id}.rubric.practicalActionVerbs is required`);
  }
  if (!fixture.rubric.bannedCertaintyPhrases.length) {
    errors.push(`${fixture.id}.rubric.bannedCertaintyPhrases is required`);
  }

  return { valid: errors.length === 0, errors };
}

export function validateGoldenCandidateFixtures(
  fixtures = roleMarketGoldenCandidateFixtures,
): GoldenFixtureValidationResult {
  const validRoleIds = new Set(roleMarketSeedProfiles.map((profile) => profile.id));
  const seenFixtureIds = new Set<string>();
  const errors: string[] = [];

  fixtures.forEach((fixture) => {
    if (seenFixtureIds.has(fixture.id)) {
      errors.push(`duplicate fixture id ${fixture.id}`);
    }
    seenFixtureIds.add(fixture.id);
    errors.push(...validateGoldenCandidateFixture(fixture, validRoleIds).errors);
  });

  const requiredFixtureIds: GoldenCandidateId[] = [
    "golden_full_stack_backend_senior",
    "golden_manual_qa_to_sdet",
    "golden_data_analyst_to_analytics_engineer",
    "golden_sysadmin_to_platform",
    "golden_junior_frontend_to_product_engineer",
    "golden_devops_to_ai_platform",
  ];

  requiredFixtureIds.forEach((fixtureId) => {
    if (!seenFixtureIds.has(fixtureId)) errors.push(`missing required fixture ${fixtureId}`);
  });

  return { valid: errors.length === 0, errors };
}

export function assertValidGoldenCandidateFixtures(
  fixtures = roleMarketGoldenCandidateFixtures,
): void {
  const result = validateGoldenCandidateFixtures(fixtures);
  if (!result.valid) {
    throw new Error(`Invalid role market golden fixtures: ${result.errors.join("; ")}`);
  }
}

export function evaluateRecommendationsAgainstGoldenFixture(
  recommendations: RoleRecommendation[],
  fixture: GoldenCandidateEvaluationFixture,
): GoldenRecommendationEvaluationResult {
  const checks: GoldenRecommendationCheck[] = [];
  const topRecommendations = recommendations.slice(0, fixture.rubric.topN);
  const topRoleIds = topRecommendations.map((recommendation) => recommendation.roleProfileId);
  const allText = recommendationText(topRecommendations);

  pushCheck(
    checks,
    "expected-top-role",
    topRoleIds.some((roleId) => fixture.expected.topRoleIds.includes(roleId)),
    `One of ${fixture.expected.topRoleIds.join(", ")} should appear in the top ${fixture.rubric.topN}.`,
  );

  pushCheck(
    checks,
    "avoid-bad-recommendations",
    topRoleIds.every((roleId) => !fixture.expected.badRecommendationRoleIds.includes(roleId)),
    `Top ${fixture.rubric.topN} should not include ${fixture.expected.badRecommendationRoleIds.join(", ")}.`,
  );

  const difficultyMismatches = topRecommendations.filter((recommendation) => {
    const expectedDifficulty = fixture.expected.transitionDifficultyByRoleId[recommendation.roleProfileId];
    return expectedDifficulty && expectedDifficulty !== recommendation.transitionDifficulty;
  });

  pushCheck(
    checks,
    "transition-difficulty",
    difficultyMismatches.length === 0,
    difficultyMismatches.length
      ? `Transition difficulty mismatch for ${difficultyMismatches
          .map((recommendation) => recommendation.roleProfileId)
          .join(", ")}.`
      : "Expected transition difficulty labels match configured fixture expectations.",
  );

  const gapMatches = countMatchedTerms(allText, fixture.expected.likelyGapKeywords);
  pushCheck(
    checks,
    "likely-gaps",
    gapMatches >= fixture.rubric.minExpectedGapKeywordMatches,
    `Matched ${gapMatches}/${fixture.rubric.minExpectedGapKeywordMatches} expected gap terms.`,
  );

  const proofMatches = countMatchedTerms(allText, fixture.expected.proofSuggestionKeywords);
  pushCheck(
    checks,
    "proof-suggestions",
    proofMatches >= fixture.rubric.minExpectedProofKeywordMatches,
    `Matched ${proofMatches}/${fixture.rubric.minExpectedProofKeywordMatches} expected proof terms.`,
  );

  if (fixture.rubric.requireSourceBackedRoles) {
    const roleProfileIds = new Set(roleMarketSeedProfiles.map((profile) => profile.id));
    const missingProfiles = topRoleIds.filter((roleId) => !roleProfileIds.has(roleId));
    pushCheck(
      checks,
      "source-backed-roles",
      missingProfiles.length === 0,
      missingProfiles.length
        ? `Recommendations reference unknown role profiles: ${missingProfiles.join(", ")}.`
        : "Recommended roles are backed by curated seed profiles.",
    );
  }

  if (fixture.rubric.requireSignalLanguageInWhyNow) {
    const whyNowText = topRecommendations.flatMap((recommendation) => recommendation.whyNow).join(" ");
    pushCheck(
      checks,
      "signal-language",
      textContainsAny(whyNowText, ["signal", "signals", "suggest", "directional", "market"]),
      "Why-now copy should use signal language instead of certainty or prediction language.",
    );
  }

  pushCheck(
    checks,
    "personalization",
    textContainsAny(allText, fixture.rubric.personalizationRequiredTerms),
    `Recommendation should reference candidate-specific terms such as ${fixture.rubric.personalizationRequiredTerms
      .slice(0, 4)
      .join(", ")}.`,
  );

  const proofText = topRecommendations.flatMap((recommendation) => recommendation.proofToBuild).join(" ");
  pushCheck(
    checks,
    "practical-next-step",
    textContainsAny(proofText, fixture.rubric.practicalActionVerbs),
    "Proof guidance should include a concrete action verb.",
  );

  const certaintyMatches = fixture.rubric.bannedCertaintyPhrases.filter((phrase) =>
    normalize(allText).includes(normalize(phrase)),
  );
  pushCheck(
    checks,
    "no-false-certainty",
    certaintyMatches.length === 0,
    certaintyMatches.length
      ? `Banned certainty phrases found: ${certaintyMatches.join(", ")}.`
      : "No banned certainty language detected.",
  );

  const passedCount = checks.filter((check) => check.passed).length;

  return {
    fixtureId: fixture.id,
    passed: passedCount === checks.length,
    score: Math.round((passedCount / checks.length) * 100),
    checks,
  };
}
