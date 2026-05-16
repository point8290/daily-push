import axios from 'axios';
import { callClaude, parseJSON } from './claude';

export type RepoSummarySource =
  | 'github_readme'
  | 'notes_only'
  | 'mixed'
  | 'url_only';

export interface RepoSummary {
  repoUrl: string;
  repoName: string | null;
  inputContext: string | null;
  summary: string;
  inspectedFiles: string[];
  demonstratedSkills: string[];
  strengthAreas: string[];
  evidenceSignals: string[];
  missingSignals: string[];
  recommendedArtifacts: string[];
  confidence: number;
  source: RepoSummarySource;
}

export interface AnalyzeRepoEvidenceInput {
  repoUrl: string;
  repoContext?: string | null;
  targetRole?: string | null;
  targetCompany?: string | null;
  parsedJd?: {
    mustHaveSkills?: string[];
    evidenceSignals?: string[];
  } | null;
}

const SKILL_PATTERNS: Array<{ label: string; patterns: RegExp[] }> = [
  { label: 'React', patterns: [/\breact\b/i, /\bnext\.?js\b/i] },
  { label: 'Node.js', patterns: [/\bnode\.?js\b/i, /\bexpress\b/i] },
  { label: 'TypeScript', patterns: [/\btypescript\b/i] },
  { label: 'JavaScript', patterns: [/\bjavascript\b/i] },
  { label: 'Python', patterns: [/\bpython\b/i, /\bfastapi\b/i, /\bdjango\b/i] },
  { label: 'Java', patterns: [/\bjava\b/i, /\bspring\b/i] },
  { label: 'Docker', patterns: [/\bdocker\b/i] },
  { label: 'Kubernetes', patterns: [/\bkubernetes\b/i, /\bk8s\b/i] },
  { label: 'AWS', patterns: [/\baws\b/i, /\bamazon web services\b/i] },
  { label: 'PostgreSQL', patterns: [/\bpostgres\b/i, /\bpostgresql\b/i] },
  { label: 'MongoDB', patterns: [/\bmongodb\b/i, /\bmongo\b/i] },
  { label: 'Redis', patterns: [/\bredis\b/i] },
  { label: 'GraphQL', patterns: [/\bgraphql\b/i] },
  { label: 'REST APIs', patterns: [/\brest\b/i, /\bapi\b/i] },
  { label: 'System Design', patterns: [/\bsystem design\b/i, /\bdistributed systems\b/i] },
  { label: 'Testing', patterns: [/\btesting\b/i, /\bjest\b/i, /\bcypress\b/i, /\bplaywright\b/i] },
  { label: 'CI/CD', patterns: [/\bci\/cd\b/i, /\bgithub actions\b/i, /\bjenkins\b/i] },
  { label: 'LLMs', patterns: [/\bllm\b/i, /\bgpt\b/i, /\bopenai\b/i] },
  { label: 'RAG', patterns: [/\brag\b/i, /\bretrieval augmented generation\b/i] },
];

const EVIDENCE_PATTERNS: Array<{ label: string; patterns: RegExp[] }> = [
  { label: 'API design and backend ownership', patterns: [/\bapi\b/i, /\bbackend\b/i, /\bservice\b/i] },
  { label: 'System design trade-offs', patterns: [/\barchitecture\b/i, /\btrade[- ]offs?\b/i, /\bscal(e|ing)\b/i] },
  { label: 'Production reliability', patterns: [/\breliab/i, /\bmonitor/i, /\bobservab/i, /\bincident\b/i] },
  { label: 'Testing discipline', patterns: [/\btest/i, /\bjest\b/i, /\bcypress\b/i, /\bplaywright\b/i] },
  { label: 'Delivery automation', patterns: [/\bdeploy/i, /\bgithub actions\b/i, /\bci\/cd\b/i, /\bpipeline\b/i] },
  { label: 'Container and platform work', patterns: [/\bdocker\b/i, /\bkubernetes\b/i, /\bterraform\b/i] },
  { label: 'AI product implementation', patterns: [/\bopenai\b/i, /\bllm\b/i, /\brag\b/i, /\bprompt\b/i] },
  { label: 'Leadership or collaboration proof', patterns: [/\bmentor/i, /\blead/i, /\bcross-functional\b/i, /\bstakeholder\b/i] },
];

