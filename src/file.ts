import { readFile, writeFile } from 'fs/promises';
import { parse } from './parser';
import { serialize, SerializeOptions } from './serializer';
import { parseCompressed, serializeCompressed, isCompressed } from './compressed';
import type { Score } from './types';

/**
 * Parse a MusicXML file from disk
 * Automatically handles both .xml/.musicxml and .mxl formats
 * @param filePath - Path to the file
 * @returns The parsed Score
 */
export async function parseFile(filePath: string): Promise<Score> {
  const data = await readFile(filePath);

  // Check if it's a compressed file
  if (isCompressed(data)) {
    return parseCompressed(data);
  }

  // Parse as XML string
  const xmlString = data.toString('utf-8');
  return parse(xmlString);
}

/**
 * Serialize a Score to a file
 * Format is determined by file extension (.mxl for compressed, .xml/.musicxml for uncompressed)
 * @param score - The Score to serialize
 * @param filePath - Path to write the file
 * @param options - Serialization options
 */
export async function serializeToFile(
  score: Score,
  filePath: string,
  options: SerializeOptions = {}
): Promise<void> {
  const lowerPath = filePath.toLowerCase();

  if (lowerPath.endsWith('.mxl')) {
    const data = serializeCompressed(score, options);
    await writeFile(filePath, data);
  } else {
    const xmlString = serialize(score, options);
    await writeFile(filePath, xmlString, 'utf-8');
  }
}
