import type {
  CandidateRoleInput,
  CandidateEvidenceProfile,
  EvidenceClaim,
  EvidenceRef,
  CreateGoalFromTargetRoleResponse,
  CreateUpgradePlanResponse,
  GenerateReadinessResponse,
  GapToProofResponse,
  StartTargetRoleDecompositionResponse,
  StartUpgradePlanSprintResponse,
  ContractMeta,
  ListRolesResponse,
  ProofEvidenceStatusResponse,
  ProofRecommendation,
  PublishProofEvidenceResponse,
  RequirementCoverage,
  UpgradePlan,
  UpgradePlanTopic,
  RoleReadinessReport,
  RoleMarketCard,
  RoleMarketProfile,
  RoleRecommendation,
  RoleRecommendationResponse,
  SourceReference,
  TargetRoleDecompositionStatusResponse,
  TargetRoleDecompositionTopic,
} from "./roleMarketContracts";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function pushIfInvalid(errors: string[], condition: boolean, message: string): void {
  if (!condition) errors.push(message);
}

export function validateContractMeta(value: unknown, path = "meta"): ValidationResult {
  const errors: string[] = [];
  if (!isObject(value)) {
    return { valid: false, errors: [`${path} must be an object`] };
  }

  pushIfInvalid(
    errors,
    value.contractVersion === "role-market.v1",
    `${path}.contractVersion must be role-market.v1`,
  );
  pushIfInvalid(errors, isString(value.generatedAt), `${path}.generatedAt is required`);
  pushIfInvalid(
    errors,
    value.sourceMode === "curated" || value.sourceMode === "hybrid" || value.sourceMode === "live",
    `${path}.sourceMode must be curated, hybrid, or live`,
  );
  pushIfInvalid(errors, isString(value.seedVersion), `${path}.seedVersion is required`);
  pushIfInvalid(errors, Array.isArray(value.warnings), `${path}.warnings must be an array`);

  return { valid: errors.length === 0, errors };
}

export function validateSourceReference(value: unknown, path = "sourceRef"): ValidationResult {
  const errors: string[] = [];
  if (!isObject(value)) {
    return { valid: false, errors: [`${path} must be an object`] };
  }

  pushIfInvalid(errors, isString(value.id), `${path}.id is required`);
  pushIfInvalid(errors, isString(value.title), `${path}.title is required`);
  pushIfInvalid(errors, isNullableString(value.url), `${path}.url must be string or null`);
  pushIfInvalid(
    errors,
    isNullableString(value.publisher),
    `${path}.publisher must be string or null`,
  );
  pushIfInvalid(errors, isString(value.sourceType), `${path}.sourceType is required`);
  pushIfInvalid(errors, isNullableString(value.region), `${path}.region must be string or null`);
  pushIfInvalid(
    errors,
    isNullableString(value.publishedAt),
    `${path}.publishedAt must be string or null`,
  );
  pushIfInvalid(errors, isString(value.capturedAt), `${path}.capturedAt is required`);
  pushIfInvalid(errors, isNumber(value.confidence), `${path}.confidence must be a number`);

  return { valid: errors.length === 0, errors };
}

export function validateCandidateRoleInput(
  value: unknown,
  path = "input",
): ValidationResult {
  const errors: string[] = [];
  if (!isObject(value)) {
    return { valid: false, errors: [`${path} must be an object`] };
  }

  pushIfInvalid(
    errors,
    isNullableString(value.currentRole),
    `${path}.currentRole must be string or null`,
  );
  pushIfInvalid(
    errors,
    value.yearsExperience === null || isNumber(value.yearsExperience),
    `${path}.yearsExperience must be number or null`,
  );
  pushIfInvalid(errors, isNullableString(value.region), `${path}.region must be string or null`);
  pushIfInvalid(errors, isStringArray(value.skills), `${path}.skills must be a string array`);
  pushIfInvalid(
    errors,
    isStringArray(value.strongestAreas),
    `${path}.strongestAreas must be a string array`,
  );
  pushIfInvalid(
    errors,
    isStringArray(value.preferredDirections),
    `${path}.preferredDirections must be a string array`,
  );
  pushIfInvalid(
    errors,
    isStringArray(value.avoidedDirections),
    `${path}.avoidedDirections must be a string array`,
  );
  pushIfInvalid(
    errors,
    isStringArray(value.workStyle),
    `${path}.workStyle must be a string array`,
  );
  pushIfInvalid(
    errors,
    value.targetSeniority === null || typeof value.targetSeniority === "string",
    `${path}.targetSeniority must be string or null`,
  );
  pushIfInvalid(
    errors,
    isNullableString(value.freeTextContext),
    `${path}.freeTextContext must be string or null`,
  );

  return { valid: errors.length === 0, errors };
}

