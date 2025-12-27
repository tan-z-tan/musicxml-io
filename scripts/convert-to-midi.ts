import { parseFile, serializeToFile } from '../src/file';
import { basename, dirname, join } from 'path';

async function main() {
  const inputPath = process.argv[2];

  if (!inputPath) {
    console.error('Usage: npx tsx scripts/convert-to-midi.ts <input.musicxml> [output.mid]');
    process.exit(1);
  }

  let outputPath = process.argv[3];
  if (!outputPath) {
    // Default output path: same directory, same name with .mid extension
    const dir = dirname(inputPath);
    const base = basename(inputPath).replace(/\.(musicxml|xml|mxl)$/i, '');
    outputPath = join(dir, `${base}.mid`);
  }

  console.log(`Parsing: ${inputPath}`);
  const score = await parseFile(inputPath);

  console.log(`Converting to MIDI: ${outputPath}`);
  await serializeToFile(score, outputPath);

  console.log('Done!');
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
