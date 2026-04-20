import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { query } from '@topic-engine/db';
import { enqueueOutcomeObserver, enqueueBehaviorAnalyze } from '@topic-engine/workers';
import { resolveNodeId } from '../storage/graphStore';

// ─── Request schema ───────────────────────────────────────────────────────────

const ProgressBodySchema = z.object({
  userId:       z.string().min(1).max(200),
  nodeSlug:     z.string().min(1),       // kebab-case node ID from the graph
  eventType:    z.enum(['start', 'complete', 'skip', 'revisit', 'stuck']),
  learnerLevel: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
  context:      z.record(z.unknown()).optional(),
  outcome:      z.record(z.unknown()).optional(),
  weight:       z.number().min(0).max(10).optional(),
});

// ─── Route ────────────────────────────────────────────────────────────────────

export async function progressRoutes(app: FastifyInstance): Promise<void> {

  /**
   * POST /topics/:id/progress
   * Records a user behavior event for a node in this topic's graph.
   *
   * Resolves the nodeSlug → concept_nodes UUID, then inserts into
   * user_behavior_events. The L6 Bayesian updater (Phase 7) will
   * consume these events asynchronously.
   */
  app.post<{ Params: { id: string } }>('/topics/:id/progress', async (req, reply) => {
    const body = ProgressBodySchema.parse(req.body);

    const nodeId = await resolveNodeId(req.params.id, body.nodeSlug);
    if (!nodeId) {
      return reply.status(404).send({
        error: `Node "${body.nodeSlug}" not found in topic ${req.params.id}`,
      });
    }

    await query(
      `INSERT INTO user_behavior_events
         (user_id, node_id, event_type, learner_level, context, outcome, weight)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        body.userId,
        nodeId,
        body.eventType,
        body.learnerLevel ?? null,
        JSON.stringify(body.context ?? {}),
        body.outcome ? JSON.stringify(body.outcome) : null,
        body.weight ?? 1.0,
      ]
    );

    // skip → 48h delayed outcome:observer (L6 Bayesian updater)
    if (body.eventType === 'skip') {
      await enqueueOutcomeObserver({
        userId:       body.userId,
        topicId:      req.params.id,
        nodeId,
        nodeSlug:     body.nodeSlug,
        skippedAt:    new Date().toISOString(),
        learnerLevel: body.learnerLevel ?? null,
      }).catch((err: Error) => {
        app.log.warn({ err: err.message }, 'outcome:observer enqueue failed');
      });
    }

    // stuck / complete / revisit → immediate pattern analysis (L6 patterns 3-5)
    if (body.eventType === 'stuck' || body.eventType === 'complete' || body.eventType === 'revisit') {
      await enqueueBehaviorAnalyze({
        userId:       body.userId,
        nodeId,
        nodeSlug:     body.nodeSlug,
        topicId:      req.params.id,
        eventType:    body.eventType,
        learnerLevel: body.learnerLevel ?? null,
        context:      body.context ?? {},
      }).catch((err: Error) => {
        app.log.warn({ err: err.message }, 'behavior:analyze enqueue failed');
      });
    }

    reply.status(201).send({ recorded: true, nodeId });
  });
}
