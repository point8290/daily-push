import type {
  CandidateRoleInput,
  ListRolesResponse,
  RoleRecommendationResponse,
} from "./roleMarketContracts";
import {
  ROLE_MARKET_LAST_UPDATED,
  ROLE_MARKET_SEED_VERSION,
  roleMarketSeedMeta,
  roleMarketSeedProfiles,
} from "./roleMarketSeedProfiles";

export const roleMarketFixtureMeta = roleMarketSeedMeta;
export const aiBackendEngineerFixture = roleMarketSeedProfiles[0];
export const backendEngineerFixture = roleMarketSeedProfiles.find(
  (profile) => profile.id === "role_backend_engineer",
) ?? roleMarketSeedProfiles[0];
export const roleMarketProfileFixtures = roleMarketSeedProfiles;

export const fullStackCandidateInputFixture: CandidateRoleInput = {
  currentRole: "Full-stack Engineer",
  yearsExperience: 5,
  region: "India",
  skills: ["Node.js", "React", "TypeScript", "AWS", "Docker", "SQL"],
  strongestAreas: ["API development", "dashboard optimization", "production debugging"],
  preferredDirections: ["backend", "ai", "full_stack"],
  avoidedDirections: ["pure research"],
  workStyle: ["building_products", "systems"],
  targetSeniority: "senior",
  freeTextContext:
    "Built IoT licensing and dashboard systems; wants to move toward backend-heavy AI product engineering.",
};

export const listRolesResponseFixture: ListRolesResponse = {
  roles: roleMarketProfileFixtures.map((role) => ({
    id: role.id,
    slug: role.slug,
    title: role.title,
    category: role.category,
    roleType: role.roleType,
    aiImpact: role.aiImpact,
    shortDescription: role.shortDescription,
    topRequirements: role.requirements.slice(0, 3).map((requirement) => requirement.label),
    lastUpdated: role.lastUpdated,
    confidence: role.confidence,
  })),
  meta: {
    ...roleMarketFixtureMeta,
    generatedAt: ROLE_MARKET_LAST_UPDATED,
    seedVersion: ROLE_MARKET_SEED_VERSION,
  },
};

const fixtureMarketSignal = {
  sourceMode: roleMarketFixtureMeta.sourceMode,
  region: null,
  sourceCount: aiBackendEngineerFixture.sourceRefs.length,
  sampleSize: null,
  freshnessHours: null,
  profileVersionId: null,
  publishedAt: null,
  changeSummary: null,
  diffMateriality: null,
  warnings: [],
};

export const roleRecommendationResponseFixture: RoleRecommendationResponse = {
  recommendationMode: "discovery",
  targetRoleProfileId: null,
  recommendations: [
    {
      roleProfileId: aiBackendEngineerFixture.id,
      title: aiBackendEngineerFixture.title,
      fitScore: 78,
      transitionDifficulty: "moderate",
      fitReasons: [
        "Backend and full-stack experience transfers well into production AI product work.",
        "Node.js, TypeScript, AWS, Docker, and SQL map to the role's backend foundation.",
      ],
      likelyGaps: ["LLM evaluation", "RAG patterns", "AI reliability proof"],
      proofToBuild: [
        "Ship a small AI-backed workflow with typed output validation and an architecture write-up.",
      ],
      whyNow: [
        "Signals suggest teams need engineers who can own AI features beyond prompt experimentation.",
      ],
      confidence: 0.72,
      scoreBreakdown: {
        matchedRequirements: [
          {
            requirementId: aiBackendEngineerFixture.requirements[0].id,
            label: aiBackendEngineerFixture.requirements[0].label,
            priority: aiBackendEngineerFixture.requirements[0].priority,
            status: "matched",
            matchedTerms: ["Node.js", "TypeScript", "AWS"],
            candidateSignals: ["Node.js", "TypeScript", "AWS"],
            suggestedAction: "Turn this overlap into a source-backed project story.",
            confidence: 0.78,
          },
        ],
        weakRequirements: [],
        missingRequirements: [],
        matchedSkills: ["Node.js", "TypeScript", "AWS"],
        matchedDirections: ["backend", "ai", "full_stack"],
        seniorityFit: "aligned",
        scoreInputs: {
          requirementMatch: 24,
          directionMatch: 20,
          currentRoleMatch: 12,
          seniorityMatch: 4,
          workStyleMatch: 6,
          marketConfidence: 7,
        },
      },
      marketSignal: fixtureMarketSignal,
      lockedPremiumSections: ["full_readiness", "proof_plan", "sprint_plan"],
    },
  ],
  interpretedInput: fullStackCandidateInputFixture,
  marketCaveat:
    "These recommendations are based on curated market signals and should be treated as directional guidance, not a promise of hiring outcomes.",
  meta: roleMarketFixtureMeta,
};
