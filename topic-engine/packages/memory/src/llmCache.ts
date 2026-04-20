import { redis } from '@topic-engine/db';
import type { CacheStore } from '@topic-engine/core';

/**
 * Redis-backed LLM response cache.
 *
 * Implements the CacheStore interface from core.
 * Wire it into the LLMRouter at startup:
 *
 * @example
 * import { LLMRouter } from '@topic-engine/core';
 * import { RedisCache } from '@topic-engine/memory';
 *
 * const router = new LLMRouter({}, new RedisCache());
 * const engine = new TopicEngine(router); // or pass router to runPipeline()
 */
export class RedisCache implements CacheStore {
  async get(key: string): Promise<string | null> {
    return redis().get(key);
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await redis().set(key, value, 'EX', ttlSeconds);
  }
}
