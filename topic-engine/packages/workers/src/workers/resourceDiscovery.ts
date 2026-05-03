/**
 * resource:discovery worker — Phase 6 (Resource Signals L5)
 *
 * Per job (1 job = 1 concept node):
 *   1. Resolve concept_nodes UUID from (topic_id, node_slug) if not already set
 *   2. Search for up to 5 learning resource URLs (Wikipedia/MDN/arXiv or Google CSE)
 *   3. Extract first 3000 chars of content per URL (type-specific extractors)
 *   4. Score each resource via LLM (resource_scoring role, cached)
 *   5. Upsert into node_resources
 *   6. Aggregate signals → apply resource confidence delta to concept_nodes
 *
 * Concurrency: 5 (I/O-bound — network + LLM calls dominate)
 */
import { Worker } from 'bullmq';
import { query } from '@topic-engine/db';
import { getBullMQConnection } from '../connection';
import { QUEUE_NAMES } from '../queues';
import type { ResourceDiscoveryJobData } from '../queues/types';
import { searchResources } from '../resourceSignals/search';
import { extractContent } from '../resourceSignals/extractor';
import { scoreResource, type ResourceScore } from '../resourceSignals/scorer';
import { aggregateSignals, applySignals } from '../resourceSignals/aggregate';
import type { DepthLevel } from '@topic-engine/core';

const MAX_RESOURCES_PER_NODE = 5;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Cheap keyword relevance gate — runs before LLM scoring to discard resources
 * that don't mention the concept at all.
 *
 * Extracts meaningful tokens from nodeTitle (strips stop words and short words),
 * then checks how many appear in the resource content.
 * Requires at least 1 hit to pass — the LLM scorer handles quality from there.
 *
 * Fail-open: if nodeTitle yields no tokens (unlikely), every resource passes.
 */
function isConceptRelevant(nodeTitle: string, content: string): boolean {
  const STOP = new Set([
    'a','an','the','and','or','of','in','to','for','with','on','at','by','from',
    'is','are','was','were','be','been','being','it','its','this','that','these',
    'those','as','into','about','how','what','when','where','why','which',
  ]);

  const terms = nodeTitle
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP.has(w));

  if (terms.length === 0) return true;

  const haystack = content.toLowerCase();
  const hits = terms.filter((t) => haystack.includes(t)).length;
  return hits >= 1;
}

async function resolveNodeId(topicId: string, nodeSlug: string): Promise<string | null> {
  const rows = await query<{ id: string }>(
    `SELECT id FROM concept_nodes WHERE topic_id = $1 AND node_slug = $2 LIMIT 1`,
    [topicId, nodeSlug],
  );
  return rows[0]?.id ?? null;
}

// ─── Worker factory ───────────────────────────────────────────────────────────

export function createResourceDiscoveryWorker() {
  const worker = new Worker<ResourceDiscoveryJobData>(
    QUEUE_NAMES.RESOURCE_DISCOVERY,
    async (job) => {
      const { topicId, nodeSlug, nodeTitle, nodeDescription, depthLevel, relaxFilters } = job.data;
      let { nodeId } = job.data;

      // Resolve UUID if the scheduler dispatched an empty nodeId
      if (!nodeId) {
        const resolved = await resolveNodeId(topicId, nodeSlug);
        if (!resolved) {
          console.warn(
            `[resource:discovery] Node "${nodeSlug}" not found in topic ${topicId} — skipping`,
          );
          return { skipped: true, reason: 'node not found' };
        }
        nodeId = resolved;
      }

      console.log(
        `[resource:discovery] "${nodeTitle}" (${nodeSlug}) depth=${depthLevel} topic=${topicId}`,
      );

      // ── 1. Discover URLs ──────────────────────────────────────────────────
      const discovered = await searchResources(nodeTitle, nodeDescription, depthLevel, relaxFilters);
      if (discovered.length === 0) {
        console.log(`[resource:discovery] No resources found for "${nodeTitle}"`);
        return { resourcesFound: 0, resourcesScored: 0, signalsGenerated: 0 };
      }

      // ── 2. Extract content (parallel, fail-open per URL) ─────────────────
      const extracted = await Promise.all(
        discovered.slice(0, MAX_RESOURCES_PER_NODE).map(async (r) => ({
          ...r,
          content: await extractContent(r.url, r.resourceType),
        })),
      );

      // ── 3. Keyword relevance gate — drop resources with no concept overlap ─
      const relevant = extracted.filter((r) => {
        const passes = isConceptRelevant(nodeTitle, r.content);
        if (!passes) {
          console.log(
            `[resource:discovery] "${nodeTitle}": skipping ${r.url} (no concept keyword match)`,
          );
        }
        return passes;
      });

      // ── 4. Score via LLM (parallel, fail-open per resource) ──────────────
      const scored: Array<(typeof relevant)[number] & { score: ResourceScore }> = await Promise.all(
        relevant.map(async (r) => ({
          ...r,
          score: await scoreResource(
            nodeTitle,
            nodeDescription,
            depthLevel as DepthLevel,
            r.content,
            r.url,
          ).catch((err: unknown) => {
            console.warn('[resource:discovery] scoreResource failed:', (err as Error).message);
            return { coverage_score: 0, depth_match: 0, quality_score: 0, reasoning: 'scoring failed' };
          }),
        })),
      );

      // ── 4. Upsert into node_resources ────────────────────────────────────
      await Promise.all(
        scored.map((r) =>
          query(
            `INSERT INTO node_resources
               (node_id, url, resource_type, coverage_score, depth_match, quality_score, validated_at)
             VALUES ($1, $2, $3, $4, $5, $6, NOW())
             ON CONFLICT (node_id, url) DO UPDATE SET
               coverage_score = EXCLUDED.coverage_score,
               depth_match    = EXCLUDED.depth_match,
               quality_score  = EXCLUDED.quality_score,
               validated_at   = NOW()`,
            [
              nodeId,
              r.url,
              r.resourceType,
              r.score.coverage_score,
              r.score.depth_match,
              r.score.quality_score,
            ],
          ).catch((err: Error) => {
            console.warn(
              `[resource:discovery] Failed to upsert ${r.url}: ${err.message}`,
            );
          }),
        ),
      );

      // ── 5. Aggregate → apply confidence delta ────────────────────────────
      const scores  = scored.map((r) => r.score);
      const signals = aggregateSignals(nodeId, scores, depthLevel);
      await applySignals(nodeId, scores, signals);

      const result = {
        resourcesFound:   discovered.length,
        resourcesScored:  scored.length,
        signalsGenerated: signals.length,
      };

      console.log(
        `[resource:discovery] "${nodeTitle}": ${result.resourcesScored} scored, ` +
        `${result.signalsGenerated} signals`,
      );

      return result;
    },
    {
      connection: getBullMQConnection(),
      concurrency: 5,
    },
  );

  worker.on('failed', (job, err) => {
    console.error(`[resource:discovery] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
