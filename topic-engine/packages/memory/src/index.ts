/**
 * @topic-engine/memory — L2 Semantic Memory
 *
 * Provides two integration points for the pipeline:
 *
 * BEFORE the pipeline:
 *   const hints = await lookupConceptsForTopic(topic);
 *   const result = await engine.run({ topic, userInput, libraryHints: hints });
 *
 * AFTER the pipeline:
 *   await writeBackGraph(result.graph, topic);
 *
 * This keeps the core pipeline free of database dependencies while still
 * benefiting from accumulated cross-topic knowledge.
 */

export { lookupConceptsForTopic, lookupConcept, MERGE_THRESHOLD, FLAG_THRESHOLD } from './lookup';
export { writeBackGraph } from './writeback';
export { embed, embedBatch } from './embedding';
export { normalizeForEmbedding, buildEmbeddingInput } from './normalize';
export { RedisCache } from './llmCache';
