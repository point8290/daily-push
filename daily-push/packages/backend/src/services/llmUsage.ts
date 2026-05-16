import { pool } from '../db/postgres';

export interface LlmUsageSample {
  provider: string;
  model: string;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  estimatedCostUsd: number | null;
}

export interface LlmUsageFeatureSummary {
  featureKey: string;
  totalCalls: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

export interface LlmUsageUserSummary {
  userId: string;
  email: string | null;
  totalCalls: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

export interface LlmUsageSummary {
  generatedAt: string;
  windowDays: number;
  totals: {
    totalCalls: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimatedCostUsd: number;
  };
  byFeature: LlmUsageFeatureSummary[];
  topUsers: LlmUsageUserSummary[];
}

interface UsageAggregateRow {
  total_calls: string;
  prompt_tokens: string | null;
  completion_tokens: string | null;
  total_tokens: string | null;
  estimated_cost_usd: string | null;
}

interface UsageFeatureRow extends UsageAggregateRow {
  feature_key: string;
}

interface UsageUserRow extends UsageAggregateRow {
  user_id: string;
  email: string | null;
}

function toInt(value: string | number | null | undefined): number {
  return Number.parseInt(String(value ?? 0), 10) || 0;
}

function toFloat(value: string | number | null | undefined): number {
  return Number.parseFloat(String(value ?? 0)) || 0;
}

function roundUsd(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export async function recordLlmUsage(params: {
  userId: string;
  goalId?: string | null;
  featureKey: string;
  operationKey: string;
  usage: LlmUsageSample | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  if (!params.usage) {
    return;
  }

  await pool.query(
    `INSERT INTO llm_usage_events
       (
         user_id,
         goal_id,
         feature_key,
         operation_key,
         provider,
         model,
         prompt_tokens,
         completion_tokens,
         total_tokens,
         estimated_cost_usd,
         metadata,
         created_at
       )
     VALUES
       (
         $1,
         $2,
         $3,
         $4,
         $5,
         $6,
         $7,
         $8,
         $9,
         $10,
         $11::jsonb,
         NOW()
       )`,
    [
      params.userId,
      params.goalId ?? null,
      params.featureKey,
      params.operationKey,
      params.usage.provider,
      params.usage.model,
      params.usage.promptTokens,
      params.usage.completionTokens,
      params.usage.totalTokens,
      params.usage.estimatedCostUsd,
      JSON.stringify(params.metadata ?? {}),
    ],
  );
}

export async function getLlmUsageSummary(
  windowDays = 30,
): Promise<LlmUsageSummary> {
  const normalizedWindowDays = Math.max(7, Math.min(windowDays, 90));

  const [{ rows: totalRows }, { rows: featureRows }, { rows: userRows }] =
    await Promise.all([
      pool.query<UsageAggregateRow>(
        `SELECT
           COUNT(*)::int AS total_calls,
           COALESCE(SUM(prompt_tokens), 0)::int AS prompt_tokens,
           COALESCE(SUM(completion_tokens), 0)::int AS completion_tokens,
           COALESCE(SUM(total_tokens), 0)::int AS total_tokens,
           COALESCE(SUM(estimated_cost_usd), 0)::text AS estimated_cost_usd
         FROM llm_usage_events
         WHERE created_at >= NOW() - ($1 || ' days')::INTERVAL`,
        [normalizedWindowDays],
      ),
      pool.query<UsageFeatureRow>(
        `SELECT
           feature_key,
           COUNT(*)::int AS total_calls,
           COALESCE(SUM(prompt_tokens), 0)::int AS prompt_tokens,
           COALESCE(SUM(completion_tokens), 0)::int AS completion_tokens,
           COALESCE(SUM(total_tokens), 0)::int AS total_tokens,
           COALESCE(SUM(estimated_cost_usd), 0)::text AS estimated_cost_usd
         FROM llm_usage_events
         WHERE created_at >= NOW() - ($1 || ' days')::INTERVAL
         GROUP BY feature_key
         ORDER BY total_tokens DESC, total_calls DESC`,
        [normalizedWindowDays],
      ),
      pool.query<UsageUserRow>(
        `SELECT
           lue.user_id,
           u.email,
           COUNT(*)::int AS total_calls,
           COALESCE(SUM(lue.prompt_tokens), 0)::int AS prompt_tokens,
           COALESCE(SUM(lue.completion_tokens), 0)::int AS completion_tokens,
           COALESCE(SUM(lue.total_tokens), 0)::int AS total_tokens,
           COALESCE(SUM(lue.estimated_cost_usd), 0)::text AS estimated_cost_usd
         FROM llm_usage_events lue
         INNER JOIN users u
           ON u.id = lue.user_id
         WHERE lue.created_at >= NOW() - ($1 || ' days')::INTERVAL
         GROUP BY lue.user_id, u.email
         ORDER BY total_tokens DESC, total_calls DESC
         LIMIT 10`,
        [normalizedWindowDays],
      ),
    ]);

  const totals = totalRows[0] ?? {
    total_calls: '0',
    prompt_tokens: '0',
    completion_tokens: '0',
    total_tokens: '0',
    estimated_cost_usd: '0',
  };

  return {
    generatedAt: new Date().toISOString(),
    windowDays: normalizedWindowDays,
    totals: {
      totalCalls: toInt(totals.total_calls),
      promptTokens: toInt(totals.prompt_tokens),
      completionTokens: toInt(totals.completion_tokens),
      totalTokens: toInt(totals.total_tokens),
      estimatedCostUsd: roundUsd(toFloat(totals.estimated_cost_usd)),
    },
    byFeature: featureRows.map((row) => ({
      featureKey: row.feature_key,
      totalCalls: toInt(row.total_calls),
      promptTokens: toInt(row.prompt_tokens),
      completionTokens: toInt(row.completion_tokens),
      totalTokens: toInt(row.total_tokens),
      estimatedCostUsd: roundUsd(toFloat(row.estimated_cost_usd)),
    })),
    topUsers: userRows.map((row) => ({
      userId: row.user_id,
      email: row.email,
      totalCalls: toInt(row.total_calls),
      totalTokens: toInt(row.total_tokens),
      estimatedCostUsd: roundUsd(toFloat(row.estimated_cost_usd)),
    })),
  };
}
