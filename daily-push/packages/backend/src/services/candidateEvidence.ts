import { createHash } from 'crypto';
import { ObjectId } from 'mongodb';
import {
  assertValidCandidateEvidenceProfile,
  type CandidateEvidenceProfile,
  type ContractMeta,
  type ContractWarning,
  type EvidenceClaim,
  type EvidenceRef,
  type EvidenceSourceType,
} from '@daily-push/shared';
import { pool } from '../db/postgres';
import { getDb } from '../db/mongo';
import { config } from '../config';
import type { ResumeSummary } from './jobGapAnalysis';

interface UserProfileRow {
  id: string;
  job_title: string | null;
  years_total: number | null;
  primary_stack: unknown;
  updated_at: string;
}

interface UserSkillRow {
  id: string;
  skill_name: string;
  skill_category: string | null;
  self_assessed_level: string | null;
  verified: boolean;
  source: string | null;
  created_at: string;
}

interface ResumeRow {
  id: string;
  raw_text: string;
  parsed_data: ResumeSummary | Record<string, unknown> | null;
  source: string | null;
  parsed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ResumeApplicationEvidenceRow {
  id: string;
  resume_id: string | null;
  target_role: string | null;
  target_company: string | null;
  resume_summary: ResumeSummary | Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface PersistedClaimRow {
  claim_key: string;
  user_verified: boolean;
}

interface PersistedEvidenceClaimRow {
  claim_key: string;
  normalized_claim: string;
  skill_labels: unknown;
  role_labels: unknown;
  project_name: string | null;
  company_name: string | null;
  metric: string | null;
  seniority_signal: EvidenceClaim['senioritySignal'];
  source_type: EvidenceSourceType;
  source_id: string | null;
  source_section: string | null;
  original_snippet: string;
  confidence: number;
  user_verified: boolean;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

interface ArtifactEvidenceRow {
  artifact_id: string;
  session_id: string;
  node_id: string;
  goal_id: string | null;
  node_title: string;
  node_description: string | null;
  task_type: string;
  artifact_type: string;
  content: string | null;
  status: 'draft' | 'submitted' | 'evaluated';
  score: number | null;
  feedback: string | null;
  evaluation: Record<string, unknown> | null;
  evaluated_at: string | null;
  created_at: string;
  updated_at: string;
}

type RoleEntry = CandidateEvidenceProfile['roles'][number];
type ProjectEntry = CandidateEvidenceProfile['projects'][number];

const COMMON_SKILL_PATTERNS: Array<{ label: string; patterns: RegExp[] }> = [
  { label: 'React', patterns: [/\breact\b/i, /\bnext\.?js\b/i] },
  { label: 'Angular', patterns: [/\bangular\b/i] },
  { label: 'Node.js', patterns: [/\bnode\.?js\b/i, /\bnode\b/i] },
  { label: 'TypeScript', patterns: [/\btypescript\b/i, /\bts\b/i] },
  { label: 'JavaScript', patterns: [/\bjavascript\b/i, /\bjs\b/i] },
  { label: 'Python', patterns: [/\bpython\b/i] },
  { label: 'Java', patterns: [/\bjava\b/i, /\bspring boot\b/i] },
  { label: 'Spring Boot', patterns: [/\bspring boot\b/i] },
  { label: 'Docker', patterns: [/\bdocker\b/i] },
  { label: 'Kubernetes', patterns: [/\bkubernetes\b/i, /\bk8s\b/i] },
  { label: 'AWS', patterns: [/\baws\b/i, /\bamazon web services\b/i] },
  { label: 'PostgreSQL', patterns: [/\bpostgres\b/i, /\bpostgresql\b/i] },
  { label: 'MySQL', patterns: [/\bmysql\b/i] },
  { label: 'MongoDB', patterns: [/\bmongodb\b/i, /\bmongo\b/i] },
  { label: 'Redis', patterns: [/\bredis\b/i] },
  { label: 'GraphQL', patterns: [/\bgraphql\b/i] },
  { label: 'REST APIs', patterns: [/\brest\b/i, /\bapi\b/i] },
  { label: 'System Design', patterns: [/\bsystem design\b/i, /\barchitecture\b/i] },
  { label: 'Testing', patterns: [/\btesting\b/i, /\bjest\b/i, /\bcypress\b/i] },
  { label: 'CI/CD', patterns: [/\bci\/cd\b/i, /\bgithub actions\b/i, /\bjenkins\b/i] },
  { label: 'LLMs', patterns: [/\bllm\b/i, /\blarge language model/i] },
  { label: 'RAG', patterns: [/\brag\b/i, /\bretrieval augmented generation\b/i] },
  { label: 'OpenAI API', patterns: [/\bopenai\b/i, /\bgpt-[45]\b/i] },
  { label: 'LangChain', patterns: [/\blangchain\b/i] },
];

function buildMeta(warnings: ContractWarning[] = []): ContractMeta {
  return {
    contractVersion: 'role-market.v1',
    generatedAt: new Date().toISOString(),
    sourceMode: config.roleMarket.sourceMode,
    seedVersion: config.roleMarket.seedVersion,
    warnings,
  };
}

function isMissingRelationError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as { code?: string }).code === '42P01');
}

function trimToNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function safeJsonObject<T>(value: unknown): T | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as T;
}

function uniqueStrings(values: Array<string | null | undefined>, limit = 80): string[] {
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
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function hashId(prefix: string, parts: Array<string | null | undefined>): string {
  const digest = createHash('sha1')
    .update(parts.map((part) => part ?? '').join('|'))
    .digest('hex')
    .slice(0, 24);
  return `${prefix}_${digest}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function detectSkills(text: string, extraSkills: string[] = []): string[] {
  const patternMatches = COMMON_SKILL_PATTERNS
    .filter((entry) => entry.patterns.some((pattern) => pattern.test(text)))
    .map((entry) => entry.label);
  const extraMatches = extraSkills.filter((skill) =>
    normalizeComparable(text).includes(normalizeComparable(skill)),
  );
  return uniqueStrings([...patternMatches, ...extraMatches], 30);
}

function detectMetric(text: string): string | null {
  const match = text.match(/(\d+(?:\.\d+)?\s?%|\d+\+|\$\s?\d[\d,]*(?:\.\d+)?|\b\d{2,}\b)/);
  return match?.[0]?.trim() ?? null;
}

function inferSenioritySignal(text: string): EvidenceClaim['senioritySignal'] {
  if (/\b(architected|owned|led|managed|mentored|designed|scaled|production|senior|staff|lead)\b/i.test(text)) {
    return 'strong';
  }
  if (/\b(built|implemented|improved|shipped|optimized|migrated|debugged|delivered)\b/i.test(text)) {
    return 'some';
  }
  return 'none';
}

function splitMeaningfulLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^[\s\u2022*-]+/, '').trim())
    .filter((line) => line.length >= 18 && /[a-z]/i.test(line));
}

function inferSourceSection(text: string): string | null {
  if (/\b(project|built|developed|created|implemented)\b/i.test(text)) return 'projects';
  if (/\b(certified|certification|certificate)\b/i.test(text)) return 'certifications';
  if (/\b(university|college|bachelor|master|degree)\b/i.test(text)) return 'education';
  if (/\b(skill|technologies|tools)\b/i.test(text)) return 'skills';
  if (/\b(owned|led|managed|shipped|designed|engineer|developer)\b/i.test(text)) return 'experience';
  return null;
}

function parsePrimaryStack(value: unknown): string[] {
  if (Array.isArray(value)) {
    return uniqueStrings(value.map((item) => (typeof item === 'string' ? item : null)), 40);
  }
  if (typeof value === 'string') {
    return uniqueStrings(value.split(/[,;/]/), 40);
  }
  return [];
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return uniqueStrings(value.map((item) => (typeof item === 'string' ? item : null)), 80);
}

function buildEvidenceRef(args: {
  sourceType: EvidenceSourceType;
  sourceId: string | null;
  sourceSection: string | null;
  snippet: string;
  createdAt: string;
}): EvidenceRef {
  return {
    id: hashId('ref', [
      args.sourceType,
      args.sourceId,
      args.sourceSection,
      args.snippet,
    ]),
    sourceType: args.sourceType,
    sourceId: args.sourceId,
    sourceSection: args.sourceSection,
    originalSnippet: args.snippet.slice(0, 1000),
    createdAt: args.createdAt,
  };
}

function createClaim(args: {
  sourceType: EvidenceSourceType;
  sourceId: string | null;
  sourceSection: string | null;
  snippet: string | null;
  normalizedClaim?: string | null;
  knownSkills?: string[];
  roleLabels?: string[];
  projectName?: string | null;
  companyName?: string | null;
  confidence?: number;
  userVerified?: boolean;
  createdAt: string;
}): EvidenceClaim | null {
  const snippet = trimToNull(args.snippet);
  if (!snippet) return null;
  const normalizedClaim = trimToNull(args.normalizedClaim) ?? snippet;
  const skillLabels = detectSkills(snippet, args.knownSkills ?? []);
  const roleLabels = uniqueStrings(args.roleLabels ?? [], 12);
  const confidence = clamp(Math.round(args.confidence ?? 70), 20, 95);
  const id = hashId('claim', [
    args.sourceType,
    args.sourceId,
    args.sourceSection,
    normalizedClaim,
    snippet,
  ]);

  return {
    id,
    normalizedClaim: normalizedClaim.slice(0, 500),
    skillLabels,
    roleLabels,
    projectName: trimToNull(args.projectName),
    companyName: trimToNull(args.companyName),
    metric: detectMetric(snippet),
    senioritySignal: inferSenioritySignal(snippet),
    evidenceRefs: [
      buildEvidenceRef({
        sourceType: args.sourceType,
        sourceId: args.sourceId,
        sourceSection: args.sourceSection,
        snippet,
        createdAt: args.createdAt,
      }),
    ],
    confidence,
    userVerified: Boolean(args.userVerified),
  };
}

function mergeClaims(claims: Array<EvidenceClaim | null>): EvidenceClaim[] {
  const merged = new Map<string, EvidenceClaim>();
  for (const claim of claims) {
    if (!claim) continue;
    const key = normalizeComparable(claim.normalizedClaim).slice(0, 220);
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, claim);
      continue;
    }
    existing.skillLabels = uniqueStrings([...existing.skillLabels, ...claim.skillLabels], 30);
    existing.roleLabels = uniqueStrings([...existing.roleLabels, ...claim.roleLabels], 20);
    existing.confidence = Math.max(existing.confidence, claim.confidence);
    existing.userVerified = existing.userVerified || claim.userVerified;
    existing.metric = existing.metric ?? claim.metric;
    existing.companyName = existing.companyName ?? claim.companyName;
    existing.projectName = existing.projectName ?? claim.projectName;
    existing.senioritySignal =
      existing.senioritySignal === 'strong' || claim.senioritySignal === 'strong'
        ? 'strong'
        : existing.senioritySignal === 'some' || claim.senioritySignal === 'some'
          ? 'some'
          : 'none';
    const existingRefIds = new Set(existing.evidenceRefs.map((ref) => ref.id));
    existing.evidenceRefs.push(...claim.evidenceRefs.filter((ref) => !existingRefIds.has(ref.id)));
  }

  return Array.from(merged.values())
    .sort((a, b) => b.confidence - a.confidence || a.normalizedClaim.localeCompare(b.normalizedClaim))
    .slice(0, 80);
}

function claimsFromResumeSummary(args: {
  summary: ResumeSummary;
  sourceId: string | null;
  createdAt: string;
  knownSkills: string[];
  targetRole?: string | null;
  companyName?: string | null;
}): EvidenceClaim[] {
  const claims: Array<EvidenceClaim | null> = [];
  const knownSkills = uniqueStrings([
    ...args.knownSkills,
    ...(args.summary.coreSkills ?? []),
    ...(args.summary.resumeSections?.skills ?? []),
  ], 80);
  const roleLabels = uniqueStrings([
    args.targetRole,
    ...((args.summary.experienceItems ?? []).map((item) => item.role)),
  ], 20);

  for (const item of args.summary.evidenceClaims ?? []) {
    claims.push(createClaim({
      sourceType: 'resume',
      sourceId: args.sourceId,
      sourceSection: trimToNull(item.sourceSection),
      snippet: item.sourceSnippet,
      normalizedClaim: item.claim,
      knownSkills,
      roleLabels,
      companyName: args.companyName,
      confidence: item.confidence,
      createdAt: args.createdAt,
    }));
  }

  for (const item of args.summary.experienceItems ?? []) {
    const itemRoleLabels = uniqueStrings([item.role, ...roleLabels], 20);
    for (const bullet of item.bullets ?? []) {
      claims.push(createClaim({
        sourceType: 'resume',
        sourceId: args.sourceId,
        sourceSection: 'experience',
        snippet: bullet,
        knownSkills: uniqueStrings([...knownSkills, ...(item.technologies ?? [])], 80),
        roleLabels: itemRoleLabels,
        companyName: item.company ?? args.companyName,
        confidence: detectMetric(bullet) ? 88 : 78,
        createdAt: args.createdAt,
      }));
    }
    for (const outcome of item.quantifiedOutcomes ?? []) {
      claims.push(createClaim({
        sourceType: 'resume',
        sourceId: args.sourceId,
        sourceSection: 'experience',
        snippet: outcome,
        normalizedClaim: outcome,
        knownSkills: uniqueStrings([...knownSkills, ...(item.technologies ?? [])], 80),
        roleLabels: itemRoleLabels,
        companyName: item.company ?? args.companyName,
        confidence: 88,
        createdAt: args.createdAt,
      }));
    }
  }

  for (const item of args.summary.projectItems ?? []) {
    const projectSnippets = uniqueStrings([
      item.description,
      ...(item.bullets ?? []),
    ], 12);
    for (const snippet of projectSnippets) {
      claims.push(createClaim({
        sourceType: 'resume',
        sourceId: args.sourceId,
        sourceSection: 'projects',
        snippet,
        knownSkills: uniqueStrings([...knownSkills, ...(item.techStack ?? [])], 80),
        roleLabels,
        projectName: item.name,
        companyName: args.companyName,
        confidence: detectMetric(snippet) ? 86 : 76,
        createdAt: args.createdAt,
      }));
    }
  }

  for (const snippet of [
    ...(args.summary.resumeSections?.experience ?? []),
    ...(args.summary.resumeSections?.projects ?? []),
  ]) {
    claims.push(createClaim({
      sourceType: 'resume',
      sourceId: args.sourceId,
      sourceSection: inferSourceSection(snippet),
      snippet,
      knownSkills,
      roleLabels,
      companyName: args.companyName,
      confidence: detectMetric(snippet) ? 82 : 70,
      createdAt: args.createdAt,
    }));
  }

  return mergeClaims(claims);
}

function claimsFromRawResume(row: ResumeRow, knownSkills: string[]): EvidenceClaim[] {
  const claims = splitMeaningfulLines(row.raw_text)
    .filter((line) =>
      /\b(owned|led|built|designed|implemented|improved|reduced|increased|shipped|created|managed|migrated|scaled|optimized|developed|debugged|delivered)\b/i.test(line) ||
      detectMetric(line) !== null,
    )
    .slice(0, 24)
    .map((line) =>
      createClaim({
        sourceType: 'resume',
        sourceId: row.id,
        sourceSection: inferSourceSection(line),
        snippet: line,
        knownSkills,
        confidence: detectMetric(line) ? 82 : 68,
        createdAt: row.updated_at ?? row.created_at,
      }),
    );
  return mergeClaims(claims);
}

function claimsFromProfile(row: UserProfileRow | null, skills: UserSkillRow[]): EvidenceClaim[] {
  const claims: Array<EvidenceClaim | null> = [];
  if (row?.job_title) {
    claims.push(createClaim({
      sourceType: 'manual',
      sourceId: row.id,
      sourceSection: 'profile',
      snippet: `Current role: ${row.job_title}`,
      normalizedClaim: `Current role is ${row.job_title}`,
      roleLabels: [row.job_title],
      confidence: 74,
      userVerified: true,
      createdAt: row.updated_at,
    }));
  }

  if (typeof row?.years_total === 'number') {
    claims.push(createClaim({
      sourceType: 'manual',
      sourceId: row.id,
      sourceSection: 'profile',
      snippet: `${row.years_total} years total experience`,
      normalizedClaim: `${row.years_total} years total experience`,
      confidence: 72,
      userVerified: true,
      createdAt: row.updated_at,
    }));
  }

  for (const skill of skills) {
    claims.push(createClaim({
      sourceType: skill.source === 'resume_parsed' ? 'resume' : 'manual',
      sourceId: skill.id,
      sourceSection: 'skills',
      snippet: `Profile skill: ${skill.skill_name}${skill.self_assessed_level ? ` (${skill.self_assessed_level})` : ''}`,
      normalizedClaim: `Experience with ${skill.skill_name}`,
      knownSkills: [skill.skill_name],
      confidence: skill.verified ? 86 : 64,
      userVerified: skill.verified,
      createdAt: skill.created_at,
    }));
  }

  return mergeClaims(claims);
}

function buildRoles(
  profile: UserProfileRow | null,
  summaries: ResumeSummary[],
): RoleEntry[] {
  const roles: RoleEntry[] = [];
  for (const summary of summaries) {
    for (const item of summary.experienceItems ?? []) {
      roles.push({
        title: trimToNull(item.role),
        company: trimToNull(item.company),
        dates: trimToNull(item.dates),
        bullets: uniqueStrings(item.bullets ?? [], 8),
      });
    }
  }

  if (roles.length === 0 && profile?.job_title) {
    roles.push({
      title: profile.job_title,
      company: null,
      dates: null,
      bullets: [],
    });
  }

  const seen = new Set<string>();
  return roles.filter((role) => {
    const key = normalizeComparable([role.title, role.company, role.dates].filter(Boolean).join(' '));
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 12);
}

function buildProjects(summaries: ResumeSummary[]): ProjectEntry[] {
  const projects: ProjectEntry[] = [];
  for (const summary of summaries) {
    for (const item of summary.projectItems ?? []) {
      const name = trimToNull(item.name) ?? trimToNull(item.description)?.slice(0, 80);
      if (!name) continue;
      projects.push({
        name,
        summary: trimToNull(item.description) ?? uniqueStrings(item.bullets ?? [], 1)[0] ?? '',
        techStack: uniqueStrings(item.techStack ?? [], 16),
        proofLinks: uniqueStrings(item.links ?? [], 10),
      });
    }
  }

  const seen = new Set<string>();
  return projects.filter((project) => {
    const key = normalizeComparable(project.name);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 12);
}

async function fetchUserProfile(userId: string): Promise<UserProfileRow | null> {
  const { rows } = await pool.query<UserProfileRow>(
    `SELECT id::text,
            job_title,
            years_total,
            primary_stack,
            updated_at::text
       FROM user_profiles_structured
      WHERE user_id = $1
      ORDER BY updated_at DESC
      LIMIT 1`,
    [userId],
  );
  return rows[0] ?? null;
}

async function fetchUserSkills(userId: string): Promise<UserSkillRow[]> {
  const { rows } = await pool.query<UserSkillRow>(
    `SELECT id::text,
            skill_name,
            skill_category,
            self_assessed_level,
            verified,
            source,
            created_at::text
       FROM user_skills
      WHERE user_id = $1
      ORDER BY verified DESC, created_at DESC
      LIMIT 80`,
    [userId],
  );
  return rows;
}

async function fetchResumeRows(userId: string): Promise<ResumeRow[]> {
  const { rows } = await pool.query<ResumeRow>(
    `SELECT id::text,
            raw_text,
            parsed_data,
            source,
            parsed_at::text,
            created_at::text,
            updated_at::text
       FROM user_resume
      WHERE user_id = $1
      ORDER BY COALESCE(updated_at, parsed_at, created_at) DESC
      LIMIT 3`,
    [userId],
  );
  return rows;
}

async function fetchResumeApplicationRows(
  userId: string,
  warnings: ContractWarning[],
): Promise<ResumeApplicationEvidenceRow[]> {
  try {
    const { rows } = await pool.query<ResumeApplicationEvidenceRow>(
      `SELECT id::text,
              resume_id::text,
              target_role,
              target_company,
              resume_summary,
              created_at::text,
              updated_at::text
         FROM resume_applications
        WHERE user_id = $1
        ORDER BY updated_at DESC
        LIMIT 5`,
      [userId],
    );
    return rows;
  } catch (error) {
    if (isMissingRelationError(error)) {
      warnings.push({
        code: 'partial_input',
        message: 'Resume application history is not available in this environment.',
      });
      return [];
    }
    throw error;
  }
}

async function fetchPersistedVerification(
  userId: string,
  claimKeys: string[],
): Promise<Map<string, boolean>> {
  if (claimKeys.length === 0) return new Map();
  try {
    const { rows } = await pool.query<PersistedClaimRow>(
      `SELECT claim_key, user_verified
         FROM candidate_evidence_claims
        WHERE user_id = $1
          AND claim_key = ANY($2::text[])`,
      [userId, claimKeys],
    );
    return new Map(rows.map((row) => [row.claim_key, row.user_verified]));
  } catch (error) {
    if (isMissingRelationError(error)) return new Map();
    throw error;
  }
}

function mapPersistedClaim(row: PersistedEvidenceClaimRow): EvidenceClaim {
  const metadataRefs = Array.isArray(row.metadata?.evidenceRefs)
    ? row.metadata?.evidenceRefs
    : [];
  const metadataEvidenceRefs = metadataRefs.filter((ref): ref is EvidenceRef => {
    if (!ref || typeof ref !== 'object') return false;
    const maybe = ref as Partial<EvidenceRef>;
    return Boolean(
      maybe.id &&
      maybe.sourceType &&
      typeof maybe.originalSnippet === 'string' &&
      typeof maybe.createdAt === 'string',
    );
  });

  return {
    id: row.claim_key,
    normalizedClaim: row.normalized_claim,
    skillLabels: parseStringArray(row.skill_labels),
    roleLabels: parseStringArray(row.role_labels),
    projectName: row.project_name,
    companyName: row.company_name,
    metric: row.metric,
    senioritySignal: row.seniority_signal,
    evidenceRefs: metadataEvidenceRefs.length
      ? metadataEvidenceRefs
      : [
          buildEvidenceRef({
            sourceType: row.source_type,
            sourceId: row.source_id,
            sourceSection: row.source_section,
            snippet: row.original_snippet,
            createdAt: row.updated_at ?? row.created_at,
          }),
        ],
    confidence: clamp(Math.round(row.confidence), 0, 100),
    userVerified: row.user_verified,
  };
}

async function fetchPersistedClaims(
  userId: string,
  warnings: ContractWarning[],
): Promise<EvidenceClaim[]> {
  try {
    const { rows } = await pool.query<PersistedEvidenceClaimRow>(
      `SELECT claim_key,
              normalized_claim,
              skill_labels,
              role_labels,
              project_name,
              company_name,
              metric,
              seniority_signal,
              source_type,
              source_id,
              source_section,
              original_snippet,
              confidence,
              user_verified,
              metadata,
              created_at::text,
              updated_at::text
         FROM candidate_evidence_claims
        WHERE user_id = $1
        ORDER BY updated_at DESC
        LIMIT 120`,
      [userId],
    );
    return rows.map(mapPersistedClaim);
  } catch (error) {
    if (isMissingRelationError(error)) {
      warnings.push({
        code: 'partial_input',
        message: 'Evidence claim history is not available until migration 020 is applied.',
      });
      return [];
    }
    throw error;
  }
}

async function persistClaims(
  userId: string,
  claims: EvidenceClaim[],
  warnings: ContractWarning[],
): Promise<void> {
  try {
    for (const claim of claims) {
      const ref = claim.evidenceRefs[0];
      if (!ref) continue;
      await pool.query(
        `INSERT INTO candidate_evidence_claims
           (user_id,
            claim_key,
            normalized_claim,
            skill_labels,
            role_labels,
            project_name,
            company_name,
            metric,
            seniority_signal,
            source_type,
            source_id,
            source_section,
            original_snippet,
            confidence,
            user_verified,
            metadata)
         VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb)
         ON CONFLICT (user_id, claim_key)
         DO UPDATE SET
            normalized_claim = EXCLUDED.normalized_claim,
            skill_labels = EXCLUDED.skill_labels,
            role_labels = EXCLUDED.role_labels,
            project_name = EXCLUDED.project_name,
            company_name = EXCLUDED.company_name,
            metric = EXCLUDED.metric,
            seniority_signal = EXCLUDED.seniority_signal,
            source_type = EXCLUDED.source_type,
            source_id = EXCLUDED.source_id,
            source_section = EXCLUDED.source_section,
            original_snippet = EXCLUDED.original_snippet,
            confidence = GREATEST(candidate_evidence_claims.confidence, EXCLUDED.confidence),
            user_verified = candidate_evidence_claims.user_verified OR EXCLUDED.user_verified,
            metadata = EXCLUDED.metadata,
            updated_at = NOW()`,
        [
          userId,
          claim.id,
          claim.normalizedClaim,
          JSON.stringify(claim.skillLabels),
          JSON.stringify(claim.roleLabels),
          claim.projectName,
          claim.companyName,
          claim.metric,
          claim.senioritySignal,
          ref.sourceType,
          ref.sourceId,
          ref.sourceSection,
          ref.originalSnippet,
          Math.round(claim.confidence),
          claim.userVerified,
          JSON.stringify({
            evidenceRefs: claim.evidenceRefs,
            generatedBy: 'candidate_evidence_v1',
          }),
        ],
      );
    }
  } catch (error) {
    if (isMissingRelationError(error)) {
      warnings.push({
        code: 'partial_input',
        message: 'Evidence claim persistence is not available until migration 020 is applied.',
      });
      return;
    }
    throw error;
  }
}

async function persistClaimWithMetadata(
  userId: string,
  claim: EvidenceClaim,
  metadata: Record<string, unknown>,
): Promise<void> {
  const ref = claim.evidenceRefs[0];
  if (!ref) return;
  await pool.query(
    `INSERT INTO candidate_evidence_claims
       (user_id,
        claim_key,
        normalized_claim,
        skill_labels,
        role_labels,
        project_name,
        company_name,
        metric,
        seniority_signal,
        source_type,
        source_id,
        source_section,
        original_snippet,
        confidence,
        user_verified,
        metadata)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb)
     ON CONFLICT (user_id, claim_key)
     DO UPDATE SET
        normalized_claim = EXCLUDED.normalized_claim,
        skill_labels = EXCLUDED.skill_labels,
        role_labels = EXCLUDED.role_labels,
        project_name = EXCLUDED.project_name,
        company_name = EXCLUDED.company_name,
        metric = EXCLUDED.metric,
        seniority_signal = EXCLUDED.seniority_signal,
        source_type = EXCLUDED.source_type,
        source_id = EXCLUDED.source_id,
        source_section = EXCLUDED.source_section,
        original_snippet = EXCLUDED.original_snippet,
        confidence = GREATEST(candidate_evidence_claims.confidence, EXCLUDED.confidence),
        user_verified = candidate_evidence_claims.user_verified OR EXCLUDED.user_verified,
        metadata = candidate_evidence_claims.metadata || EXCLUDED.metadata,
        updated_at = NOW()`,
    [
      userId,
      claim.id,
      claim.normalizedClaim,
      JSON.stringify(claim.skillLabels),
      JSON.stringify(claim.roleLabels),
      claim.projectName,
      claim.companyName,
      claim.metric,
      claim.senioritySignal,
      ref.sourceType,
      ref.sourceId,
      ref.sourceSection,
      ref.originalSnippet,
      Math.round(claim.confidence),
      claim.userVerified,
      JSON.stringify({
        evidenceRefs: claim.evidenceRefs,
        generatedBy: 'proof_artifact_evidence_v1',
        ...metadata,
      }),
    ],
  );
}

async function fetchArtifactEvidenceRowsForGoal(
  userId: string,
  goalId: string,
): Promise<ArtifactEvidenceRow[]> {
  const { rows } = await pool.query<ArtifactEvidenceRow>(
    `SELECT sa.id::text AS artifact_id,
            sa.session_id::text,
            sa.node_id::text,
            cn.goal_id,
            cn.title AS node_title,
            cn.description AS node_description,
            sa.task_type,
            sa.artifact_type,
            sa.content,
            sa.status,
            sa.score,
            sa.feedback,
            sa.evaluation,
            sa.evaluated_at::text,
            sa.created_at::text,
            sa.updated_at::text
       FROM session_artifacts sa
       INNER JOIN concept_nodes cn
          ON cn.id = sa.node_id
      WHERE sa.user_id = $1
        AND cn.goal_id = $2
        AND sa.content IS NOT NULL
        AND LENGTH(TRIM(sa.content)) >= 25
        AND sa.status IN ('submitted', 'evaluated')
      ORDER BY sa.updated_at DESC
      LIMIT 30`,
    [userId, goalId],
  );
  return rows;
}

async function fetchArtifactEvidenceRowForSession(
  userId: string,
  sessionId: string,
): Promise<ArtifactEvidenceRow | null> {
  const { rows } = await pool.query<ArtifactEvidenceRow>(
    `SELECT sa.id::text AS artifact_id,
            sa.session_id::text,
            sa.node_id::text,
            cn.goal_id,
            cn.title AS node_title,
            cn.description AS node_description,
            sa.task_type,
            sa.artifact_type,
            sa.content,
            sa.status,
            sa.score,
            sa.feedback,
            sa.evaluation,
            sa.evaluated_at::text,
            sa.created_at::text,
            sa.updated_at::text
       FROM session_artifacts sa
       INNER JOIN concept_nodes cn
          ON cn.id = sa.node_id
      WHERE sa.user_id = $1
        AND sa.session_id = $2
        AND sa.content IS NOT NULL
        AND LENGTH(TRIM(sa.content)) >= 25
      LIMIT 1`,
    [userId, sessionId],
  );
  return rows[0] ?? null;
}

async function getTargetRoleGoalContext(
  userId: string,
  goalId: string | null,
): Promise<{
  goalId: string;
  targetRoleId: string;
  targetRoleTitle: string | null;
} | null> {
  if (!goalId || !/^[a-f\d]{24}$/i.test(goalId)) return null;
  const db = getDb();
  const goal = await db.collection('goals').findOne({
    _id: new ObjectId(goalId),
    userId,
  });
  const targetRoleId = trimToNull(goal?.raw?.targetRoleId);
  if (!goal || goal.raw?.source !== 'target_role' || !targetRoleId) return null;
  return {
    goalId,
    targetRoleId,
    targetRoleTitle: trimToNull(goal.raw?.targetRoleTitle),
  };
}

function buildArtifactClaim(args: {
  row: ArtifactEvidenceRow;
  targetRoleTitle: string | null;
}): EvidenceClaim | null {
  const content = trimToNull(args.row.content);
  if (!content) return null;
  const claimText = `${args.row.node_title}: ${content}`.slice(0, 1400);
  const score = args.row.score ?? null;
  const confidence = score !== null
    ? clamp(45 + score * 10, 50, 95)
    : args.row.status === 'submitted'
      ? 62
      : 70;

  return createClaim({
    sourceType: 'sprint_artifact',
    sourceId: args.row.artifact_id,
    sourceSection: args.row.task_type,
    snippet: content,
    normalizedClaim: claimText,
    knownSkills: detectSkills(`${args.row.node_title} ${args.row.node_description ?? ''} ${content}`),
    roleLabels: uniqueStrings([args.targetRoleTitle], 5),
    projectName: args.row.node_title,
    confidence,
    userVerified: score !== null ? score >= 3 : false,
    createdAt: args.row.evaluated_at ?? args.row.updated_at ?? args.row.created_at,
  });
}

export async function publishArtifactEvidenceRow(
  userId: string,
  row: ArtifactEvidenceRow,
): Promise<EvidenceClaim | null> {
  const context = await getTargetRoleGoalContext(userId, row.goal_id);
  if (!context) return null;
  const claim = buildArtifactClaim({
    row,
    targetRoleTitle: context.targetRoleTitle,
  });
  if (!claim) return null;

  await persistClaimWithMetadata(userId, claim, {
    targetRoleId: context.targetRoleId,
    goalId: context.goalId,
    nodeId: row.node_id,
    sessionId: row.session_id,
    artifactId: row.artifact_id,
    artifactStatus: row.status,
    artifactScore: row.score,
    artifactType: row.artifact_type,
    taskType: row.task_type,
    nodeTitle: row.node_title,
  });
  return claim;
}

export async function publishSessionArtifactAsEvidence(
  sessionId: string,
  userId: string,
): Promise<EvidenceClaim | null> {
  const row = await fetchArtifactEvidenceRowForSession(userId, sessionId);
  if (!row) return null;
  return publishArtifactEvidenceRow(userId, row);
}

export async function publishGoalArtifactsAsEvidence(
  userId: string,
  goalId: string,
): Promise<EvidenceClaim[]> {
  const rows = await fetchArtifactEvidenceRowsForGoal(userId, goalId);
  const claims: EvidenceClaim[] = [];
  for (const row of rows) {
    const claim = await publishArtifactEvidenceRow(userId, row);
    if (claim) claims.push(claim);
  }
  return mergeClaims(claims);
}

export async function getCandidateEvidenceProfile(
  userId: string,
): Promise<CandidateEvidenceProfile> {
  const warnings: ContractWarning[] = [];
  const [profile, userSkills, resumes] = await Promise.all([
    fetchUserProfile(userId),
    fetchUserSkills(userId),
    fetchResumeRows(userId),
  ]);
  const applications = await fetchResumeApplicationRows(userId, warnings);

  const resumeSummaries = resumes
    .map((row) => safeJsonObject<ResumeSummary>(row.parsed_data))
    .filter((summary): summary is ResumeSummary => Boolean(summary));
  const applicationSummaries = applications
    .map((row) => safeJsonObject<ResumeSummary>(row.resume_summary))
    .filter((summary): summary is ResumeSummary => Boolean(summary));
  const summaries = [...resumeSummaries, ...applicationSummaries];
  const profileSkills = parsePrimaryStack(profile?.primary_stack);
  const skillNames = uniqueStrings([
    ...profileSkills,
    ...userSkills.map((skill) => skill.skill_name),
    ...summaries.flatMap((summary) => [
      ...(summary.coreSkills ?? []),
      ...(summary.resumeSections?.skills ?? []),
    ]),
    ...resumes.flatMap((row) => detectSkills(row.raw_text)),
  ], 80);

  const summaryClaims = [
    ...resumes.flatMap((row) => {
      const summary = safeJsonObject<ResumeSummary>(row.parsed_data);
      return summary
        ? claimsFromResumeSummary({
          summary,
          sourceId: row.id,
          createdAt: row.updated_at ?? row.created_at,
          knownSkills: skillNames,
        })
        : [];
    }),
    ...applications.flatMap((row) => {
      const summary = safeJsonObject<ResumeSummary>(row.resume_summary);
      return summary
        ? claimsFromResumeSummary({
          summary,
          sourceId: row.resume_id ?? row.id,
          createdAt: row.updated_at ?? row.created_at,
          knownSkills: skillNames,
          targetRole: row.target_role,
          companyName: row.target_company,
        })
        : [];
    }),
  ];
  const rawResumeClaims = resumes.flatMap((row) => claimsFromRawResume(row, skillNames));
  const profileClaims = claimsFromProfile(profile, userSkills);
  const persistedClaims = await fetchPersistedClaims(userId, warnings);
  let generatedClaims = mergeClaims([...summaryClaims, ...rawResumeClaims, ...profileClaims]);

  const verification = await fetchPersistedVerification(userId, generatedClaims.map((claim) => claim.id));
  generatedClaims = generatedClaims.map((claim) => ({
    ...claim,
    userVerified: claim.userVerified || Boolean(verification.get(claim.id)),
  }));
  await persistClaims(userId, generatedClaims, warnings);

  const claims = mergeClaims([...generatedClaims, ...persistedClaims]);

  if (claims.length === 0) {
    warnings.push({
      code: 'partial_input',
      message: 'Add a resume or profile details to generate stronger evidence-backed readiness.',
    });
  }

  const headline =
    trimToNull(summaries.find((summary) => trimToNull(summary.headline))?.headline) ??
    trimToNull(profile?.job_title);
  const yearsExperience =
    profile?.years_total ??
    summaries.find((summary) => typeof summary.yearsExperience === 'number')?.yearsExperience ??
    null;
  const updatedAt = new Date().toISOString();

  const candidateEvidenceProfile: CandidateEvidenceProfile = {
    userId,
    headline,
    yearsExperience,
    skills: skillNames.slice(0, 60),
    roles: buildRoles(profile, summaries),
    projects: buildProjects(summaries),
    claims,
    updatedAt,
    meta: buildMeta(warnings),
  };

  assertValidCandidateEvidenceProfile(candidateEvidenceProfile);
  return candidateEvidenceProfile;
}
