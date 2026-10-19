// npm run bench:io -- [--baseline=/absolute/path/to/previous/dist]
// Measures the built ESM API. Baseline and current use the same inputs and Score.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';
import * as current from '../dist/musicxml.mjs';

const baselineArg = process.argv.find(arg => arg.startsWith('--baseline='));
const baseline = baselineArg
  ? await import(pathToFileURL(resolve(baselineArg.slice('--baseline='.length), 'musicxml.mjs')))
  : undefined;
const suites = [
  ['small', 'basic/scale.xml', 300],
  ['medium', 'musicxml_samples/Dichterliebe01.musicxml', 30],
  ['large', 'musicxml_samples/ActorPreludeSample.musicxml', 8],
  ['large × 8', 'musicxml_samples/ActorPreludeSample.musicxml', 2, 8],
];

function sample(fn, iterations) {
  const start = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  return (performance.now() - start) / iterations;
}

function benchmark(label, after, before, iterations) {
  for (let i = 0; i < 10; i++) { before?.(); after(); }
  const oldSamples = [];
  const newSamples = [];
  for (let run = 0; run < 9; run++) {
    // Alternate execution order to reduce warm-up/GC/thermal bias.
    if (before && run % 2 === 0) oldSamples.push(sample(before, iterations));
    newSamples.push(sample(after, iterations));
    if (before && run % 2 !== 0) oldSamples.push(sample(before, iterations));
  }
  const median = values => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const ms = median(newSamples);
  const previous = before ? median(oldSamples) : undefined;
  const comparison = previous === undefined ? '' : ` (baseline ${previous.toFixed(3)} ms; ${((1 - ms / previous) * 100).toFixed(1)}% less time)`;
  console.log(`${label.padEnd(26)} ${ms.toFixed(3).padStart(9)} ms${comparison}`);
}

console.log(`${process.version}, ${process.platform} ${process.arch}; median of 9 runs`);
for (const [label, fixture, iterations, copies = 1] of suites) {
  const original = readFileSync(new URL(`../tests/fixtures/${fixture}`, import.meta.url), 'utf8');
  const xml = copies === 1 ? original : original.replace(/(<part(?=\s|>)[^>]*>)([\s\S]*?)(<\/part>)/g,
    (_, start, measures, end) => start + measures.repeat(copies) + end);
  const score = (baseline ?? current).parse(xml);
  benchmark(`${label}: import XML`, () => current.parse(xml), baseline && (() => baseline.parse(xml)), iterations);
  benchmark(`${label}: export XML`, () => current.serialize(score), baseline && (() => baseline.serialize(score)), iterations);
}

for (const name of ['parse', 'serialize', 'serializeUnchecked']) {
  if (!(name in current)) continue;
  const result = await build({
    stdin: { contents: `export { ${name} } from 'musicxml-io/musicxml';`, resolveDir: process.cwd() },
    bundle: true, minify: true, platform: 'browser', format: 'esm', write: false,
    logOverride: { 'ignored-bare-import': 'silent' },
  });
  const bytes = result.outputFiles[0].contents;
  console.log(`${name.padEnd(26)} ${bytes.length} bytes / ${gzipSync(bytes).length} gzip`);
}

// A separate process keeps each version's GC history out of the other's peak.
const memoryWorker = `
  import { readFileSync } from 'node:fs';
  const { parse } = await import(process.argv[1]);
  const source = readFileSync(process.argv[2], 'utf8');
  const xml = source.replace(/(<part(?=\\s|>)[^>]*>)([\\s\\S]*?)(<\\/part>)/g,
    (_, start, measures, end) => start + measures.repeat(8) + end);
  global.gc();
  const score = parse(xml);
  console.log(JSON.stringify({ rss: process.resourceUsage().maxRSS / 1024, parts: score.parts.length }));
`;
for (const [label, entry] of [
  ...(baseline ? [['baseline', pathToFileURL(resolve(baselineArg.slice('--baseline='.length), 'musicxml.mjs')).href]] : []),
  ['current', new URL('../dist/musicxml.mjs', import.meta.url).href],
]) {
  const worker = spawnSync(process.execPath, ['--expose-gc', '--input-type=module', '-e', memoryWorker,
    entry, fileURLToPath(new URL('../tests/fixtures/musicxml_samples/ActorPreludeSample.musicxml', import.meta.url))],
  { encoding: 'utf8' });
  if (worker.status !== 0) throw new Error(worker.stderr || 'Memory benchmark failed');
  const memory = JSON.parse(worker.stdout);
  console.log(`${`large × 8: ${label} peak RSS`.padEnd(32)} ${memory.rss.toFixed(1)} MiB`);
}
