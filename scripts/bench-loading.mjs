// Run after building, or use npm run bench:loading.
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { strToU8, zipSync } from 'fflate';
import { generateId, parse, parseCompressed } from 'musicxml-io/core';

const xml = readFileSync(new URL('../tests/fixtures/musicxml_samples/ActorPreludeSample.musicxml', import.meta.url), 'utf8');
const files = {
  'META-INF/container.xml': strToU8('<container><rootfiles><rootfile full-path="score.xml"/></rootfiles></container>'),
  'score.xml': strToU8(xml),
};
const mxl = zipSync(files);
const mxlWithAsset = zipSync({ ...files, 'images/preview.bin': new Uint8Array(8 * 1024 * 1024).fill(42) });

function benchmark(label, fn, iterations) {
  for (let i = 0; i < 10; i++) fn();
  const samples = [];
  for (let run = 0; run < 7; run++) {
    const start = performance.now();
    for (let i = 0; i < iterations; i++) fn();
    samples.push((performance.now() - start) / iterations);
  }
  samples.sort((a, b) => a - b);
  console.log(`${label.padEnd(36)} ${samples[3].toFixed(3)} ms (median of 7 runs)`);
}

console.log(`${process.version}, ${process.platform} ${process.arch}; ActorPreludeSample.musicxml`);
benchmark('generateId × 10,000', () => { for (let i = 0; i < 10000; i++) generateId(); }, 50);
benchmark('parse XML', () => parse(xml), 20);
benchmark('parse MXL', () => parseCompressed(mxl), 20);
benchmark('parse MXL with 8 MiB unused asset', () => parseCompressed(mxlWithAsset), 20);
