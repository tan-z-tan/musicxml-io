/**
 * URL-safe alphabet (same as nanoid's default), exactly 64 characters
 * so a random byte can be mapped with a bitmask (`& 63`) without bias.
 */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';

const ID_LENGTH = 10;
const POOL_SIZE = ID_LENGTH * 128;

/**
 * Pool-based random bytes.
 *
 * Filling a reusable buffer with a single `crypto.getRandomValues` call
 * amortizes the cost of the crypto API across many IDs, which is
 * significantly faster than one call per ID.
 */
let pool: Uint8Array<ArrayBuffer> | undefined;
let poolOffset = 0;

function randomBytes(): Uint8Array {
  if (pool === undefined || poolOffset + ID_LENGTH > POOL_SIZE) {
    if (pool === undefined) {
      pool = new Uint8Array(POOL_SIZE);
    }
    globalThis.crypto.getRandomValues(pool);
    poolOffset = 0;
  }
  const bytes = pool.subarray(poolOffset, poolOffset + ID_LENGTH);
  poolOffset += ID_LENGTH;
  return bytes;
}

/**
 * Generates a unique ID for elements in the Score structure.
 *
 * The ID format is "i" + 10 random URL-safe characters, where:
 * - "i" prefix ensures XML ID compatibility (XML IDs must start with a letter or underscore)
 * - the 10-character suffix is drawn from the same 64-character URL-safe
 *   alphabet as nanoid, backed by `crypto.getRandomValues`
 *
 * Example: "iV1StGXR8_"
 *
 * @returns A unique 11-character ID string
 */
export function generateId(): string {
  const bytes = randomBytes();
  let id = 'i';
  for (let i = 0; i < ID_LENGTH; i++) {
    id += ALPHABET[bytes[i] & 63];
  }
  return id;
}
