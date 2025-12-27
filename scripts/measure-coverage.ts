#!/usr/bin/env npx ts-node

/**
 * Roundtrip Coverage Measurement Script
 *
 * Measures how well the parser/serializer preserves MusicXML elements
 * by comparing original XML with roundtrip output.
 */

import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from 'fs';
import { join, relative } from 'path';
import { parse } from '../src/parser';
import { serialize } from '../src/serializer';

// ============================================================
// Types
// ============================================================

interface ElementCount {
  [element: string]: number;
}

interface FileScore {
  file: string;
  originalElements: ElementCount;
  roundtripElements: ElementCount;
  preserved: ElementCount;
  lost: ElementCount;
  added: ElementCount;
  score: number;
  elementScore: number; // unique elements preserved
}

interface CoverageReport {
  timestamp: string;
  summary: {
    totalFiles: number;
    averageScore: number;
    averageElementScore: number;
    totalOriginalElements: number;
    totalPreservedElements: number;
    overallScore: number;
  };
  files: FileScore[];
  lostElementsRanking: { element: string; count: number; files: number }[];
  preservedElements: string[];
  parseErrors: { file: string; error: string }[];
}

// ============================================================
// XML Element Extraction
// ============================================================

function extractElements(xml: string): ElementCount {
  const elements: ElementCount = {};

  // Match opening tags (including self-closing)
  const tagRegex = /<([a-zA-Z][a-zA-Z0-9-]*)/g;
  let match;

  while ((match = tagRegex.exec(xml)) !== null) {
    const tag = match[1];
    // Skip XML declaration and DOCTYPE
    if (tag === 'xml' || tag === 'DOCTYPE') continue;
    elements[tag] = (elements[tag] || 0) + 1;
  }

  return elements;
}

function getUniqueElements(counts: ElementCount): Set<string> {
  return new Set(Object.keys(counts));
}

// ============================================================
// Score Calculation
// ============================================================

