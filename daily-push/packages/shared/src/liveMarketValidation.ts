import type {
  MarketIngestionRun,
  MarketProfileValidationResult,
  MarketRawDocument,
  MarketSource,
  MarketSourceFetchRequest,
  MarketSourceFetchResult,
  MarketSourceHealth,
  MarketProfileDiff,
  OperatorMarketAggregatesResponse,
  OperatorMarketProfileActionResponse,
  OperatorMarketProfileDraftsResponse,
  OperatorMarketProfileVersionsResponse,
  NormalizedMarketSignal,
  OperatorMarketIngestionRunsResponse,
  OperatorMarketIngestionTriggerResponse,
  OperatorMarketSourcesResponse,
  RoleMarketProfileVersion,
  RoleMarketSignalAggregate,
  RoleTaxonomyRecord,
  SkillTaxonomyRecord,
} from "./liveMarketContracts";
import {
  MARKET_DOCUMENT_TYPES,
  MARKET_INGESTION_RUN_STATUSES,
  MARKET_PROFILE_VALIDATION_SEVERITIES,
  MARKET_PROFILE_VALIDATION_STATUSES,
  MARKET_REVIEW_ACTIONS,
  MARKET_SIGNAL_DIRECTIONS,
  MARKET_SIGNAL_TYPES,
  MARKET_SOURCE_AUTH_MODES,
  MARKET_SOURCE_HEALTH_STATUSES,
  MARKET_SOURCE_PII_RISK_LEVELS,
  MARKET_SOURCE_STATUSES,
  MARKET_SOURCE_TYPES,
  OPERATOR_MARKET_INGESTION_TRIGGER_STATUSES,
  ROLE_MARKET_PROFILE_VERSION_STATUSES,
} from "./liveMarketContracts";
import {
  liveMarketGoldenFixtures,
  liveMarketIngestionRunFixture,
  liveMarketRawDocumentFixture,
  liveMarketSourceFixture,
  marketSourceFetchRequestFixture,
  marketSourceFetchResultFixture,
  marketProfileValidationResultFixture,
  marketSourceHealthFixture,
  normalizedMarketSignalFixture,
  roleMarketProfileVersionFixture,
  roleMarketSignalAggregateFixture,
} from "./liveMarketFixtures";
import type { SourceReference } from "./roleMarketContracts";
import {
  validateContractMeta,
  validateRoleMarketProfile,
  validateSourceReference,
  type ValidationResult,
} from "./roleMarketValidation";

const ID_MAX_LENGTH = 160;
const LABEL_MAX_LENGTH = 240;
const TITLE_MAX_LENGTH = 500;
const SUMMARY_MAX_LENGTH = 2_000;
const TEXT_MAX_LENGTH = 20_000;
const RAW_PAYLOAD_MAX_LENGTH = 50_000;
const ARRAY_MAX_ITEMS = 200;

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

