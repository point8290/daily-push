import { z } from 'zod';
import { generateStructured } from '../../llm/structured';
import type { LLMProvider } from '../../llm/types';
import { BoundaryTypeSchema } from '../types';
import type { PipelineContext } from '../types';

// Per-node boundary correction — LLM may upgrade/downgrade boundary type
const BoundaryPatchSchema = z.array(
  z.object({
    id: z.string(),
    boundaryType: BoundaryTypeSchema,
    reason: z.string().max(300),
  })
);

const BOUNDARY_SYSTEM = `
You are an expert curriculum scope reviewer. Your job is to audit each concept node in a prerequisite graph and decide whether its boundary classification is correct.

Boundary types:
  core          : The learner MUST understand this to understand the root topic
  optional_depth: Enriches understanding but the topic makes sense without it
  out_of_scope  : Related / commonly confused but genuinely outside this topic's scope

Rules:
  - Be strict about "core": a concept is core only if omitting it would leave a genuine hole
  - Prefer "optional_depth" over "core" when in doubt
  - "out_of_scope" is appropriate for sibling technologies, historical context, or alternatives
  - The root topic node must always be "core"
  - Return ONLY nodes whose boundaryType you want to change, with a brief reason
  - If no changes are needed, return an empty array []
`.trim();

/**
 * Step 3: Boundary detection pass.
 * Reviews each node's boundaryType and issues surgical patches.
 * This is a cheap classification call — no thinking budget needed.
 */
export async function detectBoundaries(
  ctx: PipelineContext,
  provider: LLMProvider
): Promise<PipelineContext> {
  const { graph } = ctx;
  if (!graph) return ctx;

  const nodeList = graph.nodes
    .map(
      (n) =>
        `  - id: "${n.id}", title: "${n.title}", depthLevel: ${n.depthLevel}, ` +
        `estimatedMins: ${n.estimatedMins}, currentBoundary: ${n.boundaryType}`
    )
    .join('\n');

  const patches = await generateStructured(provider, BoundaryPatchSchema, {
    system: BOUNDARY_SYSTEM,
    schemaDescription:
      '[{ id: string, boundaryType: "core"|"optional_depth"|"out_of_scope", reason: string }]',
    messages: [
      {
        role: 'user',
        content: [
          `Root topic: "${graph.topic}"`,
          '',
          'Nodes to audit:',
          nodeList,
          '',
          'Return only nodes whose boundary type should change.',
        ].join('\n'),
      },
    ],
    temperature: 0.1,
  });

  if (patches.length === 0) return ctx;

  // Apply patches
  const patchMap = new Map(patches.map((p) => [p.id, p.boundaryType]));
  const patchedNodes = graph.nodes.map((n) =>
    patchMap.has(n.id) ? { ...n, boundaryType: patchMap.get(n.id)! } : n
  );

  return {
    ...ctx,
    graph: { ...graph, nodes: patchedNodes },
  };
}
