import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const shared = require("../dist");

const profileBlocks = shared.roleMarketSeedProfiles.flatMap((profile) =>
  shared.collectRoleMarketProfileCopyBlocks(profile),
);
const fixtureBlocks = shared.collectRoleRecommendationCopyBlocks(
  shared.roleRecommendationResponseFixture,
);

const result = shared.evaluateRoleMarketCopySafety([
  ...profileBlocks,
  ...fixtureBlocks,
]);

if (!result.valid) {
  console.error("Role Market copy safety failed:");
  result.findings.forEach((finding) => {
    console.error(`  - ${finding.source}: ${finding.message}`);
    console.error(`    ${finding.snippet}`);
  });
  process.exitCode = 1;
} else {
  console.log(
    `Validated ${profileBlocks.length + fixtureBlocks.length} Role Market copy blocks.`,
  );
}
