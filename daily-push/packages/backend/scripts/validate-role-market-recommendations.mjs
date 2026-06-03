import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const shared = require("../../shared/dist");
const { generateRoleRecommendations } = require("../dist/services/roleMarketRecommendation");

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function validateLiveReadyRecommendationBehavior() {
  let capturedOptions = null;
  const registry = {
    async listProfiles(options) {
      capturedOptions = options ?? {};
      return shared.roleMarketProfileFixtures;
    },
    async getProfile(identifier) {
      const profile = shared.roleMarketProfileFixtures.find(
        (candidate) => candidate.id === identifier || candidate.slug === identifier,
      );
      if (!profile) throw new Error(`Missing fixture profile ${identifier}`);
      return profile;
    },
    async getPublishedProfileVersion() {
      return null;
    },
  };

  const input = {
    ...shared.fullStackCandidateInputFixture,
    region: "India",
  };

  const discoveryResponse = await generateRoleRecommendations(input, 3, registry);
  assertCondition(
    capturedOptions?.region === "India",
    "Find Direction recommendations must request region-aware market profiles.",
  );
  assertCondition(
    discoveryResponse.recommendationMode === "discovery",
    "Discovery recommendations must label the response mode.",
  );
  assertCondition(
    discoveryResponse.recommendations.every(
      (recommendation) =>
        recommendation.scoreBreakdown &&
        recommendation.marketSignal &&
        Array.isArray(recommendation.scoreBreakdown.matchedRequirements),
    ),
    "Every recommendation must include explainable score breakdown and market signal metadata.",
  );

  const targetResponse = await generateRoleRecommendations(input, 3, registry, {
    mode: "target_fit",
    targetRoleProfileId: "role_sdet_qa_automation_engineer",
  });
  assertCondition(
    targetResponse.recommendationMode === "target_fit",
    "Target-fit recommendations must label the response mode.",
  );
  assertCondition(
    targetResponse.recommendations[0]?.roleProfileId === "role_sdet_qa_automation_engineer",
    "Target-fit mode must return the selected role as the primary recommendation.",
  );
}

async function main() {
  let failed = false;

  const profileCopySafety = shared.evaluateRoleMarketCopySafety(
    shared.roleMarketSeedProfiles.flatMap((profile) =>
      shared.collectRoleMarketProfileCopyBlocks(profile),
    ),
  );

  if (!profileCopySafety.valid) {
    failed = true;
    console.log("FAIL role_market_seed_copy_safety");
    profileCopySafety.findings.forEach((finding) => {
      console.log(`  - ${finding.source}: ${finding.message}`);
    });
  }

  for (const fixture of shared.roleMarketGoldenCandidateFixtures) {
    const response = await generateRoleRecommendations(fixture.input, 3);
    const copySafety = shared.evaluateRoleMarketCopySafety(
      shared.collectRoleRecommendationCopyBlocks(response),
    );
    const result = shared.evaluateRecommendationsAgainstGoldenFixture(
      response.recommendations,
      fixture,
    );
    const rankedRoles = response.recommendations
      .map((recommendation) => `${recommendation.roleProfileId}:${recommendation.fitScore}`)
      .join(", ");
    const status = result.passed && copySafety.valid ? "PASS" : "FAIL";

    console.log(`${status} ${fixture.id}: ${result.score} (${rankedRoles})`);

    if (!result.passed) {
      failed = true;
      result.checks
        .filter((check) => !check.passed)
        .forEach((check) => {
          console.log(`  - ${check.name}: ${check.message}`);
        });
    }

    if (!copySafety.valid) {
      failed = true;
      copySafety.findings.forEach((finding) => {
        console.log(`  - copy-safety ${finding.source}: ${finding.message}`);
      });
    }
  }

  try {
    await validateLiveReadyRecommendationBehavior();
    console.log("PASS live_ready_find_direction_behavior");
  } catch (error) {
    failed = true;
    console.log("FAIL live_ready_find_direction_behavior");
    console.log(`  - ${error instanceof Error ? error.message : error}`);
  }

  if (failed) {
    throw new Error("Role Market recommendation golden validation failed.");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
