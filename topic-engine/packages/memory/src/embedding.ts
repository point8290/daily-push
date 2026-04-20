import OpenAI from 'openai';

// ─── Embedding model config ───────────────────────────────────────────────────

const MODEL = 'text-embedding-3-small';
const DIMENSIONS = 1536; // matches vector(1536) columns in the DB

let _client: OpenAI | null = null;

function client(): OpenAI {
  if (!_client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        'OPENAI_API_KEY environment variable is not set. ' +
        'The semantic memory layer requires OpenAI for embeddings.'
      );
    }
    _client = new OpenAI({ apiKey });
  }
  return _client;
}

// ─── Single embedding ─────────────────────────────────────────────────────────

/**
 * Embeds a single text string. Returns a 1536-dimension float array.
 */
export async function embed(text: string): Promise<number[]> {
  const response = await client().embeddings.create({
    model: MODEL,
    input: text,
    dimensions: DIMENSIONS,
  });
  return response.data[0].embedding;
}

// ─── Batch embedding ──────────────────────────────────────────────────────────

/**
 * Embeds multiple texts in a single API call.
 * Returns embeddings in the same order as the input.
 *
 * OpenAI's embedding API accepts arrays natively — more efficient than
 * individual calls for write-back operations (8–15 nodes per run).
 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const response = await client().embeddings.create({
    model: MODEL,
    input: texts,
    dimensions: DIMENSIONS,
  });

  // Response data is sorted by index — restore original order
  return response.data
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}
