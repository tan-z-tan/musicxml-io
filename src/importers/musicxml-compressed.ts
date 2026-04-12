import { unzipSync, strFromU8 } from 'fflate';
import { parse } from './musicxml';
import type { Score } from '../types';

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
 * Check if data is a compressed MusicXML file
 * @param data - The file data
 * @returns true if the data appears to be a ZIP file
 */
export function isCompressed(data: Uint8Array): boolean {
  // ZIP files start with PK (0x50 0x4B)
  return data.length >= 2 && data[0] === 0x50 && data[1] === 0x4b;
}

/**
 * Detect encoding from BOM and decode Uint8Array to string
 * Supports UTF-8, UTF-16BE, UTF-16LE
 */
function decodeXmlBytes(data: Uint8Array): string {
  // UTF-16 BE BOM: FE FF
  if (data.length >= 2 && data[0] === 0xFE && data[1] === 0xFF) {
    return new TextDecoder('utf-16be').decode(data);
  }

  // UTF-16 LE BOM: FF FE
  if (data.length >= 2 && data[0] === 0xFF && data[1] === 0xFE) {
    return new TextDecoder('utf-16le').decode(data);
  }

  // Default to UTF-8 (TextDecoder handles UTF-8 BOM automatically)
  return new TextDecoder('utf-8').decode(data);
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

  // Decode with encoding detection (handles UTF-16 and UTF-8)
  const xmlString = decodeXmlBytes(data);
  return parse(xmlString);
}
