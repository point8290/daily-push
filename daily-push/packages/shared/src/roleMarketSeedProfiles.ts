import type {
  AiImpact,
  ContractMeta,
  ProficiencyLevel,
  RequirementCategory,
  RequirementPriority,
  RoleCategory,
  RoleMarketProfile,
  RoleRequirement,
  RoleTransitionPath,
  RoleTrendSignal,
  RoleType,
  SeniorityBand,
  SourceReference,
} from "./roleMarketContracts";

export const ROLE_MARKET_SEED_VERSION = "role-market-seed.v1";

export const ROLE_MARKET_LAST_UPDATED = "2026-05-18T00:00:00.000Z";

export const roleMarketSeedMeta: ContractMeta = {
  contractVersion: "role-market.v1",
  generatedAt: ROLE_MARKET_LAST_UPDATED,
  sourceMode: "curated",
  seedVersion: ROLE_MARKET_SEED_VERSION,
  warnings: [],
};

const sourceLibrary: Record<string, SourceReference> = {
  src_wef_future_jobs_2025: {
    id: "src_wef_future_jobs_2025",
    title: "The Future of Jobs Report 2025",
    url: "https://www.weforum.org/publications/the-future-of-jobs-report-2025/digest/",
    publisher: "World Economic Forum",
    sourceType: "industry_report",
    region: "global",
    publishedAt: "2025-01-08T00:00:00.000Z",
    capturedAt: ROLE_MARKET_LAST_UPDATED,
    confidence: 0.86,
  },
  src_bls_computer_it_ooh_2025: {
    id: "src_bls_computer_it_ooh_2025",
    title: "Computer and Information Technology Occupations",
    url: "https://www.bls.gov/ooh/computer-and-information-technology/home.htm",
    publisher: "U.S. Bureau of Labor Statistics",
    sourceType: "industry_report",
    region: "United States",
    publishedAt: "2025-09-01T00:00:00.000Z",
    capturedAt: ROLE_MARKET_LAST_UPDATED,
    confidence: 0.86,
  },
  src_comptia_it_outlook_2026: {
    id: "src_comptia_it_outlook_2026",
    title: "IT Industry Outlook 2026",
    url: "https://www.comptia.org/en-us/about-us/news/press-releases/CompTIA-IT-Industry-Outlook-2026-Embracing-innovation-and-seeking-growth/",
    publisher: "CompTIA",
    sourceType: "industry_report",
    region: "global",
    publishedAt: "2026-01-01T00:00:00.000Z",
    capturedAt: ROLE_MARKET_LAST_UPDATED,
    confidence: 0.82,
  },
  src_cncf_cloud_native_2025: {
    id: "src_cncf_cloud_native_2025",
    title: "CNCF Annual Cloud Native Survey: The infrastructure of AI's future",
    url: "https://www.linuxfoundation.org/research/cncf-2025-annual-survey",
    publisher: "Linux Foundation Research and CNCF",
    sourceType: "industry_report",
    region: "global",
    publishedAt: "2025-09-01T00:00:00.000Z",
    capturedAt: ROLE_MARKET_LAST_UPDATED,
    confidence: 0.82,
  },
  src_cncf_cloud_native_2024: {
    id: "src_cncf_cloud_native_2024",
    title: "CNCF Research Reveals How Cloud Native Technology is Reshaping Global Business and Innovation",
    url: "https://www.cncf.io/announcements/2025/04/01/cncf-research-reveals-how-cloud-native-technology-is-reshaping-global-business-and-innovation/",
    publisher: "Cloud Native Computing Foundation",
    sourceType: "industry_report",
    region: "global",
    publishedAt: "2025-04-01T00:00:00.000Z",
    capturedAt: ROLE_MARKET_LAST_UPDATED,
    confidence: 0.8,
  },
  src_isc2_workforce_2025: {
    id: "src_isc2_workforce_2025",
    title: "2025 ISC2 Cybersecurity Workforce Study",
    url: "https://www.isc2.org/insights/2025/12/isc2-publishes-2025-cybersecurity-workforce-study",
    publisher: "ISC2",
    sourceType: "industry_report",
    region: "global",
    publishedAt: "2025-12-04T00:00:00.000Z",
    capturedAt: ROLE_MARKET_LAST_UPDATED,
    confidence: 0.84,
  },
  src_owasp_top10_2025: {
    id: "src_owasp_top10_2025",
    title: "OWASP Top 10:2025",
    url: "https://owasp.org/Top10/2025/",
    publisher: "OWASP Foundation",
    sourceType: "industry_report",
    region: "global",
    publishedAt: "2025-01-01T00:00:00.000Z",
    capturedAt: ROLE_MARKET_LAST_UPDATED,
    confidence: 0.82,
  },
  src_owasp_llm_top10: {
    id: "src_owasp_llm_top10",
    title: "OWASP Top 10 for Large Language Model Applications",
    url: "https://owasp.org/www-project-top-10-for-large-language-model-applications/",
    publisher: "OWASP Foundation",
    sourceType: "industry_report",
    region: "global",
    publishedAt: "2025-01-01T00:00:00.000Z",
    capturedAt: ROLE_MARKET_LAST_UPDATED,
    confidence: 0.8,
  },
  src_dora_2025_ai_software: {
    id: "src_dora_2025_ai_software",
    title: "How are developers using AI? Inside our 2025 DORA report",
    url: "https://blog.google/innovation-and-ai/technology/developers-tools/dora-report-2025/",
    publisher: "Google",
    sourceType: "industry_report",
    region: "global",
    publishedAt: "2025-09-23T00:00:00.000Z",
    capturedAt: ROLE_MARKET_LAST_UPDATED,
    confidence: 0.82,
  },
  src_dora_2024_devops: {
    id: "src_dora_2024_devops",
    title: "DORA Research: 2024 Accelerate State of DevOps Report",
    url: "https://dora.dev/research/2024/dora-report/",
    publisher: "Google Cloud DORA",
    sourceType: "industry_report",
    region: "global",
    publishedAt: "2024-10-01T00:00:00.000Z",
    capturedAt: ROLE_MARKET_LAST_UPDATED,
    confidence: 0.8,
  },
  src_github_octoverse_2025: {
    id: "src_github_octoverse_2025",
    title: "Octoverse 2025: The state of open source",
    url: "https://octoverse.github.com/",
    publisher: "GitHub",
    sourceType: "industry_report",
    region: "global",
    publishedAt: "2025-11-01T00:00:00.000Z",
    capturedAt: ROLE_MARKET_LAST_UPDATED,
    confidence: 0.76,
  },
};

function requirement(input: {
  id: string;
  category: RequirementCategory;
  label: string;
  description: string;
  priority?: RequirementPriority;
  expectedLevel?: ProficiencyLevel;
  keywords: string[];
  proofExpected: string[];
  interviewSignals: string[];
  sourceRefs: string[];
  confidence?: number;
}): RoleRequirement {
  return {
    priority: "must_have",
    expectedLevel: "proficient",
    confidence: 0.74,
    ...input,
  };
}

