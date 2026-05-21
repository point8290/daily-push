import { randomUUID } from 'crypto';
import {
  assertValidRoleReadinessReport,
  type CandidateEvidenceProfile,
  type ContractMeta,
  type ContractWarning,
  type EvidenceClaim,
  type RequirementCoverage,
  type RequirementPriority,
  type RoleMarketProfile,
  type RoleReadinessReport,
  type RoleReadinessScoreBreakdown,
  type RoleRequirement,
} from '@daily-push/shared';
import { pool } from '../db/postgres';
import { config } from '../config';
import { callClaudeWithUsage, parseJSON } from './claude';
import { getCandidateEvidenceProfile } from './candidateEvidence';
import { recordLlmUsage } from './llmUsage';
import { getRoleMarketProfile } from './roleMarketCatalog';
import { getTargetRole } from './targetRoles';

interface GeneratedReadiness {
  report: RoleReadinessReport;
  evidenceProfile: CandidateEvidenceProfile;
}

interface AssessmentReportRow {
  report: RoleReadinessReport | Record<string, unknown>;
}

interface AiSummaryPatch {
  summary?: string;
  strengths?: string[];
  recommendedNextStep?: string;
}

const STOP_WORDS = new Set([
  'and',
  'are',
  'for',
  'from',
  'have',
  'into',
  'that',
  'the',
  'this',
  'with',
  'work',
  'role',
  'build',
  'using',
  'able',
  'must',
  'need',
  'needs',
  'strong',
  'experience',
  'evidence',
  'systems',
  'system',
]);

function buildMeta(warnings: ContractWarning[] = []): ContractMeta {
  return {
    contractVersion: 'role-market.v1',
    generatedAt: new Date().toISOString(),
    sourceMode: config.roleMarket.sourceMode,
    seedVersion: config.roleMarket.seedVersion,
    warnings,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.round(value), min), max);
}

function uniqueStrings(values: Array<string | null | undefined>, limit = 20): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
    if (result.length >= limit) break;
  }
  return result;
}

function normalizeComparable(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9+#.]+/g, ' ').trim();
}

