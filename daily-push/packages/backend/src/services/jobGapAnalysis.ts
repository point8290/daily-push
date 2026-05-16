import { ObjectId } from 'mongodb';
import { config } from '../config';
import { getDb } from '../db/mongo';
import { pool } from '../db/postgres';
import { callClaudeWithUsage, parseJSON } from './claude';
import { recordLlmUsage } from './llmUsage';
import { analyzeRepoEvidence, type RepoSummary } from './repoAnalysis';
import { buildUserContext } from './userContext';

export interface ResumeSummary {
  headline: string | null;
  yearsExperience: number | null;
  coreSkills: string[];
  strengths: string[];
  evidenceAreas: string[];
  gapsOrConcerns: string[];
}

export interface ParsedJobDescription {
  targetRole: string | null;
  senioritySignal: string | null;
  mustHaveSkills: string[];
  preferredSkills: string[];
  evidenceSignals: string[];
  responsibilities: string[];
  hiringGoals: string[];
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

export interface GoalGapReport {
  targetRole: string | null;
  readinessLabel: 'early' | 'building' | 'close';
  summary: string;
  strengths: string[];
  missingSkills: GapReportItem[];
  missingProof: MissingProofItem[];
  sprintEdits: string[];
  interviewRisks: string[];
  portfolioSuggestion: string | null;
  confidence: number;
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
  lastAnalyzedAt: string | null;
}

interface JobTargetRow {
  resume_id: string | null;
  target_role: string | null;
  target_company: string | null;
  jd_text: string | null;
  parsed_jd: ParsedJobDescription | Record<string, unknown>;
  resume_summary: ResumeSummary | Record<string, unknown>;
  gap_report: GoalGapReport | Record<string, unknown>;
  repo_url: string | null;
  repo_summary: RepoSummary | Record<string, unknown>;
  last_analyzed_at: string | null;
}

interface ResumeRow {
  id: string;
  raw_text: string;
  parsed_data: ResumeSummary | Record<string, unknown> | null;
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

function fallbackResumeSummary(rawText: string): ResumeSummary {
  const coreSkills = detectSkills(rawText);
  return {
    headline: trimToNull(rawText.split(/\r?\n/)[0] ?? null),
    yearsExperience: parseYearsExperience(rawText),
    coreSkills,
    strengths: coreSkills.slice(0, 4),
    evidenceAreas: coreSkills.slice(0, 3).map((skill) => `Experience mentioning ${skill}`),
    gapsOrConcerns: coreSkills.length === 0 ? ['Resume does not clearly signal core technical skills.'] : [],
  };
}

function fallbackParsedJd(
  jdText: string,
  targetRole: string | null,
): ParsedJobDescription {
  const mustHaveSkills = detectSkills(jdText);
  return {
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
  "gapsOrConcerns": ["Little direct system design evidence"]
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
    return {
      headline: trimToNull(parsed.headline),
      yearsExperience: parsed.yearsExperience ?? null,
      coreSkills: uniqueStrings(parsed.coreSkills ?? []),
      strengths: uniqueStrings(parsed.strengths ?? []).slice(0, 6),
      evidenceAreas: uniqueStrings(parsed.evidenceAreas ?? []).slice(0, 6),
      gapsOrConcerns: uniqueStrings(parsed.gapsOrConcerns ?? []).slice(0, 6),
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
  "hiringGoals": ["Scale core systems safely"]
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
    return {
      targetRole: trimToNull(parsed.targetRole) ?? targetRole,
      senioritySignal: trimToNull(parsed.senioritySignal),
      mustHaveSkills: uniqueStrings(parsed.mustHaveSkills ?? []),
      preferredSkills: uniqueStrings(parsed.preferredSkills ?? []),
      evidenceSignals: uniqueStrings(parsed.evidenceSignals ?? []).slice(0, 8),
      responsibilities: uniqueStrings(parsed.responsibilities ?? []).slice(0, 8),
      hiringGoals: uniqueStrings(parsed.hiringGoals ?? []).slice(0, 8),
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
