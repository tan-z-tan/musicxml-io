import { customAlphabet } from 'nanoid';

/**
 * URL-safe alphabet used by nanoid (default).
 * Pre-building a custom generator with a fixed size avoids per-call overhead.
 */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';

/**
 * Pool-based ID generator.
 *
 * `customAlphabet` with a fixed size lets nanoid use a single
 * `crypto.getRandomValues` call to fill a reusable internal buffer,
 * which is significantly faster than calling `nanoid(10)` per element.
 */
const generate10 = customAlphabet(ALPHABET, 10);

/**
 * Generates a unique ID for elements in the Score structure.
 *
 * The ID format is "i" + nanoid(10), where:
 * - "i" prefix ensures XML ID compatibility (XML IDs must start with a letter or underscore)
 * - nanoid(10) generates a 10-character URL-safe unique identifier
 *
 * Example: "iV1StGXR8_"
 *
 * @returns A unique 11-character ID string
 */
export function generateId(): string {
  return 'i' + generate10();
}
