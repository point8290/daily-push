import { SkillGap, LearningTopic } from '../../services/intake';

export interface GoalProfileDoc {
  profileId: string;
  title: string;
  goalType: 'career' | 'project' | 'skill' | 'transition' | 'survival' | 'certification' | 'identity';
  archetype: string;
  signals: string[];                  // keywords matched against raw input
  requiredSkillAreas: string[];
  typicalSkillGaps: SkillGap[];
  typicalTopics: LearningTopic[];
  timelineData: { minsPerDay: number; weeks: number }[];
}

export const GOAL_PROFILES: GoalProfileDoc[] = [
  // ─── 1. Senior Backend SWE Job ────────────────────────────────────────────
  {
    profileId: 'senior-backend-swe',
    title: 'Get a senior backend engineering job',
    goalType: 'career',
    archetype: 'Job Switcher',
    signals: [
      'senior backend', 'senior engineer', 'senior swe', 'senior software engineer',
      'backend job', 'backend role', 'product company', 'startup job',
      'system design interview', 'faang', 'big tech', 'tech job', 'software job',
      'node.js job', 'python job', 'backend position',
    ],
    requiredSkillAreas: ['System Design', 'Data Structures & Algorithms', 'Node.js', 'Databases', 'AI Tooling'],
    typicalSkillGaps: [
      { skillArea: 'System Design', skillCategory: 'engineering', currentLevel: 'aware', requiredLevel: 'proficient', priority: 1, priorityReason: 'Core requirement for senior roles — tested in every interview', longevity: 'high', aiRelationship: 'amplified', identifiedBy: 'system_inferred' },
      { skillArea: 'Data Structures & Algorithms', skillCategory: 'engineering', currentLevel: 'familiar', requiredLevel: 'proficient', priority: 2, priorityReason: 'Leetcode-style problems are standard in backend interviews', longevity: 'high', aiRelationship: 'unaffected', identifiedBy: 'system_inferred' },
      { skillArea: 'Databases & Storage', skillCategory: 'engineering', currentLevel: 'familiar', requiredLevel: 'proficient', priority: 3, priorityReason: 'Senior backend engineers own data modeling and query optimization', longevity: 'high', aiRelationship: 'amplified', identifiedBy: 'system_inferred' },
      { skillArea: 'API Design & REST', skillCategory: 'engineering', currentLevel: 'proficient', requiredLevel: 'expert', priority: 4, priorityReason: 'Must be able to design scalable, versioned APIs without guidance', longevity: 'high', aiRelationship: 'amplified', identifiedBy: 'system_inferred' },
      { skillArea: 'AI Tooling for Engineers', skillCategory: 'ai_native', currentLevel: 'aware', requiredLevel: 'familiar', priority: 5, priorityReason: 'Increasingly expected — differentiates candidates at product companies', longevity: 'high', aiRelationship: 'amplified', identifiedBy: 'system_inferred' },
    ],
    typicalTopics: [
      { title: 'System Design for Backend Engineers', skillGapArea: 'System Design', rationale: 'Covers the exact concepts tested at senior interviews: scalability, caching, queues, database design.', estimatedWeeks: 6, priority: 1 },
      { title: 'Algorithms & Problem Solving', skillGapArea: 'Data Structures & Algorithms', rationale: 'Pattern-based approach to Leetcode — arrays, trees, graphs, DP. Not memorization but pattern recognition.', estimatedWeeks: 5, priority: 2 },
      { title: 'Databases in Depth', skillGapArea: 'Databases & Storage', rationale: 'SQL query optimization, indexing, transactions, and when to use NoSQL.', estimatedWeeks: 3, priority: 3 },
      { title: 'API Design Patterns', skillGapArea: 'API Design & REST', rationale: 'REST best practices, versioning, auth patterns, rate limiting — what senior engineers are expected to own.', estimatedWeeks: 2, priority: 4 },
    ],
    timelineData: [
      { minsPerDay: 30, weeks: 28 },
      { minsPerDay: 45, weeks: 20 },
      { minsPerDay: 60, weeks: 16 },
      { minsPerDay: 90, weeks: 12 },
    ],
  },

  // ─── 2. Senior Fullstack Job ───────────────────────────────────────────────
  {
    profileId: 'senior-fullstack-swe',
    title: 'Get a senior fullstack engineering job',
    goalType: 'career',
    archetype: 'Job Switcher',
    signals: [
      'senior fullstack', 'full stack job', 'full-stack engineer', 'fullstack role',
      'frontend and backend', 'react and node', 'react job', 'typescript job',
      'fullstack position', 'web developer job',
    ],
    requiredSkillAreas: ['System Design', 'React', 'TypeScript', 'Databases', 'Data Structures & Algorithms'],
    typicalSkillGaps: [
      { skillArea: 'System Design', skillCategory: 'engineering', currentLevel: 'aware', requiredLevel: 'proficient', priority: 1, priorityReason: 'Senior fullstack engineers must think end-to-end about system constraints', longevity: 'high', aiRelationship: 'amplified', identifiedBy: 'system_inferred' },
      { skillArea: 'React & State Management', skillCategory: 'engineering', currentLevel: 'familiar', requiredLevel: 'proficient', priority: 2, priorityReason: 'Expected to own complex UI architecture and performance at senior level', longevity: 'medium', aiRelationship: 'amplified', identifiedBy: 'system_inferred' },
      { skillArea: 'TypeScript', skillCategory: 'engineering', currentLevel: 'familiar', requiredLevel: 'proficient', priority: 3, priorityReason: 'Industry standard — fullstack senior roles expect deep TS fluency', longevity: 'high', aiRelationship: 'amplified', identifiedBy: 'system_inferred' },
      { skillArea: 'Data Structures & Algorithms', skillCategory: 'engineering', currentLevel: 'aware', requiredLevel: 'familiar', priority: 4, priorityReason: 'Coding interviews at product companies include algorithmic questions', longevity: 'high', aiRelationship: 'unaffected', identifiedBy: 'system_inferred' },
    ],
    typicalTopics: [
      { title: 'System Design for Web Engineers', skillGapArea: 'System Design', rationale: 'Focus on web-centric systems: CDNs, caching, real-time, auth flows.', estimatedWeeks: 5, priority: 1 },
      { title: 'Advanced React Patterns', skillGapArea: 'React & State Management', rationale: 'Performance, composition patterns, state machines, server components.', estimatedWeeks: 4, priority: 2 },
      { title: 'TypeScript in Depth', skillGapArea: 'TypeScript', rationale: 'Generics, utility types, advanced patterns used in production codebases.', estimatedWeeks: 3, priority: 3 },
      { title: 'Algorithms for Web Engineers', skillGapArea: 'Data Structures & Algorithms', rationale: 'Core patterns (arrays, trees, hash maps) with web/API-relevant problems.', estimatedWeeks: 4, priority: 4 },
    ],
    timelineData: [
      { minsPerDay: 30, weeks: 24 },
      { minsPerDay: 45, weeks: 18 },
      { minsPerDay: 60, weeks: 14 },
      { minsPerDay: 90, weeks: 10 },
    ],
  },

  // ─── 3. FAANG System Design ────────────────────────────────────────────────
  {
    profileId: 'faang-system-design',
    title: 'Crack FAANG system design interviews',
    goalType: 'career',
    archetype: 'Job Switcher / Promotion Seeker',
    signals: [
      'faang', 'big tech', 'google', 'amazon', 'meta', 'microsoft', 'apple',
      'system design interview', 'design interview', 'crack interview',
      'distributed systems', 'scalability interview', 'senior interview',
    ],
    requiredSkillAreas: ['Distributed Systems', 'Databases & Storage', 'Caching', 'Message Queues', 'System Design'],
    typicalSkillGaps: [
      { skillArea: 'Distributed Systems', skillCategory: 'engineering', currentLevel: 'aware', requiredLevel: 'proficient', priority: 1, priorityReason: 'Core of every FAANG system design round', longevity: 'high', aiRelationship: 'amplified', identifiedBy: 'system_inferred' },
      { skillArea: 'Database Internals', skillCategory: 'engineering', currentLevel: 'familiar', requiredLevel: 'proficient', priority: 2, priorityReason: 'Expected to choose and justify storage decisions under load', longevity: 'high', aiRelationship: 'amplified', identifiedBy: 'system_inferred' },
      { skillArea: 'Caching Strategies', skillCategory: 'engineering', currentLevel: 'aware', requiredLevel: 'proficient', priority: 3, priorityReason: 'Cache design (Redis, CDN, write-through vs write-behind) is always asked', longevity: 'high', aiRelationship: 'amplified', identifiedBy: 'system_inferred' },
      { skillArea: 'Message Queues & Event Systems', skillCategory: 'engineering', currentLevel: 'aware', requiredLevel: 'familiar', priority: 4, priorityReason: 'Kafka, SQS patterns come up in feed, notification, and processing systems', longevity: 'high', aiRelationship: 'amplified', identifiedBy: 'system_inferred' },
    ],
    typicalTopics: [
      { title: 'Distributed Systems Fundamentals', skillGapArea: 'Distributed Systems', rationale: 'CAP theorem, consistency models, consensus, partitioning — the theory behind every design decision.', estimatedWeeks: 4, priority: 1 },
      { title: 'Databases Under the Hood', skillGapArea: 'Database Internals', rationale: 'B-trees, LSM trees, replication, sharding — how databases actually work.', estimatedWeeks: 3, priority: 2 },
      { title: 'Caching & Performance', skillGapArea: 'Caching Strategies', rationale: 'Write patterns, eviction policies, CDN layers, cache invalidation.', estimatedWeeks: 2, priority: 3 },
      { title: 'Event-Driven Architecture', skillGapArea: 'Message Queues & Event Systems', rationale: 'Kafka, queues, pub/sub — design patterns for async systems at scale.', estimatedWeeks: 2, priority: 4 },
    ],
    timelineData: [
      { minsPerDay: 30, weeks: 20 },
      { minsPerDay: 45, weeks: 14 },
      { minsPerDay: 60, weeks: 12 },
      { minsPerDay: 90, weeks: 8 },
    ],
  },

  // ─── 4. Get Promoted to Senior ────────────────────────────────────────────
  {
    profileId: 'get-promoted-senior',
    title: 'Get promoted to senior engineer',
    goalType: 'career',
    archetype: 'Promotion Seeker',
    signals: [
      'get promoted', 'promotion', 'senior level', 'level up', 'promo packet',
      'principal', 'tech lead', 'staff engineer', 'become senior',
      'currently mid', 'mid level', 'currently junior',
    ],
    requiredSkillAreas: ['System Design', 'Technical Leadership', 'Domain Depth', 'Communication'],
    typicalSkillGaps: [
      { skillArea: 'System Design', skillCategory: 'engineering', currentLevel: 'aware', requiredLevel: 'proficient', priority: 1, priorityReason: 'Seniors are expected to own architectural decisions, not just implement', longevity: 'high', aiRelationship: 'amplified', identifiedBy: 'system_inferred' },
      { skillArea: 'Technical Leadership', skillCategory: 'soft_skills', currentLevel: 'aware', requiredLevel: 'familiar', priority: 2, priorityReason: 'Promotion to senior requires demonstrating ownership and mentoring', longevity: 'high', aiRelationship: 'amplified', identifiedBy: 'system_inferred' },
      { skillArea: 'Code Review & Feedback', skillCategory: 'soft_skills', currentLevel: 'familiar', requiredLevel: 'proficient', priority: 3, priorityReason: 'Seniors drive code quality through review, not just their own code', longevity: 'high', aiRelationship: 'unaffected', identifiedBy: 'system_inferred' },
    ],
    typicalTopics: [
      { title: 'System Design for Working Engineers', skillGapArea: 'System Design', rationale: 'Practical patterns you apply at work — not interview prep, but real architecture thinking.', estimatedWeeks: 6, priority: 1 },
      { title: 'Engineering Leadership Fundamentals', skillGapArea: 'Technical Leadership', rationale: 'What senior engineers actually do: driving clarity, unblocking others, defining standards.', estimatedWeeks: 3, priority: 2 },
      { title: 'Effective Code Review', skillGapArea: 'Code Review & Feedback', rationale: 'How to review for correctness, maintainability, and team growth — not just bugs.', estimatedWeeks: 2, priority: 3 },
    ],
    timelineData: [
      { minsPerDay: 30, weeks: 28 },
      { minsPerDay: 45, weeks: 22 },
      { minsPerDay: 60, weeks: 18 },
      { minsPerDay: 90, weeks: 14 },
    ],
  },

  // ─── 5. Build & Ship an AI Product ────────────────────────────────────────
  {
    profileId: 'build-ai-product',
    title: 'Build and ship an AI product',
    goalType: 'project',
    archetype: 'Builder',
    signals: [
      'ai product', 'build with ai', 'ship ai', 'ai app', 'llm app',
      'side project ai', 'saas with ai', 'ai startup', 'build something with llm',
      'ai feature', 'chatbot', 'rag app', 'ai tool', 'ship something',
    ],
    requiredSkillAreas: ['LLM APIs', 'RAG & Embeddings', 'AI Agents', 'Deployment', 'Product Thinking'],
    typicalSkillGaps: [
      { skillArea: 'LLM APIs & Prompting', skillCategory: 'ai_native', currentLevel: 'aware', requiredLevel: 'proficient', priority: 1, priorityReason: 'Core skill for building any AI-powered feature', longevity: 'high', aiRelationship: 'amplified', identifiedBy: 'system_inferred' },
      { skillArea: 'RAG & Embeddings', skillCategory: 'ai_native', currentLevel: 'none', requiredLevel: 'familiar', priority: 2, priorityReason: 'Most AI products need retrieval over private data', longevity: 'high', aiRelationship: 'amplified', identifiedBy: 'system_inferred' },
      { skillArea: 'Deployment & Infrastructure', skillCategory: 'tools', currentLevel: 'familiar', requiredLevel: 'proficient', priority: 3, priorityReason: 'You need to ship — Vercel, Railway, or VPS with CI/CD', longevity: 'high', aiRelationship: 'amplified', identifiedBy: 'system_inferred' },
      { skillArea: 'AI Agent Patterns', skillCategory: 'ai_native', currentLevel: 'none', requiredLevel: 'aware', priority: 4, priorityReason: 'Tool use, multi-step reasoning — increasingly the pattern for AI features', longevity: 'high', aiRelationship: 'amplified', identifiedBy: 'system_inferred' },
    ],
    typicalTopics: [
      { title: 'Building with LLM APIs', skillGapArea: 'LLM APIs & Prompting', rationale: 'Anthropic/OpenAI APIs, prompt engineering, structured outputs, streaming — the practical fundamentals.', estimatedWeeks: 3, priority: 1 },
      { title: 'RAG Systems from Scratch', skillGapArea: 'RAG & Embeddings', rationale: 'Vector DBs, chunking, retrieval pipelines — how to give your LLM app access to your own data.', estimatedWeeks: 3, priority: 2 },
      { title: 'Shipping Web Apps', skillGapArea: 'Deployment & Infrastructure', rationale: 'CI/CD, environment configs, monitoring basics — everything between local dev and live users.', estimatedWeeks: 2, priority: 3 },
      { title: 'AI Agent Fundamentals', skillGapArea: 'AI Agent Patterns', rationale: 'Tool calling, planning loops, memory — the building blocks of autonomous AI features.', estimatedWeeks: 2, priority: 4 },
    ],
    timelineData: [
      { minsPerDay: 30, weeks: 18 },
      { minsPerDay: 45, weeks: 13 },
      { minsPerDay: 60, weeks: 10 },
      { minsPerDay: 90, weeks: 7 },
    ],
  },

  // ─── 6. Become an AI/LLM Engineer ─────────────────────────────────────────
  {
    profileId: 'ai-llm-engineer',
    title: 'Become an AI/LLM engineer',
    goalType: 'career',
    archetype: 'Specializer',
    signals: [
      'ai engineer', 'llm engineer', 'machine learning engineer', 'ml engineer',
      'ai ml', 'become ai', 'specialize in ai', 'ai specialist',
      'llm', 'large language model', 'fine-tuning', 'evals', 'evaluation',
      'rag', 'retrieval augmented', 'ai infrastructure', 'mlops',
    ],
    requiredSkillAreas: ['LLM Fundamentals', 'RAG & Embeddings', 'AI Agents', 'Evals & Testing', 'Fine-tuning'],
    typicalSkillGaps: [
      { skillArea: 'LLM Fundamentals', skillCategory: 'ai_native', currentLevel: 'aware', requiredLevel: 'proficient', priority: 1, priorityReason: 'Must understand how LLMs work to engineer them effectively', longevity: 'high', aiRelationship: 'amplified', identifiedBy: 'system_inferred' },
      { skillArea: 'RAG & Vector Search', skillCategory: 'ai_native', currentLevel: 'aware', requiredLevel: 'proficient', priority: 2, priorityReason: 'Most production AI systems use retrieval — core skill', longevity: 'high', aiRelationship: 'amplified', identifiedBy: 'system_inferred' },
      { skillArea: 'AI Evals & Quality', skillCategory: 'ai_native', currentLevel: 'none', requiredLevel: 'familiar', priority: 3, priorityReason: 'Measuring and improving LLM output quality is a key differentiator', longevity: 'high', aiRelationship: 'amplified', identifiedBy: 'system_inferred' },
      { skillArea: 'Agent Architecture', skillCategory: 'ai_native', currentLevel: 'aware', requiredLevel: 'proficient', priority: 4, priorityReason: 'Agentic systems are the frontier of AI engineering', longevity: 'high', aiRelationship: 'amplified', identifiedBy: 'system_inferred' },
      { skillArea: 'Fine-tuning & Adaptation', skillCategory: 'ai_native', currentLevel: 'none', requiredLevel: 'familiar', priority: 5, priorityReason: 'Domain-specific tuning separates commodity AI users from AI engineers', longevity: 'high', aiRelationship: 'amplified', identifiedBy: 'system_inferred' },
    ],
    typicalTopics: [
      { title: 'How LLMs Work', skillGapArea: 'LLM Fundamentals', rationale: 'Transformers, attention, tokenization, context windows — the concepts behind every LLM decision.', estimatedWeeks: 3, priority: 1 },
      { title: 'Production RAG Systems', skillGapArea: 'RAG & Vector Search', rationale: 'Embeddings, vector DBs, chunking strategies, hybrid search — how real RAG pipelines work.', estimatedWeeks: 4, priority: 2 },
      { title: 'AI Agent Engineering', skillGapArea: 'Agent Architecture', rationale: 'Tool use, planning, memory, multi-agent — building systems that act, not just respond.', estimatedWeeks: 4, priority: 3 },
      { title: 'LLM Evaluation Frameworks', skillGapArea: 'AI Evals & Quality', rationale: 'How to measure, monitor, and improve LLM outputs systematically.', estimatedWeeks: 2, priority: 4 },
    ],
    timelineData: [
      { minsPerDay: 30, weeks: 24 },
      { minsPerDay: 45, weeks: 18 },
      { minsPerDay: 60, weeks: 14 },
      { minsPerDay: 90, weeks: 10 },
    ],
  },

  // ─── 7. Master System Design ───────────────────────────────────────────────
  {
    profileId: 'master-system-design',
    title: 'Master system design',
    goalType: 'skill',
    archetype: 'Specializer',
    signals: [
      'system design', 'learn system design', 'master system design',
      'scalable systems', 'distributed systems', 'architecture',
      'design patterns', 'microservices', 'high availability',
    ],
    requiredSkillAreas: ['Distributed Systems', 'Databases', 'Caching', 'Load Balancing', 'Message Queues'],
    typicalSkillGaps: [
      { skillArea: 'Distributed Systems', skillCategory: 'engineering', currentLevel: 'aware', requiredLevel: 'proficient', priority: 1, priorityReason: 'Foundation of all system design — everything else builds on this', longevity: 'high', aiRelationship: 'amplified', identifiedBy: 'system_inferred' },
      { skillArea: 'Data Storage & Modeling', skillCategory: 'engineering', currentLevel: 'familiar', requiredLevel: 'expert', priority: 2, priorityReason: 'Data design is where most system failures originate', longevity: 'high', aiRelationship: 'amplified', identifiedBy: 'system_inferred' },
      { skillArea: 'Reliability & Resilience', skillCategory: 'engineering', currentLevel: 'aware', requiredLevel: 'proficient', priority: 3, priorityReason: 'Circuit breakers, retries, idempotency — real systems need these', longevity: 'high', aiRelationship: 'amplified', identifiedBy: 'system_inferred' },
    ],
    typicalTopics: [
      { title: 'Distributed Systems Core', skillGapArea: 'Distributed Systems', rationale: 'CAP, eventual consistency, leader election, partition tolerance — the vocabulary of system design.', estimatedWeeks: 4, priority: 1 },
      { title: 'Data Layer Design', skillGapArea: 'Data Storage & Modeling', rationale: 'SQL vs NoSQL trade-offs, schema design, indexing, replication, sharding patterns.', estimatedWeeks: 3, priority: 2 },
      { title: 'Building Reliable Systems', skillGapArea: 'Reliability & Resilience', rationale: 'Failure modes, graceful degradation, SLOs, and the patterns that keep systems alive.', estimatedWeeks: 3, priority: 3 },
    ],
    timelineData: [
      { minsPerDay: 30, weeks: 18 },
      { minsPerDay: 45, weeks: 13 },
      { minsPerDay: 60, weeks: 10 },
      { minsPerDay: 90, weeks: 7 },
    ],
  },

  // ─── 8. Backend to Fullstack ───────────────────────────────────────────────
  {
    profileId: 'backend-to-fullstack',
    title: 'Go from backend to fullstack',
    goalType: 'transition',
    archetype: 'Transition',
    signals: [
      'learn frontend', 'learn react', 'backend to fullstack', 'backend dev learn frontend',
      'add frontend skills', 'css', 'ui development', 'web frontend',
      'currently backend', 'only know backend', 'learn javascript frontend',
    ],
    requiredSkillAreas: ['React', 'CSS & Styling', 'State Management', 'TypeScript', 'Frontend Tooling'],
    typicalSkillGaps: [
      { skillArea: 'React', skillCategory: 'engineering', currentLevel: 'none', requiredLevel: 'proficient', priority: 1, priorityReason: 'React is the dominant frontend library — unavoidable for fullstack work', longevity: 'medium', aiRelationship: 'amplified', identifiedBy: 'system_inferred' },
      { skillArea: 'CSS & UI Layout', skillCategory: 'engineering', currentLevel: 'aware', requiredLevel: 'familiar', priority: 2, priorityReason: 'Backend devs typically underestimate CSS — you need enough to build real UIs', longevity: 'medium', aiRelationship: 'amplified', identifiedBy: 'system_inferred' },
      { skillArea: 'State Management', skillCategory: 'engineering', currentLevel: 'none', requiredLevel: 'familiar', priority: 3, priorityReason: 'Managing data in the browser is fundamentally different from server-side', longevity: 'medium', aiRelationship: 'amplified', identifiedBy: 'system_inferred' },
      { skillArea: 'Frontend Build Tooling', skillCategory: 'tools', currentLevel: 'none', requiredLevel: 'familiar', priority: 4, priorityReason: 'Vite, bundlers, TypeScript config — the scaffolding that makes frontend work', longevity: 'medium', aiRelationship: 'amplified', identifiedBy: 'system_inferred' },
    ],
    typicalTopics: [
      { title: 'React from First Principles', skillGapArea: 'React', rationale: 'Components, hooks, data flow — the mental model a backend dev needs to build UIs confidently.', estimatedWeeks: 5, priority: 1 },
      { title: 'CSS & Responsive Layouts', skillGapArea: 'CSS & UI Layout', rationale: 'Flexbox, Grid, Tailwind — practical CSS to build real interfaces without fighting the box model.', estimatedWeeks: 2, priority: 2 },
      { title: 'Frontend State & Data Fetching', skillGapArea: 'State Management', rationale: 'useState, useReducer, React Query — how to manage async data the way the frontend ecosystem does it.', estimatedWeeks: 3, priority: 3 },
    ],
    timelineData: [
      { minsPerDay: 30, weeks: 20 },
      { minsPerDay: 45, weeks: 15 },
      { minsPerDay: 60, weeks: 12 },
      { minsPerDay: 90, weeks: 8 },
    ],
  },

  // ─── 9. Survive AI-Era Engineering ────────────────────────────────────────
  {
    profileId: 'ai-era-survival',
    title: 'Survive and thrive in AI-era engineering',
    goalType: 'survival',
    archetype: 'Survivor',
    signals: [
      'ai replacing', 'replaced by ai', 'stay relevant', 'keep up with ai',
      'survive ai', 'not get replaced', 'ai disruption', 'ai changing jobs',
      'future proof', 'ai skills', 'work with ai', 'ai native', 'use ai at work',
      'scared of ai', 'worried about ai', 'copilot', 'cursor', 'claude code',
    ],
    requiredSkillAreas: ['AI-Native Workflows', 'High-Leverage Engineering', 'System Thinking', 'Judgment & Taste'],
    typicalSkillGaps: [
      { skillArea: 'AI-Native Development', skillCategory: 'ai_native', currentLevel: 'aware', requiredLevel: 'proficient', priority: 1, priorityReason: 'Using AI tools to 10x output is the baseline for staying competitive', longevity: 'high', aiRelationship: 'amplified', identifiedBy: 'system_inferred' },
      { skillArea: 'System Thinking', skillCategory: 'engineering', currentLevel: 'familiar', requiredLevel: 'proficient', priority: 2, priorityReason: 'AI writes code; engineers who see the whole system remain irreplaceable', longevity: 'high', aiRelationship: 'amplified', identifiedBy: 'system_inferred' },
      { skillArea: 'High-Leverage Engineering Skills', skillCategory: 'engineering', currentLevel: 'familiar', requiredLevel: 'proficient', priority: 3, priorityReason: 'Architecture, debugging at scale, performance — the hard skills AI cannot replace', longevity: 'high', aiRelationship: 'amplified', identifiedBy: 'system_inferred' },
    ],
    typicalTopics: [
      { title: 'AI-Native Engineering Workflows', skillGapArea: 'AI-Native Development', rationale: 'Agentic coding, effective prompting, AI-assisted architecture review — the new baseline for engineers.', estimatedWeeks: 3, priority: 1 },
      { title: 'Systems Thinking for Engineers', skillGapArea: 'System Thinking', rationale: 'How to reason about complex systems, failure modes, and trade-offs — the judgment AI lacks.', estimatedWeeks: 4, priority: 2 },
      { title: 'High-Leverage Technical Skills', skillGapArea: 'High-Leverage Engineering Skills', rationale: 'Debugging, performance, observability — the skills that matter when AI-generated code breaks.', estimatedWeeks: 3, priority: 3 },
    ],
    timelineData: [
      { minsPerDay: 30, weeks: 14 },
      { minsPerDay: 45, weeks: 10 },
      { minsPerDay: 60, weeks: 8 },
      { minsPerDay: 90, weeks: 6 },
    ],
  },

  // ─── 10. QA to Engineering ────────────────────────────────────────────────
  {
    profileId: 'qa-to-engineering',
    title: 'Pivot from QA to software engineering',
    goalType: 'transition',
    archetype: 'Career Switcher',
    signals: [
      'qa to developer', 'qa to engineer', 'tester to developer', 'testing to coding',
      'switch from qa', 'career change from qa', 'from manual testing',
      'automation tester', 'sdet', 'from quality assurance',
      'learn to code', 'become a developer', 'software engineering career',
    ],
    requiredSkillAreas: ['Programming Fundamentals', 'APIs & HTTP', 'Databases', 'Version Control', 'Testing Automation'],
    typicalSkillGaps: [
      { skillArea: 'Programming Fundamentals', skillCategory: 'engineering', currentLevel: 'aware', requiredLevel: 'proficient', priority: 1, priorityReason: 'Core skill — QA engineers often know testing but not production-level code', longevity: 'high', aiRelationship: 'amplified', identifiedBy: 'system_inferred' },
      { skillArea: 'APIs & HTTP', skillCategory: 'engineering', currentLevel: 'familiar', requiredLevel: 'proficient', priority: 2, priorityReason: 'Building and consuming APIs is the core of most engineering roles', longevity: 'high', aiRelationship: 'amplified', identifiedBy: 'system_inferred' },
      { skillArea: 'Data Structures & Problem Solving', skillCategory: 'engineering', currentLevel: 'none', requiredLevel: 'familiar', priority: 3, priorityReason: 'Entry-level dev interviews require basic algorithmic thinking', longevity: 'high', aiRelationship: 'unaffected', identifiedBy: 'system_inferred' },
      { skillArea: 'Test Automation Engineering', skillCategory: 'tools', currentLevel: 'proficient', requiredLevel: 'expert', priority: 4, priorityReason: 'Your QA background is an asset — deepen it to differentiate as an SDET', longevity: 'high', aiRelationship: 'amplified', identifiedBy: 'system_inferred' },
    ],
    typicalTopics: [
      { title: 'Programming Fundamentals', skillGapArea: 'Programming Fundamentals', rationale: 'Data types, functions, OOP, error handling — the building blocks you need to write production code.', estimatedWeeks: 5, priority: 1 },
      { title: 'Building & Consuming APIs', skillGapArea: 'APIs & HTTP', rationale: 'REST, HTTP methods, authentication, request/response — from both sides of the API boundary.', estimatedWeeks: 3, priority: 2 },
      { title: 'Algorithmic Thinking', skillGapArea: 'Data Structures & Problem Solving', rationale: 'Arrays, objects, iteration patterns — enough to pass entry-level coding screens.', estimatedWeeks: 4, priority: 3 },
      { title: 'Advanced Test Automation', skillGapArea: 'Test Automation Engineering', rationale: 'Playwright, CI integration, test architecture — turn your QA expertise into an engineering superpower.', estimatedWeeks: 3, priority: 4 },
    ],
    timelineData: [
      { minsPerDay: 30, weeks: 26 },
      { minsPerDay: 45, weeks: 20 },
      { minsPerDay: 60, weeks: 16 },
      { minsPerDay: 90, weeks: 12 },
    ],
  },
];
