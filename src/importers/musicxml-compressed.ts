import { unzipSync, strFromU8 } from 'fflate';
import { parse } from './musicxml';
import type { Score } from '../types';

/**
 * Parse a compressed MusicXML (.mxl) file
 * @param data - The compressed file data as Uint8Array or Buffer
 * @returns The parsed Score
 */
export function parseCompressed(data: Uint8Array): Score {
  // Find the container.xml to get the rootfile path
  const containerPath = 'META-INF/container.xml';
  const xmlFiles: string[] = [];
  // Scan the directory, but only inflate the manifest. MXL archives can also
  // contain large images, PDFs, audio and other scores we never need to decode.
  const files = unzipSync(data, {
    filter: ({ name }) => {
      if (name.endsWith('.xml') && !name.startsWith('META-INF')) {
        xmlFiles.push(name);
      }
      return name === containerPath;
    },
  });
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
    if (xmlFiles.length === 1) {
      rootFilePath = xmlFiles[0];
    } else {
      // Look for common names
      const commonNames = ['score.xml', 'musicxml.xml'];
      for (const name of commonNames) {
        if (xmlFiles.includes(name)) {
          rootFilePath = name;
          break;
        }
      }
    }
  }

  if (!rootFilePath) {
    throw new Error('Could not find MusicXML file in compressed archive');
  }

  const xmlData = unzipSync(data, {
    filter: ({ name }) => name === rootFilePath,
  })[rootFilePath];
  if (!xmlData) {
    throw new Error('Could not find MusicXML file in compressed archive');
  }
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

  // The uncompressed parser already handles UTF-8 and UTF-16 BOMs.
  return parse(data);
}
