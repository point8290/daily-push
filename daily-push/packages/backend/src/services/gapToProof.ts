import { createHash } from 'crypto';
import {
  assertValidGapToProofResponse,
  type ContractMeta,
  type ContractWarning,
  type GapToProofResponse,
  type ProofRecommendation,
  type ProofTaskType,
  type RequirementCategory,
  type RequirementCoverage,
  type RoleMarketProfile,
  type RoleReadinessReport,
  type RoleRequirement,
} from '@daily-push/shared';
import { config } from '../config';
import { getRoleMarketProfile } from './roleMarketCatalog';
import {
  getLatestRoleReadinessReport,
  getRoleReadinessReportById,
} from './roleReadiness';

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

function stableId(prefix: string, parts: string[]): string {
  const digest = createHash('sha1')
    .update(parts.join('|'))
    .digest('hex')
    .slice(0, 18);
  return `${prefix}_${digest}`;
}

function uniqueStrings(values: Array<string | null | undefined>, limit = 8): string[] {
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

function priorityRank(item: RequirementCoverage): number {
  const priorityScore =
    item.priority === 'must_have' ? 3 : item.priority === 'important' ? 2 : 1;
  const statusScore =
    item.status === 'missing' ? 3 : item.status === 'weak' ? 2 : 1;
  return priorityScore * 100 + statusScore * 20 + (100 - item.score);
}

function taskTypeForRequirement(
  requirement: RoleRequirement | null,
  coverage: RequirementCoverage,
): ProofTaskType {
  if (coverage.status === 'weak' && coverage.evidenceSnippets.length > 0) {
    return 'resume_rewrite';
  }

  const category = requirement?.category;
  if (category === 'system_design' || category === 'business_context') {
    return 'case_study';
  }
  if (category === 'production' || category === 'ai_leverage') {
    return 'project';
  }
  if (category === 'communication') {
    return 'interview_story';
  }
  if (category === 'domain') {
    return 'portfolio_artifact';
  }
  if (coverage.status === 'missing' && (category === 'skill' || category === 'tool')) {
    return 'project';
  }
  return 'learning_module';
}

function estimateHours(
  type: ProofTaskType,
  coverage: RequirementCoverage,
): { estimatedHours: number; difficulty: ProofRecommendation['difficulty'] } {
  const baseByType: Record<ProofTaskType, number> = {
    project: 14,
    case_study: 7,
    resume_rewrite: 3,
    interview_story: 4,
    learning_module: 6,
    portfolio_artifact: 8,
  };
  const priorityBoost = coverage.priority === 'must_have' ? 4 : coverage.priority === 'important' ? 2 : 0;
  const statusBoost = coverage.status === 'missing' ? 4 : coverage.status === 'weak' ? 2 : 0;
  const estimatedHours = clamp(baseByType[type] + priorityBoost + statusBoost, 2, 28);
  const difficulty =
    estimatedHours >= 14 ? 'large' : estimatedHours >= 7 ? 'medium' : 'small';
  return { estimatedHours, difficulty };
}

function titleForTask(
  type: ProofTaskType,
  requirementLabel: string,
): string {
  if (type === 'project') return `Build proof for ${requirementLabel}`;
  if (type === 'case_study') return `Write a case study for ${requirementLabel}`;
  if (type === 'resume_rewrite') return `Rewrite resume evidence for ${requirementLabel}`;
  if (type === 'interview_story') return `Prepare an interview story for ${requirementLabel}`;
  if (type === 'portfolio_artifact') return `Create a portfolio artifact for ${requirementLabel}`;
  return `Close the learning gap for ${requirementLabel}`;
}

function expectedOutputForTask(
  type: ProofTaskType,
  requirement: RoleRequirement | null,
  coverage: RequirementCoverage,
): string {
  const proof = requirement?.proofExpected[0];
  if (type === 'project') {
    return proof
      ? `A small shipped project or documented feature that proves: ${proof}`
      : `A small shipped project that demonstrates ${coverage.requirementLabel}.`;
  }
  if (type === 'case_study') {
    return `A one-page case study explaining the problem, design choices, trade-offs, result, and what you would improve.`;
  }
  if (type === 'resume_rewrite') {
    return `Two stronger resume bullets that connect existing evidence to ${coverage.requirementLabel}.`;
  }
  if (type === 'interview_story') {
    return `A STAR-style story with situation, action, trade-off, result, and follow-up lessons.`;
  }
  if (type === 'portfolio_artifact') {
    return `A concise artifact, diagram, README, or walkthrough that makes your ${coverage.requirementLabel} proof inspectable.`;
  }
  return `A focused learning note plus one applied exercise that proves you can use ${coverage.requirementLabel}.`;
}

function acceptanceCriteriaForTask(
  type: ProofTaskType,
  requirement: RoleRequirement | null,
  coverage: RequirementCoverage,
): string[] {
  const criteria: string[] = [];
  if (type === 'project') {
    criteria.push('A working demo, repository, or recorded walkthrough exists.');
    criteria.push(`The README explains how the work proves ${coverage.requirementLabel}.`);
    criteria.push('At least one implementation trade-off and one limitation are documented.');
  } else if (type === 'case_study') {
    criteria.push('The case study names the original problem and constraints.');
    criteria.push('It includes architecture, trade-offs, outcome, and what you would improve next.');
    criteria.push('It can be explained verbally in under three minutes.');
  } else if (type === 'resume_rewrite') {
    criteria.push('The new bullet starts with a strong action verb and names the business or engineering outcome.');
    criteria.push('The bullet only uses source-backed evidence from the candidate profile.');
    criteria.push('The bullet includes a metric, scale signal, or concrete system detail where possible.');
  } else if (type === 'interview_story') {
    criteria.push('The story includes situation, action, result, and trade-off.');
    criteria.push('It directly answers a likely interview signal for this requirement.');
    criteria.push('It includes one follow-up lesson or improvement.');
  } else if (type === 'portfolio_artifact') {
    criteria.push('The artifact is visible as a README, diagram, write-up, or short walkthrough.');
    criteria.push('It explicitly maps to the target role requirement.');
    criteria.push('It includes enough context for a recruiter or interviewer to evaluate it quickly.');
  } else {
    criteria.push('The learning note explains the concept in your own words.');
    criteria.push('A small applied exercise demonstrates practical usage.');
    criteria.push('You can answer two interview-style questions about the topic.');
  }

  const expectedProof = requirement?.proofExpected[0];
  if (expectedProof) {
    criteria.push(`It satisfies this proof expectation: ${expectedProof}.`);
  }
  return uniqueStrings(criteria, 5);
}

function whyItMatters(
  roleProfile: RoleMarketProfile,
  requirement: RoleRequirement | null,
  coverage: RequirementCoverage,
): string {
  const priority = coverage.priority === 'must_have'
    ? 'must-have'
    : coverage.priority === 'important'
      ? 'important'
      : 'nice-to-have';
  const interviewSignal = requirement?.interviewSignals[0];
  return interviewSignal
    ? `${coverage.requirementLabel} is a ${priority} signal for ${roleProfile.title}; interviewers may look for ${interviewSignal.toLowerCase()}.`
    : `${coverage.requirementLabel} is a ${priority} signal for ${roleProfile.title}, and this task turns the gap into inspectable proof.`;
}

function buildRecommendation(
  roleProfile: RoleMarketProfile,
  report: RoleReadinessReport,
  coverage: RequirementCoverage,
): ProofRecommendation {
  const requirement =
    roleProfile.requirements.find((candidate) => candidate.id === coverage.requirementId) ??
    null;
  const type = taskTypeForRequirement(requirement, coverage);
  const { estimatedHours, difficulty } = estimateHours(type, coverage);
  return {
    id: stableId('proof', [
      report.id,
      coverage.requirementId,
      type,
      coverage.status,
    ]),
    type,
    title: titleForTask(type, coverage.requirementLabel),
    gapAddressed: coverage.gapReason ?? coverage.suggestedAction,
    whyItMatters: whyItMatters(roleProfile, requirement, coverage),
    expectedOutput: expectedOutputForTask(type, requirement, coverage),
    acceptanceCriteria: acceptanceCriteriaForTask(type, requirement, coverage),
    estimatedHours,
    difficulty,
    linkedRequirementIds: [coverage.requirementId],
  };
}

function addSupportTasks(
  roleProfile: RoleMarketProfile,
  report: RoleReadinessReport,
  recommendations: ProofRecommendation[],
  maxItems: number,
): ProofRecommendation[] {
  const existingRequirementIds = new Set(
    recommendations.flatMap((item) => item.linkedRequirementIds),
  );
  const weakCoverage = report.coverage.filter((item) =>
    item.status !== 'covered' && !existingRequirementIds.has(item.requirementId),
  );

  const resumeRewrite = weakCoverage.find((item) => item.evidenceSnippets.length > 0);
  if (resumeRewrite && recommendations.length < maxItems) {
    const requirement = roleProfile.requirements.find((item) => item.id === resumeRewrite.requirementId) ?? null;
    recommendations.push({
      ...buildRecommendation(roleProfile, report, resumeRewrite),
      id: stableId('proof', [report.id, resumeRewrite.requirementId, 'resume_rewrite_support']),
      type: 'resume_rewrite',
      title: `Clarify existing proof for ${resumeRewrite.requirementLabel}`,
      expectedOutput: `A before/after resume bullet rewrite that makes the existing proof easier for recruiters to recognize.`,
      acceptanceCriteria: acceptanceCriteriaForTask('resume_rewrite', requirement, resumeRewrite),
      estimatedHours: 3,
      difficulty: 'small',
    });
  }

  const interviewRisk = report.interviewRisks[0];
  if (interviewRisk && recommendations.length < maxItems) {
    const linkedRequirement =
      weakCoverage[0] ??
      report.coverage.find((item) => item.status !== 'covered') ??
      report.coverage[0];
    recommendations.push({
      id: stableId('proof', [report.id, 'interview_story', interviewRisk]),
      type: 'interview_story',
      title: 'Prepare your highest-risk interview story',
      gapAddressed: interviewRisk,
      whyItMatters: `This risk is likely to appear in interviews for ${roleProfile.title}; a prepared story reduces ambiguity.`,
      expectedOutput: 'A concise STAR story with the key technical decision, trade-off, result, and lesson learned.',
      acceptanceCriteria: [
        'The story can be delivered in two minutes.',
        'It includes a concrete trade-off or debugging decision.',
        'It ends with the measurable outcome or lesson learned.',
      ],
      estimatedHours: 4,
      difficulty: 'small',
      linkedRequirementIds: linkedRequirement ? [linkedRequirement.requirementId] : [],
    });
  }

  return recommendations;
}

export async function buildGapToProofRecommendations(params: {
  userId: string;
  targetRoleId: string;
  readinessReportId?: string | null;
  maxItems?: number;
}): Promise<GapToProofResponse> {
  const maxItems = clamp(params.maxItems ?? 5, 1, 8);
  const report = params.readinessReportId
    ? await getRoleReadinessReportById(
      params.userId,
      params.targetRoleId,
      params.readinessReportId,
    )
    : await getLatestRoleReadinessReport(params.userId, params.targetRoleId);

  if (!report) {
    const error = new Error('Generate a readiness report before creating proof recommendations.');
    (error as Error & { statusCode?: number; code?: string }).statusCode = 404;
    (error as Error & { statusCode?: number; code?: string }).code = 'not_found';
    throw error;
  }

  const roleProfile = getRoleMarketProfile(report.roleProfileId);
  const warnings: ContractWarning[] = [...report.meta.warnings];
  const prioritizedCoverage = report.coverage
    .filter((item) => item.status === 'missing' || item.status === 'weak')
    .sort((a, b) => priorityRank(b) - priorityRank(a));

  let proofRecommendations = prioritizedCoverage
    .slice(0, maxItems)
    .map((coverage) => buildRecommendation(roleProfile, report, coverage));
  proofRecommendations = addSupportTasks(roleProfile, report, proofRecommendations, maxItems)
    .slice(0, maxItems);

  if (proofRecommendations.length === 0) {
    warnings.push({
      code: 'partial_input',
      message: 'No weak or missing requirements were found, so proof recommendations are limited.',
    });
    const firstRequirement = roleProfile.requirements[0];
    if (firstRequirement) {
      const coverage = report.coverage.find((item) => item.requirementId === firstRequirement.id);
      proofRecommendations.push({
        id: stableId('proof', [report.id, firstRequirement.id, 'portfolio_artifact']),
        type: 'portfolio_artifact',
        title: `Package your strongest ${firstRequirement.label} proof`,
        gapAddressed: 'Make existing readiness easier for recruiters and interviewers to verify.',
        whyItMatters: `Strong candidates still need inspectable proof for ${roleProfile.title}.`,
        expectedOutput: 'A concise portfolio artifact or case-study README that packages your strongest evidence.',
        acceptanceCriteria: [
          'The artifact links to a project, write-up, or walkthrough.',
          'It explains the role requirement it supports.',
          'It can be scanned in under two minutes.',
        ],
        estimatedHours: 5,
        difficulty: 'small',
        linkedRequirementIds: coverage ? [coverage.requirementId] : [firstRequirement.id],
      });
    }
  }

  const response: GapToProofResponse = {
    targetRoleId: params.targetRoleId,
    readinessReportId: report.id,
    proofRecommendations,
    meta: buildMeta(warnings),
  };
  assertValidGapToProofResponse(response);
  return response;
}

