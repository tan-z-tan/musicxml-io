#!/usr/bin/env npx ts-node

/**
 * Roundtrip Coverage Measurement Script
 *
 * Properly compares original XML with roundtrip output by:
 * 1. Parsing both XMLs into structured objects
 * 2. Recursively comparing elements, attributes, and text values
 * 3. Reporting detailed differences
 */

import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from 'fs';
import { join, relative } from 'path';
import { XMLParser } from 'fast-xml-parser';
import { parse } from '../src/importers/musicxml';
import { serialize } from '../src/exporters/musicxml';
import { decodeBuffer } from '../src/file';

// ============================================================
// Types
// ============================================================

interface Difference {
  path: string;
  type: 'missing' | 'added' | 'value_mismatch' | 'attribute_missing' | 'attribute_mismatch';
  expected?: unknown;
  actual?: unknown;
}

interface FileScore {
  file: string;
  totalNodes: number;
  matchedNodes: number;
  addedNodes: number;  // Penalty: extra elements in roundtrip
  totalAttributes: number;
  matchedAttributes: number;
  totalTextValues: number;
  matchedTextValues: number;
  nodeScore: number;
  attributeScore: number;
  textScore: number;
  overallScore: number;
  differences: Difference[];
}

interface CoverageReport {
  timestamp: string;
  summary: {
    totalFiles: number;
    parseErrors: number;
    averageNodeScore: number;
    averageAttributeScore: number;
    averageTextScore: number;
    averageOverallScore: number;
    totalNodes: number;
    matchedNodes: number;
    addedNodes: number;
    totalAttributes: number;
    matchedAttributes: number;
    totalTextValues: number;
    matchedTextValues: number;
  };
  files: FileScore[];
  commonMissingElements: { element: string; count: number }[];
  commonMissingAttributes: { path: string; count: number }[];
  parseErrors: { file: string; error: string }[];
}

// ============================================================
// XML Parsing
// ============================================================

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  preserveOrder: true,
  trimValues: false,  // Preserve whitespace for accurate comparison
  parseTagValue: false,
  parseAttributeValue: false,
});

function parseXml(xml: string): unknown[] {
  return xmlParser.parse(xml);
}

// ============================================================
// Deep Comparison
// ============================================================

interface CompareStats {
  totalNodes: number;
  matchedNodes: number;
  addedNodes: number;  // Penalty for extra elements in roundtrip
  totalAttributes: number;
  matchedAttributes: number;
  totalTextValues: number;
  matchedTextValues: number;
  differences: Difference[];
}

function compareXml(original: unknown[], roundtrip: unknown[]): CompareStats {
  const stats: CompareStats = {
    totalNodes: 0,
    matchedNodes: 0,
    addedNodes: 0,
    totalAttributes: 0,
    matchedAttributes: 0,
    totalTextValues: 0,
    matchedTextValues: 0,
    differences: [],
  };

  compareNodes(original, roundtrip, '', stats);
  return stats;
}

// Attributes that define an element's identity for matching
const IDENTITY_ATTRIBUTES = new Set(['id', 'number', 'type', 'location', 'placement', 'part-id']);

// Create a signature for an element to match regardless of order
function getElementSignature(node: unknown, tagName: string): string {
  const attrs = getAttributes(node);
  // Using only tagName and identity attributes for matching.
  // This allows nodes to match even if display attributes (like width, default-x) differ.
  const identityAttrStr = Object.entries(attrs)
    .filter(([k]) => IDENTITY_ATTRIBUTES.has(k))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join(',');

  return `${tagName}|${identityAttrStr}`;
}

