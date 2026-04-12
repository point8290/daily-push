import { z } from 'zod';
import { generateStructured } from '../../llm/structured';
import type { LLMProvider } from '../../llm/types';
import {
  DepthLevelSchema,
  BoundaryTypeSchema,
  EdgeTypeSchema,
} from '../types';
import type { PipelineContext, ConceptGraph, ConceptEdge } from '../types';
import { nanoid } from '../../utils/nanoid';

// Raw schema the LLM must return (IDs as slugs, no metadata yet)
const RawGraphSchema = z.object({
  nodes: z.array(
    z.object({
      id: z.string().regex(/^[a-z0-9-]+$/, 'ID must be lowercase-kebab'),
      title: z.string().min(2),
      description: z.string().min(10),
      depthLevel: DepthLevelSchema,
      boundaryType: BoundaryTypeSchema,
      estimatedMins: z.number().int().min(5).max(180),
    })
  ).min(3),
  edges: z.array(
    z.object({
      fromId: z.string(),
      toId: z.string(),
      type: EdgeTypeSchema,
    })
  ),
});

const DECOMP_SYSTEM = `
You are a senior curriculum designer. Your job is to build precise prerequisite dependency graphs for technical topics.

Edge semantics — use EXACTLY one of these four types:
  hard_prerequisite : cannot understand toId without first understanding fromId
  soft_prerequisite : fromId makes toId easier but a learner can proceed without it
  confusable        : learners routinely mix up these two concepts (mark both directions if symmetric)
  leads_to          : understanding fromId deepens or enables revisiting toId with new insight

Edge direction rule (CRITICAL):
  fromId is the concept that must be learned FIRST.
  toId is the concept that depends on it.
  Example: "call-stack" must be learned before "event-loop", so:
    { "fromId": "call-stack", "toId": "event-loop", "type": "hard_prerequisite" }  ← correct
    { "fromId": "event-loop", "toId": "call-stack", "type": "hard_prerequisite" }  ← WRONG, creates cycle

DAG constraint (CRITICAL — violations will be rejected):
  This graph MUST be a Directed Acyclic Graph. Cycles are not allowed.
  Before writing each edge, ask: "Does a path already exist from toId back to fromId?"
  If yes, DO NOT add this edge — it creates a cycle.
  - NEVER add both A→B and B→A as hard_prerequisite or soft_prerequisite.
  - If two concepts are mutually dependent, use "confusable" instead.
  - If you are unsure of direction, use "soft_prerequisite" (easier to fix than a cycle).

Node rules:
  - Aim for 8–15 nodes. More than 20 makes the graph hard to navigate.
  - Each node must cover exactly ONE learnable concept (not a broad technology, not a single syntax detail)
  - Depth levels: surface (<20min), foundational (20-45min), intermediate (30-75min), advanced (45-120min), expert (60-180min)
  - Boundary: core = required to understand the topic, optional_depth = enriches understanding, out_of_scope = related but not needed
  - IDs must be lowercase-kebab-case strings (e.g. "call-stack", "event-loop-phases", "libuv-thread-pool")
  - Include the target topic itself as the root node

Graph rules:
  - Every non-root node must have at least one edge
  - Prefer concrete, teachable concepts over abstract ones
  - The root node should have the most inbound prerequisite edges
`.trim();

/**
 * Step 2: The core LLM call.
 * Generates the raw prerequisite graph using extended thinking when available.
 */
