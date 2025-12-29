import { nanoid } from 'nanoid';

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
  return 'i' + nanoid(10);
}
