import type { LLMProvider, PipelineRole, ProviderConfig, RouterConfig } from './types';
import { AnthropicProvider } from './providers/anthropic';
import { OpenAIProvider } from './providers/openai';
import { OllamaProvider } from './providers/ollama';

// ─── Default configuration ────────────────────────────────────────────────────
// Swap any role to any provider at construction time or via configure().
export const DEFAULT_ROUTER_CONFIG: RouterConfig = {
  decomposition:    { provider: 'anthropic', model: 'claude-opus-4-6' },
  critique:         { provider: 'anthropic', model: 'claude-sonnet-4-6' },
  classification:   { provider: 'anthropic', model: 'claude-sonnet-4-6' },
  patch:            { provider: 'anthropic', model: 'claude-sonnet-4-6' },
  answer_eval:      { provider: 'anthropic', model: 'claude-haiku-4-5' },
  resource_scoring: { provider: 'anthropic', model: 'claude-haiku-4-5' },
};

export class LLMRouter {
  private config: RouterConfig;

  constructor(overrides: Partial<RouterConfig> = {}) {
    this.config = { ...DEFAULT_ROUTER_CONFIG, ...overrides };
  }

  /** Get the provider instance for a given pipeline role. */
  get(role: PipelineRole): LLMProvider {
    const { provider, model } = this.config[role];
    return this.instantiate(provider, model);
  }

  /** Override a single role at runtime — useful for A/B testing. */
  configure(role: PipelineRole, config: ProviderConfig): void {
    this.config[role] = config;
  }

  /** Return the full config snapshot for logging / eval harness. */
  snapshot(): RouterConfig {
    return { ...this.config };
  }

  private instantiate(provider: string, model: string): LLMProvider {
    switch (provider) {
      case 'anthropic':
        return new AnthropicProvider(model);
      case 'openai':
        return new OpenAIProvider(model);
      case 'ollama':
        return new OllamaProvider(model);
      default:
        throw new Error(`Unknown provider: "${provider}". Add it to LLMRouter.instantiate().`);
    }
  }
}
