import { z } from 'zod';
import { generateStructured } from '../../llm/structured';
import type { LLMProvider } from '../../llm/types';
import {
  EdgeTypeSchema,
  BoundaryTypeSchema,
  DepthLevelSchema,
} from '../types';
import type { PipelineContext, ConceptGraph, ConceptEdge, ConceptNode } from '../types';
import { nanoid } from '../../utils/nanoid';

// ─── Schemas ──────────────────────────────────────────────────────────────────

const CritiqueIssueSchema = z.object({
  severity: z.enum(['critical', 'warning']),
  type: z.enum([
    'wrong_edge_direction',   // A→B should be B→A
    'missing_prerequisite',   // concept X clearly needs concept Y but edge is absent
    'wrong_boundary',         // core/optional_depth/out_of_scope misclassified
    'wrong_depth',            // depthLevel inconsistent with content
    'wrong_edge_type',        // hard_prerequisite should be soft_prerequisite, etc.
    'missing_confusable',     // two concepts are commonly confused but no confusable edge
    'overcrowded_node',       // node covers multiple distinct learnable concepts
    'redundant_node',         // node duplicates another node at same depth
  ]),
  description: z.string().max(200),
  affectedIds: z.array(z.string()),
  suggestedFix: z.string().max(150),
});

const CritiqueSchema = z.object({
  issues: z.array(CritiqueIssueSchema).max(12),
  overallQuality: z.enum(['good', 'needs_work', 'poor']),
});

// Patch operations — discriminated union so each shape is exact
const PatchOpSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('add_edge'),
    fromId: z.string(),
    toId: z.string(),
    type: EdgeTypeSchema,
  }),
  z.object({
    op: z.literal('remove_edge'),
    fromId: z.string(),
    toId: z.string(),
  }),
  z.object({
    op: z.literal('change_edge_type'),
    fromId: z.string(),
    toId: z.string(),
    newType: EdgeTypeSchema,
  }),
  z.object({
    op: z.literal('remove_node'),
    id: z.string(),
  }),
  z.object({
    op: z.literal('change_boundary'),
    id: z.string(),
    newBoundary: BoundaryTypeSchema,
  }),
  z.object({
    op: z.literal('change_depth'),
    id: z.string(),
    newDepth: DepthLevelSchema,
  }),
  z.object({
    op: z.literal('change_time'),
    id: z.string(),
    newMins: z.number().int().min(5).max(180),
  }),
]);

const PatchSchema = z.object({
  operations: z.array(PatchOpSchema).max(15),
  reasoning: z.string().max(400),
});

type PatchOp = z.infer<typeof PatchOpSchema>;
type Critique = z.infer<typeof CritiqueSchema>;

// ─── System prompts ───────────────────────────────────────────────────────────

const CRITIQUE_SYSTEM = `
You are a senior curriculum architect reviewing a prerequisite dependency graph for technical accuracy.

Your job is to find SEMANTIC problems — things that are factually wrong about learning dependencies.
The graph has already been checked for structural issues (cycles, orphans) — do not report those.

Focus on:
  wrong_edge_direction   : The dependency arrow points the wrong way (A needs B but edge says B needs A)
  missing_prerequisite   : A concept clearly requires another that has no edge
  wrong_boundary         : A concept is mis-scoped (core vs optional_depth vs out_of_scope)
  wrong_depth            : A concept is assigned the wrong depth level relative to its actual complexity
  wrong_edge_type        : hard_prerequisite vs soft_prerequisite vs leads_to is wrong
  missing_confusable     : Two concepts that learners routinely conflate have no confusable edge
  overcrowded_node       : A single node covers two distinct learnable ideas — should be split
  redundant_node         : Two nodes cover essentially the same concept at the same depth

Only report issues you are confident about. If the graph looks reasonable, say so.
Severity:
  critical : Materially misleads a learner or breaks the learning path
  warning  : Suboptimal but a learner could work around it
`.trim();

const PATCH_SYSTEM = `
You apply surgical patches to fix issues in a prerequisite dependency graph.

Rules:
  - Use the MINIMUM number of operations needed to fix the reported issues
  - Never add more than 3 new edges per patch round
  - Only reference IDs that exist in the graph
  - Do NOT fix structural issues (cycles, orphans) — those are handled algorithmically
  - Do NOT rewrite the whole graph — only fix the specific issues listed

Operations available:
  add_edge        : { op, fromId, toId, type }
  remove_edge     : { op, fromId, toId }
  change_edge_type: { op, fromId, toId, newType }
  remove_node     : { op, id }      — cascades to all its edges
  change_boundary : { op, id, newBoundary }
  change_depth    : { op, id, newDepth }
  change_time     : { op, id, newMins }
`.trim();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function graphToText(graph: ConceptGraph): string {
  const nodes = graph.nodes
    .map(
      (n) =>
        `  [${n.id}] "${n.title}" | ${n.depthLevel} | ${n.boundaryType} | ~${n.estimatedMins}min`
    )
    .join('\n');

  const edges = graph.edges
    .map((e) => `  ${e.fromId} --[${e.type}]--> ${e.toId}`)
    .join('\n');

  return `Nodes:\n${nodes}\n\nEdges:\n${edges}`;
}

