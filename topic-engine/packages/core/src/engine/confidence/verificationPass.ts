import { z } from 'zod';
import { generateStructured } from '../../llm/structured';
import type { LLMProvider } from '../../llm/types';
import type { ConceptGraph } from '../types';

// ─── Schemas ──────────────────────────────────────────────────────────────────

const VerdictEnum = z.enum(['yes', 'no', 'uncertain']);
type Verdict = z.infer<typeof VerdictEnum>;

const VerificationPassSchema = z.object({
  nodeVerdicts: z.array(
    z.object({
      nodeId: z.string(),
      existence: VerdictEnum,
      depthLevel: VerdictEnum,
      boundary: VerdictEnum,
    })
  ),
  edgeVerdicts: z.array(
    z.object({
      edgeId: z.string(),
      existence: VerdictEnum,
      type: VerdictEnum,
      direction: VerdictEnum,
    })
  ),
});

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NodePassScores {
  existence: number;
  depthLevel: number;
  boundary: number;
}

export interface EdgePassScores {
  existence: number;
  type: number;
  direction: number;
}

export interface VerificationPassResult {
  nodeScores: Record<string, NodePassScores>;
  edgeScores: Record<string, EdgePassScores>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function verdictToScore(v: Verdict): number {
  if (v === 'yes') return 1.0;
  if (v === 'uncertain') return 0.5;
  return 0.0;
}

function graphToVerificationText(graph: ConceptGraph): string {
  const nodes = graph.nodes
    .map((n) =>
      `  [${n.id}] "${n.title}" | depth=${n.depthLevel} | boundary=${n.boundaryType} | ~${n.estimatedMins}min`
    )
    .join('\n');

  const edges = graph.edges
    .map((e) => `  [${e.id}] "${e.fromId}" --[${e.type}]--> "${e.toId}"`)
    .join('\n');

  return `Nodes:\n${nodes}\n\nEdges:\n${edges}`;
}

const VERIFICATION_SYSTEM = `
You are verifying a prerequisite learning graph for accuracy.

For each node, answer three questions:
  existence  : Does this concept genuinely belong as a prerequisite/component of the topic?
  depthLevel : Is the assigned depth level (surface/foundational/intermediate/advanced/expert) correct?
  boundary   : Is the boundary classification (core/optional_depth/out_of_scope) correct?

For each edge, answer three questions:
  existence  : Does this learning relationship genuinely exist?
  type       : Is the edge type (hard_prerequisite/soft_prerequisite/confusable/leads_to) correct?
  direction  : Is the direction correct (fromId is what you learn BEFORE toId)?

Answer "yes" if you are confident it is correct.
Answer "no" if you are confident it is wrong.
Answer "uncertain" if you cannot determine with confidence.

Be strict — only answer "yes" if you are genuinely confident.
`.trim();

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Runs one cheap verification pass over the graph.
 * The model answers yes/no/uncertain for each node and edge attribute.
 *
 * Used twice: temperature=0 (pass A) and temperature=0.3 (pass B).
 * Cost: ~10-15% of the main decomposition call (input-heavy, output-light).
 */
export async function runVerificationPass(
  graph: ConceptGraph,
  provider: LLMProvider,
  temperature: number
): Promise<VerificationPassResult> {
  const result = await generateStructured(provider, VerificationPassSchema, {
    system: VERIFICATION_SYSTEM,
    schemaDescription:
      '{ nodeVerdicts: [{nodeId, existence, depthLevel, boundary}], edgeVerdicts: [{edgeId, existence, type, direction}] }',
    messages: [
      {
        role: 'user',
        content: [
          `Topic: "${graph.topic}"`,
          '',
          graphToVerificationText(graph),
          '',
          'Verify each node and edge. Return verdicts for ALL nodes and edges listed above.',
          'For edges, use the edge ID shown in brackets.',
        ].join('\n'),
      },
    ],
    temperature,
    thinking: false,
  });

  // Build score maps, falling back to 0.5 (uncertain) for any missing IDs
  const nodeScores: Record<string, NodePassScores> = {};
  for (const n of graph.nodes) {
    nodeScores[n.id] = { existence: 0.5, depthLevel: 0.5, boundary: 0.5 };
  }
  for (const verdict of result.nodeVerdicts) {
    if (nodeScores[verdict.nodeId]) {
      nodeScores[verdict.nodeId] = {
        existence: verdictToScore(verdict.existence),
        depthLevel: verdictToScore(verdict.depthLevel),
        boundary: verdictToScore(verdict.boundary),
      };
    }
  }

  const edgeScores: Record<string, EdgePassScores> = {};
  for (const e of graph.edges) {
    edgeScores[e.id] = { existence: 0.5, type: 0.5, direction: 0.5 };
  }
  for (const verdict of result.edgeVerdicts) {
    if (edgeScores[verdict.edgeId]) {
      edgeScores[verdict.edgeId] = {
        existence: verdictToScore(verdict.existence),
        type: verdictToScore(verdict.type),
        direction: verdictToScore(verdict.direction),
      };
    }
  }

  return { nodeScores, edgeScores };
}