function compareNodes(
  original: unknown[],
  roundtrip: unknown[],
  path: string,
  stats: CompareStats
): void {
  // Build maps of elements by tag name for comparison
  const origMap = buildElementMap(original);
  const rtMap = buildElementMap(roundtrip);

  // Check all original elements
  for (const [tagName, origElements] of origMap.entries()) {
    const rtElements = rtMap.get(tagName) || [];

    // Build signature map for order-independent matching
    const rtSignatures = new Map<string, { el: unknown; used: boolean; idx: number }>();
    rtElements.forEach((el, idx) => {
      const sig = getElementSignature(el, tagName);
      // If duplicate signature, append index to make unique
      const key = rtSignatures.has(sig) ? `${sig}#${idx}` : sig;
      rtSignatures.set(key, { el, used: false, idx });
    });

    for (let i = 0; i < origElements.length; i++) {
      const origEl = origElements[i];
      const origSig = getElementSignature(origEl, tagName);
      const elementPath = `${path}/${tagName}[${i}]`;

      stats.totalNodes++;

      // Find matching element by signature (order-independent)
      let matchedEntry: { el: unknown; used: boolean; idx: number } | undefined;
      for (const [sig, entry] of rtSignatures.entries()) {
        if (!entry.used && (sig === origSig || sig.startsWith(origSig + '#'))) {
          matchedEntry = entry;
          entry.used = true;
          break;
        }
      }

      if (!matchedEntry) {
        stats.differences.push({
          path: elementPath,
          type: 'missing',
          expected: summarizeElement(origEl),
        });
        // Count all nested nodes as missing too
        countNestedNodes(origEl, stats);
        continue;
      }

      stats.matchedNodes++;

      // Compare attributes
      compareAttributes(origEl, matchedEntry.el, elementPath, stats);

      // Compare children
      const origChildren = getChildren(origEl, tagName);
      const rtChildren = getChildren(matchedEntry.el, tagName);

      if (origChildren.length > 0 || rtChildren.length > 0) {
        compareNodes(origChildren, rtChildren, elementPath, stats);
      }
    }

    // Count unmatched roundtrip elements as added (penalty)
    for (const [, entry] of rtSignatures.entries()) {
      if (!entry.used) {
        stats.addedNodes++;
        stats.differences.push({
          path: `${path}/${tagName}[+${entry.idx}]`,
          type: 'added',
          actual: summarizeElement(entry.el),
        });
      }
    }
  }

  // Check for completely new tag names in roundtrip (not in original at all)
  for (const [tagName, rtElements] of rtMap.entries()) {
    if (!origMap.has(tagName)) {
      for (let i = 0; i < rtElements.length; i++) {
        stats.addedNodes++;
        stats.differences.push({
          path: `${path}/${tagName}[+${i}]`,
          type: 'added',
          actual: summarizeElement(rtElements[i]),
        });
      }
    }
  }
}

// Elements to ignore in comparison (not meaningful for roundtrip)
const IGNORED_ELEMENTS = new Set(['?xml', '!DOCTYPE', '#text']);

// Attributes to ignore (serializer always outputs these with fixed values)
const IGNORED_ATTRIBUTES = new Set(['version']);

function buildElementMap(nodes: unknown[]): Map<string, unknown[]> {
  const map = new Map<string, unknown[]>();

  for (const node of nodes) {
    if (typeof node !== 'object' || node === null) continue;

    for (const key of Object.keys(node as object)) {
      if (key === ':@') continue; // Skip attributes object

      // Skip ignored elements (XML declaration, DOCTYPE, whitespace text nodes)
      if (IGNORED_ELEMENTS.has(key)) continue;

      let existing = map.get(key) || [];
      existing.push(node);
      map.set(key, existing);
    }
  }

  return map;
}

function getChildren(node: unknown, tagName: string): unknown[] {
  if (typeof node !== 'object' || node === null) return [];
  const obj = node as Record<string, unknown>;
  const children = obj[tagName];
  if (Array.isArray(children)) return children;
  return [];
}

function compareAttributes(
  origNode: unknown,
  rtNode: unknown,
  path: string,
  stats: CompareStats
): void {
  const origAttrs = getAttributes(origNode);
  const rtAttrs = getAttributes(rtNode);

  // Check original attributes
  for (const [name, value] of Object.entries(origAttrs)) {
    // Skip ignored attributes
    if (IGNORED_ATTRIBUTES.has(name)) continue;

    stats.totalAttributes++;
    const rtValue = rtAttrs[name];

    if (rtValue === undefined) {
      stats.differences.push({
        path: `${path}/@${name}`,
        type: 'attribute_missing',
        expected: value,
      });
    } else if (String(rtValue) !== String(value)) {
      stats.differences.push({
        path: `${path}/@${name}`,
        type: 'attribute_mismatch',
        expected: value,
        actual: rtValue,
      });
    } else {
      stats.matchedAttributes++;
    }
  }

  // Check text content (skip whitespace-only text)
  const origText = getTextContent(origNode);
  const rtText = getTextContent(rtNode);

  if (origText !== null && origText.trim() !== '') {
    stats.totalTextValues++;
    if (rtText === null || rtText.trim() === '') {
      stats.differences.push({
        path: `${path}/#text`,
        type: 'missing',
        expected: origText,
      });
    } else if (normalizeText(origText) !== normalizeText(rtText)) {
      stats.differences.push({
        path: `${path}/#text`,
        type: 'value_mismatch',
        expected: origText,
        actual: rtText,
      });
    } else {
      stats.matchedTextValues++;
    }
  }
}