function tokenize(value: string): string[] {
  return normalizeComparable(value)
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function priorityWeight(priority: RequirementPriority): number {
  if (priority === 'must_have') return 1.4;
  if (priority === 'important') return 1;
  return 0.65;
}

function weightedAverage(
  coverage: RequirementCoverage[],
  filter: (item: RequirementCoverage) => boolean,
): number {
  const items = coverage.filter(filter);
  if (items.length === 0) return 70;
  const totalWeight = items.reduce((sum, item) => sum + priorityWeight(item.priority), 0);
  const weighted = items.reduce(
    (sum, item) => sum + item.score * priorityWeight(item.priority),
    0,
  );
  return clamp(weighted / Math.max(totalWeight, 1), 0, 100);
}

function requirementText(requirement: RoleRequirement): string {
  return [
    requirement.label,
    requirement.description,
    ...requirement.keywords,
    ...requirement.proofExpected,
    ...requirement.interviewSignals,
  ].join(' ');
}

function claimText(claim: EvidenceClaim): string {
  return [
    claim.normalizedClaim,
    claim.projectName,
    claim.companyName,
    claim.metric,
    ...claim.skillLabels,
    ...claim.roleLabels,
    ...claim.evidenceRefs.map((ref) => ref.originalSnippet),
  ].filter(Boolean).join(' ');
}

function scoreClaimForRequirement(requirement: RoleRequirement, claim: EvidenceClaim): number {
  const requirementNormalized = normalizeComparable(requirementText(requirement));
  const claimNormalized = normalizeComparable(claimText(claim));
  const requirementTokens = uniqueStrings([
    ...requirement.keywords.flatMap(tokenize),
    ...tokenize(requirement.label),
  ], 40);
  const claimTokens = new Set(tokenize(claimNormalized));
  const matchedTokens = requirementTokens.filter((token) => claimTokens.has(token));
  const tokenRatio = requirementTokens.length > 0
    ? matchedTokens.length / requirementTokens.length
    : 0;
  const fullKeywordMatches = requirement.keywords.filter((keyword) => {
    const normalized = normalizeComparable(keyword);
    return normalized.length > 2 && claimNormalized.includes(normalized);
  });
  const skillMatches = claim.skillLabels.filter((skill) => {
    const normalized = normalizeComparable(skill);
    return requirementNormalized.includes(normalized) || fullKeywordMatches.some((keyword) =>
      normalizeComparable(keyword).includes(normalized),
    );
  });

  let score = 0;
  if (fullKeywordMatches.length > 0) score += 38;
  if (skillMatches.length > 0) score += 30;
  score += tokenRatio * 35;
  if (claim.metric) score += 6;
  if (
    claim.senioritySignal === 'strong' &&
    ['production', 'system_design', 'business_context', 'communication'].includes(requirement.category)
  ) {
    score += 8;
  }
  if (claim.userVerified) score += 4;

  return clamp(score, 0, 100);
}

function buildSuggestedAction(
  requirement: RoleRequirement,
  status: RequirementCoverage['status'],
): string {
  const proof = requirement.proofExpected[0];
  if (status === 'covered') {
    return `Keep this evidence visible in your resume and interview stories for ${requirement.label}.`;
  }
  if (status === 'weak') {
    return proof
      ? `Strengthen this with clearer proof: ${proof}.`
      : `Add a stronger resume or project example that directly proves ${requirement.label}.`;
  }
  return proof
    ? `Build or document proof for ${requirement.label}: ${proof}.`
    : `Create source-backed evidence that demonstrates ${requirement.label}.`;
}

function buildRequirementCoverage(
  roleProfile: RoleMarketProfile,
  evidenceProfile: CandidateEvidenceProfile,
): RequirementCoverage[] {
  return roleProfile.requirements.map((requirement) => {
    const scoredClaims = evidenceProfile.claims
      .map((claim) => ({
        claim,
        score: scoreClaimForRequirement(requirement, claim),
      }))
      .filter((entry) => entry.score >= 18)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);
    const topScore = scoredClaims[0]?.score ?? 0;
    const supportingBonus = Math.min(scoredClaims.length * 4, 12);
    const score = clamp(topScore + supportingBonus, 0, 100);
    const status: RequirementCoverage['status'] =
      score >= 72 && scoredClaims.length > 0
        ? 'covered'
        : score >= 38 && scoredClaims.length > 0
          ? 'weak'
          : 'missing';

    return {
      requirementId: requirement.id,
      requirementLabel: requirement.label,
      status,
      priority: requirement.priority,
      score,
      matchedEvidenceClaimIds: scoredClaims.map((entry) => entry.claim.id),
      evidenceSnippets: uniqueStrings(
        scoredClaims.flatMap((entry) =>
          entry.claim.evidenceRefs.map((ref) => ref.originalSnippet),
        ),
        3,
      ),
      gapReason:
        status === 'missing'
          ? `No source-backed evidence currently proves ${requirement.label}.`
          : status === 'weak'
            ? `Related evidence exists, but it is not strong enough for ${requirement.label}.`
            : null,
      suggestedAction: buildSuggestedAction(requirement, status),
      confidence: clamp(
        (scoredClaims.reduce((sum, entry) => sum + entry.claim.confidence, 0) /
          Math.max(scoredClaims.length, 1)) || 55,
        status === 'missing' ? 45 : 55,
        92,
      ),
    };
  });
}

