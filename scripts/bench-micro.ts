import * as fs from 'fs';
import * as path from 'path';
import { parse, serialize } from '../src';

const LARGE_XML = fs.readFileSync(path.resolve(__dirname, '../tests/fixtures/musicxml_samples/ActorPreludeSample.musicxml'), 'utf-8');
const largeScore = parse(LARGE_XML);

// Micro-benchmark: serialize with profiling
// 1. Measure lines.join('\n') cost
{
  const xml = serialize(largeScore);
  const lines = xml.split('\n');
  console.log(`Output lines: ${lines.length}, chars: ${xml.length}`);
  
  // join cost
  const N = 20;
  const start = performance.now();
  for (let i = 0; i < N; i++) lines.join('\n');
  console.log(`lines.join('\\n'): ${((performance.now() - start) / N).toFixed(2)}ms avg`);
}

// 2. Indent string concatenation cost simulation
{
  const indent = '  ';
  const N = 100000;
  // Pattern A: template literal each time
  const startA = performance.now();
  let sinkA = '';
  for (let i = 0; i < N; i++) {
    sinkA = `${indent}${indent}<note>`;
  }
  const tA = performance.now() - startA;
  
  // Pattern B: precomputed
  const indent2 = indent + indent;
  const startB = performance.now();
  let sinkB = '';
  for (let i = 0; i < N; i++) {
    sinkB = `${indent2}<note>`;
  }
  const tB = performance.now() - startB;
  console.log(`indent concat: template ${tA.toFixed(2)}ms vs precomputed ${tB.toFixed(2)}ms (${N}x)`);
  void sinkA; void sinkB;
}

// 3. Object.entries vs for-in
{
  const obj: Record<string, string | number | boolean | undefined> = {
    id: 'abc', placement: 'above', 'print-frame': undefined, 'default-y': 42, halign: undefined, 'font-size': '12'
  };
  const N = 100000;
  
  // Object.entries
  const startA = performance.now();
  let sinkA = '';
  for (let i = 0; i < N; i++) {
    let r = '';
    for (const [k, v] of Object.entries(obj)) {
      if (v === undefined) continue;
      r += ` ${k}="${v}"`;
    }
    sinkA = r;
  }
  const tA = performance.now() - startA;
  
  // for-in
  const startB = performance.now();
  let sinkB = '';
  for (let i = 0; i < N; i++) {
    let r = '';
    for (const k in obj) {
      const v = obj[k];
      if (v === undefined) continue;
      r += ` ${k}="${v}"`;
    }
    sinkB = r;
  }
  const tB = performance.now() - startB;
  console.log(`attrs: Object.entries ${tA.toFixed(2)}ms vs for-in ${tB.toFixed(2)}ms (${N}x)`);
  void sinkA; void sinkB;
}
