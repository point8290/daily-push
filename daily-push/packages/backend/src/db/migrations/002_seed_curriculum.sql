-- Only seed if topics table is empty
INSERT IGNORE INTO topics (id, title, description, status, position) VALUES
(1, 'LLM API Fundamentals', 'Learn to integrate and use Large Language Model APIs in real applications. Covers the Claude API, prompt engineering, tool use, streaming, and structured outputs.', 'active', 1),
(2, 'RAG Systems', 'Build Retrieval Augmented Generation pipelines — combine vector search with LLMs to create knowledge-aware applications.', 'pending', 2),
(3, 'AI Agents', 'Design and build autonomous AI agents that use tools, reason across multiple steps, and handle complex workflows.', 'pending', 3),
(4, 'Production AI Engineering', 'Ship AI features reliably: cost optimization, latency, observability, evals, and cloud deployment.', 'pending', 4),
(5, 'Advanced AI Patterns', 'Multi-agent systems, Model Context Protocol, AI security, and fine-tuning vs RAG decisions.', 'pending', 5);

-- Topic 1: LLM API Fundamentals
INSERT IGNORE INTO study_items (id, topic_id, title, description, resources, estimated_mins, position, status) VALUES
(1, 1, 'Claude API setup + your first completion',
 'Set up the Anthropic SDK in a Node.js/TypeScript project. Make your first API call, understand the message format, and learn how to handle the response. Focus on the Messages API and basic request/response structure.',
 '[{"label":"Anthropic Node SDK","url":"https://github.com/anthropics/anthropic-sdk-node","type":"repo"},{"label":"Messages API Docs","url":"https://docs.anthropic.com/en/api/messages","type":"docs"},{"label":"Getting Started Guide","url":"https://docs.anthropic.com/en/docs/quickstart","type":"docs"}]',
 25, 1, 'current'),

(2, 1, 'Prompt engineering patterns: few-shot and chain-of-thought',
 'Learn the core prompt engineering techniques: zero-shot, few-shot examples, and chain-of-thought reasoning. Understand how to structure system prompts vs user messages and when to use each pattern.',
 '[{"label":"Prompt Engineering Guide","url":"https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/overview","type":"docs"},{"label":"Chain-of-Thought Paper","url":"https://arxiv.org/abs/2201.11903","type":"article"},{"label":"Anthropic Prompt Library","url":"https://docs.anthropic.com/en/prompt-library/library","type":"docs"}]',
 30, 2, 'queued'),

(3, 1, 'Tool use / function calling',
 'Master Claude''s tool use feature — define tools with JSON schemas, handle tool_use blocks in responses, and return tool results. This is the foundation for building AI agents.',
 '[{"label":"Tool Use Docs","url":"https://docs.anthropic.com/en/docs/build-with-claude/tool-use","type":"docs"},{"label":"Tool Use Examples","url":"https://github.com/anthropics/anthropic-cookbook/tree/main/tool_use","type":"repo"}]',
 35, 3, 'queued'),

(4, 1, 'Streaming responses with SSE in Node.js',
 'Implement streaming AI responses using Server-Sent Events (SSE). Learn how to use the Anthropic streaming API, pipe the stream to an Express response, and consume it on the frontend with EventSource.',
 '[{"label":"Streaming Docs","url":"https://docs.anthropic.com/en/api/messages-streaming","type":"docs"},{"label":"SSE in Node.js","url":"https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events","type":"docs"}]',
 30, 4, 'queued'),

(5, 1, 'Structured outputs + JSON mode',
 'Learn to reliably extract structured JSON from Claude. Use system prompt instructions, prefill techniques, and response validation. This is critical for any production AI feature that feeds data into your app.',
 '[{"label":"Structured Output Guide","url":"https://docs.anthropic.com/en/docs/test-and-evaluate/strengthen-guardrails/increase-consistency","type":"docs"},{"label":"JSON Mode Cookbook","url":"https://github.com/anthropics/anthropic-cookbook/blob/main/misc/how_to_enable_json_mode.ipynb","type":"repo"}]',
 25, 5, 'queued');

-- Topic 2: RAG Systems
INSERT IGNORE INTO study_items (id, topic_id, title, description, resources, estimated_mins, position, status) VALUES
(6, 2, 'What are embeddings? — intuition and math',
 'Build a mental model of embeddings: how text becomes vectors, what semantic similarity means, and why cosine distance works. No ML background needed — focus on the intuition and practical implications.',
 '[{"label":"What are Embeddings?","url":"https://simonwillison.net/2023/Oct/23/embeddings/","type":"article"},{"label":"Embedding Models Overview","url":"https://docs.anthropic.com/en/docs/build-with-claude/embeddings","type":"docs"}]',
 20, 1, 'queued'),

