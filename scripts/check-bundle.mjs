// Exercise the published exports, including the static graph of a lazy ABC import.
// Run with npm run check:bundle (builds dist first).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { relative, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';

const root = new URL('../', import.meta.url);
const cwd = fileURLToPath(root);
const abcMarker = /abc-reference-number|spellings|__abc_field__/;

async function bundle(name, contents, { noZip = false, noValidation = false, lazy = false } = {}) {
  const result = await build({
    absWorkingDir: cwd,
    stdin: { contents, resolveDir: cwd, sourcefile: 'consumer.js' },
    bundle: true,
    minify: true,
    platform: 'browser',
    format: 'esm',
    splitting: true,
    write: false,
    metafile: true,
    outdir: 'bundle-check',
    // tsup emits redundant bare imports of shared chunks; sideEffects:false
    // correctly removes them when bundling the published package.
    logOverride: { 'ignored-bare-import': 'silent' },
  });
  const outputs = result.metafile.outputs;
  const entry = Object.keys(outputs).find(key => outputs[key].entryPoint === 'consumer.js');
  assert.ok(entry, `${name}: entry output exists`);
  const initial = new Set();
  function visit(key) {
    if (initial.has(key)) return;
    initial.add(key);
    for (const item of outputs[key].imports) {
      if (!item.external && item.kind !== 'dynamic-import') visit(item.path);
    }
  }
  visit(entry);
  const initialFiles = result.outputFiles.filter(file => initial.has(relative(cwd, file.path)));
  const initialText = initialFiles.map(file => file.text).join('\n');
  assert.ok(!abcMarker.test(initialText), `${name}: no ABC code in initial bundle`);
  if (noValidation) {
    assert.ok(!/MISSING_DIVISIONS|INVALID_DURATION|Score validation failed/.test(initialText), `${name}: no validator`);
  }
  if (noZip) {
    for (const key of initial) {
      const retained = Object.entries(outputs[key].inputs).filter(([, value]) => value.bytesInOutput > 0);
      assert.ok(!retained.some(([input]) => input.includes('node_modules/fflate/')), `${name}: no ZIP dependency`);
    }
  }
  if (lazy) {
    const deferred = result.outputFiles.filter(file => !initial.has(relative(cwd, file.path)));
    assert.ok(deferred.some(file => abcMarker.test(file.text)), 'ABC is available in a deferred chunk');
  }
  const bytes = initialFiles.reduce((sum, file) => sum + file.contents.length, 0);
  const gzip = initialFiles.reduce((sum, file) => sum + gzipSync(file.contents).length, 0);
  console.log(`${name.padEnd(32)} ${String(bytes).padStart(7)} bytes / ${String(gzip).padStart(6)} gzip (initial)`);
}

await bundle('root: parse', 'export { parse } from "musicxml-io";', { noZip: true });
await bundle('root: MusicXML + MXL', 'export { parseAuto, serialize } from "musicxml-io";');
await bundle('browser: MusicXML + MXL', 'export { parseAuto, serialize } from "musicxml-io/browser";');
await bundle('musicxml subpath', 'export { parse, serialize } from "musicxml-io/musicxml";', { noZip: true });
await bundle('unchecked XML export', 'export { serializeUnchecked } from "musicxml-io/musicxml";', { noZip: true, noValidation: true });
await bundle('unchecked XML roundtrip', 'export { parse, serializeUnchecked } from "musicxml-io/core";', { noZip: true, noValidation: true });
await bundle('compressed subpath', 'export { parseAuto, serializeCompressed } from "musicxml-io/musicxml-compressed";');
await bundle('core with lazy ABC', `
  export { parseAuto, serialize, generateId } from 'musicxml-io/core';
  export async function parseOptionalAbc(input) {
    const { parseAbc } = await import('musicxml-io/abc');
    return parseAbc(input);
  }
`, { lazy: true });

// Source consumers (e.g. a bundler alias) must also eliminate ABC initialization.
await bundle('source: parse', 'export { parse } from "./src/browser.ts";', { noZip: true });

// Check the actual ESM and CJS exports, not just TypeScript source modules.
const require = createRequire(import.meta.url);
const xml = readFileSync(new URL('../tests/fixtures/basic/single-note.xml', import.meta.url), 'utf8');
for (const load of [specifier => import(specifier), specifier => require(specifier)]) {
  const full = await load('musicxml-io');
  const browser = await load('musicxml-io/browser');
  const api = await load('musicxml-io/core');
  const core = await load('musicxml-io/musicxml');
  const compressed = await load('musicxml-io/musicxml-compressed');
  const abc = await load('musicxml-io/abc');
  const midi = await load('musicxml-io/midi');
  const file = await load('musicxml-io/file');
  assert.equal(api.parse, core.parse);
  assert.equal(full.serializeUnchecked, core.serializeUnchecked);
  assert.equal(browser.serializeUnchecked, core.serializeUnchecked);
  assert.equal(full.parseAbc, abc.parseAbc);
  assert.equal(browser.serializeAbc, abc.serializeAbc);
  assert.equal(full.exportMidi, midi.exportMidi);
  assert.equal(full.parseFile, file.parseFile);
  assert.ok(!('parseAbc' in api) && !('exportMidi' in api) && !('parseFile' in api));
  const score = core.parse(xml);
  assert.equal(core.serializeUnchecked(score), core.serialize(score));
  assert.equal(core.parse(core.serialize(score)).metadata.workTitle, 'Single Note');
  assert.equal(compressed.parseAuto(compressed.serializeCompressed(score)).metadata.workTitle, 'Single Note');
  assert.ok(abc.parseAbc(abc.serializeAbc(score)).parts.length > 0);
  assert.ok(abc.parseAbcTunes(abc.serializeAbcTunes([score])).length > 0);
  assert.equal(Buffer.from(midi.exportMidi(score)).subarray(0, 4).toString(), 'MThd');
  assert.equal((await file.parseFile(resolve(cwd, 'tests/fixtures/basic/single-note.xml'))).metadata.workTitle, 'Single Note');
  assert.ok((await file.parseFile(resolve(cwd, 'tests/fixtures/abc/twinkle.abc'))).parts.length > 0);
}
console.log('Bundle isolation and published ESM/CJS entry points passed.');
