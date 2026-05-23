import type {
  RoleMarketProfile,
  RoleRecommendationResponse,
} from "./roleMarketContracts";

export interface RoleMarketCopyBlock {
  source: string;
  text: string;
  requiresSignalLanguage?: boolean;
}

export interface RoleMarketCopySafetyFinding {
  source: string;
  rule: string;
  phrase?: string;
  message: string;
  snippet: string;
}

export interface RoleMarketCopySafetyResult {
  valid: boolean;
  findings: RoleMarketCopySafetyFinding[];
}

export const ROLE_MARKET_BANNED_CERTAINTY_PHRASES = [
  "guaranteed",
  "guarantee",
  "certain to",
  "will get hired",
  "future-proof",
  "future proof",
  "recession-proof",
  "cannot be automated",
  "will not be impacted",
  "safe forever",
  "predicted winner",
  "winning role",
];

const bannedCertaintyPatterns = ROLE_MARKET_BANNED_CERTAINTY_PHRASES.map((phrase) => ({
  phrase,
  pattern: new RegExp(`\\b${escapeRegExp(phrase).replace(/[-\\ ]/g, "[-\\s]?")}\\b`, "i"),
}));

const signalLanguagePattern =
  /\b(signal|signals|suggest|suggests|directional|varies|confidence|source-backed|source backed|market profile|current market|role profile)\b/i;

const requiredCaveatPattern = /\b(direction|directional|signal|signals|not a promise|varies|validate)\b/i;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function snippetFor(text: string, index: number): string {
  const start = Math.max(0, index - 70);
  const end = Math.min(text.length, index + 90);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

function addTextBlock(
  blocks: RoleMarketCopyBlock[],
  source: string,
  text: unknown,
  requiresSignalLanguage = false,
) {
  if (typeof text !== "string") return;
  const trimmed = text.trim();
  if (!trimmed) return;
  blocks.push({ source, text: trimmed, requiresSignalLanguage });
}

export function evaluateRoleMarketCopySafety(
  blocks: RoleMarketCopyBlock[],
): RoleMarketCopySafetyResult {
  const findings: RoleMarketCopySafetyFinding[] = [];

  for (const block of blocks) {
    for (const { phrase, pattern } of bannedCertaintyPatterns) {
      const match = block.text.match(pattern);
      if (!match || match.index === undefined) continue;
      findings.push({
        source: block.source,
        rule: "no_false_certainty",
        phrase,
        message: `Avoid "${phrase}" in market-facing copy. Use signal language instead.`,
        snippet: snippetFor(block.text, match.index),
      });
    }

    if (block.requiresSignalLanguage && !signalLanguagePattern.test(block.text)) {
      findings.push({
        source: block.source,
        rule: "signal_language_required",
        message:
          "Market claims should use signal/confidence language instead of sounding like predictions.",
        snippet: snippetFor(block.text, 0),
      });
    }
  }

  return {
    valid: findings.length === 0,
    findings,
  };
}

export function collectRoleMarketProfileCopyBlocks(
  profile: RoleMarketProfile,
): RoleMarketCopyBlock[] {
  const blocks: RoleMarketCopyBlock[] = [];

  addTextBlock(blocks, `${profile.id}.shortDescription`, profile.shortDescription);
  addTextBlock(blocks, `${profile.id}.marketSummary`, profile.marketSummary, true);

  profile.requirements.forEach((requirement) => {
    addTextBlock(blocks, `${profile.id}.${requirement.id}.description`, requirement.description);
    requirement.proofExpected.forEach((item, index) => {
      addTextBlock(blocks, `${profile.id}.${requirement.id}.proofExpected[${index}]`, item);
    });
    requirement.interviewSignals.forEach((item, index) => {
      addTextBlock(blocks, `${profile.id}.${requirement.id}.interviewSignals[${index}]`, item);
    });
  });

  profile.trendSignals.forEach((signal) => {
    addTextBlock(blocks, `${profile.id}.${signal.id}.label`, signal.label);
    addTextBlock(blocks, `${profile.id}.${signal.id}.summary`, signal.summary, true);
  });

  profile.transitionPaths.forEach((path, pathIndex) => {
    path.likelyGaps.forEach((item, index) => {
      addTextBlock(blocks, `${profile.id}.transitionPaths[${pathIndex}].likelyGaps[${index}]`, item);
    });
    path.recommendedProof.forEach((item, index) => {
      addTextBlock(blocks, `${profile.id}.transitionPaths[${pathIndex}].recommendedProof[${index}]`, item);
    });
  });

  profile.interviewTopics.forEach((item, index) => {
    addTextBlock(blocks, `${profile.id}.interviewTopics[${index}]`, item);
  });
  profile.proofExpectations.forEach((item, index) => {
    addTextBlock(blocks, `${profile.id}.proofExpectations[${index}]`, item);
  });

  return blocks;
}

export function collectRoleRecommendationCopyBlocks(
  response: RoleRecommendationResponse,
): RoleMarketCopyBlock[] {
  const blocks: RoleMarketCopyBlock[] = [];

  addTextBlock(blocks, "recommendations.marketCaveat", response.marketCaveat, true);
  if (!requiredCaveatPattern.test(response.marketCaveat)) {
    blocks.push({
      source: "recommendations.marketCaveat",
      text: "Market caveat is missing directional/validation language.",
      requiresSignalLanguage: true,
    });
  }

  response.recommendations.forEach((recommendation, recIndex) => {
    recommendation.fitReasons.forEach((item, index) => {
      addTextBlock(blocks, `recommendations[${recIndex}].fitReasons[${index}]`, item);
    });
    recommendation.likelyGaps.forEach((item, index) => {
      addTextBlock(blocks, `recommendations[${recIndex}].likelyGaps[${index}]`, item);
    });
    recommendation.proofToBuild.forEach((item, index) => {
      addTextBlock(blocks, `recommendations[${recIndex}].proofToBuild[${index}]`, item);
    });
    recommendation.whyNow.forEach((item, index) => {
      addTextBlock(blocks, `recommendations[${recIndex}].whyNow[${index}]`, item, true);
    });
  });

  return blocks;
}

export function assertRoleMarketCopySafety(
  blocks: RoleMarketCopyBlock[],
): void {
  const result = evaluateRoleMarketCopySafety(blocks);
  if (result.valid) return;

  const details = result.findings
    .map((finding) => `${finding.source}: ${finding.message} (${finding.snippet})`)
    .join("; ");
  throw new Error(`Role Market copy safety failed: ${details}`);
}
