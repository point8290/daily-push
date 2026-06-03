import type { ContractMeta, SourceReference } from "./roleMarketContracts";
import { aiBackendEngineerFixture, roleMarketFixtureMeta } from "./roleMarketFixtures";
import type {
  MarketIngestionRun,
  MarketProfileValidationResult,
  MarketRawDocument,
  MarketSource,
  MarketSourceFetchRequest,
  MarketSourceFetchResult,
  MarketSourceHealth,
  NormalizedMarketSignal,
  RoleMarketProfileVersion,
  RoleMarketSignalAggregate,
} from "./liveMarketContracts";

export const LIVE_MARKET_FIXTURE_GENERATED_AT = "2026-05-23T00:00:00.000Z";
export const LIVE_MARKET_FIXTURE_VERSION = "live-market-fixture.v1";

export const liveMarketFixtureMeta: ContractMeta = {
  ...roleMarketFixtureMeta,
  generatedAt: LIVE_MARKET_FIXTURE_GENERATED_AT,
  sourceMode: "live",
  seedVersion: LIVE_MARKET_FIXTURE_VERSION,
  warnings: [],
};

export const liveMarketSourceFixture: MarketSource = {
  id: "market_source_fixture_job_board",
  name: "Fixture Job Board",
  type: "job_board",
  status: "enabled",
  sourceRefType: "job_post",
  baseUrl: "https://example.com/jobs",
  region: "India",
  authMode: "none",
  piiRiskLevel: "low",
  freshnessSlaHours: 72,
  owner: "market-ops",
  notes: "Deterministic fixture source used by contract tests.",
  createdAt: LIVE_MARKET_FIXTURE_GENERATED_AT,
  updatedAt: LIVE_MARKET_FIXTURE_GENERATED_AT,
  meta: liveMarketFixtureMeta,
};

export const liveMarketIngestionRunFixture: MarketIngestionRun = {
  id: "market_run_fixture_001",
  sourceId: liveMarketSourceFixture.id,
  adapterName: "fixture-job-board-adapter",
  status: "succeeded",
  requestedBy: "test_fixture",
  startedAt: LIVE_MARKET_FIXTURE_GENERATED_AT,
  completedAt: LIVE_MARKET_FIXTURE_GENERATED_AT,
  documentsDiscovered: 1,
  documentsCreated: 1,
  documentsDeduped: 0,
  documentsFailed: 0,
  errorSummary: null,
  meta: liveMarketFixtureMeta,
};

export const liveMarketSourceRefFixture: SourceReference = {
  id: "src_fixture_job_ai_backend_engineer_2026",
  title: "Senior AI Backend Engineer job post fixture",
  url: "https://example.com/jobs/senior-ai-backend-engineer",
  publisher: "Fixture Job Board",
  sourceType: "job_post",
  region: "India",
  publishedAt: "2026-05-20T00:00:00.000Z",
  capturedAt: LIVE_MARKET_FIXTURE_GENERATED_AT,
  confidence: 0.78,
};

export const liveMarketBlsSourceRefFixture: SourceReference = {
  id: "src_bls_computer_it_ooh_2025",
  title: "Computer and Information Technology Occupations",
  url: "https://www.bls.gov/ooh/computer-and-information-technology/home.htm",
  publisher: "U.S. Bureau of Labor Statistics",
  sourceType: "industry_report",
  region: "United States",
  publishedAt: "2025-09-01T00:00:00.000Z",
  capturedAt: LIVE_MARKET_FIXTURE_GENERATED_AT,
  confidence: 0.86,
};

export const liveMarketProfileVersionSourceRefsFixture: SourceReference[] = [
  liveMarketSourceRefFixture,
  liveMarketBlsSourceRefFixture,
  ...aiBackendEngineerFixture.sourceRefs,
];

export const liveMarketRawDocumentFixture: MarketRawDocument = {
  id: "market_raw_doc_fixture_001",
  sourceId: liveMarketSourceFixture.id,
  ingestionRunId: liveMarketIngestionRunFixture.id,
  sourceDocumentId: "fixture-job-001",
  documentType: "job_post",
  title: "Senior AI Backend Engineer",
  url: liveMarketSourceRefFixture.url,
  publisher: liveMarketSourceRefFixture.publisher,
  region: "India",
  publishedAt: liveMarketSourceRefFixture.publishedAt,
  capturedAt: LIVE_MARKET_FIXTURE_GENERATED_AT,
  dedupeKey: "fixture-job-board:senior-ai-backend-engineer:india",
  checksum: "sha256-fixture-ai-backend-engineer",
  extractedText:
    "Senior AI Backend Engineer role requiring Node.js, TypeScript, cloud deployment, RAG workflow ownership, evaluation discipline, and production observability.",
  rawPayload: {
    roleTitle: "Senior AI Backend Engineer",
    location: "India",
    employmentType: "full_time",
  },
  sourceRef: liveMarketSourceRefFixture,
  meta: liveMarketFixtureMeta,
};

