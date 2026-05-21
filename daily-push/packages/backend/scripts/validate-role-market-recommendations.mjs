import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const shared = require("../../shared/dist");
const { generateRoleRecommendations } = require("../dist/services/roleMarketRecommendation");

let failed = false;

for (const fixture of shared.roleMarketGoldenCandidateFixtures) {
  const response = generateRoleRecommendations(fixture.input, 3);
  const result = shared.evaluateRecommendationsAgainstGoldenFixture(
    response.recommendations,
    fixture,
  );
  const rankedRoles = response.recommendations
    .map((recommendation) => `${recommendation.roleProfileId}:${recommendation.fitScore}`)
    .join(", ");
  const status = result.passed ? "PASS" : "FAIL";

  console.log(`${status} ${fixture.id}: ${result.score} (${rankedRoles})`);

  if (!result.passed) {
    failed = true;
    result.checks
      .filter((check) => !check.passed)
      .forEach((check) => {
        console.log(`  - ${check.name}: ${check.message}`);
      });
  }
}

if (failed) {
  throw new Error("Role Market recommendation golden validation failed.");
}