function trend(input: {
  id: string;
  label: string;
  summary: string;
  direction?: RoleTrendSignal["direction"];
  impact: AiImpact;
  affectedSkills: string[];
  sourceRefs: string[];
  confidence?: number;
}): RoleTrendSignal {
  return {
    direction: "increasing",
    confidence: 0.72,
    ...input,
  };
}

function fullStackTransition(
  fitLevel: RoleTransitionPath["fitLevel"],
  likelyGaps: string[],
  recommendedProof: string[],
): RoleTransitionPath {
  return {
    fromRole: "Full-stack Engineer",
    fitLevel,
    transferableSkills: ["Product delivery", "APIs", "frontend/backend integration"],
    likelyGaps,
    recommendedProof,
  };
}

function backendTransition(
  fitLevel: RoleTransitionPath["fitLevel"],
  likelyGaps: string[],
  recommendedProof: string[],
): RoleTransitionPath {
  return {
    fromRole: "Backend Engineer",
    fitLevel,
    transferableSkills: ["API design", "databases", "debugging", "service ownership"],
    likelyGaps,
    recommendedProof,
  };
}

function makeProfile(input: {
  id: string;
  slug: string;
  title: string;
  category: RoleCategory;
  roleType: RoleType;
  aiImpact: AiImpact;
  shortDescription: string;
  marketSummary: string;
  seniorityBands?: SeniorityBand[];
  requirements: RoleRequirement[];
  trendSignals: RoleTrendSignal[];
  transitionPaths: RoleTransitionPath[];
  interviewTopics: string[];
  proofExpectations: string[];
  relatedRoleIds?: string[];
  sourceIds: string[];
  confidence?: number;
}): RoleMarketProfile {
  return {
    seniorityBands: ["mid", "senior", "staff"],
    relatedRoleIds: [],
    confidence: 0.74,
    lastUpdated: ROLE_MARKET_LAST_UPDATED,
    meta: roleMarketSeedMeta,
    ...input,
    sourceRefs: input.sourceIds.map((sourceId) => sourceLibrary[sourceId]),
  };
}

