import type {
  OperatorOutcomeCalibrationResponse,
  OutcomeSignalMetric,
  OutcomeSignalPrivacyEnvelope,
  OutcomeSignalReview,
  PrivacySafeOutcomeSignalAggregate,
} from "./outcomeLearningContracts";
import {
  OUTCOME_SIGNAL_AGGREGATION_LEVELS,
  OUTCOME_SIGNAL_ANONYMIZATION_MODES,
  OUTCOME_SIGNAL_INFLUENCE_SCOPES,
  OUTCOME_SIGNAL_METRIC_DIRECTIONS,
  OUTCOME_SIGNAL_METRIC_KEYS,
  OUTCOME_SIGNAL_METRIC_UNITS,
  OUTCOME_SIGNAL_PRIVATE_FIELD_DENYLIST,
  OUTCOME_SIGNAL_REVIEW_STATUSES,
  OUTCOME_SIGNAL_SCOPE_ALLOWED_SOURCE_TYPES,
  OUTCOME_SIGNAL_SOURCE_TYPES,
  evaluateOutcomeSignalScope,
} from "./outcomeLearningContracts";
import {
  outcomeLearningGoldenFixtures,
  outcomeLearningOperatorGoldenFixtures,
} from "./outcomeLearningFixtures";
import { validateContractMeta, type ValidationResult } from "./roleMarketValidation";

const ID_MAX_LENGTH = 160;
const LABEL_MAX_LENGTH = 240;
const EXPLANATION_MAX_LENGTH = 1_000;
const SENIORITY_BANDS = ["junior", "mid", "senior", "staff"] as const;
const ROLE_CATEGORIES = [
  "software_engineering",
  "data",
  "ai",
  "cloud",
  "security",
  "product",
  "qa",
  "platform",
] as const;
const OUTCOME_CALIBRATION_THRESHOLD_STATUSES = [
  "no_data",
  "below_threshold",
  "ready_for_internal_calibration",
  "eligible_for_operator_review",
] as const;

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

function isNonNegativeInteger(value: unknown): value is number {
  return isNumber(value) && Number.isInteger(value) && value >= 0;
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function pushIfInvalid(errors: string[], condition: boolean, message: string): void {
  if (!condition) errors.push(message);
}

function validateRequiredString(
  errors: string[],
  value: unknown,
  path: string,
  maxLength = LABEL_MAX_LENGTH,
): void {
  pushIfInvalid(errors, isString(value), `${path} is required`);
  if (typeof value === "string" && value.length > maxLength) {
    errors.push(`${path} must be ${maxLength} characters or fewer`);
  }
}

function validateNullableString(errors: string[], value: unknown, path: string): void {
  pushIfInvalid(errors, isNullableString(value), `${path} must be string or null`);
}

function validateEnum(
  errors: string[],
  value: unknown,
  path: string,
  allowed: readonly string[],
): void {
  pushIfInvalid(errors, typeof value === "string" && allowed.includes(value), `${path} must be one of ${allowed.join(", ")}`);
}

function validateNonNegativeInteger(errors: string[], value: unknown, path: string): void {
  pushIfInvalid(errors, isNonNegativeInteger(value), `${path} must be a non-negative integer`);
}

function validateConfidence(errors: string[], value: unknown, path: string): void {
  pushIfInvalid(errors, isNumber(value) && value >= 0 && value <= 1, `${path} must be between 0 and 1`);
}

function findPrivateFieldKeys(value: unknown, path = "aggregate"): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findPrivateFieldKeys(item, `${path}[${index}]`));
  }

  if (!isObject(value)) return [];

  return Object.entries(value).flatMap(([key, child]) => {
    const currentPath = `${path}.${key}`;
    const self = (OUTCOME_SIGNAL_PRIVATE_FIELD_DENYLIST as readonly string[]).includes(key)
      ? [`${currentPath} is not allowed in privacy-safe outcome aggregates`]
      : [];
    return [...self, ...findPrivateFieldKeys(child, currentPath)];
  });
}

