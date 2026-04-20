/**
 * Text normalization before embedding.
 *
 * Pipeline (from spec):
 *   1. Preserve code-specific tokens (async/await, O(n), TCP/IP, etc.)
 *   2. Lowercase
 *   3. Strip articles (a, an, the)
 *   4. Strip parenthetical content
 *   5. Strip special characters (keep alphanum, spaces, hyphens)
 *   6. Restore preserved tokens (lowercased)
 *   7. Collapse whitespace
 */

// Patterns to preserve verbatim (restored after lowercasing)
const PRESERVE_PATTERNS: RegExp[] = [
  /async\/await/gi,              // async/await
  /O\([^)]+\)/g,                 // O(n), O(log n), O(n²)
  /[A-Z]{2,}\/[A-Z0-9]{2,}/g,   // TCP/IP, HTTP/2, ES/CJS
  /\bES\d+/gi,                   // ES2015, ES2020
  /\bv\d+(?:\.\d+)*/gi,          // v8, v1.2.3
];

export function normalizeForEmbedding(text: string): string {
  const preserved: string[] = [];
  let s = text;

  // Step 1: preserve code tokens
  for (const pattern of PRESERVE_PATTERNS) {
    s = s.replace(pattern, (match) => {
      preserved.push(match);
      return `__PRES_${preserved.length - 1}__`;
    });
  }

  // Step 2: lowercase
  s = s.toLowerCase();

  // Step 3: strip articles
  s = s.replace(/\b(a|an|the)\b\s*/g, ' ');

  // Step 4: strip parentheticals
  s = s.replace(/\([^)]*\)/g, ' ');

  // Step 5: strip special chars, keep alphanumeric / spaces / hyphens
  s = s.replace(/[^a-z0-9\s\-]/g, ' ');

  // Step 6: restore preserved tokens (lowercased)
  for (let i = 0; i < preserved.length; i++) {
    s = s.replace(`__pres_${i}__`, preserved[i].toLowerCase());
  }

  // Step 7: collapse whitespace
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Builds the embedding input string for a concept.
 * Spec: embed title + ' ' + description (not title alone).
 */
export function buildEmbeddingInput(title: string, description: string): string {
  return `${normalizeForEmbedding(title)} ${normalizeForEmbedding(description)}`;
}
