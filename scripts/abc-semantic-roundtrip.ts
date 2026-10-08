/**
 * ABC round-trip check on musical content, not text.
 *
 * parseAbc(abc) and parseAbc(serializeAbc(parseAbc(abc))) are reduced to one
 * token per musical event and compared. Reports the first difference per tune.
 *
 * Usage: tsx scripts/abc-semantic-roundtrip.ts <file-or-dir>... [--verbose]
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { parseAbcTunes, serializeAbc } from '../src';
import type { Score } from '../src/types';
import { abcSemanticTokens as tokens, badMeasures } from '../tests/helpers/abcSemantic';

const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const inputs = args.filter(a => !a.startsWith('--'));

function files(p: string): string[] {
  if (statSync(p).isDirectory()) return readdirSync(p).flatMap(f => files(join(p, f)));
  return p.endsWith('.abc') ? [p] : [];
}

let total = 0, ok = 0, crashed = 0;
const failures = new Map<string, number>();
for (const f of inputs.flatMap(files)) {
  const text = readFileSync(f, 'utf-8');
  let tunes: Score[];
  try { tunes = parseAbcTunes(text); } catch (e) { crashed++; console.log(`PARSE-CRASH ${f}: ${(e as Error).message}`); continue; }
  tunes.forEach((s1, ti) => {
    total++;
    for (const b of badMeasures(s1)) console.log(`MEASURE ${f}#${ti} ${b}`);
    try {
      const abc2 = serializeAbc(s1);
      const s2 = parseAbcTunes(abc2)[0];
      const a = tokens(s1), b = tokens(s2);
      const n = Math.max(a.length, b.length);
      for (let i = 0; i < n; i++) {
        if (a[i] !== b[i]) {
          const key = `${(a[i] ?? '∅').replace(/^P\d+ M\d+ \| /, '').split(' ')[0]}`;
          failures.set(key, (failures.get(key) ?? 0) + 1);
          console.log(`DIFF ${f}#${ti}\n   want ${a[i] ?? '∅'}\n   got  ${b[i] ?? '∅'}`);
          if (verbose) console.log(abc2);
          return;
        }
      }
      ok++;
    } catch (e) { crashed++; console.log(`CRASH ${f}#${ti}: ${(e as Error).message}`); }
  });
}
console.log(`\n${ok}/${total} tunes identical, ${total - ok - crashed} differ, ${crashed} crashed`);
