import { ObjectId } from 'mongodb';
import { config } from '../config';
import { getDb } from '../db/mongo';
import { pool } from '../db/postgres';
import { callClaudeWithUsage, parseJSON } from './claude';
import { recordLlmUsage } from './llmUsage';
import { analyzeRepoEvidence, type RepoSummary } from './repoAnalysis';
import { getRoleMarketProfile } from './roleMarketCatalog';
import { getTargetRole } from './targetRoles';
import { buildUserContext } from './userContext';
import type { RoleMarketProfile, RoleRequirement } from '@daily-push/shared';

export interface ResumeSummary {
  headline: string | null;
  yearsExperience: number | null;
  coreSkills: string[];
  strengths: string[];
  evidenceAreas: string[];
  gapsOrConcerns: string[];
  resumeSections?: {
    summary: string | null;
    skills: string[];
    experience: string[];
    projects: string[];
    education: string[];
    certifications: string[];
  };
  experienceItems?: Array<{
    company: string | null;
    role: string | null;
    dates: string | null;
    bullets: string[];
    technologies: string[];
    quantifiedOutcomes: string[];
  }>;
  projectItems?: Array<{
    name: string | null;
    description: string | null;
    techStack: string[];
    bullets: string[];
    links: string[];
  }>;
  evidenceClaims?: Array<{
    claim: string;
    sourceSection: string | null;
    sourceSnippet: string;
    confidence: number;
  }>;
}

export interface JdRequirement {
  requirement: string;
  type: 'skill' | 'experience' | 'responsibility' | 'domain' | 'seniority' | 'tool' | 'soft_skill';
  priority: 'required' | 'preferred' | 'nice_to_have';
  keywords: string[];
  evidenceNeeded: string;
}

export interface ParsedJobDescription {
  targetRole: string | null;
  senioritySignal: string | null;
  mustHaveSkills: string[];
  preferredSkills: string[];
  evidenceSignals: string[];
  responsibilities: string[];
  hiringGoals: string[];
  jdRequirements?: JdRequirement[];
}

export interface GapReportItem {
  name: string;
  reason: string;
  priority: 'high' | 'medium' | 'low';
}

export interface MissingProofItem {
  area: string;
  evidenceNeeded: string;
  reason: string;
}

export interface RequirementCoverageItem {
  requirement: string;
  status: 'covered' | 'weak' | 'missing';
  priority: 'high' | 'medium' | 'low';
  resumeEvidence: string | null;
  sourceSnippet?: string | null;
  sourceSection?: string | null;
  confidence?: number;
  action: string;
}

export interface GoalGapReport {
  targetRole: string | null;
  readinessLabel: 'early' | 'building' | 'close';
  summary: string;
  requirementCoverage: RequirementCoverageItem[];
  strengths: string[];
  missingSkills: GapReportItem[];
  missingProof: MissingProofItem[];
  sprintEdits: string[];
  interviewRisks: string[];
  portfolioSuggestion: string | null;
  confidence: number;
}

export interface TailoredResume {
  targetRole: string | null;
  headline: string;
  professionalSummary: string;
  skills: string[];
  experienceBullets: string[];
  projectBullets: string[];
  missingEvidenceWarnings: string[];
  atsKeywords: string[];
  bulletEvidence?: Array<{
    bullet: string;
    sourceSnippet: string;
  }>;
  coverNote: string | null;
}

export interface ResumeFitSnapshot {
  targetRole: string | null;
  fitScore: number;
  fitLabel: 'early' | 'building' | 'close';
  headline: string;
  summary: string;
  topStrengths: string[];
  topGaps: Array<{
    name: string;
    reason: string;
    priority: 'high' | 'medium' | 'low';
  }>;
  missingKeywords: string[];
  premiumPreview: string[];
}

export interface GoalJobTargetRecord {
  targetRole: string | null;
  targetCompany: string | null;
  jdText: string | null;
  resumeText: string | null;
  resumeSummary: ResumeSummary | null;
  parsedJd: ParsedJobDescription | null;
  repoUrl: string | null;
  repoSummary: RepoSummary | null;
  gapReport: GoalGapReport | null;
  tailoredResume: TailoredResume | null;
  tailoredResumeGeneratedAt: string | null;
  lastAnalyzedAt: string | null;
}

export interface ResumeApplicationWorkspace extends GoalJobTargetRecord {
  id: string;
  targetRoleId: string | null;
  targetRoleTitle: string | null;
  title: string;
  linkedGoalId: string | null;
  linkedSprintCreatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface JobTargetRow {
  resume_id: string | null;
  target_role: string | null;
  target_company: string | null;
  jd_text: string | null;
  parsed_jd: ParsedJobDescription | Record<string, unknown>;
  resume_summary: ResumeSummary | Record<string, unknown>;
  gap_report: GoalGapReport | Record<string, unknown>;
  tailored_resume: TailoredResume | Record<string, unknown>;
  tailored_resume_generated_at: string | null;
  repo_url: string | null;
  repo_summary: RepoSummary | Record<string, unknown>;
  last_analyzed_at: string | null;
}

interface GlobalResumeWorkspaceRow {
  resume_id: string | null;
  target_role: string | null;
  target_company: string | null;
  jd_text: string | null;
  parsed_jd: ParsedJobDescription | Record<string, unknown>;
  resume_summary: ResumeSummary | Record<string, unknown>;
  gap_report: GoalGapReport | Record<string, unknown>;
  tailored_resume: TailoredResume | Record<string, unknown>;
  tailored_resume_generated_at: string | null;
  last_analyzed_at: string | null;
}

interface ResumeApplicationRow {
  id: string;
  title: string | null;
  target_role_id: string | null;
  target_role_title: string | null;
  resume_id: string | null;
  raw_text: string | null;
  target_role: string | null;
  target_company: string | null;
  jd_text: string;
  parsed_jd: ParsedJobDescription | Record<string, unknown>;
  resume_summary: ResumeSummary | Record<string, unknown>;
  gap_report: GoalGapReport | Record<string, unknown>;
  tailored_resume: TailoredResume | Record<string, unknown>;
  tailored_resume_generated_at: string | null;
  linked_goal_id: string | null;
  linked_sprint_created_at: string | null;
  last_analyzed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ResumeRow {
  id: string;
  raw_text: string;
  parsed_data: ResumeSummary | Record<string, unknown> | null;
}

interface ApplicationTargetRoleContext {
  id: string;
  title: string;
  roleProfile: RoleMarketProfile;
}

async function getApplicationTargetRoleContext(
  userId: string,
  targetRoleId?: string | null,
): Promise<ApplicationTargetRoleContext | null> {
  const normalizedTargetRoleId = trimToNull(targetRoleId);
  if (!normalizedTargetRoleId) return null;

  const targetRole = await getTargetRole(userId, normalizedTargetRoleId);
  if (!targetRole) {
    const error = new Error('Target Role not found');
    (error as Error & { statusCode?: number; code?: string }).statusCode = 404;
    (error as Error & { statusCode?: number; code?: string }).code = 'not_found';
    throw error;
  }

  return {
    id: targetRole.id,
    title: targetRole.title,
    roleProfile: getRoleMarketProfile(targetRole.roleProfileId),
  };
}

const SKILL_PATTERNS: Array<{ label: string; patterns: RegExp[] }> = [
  { label: 'React', patterns: [/\breact\b/i, /\bnext\.?js\b/i] },
  { label: 'Node.js', patterns: [/\bnode\.?js\b/i, /\bnode\b/i] },
  { label: 'TypeScript', patterns: [/\btypescript\b/i] },
  { label: 'JavaScript', patterns: [/\bjavascript\b/i] },
  { label: 'Python', patterns: [/\bpython\b/i] },
  { label: 'Java', patterns: [/\bjava\b/i] },
  { label: 'Docker', patterns: [/\bdocker\b/i] },
  { label: 'Kubernetes', patterns: [/\bkubernetes\b/i, /\bk8s\b/i] },
  { label: 'AWS', patterns: [/\baws\b/i, /\bamazon web services\b/i] },
  { label: 'GCP', patterns: [/\bgcp\b/i, /\bgoogle cloud\b/i] },
  { label: 'PostgreSQL', patterns: [/\bpostgres\b/i, /\bpostgresql\b/i] },
  { label: 'MongoDB', patterns: [/\bmongodb\b/i, /\bmongo\b/i] },
  { label: 'Redis', patterns: [/\bredis\b/i] },
  { label: 'GraphQL', patterns: [/\bgraphql\b/i] },
  { label: 'REST APIs', patterns: [/\brest\b/i, /\bapi\b/i] },
  { label: 'System Design', patterns: [/\bsystem design\b/i, /\bdistributed systems\b/i] },
  { label: 'Testing', patterns: [/\btesting\b/i, /\bjest\b/i, /\bcypress\b/i] },
  { label: 'CI/CD', patterns: [/\bci\/cd\b/i, /\bgithub actions\b/i, /\bjenkins\b/i] },
  { label: 'LLMs', patterns: [/\bllm\b/i, /\blarge language model/i] },
  { label: 'RAG', patterns: [/\brag\b/i, /\bretrieval augmented generation\b/i] },
  { label: 'Prompt Engineering', patterns: [/\bprompt engineering\b/i, /\bprompting\b/i] },
  { label: 'OpenAI API', patterns: [/\bopenai\b/i, /\bgpt-4\b/i, /\bgpt-5\b/i] },
  { label: 'LangChain', patterns: [/\blangchain\b/i] },
];

function trimToNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function safeJsonObject<T>(value: unknown): T | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as T;
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(values.map((value) => value?.trim()).filter((value): value is string => !!value)),
  );
}

function detectSkills(text: string): string[] {
  return SKILL_PATTERNS
    .filter((entry) => entry.patterns.some((pattern) => pattern.test(text)))
    .map((entry) => entry.label);
}

