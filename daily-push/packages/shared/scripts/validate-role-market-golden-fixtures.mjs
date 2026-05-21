import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const shared = require("../dist");

function asRecommendationMap(value) {
  if (Array.isArray(value)) {
    return Object.fromEntries(
      value.map((entry) => [entry.fixtureId, entry.recommendations ?? []]),
    );
  }

  if (value && typeof value === "object") {
    return value;
  }

  throw new Error(
    "Recommendation output must be either an object keyed by fixture ID or an array of { fixtureId, recommendations }.",
  );
}

function validateFixturesOnly() {
  shared.assertValidGoldenCandidateFixtures();
  console.log(
    `Validated ${shared.roleMarketGoldenCandidateFixtures.length} role-market golden candidate fixtures.`,
  );
}

function validateRecommendationOutput(filePath) {
  validateFixturesOnly();

  const absolutePath = resolve(process.cwd(), filePath);
  const recommendationMap = asRecommendationMap(
    JSON.parse(readFileSync(absolutePath, "utf8")),
  );

  const results = shared.roleMarketGoldenCandidateFixtures.map((fixture) => {
    const recommendations = recommendationMap[fixture.id];
    if (!Array.isArray(recommendations)) {
      throw new Error(`Missing recommendations array for fixture ${fixture.id}.`);
    }
    return shared.evaluateRecommendationsAgainstGoldenFixture(recommendations, fixture);
  });

  results.forEach((result) => {
    const status = result.passed ? "PASS" : "FAIL";
    console.log(`${status} ${result.fixtureId}: ${result.score}`);
    result.checks.forEach((check) => {
      if (!check.passed) {
        console.log(`  - ${check.name}: ${check.message}`);
      }
    });
  });

  const failed = results.filter((result) => !result.passed);
  if (failed.length > 0) {
    throw new Error(`${failed.length} golden fixture evaluations failed.`);
  }
}

try {
  const outputPath = process.argv[2];
  if (outputPath) {
    validateRecommendationOutput(outputPath);
  } else {
    validateFixturesOnly();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
