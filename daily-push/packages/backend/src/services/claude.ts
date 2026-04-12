import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';

export const anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });

export const SYSTEM_PROMPT_EDUCATOR = `You are a senior software engineer and technical educator.
Generate structured learning plans for developers.
Output valid JSON only. No prose, no markdown, no code fences.`;

export const SYSTEM_PROMPT_CURATOR = `You are a technical news curator for senior software developers.
Your job is to score relevance and write concise, high-signal summaries.
Output valid JSON only. No prose, no markdown, no code fences.`;

export async function callClaude(params: {
  system: string;
  userMessage: string;
  useCache?: boolean;
}): Promise<string> {
  const systemBlock: Anthropic.Messages.TextBlockParam & {
    cache_control?: { type: 'ephemeral' };
  } = {
    type: 'text',
    text: params.system,
    ...(params.useCache ? { cache_control: { type: 'ephemeral' as const } } : {}),
  };

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: [systemBlock] as Anthropic.Messages.TextBlockParam[],
    messages: [{ role: 'user', content: params.userMessage }],
  });

  const block = response.content[0];
  if (block.type !== 'text') throw new Error('Unexpected response type from Claude');
  return block.text;
}

export function parseJSON<T>(text: string): T {
  const cleaned = text.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  return JSON.parse(cleaned) as T;
}
