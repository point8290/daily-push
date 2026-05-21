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

export const roleRecommendationResponseFixture: RoleRecommendationResponse = {
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
      lockedPremiumSections: ["full_readiness", "proof_plan", "sprint_plan"],
    },
  ],
  interpretedInput: fullStackCandidateInputFixture,
  marketCaveat:
    "These recommendations are based on curated market signals and should be treated as directional, not guaranteed predictions.",
  meta: roleMarketFixtureMeta,
};