function parseYearsExperience(text: string): number | null {
  const match = text.match(/(\d{1,2})\+?\s*(years|year|yrs)/i);
  if (!match) return null;
  const parsed = parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizePriority(value: unknown): 'high' | 'medium' | 'low' {
  return value === 'high' || value === 'low' ? value : 'medium';
}

function normalizeRequirementType(value: unknown): JdRequirement['type'] {
  return value === 'experience' ||
    value === 'responsibility' ||
    value === 'domain' ||
    value === 'seniority' ||
    value === 'tool' ||
    value === 'soft_skill'
    ? value
    : 'skill';
}

function normalizeRequirementPriority(value: unknown): JdRequirement['priority'] {
  return value === 'preferred' || value === 'nice_to_have' ? value : 'required';
}

function normalizeCoverageStatus(value: unknown): 'covered' | 'weak' | 'missing' {
  return value === 'covered' || value === 'weak' ? value : 'missing';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function normalizeComparable(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function tokenizeComparable(value: string): string[] {
  return normalizeComparable(value)
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

function sourceContainsValue(sourceText: string, value: string | null | undefined): boolean {
  const normalizedValue = normalizeComparable(value ?? '');
  if (!normalizedValue) return false;
  return normalizeComparable(sourceText).includes(normalizedValue);
}

function sourceContainsAny(sourceText: string, values: Array<string | null | undefined>): boolean {
  return values.some((value) => sourceContainsValue(sourceText, value));
}

function normalizeYearsExperience(value: unknown, sourceText: string): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return parseYearsExperience(sourceText);
  }
  const explicitYears = parseYearsExperience(sourceText);
  if (explicitYears === null) return null;
  return Math.min(Math.max(Math.round(value), 0), explicitYears);
}

function sanitizeExperienceItems(
  items: ResumeSummary['experienceItems'] | undefined,
  sourceText: string,
): NonNullable<ResumeSummary['experienceItems']> {
  return (items ?? []).slice(0, 8).map((item) => {
    const bullets = uniqueStrings(item?.bullets ?? [])
      .filter((bullet) => sourceContainsValue(sourceText, bullet))
      .slice(0, 8);
    const technologies = uniqueStrings(item?.technologies ?? [])
      .filter((technology) => sourceContainsValue(sourceText, technology))
      .slice(0, 12);
    const quantifiedOutcomes = uniqueStrings(item?.quantifiedOutcomes ?? [])
      .filter((outcome) => sourceContainsAny(sourceText, [outcome, ...(outcome.match(/\d+[%+]?/g) ?? [])]))
      .slice(0, 6);

    return {
      company: sourceContainsValue(sourceText, item?.company) ? trimToNull(item?.company) : null,
      role: sourceContainsValue(sourceText, item?.role) ? trimToNull(item?.role) : null,
      dates: sourceContainsValue(sourceText, item?.dates) ? trimToNull(item?.dates) : null,
      bullets,
      technologies,
      quantifiedOutcomes,
    };
  }).filter((item) =>
    item.company || item.role || item.dates || item.bullets.length > 0 || item.technologies.length > 0,
  );
}

function sanitizeProjectItems(
  items: ResumeSummary['projectItems'] | undefined,
  sourceText: string,
): NonNullable<ResumeSummary['projectItems']> {
  return (items ?? []).slice(0, 8).map((item) => {
    const bullets = uniqueStrings(item?.bullets ?? [])
      .filter((bullet) => sourceContainsValue(sourceText, bullet))
      .slice(0, 8);
    const techStack = uniqueStrings(item?.techStack ?? [])
      .filter((technology) => sourceContainsValue(sourceText, technology))
      .slice(0, 12);

    return {
      name: sourceContainsValue(sourceText, item?.name) ? trimToNull(item?.name) : null,
      description: sourceContainsValue(sourceText, item?.description) ? trimToNull(item?.description) : null,
      techStack,
      bullets,
      links: uniqueStrings(item?.links ?? []).filter((link) => sourceContainsValue(sourceText, link)).slice(0, 6),
    };
  }).filter((item) =>
    item.name || item.description || item.bullets.length > 0 || item.techStack.length > 0,
  );
}

function evidenceSignalCovered(evidencePool: string[], targetSignal: string): boolean {
  const normalizedTarget = normalizeComparable(targetSignal);
  const targetTokens = tokenizeComparable(targetSignal);

  return evidencePool.some((entry) => {
    const normalizedEntry = normalizeComparable(entry);
    if (!normalizedEntry) return false;
    if (
      normalizedEntry.includes(normalizedTarget) ||
      normalizedTarget.includes(normalizedEntry)
    ) {
      return true;
    }

    const sharedTokens = tokenizeComparable(entry).filter((token) =>
      targetTokens.includes(token),
    );
    return sharedTokens.length >= Math.min(2, targetTokens.length);
  });
}

function splitMeaningfulLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^[\s•*-]+/, '').trim())
    .filter((line) => line.length >= 18 && /[a-z]/i.test(line));
}

function inferSourceSection(line: string): string | null {
  if (/\b(project|built|developed|created|implemented)\b/i.test(line)) return 'projects';
  if (/\b(certified|certification|certificate)\b/i.test(line)) return 'certifications';
  if (/\b(university|college|bachelor|master|degree)\b/i.test(line)) return 'education';
  if (/\b(skill|technologies|tools)\b/i.test(line)) return 'skills';
  if (/\b(owned|led|managed|shipped|designed|engineer|developer)\b/i.test(line)) return 'experience';
  return null;
}

function extractEvidenceClaims(
  rawText: string,
  maxClaims = 16,
): NonNullable<ResumeSummary['evidenceClaims']> {
  return splitMeaningfulLines(rawText)
    .filter((line) =>
      /\b(owned|led|built|designed|implemented|improved|reduced|increased|shipped|created|managed|migrated|scaled|optimized|developed)\b/i.test(line) ||
      /\d+%|\d+\+|\$\d+|\b\d{2,}\b/.test(line),
    )
    .slice(0, maxClaims)
    .map((line) => ({
      claim: line.length > 120 ? `${line.slice(0, 117)}...` : line,
      sourceSection: inferSourceSection(line),
      sourceSnippet: line,
      confidence: /\d+%|\d+\+|\$\d+|\b\d{2,}\b/.test(line) ? 88 : 72,
    }));
}

function fallbackResumeSections(rawText: string, coreSkills: string[]): ResumeSummary['resumeSections'] {
  const lines = splitMeaningfulLines(rawText);
  return {
    summary: trimToNull(lines[0]),
    skills: coreSkills,
    experience: lines.filter((line) => inferSourceSection(line) === 'experience').slice(0, 8),
    projects: lines.filter((line) => inferSourceSection(line) === 'projects').slice(0, 6),
    education: lines.filter((line) => inferSourceSection(line) === 'education').slice(0, 4),
    certifications: lines.filter((line) => inferSourceSection(line) === 'certifications').slice(0, 4),
  };
}

function normalizeEvidenceClaims(
  claims: ResumeSummary['evidenceClaims'] | undefined,
  fallbackRawText: string,
): NonNullable<ResumeSummary['evidenceClaims']> {
  const normalized = (claims ?? []).slice(0, 24).map((item) => ({
    claim: trimToNull(item?.claim) ?? trimToNull(item?.sourceSnippet) ?? 'Resume evidence',
    sourceSection: trimToNull(item?.sourceSection),
    sourceSnippet: trimToNull(item?.sourceSnippet) ?? trimToNull(item?.claim) ?? 'Evidence from resume',
    confidence: clamp(Math.round(item?.confidence ?? 70), 20, 95),
  }));

  return normalized.length > 0 ? normalized : extractEvidenceClaims(fallbackRawText);
}

function buildRequirementsFromParsedJd(parsed: ParsedJobDescription): JdRequirement[] {
  const skillRequirements: JdRequirement[] = parsed.mustHaveSkills.map((skill) => ({
    requirement: skill,
    type: 'skill',
    priority: 'required',
    keywords: [skill],
    evidenceNeeded: `Resume evidence showing hands-on ${skill} experience.`,
  }));
  const preferredRequirements: JdRequirement[] = parsed.preferredSkills.map((skill) => ({
    requirement: skill,
    type: 'tool',
    priority: 'preferred',
    keywords: [skill],
    evidenceNeeded: `A project, role, or bullet mentioning practical ${skill} usage.`,
  }));
  const evidenceRequirements: JdRequirement[] = parsed.evidenceSignals.map((signal) => ({
    requirement: signal,
    type: 'experience',
    priority: 'required',
    keywords: tokenizeComparable(signal),
    evidenceNeeded: `A concrete resume bullet proving ${signal.toLowerCase()}.`,
  }));
  const responsibilityRequirements: JdRequirement[] = parsed.responsibilities.map((responsibility) => ({
    requirement: responsibility,
    type: 'responsibility',
    priority: 'preferred',
    keywords: tokenizeComparable(responsibility),
    evidenceNeeded: `A work example showing ${responsibility.toLowerCase()}.`,
  }));

  return uniqueStrings([
    ...skillRequirements,
    ...preferredRequirements,
    ...evidenceRequirements,
    ...responsibilityRequirements,
  ].map((item) => item.requirement))
    .map((requirement) => [
      ...skillRequirements,
      ...preferredRequirements,
      ...evidenceRequirements,
      ...responsibilityRequirements,
    ].find((item) => item.requirement === requirement))
    .filter((item): item is JdRequirement => !!item)
    .slice(0, 16);
}

function normalizeJdRequirements(
  requirements: JdRequirement[] | undefined,
  parsed: ParsedJobDescription,
): JdRequirement[] {
  const normalized = (requirements ?? []).slice(0, 18).map((item) => ({
    requirement: trimToNull(item?.requirement) ?? 'Unspecified requirement',
    type: normalizeRequirementType(item?.type),
    priority: normalizeRequirementPriority(item?.priority),
    keywords: uniqueStrings(item?.keywords ?? []).slice(0, 8),
    evidenceNeeded: trimToNull(item?.evidenceNeeded) ?? 'Add concrete resume evidence for this requirement.',
  }));
  return normalized.length > 0 ? normalized : buildRequirementsFromParsedJd(parsed);
}

function roleRequirementType(requirement: RoleRequirement): JdRequirement['type'] {
  if (requirement.category === 'skill') return 'skill';
  if (requirement.category === 'tool') return 'tool';
  if (requirement.category === 'domain' || requirement.category === 'business_context') return 'domain';
  if (requirement.category === 'communication') return 'soft_skill';
  if (requirement.category === 'production' || requirement.category === 'system_design') return 'experience';
  return 'responsibility';
}

function roleRequirementPriority(requirement: RoleRequirement): JdRequirement['priority'] {
  if (requirement.priority === 'must_have') return 'required';
  if (requirement.priority === 'important') return 'preferred';
  return 'nice_to_have';
}

function roleRequirementToJdRequirement(requirement: RoleRequirement): JdRequirement {
  return {
    requirement: requirement.label,
    type: roleRequirementType(requirement),
    priority: roleRequirementPriority(requirement),
    keywords: uniqueStrings([requirement.label, ...requirement.keywords]).slice(0, 8),
    evidenceNeeded:
      requirement.proofExpected[0] ??
      `Resume evidence showing ${requirement.label.toLowerCase()}.`,
  };
}