export function validateRoleMarketProfile(
  value: unknown,
  path = "roleProfile",
): ValidationResult {
  const errors: string[] = [];
  if (!isObject(value)) {
    return { valid: false, errors: [`${path} must be an object`] };
  }

  pushIfInvalid(errors, isString(value.id), `${path}.id is required`);
  pushIfInvalid(errors, isString(value.slug), `${path}.slug is required`);
  pushIfInvalid(errors, isString(value.title), `${path}.title is required`);
  pushIfInvalid(errors, isString(value.category), `${path}.category is required`);
  pushIfInvalid(errors, isString(value.roleType), `${path}.roleType is required`);
  pushIfInvalid(errors, isString(value.aiImpact), `${path}.aiImpact is required`);
  pushIfInvalid(
    errors,
    isString(value.shortDescription),
    `${path}.shortDescription is required`,
  );
  pushIfInvalid(errors, isString(value.marketSummary), `${path}.marketSummary is required`);
  pushIfInvalid(
    errors,
    Array.isArray(value.requirements) && value.requirements.length > 0,
    `${path}.requirements must be a non-empty array`,
  );
  pushIfInvalid(
    errors,
    Array.isArray(value.trendSignals),
    `${path}.trendSignals must be an array`,
  );
  pushIfInvalid(
    errors,
    Array.isArray(value.transitionPaths),
    `${path}.transitionPaths must be an array`,
  );
  pushIfInvalid(
    errors,
    isStringArray(value.interviewTopics),
    `${path}.interviewTopics must be a string array`,
  );
  pushIfInvalid(
    errors,
    isStringArray(value.proofExpectations),
    `${path}.proofExpectations must be a string array`,
  );
  pushIfInvalid(
    errors,
    Array.isArray(value.sourceRefs) && value.sourceRefs.length > 0,
    `${path}.sourceRefs must be a non-empty array`,
  );
  pushIfInvalid(errors, isString(value.lastUpdated), `${path}.lastUpdated is required`);
  pushIfInvalid(errors, isNumber(value.confidence), `${path}.confidence must be a number`);

  const metaResult = validateContractMeta(value.meta, `${path}.meta`);
  errors.push(...metaResult.errors);

  if (Array.isArray(value.sourceRefs)) {
    value.sourceRefs.forEach((sourceRef, index) => {
      errors.push(...validateSourceReference(sourceRef, `${path}.sourceRefs[${index}]`).errors);
    });
  }

  return { valid: errors.length === 0, errors };
}

export function validateRoleMarketCard(value: unknown, path = "role"): ValidationResult {
  const errors: string[] = [];
  if (!isObject(value)) {
    return { valid: false, errors: [`${path} must be an object`] };
  }

  pushIfInvalid(errors, isString(value.id), `${path}.id is required`);
  pushIfInvalid(errors, isString(value.slug), `${path}.slug is required`);
  pushIfInvalid(errors, isString(value.title), `${path}.title is required`);
  pushIfInvalid(errors, isString(value.category), `${path}.category is required`);
  pushIfInvalid(errors, isString(value.roleType), `${path}.roleType is required`);
  pushIfInvalid(errors, isString(value.aiImpact), `${path}.aiImpact is required`);
  pushIfInvalid(
    errors,
    isString(value.shortDescription),
    `${path}.shortDescription is required`,
  );
  pushIfInvalid(
    errors,
    isStringArray(value.topRequirements),
    `${path}.topRequirements must be a string array`,
  );
  pushIfInvalid(errors, isString(value.lastUpdated), `${path}.lastUpdated is required`);
  pushIfInvalid(errors, isNumber(value.confidence), `${path}.confidence must be a number`);

  return { valid: errors.length === 0, errors };
}

export function validateListRolesResponse(
  value: unknown,
  path = "listRolesResponse",
): ValidationResult {
  const errors: string[] = [];
  if (!isObject(value)) {
    return { valid: false, errors: [`${path} must be an object`] };
  }

  pushIfInvalid(errors, Array.isArray(value.roles), `${path}.roles must be an array`);
  if (Array.isArray(value.roles)) {
    value.roles.forEach((role, index) => {
      errors.push(...validateRoleMarketCard(role, `${path}.roles[${index}]`).errors);
    });
  }

  errors.push(...validateContractMeta(value.meta, `${path}.meta`).errors);

  return { valid: errors.length === 0, errors };
}

export function validateRoleRecommendation(
  value: unknown,
  path = "recommendation",
): ValidationResult {
  const errors: string[] = [];
  if (!isObject(value)) {
    return { valid: false, errors: [`${path} must be an object`] };
  }

  pushIfInvalid(errors, isString(value.roleProfileId), `${path}.roleProfileId is required`);
  pushIfInvalid(errors, isString(value.title), `${path}.title is required`);
  pushIfInvalid(errors, isNumber(value.fitScore), `${path}.fitScore must be a number`);
  pushIfInvalid(
    errors,
    isString(value.transitionDifficulty),
    `${path}.transitionDifficulty is required`,
  );
  pushIfInvalid(errors, isStringArray(value.fitReasons), `${path}.fitReasons must be an array`);
  pushIfInvalid(errors, isStringArray(value.likelyGaps), `${path}.likelyGaps must be an array`);
  pushIfInvalid(
    errors,
    isStringArray(value.proofToBuild),
    `${path}.proofToBuild must be an array`,
  );
  pushIfInvalid(errors, isStringArray(value.whyNow), `${path}.whyNow must be an array`);
  pushIfInvalid(errors, isNumber(value.confidence), `${path}.confidence must be a number`);

  return { valid: errors.length === 0, errors };
}