const REPO_ARTIFACT_SKILL_HINTS: Array<{ label: string; patterns: RegExp[] }> = [
  { label: 'Node.js', patterns: [/package\.json$/i] },
  { label: 'Python', patterns: [/requirements\.txt$/i, /pyproject\.toml$/i] },
  { label: 'Docker', patterns: [/dockerfile$/i, /docker-compose/i] },
  { label: 'CI/CD', patterns: [/\.github\/workflows\//i, /jenkinsfile$/i] },
  { label: 'Kubernetes', patterns: [/\bk8s\b/i, /\bkubernetes\b/i, /\bhelm\b/i] },
];

const REPO_ARTIFACT_EVIDENCE_HINTS: Array<{ label: string; patterns: RegExp[] }> = [
  { label: 'Delivery automation', patterns: [/\.github\/workflows\//i, /jenkinsfile$/i] },
  { label: 'Container and platform work', patterns: [/dockerfile$/i, /docker-compose/i, /\bhelm\b/i] },
  { label: 'Testing discipline', patterns: [/playwright/i, /cypress/i, /jest/i] },
];

const EXTRA_GITHUB_ARTIFACTS: Array<{ path: string; maxChars: number }> = [
  { path: 'package.json', maxChars: 2500 },
  { path: 'Dockerfile', maxChars: 2000 },
  { path: 'docker-compose.yml', maxChars: 2500 },
  { path: '.github/workflows/ci.yml', maxChars: 2000 },
  { path: '.github/workflows/test.yml', maxChars: 2000 },
  { path: '.github/workflows/deploy.yml', maxChars: 2000 },
  { path: 'requirements.txt', maxChars: 2000 },
  { path: 'pyproject.toml', maxChars: 2500 },
];

interface GitHubArtifact {
  path: string;
  text: string;
}

function trimToNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(values.map((value) => value?.trim()).filter((value): value is string => !!value)),
  );
}

function normalizeRepoUrl(repoUrl: string): string {
  const trimmed = repoUrl.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed.replace(/^\/+/, '')}`;
}

function detectSkills(text: string): string[] {
  return SKILL_PATTERNS
    .filter((entry) => entry.patterns.some((pattern) => pattern.test(text)))
    .map((entry) => entry.label);
}

function detectEvidenceSignals(text: string): string[] {
  return EVIDENCE_PATTERNS
    .filter((entry) => entry.patterns.some((pattern) => pattern.test(text)))
    .map((entry) => entry.label);
}

function detectArtifactSkills(paths: string[]): string[] {
  return REPO_ARTIFACT_SKILL_HINTS
    .filter((entry) => entry.patterns.some((pattern) => paths.some((path) => pattern.test(path))))
    .map((entry) => entry.label);
}

function detectArtifactEvidenceSignals(paths: string[]): string[] {
  return REPO_ARTIFACT_EVIDENCE_HINTS
    .filter((entry) => entry.patterns.some((pattern) => paths.some((path) => pattern.test(path))))
    .map((entry) => entry.label);
}

function parseRepoName(repoUrl: string): string | null {
  try {
    const url = new URL(normalizeRepoUrl(repoUrl));
    const segments = url.pathname.split('/').filter(Boolean);
    if (segments.length >= 2) {
      return segments.slice(0, 2).join('/');
    }
    return segments[0] ?? url.hostname;
  } catch {
    return trimToNull(repoUrl);
  }
}

function classifySource(
  hasGitHubContent: boolean,
  repoContext: string | null,
): RepoSummarySource {
  if (hasGitHubContent && repoContext) return 'mixed';
  if (hasGitHubContent) return 'github_readme';
  if (repoContext) return 'notes_only';
  return 'url_only';
}

function fallbackRepoSummary(params: {
  repoUrl: string;
  repoContext: string | null;
  readmeText: string | null;
  artifactFiles: string[];
  artifactTexts: string[];
  targetRole: string | null;
  parsedJd?: AnalyzeRepoEvidenceInput['parsedJd'];
}): RepoSummary {
  const {
    repoUrl,
    repoContext,
    readmeText,
    artifactFiles,
    artifactTexts,
    targetRole,
    parsedJd,
  } = params;
  const repoName = parseRepoName(repoUrl);
  const textCorpus = [repoName, repoContext, readmeText, ...artifactTexts]
    .filter(Boolean)
    .join('\n\n');
  const demonstratedSkills = uniqueStrings([
    ...detectSkills(textCorpus),
    ...detectArtifactSkills(artifactFiles),
  ]).slice(0, 8);
  const evidenceSignals = uniqueStrings([
    ...detectEvidenceSignals(textCorpus),
    ...detectArtifactEvidenceSignals(artifactFiles),
  ]).slice(0, 6);
  const mustHaveSkills = uniqueStrings(parsedJd?.mustHaveSkills ?? []);
  const skillSet = new Set(demonstratedSkills.map((skill) => skill.toLowerCase()));
  const missingSignals = mustHaveSkills
    .filter((skill) => !skillSet.has(skill.toLowerCase()))
    .slice(0, 4)
    .map((skill) => `Show stronger repository evidence for ${skill}.`);

  const strengthAreas = uniqueStrings([
    ...evidenceSignals,
    ...demonstratedSkills.map((skill) => `Repo demonstrates ${skill}`),
  ]).slice(0, 6);

  const recommendedArtifacts = uniqueStrings([
    evidenceSignals.includes('System design trade-offs')
      ? 'Add an architecture note explaining trade-offs and scaling decisions.'
      : 'Add a short architecture note that explains why the system is structured this way.',
    evidenceSignals.includes('Testing discipline')
      ? 'Document the test strategy and the highest-risk scenarios the repo protects.'
      : 'Add tests or a test-plan note that makes reliability proof more visible.',
    evidenceSignals.includes('Delivery automation')
      ? 'Highlight deployment automation or release safeguards in the README.'
      : 'Add CI/CD proof such as pipeline screenshots or release notes.',
  ]).slice(0, 4);

  const confidenceBase =
    artifactFiles.length >= 3
      ? 84
      : artifactFiles.length >= 1
        ? 76
        : textCorpus.length >= 1200
          ? 78
          : textCorpus.length >= 400
            ? 68
            : 52;

  return {
    repoUrl,
    repoName,
    inputContext: repoContext,
    summary:
      demonstratedSkills.length > 0
        ? `This repo gives ${targetRole ?? 'your target role'} some evidence in ${demonstratedSkills.slice(0, 3).join(', ')}, but the proof will be stronger if the outcomes and decisions are explained more clearly.`
        : 'This repo can still be useful as proof, but it needs clearer context about what was built, why it mattered, and what trade-offs were made.',
    inspectedFiles: artifactFiles,
    demonstratedSkills,
    strengthAreas,
    evidenceSignals,
    missingSignals,
    recommendedArtifacts,
    confidence: clamp(confidenceBase, 35, 88),
    source: classifySource(Boolean(readmeText) || artifactFiles.length > 0, repoContext),
  };
}

function buildGitHubRawCandidates(repoUrl: string, relativePath: string): string[] {
  try {
    const url = new URL(normalizeRepoUrl(repoUrl));
    if (!/github\.com$/i.test(url.hostname)) return [];
    const segments = url.pathname.split('/').filter(Boolean);
    if (segments.length < 2) return [];
    const [owner, repo] = segments;
    const base = `https://raw.githubusercontent.com/${owner}/${repo}`;
    return [
      `${base}/main/${relativePath}`,
      `${base}/master/${relativePath}`,
    ];
  } catch {
    return [];
  }
}

