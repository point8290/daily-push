import { z } from 'zod';
import type { LLMProvider, CompletionOptions } from './types';

export interface StructuredOptions extends CompletionOptions {
  schemaDescription: string; // human-readable description injected into the prompt
  maxRetries?: number;
}

/**
 * Calls an LLM provider and validates the response against a Zod schema.
 * Injects JSON-only instructions into the system prompt.
 * Retries up to maxRetries times on parse failure.
 */
export async function generateStructured<T>(
  provider: LLMProvider,
  schema: z.ZodSchema<T>,
  options: StructuredOptions
): Promise<T> {
  const maxRetries = options.maxRetries ?? 2;

  const jsonInstruction = [
    'Output valid JSON only.',
    'No markdown fences, no prose, no explanation outside the JSON.',
    `Schema: ${options.schemaDescription}`,
  ].join('\n');

  const systemWithJson = [options.system ?? '', jsonInstruction]
    .filter(Boolean)
    .join('\n\n');

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await provider.complete({
        ...options,
        system: systemWithJson,
        temperature: attempt === 0 ? (options.temperature ?? 0.3) : 0.1,
      });

      const cleaned = stripMarkdownFences(result.content);
      const parsed: unknown = JSON.parse(cleaned);
      return schema.parse(parsed);
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        // On retry, add the error context to the conversation
        options = {
          ...options,
          messages: [
            ...options.messages,
            {
              role: 'assistant' as const,
              content: 'I need to fix the JSON format.',
            },
            {
              role: 'user' as const,
              content: `The previous response was not valid JSON matching the schema. Error: ${String(lastError)}. Please return ONLY valid JSON.`,
            },
          ],
        };
      }
    }
  }

  throw new Error(
    `generateStructured failed after ${maxRetries + 1} attempts. Last error: ${String(lastError)}`
  );
}

function stripMarkdownFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();
}
