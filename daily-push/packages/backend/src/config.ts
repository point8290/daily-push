import dotenv from 'dotenv';
import path from 'path';
import type { SourceMode } from '@daily-push/shared';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

function readInt(value: string | undefined, fallback: number): number {
  const parsed = parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readFloat(value: string | undefined, fallback: number): number {
  const parsed = Number.parseFloat(value ?? '');
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return !['false', '0', 'off', 'no'].includes(value.trim().toLowerCase());
}

function readCsv(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export const config = {
  postgres: {
    url: process.env.POSTGRES_URL || 'postgresql://daily_push_user:daily_push_pass@localhost:5434/daily_push_v2',
  },
  mongo: {
    url: process.env.MONGO_URL || 'mongodb://localhost:27018/daily_push_v2',
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
  },
  llm: {
    provider: (process.env.LLM_PROVIDER || 'anthropic') as 'anthropic' | 'ollama' | 'openai',
    model:    process.env.LLM_MODEL    || 'claude-sonnet-4-6',
    baseUrl:  process.env.LLM_BASE_URL || '',  // required for ollama, e.g. http://host:11434
    inputCostPer1kUsd: readFloat(process.env.LLM_INPUT_COST_PER_1K_USD, 0),
    outputCostPer1kUsd: readFloat(process.env.LLM_OUTPUT_COST_PER_1K_USD, 0),
  },
  resend: {
    apiKey: process.env.RESEND_API_KEY || '',
    fromEmail: process.env.FROM_EMAIL || 'daily-push@yourdomain.com',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
    expiresIn: '30d',
  },
  app: {
    port: readInt(process.env.PORT, 3001),
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
    nodeEnv: process.env.NODE_ENV || 'development',
    topicEngineUrl: process.env.TOPIC_ENGINE_URL || 'http://localhost:3000',
  },
  security: {
    jsonBodyLimit: process.env.JSON_BODY_LIMIT || '1mb',
    authRateLimitWindowMs: readInt(
      process.env.AUTH_RATE_LIMIT_WINDOW_MS,
      10 * 60 * 1000,
    ),
    authRateLimitMax: readInt(process.env.AUTH_RATE_LIMIT_MAX, 12),
    eventRateLimitWindowMs: readInt(
      process.env.EVENT_RATE_LIMIT_WINDOW_MS,
      60 * 1000,
    ),
    eventRateLimitMax: readInt(process.env.EVENT_RATE_LIMIT_MAX, 180),
  },
  operators: {
    emails: readCsv(process.env.OPERATOR_EMAILS),
  },
  billing: {
    provider: (process.env.BILLING_PROVIDER || 'manual') as 'manual' | 'stripe',
    stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
    stripeApiBaseUrl: process.env.STRIPE_API_BASE_URL || 'https://api.stripe.com',
    stripePortalConfigurationId:
      process.env.STRIPE_PORTAL_CONFIGURATION_ID || '',
    stripePrices: {
      pro: {
        month: process.env.STRIPE_PRICE_PRO_MONTH || '',
        year: process.env.STRIPE_PRICE_PRO_YEAR || '',
      },
      sprint: {
        month: process.env.STRIPE_PRICE_SPRINT_MONTH || '',
        year: process.env.STRIPE_PRICE_SPRINT_YEAR || '',
      },
    },
  },
  weeklySummary: {
    enabled: process.env.WEEKLY_SUMMARY_SCHEDULER_ENABLED !== 'false',
    checkIntervalMs: readInt(
      process.env.WEEKLY_SUMMARY_CHECK_INTERVAL_MS,
      60 * 60 * 1000,
    ),
    defaultDigestTime:
      process.env.WEEKLY_SUMMARY_DEFAULT_DIGEST_TIME || '08:00',
  },
  decomposition: {
    topicConcurrency: readInt(
      process.env.TOPIC_ENGINE_DECOMPOSE_CONCURRENCY,
      2,
    ),
    requestTimeoutMs: readInt(process.env.TOPIC_ENGINE_TIMEOUT_MS, 300000),
    maxAttempts: readInt(process.env.TOPIC_ENGINE_MAX_ATTEMPTS, 2),
    retryBaseDelayMs: readInt(
      process.env.TOPIC_ENGINE_RETRY_BASE_DELAY_MS,
      5000,
    ),
  },
  decisionLayer: {
    // Confidence threshold above which intake skips LLM and uses a matched profile directly.
    // Default 1.1 = bypass disabled (LLM always runs). Set to 0.85 to re-enable once profiles are mature.
    directThreshold: parseFloat(process.env.DECISION_LAYER_DIRECT_THRESHOLD || '1.1'),
  },
  career: {
    gapReportRepoEvidenceEnabled: readBool(
      process.env.GAP_REPORT_REPO_EVIDENCE_ENABLED,
      false,
    ),
  },
  roleMarket: {
    featurePublic: readBool(process.env.FEATURE_ROLE_MARKET_PUBLIC, false),
    featureTargetRoleSave: readBool(process.env.FEATURE_TARGET_ROLE_SAVE, false),
    featureReadinessReport: readBool(
      process.env.FEATURE_ROLE_READINESS_REPORT,
      false,
    ),
    featureAiSummary: readBool(
      process.env.FEATURE_ROLE_MARKET_AI_SUMMARY,
      false,
    ),
    seedVersion: process.env.ROLE_MARKET_SEED_VERSION || 'role-market-seed.v1',
    lastUpdated:
      process.env.ROLE_MARKET_LAST_UPDATED || '2026-05-18T00:00:00.000Z',
    sourceMode: (process.env.ROLE_MARKET_SOURCE_MODE || 'curated') as SourceMode,
    recommendRateLimitWindowMs: readInt(
      process.env.ROLE_MARKET_RECOMMEND_RATE_LIMIT_WINDOW_MS,
      60 * 1000,
    ),
    recommendRateLimitMax: readInt(
      process.env.ROLE_MARKET_RECOMMEND_RATE_LIMIT_MAX,
      20,
    ),
  },
};
