import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import axios from 'axios';
import { config } from '../config';

const anthropic    = new Anthropic({ apiKey: config.anthropic.apiKey });
const openaiClient = new OpenAI({ apiKey: config.openai.apiKey });

export const SYSTEM_PROMPT_EDUCATOR = `You are a senior software engineer and technical educator.
Generate structured learning plans for developers.
Output valid JSON only. No prose, no markdown, no code fences.`;

export const SYSTEM_PROMPT_CURATOR = `You are a technical news curator for senior software developers.
Your job is to score relevance and write concise, high-signal summaries.
Output valid JSON only. No prose, no markdown, no code fences.`;

export interface LlmUsageSummary {
  provider: 'anthropic' | 'openai' | 'ollama';
  model: string;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  estimatedCostUsd: number | null;
}

export interface LlmTextResponse {
  text: string;
  usage: LlmUsageSummary | null;
}

function buildUsage(
  provider: 'anthropic' | 'openai' | 'ollama',
  promptTokens: number | null | undefined,
  completionTokens: number | null | undefined,
): LlmUsageSummary {
  const normalizedPromptTokens =
    typeof promptTokens === 'number' && Number.isFinite(promptTokens)
      ? promptTokens
      : null;
  const normalizedCompletionTokens =
    typeof completionTokens === 'number' && Number.isFinite(completionTokens)
      ? completionTokens
      : null;
  const totalTokens =
    normalizedPromptTokens !== null || normalizedCompletionTokens !== null
      ? (normalizedPromptTokens ?? 0) + (normalizedCompletionTokens ?? 0)
      : null;
  const estimatedCostUsd =
    totalTokens === null
      ? null
      : Number(
          (
            ((normalizedPromptTokens ?? 0) / 1000) *
              config.llm.inputCostPer1kUsd +
            ((normalizedCompletionTokens ?? 0) / 1000) *
              config.llm.outputCostPer1kUsd
          ).toFixed(6),
        );

  return {
    provider,
    model: config.llm.model,
    promptTokens: normalizedPromptTokens,
    completionTokens: normalizedCompletionTokens,
    totalTokens,
    estimatedCostUsd,
  };
}

async function callAnthropic(
  system: string,
  userMessage: string,
  useCache: boolean,
): Promise<LlmTextResponse> {
  const systemBlock: Anthropic.Messages.TextBlockParam & {
    cache_control?: { type: 'ephemeral' };
  } = {
    type: 'text',
    text: system,
    ...(useCache ? { cache_control: { type: 'ephemeral' as const } } : {}),
  };

  const response = await anthropic.messages.create({
    model: config.llm.model,
    max_tokens: 4096,
    system: [systemBlock] as Anthropic.Messages.TextBlockParam[],
    messages: [{ role: 'user', content: userMessage }],
  });

  const block = response.content[0];
  if (block.type !== 'text') throw new Error('Unexpected response type from Anthropic');
  const usage = buildUsage(
    'anthropic',
    response.usage?.input_tokens ?? null,
    response.usage?.output_tokens ?? null,
  );
  return {
    text: block.text,
    usage,
  };
}

async function callOpenAI(
  system: string,
  userMessage: string,
): Promise<LlmTextResponse> {
  const usesCompletionTokens = /^(gpt-5|o1|o3|o4)/i.test(config.llm.model);
  const response = await openaiClient.chat.completions.create({
    model: config.llm.model,
    ...(usesCompletionTokens
      ? { max_completion_tokens: 4096 }
      : { max_tokens: 4096 }),
    messages: [
      { role: 'system', content: system },
      { role: 'user',   content: userMessage },
    ],
  });
  return {
    text: response.choices[0]?.message?.content ?? '',
    usage: buildUsage(
      'openai',
      response.usage?.prompt_tokens ?? null,
      response.usage?.completion_tokens ?? null,
    ),
  };
}

async function callOllama(
  system: string,
  userMessage: string,
): Promise<LlmTextResponse> {
  const baseUrl = config.llm.baseUrl || 'http://localhost:11434';
  const response = await axios.post(
    `${baseUrl}/api/chat`,
    {
      model: config.llm.model,
      stream: false,
      messages: [
        { role: 'system', content: system },
        { role: 'user',   content: userMessage },
      ],
    },
    { timeout: 120_000 }
  );
  return {
    text: response.data.message?.content ?? '',
    usage: buildUsage(
      'ollama',
      Number.isFinite(response.data?.prompt_eval_count)
        ? response.data.prompt_eval_count
        : null,
      Number.isFinite(response.data?.eval_count)
        ? response.data.eval_count
        : null,
    ),
  };
}

export async function callClaudeWithUsage(params: {
  system: string;
  userMessage: string;
  useCache?: boolean;
}): Promise<LlmTextResponse> {
  const { provider } = config.llm;
  if (provider === 'openai') {
    return callOpenAI(params.system, params.userMessage);
  }
  if (provider === 'ollama') {
    return callOllama(params.system, params.userMessage);
  }
  return callAnthropic(
    params.system,
    params.userMessage,
    params.useCache ?? false,
  );
}

export async function callClaude(params: {
  system: string;
  userMessage: string;
  useCache?: boolean;
}): Promise<string> {
  const response = await callClaudeWithUsage(params);
  return response.text;
}

export function parseJSON<T>(text: string): T {
  const cleaned = text.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  return JSON.parse(cleaned) as T;
}
