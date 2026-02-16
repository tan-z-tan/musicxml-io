import { parseAbc, serializeAbc } from '../src/index.js';
import { readFileSync } from 'fs';

const files = [
  'rudemex_1814.abc',
  'rudemex_abbots_bromley.abc',
  'rudemex_30ars_jiggen.abc',
  'rudemex_adelphi_polka.abc',
  'rudemex_5time_waltz.abc',
  'rudemex_a_bruxa.abc'
];

const norm = (s: string) => s.replace(/[ \t]+/g, '').replace(/\n+/g, '\n').trim();

for (const file of files) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`=== ${file} ===`);
  console.log('='.repeat(60));
  const orig = readFileSync(`tests/fixtures/abc/${file}`, 'utf-8');
  try {
    const score = parseAbc(orig);
    const rt = serializeAbc(score);
    const origN = norm(orig);
    const rtN = norm(rt);
    if (origN === rtN) {
      console.log('  PASS');
    } else {
      const origLines = origN.split('\n');
      const rtLines = rtN.split('\n');
      let diffCount = 0;
      for (let i = 0; i < Math.max(origLines.length, rtLines.length); i++) {
        if (origLines[i] !== rtLines[i]) {
          diffCount++;
          console.log(`  DIFF line ${i + 1}:`);
          console.log(`    ORIG: ${origLines[i] || '(missing)'}`);
          console.log(`    RT:   ${rtLines[i] || '(missing)'}`);
        }
      }
      console.log(`  Total diffs: ${diffCount}`);
    }
  } catch (e: any) {
    console.log(`  ERROR: ${e.message}`);
  }
}