function mergeTargetRoleContextIntoParsedJd(
  parsedJd: ParsedJobDescription,
  roleProfile: RoleMarketProfile | null,
): ParsedJobDescription {
  if (!roleProfile) return parsedJd;

  const roleRequirements = roleProfile.requirements;
  const mustHaveRoleRequirements = roleRequirements.filter((requirement) =>
    requirement.priority === 'must_have' &&
    ['skill', 'tool', 'domain'].includes(requirement.category),
  );
  const preferredRoleRequirements = roleRequirements.filter((requirement) =>
    requirement.priority !== 'must_have' &&
    ['skill', 'tool', 'domain', 'ai_leverage'].includes(requirement.category),
  );
  const proofRoleRequirements = roleRequirements.filter((requirement) =>
    ['production', 'system_design', 'business_context', 'communication', 'ai_leverage'].includes(requirement.category),
  );
  const mergedBase: ParsedJobDescription = {
    targetRole: parsedJd.targetRole ?? roleProfile.title,
    senioritySignal: parsedJd.senioritySignal,
    mustHaveSkills: uniqueStrings([
      ...parsedJd.mustHaveSkills,
      ...mustHaveRoleRequirements.flatMap((requirement) => [
        requirement.label,
        ...requirement.keywords.slice(0, 3),
      ]),
    ]).slice(0, 18),
    preferredSkills: uniqueStrings([
      ...parsedJd.preferredSkills,
      ...preferredRoleRequirements.flatMap((requirement) => [
        requirement.label,
        ...requirement.keywords.slice(0, 3),
      ]),
    ]).slice(0, 18),
    evidenceSignals: uniqueStrings([
      ...parsedJd.evidenceSignals,
      ...proofRoleRequirements.map((requirement) => requirement.label),
      ...proofRoleRequirements.flatMap((requirement) => requirement.proofExpected.slice(0, 1)),
    ]).slice(0, 12),
    responsibilities: uniqueStrings([
      ...parsedJd.responsibilities,
      ...proofRoleRequirements.map((requirement) => requirement.description),
    ]).slice(0, 12),
    hiringGoals: uniqueStrings([
      ...parsedJd.hiringGoals,
      `Match broader ${roleProfile.title} market expectations, not only this company posting.`,
      ...roleProfile.trendSignals.slice(0, 2).map((signal) => signal.label),
    ]).slice(0, 10),
  };
  const mergedRequirements = [
    ...(parsedJd.jdRequirements ?? []),
    ...roleRequirements.slice(0, 14).map(roleRequirementToJdRequirement),
  ];

  return {
    ...mergedBase,
    jdRequirements: normalizeJdRequirements(mergedRequirements, mergedBase),
  };
}

function priorityToCoveragePriority(priority: JdRequirement['priority']): RequirementCoverageItem['priority'] {
  return priority === 'required' ? 'high' : priority === 'preferred' ? 'medium' : 'low';
}

function findEvidenceForRequirement(
  requirement: JdRequirement,
  resumeSummary: ResumeSummary,
  repoSummary?: RepoSummary | null,
): NonNullable<ResumeSummary['evidenceClaims']>[number] | null {
  const claimPool = resumeSummary.evidenceClaims ?? [];
  const keywords = uniqueStrings([
    requirement.requirement,
    ...requirement.keywords,
    ...resumeSummary.coreSkills.filter((skill) =>
      normalizeComparable(requirement.requirement).includes(normalizeComparable(skill)),
    ),
  ]);

  const byClaim = claimPool.find((claim) =>
    keywords.some((keyword) =>
      evidenceSignalCovered([claim.claim, claim.sourceSnippet], keyword),
    ),
  );
  if (byClaim) return byClaim;

  const repoEvidence = [
    ...(repoSummary?.evidenceSignals ?? []),
    ...(repoSummary?.strengthAreas ?? []),
    ...(repoSummary?.demonstratedSkills ?? []),
  ].find((entry) =>
    keywords.some((keyword) => evidenceSignalCovered([entry], keyword)),
  );
  if (!repoEvidence) return null;
  return {
    claim: repoEvidence,
    sourceSection: 'repository',
    sourceSnippet: repoEvidence,
    confidence: 70,
  };
}

function buildCoverageMatrix(params: {
  resumeSummary: ResumeSummary;
  parsedJd: ParsedJobDescription;
  repoSummary?: RepoSummary | null;
}): RequirementCoverageItem[] {
  const { resumeSummary, parsedJd, repoSummary } = params;
  const requirements = normalizeJdRequirements(parsedJd.jdRequirements, parsedJd);
  const resumeSkills = new Set(resumeSummary.coreSkills.map((skill) => normalizeComparable(skill)));

  return requirements.map((requirement) => {
    const evidence = findEvidenceForRequirement(requirement, resumeSummary, repoSummary);
    const skillCovered = requirement.keywords.some((keyword) =>
      resumeSkills.has(normalizeComparable(keyword)),
    ) || resumeSkills.has(normalizeComparable(requirement.requirement));
    const status: RequirementCoverageItem['status'] = evidence || skillCovered
      ? 'covered'
      : requirement.priority === 'required'
        ? 'missing'
        : 'weak';
    const confidence = evidence
      ? evidence.confidence
      : skillCovered
        ? 68
        : requirement.priority === 'required'
          ? 35
          : 48;

    return {
      requirement: requirement.requirement,
      status,
      priority: priorityToCoveragePriority(requirement.priority),
      resumeEvidence: evidence?.claim ?? (skillCovered ? `Resume skills include ${requirement.requirement}.` : null),
      sourceSnippet: evidence?.sourceSnippet ?? null,
      sourceSection: evidence?.sourceSection ?? null,
      confidence,
      action: status === 'covered'
        ? 'Keep this evidence visible in the tailored resume.'
        : requirement.evidenceNeeded,
    };
  });
}

function normalizeCoverageItem(item: Partial<RequirementCoverageItem>): RequirementCoverageItem {
  const confidence = clamp(Math.round(item.confidence ?? 50), 20, 95);
  const hasEvidence = !!trimToNull(item.resumeEvidence) || !!trimToNull(item.sourceSnippet);
  let status = normalizeCoverageStatus(item.status);

  if (hasEvidence && confidence >= 70 && status === 'missing') {
    status = 'weak';
  }
  if (!hasEvidence && status === 'covered') {
    status = confidence >= 70 ? 'weak' : 'missing';
  }
  if (status === 'missing' && confidence > 60) {
    status = hasEvidence ? 'weak' : 'missing';
  }

  return {
    requirement: trimToNull(item.requirement) ?? 'Unspecified requirement',
    status,
    priority: normalizePriority(item.priority),
    resumeEvidence: trimToNull(item.resumeEvidence),
    sourceSnippet: trimToNull(item.sourceSnippet),
    sourceSection: trimToNull(item.sourceSection),
    confidence: status === 'missing' && !hasEvidence ? Math.min(confidence, 55) : confidence,
    action: trimToNull(item.action) ?? 'Add clearer resume evidence for this requirement.',
  };
}

function filterWarningsToJobRequirements(
  warnings: string[],
  parsedJd: ParsedJobDescription,
  gapReport?: GoalGapReport | null,
): string[] {
  const allowedText = normalizeComparable([
    parsedJd.targetRole,
    ...parsedJd.mustHaveSkills,
    ...parsedJd.preferredSkills,
    ...parsedJd.evidenceSignals,
    ...parsedJd.responsibilities,
    ...(parsedJd.jdRequirements ?? []).flatMap((item) => [
      item.requirement,
      item.evidenceNeeded,
      ...item.keywords,
    ]),
    ...(gapReport?.missingSkills ?? []).map((item) => item.name),
    ...(gapReport?.missingProof ?? []).map((item) => item.area),
    ...(gapReport?.requirementCoverage ?? [])
      .filter((item) => item.status !== 'covered')
      .map((item) => item.requirement),
  ].filter(Boolean).join(' '));

  return warnings.filter((warning) => {
    const normalizedWarning = normalizeComparable(warning);
    if (
      !normalizedWarning ||
      normalizedWarning === 'not specified' ||
      normalizedWarning === 'none' ||
      normalizedWarning === 'n a'
    ) {
      return false;
    }
    const tokens = tokenizeComparable(warning)
      .filter((token) => token.length > 3)
      .filter((token) => ![
        'missing',
        'evidence',
        'experience',
        'specific',
        'examples',
        'provided',
        'detailed',
        'project',
        'before',
        'applying',
      ].includes(token));
    if (tokens.length === 0) return true;
    return tokens.some((token) => allowedText.includes(token));
  });
}

function fallbackResumeSummary(rawText: string): ResumeSummary {
  const coreSkills = detectSkills(rawText);
  const evidenceClaims = extractEvidenceClaims(rawText);
  return {
    headline: trimToNull(rawText.split(/\r?\n/)[0] ?? null),
    yearsExperience: parseYearsExperience(rawText),
    coreSkills,
    strengths: coreSkills.slice(0, 4),
    evidenceAreas: evidenceClaims.length > 0
      ? evidenceClaims.slice(0, 5).map((claim) => claim.claim)
      : coreSkills.slice(0, 3).map((skill) => `Experience mentioning ${skill}`),
    gapsOrConcerns: coreSkills.length === 0 ? ['Resume does not clearly signal core technical skills.'] : [],
    resumeSections: fallbackResumeSections(rawText, coreSkills),
    experienceItems: [],
    projectItems: [],
    evidenceClaims,
  };
}

function fallbackParsedJd(
  jdText: string,
  targetRole: string | null,
): ParsedJobDescription {
  const mustHaveSkills = detectSkills(jdText);
  const parsed: ParsedJobDescription = {
    targetRole: targetRole ?? trimToNull(jdText.split(/\r?\n/)[0] ?? null),
    senioritySignal: /\bsenior|staff|lead\b/i.test(jdText)
      ? 'senior+'
      : /\bmid\b/i.test(jdText)
        ? 'mid'
        : null,
    mustHaveSkills,
    preferredSkills: [],
    evidenceSignals: uniqueStrings([
      /\bsystem design\b/i.test(jdText) ? 'System design evidence' : null,
      /\bship|delivery|own\b/i.test(jdText) ? 'Ownership or delivery examples' : null,
      /\blead|mentor\b/i.test(jdText) ? 'Leadership or mentoring proof' : null,
    ]),
    responsibilities: uniqueStrings([
      /\bscale|performance\b/i.test(jdText) ? 'Scaling or performance work' : null,
      /\bcross-functional|stakeholder\b/i.test(jdText) ? 'Cross-functional collaboration' : null,
      /\barchitecture\b/i.test(jdText) ? 'Architecture decisions' : null,
    ]),
    hiringGoals: uniqueStrings([
      /\bai\b/i.test(jdText) ? 'Move faster with applied AI' : null,
      mustHaveSkills.length > 0 ? `Strong coverage of ${mustHaveSkills.slice(0, 3).join(', ')}` : null,
    ]),
  };
  return {
    ...parsed,
    jdRequirements: buildRequirementsFromParsedJd(parsed),
  };
}