export function validateRoleRecommendationResponse(
  value: unknown,
  path = "roleRecommendationResponse",
): ValidationResult {
  const errors: string[] = [];
  if (!isObject(value)) {
    return { valid: false, errors: [`${path} must be an object`] };
  }

  pushIfInvalid(
    errors,
    Array.isArray(value.recommendations),
    `${path}.recommendations must be an array`,
  );
  if (Array.isArray(value.recommendations)) {
    value.recommendations.forEach((recommendation, index) => {
      errors.push(
        ...validateRoleRecommendation(
          recommendation,
          `${path}.recommendations[${index}]`,
        ).errors,
      );
    });
  }

  errors.push(...validateCandidateRoleInput(value.interpretedInput, `${path}.interpretedInput`).errors);
  pushIfInvalid(errors, isString(value.marketCaveat), `${path}.marketCaveat is required`);
  errors.push(...validateContractMeta(value.meta, `${path}.meta`).errors);

  return { valid: errors.length === 0, errors };
}

export function validateEvidenceRef(value: unknown, path = "evidenceRef"): ValidationResult {
  const errors: string[] = [];
  if (!isObject(value)) {
    return { valid: false, errors: [`${path} must be an object`] };
  }

  pushIfInvalid(errors, isString(value.id), `${path}.id is required`);
  pushIfInvalid(errors, isString(value.sourceType), `${path}.sourceType is required`);
  pushIfInvalid(
    errors,
    isNullableString(value.sourceId),
    `${path}.sourceId must be string or null`,
  );
  pushIfInvalid(
    errors,
    isNullableString(value.sourceSection),
    `${path}.sourceSection must be string or null`,
  );
  pushIfInvalid(
    errors,
    isString(value.originalSnippet),
    `${path}.originalSnippet is required`,
  );
  pushIfInvalid(errors, isString(value.createdAt), `${path}.createdAt is required`);

  return { valid: errors.length === 0, errors };
}

export function validateEvidenceClaim(
  value: unknown,
  path = "evidenceClaim",
): ValidationResult {
  const errors: string[] = [];
  if (!isObject(value)) {
    return { valid: false, errors: [`${path} must be an object`] };
  }

  pushIfInvalid(errors, isString(value.id), `${path}.id is required`);
  pushIfInvalid(
    errors,
    isString(value.normalizedClaim),
    `${path}.normalizedClaim is required`,
  );
  pushIfInvalid(
    errors,
    isStringArray(value.skillLabels),
    `${path}.skillLabels must be a string array`,
  );
  pushIfInvalid(
    errors,
    isStringArray(value.roleLabels),
    `${path}.roleLabels must be a string array`,
  );
  pushIfInvalid(
    errors,
    isNullableString(value.projectName),
    `${path}.projectName must be string or null`,
  );
  pushIfInvalid(
    errors,
    isNullableString(value.companyName),
    `${path}.companyName must be string or null`,
  );
  pushIfInvalid(
    errors,
    isNullableString(value.metric),
    `${path}.metric must be string or null`,
  );
  pushIfInvalid(
    errors,
    value.senioritySignal === "none" ||
      value.senioritySignal === "some" ||
      value.senioritySignal === "strong",
    `${path}.senioritySignal must be none, some, or strong`,
  );
  pushIfInvalid(
    errors,
    Array.isArray(value.evidenceRefs),
    `${path}.evidenceRefs must be an array`,
  );
  if (Array.isArray(value.evidenceRefs)) {
    value.evidenceRefs.forEach((ref, index) => {
      errors.push(...validateEvidenceRef(ref, `${path}.evidenceRefs[${index}]`).errors);
    });
  }
  pushIfInvalid(errors, isNumber(value.confidence), `${path}.confidence must be a number`);
  pushIfInvalid(
    errors,
    typeof value.userVerified === "boolean",
    `${path}.userVerified must be a boolean`,
  );

  return { valid: errors.length === 0, errors };
}

export function validateCandidateEvidenceProfile(
  value: unknown,
  path = "candidateEvidenceProfile",
): ValidationResult {
  const errors: string[] = [];
  if (!isObject(value)) {
    return { valid: false, errors: [`${path} must be an object`] };
  }

  pushIfInvalid(errors, isString(value.userId), `${path}.userId is required`);
  pushIfInvalid(
    errors,
    isNullableString(value.headline),
    `${path}.headline must be string or null`,
  );
  pushIfInvalid(
    errors,
    value.yearsExperience === null || isNumber(value.yearsExperience),
    `${path}.yearsExperience must be number or null`,
  );
  pushIfInvalid(errors, isStringArray(value.skills), `${path}.skills must be a string array`);
  pushIfInvalid(errors, Array.isArray(value.roles), `${path}.roles must be an array`);
  pushIfInvalid(errors, Array.isArray(value.projects), `${path}.projects must be an array`);
  pushIfInvalid(errors, Array.isArray(value.claims), `${path}.claims must be an array`);
  if (Array.isArray(value.claims)) {
    value.claims.forEach((claim, index) => {
      errors.push(...validateEvidenceClaim(claim, `${path}.claims[${index}]`).errors);
    });
  }
  pushIfInvalid(errors, isString(value.updatedAt), `${path}.updatedAt is required`);
  errors.push(...validateContractMeta(value.meta, `${path}.meta`).errors);

  return { valid: errors.length === 0, errors };
}

