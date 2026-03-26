/**
 * Performance benchmark for musicxml-io
 *
 * Usage: npx tsx scripts/benchmark.ts
 *
 * Measures key processing paths:
 *   1. MusicXML parse (txml-based)
 *   2. MusicXML serialize
 *   3. ABC parse + serialize (round-trip)
 *   4. Query (iterateNotes, getChords, buildVoiceToStaffMap)
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  parse,
  serialize,
  parseAbc,
  serializeAbc,
  getAllNotes,
  getChords,
  buildVoiceToStaffMapForPart,
  iterateNotes,
} from '../src';
import type { Score } from '../src';
import { parse as txmlParse } from 'txml';

// ── Helpers ──────────────────────────────────────────────────

function timeSync(label: string, fn: () => void, iterations = 1): { label: string; totalMs: number; avgMs: number; iterations: number } {
  // Warm up
  fn();

  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    fn();
  }
  const totalMs = performance.now() - start;
  return { label, totalMs, avgMs: totalMs / iterations, iterations };
}

function formatResult(r: { label: string; totalMs: number; avgMs: number; iterations: number }): string {
  const avg = r.avgMs < 1 ? `${(r.avgMs * 1000).toFixed(1)}μs` : `${r.avgMs.toFixed(2)}ms`;
  const total = `${r.totalMs.toFixed(1)}ms`;
  return `  ${r.label.padEnd(45)} ${avg.padStart(12)} avg  (${r.iterations}x = ${total})`;
}

// ── Fixtures ─────────────────────────────────────────────────

const FIXTURES_DIR = path.resolve(__dirname, '../tests/fixtures');

const SMALL_XML = fs.readFileSync(path.join(FIXTURES_DIR, 'basic/scale.xml'), 'utf-8');
const MEDIUM_XML = fs.readFileSync(path.join(FIXTURES_DIR, 'musicxml_samples/Dichterliebe01.musicxml'), 'utf-8');
const LARGE_XML = fs.readFileSync(path.join(FIXTURES_DIR, 'musicxml_samples/ActorPreludeSample.musicxml'), 'utf-8');

const ABC_SIMPLE = fs.readFileSync(path.join(FIXTURES_DIR, 'abc/twinkle.abc'), 'utf-8');
const ABC_COMPLEX = fs.readFileSync(path.join(FIXTURES_DIR, 'abc/bach_little_fugue.abc'), 'utf-8');

// Pre-parse for serialize / query benchmarks
const smallScore = parse(SMALL_XML);
const mediumScore = parse(MEDIUM_XML);
const largeScore = parse(LARGE_XML);

const abcSimpleScore = parseAbc(ABC_SIMPLE);
const abcComplexScore = parseAbc(ABC_COMPLEX);

// ── Benchmark suites ─────────────────────────────────────────

function benchmarkParse() {
  console.log('\n── Parse (MusicXML → Score) ──');

  const results = [
    // Full pipeline (XML → Score)
    timeSync('parse full: small (scale.xml)', () => parse(SMALL_XML), 100),
    timeSync('parse full: medium (Dichterliebe01)', () => parse(MEDIUM_XML), 20),
    timeSync('parse full: large (ActorPrelude)', () => parse(LARGE_XML), 5),

    // txml only (XML → DOM)
    timeSync('txml only: small', () => txmlParse(SMALL_XML), 100),
    timeSync('txml only: medium', () => txmlParse(MEDIUM_XML), 20),
    timeSync('txml only: large', () => txmlParse(LARGE_XML), 5),
  ];
  results.forEach(r => console.log(formatResult(r)));

  // Compute Score construction overhead
  console.log('\n  --- Breakdown (large) ---');
  const xmlTime = results[5].avgMs;  // txml, large
  const fullTime = results[2].avgMs; // full parse, large
  const buildTime = fullTime - xmlTime;
  console.log(`  txml parsing:       ${xmlTime.toFixed(2)}ms (${(xmlTime / fullTime * 100).toFixed(0)}%)`);
  console.log(`  Score construction: ${buildTime.toFixed(2)}ms (${(buildTime / fullTime * 100).toFixed(0)}%)`);
}

function benchmarkSerialize() {
  console.log('\n── Serialize (Score → MusicXML) ──');
  const results = [
    timeSync('serialize: small', () => serialize(smallScore), 100),
    timeSync('serialize: medium', () => serialize(mediumScore), 20),
    timeSync('serialize: large', () => serialize(largeScore), 5),
  ];
  results.forEach(r => console.log(formatResult(r)));
}

function benchmarkAbc() {
  console.log('\n── ABC (parse + serialize round-trip) ──');
  const results = [
    timeSync('abc parse: simple (twinkle)', () => parseAbc(ABC_SIMPLE), 100),
    timeSync('abc parse: complex (bach fugue)', () => parseAbc(ABC_COMPLEX), 20),
    timeSync('abc serialize: simple', () => serializeAbc(abcSimpleScore), 100),
    timeSync('abc serialize: complex', () => serializeAbc(abcComplexScore), 20),
  ];
  results.forEach(r => console.log(formatResult(r)));
}

function benchmarkQuery() {
  console.log('\n── Query ──');
  const measure = mediumScore.parts[0].measures[0];
  const largeMeasure = largeScore.parts[0].measures[0];

  const results = [
    timeSync('getAllNotes: medium score', () => {
      getAllNotes(mediumScore);
    }, 50),
    timeSync('getAllNotes: large score', () => {
      getAllNotes(largeScore);
    }, 10),
    timeSync('iterateNotes (consume): medium', () => {
      for (const _ of iterateNotes(mediumScore)) { /* drain */ }
    }, 50),
    timeSync('iterateNotes (consume): large', () => {
      for (const _ of iterateNotes(largeScore)) { /* drain */ }
    }, 10),
    timeSync('getChords: medium measure', () => {
      getChords(measure);
    }, 500),
    timeSync('getChords: large measure', () => {
      getChords(largeMeasure);
    }, 500),
    timeSync('buildVoiceToStaffMap: medium part', () => {
      buildVoiceToStaffMapForPart(mediumScore.parts[0]);
    }, 50),
    timeSync('buildVoiceToStaffMap: large part', () => {
      buildVoiceToStaffMapForPart(largeScore.parts[0]);
    }, 10),
  ];
  results.forEach(r => console.log(formatResult(r)));
}

// ── Score stats ──────────────────────────────────────────────

function printScoreStats(label: string, score: Score) {
  let totalNotes = 0;
  let totalMeasures = 0;
  for (const part of score.parts) {
    totalMeasures += part.measures.length;
    for (const measure of part.measures) {
      for (const entry of measure.entries) {
        if (entry.type === 'note') totalNotes++;
      }
    }
  }
  console.log(`  ${label}: ${score.parts.length} parts, ${totalMeasures} measures, ${totalNotes} notes`);
}

// ── Main ─────────────────────────────────────────────────────

console.log('=== musicxml-io Performance Benchmark ===');
console.log(`Node ${process.version}, ${process.platform} ${process.arch}`);
console.log('');
console.log('Score sizes:');
printScoreStats('small  (scale.xml)', smallScore);
printScoreStats('medium (Dichterliebe01)', mediumScore);
printScoreStats('large  (ActorPrelude)', largeScore);

benchmarkParse();
benchmarkSerialize();
benchmarkAbc();
benchmarkQuery();

console.log('\n=== Done ===');