async function parseResume(
  userId: string,
  goalId: string,
  rawText: string,
): Promise<ResumeSummary> {
  try {
    const response = await callClaudeWithUsage({
      system: `You parse developer resumes into structured summaries.
Return JSON only. No markdown or prose outside JSON.`,
      userMessage: `Resume text:
"""
${rawText}
"""

Return JSON:
{
  "headline": "Senior backend engineer with experience in APIs and cloud systems",
  "yearsExperience": 5,
  "coreSkills": ["Node.js", "TypeScript", "AWS"],
  "strengths": ["API design", "Scaling backend services"],
  "evidenceAreas": ["Built internal platforms", "Owned production services"],
  "gapsOrConcerns": ["Little direct system design evidence"],
  "resumeSections": {
    "summary": "Short candidate summary if present",
    "skills": ["Node.js", "TypeScript"],
    "experience": ["Experience section line or bullet"],
    "projects": ["Project section line or bullet"],
    "education": ["Education line"],
    "certifications": ["Certification line"]
  },
  "experienceItems": [
    {
      "company": "Acme",
      "role": "Backend Engineer",
      "dates": "2021-2024",
      "bullets": ["Owned production APIs used by internal teams."],
      "technologies": ["Node.js", "PostgreSQL"],
      "quantifiedOutcomes": ["Reduced latency by 30%"]
    }
  ],
  "projectItems": [
    {
      "name": "AI workflow platform",
      "description": "Internal tool for AI-assisted workflows",
      "techStack": ["OpenAI API", "TypeScript"],
      "bullets": ["Built evaluation and prompt iteration workflow."],
      "links": []
    }
  ],
  "evidenceClaims": [
    {
      "claim": "Owned production APIs",
      "sourceSection": "experience",
      "sourceSnippet": "Owned production APIs used by internal teams.",
      "confidence": 86
    }
  ]
}`,
      useCache: true,
    });
    await recordLlmUsage({
      userId,
      goalId,
      featureKey: 'goal_resume_parse',
      operationKey: 'resume_parse',
      usage: response.usage,
    }).catch(() => {});
    const parsed = parseJSON<ResumeSummary>(response.text);
    const coreSkills = uniqueStrings([
      ...detectSkills(rawText),
      ...(parsed.coreSkills ?? []),
      ...(parsed.resumeSections?.skills ?? []),
    ]);
    const evidenceClaims = normalizeEvidenceClaims(parsed.evidenceClaims, rawText);
    return {
      headline: trimToNull(parsed.headline),
      yearsExperience: normalizeYearsExperience(parsed.yearsExperience, rawText),
      coreSkills,
      strengths: uniqueStrings(parsed.strengths ?? []).slice(0, 6),
      evidenceAreas: uniqueStrings([
        ...(parsed.evidenceAreas ?? []),
        ...evidenceClaims.slice(0, 6).map((claim) => claim.claim),
      ]).slice(0, 8),
      gapsOrConcerns: uniqueStrings(parsed.gapsOrConcerns ?? []).slice(0, 6),
      resumeSections: {
        summary: trimToNull(parsed.resumeSections?.summary),
        skills: coreSkills.slice(0, 24),
        experience: uniqueStrings(parsed.resumeSections?.experience ?? []).slice(0, 12),
        projects: uniqueStrings(parsed.resumeSections?.projects ?? []).slice(0, 10),
        education: uniqueStrings(parsed.resumeSections?.education ?? []).slice(0, 6),
        certifications: uniqueStrings(parsed.resumeSections?.certifications ?? []).slice(0, 6),
      },
      experienceItems: sanitizeExperienceItems(parsed.experienceItems, rawText),
      projectItems: sanitizeProjectItems(parsed.projectItems, rawText),
      evidenceClaims,
    };
  } catch {
    return fallbackResumeSummary(rawText);
  }
}

async function parseJobDescription(
  userId: string,
  goalId: string,
  jdText: string,
  targetRole: string | null,
): Promise<ParsedJobDescription> {
  try {
    const response = await callClaudeWithUsage({
      system: `You extract the real hiring signals from engineering job descriptions.
Return JSON only. No markdown or prose outside JSON.`,
      userMessage: `Target role: ${targetRole ?? 'Unknown'}

Job description:
"""
${jdText}
"""

Return JSON:
{
  "targetRole": "Senior Backend Engineer",
  "senioritySignal": "senior+",
  "mustHaveSkills": ["System Design", "Node.js", "AWS"],
  "preferredSkills": ["Docker"],
  "evidenceSignals": ["Ownership of production systems", "System design depth"],
  "responsibilities": ["Design backend services", "Collaborate across teams"],
  "hiringGoals": ["Scale core systems safely"],
  "jdRequirements": [
    {
      "requirement": "Own production backend systems",
      "type": "experience",
      "priority": "required",
      "keywords": ["ownership", "production systems"],
      "evidenceNeeded": "A resume bullet showing ownership of production systems, decisions, and outcomes."
    }
  ]
}`,
      useCache: true,
    });
    await recordLlmUsage({
      userId,
      goalId,
      featureKey: 'goal_job_description_parse',
      operationKey: 'job_description_parse',
      usage: response.usage,
    }).catch(() => {});
    const parsed = parseJSON<ParsedJobDescription>(response.text);
    const normalizedBase = {
      targetRole: trimToNull(parsed.targetRole) ?? targetRole,
      senioritySignal: trimToNull(parsed.senioritySignal),
      mustHaveSkills: uniqueStrings([
        ...detectSkills(jdText),
        ...(parsed.mustHaveSkills ?? []),
      ]),
      preferredSkills: uniqueStrings(parsed.preferredSkills ?? []),
      evidenceSignals: uniqueStrings(parsed.evidenceSignals ?? []).slice(0, 8),
      responsibilities: uniqueStrings(parsed.responsibilities ?? []).slice(0, 8),
      hiringGoals: uniqueStrings(parsed.hiringGoals ?? []).slice(0, 8),
    };
    return {
      ...normalizedBase,
      jdRequirements: normalizeJdRequirements(parsed.jdRequirements, normalizedBase),
    };
  } catch {
    return fallbackParsedJd(jdText, targetRole);
  }
}

function fallbackGapReport(params: {
  goalTitle: string | null;
  targetRole: string | null;
  resumeSummary: ResumeSummary;
  parsedJd: ParsedJobDescription;
  repoSummary?: RepoSummary | null;
}): GoalGapReport {
  const { goalTitle, targetRole, resumeSummary, parsedJd, repoSummary } = params;
  const evidenceSkills = uniqueStrings([
    ...resumeSummary.coreSkills,
    ...(repoSummary?.demonstratedSkills ?? []),
  ]);
  const resumeSkills = new Set(evidenceSkills.map((skill) => skill.toLowerCase()));
  const overlap = parsedJd.mustHaveSkills.filter((skill) =>
    resumeSkills.has(skill.toLowerCase()),
  );
  const evidenceSignals = uniqueStrings([
    ...resumeSummary.evidenceAreas,
    ...resumeSummary.strengths,
    ...(repoSummary?.evidenceSignals ?? []),
    ...(repoSummary?.strengthAreas ?? []),
  ]);
  const missingSkills = parsedJd.mustHaveSkills
    .filter((skill) => !resumeSkills.has(skill.toLowerCase()))
    .slice(0, 5)
    .map((skill, index) => ({
      name: skill,
      reason: `${skill} appears in the target role, but your current resume summary does not show strong evidence for it yet.`,
      priority: (index < 2 ? 'high' : index < 4 ? 'medium' : 'low') as 'high' | 'medium' | 'low',
    }));

  const uncoveredSignals = parsedJd.evidenceSignals
    .filter((signal) => !evidenceSignalCovered(evidenceSignals, signal))
    .slice(0, 4);
  const missingProof: MissingProofItem[] = uncoveredSignals.map((signal) => ({
    area: signal,
    evidenceNeeded: `Add a concrete example, artifact, or story that proves ${signal.toLowerCase()}.`,
    reason: `The target role explicitly signals ${signal.toLowerCase()}, but your current profile still needs more visible proof here.`,
  }));
  const requirementCoverage = buildCoverageMatrix({
    resumeSummary,
    parsedJd,
    repoSummary,
  }).slice(0, 12);

  const skillRatio =
    parsedJd.mustHaveSkills.length > 0
      ? overlap.length / parsedJd.mustHaveSkills.length
      : evidenceSkills.length > 0
        ? 0.5
        : 0.2;
  const proofRatio =
    parsedJd.evidenceSignals.length > 0
      ? (parsedJd.evidenceSignals.length - uncoveredSignals.length) /
        parsedJd.evidenceSignals.length
      : 0.5;
  const readinessRatio = clamp((skillRatio * 0.75) + (proofRatio * 0.25), 0.15, 0.92);

  const readinessLabel: GoalGapReport['readinessLabel'] =
    readinessRatio >= 0.7 ? 'close' : readinessRatio >= 0.4 ? 'building' : 'early';

  return {
    targetRole,
    readinessLabel,
    summary:
      readinessLabel === 'close'
        ? `You already overlap with several core signals for ${targetRole ?? 'this role'}, but you still need stronger proof on the missing areas.`
        : readinessLabel === 'building'
          ? `You have a workable base for ${targetRole ?? 'this role'}, but you still need to close a few important capability and proof gaps.`
          : `Your current profile looks early for ${targetRole ?? 'this role'}, so the best move is to tighten the foundational gaps and create stronger proof before applying.`,
    requirementCoverage,
    strengths: uniqueStrings([
      ...resumeSummary.strengths,
      ...(repoSummary?.strengthAreas ?? []),
      ...overlap.map((skill) => `Resume already signals ${skill}`),
    ]).slice(0, 5),
    missingSkills,
    missingProof,
    sprintEdits: uniqueStrings([
      missingSkills[0] ? `Add a focused sprint block for ${missingSkills[0].name}.` : null,
      missingProof[0] ? `Create one artifact that proves ${missingProof[0].area.toLowerCase()}.` : null,
      repoSummary?.recommendedArtifacts?.[0] ?? null,
      goalTitle ? `Keep tying sessions back to ${goalTitle}.` : null,
    ]).slice(0, 4),
    interviewRisks: uniqueStrings([
      missingSkills[0] ? `Interviewers may probe ${missingSkills[0].name} depth.` : null,
      missingProof[0] ? `You may struggle to give crisp examples for ${missingProof[0].area.toLowerCase()}.` : null,
    ]).slice(0, 4),
    portfolioSuggestion: repoSummary?.recommendedArtifacts?.[0] ?? (
      missingProof[0]
        ? `Build or document a small artifact that clearly demonstrates ${missingProof[0].area.toLowerCase()}.`
        : 'Document one recent project with clearer outcomes and trade-offs.'
    ),
    confidence: clamp(Math.round(readinessRatio * 100), 35, 80),
  };
}