function validatePrivacyEnvelope(
  value: unknown,
  path: string,
  errors: string[],
): value is OutcomeSignalPrivacyEnvelope {
  pushIfInvalid(errors, isObject(value), `${path} must be an object`);
  if (!isObject(value)) return false;

  validateEnum(errors, value.aggregationLevel, `${path}.aggregationLevel`, OUTCOME_SIGNAL_AGGREGATION_LEVELS);
  validateEnum(errors, value.anonymizationMode, `${path}.anonymizationMode`, OUTCOME_SIGNAL_ANONYMIZATION_MODES);
  validateNonNegativeInteger(errors, value.kAnonymityThreshold, `${path}.kAnonymityThreshold`);
  pushIfInvalid(errors, value.containsUserIdentifiers === false, `${path}.containsUserIdentifiers must be false`);
  pushIfInvalid(errors, value.containsRawResumeText === false, `${path}.containsRawResumeText must be false`);
  pushIfInvalid(
    errors,
    value.containsRawJobDescription === false,
    `${path}.containsRawJobDescription must be false`,
  );
  pushIfInvalid(
    errors,
    value.containsRawApplicationDetails === false,
    `${path}.containsRawApplicationDetails must be false`,
  );
  pushIfInvalid(errors, value.containsCompanyNames === false, `${path}.containsCompanyNames must be false`);
  pushIfInvalid(errors, Array.isArray(value.privateFieldsExcluded), `${path}.privateFieldsExcluded must be an array`);

  if (Array.isArray(value.privateFieldsExcluded)) {
    for (const field of OUTCOME_SIGNAL_PRIVATE_FIELD_DENYLIST) {
      pushIfInvalid(
        errors,
        value.privateFieldsExcluded.includes(field),
        `${path}.privateFieldsExcluded must include ${field}`,
      );
    }
  }

  return true;
}

function validateReview(value: unknown, path: string, errors: string[]): value is OutcomeSignalReview {
  pushIfInvalid(errors, isObject(value), `${path} must be an object`);
  if (!isObject(value)) return false;

  validateEnum(errors, value.status, `${path}.status`, OUTCOME_SIGNAL_REVIEW_STATUSES);
  validateNullableString(errors, value.reviewedBy, `${path}.reviewedBy`);
  validateNullableString(errors, value.reviewedAt, `${path}.reviewedAt`);
  pushIfInvalid(errors, isBoolean(value.publicClaimAllowed), `${path}.publicClaimAllowed must be boolean`);
  validateNullableString(errors, value.notes, `${path}.notes`);

  if (value.publicClaimAllowed === true) {
    pushIfInvalid(
      errors,
      value.status === "approved",
      `${path}.publicClaimAllowed requires approved operator review`,
    );
    validateRequiredString(errors, value.reviewedBy, `${path}.reviewedBy`);
    validateRequiredString(errors, value.reviewedAt, `${path}.reviewedAt`);
  }

  return true;
}

