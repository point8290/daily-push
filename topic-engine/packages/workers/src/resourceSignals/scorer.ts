/**
 * Resource scorer — uses the `resource_scoring` LLM role (claude-haiku, cached)
 * to score how well a resource covers a concept node.
 *
 * Output: { coverage_score, depth_match, quality_score } (all 0–1).
 */
import { z } from 'zod';
import { LLMRouter, generateStructured } from '@topic-engine/core';
import { RedisCache } from '@topic-engine/memory';
import type { DepthLevel } from '@topic-engine/core';

// ─── Schema ───────────────────────────────────────────────────────────────────

const ResourceScoreSchema = z.object({
  coverage_score: z.number().min(0).max(1),
  depth_match:    z.number().min(0).max(1),
  quality_score:  z.number().min(0).max(1),
  reasoning:      z.string().transform(s => s.slice(0, 300)),
});
export type ResourceScore = z.infer<typeof ResourceScoreSchema>;

// ─── Depth descriptions (for the scoring prompt) ─────────────────────────────

const DEPTH_DESCRIPTIONS: Record<DepthLevel, string> = {
  surface:      'very brief overview — a paragraph or two',
  foundational: 'introductory — explains core concepts clearly for a beginner',
  intermediate: 'assumes basic knowledge — covers practical usage and common patterns',
  advanced:     'assumes solid understanding — covers nuanced details and edge cases',
  expert:       'deep internals — research-level detail, implementation specifics',
};

// ─── Singleton router (created once per worker process) ───────────────────────

let _router: LLMRouter | null = null;

function getRouter(): LLMRouter {
  if (!_router) {
    _router = new LLMRouter({}, new RedisCache());
  }
  return _router;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Score a resource against a concept node using the LLM.
 *
 * Returns zero scores on empty content or LLM failure (fail-open — one bad
 * resource should not abort the whole job).
 */
export async function scoreResource(
  nodeTitle:       string,
  nodeDescription: string,
  depthLevel:      DepthLevel,
  resourceContent: string,
  resourceUrl:     string,
): Promise<ResourceScore> {
  if (!resourceContent.trim()) {
    return { coverage_score: 0, depth_match: 0, quality_score: 0, reasoning: 'empty content' };
  }

  const provider = getRouter().get('resource_scoring');

  const isVideo      = resourceContent.startsWith('Video:');
  const contentLabel = isVideo
    ? 'Video metadata + description + transcript excerpt (first 3000 chars):'
    : 'Resource content (first 3000 chars):';

  return generateStructured(provider, ResourceScoreSchema, {
    system: [
      'You are an educational resource evaluator.',
      'Score the provided resource content for a specific learning concept.',
      'For video resources, use engagement metrics (views, likes, comments, engagement%),',
      'duration fit, caption/chapter availability, and transcript excerpt as quality signals.',
      'Be calibrated: a Wikipedia stub warrants low scores; a thorough tutorial warrants high scores.',
    ].join('\n'),
    messages: [{
      role: 'user',
      content: [
        `Concept: "${nodeTitle}"`,
        `Description: ${nodeDescription}`,
        `Expected depth level: ${depthLevel} — ${DEPTH_DESCRIPTIONS[depthLevel]}`,
        `Resource URL: ${resourceUrl}`,
        '',
        contentLabel,
        resourceContent,
        '',
        'Score on three dimensions (0.0 to 1.0):',
        '• coverage_score  — what fraction of this concept does the resource cover?',
        '• depth_match     — how well does the resource depth match the expected level?',
        '• quality_score   — overall quality (clarity, accuracy, authoritative source)',
        'Return a one-sentence reasoning.',
      ].join('\n'),
    }],
    schemaDescription: '{ coverage_score: number, depth_match: number, quality_score: number, reasoning: string }',
    temperature: 0,
    maxTokens:   200,
  });
}