function computeSeniorityAlignment(
  roleProfile: RoleMarketProfile,
  evidenceProfile: CandidateEvidenceProfile,
): number {
  const targetIsSenior = roleProfile.seniorityBands.some((band) =>
    band === 'senior' || band === 'staff',
  );
  const years = evidenceProfile.yearsExperience ?? 0;
  const strongClaims = evidenceProfile.claims.filter((claim) => claim.senioritySignal === 'strong').length;
  const someClaims = evidenceProfile.claims.filter((claim) => claim.senioritySignal === 'some').length;

  let score = targetIsSenior ? 35 : 50;
  if (years >= 8) score += targetIsSenior ? 34 : 24;
  else if (years >= 5) score += targetIsSenior ? 26 : 22;
  else if (years >= 3) score += targetIsSenior ? 16 : 20;
  else if (years > 0) score += 8;
  score += Math.min(strongClaims * 5, 25);
  score += Math.min(someClaims * 2, 12);
  return clamp(score, 0, 100);
}

function computeScoreBreakdown(
  roleProfile: RoleMarketProfile,
  evidenceProfile: CandidateEvidenceProfile,
  coverage: RequirementCoverage[],
): RoleReadinessScoreBreakdown {
  const skillCoverage = weightedAverage(coverage, (item) => {
    const requirement = roleProfile.requirements.find((candidate) => candidate.id === item.requirementId);
    return Boolean(requirement && ['skill', 'tool', 'domain'].includes(requirement.category));
  });
  const productionReadiness = weightedAverage(coverage, (item) => {
    const requirement = roleProfile.requirements.find((candidate) => candidate.id === item.requirementId);
    return Boolean(requirement && ['production', 'system_design', 'business_context'].includes(requirement.category));
  });
  const aiRequirements = coverage.filter((item) => {
    const requirement = roleProfile.requirements.find((candidate) => candidate.id === item.requirementId);
    return requirement?.category === 'ai_leverage';
  });
  const aiLeverageReadiness = aiRequirements.length > 0
    ? weightedAverage(coverage, (item) => aiRequirements.some((candidate) => candidate.requirementId === item.requirementId))
    : evidenceProfile.skills.some((skill) => /\b(ai|llm|rag|openai|prompt)\b/i.test(skill))
      ? 72
      : 58;
  const proofCoverage = clamp(
    weightedAverage(coverage, () => true) * 0.72 +
      Math.min(evidenceProfile.claims.filter((claim) => claim.metric).length * 5, 20) +
      Math.min(evidenceProfile.projects.length * 3, 8),
    0,
    100,
  );
  const seniorityAlignment = computeSeniorityAlignment(roleProfile, evidenceProfile);
  const interviewReadiness = clamp(
    weightedAverage(coverage, (item) => item.priority !== 'nice_to_have') * 0.78 +
      Math.min(evidenceProfile.claims.filter((claim) => claim.senioritySignal !== 'none').length * 3, 18),
    0,
    100,
  );
  const requirementCoverage = weightedAverage(coverage, () => true);
  const overall = clamp(
    requirementCoverage * 0.5 +
      skillCoverage * 0.15 +
      proofCoverage * 0.15 +
      seniorityAlignment * 0.1 +
      productionReadiness * 0.06 +
      aiLeverageReadiness * 0.04,
    0,
    100,
  );

  return {
    overall,
    skillCoverage,
    proofCoverage,
    seniorityAlignment,
    productionReadiness,
    interviewReadiness,
    aiLeverageReadiness,
  };
}

function readinessLabel(overall: number): RoleReadinessReport['label'] {
  if (overall >= 82) return 'ready';
  if (overall >= 68) return 'close';
  if (overall >= 45) return 'building';
  return 'early';
}

function readinessVerdict(label: RoleReadinessReport['label']): RoleReadinessReport['verdict'] {
  if (label === 'ready') return 'apply_now';
  if (label === 'close') return 'apply_after_edits';
  return 'upgrade_first';
}

