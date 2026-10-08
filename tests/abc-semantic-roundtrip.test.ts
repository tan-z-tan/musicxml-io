import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { parseAbcTunes, serializeAbc } from '../src';
import { abcSemanticTokens } from './helpers/abcSemantic';

/**
 * ABC → Score → ABC → Score must keep every musical event. The text-level
 * round-trip tests ignore whitespace, which is exactly where ABC encodes
 * beaming, so they missed #109; this compares the two parses note by note.
 * Run `tsx scripts/abc-semantic-roundtrip.ts <dir>` to check a larger corpus.
 */
const dirs = ['abc', 'abc-hard'].map(d => join(__dirname, 'fixtures', d));

describe('ABC semantic round-trip', () => {
  for (const dir of dirs) {
    for (const file of readdirSync(dir).filter(f => f.endsWith('.abc'))) {
      it(`${file} keeps its musical content`, () => {
        for (const s1 of parseAbcTunes(readFileSync(join(dir, file), 'utf-8'))) {
          const s2 = parseAbcTunes(serializeAbc(s1))[0];
          expect(abcSemanticTokens(s2)).toEqual(abcSemanticTokens(s1));
        }
      });
    }
  }
});