export async function buildResumeFitSnapshot(input: {
  rawText: string;
  jdText: string;
}): Promise<ResumeFitSnapshot> {
  const resumeSummary = fallbackResumeSummary(input.rawText);
  const parsedJd = fallbackParsedJd(input.jdText, null);
  const gapReport = fallbackGapReport({
    goalTitle: null,
    targetRole: parsedJd.targetRole,
    resumeSummary,
    parsedJd,
    repoSummary: null,
  });
  const resumeSkillSet = new Set(
    resumeSummary.coreSkills.map((skill) => normalizeComparable(skill)),
  );
  const missingKeywords = uniqueStrings([
    ...parsedJd.mustHaveSkills,
    ...parsedJd.preferredSkills,
  ])
    .filter((skill) => !resumeSkillSet.has(normalizeComparable(skill)))
    .slice(0, 8);
  const topStrengths = uniqueStrings([
    ...gapReport.strengths,
    ...resumeSummary.strengths,
    ...resumeSummary.coreSkills.slice(0, 4).map((skill) => `${skill} appears in your resume`),
  ]).slice(0, 5);
  const topGaps = uniqueStrings([
    ...gapReport.missingSkills.map((item) => item.name),
    ...gapReport.missingProof.map((item) => item.area),
    ...missingKeywords,
  ]).slice(0, 5).map((name, index) => {
    const skillGap = gapReport.missingSkills.find((item) => item.name === name);
    const proofGap = gapReport.missingProof.find((item) => item.area === name);
    return {
      name,
      reason:
        skillGap?.reason ??
        proofGap?.reason ??
        `${name} appears important for this job, but it is not strongly visible in the resume snapshot.`,
      priority: (skillGap?.priority ?? (index < 2 ? 'high' : 'medium')) as 'high' | 'medium' | 'low',
    };
  });

  return {
    targetRole: parsedJd.targetRole,
    fitScore: gapReport.confidence,
    fitLabel: gapReport.readinessLabel,
    headline: parsedJd.targetRole
      ? `Resume fit for ${parsedJd.targetRole}`
      : 'Resume fit snapshot',
    summary: gapReport.summary,
    topStrengths,
    topGaps,
    missingKeywords,
    premiumPreview: [
      'Requirement-by-requirement coverage matrix',
      'Evidence-safe tailored resume draft',
      'Interview risk report',
      'Gap-closing sprint plan',
    ],
  };
}

function fallbackTailoredResume(params: {
  targetRole: string | null;
  resumeSummary: ResumeSummary;
  parsedJd: ParsedJobDescription;
  gapReport?: GoalGapReport | null;
}): TailoredResume {
  const { targetRole, resumeSummary, parsedJd, gapReport } = params;
  const role = parsedJd.targetRole ?? targetRole ?? 'Target role';
  const skills = uniqueStrings([
    ...resumeSummary.coreSkills,
    ...parsedJd.mustHaveSkills.filter((skill) =>
      resumeSummary.coreSkills.some(
        (existing) => existing.toLowerCase() === skill.toLowerCase(),
      ),
    ),
  ]).slice(0, 14);
  const evidenceClaims = resumeSummary.evidenceClaims ?? [];
  const experienceBullets = uniqueStrings([
    ...evidenceClaims.map((item) => item.claim),
    ...resumeSummary.evidenceAreas.map((item) => `Demonstrated ${item.toLowerCase()}.`),
    ...resumeSummary.strengths.map((item) => `Applied ${item.toLowerCase()} in relevant work.`),
  ]).slice(0, 6);

  return {
    targetRole: parsedJd.targetRole ?? targetRole,
    headline: `${role} candidate`,
    professionalSummary:
      resumeSummary.headline ??
      `Candidate for ${role} with relevant experience across ${skills.slice(0, 4).join(', ') || 'the target role requirements'}.`,
    skills,
    experienceBullets,
    projectBullets: uniqueStrings([
      gapReport?.portfolioSuggestion ?? null,
      ...(resumeSummary.projectItems ?? []).flatMap((item) => item.bullets),
      ...parsedJd.responsibilities.slice(0, 3).map((item) => `Prepare a project story showing ${item.toLowerCase()}.`),
    ]).slice(0, 4),
    missingEvidenceWarnings: uniqueStrings([
      ...resumeSummary.gapsOrConcerns,
      ...(gapReport?.missingProof.map((item) => item.area) ?? []),
      ...(gapReport?.missingSkills.map((item) => item.name) ?? []),
    ]).slice(0, 6),
    atsKeywords: uniqueStrings([
      ...parsedJd.mustHaveSkills,
      ...parsedJd.preferredSkills,
      ...parsedJd.responsibilities,
    ]).slice(0, 18),
    bulletEvidence: experienceBullets.slice(0, 6).map((bullet) => ({
      bullet,
      sourceSnippet:
        evidenceClaims.find((claim) => bullet.includes(claim.claim) || claim.claim.includes(bullet))?.sourceSnippet ??
        'Generated from parsed resume evidence.',
    })),
    coverNote:
      'Draft only from existing resume evidence. Add real metrics, employers, dates, and outcomes before applying.',
  };
}

async function buildTailoredResume(params: {
  userId: string;
  goalId: string;
  targetRole: string | null;
  targetCompany: string | null;
  resumeText: string;
  resumeSummary: ResumeSummary;
  parsedJd: ParsedJobDescription;
  jdText: string;
  gapReport?: GoalGapReport | null;
}): Promise<TailoredResume> {
  const {
    userId,
    goalId,
    targetRole,
    targetCompany,
    resumeText,
    resumeSummary,
    parsedJd,
    jdText,
    gapReport,
  } = params;

  try {
    const response = await callClaudeWithUsage({
      system: `You are an ethical technical resume writer.
Create a targeted resume draft using only evidence present in the original resume.
Do not invent employers, dates, degrees, certifications, metrics, technologies, responsibilities, or achievements.
You may reorder, rewrite, prioritize, and clarify existing evidence for the target job.
If the job description asks for evidence not present in the resume, place it in missingEvidenceWarnings instead of fabricating it.
Every generated experience or project bullet must be grounded in a sourceSnippet from the resume evidence claims.
Return JSON only.`,
      userMessage: `Target role: ${parsedJd.targetRole ?? targetRole ?? 'Unknown'}
Target company: ${targetCompany ?? 'Unknown'}

Resume summary:
${JSON.stringify(resumeSummary, null, 2)}

Original resume excerpt:
"""
${resumeText.slice(0, 15000)}
"""

Parsed job description:
${JSON.stringify(parsedJd, null, 2)}

Job description excerpt:
"""
${jdText.slice(0, 5000)}
"""

Gap report:
${JSON.stringify(gapReport ?? {}, null, 2)}

Return JSON:
{
  "targetRole": "Senior Backend Engineer",
  "headline": "Senior Backend Engineer | Node.js | Distributed Systems",
  "professionalSummary": "3-4 sentence resume summary grounded only in the supplied resume.",
  "skills": ["Node.js", "TypeScript"],
  "experienceBullets": ["Rewritten resume bullet grounded in existing evidence."],
  "projectBullets": ["Project or portfolio bullet grounded in existing evidence."],
  "missingEvidenceWarnings": ["Kubernetes is in the JD but not proven in the resume."],
  "atsKeywords": ["Backend", "APIs"],
  "bulletEvidence": [
    {
      "bullet": "Rewritten resume bullet grounded in existing evidence.",
      "sourceSnippet": "Original resume bullet or line that proves the rewritten bullet."
    }
  ],
  "coverNote": "Short note about what to verify before applying."
}`,
      useCache: false,
    });
    await recordLlmUsage({
      userId,
      goalId,
      featureKey: 'tailored_resume',
      operationKey: 'tailored_resume_generation',
      usage: response.usage,
      metadata: {
        targetRole: parsedJd.targetRole ?? targetRole,
      },
    }).catch(() => {});

    const parsed = parseJSON<TailoredResume>(response.text);
    return {
      targetRole: trimToNull(parsed.targetRole) ?? parsedJd.targetRole ?? targetRole,
      headline: trimToNull(parsed.headline) ?? `${parsedJd.targetRole ?? targetRole ?? 'Target role'} candidate`,
      professionalSummary:
        trimToNull(parsed.professionalSummary) ??
        fallbackTailoredResume({ targetRole, resumeSummary, parsedJd, gapReport }).professionalSummary,
      skills: uniqueStrings(parsed.skills ?? []).slice(0, 18),
      experienceBullets: uniqueStrings(parsed.experienceBullets ?? []).slice(0, 8),
      projectBullets: uniqueStrings(parsed.projectBullets ?? []).slice(0, 6),
      missingEvidenceWarnings: filterWarningsToJobRequirements(
        uniqueStrings(parsed.missingEvidenceWarnings ?? []),
        parsedJd,
        gapReport,
      ).slice(0, 8),
      atsKeywords: uniqueStrings(parsed.atsKeywords ?? []).slice(0, 24),
      bulletEvidence: (parsed.bulletEvidence ?? []).slice(0, 12).map((item) => ({
        bullet: trimToNull(item?.bullet) ?? 'Generated resume bullet',
        sourceSnippet: trimToNull(item?.sourceSnippet) ?? 'Source evidence not provided by model.',
      })),
      coverNote: trimToNull(parsed.coverNote),
    };
  } catch {
    return fallbackTailoredResume({ targetRole, resumeSummary, parsedJd, gapReport });
  }
}