function getAttributes(node: unknown): Record<string, string> {
  if (typeof node !== 'object' || node === null) return {};
  const obj = node as Record<string, unknown>;
  const attrs = obj[':@'];
  if (typeof attrs !== 'object' || attrs === null) return {};

  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(attrs as object)) {
    if (key.startsWith('@_')) {
      result[key.slice(2)] = String(value);
    }
  }
  return result;
}

function getTextContent(node: unknown): string | null {
  if (typeof node !== 'object' || node === null) return null;

  // Look for #text in the node's children
  for (const key of Object.keys(node as object)) {
    if (key === ':@') continue;
    const children = (node as Record<string, unknown>)[key];
    if (Array.isArray(children)) {
      for (const child of children) {
        if (typeof child === 'object' && child !== null && '#text' in child) {
          return String((child as Record<string, unknown>)['#text']);
        }
      }
    }
  }
  return null;
}

function normalizeText(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

function countNestedNodes(node: unknown, stats: CompareStats): void {
  if (typeof node !== 'object' || node === null) return;

  for (const key of Object.keys(node as object)) {
    if (key === ':@') {
      // Count attributes
      const attrs = (node as Record<string, unknown>)[':@'];
      if (typeof attrs === 'object' && attrs !== null) {
        stats.totalAttributes += Object.keys(attrs as object).length;
      }
      continue;
    }

    // Skip ignored elements
    if (IGNORED_ELEMENTS.has(key)) continue;

    const children = (node as Record<string, unknown>)[key];
    if (Array.isArray(children)) {
      for (const child of children) {
        if (typeof child === 'object' && child !== null) {
          // Skip text nodes (handled separately with non-empty check)
          if ('#text' in child) {
            const textValue = String((child as Record<string, unknown>)['#text']);
            if (textValue.trim() !== '') {
              stats.totalTextValues++;
            }
          } else {
            stats.totalNodes++;
            countNestedNodes(child, stats);
          }
        }
      }
    }
  }
}

function summarizeElement(node: unknown): string {
  if (typeof node !== 'object' || node === null) return String(node);

  const keys = Object.keys(node as object).filter(k => k !== ':@');
  if (keys.length === 0) return '(empty)';

  const tagName = keys[0];
  const attrs = getAttributes(node);
  const attrStr = Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ');

  return attrStr ? `<${tagName} ${attrStr}>` : `<${tagName}>`;
}

// ============================================================
// File Discovery
// ============================================================

function findXmlFiles(dir: string): string[] {
  const files: string[] = [];

  if (!existsSync(dir)) return files;

  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      files.push(...findXmlFiles(fullPath));
    } else if (entry.endsWith('.xml') || entry.endsWith('.musicxml')) {
      files.push(fullPath);
    }
  }

  return files;
}

// ============================================================
// Main Analysis
// ============================================================

