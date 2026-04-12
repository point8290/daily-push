/**
 * Topic Engine — Phase 1 public API
 *
 * Usage:
 *   import { TopicEngine } from '@topic-engine/core';
 *
 *   const engine = new TopicEngine();
 *   const result = await engine.run({
 *     topic: 'Node.js Event Loop',
 *     userInput: 'I use Node daily but can never explain the event loop clearly',
 *   });
 */

export { TopicEngine } from './engine/TopicEngine';
export { runPipeline } from './engine/pipeline';
export { LLMRouter, DEFAULT_ROUTER_CONFIG } from './llm/router';
export { validateGraph } from './engine/validators';

// Types
export type {
  ConceptNode,
  ConceptEdge,
  ConceptGraph,
  DepthLevel,
  BoundaryType,
  EdgeType,
  LearnerLevel,
  LearnerGoal,
  UserContext,
  PipelineContext,
  GraphAnalytics,
  LearningPath,
  Community,
} from './engine/types';

export type { RunOptions, RunResult } from './engine/pipeline';
export type { CritiqueRound } from './engine/steps/critiqueAndPatch';
export type { LLMProvider, PipelineRole, RouterConfig } from './llm/types';
export { computeTopology } from './engine/topology';
export { computeBetweenness } from './engine/topology';
export { detectCommunities } from './engine/topology';
export { topologicalSort, criticalPath, buildLearningPaths } from './engine/topology';
