import crypto from 'crypto';
import type { LLMProvider, CompletionOptions, CompletionResult, StreamChunk } from './types';

// ─── Cache store interface (injected — no DB dependency in core) ──────────────

/**
 * Minimal key-value cache interface.
 * Implemented by RedisCache in packages/memory.
 * Allows core to stay free of DB dependencies while supporting caching.
 */
export interface CacheStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
}

// ─── Config ───────────────────────────────────────────────────────────────────

/** 30-day TTL — LLM outputs for the same input are stable over this window. */
export const LLM_CACHE_TTL_SECONDS = 30 * 24 * 3600;

/**
 * Roles where caching is safe — same input produces the same useful output.
 * Excluded: critique (want fresh evaluation), patch (want fresh fixes).
 */
export const CACHEABLE_ROLES = new Set([
  'decomposition',    // prerequisite graph — fully determined by topic + user context
  'classification',   // intent capture, boundary detection — cheap + deterministic
  'answer_eval',      // quiz scoring — same question = same score
  'resource_scoring', // same URL + node = same coverage score
]);

// ─── Cache key ────────────────────────────────────────────────────────────────

/**
 * Builds the cache key for a completion request.
 * Key: sha256(providerName + '::' + systemPrompt + '::' + firstUserMessage)
 *
 * Only the first user message is included (not the whole conversation) because:
 *   - Decomposition, classification, boundary, verification — all have exactly
 *     one user message that fully determines the response.
 *   - Including retried messages would cause cache misses on retries.
 */
function buildCacheKey(providerName: string, options: CompletionOptions): string {
  const system = options.system ?? '';
  const firstMessage = options.messages[0]?.content ?? '';
  const raw = `${providerName}::${system}::${firstMessage}`;
  return 'llm:' + crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
}

// ─── CachedLLMProvider ────────────────────────────────────────────────────────

/**
 * Wraps any LLMProvider with a transparent read-through cache.
 *
 * - Cache hit: deserialise and return the stored CompletionResult immediately.
 * - Cache miss: call the inner provider, store the result, return it.
 * - Streaming: never cached (streaming is for interactive / real-time responses).
 *
 * The LLMRouter wraps only CACHEABLE_ROLES — critique and patch always bypass.
 */
export class CachedLLMProvider implements LLMProvider {
  constructor(
    private readonly inner: LLMProvider,
    private readonly store: CacheStore,
    private readonly ttl: number = LLM_CACHE_TTL_SECONDS
  ) {}

  async complete(options: CompletionOptions): Promise<CompletionResult> {
    const key = buildCacheKey(this.inner.name(), options);

    const cached = await this.store.get(key);
    if (cached !== null) {
      return JSON.parse(cached) as CompletionResult;
    }

    const result = await this.inner.complete(options);
    // Fire-and-forget: don't block the caller on cache write
    this.store.set(key, JSON.stringify(result), this.ttl).catch((err: Error) => {
      console.warn('[llm-cache] Failed to write cache key:', err.message);
    });

    return result;
  }

  // Streaming bypasses the cache — it's for interactive/SSE responses
  stream(options: CompletionOptions): AsyncIterable<StreamChunk> {
    return this.inner.stream(options);
  }

  supportsThinking(): boolean { return this.inner.supportsThinking(); }
  supportsTools(): boolean    { return this.inner.supportsTools(); }
  name(): string              { return this.inner.name(); }
}