export function validateRequirementCoverage(
  value: unknown,
  path = "requirementCoverage",
): ValidationResult {
  const errors: string[] = [];
  if (!isObject(value)) {
    return { valid: false, errors: [`${path} must be an object`] };
  }

  pushIfInvalid(errors, isString(value.requirementId), `${path}.requirementId is required`);
  pushIfInvalid(
    errors,
    isString(value.requirementLabel),
    `${path}.requirementLabel is required`,
  );
  pushIfInvalid(
    errors,
    value.status === "covered" ||
      value.status === "weak" ||
      value.status === "missing" ||
      value.status === "not_applicable",
    `${path}.status must be covered, weak, missing, or not_applicable`,
  );
  pushIfInvalid(errors, isString(value.priority), `${path}.priority is required`);
  pushIfInvalid(errors, isNumber(value.score), `${path}.score must be a number`);
  pushIfInvalid(
    errors,
    isStringArray(value.matchedEvidenceClaimIds),
    `${path}.matchedEvidenceClaimIds must be a string array`,
  );
  pushIfInvalid(
    errors,
    isStringArray(value.evidenceSnippets),
    `${path}.evidenceSnippets must be a string array`,
  );
  pushIfInvalid(
    errors,
    isNullableString(value.gapReason),
    `${path}.gapReason must be string or null`,
  );
  pushIfInvalid(
    errors,
    isString(value.suggestedAction),
    `${path}.suggestedAction is required`,
  );
  pushIfInvalid(errors, isNumber(value.confidence), `${path}.confidence must be a number`);

  return { valid: errors.length === 0, errors };
}

export function validateRoleReadinessReport(
  value: unknown,
  path = "roleReadinessReport",
): ValidationResult {
  const errors: string[] = [];
  if (!isObject(value)) {
    return { valid: false, errors: [`${path} must be an object`] };
  }

  pushIfInvalid(errors, isString(value.id), `${path}.id is required`);
  pushIfInvalid(errors, isString(value.userId), `${path}.userId is required`);
  pushIfInvalid(errors, isString(value.targetRoleId), `${path}.targetRoleId is required`);
  pushIfInvalid(errors, isString(value.roleProfileId), `${path}.roleProfileId is required`);
  pushIfInvalid(
    errors,
    value.verdict === "apply_now" ||
      value.verdict === "apply_after_edits" ||
      value.verdict === "upgrade_first",
    `${path}.verdict must be apply_now, apply_after_edits, or upgrade_first`,
  );
  pushIfInvalid(
    errors,
    value.label === "early" ||
      value.label === "building" ||
      value.label === "close" ||
      value.label === "ready",
    `${path}.label must be early, building, close, or ready`,
  );
  pushIfInvalid(errors, isString(value.summary), `${path}.summary is required`);
  pushIfInvalid(errors, isObject(value.score), `${path}.score must be an object`);
  if (isObject(value.score)) {
    const score = value.score;
    [
      "overall",
      "skillCoverage",
      "proofCoverage",
      "seniorityAlignment",
      "productionReadiness",
      "interviewReadiness",
      "aiLeverageReadiness",
    ].forEach((key) => {
      pushIfInvalid(errors, isNumber(score[key]), `${path}.score.${key} must be a number`);
    });
  }
  pushIfInvalid(errors, Array.isArray(value.coverage), `${path}.coverage must be an array`);
  if (Array.isArray(value.coverage)) {
    value.coverage.forEach((coverage, index) => {
      errors.push(...validateRequirementCoverage(coverage, `${path}.coverage[${index}]`).errors);
    });
  }
  pushIfInvalid(errors, isStringArray(value.strengths), `${path}.strengths must be an array`);
  pushIfInvalid(
    errors,
    isStringArray(value.criticalGaps),
    `${path}.criticalGaps must be an array`,
  );
  pushIfInvalid(
    errors,
    isStringArray(value.missingProof),
    `${path}.missingProof must be an array`,
  );
  pushIfInvalid(
    errors,
    isStringArray(value.interviewRisks),
    `${path}.interviewRisks must be an array`,
  );
  pushIfInvalid(
    errors,
    isString(value.recommendedNextStep),
    `${path}.recommendedNextStep is required`,
  );
  pushIfInvalid(errors, isStringArray(value.sourceRefs), `${path}.sourceRefs must be an array`);
  pushIfInvalid(errors, isString(value.generatedAt), `${path}.generatedAt is required`);
  pushIfInvalid(errors, isNumber(value.confidence), `${path}.confidence must be a number`);
  errors.push(...validateContractMeta(value.meta, `${path}.meta`).errors);

  return { valid: errors.length === 0, errors };
}

export function validateGenerateReadinessResponse(
  value: unknown,
  path = "generateReadinessResponse",
): ValidationResult {
  const errors: string[] = [];
  if (!isObject(value)) {
    return { valid: false, errors: [`${path} must be an object`] };
  }

  errors.push(...validateRoleReadinessReport(value.report, `${path}.report`).errors);
  if (value.quota !== undefined) {
    pushIfInvalid(errors, isObject(value.quota), `${path}.quota must be an object`);
  }

  return { valid: errors.length === 0, errors };
}

