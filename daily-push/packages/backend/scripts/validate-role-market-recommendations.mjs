import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const shared = require("../../shared/dist");
const { generateRoleRecommendations } = require("../dist/services/roleMarketRecommendation");

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
  const response = generateRoleRecommendations(fixture.input, 3);
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

if (failed) {
  throw new Error("Role Market recommendation golden validation failed.");
}