function buildSummary(
  roleProfile: RoleMarketProfile,
  label: RoleReadinessReport['label'],
  score: RoleReadinessScoreBreakdown,
  coverage: RequirementCoverage[],
): string {
  const covered = coverage.filter((item) => item.status === 'covered').length;
  const weakOrMissing = coverage.filter((item) => item.status !== 'covered').length;
  if (label === 'ready') {
    return `Your evidence is strong for ${roleProfile.title}. You have ${covered} covered requirements and should focus on polishing positioning and interview stories.`;
  }
  if (label === 'close') {
    return `You are close for ${roleProfile.title}, with an overall readiness score of ${score.overall}. Fix the highest-priority weak spots before applying broadly.`;
  }
  if (label === 'building') {
    return `You have useful signals for ${roleProfile.title}, but ${weakOrMissing} requirements still need stronger proof before this becomes a confident application path.`;
  }
  return `Your current evidence is still early for ${roleProfile.title}. Start by building proof for the must-have requirements before turning this into applications.`;
}

function buildStrengths(coverage: RequirementCoverage[]): string[] {
  return uniqueStrings(
    coverage
      .filter((item) => item.status === 'covered')
      .sort((a, b) => b.score - a.score)
      .map((item) => `${item.requirementLabel}: ${item.evidenceSnippets[0] ?? 'source-backed evidence found'}`),
    5,
  );
}

function buildCriticalGaps(coverage: RequirementCoverage[]): string[] {
  return uniqueStrings(
    coverage
      .filter((item) => item.status !== 'covered' && item.priority !== 'nice_to_have')
      .sort((a, b) => {
        const priorityDelta = priorityWeight(b.priority) - priorityWeight(a.priority);
        return priorityDelta || a.score - b.score;
      })
      .map((item) => `${item.requirementLabel}: ${item.gapReason ?? item.suggestedAction}`),
    6,
  );
}

function buildMissingProof(roleProfile: RoleMarketProfile, coverage: RequirementCoverage[]): string[] {
  return uniqueStrings(
    coverage
      .filter((item) => item.status !== 'covered')
      .flatMap((item) => {
        const requirement = roleProfile.requirements.find((candidate) => candidate.id === item.requirementId);
        return requirement?.proofExpected.length
          ? requirement.proofExpected.map((proof) => `${item.requirementLabel}: ${proof}`)
          : [item.suggestedAction];
      }),
    6,
  );
}

function buildInterviewRisks(roleProfile: RoleMarketProfile, coverage: RequirementCoverage[]): string[] {
  const riskyRequirementIds = new Set(
    coverage
      .filter((item) => item.status !== 'covered' && item.priority !== 'nice_to_have')
      .map((item) => item.requirementId),
  );
  const risks = roleProfile.requirements
    .filter((requirement) => riskyRequirementIds.has(requirement.id))
    .flatMap((requirement) =>
      requirement.interviewSignals.length > 0
        ? requirement.interviewSignals.map((signal) => `${requirement.label}: ${signal}`)
        : [`${requirement.label}: interviewer may ask for concrete examples.`],
    );
  return uniqueStrings(risks, 6);
}

function buildRecommendedNextStep(
  label: RoleReadinessReport['label'],
  criticalGaps: string[],
): string {
  if (label === 'ready') {
    return 'Start applying selectively and use your strongest evidence in resume bullets and interview stories.';
  }
  if (label === 'close') {
    return 'Update your resume around the weak requirements, then generate company-specific application versions.';
  }
  const topGap = criticalGaps[0]?.split(':')[0];
  return topGap
    ? `Create a focused proof task for ${topGap}, then reassess readiness.`
    : 'Add stronger resume/project evidence, then reassess this Target Role.';
}

function computeConfidence(
  roleProfile: RoleMarketProfile,
  evidenceProfile: CandidateEvidenceProfile,
  coverage: RequirementCoverage[],
): number {
  const evidenceVolume = Math.min(evidenceProfile.claims.length * 3, 24);
  const avgCoverageConfidence =
    coverage.reduce((sum, item) => sum + item.confidence, 0) / Math.max(coverage.length, 1);
  const sourceConfidence = roleProfile.confidence * 100;
  return clamp(sourceConfidence * 0.35 + avgCoverageConfidence * 0.45 + evidenceVolume, 35, 92);
}