export function validateProofRecommendation(
  value: unknown,
  path = "proofRecommendation",
): ValidationResult {
  const errors: string[] = [];
  if (!isObject(value)) {
    return { valid: false, errors: [`${path} must be an object`] };
  }

  pushIfInvalid(errors, isString(value.id), `${path}.id is required`);
  pushIfInvalid(
    errors,
    value.type === "project" ||
      value.type === "case_study" ||
      value.type === "resume_rewrite" ||
      value.type === "interview_story" ||
      value.type === "learning_module" ||
      value.type === "portfolio_artifact",
    `${path}.type must be a known proof task type`,
  );
  pushIfInvalid(errors, isString(value.title), `${path}.title is required`);
  pushIfInvalid(errors, isString(value.gapAddressed), `${path}.gapAddressed is required`);
  pushIfInvalid(errors, isString(value.whyItMatters), `${path}.whyItMatters is required`);
  pushIfInvalid(
    errors,
    isString(value.expectedOutput),
    `${path}.expectedOutput is required`,
  );
  pushIfInvalid(
    errors,
    isStringArray(value.acceptanceCriteria),
    `${path}.acceptanceCriteria must be a string array`,
  );
  pushIfInvalid(
    errors,
    isNumber(value.estimatedHours),
    `${path}.estimatedHours must be a number`,
  );
  pushIfInvalid(
    errors,
    value.difficulty === "small" ||
      value.difficulty === "medium" ||
      value.difficulty === "large",
    `${path}.difficulty must be small, medium, or large`,
  );
  pushIfInvalid(
    errors,
    isStringArray(value.linkedRequirementIds),
    `${path}.linkedRequirementIds must be a string array`,
  );

  return { valid: errors.length === 0, errors };
}

export function validateGapToProofResponse(
  value: unknown,
  path = "gapToProofResponse",
): ValidationResult {
  const errors: string[] = [];
  if (!isObject(value)) {
    return { valid: false, errors: [`${path} must be an object`] };
  }

  pushIfInvalid(errors, isString(value.targetRoleId), `${path}.targetRoleId is required`);
  pushIfInvalid(
    errors,
    isString(value.readinessReportId),
    `${path}.readinessReportId is required`,
  );
  pushIfInvalid(
    errors,
    Array.isArray(value.proofRecommendations),
    `${path}.proofRecommendations must be an array`,
  );
  if (Array.isArray(value.proofRecommendations)) {
    value.proofRecommendations.forEach((recommendation, index) => {
      errors.push(
        ...validateProofRecommendation(
          recommendation,
          `${path}.proofRecommendations[${index}]`,
        ).errors,
      );
    });
  }
  errors.push(...validateContractMeta(value.meta, `${path}.meta`).errors);

  return { valid: errors.length === 0, errors };
}

export function validateUpgradePlanTopic(
  value: unknown,
  path = "upgradePlanTopic",
): ValidationResult {
  const errors: string[] = [];
  if (!isObject(value)) {
    return { valid: false, errors: [`${path} must be an object`] };
  }

  pushIfInvalid(errors, isString(value.title), `${path}.title is required`);
  pushIfInvalid(errors, isString(value.rationale), `${path}.rationale is required`);
  pushIfInvalid(errors, isString(value.linkedGap), `${path}.linkedGap is required`);
  pushIfInvalid(
    errors,
    isStringArray(value.linkedRequirementIds),
    `${path}.linkedRequirementIds must be a string array`,
  );
  pushIfInvalid(
    errors,
    isString(value.targetOutcome),
    `${path}.targetOutcome is required`,
  );
  pushIfInvalid(
    errors,
    isNumber(value.estimatedWeeks),
    `${path}.estimatedWeeks must be a number`,
  );
  pushIfInvalid(errors, isNumber(value.priority), `${path}.priority must be a number`);

  return { valid: errors.length === 0, errors };
}

export function validateUpgradePlan(
  value: unknown,
  path = "upgradePlan",
): ValidationResult {
  const errors: string[] = [];
  if (!isObject(value)) {
    return { valid: false, errors: [`${path} must be an object`] };
  }

  pushIfInvalid(errors, isString(value.id), `${path}.id is required`);
  pushIfInvalid(errors, isString(value.userId), `${path}.userId is required`);
  pushIfInvalid(errors, isString(value.targetRoleId), `${path}.targetRoleId is required`);
  pushIfInvalid(
    errors,
    isString(value.readinessReportId),
    `${path}.readinessReportId is required`,
  );
  pushIfInvalid(errors, isString(value.title), `${path}.title is required`);
  pushIfInvalid(
    errors,
    isNumber(value.durationWeeks),
    `${path}.durationWeeks must be a number`,
  );
  pushIfInvalid(
    errors,
    isNumber(value.weeklyCommitmentHours),
    `${path}.weeklyCommitmentHours must be a number`,
  );
  pushIfInvalid(errors, Array.isArray(value.topics), `${path}.topics must be an array`);
  if (Array.isArray(value.topics)) {
    value.topics.forEach((topic, index) => {
      errors.push(...validateUpgradePlanTopic(topic, `${path}.topics[${index}]`).errors);
    });
  }
  pushIfInvalid(
    errors,
    Array.isArray(value.proofTasks),
    `${path}.proofTasks must be an array`,
  );
  if (Array.isArray(value.proofTasks)) {
    value.proofTasks.forEach((task, index) => {
      errors.push(...validateProofRecommendation(task, `${path}.proofTasks[${index}]`).errors);
    });
  }
  pushIfInvalid(
    errors,
    isStringArray(value.successEvidence),
    `${path}.successEvidence must be a string array`,
  );
  pushIfInvalid(errors, isStringArray(value.risks), `${path}.risks must be a string array`);
  pushIfInvalid(
    errors,
    isNullableString(value.linkedGoalId),
    `${path}.linkedGoalId must be string or null`,
  );
  pushIfInvalid(
    errors,
    isNullableString(value.linkedSprintId),
    `${path}.linkedSprintId must be string or null`,
  );
  pushIfInvalid(errors, isString(value.createdAt), `${path}.createdAt is required`);
  errors.push(...validateContractMeta(value.meta, `${path}.meta`).errors);

  return { valid: errors.length === 0, errors };
}

