import type { LLMRouter } from '../llm/router';
import type { PipelineContext, ConceptGraph, GraphAnalytics, UserContext, Violation, ConfidenceResult, LibraryHint } from './types';
import { captureIntent } from './steps/intentCapture';
import { inferPrerequisites } from './steps/prerequisiteInference';
import { detectBoundaries } from './steps/boundaryDetection';
import { critiqueAndPatch, type CritiqueRound } from './steps/critiqueAndPatch';
import { validateGraph } from './validators';
import { computeTopology } from './topology';
import { computeConfidence } from './confidence';

/** Emitted after each pipeline stage completes — used by the SSE streaming endpoint. */
export interface StageEvent {
  stage: string;
  durationMs: number;
  [key: string]: unknown;
}

export interface RunOptions {
  topic: string;
  userInput: string;
  userContext?: Partial<Omit<UserContext, 'rawInput'>>;
  /** Skip structural validation — useful during evals to inspect raw LLM output */
  skipValidation?: boolean;
  /** Skip critique-refine loop (faster, lower quality) */
  skipCritique?: boolean;
  /** Skip topology computation (faster for tests) */
  skipTopology?: boolean;
  /** Skip confidence scoring (faster for tests/evals) */
  skipConfidence?: boolean;
  /**
   * Library hints from L2 semantic memory lookup.
   * Pre-populate by calling lookupConceptsForTopic() before running the pipeline.
   * When provided, these are injected into the decomposition prompt so the LLM
   * can reuse canonical concept titles instead of inventing new ones.
   */
  libraryHints?: LibraryHint[];
  /**
   * Called after each pipeline stage completes.
   * Used by the SSE streaming endpoint to emit progress events.
   * Must not throw — errors are silently swallowed.
   */
  onStage?: (event: StageEvent) => void;
}

export interface RunResult {
  graph: ConceptGraph;
  analytics?: GraphAnalytics;
  /** Structured intent parsed from userInput */
  intent: Pick<UserContext, 'level' | 'goal' | 'specificGap' | 'needsQuiz'>;
  /** Validation warnings (non-fatal) */
  warnings: string[];
  /** All structural violations found (includes repairs applied) */
  violations: Violation[];
  /** True if any violation requires an LLM call to fully resolve */
  requiresLLM: boolean;
  /** Critique-refine rounds summary */
  critiqueRounds: CritiqueRound[];
  /** L4 confidence metadata (disagreements, discarded nodes) */
  confidenceResult?: ConfidenceResult;
  /** Wall-clock ms per stage */
  timings: Record<string, number>;
}

/**
 * Full Phase-2 pipeline:
 *   Step 1 — Intent capture            (cheap classification)
 *   Step 2 — Prerequisite inference     (core LLM decomp, extended thinking)
 *   Step 3 — Boundary detection         (cheap classification patch)
 *   Step 4 — Critique-refine loop       (semantic audit + surgical patch, max 2 rounds)
 *   Step 5 — Structural validation      (pure algorithms — no LLM)
 *   Step 6 — Topology computation       (centrality, communities, learning paths)
 */
export async function runPipeline(
  router: LLMRouter,
  options: RunOptions
): Promise<RunResult> {
  const timings: Record<string, number> = {};
  const warnings: string[] = [];
  let violations: Violation[] = [];
  let requiresLLM = false;
  let critiqueRounds: CritiqueRound[] = [];

  // ── Initial context ────────────────────────────────────────────────────────
  let confidenceResult: ConfidenceResult | undefined;

  let ctx: PipelineContext = {
    topic: options.topic,
    userContext: {
      rawInput: options.userInput,
      level: options.userContext?.level,
      goal: options.userContext?.goal,
      specificGap: options.userContext?.specificGap,
      needsQuiz: options.userContext?.needsQuiz,
    },
    libraryHints: options.libraryHints,
  };

  const emit = (event: StageEvent) => {
    try { options.onStage?.(event); } catch { /* never block pipeline on observer errors */ }
  };

  // ── Step 1: Intent capture ─────────────────────────────────────────────────
  let t = Date.now();
  ctx = await captureIntent(ctx, router.get('classification'));
  timings.intentCapture = Date.now() - t;
  emit({ stage: 'intentCapture', durationMs: timings.intentCapture });

  // ── Step 2: Prerequisite inference ────────────────────────────────────────
  t = Date.now();
  ctx = await inferPrerequisites(ctx, router.get('decomposition'));
  timings.prerequisiteInference = Date.now() - t;

  if (!ctx.graph) {
    throw new Error('Pipeline error: prerequisiteInference produced no graph');
  }
  emit({ stage: 'prerequisiteInference', durationMs: timings.prerequisiteInference, nodeCount: ctx.graph.nodes.length, edgeCount: ctx.graph.edges.length });

  // ── Step 3: Boundary detection ────────────────────────────────────────────
  t = Date.now();
  ctx = await detectBoundaries(ctx, router.get('classification'));
  timings.boundaryDetection = Date.now() - t;
  emit({ stage: 'boundaryDetection', durationMs: timings.boundaryDetection });

  // ── Step 4: Critique-refine loop ──────────────────────────────────────────
  if (!options.skipCritique) {
    t = Date.now();
    const { ctx: critCtx, result: critiqueResult } = await critiqueAndPatch(
      ctx,
      router.get('critique'),
      router.get('patch')
    );
    ctx = critCtx;
    critiqueRounds = critiqueResult.rounds;
    timings.critiqueRefine = Date.now() - t;
    emit({ stage: 'critiqueRefine', durationMs: timings.critiqueRefine, rounds: critiqueRounds.length });
  }

  // ── Step 5: Structural validation ─────────────────────────────────────────
  t = Date.now();
  const validationResult = options.skipValidation
    ? { repairedGraph: ctx.graph!, warnings: [], violations: [], requiresLLM: false, valid: true, stats: {} as never }
    : validateGraph(ctx.graph!);
  timings.structuralValidation = Date.now() - t;

  warnings.push(...validationResult.warnings);
  violations = validationResult.violations ?? [];
  requiresLLM = validationResult.requiresLLM ?? false;
  ctx = { ...ctx, graph: validationResult.repairedGraph };
  emit({ stage: 'structuralValidation', durationMs: timings.structuralValidation, violations: violations.length });

  // ── Step 5b: Confidence scoring ───────────────────────────────────────────
  if (!options.skipConfidence) {
    t = Date.now();
    const confResult = await computeConfidence(
      ctx.graph!,
      options.topic,
      router.get('decomposition'),
      critiqueRounds
    );
    ctx = { ...ctx, graph: confResult.graph };
    confidenceResult = confResult.meta;
    timings.confidenceScoring = Date.now() - t;
    emit({ stage: 'confidenceScoring', durationMs: timings.confidenceScoring, discarded: confidenceResult.discardedNodeIds.length });
  }

  // ── Step 6: Topology computation ──────────────────────────────────────────
  let analytics: GraphAnalytics | undefined;
  if (!options.skipTopology) {
    t = Date.now();
    analytics = computeTopology(ctx.graph!);
    ctx = { ...ctx, analytics };
    timings.topology = Date.now() - t;
    emit({ stage: 'topology', durationMs: timings.topology });
  }

  return {
    graph: ctx.graph!,
    analytics,
    intent: {
      level: ctx.userContext.level,
      goal: ctx.userContext.goal,
      specificGap: ctx.userContext.specificGap,
      needsQuiz: ctx.userContext.needsQuiz,
    },
    warnings,
    violations,
    requiresLLM,
    critiqueRounds,
    confidenceResult,
    timings,
  };
}