async function tryFetchGitHubFile(
  repoUrl: string,
  relativePath: string,
  maxChars: number,
): Promise<string | null> {
  const candidates = buildGitHubRawCandidates(repoUrl, relativePath);
  for (const candidate of candidates) {
    try {
      const response = await axios.get<string>(candidate, {
        timeout: 5000,
        responseType: 'text',
        maxContentLength: 250_000,
      });
      const text = typeof response.data === 'string' ? response.data.trim() : '';
      if (text) {
        return text.slice(0, maxChars);
      }
    } catch {
      continue;
    }
  }
  return null;
}

async function tryFetchGitHubArtifacts(repoUrl: string): Promise<{
  readmeText: string | null;
  artifacts: GitHubArtifact[];
}> {
  const readmeText =
    (await tryFetchGitHubFile(repoUrl, 'README.md', 6000)) ??
    (await tryFetchGitHubFile(repoUrl, 'readme.md', 6000));

  const artifacts: GitHubArtifact[] = [];
  for (const artifact of EXTRA_GITHUB_ARTIFACTS) {
    const text = await tryFetchGitHubFile(repoUrl, artifact.path, artifact.maxChars);
    if (!text) continue;
    artifacts.push({
      path: artifact.path,
      text,
    });
  }

  return { readmeText, artifacts };
}