function isNonNegativeNumber(value: unknown): value is number {
  return isNumber(value) && value >= 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return isNumber(value) && Number.isInteger(value) && value >= 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
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

function validateNullableString(
  errors: string[],
  value: unknown,
  path: string,
  maxLength = LABEL_MAX_LENGTH,
): void {
  pushIfInvalid(errors, isNullableString(value), `${path} must be string or null`);
  if (typeof value === "string" && value.length > maxLength) {
    errors.push(`${path} must be ${maxLength} characters or fewer`);
  }
}

function validateStringArray(
  errors: string[],
  value: unknown,
  path: string,
  options: { required?: boolean; maxItems?: number; maxItemLength?: number } = {},
): void {
  const { required = true, maxItems = ARRAY_MAX_ITEMS, maxItemLength = LABEL_MAX_LENGTH } = options;
  if (!required && value === undefined) return;

  pushIfInvalid(errors, isStringArray(value), `${path} must be a string array`);
  if (!Array.isArray(value)) return;

  if (value.length > maxItems) {
    errors.push(`${path} must contain ${maxItems} items or fewer`);
  }

  value.forEach((item, index) => {
    if (typeof item === "string" && item.length > maxItemLength) {
      errors.push(`${path}[${index}] must be ${maxItemLength} characters or fewer`);
    }
  });
}

function validateEnum(
  errors: string[],
  value: unknown,
  allowed: readonly string[],
  path: string,
): void {
  pushIfInvalid(
    errors,
    typeof value === "string" && allowed.includes(value),
    `${path} must be one of: ${allowed.join(", ")}`,
  );
}

function validateConfidence(errors: string[], value: unknown, path: string): void {
  pushIfInvalid(errors, isNumber(value), `${path} must be a number`);
  if (isNumber(value) && (value < 0 || value > 1)) {
    errors.push(`${path} must be between 0 and 1`);
  }
}

function validateNonNegativeNumber(errors: string[], value: unknown, path: string): void {
  pushIfInvalid(errors, isNonNegativeNumber(value), `${path} must be a non-negative number`);
}

function validateNonNegativeInteger(errors: string[], value: unknown, path: string): void {
  pushIfInvalid(errors, isNonNegativeInteger(value), `${path} must be a non-negative integer`);
}

function validateOptionalNullableString(
  errors: string[],
  value: unknown,
  path: string,
  maxLength = LABEL_MAX_LENGTH,
): void {
  if (value === undefined) return;
  validateNullableString(errors, value, path, maxLength);
}

function validateOptionalPositiveInteger(
  errors: string[],
  value: unknown,
  path: string,
  maxValue: number,
): void {
  if (value === undefined) return;
  pushIfInvalid(errors, isNumber(value) && Number.isInteger(value), `${path} must be an integer`);
  if (isNumber(value) && (!Number.isInteger(value) || value < 1 || value > maxValue)) {
    errors.push(`${path} must be between 1 and ${maxValue}`);
  }
}

function validateIsoStringOrNull(errors: string[], value: unknown, path: string): void {
  if (value === null) return;
  validateRequiredString(errors, value, path, ID_MAX_LENGTH);
}

function validateRawPayload(errors: string[], value: unknown, path: string): void {
  if (value === null) return;
  pushIfInvalid(errors, isObject(value), `${path} must be an object or null`);
  if (!isObject(value)) return;

  try {
    const serialized = JSON.stringify(value);
    if (serialized.length > RAW_PAYLOAD_MAX_LENGTH) {
      errors.push(`${path} must serialize to ${RAW_PAYLOAD_MAX_LENGTH} characters or fewer`);
    }
  } catch {
    errors.push(`${path} must be JSON serializable`);
  }
}

function validateSourceRef(
  value: unknown,
  path: string,
  options: { expectedType?: SourceReference["sourceType"] } = {},
): ValidationResult {
  const errors = validateSourceReference(value, path).errors;
  if (!isObject(value)) {
    return { valid: false, errors };
  }

  validateConfidence(errors, value.confidence, `${path}.confidence`);
  validateRequiredString(errors, value.title, `${path}.title`, TITLE_MAX_LENGTH);
  validateNullableString(errors, value.url, `${path}.url`, SUMMARY_MAX_LENGTH);
  validateNullableString(errors, value.publisher, `${path}.publisher`, LABEL_MAX_LENGTH);
  if (options.expectedType) {
    pushIfInvalid(
      errors,
      value.sourceType === options.expectedType,
      `${path}.sourceType must be ${options.expectedType}`,
    );
  }

  return { valid: errors.length === 0, errors };
}

function sourceRefIdSet(sourceRefs: unknown): Set<string> {
  if (!Array.isArray(sourceRefs)) return new Set();
  return new Set(
    sourceRefs
      .filter(isObject)
      .map((sourceRef) => sourceRef.id)
      .filter((id): id is string => typeof id === "string" && id.trim().length > 0),
  );
}

function validateSourceRefIdArray(
  errors: string[],
  value: unknown,
  path: string,
  allowedSourceRefIds: Set<string>,
): void {
  validateStringArray(errors, value, path, { maxItems: ARRAY_MAX_ITEMS, maxItemLength: ID_MAX_LENGTH });

  if (!Array.isArray(value)) return;
  pushIfInvalid(errors, value.length > 0, `${path} must include at least one source reference`);
  value.forEach((sourceRefId, index) => {
    if (typeof sourceRefId === "string" && !allowedSourceRefIds.has(sourceRefId)) {
      errors.push(`${path}[${index}] references unknown sourceRef id ${sourceRefId}`);
    }
  });
}

function validateMeta(errors: string[], value: unknown, path: string): void {
  errors.push(...validateContractMeta(value, path).errors);
}

export function validateMarketSource(value: unknown, path = "marketSource"): ValidationResult {
  const errors: string[] = [];
  if (!isObject(value)) {
    return { valid: false, errors: [`${path} must be an object`] };
  }

  validateRequiredString(errors, value.id, `${path}.id`, ID_MAX_LENGTH);
  validateRequiredString(errors, value.name, `${path}.name`, TITLE_MAX_LENGTH);
  validateEnum(errors, value.type, MARKET_SOURCE_TYPES, `${path}.type`);
  validateEnum(errors, value.status, MARKET_SOURCE_STATUSES, `${path}.status`);
  validateRequiredString(errors, value.sourceRefType, `${path}.sourceRefType`, LABEL_MAX_LENGTH);
  validateNullableString(errors, value.baseUrl, `${path}.baseUrl`, SUMMARY_MAX_LENGTH);
  validateNullableString(errors, value.region, `${path}.region`, LABEL_MAX_LENGTH);
  validateEnum(errors, value.authMode, MARKET_SOURCE_AUTH_MODES, `${path}.authMode`);
  validateEnum(errors, value.piiRiskLevel, MARKET_SOURCE_PII_RISK_LEVELS, `${path}.piiRiskLevel`);
  validateNonNegativeNumber(errors, value.freshnessSlaHours, `${path}.freshnessSlaHours`);
  validateNullableString(errors, value.owner, `${path}.owner`, LABEL_MAX_LENGTH);
  validateNullableString(errors, value.notes, `${path}.notes`, SUMMARY_MAX_LENGTH);
  validateRequiredString(errors, value.createdAt, `${path}.createdAt`, ID_MAX_LENGTH);
  validateRequiredString(errors, value.updatedAt, `${path}.updatedAt`, ID_MAX_LENGTH);
  validateMeta(errors, value.meta, `${path}.meta`);

  return { valid: errors.length === 0, errors };
}

export function validateMarketIngestionRun(
  value: unknown,
  path = "marketIngestionRun",
): ValidationResult {
  const errors: string[] = [];
  if (!isObject(value)) {
    return { valid: false, errors: [`${path} must be an object`] };
  }

  validateRequiredString(errors, value.id, `${path}.id`, ID_MAX_LENGTH);
  validateRequiredString(errors, value.sourceId, `${path}.sourceId`, ID_MAX_LENGTH);
  validateRequiredString(errors, value.adapterName, `${path}.adapterName`, LABEL_MAX_LENGTH);
  validateEnum(errors, value.status, MARKET_INGESTION_RUN_STATUSES, `${path}.status`);
  validateEnum(errors, value.requestedBy, ["scheduler", "operator", "test_fixture"], `${path}.requestedBy`);
  validateRequiredString(errors, value.startedAt, `${path}.startedAt`, ID_MAX_LENGTH);
  validateIsoStringOrNull(errors, value.completedAt, `${path}.completedAt`);
  validateNonNegativeInteger(errors, value.documentsDiscovered, `${path}.documentsDiscovered`);
  validateNonNegativeInteger(errors, value.documentsCreated, `${path}.documentsCreated`);
  validateNonNegativeInteger(errors, value.documentsDeduped, `${path}.documentsDeduped`);
  validateNonNegativeInteger(errors, value.documentsFailed, `${path}.documentsFailed`);
  validateNullableString(errors, value.errorSummary, `${path}.errorSummary`, SUMMARY_MAX_LENGTH);
  validateMeta(errors, value.meta, `${path}.meta`);

  return { valid: errors.length === 0, errors };
}

export function validateMarketRawDocument(
  value: unknown,
  path = "marketRawDocument",
): ValidationResult {
  const errors: string[] = [];
  if (!isObject(value)) {
    return { valid: false, errors: [`${path} must be an object`] };
  }

  validateRequiredString(errors, value.id, `${path}.id`, ID_MAX_LENGTH);
  validateRequiredString(errors, value.sourceId, `${path}.sourceId`, ID_MAX_LENGTH);
  validateRequiredString(errors, value.ingestionRunId, `${path}.ingestionRunId`, ID_MAX_LENGTH);
  validateRequiredString(errors, value.sourceDocumentId, `${path}.sourceDocumentId`, ID_MAX_LENGTH);
  validateEnum(errors, value.documentType, MARKET_DOCUMENT_TYPES, `${path}.documentType`);
  validateRequiredString(errors, value.title, `${path}.title`, TITLE_MAX_LENGTH);
  validateNullableString(errors, value.url, `${path}.url`, SUMMARY_MAX_LENGTH);
  validateNullableString(errors, value.publisher, `${path}.publisher`, LABEL_MAX_LENGTH);
  validateNullableString(errors, value.region, `${path}.region`, LABEL_MAX_LENGTH);
  validateIsoStringOrNull(errors, value.publishedAt, `${path}.publishedAt`);
  validateRequiredString(errors, value.capturedAt, `${path}.capturedAt`, ID_MAX_LENGTH);
  validateRequiredString(errors, value.dedupeKey, `${path}.dedupeKey`, SUMMARY_MAX_LENGTH);
  validateRequiredString(errors, value.checksum, `${path}.checksum`, ID_MAX_LENGTH);
  validateRequiredString(errors, value.extractedText, `${path}.extractedText`, TEXT_MAX_LENGTH);
  validateRawPayload(errors, value.rawPayload, `${path}.rawPayload`);
  errors.push(...validateSourceRef(value.sourceRef, `${path}.sourceRef`).errors);
  if (isObject(value.sourceRef)) {
    pushIfInvalid(
      errors,
      value.sourceDocumentId === value.sourceRef.id || isString(value.sourceDocumentId),
      `${path}.sourceDocumentId is required when sourceRef is present`,
    );
  }
  validateMeta(errors, value.meta, `${path}.meta`);

  return { valid: errors.length === 0, errors };
}

export function validateNormalizedMarketSignal(
  value: unknown,
  path = "normalizedMarketSignal",
): ValidationResult {
  const errors: string[] = [];
  if (!isObject(value)) {
    return { valid: false, errors: [`${path} must be an object`] };
  }

  validateRequiredString(errors, value.id, `${path}.id`, ID_MAX_LENGTH);
  validateRequiredString(errors, value.sourceId, `${path}.sourceId`, ID_MAX_LENGTH);
  validateRequiredString(errors, value.ingestionRunId, `${path}.ingestionRunId`, ID_MAX_LENGTH);
  validateRequiredString(errors, value.rawDocumentId, `${path}.rawDocumentId`, ID_MAX_LENGTH);
  validateRequiredString(errors, value.sourceDocumentId, `${path}.sourceDocumentId`, ID_MAX_LENGTH);
  errors.push(...validateSourceRef(value.sourceRef, `${path}.sourceRef`).errors);
  validateEnum(errors, value.signalType, MARKET_SIGNAL_TYPES, `${path}.signalType`);
  validateNullableString(errors, value.canonicalRoleId, `${path}.canonicalRoleId`, ID_MAX_LENGTH);
  validateRequiredString(errors, value.observedRoleTitle, `${path}.observedRoleTitle`, TITLE_MAX_LENGTH);
  validateNullableString(errors, value.canonicalSkillId, `${path}.canonicalSkillId`, ID_MAX_LENGTH);
  validateRequiredString(errors, value.normalizedLabel, `${path}.normalizedLabel`, TITLE_MAX_LENGTH);
  if (value.requirementCategory !== null) {
    validateRequiredString(errors, value.requirementCategory, `${path}.requirementCategory`, LABEL_MAX_LENGTH);
  }
  if (value.requirementPriority !== null) {
    validateRequiredString(errors, value.requirementPriority, `${path}.requirementPriority`, LABEL_MAX_LENGTH);
  }
  if (value.seniorityBand !== null) {
    validateRequiredString(errors, value.seniorityBand, `${path}.seniorityBand`, LABEL_MAX_LENGTH);
  }
  validateNullableString(errors, value.region, `${path}.region`, LABEL_MAX_LENGTH);
  validateRequiredString(errors, value.value, `${path}.value`, SUMMARY_MAX_LENGTH);
  validateStringArray(errors, value.keywords, `${path}.keywords`);
  validateRequiredString(errors, value.evidenceText, `${path}.evidenceText`, SUMMARY_MAX_LENGTH);
  validateEnum(errors, value.direction, MARKET_SIGNAL_DIRECTIONS, `${path}.direction`);
  validateRequiredString(errors, value.observedAt, `${path}.observedAt`, ID_MAX_LENGTH);
  validateConfidence(errors, value.confidence, `${path}.confidence`);
  validateMeta(errors, value.meta, `${path}.meta`);

  return { valid: errors.length === 0, errors };
}

export function validateRoleTaxonomyRecord(
  value: unknown,
  path = "roleTaxonomyRecord",
): ValidationResult {
  const errors: string[] = [];
  if (!isObject(value)) {
    return { valid: false, errors: [`${path} must be an object`] };
  }

  validateRequiredString(errors, value.id, `${path}.id`, ID_MAX_LENGTH);
  validateRequiredString(errors, value.slug, `${path}.slug`, ID_MAX_LENGTH);
  validateRequiredString(errors, value.title, `${path}.title`, TITLE_MAX_LENGTH);
  validateRequiredString(errors, value.category, `${path}.category`, LABEL_MAX_LENGTH);
  validateRequiredString(errors, value.roleType, `${path}.roleType`, LABEL_MAX_LENGTH);
  validateStringArray(errors, value.aliases, `${path}.aliases`);
  validateStringArray(errors, value.relatedRoleIds, `${path}.relatedRoleIds`);
  pushIfInvalid(errors, Array.isArray(value.sourceRefs), `${path}.sourceRefs must be an array`);
  const ids = sourceRefIdSet(value.sourceRefs);
  if (Array.isArray(value.sourceRefs)) {
    value.sourceRefs.forEach((sourceRef, index) => {
      errors.push(...validateSourceRef(sourceRef, `${path}.sourceRefs[${index}]`).errors);
    });
  }
  pushIfInvalid(errors, ids.size > 0, `${path}.sourceRefs must include at least one source`);
  validateConfidence(errors, value.confidence, `${path}.confidence`);
  validateRequiredString(errors, value.updatedAt, `${path}.updatedAt`, ID_MAX_LENGTH);
  validateMeta(errors, value.meta, `${path}.meta`);

  return { valid: errors.length === 0, errors };
}

export function validateSkillTaxonomyRecord(
  value: unknown,
  path = "skillTaxonomyRecord",
): ValidationResult {
  const errors: string[] = [];
  if (!isObject(value)) {
    return { valid: false, errors: [`${path} must be an object`] };
  }

  validateRequiredString(errors, value.id, `${path}.id`, ID_MAX_LENGTH);
  validateRequiredString(errors, value.slug, `${path}.slug`, ID_MAX_LENGTH);
  validateRequiredString(errors, value.canonicalLabel, `${path}.canonicalLabel`, TITLE_MAX_LENGTH);
  validateStringArray(errors, value.aliases, `${path}.aliases`);
  validateStringArray(errors, value.categories, `${path}.categories`);
  validateStringArray(errors, value.relatedSkillIds, `${path}.relatedSkillIds`);
  pushIfInvalid(errors, Array.isArray(value.sourceRefs), `${path}.sourceRefs must be an array`);
  const ids = sourceRefIdSet(value.sourceRefs);
  if (Array.isArray(value.sourceRefs)) {
    value.sourceRefs.forEach((sourceRef, index) => {
      errors.push(...validateSourceRef(sourceRef, `${path}.sourceRefs[${index}]`).errors);
    });
  }
  pushIfInvalid(errors, ids.size > 0, `${path}.sourceRefs must include at least one source`);
  validateConfidence(errors, value.confidence, `${path}.confidence`);
  validateRequiredString(errors, value.updatedAt, `${path}.updatedAt`, ID_MAX_LENGTH);
  validateMeta(errors, value.meta, `${path}.meta`);

  return { valid: errors.length === 0, errors };
}

function validateDemandAggregate(errors: string[], value: unknown, path: string): void {
  pushIfInvalid(errors, isObject(value), `${path} must be an object`);
  if (!isObject(value)) return;

  validateNonNegativeNumber(errors, value.score, `${path}.score`);
  validateEnum(errors, value.direction, MARKET_SIGNAL_DIRECTIONS, `${path}.direction`);
  validateNonNegativeInteger(errors, value.sampleSize, `${path}.sampleSize`);
  validateNonNegativeInteger(errors, value.sourceDiversity, `${path}.sourceDiversity`);
  validateConfidence(errors, value.confidence, `${path}.confidence`);
}

function validateSkillAggregate(
  errors: string[],
  value: unknown,
  path: string,
  allowedSourceRefIds: Set<string>,
): void {
  pushIfInvalid(errors, isObject(value), `${path} must be an object`);
  if (!isObject(value)) return;

  validateNullableString(errors, value.skillId, `${path}.skillId`, ID_MAX_LENGTH);
  validateRequiredString(errors, value.label, `${path}.label`, TITLE_MAX_LENGTH);
  validateNullableString(errors, value.category, `${path}.category`, LABEL_MAX_LENGTH);
  validateNonNegativeInteger(errors, value.mentionCount, `${path}.mentionCount`);
  validateConfidence(errors, value.demandShare, `${path}.demandShare`);
  validateEnum(errors, value.direction, MARKET_SIGNAL_DIRECTIONS, `${path}.direction`);
  validateSourceRefIdArray(errors, value.sourceRefIds, `${path}.sourceRefIds`, allowedSourceRefIds);
  validateConfidence(errors, value.confidence, `${path}.confidence`);
}

function validateRequirementAggregate(
  errors: string[],
  value: unknown,
  path: string,
  allowedSourceRefIds: Set<string>,
): void {
  pushIfInvalid(errors, isObject(value), `${path} must be an object`);
  if (!isObject(value)) return;

  validateRequiredString(errors, value.label, `${path}.label`, TITLE_MAX_LENGTH);
  validateRequiredString(errors, value.category, `${path}.category`, LABEL_MAX_LENGTH);
  validateRequiredString(errors, value.priority, `${path}.priority`, LABEL_MAX_LENGTH);
  validateNonNegativeInteger(errors, value.mentionCount, `${path}.mentionCount`);
  validateStringArray(errors, value.keywords, `${path}.keywords`);
  validateSourceRefIdArray(errors, value.sourceRefIds, `${path}.sourceRefIds`, allowedSourceRefIds);
  validateConfidence(errors, value.confidence, `${path}.confidence`);
}

function validateSeniorityAggregate(
  errors: string[],
  value: unknown,
  path: string,
  allowedSourceRefIds: Set<string>,
): void {
  pushIfInvalid(errors, isObject(value), `${path} must be an object`);
  if (!isObject(value)) return;

  validateRequiredString(errors, value.seniorityBand, `${path}.seniorityBand`, LABEL_MAX_LENGTH);
  validateConfidence(errors, value.share, `${path}.share`);
  validateNonNegativeInteger(errors, value.mentionCount, `${path}.mentionCount`);
  validateSourceRefIdArray(errors, value.sourceRefIds, `${path}.sourceRefIds`, allowedSourceRefIds);
  validateConfidence(errors, value.confidence, `${path}.confidence`);
}

function validateRemotePolicyAggregate(
  errors: string[],
  value: unknown,
  path: string,
  allowedSourceRefIds: Set<string>,
): void {
  pushIfInvalid(errors, isObject(value), `${path} must be an object`);
  if (!isObject(value)) return;

  validateEnum(errors, value.policy, ["remote", "hybrid", "on-site", "unknown"], `${path}.policy`);
  validateConfidence(errors, value.share, `${path}.share`);
  validateNonNegativeInteger(errors, value.mentionCount, `${path}.mentionCount`);
  validateSourceRefIdArray(errors, value.sourceRefIds, `${path}.sourceRefIds`, allowedSourceRefIds);
  validateConfidence(errors, value.confidence, `${path}.confidence`);
}

function validateNullableNonNegativeNumber(
  errors: string[],
  value: unknown,
  path: string,
): void {
  if (value === null) return;
  validateNonNegativeNumber(errors, value, path);
}

function validateSalaryAggregate(
  errors: string[],
  value: unknown,
  path: string,
  allowedSourceRefIds: Set<string>,
): void {
  pushIfInvalid(errors, isObject(value), `${path} must be an object`);
  if (!isObject(value)) return;

  validateRequiredString(errors, value.label, `${path}.label`, TITLE_MAX_LENGTH);
  validateNullableNonNegativeNumber(errors, value.salaryMin, `${path}.salaryMin`);
  validateNullableNonNegativeNumber(errors, value.salaryMax, `${path}.salaryMax`);
  validateNonNegativeInteger(errors, value.mentionCount, `${path}.mentionCount`);
  validateSourceRefIdArray(errors, value.sourceRefIds, `${path}.sourceRefIds`, allowedSourceRefIds);
  validateConfidence(errors, value.confidence, `${path}.confidence`);
}

function validateAiImpactAggregate(
  errors: string[],
  value: unknown,
  path: string,
  allowedSourceRefIds: Set<string>,
): void {
  pushIfInvalid(errors, isObject(value), `${path} must be an object`);
  if (!isObject(value)) return;

  validateRequiredString(errors, value.impact, `${path}.impact`, LABEL_MAX_LENGTH);
  validateRequiredString(errors, value.summary, `${path}.summary`, SUMMARY_MAX_LENGTH);
  validateStringArray(errors, value.affectedSkills, `${path}.affectedSkills`);
  validateSourceRefIdArray(errors, value.sourceRefIds, `${path}.sourceRefIds`, allowedSourceRefIds);
  validateConfidence(errors, value.confidence, `${path}.confidence`);
}

export function validateRoleMarketSignalAggregate(
  value: unknown,
  path = "roleMarketSignalAggregate",
): ValidationResult {
  const errors: string[] = [];
  if (!isObject(value)) {
    return { valid: false, errors: [`${path} must be an object`] };
  }

  validateRequiredString(errors, value.id, `${path}.id`, ID_MAX_LENGTH);
  validateRequiredString(errors, value.roleProfileId, `${path}.roleProfileId`, ID_MAX_LENGTH);
  validateRequiredString(errors, value.roleTitle, `${path}.roleTitle`, TITLE_MAX_LENGTH);
  validateRequiredString(errors, value.category, `${path}.category`, LABEL_MAX_LENGTH);
  validateNullableString(errors, value.region, `${path}.region`, LABEL_MAX_LENGTH);
  validateEnum(errors, value.sourceMode, ["curated", "hybrid", "live"], `${path}.sourceMode`);
  validateRequiredString(errors, value.windowStart, `${path}.windowStart`, ID_MAX_LENGTH);
  validateRequiredString(errors, value.windowEnd, `${path}.windowEnd`, ID_MAX_LENGTH);
  validateNonNegativeInteger(errors, value.sampleSize, `${path}.sampleSize`);
  validateNonNegativeInteger(errors, value.sourceCount, `${path}.sourceCount`);
  pushIfInvalid(errors, Array.isArray(value.sourceRefs), `${path}.sourceRefs must be an array`);
  const allowedSourceRefIds = sourceRefIdSet(value.sourceRefs);
  pushIfInvalid(errors, allowedSourceRefIds.size > 0, `${path}.sourceRefs must include at least one source`);
  if (Array.isArray(value.sourceRefs)) {
    value.sourceRefs.forEach((sourceRef, index) => {
      errors.push(...validateSourceRef(sourceRef, `${path}.sourceRefs[${index}]`).errors);
    });
  }
  validateDemandAggregate(errors, value.demand, `${path}.demand`);

  pushIfInvalid(errors, Array.isArray(value.topSkills), `${path}.topSkills must be an array`);
  if (Array.isArray(value.topSkills)) {
    value.topSkills.forEach((skill, index) => {
      validateSkillAggregate(errors, skill, `${path}.topSkills[${index}]`, allowedSourceRefIds);
    });
  }

  pushIfInvalid(errors, Array.isArray(value.requirements), `${path}.requirements must be an array`);
  if (Array.isArray(value.requirements)) {
    value.requirements.forEach((requirement, index) => {
      validateRequirementAggregate(
        errors,
        requirement,
        `${path}.requirements[${index}]`,
        allowedSourceRefIds,
      );
    });
  }

  pushIfInvalid(errors, Array.isArray(value.seniority), `${path}.seniority must be an array`);
  if (Array.isArray(value.seniority)) {
    value.seniority.forEach((seniority, index) => {
      validateSeniorityAggregate(
        errors,
        seniority,
        `${path}.seniority[${index}]`,
        allowedSourceRefIds,
      );
    });
  }

  pushIfInvalid(errors, Array.isArray(value.remotePolicy), `${path}.remotePolicy must be an array`);
  if (Array.isArray(value.remotePolicy)) {
    value.remotePolicy.forEach((remotePolicy, index) => {
      validateRemotePolicyAggregate(
        errors,
        remotePolicy,
        `${path}.remotePolicy[${index}]`,
        allowedSourceRefIds,
      );
    });
  }

  pushIfInvalid(errors, Array.isArray(value.salary), `${path}.salary must be an array`);
  if (Array.isArray(value.salary)) {
    value.salary.forEach((salary, index) => {
      validateSalaryAggregate(
        errors,
        salary,
        `${path}.salary[${index}]`,
        allowedSourceRefIds,
      );
    });
  }

  pushIfInvalid(errors, Array.isArray(value.aiImpact), `${path}.aiImpact must be an array`);
  if (Array.isArray(value.aiImpact)) {
    value.aiImpact.forEach((impact, index) => {
      validateAiImpactAggregate(
        errors,
        impact,
        `${path}.aiImpact[${index}]`,
        allowedSourceRefIds,
      );
    });
  }

  validateNonNegativeNumber(errors, value.freshnessHours, `${path}.freshnessHours`);
  validateConfidence(errors, value.confidence, `${path}.confidence`);
  validateRequiredString(errors, value.generatedAt, `${path}.generatedAt`, ID_MAX_LENGTH);
  validateMeta(errors, value.meta, `${path}.meta`);

  return { valid: errors.length === 0, errors };
}

export function validateMarketProfileValidationResult(
  value: unknown,
  path = "marketProfileValidationResult",
): ValidationResult {
  const errors: string[] = [];
  if (!isObject(value)) {
    return { valid: false, errors: [`${path} must be an object`] };
  }

  validateRequiredString(errors, value.profileVersionId, `${path}.profileVersionId`, ID_MAX_LENGTH);
  validateEnum(errors, value.status, MARKET_PROFILE_VALIDATION_STATUSES, `${path}.status`);
  pushIfInvalid(errors, typeof value.canPublish === "boolean", `${path}.canPublish must be boolean`);
  validateRequiredString(errors, value.checkedAt, `${path}.checkedAt`, ID_MAX_LENGTH);

  pushIfInvalid(errors, Array.isArray(value.findings), `${path}.findings must be an array`);
  if (Array.isArray(value.findings)) {
    value.findings.forEach((finding, index) => {
      const findingPath = `${path}.findings[${index}]`;
      pushIfInvalid(errors, isObject(finding), `${findingPath} must be an object`);
      if (!isObject(finding)) return;

      validateRequiredString(errors, finding.id, `${findingPath}.id`, ID_MAX_LENGTH);
      validateEnum(errors, finding.severity, MARKET_PROFILE_VALIDATION_SEVERITIES, `${findingPath}.severity`);
      validateRequiredString(errors, finding.code, `${findingPath}.code`, LABEL_MAX_LENGTH);
      validateRequiredString(errors, finding.message, `${findingPath}.message`, SUMMARY_MAX_LENGTH);
      validateRequiredString(errors, finding.path, `${findingPath}.path`, SUMMARY_MAX_LENGTH);
      validateStringArray(errors, finding.sourceRefIds, `${findingPath}.sourceRefIds`);
    });
  }

  pushIfInvalid(errors, isObject(value.sourceIntegrity), `${path}.sourceIntegrity must be an object`);
  if (isObject(value.sourceIntegrity)) {
    validateNonNegativeInteger(
      errors,
      value.sourceIntegrity.sourceRefCount,
      `${path}.sourceIntegrity.sourceRefCount`,
    );
    validateNonNegativeInteger(
      errors,
      value.sourceIntegrity.missingSourceRefCount,
      `${path}.sourceIntegrity.missingSourceRefCount`,
    );
    validateNonNegativeInteger(
      errors,
      value.sourceIntegrity.staleSourceRefCount,
      `${path}.sourceIntegrity.staleSourceRefCount`,
    );
  }

  validateNonNegativeNumber(errors, value.freshnessHours, `${path}.freshnessHours`);
  validateConfidence(errors, value.confidence, `${path}.confidence`);
  validateMeta(errors, value.meta, `${path}.meta`);

  if (
    value.status === "blocked" &&
    value.canPublish === true
  ) {
    errors.push(`${path}.canPublish must be false when status is blocked`);
  }

  return { valid: errors.length === 0, errors };
}

function validateRequirementSnapshot(
  errors: string[],
  value: unknown,
  path: string,
): void {
  pushIfInvalid(errors, isObject(value), `${path} must be an object`);
  if (!isObject(value)) return;

  validateNullableString(errors, value.requirementId, `${path}.requirementId`, ID_MAX_LENGTH);
  validateRequiredString(errors, value.label, `${path}.label`, TITLE_MAX_LENGTH);
  validateRequiredString(errors, value.category, `${path}.category`, LABEL_MAX_LENGTH);
  validateRequiredString(errors, value.priority, `${path}.priority`, LABEL_MAX_LENGTH);
  validateStringArray(errors, value.keywords, `${path}.keywords`);
  validateStringArray(errors, value.sourceRefIds, `${path}.sourceRefIds`);
  validateConfidence(errors, value.confidence, `${path}.confidence`);
}

function validateRequirementDiffItem(
  errors: string[],
  value: unknown,
  path: string,
): void {
  pushIfInvalid(errors, isObject(value), `${path} must be an object`);
  if (!isObject(value)) return;

  validateRequiredString(errors, value.label, `${path}.label`, TITLE_MAX_LENGTH);
  if (value.before !== null) validateRequirementSnapshot(errors, value.before, `${path}.before`);
  if (value.after !== null) validateRequirementSnapshot(errors, value.after, `${path}.after`);
  pushIfInvalid(errors, value.before !== null || value.after !== null, `${path} must include before or after`);
  validateRequiredString(errors, value.changeSummary, `${path}.changeSummary`, SUMMARY_MAX_LENGTH);
}

function validateStringListDiff(
  errors: string[],
  value: unknown,
  path: string,
): void {
  pushIfInvalid(errors, isObject(value), `${path} must be an object`);
  if (!isObject(value)) return;

  validateStringArray(errors, value.added, `${path}.added`);
  validateStringArray(errors, value.removed, `${path}.removed`);
  validateNonNegativeInteger(errors, value.unchangedCount, `${path}.unchangedCount`);
}

export function validateMarketProfileDiff(
  value: unknown,
  path = "marketProfileDiff",
): ValidationResult {
  const errors: string[] = [];
  if (!isObject(value)) {
    return { valid: false, errors: [`${path} must be an object`] };
  }

  validateRequiredString(errors, value.profileVersionId, `${path}.profileVersionId`, ID_MAX_LENGTH);
  validateRequiredString(errors, value.roleProfileId, `${path}.roleProfileId`, ID_MAX_LENGTH);
  validateNullableString(errors, value.previousProfileVersionId, `${path}.previousProfileVersionId`, ID_MAX_LENGTH);
  validateRequiredString(errors, value.generatedAt, `${path}.generatedAt`, ID_MAX_LENGTH);
  validateEnum(errors, value.materiality, ["low", "medium", "high"], `${path}.materiality`);
  validateRequiredString(errors, value.summary, `${path}.summary`, SUMMARY_MAX_LENGTH);

  pushIfInvalid(errors, isObject(value.requirements), `${path}.requirements must be an object`);
  if (isObject(value.requirements)) {
    const requirements = value.requirements;
    (["added", "removed", "changed"] as const).forEach((key) => {
      const requirementItems = requirements[key];
      pushIfInvalid(errors, Array.isArray(requirementItems), `${path}.requirements.${key} must be an array`);
      if (Array.isArray(requirementItems)) {
        requirementItems.forEach((item, index) => {
          validateRequirementDiffItem(errors, item, `${path}.requirements.${key}[${index}]`);
        });
      }
    });
  }

  validateStringListDiff(errors, value.topSkills, `${path}.topSkills`);
  validateStringListDiff(errors, value.proofExpectations, `${path}.proofExpectations`);
  validateStringListDiff(errors, value.trendSignals, `${path}.trendSignals`);

  pushIfInvalid(errors, isObject(value.sourceRefs), `${path}.sourceRefs must be an object`);
  if (isObject(value.sourceRefs)) {
    validateStringArray(errors, value.sourceRefs.addedSourceRefIds, `${path}.sourceRefs.addedSourceRefIds`);
    validateStringArray(errors, value.sourceRefs.removedSourceRefIds, `${path}.sourceRefs.removedSourceRefIds`);
    validateNonNegativeInteger(errors, value.sourceRefs.unchangedCount, `${path}.sourceRefs.unchangedCount`);
  }

  pushIfInvalid(errors, isObject(value.confidence), `${path}.confidence must be an object`);
  if (isObject(value.confidence)) {
    validateConfidence(errors, value.confidence.before, `${path}.confidence.before`);
    validateConfidence(errors, value.confidence.after, `${path}.confidence.after`);
    pushIfInvalid(errors, isNumber(value.confidence.delta), `${path}.confidence.delta must be a number`);
  }

  validateMeta(errors, value.meta, `${path}.meta`);

  return { valid: errors.length === 0, errors };
}

function validateProfileSourceReferences(
  errors: string[],
  value: Record<string, unknown>,
  path: string,
): void {
  const profile = value.profile;
  if (!isObject(profile)) return;

  const sourceRefs = profile.sourceRefs;
  const allowedSourceRefIds = sourceRefIdSet(sourceRefs);
  pushIfInvalid(
    errors,
    allowedSourceRefIds.size > 0,
    `${path}.profile.sourceRefs must include at least one source`,
  );

  if (Array.isArray(sourceRefs)) {
    sourceRefs.forEach((sourceRef, index) => {
      errors.push(...validateSourceRef(sourceRef, `${path}.profile.sourceRefs[${index}]`).errors);
    });
  }

  if (Array.isArray(profile.requirements)) {
    profile.requirements.forEach((requirement, index) => {
      if (!isObject(requirement)) return;
      validateSourceRefIdArray(
        errors,
        requirement.sourceRefs,
        `${path}.profile.requirements[${index}].sourceRefs`,
        allowedSourceRefIds,
      );
      validateConfidence(errors, requirement.confidence, `${path}.profile.requirements[${index}].confidence`);
    });
  }

  if (Array.isArray(profile.trendSignals)) {
    profile.trendSignals.forEach((trendSignal, index) => {
      if (!isObject(trendSignal)) return;
      validateSourceRefIdArray(
        errors,
        trendSignal.sourceRefs,
        `${path}.profile.trendSignals[${index}].sourceRefs`,
        allowedSourceRefIds,
      );
      validateConfidence(errors, trendSignal.confidence, `${path}.profile.trendSignals[${index}].confidence`);
    });
  }

  validateConfidence(errors, profile.confidence, `${path}.profile.confidence`);
}

export function validateRoleMarketProfileVersion(
  value: unknown,
  path = "roleMarketProfileVersion",
): ValidationResult {
  const errors: string[] = [];
  if (!isObject(value)) {
    return { valid: false, errors: [`${path} must be an object`] };
  }

  validateRequiredString(errors, value.id, `${path}.id`, ID_MAX_LENGTH);
  validateRequiredString(errors, value.roleProfileId, `${path}.roleProfileId`, ID_MAX_LENGTH);
  validateNonNegativeInteger(errors, value.version, `${path}.version`);
  validateEnum(errors, value.status, ROLE_MARKET_PROFILE_VERSION_STATUSES, `${path}.status`);
  validateEnum(errors, value.sourceMode, ["curated", "hybrid", "live"], `${path}.sourceMode`);
  errors.push(...validateRoleMarketProfile(value.profile, `${path}.profile`).errors);
  validateNullableString(errors, value.aggregateId, `${path}.aggregateId`, ID_MAX_LENGTH);
  validateNullableString(errors, value.previousVersionId, `${path}.previousVersionId`, ID_MAX_LENGTH);
  pushIfInvalid(errors, Array.isArray(value.sourceRefs), `${path}.sourceRefs must be an array`);
  if (Array.isArray(value.sourceRefs)) {
    pushIfInvalid(errors, value.sourceRefs.length > 0, `${path}.sourceRefs must include at least one source`);
    value.sourceRefs.forEach((sourceRef, index) => {
      errors.push(...validateSourceRef(sourceRef, `${path}.sourceRefs[${index}]`).errors);
    });
  }
  validateRequiredString(errors, value.changeSummary, `${path}.changeSummary`, SUMMARY_MAX_LENGTH);
  if (value.profileDiff !== null) {
    errors.push(...validateMarketProfileDiff(value.profileDiff, `${path}.profileDiff`).errors);
    if (isObject(value.profileDiff)) {
      pushIfInvalid(
        errors,
        value.profileDiff.profileVersionId === value.id,
        `${path}.profileDiff.profileVersionId must match ${path}.id`,
      );
      pushIfInvalid(
        errors,
        value.profileDiff.roleProfileId === value.roleProfileId,
        `${path}.profileDiff.roleProfileId must match ${path}.roleProfileId`,
      );
    }
  }
  if (value.validationResult !== null) {
    errors.push(
      ...validateMarketProfileValidationResult(
        value.validationResult,
        `${path}.validationResult`,
      ).errors,
    );
    if (isObject(value.validationResult)) {
      pushIfInvalid(
        errors,
        value.validationResult.profileVersionId === value.id,
        `${path}.validationResult.profileVersionId must match ${path}.id`,
      );
    }
  }
  validateRequiredString(errors, value.createdBy, `${path}.createdBy`, LABEL_MAX_LENGTH);
  validateRequiredString(errors, value.createdAt, `${path}.createdAt`, ID_MAX_LENGTH);
  validateNullableString(errors, value.reviewedBy, `${path}.reviewedBy`, LABEL_MAX_LENGTH);
  validateIsoStringOrNull(errors, value.reviewedAt, `${path}.reviewedAt`);
  validateIsoStringOrNull(errors, value.publishedAt, `${path}.publishedAt`);
  validateNullableString(errors, value.rollbackOfVersionId, `${path}.rollbackOfVersionId`, ID_MAX_LENGTH);
  validateMeta(errors, value.meta, `${path}.meta`);
  validateProfileSourceReferences(errors, value, path);

  return { valid: errors.length === 0, errors };
}

export function validateMarketSourceHealth(
  value: unknown,
  path = "marketSourceHealth",
): ValidationResult {
  const errors: string[] = [];
  if (!isObject(value)) {
    return { valid: false, errors: [`${path} must be an object`] };
  }

  validateRequiredString(errors, value.sourceId, `${path}.sourceId`, ID_MAX_LENGTH);
  validateEnum(errors, value.status, MARKET_SOURCE_HEALTH_STATUSES, `${path}.status`);
  validateRequiredString(errors, value.checkedAt, `${path}.checkedAt`, ID_MAX_LENGTH);
  validateNullableString(errors, value.latestRunId, `${path}.latestRunId`, ID_MAX_LENGTH);
  if (value.latestRunStatus !== null) {
    validateEnum(errors, value.latestRunStatus, MARKET_INGESTION_RUN_STATUSES, `${path}.latestRunStatus`);
  }
  validateIsoStringOrNull(errors, value.lastSuccessfulRunAt, `${path}.lastSuccessfulRunAt`);
  validateNonNegativeInteger(errors, value.consecutiveFailures, `${path}.consecutiveFailures`);
  if (value.freshnessAgeHours !== null) {
    validateNonNegativeNumber(errors, value.freshnessAgeHours, `${path}.freshnessAgeHours`);
  }
  validateNonNegativeInteger(errors, value.documentsLastRun, `${path}.documentsLastRun`);
  validateNonNegativeInteger(errors, value.signalsLastRun, `${path}.signalsLastRun`);
  validateNullableString(errors, value.errorSummary, `${path}.errorSummary`, SUMMARY_MAX_LENGTH);
  validateMeta(errors, value.meta, `${path}.meta`);

  return { valid: errors.length === 0, errors };
}

export function validateOperatorMarketSourcesResponse(
  value: unknown,
  path = "operatorMarketSourcesResponse",
): ValidationResult {
  const errors: string[] = [];
  if (!isObject(value)) {
    return { valid: false, errors: [`${path} must be an object`] };
  }

  pushIfInvalid(errors, Array.isArray(value.sources), `${path}.sources must be an array`);
  if (Array.isArray(value.sources)) {
    value.sources.forEach((item, index) => {
      const itemPath = `${path}.sources[${index}]`;
      if (!isObject(item)) {
        errors.push(`${itemPath} must be an object`);
        return;
      }
      errors.push(...validateMarketSource(item.source, `${itemPath}.source`).errors);
      errors.push(...validateMarketSourceHealth(item.health, `${itemPath}.health`).errors);
      if (item.latestRun !== null) {
        errors.push(...validateMarketIngestionRun(item.latestRun, `${itemPath}.latestRun`).errors);
      }
    });
  }
  validateMeta(errors, value.meta, `${path}.meta`);

  return { valid: errors.length === 0, errors };
}

export function validateOperatorMarketIngestionRunsResponse(
  value: unknown,
  path = "operatorMarketIngestionRunsResponse",
): ValidationResult {
  const errors: string[] = [];
  if (!isObject(value)) {
    return { valid: false, errors: [`${path} must be an object`] };
  }

  pushIfInvalid(errors, Array.isArray(value.runs), `${path}.runs must be an array`);
  if (Array.isArray(value.runs)) {
    value.runs.forEach((run, index) => {
      errors.push(...validateMarketIngestionRun(run, `${path}.runs[${index}]`).errors);
    });
  }
  validateMeta(errors, value.meta, `${path}.meta`);

  return { valid: errors.length === 0, errors };
}

export function validateOperatorMarketAggregatesResponse(
  value: unknown,
  path = "operatorMarketAggregatesResponse",
): ValidationResult {
  const errors: string[] = [];
  if (!isObject(value)) {
    return { valid: false, errors: [`${path} must be an object`] };
  }

  pushIfInvalid(errors, Array.isArray(value.aggregates), `${path}.aggregates must be an array`);
  if (Array.isArray(value.aggregates)) {
    value.aggregates.forEach((item, index) => {
      const itemPath = `${path}.aggregates[${index}]`;
      if (!isObject(item)) {
        errors.push(`${itemPath} must be an object`);
        return;
      }
      validateRequiredString(errors, item.roleProfileId, `${itemPath}.roleProfileId`, ID_MAX_LENGTH);
      validateRequiredString(errors, item.roleTitle, `${itemPath}.roleTitle`, TITLE_MAX_LENGTH);
      validateRequiredString(errors, item.category, `${itemPath}.category`, LABEL_MAX_LENGTH);
      if (item.latestAggregate !== null) {
        errors.push(
          ...validateRoleMarketSignalAggregate(
            item.latestAggregate,
            `${itemPath}.latestAggregate`,
          ).errors,
        );
        if (isObject(item.latestAggregate)) {
          pushIfInvalid(
            errors,
            item.latestAggregate.roleProfileId === item.roleProfileId,
            `${itemPath}.latestAggregate.roleProfileId must match ${itemPath}.roleProfileId`,
          );
        }
      }
    });
  }
  validateMeta(errors, value.meta, `${path}.meta`);

  return { valid: errors.length === 0, errors };
}

export function validateOperatorMarketProfileDraftsResponse(
  value: unknown,
  path = "operatorMarketProfileDraftsResponse",
): ValidationResult {
  const errors: string[] = [];
  if (!isObject(value)) {
    return { valid: false, errors: [`${path} must be an object`] };
  }

  pushIfInvalid(errors, Array.isArray(value.drafts), `${path}.drafts must be an array`);
  if (Array.isArray(value.drafts)) {
    value.drafts.forEach((item, index) => {
      const itemPath = `${path}.drafts[${index}]`;
      if (!isObject(item)) {
        errors.push(`${itemPath} must be an object`);
        return;
      }

      validateRequiredString(errors, item.roleProfileId, `${itemPath}.roleProfileId`, ID_MAX_LENGTH);
      validateRequiredString(errors, item.roleTitle, `${itemPath}.roleTitle`, TITLE_MAX_LENGTH);
      validateRequiredString(errors, item.category, `${itemPath}.category`, LABEL_MAX_LENGTH);
      errors.push(...validateRoleMarketProfileVersion(item.draftVersion, `${itemPath}.draftVersion`).errors);
      if (item.currentPublishedVersion !== null) {
        errors.push(...validateRoleMarketProfileVersion(
          item.currentPublishedVersion,
          `${itemPath}.currentPublishedVersion`,
        ).errors);
      }
      if (item.validationStatus !== null) {
        validateEnum(errors, item.validationStatus, MARKET_PROFILE_VALIDATION_STATUSES, `${itemPath}.validationStatus`);
      }
      pushIfInvalid(errors, typeof item.canPublish === "boolean", `${itemPath}.canPublish must be boolean`);
      validateNonNegativeInteger(errors, item.blockerCount, `${itemPath}.blockerCount`);
      validateNonNegativeInteger(errors, item.warningCount, `${itemPath}.warningCount`);
      validateNonNegativeInteger(errors, item.sourceRefCount, `${itemPath}.sourceRefCount`);
      validateNonNegativeInteger(errors, item.staleSourceRefCount, `${itemPath}.staleSourceRefCount`);
      validateNonNegativeInteger(errors, item.missingSourceRefCount, `${itemPath}.missingSourceRefCount`);
      if (item.materiality !== null) {
        validateEnum(errors, item.materiality, ["low", "medium", "high"], `${itemPath}.materiality`);
      }

      if (isObject(item.draftVersion)) {
        const draftProfile = isObject(item.draftVersion.profile) ? item.draftVersion.profile : null;
        pushIfInvalid(
          errors,
          item.roleProfileId === item.draftVersion.roleProfileId,
          `${itemPath}.roleProfileId must match draftVersion.roleProfileId`,
        );
        pushIfInvalid(
          errors,
          draftProfile !== null && item.roleTitle === draftProfile.title,
          `${itemPath}.roleTitle must match draftVersion.profile.title`,
        );
        pushIfInvalid(
          errors,
          draftProfile !== null && item.category === draftProfile.category,
          `${itemPath}.category must match draftVersion.profile.category`,
        );
        pushIfInvalid(
          errors,
          item.draftVersion.status === "draft" || item.draftVersion.status === "in_review",
          `${itemPath}.draftVersion.status must be draft or in_review`,
        );
      }
      if (isObject(item.currentPublishedVersion)) {
        pushIfInvalid(
          errors,
          item.currentPublishedVersion.status === "published",
          `${itemPath}.currentPublishedVersion.status must be published`,
        );
        pushIfInvalid(
          errors,
          item.currentPublishedVersion.roleProfileId === item.roleProfileId,
          `${itemPath}.currentPublishedVersion.roleProfileId must match roleProfileId`,
        );
      }
    });
  }
  validateMeta(errors, value.meta, `${path}.meta`);

  return { valid: errors.length === 0, errors };
}

export function validateOperatorMarketProfileActionResponse(
  value: unknown,
  path = "operatorMarketProfileActionResponse",
): ValidationResult {
  const errors: string[] = [];
  if (!isObject(value)) {
    return { valid: false, errors: [`${path} must be an object`] };
  }

  errors.push(...validateRoleMarketProfileVersion(value.profileVersion, `${path}.profileVersion`).errors);
  errors.push(...validateMarketReviewAction(value.auditAction, `${path}.auditAction`).errors);
  validateMeta(errors, value.meta, `${path}.meta`);

  if (isObject(value.profileVersion) && isObject(value.auditAction)) {
    pushIfInvalid(
      errors,
      value.profileVersion.id === value.auditAction.profileVersionId,
      `${path}.auditAction.profileVersionId must match profileVersion.id`,
    );
    pushIfInvalid(
      errors,
      value.profileVersion.status === value.auditAction.afterStatus,
      `${path}.auditAction.afterStatus must match profileVersion.status`,
    );
  }

  return { valid: errors.length === 0, errors };
}

export function validateOperatorMarketProfileVersionsResponse(
  value: unknown,
  path = "operatorMarketProfileVersionsResponse",
): ValidationResult {
  const errors: string[] = [];
  if (!isObject(value)) {
    return { valid: false, errors: [`${path} must be an object`] };
  }

  pushIfInvalid(errors, Array.isArray(value.versions), `${path}.versions must be an array`);
  if (Array.isArray(value.versions)) {
    value.versions.forEach((item, index) => {
      const itemPath = `${path}.versions[${index}]`;
      if (!isObject(item)) {
        errors.push(`${itemPath} must be an object`);
        return;
      }

      validateRequiredString(errors, item.roleProfileId, `${itemPath}.roleProfileId`, ID_MAX_LENGTH);
      validateRequiredString(errors, item.roleTitle, `${itemPath}.roleTitle`, LABEL_MAX_LENGTH);
      validateRequiredString(errors, item.category, `${itemPath}.category`, LABEL_MAX_LENGTH);
      errors.push(...validateRoleMarketProfileVersion(item.profileVersion, `${itemPath}.profileVersion`).errors);
      pushIfInvalid(errors, typeof item.isCurrentPublished === "boolean", `${itemPath}.isCurrentPublished must be boolean`);
      pushIfInvalid(errors, typeof item.canRollback === "boolean", `${itemPath}.canRollback must be boolean`);

      if (isObject(item.profileVersion)) {
        pushIfInvalid(
          errors,
          item.profileVersion.roleProfileId === item.roleProfileId,
          `${itemPath}.profileVersion.roleProfileId must match roleProfileId`,
        );
        pushIfInvalid(
          errors,
          item.profileVersion.status === "published" || item.profileVersion.status === "archived",
          `${itemPath}.profileVersion.status must be published or archived`,
        );
        const profile = isObject(item.profileVersion.profile) ? item.profileVersion.profile : null;
        pushIfInvalid(
          errors,
          profile !== null && item.category === profile.category,
          `${itemPath}.category must match profileVersion.profile.category`,
        );
      }

      if (item.currentPublishedVersion !== null) {
        pushIfInvalid(
          errors,
          isObject(item.currentPublishedVersion),
          `${itemPath}.currentPublishedVersion must be an object or null`,
        );
        if (isObject(item.currentPublishedVersion)) {
          errors.push(
            ...validateRoleMarketProfileVersion(
              item.currentPublishedVersion,
              `${itemPath}.currentPublishedVersion`,
            ).errors,
          );
          pushIfInvalid(
            errors,
            item.currentPublishedVersion.status === "published",
            `${itemPath}.currentPublishedVersion.status must be published`,
          );
          pushIfInvalid(
            errors,
            item.currentPublishedVersion.roleProfileId === item.roleProfileId,
            `${itemPath}.currentPublishedVersion.roleProfileId must match roleProfileId`,
          );
        }
      }

      if (item.isCurrentPublished === true && isObject(item.profileVersion)) {
        pushIfInvalid(
          errors,
          item.profileVersion.status === "published",
          `${itemPath}.profileVersion.status must be published when isCurrentPublished is true`,
        );
      }
      if (item.canRollback === true && isObject(item.profileVersion)) {
        pushIfInvalid(
          errors,
          item.profileVersion.status === "archived",
          `${itemPath}.profileVersion.status must be archived when canRollback is true`,
        );
      }
    });
  }
  validateMeta(errors, value.meta, `${path}.meta`);

  return { valid: errors.length === 0, errors };
}

export function validateOperatorMarketIngestionTriggerResponse(
  value: unknown,
  path = "operatorMarketIngestionTriggerResponse",
): ValidationResult {
  const errors: string[] = [];
  if (!isObject(value)) {
    return { valid: false, errors: [`${path} must be an object`] };
  }

  validateEnum(errors, value.status, OPERATOR_MARKET_INGESTION_TRIGGER_STATUSES, `${path}.status`);
  errors.push(...validateMarketIngestionRun(value.run, `${path}.run`).errors);
  if (value.result !== null) {
    pushIfInvalid(errors, isObject(value.result), `${path}.result must be an object or null`);
    if (isObject(value.result)) {
      validateNonNegativeInteger(errors, value.result.documentsDiscovered, `${path}.result.documentsDiscovered`);
      validateNonNegativeInteger(errors, value.result.documentsCreated, `${path}.result.documentsCreated`);
      validateNonNegativeInteger(errors, value.result.documentsDeduped, `${path}.result.documentsDeduped`);
      validateNonNegativeInteger(errors, value.result.documentsFailed, `${path}.result.documentsFailed`);
      validateStringArray(errors, value.result.warnings, `${path}.result.warnings`, {
        maxItems: ARRAY_MAX_ITEMS,
        maxItemLength: SUMMARY_MAX_LENGTH,
      });
    }
  }
  validateMeta(errors, value.meta, `${path}.meta`);

  if (value.status === "already_running" && value.result !== null) {
    errors.push(`${path}.result must be null when status is already_running`);
  }

  return { valid: errors.length === 0, errors };
}

export function validateMarketReviewAction(
  value: unknown,
  path = "marketReviewAction",
): ValidationResult {
  const errors: string[] = [];
  if (!isObject(value)) {
    return { valid: false, errors: [`${path} must be an object`] };
  }

  validateRequiredString(errors, value.id, `${path}.id`, ID_MAX_LENGTH);
  validateRequiredString(errors, value.profileVersionId, `${path}.profileVersionId`, ID_MAX_LENGTH);
  validateEnum(errors, value.action, MARKET_REVIEW_ACTIONS, `${path}.action`);
  validateRequiredString(errors, value.actorUserId, `${path}.actorUserId`, ID_MAX_LENGTH);
  validateRequiredString(errors, value.reason, `${path}.reason`, SUMMARY_MAX_LENGTH);
  validateEnum(errors, value.beforeStatus, ROLE_MARKET_PROFILE_VERSION_STATUSES, `${path}.beforeStatus`);
  validateEnum(errors, value.afterStatus, ROLE_MARKET_PROFILE_VERSION_STATUSES, `${path}.afterStatus`);
  validateRequiredString(errors, value.createdAt, `${path}.createdAt`, ID_MAX_LENGTH);
  validateMeta(errors, value.meta, `${path}.meta`);

  return { valid: errors.length === 0, errors };
}

export function validateMarketSourceFetchRequest(
  value: unknown,
  path = "marketSourceFetchRequest",
): ValidationResult {
  const errors: string[] = [];
  if (!isObject(value)) {
    return { valid: false, errors: [`${path} must be an object`] };
  }

  errors.push(...validateMarketSource(value.source, `${path}.source`).errors);
  validateRequiredString(errors, value.runId, `${path}.runId`, ID_MAX_LENGTH);
  validateIsoStringOrNull(errors, value.since, `${path}.since`);
  validateNonNegativeInteger(errors, value.limit, `${path}.limit`);
  if (isNonNegativeInteger(value.limit) && value.limit < 1) {
    errors.push(`${path}.limit must be at least 1`);
  }
  validateOptionalNullableString(errors, value.query, `${path}.query`, TITLE_MAX_LENGTH);
  validateOptionalNullableString(errors, value.roleProfileId, `${path}.roleProfileId`, ID_MAX_LENGTH);
  validateOptionalNullableString(errors, value.region, `${path}.region`, LABEL_MAX_LENGTH);
  validateOptionalNullableString(errors, value.country, `${path}.country`, LABEL_MAX_LENGTH);
  validateOptionalPositiveInteger(errors, value.page, `${path}.page`, 1_000);
  validateOptionalPositiveInteger(errors, value.pageLimit, `${path}.pageLimit`, 50);
  pushIfInvalid(errors, typeof value.dryRun === "boolean", `${path}.dryRun must be boolean`);

  return { valid: errors.length === 0, errors };
}

export function validateMarketSourceFetchResult(
  value: unknown,
  path = "marketSourceFetchResult",
): ValidationResult {
  const errors: string[] = [];
  if (!isObject(value)) {
    return { valid: false, errors: [`${path} must be an object`] };
  }

  validateRequiredString(errors, value.sourceId, `${path}.sourceId`, ID_MAX_LENGTH);
  validateRequiredString(errors, value.runId, `${path}.runId`, ID_MAX_LENGTH);
  pushIfInvalid(errors, Array.isArray(value.documents), `${path}.documents must be an array`);
  if (Array.isArray(value.documents)) {
    value.documents.forEach((document, index) => {
      errors.push(...validateMarketRawDocument(document, `${path}.documents[${index}]`).errors);
      if (isObject(document)) {
        pushIfInvalid(
          errors,
          document.sourceId === value.sourceId,
          `${path}.documents[${index}].sourceId must match ${path}.sourceId`,
        );
        pushIfInvalid(
          errors,
          document.ingestionRunId === value.runId,
          `${path}.documents[${index}].ingestionRunId must match ${path}.runId`,
        );
      }
    });
  }
  errors.push(...validateMarketSourceHealth(value.health, `${path}.health`).errors);
  validateStringArray(errors, value.warnings, `${path}.warnings`, {
    maxItems: ARRAY_MAX_ITEMS,
    maxItemLength: SUMMARY_MAX_LENGTH,
  });

  return { valid: errors.length === 0, errors };
}

export function validateLiveMarketGoldenFixtures(): ValidationResult {
  const checks: ValidationResult[] = [
    validateMarketSource(liveMarketSourceFixture, "liveMarketGoldenFixtures.source"),
    validateMarketIngestionRun(
      liveMarketIngestionRunFixture,
      "liveMarketGoldenFixtures.ingestionRun",
    ),
    validateMarketRawDocument(
      liveMarketRawDocumentFixture,
      "liveMarketGoldenFixtures.rawDocument",
    ),
    validateNormalizedMarketSignal(
      normalizedMarketSignalFixture,
      "liveMarketGoldenFixtures.normalizedSignal",
    ),
    validateRoleMarketSignalAggregate(
      roleMarketSignalAggregateFixture,
      "liveMarketGoldenFixtures.aggregate",
    ),
    validateMarketProfileValidationResult(
      marketProfileValidationResultFixture,
      "liveMarketGoldenFixtures.validationResult",
    ),
    validateRoleMarketProfileVersion(
      roleMarketProfileVersionFixture,
      "liveMarketGoldenFixtures.profileVersion",
    ),
    validateMarketSourceHealth(
      marketSourceHealthFixture,
      "liveMarketGoldenFixtures.sourceHealth",
    ),
    validateMarketSourceFetchRequest(
      marketSourceFetchRequestFixture,
      "liveMarketGoldenFixtures.sourceFetchRequest",
    ),
    validateMarketSourceFetchResult(
      marketSourceFetchResultFixture,
      "liveMarketGoldenFixtures.sourceFetchResult",
    ),
  ];

  const errors = checks.flatMap((check) => check.errors);
  pushIfInvalid(
    errors,
    Object.keys(liveMarketGoldenFixtures).length >= 10,
    "liveMarketGoldenFixtures must expose the full fixture set",
  );

  return { valid: errors.length === 0, errors };
}

export function assertValidMarketSource(value: unknown): asserts value is MarketSource {
  const result = validateMarketSource(value);
  if (!result.valid) {
    throw new Error(`Invalid market source: ${result.errors.join("; ")}`);
  }
}

export function assertValidMarketIngestionRun(
  value: unknown,
): asserts value is MarketIngestionRun {
  const result = validateMarketIngestionRun(value);
  if (!result.valid) {
    throw new Error(`Invalid market ingestion run: ${result.errors.join("; ")}`);
  }
}

export function assertValidMarketRawDocument(value: unknown): asserts value is MarketRawDocument {
  const result = validateMarketRawDocument(value);
  if (!result.valid) {
    throw new Error(`Invalid market raw document: ${result.errors.join("; ")}`);
  }
}

export function assertValidNormalizedMarketSignal(
  value: unknown,
): asserts value is NormalizedMarketSignal {
  const result = validateNormalizedMarketSignal(value);
  if (!result.valid) {
    throw new Error(`Invalid normalized market signal: ${result.errors.join("; ")}`);
  }
}

export function assertValidRoleTaxonomyRecord(
  value: unknown,
): asserts value is RoleTaxonomyRecord {
  const result = validateRoleTaxonomyRecord(value);
  if (!result.valid) {
    throw new Error(`Invalid role taxonomy record: ${result.errors.join("; ")}`);
  }
}

export function assertValidSkillTaxonomyRecord(
  value: unknown,
): asserts value is SkillTaxonomyRecord {
  const result = validateSkillTaxonomyRecord(value);
  if (!result.valid) {
    throw new Error(`Invalid skill taxonomy record: ${result.errors.join("; ")}`);
  }
}

export function assertValidRoleMarketSignalAggregate(
  value: unknown,
): asserts value is RoleMarketSignalAggregate {
  const result = validateRoleMarketSignalAggregate(value);
  if (!result.valid) {
    throw new Error(`Invalid role market signal aggregate: ${result.errors.join("; ")}`);
  }
}

export function assertValidMarketProfileDiff(value: unknown): asserts value is MarketProfileDiff {
  const result = validateMarketProfileDiff(value);
  if (!result.valid) {
    throw new Error(`Invalid market profile diff: ${result.errors.join("; ")}`);
  }
}

export function assertValidRoleMarketProfileVersion(
  value: unknown,
): asserts value is RoleMarketProfileVersion {
  const result = validateRoleMarketProfileVersion(value);
  if (!result.valid) {
    throw new Error(`Invalid role market profile version: ${result.errors.join("; ")}`);
  }
}

export function assertValidMarketProfileValidationResult(
  value: unknown,
): asserts value is MarketProfileValidationResult {
  const result = validateMarketProfileValidationResult(value);
  if (!result.valid) {
    throw new Error(`Invalid market profile validation result: ${result.errors.join("; ")}`);
  }
}

export function assertValidMarketSourceHealth(value: unknown): asserts value is MarketSourceHealth {
  const result = validateMarketSourceHealth(value);
  if (!result.valid) {
    throw new Error(`Invalid market source health: ${result.errors.join("; ")}`);
  }
}

export function assertValidMarketSourceFetchRequest(
  value: unknown,
): asserts value is MarketSourceFetchRequest {
  const result = validateMarketSourceFetchRequest(value);
  if (!result.valid) {
    throw new Error(`Invalid market source fetch request: ${result.errors.join("; ")}`);
  }
}

export function assertValidMarketSourceFetchResult(
  value: unknown,
): asserts value is MarketSourceFetchResult {
  const result = validateMarketSourceFetchResult(value);
  if (!result.valid) {
    throw new Error(`Invalid market source fetch result: ${result.errors.join("; ")}`);
  }
}

export function assertValidOperatorMarketSourcesResponse(
  value: unknown,
): asserts value is OperatorMarketSourcesResponse {
  const result = validateOperatorMarketSourcesResponse(value);
  if (!result.valid) {
    throw new Error(`Invalid operator market sources response: ${result.errors.join("; ")}`);
  }
}

export function assertValidOperatorMarketIngestionRunsResponse(
  value: unknown,
): asserts value is OperatorMarketIngestionRunsResponse {
  const result = validateOperatorMarketIngestionRunsResponse(value);
  if (!result.valid) {
    throw new Error(`Invalid operator market ingestion runs response: ${result.errors.join("; ")}`);
  }
}

export function assertValidOperatorMarketAggregatesResponse(
  value: unknown,
): asserts value is OperatorMarketAggregatesResponse {
  const result = validateOperatorMarketAggregatesResponse(value);
  if (!result.valid) {
    throw new Error(`Invalid operator market aggregates response: ${result.errors.join("; ")}`);
  }
}

export function assertValidOperatorMarketProfileDraftsResponse(
  value: unknown,
): asserts value is OperatorMarketProfileDraftsResponse {
  const result = validateOperatorMarketProfileDraftsResponse(value);
  if (!result.valid) {
    throw new Error(`Invalid operator market profile drafts response: ${result.errors.join("; ")}`);
  }
}

export function assertValidOperatorMarketProfileActionResponse(
  value: unknown,
): asserts value is OperatorMarketProfileActionResponse {
  const result = validateOperatorMarketProfileActionResponse(value);
  if (!result.valid) {
    throw new Error(`Invalid operator market profile action response: ${result.errors.join("; ")}`);
  }
}

export function assertValidOperatorMarketProfileVersionsResponse(
  value: unknown,
): asserts value is OperatorMarketProfileVersionsResponse {
  const result = validateOperatorMarketProfileVersionsResponse(value);
  if (!result.valid) {
    throw new Error(`Invalid operator market profile versions response: ${result.errors.join("; ")}`);
  }
}

export function assertValidOperatorMarketIngestionTriggerResponse(
  value: unknown,
): asserts value is OperatorMarketIngestionTriggerResponse {
  const result = validateOperatorMarketIngestionTriggerResponse(value);
  if (!result.valid) {
    throw new Error(`Invalid operator market ingestion trigger response: ${result.errors.join("; ")}`);
  }
}

export function assertValidLiveMarketGoldenFixtures(): void {
  const result = validateLiveMarketGoldenFixtures();
  if (!result.valid) {
    throw new Error(`Invalid live market golden fixtures: ${result.errors.join("; ")}`);
  }
}

export function isMarketSource(value: unknown): value is MarketSource {
  return validateMarketSource(value).valid;
}

export function isMarketIngestionRun(value: unknown): value is MarketIngestionRun {
  return validateMarketIngestionRun(value).valid;
}

export function isMarketRawDocument(value: unknown): value is MarketRawDocument {
  return validateMarketRawDocument(value).valid;
}

export function isNormalizedMarketSignal(value: unknown): value is NormalizedMarketSignal {
  return validateNormalizedMarketSignal(value).valid;
}

export function isRoleMarketSignalAggregate(
  value: unknown,
): value is RoleMarketSignalAggregate {
  return validateRoleMarketSignalAggregate(value).valid;
}

export function isRoleMarketProfileVersion(value: unknown): value is RoleMarketProfileVersion {
  return validateRoleMarketProfileVersion(value).valid;
}

export function isMarketSourceHealth(value: unknown): value is MarketSourceHealth {
  return validateMarketSourceHealth(value).valid;
}

export function isMarketSourceFetchRequest(value: unknown): value is MarketSourceFetchRequest {
  return validateMarketSourceFetchRequest(value).valid;
}

export function isMarketSourceFetchResult(value: unknown): value is MarketSourceFetchResult {
  return validateMarketSourceFetchResult(value).valid;
}

export function isOperatorMarketSourcesResponse(
  value: unknown,
): value is OperatorMarketSourcesResponse {
  return validateOperatorMarketSourcesResponse(value).valid;
}

export function isOperatorMarketIngestionRunsResponse(
  value: unknown,
): value is OperatorMarketIngestionRunsResponse {
  return validateOperatorMarketIngestionRunsResponse(value).valid;
}

export function isOperatorMarketAggregatesResponse(
  value: unknown,
): value is OperatorMarketAggregatesResponse {
  return validateOperatorMarketAggregatesResponse(value).valid;
}

export function isOperatorMarketProfileDraftsResponse(
  value: unknown,
): value is OperatorMarketProfileDraftsResponse {
  return validateOperatorMarketProfileDraftsResponse(value).valid;
}

export function isOperatorMarketProfileActionResponse(
  value: unknown,
): value is OperatorMarketProfileActionResponse {
  return validateOperatorMarketProfileActionResponse(value).valid;
}

export function isOperatorMarketProfileVersionsResponse(
  value: unknown,
): value is OperatorMarketProfileVersionsResponse {
  return validateOperatorMarketProfileVersionsResponse(value).valid;
}

export function isOperatorMarketIngestionTriggerResponse(
  value: unknown,
): value is OperatorMarketIngestionTriggerResponse {
  return validateOperatorMarketIngestionTriggerResponse(value).valid;
}