async function applyAiSummaryPatch(params: {
  userId: string;
  report: RoleReadinessReport;
  roleProfile: RoleMarketProfile;
  warnings: ContractWarning[];
}): Promise<RoleReadinessReport> {
  try {
    const response = await callClaudeWithUsage({
      system: `You rewrite career readiness diagnostics.
Return compact JSON only. Do not add facts. Use only the provided gaps, strengths, and scores.`,
      userMessage: JSON.stringify({
        roleTitle: params.roleProfile.title,
        score: params.report.score,
        deterministicSummary: params.report.summary,
        strengths: params.report.strengths,
        criticalGaps: params.report.criticalGaps,
        recommendedNextStep: params.report.recommendedNextStep,
        requestedJson: {
          summary: '1-2 sentence user-facing summary',
          strengths: ['up to 4 concise strengths from provided strengths only'],
          recommendedNextStep: 'one concrete next action',
        },
      }),
      useCache: true,
    });
    await recordLlmUsage({
      userId: params.userId,
      featureKey: 'role_readiness_reports.monthly',
      operationKey: 'role_readiness_ai_summary',
      usage: response.usage,
      metadata: { targetRoleId: params.report.targetRoleId },
    }).catch(() => {});
    const patch = parseJSON<AiSummaryPatch>(response.text);
    return {
      ...params.report,
      summary: typeof patch.summary === 'string' && patch.summary.trim()
        ? patch.summary.trim()
        : params.report.summary,
      strengths: Array.isArray(patch.strengths) && patch.strengths.length > 0
        ? uniqueStrings(patch.strengths, 4)
        : params.report.strengths,
      recommendedNextStep:
        typeof patch.recommendedNextStep === 'string' && patch.recommendedNextStep.trim()
          ? patch.recommendedNextStep.trim()
          : params.report.recommendedNextStep,
    };
  } catch {
    params.warnings.push({
      code: 'ai_summary_unavailable',
      message: 'AI summary was unavailable, so this report uses the deterministic readiness summary.',
    });
    return params.report;
  }
}

export async function buildRoleReadinessReport(
  userId: string,
  targetRoleId: string,
  options: { includeAiSummary?: boolean } = {},
): Promise<GeneratedReadiness> {
  const targetRole = await getTargetRole(userId, targetRoleId);
  if (!targetRole) {
    const error = new Error('Target Role not found');
    (error as Error & { statusCode?: number; code?: string }).statusCode = 404;
    (error as Error & { statusCode?: number; code?: string }).code = 'not_found';
    throw error;
  }

  const roleProfile = getRoleMarketProfile(targetRole.roleProfileId);
  const evidenceProfile = await getCandidateEvidenceProfile(userId);
  const warnings: ContractWarning[] = [...evidenceProfile.meta.warnings];
  if (evidenceProfile.claims.length < 4) {
    warnings.push({
      code: 'partial_input',
      message: 'Readiness is based on limited evidence. Add a richer resume or profile for a stronger report.',
    });
  }

  const coverage = buildRequirementCoverage(roleProfile, evidenceProfile);
  const score = computeScoreBreakdown(roleProfile, evidenceProfile, coverage);
  const label = readinessLabel(score.overall);
  const verdict = readinessVerdict(label);
  const criticalGaps = buildCriticalGaps(coverage);
  const missingProof = buildMissingProof(roleProfile, coverage);
  const interviewRisks = buildInterviewRisks(roleProfile, coverage);
  let report: RoleReadinessReport = {
    id: randomUUID(),
    userId,
    targetRoleId: targetRole.id,
    roleProfileId: roleProfile.id,
    verdict,
    label,
    summary: buildSummary(roleProfile, label, score, coverage),
    score,
    coverage,
    strengths: buildStrengths(coverage),
    criticalGaps,
    missingProof,
    interviewRisks,
    recommendedNextStep: buildRecommendedNextStep(label, criticalGaps),
    sourceRefs: uniqueStrings(roleProfile.sourceRefs.map((source) => source.id), 20),
    generatedAt: new Date().toISOString(),
    confidence: computeConfidence(roleProfile, evidenceProfile, coverage),
    meta: buildMeta(warnings),
  };

  if (options.includeAiSummary && config.roleMarket.featureAiSummary) {
    report = await applyAiSummaryPatch({
      userId,
      report,
      roleProfile,
      warnings,
    });
    report.meta = buildMeta(warnings);
  }

  assertValidRoleReadinessReport(report);
  return { report, evidenceProfile };
}