export async function inferPrerequisites(
  ctx: PipelineContext,
  provider: LLMProvider
): Promise<PipelineContext> {
  const { topic, userContext } = ctx;

  const levelContext = userContext.level
    ? `Target learner: ${userContext.level} level`
    : 'Target learner: level unknown — build the complete graph';

  const goalContext = userContext.goal
    ? `Learning goal: ${userContext.goal}`
    : '';

  const gapContext = userContext.specificGap
    ? `Specific gap reported: "${userContext.specificGap}"`
    : '';

  const useThinking = provider.supportsThinking();

  const raw = await generateStructured(provider, RawGraphSchema, {
    system: DECOMP_SYSTEM,
    schemaDescription:
      '{ nodes: [{ id, title, description, depthLevel, boundaryType, estimatedMins }], edges: [{ fromId, toId, type }] }',
    messages: [
      {
        role: 'user',
        content: [
          `Build a prerequisite graph for: "${topic}"`,
          levelContext,
          goalContext,
          gapContext,
          '',
          'Requirements:',
          '- Include the target topic as the root node (it should have the most inbound edges)',
          '- Include all hard prerequisites a learner needs before reaching the root',
          '- Mark concepts that are optional depth enrichment',
          '- Mark concepts that are out of scope but commonly confused',
          '- Use confusable edges between concepts learners routinely mix up',
          '- Aim for 8–15 nodes total',
          '',
          'FINAL CHECK before outputting: scan every edge pair. If you have both (A→B) and (B→A)',
          'for hard_prerequisite or soft_prerequisite, remove the weaker one or change it to confusable.',
          'The output must be a valid DAG — any cycle will cause a hard failure.',
        ]
          .filter(Boolean)
          .join('\n'),
      },
    ],
    thinking: useThinking,
    thinkingBudget: 4000,
    temperature: 0.4,
  });

  // Assign stable IDs to edges, validate all edge references exist
  const nodeIds = new Set(raw.nodes.map((n) => n.id));
  const validEdges = raw.edges.filter(
    (e) => nodeIds.has(e.fromId) && nodeIds.has(e.toId) && e.fromId !== e.toId
  );

  const edgesWithIds = validEdges.map((e) => ({ ...e, id: nanoid() }));

  // ── Post-generation self-check ──────────────────────────────────────────
  // Ask the same model to scan for (A→B + B→A) pairs before we return.
  // This is input-heavy, output-light — costs ~5% of the main call.
  // Target: reduce LLM-produced cycles from ~1.7 avg → ~0 before the
  // structural validator even runs.
  const cleanedEdges = await runCycleSelfCheck(
    raw.nodes.map((n) => ({ id: n.id, title: n.title })),
    edgesWithIds,
    provider
  );

  const graph: ConceptGraph = {
    topic,
    createdAt: new Date(),
    nodes: raw.nodes,
    edges: cleanedEdges,
  };

  return { ...ctx, graph };
}

// ── Self-check types ──────────────────────────────────────────────────────────

const SelfCheckSchema = z.object({
  cyclicEdgeIds: z.array(z.string()),
  // IDs of edges to remove (the weaker direction in each A↔B pair)
});

/**
 * Cheap post-generation cycle scan.
 * The model reviews all edge pairs and returns the IDs of edges that create
 * a (A→B + B→A) cycle. We remove those before returning the graph.
 *
 * We use temperature=0 and no extended thinking — this is a deterministic
 * verification task, not a reasoning task.
 */
async function runCycleSelfCheck(
  nodes: Array<{ id: string; title: string }>,
  edges: ConceptEdge[],
  provider: LLMProvider
): Promise<ConceptEdge[]> {
  if (edges.length < 2) return edges;

  // Build a quick lookup of edge pairs
  const edgeSet = new Set(edges.map((e) => `${e.fromId}→${e.toId}`));
  const hasCyclicPair = edges.some((e) => edgeSet.has(`${e.toId}→${e.fromId}`));
  if (!hasCyclicPair) return edges; // fast path — no cycles possible

  const nodeIndex = new Map(nodes.map((n) => [n.id, n.title]));
  const edgeLines = edges
    .map((e) => `  [${e.id}] "${nodeIndex.get(e.fromId) ?? e.fromId}" --${e.type}--> "${nodeIndex.get(e.toId) ?? e.toId}"`)
    .join('\n');

  try {
    const result = await generateStructured(provider, SelfCheckSchema, {
      system:
        'You verify that a prerequisite graph is a valid DAG (no cycles). ' +
        'Return the IDs of edges that create cycles and should be removed. ' +
        'For each A↔B pair (both directions present), return the ID of the WEAKER edge ' +
        '(prefer removing leads_to over soft_prerequisite, soft_prerequisite over hard_prerequisite, confusable last). ' +
        'If no cycles exist, return an empty array.',
      schemaDescription: '{ cyclicEdgeIds: string[] }',
      messages: [
        {
          role: 'user',
          content:
            `Scan these edges for cycles (A→B and B→A both present):\n${edgeLines}\n\n` +
            `Return the IDs of edges to remove. If none, return { cyclicEdgeIds: [] }.`,
        },
      ],
      temperature: 0,
      thinking: false,
    });

    if (result.cyclicEdgeIds.length === 0) return edges;

    const removeSet = new Set(result.cyclicEdgeIds);
    return edges.filter((e) => !removeSet.has(e.id));
  } catch {
    // Self-check failed — return original edges; structural validator will catch cycles
    return edges;
  }
}
