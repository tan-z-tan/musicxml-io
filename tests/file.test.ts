import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { parse } from '../src/parser';
import { parseFile, serializeToFile } from '../src/file';
import { isCompressed } from '../src/compressed';

const fixturesPath = join(__dirname, 'fixtures');
const lilypondPath = join(fixturesPath, 'lilypond', 'xmlFiles');
const tempPath = join(__dirname, 'temp');

describe('File Operations', () => {
  const cleanupFiles: string[] = [];

  afterEach(() => {
    for (const file of cleanupFiles) {
      if (existsSync(file)) {
        unlinkSync(file);
      }
    }
    cleanupFiles.length = 0;
  });

  describe('parseFile', () => {
    it('should parse .xml file', async () => {
      const filePath = join(fixturesPath, 'basic/single-note.xml');
      const score = await parseFile(filePath);

      expect(score.parts.length).toBe(1);
      expect(score.parts[0].measures.length).toBe(1);
    });

    it('should parse LilyPond test file', async () => {
      const filePath = join(lilypondPath, '01a-Pitches-Pitches.xml');
      const score = await parseFile(filePath);

      expect(score.parts.length).toBeGreaterThan(0);
    });

    it('should parse .mxl file', async () => {
      const filePath = join(lilypondPath, '90a-Compressed-MusicXML.mxl');
      const score = await parseFile(filePath);

      expect(score.parts.length).toBeGreaterThan(0);
    });
  });

  describe('serializeToFile', () => {
    it('should write .xml file', async () => {
      const sourcePath = join(fixturesPath, 'basic/single-note.xml');
      const score = await parseFile(sourcePath);

      const outputPath = join(tempPath, 'test-output.xml');
      cleanupFiles.push(outputPath);

      await serializeToFile(score, outputPath);

      expect(existsSync(outputPath)).toBe(true);

      const content = readFileSync(outputPath, 'utf-8');
      expect(content).toContain('<?xml');
      expect(content).toContain('score-partwise');
    });

    it('should write .mxl file', async () => {
      const sourcePath = join(fixturesPath, 'basic/single-note.xml');
      const score = await parseFile(sourcePath);

      const outputPath = join(tempPath, 'test-output.mxl');
      cleanupFiles.push(outputPath);

      await serializeToFile(score, outputPath);

      expect(existsSync(outputPath)).toBe(true);

      const content = readFileSync(outputPath);
      expect(isCompressed(new Uint8Array(content))).toBe(true);
    });

    it('should round-trip through files', async () => {
      const sourcePath = join(fixturesPath, 'basic/scale.xml');
      const original = await parseFile(sourcePath);

      const outputPath = join(tempPath, 'roundtrip-test.xml');
      cleanupFiles.push(outputPath);

      await serializeToFile(original, outputPath);
      const reparsed = await parseFile(outputPath);

      expect(reparsed.parts.length).toBe(original.parts.length);
      expect(reparsed.parts[0].measures.length).toBe(original.parts[0].measures.length);

      const originalNotes = original.parts[0].measures[0].entries.filter(e => e.type === 'note');
      const reparsedNotes = reparsed.parts[0].measures[0].entries.filter(e => e.type === 'note');

      expect(reparsedNotes.length).toBe(originalNotes.length);
    });
  });
});