(7, 2, 'Vector search with pgvector',
 'Set up pgvector extension in PostgreSQL (or use Supabase). Store embeddings, build an index, and write similarity search queries. Map this to your existing SQL knowledge — it''s just a new column type and distance operator.',
 '[{"label":"pgvector GitHub","url":"https://github.com/pgvector/pgvector","type":"repo"},{"label":"Supabase Vector Guide","url":"https://supabase.com/docs/guides/ai/vector-columns","type":"docs"}]',
 30, 2, 'queued'),

(8, 2, 'Document chunking strategies',
 'Learn why chunking matters for RAG quality. Compare fixed-size, sentence-boundary, and semantic chunking. Understand chunk overlap, metadata enrichment, and how chunk size affects retrieval precision.',
 '[{"label":"Chunking Strategies Guide","url":"https://www.pinecone.io/learn/chunking-strategies/","type":"article"},{"label":"LangChain Text Splitters","url":"https://python.langchain.com/docs/how_to/recursive_text_splitter/","type":"docs"}]',
 25, 3, 'queued'),

(9, 2, 'Building a RAG pipeline end-to-end',
 'Build a complete RAG system: ingest documents → chunk → embed → store in vector DB → retrieve relevant chunks → pass to Claude with the user query. Wire it up in Node.js from scratch.',
 '[{"label":"RAG from Scratch","url":"https://github.com/anthropics/anthropic-cookbook/tree/main/skills/retrieval_augmented_generation","type":"repo"},{"label":"RAG Best Practices","url":"https://www.anthropic.com/news/contextual-retrieval","type":"article"}]',
 45, 4, 'queued'),

(10, 2, 'Evaluating RAG quality',
 'Learn how to measure if your RAG system is working: retrieval precision/recall, answer faithfulness, and hallucination detection. Set up a simple eval loop you can run after changes.',
 '[{"label":"RAG Evaluation Guide","url":"https://docs.ragas.io/en/stable/","type":"docs"},{"label":"Anthropic Evals Cookbook","url":"https://github.com/anthropics/anthropic-cookbook/tree/main/skills/evaluation","type":"repo"}]',
 30, 5, 'queued');

-- Topic 3: AI Agents
INSERT IGNORE INTO study_items (id, topic_id, title, description, resources, estimated_mins, position, status) VALUES
(11, 3, 'Agents vs. chains — mental model',
 'Understand the difference between a fixed chain (deterministic sequence of LLM calls) and an agent (LLM decides what to do next). Learn the ReAct pattern and when to use agents vs. simpler approaches.',
 '[{"label":"Building Effective Agents","url":"https://www.anthropic.com/research/building-effective-agents","type":"article"},{"label":"ReAct Paper","url":"https://arxiv.org/abs/2210.03629","type":"article"}]',
 20, 1, 'queued'),

(12, 3, 'Designing tool schemas for Claude',
 'Write well-defined tool schemas that Claude uses effectively. Learn what makes a good tool description, how to handle optional vs required parameters, and how to design tools that are hard to misuse.',
 '[{"label":"Tool Use Best Practices","url":"https://docs.anthropic.com/en/docs/build-with-claude/tool-use/implement-tool-use","type":"docs"}]',
 30, 2, 'queued'),

(13, 3, 'Multi-step tool orchestration',
 'Build an agent that calls tools in sequence, handles tool errors, and knows when it has enough information to stop. Implement the agentic loop: send message → get tool_use → execute tool → send result → repeat.',
 '[{"label":"Agentic Loop Cookbook","url":"https://github.com/anthropics/anthropic-cookbook/blob/main/tool_use/automated_tool_use.ipynb","type":"repo"}]',
 40, 3, 'queued'),

(14, 3, 'Building a simple research agent',
 'Build an agent that takes a question, decides which tools to use (web search, calculator, etc.), executes them, and synthesizes a final answer. This is the canonical agent project.',
 '[{"label":"Claude Agent Examples","url":"https://github.com/anthropics/anthropic-cookbook/tree/main/tool_use","type":"repo"}]',
 45, 4, 'queued'),

(15, 3, 'Error handling + agent guardrails',
 'Learn how agents fail and how to prevent it: infinite loops, tool call errors, context window overflow, and prompt injection. Add timeout, retry, and max-steps logic to your agent loop.',
 '[{"label":"Anthropic Safety Guide","url":"https://docs.anthropic.com/en/docs/test-and-evaluate/strengthen-guardrails/reduce-hallucinations","type":"docs"}]',
 30, 5, 'queued');

-- Topic 4: Production AI Engineering
INSERT IGNORE INTO study_items (id, topic_id, title, description, resources, estimated_mins, position, status) VALUES
(16, 4, 'Prompt caching + cost optimization',
 'Learn Anthropic''s prompt caching feature — cache large system prompts to reduce cost by up to 90% on repeated calls. Understand token counting, pricing tiers, and strategies for minimizing API costs.',
 '[{"label":"Prompt Caching Docs","url":"https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching","type":"docs"},{"label":"Cost Optimization Guide","url":"https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching#best-practices-for-effective-caching","type":"docs"}]',
 25, 1, 'queued'),

