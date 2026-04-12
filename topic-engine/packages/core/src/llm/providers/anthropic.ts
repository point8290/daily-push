import Anthropic from '@anthropic-ai/sdk';
import type {
  LLMProvider,
  CompletionOptions,
  CompletionResult,
  StreamChunk,
  ToolCall,
} from '../types';

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic;
  private model: string;

  constructor(model = 'claude-opus-4-6') {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is not set');
    }
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    this.model = model;
  }

  name() {
    return `anthropic/${this.model}`;
  }

  supportsThinking() {
    return (
      this.model.includes('claude-opus') ||
      this.model.includes('claude-sonnet')
    );
  }

  supportsTools() {
    return true;
  }

  async complete(options: CompletionOptions): Promise<CompletionResult> {
    const useThinking =
      options.thinking === true && this.supportsThinking();

    // Build request params
    const params: Anthropic.Messages.MessageCreateParamsNonStreaming = {
      model: this.model,
      max_tokens: options.maxTokens ?? (useThinking ? 16000 : 8192),
      messages: options.messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
    };

    // System prompt
    const systemMessages = options.messages.filter((m) => m.role === 'system');
    const systemText = [
      ...(options.system ? [options.system] : []),
      ...systemMessages.map((m) => m.content),
    ].join('\n\n');
    if (systemText) params.system = systemText;

    // Temperature (not supported with extended thinking)
    if (!useThinking && options.temperature !== undefined) {
      params.temperature = options.temperature;
    }

    // Tools
    if (options.tools?.length) {
      params.tools = options.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: {
          type: 'object' as const,
          ...(t.inputSchema as Record<string, unknown>),
        },
      }));
    }

    // Extended thinking
    if (useThinking) {
      (params as any).thinking = {
        type: 'enabled',
        budget_tokens: options.thinkingBudget ?? 8000,
      };
    }

    const response = await this.client.messages.create(params);

    // Extract content blocks
    let textContent = '';
    let thinkingContent: string | undefined;
    const toolCalls: ToolCall[] = [];

    for (const block of response.content) {
      if (block.type === 'text') {
        textContent += block.text;
      } else if (block.type === 'thinking') {
        thinkingContent = (block as any).thinking;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          name: block.name,
          input: block.input as Record<string, unknown>,
        });
      }
    }

    return {
      content: textContent,
      thinking: thinkingContent,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        thinkingTokens: (response.usage as any).thinking_input_tokens,
      },
      model: this.model,
      provider: 'anthropic',
    };
  }

  async *stream(options: CompletionOptions): AsyncIterable<StreamChunk> {
    const result = await this.complete(options);
    if (result.thinking) {
      yield { type: 'thinking', content: result.thinking };
    }
    if (result.content) {
      yield { type: 'text', content: result.content };
    }
    for (const tc of result.toolCalls ?? []) {
      yield { type: 'tool_call', toolCall: tc };
    }
    yield { type: 'done' };
  }
}
