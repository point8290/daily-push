import { LLMRouter } from '../llm/router';
import type { RouterConfig } from '../llm/types';
import { runPipeline } from './pipeline';
import type { RunOptions, RunResult } from './pipeline';

/**
 * High-level facade for the Topic Engine.
 * Owns the LLMRouter and exposes a single `run()` method.
 *
 * @example
 * const engine = new TopicEngine();
 * const result = await engine.run({ topic: 'Event Loop', userInput: 'I want to understand it' });
 *
 * @example Override providers for cost/speed trade-offs:
 * const engine = new TopicEngine({
 *   decomposition: { provider: 'openai', model: 'o1' },
 * });
 */
export class TopicEngine {
  private router: LLMRouter;

  constructor(routerOverrides: Partial<RouterConfig> = {}) {
    this.router = new LLMRouter(routerOverrides);
  }

  async run(options: RunOptions): Promise<RunResult> {
    return runPipeline(this.router, options);
  }

  /** Expose router config for logging / eval harness */
  getRouterSnapshot(): RouterConfig {
    return this.router.snapshot();
  }
}