export function validateCreateUpgradePlanResponse(
  value: unknown,
  path = "createUpgradePlanResponse",
): ValidationResult {
  const errors: string[] = [];
  if (!isObject(value)) {
    return { valid: false, errors: [`${path} must be an object`] };
  }

  errors.push(...validateUpgradePlan(value.upgradePlan, `${path}.upgradePlan`).errors);
  pushIfInvalid(
    errors,
    isNullableString(value.goalId),
    `${path}.goalId must be string or null`,
  );
  pushIfInvalid(
    errors,
    isNullableString(value.sprintId),
    `${path}.sprintId must be string or null`,
  );
  pushIfInvalid(
    errors,
    value.nextAction === "start_sprint" || value.nextAction === "review_plan",
    `${path}.nextAction must be start_sprint or review_plan`,
  );

  return { valid: errors.length === 0, errors };
}

export function validateCreateGoalFromTargetRoleResponse(
  value: unknown,
  path = "createGoalFromTargetRoleResponse",
): ValidationResult {
  const errors: string[] = [];
  if (!isObject(value)) {
    return { valid: false, errors: [`${path} must be an object`] };
  }

  pushIfInvalid(errors, isString(value.targetRoleId), `${path}.targetRoleId is required`);
  pushIfInvalid(errors, isString(value.upgradePlanId), `${path}.upgradePlanId is required`);
  pushIfInvalid(errors, isString(value.goalId), `${path}.goalId is required`);
  pushIfInvalid(errors, isString(value.goalUrl), `${path}.goalUrl is required`);
  pushIfInvalid(errors, typeof value.reusedGoal === "boolean", `${path}.reusedGoal must be boolean`);

  return { valid: errors.length === 0, errors };
}

export function validateStartUpgradePlanSprintResponse(
  value: unknown,
  path = "startUpgradePlanSprintResponse",
): ValidationResult {
  const errors: string[] = [];
  if (!isObject(value)) {
    return { valid: false, errors: [`${path} must be an object`] };
  }

  pushIfInvalid(errors, isString(value.targetRoleId), `${path}.targetRoleId is required`);
  pushIfInvalid(errors, isString(value.upgradePlanId), `${path}.upgradePlanId is required`);
  pushIfInvalid(errors, isString(value.goalId), `${path}.goalId is required`);
  pushIfInvalid(errors, isString(value.sprintId), `${path}.sprintId is required`);
  pushIfInvalid(errors, isString(value.goalUrl), `${path}.goalUrl is required`);
  pushIfInvalid(errors, isString(value.todayUrl), `${path}.todayUrl is required`);
  pushIfInvalid(errors, typeof value.reusedGoal === "boolean", `${path}.reusedGoal must be boolean`);
  pushIfInvalid(errors, typeof value.reusedSprint === "boolean", `${path}.reusedSprint must be boolean`);

  return { valid: errors.length === 0, errors };
}

function validateTargetRoleDecompositionTopic(
  value: unknown,
  path = "targetRoleDecompositionTopic",
): ValidationResult {
  const errors: string[] = [];
  if (!isObject(value)) {
    return { valid: false, errors: [`${path} must be an object`] };
  }

  pushIfInvalid(
    errors,
    isNullableString(value.topicId),
    `${path}.topicId must be string or null`,
  );
  pushIfInvalid(errors, isString(value.title), `${path}.title is required`);
  pushIfInvalid(
    errors,
    value.status === "not_started" ||
      value.status === "pending" ||
      value.status === "in_progress" ||
      value.status === "completed" ||
      value.status === "failed",
    `${path}.status is invalid`,
  );
  pushIfInvalid(errors, isNumber(value.nodesCreated), `${path}.nodesCreated must be a number`);
  pushIfInvalid(errors, typeof value.usingFallback === "boolean", `${path}.usingFallback must be boolean`);
  pushIfInvalid(
    errors,
    isNullableString(value.error),
    `${path}.error must be string or null`,
  );

  return { valid: errors.length === 0, errors };
}

export function validateTargetRoleDecompositionStatusResponse(
  value: unknown,
  path = "targetRoleDecompositionStatusResponse",
): ValidationResult {
  const errors: string[] = [];
  if (!isObject(value)) {
    return { valid: false, errors: [`${path} must be an object`] };
  }

  pushIfInvalid(errors, isString(value.targetRoleId), `${path}.targetRoleId is required`);
  pushIfInvalid(errors, isString(value.upgradePlanId), `${path}.upgradePlanId is required`);
  pushIfInvalid(errors, isNullableString(value.goalId), `${path}.goalId must be string or null`);
  pushIfInvalid(
    errors,
    value.pipelineStatus === "idle" ||
      value.pipelineStatus === "running" ||
      value.pipelineStatus === "done" ||
      value.pipelineStatus === "partial" ||
      value.pipelineStatus === "failed",
    `${path}.pipelineStatus is invalid`,
  );
  pushIfInvalid(errors, Array.isArray(value.topics), `${path}.topics must be an array`);
  if (Array.isArray(value.topics)) {
    value.topics.forEach((topic, index) => {
      errors.push(
        ...validateTargetRoleDecompositionTopic(topic, `${path}.topics[${index}]`).errors,
      );
    });
  }
  pushIfInvalid(errors, isNumber(value.nodesCreated), `${path}.nodesCreated must be a number`);
  pushIfInvalid(errors, isNumber(value.fallbackTaskCount), `${path}.fallbackTaskCount must be a number`);
  pushIfInvalid(errors, typeof value.canStart === "boolean", `${path}.canStart must be boolean`);
  pushIfInvalid(errors, typeof value.canRetry === "boolean", `${path}.canRetry must be boolean`);
  pushIfInvalid(errors, isString(value.message), `${path}.message is required`);
  pushIfInvalid(errors, isObject(value.config), `${path}.config must be an object`);
  if (isObject(value.config)) {
    pushIfInvalid(
      errors,
      isNumber(value.config.requestTimeoutMs),
      `${path}.config.requestTimeoutMs must be a number`,
    );
    pushIfInvalid(
      errors,
      isNumber(value.config.maxAttempts),
      `${path}.config.maxAttempts must be a number`,
    );
    pushIfInvalid(
      errors,
      isNumber(value.config.topicConcurrency),
      `${path}.config.topicConcurrency must be a number`,
    );
  }

  return { valid: errors.length === 0, errors };
}

