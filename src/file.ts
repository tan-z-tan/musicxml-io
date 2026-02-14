import { readFile, writeFile } from 'fs/promises';
import { parse, parseCompressed, isCompressed, parseAbc } from './importers';
import { serialize, serializeCompressed, exportMidi, serializeAbc, SerializeOptions, MidiExportOptions } from './exporters';
import type { Score } from './types';

/**
 * Parse a MusicXML file from disk
 * Automatically handles both .xml/.musicxml and .mxl formats
 * @param filePath - Path to the file
 * @returns The parsed Score
 */
export async function parseFile(filePath: string): Promise<Score> {
  const lowerPath = filePath.toLowerCase();

  // ABC notation format
  if (lowerPath.endsWith('.abc')) {
    const data = await readFile(filePath, 'utf-8');
    return parseAbc(data);
  }

  const data = await readFile(filePath);

  // Check if it's a compressed file
  if (isCompressed(data)) {
    return parseCompressed(data);
  }

  // Parse as XML string
  const xmlString = decodeBuffer(data);
  return parse(xmlString);
}

/**
 * Detect encoding from BOM and decode buffer to string
 * Supports UTF-8, UTF-16BE, UTF-16LE
 */
export function decodeBuffer(buffer: Buffer): string {
  // UTF-16 BE BOM: FE FF
  if (buffer.length >= 2 && buffer[0] === 0xFE && buffer[1] === 0xFF) {
    return buffer.swap16().toString('utf-16le'); // Node.js usually handles LE well, or just use ucs2
    // Actually Node's utf16le is standard. efficient way to read BE is swap and read LE or use TextDecoder.
    // simpler: TextDecoder
  }

  // UTF-16 LE BOM: FF FE
  if (buffer.length >= 2 && buffer[0] === 0xFF && buffer[1] === 0xFE) {
    return buffer.toString('utf16le');
  }

  // UTF-8 BOM: EF BB BF
  if (buffer.length >= 3 && buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
    return buffer.toString('utf8', 3); // Skip BOM
  }

  // Default to UTF-8
  return buffer.toString('utf8');
}


/**
 * Export options combining all format options
 */
export interface ExportOptions extends SerializeOptions, MidiExportOptions { }

/**
 * Serialize a Score to a file
 * Format is determined by file extension:
 * - .mxl: Compressed MusicXML
 * - .xml/.musicxml: Uncompressed MusicXML
 * - .mid/.midi: Standard MIDI File
 * - .abc: ABC notation
 * @param score - The Score to serialize
 * @param filePath - Path to write the file
 * @param options - Serialization options
 */
export async function serializeToFile(
  score: Score,
  filePath: string,
  options: ExportOptions = {}
): Promise<void> {
  const lowerPath = filePath.toLowerCase();

  if (lowerPath.endsWith('.abc')) {
    const abcString = serializeAbc(score);
    await writeFile(filePath, abcString, 'utf-8');
  } else if (lowerPath.endsWith('.mxl')) {
    const data = serializeCompressed(score, options);
    await writeFile(filePath, data);
  } else if (lowerPath.endsWith('.mid') || lowerPath.endsWith('.midi')) {
    const data = exportMidi(score, options);
    await writeFile(filePath, data);
  } else {
    const xmlString = serialize(score, options);
    await writeFile(filePath, xmlString, 'utf-8');
  }
}
