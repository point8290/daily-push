import OpenAI from "openai";
import type {
  LLMProvider,
  CompletionOptions,
  CompletionResult,
  StreamChunk,
  ToolCall,
} from "../types";

export class OpenAIProvider implements LLMProvider {
  private client: OpenAI;
  private model: string;

  constructor(model = "gpt-4o") {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not set");
    }
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.model = model;
  }

  name() {
    return `openai/${this.model}`;
  }

  supportsThinking() {
    // o1/o3 do chain-of-thought internally but no explicit thinking control
    return false;
  }

  supportsTools() {
    // o1 models have limited tool support; gpt-4o has full support
    return !this.model.startsWith("o1");
  }

  async complete(options: CompletionOptions): Promise<CompletionResult> {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

    // System prompt
    const systemText = [
      ...(options.system ? [options.system] : []),
      ...options.messages
        .filter((m) => m.role === "system")
        .map((m) => m.content),
    ].join("\n\n");

    if (systemText) {
      messages.push({ role: "system", content: systemText });
    }

    for (const m of options.messages.filter((m) => m.role !== "system")) {
      messages.push({
        role: m.role as "user" | "assistant",
        content: m.content,
      });
    }

    const params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
      model: this.model,
      messages,
    };

    if (options.maxTokens) params.max_tokens = options.maxTokens;
    if (options.temperature !== undefined && this.supportsTools()) {
      params.temperature = 1;
    }

    if (options.tools?.length && this.supportsTools()) {
      params.tools = options.tools.map((t) => ({
        type: "function" as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.inputSchema,
        },
      }));
    }

    const response = await this.client.chat.completions.create(params);
    const choice = response.choices[0];

    const toolCalls: ToolCall[] =
      choice.message.tool_calls?.map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        input: JSON.parse(tc.function.arguments) as Record<string, unknown>,
      })) ?? [];

    return {
      content: choice.message.content ?? "",
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      },
      model: this.model,
      provider: "openai",
    };
  }

  async *stream(options: CompletionOptions): AsyncIterable<StreamChunk> {
    const result = await this.complete(options);
    if (result.content) yield { type: "text", content: result.content };
    for (const tc of result.toolCalls ?? []) {
      yield { type: "tool_call", toolCall: tc };
    }
    yield { type: "done" };
  }
}