async function buildGapReport(params: {
  userId: string;
  goalId: string;
  goalTitle: string | null;
  sprintTargetRole: string | null;
  sprintTargetCompany: string | null;
  resumeSummary: ResumeSummary;
  parsedJd: ParsedJobDescription;
  jdText: string;
  repoSummary?: RepoSummary | null;
}): Promise<GoalGapReport> {
  const {
    userId,
    goalId,
    goalTitle,
    sprintTargetRole,
    sprintTargetCompany,
    resumeSummary,
    parsedJd,
    jdText,
    repoSummary,
  } = params;

  const userContext = await buildUserContext(userId, goalId);

  try {
    const response = await callClaudeWithUsage({
      system: `You are a pragmatic engineering career coach.
Compare a developer's current evidence against a target role and return a structured gap report in JSON only.`,
      userMessage: `${userContext.toPromptString()}

Goal title: ${goalTitle ?? 'Unknown'}
Sprint target role: ${sprintTargetRole ?? 'Unknown'}
Sprint target company: ${sprintTargetCompany ?? 'Unknown'}

Resume summary:
${JSON.stringify(resumeSummary, null, 2)}

Parsed job description:
${JSON.stringify(parsedJd, null, 2)}

Repository evidence summary:
${JSON.stringify(repoSummary ?? {}, null, 2)}

Raw job description excerpt:
"""
${jdText.slice(0, 4000)}
"""

Return JSON:
{
  "targetRole": "Senior Backend Engineer",
  "readinessLabel": "building",
  "summary": "You have a solid backend base but still need stronger proof in system design and ownership.",
  "requirementCoverage": [
    {
      "requirement": "Own production backend systems",
      "status": "covered",
      "priority": "high",
      "resumeEvidence": "Resume says they owned production APIs.",
      "sourceSnippet": "Owned production APIs used by internal teams.",
      "sourceSection": "experience",
      "confidence": 86,
      "action": "Keep this in the top third of the tailored resume."
    },
    {
      "requirement": "System design depth",
      "status": "weak",
      "priority": "high",
      "resumeEvidence": null,
      "sourceSnippet": null,
      "sourceSection": null,
      "confidence": 45,
      "action": "Add one architecture bullet with scale, trade-offs, and outcome."
    }
  ],
  "strengths": ["API experience", "Cloud familiarity"],
  "missingSkills": [
    {
      "name": "System Design",
      "reason": "The role expects stronger large-scale design depth than your current evidence shows.",
      "priority": "high"
    }
  ],
  "missingProof": [
    {
      "area": "Ownership of production systems",
      "evidenceNeeded": "A concise story or artifact showing decisions, trade-offs, and outcomes.",
      "reason": "The JD emphasizes ownership but the resume summary is light on visible proof."
    }
  ],
  "sprintEdits": ["Add one system-design artifact per week."],
  "interviewRisks": ["You may get pressed on scaling trade-offs."],
  "portfolioSuggestion": "Document one architecture decision with trade-offs and outcomes.",
  "confidence": 72
}`,
      useCache: false,
    });
    await recordLlmUsage({
      userId,
      goalId,
      featureKey: 'goal_gap_report',
      operationKey: 'gap_report_generation',
      usage: response.usage,
      metadata: {
        targetRole: parsedJd.targetRole ?? sprintTargetRole,
      },
    }).catch(() => {});

    const parsed = parseJSON<GoalGapReport>(response.text);
    const deterministicCoverage = buildCoverageMatrix({
      resumeSummary,
      parsedJd,
      repoSummary,
    });
    const parsedCoverage = (parsed.requirementCoverage ?? [])
      .slice(0, 12)
      .map((item) => normalizeCoverageItem(item));
    return {
      targetRole: trimToNull(parsed.targetRole) ?? parsedJd.targetRole ?? sprintTargetRole,
      readinessLabel:
        parsed.readinessLabel === 'close' || parsed.readinessLabel === 'early'
          ? parsed.readinessLabel
          : 'building',
      summary: trimToNull(parsed.summary) ?? fallbackGapReport({
        goalTitle,
        targetRole: parsedJd.targetRole ?? sprintTargetRole,
        resumeSummary,
        parsedJd,
        repoSummary,
      }).summary,
      requirementCoverage: parsedCoverage.length > 0 ? parsedCoverage : deterministicCoverage,
      strengths: uniqueStrings(parsed.strengths ?? []).slice(0, 6),
      missingSkills: (parsed.missingSkills ?? []).slice(0, 6).map((item) => ({
        name: trimToNull(item?.name) ?? 'Unspecified skill',
        reason: trimToNull(item?.reason) ?? 'This looks like a target-role gap.',
        priority: normalizePriority(item?.priority),
      })),
      missingProof: (parsed.missingProof ?? []).slice(0, 6).map((item) => ({
        area: trimToNull(item?.area) ?? 'Unspecified evidence area',
        evidenceNeeded:
          trimToNull(item?.evidenceNeeded) ?? 'Add stronger proof here.',
        reason: trimToNull(item?.reason) ?? 'This proof is weak in the current profile.',
      })),
      sprintEdits: uniqueStrings(parsed.sprintEdits ?? []).slice(0, 6),
      interviewRisks: uniqueStrings(parsed.interviewRisks ?? []).slice(0, 6),
      portfolioSuggestion: trimToNull(parsed.portfolioSuggestion),
      confidence: clamp(Math.round(parsed.confidence ?? 60), 20, 95),
    };
  } catch {
    return fallbackGapReport({
      goalTitle,
      targetRole: parsedJd.targetRole ?? sprintTargetRole,
      resumeSummary,
      parsedJd,
      repoSummary,
    });
  }
}

export async function saveGoalResume(
  userId: string,
  goalId: string,
  rawText: string,
  source: 'upload' | 'linkedin_paste' | 'manual' = 'manual',
): Promise<{ resumeId: string; resumeSummary: ResumeSummary }> {
  const parsed = await parseResume(userId, goalId, rawText);
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO user_resume
       (user_id, raw_text, parsed_data, parsed_at, source, created_at, updated_at)
     VALUES
       ($1, $2, $3::jsonb, NOW(), $4, NOW(), NOW())
     RETURNING id`,
    [userId, rawText, JSON.stringify(parsed), source],
  );

  const resumeId = rows[0].id;
  await pool.query(
    `INSERT INTO job_targets
       (user_id, goal_id, resume_id, resume_summary, updated_at)
     VALUES
       ($1, $2, $3, $4::jsonb, NOW())
     ON CONFLICT (user_id, goal_id)
     DO UPDATE SET
       resume_id = EXCLUDED.resume_id,
       resume_summary = EXCLUDED.resume_summary,
       updated_at = NOW()`,
    [userId, goalId, resumeId, JSON.stringify(parsed)],
  );

  return { resumeId, resumeSummary: parsed };
}

export async function saveGlobalResume(
  userId: string,
  rawText: string,
  source: 'upload' | 'linkedin_paste' | 'manual' = 'manual',
): Promise<{ resumeId: string; resumeSummary: ResumeSummary }> {
  const parsed = await parseResume(userId, 'global-resume', rawText);
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO user_resume
       (user_id, raw_text, parsed_data, parsed_at, source, created_at, updated_at)
     VALUES
       ($1, $2, $3::jsonb, NOW(), $4, NOW(), NOW())
     RETURNING id`,
    [userId, rawText, JSON.stringify(parsed), source],
  );

  const resumeId = rows[0].id;
  await pool.query(
    `INSERT INTO user_resume_workspaces
       (user_id, resume_id, resume_summary, updated_at)
     VALUES
       ($1, $2, $3::jsonb, NOW())
     ON CONFLICT (user_id)
     DO UPDATE SET
       resume_id = EXCLUDED.resume_id,
       resume_summary = EXCLUDED.resume_summary,
       updated_at = NOW()`,
    [userId, resumeId, JSON.stringify(parsed)],
  );

  return { resumeId, resumeSummary: parsed };
}

export async function saveGoalJobDescription(
  userId: string,
  goalId: string,
  input: {
    targetRole?: string | null;
    targetCompany?: string | null;
    jdText: string;
  },
): Promise<{ parsedJd: ParsedJobDescription }> {
  const targetRole = trimToNull(input.targetRole) ?? null;
  const targetCompany = trimToNull(input.targetCompany) ?? null;
  const jdText = input.jdText.trim();
  if (!jdText) {
    throw new Error('Job description text is required');
  }

  const parsedJd = await parseJobDescription(userId, goalId, jdText, targetRole);
  await pool.query(
    `INSERT INTO job_targets
       (user_id, goal_id, target_role, target_company, jd_text, parsed_jd, updated_at)
     VALUES
       ($1, $2, $3, $4, $5, $6::jsonb, NOW())
     ON CONFLICT (user_id, goal_id)
     DO UPDATE SET
       target_role = EXCLUDED.target_role,
       target_company = EXCLUDED.target_company,
       jd_text = EXCLUDED.jd_text,
       parsed_jd = EXCLUDED.parsed_jd,
       updated_at = NOW()`,
    [
      userId,
      goalId,
      parsedJd.targetRole ?? targetRole,
      targetCompany,
      jdText,
      JSON.stringify(parsedJd),
    ],
  );

  return { parsedJd };
}

export async function saveGlobalJobDescription(
  userId: string,
  input: {
    targetRole?: string | null;
    targetCompany?: string | null;
    jdText: string;
  },
): Promise<{ parsedJd: ParsedJobDescription }> {
  const targetRole = trimToNull(input.targetRole) ?? null;
  const targetCompany = trimToNull(input.targetCompany) ?? null;
  const jdText = input.jdText.trim();
  if (!jdText) {
    throw new Error('Job description text is required');
  }

  const parsedJd = await parseJobDescription(userId, 'global-resume', jdText, targetRole);
  await pool.query(
    `INSERT INTO user_resume_workspaces
       (user_id, target_role, target_company, jd_text, parsed_jd, updated_at)
     VALUES
       ($1, $2, $3, $4, $5::jsonb, NOW())
     ON CONFLICT (user_id)
     DO UPDATE SET
       target_role = EXCLUDED.target_role,
       target_company = EXCLUDED.target_company,
       jd_text = EXCLUDED.jd_text,
       parsed_jd = EXCLUDED.parsed_jd,
       updated_at = NOW()`,
    [
      userId,
      parsedJd.targetRole ?? targetRole,
      targetCompany,
      jdText,
      JSON.stringify(parsedJd),
    ],
  );

  return { parsedJd };
}

export async function saveGoalRepoImport(
  userId: string,
  goalId: string,
  input: {
    repoUrl: string;
    repoContext?: string | null;
    targetRole?: string | null;
    targetCompany?: string | null;
  },
): Promise<{ repoSummary: RepoSummary }> {
  const repoUrl = trimToNull(input.repoUrl);
  if (!repoUrl) {
    throw new Error('Repository URL is required');
  }
  if (!config.career.gapReportRepoEvidenceEnabled) {
    throw new Error('Repository evidence is currently disabled for gap reports.');
  }

  const current = await getGoalGapReportRecord(userId, goalId);
  const repoSummary = await analyzeRepoEvidence({
    repoUrl,
    repoContext: trimToNull(input.repoContext),
    targetRole: trimToNull(input.targetRole) ?? current.targetRole,
    targetCompany: trimToNull(input.targetCompany) ?? current.targetCompany,
    parsedJd: current.parsedJd,
  });

  await pool.query(
    `INSERT INTO job_targets
       (user_id, goal_id, repo_url, repo_summary, updated_at)
     VALUES
       ($1, $2, $3, $4::jsonb, NOW())
     ON CONFLICT (user_id, goal_id)
     DO UPDATE SET
       repo_url = EXCLUDED.repo_url,
       repo_summary = EXCLUDED.repo_summary,
       updated_at = NOW()`,
    [userId, goalId, repoSummary.repoUrl, JSON.stringify(repoSummary)],
  );

  return { repoSummary };
}

