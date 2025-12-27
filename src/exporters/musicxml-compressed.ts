import { zipSync, strToU8 } from 'fflate';
import { serialize, SerializeOptions } from './musicxml';
import type { Score } from '../types';

export type { SerializeOptions };

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