export async function analyzeRepoEvidence(
  input: AnalyzeRepoEvidenceInput,
): Promise<RepoSummary> {
  const repoUrl = normalizeRepoUrl(input.repoUrl);
  const repoContext = trimToNull(input.repoContext) ?? null;
  const { readmeText, artifacts } = await tryFetchGitHubArtifacts(repoUrl);
  const artifactFiles = artifacts.map((artifact) => artifact.path);
  const artifactTexts = artifacts.map((artifact) => artifact.text);
  const fallback = fallbackRepoSummary({
    repoUrl,
    repoContext,
    readmeText,
    artifactFiles,
    artifactTexts,
    targetRole: trimToNull(input.targetRole) ?? null,
    parsedJd: input.parsedJd,
  });

  try {
    const raw = await callClaude({
      system: `You analyze engineering repositories as career evidence.
Return JSON only. No markdown or prose outside JSON.`,
      userMessage: `Target role: ${trimToNull(input.targetRole) ?? 'Unknown'}
Target company: ${trimToNull(input.targetCompany) ?? 'Unknown'}
Repo URL: ${repoUrl}
Repo name: ${fallback.repoName ?? 'Unknown'}

Developer notes about the repo:
"""
${repoContext ?? 'No extra notes provided.'}
"""

README excerpt:
"""
${readmeText ?? 'README could not be fetched.'}
"""

Additional repo artifacts:
${artifacts.length > 0
  ? artifacts
      .map(
        (artifact) =>
          `FILE: ${artifact.path}\n"""\n${artifact.text}\n"""`,
      )
      .join('\n\n')
  : 'No additional repo files could be fetched.'}

Parsed job-description signals:
${JSON.stringify(input.parsedJd ?? {}, null, 2)}

Return JSON:
{
  "repoUrl": "${repoUrl}",
  "repoName": "${fallback.repoName ?? 'owner/repo'}",
  "inputContext": "Short developer-supplied context",
  "summary": "This repo gives strong backend ownership evidence but still needs clearer scale outcomes.",
  "inspectedFiles": ["README.md", "package.json", "Dockerfile"],
  "demonstratedSkills": ["Node.js", "TypeScript", "Docker"],
  "strengthAreas": ["API design and backend ownership", "Delivery automation"],
  "evidenceSignals": ["Production reliability", "System design trade-offs"],
  "missingSignals": ["Show stronger repository evidence for System Design."],
  "recommendedArtifacts": ["Add an architecture note explaining trade-offs and scaling decisions."],
  "confidence": 74,
  "source": "mixed"
}`,
      useCache: true,
    });

    const parsed = parseJSON<RepoSummary>(raw);
    return {
      repoUrl,
      repoName: trimToNull(parsed.repoName) ?? fallback.repoName,
      inputContext: trimToNull(parsed.inputContext) ?? repoContext,
      summary: trimToNull(parsed.summary) ?? fallback.summary,
      inspectedFiles:
        uniqueStrings(parsed.inspectedFiles ?? []).slice(0, 8).length > 0
          ? uniqueStrings(parsed.inspectedFiles ?? []).slice(0, 8)
          : fallback.inspectedFiles,
      demonstratedSkills: uniqueStrings(parsed.demonstratedSkills ?? []).slice(0, 8),
      strengthAreas: uniqueStrings(parsed.strengthAreas ?? []).slice(0, 6),
      evidenceSignals: uniqueStrings(parsed.evidenceSignals ?? []).slice(0, 6),
      missingSignals: uniqueStrings(parsed.missingSignals ?? []).slice(0, 6),
      recommendedArtifacts: uniqueStrings(parsed.recommendedArtifacts ?? []).slice(0, 5),
      confidence: clamp(Math.round(parsed.confidence ?? fallback.confidence), 20, 95),
      source:
        parsed.source === 'github_readme' ||
        parsed.source === 'notes_only' ||
        parsed.source === 'mixed' ||
        parsed.source === 'url_only'
          ? parsed.source
          : fallback.source,
    };
  } catch {
    return fallback;
  }
}