export const normalizedMarketSignalFixture: NormalizedMarketSignal = {
  id: "market_signal_fixture_001",
  sourceId: liveMarketSourceFixture.id,
  ingestionRunId: liveMarketIngestionRunFixture.id,
  rawDocumentId: liveMarketRawDocumentFixture.id,
  sourceDocumentId: liveMarketRawDocumentFixture.sourceDocumentId,
  sourceRef: liveMarketSourceRefFixture,
  signalType: "requirement",
  canonicalRoleId: aiBackendEngineerFixture.id,
  observedRoleTitle: "Senior AI Backend Engineer",
  canonicalSkillId: "skill_rag_evaluation",
  normalizedLabel: "RAG evaluation and production reliability",
  requirementCategory: "ai_leverage",
  requirementPriority: "must_have",
  seniorityBand: "senior",
  region: "India",
  value: "Own RAG workflows with evaluation, monitoring, and safe release checks.",
  keywords: ["RAG", "evaluation", "observability", "production AI"],
  evidenceText:
    "Requires RAG workflow ownership, evaluation discipline, and production observability.",
  direction: "increasing",
  observedAt: LIVE_MARKET_FIXTURE_GENERATED_AT,
  confidence: 0.76,
  meta: liveMarketFixtureMeta,
};

export const roleMarketSignalAggregateFixture: RoleMarketSignalAggregate = {
  id: "market_aggregate_fixture_ai_backend_engineer",
  roleProfileId: aiBackendEngineerFixture.id,
  roleTitle: aiBackendEngineerFixture.title,
  category: aiBackendEngineerFixture.category,
  region: "India",
  sourceMode: "live",
  windowStart: "2026-05-01T00:00:00.000Z",
  windowEnd: LIVE_MARKET_FIXTURE_GENERATED_AT,
  sampleSize: 1,
  sourceCount: 1,
  sourceRefs: [liveMarketSourceRefFixture],
  demand: {
    score: 72,
    direction: "increasing",
    sampleSize: 1,
    sourceDiversity: 1,
    confidence: 0.63,
  },
  topSkills: [
    {
      skillId: "skill_rag_evaluation",
      label: "RAG evaluation",
      category: "ai_leverage",
      mentionCount: 1,
      demandShare: 1,
      direction: "increasing",
      sourceRefIds: [liveMarketSourceRefFixture.id],
      confidence: 0.76,
    },
  ],
  requirements: [
    {
      label: "Own production AI workflow reliability",
      category: "production",
      priority: "must_have",
      mentionCount: 1,
      keywords: ["RAG", "evaluation", "observability"],
      sourceRefIds: [liveMarketSourceRefFixture.id],
      confidence: 0.74,
    },
  ],
  seniority: [
    {
      seniorityBand: "senior",
      share: 1,
      mentionCount: 1,
      sourceRefIds: [liveMarketSourceRefFixture.id],
      confidence: 0.7,
    },
  ],
  remotePolicy: [
    {
      policy: "hybrid",
      share: 1,
      mentionCount: 1,
      sourceRefIds: [liveMarketSourceRefFixture.id],
      confidence: 0.7,
    },
  ],
  salary: [
    {
      label: "Salary range",
      salaryMin: 2500000,
      salaryMax: 3800000,
      mentionCount: 1,
      sourceRefIds: [liveMarketSourceRefFixture.id],
      confidence: 0.66,
    },
  ],
  aiImpact: [
    {
      impact: "amplified",
      summary:
        "AI raises the bar from feature delivery to safe workflow ownership and measurable quality.",
      affectedSkills: ["backend engineering", "observability", "evaluation"],
      sourceRefIds: [liveMarketSourceRefFixture.id],
      confidence: 0.72,
    },
  ],
  freshnessHours: 0,
  confidence: 0.69,
  generatedAt: LIVE_MARKET_FIXTURE_GENERATED_AT,
  meta: liveMarketFixtureMeta,
};

export const marketProfileValidationResultFixture: MarketProfileValidationResult = {
  profileVersionId: "market_profile_version_fixture_ai_backend_engineer_v2",
  status: "passed_with_warnings",
  canPublish: false,
  checkedAt: LIVE_MARKET_FIXTURE_GENERATED_AT,
  findings: [
    {
      id: "market_validation_fixture_sample_size",
      severity: "warning",
      code: "sample_too_small",
      message: "Fixture aggregate has only one source-backed sample.",
      path: "aggregate.sampleSize",
      sourceRefIds: [liveMarketSourceRefFixture.id],
    },
  ],
  sourceIntegrity: {
    sourceRefCount: 1,
    missingSourceRefCount: 0,
    staleSourceRefCount: 0,
  },
  freshnessHours: 0,
  confidence: 0.69,
  meta: liveMarketFixtureMeta,
};