function validateMetric(
  value: unknown,
  path: string,
  errors: string[],
  aggregate: PrivacySafeOutcomeSignalAggregate,
): value is OutcomeSignalMetric {
  pushIfInvalid(errors, isObject(value), `${path} must be an object`);
  if (!isObject(value)) return false;

  validateEnum(errors, value.metricKey, `${path}.metricKey`, OUTCOME_SIGNAL_METRIC_KEYS);
  validateRequiredString(errors, value.label, `${path}.label`);
  pushIfInvalid(errors, isNumber(value.value), `${path}.value must be a number`);
  validateEnum(errors, value.unit, `${path}.unit`, OUTCOME_SIGNAL_METRIC_UNITS);
  validateEnum(errors, value.direction, `${path}.direction`, OUTCOME_SIGNAL_METRIC_DIRECTIONS);
  validateConfidence(errors, value.confidence, `${path}.confidence`);
  validateNonNegativeInteger(errors, value.sampleSize, `${path}.sampleSize`);
  validateNonNegativeInteger(errors, value.uniqueUserCount, `${path}.uniqueUserCount`);
  validateNonNegativeInteger(errors, value.sourceEventCount, `${path}.sourceEventCount`);
  validateRequiredString(errors, value.explanation, `${path}.explanation`, EXPLANATION_MAX_LENGTH);

  pushIfInvalid(errors, Array.isArray(value.sourceTypes), `${path}.sourceTypes must be an array`);
  if (Array.isArray(value.sourceTypes)) {
    value.sourceTypes.forEach((sourceType, index) => {
      validateEnum(errors, sourceType, `${path}.sourceTypes[${index}]`, OUTCOME_SIGNAL_SOURCE_TYPES);
    });
  }

  pushIfInvalid(errors, Array.isArray(value.influenceScopes), `${path}.influenceScopes must be an array`);
  if (Array.isArray(value.influenceScopes)) {
    value.influenceScopes.forEach((scope, index) => {
      validateEnum(errors, scope, `${path}.influenceScopes[${index}]`, OUTCOME_SIGNAL_INFLUENCE_SCOPES);
      if (typeof scope !== "string") return;

      if ((OUTCOME_SIGNAL_INFLUENCE_SCOPES as readonly string[]).includes(scope)) {
        const allowedSourceTypes =
          OUTCOME_SIGNAL_SCOPE_ALLOWED_SOURCE_TYPES[scope as keyof typeof OUTCOME_SIGNAL_SCOPE_ALLOWED_SOURCE_TYPES];
        const sourceTypes = Array.isArray(value.sourceTypes) ? value.sourceTypes : [];
        const hasAllowedSourceType = sourceTypes.some(
          (sourceType) =>
            typeof sourceType === "string" && allowedSourceTypes.includes(sourceType as never),
        );
        pushIfInvalid(
          errors,
          hasAllowedSourceType,
          `${path}.influenceScopes[${index}] uses source types that cannot affect ${scope}`,
        );

        const decision = evaluateOutcomeSignalScope(aggregate, scope as never);
        pushIfInvalid(
          errors,
          decision.allowed,
          `${path}.influenceScopes[${index}] cannot influence ${scope}: ${decision.reasons.join("; ")}`,
        );
      }
    });
  }

  return true;
}