export function validateStartTargetRoleDecompositionResponse(
  value: unknown,
  path = "startTargetRoleDecompositionResponse",
): ValidationResult {
  const errors = validateTargetRoleDecompositionStatusResponse(value, path).errors;
  if (!isObject(value)) {
    return { valid: false, errors };
  }
  pushIfInvalid(errors, typeof value.accepted === "boolean", `${path}.accepted must be boolean`);
  pushIfInvalid(errors, typeof value.retryMode === "boolean", `${path}.retryMode must be boolean`);
  return { valid: errors.length === 0, errors };
}

export function validateProofEvidenceStatusResponse(
  value: unknown,
  path = "proofEvidenceStatusResponse",
): ValidationResult {
  const errors: string[] = [];
  if (!isObject(value)) {
    return { valid: false, errors: [`${path} must be an object`] };
  }

  pushIfInvalid(errors, isString(value.targetRoleId), `${path}.targetRoleId is required`);
  pushIfInvalid(errors, isNullableString(value.linkedGoalId), `${path}.linkedGoalId must be string or null`);
  pushIfInvalid(errors, isNumber(value.evidenceClaimCount), `${path}.evidenceClaimCount must be a number`);
  pushIfInvalid(errors, isNumber(value.publishedArtifactCount), `${path}.publishedArtifactCount must be a number`);
  pushIfInvalid(errors, isNumber(value.publishableArtifactCount), `${path}.publishableArtifactCount must be a number`);
  pushIfInvalid(errors, isNullableString(value.latestEvidenceAt), `${path}.latestEvidenceAt must be string or null`);
  pushIfInvalid(errors, isNullableString(value.latestReadinessReportId), `${path}.latestReadinessReportId must be string or null`);
  pushIfInvalid(errors, typeof value.reassessRecommended === "boolean", `${path}.reassessRecommended must be boolean`);
  pushIfInvalid(errors, isString(value.message), `${path}.message is required`);

  return { valid: errors.length === 0, errors };
}

export function validatePublishProofEvidenceResponse(
  value: unknown,
  path = "publishProofEvidenceResponse",
): ValidationResult {
  const errors = validateProofEvidenceStatusResponse(value, path).errors;
  if (!isObject(value)) {
    return { valid: false, errors };
  }

  pushIfInvalid(errors, isNumber(value.publishedCount), `${path}.publishedCount must be a number`);
  pushIfInvalid(errors, Array.isArray(value.publishedClaims), `${path}.publishedClaims must be an array`);
  if (Array.isArray(value.publishedClaims)) {
    value.publishedClaims.forEach((claim, index) => {
      errors.push(...validateEvidenceClaim(claim, `${path}.publishedClaims[${index}]`).errors);
    });
  }

  return { valid: errors.length === 0, errors };
}

export function assertValidRoleMarketProfile(value: unknown): asserts value is RoleMarketProfile {
  const result = validateRoleMarketProfile(value);
  if (!result.valid) {
    throw new Error(`Invalid role market profile: ${result.errors.join("; ")}`);
  }
}

export function assertValidListRolesResponse(value: unknown): asserts value is ListRolesResponse {
  const result = validateListRolesResponse(value);
  if (!result.valid) {
    throw new Error(`Invalid list roles response: ${result.errors.join("; ")}`);
  }
}

export function assertValidRoleRecommendationResponse(
  value: unknown,
): asserts value is RoleRecommendationResponse {
  const result = validateRoleRecommendationResponse(value);
  if (!result.valid) {
    throw new Error(`Invalid role recommendation response: ${result.errors.join("; ")}`);
  }
}

export function assertValidCandidateEvidenceProfile(
  value: unknown,
): asserts value is CandidateEvidenceProfile {
  const result = validateCandidateEvidenceProfile(value);
  if (!result.valid) {
    throw new Error(`Invalid candidate evidence profile: ${result.errors.join("; ")}`);
  }
}

export function assertValidRoleReadinessReport(
  value: unknown,
): asserts value is RoleReadinessReport {
  const result = validateRoleReadinessReport(value);
  if (!result.valid) {
    throw new Error(`Invalid role readiness report: ${result.errors.join("; ")}`);
  }
}

