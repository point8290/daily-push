import { createHash } from 'crypto';
import {
  assertValidNormalizedMarketSignal,
  type ContractMeta,
  type MarketRawDocument,
  type MarketSignalType,
  type NormalizedMarketSignal,
  type RequirementCategory,
  type RequirementPriority,
  type SeniorityBand,
} from '@daily-push/shared';
import { config } from '../config';
import { upsertNormalizedMarketSignal } from './liveMarketSignalStore';
import { resolveNormalizedMarketSignalTaxonomy } from './marketTaxonomyResolver';

type SignalDirection = NormalizedMarketSignal['direction'];

interface ControlledSkill {
  id: string;
  label: string;
  aliases: string[];
  signalType: Extract<MarketSignalType, 'skill' | 'tool' | 'domain'>;
  category: RequirementCategory;
  confidence: number;
}

export interface JobSignalNormalizerOptions {
  now?: () => string;
}

export interface PersistJobSignalOptions extends JobSignalNormalizerOptions {
  upsertSignal?: (signal: NormalizedMarketSignal) => Promise<NormalizedMarketSignal>;
}

const NORMALIZER_VERSION = 'deterministic-job-signal-normalizer.v1';
const MAX_SIGNALS_PER_DOCUMENT = 40;
const MAX_REQUIREMENT_SIGNALS = 8;
const TEXT_LIMIT = 1_900;

