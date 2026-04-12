/**
 * Minimal nanoid implementation — generates a URL-safe random ID.
 * Using crypto.randomUUID() + trimming to 12 chars keeps this zero-dependency.
 */
export function nanoid(size = 12): string {
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  return Array.from(bytes)
    .map((b) => ALPHABET[b % ALPHABET.length])
    .join('');
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
