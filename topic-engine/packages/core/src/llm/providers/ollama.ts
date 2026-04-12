import type {
  LLMProvider,
  CompletionOptions,
  CompletionResult,
  StreamChunk,
} from '../types';

// Models that support tool use in Ollama
const TOOL_CAPABLE_MODELS = ['llama3.1', 'llama3.2', 'mistral-nemo', 'qwen2.5'];

export class OllamaProvider implements LLMProvider {
  private baseUrl: string;
  private model: string;

  constructor(model = 'llama3.1', baseUrl?: string) {
    this.model = model;
    this.baseUrl = baseUrl ?? process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
  }

  name() {
    return `ollama/${this.model}`;
  }

  supportsThinking() {
    return false;
  }

  supportsTools() {
    return TOOL_CAPABLE_MODELS.some((m) => this.model.startsWith(m));
  }

  async complete(options: CompletionOptions): Promise<CompletionResult> {
    const messages = [];

    const systemText = [
      ...(options.system ? [options.system] : []),
      ...options.messages
        .filter((m) => m.role === 'system')
        .map((m) => m.content),
    ].join('\n\n');

    if (systemText) {
      messages.push({ role: 'system', content: systemText });
    }

    for (const m of options.messages.filter((m) => m.role !== 'system')) {
      messages.push({ role: m.role, content: m.content });
    }

    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      stream: false,
      options: {
        temperature: options.temperature ?? 0.7,
        num_predict: options.maxTokens ?? 4096,
      },
    };

    // Ollama supports JSON format mode for structured output
    body.format = 'json';

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(
        `Ollama request failed: ${response.status} ${await response.text()}`
      );
    }

    const data = (await response.json()) as {
      message: { content: string };
      prompt_eval_count?: number;
      eval_count?: number;
    };

    return {
      content: data.message.content,
      usage: {
        inputTokens: data.prompt_eval_count ?? 0,
        outputTokens: data.eval_count ?? 0,
      },
      model: this.model,
      provider: 'ollama',
    };
  }

  async *stream(options: CompletionOptions): AsyncIterable<StreamChunk> {
    const result = await this.complete(options);
    if (result.content) yield { type: 'text', content: result.content };
    yield { type: 'done' };
  }
}
