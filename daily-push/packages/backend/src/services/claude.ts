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

async function callAnthropic(system: string, userMessage: string, useCache: boolean): Promise<string> {
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
  return block.text;
}

async function callOpenAI(system: string, userMessage: string): Promise<string> {
  const response = await openaiClient.chat.completions.create({
    model: config.llm.model,
    max_tokens: 4096,
    messages: [
      { role: 'system', content: system },
      { role: 'user',   content: userMessage },
    ],
  });
  return response.choices[0]?.message?.content ?? '';
}

async function callOllama(system: string, userMessage: string): Promise<string> {
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
  return response.data.message?.content ?? '';
}

export async function callClaude(params: {
  system: string;
  userMessage: string;
  useCache?: boolean;
}): Promise<string> {
  const { provider } = config.llm;
  if (provider === 'openai') return callOpenAI(params.system, params.userMessage);
  if (provider === 'ollama') return callOllama(params.system, params.userMessage);
  return callAnthropic(params.system, params.userMessage, params.useCache ?? false);
}

export function parseJSON<T>(text: string): T {
  const cleaned = text.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  return JSON.parse(cleaned) as T;
}
