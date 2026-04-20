export interface AssessmentQuestion {
  id: string;
  question: string;
  purpose: 'current_level' | 'depth' | 'practical_experience';
  skillArea: string;
}

export interface SkillBankEntry {
  skillArea: string;
  skillCategory: 'engineering' | 'tools' | 'soft_skills' | 'domain' | 'ai_native';
  aliases: string[];  // alternative names for this skill area
  assessmentQuestions: AssessmentQuestion[];
  longevity: 'high' | 'medium' | 'low';
  aiRelationship: 'amplified' | 'replaced' | 'unaffected';
}

export const SKILL_BANK: SkillBankEntry[] = [
  {
    skillArea: 'System Design',
    skillCategory: 'engineering',
    aliases: ['system architecture', 'distributed systems design', 'high-level design'],
    longevity: 'high',
    aiRelationship: 'amplified',
    assessmentQuestions: [
      { id: 'sd-1', skillArea: 'System Design', purpose: 'current_level', question: 'Have you ever designed a system from scratch — even a side project? What did you build and what were the key trade-offs?' },
      { id: 'sd-2', skillArea: 'System Design', purpose: 'depth', question: 'What does CAP theorem mean to you, and when have you had to think about it (even informally)?' },
      { id: 'sd-3', skillArea: 'System Design', purpose: 'practical_experience', question: 'Have you worked with databases at scale, caching layers, or message queues? Which ones and in what context?' },
    ],
  },
  {
    skillArea: 'Data Structures & Algorithms',
    skillCategory: 'engineering',
    aliases: ['dsa', 'algorithms', 'leetcode', 'coding interviews', 'data structures'],
    longevity: 'high',
    aiRelationship: 'unaffected',
    assessmentQuestions: [
      { id: 'dsa-1', skillArea: 'Data Structures & Algorithms', purpose: 'current_level', question: 'How comfortable are you with common data structures — arrays, hash maps, trees, graphs? Which do you use in your daily work?' },
      { id: 'dsa-2', skillArea: 'Data Structures & Algorithms', purpose: 'depth', question: 'Have you solved algorithmic problems on LeetCode or similar platforms? What difficulty level are you at?' },
      { id: 'dsa-3', skillArea: 'Data Structures & Algorithms', purpose: 'practical_experience', question: 'Can you describe a time you had to think about time or space complexity in a real project?' },
    ],
  },
  {
    skillArea: 'React',
    skillCategory: 'engineering',
    aliases: ['react.js', 'reactjs', 'react development', 'react frontend'],
    longevity: 'medium',
    aiRelationship: 'amplified',
    assessmentQuestions: [
      { id: 'react-1', skillArea: 'React', purpose: 'current_level', question: 'Have you built anything with React? Describe the most complex UI component or feature you\'ve built.' },
      { id: 'react-2', skillArea: 'React', purpose: 'depth', question: 'How do you currently think about state management in React — what tools have you used (useState, Redux, Zustand, React Query)?' },
      { id: 'react-3', skillArea: 'React', purpose: 'practical_experience', question: 'Have you dealt with React performance issues? How did you debug and fix them?' },
    ],
  },
  {
    skillArea: 'Node.js',
    skillCategory: 'engineering',
    aliases: ['nodejs', 'node js', 'express', 'fastify', 'backend javascript'],
    longevity: 'high',
    aiRelationship: 'amplified',
    assessmentQuestions: [
      { id: 'node-1', skillArea: 'Node.js', purpose: 'current_level', question: 'What Node.js applications have you built? What frameworks do you use (Express, Fastify, NestJS)?' },
      { id: 'node-2', skillArea: 'Node.js', purpose: 'depth', question: 'How do you handle async operations in Node.js — callbacks, promises, or async/await? What problems have you hit?' },
      { id: 'node-3', skillArea: 'Node.js', purpose: 'practical_experience', question: 'Have you built production Node.js services? How did you handle error handling, logging, and deployment?' },
    ],
  },
  {
    skillArea: 'TypeScript',
    skillCategory: 'engineering',
    aliases: ['typescript', 'ts', 'typed javascript'],
    longevity: 'high',
    aiRelationship: 'amplified',
    assessmentQuestions: [
      { id: 'ts-1', skillArea: 'TypeScript', purpose: 'current_level', question: 'How extensively do you use TypeScript? Are you comfortable with generics and utility types?' },
      { id: 'ts-2', skillArea: 'TypeScript', purpose: 'depth', question: 'Have you ever had to fight the TypeScript compiler? What was the situation and how did you resolve it?' },
    ],
  },
  {
    skillArea: 'Databases & Storage',
    skillCategory: 'engineering',
    aliases: ['databases', 'sql', 'postgresql', 'mysql', 'nosql', 'mongodb', 'database design'],
    longevity: 'high',
    aiRelationship: 'amplified',
    assessmentQuestions: [
      { id: 'db-1', skillArea: 'Databases & Storage', purpose: 'current_level', question: 'What databases have you worked with — SQL or NoSQL? What was the most complex query or schema you designed?' },
      { id: 'db-2', skillArea: 'Databases & Storage', purpose: 'depth', question: 'Have you ever optimized a slow query? What was your process — did you look at query plans, add indexes?' },
      { id: 'db-3', skillArea: 'Databases & Storage', purpose: 'practical_experience', question: 'Have you had to think about database scaling — read replicas, connection pooling, sharding?' },
    ],
  },
  {
    skillArea: 'LLM APIs & Prompting',
    skillCategory: 'ai_native',
    aliases: ['openai', 'anthropic', 'claude', 'gpt', 'prompt engineering', 'llm apis', 'llm integration'],
    longevity: 'high',
    aiRelationship: 'amplified',
    assessmentQuestions: [
      { id: 'llm-1', skillArea: 'LLM APIs & Prompting', purpose: 'current_level', question: 'Have you built anything using LLM APIs (OpenAI, Anthropic, etc.)? What did you build?' },
      { id: 'llm-2', skillArea: 'LLM APIs & Prompting', purpose: 'depth', question: 'How do you approach prompt engineering — do you use system prompts, few-shot examples, structured outputs?' },
      { id: 'llm-3', skillArea: 'LLM APIs & Prompting', purpose: 'practical_experience', question: 'What\'s the most complex LLM integration you\'ve built or tried to build?' },
    ],
  },
  {
    skillArea: 'RAG & Embeddings',
    skillCategory: 'ai_native',
    aliases: ['rag', 'retrieval augmented generation', 'vector database', 'embeddings', 'semantic search'],
    longevity: 'high',
    aiRelationship: 'amplified',
    assessmentQuestions: [
      { id: 'rag-1', skillArea: 'RAG & Embeddings', purpose: 'current_level', question: 'Are you familiar with RAG (retrieval augmented generation)? Have you built a system that retrieves relevant context before sending to an LLM?' },
      { id: 'rag-2', skillArea: 'RAG & Embeddings', purpose: 'depth', question: 'Have you worked with vector databases (Pinecone, Weaviate, pgvector)? What did you build?' },
    ],
  },
  {
    skillArea: 'AI Agent Patterns',
    skillCategory: 'ai_native',
    aliases: ['ai agents', 'agentic ai', 'llm agents', 'tool use', 'function calling'],
    longevity: 'high',
    aiRelationship: 'amplified',
    assessmentQuestions: [
      { id: 'agent-1', skillArea: 'AI Agent Patterns', purpose: 'current_level', question: 'Have you built AI agents or systems that use tool calling / function calling? What did they do?' },
      { id: 'agent-2', skillArea: 'AI Agent Patterns', purpose: 'depth', question: 'How do you think about the difference between a single LLM call and an agentic loop?' },
    ],
  },
  {
    skillArea: 'Deployment & Infrastructure',
    skillCategory: 'tools',
    aliases: ['devops', 'ci/cd', 'docker', 'kubernetes', 'deployment', 'cloud', 'aws', 'gcp', 'vercel', 'railway'],
    longevity: 'high',
    aiRelationship: 'amplified',
    assessmentQuestions: [
      { id: 'deploy-1', skillArea: 'Deployment & Infrastructure', purpose: 'current_level', question: 'How do you currently deploy your projects? What services or tools do you use?' },
      { id: 'deploy-2', skillArea: 'Deployment & Infrastructure', purpose: 'depth', question: 'Have you set up CI/CD pipelines? What did they do and what triggered them?' },
      { id: 'deploy-3', skillArea: 'Deployment & Infrastructure', purpose: 'practical_experience', question: 'Have you worked with Docker or containers? What about cloud services like AWS or GCP?' },
    ],
  },
  {
    skillArea: 'Technical Leadership',
    skillCategory: 'soft_skills',
    aliases: ['leadership', 'tech lead', 'engineering leadership', 'team lead', 'mentoring'],
    longevity: 'high',
    aiRelationship: 'amplified',
    assessmentQuestions: [
      { id: 'lead-1', skillArea: 'Technical Leadership', purpose: 'current_level', question: 'Have you led any technical projects — even informally? What was your role in driving the work?' },
      { id: 'lead-2', skillArea: 'Technical Leadership', purpose: 'depth', question: 'Have you mentored or helped a junior engineer? What was your approach?' },
    ],
  },
  {
    skillArea: 'Programming Fundamentals',
    skillCategory: 'engineering',
    aliases: ['coding basics', 'programming basics', 'python', 'javascript basics', 'oop'],
    longevity: 'high',
    aiRelationship: 'amplified',
    assessmentQuestions: [
      { id: 'prog-1', skillArea: 'Programming Fundamentals', purpose: 'current_level', question: 'What languages do you code in day-to-day? How would you rate your comfort level?' },
      { id: 'prog-2', skillArea: 'Programming Fundamentals', purpose: 'depth', question: 'Are you comfortable with OOP concepts — classes, inheritance, interfaces? Can you give an example from your work?' },
      { id: 'prog-3', skillArea: 'Programming Fundamentals', purpose: 'practical_experience', question: 'Have you built something end-to-end that\'s deployed and used by real people?' },
    ],
  },
];
