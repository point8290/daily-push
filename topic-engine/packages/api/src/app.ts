import Fastify from 'fastify';
import cors from '@fastify/cors';
import { z } from 'zod';
import { TopicEngine, DEFAULT_ROUTER_CONFIG } from '@topic-engine/core';
import type { PipelineRole, RouterConfig } from '@topic-engine/core';
import { RedisCache } from '@topic-engine/memory';

const ROLES: PipelineRole[] = [
  'decomposition', 'critique', 'patch', 'classification', 'answer_eval', 'resource_scoring',
];

function routerOverridesFromEnv(): Partial<RouterConfig> {
  const overrides: Partial<RouterConfig> = {};
  for (const role of ROLES) {
    const key      = role.toUpperCase();
    const provider = process.env[`TE_${key}_PROVIDER`] as RouterConfig[PipelineRole]['provider'] | undefined;
    const model    = process.env[`TE_${key}_MODEL`];
    const baseUrl  = process.env[`TE_${key}_BASE_URL`];
    if (provider || model || baseUrl) {
      overrides[role] = {
        provider: provider ?? DEFAULT_ROUTER_CONFIG[role].provider,
        model:    model    ?? DEFAULT_ROUTER_CONFIG[role].model,
        ...(baseUrl ? { baseUrl } : {}),
      };
    }
  }
  return overrides;
}
import { decomposeRoutes } from './routes/decompose';
import { topicsRoutes } from './routes/topics';
import { progressRoutes } from './routes/progress';

/**
 * Builds and returns the Fastify app instance.
 * Separated from server.ts so it can be tested without starting a real socket.
 */
export async function buildApp() {
  const app = Fastify({ logger: true });

  // ── CORS ──────────────────────────────────────────────────────────────────
  await app.register(cors, {
    origin: process.env.CORS_ORIGIN ?? '*',
  });

  // ── Engine (singleton — stateless, safe to share across requests) ─────────
  const engine = new TopicEngine(routerOverridesFromEnv(), new RedisCache());

  // ── Global error handler ──────────────────────────────────────────────────
  app.setErrorHandler((err, _req, reply) => {
    // Zod validation errors
    if (err instanceof z.ZodError) {
      return reply.status(422).send({
        error: 'Validation error',
        issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }

    app.log.error(err);

    // Surface a clean message without leaking internals
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    reply.status(status).send({
      error: status >= 500 ? 'Internal server error' : err.message,
    });
  });

  // ── Routes ─────────────────────────────────────────────────────────────────
  await app.register(decomposeRoutes, { engine });
  await app.register(topicsRoutes);
  await app.register(progressRoutes);

  // ── Health check ───────────────────────────────────────────────────────────
  app.get('/health', async () => ({ ok: true }));

  return app;
}