export function validatePrivacySafeOutcomeSignalAggregate(
  value: unknown,
  path = "outcomeSignalAggregate",
): ValidationResult {
  const errors: string[] = [];
  errors.push(...findPrivateFieldKeys(value, path));

  pushIfInvalid(errors, isObject(value), `${path} must be an object`);
  if (!isObject(value)) {
    return { valid: false, errors };
  }

  const aggregate = value as unknown as PrivacySafeOutcomeSignalAggregate;
  validateRequiredString(errors, aggregate.id, `${path}.id`, ID_MAX_LENGTH);
  validateRequiredString(errors, aggregate.roleId, `${path}.roleId`, ID_MAX_LENGTH);
  validateRequiredString(errors, aggregate.roleTitle, `${path}.roleTitle`);
  validateNullableString(errors, aggregate.region, `${path}.region`);
  pushIfInvalid(
    errors,
    aggregate.seniorityBand === null || SENIORITY_BANDS.includes(aggregate.seniorityBand as never),
    `${path}.seniorityBand must be junior, mid, senior, staff, or null`,
  );
  validateRequiredString(errors, aggregate.windowStart, `${path}.windowStart`);
  validateRequiredString(errors, aggregate.windowEnd, `${path}.windowEnd`);
  validateNonNegativeInteger(errors, aggregate.sampleSize, `${path}.sampleSize`);
  validateNonNegativeInteger(errors, aggregate.uniqueUserCount, `${path}.uniqueUserCount`);
  validateNonNegativeInteger(errors, aggregate.sourceEventCount, `${path}.sourceEventCount`);

  pushIfInvalid(errors, Array.isArray(aggregate.sourceBreakdown), `${path}.sourceBreakdown must be an array`);
  if (Array.isArray(aggregate.sourceBreakdown)) {
    pushIfInvalid(errors, aggregate.sourceBreakdown.length > 0, `${path}.sourceBreakdown must not be empty`);
    let sourceEventTotal = 0;
    aggregate.sourceBreakdown.forEach((item, index) => {
      validateEnum(errors, item?.sourceType, `${path}.sourceBreakdown[${index}].sourceType`, OUTCOME_SIGNAL_SOURCE_TYPES);
      validateNonNegativeInteger(
        errors,
        item?.sourceEventCount,
        `${path}.sourceBreakdown[${index}].sourceEventCount`,
      );
      if (isNonNegativeInteger(item?.sourceEventCount)) sourceEventTotal += item.sourceEventCount;
    });
    pushIfInvalid(
      errors,
      sourceEventTotal === aggregate.sourceEventCount,
      `${path}.sourceBreakdown sourceEventCount total must match ${path}.sourceEventCount`,
    );
  }

  const hasValidPrivacy = validatePrivacyEnvelope(aggregate.privacy, `${path}.privacy`, errors);
  const hasValidReview = validateReview(aggregate.review, `${path}.review`, errors);

  pushIfInvalid(errors, Array.isArray(aggregate.metrics), `${path}.metrics must be an array`);
  if (Array.isArray(aggregate.metrics)) {
    pushIfInvalid(errors, aggregate.metrics.length > 0, `${path}.metrics must not be empty`);
    aggregate.metrics.forEach((metric, index) => {
      validateMetric(metric, `${path}.metrics[${index}]`, errors, aggregate);
    });
  }

  pushIfInvalid(errors, isObject(aggregate.influencePolicy), `${path}.influencePolicy must be an object`);
  if (isObject(aggregate.influencePolicy)) {
    pushIfInvalid(
      errors,
      isBoolean(aggregate.influencePolicy.readinessScoringAllowed),
      `${path}.influencePolicy.readinessScoringAllowed must be boolean`,
    );
    pushIfInvalid(
      errors,
      isBoolean(aggregate.influencePolicy.proofRecommendationRankingAllowed),
      `${path}.influencePolicy.proofRecommendationRankingAllowed must be boolean`,
    );
    pushIfInvalid(
      errors,
      isBoolean(aggregate.influencePolicy.publicMarketProfileAllowed),
      `${path}.influencePolicy.publicMarketProfileAllowed must be boolean`,
    );
    pushIfInvalid(
      errors,
      Array.isArray(aggregate.influencePolicy.blockedReasons),
      `${path}.influencePolicy.blockedReasons must be an array`,
    );

    const readinessDecision = evaluateOutcomeSignalScope(aggregate, "readiness_scoring");
    const proofDecision = evaluateOutcomeSignalScope(aggregate, "proof_recommendation_ranking");
    const publicDecision = evaluateOutcomeSignalScope(aggregate, "public_market_profile");

    if (aggregate.influencePolicy.readinessScoringAllowed) {
      pushIfInvalid(
        errors,
        readinessDecision.allowed,
        `${path}.influencePolicy.readinessScoringAllowed requires minimum samples`,
      );
    }
    if (aggregate.influencePolicy.proofRecommendationRankingAllowed) {
      pushIfInvalid(
        errors,
        proofDecision.allowed,
        `${path}.influencePolicy.proofRecommendationRankingAllowed requires minimum samples`,
      );
    }
    if (aggregate.influencePolicy.publicMarketProfileAllowed) {
      pushIfInvalid(
        errors,
        publicDecision.allowed,
        `${path}.influencePolicy.publicMarketProfileAllowed requires minimum samples and operator review`,
      );
    }
  }

  const metaResult = validateContractMeta(aggregate.meta, `${path}.meta`);
  errors.push(...metaResult.errors);

  if (hasValidPrivacy && hasValidReview) {
    pushIfInvalid(
      errors,
      aggregate.privacy.aggregationLevel !== ("user" as never),
      `${path}.privacy.aggregationLevel cannot be user-level`,
    );
  }

  return { valid: errors.length === 0, errors };
}