const CONTROLLED_SKILL_DICTIONARY: ControlledSkill[] = [
  { id: 'skill_javascript', label: 'JavaScript', aliases: ['javascript', 'js', 'ecmascript'], signalType: 'skill', category: 'skill', confidence: 0.78 },
  { id: 'skill_typescript', label: 'TypeScript', aliases: ['typescript', 'ts'], signalType: 'skill', category: 'skill', confidence: 0.82 },
  { id: 'skill_nodejs', label: 'Node.js', aliases: ['node.js', 'nodejs', 'node js'], signalType: 'skill', category: 'skill', confidence: 0.84 },
  { id: 'skill_react', label: 'React', aliases: ['react', 'react.js', 'reactjs'], signalType: 'skill', category: 'skill', confidence: 0.8 },
  { id: 'skill_angular', label: 'Angular', aliases: ['angular', 'angularjs'], signalType: 'skill', category: 'skill', confidence: 0.78 },
  { id: 'skill_java', label: 'Java', aliases: ['java'], signalType: 'skill', category: 'skill', confidence: 0.7 },
  { id: 'skill_spring_boot', label: 'Spring Boot', aliases: ['spring boot', 'springboot'], signalType: 'skill', category: 'skill', confidence: 0.78 },
  { id: 'skill_python', label: 'Python', aliases: ['python'], signalType: 'skill', category: 'skill', confidence: 0.76 },
  { id: 'skill_sql', label: 'SQL', aliases: ['sql', 'relational database', 'relational databases'], signalType: 'skill', category: 'skill', confidence: 0.76 },
  { id: 'skill_postgresql', label: 'PostgreSQL', aliases: ['postgresql', 'postgres'], signalType: 'tool', category: 'tool', confidence: 0.78 },
  { id: 'skill_mysql', label: 'MySQL', aliases: ['mysql'], signalType: 'tool', category: 'tool', confidence: 0.76 },
  { id: 'skill_mongodb', label: 'MongoDB', aliases: ['mongodb', 'mongo db'], signalType: 'tool', category: 'tool', confidence: 0.76 },
  { id: 'skill_redis', label: 'Redis', aliases: ['redis'], signalType: 'tool', category: 'tool', confidence: 0.74 },
  { id: 'skill_rest_api', label: 'REST APIs', aliases: ['rest api', 'rest apis', 'restful api', 'restful apis'], signalType: 'skill', category: 'skill', confidence: 0.78 },
  { id: 'skill_graphql', label: 'GraphQL', aliases: ['graphql', 'graph ql'], signalType: 'skill', category: 'skill', confidence: 0.74 },
  { id: 'skill_api_design', label: 'API design', aliases: ['api design', 'api architecture'], signalType: 'skill', category: 'system_design', confidence: 0.78 },
  { id: 'skill_system_design', label: 'System design', aliases: ['system design', 'architecture design', 'system architecture'], signalType: 'skill', category: 'system_design', confidence: 0.8 },
  { id: 'skill_microservices', label: 'Microservices', aliases: ['microservices', 'microservice'], signalType: 'skill', category: 'system_design', confidence: 0.76 },
  { id: 'skill_distributed_systems', label: 'Distributed systems', aliases: ['distributed systems', 'distributed system'], signalType: 'skill', category: 'system_design', confidence: 0.78 },
  { id: 'skill_docker', label: 'Docker', aliases: ['docker', 'containerization', 'containers'], signalType: 'tool', category: 'tool', confidence: 0.78 },
  { id: 'skill_kubernetes', label: 'Kubernetes', aliases: ['kubernetes', 'k8s'], signalType: 'tool', category: 'tool', confidence: 0.78 },
  { id: 'skill_aws', label: 'AWS', aliases: ['aws', 'amazon web services'], signalType: 'tool', category: 'tool', confidence: 0.8 },
  { id: 'skill_azure', label: 'Azure', aliases: ['azure', 'microsoft azure'], signalType: 'tool', category: 'tool', confidence: 0.75 },
  { id: 'skill_gcp', label: 'Google Cloud', aliases: ['gcp', 'google cloud', 'google cloud platform'], signalType: 'tool', category: 'tool', confidence: 0.75 },
  { id: 'skill_terraform', label: 'Terraform', aliases: ['terraform'], signalType: 'tool', category: 'tool', confidence: 0.76 },
  { id: 'skill_ci_cd', label: 'CI/CD', aliases: ['ci/cd', 'cicd', 'continuous integration', 'continuous delivery'], signalType: 'tool', category: 'production', confidence: 0.76 },
  { id: 'skill_jenkins', label: 'Jenkins', aliases: ['jenkins'], signalType: 'tool', category: 'tool', confidence: 0.75 },
  { id: 'skill_github_actions', label: 'GitHub Actions', aliases: ['github actions'], signalType: 'tool', category: 'tool', confidence: 0.74 },
  { id: 'skill_kafka', label: 'Kafka', aliases: ['kafka', 'apache kafka'], signalType: 'tool', category: 'tool', confidence: 0.76 },
  { id: 'skill_rabbitmq', label: 'RabbitMQ', aliases: ['rabbitmq', 'rabbit mq'], signalType: 'tool', category: 'tool', confidence: 0.74 },
  { id: 'skill_observability', label: 'Observability', aliases: ['observability', 'monitoring', 'logging', 'metrics', 'tracing'], signalType: 'skill', category: 'production', confidence: 0.76 },
  { id: 'skill_prometheus', label: 'Prometheus', aliases: ['prometheus'], signalType: 'tool', category: 'tool', confidence: 0.74 },
  { id: 'skill_grafana', label: 'Grafana', aliases: ['grafana'], signalType: 'tool', category: 'tool', confidence: 0.74 },
  { id: 'skill_auth', label: 'Authentication and authorization', aliases: ['authentication', 'authorization', 'auth', 'rbac', 'oauth', 'jwt', 'keycloak'], signalType: 'skill', category: 'production', confidence: 0.78 },
  { id: 'skill_testing', label: 'Automated testing', aliases: ['unit testing', 'integration testing', 'automated testing', 'test automation'], signalType: 'skill', category: 'production', confidence: 0.74 },
  { id: 'skill_rag', label: 'RAG', aliases: ['rag', 'retrieval augmented generation', 'retrieval-augmented generation'], signalType: 'skill', category: 'ai_leverage', confidence: 0.8 },
  { id: 'skill_llm', label: 'LLMs', aliases: ['llm', 'llms', 'large language model', 'large language models', 'generative ai', 'genai'], signalType: 'skill', category: 'ai_leverage', confidence: 0.78 },
  { id: 'skill_prompt_engineering', label: 'Prompt engineering', aliases: ['prompt engineering', 'prompt design'], signalType: 'skill', category: 'ai_leverage', confidence: 0.72 },
  { id: 'skill_vector_database', label: 'Vector databases', aliases: ['vector database', 'vector databases', 'vector db', 'embeddings'], signalType: 'tool', category: 'ai_leverage', confidence: 0.76 },
  { id: 'domain_iot', label: 'IoT', aliases: ['iot', 'internet of things', 'device management'], signalType: 'domain', category: 'domain', confidence: 0.72 },
  { id: 'domain_saas', label: 'SaaS', aliases: ['saas', 'software as a service'], signalType: 'domain', category: 'domain', confidence: 0.7 },
  { id: 'domain_fintech', label: 'Fintech', aliases: ['fintech', 'payments', 'banking'], signalType: 'domain', category: 'domain', confidence: 0.7 },
  { id: 'domain_ecommerce', label: 'E-commerce', aliases: ['e-commerce', 'ecommerce', 'marketplace'], signalType: 'domain', category: 'domain', confidence: 0.7 },
  { id: 'domain_healthcare', label: 'Healthcare', aliases: ['healthcare', 'health tech', 'healthtech'], signalType: 'domain', category: 'domain', confidence: 0.7 },
];

