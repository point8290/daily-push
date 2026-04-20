import { query } from '@topic-engine/db';
import type { LibraryHint } from '@topic-engine/core';
import { embed } from './embedding';
import { buildEmbeddingInput, normalizeForEmbedding } from './normalize';

// ─── Thresholds (from spec) ───────────────────────────────────────────────────

export const MERGE_THRESHOLD  = 0.92; // ≥ this → treat as the same concept
export const FLAG_THRESHOLD   = 0.80; // ≥ this → surface as a candidate match

// ─── DB row types ─────────────────────────────────────────────────────────────

interface LibraryRow {
  id: string;
  canonical_title: string;
  description: string;
  depth_level: string;
  status: string;
  similarity: number;
}

// ─── Lookup ───────────────────────────────────────────────────────────────────

/**
 * Looks up concepts in the library that are similar to the given topic.
 *
 * Returns concepts with similarity ≥ FLAG_THRESHOLD (0.80), sorted by similarity.
 * The caller can split them at MERGE_THRESHOLD (0.92) if needed.
 *
 * Used as the pre-decomp lookup: results are passed as libraryHints to the pipeline.
 */
export async function lookupConceptsForTopic(topic: string): Promise<LibraryHint[]> {
  const normalized = normalizeForEmbedding(topic);
  const embedding = await embed(normalized);
  return queryLibrary(embedding, FLAG_THRESHOLD, 20);
}

/**
 * Looks up a single concept by title + description.
 * Used during write-back to find if a concept already exists in the library.
 *
 * Returns candidates at or above FLAG_THRESHOLD.
 */
export async function lookupConcept(
  title: string,
  description: string
): Promise<LibraryHint[]> {
  const text = buildEmbeddingInput(title, description);
  const embedding = await embed(text);
  return queryLibrary(embedding, FLAG_THRESHOLD, 5);
}

// ─── pgvector query ───────────────────────────────────────────────────────────

async function queryLibrary(
  embedding: number[],
  threshold: number,
  limit: number
): Promise<LibraryHint[]> {
  const vectorLiteral = `[${embedding.join(',')}]`;

  const rows = await query<LibraryRow>(
    `SELECT
       id,
       canonical_title,
       description,
       depth_level,
       status,
       1 - (embedding <=> $1::vector) AS similarity
     FROM concept_library
     WHERE embedding IS NOT NULL
       AND status IN ('candidate', 'confirmed')
       AND 1 - (embedding <=> $1::vector) >= $2
     ORDER BY embedding <=> $1::vector
     LIMIT $3`,
    [vectorLiteral, threshold, limit]
  );

  return rows.map((r) => ({
    canonicalTitle: r.canonical_title,
    depthLevel: r.depth_level as LibraryHint['depthLevel'],
    description: r.description,
    similarity: Number(r.similarity),
  }));
}
