import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

export const config = {
  postgres: {
    url: process.env.POSTGRES_URL || 'postgresql://daily_push_user:daily_push_pass@localhost:5434/daily_push_v2',
  },
  mongo: {
    url: process.env.MONGO_URL || 'mongodb://localhost:27018/daily_push_v2',
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
  },
  llm: {
    provider: (process.env.LLM_PROVIDER || 'anthropic') as 'anthropic' | 'ollama' | 'openai',
    model:    process.env.LLM_MODEL    || 'claude-sonnet-4-6',
    baseUrl:  process.env.LLM_BASE_URL || '',  // required for ollama, e.g. http://host:11434
  },
  resend: {
    apiKey: process.env.RESEND_API_KEY || '',
    fromEmail: process.env.FROM_EMAIL || 'daily-push@yourdomain.com',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
    expiresIn: '30d',
  },
  app: {
    port: parseInt(process.env.PORT || '3001', 10),
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
    nodeEnv: process.env.NODE_ENV || 'development',
    topicEngineUrl: process.env.TOPIC_ENGINE_URL || 'http://localhost:3000',
  },
};