export const roleMarketSeedProfiles: RoleMarketProfile[] = [
  makeProfile({
    id: "role_ai_backend_engineer",
    slug: "ai-backend-engineer",
    title: "AI Backend Engineer",
    category: "ai",
    roleType: "emerging",
    aiImpact: "created_by_ai",
    shortDescription:
      "Builds production backend systems that integrate LLMs, retrieval, evaluation, safety, and observability.",
    marketSummary:
      "Signals suggest backend engineers who can ship reliable AI product systems are becoming more valuable than generic prompt-only builders.",
    requirements: [
      requirement({
        id: "req_ai_backend_service_ownership",
        category: "production",
        label: "Production API and service ownership",
        description:
          "Can design, secure, deploy, debug, and monitor APIs used by real users or internal teams.",
        keywords: ["api design", "node.js", "typescript", "auth", "observability"],
        proofExpected: ["A deployed API with auth, failure handling, logs, and monitoring notes."],
        interviewSignals: ["Explains trade-offs, incidents, bottlenecks, and debugging approach."],
        sourceRefs: ["src_bls_computer_it_ooh_2025", "src_dora_2025_ai_software"],
      }),
      requirement({
        id: "req_ai_backend_llm_reliability",
        category: "ai_leverage",
        label: "LLM integration reliability",
        description:
          "Can use structured outputs, retrieval, evaluation, fallback behavior, and cost controls in AI features.",
        keywords: ["llm", "structured output", "rag", "evaluation", "fallback"],
        proofExpected: ["An AI feature with validation, eval cases, and failure-mode documentation."],
        interviewSignals: ["Discusses hallucination controls, eval design, cost, and product safety."],
        sourceRefs: ["src_wef_future_jobs_2025", "src_owasp_llm_top10", "src_dora_2025_ai_software"],
      }),
    ],
    trendSignals: [
      trend({
        id: "trend_ai_backend_outcomes",
        label: "AI work is shifting from demos to production outcomes",
        summary:
          "Signals suggest employers increasingly value engineers who can turn AI capabilities into reliable product workflows.",
        impact: "amplified",
        affectedSkills: ["backend", "LLM integration", "evaluation", "observability"],
        sourceRefs: ["src_comptia_it_outlook_2026", "src_dora_2025_ai_software"],
      }),
    ],
    transitionPaths: [
      backendTransition("moderate", ["LLM evaluation", "RAG patterns", "AI security"], [
        "Build an AI workflow with typed output validation and an eval report.",
      ]),
      fullStackTransition("moderate", ["backend depth", "AI reliability", "system design story"], [
        "Convert a product feature into a backend-heavy AI system case study.",
      ]),
    ],
    interviewTopics: ["API design", "LLM structured outputs", "RAG trade-offs", "system design", "AI safety"],
    proofExpectations: ["Deployed AI feature", "Eval or test strategy", "Architecture write-up"],
    relatedRoleIds: ["role_ai_platform_engineer", "role_backend_engineer", "role_llmops_engineer"],
    sourceIds: [
      "src_wef_future_jobs_2025",
      "src_comptia_it_outlook_2026",
      "src_dora_2025_ai_software",
      "src_owasp_llm_top10",
    ],
    confidence: 0.78,
  }),
  makeProfile({
    id: "role_ai_platform_engineer",
    slug: "ai-platform-engineer",
    title: "AI Platform Engineer",
    category: "platform",
    roleType: "emerging",
    aiImpact: "created_by_ai",
    shortDescription:
      "Builds the internal platforms, tooling, model gateways, deployment paths, and guardrails that let teams ship AI features safely.",
    marketSummary:
      "Signals suggest AI adoption creates platform needs around developer enablement, governance, reliability, and infrastructure.",
    requirements: [
      requirement({
        id: "req_ai_platform_internal_platforms",
        category: "production",
        label: "Internal AI platform design",
        description:
          "Can design shared AI services, model access patterns, observability, and developer experience for product teams.",
        keywords: ["platform engineering", "model gateway", "observability", "developer experience"],
        proofExpected: ["A reusable internal tool or platform design that reduces AI integration friction."],
        interviewSignals: ["Explains platform adoption, paved roads, reliability, and governance trade-offs."],
        sourceRefs: ["src_dora_2024_devops", "src_dora_2025_ai_software"],
      }),
      requirement({
        id: "req_ai_platform_cloud_native",
        category: "tool",
        label: "Cloud-native AI infrastructure",
        description:
          "Understands containers, orchestration, CI/CD, secrets, and scalable deployment for AI-backed services.",
        keywords: ["kubernetes", "containers", "ci/cd", "secrets", "cloud native"],
        proofExpected: ["A platform-style deployment path with CI/CD, runtime config, and rollback notes."],
        interviewSignals: ["Discusses secure deployments, scalability, and operational ownership."],
        sourceRefs: ["src_cncf_cloud_native_2025", "src_cncf_cloud_native_2024"],
      }),
    ],
    trendSignals: [
      trend({
        id: "trend_ai_platform_gap",
        label: "AI ambition is exposing infrastructure gaps",
        summary:
          "Cloud-native research signals a gap between AI ambition and infrastructure readiness, increasing the value of platform skills.",
        impact: "created_by_ai",
        affectedSkills: ["Kubernetes", "platform engineering", "observability", "AI governance"],
        sourceRefs: ["src_cncf_cloud_native_2025", "src_dora_2025_ai_software"],
      }),
    ],
    transitionPaths: [
      backendTransition("moderate", ["platform thinking", "Kubernetes depth", "developer tooling"], [
        "Build a small model-gateway service with auth, rate limits, logs, and sample client docs.",
      ]),
      fullStackTransition("hard", ["infrastructure depth", "CI/CD", "platform product mindset"], [
        "Create an internal developer portal mock plus a working AI service deployment path.",
      ]),
    ],
    interviewTopics: ["platform strategy", "cloud-native architecture", "AI governance", "developer experience"],
    proofExpectations: ["Model gateway", "internal tool", "deployment reference architecture"],
    relatedRoleIds: ["role_platform_engineer", "role_llmops_engineer", "role_devops_engineer"],
    sourceIds: ["src_cncf_cloud_native_2025", "src_dora_2024_devops", "src_dora_2025_ai_software"],
    confidence: 0.76,
  }),
  makeProfile({
    id: "role_applied_ai_engineer",
    slug: "applied-ai-engineer",
    title: "Applied AI Engineer",
    category: "ai",
    roleType: "emerging",
    aiImpact: "created_by_ai",
    shortDescription:
      "Turns AI capabilities into product features by combining software engineering, data workflows, prompt design, evaluation, and UX judgment.",
    marketSummary:
      "Signals suggest companies need engineers who can apply AI to business workflows without becoming pure ML researchers.",
    requirements: [
      requirement({
        id: "req_applied_ai_product_workflows",
        category: "business_context",
        label: "AI product workflow design",
        description:
          "Can map a business problem into an AI-assisted workflow with clear inputs, outputs, and user controls.",
        keywords: ["workflow", "product thinking", "prompting", "evaluation", "ux"],
        proofExpected: ["A product demo showing how AI improves a real workflow and where humans stay in control."],
        interviewSignals: ["Explains user value, constraints, risks, and measurement."],
        sourceRefs: ["src_comptia_it_outlook_2026", "src_dora_2025_ai_software"],
      }),
      requirement({
        id: "req_applied_ai_evaluation",
        category: "ai_leverage",
        label: "Evaluation and quality loops",
        description:
          "Can define examples, rubrics, and feedback loops to judge whether an AI feature is improving.",
        keywords: ["evals", "rubric", "quality", "feedback loop", "structured output"],
        proofExpected: ["An evaluation set with pass/fail criteria and improvement notes."],
        interviewSignals: ["Discusses quality measurement beyond subjective prompt tweaking."],
        sourceRefs: ["src_dora_2025_ai_software", "src_owasp_llm_top10"],
      }),
    ],
    trendSignals: [
      trend({
        id: "trend_applied_ai_workforce",
        label: "AI skills are becoming role-adjacent, not only research roles",
        summary:
          "Signals suggest AI adoption is spreading into everyday software, product, data, and security work.",
        impact: "amplified",
        affectedSkills: ["AI literacy", "product thinking", "data workflows", "evaluation"],
        sourceRefs: ["src_wef_future_jobs_2025", "src_comptia_it_outlook_2026"],
      }),
    ],
    transitionPaths: [
      fullStackTransition("moderate", ["AI evaluation", "data handling", "prompt/product judgment"], [
        "Build a job-search assistant, support triage tool, or analytics assistant with measurable output quality.",
      ]),
      backendTransition("moderate", ["front-end workflow design", "user feedback loops", "AI UX"], [
        "Ship an API-backed AI assistant with a simple review UI and eval harness.",
      ]),
    ],
    interviewTopics: ["AI feature design", "evaluation", "prompt boundaries", "data handling", "user trust"],
    proofExpectations: ["AI product demo", "eval set", "case study with before/after workflow"],
    relatedRoleIds: ["role_ai_backend_engineer", "role_product_engineer", "role_analytics_engineer"],
    sourceIds: ["src_wef_future_jobs_2025", "src_comptia_it_outlook_2026", "src_dora_2025_ai_software"],
    confidence: 0.77,
  }),
  makeProfile({
    id: "role_llmops_engineer",
    slug: "llmops-engineer",
    title: "LLMOps Engineer",
    category: "ai",
    roleType: "emerging",
    aiImpact: "created_by_ai",
    shortDescription:
      "Owns deployment, observability, evaluation, cost, safety, and reliability loops for LLM-backed applications.",
    marketSummary:
      "Signals suggest LLM-backed systems need operational practices similar to DevOps and MLOps, plus AI-specific evaluation and safety.",
    requirements: [
      requirement({
        id: "req_llmops_observability",
        category: "production",
        label: "LLM observability and cost control",
        description:
          "Can track latency, token usage, failure modes, quality signals, and cost for AI features.",
        keywords: ["observability", "latency", "token usage", "cost", "monitoring"],
        proofExpected: ["A dashboard or report tracking AI feature quality, failures, latency, and cost."],
        interviewSignals: ["Explains what to measure and how to respond when model behavior regresses."],
        sourceRefs: ["src_dora_2025_ai_software", "src_owasp_llm_top10"],
      }),
      requirement({
        id: "req_llmops_security",
        category: "ai_leverage",
        label: "LLM security and guardrails",
        description:
          "Understands prompt injection, insecure output handling, sensitive data leakage, overreliance, and excessive agency risks.",
        keywords: ["prompt injection", "guardrails", "security", "policy", "sensitive data"],
        proofExpected: ["Threat model and mitigation notes for an LLM-backed workflow."],
        interviewSignals: ["Names concrete AI risks and practical controls."],
        sourceRefs: ["src_owasp_llm_top10", "src_isc2_workforce_2025"],
      }),
    ],
    trendSignals: [
      trend({
        id: "trend_llmops_governance",
        label: "AI adoption increases need for operational guardrails",
        summary:
          "Signals suggest teams adopting AI need stronger evaluation, security, governance, and reliability practices.",
        impact: "created_by_ai",
        affectedSkills: ["LLM evaluation", "AI security", "observability", "governance"],
        sourceRefs: ["src_owasp_llm_top10", "src_dora_2025_ai_software", "src_isc2_workforce_2025"],
      }),
    ],
    transitionPaths: [
      backendTransition("moderate", ["LLM observability", "AI risk controls", "model behavior monitoring"], [
        "Instrument an LLM feature with eval cases, logs, cost tracking, and abuse-case tests.",
      ]),
      {
        fromRole: "DevOps Engineer",
        fitLevel: "moderate",
        transferableSkills: ["monitoring", "deployment", "incident response", "automation"],
        likelyGaps: ["prompt injection", "LLM evaluation", "model quality signals"],
        recommendedProof: ["Create an LLM reliability runbook and monitoring dashboard."],
      },
    ],
    interviewTopics: ["LLM observability", "AI risk", "evals", "fallbacks", "cost controls"],
    proofExpectations: ["Monitoring dashboard", "eval harness", "AI threat model"],
    relatedRoleIds: ["role_ai_backend_engineer", "role_ai_platform_engineer", "role_mlops_engineer"],
    sourceIds: ["src_owasp_llm_top10", "src_dora_2025_ai_software", "src_isc2_workforce_2025"],
    confidence: 0.73,
  }),
  makeProfile({
    id: "role_mlops_engineer",
    slug: "mlops-engineer",
    title: "MLOps Engineer",
    category: "ai",
    roleType: "evolving",
    aiImpact: "amplified",
    shortDescription:
      "Builds the pipelines, deployment workflows, monitoring, governance, and infrastructure for ML models in production.",
    marketSummary:
      "Signals suggest AI investment keeps increasing the need for production model lifecycle skills, especially where data practices are immature.",
    requirements: [
      requirement({
        id: "req_mlops_model_lifecycle",
        category: "production",
        label: "Model lifecycle automation",
        description:
          "Can automate training, validation, deployment, rollback, and monitoring for model-backed systems.",
        keywords: ["ml pipeline", "model registry", "deployment", "monitoring", "rollback"],
        proofExpected: ["A model deployment pipeline with validation gates and monitoring notes."],
        interviewSignals: ["Explains drift, rollout strategy, model quality, and operational risk."],
        sourceRefs: ["src_comptia_it_outlook_2026", "src_dora_2024_devops"],
      }),
      requirement({
        id: "req_mlops_data_foundations",
        category: "domain",
        label: "Data and feature reliability",
        description:
          "Understands data quality, feature pipelines, reproducibility, and failure modes in ML systems.",
        keywords: ["data quality", "features", "lineage", "reproducibility", "drift"],
        proofExpected: ["A pipeline or case study showing data validation and model behavior checks."],
        interviewSignals: ["Discusses how bad data becomes bad model behavior."],
        sourceRefs: ["src_comptia_it_outlook_2026", "src_wef_future_jobs_2025"],
      }),
    ],
    trendSignals: [
      trend({
        id: "trend_mlops_data_practices",
        label: "Data maturity is becoming a blocker for AI outcomes",
        summary:
          "Signals suggest many firms must improve data architecture, analytics practices, and security before AI can create business value.",
        impact: "amplified",
        affectedSkills: ["data engineering", "model operations", "monitoring", "governance"],
        sourceRefs: ["src_comptia_it_outlook_2026", "src_wef_future_jobs_2025"],
      }),
    ],
    transitionPaths: [
      {
        fromRole: "Data Engineer",
        fitLevel: "moderate",
        transferableSkills: ["pipelines", "data quality", "cloud", "SQL"],
        likelyGaps: ["model deployment", "drift monitoring", "ML lifecycle"],
        recommendedProof: ["Deploy a small model with data validation and monitoring documentation."],
      },
      backendTransition("hard", ["ML lifecycle", "data science basics", "model monitoring"], [
        "Build a prediction API with a reproducible training pipeline and monitoring notes.",
      ]),
    ],
    interviewTopics: ["ML pipelines", "model deployment", "data quality", "drift", "governance"],
    proofExpectations: ["Model pipeline", "data validation", "monitoring report"],
    relatedRoleIds: ["role_data_engineer", "role_llmops_engineer", "role_ai_platform_engineer"],
    sourceIds: ["src_comptia_it_outlook_2026", "src_wef_future_jobs_2025", "src_dora_2024_devops"],
    confidence: 0.75,
  }),
  makeProfile({
    id: "role_cloud_security_engineer",
    slug: "cloud-security-engineer",
    title: "Cloud Security Engineer",
    category: "security",
    roleType: "evolving",
    aiImpact: "amplified",
    shortDescription:
      "Secures cloud environments, identities, infrastructure, workloads, CI/CD paths, and increasingly AI-enabled operations.",
    marketSummary:
      "Signals suggest cloud security remains a pressing skills need as organizations expand cloud, AI, and automation footprints.",
    requirements: [
      requirement({
        id: "req_cloud_security_identity",
        category: "domain",
        label: "Cloud identity and access security",
        description:
          "Can design least-privilege access, secrets handling, auditability, and incident-ready cloud permissions.",
        keywords: ["iam", "least privilege", "secrets", "audit", "cloud security"],
        proofExpected: ["A hardened cloud reference architecture with IAM and secrets handling notes."],
        interviewSignals: ["Explains blast radius, key rotation, audit trails, and misconfiguration risks."],
        sourceRefs: ["src_isc2_workforce_2025", "src_owasp_top10_2025"],
      }),
      requirement({
        id: "req_cloud_security_ai_ops",
        category: "ai_leverage",
        label: "Securing AI-enabled operations",
        description:
          "Understands security considerations around AI tools, data access, automation, and cloud configuration.",
        keywords: ["ai security", "cloud configuration", "risk management", "automation"],
        proofExpected: ["A threat model for an AI-enabled cloud workflow."],
        interviewSignals: ["Connects AI adoption to practical cloud risk and controls."],
        sourceRefs: ["src_isc2_workforce_2025", "src_comptia_it_outlook_2026"],
      }),
    ],
    trendSignals: [
      trend({
        id: "trend_cloud_security_skills",
        label: "Cybersecurity skills are shifting toward AI and cloud security",
        summary:
          "Cybersecurity workforce research signals strong need for AI and cloud security skills alongside traditional security operations.",
        impact: "amplified",
        affectedSkills: ["cloud security", "AI security", "risk management", "data security"],
        sourceRefs: ["src_isc2_workforce_2025", "src_comptia_it_outlook_2026"],
      }),
    ],
    transitionPaths: [
      {
        fromRole: "DevOps Engineer",
        fitLevel: "moderate",
        transferableSkills: ["cloud", "CI/CD", "infrastructure", "automation"],
        likelyGaps: ["threat modeling", "IAM depth", "security incident response"],
        recommendedProof: ["Harden a cloud deployment and write a security review."],
      },
      backendTransition("hard", ["cloud IAM", "threat modeling", "security operations"], [
        "Secure an API deployment with least privilege, secret rotation, and logging evidence.",
      ]),
    ],
    interviewTopics: ["IAM", "cloud misconfiguration", "threat modeling", "incident response", "AI security"],
    proofExpectations: ["Cloud security review", "threat model", "hardened deployment"],
    relatedRoleIds: ["role_cybersecurity_analyst", "role_devops_engineer", "role_platform_engineer"],
    sourceIds: ["src_isc2_workforce_2025", "src_comptia_it_outlook_2026", "src_owasp_top10_2025"],
    confidence: 0.8,
  }),
  makeProfile({
    id: "role_platform_engineer",
    slug: "platform-engineer",
    title: "Platform Engineer",
    category: "platform",
    roleType: "evolving",
    aiImpact: "amplified",
    shortDescription:
      "Builds internal developer platforms, paved roads, cloud-native tooling, and automation that help teams ship safely and faster.",
    marketSummary:
      "Signals suggest platform engineering remains valuable when it improves developer independence without harming stability.",
    requirements: [
      requirement({
        id: "req_platform_developer_experience",
        category: "production",
        label: "Developer platform product thinking",
        description:
          "Can design internal tools that reduce friction while preserving team autonomy, reliability, and security.",
        keywords: ["developer experience", "internal platform", "self-service", "paved road"],
        proofExpected: ["An internal platform prototype or case study with user workflow and adoption notes."],
        interviewSignals: ["Explains how platform work improves team outcomes, not just tool count."],
        sourceRefs: ["src_dora_2024_devops", "src_cncf_cloud_native_2024"],
      }),
      requirement({
        id: "req_platform_cloud_native_delivery",
        category: "tool",
        label: "Cloud-native delivery automation",
        description:
          "Understands Kubernetes, CI/CD, GitOps, observability, and secure configuration for product teams.",
        keywords: ["kubernetes", "ci/cd", "gitops", "observability", "automation"],
        proofExpected: ["A self-service deployment workflow with observability and rollback notes."],
        interviewSignals: ["Discusses stability, small batches, rollback, and developer independence."],
        sourceRefs: ["src_cncf_cloud_native_2024", "src_dora_2024_devops"],
      }),
    ],
    trendSignals: [
      trend({
        id: "trend_platform_ai_delivery",
        label: "Platform work is becoming an AI adoption enabler",
        summary:
          "Signals suggest teams need strong platforms and delivery fundamentals to make AI-assisted software development reliable.",
        impact: "amplified",
        affectedSkills: ["platform engineering", "CI/CD", "cloud native", "developer experience"],
        sourceRefs: ["src_dora_2024_devops", "src_dora_2025_ai_software", "src_cncf_cloud_native_2025"],
      }),
    ],
    transitionPaths: [
      {
        fromRole: "DevOps Engineer",
        fitLevel: "easy",
        transferableSkills: ["CI/CD", "cloud", "automation", "monitoring"],
        likelyGaps: ["product thinking", "developer experience research", "self-service design"],
        recommendedProof: ["Create a developer platform workflow with docs and adoption metrics."],
      },
      backendTransition("moderate", ["Kubernetes", "CI/CD depth", "internal tooling mindset"], [
        "Build a deployment template and self-service API for a backend service.",
      ]),
    ],
    interviewTopics: ["developer experience", "cloud-native delivery", "GitOps", "observability", "platform adoption"],
    proofExpectations: ["Internal platform prototype", "deployment workflow", "docs and runbook"],
    relatedRoleIds: ["role_devops_engineer", "role_ai_platform_engineer", "role_cloud_security_engineer"],
    sourceIds: ["src_dora_2024_devops", "src_cncf_cloud_native_2024", "src_cncf_cloud_native_2025"],
    confidence: 0.79,
  }),
  makeProfile({
    id: "role_data_engineer",
    slug: "data-engineer",
    title: "Data Engineer",
    category: "data",
    roleType: "evolving",
    aiImpact: "amplified",
    shortDescription:
      "Builds reliable data pipelines, models, quality checks, governance paths, and data platforms that power analytics and AI.",
    marketSummary:
      "Signals suggest data engineering remains foundational as firms invest in data practices before strategic AI outcomes.",
    requirements: [
      requirement({
        id: "req_data_engineer_pipelines",
        category: "production",
        label: "Reliable data pipelines",
        description:
          "Can design batch or streaming pipelines with quality checks, lineage, monitoring, and clear ownership.",
        keywords: ["etl", "elt", "data quality", "lineage", "monitoring"],
        proofExpected: ["A data pipeline with validation, lineage notes, and recovery behavior."],
        interviewSignals: ["Explains data freshness, failure handling, and downstream contract changes."],
        sourceRefs: ["src_comptia_it_outlook_2026", "src_bls_computer_it_ooh_2025"],
      }),
      requirement({
        id: "req_data_engineer_ai_readiness",
        category: "ai_leverage",
        label: "AI-ready data foundations",
        description:
          "Understands how data architecture, governance, and quality affect analytics and AI systems.",
        keywords: ["data architecture", "governance", "features", "warehouse", "lakehouse"],
        proofExpected: ["A data model or feature store style project that shows quality and governance decisions."],
        interviewSignals: ["Connects data reliability to AI and analytics outcomes."],
        sourceRefs: ["src_comptia_it_outlook_2026", "src_wef_future_jobs_2025"],
      }),
    ],
    trendSignals: [
      trend({
        id: "trend_data_foundation_for_ai",
        label: "Data practices are becoming a prerequisite for AI outcomes",
        summary:
          "Industry signals suggest many firms are investing in data architecture, analytics, and security before expecting strategic AI value.",
        impact: "amplified",
        affectedSkills: ["data engineering", "data architecture", "analytics", "AI readiness"],
        sourceRefs: ["src_comptia_it_outlook_2026", "src_wef_future_jobs_2025"],
      }),
    ],
    transitionPaths: [
      backendTransition("moderate", ["data modeling depth", "pipeline tooling", "analytics contracts"], [
        "Build a warehouse-style pipeline from app events with quality checks and dashboard outputs.",
      ]),
      fullStackTransition("hard", ["SQL depth", "data pipelines", "data quality"], [
        "Create an analytics pipeline from product events to a report with documented data quality checks.",
      ]),
    ],
    interviewTopics: ["data modeling", "pipeline reliability", "SQL", "data quality", "governance"],
    proofExpectations: ["Data pipeline", "quality checks", "analytics model", "lineage notes"],
    relatedRoleIds: ["role_analytics_engineer", "role_mlops_engineer"],
    sourceIds: ["src_comptia_it_outlook_2026", "src_wef_future_jobs_2025", "src_bls_computer_it_ooh_2025"],
    confidence: 0.8,
  }),
  makeProfile({
    id: "role_analytics_engineer",
    slug: "analytics-engineer",
    title: "Analytics Engineer",
    category: "data",
    roleType: "evolving",
    aiImpact: "amplified",
    shortDescription:
      "Builds trusted analytics models, semantic layers, dashboards, and metric definitions that connect data engineering to business decisions.",
    marketSummary:
      "Signals suggest companies need stronger data basics and decision-ready analytics before advanced AI investments can pay off.",
    requirements: [
      requirement({
        id: "req_analytics_metrics_modeling",
        category: "business_context",
        label: "Metric and semantic modeling",
        description:
          "Can define business metrics, model clean datasets, and document assumptions so teams trust the output.",
        keywords: ["metrics", "semantic layer", "dbt", "sql", "dashboard"],
        proofExpected: ["A documented analytics model with metric definitions and dashboard examples."],
        interviewSignals: ["Explains metric trade-offs, edge cases, and stakeholder use."],
        sourceRefs: ["src_comptia_it_outlook_2026", "src_bls_computer_it_ooh_2025"],
      }),
      requirement({
        id: "req_analytics_ai_data_literacy",
        category: "ai_leverage",
        label: "AI-augmented analysis judgment",
        description:
          "Can use AI for analysis assistance while validating data quality, assumptions, and business meaning.",
        keywords: ["data literacy", "ai-assisted analysis", "validation", "sql", "business context"],
        proofExpected: ["An analysis write-up showing AI-assisted exploration plus human validation."],
        interviewSignals: ["Does not over-trust AI summaries; checks source data and definitions."],
        sourceRefs: ["src_wef_future_jobs_2025", "src_dora_2025_ai_software"],
      }),
    ],
    trendSignals: [
      trend({
        id: "trend_analytics_business_data",
        label: "Data basics and analytics maturity are still business blockers",
        summary:
          "Signals suggest many companies are still building the data practices needed for analytics, AI, and operational decisions.",
        impact: "amplified",
        affectedSkills: ["SQL", "metrics", "business analysis", "data literacy"],
        sourceRefs: ["src_comptia_it_outlook_2026", "src_wef_future_jobs_2025"],
      }),
    ],
    transitionPaths: [
      {
        fromRole: "Data Analyst",
        fitLevel: "easy",
        transferableSkills: ["SQL", "dashboards", "business analysis"],
        likelyGaps: ["software engineering practices", "versioned data models", "testing"],
        recommendedProof: ["Build a versioned analytics model with tests and a stakeholder-ready dashboard."],
      },
      fullStackTransition("moderate", ["analytics modeling", "metric definitions", "business data storytelling"], [
        "Create product analytics from application events with clear metrics and dashboard UX.",
      ]),
    ],
    interviewTopics: ["metrics", "SQL modeling", "dashboard trust", "data validation", "stakeholder communication"],
    proofExpectations: ["Analytics model", "metric documentation", "dashboard", "decision memo"],
    relatedRoleIds: ["role_data_engineer", "role_product_engineer"],
    sourceIds: ["src_comptia_it_outlook_2026", "src_wef_future_jobs_2025", "src_bls_computer_it_ooh_2025"],
    confidence: 0.76,
  }),
  makeProfile({
    id: "role_cybersecurity_analyst",
    slug: "cybersecurity-analyst",
    title: "Cybersecurity Analyst",
    category: "security",
    roleType: "evolving",
    aiImpact: "amplified",
    shortDescription:
      "Monitors threats, investigates incidents, improves controls, and increasingly uses AI and automation to strengthen security operations.",
    marketSummary:
      "Signals suggest cyber teams are more concerned with critical skill needs than only headcount, especially around AI and cloud security.",
    requirements: [
      requirement({
        id: "req_cybersecurity_incident_analysis",
        category: "domain",
        label: "Threat and incident analysis",
        description:
          "Can triage alerts, investigate incidents, identify root causes, and recommend control improvements.",
        keywords: ["soc", "incident response", "threat analysis", "logs", "siem"],
        proofExpected: ["A simulated incident report with timeline, root cause, and control recommendations."],
        interviewSignals: ["Explains signal vs noise, escalation, and evidence handling."],
        sourceRefs: ["src_isc2_workforce_2025", "src_owasp_top10_2025"],
      }),
      requirement({
        id: "req_cybersecurity_ai_cloud",
        category: "ai_leverage",
        label: "AI and cloud security awareness",
        description:
          "Understands how cloud adoption and AI tools change threat surfaces, controls, and security workflows.",
        keywords: ["ai security", "cloud security", "risk", "automation", "vulnerability"],
        proofExpected: ["A security assessment covering cloud or AI-enabled workflow risks."],
        interviewSignals: ["Connects new tools to real attack paths and mitigations."],
        sourceRefs: ["src_isc2_workforce_2025", "src_comptia_it_outlook_2026"],
      }),
    ],
    trendSignals: [
      trend({
        id: "trend_cyber_skills_not_headcount",
        label: "Cybersecurity concern is shifting toward critical skills",
        summary:
          "Workforce signals suggest skills shortages, AI, and cloud security are major constraints for cyber teams.",
        impact: "amplified",
        affectedSkills: ["AI security", "cloud security", "incident analysis", "risk management"],
        sourceRefs: ["src_isc2_workforce_2025", "src_wef_future_jobs_2025"],
      }),
    ],
    transitionPaths: [
      {
        fromRole: "System Administrator",
        fitLevel: "moderate",
        transferableSkills: ["systems", "networks", "logs", "access control"],
        likelyGaps: ["incident writing", "threat modeling", "security frameworks"],
        recommendedProof: ["Write a threat investigation from logs and propose concrete controls."],
      },
      {
        fromRole: "QA Automation Engineer",
        fitLevel: "hard",
        transferableSkills: ["testing mindset", "automation", "edge cases"],
        likelyGaps: ["security fundamentals", "incident response", "network/cloud concepts"],
        recommendedProof: ["Build a vulnerable app test plan mapped to OWASP Top 10 risks."],
      },
    ],
    interviewTopics: ["incident response", "SIEM", "OWASP risks", "cloud security", "AI security"],
    proofExpectations: ["Incident report", "threat model", "security control review"],
    relatedRoleIds: ["role_cloud_security_engineer", "role_sdet_qa_automation_engineer"],
    sourceIds: ["src_isc2_workforce_2025", "src_owasp_top10_2025", "src_wef_future_jobs_2025"],
    confidence: 0.82,
  }),
  makeProfile({
    id: "role_sdet_qa_automation_engineer",
    slug: "sdet-qa-automation-engineer",
    title: "SDET / QA Automation Engineer",
    category: "qa",
    roleType: "evolving",
    aiImpact: "amplified",
    shortDescription:
      "Builds automated tests, quality gates, reliability checks, and increasingly AI-assisted validation across product delivery.",
    marketSummary:
      "Signals suggest QA is shifting toward engineering-quality automation, risk-based testing, and AI-assisted test generation rather than manual-only execution.",
    requirements: [
      requirement({
        id: "req_sdet_test_architecture",
        category: "production",
        label: "Test architecture and quality gates",
        description:
          "Can design test layers, CI gates, data setup, and failure diagnostics for product teams.",
        keywords: ["test automation", "ci", "e2e", "integration tests", "quality gates"],
        proofExpected: ["A test suite integrated into CI with clear failure reporting and coverage rationale."],
        interviewSignals: ["Explains test pyramid trade-offs, flake handling, and risk-based coverage."],
        sourceRefs: ["src_bls_computer_it_ooh_2025", "src_dora_2024_devops"],
      }),
      requirement({
        id: "req_sdet_ai_assisted_testing",
        category: "ai_leverage",
        label: "AI-assisted testing with human review",
        description:
          "Can use AI to accelerate test ideas, data generation, and edge cases while reviewing quality and risk.",
        keywords: ["ai testing", "test generation", "edge cases", "review", "automation"],
        proofExpected: ["A testing workflow showing AI-generated cases curated into a reliable automated suite."],
        interviewSignals: ["Explains where AI helps and where human quality judgment is required."],
        sourceRefs: ["src_dora_2025_ai_software", "src_owasp_top10_2025"],
      }),
    ],
    trendSignals: [
      trend({
        id: "trend_sdet_ai_quality",
        label: "AI raises the bar for test judgment and delivery quality",
        summary:
          "Signals suggest AI can improve developer productivity, but teams still need strong testing and stability practices.",
        impact: "amplified",
        affectedSkills: ["test automation", "CI", "risk analysis", "AI-assisted workflows"],
        sourceRefs: ["src_dora_2025_ai_software", "src_dora_2024_devops"],
      }),
    ],
    transitionPaths: [
      {
        fromRole: "Manual QA Tester",
        fitLevel: "moderate",
        transferableSkills: ["quality mindset", "edge cases", "user flows"],
        likelyGaps: ["coding", "CI/CD", "test framework design"],
        recommendedProof: ["Automate a critical user journey with CI and a flake-reduction note."],
      },
      fullStackTransition("moderate", ["test strategy", "quality gates", "automation depth"], [
        "Add full-stack integration and E2E tests to a project with a risk-based test plan.",
      ]),
    ],
    interviewTopics: ["test automation", "CI gates", "test data", "flake handling", "AI-assisted testing"],
    proofExpectations: ["Automated suite", "CI integration", "risk-based test plan"],
    relatedRoleIds: ["role_cybersecurity_analyst", "role_devops_engineer"],
    sourceIds: ["src_bls_computer_it_ooh_2025", "src_dora_2024_devops", "src_dora_2025_ai_software"],
    confidence: 0.75,
  }),
  makeProfile({
    id: "role_backend_engineer",
    slug: "backend-engineer",
    title: "Backend Engineer",
    category: "software_engineering",
    roleType: "evolving",
    aiImpact: "amplified",
    shortDescription:
      "Owns APIs, data models, reliability, performance, security, and production behavior for business systems.",
    marketSummary:
      "Signals suggest backend roles are becoming more outcome-oriented, with stronger expectations around system ownership, cloud, security, and AI-assisted delivery.",
    requirements: [
      requirement({
        id: "req_backend_system_design",
        category: "system_design",
        label: "System design and trade-off reasoning",
        description:
          "Can design services, data flows, consistency boundaries, and reliability trade-offs for production workloads.",
        keywords: ["system design", "scalability", "reliability", "queues", "caching"],
        proofExpected: ["A case study showing architecture, trade-offs, bottlenecks, and reliability choices."],
        interviewSignals: ["Explains why a design fits the business constraints and failure modes."],
        sourceRefs: ["src_bls_computer_it_ooh_2025", "src_dora_2024_devops"],
      }),
      requirement({
        id: "req_backend_ai_augmented_delivery",
        category: "ai_leverage",
        label: "AI-augmented engineering workflow",
        description:
          "Can use AI to accelerate coding and review while maintaining tests, security, and design judgment.",
        keywords: ["ai coding", "testing", "code review", "security", "productivity"],
        proofExpected: ["A documented workflow showing AI-assisted delivery with tests and review controls."],
        interviewSignals: ["Treats AI as an accelerator, not a replacement for engineering judgment."],
        sourceRefs: ["src_dora_2025_ai_software", "src_owasp_top10_2025"],
      }),
    ],
    trendSignals: [
      trend({
        id: "trend_backend_full_cycle",
        label: "Backend work is becoming full-cycle ownership",
        summary:
          "Signals suggest backend engineers are expected to design, build, deploy, monitor, and improve systems rather than only complete tickets.",
        impact: "amplified",
        affectedSkills: ["system design", "cloud", "observability", "security", "AI-assisted delivery"],
        sourceRefs: ["src_bls_computer_it_ooh_2025", "src_dora_2024_devops", "src_dora_2025_ai_software"],
      }),
    ],
    transitionPaths: [
      fullStackTransition("easy", ["system depth", "performance stories", "cloud operations"], [
        "Write a production-system case study from an existing full-stack project.",
      ]),
      {
        fromRole: "Frontend Engineer",
        fitLevel: "hard",
        transferableSkills: ["product thinking", "API consumption", "user flows"],
        likelyGaps: ["databases", "backend performance", "system design", "operations"],
        recommendedProof: ["Build and deploy an API with auth, database indexes, and observability notes."],
      },
    ],
    interviewTopics: ["system design", "databases", "API performance", "auth", "debugging"],
    proofExpectations: ["Backend service", "architecture case study", "performance improvement"],
    relatedRoleIds: ["role_ai_backend_engineer", "role_platform_engineer", "role_full_stack_product_engineer"],
    sourceIds: ["src_bls_computer_it_ooh_2025", "src_dora_2024_devops", "src_dora_2025_ai_software"],
    confidence: 0.82,
  }),
  makeProfile({
    id: "role_full_stack_product_engineer",
    slug: "full-stack-product-engineer",
    title: "Full-stack Product Engineer",
    category: "software_engineering",
    roleType: "evolving",
    aiImpact: "amplified",
    shortDescription:
      "Builds product outcomes across frontend, backend, data, UX trade-offs, and AI-assisted workflows.",
    marketSummary:
      "Signals suggest generic full-stack CRUD work is more competitive, while product ownership, quality, and AI leverage increase differentiation.",
    requirements: [
      requirement({
        id: "req_full_stack_product_outcomes",
        category: "business_context",
        label: "Product outcome ownership",
        description:
          "Can connect user needs, UX trade-offs, backend constraints, and measurable product outcomes.",
        keywords: ["product engineering", "ux", "metrics", "frontend", "backend"],
        proofExpected: ["A feature case study with user problem, technical choices, metrics, and iteration."],
        interviewSignals: ["Explains why the feature mattered and how trade-offs were made."],
        sourceRefs: ["src_dora_2024_devops", "src_bls_computer_it_ooh_2025"],
      }),
      requirement({
        id: "req_full_stack_ai_workflows",
        category: "ai_leverage",
        label: "AI-assisted product workflows",
        description:
          "Can use AI to accelerate implementation and create AI-assisted user experiences while validating quality.",
        keywords: ["ai-assisted development", "frontend", "backend", "workflow", "quality"],
        proofExpected: ["A feature showing AI-assisted development or an AI-powered user workflow with quality checks."],
        interviewSignals: ["Balances speed with review, testing, and user trust."],
        sourceRefs: ["src_dora_2025_ai_software", "src_github_octoverse_2025"],
      }),
    ],
    trendSignals: [
      trend({
        id: "trend_full_stack_product_depth",
        label: "Full-stack differentiation is moving toward product ownership",
        summary:
          "Signals suggest product-minded engineers who can ship end-to-end outcomes are more differentiated than generic stack-label candidates.",
        impact: "amplified",
        affectedSkills: ["product thinking", "full-stack delivery", "AI-assisted coding", "quality"],
        sourceRefs: ["src_dora_2024_devops", "src_dora_2025_ai_software"],
      }),
    ],
    transitionPaths: [
      {
        fromRole: "Frontend Engineer",
        fitLevel: "moderate",
        transferableSkills: ["UI", "UX", "user flows", "client-side architecture"],
        likelyGaps: ["backend ownership", "data modeling", "deployment"],
        recommendedProof: ["Ship a full-stack feature with auth, database, metrics, and deployment notes."],
      },
      backendTransition("easy", ["frontend polish", "product metrics", "UX trade-offs"], [
        "Build a user-facing workflow with backend constraints, UI decisions, and success metrics.",
      ]),
    ],
    interviewTopics: ["product trade-offs", "frontend architecture", "API design", "metrics", "AI-assisted delivery"],
    proofExpectations: ["End-to-end feature", "metrics story", "technical/product case study"],
    relatedRoleIds: ["role_backend_engineer", "role_product_engineer", "role_applied_ai_engineer"],
    sourceIds: ["src_bls_computer_it_ooh_2025", "src_dora_2024_devops", "src_dora_2025_ai_software", "src_github_octoverse_2025"],
    confidence: 0.78,
  }),
  makeProfile({
    id: "role_devops_engineer",
    slug: "devops-engineer",
    title: "DevOps Engineer",
    category: "cloud",
    roleType: "evolving",
    aiImpact: "amplified",
    shortDescription:
      "Improves delivery, reliability, automation, infrastructure, observability, and incident readiness across software teams.",
    marketSummary:
      "Signals suggest DevOps fundamentals remain important as AI-assisted delivery increases the need for testing, stability, governance, and automation.",
    requirements: [
      requirement({
        id: "req_devops_delivery_fundamentals",
        category: "production",
        label: "Delivery and reliability fundamentals",
        description:
          "Can improve CI/CD, deployment safety, observability, incident response, and rollback practices.",
        keywords: ["ci/cd", "deployment", "observability", "incident response", "rollback"],
        proofExpected: ["A delivery pipeline with rollback strategy, monitoring, and incident runbook."],
        interviewSignals: ["Explains how to improve throughput without sacrificing stability."],
        sourceRefs: ["src_dora_2024_devops", "src_cncf_cloud_native_2024"],
      }),
      requirement({
        id: "req_devops_ai_delivery_controls",
        category: "ai_leverage",
        label: "Controls for AI-assisted delivery",
        description:
          "Understands how AI-assisted coding increases the value of tests, review, policy, and deployment controls.",
        keywords: ["ai-assisted development", "testing", "governance", "automation", "quality"],
        proofExpected: ["A CI/CD quality gate strategy for AI-assisted code changes."],
        interviewSignals: ["Treats AI as a source of throughput that still needs engineering controls."],
        sourceRefs: ["src_dora_2025_ai_software", "src_owasp_top10_2025"],
      }),
    ],
    trendSignals: [
      trend({
        id: "trend_devops_ai_stability",
        label: "AI increases the value of disciplined delivery practices",
        summary:
          "DORA signals suggest AI can improve productivity while teams still need robust testing, stability, and organizational fundamentals.",
        impact: "amplified",
        affectedSkills: ["CI/CD", "observability", "testing", "governance", "cloud"],
        sourceRefs: ["src_dora_2024_devops", "src_dora_2025_ai_software"],
      }),
    ],
    transitionPaths: [
      backendTransition("moderate", ["infrastructure depth", "incident response", "CI/CD ownership"], [
        "Add deployment automation, observability, and runbooks to an existing backend service.",
      ]),
      {
        fromRole: "System Administrator",
        fitLevel: "moderate",
        transferableSkills: ["systems", "scripting", "networks", "operations"],
        likelyGaps: ["cloud-native tooling", "CI/CD", "infrastructure as code"],
        recommendedProof: ["Automate deployment of an app with infrastructure as code and monitoring."],
      },
    ],
    interviewTopics: ["CI/CD", "observability", "cloud", "incident response", "automation"],
    proofExpectations: ["Pipeline", "runbook", "monitoring dashboard", "rollback demo"],
    relatedRoleIds: ["role_platform_engineer", "role_cloud_security_engineer", "role_sdet_qa_automation_engineer"],
    sourceIds: ["src_dora_2024_devops", "src_dora_2025_ai_software", "src_cncf_cloud_native_2024"],
    confidence: 0.8,
  }),
  makeProfile({
    id: "role_product_engineer",
    slug: "product-engineer",
    title: "Product Engineer",
    category: "product",
    roleType: "evolving",
    aiImpact: "amplified",
    shortDescription:
      "Owns user problems, rapid product iteration, full-stack implementation, metrics, and increasingly AI-native workflows.",
    marketSummary:
      "Signals suggest employers value engineers who can connect business problems, user experience, technical trade-offs, and AI leverage.",
    requirements: [
      requirement({
        id: "req_product_engineer_problem_framing",
        category: "business_context",
        label: "Problem framing and product judgment",
        description:
          "Can clarify user problems, choose practical scope, ship quickly, and measure whether the feature helped.",
        keywords: ["product judgment", "user problem", "metrics", "scope", "iteration"],
        proofExpected: ["A feature case study showing problem, hypothesis, shipped solution, metric, and iteration."],
        interviewSignals: ["Explains trade-offs and user value without hiding behind implementation details."],
        sourceRefs: ["src_dora_2024_devops", "src_dora_2025_ai_software"],
      }),
      requirement({
        id: "req_product_engineer_ai_native_features",
        category: "ai_leverage",
        label: "AI-native feature design",
        description:
          "Can identify where AI creates user value and design trust, review, and fallback into the product experience.",
        keywords: ["ai feature", "user trust", "review flow", "fallback", "workflow"],
        proofExpected: ["An AI-assisted product workflow with user controls, quality checks, and fallback states."],
        interviewSignals: ["Focuses on user outcomes, trust, and system boundaries."],
        sourceRefs: ["src_comptia_it_outlook_2026", "src_owasp_llm_top10"],
      }),
    ],
    trendSignals: [
      trend({
        id: "trend_product_engineer_ai_value",
        label: "AI value depends on workflow redesign, not just feature labels",
        summary:
          "Signals suggest AI adoption creates value when paired with workflow transformation, measurement, and user trust.",
        impact: "amplified",
        affectedSkills: ["product judgment", "AI workflows", "metrics", "UX", "full-stack delivery"],
        sourceRefs: ["src_comptia_it_outlook_2026", "src_dora_2025_ai_software"],
      }),
    ],
    transitionPaths: [
      fullStackTransition("easy", ["metrics discipline", "product narrative", "user research"], [
        "Write a product case study around a shipped feature with metrics and iteration notes.",
      ]),
      backendTransition("moderate", ["frontend UX", "product discovery", "metrics storytelling"], [
        "Build a user-facing workflow around a backend capability and instrument success metrics.",
      ]),
    ],
    interviewTopics: ["product judgment", "user workflows", "metrics", "scope trade-offs", "AI UX"],
    proofExpectations: ["Product case study", "AI workflow demo", "metric-backed iteration"],
    relatedRoleIds: ["role_full_stack_product_engineer", "role_applied_ai_engineer", "role_analytics_engineer"],
    sourceIds: ["src_comptia_it_outlook_2026", "src_dora_2024_devops", "src_dora_2025_ai_software"],
    confidence: 0.77,
  }),
];

export const roleMarketSeedSourceReferences = Object.values(sourceLibrary);