export async function persistRoleReadinessReport(
  userId: string,
  targetRoleId: string,
  generated: GeneratedReadiness,
): Promise<RoleReadinessReport> {
  const { report, evidenceProfile } = generated;
  assertValidRoleReadinessReport(report);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO candidate_role_assessments
         (id,
          user_id,
          target_role_id,
          role_profile_id,
          evidence_profile,
          report,
          readiness_label,
          verdict,
          overall_score,
          confidence,
          generated_by,
          metadata)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9, $10, 'deterministic_v1', $11::jsonb)`,
      [
        report.id,
        userId,
        targetRoleId,
        report.roleProfileId,
        JSON.stringify(evidenceProfile),
        JSON.stringify(report),
        report.label,
        report.verdict,
        report.score.overall,
        report.confidence,
        JSON.stringify({ warningCodes: report.meta.warnings.map((warning) => warning.code) }),
      ],
    );
    await client.query(
      `INSERT INTO candidate_readiness_history
         (user_id,
          target_role_id,
          assessment_id,
          overall_score,
          readiness_label,
          verdict,
          score_breakdown)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [
        userId,
        targetRoleId,
        report.id,
        report.score.overall,
        report.label,
        report.verdict,
        JSON.stringify(report.score),
      ],
    );
    await client.query(
      `UPDATE candidate_target_roles
          SET latest_assessment_id = $3,
              status = CASE WHEN status = 'saved' THEN 'assessed' ELSE status END,
              updated_at = NOW()
        WHERE user_id = $1
          AND id = $2`,
      [userId, targetRoleId, report.id],
    );
    await client.query('COMMIT');
    return report;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getLatestRoleReadinessReport(
  userId: string,
  targetRoleId: string,
): Promise<RoleReadinessReport | null> {
  const targetRole = await getTargetRole(userId, targetRoleId);
  if (!targetRole) {
    const error = new Error('Target Role not found');
    (error as Error & { statusCode?: number; code?: string }).statusCode = 404;
    (error as Error & { statusCode?: number; code?: string }).code = 'not_found';
    throw error;
  }

  const { rows } = await pool.query<AssessmentReportRow>(
    `SELECT report
       FROM candidate_role_assessments
      WHERE user_id = $1
        AND target_role_id = $2
      ORDER BY created_at DESC
      LIMIT 1`,
    [userId, targetRoleId],
  );

  if (!rows[0]?.report) return null;
  assertValidRoleReadinessReport(rows[0].report);
  return rows[0].report;
}

export async function getRoleReadinessReportById(
  userId: string,
  targetRoleId: string,
  readinessReportId: string,
): Promise<RoleReadinessReport | null> {
  const targetRole = await getTargetRole(userId, targetRoleId);
  if (!targetRole) {
    const error = new Error('Target Role not found');
    (error as Error & { statusCode?: number; code?: string }).statusCode = 404;
    (error as Error & { statusCode?: number; code?: string }).code = 'not_found';
    throw error;
  }

  const { rows } = await pool.query<AssessmentReportRow>(
    `SELECT report
       FROM candidate_role_assessments
      WHERE user_id = $1
        AND target_role_id = $2
        AND id = $3
      LIMIT 1`,
    [userId, targetRoleId, readinessReportId],
  );

  if (!rows[0]?.report) return null;
  assertValidRoleReadinessReport(rows[0].report);
  return rows[0].report;
}
