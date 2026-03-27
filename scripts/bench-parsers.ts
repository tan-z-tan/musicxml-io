import { readFileSync } from 'fs';
import { parse as txmlParse } from 'txml';
import { XMLParser } from 'fast-xml-parser';

const xml = readFileSync('tests/fixtures/ActorPrelude.xml', 'utf8');

// txml benchmark
{
  txmlParse(xml);
  const start = performance.now();
  const N = 10;
  for (let i = 0; i < N; i++) txmlParse(xml);
  const elapsed = performance.now() - start;
  console.log(`txml: ${(elapsed / N).toFixed(2)}ms avg (${N}x)`);
}

// fast-xml-parser benchmark
{
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    preserveOrder: true,
    trimValues: false,
  });
  parser.parse(xml);
  const start = performance.now();
  const N = 10;
  for (let i = 0; i < N; i++) parser.parse(xml);
  const elapsed = performance.now() - start;
  console.log(`fast-xml-parser: ${(elapsed / N).toFixed(2)}ms avg (${N}x)`);
}