export function validateOutcomeLearningGoldenFixtures(): ValidationResult {
  const errors = Object.entries(outcomeLearningGoldenFixtures).flatMap(([key, fixture]) => {
    const result = validatePrivacySafeOutcomeSignalAggregate(fixture, `outcomeLearningGoldenFixtures.${key}`);
    return result.errors;
  });

  return { valid: errors.length === 0, errors };
}

export function validateOperatorOutcomeCalibrationResponse(
  value: unknown,
  path = "operatorOutcomeCalibrationResponse",
): ValidationResult {
  const errors: string[] = [];
  if (!isObject(value)) {
    return { valid: false, errors: [`${path} must be an object`] };
  }

  pushIfInvalid(errors, isObject(value.summary), `${path}.summary must be an object`);
  if (isObject(value.summary)) {
    validateNonNegativeInteger(errors, value.summary.roleCount, `${path}.summary.roleCount`);
    validateNonNegativeInteger(errors, value.summary.rolesWithOutcomeData, `${path}.summary.rolesWithOutcomeData`);
    validateNonNegativeInteger(
      errors,
      value.summary.rolesMeetingInternalThreshold,
      `${path}.summary.rolesMeetingInternalThreshold`,
    );
    validateNonNegativeInteger(
      errors,
      value.summary.rolesEligibleForOperatorReview,
      `${path}.summary.rolesEligibleForOperatorReview`,
    );
    validateNonNegativeInteger(errors, value.summary.totalUniqueUsers, `${path}.summary.totalUniqueUsers`);
    validateNonNegativeInteger(errors, value.summary.totalSourceEvents, `${path}.summary.totalSourceEvents`);
    validateRequiredString(errors, value.summary.windowStart, `${path}.summary.windowStart`);
    validateRequiredString(errors, value.summary.windowEnd, `${path}.summary.windowEnd`);
  }

  pushIfInvalid(errors, Array.isArray(value.roles), `${path}.roles must be an array`);
  if (Array.isArray(value.roles)) {
    value.roles.forEach((item, index) => {
      const itemPath = `${path}.roles[${index}]`;
      if (!isObject(item)) {
        errors.push(`${itemPath} must be an object`);
        return;
      }

      validateRequiredString(errors, item.roleProfileId, `${itemPath}.roleProfileId`, ID_MAX_LENGTH);
      validateRequiredString(errors, item.roleTitle, `${itemPath}.roleTitle`);
      validateEnum(errors, item.category, `${itemPath}.category`, ROLE_CATEGORIES);
      validateEnum(
        errors,
        item.thresholdStatus,
        `${itemPath}.thresholdStatus`,
        OUTCOME_CALIBRATION_THRESHOLD_STATUSES,
      );
      pushIfInvalid(
        errors,
        isBoolean(item.canInfluenceReadinessScoring),
        `${itemPath}.canInfluenceReadinessScoring must be boolean`,
      );
      pushIfInvalid(
        errors,
        isBoolean(item.canInfluenceProofRecommendationRanking),
        `${itemPath}.canInfluenceProofRecommendationRanking must be boolean`,
      );
      pushIfInvalid(
        errors,
        item.canInfluencePublicMarketProfile === false,
        `${itemPath}.canInfluencePublicMarketProfile must be false until operator public-claim review exists`,
      );
      validateRequiredString(
        errors,
        item.publicMarketProfileBlockedReason,
        `${itemPath}.publicMarketProfileBlockedReason`,
        EXPLANATION_MAX_LENGTH,
      );

      if (item.aggregate !== null) {
        errors.push(
          ...validatePrivacySafeOutcomeSignalAggregate(item.aggregate, `${itemPath}.aggregate`).errors,
        );
      }

      pushIfInvalid(errors, Array.isArray(item.metrics), `${itemPath}.metrics must be an array`);
      if (Array.isArray(item.metrics)) {
        item.metrics.forEach((metric, metricIndex) => {
          const metricPath = `${itemPath}.metrics[${metricIndex}]`;
          if (!isObject(metric)) {
            errors.push(`${metricPath} must be an object`);
            return;
          }
          validateEnum(errors, metric.metricKey, `${metricPath}.metricKey`, OUTCOME_SIGNAL_METRIC_KEYS);
          validateRequiredString(errors, metric.label, `${metricPath}.label`);
          pushIfInvalid(
            errors,
            metric.value === null || isNumber(metric.value),
            `${metricPath}.value must be number or null`,
          );
          validateEnum(errors, metric.unit, `${metricPath}.unit`, OUTCOME_SIGNAL_METRIC_UNITS);
          validateNonNegativeInteger(errors, metric.sampleSize, `${metricPath}.sampleSize`);
          validateNonNegativeInteger(errors, metric.uniqueUserCount, `${metricPath}.uniqueUserCount`);
          validateNonNegativeInteger(errors, metric.sourceEventCount, `${metricPath}.sourceEventCount`);
          pushIfInvalid(errors, isBoolean(metric.thresholdMet), `${metricPath}.thresholdMet must be boolean`);
          validateRequiredString(errors, metric.explanation, `${metricPath}.explanation`, EXPLANATION_MAX_LENGTH);
          validateNullableString(errors, metric.unavailableReason, `${metricPath}.unavailableReason`);
          pushIfInvalid(errors, Array.isArray(metric.influenceScopes), `${metricPath}.influenceScopes must be an array`);
          if (Array.isArray(metric.influenceScopes)) {
            metric.influenceScopes.forEach((scope, scopeIndex) => {
              validateEnum(
                errors,
                scope,
                `${metricPath}.influenceScopes[${scopeIndex}]`,
                OUTCOME_SIGNAL_INFLUENCE_SCOPES,
              );
            });
          }
        });
      }
    });
  }

  const metaResult = validateContractMeta(value.meta, `${path}.meta`);
  errors.push(...metaResult.errors);

  return { valid: errors.length === 0, errors };
}