function buildMeta(now: string): ContractMeta {
  return {
    contractVersion: 'role-market.v1',
    generatedAt: now,
    sourceMode: config.roleMarket.sourceMode,
    seedVersion: config.roleMarket.seedVersion,
    warnings: [],
  };
}

function clampConfidence(value: number): number {
  return Math.max(0.05, Math.min(0.98, Number(value.toFixed(2))));
}

function truncate(value: string, max = TEXT_LIMIT): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > max ? normalized.slice(0, max).trim() : normalized;
}

function hashId(document: MarketRawDocument, signalType: string, label: string): string {
  const hash = createHash('sha1')
    .update([document.id, document.sourceDocumentId, signalType, label].join('|'))
    .digest('hex')
    .slice(0, 28);
  return `market_signal_${hash}`;
}

function observedAt(document: MarketRawDocument): string {
  const candidate = document.publishedAt ?? document.capturedAt;
  return Number.isNaN(Date.parse(candidate)) ? document.capturedAt : new Date(candidate).toISOString();
}

function roleProfileIdFromPayload(document: MarketRawDocument): string | null {
  const value = document.rawPayload?.roleProfileId;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function createSignal(
  document: MarketRawDocument,
  input: {
    signalType: MarketSignalType;
    normalizedLabel: string;
    value: string;
    evidenceText: string;
    keywords: string[];
    confidence: number;
    requirementCategory?: RequirementCategory | null;
    requirementPriority?: RequirementPriority | null;
    seniorityBand?: SeniorityBand | null;
    canonicalSkillId?: string | null;
    direction?: SignalDirection;
  },
  metaGeneratedAt: string,
): NormalizedMarketSignal {
  const signal: NormalizedMarketSignal = {
    id: hashId(document, input.signalType, input.normalizedLabel),
    sourceId: document.sourceId,
    ingestionRunId: document.ingestionRunId,
    rawDocumentId: document.id,
    sourceDocumentId: document.sourceDocumentId,
    sourceRef: document.sourceRef,
    signalType: input.signalType,
    canonicalRoleId: roleProfileIdFromPayload(document),
    observedRoleTitle: truncate(document.title, 500),
    canonicalSkillId: input.canonicalSkillId ?? null,
    normalizedLabel: truncate(input.normalizedLabel, 500),
    requirementCategory: input.requirementCategory ?? null,
    requirementPriority: input.requirementPriority ?? null,
    seniorityBand: input.seniorityBand ?? null,
    region: document.region,
    value: truncate(input.value),
    keywords: Array.from(new Set(input.keywords.map((keyword) => keyword.trim()).filter(Boolean))).slice(0, 20),
    evidenceText: truncate(input.evidenceText),
    direction: input.direction ?? 'stable',
    observedAt: observedAt(document),
    confidence: clampConfidence(input.confidence),
    meta: buildMeta(metaGeneratedAt),
  };
  assertValidNormalizedMarketSignal(signal);
  return signal;
}

function splitSentences(text: string): string[] {
  return text
    .split(/\n+|(?<=[.!?])\s+/)
    .map((sentence) => truncate(sentence, 500))
    .filter((sentence) => sentence.length >= 12);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsAlias(text: string, alias: string): boolean {
  const escaped = escapeRegex(alias.toLowerCase());
  return new RegExp(`(^|[^a-z0-9+#.])${escaped}([^a-z0-9+#.]|$)`, 'i').test(text);
}

function evidenceForAlias(sentences: string[], alias: string, fallback: string): string {
  return sentences.find((sentence) => containsAlias(sentence.toLowerCase(), alias)) ?? fallback;
}

function rawSearchText(document: MarketRawDocument): string {
  return truncate([document.title, document.region, document.publisher, document.extractedText].filter(Boolean).join('\n'), 20_000);
}

function extractRoleDemandSignal(document: MarketRawDocument, metaGeneratedAt: string): NormalizedMarketSignal {
  return createSignal(
    document,
    {
      signalType: 'role_demand',
      normalizedLabel: document.title,
      value: `Observed job posting for ${document.title}${document.region ? ` in ${document.region}` : ''}.`,
      evidenceText: document.title,
      keywords: [document.title],
      confidence: 0.68,
    },
    metaGeneratedAt,
  );
}

function extractSenioritySignal(
  document: MarketRawDocument,
  text: string,
  sentences: string[],
  metaGeneratedAt: string,
): NormalizedMarketSignal {
  const title = document.title.toLowerCase();
  const combined = `${title}\n${text.toLowerCase()}`;
  const patterns: Array<{
    band: SeniorityBand | null;
    label: string;
    keywords: string[];
    confidence: number;
  }> = [
    { band: 'staff', label: 'Staff / principal level', keywords: ['staff', 'principal', 'architect', 'distinguished'], confidence: 0.84 },
    { band: 'staff', label: 'Manager-level seniority signal', keywords: ['engineering manager', 'manager'], confidence: 0.62 },
    { band: 'senior', label: 'Senior / lead level', keywords: ['senior', 'sr', 'lead', 'tech lead'], confidence: 0.78 },
    { band: 'junior', label: 'Junior / entry level', keywords: ['junior', 'jr', 'entry level', 'graduate', 'intern', 'associate', 'trainee'], confidence: 0.8 },
    { band: 'mid', label: 'Mid level', keywords: ['mid level', 'mid-level', 'intermediate', 'software engineer ii', 'sde ii'], confidence: 0.72 },
  ];

  const match = patterns.find((candidate) =>
    candidate.keywords.some((keyword) => containsAlias(combined, keyword)),
  );

  if (!match) {
    return createSignal(
      document,
      {
        signalType: 'seniority',
        normalizedLabel: 'No explicit seniority',
        value: 'No explicit seniority marker was detected in the job title or description.',
        evidenceText: document.title,
        keywords: ['seniority_unknown'],
        confidence: 0.38,
        seniorityBand: null,
        direction: 'uncertain',
      },
      metaGeneratedAt,
    );
  }

  const matchedKeyword = match.keywords.find((keyword) => containsAlias(combined, keyword)) ?? match.keywords[0];
  return createSignal(
    document,
    {
      signalType: 'seniority',
      normalizedLabel: match.label,
      value: `${match.label} detected for ${document.title}.`,
      evidenceText: evidenceForAlias([document.title, ...sentences], matchedKeyword, document.title),
      keywords: match.keywords,
      confidence: match.confidence,
      seniorityBand: match.band,
    },
    metaGeneratedAt,
  );
}

function extractRemoteSignal(
  document: MarketRawDocument,
  text: string,
  sentences: string[],
  metaGeneratedAt: string,
): NormalizedMarketSignal {
  const lower = text.toLowerCase();
  const candidates = [
    { label: 'Hybrid', value: 'hybrid', aliases: ['hybrid'], confidence: 0.78 },
    { label: 'Remote', value: 'remote', aliases: ['remote', 'work from home', 'wfh', 'distributed team'], confidence: 0.76 },
    { label: 'On-site', value: 'on-site', aliases: ['on-site', 'onsite', 'office based', 'office-based', 'work from office', 'in office'], confidence: 0.74 },
  ];
  const match = candidates.find((candidate) =>
    candidate.aliases.some((alias) => containsAlias(lower, alias)),
  );

  if (!match) {
    return createSignal(
      document,
      {
        signalType: 'remote_policy',
        normalizedLabel: 'Unknown remote policy',
        value: 'unknown',
        evidenceText: 'No explicit remote, hybrid, or on-site policy was detected in the job text.',
        keywords: ['remote_policy_unknown'],
        confidence: 0.35,
        direction: 'uncertain',
      },
      metaGeneratedAt,
    );
  }

  const matchedAlias = match.aliases.find((alias) => containsAlias(lower, alias)) ?? match.value;
  return createSignal(
    document,
    {
      signalType: 'remote_policy',
      normalizedLabel: `${match.label} work policy`,
      value: match.value,
      evidenceText: evidenceForAlias(sentences, matchedAlias, document.title),
      keywords: match.aliases,
      confidence: match.confidence,
    },
    metaGeneratedAt,
  );
}

function readRawPayloadNumber(document: MarketRawDocument, key: 'salary_min' | 'salary_max'): number | null {
  const result = document.rawPayload?.result;
  if (!result || typeof result !== 'object') return null;
  const value = (result as Record<string, unknown>)[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function extractSalarySignal(
  document: MarketRawDocument,
  sentences: string[],
  metaGeneratedAt: string,
): NormalizedMarketSignal | null {
  const salarySentence = sentences.find((sentence) =>
    /(salary|compensation|ctc|package|pay range|base pay)/i.test(sentence),
  );
  const salaryMin = readRawPayloadNumber(document, 'salary_min');
  const salaryMax = readRawPayloadNumber(document, 'salary_max');

  if (salaryMin === null && salaryMax === null && !salarySentence) return null;

  const value = salaryMin !== null || salaryMax !== null
    ? `salary_min=${salaryMin ?? 'unknown'}; salary_max=${salaryMax ?? 'unknown'}`
    : salarySentence ?? 'Salary mentioned without machine-readable bounds.';
  const label = salaryMin !== null && salaryMax !== null
    ? 'Salary range'
    : 'Partial salary signal';

  return createSignal(
    document,
    {
      signalType: 'salary',
      normalizedLabel: label,
      value,
      evidenceText: salarySentence ?? `Provider salary fields: min ${salaryMin ?? 'unknown'}, max ${salaryMax ?? 'unknown'}.`,
      keywords: ['salary', 'compensation', 'pay'],
      confidence: salaryMin !== null && salaryMax !== null ? 0.74 : 0.56,
      direction: 'uncertain',
    },
    metaGeneratedAt,
  );
}

function extractControlledSkillSignals(
  document: MarketRawDocument,
  text: string,
  sentences: string[],
  metaGeneratedAt: string,
): NormalizedMarketSignal[] {
  const lower = text.toLowerCase();
  return CONTROLLED_SKILL_DICTIONARY
    .filter((skill) => skill.aliases.some((alias) => containsAlias(lower, alias)))
    .map((skill) => {
      const matchedAlias = skill.aliases.find((alias) => containsAlias(lower, alias)) ?? skill.label;
      return createSignal(
        document,
        {
          signalType: skill.signalType,
          normalizedLabel: skill.label,
          value: `${skill.label} appears in the job posting.`,
          evidenceText: evidenceForAlias(sentences, matchedAlias, document.extractedText),
          keywords: [skill.label, ...skill.aliases],
          confidence: skill.confidence,
          requirementCategory: skill.category,
          canonicalSkillId: skill.id,
        },
        metaGeneratedAt,
      );
    });
}

function classifyRequirementCategory(sentence: string): RequirementCategory {
  const lower = sentence.toLowerCase();
  if (/(system design|architecture|scalability|distributed|microservice)/.test(lower)) return 'system_design';
  if (/(production|observability|monitoring|incident|performance|deploy|ci\/cd|reliability)/.test(lower)) return 'production';
  if (/(llm|rag|ai|prompt|generative)/.test(lower)) return 'ai_leverage';
  if (/(stakeholder|communicat|collaborat|mentor|leadership)/.test(lower)) return 'communication';
  if (/(business|customer|product|user|revenue)/.test(lower)) return 'business_context';
  if (/(domain|iot|fintech|healthcare|payment|e-commerce|ecommerce|saas)/.test(lower)) return 'domain';
  if (CONTROLLED_SKILL_DICTIONARY.some((skill) => skill.signalType === 'tool' && skill.aliases.some((alias) => containsAlias(lower, alias)))) return 'tool';
  return 'skill';
}

function classifyRequirementPriority(sentence: string): RequirementPriority {
  const lower = sentence.toLowerCase();
  if (/(required|must|strong|proven|hands-on|minimum|mandatory)/.test(lower)) return 'must_have';
  if (/(preferred|nice to have|bonus|plus|good to have|desirable)/.test(lower)) return 'nice_to_have';
  return 'important';
}

function requirementKeywords(sentence: string): string[] {
  const lower = sentence.toLowerCase();
  const skillKeywords = CONTROLLED_SKILL_DICTIONARY
    .filter((skill) => skill.aliases.some((alias) => containsAlias(lower, alias)))
    .map((skill) => skill.label);
  const triggerKeywords = ['required', 'must', 'experience', 'responsible', 'design', 'build', 'own', 'lead']
    .filter((keyword) => containsAlias(lower, keyword));
  return [...skillKeywords, ...triggerKeywords];
}

function extractRequirementSignals(
  document: MarketRawDocument,
  sentences: string[],
  metaGeneratedAt: string,
): NormalizedMarketSignal[] {
  const requirementSentences = sentences
    .filter((sentence) =>
      /(required|must|experience with|responsible for|you will|we need|proficient|strong|familiar|knowledge of|design|build|own|lead|deliver|maintain|optimi[sz]e)/i.test(sentence),
    )
    .slice(0, MAX_REQUIREMENT_SIGNALS);

  return requirementSentences.map((sentence) =>
    createSignal(
      document,
      {
        signalType: 'requirement',
        normalizedLabel: sentence.length > 90 ? `${sentence.slice(0, 87)}...` : sentence,
        value: sentence,
        evidenceText: sentence,
        keywords: requirementKeywords(sentence),
        confidence: 0.68,
        requirementCategory: classifyRequirementCategory(sentence),
        requirementPriority: classifyRequirementPriority(sentence),
      },
      metaGeneratedAt,
    ),
  );
}

export function normalizeMarketRawDocument(
  document: MarketRawDocument,
  options: JobSignalNormalizerOptions = {},
): NormalizedMarketSignal[] {
  if (document.documentType !== 'job_post') return [];

  const metaGeneratedAt = options.now?.() ?? new Date().toISOString();
  const text = rawSearchText(document);
  const sentences = splitSentences(text);
  const signals = [
    extractRoleDemandSignal(document, metaGeneratedAt),
    extractSenioritySignal(document, text, sentences, metaGeneratedAt),
    extractRemoteSignal(document, text, sentences, metaGeneratedAt),
    extractSalarySignal(document, sentences, metaGeneratedAt),
    ...extractControlledSkillSignals(document, text, sentences, metaGeneratedAt),
    ...extractRequirementSignals(document, sentences, metaGeneratedAt),
  ].filter((signal): signal is NormalizedMarketSignal => Boolean(signal));

  const deduped = new Map<string, NormalizedMarketSignal>();
  for (const signal of signals) {
    const key = `${signal.signalType}:${signal.normalizedLabel.toLowerCase()}:${signal.value.toLowerCase()}`;
    if (!deduped.has(key)) deduped.set(key, signal);
  }

  return Array.from(deduped.values()).slice(0, MAX_SIGNALS_PER_DOCUMENT);
}

export async function normalizeAndPersistMarketRawDocument(
  document: MarketRawDocument,
  options: PersistJobSignalOptions = {},
): Promise<NormalizedMarketSignal[]> {
  const upsertSignal =
    options.upsertSignal ??
    (async (signal: NormalizedMarketSignal) => {
      const resolved = await resolveNormalizedMarketSignalTaxonomy(signal);
      return upsertNormalizedMarketSignal(resolved.signal, {
        normalizerVersion: NORMALIZER_VERSION,
        rawDocumentId: document.id,
        taxonomy: resolved.metadata,
      });
    });
  const signals = normalizeMarketRawDocument(document, options);
  const saved: NormalizedMarketSignal[] = [];
  for (const signal of signals) {
    saved.push(await upsertSignal(signal));
  }
  return saved;
}
