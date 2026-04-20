import { LLMRouter } from '../llm/router';
import type { RouterConfig } from '../llm/types';
import type { CacheStore } from '../llm/cachedProvider';
import { runPipeline } from './pipeline';
import type { RunOptions, RunResult } from './pipeline';

/**
 * High-level facade for the Topic Engine.
 * Owns the LLMRouter and exposes a single `run()` method.
 *
 * @example Basic usage:
 * const engine = new TopicEngine();
 * const result = await engine.run({ topic: 'Event Loop', userInput: 'I want to understand it' });
 *
 * @example With Redis LLM cache (recommended for production):
 * import { RedisCache } from '@topic-engine/memory';
 * const engine = new TopicEngine({}, new RedisCache());
 *
 * @example Override providers for cost/speed trade-offs:
 * const engine = new TopicEngine({ decomposition: { provider: 'openai', model: 'o1' } });
 */
export class TopicEngine {
  private router: LLMRouter;

  constructor(routerOverrides: Partial<RouterConfig> = {}, cache?: CacheStore) {
    this.router = new LLMRouter(routerOverrides, cache);
  }

  async run(options: RunOptions): Promise<RunResult> {
    return runPipeline(this.router, options);
  }

  /** Expose router config for logging / eval harness */
  getRouterSnapshot(): RouterConfig {
    return this.router.snapshot();
  }
}
