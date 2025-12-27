import { readFileSync } from 'fs';
import { parse } from '../src/importers/musicxml';
import { decodeBuffer } from '../src/file';
import { serialize } from '../src/exporters/musicxml';

const filePath = process.argv[2] || 'tests/fixtures/basic/single-note.xml';

const original = decodeBuffer(readFileSync(filePath));
const score = parse(original);
const roundtrip = serialize(score);

console.log('=== ORIGINAL ===');
console.log(original);
console.log('\n=== ROUNDTRIP ===');
console.log(roundtrip);
console.log('\n=== DIFF (lines unique to each) ===');

const origLines = original.split('\n').map(l => l.trim()).filter(l => l);
const rtLines = roundtrip.split('\n').map(l => l.trim()).filter(l => l);

const origSet = new Set(origLines);
const rtSet = new Set(rtLines);

const onlyInOrig = origLines.filter(l => !rtSet.has(l));
const onlyInRt = rtLines.filter(l => !origSet.has(l));

if (onlyInOrig.length > 0) {
  console.log('\nOnly in ORIGINAL:');
  onlyInOrig.forEach(l => console.log('  - ' + l));
}

if (onlyInRt.length > 0) {
  console.log('\nOnly in ROUNDTRIP:');
  onlyInRt.forEach(l => console.log('  + ' + l));
}

if (onlyInOrig.length === 0 && onlyInRt.length === 0) {
  console.log('\nNo differences (ignoring whitespace)!');
}
