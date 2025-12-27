#!/usr/bin/env tsx
/**
 * MusicXML to MIDI converter script
 *
 * Usage:
 *   npx tsx scripts/convert-to-midi.ts <input.xml> [output.mid]
 *
 * Examples:
 *   npx tsx scripts/convert-to-midi.ts tests/fixtures/basic/scale.xml
 *   npx tsx scripts/convert-to-midi.ts tests/fixtures/basic/scale.xml output.mid
 */

import { readFile, writeFile } from 'fs/promises';
import { basename, dirname, join } from 'path';
import { parse } from '../src/importers/musicxml';
import { exportMidi } from '../src/exporters/midi';

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('MusicXML to MIDI Converter');
    console.log('');
    console.log('Usage:');
    console.log('  npx tsx scripts/convert-to-midi.ts <input.xml> [output.mid]');
    console.log('');
    console.log('Examples:');
    console.log('  npx tsx scripts/convert-to-midi.ts tests/fixtures/basic/scale.xml');
    console.log('  npx tsx scripts/convert-to-midi.ts song.musicxml song.mid');
    process.exit(1);
  }

  const inputPath = args[0];
  const outputPath = args[1] || inputPath.replace(/\.(xml|musicxml|mxl)$/i, '.mid');

  try {
    console.log(`Reading: ${inputPath}`);
    const xmlContent = await readFile(inputPath, 'utf-8');

    console.log('Parsing MusicXML...');
    const score = parse(xmlContent);

    console.log(`  Title: ${score.metadata.workTitle || score.metadata.movementTitle || '(untitled)'}`);
    console.log(`  Parts: ${score.parts.length}`);
    console.log(`  Measures: ${score.parts[0]?.measures.length || 0}`);

    // Count notes
    let totalNotes = 0;
    for (const part of score.parts) {
      for (const measure of part.measures) {
        for (const entry of measure.entries) {
          if (entry.type === 'note' && !entry.rest) {
            totalNotes++;
          }
        }
      }
    }
    console.log(`  Notes: ${totalNotes}`);

    console.log('Converting to MIDI...');
    const midiData = exportMidi(score);

    console.log(`Writing: ${outputPath}`);
    await writeFile(outputPath, midiData);

    console.log(`Done! MIDI file size: ${midiData.length} bytes`);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