export function assertValidGenerateReadinessResponse(
  value: unknown,
): asserts value is GenerateReadinessResponse {
  const result = validateGenerateReadinessResponse(value);
  if (!result.valid) {
    throw new Error(`Invalid readiness response: ${result.errors.join("; ")}`);
  }
}

export function assertValidGapToProofResponse(
  value: unknown,
): asserts value is GapToProofResponse {
  const result = validateGapToProofResponse(value);
  if (!result.valid) {
    throw new Error(`Invalid gap-to-proof response: ${result.errors.join("; ")}`);
  }
}

export function assertValidUpgradePlan(value: unknown): asserts value is UpgradePlan {
  const result = validateUpgradePlan(value);
  if (!result.valid) {
    throw new Error(`Invalid upgrade plan: ${result.errors.join("; ")}`);
  }
}

export function assertValidCreateUpgradePlanResponse(
  value: unknown,
): asserts value is CreateUpgradePlanResponse {
  const result = validateCreateUpgradePlanResponse(value);
  if (!result.valid) {
    throw new Error(`Invalid create upgrade plan response: ${result.errors.join("; ")}`);
  }
}

export function assertValidCreateGoalFromTargetRoleResponse(
  value: unknown,
): asserts value is CreateGoalFromTargetRoleResponse {
  const result = validateCreateGoalFromTargetRoleResponse(value);
  if (!result.valid) {
    throw new Error(`Invalid target-role goal response: ${result.errors.join("; ")}`);
  }
}

export function assertValidStartUpgradePlanSprintResponse(
  value: unknown,
): asserts value is StartUpgradePlanSprintResponse {
  const result = validateStartUpgradePlanSprintResponse(value);
  if (!result.valid) {
    throw new Error(`Invalid target-role sprint response: ${result.errors.join("; ")}`);
  }
}

export function assertValidTargetRoleDecompositionStatusResponse(
  value: unknown,
): asserts value is TargetRoleDecompositionStatusResponse {
  const result = validateTargetRoleDecompositionStatusResponse(value);
  if (!result.valid) {
    throw new Error(`Invalid target-role decomposition status: ${result.errors.join("; ")}`);
  }
}

export function assertValidStartTargetRoleDecompositionResponse(
  value: unknown,
): asserts value is StartTargetRoleDecompositionResponse {
  const result = validateStartTargetRoleDecompositionResponse(value);
  if (!result.valid) {
    throw new Error(`Invalid target-role decomposition response: ${result.errors.join("; ")}`);
  }
}

export function assertValidProofEvidenceStatusResponse(
  value: unknown,
): asserts value is ProofEvidenceStatusResponse {
  const result = validateProofEvidenceStatusResponse(value);
  if (!result.valid) {
    throw new Error(`Invalid proof evidence status: ${result.errors.join("; ")}`);
  }
}

export function assertValidPublishProofEvidenceResponse(
  value: unknown,
): asserts value is PublishProofEvidenceResponse {
  const result = validatePublishProofEvidenceResponse(value);
  if (!result.valid) {
    throw new Error(`Invalid publish proof evidence response: ${result.errors.join("; ")}`);
  }
}

export function isRoleMarketProfile(value: unknown): value is RoleMarketProfile {
  return validateRoleMarketProfile(value).valid;
}

export function isListRolesResponse(value: unknown): value is ListRolesResponse {
  return validateListRolesResponse(value).valid;
}

export function isRoleRecommendationResponse(value: unknown): value is RoleRecommendationResponse {
  return validateRoleRecommendationResponse(value).valid;
}

export function isEvidenceRef(value: unknown): value is EvidenceRef {
  return validateEvidenceRef(value).valid;
}

export function isEvidenceClaim(value: unknown): value is EvidenceClaim {
  return validateEvidenceClaim(value).valid;
}

export function isCandidateEvidenceProfile(value: unknown): value is CandidateEvidenceProfile {
  return validateCandidateEvidenceProfile(value).valid;
}

export function isRequirementCoverage(value: unknown): value is RequirementCoverage {
  return validateRequirementCoverage(value).valid;
}

export function isRoleReadinessReport(value: unknown): value is RoleReadinessReport {
  return validateRoleReadinessReport(value).valid;
}

export function isProofRecommendation(value: unknown): value is ProofRecommendation {
  return validateProofRecommendation(value).valid;
}

export function isGapToProofResponse(value: unknown): value is GapToProofResponse {
  return validateGapToProofResponse(value).valid;
}

export function isUpgradePlanTopic(value: unknown): value is UpgradePlanTopic {
  return validateUpgradePlanTopic(value).valid;
}

export function isUpgradePlan(value: unknown): value is UpgradePlan {
  return validateUpgradePlan(value).valid;
}

export function isTargetRoleDecompositionTopic(
  value: unknown,
): value is TargetRoleDecompositionTopic {
  return validateTargetRoleDecompositionTopic(value).valid;
}

export function toRoleMarketCards(profiles: RoleMarketProfile[]): RoleMarketCard[] {
  return profiles.map((profile) => ({
    id: profile.id,
    slug: profile.slug,
    title: profile.title,
    category: profile.category,
    roleType: profile.roleType,
    aiImpact: profile.aiImpact,
    shortDescription: profile.shortDescription,
    topRequirements: profile.requirements.slice(0, 3).map((requirement) => requirement.label),
    lastUpdated: profile.lastUpdated,
    confidence: profile.confidence,
  }));
}
