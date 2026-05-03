import { query, transaction } from '@topic-engine/db';
import type { ConceptGraph, ConceptNode, ConceptEdge } from '@topic-engine/core';
import { embedBatch } from './embedding';
import { buildEmbeddingInput } from './normalize';
import { lookupConcept, MERGE_THRESHOLD } from './lookup';

// ─── Thresholds (from spec) ───────────────────────────────────────────────────

const CONFIRM_THRESHOLD   = 0.80; // confidence ≥ this → confirmNode (high confidence)
const CANDIDATE_THRESHOLD = 0.55; // confidence ≥ this → addCandidate
// Promotion to 'confirmed': decomps_seen ≥ 3 AND confirmations ≥ 5
const PROMOTION_MIN_DECOMPS        = 3;
const PROMOTION_MIN_CONFIRMATIONS  = 5;

// Edge status classification (from spec)
function classifyEdgeStatus(confirmations: number, contradictions: number): string {
  const total = confirmations + contradictions;
  if (total === 0) return 'candidate';
  const ratio = confirmations / total;
  if (ratio >= 0.85) return 'confirmed';
  if (ratio >= 0.60) return 'candidate';   // probable → stays candidate until confirmed
  if (ratio >= 0.40) return 'contested';
  return 'likely_wrong';
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Writes the decomposed graph back to the concept library.
 *
 * For each node with confidence ≥ CANDIDATE_THRESHOLD:
 *   - Look up if a matching concept already exists (cosine ≥ MERGE_THRESHOLD)
 *   - If yes: merge (increment decomps_seen, add alt_title if new, update embedding)
 *   - If no: insert as candidate (or confirmed if confidence ≥ CONFIRM_THRESHOLD)
 *   - Check promotion criteria after every upsert
 *
 * For edges where both endpoints mapped to library concepts:
 *   - Upsert library_edge, increment confirmations
 *   - Reclassify edge status based on confirmation ratio
 *
 * topicTitle is stored in concept_library.topics_seen[] for cross-topic tracking.
 */
export async function writeBackGraph(
  graph: ConceptGraph,
  topicTitle: string
): Promise<void> {
  // Filter to eligible nodes (must have confidence or default to writing all)
  const eligible = graph.nodes.filter(
    (n) => (n.confidence?.overall ?? 1) >= CANDIDATE_THRESHOLD
  );

  if (eligible.length === 0) return;

  // Batch-compute embeddings for all eligible nodes
  const inputs = eligible.map((n) => buildEmbeddingInput(n.title, n.description));
  const embeddings = await embedBatch(inputs);

  // Map from graph node ID → library concept UUID (for edge write-back)
  const nodeToLibraryId = new Map<string, string>();

  for (let i = 0; i < eligible.length; i++) {
    const node = eligible[i];
    const embedding = embeddings[i];
    const isHighConfidence = (node.confidence?.overall ?? 0) >= CONFIRM_THRESHOLD;

    // Check if already in library
    const matches = await lookupConcept(node.title, node.description);
    const mergeMatch = matches.find((m) => m.similarity >= MERGE_THRESHOLD);

    if (mergeMatch) {
      // Merge: update existing concept
      const libraryId = await mergeExistingConcept(
        mergeMatch.canonicalTitle,
        node,
        embedding,
        topicTitle,
        isHighConfidence
      );
      if (libraryId) nodeToLibraryId.set(node.id, libraryId);
    } else {
      // Insert new concept
      const status = isHighConfidence ? 'confirmed' : 'candidate';
      const libraryId = await insertNewConcept(node, embedding, topicTitle, status);
      nodeToLibraryId.set(node.id, libraryId);
    }
  }

  // Write back edges where both endpoints resolved to library concepts
  const eligibleEdges = graph.edges.filter(
    (e) => nodeToLibraryId.has(e.fromId) && nodeToLibraryId.has(e.toId)
  );

  for (const edge of eligibleEdges) {
    const fromLibId = nodeToLibraryId.get(edge.fromId)!;
    const toLibId   = nodeToLibraryId.get(edge.toId)!;
    await upsertLibraryEdge(fromLibId, toLibId, edge);
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function mergeExistingConcept(
  canonicalTitle: string,
  node: ConceptNode,
  embedding: number[],
  topicTitle: string,
  isHighConfidence: boolean
): Promise<string | null> {
  const vectorLiteral = `[${embedding.join(',')}]`;
  let libraryId: string | null = null;

  await transaction(async (q) => {
    // Fetch current row
    const rows = await q(
      `SELECT id, alt_titles, topics_seen, decomps_seen, confirmations, status
       FROM concept_library WHERE canonical_title = $1`,
      [canonicalTitle]
    ) as Array<{
      id: string;
      alt_titles: string[];
      topics_seen: string[];
      decomps_seen: number;
      confirmations: number;
      status: string;
    }>;

    if (rows.length === 0) return;
    const row = rows[0];
    libraryId = row.id;

    // Merge alt_titles if this title is different
    const newAltTitles = row.alt_titles.includes(node.title)
      ? row.alt_titles
      : [...row.alt_titles, node.title];

    // Merge topics_seen
    const newTopicsSeen = row.topics_seen.includes(topicTitle)
      ? row.topics_seen
      : [...row.topics_seen, topicTitle];

    const newDecompsSeen = row.decomps_seen + 1;
    const newConfirmations = isHighConfidence ? row.confirmations + 1 : row.confirmations;

    // Check promotion criteria
    const newStatus =
      row.status === 'candidate' &&
      newDecompsSeen >= PROMOTION_MIN_DECOMPS &&
      newConfirmations >= PROMOTION_MIN_CONFIRMATIONS
        ? 'confirmed'
        : row.status;

    await q(
      `UPDATE concept_library
       SET alt_titles   = $1,
           topics_seen  = $2,
           decomps_seen = $3,
           confirmations = $4,
           status       = $5,
           embedding    = $6::vector,
           updated_at   = NOW()
       WHERE id = $7`,
      [
        newAltTitles,
        newTopicsSeen,
        newDecompsSeen,
        newConfirmations,
        newStatus,
        vectorLiteral,
        row.id,
      ]
    );
  });

  return libraryId;
}

async function insertNewConcept(
  node: ConceptNode,
  embedding: number[],
  topicTitle: string,
  status: 'candidate' | 'confirmed'
): Promise<string> {
  const vectorLiteral = `[${embedding.join(',')}]`;
  const confirmations = status === 'confirmed' ? 1 : 0;

  // Single atomic INSERT ... ON CONFLICT — no transaction wrapper needed
  const rows = await query<{ id: string }>(
    `INSERT INTO concept_library
       (canonical_title, description, depth_level, embedding, status,
        topics_seen, decomps_seen, confirmations, alt_titles)
     VALUES ($1, $2, $3, $4::vector, $5, $6, 1, $7, '{}')
     ON CONFLICT (canonical_title) DO UPDATE
       SET decomps_seen  = concept_library.decomps_seen + 1,
           confirmations = concept_library.confirmations + $7,
           updated_at    = NOW()
     RETURNING id`,
    [
      node.title,
      node.description,
      node.depthLevel,
      vectorLiteral,
      status,
      [topicTitle],
      confirmations,
    ]
  );

  return rows[0].id;
}

async function upsertLibraryEdge(
  fromLibId: string,
  toLibId: string,
  edge: ConceptEdge
): Promise<void> {
  await transaction(async (q) => {
    // Upsert the edge, incrementing confirmations
    const rows = await q(
      `INSERT INTO library_edges (from_concept_id, to_concept_id, edge_type, confirmations)
       VALUES ($1, $2, $3, 1)
       ON CONFLICT (from_concept_id, to_concept_id, edge_type)
       DO UPDATE SET
         confirmations = library_edges.confirmations + 1,
         updated_at    = NOW()
       RETURNING id, confirmations, contradictions`,
      [fromLibId, toLibId, edge.type]
    ) as Array<{ id: string; confirmations: number; contradictions: number }>;

    if (rows.length === 0) return;
    const row = rows[0];

    // Reclassify status based on new counts
    const newStatus = classifyEdgeStatus(row.confirmations, row.contradictions);
    await q(
      `UPDATE library_edges SET status = $1 WHERE id = $2`,
      [newStatus, row.id]
    );
  });
}