function analyzeFile(filePath: string): FileScore | { error: string } {
  try {
    // Read as buffer to handle encoding
    const fileBuffer = readFileSync(filePath);
    const originalText = decodeBuffer(fileBuffer);
    const originalXml = originalText;

    // Roundtrip: parse to internal representation, then serialize back
    const score = parse(originalXml);
    const roundtripXml = serialize(score);

    // Parse both XMLs for comparison
    const originalParsed = parseXml(originalXml);
    const roundtripParsed = parseXml(roundtripXml);

    // Compare
    const stats = compareXml(originalParsed, roundtripParsed);

    const nodeScore = stats.totalNodes > 0 ? stats.matchedNodes / stats.totalNodes : 1;
    const attributeScore = stats.totalAttributes > 0 ? stats.matchedAttributes / stats.totalAttributes : 1;
    const textScore = stats.totalTextValues > 0 ? stats.matchedTextValues / stats.totalTextValues : 1;

    // Weighted overall score with penalty for added nodes
    const totalItems = stats.totalNodes + stats.totalAttributes + stats.totalTextValues;
    const matchedItems = stats.matchedNodes + stats.matchedAttributes + stats.matchedTextValues;
    const penalty = stats.addedNodes;  // Penalty for extra elements
    const overallScore = totalItems > 0 ? Math.max(0, (matchedItems - penalty) / totalItems) : 1;

    return {
      file: filePath,
      totalNodes: stats.totalNodes,
      matchedNodes: stats.matchedNodes,
      addedNodes: stats.addedNodes,
      totalAttributes: stats.totalAttributes,
      matchedAttributes: stats.matchedAttributes,
      totalTextValues: stats.totalTextValues,
      matchedTextValues: stats.matchedTextValues,
      nodeScore,
      attributeScore,
      textScore,
      overallScore,
      differences: stats.differences.slice(0, 50), // Limit to first 50 differences
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

function generateReport(fixturesPath: string): CoverageReport {
  const files = findXmlFiles(fixturesPath);
  const fileScores: FileScore[] = [];
  const parseErrors: { file: string; error: string }[] = [];

  // Track common issues
  const missingElements: Map<string, number> = new Map();
  const missingAttributes: Map<string, number> = new Map();

  let totalNodes = 0;
  let matchedNodes = 0;
  let addedNodes = 0;
  let totalAttributes = 0;
  let matchedAttributes = 0;
  let totalTextValues = 0;
  let matchedTextValues = 0;

  for (const file of files) {
    const result = analyzeFile(file);
    const relativePath = relative(fixturesPath, file);

    if ('error' in result) {
      parseErrors.push({ file: relativePath, error: result.error });
      continue;
    }

    result.file = relativePath;
    fileScores.push(result);

    // Aggregate stats
    totalNodes += result.totalNodes;
    matchedNodes += result.matchedNodes;
    addedNodes += result.addedNodes;
    totalAttributes += result.totalAttributes;
    matchedAttributes += result.matchedAttributes;
    totalTextValues += result.totalTextValues;
    matchedTextValues += result.matchedTextValues;

    // Track common issues
    for (const diff of result.differences) {
      if (diff.type === 'missing') {
        const element = diff.path.split('/').pop() || diff.path;
        missingElements.set(element, (missingElements.get(element) || 0) + 1);
      } else if (diff.type === 'attribute_missing') {
        missingAttributes.set(diff.path, (missingAttributes.get(diff.path) || 0) + 1);
      }
    }
  }

  // Sort files by score (worst first)
  fileScores.sort((a, b) => a.overallScore - b.overallScore);

  // Build common issues lists
  const commonMissingElements = [...missingElements.entries()]
    .map(([element, count]) => ({ element, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 30);

  const commonMissingAttributes = [...missingAttributes.entries()]
    .map(([path, count]) => ({ path, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 30);

  // Calculate averages
  const n = fileScores.length || 1;
  const averageNodeScore = fileScores.reduce((a, b) => a + b.nodeScore, 0) / n;
  const averageAttributeScore = fileScores.reduce((a, b) => a + b.attributeScore, 0) / n;
  const averageTextScore = fileScores.reduce((a, b) => a + b.textScore, 0) / n;
  const averageOverallScore = fileScores.reduce((a, b) => a + b.overallScore, 0) / n;

  return {
    timestamp: new Date().toISOString(),
    summary: {
      totalFiles: fileScores.length,
      parseErrors: parseErrors.length,
      averageNodeScore,
      averageAttributeScore,
      averageTextScore,
      averageOverallScore,
      totalNodes,
      matchedNodes,
      addedNodes,
      totalAttributes,
      matchedAttributes,
      totalTextValues,
      matchedTextValues,
    },
    files: fileScores,
    commonMissingElements,
    commonMissingAttributes,
    parseErrors,
  };
}

// ============================================================
// Output Formatting
// ============================================================

function formatPercent(n: number): string {
  return (n * 100).toFixed(1) + '%';
}

function printReport(report: CoverageReport): void {
  const { summary, files, commonMissingElements, commonMissingAttributes, parseErrors } = report;

  console.log('\n' + '='.repeat(70));
  console.log('  ROUNDTRIP COVERAGE REPORT (Deep Comparison)');
  console.log('='.repeat(70));
  console.log(`  Generated: ${report.timestamp}`);
  console.log('');

  // Summary
  console.log('  SUMMARY');
  console.log('  ' + '-'.repeat(50));
  console.log(`  Total files analyzed:     ${summary.totalFiles}`);
  console.log(`  Parse errors:             ${parseErrors.length}`);
  console.log('');
  console.log(`  OVERALL SCORE:            ${formatPercent(summary.averageOverallScore)}`);
  console.log('');
  console.log('  Breakdown:');
  console.log(`    Node coverage:          ${formatPercent(summary.averageNodeScore)}`);
  console.log(`      (${summary.matchedNodes.toLocaleString()} / ${summary.totalNodes.toLocaleString()} nodes)`);
  console.log(`    Attribute coverage:     ${formatPercent(summary.averageAttributeScore)}`);
  console.log(`      (${summary.matchedAttributes.toLocaleString()} / ${summary.totalAttributes.toLocaleString()} attributes)`);
  console.log(`    Text value coverage:    ${formatPercent(summary.averageTextScore)}`);
  console.log(`      (${summary.matchedTextValues.toLocaleString()} / ${summary.totalTextValues.toLocaleString()} values)`);
  console.log(`    Added nodes (penalty):  ${summary.addedNodes.toLocaleString()}`);
  console.log('');

  // Common missing elements
  if (commonMissingElements.length > 0) {
    console.log('  COMMONLY MISSING ELEMENTS (top 20)');
    console.log('  ' + '-'.repeat(50));
    for (const item of commonMissingElements.slice(0, 20)) {
      console.log(`    ${item.element.padEnd(40)} ${item.count}`);
    }
    console.log('');
  }

  // Common missing attributes
  if (commonMissingAttributes.length > 0) {
    console.log('  COMMONLY MISSING ATTRIBUTES (top 15)');
    console.log('  ' + '-'.repeat(50));
    for (const item of commonMissingAttributes.slice(0, 15)) {
      const shortPath = item.path.length > 50 ? '...' + item.path.slice(-47) : item.path;
      console.log(`    ${shortPath.padEnd(50)} ${item.count}`);
    }
    console.log('');
  }

  // Worst files
  console.log('  LOWEST SCORING FILES (bottom 15)');
  console.log('  ' + '-'.repeat(50));
  for (const file of files.slice(0, 15)) {
    const score = formatPercent(file.overallScore).padStart(6);
    console.log(`  ${score}  ${file.file}`);

    // Show first few differences
    const diffs = file.differences.slice(0, 3);
    for (const diff of diffs) {
      const shortPath = diff.path.length > 40 ? '...' + diff.path.slice(-37) : diff.path;
      console.log(`           ${diff.type}: ${shortPath}`);
    }
    if (file.differences.length > 3) {
      console.log(`           ... and ${file.differences.length - 3} more differences`);
    }
  }
  console.log('');

  // Best files
  console.log('  HIGHEST SCORING FILES (top 10)');
  console.log('  ' + '-'.repeat(50));
  const best = [...files].sort((a, b) => b.overallScore - a.overallScore).slice(0, 10);
  for (const file of best) {
    const score = formatPercent(file.overallScore).padStart(6);
    const details = `(${file.matchedNodes}/${file.totalNodes} nodes, ${file.matchedAttributes}/${file.totalAttributes} attrs)`;
    console.log(`  ${score}  ${file.file}`);
    console.log(`           ${details}`);
  }
  console.log('');

  // Parse errors
  if (parseErrors.length > 0) {
    console.log('  PARSE ERRORS');
    console.log('  ' + '-'.repeat(50));
    for (const err of parseErrors.slice(0, 10)) {
      console.log(`  ${err.file}`);
      console.log(`    ${err.error.slice(0, 80)}`);
    }
    console.log('');
  }

  console.log('='.repeat(70));
}

// ============================================================
// Main
// ============================================================

const fixturesPath = join(__dirname, '../tests/fixtures');
const report = generateReport(fixturesPath);

// Print to console
printReport(report);

// Save JSON report
const jsonPath = join(__dirname, '../coverage-report.json');
writeFileSync(jsonPath, JSON.stringify(report, null, 2));
console.log(`\nJSON report saved to: ${jsonPath}`);

// Exit with non-zero if coverage is below threshold
const threshold = 0.5; // 50% minimum
if (report.summary.averageOverallScore < threshold) {
  console.log(`\nWARNING: Coverage ${formatPercent(report.summary.averageOverallScore)} is below threshold ${formatPercent(threshold)}`);
}
