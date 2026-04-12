import type { LLMRouter } from '../llm/router';
import type { PipelineContext, ConceptGraph, GraphAnalytics, UserContext, Violation, ConfidenceResult } from './types';
import { captureIntent } from './steps/intentCapture';
import { inferPrerequisites } from './steps/prerequisiteInference';
import { detectBoundaries } from './steps/boundaryDetection';
import { critiqueAndPatch, type CritiqueRound } from './steps/critiqueAndPatch';
import { validateGraph } from './validators';
import { computeTopology } from './topology';
import { computeConfidence } from './confidence';

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
  };

  // ── Step 1: Intent capture ─────────────────────────────────────────────────
  let t = Date.now();
  ctx = await captureIntent(ctx, router.get('classification'));
  timings.intentCapture = Date.now() - t;

  // ── Step 2: Prerequisite inference ────────────────────────────────────────
  t = Date.now();
  ctx = await inferPrerequisites(ctx, router.get('decomposition'));
  timings.prerequisiteInference = Date.now() - t;

  if (!ctx.graph) {
    throw new Error('Pipeline error: prerequisiteInference produced no graph');
  }

  // ── Step 3: Boundary detection ────────────────────────────────────────────
  t = Date.now();
  ctx = await detectBoundaries(ctx, router.get('classification'));
  timings.boundaryDetection = Date.now() - t;

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
  }

  // ── Step 6: Topology computation ──────────────────────────────────────────
  let analytics: GraphAnalytics | undefined;
  if (!options.skipTopology) {
    t = Date.now();
    analytics = computeTopology(ctx.graph!);
    ctx = { ...ctx, analytics };
    timings.topology = Date.now() - t;
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
