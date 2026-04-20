import type { FastifyInstance } from 'fastify';
import { Queue } from 'bullmq';
import { loadGraph, loadAnalytics } from '../storage/graphStore';
import { query } from '@topic-engine/db';

function getBullMQConnection() {
  const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
  try {
    const parsed = new URL(url);
    return {
      host:     parsed.hostname || 'localhost',
      port:     parseInt(parsed.port || '6379', 10),
      password: parsed.password || undefined,
    };
  } catch {
    return { host: 'localhost', port: 6379 };
  }
}

const resourceDiscoveryQueue = new Queue('resource-discovery', {
  connection: getBullMQConnection(),
  defaultJobOptions: { removeOnComplete: { count: 500 }, removeOnFail: { count: 1000 } },
});

export async function topicsRoutes(app: FastifyInstance): Promise<void> {

  /**
   * GET /topics/:id
   * Returns the persisted graph + full RunResult for a topic.
   */
  app.get<{ Params: { id: string } }>('/topics/:id', async (req, reply) => {
    const stored = await loadGraph(req.params.id);
    if (!stored) {
      return reply.status(404).send({ error: 'Topic not found' });
    }
    reply.send(stored);
  });

  /**
   * GET /topics/:id/resources/status
   * Returns resource enrichment progress for a topic.
   * Used by Daily Push to poll background worker completion.
   */
  app.get<{ Params: { id: string } }>('/topics/:id/resources/status', async (req, reply) => {
    const rows = await query<{ nodes_total: string; nodes_with_resources: string }>(
      `SELECT
         COUNT(DISTINCT cn.id)::text        AS nodes_total,
         COUNT(DISTINCT nr.node_id)::text   AS nodes_with_resources
       FROM concept_nodes cn
       LEFT JOIN node_resources nr ON nr.node_id = cn.id
       WHERE cn.topic_id = $1
         AND cn.boundary_type != 'out_of_scope'`,
      [req.params.id]
    );
    if (!rows.length) {
      return reply.status(404).send({ error: 'Topic not found' });
    }
    const nodesTotal         = parseInt(rows[0].nodes_total, 10);
    const nodesWithResources = parseInt(rows[0].nodes_with_resources, 10);
    reply.send({
      nodesTotal,
      nodesWithResources,
      complete: nodesTotal > 0 && nodesWithResources >= nodesTotal,
    });
  });

  /**
   * GET /topics/:id/resources
   * Returns all scored resources for a topic, grouped by node_slug.
   * Used by Daily Push to display learning materials per concept node.
   */
  app.get<{ Params: { id: string } }>('/topics/:id/resources', async (req, reply) => {
    const rows = await query<{
      node_slug: string;
      canonical_title: string;
      url: string;
      resource_type: string;
      coverage_score: number;
      depth_match: number;
      quality_score: number;
    }>(
      `SELECT
         cn.node_slug,
         cn.canonical_title,
         nr.url,
         nr.resource_type,
         nr.coverage_score,
         nr.depth_match,
         nr.quality_score
       FROM concept_nodes cn
       JOIN node_resources nr ON nr.node_id = cn.id
       WHERE cn.topic_id = $1
         AND cn.boundary_type != 'out_of_scope'
       ORDER BY cn.node_slug, nr.quality_score DESC`,
      [req.params.id]
    );

    const grouped: Record<string, { canonicalTitle: string; resources: object[] }> = {};
    for (const row of rows) {
      if (!grouped[row.node_slug]) {
        grouped[row.node_slug] = { canonicalTitle: row.canonical_title, resources: [] };
      }
      grouped[row.node_slug].resources.push({
        url:           row.url,
        resourceType:  row.resource_type,
        coverageScore: row.coverage_score,
        depthMatch:    row.depth_match,
        qualityScore:  row.quality_score,
      });
    }

    reply.send(grouped);
  });

  /**
   * POST /topics/:id/resources/enqueue
   * Re-enqueues resource:discovery jobs for all non-out_of_scope nodes in a topic.
   * Idempotent — the worker upserts on (node_id, url) so re-running is safe.
   */
  app.post<{ Params: { id: string } }>('/topics/:id/resources/enqueue', async (req, reply) => {
    const topicId = req.params.id;

    const nodes = await query<{
      id: string;
      node_slug: string;
      canonical_title: string;
      description: string;
      depth_level: string;
    }>(
      `SELECT id, node_slug, canonical_title, description, depth_level
       FROM concept_nodes
       WHERE topic_id = $1 AND boundary_type != 'out_of_scope'`,
      [topicId]
    );

    if (!nodes.length) {
      return reply.status(404).send({ error: 'No nodes found for this topic' });
    }

    await resourceDiscoveryQueue.addBulk(
      nodes.map((n) => ({
        name: 'discover',
        data: {
          topicId,
          nodeId:          n.id,
          nodeSlug:        n.node_slug,
          nodeTitle:       n.canonical_title,
          nodeDescription: n.description ?? '',
          depthLevel:      n.depth_level,
        },
        opts: { attempts: 3, backoff: { type: 'exponential' as const, delay: 5_000 } },
      }))
    );

    reply.status(202).send({ enqueued: nodes.length });
  });

  /**
   * GET /topics/:id/paths?mode=fast|thorough
   * Returns the learning path for the specified mode.
   * Reads from the stored analytics — no recomputation needed.
   */
  app.get<{
    Params: { id: string };
    Querystring: { mode?: string };
  }>('/topics/:id/paths', async (req, reply) => {
    const analytics = await loadAnalytics(req.params.id);
    if (!analytics) {
      return reply.status(404).send({ error: 'Topic not found or topology not computed' });
    }

    const mode = req.query.mode === 'thorough' ? 'thorough' : 'fast';
    const path = mode === 'thorough' ? analytics.thoroughTrack : analytics.fastTrack;

    reply.send({ mode, path, criticalPath: analytics.criticalPath, criticalPathMins: analytics.criticalPathMins });
  });
}
