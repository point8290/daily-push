import {
  roleMarketProfileFixtures,
  validateRoleTaxonomyRecord,
  validateSkillTaxonomyRecord,
  type RequirementCategory,
  type RoleMarketProfile,
  type RoleTaxonomyRecord,
  type SkillTaxonomyRecord,
  type SourceReference,
} from '@daily-push/shared';
import { pool } from '../db/postgres';

type TaxonomyAliasSourceType = 'curated_seed' | 'operator' | 'live_source';
type JsonObject = Record<string, unknown>;

interface RoleTaxonomyRow {
  id: string;
  slug: string;
  title: string;
  category: RoleTaxonomyRecord['category'];
  role_type: RoleTaxonomyRecord['roleType'];
  aliases: string[];
  related_role_ids: string[];
  source_refs: SourceReference[];
  confidence: number;
  updated_at: string;
  contract_meta: RoleTaxonomyRecord['meta'];
}

interface SkillTaxonomyRow {
  id: string;
  slug: string;
  canonical_label: string;
  aliases: string[];
  categories: RequirementCategory[];
  related_skill_ids: string[];
  source_refs: SourceReference[];
  confidence: number;
  updated_at: string;
  contract_meta: SkillTaxonomyRecord['meta'];
}

export interface TaxonomyResolution<TRecord> {
  record: TRecord;
  matchedAlias: string;
  normalizedAlias: string;
  confidence: number;
}

export interface UpsertTaxonomyAliasInput {
  id?: string;
  ownerId: string;
  alias: string;
  sourceType: TaxonomyAliasSourceType;
  confidence: number;
  addedBy: string | null;
  metadata?: JsonObject;
}

export class LiveMarketTaxonomyStoreError extends Error {
  statusCode = 400;

  code = 'validation_error';
}

function confidenceToSmallInt(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value * 100)));
}

function confidenceFromSmallInt(value: number): number {
  return Math.max(0, Math.min(1, value / 100));
}

