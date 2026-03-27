import * as fs from 'fs';
import * as path from 'path';
import { parse as txmlParse } from 'txml';

const LARGE_XML = fs.readFileSync(path.resolve(__dirname, '../tests/fixtures/musicxml_samples/ActorPreludeSample.musicxml'), 'utf-8');

const N = 10;

// 1. Default (noChildNodes = HTML tags, keepWhitespace = false)
{
  txmlParse(LARGE_XML);
  const start = performance.now();
  for (let i = 0; i < N; i++) txmlParse(LARGE_XML);
  console.log(`default:                    ${((performance.now() - start) / N).toFixed(2)}ms`);
}

// 2. noChildNodes: [] -- skip the 6-element indexOf check per node
{
  txmlParse(LARGE_XML, { noChildNodes: [] });
  const start = performance.now();
  for (let i = 0; i < N; i++) txmlParse(LARGE_XML, { noChildNodes: [] });
  console.log(`noChildNodes=[]:            ${((performance.now() - start) / N).toFixed(2)}ms`);
}

// 3. keepWhitespace: true -- skip trim() inside txml
{
  txmlParse(LARGE_XML, { keepWhitespace: true });
  const start = performance.now();
  for (let i = 0; i < N; i++) txmlParse(LARGE_XML, { keepWhitespace: true });
  console.log(`keepWhitespace=true:        ${((performance.now() - start) / N).toFixed(2)}ms`);
}

// 4. Both combined
{
  const opts = { noChildNodes: [] as string[], keepWhitespace: true };
  txmlParse(LARGE_XML, opts);
  const start = performance.now();
  for (let i = 0; i < N; i++) txmlParse(LARGE_XML, opts);
  console.log(`both combined:              ${((performance.now() - start) / N).toFixed(2)}ms`);
}

// Count nodes
function countNodes(nodes: any[]): { elements: number; texts: number } {
  let elements = 0, texts = 0;
  for (const node of nodes) {
    if (typeof node === 'string') {
      texts++;
    } else {
      elements++;
      const r = countNodes(node.children);
      elements += r.elements;
      texts += r.texts;
    }
  }
  return { elements, texts };
}

const parsed = txmlParse(LARGE_XML);
const c = countNodes(parsed);
console.log('\nDOM size (default):         ' + c.elements + ' elements, ' + c.texts + ' text nodes');

const parsedWS = txmlParse(LARGE_XML, { keepWhitespace: true });
const cw = countNodes(parsedWS);
console.log('DOM size (keepWhitespace):  ' + cw.elements + ' elements, ' + cw.texts + ' text nodes');