async function getLatestResumeForGoal(
  userId: string,
  goalId: string,
): Promise<ResumeRow | null> {
  const { rows } = await pool.query<ResumeRow>(
    `SELECT ur.id, ur.raw_text, ur.parsed_data
       FROM job_targets jt
       LEFT JOIN user_resume ur
         ON ur.id = jt.resume_id
      WHERE jt.user_id = $1
        AND jt.goal_id = $2
      LIMIT 1`,
    [userId, goalId],
  );
  return rows[0] ?? null;
}

async function getJobTargetRow(
  userId: string,
  goalId: string,
): Promise<JobTargetRow | null> {
  const { rows } = await pool.query<JobTargetRow>(
    `SELECT
       resume_id,
       target_role,
       target_company,
       jd_text,
       parsed_jd,
       resume_summary,
       gap_report,
       tailored_resume,
       tailored_resume_generated_at::text,
       repo_url,
       repo_summary,
       last_analyzed_at::text
     FROM job_targets
     WHERE user_id = $1
       AND goal_id = $2
     LIMIT 1`,
    [userId, goalId],
  );
  return rows[0] ?? null;
}

async function getLatestGlobalResume(
  userId: string,
): Promise<ResumeRow | null> {
  const { rows } = await pool.query<ResumeRow>(
    `SELECT ur.id, ur.raw_text, ur.parsed_data
       FROM user_resume_workspaces rw
       LEFT JOIN user_resume ur
         ON ur.id = rw.resume_id
      WHERE rw.user_id = $1
      LIMIT 1`,
    [userId],
  );
  return rows[0] ?? null;
}

async function getGlobalResumeWorkspaceRow(
  userId: string,
): Promise<GlobalResumeWorkspaceRow | null> {
  const { rows } = await pool.query<GlobalResumeWorkspaceRow>(
    `SELECT
       resume_id,
       target_role,
       target_company,
       jd_text,
       parsed_jd,
       resume_summary,
       gap_report,
       tailored_resume,
       tailored_resume_generated_at::text,
       last_analyzed_at::text
     FROM user_resume_workspaces
     WHERE user_id = $1
     LIMIT 1`,
    [userId],
  );
  return rows[0] ?? null;
}

export async function getGlobalResumeRecord(
  userId: string,
): Promise<GoalJobTargetRecord> {
  const [workspace, resumeRow] = await Promise.all([
    getGlobalResumeWorkspaceRow(userId),
    getLatestGlobalResume(userId),
  ]);

  const resumeSummary =
    safeJsonObject<ResumeSummary>(workspace?.resume_summary) ??
    safeJsonObject<ResumeSummary>(resumeRow?.parsed_data) ??
    null;
  const parsedJd = safeJsonObject<ParsedJobDescription>(workspace?.parsed_jd) ?? null;
  const gapReport = safeJsonObject<GoalGapReport>(workspace?.gap_report);
  const tailoredResume = safeJsonObject<TailoredResume>(workspace?.tailored_resume);

  return {
    targetRole: trimToNull(workspace?.target_role) ?? null,
    targetCompany: trimToNull(workspace?.target_company) ?? null,
    jdText: trimToNull(workspace?.jd_text) ?? null,
    resumeText: trimToNull(resumeRow?.raw_text) ?? null,
    resumeSummary,
    parsedJd,
    repoUrl: null,
    repoSummary: null,
    gapReport:
      gapReport && Object.keys(gapReport).length > 0 ? gapReport : null,
    tailoredResume:
      tailoredResume && Object.keys(tailoredResume).length > 0 ? tailoredResume : null,
    tailoredResumeGeneratedAt: workspace?.tailored_resume_generated_at ?? null,
    lastAnalyzedAt: workspace?.last_analyzed_at ?? null,
  };
}

