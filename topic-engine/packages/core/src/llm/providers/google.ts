import {
  GoogleGenerativeAI,
  SchemaType,
  type Content,
  type GenerateContentRequest,
  type FunctionDeclarationSchema,
  type Tool as GeminiTool,
  type Part,
} from '@google/generative-ai';
import type {
  LLMProvider,
  CompletionOptions,
  CompletionResult,
  StreamChunk,
  ToolCall,
} from '../types';

export class GoogleProvider implements LLMProvider {
  private client: GoogleGenerativeAI;
  private model: string;

  constructor(model = 'gemini-2.0-flash') {
    if (!process.env.GOOGLE_API_KEY) {
      throw new Error('GOOGLE_API_KEY is not set');
    }
    this.client = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
    this.model = model;
  }

  name() {
    return `google/${this.model}`;
  }

  supportsThinking() {
    // gemini-2.0-flash-thinking-exp supports reasoning — surface it via this flag
    return this.model.includes('thinking');
  }

  supportsTools() {
    return true;
  }

  async complete(options: CompletionOptions): Promise<CompletionResult> {
    // ── System prompt ─────────────────────────────────────────────────────────
    const systemParts = [
      ...(options.system ? [options.system] : []),
      ...options.messages.filter((m) => m.role === 'system').map((m) => m.content),
    ];
    // Gemini systemInstruction accepts a string directly
    const systemInstruction = systemParts.length > 0
      ? systemParts.join('\n\n')
      : undefined;

    // ── Message history ───────────────────────────────────────────────────────
    // Gemini uses 'user' / 'model' (not 'assistant')
    const contents: Content[] = options.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    // ── Tools ─────────────────────────────────────────────────────────────────
    let tools: GeminiTool[] | undefined;
    if (options.tools?.length) {
      tools = [{
        functionDeclarations: options.tools.map((t) => ({
          name:        t.name,
          description: t.description,
          // Cast — the caller is responsible for providing a valid JSON Schema object
          parameters:  t.inputSchema as unknown as FunctionDeclarationSchema,
        })),
      }];
    }

    // ── Generation config ─────────────────────────────────────────────────────
    const generationConfig: Record<string, unknown> = {};
    if (options.temperature !== undefined) generationConfig['temperature'] = options.temperature;
    if (options.maxTokens !== undefined)   generationConfig['maxOutputTokens'] = options.maxTokens;

    const generativeModel = this.client.getGenerativeModel({
      model: this.model,
      ...(systemInstruction ? { systemInstruction } : {}),
      ...(tools ? { tools } : {}),
      generationConfig,
    });

    const request: GenerateContentRequest = { contents };
    const response = await generativeModel.generateContent(request);
    const candidate = response.response.candidates?.[0];

    if (!candidate) {
      throw new Error(`GoogleProvider: no candidates returned from ${this.model}`);
    }

    // ── Parse response ────────────────────────────────────────────────────────
    let textContent = '';
    const toolCalls: ToolCall[] = [];

    for (const part of candidate.content.parts as Part[]) {
      if ('text' in part && part.text) {
        textContent += part.text;
      } else if ('functionCall' in part && part.functionCall) {
        toolCalls.push({
          id:    part.functionCall.name,   // Gemini has no call-id — use name
          name:  part.functionCall.name,
          input: part.functionCall.args as Record<string, unknown>,
        });
      }
    }

    const usage = response.response.usageMetadata;

    return {
      content: textContent,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: {
        inputTokens:  usage?.promptTokenCount  ?? 0,
        outputTokens: usage?.candidatesTokenCount ?? 0,
      },
      model:    this.model,
      provider: 'google',
    };
  }

  async *stream(options: CompletionOptions): AsyncIterable<StreamChunk> {
    const result = await this.complete(options);
    if (result.content) yield { type: 'text', content: result.content };
    for (const tc of result.toolCalls ?? []) {
      yield { type: 'tool_call', toolCall: tc };
    }
    yield { type: 'done' };
  }
}
