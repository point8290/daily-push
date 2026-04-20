// ─── LLM Abstraction Layer ───────────────────────────────────────────────────
// The pipeline never imports Anthropic/OpenAI directly.
// It only speaks this interface.

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>; // JSON Schema object
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface CompletionOptions {
  messages: Message[];
  system?: string;
  tools?: Tool[];
  temperature?: number;
  maxTokens?: number;
  // Extended thinking — only respected if provider.supportsThinking() is true
  thinking?: boolean;
  thinkingBudget?: number;
}

export interface CompletionResult {
  content: string;
  toolCalls?: ToolCall[];
  thinking?: string; // reasoning trace, if provider supports it
  usage: {
    inputTokens: number;
    outputTokens: number;
    thinkingTokens?: number;
  };
  model: string;
  provider: string;
}

export interface StreamChunk {
  type: 'text' | 'tool_call' | 'thinking' | 'done';
  content?: string;
  toolCall?: ToolCall;
}

// The single interface every provider must implement
export interface LLMProvider {
  complete(options: CompletionOptions): Promise<CompletionResult>;
  stream(options: CompletionOptions): AsyncIterable<StreamChunk>;
  supportsThinking(): boolean;
  supportsTools(): boolean;
  name(): string; // e.g. "anthropic/claude-opus-4-6"
}

// Pipeline roles — each maps to a configured provider
export type PipelineRole =
  | 'decomposition'    // prerequisite graph inference — needs best reasoning
  | 'critique'         // pedagogical review — ideally different model than generator
  | 'classification'   // intent parsing, boundary detection — cheaper
  | 'patch'            // surgical graph fixes — structured output
  | 'answer_eval'      // quiz evaluation — fast, high volume
  | 'resource_scoring'; // does this URL cover this concept — fast, high volume

export interface ProviderConfig {
  provider: 'anthropic' | 'openai' | 'google' | 'ollama';
  model: string;
  baseUrl?: string;  // used by ollama to override OLLAMA_BASE_URL
}

export type RouterConfig = Record<PipelineRole, ProviderConfig>;