export function normalizeTaxonomyLabel(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toTaxonomySlug(value: string): string {
  return normalizeTaxonomyLabel(value)
    .replace(/[+#.]/g, '')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function shortHash(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}

function aliasId(prefix: 'role' | 'skill', ownerId: string, alias: string): string {
  const normalized = normalizeTaxonomyLabel(alias);
  const aliasKey = normalizeTaxonomyLabel(alias)
    .replace(/\+/g, ' plus ')
    .replace(/#/g, ' sharp ')
    .replace(/\./g, ' dot ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `${prefix}_alias_${ownerId}_${aliasKey}_${shortHash(normalized)}`.slice(0, 200);
}

function skillIdFromLabel(label: string): string {
  return `skill_${toTaxonomySlug(label).replace(/-/g, '_')}`.slice(0, 160);
}

function uniqueAliases(aliases: string[]): string[] {
  const seen = new Set<string>();
  return aliases.filter((alias) => {
    const normalized = normalizeTaxonomyLabel(alias);
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function uniqueSourceRefs(sourceRefs: SourceReference[]): SourceReference[] {
  const seen = new Set<string>();
  return sourceRefs.filter((sourceRef) => {
    if (!sourceRef.id || seen.has(sourceRef.id)) return false;
    seen.add(sourceRef.id);
    return true;
  });
}

function mergeCategories(categories: RequirementCategory[]): RequirementCategory[] {
  return Array.from(new Set(categories)).sort();
}

const ROLE_ALIAS_OVERRIDES: Record<string, string[]> = {
  role_ai_backend_engineer: [
    'Senior AI Backend Engineer',
    'AI Backend Developer',
    'LLM Backend Engineer',
    'GenAI Backend Engineer',
    'RAG Backend Engineer',
  ],
  role_ai_platform_engineer: [
    'AI Infrastructure Engineer',
    'AI Platform Developer',
    'LLM Platform Engineer',
    'GenAI Platform Engineer',
  ],
  role_full_stack_product_engineer: [
    'Full Stack Engineer',
    'Full-stack Engineer',
    'Full Stack Developer',
    'Full-stack Developer',
    'MERN Full Stack Developer',
    'Product-minded Full Stack Engineer',
  ],
  role_platform_engineer: [
    'Infrastructure Platform Engineer',
    'Internal Developer Platform Engineer',
    'Platform Reliability Engineer',
    'Site Reliability Engineer',
    'SRE',
  ],
  role_devops_engineer: [
    'Cloud DevOps Engineer',
    'DevOps Developer',
    'Build and Release Engineer',
    'Release Engineer',
  ],
  role_backend_engineer: [
    'Backend Developer',
    'Senior Backend Engineer',
    'Node.js Backend Engineer',
    'API Engineer',
  ],
  role_cloud_security_engineer: [
    'Cloud Security Specialist',
    'Cloud Security Analyst',
    'DevSecOps Engineer',
  ],
  role_sdet_qa_automation_engineer: [
    'QA Automation Engineer',
    'SDET',
    'Automation Test Engineer',
  ],
};

const COMMON_SKILL_SEEDS: Array<{
  label: string;
  aliases: string[];
  categories: RequirementCategory[];
}> = [
  { label: 'Node.js', aliases: ['node.js', 'nodejs', 'node js'], categories: ['skill'] },
  { label: 'TypeScript', aliases: ['typescript', 'ts'], categories: ['skill'] },
  { label: 'JavaScript', aliases: ['javascript', 'js', 'ecmascript'], categories: ['skill'] },
  { label: 'React', aliases: ['react', 'react.js', 'reactjs'], categories: ['skill'] },
  { label: 'Angular', aliases: ['angular', 'angularjs'], categories: ['skill'] },
  { label: 'Spring Boot', aliases: ['spring boot', 'springboot'], categories: ['skill'] },
  { label: 'SQL', aliases: ['sql', 'relational database', 'relational databases'], categories: ['skill'] },
  { label: 'PostgreSQL', aliases: ['postgresql', 'postgres'], categories: ['tool'] },
  { label: 'MySQL', aliases: ['mysql'], categories: ['tool'] },
  { label: 'MongoDB', aliases: ['mongodb', 'mongo db'], categories: ['tool'] },
  { label: 'AWS', aliases: ['aws', 'amazon web services'], categories: ['tool'] },
  { label: 'Docker', aliases: ['docker', 'containers', 'containerization'], categories: ['tool'] },
  { label: 'Kubernetes', aliases: ['kubernetes', 'k8s'], categories: ['tool'] },
  { label: 'CI/CD', aliases: ['ci/cd', 'cicd', 'ci', 'continuous integration', 'continuous delivery'], categories: ['production'] },
  { label: 'Observability', aliases: ['observability', 'monitoring', 'logs', 'metrics', 'tracing'], categories: ['production'] },
  { label: 'System design', aliases: ['system design', 'architecture design', 'system architecture'], categories: ['system_design'] },
  { label: 'API design', aliases: ['api design', 'api architecture'], categories: ['system_design'] },
  { label: 'LLM', aliases: ['llm', 'llms', 'large language model', 'large language models', 'genai', 'generative ai'], categories: ['ai_leverage'] },
  { label: 'RAG', aliases: ['rag', 'retrieval augmented generation', 'retrieval-augmented generation'], categories: ['ai_leverage'] },
  { label: 'Evaluation', aliases: ['evaluation', 'evals', 'eval'], categories: ['ai_leverage'] },
  { label: 'Security', aliases: ['security', 'vulnerability', 'threat analysis'], categories: ['production'] },
];

function assertValidRoleRecord(record: RoleTaxonomyRecord): void {
  const validation = validateRoleTaxonomyRecord(record);
  if (!validation.valid) {
    throw new LiveMarketTaxonomyStoreError(validation.errors.join('; '));
  }
}

function assertValidSkillRecord(record: SkillTaxonomyRecord): void {
  const validation = validateSkillTaxonomyRecord(record);
  if (!validation.valid) {
    throw new LiveMarketTaxonomyStoreError(validation.errors.join('; '));
  }
}

function mapRoleRow(row: RoleTaxonomyRow): RoleTaxonomyRecord {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    category: row.category,
    roleType: row.role_type,
    aliases: row.aliases,
    relatedRoleIds: row.related_role_ids,
    sourceRefs: row.source_refs,
    confidence: confidenceFromSmallInt(row.confidence),
    updatedAt: row.updated_at,
    meta: row.contract_meta,
  };
}

function mapSkillRow(row: SkillTaxonomyRow): SkillTaxonomyRecord {
  return {
    id: row.id,
    slug: row.slug,
    canonicalLabel: row.canonical_label,
    aliases: row.aliases,
    categories: row.categories,
    relatedSkillIds: row.related_skill_ids,
    sourceRefs: row.source_refs,
    confidence: confidenceFromSmallInt(row.confidence),
    updatedAt: row.updated_at,
    meta: row.contract_meta,
  };
}

export function buildRoleTaxonomyRecordFromProfile(
  profile: RoleMarketProfile,
): RoleTaxonomyRecord {
  return {
    id: profile.id,
    slug: profile.slug,
    title: profile.title,
    category: profile.category,
    roleType: profile.roleType,
    aliases: uniqueAliases([
      profile.title,
      profile.slug.replace(/-/g, ' '),
      ...(ROLE_ALIAS_OVERRIDES[profile.id] ?? []),
    ]),
    relatedRoleIds: profile.relatedRoleIds,
    sourceRefs: profile.sourceRefs,
    confidence: profile.confidence,
    updatedAt: profile.lastUpdated,
    meta: profile.meta,
  };
}

export function buildSkillTaxonomyRecordsFromProfiles(
  profiles: RoleMarketProfile[] = roleMarketProfileFixtures,
): SkillTaxonomyRecord[] {
  const sourceFallback = profiles.flatMap((profile) => profile.sourceRefs)[0];
  const records = new Map<string, SkillTaxonomyRecord>();

  const addSkill = ({
    label,
    aliases,
    categories,
    sourceRefs,
    confidence,
  }: {
    label: string;
    aliases: string[];
    categories: RequirementCategory[];
    sourceRefs: SourceReference[];
    confidence: number;
  }) => {
    const id = skillIdFromLabel(label);
    const now = roleMarketProfileFixtures[0]?.lastUpdated ?? new Date().toISOString();
    const existing = records.get(id);
    const recordSourceRefs = uniqueSourceRefs(sourceRefs.length > 0 ? sourceRefs : sourceFallback ? [sourceFallback] : []);
    if (existing) {
      records.set(id, {
        ...existing,
        aliases: uniqueAliases([...existing.aliases, ...aliases, label]),
        categories: mergeCategories([...existing.categories, ...categories]),
        sourceRefs: uniqueSourceRefs([...existing.sourceRefs, ...recordSourceRefs]),
        confidence: Math.max(existing.confidence, confidence),
      });
      return;
    }

    records.set(id, {
      id,
      slug: toTaxonomySlug(label),
      canonicalLabel: label,
      aliases: uniqueAliases([label, ...aliases]),
      categories: mergeCategories(categories),
      relatedSkillIds: [],
      sourceRefs: recordSourceRefs,
      confidence,
      updatedAt: now,
      meta: profiles[0]?.meta ?? roleMarketProfileFixtures[0].meta,
    });
  };

  for (const profile of profiles) {
    for (const requirement of profile.requirements) {
      const sourceRefs = requirement.sourceRefs
        .map((sourceRefId) => profile.sourceRefs.find((sourceRef) => sourceRef.id === sourceRefId))
        .filter((sourceRef): sourceRef is SourceReference => Boolean(sourceRef));
      for (const keyword of requirement.keywords) {
        addSkill({
          label: keyword,
          aliases: [keyword],
          categories: [requirement.category],
          sourceRefs,
          confidence: requirement.confidence,
        });
      }
    }
  }

  for (const seed of COMMON_SKILL_SEEDS) {
    addSkill({
      label: seed.label,
      aliases: seed.aliases,
      categories: seed.categories,
      sourceRefs: sourceFallback ? [sourceFallback] : [],
      confidence: 0.78,
    });
  }

  return Array.from(records.values()).sort((a, b) => a.canonicalLabel.localeCompare(b.canonicalLabel));
}

export async function upsertRoleTaxonomyRecord(
  record: RoleTaxonomyRecord,
  metadata: JsonObject = {},
): Promise<RoleTaxonomyRecord> {
  assertValidRoleRecord(record);
  const aliases = uniqueAliases(record.aliases);

  const { rows } = await pool.query<RoleTaxonomyRow>(
    `INSERT INTO role_taxonomy_roles
       (id,
        slug,
        title,
        category,
        role_type,
        aliases,
        related_role_ids,
        source_refs,
        confidence,
        contract_meta,
        metadata,
        updated_at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9, $10::jsonb, $11::jsonb, $12)
     ON CONFLICT (id) DO UPDATE SET
       slug = EXCLUDED.slug,
       title = EXCLUDED.title,
       category = EXCLUDED.category,
       role_type = EXCLUDED.role_type,
       aliases = EXCLUDED.aliases,
       related_role_ids = EXCLUDED.related_role_ids,
       source_refs = EXCLUDED.source_refs,
       confidence = EXCLUDED.confidence,
       contract_meta = EXCLUDED.contract_meta,
       metadata = role_taxonomy_roles.metadata || EXCLUDED.metadata,
       updated_at = NOW()
     RETURNING id,
               slug,
               title,
               category,
               role_type,
               aliases,
               related_role_ids,
               source_refs,
               confidence,
               updated_at::text,
               contract_meta`,
    [
      record.id,
      record.slug,
      record.title,
      record.category,
      record.roleType,
      JSON.stringify(aliases),
      JSON.stringify(record.relatedRoleIds),
      JSON.stringify(record.sourceRefs),
      confidenceToSmallInt(record.confidence),
      JSON.stringify(record.meta),
      JSON.stringify(metadata),
      record.updatedAt,
    ],
  );

  if (!rows[0]) throw new Error('Role taxonomy record could not be saved.');

  await Promise.all(
    aliases.map((alias) =>
      upsertRoleTaxonomyAlias({
        ownerId: record.id,
        alias,
        sourceType: 'curated_seed',
        confidence: record.confidence,
        addedBy: null,
        metadata: { seededFrom: record.id },
      }),
    ),
  );

  return mapRoleRow(rows[0]);
}

export async function upsertRoleTaxonomyAlias(
  input: UpsertTaxonomyAliasInput,
): Promise<void> {
  const normalizedAlias = normalizeTaxonomyLabel(input.alias);
  if (!normalizedAlias) {
    throw new LiveMarketTaxonomyStoreError('Role taxonomy alias cannot be empty.');
  }

  await pool.query(
    `INSERT INTO role_taxonomy_aliases
       (id,
        role_id,
        alias,
        normalized_alias,
        source_type,
        confidence,
        added_by,
        metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
     ON CONFLICT (normalized_alias) DO UPDATE SET
       alias = CASE
         WHEN role_taxonomy_aliases.role_id = EXCLUDED.role_id THEN EXCLUDED.alias
         ELSE role_taxonomy_aliases.alias
       END,
       confidence = CASE
         WHEN role_taxonomy_aliases.role_id = EXCLUDED.role_id THEN GREATEST(role_taxonomy_aliases.confidence, EXCLUDED.confidence)
         ELSE role_taxonomy_aliases.confidence
       END,
       metadata = role_taxonomy_aliases.metadata || EXCLUDED.metadata,
       updated_at = NOW()`,
    [
      input.id ?? aliasId('role', input.ownerId, input.alias),
      input.ownerId,
      input.alias,
      normalizedAlias,
      input.sourceType,
      confidenceToSmallInt(input.confidence),
      input.addedBy,
      JSON.stringify(input.metadata ?? {}),
    ],
  );
}

export async function resolveRoleTaxonomyByTitle(
  title: string,
): Promise<TaxonomyResolution<RoleTaxonomyRecord> | null> {
  const normalizedAlias = normalizeTaxonomyLabel(title);
  if (!normalizedAlias) return null;

  const { rows } = await pool.query<RoleTaxonomyRow & {
    matched_alias: string;
    matched_confidence: number;
  }>(
    `SELECT r.id,
            r.slug,
            r.title,
            r.category,
            r.role_type,
            r.aliases,
            r.related_role_ids,
            r.source_refs,
            r.confidence,
            r.updated_at::text,
            r.contract_meta,
            a.alias AS matched_alias,
            a.confidence AS matched_confidence
       FROM role_taxonomy_aliases a
       JOIN role_taxonomy_roles r ON r.id = a.role_id
      WHERE a.normalized_alias = $1
      LIMIT 1`,
    [normalizedAlias],
  );

  if (!rows[0]) return null;
  return {
    record: mapRoleRow(rows[0]),
    matchedAlias: rows[0].matched_alias,
    normalizedAlias,
    confidence: confidenceFromSmallInt(rows[0].matched_confidence),
  };
}

export async function upsertSkillTaxonomyRecord(
  record: SkillTaxonomyRecord,
  metadata: JsonObject = {},
): Promise<SkillTaxonomyRecord> {
  assertValidSkillRecord(record);
  const aliases = uniqueAliases(record.aliases);

  const { rows } = await pool.query<SkillTaxonomyRow>(
    `INSERT INTO skill_taxonomy_items
       (id,
        slug,
        canonical_label,
        categories,
        aliases,
        related_skill_ids,
        source_refs,
        confidence,
        contract_meta,
        metadata,
        updated_at)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, $8, $9::jsonb, $10::jsonb, $11)
     ON CONFLICT (id) DO UPDATE SET
       slug = EXCLUDED.slug,
       canonical_label = EXCLUDED.canonical_label,
       categories = EXCLUDED.categories,
       aliases = EXCLUDED.aliases,
       related_skill_ids = EXCLUDED.related_skill_ids,
       source_refs = EXCLUDED.source_refs,
       confidence = EXCLUDED.confidence,
       contract_meta = EXCLUDED.contract_meta,
       metadata = skill_taxonomy_items.metadata || EXCLUDED.metadata,
       updated_at = NOW()
     RETURNING id,
               slug,
               canonical_label,
               categories,
               aliases,
               related_skill_ids,
               source_refs,
               confidence,
               updated_at::text,
               contract_meta`,
    [
      record.id,
      record.slug,
      record.canonicalLabel,
      JSON.stringify(record.categories),
      JSON.stringify(aliases),
      JSON.stringify(record.relatedSkillIds),
      JSON.stringify(record.sourceRefs),
      confidenceToSmallInt(record.confidence),
      JSON.stringify(record.meta),
      JSON.stringify(metadata),
      record.updatedAt,
    ],
  );

  if (!rows[0]) throw new Error('Skill taxonomy record could not be saved.');

  await Promise.all(
    aliases.map((alias) =>
      upsertSkillTaxonomyAlias({
        ownerId: record.id,
        alias,
        sourceType: 'curated_seed',
        confidence: record.confidence,
        addedBy: null,
        metadata: { seededFrom: record.id },
      }),
    ),
  );

  return mapSkillRow(rows[0]);
}

export async function upsertSkillTaxonomyAlias(
  input: UpsertTaxonomyAliasInput,
): Promise<void> {
  const normalizedAlias = normalizeTaxonomyLabel(input.alias);
  if (!normalizedAlias) {
    throw new LiveMarketTaxonomyStoreError('Skill taxonomy alias cannot be empty.');
  }

  await pool.query(
    `INSERT INTO skill_taxonomy_aliases
       (id,
        skill_id,
        alias,
        normalized_alias,
        source_type,
        confidence,
        added_by,
        metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
     ON CONFLICT (normalized_alias) DO UPDATE SET
       alias = CASE
         WHEN skill_taxonomy_aliases.skill_id = EXCLUDED.skill_id THEN EXCLUDED.alias
         ELSE skill_taxonomy_aliases.alias
       END,
       confidence = CASE
         WHEN skill_taxonomy_aliases.skill_id = EXCLUDED.skill_id THEN GREATEST(skill_taxonomy_aliases.confidence, EXCLUDED.confidence)
         ELSE skill_taxonomy_aliases.confidence
       END,
       metadata = skill_taxonomy_aliases.metadata || EXCLUDED.metadata,
       updated_at = NOW()`,
    [
      input.id ?? aliasId('skill', input.ownerId, input.alias),
      input.ownerId,
      input.alias,
      normalizedAlias,
      input.sourceType,
      confidenceToSmallInt(input.confidence),
      input.addedBy,
      JSON.stringify(input.metadata ?? {}),
    ],
  );
}

export async function resolveSkillTaxonomyByLabel(
  label: string,
): Promise<TaxonomyResolution<SkillTaxonomyRecord> | null> {
  const normalizedAlias = normalizeTaxonomyLabel(label);
  if (!normalizedAlias) return null;

  const { rows } = await pool.query<SkillTaxonomyRow & {
    matched_alias: string;
    matched_confidence: number;
  }>(
    `SELECT s.id,
            s.slug,
            s.canonical_label,
            s.categories,
            s.aliases,
            s.related_skill_ids,
            s.source_refs,
            s.confidence,
            s.updated_at::text,
            s.contract_meta,
            a.alias AS matched_alias,
            a.confidence AS matched_confidence
       FROM skill_taxonomy_aliases a
       JOIN skill_taxonomy_items s ON s.id = a.skill_id
      WHERE a.normalized_alias = $1
      LIMIT 1`,
    [normalizedAlias],
  );

  if (!rows[0]) return null;
  return {
    record: mapSkillRow(rows[0]),
    matchedAlias: rows[0].matched_alias,
    normalizedAlias,
    confidence: confidenceFromSmallInt(rows[0].matched_confidence),
  };
}

export async function seedCuratedRoleTaxonomy(): Promise<number> {
  let saved = 0;
  for (const profile of roleMarketProfileFixtures) {
    await upsertRoleTaxonomyRecord(
      buildRoleTaxonomyRecordFromProfile(profile),
      { seededFrom: 'role_market_seed_profiles' },
    );
    saved += 1;
  }
  return saved;
}

export async function seedCuratedSkillTaxonomy(): Promise<number> {
  let saved = 0;
  for (const record of buildSkillTaxonomyRecordsFromProfiles()) {
    await upsertSkillTaxonomyRecord(record, { seededFrom: 'role_market_seed_profiles' });
    saved += 1;
  }
  return saved;
}

export async function seedCuratedMarketTaxonomy(): Promise<{
  roles: number;
  skills: number;
}> {
  const roles = await seedCuratedRoleTaxonomy();
  const skills = await seedCuratedSkillTaxonomy();
  return { roles, skills };
}