export const roleMarketProfileVersionFixture: RoleMarketProfileVersion = {
  id: marketProfileValidationResultFixture.profileVersionId,
  roleProfileId: aiBackendEngineerFixture.id,
  version: 2,
  status: "draft",
  sourceMode: "hybrid",
  profile: {
    ...aiBackendEngineerFixture,
    sourceRefs: liveMarketProfileVersionSourceRefsFixture,
    marketSummary:
      "Draft hybrid market profile: fixture signals suggest production AI backend work is placing more emphasis on API ownership, RAG workflow quality, observability, and safe release practices.",
    lastUpdated: LIVE_MARKET_FIXTURE_GENERATED_AT,
    confidence: 0.74,
    meta: {
      ...liveMarketFixtureMeta,
      sourceMode: "hybrid",
    },
  },
  aggregateId: roleMarketSignalAggregateFixture.id,
  previousVersionId: aiBackendEngineerFixture.id,
  sourceRefs: liveMarketProfileVersionSourceRefsFixture,
  changeSummary:
    "Adds live-market emphasis on RAG evaluation and production reliability while retaining curated baseline requirements.",
  profileDiff: {
    profileVersionId: marketProfileValidationResultFixture.profileVersionId,
    roleProfileId: aiBackendEngineerFixture.id,
    previousProfileVersionId: aiBackendEngineerFixture.id,
    generatedAt: LIVE_MARKET_FIXTURE_GENERATED_AT,
    materiality: "medium",
    summary:
      "Draft adds one source-backed requirement emphasis and expands source coverage while keeping the curated baseline.",
    requirements: {
      added: [
        {
          label: "Own production AI workflow reliability",
          before: null,
          after: {
            requirementId: "req_live_fixture_production_ai_reliability",
            label: "Own production AI workflow reliability",
            category: "production",
            priority: "must_have",
            keywords: ["RAG", "evaluation", "observability"],
            sourceRefIds: [liveMarketSourceRefFixture.id],
            confidence: 0.74,
          },
          changeSummary: "Added aggregate-backed must-have requirement.",
        },
      ],
      removed: [],
      changed: [],
    },
    topSkills: {
      added: ["RAG evaluation"],
      removed: [],
      unchangedCount: 2,
    },
    proofExpectations: {
      added: ["Production AI workflow reliability evidence"],
      removed: [],
      unchangedCount: aiBackendEngineerFixture.proofExpectations.length,
    },
    trendSignals: {
      added: ["AI backend workflow reliability"],
      removed: [],
      unchangedCount: aiBackendEngineerFixture.trendSignals.length,
    },
    sourceRefs: {
      addedSourceRefIds: [liveMarketSourceRefFixture.id],
      removedSourceRefIds: [],
      unchangedCount: aiBackendEngineerFixture.sourceRefs.length,
    },
    confidence: {
      before: aiBackendEngineerFixture.confidence,
      after: 0.74,
      delta: Number((0.74 - aiBackendEngineerFixture.confidence).toFixed(2)),
    },
    meta: {
      ...liveMarketFixtureMeta,
      sourceMode: "hybrid",
    },
  },
  validationResult: marketProfileValidationResultFixture,
  createdBy: "market-fixture",
  createdAt: LIVE_MARKET_FIXTURE_GENERATED_AT,
  reviewedBy: null,
  reviewedAt: null,
  publishedAt: null,
  rollbackOfVersionId: null,
  meta: {
    ...liveMarketFixtureMeta,
    sourceMode: "hybrid",
  },
};

export const marketSourceHealthFixture: MarketSourceHealth = {
  sourceId: liveMarketSourceFixture.id,
  status: "healthy",
  checkedAt: LIVE_MARKET_FIXTURE_GENERATED_AT,
  latestRunId: liveMarketIngestionRunFixture.id,
  latestRunStatus: liveMarketIngestionRunFixture.status,
  lastSuccessfulRunAt: liveMarketIngestionRunFixture.completedAt,
  consecutiveFailures: 0,
  freshnessAgeHours: 0,
  documentsLastRun: liveMarketIngestionRunFixture.documentsCreated,
  signalsLastRun: 1,
  errorSummary: null,
  meta: liveMarketFixtureMeta,
};

export const marketSourceFetchRequestFixture: MarketSourceFetchRequest = {
  source: liveMarketSourceFixture,
  runId: liveMarketIngestionRunFixture.id,
  since: "2026-05-01T00:00:00.000Z",
  limit: 10,
  query: "Senior AI Backend Engineer",
  roleProfileId: aiBackendEngineerFixture.id,
  region: "India",
  country: "in",
  page: 1,
  pageLimit: 1,
  dryRun: false,
};

export const marketSourceFetchResultFixture: MarketSourceFetchResult = {
  sourceId: liveMarketSourceFixture.id,
  runId: liveMarketIngestionRunFixture.id,
  documents: [liveMarketRawDocumentFixture],
  health: marketSourceHealthFixture,
  warnings: [],
};

export const liveMarketGoldenFixtures = {
  source: liveMarketSourceFixture,
  ingestionRun: liveMarketIngestionRunFixture,
  rawDocument: liveMarketRawDocumentFixture,
  normalizedSignal: normalizedMarketSignalFixture,
  aggregate: roleMarketSignalAggregateFixture,
  profileVersion: roleMarketProfileVersionFixture,
  validationResult: marketProfileValidationResultFixture,
  sourceHealth: marketSourceHealthFixture,
  sourceFetchRequest: marketSourceFetchRequestFixture,
  sourceFetchResult: marketSourceFetchResultFixture,
} as const;
