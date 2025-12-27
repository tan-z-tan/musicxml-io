import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate';
import { parse } from './parser';
import { serialize, SerializeOptions } from './serializer';
import type { Score } from './types';

/**
 * Parse a compressed MusicXML (.mxl) file
 * @param data - The compressed file data as Uint8Array or Buffer
 * @returns The parsed Score
 */
export function parseCompressed(data: Uint8Array): Score {
  const files = unzipSync(data);

  // Find the container.xml to get the rootfile path
  const containerPath = 'META-INF/container.xml';
  const containerData = files[containerPath];

  let rootFilePath: string | undefined;

  if (containerData) {
    const containerXml = strFromU8(containerData);
    // Extract rootfile path from container.xml
    const rootfileMatch = containerXml.match(/full-path="([^"]+)"/);
    if (rootfileMatch) {
      rootFilePath = rootfileMatch[1];
    }
  }

  // If no container.xml, look for common patterns
  if (!rootFilePath) {
    // Try to find the main XML file
    const xmlFiles = Object.keys(files).filter(
      (name) => name.endsWith('.xml') && !name.startsWith('META-INF')
    );

    if (xmlFiles.length === 1) {
      rootFilePath = xmlFiles[0];
    } else {
      // Look for common names
      const commonNames = ['score.xml', 'musicxml.xml'];
      for (const name of commonNames) {
        if (files[name]) {
          rootFilePath = name;
          break;
        }
      }
    }
  }

  if (!rootFilePath || !files[rootFilePath]) {
    throw new Error('Could not find MusicXML file in compressed archive');
  }

  const xmlData = files[rootFilePath];
  const xmlString = strFromU8(xmlData);

  return parse(xmlString);
}

/**
 * Serialize a Score to compressed MusicXML (.mxl) format
 * @param score - The Score to serialize
 * @param options - Serialization options
 * @returns The compressed file data as Uint8Array
 */
export function serializeCompressed(
  score: Score,
  options: SerializeOptions = {}
): Uint8Array {
  const xmlString = serialize(score, options);
  const rootFileName = 'score.xml';

  // Create container.xml
  const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container>
  <rootfiles>
    <rootfile full-path="${rootFileName}"/>
  </rootfiles>
</container>`;

  // Create the zip file
  const files: Record<string, Uint8Array> = {
    'META-INF/container.xml': strToU8(containerXml),
    [rootFileName]: strToU8(xmlString),
  };

  return zipSync(files, { level: 6 });
}

/**
 * Check if data is a compressed MusicXML file
 * @param data - The file data
 * @returns true if the data appears to be a ZIP file
 */
export function isCompressed(data: Uint8Array): boolean {
  // ZIP files start with PK (0x50 0x4B)
  return data.length >= 2 && data[0] === 0x50 && data[1] === 0x4b;
}

/**
 * Parse either compressed (.mxl) or uncompressed (.xml/.musicxml) MusicXML
 * Automatically detects the format
 * @param data - The file data as Uint8Array or string
 * @returns The parsed Score
 */
export function parseAuto(data: Uint8Array | string): Score {
  if (typeof data === 'string') {
    return parse(data);
  }

  if (isCompressed(data)) {
    return parseCompressed(data);
  }

  // Assume it's uncompressed XML
  const xmlString = strFromU8(data);
  return parse(xmlString);
}