function mapResumeApplicationRow(row: ResumeApplicationRow): ResumeApplicationWorkspace {
  const resumeSummary = safeJsonObject<ResumeSummary>(row.resume_summary);
  const parsedJd = safeJsonObject<ParsedJobDescription>(row.parsed_jd);
  const gapReport = safeJsonObject<GoalGapReport>(row.gap_report);
  const tailoredResume = safeJsonObject<TailoredResume>(row.tailored_resume);

  return {
    id: row.id,
    targetRoleId: trimToNull(row.target_role_id),
    targetRoleTitle: trimToNull(row.target_role_title),
    title:
      trimToNull(row.title) ??
      `${trimToNull(row.target_role) ?? parsedJd?.targetRole ?? 'Target job'} application`,
    targetRole: trimToNull(row.target_role) ?? parsedJd?.targetRole ?? null,
    targetCompany: trimToNull(row.target_company) ?? null,
    jdText: trimToNull(row.jd_text),
    resumeText: trimToNull(row.raw_text),
    resumeSummary,
    parsedJd,
    repoUrl: null,
    repoSummary: null,
    gapReport:
      gapReport && Object.keys(gapReport).length > 0 ? gapReport : null,
    tailoredResume:
      tailoredResume && Object.keys(tailoredResume).length > 0 ? tailoredResume : null,
    tailoredResumeGeneratedAt: row.tailored_resume_generated_at,
    lastAnalyzedAt: row.last_analyzed_at,
    linkedGoalId: trimToNull(row.linked_goal_id),
    linkedSprintCreatedAt: row.linked_sprint_created_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getResumeApplicationRow(
  userId: string,
  applicationId: string,
): Promise<ResumeApplicationRow | null> {
  const { rows } = await pool.query<ResumeApplicationRow>(
    `SELECT
       ra.id,
       ra.title,
       ra.target_role_id::text,
       ctr.title AS target_role_title,
       ra.resume_id,
       ur.raw_text,
       ra.target_role,
       ra.target_company,
       ra.jd_text,
       ra.parsed_jd,
       ra.resume_summary,
       ra.gap_report,
       ra.tailored_resume,
       ra.tailored_resume_generated_at::text,
       ra.linked_goal_id,
       ra.linked_sprint_created_at::text,
       ra.last_analyzed_at::text,
       ra.created_at::text,
       ra.updated_at::text
     FROM resume_applications ra
     LEFT JOIN candidate_target_roles ctr
       ON ctr.id = ra.target_role_id
      AND ctr.user_id = ra.user_id
     LEFT JOIN user_resume ur
       ON ur.id = ra.resume_id
     WHERE ra.user_id = $1
       AND ra.id = $2
     LIMIT 1`,
    [userId, applicationId],
  );
  return rows[0] ?? null;
}

export async function listResumeApplications(
  userId: string,
  filters: { targetRoleId?: string | null } = {},
): Promise<ResumeApplicationWorkspace[]> {
  const targetRoleId = trimToNull(filters.targetRoleId);
  const { rows } = await pool.query<ResumeApplicationRow>(
    `SELECT
       ra.id,
       ra.title,
       ra.target_role_id::text,
       ctr.title AS target_role_title,
       ra.resume_id,
       ur.raw_text,
       ra.target_role,
       ra.target_company,
       ra.jd_text,
       ra.parsed_jd,
       ra.resume_summary,
       ra.gap_report,
       ra.tailored_resume,
       ra.tailored_resume_generated_at::text,
       ra.linked_goal_id,
       ra.linked_sprint_created_at::text,
       ra.last_analyzed_at::text,
       ra.created_at::text,
       ra.updated_at::text
     FROM resume_applications ra
     LEFT JOIN candidate_target_roles ctr
       ON ctr.id = ra.target_role_id
      AND ctr.user_id = ra.user_id
      LEFT JOIN user_resume ur
        ON ur.id = ra.resume_id
      WHERE ra.user_id = $1
        AND ($2::uuid IS NULL OR ra.target_role_id = $2::uuid)
      ORDER BY ra.created_at DESC
      LIMIT 25`,
    [userId, targetRoleId],
  );
  return rows.map(mapResumeApplicationRow);
}

export async function getResumeApplication(
  userId: string,
  applicationId: string,
): Promise<ResumeApplicationWorkspace | null> {
  const row = await getResumeApplicationRow(userId, applicationId);
  return row ? mapResumeApplicationRow(row) : null;
}

export async function createResumeApplication(
  userId: string,
  input: {
    rawText: string;
    jdText: string;
    source?: 'upload' | 'linkedin_paste' | 'manual';
    title?: string | null;
    targetRoleId?: string | null;
  },
): Promise<ResumeApplicationWorkspace> {
  const rawText = input.rawText.trim();
  const jdText = input.jdText.trim();
  if (!rawText) {
    throw new Error('Resume text is required');
  }
  if (!jdText) {
    throw new Error('Job description text is required');
  }

  const analysisScope = 'resume-app';
  const targetRoleContext = await getApplicationTargetRoleContext(userId, input.targetRoleId);
  const resumeSummary = await parseResume(userId, analysisScope, rawText);
  const { rows: resumeRows } = await pool.query<{ id: string }>(
    `INSERT INTO user_resume
       (user_id, raw_text, parsed_data, parsed_at, source, created_at, updated_at)
     VALUES
       ($1, $2, $3::jsonb, NOW(), $4, NOW(), NOW())
     RETURNING id`,
    [userId, rawText, JSON.stringify(resumeSummary), input.source ?? 'manual'],
  );
  const resumeId = resumeRows[0].id;
  const parsedJd = mergeTargetRoleContextIntoParsedJd(
    await parseJobDescription(
      userId,
      analysisScope,
      jdText,
      targetRoleContext?.title ?? null,
    ),
    targetRoleContext?.roleProfile ?? null,
  );
  const gapReport = await buildGapReport({
    userId,
    goalId: analysisScope,
    goalTitle: null,
    sprintTargetRole: targetRoleContext?.title ?? parsedJd.targetRole,
    sprintTargetCompany: null,
    resumeSummary,
    parsedJd,
    jdText,
    repoSummary: null,
  });
  const title =
    trimToNull(input.title) ??
    `${parsedJd.targetRole ?? targetRoleContext?.title ?? 'Target job'} application`;

  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO resume_applications
       (
          user_id,
          target_role_id,
          resume_id,
         title,
         target_role,
         target_company,
         jd_text,
         parsed_jd,
         resume_summary,
         gap_report,
         last_analyzed_at,
         created_at,
         updated_at
       )
     VALUES
        ($1, $2, $3, $4, $5, NULL, $6, $7::jsonb, $8::jsonb, $9::jsonb, NOW(), NOW(), NOW())
      RETURNING id`,
    [
      userId,
      targetRoleContext?.id ?? null,
      resumeId,
      title,
      parsedJd.targetRole,
      jdText,
      JSON.stringify(parsedJd),
      JSON.stringify(resumeSummary),
      JSON.stringify(gapReport),
    ],
  );

  const application = await getResumeApplication(userId, rows[0].id);
  if (!application) {
    throw new Error('Failed to create resume application');
  }
  return application;
}

export async function generateResumeApplicationTailoredResume(
  userId: string,
  applicationId: string,
): Promise<ResumeApplicationWorkspace> {
  const application = await getResumeApplication(userId, applicationId);
  if (!application) {
    throw new Error('Resume application not found');
  }
  if (!application.resumeText || !application.resumeSummary) {
    throw new Error('Save a resume before generating a tailored resume.');
  }
  if (!application.jdText || !application.parsedJd) {
    throw new Error('Save a target job description before generating a tailored resume.');
  }

  const gapReport =
    application.gapReport ??
    fallbackGapReport({
      goalTitle: null,
      targetRole: application.parsedJd.targetRole ?? application.targetRole,
      resumeSummary: application.resumeSummary,
      parsedJd: application.parsedJd,
      repoSummary: null,
    });
  const tailoredResume = await buildTailoredResume({
    userId,
    goalId: 'resume-app',
    targetRole: application.targetRole,
    targetCompany: application.targetCompany,
    resumeText: application.resumeText,
    resumeSummary: application.resumeSummary,
    parsedJd: application.parsedJd,
    jdText: application.jdText,
    gapReport,
  });

  await pool.query(
    `UPDATE resume_applications
        SET tailored_resume = $3::jsonb,
            tailored_resume_generated_at = NOW(),
            gap_report = $4::jsonb,
            updated_at = NOW()
      WHERE user_id = $1
        AND id = $2`,
    [userId, applicationId, JSON.stringify(tailoredResume), JSON.stringify(gapReport)],
  );

  const updated = await getResumeApplication(userId, applicationId);
  if (!updated) {
    throw new Error('Resume application not found');
  }
  return updated;
}

export async function linkResumeApplicationGoal(
  userId: string,
  applicationId: string,
  goalId: string,
  sprintCreated = false,
): Promise<void> {
  await pool.query(
    `UPDATE resume_applications
        SET linked_goal_id = $3,
            linked_sprint_created_at = CASE
              WHEN $4::boolean THEN NOW()
              ELSE linked_sprint_created_at
            END,
            updated_at = NOW()
      WHERE user_id = $1
        AND id = $2`,
    [userId, applicationId, goalId, sprintCreated],
  );
}

export async function getGoalGapReportRecord(
  userId: string,
  goalId: string,
): Promise<GoalJobTargetRecord> {
  const [jobTarget, resumeRow] = await Promise.all([
    getJobTargetRow(userId, goalId),
    getLatestResumeForGoal(userId, goalId),
  ]);

  const resumeSummary =
    safeJsonObject<ResumeSummary>(jobTarget?.resume_summary) ??
    safeJsonObject<ResumeSummary>(resumeRow?.parsed_data) ??
    null;
  const parsedJd = safeJsonObject<ParsedJobDescription>(jobTarget?.parsed_jd) ?? null;
  const repoSummaryRaw = config.career.gapReportRepoEvidenceEnabled
    ? safeJsonObject<RepoSummary>(jobTarget?.repo_summary)
    : null;
  const repoSummary =
    repoSummaryRaw && Object.keys(repoSummaryRaw).length > 0 ? repoSummaryRaw : null;
  const gapReport = safeJsonObject<GoalGapReport>(jobTarget?.gap_report);
  const tailoredResume = safeJsonObject<TailoredResume>(jobTarget?.tailored_resume);

  return {
    targetRole: trimToNull(jobTarget?.target_role) ?? null,
    targetCompany: trimToNull(jobTarget?.target_company) ?? null,
    jdText: trimToNull(jobTarget?.jd_text) ?? null,
    resumeText: trimToNull(resumeRow?.raw_text) ?? null,
    resumeSummary,
    parsedJd,
    repoUrl: config.career.gapReportRepoEvidenceEnabled
      ? trimToNull(jobTarget?.repo_url) ?? repoSummary?.repoUrl ?? null
      : null,
    repoSummary,
    gapReport:
      gapReport && Object.keys(gapReport).length > 0 ? gapReport : null,
    tailoredResume:
      tailoredResume && Object.keys(tailoredResume).length > 0 ? tailoredResume : null,
    tailoredResumeGeneratedAt: jobTarget?.tailored_resume_generated_at ?? null,
    lastAnalyzedAt: jobTarget?.last_analyzed_at ?? null,
  };
}

export async function rebuildGoalGapReport(
  userId: string,
  goalId: string,
): Promise<GoalJobTargetRecord> {
  const db = getDb();
  const goal = await db.collection('goals').findOne({
    _id: new ObjectId(goalId),
    userId,
  });

  if (!goal) {
    throw new Error('Goal not found');
  }

  const current = await getGoalGapReportRecord(userId, goalId);
  if (!current.resumeText || !current.resumeSummary) {
    throw new Error('Save a resume before generating a gap report.');
  }
  if (!current.jdText || !current.parsedJd) {
    throw new Error('Save a target job description before generating a gap report.');
  }

  const sprintTargetRole = trimToNull(goal?.sprint?.targetRole) ?? current.targetRole;
  const sprintTargetCompany = trimToNull(goal?.sprint?.targetCompany) ?? current.targetCompany;

  const report = await buildGapReport({
    userId,
    goalId,
    goalTitle: trimToNull(goal?.structured?.title) ?? null,
    sprintTargetRole,
    sprintTargetCompany,
    resumeSummary: current.resumeSummary,
    parsedJd: current.parsedJd,
    jdText: current.jdText,
    repoSummary: config.career.gapReportRepoEvidenceEnabled
      ? current.repoSummary
      : null,
  });

  await pool.query(
    `UPDATE job_targets
        SET gap_report = $3::jsonb,
            last_analyzed_at = NOW(),
            updated_at = NOW()
      WHERE user_id = $1
        AND goal_id = $2`,
    [userId, goalId, JSON.stringify(report)],
  );

  return {
    ...current,
    targetRole: current.targetRole ?? sprintTargetRole ?? report.targetRole,
    targetCompany: current.targetCompany ?? sprintTargetCompany,
    gapReport: report,
    lastAnalyzedAt: new Date().toISOString(),
  };
}

export async function rebuildGlobalGapReport(
  userId: string,
): Promise<GoalJobTargetRecord> {
  const current = await getGlobalResumeRecord(userId);
  if (!current.resumeText || !current.resumeSummary) {
    throw new Error('Save a resume before generating a gap report.');
  }
  if (!current.jdText || !current.parsedJd) {
    throw new Error('Save a target job description before generating a gap report.');
  }

  const report = await buildGapReport({
    userId,
    goalId: 'global-resume',
    goalTitle: null,
    sprintTargetRole: current.targetRole,
    sprintTargetCompany: current.targetCompany,
    resumeSummary: current.resumeSummary,
    parsedJd: current.parsedJd,
    jdText: current.jdText,
    repoSummary: null,
  });

  await pool.query(
    `UPDATE user_resume_workspaces
        SET gap_report = $2::jsonb,
            last_analyzed_at = NOW(),
            updated_at = NOW()
      WHERE user_id = $1`,
    [userId, JSON.stringify(report)],
  );

  return {
    ...current,
    targetRole: current.targetRole ?? report.targetRole,
    gapReport: report,
    lastAnalyzedAt: new Date().toISOString(),
  };
}

export async function generateTailoredResume(
  userId: string,
  goalId: string,
): Promise<GoalJobTargetRecord> {
  const db = getDb();
  const goal = await db.collection('goals').findOne({
    _id: new ObjectId(goalId),
    userId,
  });

  if (!goal) {
    throw new Error('Goal not found');
  }

  const current = await getGoalGapReportRecord(userId, goalId);
  if (!current.resumeText || !current.resumeSummary) {
    throw new Error('Save a resume before generating a tailored resume.');
  }
  if (!current.jdText || !current.parsedJd) {
    throw new Error('Save a target job description before generating a tailored resume.');
  }

  const sprintTargetRole = trimToNull(goal?.sprint?.targetRole) ?? current.targetRole;
  const sprintTargetCompany = trimToNull(goal?.sprint?.targetCompany) ?? current.targetCompany;
  const gapReport =
    current.gapReport ??
    fallbackGapReport({
      goalTitle: trimToNull(goal?.structured?.title) ?? null,
      targetRole: current.parsedJd.targetRole ?? sprintTargetRole,
      resumeSummary: current.resumeSummary,
      parsedJd: current.parsedJd,
      repoSummary: null,
    });

  const tailoredResume = await buildTailoredResume({
    userId,
    goalId,
    targetRole: sprintTargetRole,
    targetCompany: sprintTargetCompany,
    resumeText: current.resumeText,
    resumeSummary: current.resumeSummary,
    parsedJd: current.parsedJd,
    jdText: current.jdText,
    gapReport,
  });

  await pool.query(
    `UPDATE job_targets
        SET tailored_resume = $3::jsonb,
            tailored_resume_generated_at = NOW(),
            updated_at = NOW()
      WHERE user_id = $1
        AND goal_id = $2`,
    [userId, goalId, JSON.stringify(tailoredResume)],
  );

  return {
    ...current,
    targetRole: current.targetRole ?? sprintTargetRole ?? tailoredResume.targetRole,
    targetCompany: current.targetCompany ?? sprintTargetCompany,
    gapReport: current.gapReport ?? gapReport,
    tailoredResume,
    tailoredResumeGeneratedAt: new Date().toISOString(),
  };
}

export async function generateGlobalTailoredResume(
  userId: string,
): Promise<GoalJobTargetRecord> {
  const current = await getGlobalResumeRecord(userId);
  if (!current.resumeText || !current.resumeSummary) {
    throw new Error('Save a resume before generating a tailored resume.');
  }
  if (!current.jdText || !current.parsedJd) {
    throw new Error('Save a target job description before generating a tailored resume.');
  }

  const gapReport =
    current.gapReport ??
    fallbackGapReport({
      goalTitle: null,
      targetRole: current.parsedJd.targetRole ?? current.targetRole,
      resumeSummary: current.resumeSummary,
      parsedJd: current.parsedJd,
      repoSummary: null,
    });

  const tailoredResume = await buildTailoredResume({
    userId,
    goalId: 'global-resume',
    targetRole: current.targetRole,
    targetCompany: current.targetCompany,
    resumeText: current.resumeText,
    resumeSummary: current.resumeSummary,
    parsedJd: current.parsedJd,
    jdText: current.jdText,
    gapReport,
  });

  await pool.query(
    `UPDATE user_resume_workspaces
        SET tailored_resume = $2::jsonb,
            tailored_resume_generated_at = NOW(),
            updated_at = NOW()
      WHERE user_id = $1`,
    [userId, JSON.stringify(tailoredResume)],
  );

  return {
    ...current,
    targetRole: current.targetRole ?? tailoredResume.targetRole,
    gapReport: current.gapReport ?? gapReport,
    tailoredResume,
    tailoredResumeGeneratedAt: new Date().toISOString(),
  };
}
