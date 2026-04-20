import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { TopicEngine } from '@topic-engine/core';
import { lookupConceptsForTopic } from '@topic-engine/memory';
import { enqueueLibraryUpdate, enqueueResourceDiscovery } from '@topic-engine/workers';
import { saveGraph } from '../storage/graphStore';

// ─── Request schema ───────────────────────────────────────────────────────────

const DecomposeBodySchema = z.object({
  topic:    z.string().min(1).max(200),
  userInput: z.string().min(1).max(1000),
  userContext: z.object({
    level:       z.enum(['beginner', 'intermediate', 'advanced']).optional(),
    goal:        z.enum(['understand', 'gap_fill', 'interview_prep', 'deep_dive', 'teach']).optional(),
    specificGap: z.string().max(300).optional(),
    needsQuiz:   z.boolean().optional(),
  }).optional(),
  skipCritique:   z.boolean().optional(),
  skipConfidence: z.boolean().optional(),
});

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function decomposeRoutes(
  app: FastifyInstance,
  { engine }: { engine: TopicEngine }
): Promise<void> {

  /**
   * POST /topics/decompose
   * Run the full pipeline and persist the result.
   * Returns the RunResult + topicId UUID.
   */
  app.post('/topics/decompose', async (req, reply) => {
    const body = DecomposeBodySchema.parse(req.body);

    // Pre-decomp library lookup (L2) — fail-open if DB unavailable
    const libraryHints = await lookupConceptsForTopic(body.topic).catch(() => []);

    const result = await engine.run({
      topic:          body.topic,
      userInput:      body.userInput,
      userContext:    body.userContext,
      libraryHints,
      skipCritique:   body.skipCritique,
      skipConfidence: body.skipConfidence,
    });

    const topicId = await saveGraph(result, body.topic, body.userInput);

    // Dispatch async jobs — fire-and-forget, never block the response
    await Promise.allSettled([
      // Library write-back via BullMQ (replaces inline writeBackGraph)
      enqueueLibraryUpdate({ topicId, topicTitle: body.topic }),

      // Resource discovery: 1 job per non-out_of_scope node
      enqueueResourceDiscovery(
        result.graph.nodes
          .filter((n) => n.boundaryType !== 'out_of_scope')
          .map((n) => ({
            topicId,
            nodeId:          '',   // resolved by worker via topic_id + node_slug
            nodeSlug:        n.id,
            nodeTitle:       n.title,
            nodeDescription: n.description,
            depthLevel:      n.depthLevel,
          }))
      ),
    ]);

    reply.status(201).send({ topicId, ...result });
  });

  /**
   * POST /topics/decompose/stream
   * Same as /topics/decompose but streams progress as Server-Sent Events.
   *
   * Event stream format:
   *   event: stage\ndata: { stage, durationMs, ...extras }\n\n
   *   event: complete\ndata: { topicId, ...RunResult }\n\n
   *   event: error\ndata: { message }\n\n
   */
  app.post('/topics/decompose/stream', async (req, reply) => {
    const body = DecomposeBodySchema.parse(req.body);

    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
    reply.hijack(); // take control of the raw socket

    const write = (event: string, data: unknown) => {
      reply.raw.write(`event: ${event}\n`);
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const libraryHints = await lookupConceptsForTopic(body.topic).catch(() => []);

      const result = await engine.run({
        topic:          body.topic,
        userInput:      body.userInput,
        userContext:    body.userContext,
        libraryHints,
        skipCritique:   body.skipCritique,
        skipConfidence: body.skipConfidence,
        onStage:        (event) => write('stage', event),
      });

      const topicId = await saveGraph(result, body.topic, body.userInput);

      await Promise.allSettled([
        enqueueLibraryUpdate({ topicId, topicTitle: body.topic }),
        enqueueResourceDiscovery(
          result.graph.nodes
            .filter((n) => n.boundaryType !== 'out_of_scope')
            .map((n) => ({
              topicId,
              nodeId:          '',
              nodeSlug:        n.id,
              nodeTitle:       n.title,
              nodeDescription: n.description,
              depthLevel:      n.depthLevel,
            }))
        ),
      ]);

      write('complete', { topicId, ...result });
    } catch (err) {
      write('error', { message: (err as Error).message });
    } finally {
      reply.raw.end();
    }
  });
}