export function validateOutcomeLearningOperatorGoldenFixtures(): ValidationResult {
  const errors = Object.entries(outcomeLearningOperatorGoldenFixtures).flatMap(([key, fixture]) => {
    const result = validateOperatorOutcomeCalibrationResponse(fixture, `outcomeLearningOperatorGoldenFixtures.${key}`);
    return result.errors;
  });

  return { valid: errors.length === 0, errors };
}

export function assertValidPrivacySafeOutcomeSignalAggregate(
  value: unknown,
): asserts value is PrivacySafeOutcomeSignalAggregate {
  const result = validatePrivacySafeOutcomeSignalAggregate(value);
  if (!result.valid) {
    throw new Error(`Invalid privacy-safe outcome signal aggregate: ${result.errors.join("; ")}`);
  }
}

export function assertValidOutcomeLearningGoldenFixtures(): void {
  const result = validateOutcomeLearningGoldenFixtures();
  if (!result.valid) {
    throw new Error(`Invalid outcome learning golden fixtures: ${result.errors.join("; ")}`);
  }
}

export function assertValidOperatorOutcomeCalibrationResponse(
  value: unknown,
): asserts value is OperatorOutcomeCalibrationResponse {
  const result = validateOperatorOutcomeCalibrationResponse(value);
  if (!result.valid) {
    throw new Error(`Invalid operator outcome calibration response: ${result.errors.join("; ")}`);
  }
}

export function assertValidOutcomeLearningOperatorGoldenFixtures(): void {
  const result = validateOutcomeLearningOperatorGoldenFixtures();
  if (!result.valid) {
    throw new Error(`Invalid outcome learning operator golden fixtures: ${result.errors.join("; ")}`);
  }
}

export function isPrivacySafeOutcomeSignalAggregate(
  value: unknown,
): value is PrivacySafeOutcomeSignalAggregate {
  return validatePrivacySafeOutcomeSignalAggregate(value).valid;
}

export function isOperatorOutcomeCalibrationResponse(
  value: unknown,
): value is OperatorOutcomeCalibrationResponse {
  return validateOperatorOutcomeCalibrationResponse(value).valid;
}
