import type { LLMProvider, PipelineRole, ProviderConfig, RouterConfig } from './types';
import { AnthropicProvider } from './providers/anthropic';
import { OpenAIProvider } from './providers/openai';
import { OllamaProvider } from './providers/ollama';
import { GoogleProvider } from './providers/google';
import { CachedLLMProvider, CACHEABLE_ROLES } from './cachedProvider';
import type { CacheStore } from './cachedProvider';

// ─── Default configuration ────────────────────────────────────────────────────
// Swap any role to any provider at construction time or via configure().
export const DEFAULT_ROUTER_CONFIG: RouterConfig = {
  // Complex reasoning — Anthropic (reliable structured output, graph logic)
  decomposition:    { provider: 'anthropic', model: 'claude-opus-4-6' },
  critique:         { provider: 'anthropic', model: 'claude-sonnet-4-6' },
  classification:   { provider: 'anthropic', model: 'claude-haiku-4-5' },
  patch:            { provider: 'anthropic', model: 'claude-haiku-4-5' },
  // Simple scoring — OpenAI (Ollama GCP VM offline)
  answer_eval:      { provider: 'anthropic', model: 'claude-haiku-4-5' },
  resource_scoring: { provider: 'openai', model: 'gpt-4o-mini' },
};

export class LLMRouter {
  private config: RouterConfig;
  private cache: CacheStore | undefined;

  /**
   * @param overrides   Per-role provider overrides (e.g. swap decomposition to OpenAI)
   * @param cache       Optional cache store. When provided, CACHEABLE_ROLES are wrapped
   *                    with a CachedLLMProvider (30-day TTL, sha256 key).
   *                    Pass a RedisCache instance from @topic-engine/memory.
   */
  constructor(overrides: Partial<RouterConfig> = {}, cache?: CacheStore) {
    this.config = { ...DEFAULT_ROUTER_CONFIG, ...overrides };
    this.cache = cache;
  }

  /** Get the provider instance for a given pipeline role. Cacheable roles are wrapped. */
  get(role: PipelineRole): LLMProvider {
    const { provider, model, baseUrl } = this.config[role];
    const base = this.instantiate(provider, model, baseUrl);

    if (this.cache && CACHEABLE_ROLES.has(role)) {
      return new CachedLLMProvider(base, this.cache);
    }

    return base;
  }

  /** Override a single role at runtime — useful for A/B testing. */
  configure(role: PipelineRole, config: ProviderConfig): void {
    this.config[role] = config;
  }

  /** Return the full config snapshot for logging / eval harness. */
  snapshot(): RouterConfig {
    return { ...this.config };
  }

  private instantiate(provider: string, model: string, baseUrl?: string): LLMProvider {
    switch (provider) {
      case 'anthropic':
        return new AnthropicProvider(model);
      case 'openai':
        return new OpenAIProvider(model);
      case 'ollama':
        return new OllamaProvider(model, baseUrl);
      case 'google':
        return new GoogleProvider(model);
      default:
        throw new Error(`Unknown provider: "${provider}". Add it to LLMRouter.instantiate().`);
    }
  }
}