function calculateFileScore(original: ElementCount, roundtrip: ElementCount): {
  preserved: ElementCount;
  lost: ElementCount;
  added: ElementCount;
  score: number;
  elementScore: number;
} {
  const preserved: ElementCount = {};
  const lost: ElementCount = {};
  const added: ElementCount = {};

  const originalElements = getUniqueElements(original);
  const roundtripElements = getUniqueElements(roundtrip);

  // Calculate preserved and lost
  for (const [element, count] of Object.entries(original)) {
    const rtCount = roundtrip[element] || 0;
    if (rtCount > 0) {
      preserved[element] = Math.min(count, rtCount);
      if (rtCount < count) {
        lost[element] = count - rtCount;
      }
    } else {
      lost[element] = count;
    }
  }

  // Calculate added (elements in roundtrip but not in original)
  for (const [element, count] of Object.entries(roundtrip)) {
    if (!original[element]) {
      added[element] = count;
    } else if (roundtrip[element] > original[element]) {
      added[element] = roundtrip[element] - original[element];
    }
  }

  // Score based on element instances
  const totalOriginal = Object.values(original).reduce((a, b) => a + b, 0);
  const totalPreserved = Object.values(preserved).reduce((a, b) => a + b, 0);
  const score = totalOriginal > 0 ? totalPreserved / totalOriginal : 0;

  // Score based on unique element types
  const preservedTypes = [...originalElements].filter(e => roundtripElements.has(e)).length;
  const elementScore = originalElements.size > 0 ? preservedTypes / originalElements.size : 0;

  return { preserved, lost, added, score, elementScore };
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
    } else if (entry.endsWith('.xml')) {
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
    const original = readFileSync(filePath, 'utf-8');
    const originalElements = extractElements(original);

    // Roundtrip: parse -> serialize
    const score = parse(original);
    const roundtrip = serialize(score);
    const roundtripElements = extractElements(roundtrip);

    const { preserved, lost, added, score: fileScore, elementScore } =
      calculateFileScore(originalElements, roundtripElements);

    return {
      file: filePath,
      originalElements,
      roundtripElements,
      preserved,
      lost,
      added,
      score: fileScore,
      elementScore,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

function generateReport(fixturesPath: string): CoverageReport {
  const files = findXmlFiles(fixturesPath);
  const fileScores: FileScore[] = [];
  const parseErrors: { file: string; error: string }[] = [];

  // Aggregate lost elements across all files
  const lostElementsMap: Map<string, { count: number; files: Set<string> }> = new Map();
  const allPreservedElements: Set<string> = new Set();

  let totalOriginal = 0;
  let totalPreserved = 0;

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
    totalOriginal += Object.values(result.originalElements).reduce((a, b) => a + b, 0);
    totalPreserved += Object.values(result.preserved).reduce((a, b) => a + b, 0);

    // Track lost elements
    for (const [element, count] of Object.entries(result.lost)) {
      const existing = lostElementsMap.get(element) || { count: 0, files: new Set() };
      existing.count += count;
      existing.files.add(relativePath);
      lostElementsMap.set(element, existing);
    }

    // Track preserved elements
    for (const element of Object.keys(result.preserved)) {
      allPreservedElements.add(element);
    }
  }

  // Sort files by score
  fileScores.sort((a, b) => a.score - b.score);

  // Create lost elements ranking
  const lostElementsRanking = [...lostElementsMap.entries()]
    .map(([element, data]) => ({
      element,
      count: data.count,
      files: data.files.size,
    }))
    .sort((a, b) => b.files - a.files || b.count - a.count);

  // Calculate summary
  const averageScore = fileScores.length > 0
    ? fileScores.reduce((a, b) => a + b.score, 0) / fileScores.length
    : 0;
  const averageElementScore = fileScores.length > 0
    ? fileScores.reduce((a, b) => a + b.elementScore, 0) / fileScores.length
    : 0;

  return {
    timestamp: new Date().toISOString(),
    summary: {
      totalFiles: fileScores.length,
      averageScore,
      averageElementScore,
      totalOriginalElements: totalOriginal,
      totalPreservedElements: totalPreserved,
      overallScore: totalOriginal > 0 ? totalPreserved / totalOriginal : 0,
    },
    files: fileScores,
    lostElementsRanking,
    preservedElements: [...allPreservedElements].sort(),
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
  const { summary, files, lostElementsRanking, preservedElements, parseErrors } = report;

  console.log('\n' + '='.repeat(60));
  console.log('  ROUNDTRIP COVERAGE REPORT');
  console.log('='.repeat(60));
  console.log(`  Generated: ${report.timestamp}`);
  console.log('');

  // Summary
  console.log('  SUMMARY');
  console.log('  ' + '-'.repeat(40));
  console.log(`  Total files analyzed:    ${summary.totalFiles}`);
  console.log(`  Parse errors:            ${parseErrors.length}`);
  console.log('');
  console.log(`  Overall Score:           ${formatPercent(summary.overallScore)}`);
  console.log(`  Average File Score:      ${formatPercent(summary.averageScore)}`);
  console.log(`  Element Type Coverage:   ${formatPercent(summary.averageElementScore)}`);
  console.log('');
  console.log(`  Total elements (orig):   ${summary.totalOriginalElements.toLocaleString()}`);
  console.log(`  Preserved elements:      ${summary.totalPreservedElements.toLocaleString()}`);
  console.log('');

  // Preserved elements
  console.log('  PRESERVED ELEMENT TYPES (' + preservedElements.length + ')');
  console.log('  ' + '-'.repeat(40));
  const chunked = [];
  for (let i = 0; i < preservedElements.length; i += 6) {
    chunked.push(preservedElements.slice(i, i + 6).join(', '));
  }
  for (const chunk of chunked) {
    console.log('  ' + chunk);
  }
  console.log('');

  // Lost elements ranking (top 20)
  console.log('  LOST ELEMENTS (top 20 by affected files)');
  console.log('  ' + '-'.repeat(40));
  console.log('  Element                  Files    Count');
  for (const item of lostElementsRanking.slice(0, 20)) {
    const name = item.element.padEnd(22);
    const filesStr = String(item.files).padStart(5);
    const countStr = String(item.count).padStart(8);
    console.log(`  ${name} ${filesStr} ${countStr}`);
  }
  console.log('');

  // Worst files (bottom 10)
  console.log('  LOWEST SCORING FILES');
  console.log('  ' + '-'.repeat(40));
  for (const file of files.slice(0, 10)) {
    const score = formatPercent(file.score).padStart(6);
    const lostCount = Object.keys(file.lost).length;
    const lostPreview = Object.keys(file.lost).slice(0, 3).join(', ');
    console.log(`  ${score}  ${file.file}`);
    if (lostCount > 0) {
      console.log(`         Lost: ${lostPreview}${lostCount > 3 ? '...' : ''}`);
    }
  }
  console.log('');

  // Best files (top 5)
  console.log('  HIGHEST SCORING FILES');
  console.log('  ' + '-'.repeat(40));
  const best = [...files].sort((a, b) => b.score - a.score).slice(0, 5);
  for (const file of best) {
    const score = formatPercent(file.score).padStart(6);
    console.log(`  ${score}  ${file.file}`);
  }
  console.log('');

  // Parse errors
  if (parseErrors.length > 0) {
    console.log('  PARSE ERRORS');
    console.log('  ' + '-'.repeat(40));
    for (const err of parseErrors) {
      console.log(`  ${err.file}`);
      console.log(`    ${err.error}`);
    }
    console.log('');
  }

  console.log('='.repeat(60));
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