function applyPatch(graph: ConceptGraph, ops: PatchOp[]): ConceptGraph {
  let nodes: ConceptNode[] = [...graph.nodes];
  let edges: ConceptEdge[] = [...graph.edges];

  for (const op of ops) {
    switch (op.op) {
      case 'add_edge': {
        const nodeIds = new Set(nodes.map((n) => n.id));
        // Only add if both endpoints exist and edge doesn't already exist
        if (
          nodeIds.has(op.fromId) &&
          nodeIds.has(op.toId) &&
          op.fromId !== op.toId &&
          !edges.some((e) => e.fromId === op.fromId && e.toId === op.toId)
        ) {
          edges.push({ id: nanoid(), fromId: op.fromId, toId: op.toId, type: op.type });
        }
        break;
      }
      case 'remove_edge': {
        edges = edges.filter(
          (e) => !(e.fromId === op.fromId && e.toId === op.toId)
        );
        break;
      }
      case 'change_edge_type': {
        edges = edges.map((e) =>
          e.fromId === op.fromId && e.toId === op.toId
            ? { ...e, type: op.newType }
            : e
        );
        break;
      }
      case 'remove_node': {
        nodes = nodes.filter((n) => n.id !== op.id);
        edges = edges.filter((e) => e.fromId !== op.id && e.toId !== op.id);
        break;
      }
      case 'change_boundary': {
        nodes = nodes.map((n) =>
          n.id === op.id ? { ...n, boundaryType: op.newBoundary } : n
        );
        break;
      }
      case 'change_depth': {
        nodes = nodes.map((n) =>
          n.id === op.id ? { ...n, depthLevel: op.newDepth } : n
        );
        break;
      }
      case 'change_time': {
        nodes = nodes.map((n) =>
          n.id === op.id ? { ...n, estimatedMins: op.newMins } : n
        );
        break;
      }
    }
  }

  return { ...graph, nodes, edges };
}

// ─── Main export ──────────────────────────────────────────────────────────────

export interface CritiqueRound {
  roundNumber: number;
  quality: Critique['overallQuality'];
  issueCount: number;
  operationsApplied: number;
}

export interface CritiqueResult {
  rounds: CritiqueRound[];
  skipped: boolean;
}

const MAX_ROUNDS = 2;

/**
 * Step 4: Critique-refine loop.
 *
 * Critique model (sonnet) semantically audits the graph.
 * Patch model (sonnet) applies surgical fixes.
 * Stops early if quality is 'good' or no critical issues remain.
 */
export async function critiqueAndPatch(
  ctx: PipelineContext,
  critiqueProvider: LLMProvider,
  patchProvider: LLMProvider
): Promise<{ ctx: PipelineContext; result: CritiqueResult }> {
  if (!ctx.graph) {
    return { ctx, result: { rounds: [], skipped: true } };
  }

  const rounds: CritiqueRound[] = [];
  let graph = ctx.graph;

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    // ── Critique pass ────────────────────────────────────────────────────────
    const critique = await generateStructured(critiqueProvider, CritiqueSchema, {
      system: CRITIQUE_SYSTEM,
      schemaDescription:
        '{ issues: [{ severity, type, description, affectedIds, suggestedFix }], overallQuality }',
      messages: [
        {
          role: 'user',
          content: [
            `Topic: "${graph.topic}"`,
            '',
            graphToText(graph),
            '',
            'Identify semantic issues. Return { issues: [...], overallQuality }.',
          ].join('\n'),
        },
      ],
      temperature: 0.2,
    });

    const criticalCount = critique.issues.filter((i) => i.severity === 'critical').length;

    // Stop if graph is already good or no critical issues
    if (critique.overallQuality === 'good' || criticalCount === 0) {
      rounds.push({
        roundNumber: round,
        quality: critique.overallQuality,
        issueCount: critique.issues.length,
        operationsApplied: 0,
      });
      break;
    }

    // ── Patch pass ───────────────────────────────────────────────────────────
    const patch = await generateStructured(patchProvider, PatchSchema, {
      system: PATCH_SYSTEM,
      schemaDescription:
        '{ operations: [{ op, ...fields }], reasoning }',
      messages: [
        {
          role: 'user',
          content: [
            `Topic: "${graph.topic}"`,
            '',
            graphToText(graph),
            '',
            `Issues to fix (${critique.issues.length} total, ${criticalCount} critical):`,
            critique.issues
              .map((i) => `  [${i.severity}] ${i.type}: ${i.description} → ${i.suggestedFix}`)
              .join('\n'),
            '',
            'Return the minimum patch operations to fix the critical issues.',
          ].join('\n'),
        },
      ],
      temperature: 0.1,
    });

    const patchedGraph = applyPatch(graph, patch.operations);
    graph = patchedGraph;

    rounds.push({
      roundNumber: round,
      quality: critique.overallQuality,
      issueCount: critique.issues.length,
      operationsApplied: patch.operations.length,
    });
  }

  return {
    ctx: { ...ctx, graph },
    result: { rounds, skipped: false },
  };
}