(17, 4, 'Latency: streaming, parallelism, batching',
 'Techniques to make AI features feel fast: always stream responses to the UI, run independent LLM calls in parallel with Promise.all, use the Batch API for non-realtime workloads, and cache repeated queries.',
 '[{"label":"Batch API Docs","url":"https://docs.anthropic.com/en/docs/build-with-claude/batch-processing","type":"docs"},{"label":"Latency Optimization","url":"https://docs.anthropic.com/en/docs/build-with-claude/latency-performance","type":"docs"}]',
 30, 2, 'queued'),

(18, 4, 'AI observability — what to log and why',
 'Design logging for LLM applications: log inputs, outputs, token counts, latency, and errors. Learn why standard APM tools miss AI-specific issues and what tools like LangSmith or Helicone add.',
 '[{"label":"LLM Observability Guide","url":"https://www.helicone.ai/blog/llm-observability","type":"article"},{"label":"LangSmith Docs","url":"https://docs.smith.langchain.com/","type":"docs"}]',
 25, 3, 'queued'),

(19, 4, 'Eval frameworks: how to test LLM outputs',
 'Build a repeatable eval pipeline for your AI features. Learn LLM-as-judge, ground truth comparisons, and regression testing. This is the difference between shipping with confidence vs. hoping it works.',
 '[{"label":"Anthropic Evals Guide","url":"https://docs.anthropic.com/en/docs/test-and-evaluate/evals/overview","type":"docs"},{"label":"RAGAS Evals","url":"https://docs.ragas.io/en/stable/","type":"docs"}]',
 35, 4, 'queued'),

(20, 4, 'AWS Bedrock — deploy Claude on your existing infra',
 'Use AWS Bedrock to access Claude models within your existing AWS account. Leverage your IAM, VPC, and CloudWatch setup. Compare self-hosted vs direct API for security and compliance requirements.',
 '[{"label":"AWS Bedrock Docs","url":"https://docs.aws.amazon.com/bedrock/latest/userguide/what-is-bedrock.html","type":"docs"},{"label":"Bedrock Claude Guide","url":"https://docs.aws.amazon.com/bedrock/latest/userguide/claude-models.html","type":"docs"}]',
 40, 5, 'queued');

-- Topic 5: Advanced Patterns
INSERT IGNORE INTO study_items (id, topic_id, title, description, resources, estimated_mins, position, status) VALUES
(21, 5, 'Multi-agent systems — patterns and pitfalls',
 'Design systems where multiple AI agents collaborate: orchestrator-worker patterns, parallel agents, and handoffs. Learn where multi-agent adds value vs. complexity and how to debug them.',
 '[{"label":"Multi-Agent Patterns","url":"https://www.anthropic.com/research/building-effective-agents","type":"article"}]',
 30, 1, 'queued'),

(22, 5, 'MCP (Model Context Protocol) — build your own server',
 'MCP is the emerging standard for connecting AI models to external tools and data sources. Build an MCP server that exposes your own tools and connect it to Claude Desktop or Claude Code.',
 '[{"label":"MCP Official Docs","url":"https://modelcontextprotocol.io/introduction","type":"docs"},{"label":"MCP TypeScript SDK","url":"https://github.com/modelcontextprotocol/typescript-sdk","type":"repo"}]',
 35, 2, 'queued'),

(23, 5, 'Prompt injection and AI security',
 'Understand how prompt injection attacks work and how to defend against them. Learn input sanitization, output validation, privilege separation in agentic systems, and what Claude''s safety features cover vs. what you must handle.',
 '[{"label":"Prompt Injection Guide","url":"https://docs.anthropic.com/en/docs/test-and-evaluate/strengthen-guardrails/prompt-injection","type":"docs"},{"label":"OWASP LLM Top 10","url":"https://owasp.org/www-project-top-10-for-large-language-model-applications/","type":"docs"}]',
 25, 3, 'queued'),

(24, 5, 'Fine-tuning vs. RAG — when to use which',
 'Make the right architectural decision: fine-tuning changes model behaviour permanently; RAG gives it access to dynamic knowledge. Learn the cost, complexity, and performance trade-offs with real decision criteria.',
 '[{"label":"Fine-tuning vs RAG","url":"https://www.anthropic.com/news/fine-tuning-claude-3-haiku","type":"article"}]',
 20, 4, 'queued');

-- Seed default news interest tags
INSERT IGNORE INTO news_interests (tag) VALUES
('llm'), ('ai-engineering'), ('nodejs'), ('typescript'), ('react'),
('aws'), ('devops'), ('system-design'), ('open-source');
