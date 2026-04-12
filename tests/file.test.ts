import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { parse } from '../src';
import { parseFile, serializeToFile, decodeBuffer } from '../src/file';
import { isCompressed, parseAuto } from '../src';

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

  describe('decodeBuffer / UTF-16 encoding', () => {
    const minimalXml = '<?xml version="1.0" encoding="UTF-8"?>\n<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1"><note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>whole</type></note></measure></part></score-partwise>';

    it('should decode UTF-16 LE buffer (with BOM)', () => {
      // Build UTF-16 LE buffer: BOM (FF FE) + UTF-16 LE encoded string
      const utf16leBuf = Buffer.from('\uFEFF' + minimalXml, 'utf16le');
      const decoded = decodeBuffer(utf16leBuf);
      expect(decoded).not.toContain('\uFEFF');
      expect(decoded).toContain('score-partwise');
      expect(decoded).toContain('<step>C</step>');
    });

    it('should decode UTF-16 BE buffer (with BOM)', () => {
      // Build UTF-16 BE buffer: BOM (FE FF) + big-endian encoded chars
      const chars = '\uFEFF' + minimalXml;
      const utf16beBuf = Buffer.alloc(chars.length * 2);
      for (let i = 0; i < chars.length; i++) {
        utf16beBuf.writeUInt16BE(chars.charCodeAt(i), i * 2);
      }
      const decoded = decodeBuffer(utf16beBuf);
      expect(decoded).not.toContain('\uFEFF');
      expect(decoded).toContain('score-partwise');
      expect(decoded).toContain('<step>C</step>');
    });

    it('should parse a UTF-16 LE XML file via parseFile', async () => {
      const sourcePath = join(fixturesPath, 'basic/single-note.xml');
      const utf8Content = readFileSync(sourcePath, 'utf-8');
      const utf16leBuf = Buffer.from('\uFEFF' + utf8Content, 'utf16le');

      const tmpPath = join(__dirname, 'temp', 'single-note-utf16le.xml');
      const { writeFileSync } = await import('fs');
      writeFileSync(tmpPath, utf16leBuf);
      cleanupFiles.push(tmpPath);

      const score = await parseFile(tmpPath);
      expect(score.metadata.workTitle).toBe('Single Note');
      expect(score.parts[0].measures[0].entries[0].type).toBe('note');
    });

    it('should parse a UTF-16 LE Uint8Array via parseAuto', () => {
      const utf16leBytes = new Uint8Array(Buffer.from('\uFEFF' + minimalXml, 'utf16le'));
      const score = parseAuto(utf16leBytes);
      expect(score.parts).toHaveLength(1);
      expect(score.parts[0].measures).toHaveLength(1);
    });

    it('should parse a UTF-16 BE Uint8Array via parseAuto', () => {
      const chars = '\uFEFF' + minimalXml;
      const utf16beBytes = new Uint8Array(chars.length * 2);
      for (let i = 0; i < chars.length; i++) {
        utf16beBytes[i * 2] = chars.charCodeAt(i) >> 8;
        utf16beBytes[i * 2 + 1] = chars.charCodeAt(i) & 0xFF;
      }
      const score = parseAuto(utf16beBytes);
      expect(score.parts).toHaveLength(1);
      expect(score.parts[0].measures).toHaveLength(1);
    });

    it('should parse a UTF-16 LE Uint8Array directly via parse()', () => {
      // parse() now accepts Uint8Array/Buffer directly
      const utf16leBytes = new Uint8Array(Buffer.from('\uFEFF' + minimalXml, 'utf16le'));
      const score = parse(utf16leBytes);
      expect(score.parts).toHaveLength(1);
      expect(score.parts[0].measures[0].entries[0].type).toBe('note');
    });

    it('should parse a UTF-16 BE Buffer directly via parse()', () => {
      const chars = '\uFEFF' + minimalXml;
      const utf16beBuf = Buffer.alloc(chars.length * 2);
      for (let i = 0; i < chars.length; i++) {
        utf16beBuf.writeUInt16BE(chars.charCodeAt(i), i * 2);
      }
      const score = parse(utf16beBuf);
      expect(score.parts).toHaveLength(1);
      expect(score.parts[0].measures[0].entries[0].type).toBe('note');
    });

    it('should throw a helpful error when UTF-16 file is passed as a NUL-byte string', () => {
      // Simulate: readFileSync('utf16be.xml', 'binary') — produces NUL-byte-laden string
      const chars = '\uFEFF' + minimalXml;
      const utf16beBuf = Buffer.alloc(chars.length * 2);
      for (let i = 0; i < chars.length; i++) {
        utf16beBuf.writeUInt16BE(chars.charCodeAt(i), i * 2);
      }
      const garbledString = utf16beBuf.toString('binary');
      expect(garbledString).toContain('\x00'); // confirm NUL bytes present
      // parse() should throw rather than silently corrupt non-ASCII characters
      expect(() => parse(garbledString)).toThrow(/Buffer or Uint8Array/);
    });

    it('should parse MozaChloSample.musicxml (real UTF-16 BE file) via parse() with Buffer', async () => {
      const { readFileSync } = await import('fs');
      const buf = readFileSync(join(fixturesPath, 'musicxml_samples/MozaChloSample.musicxml'));
      const score = parse(new Uint8Array(buf));
      expect(score.metadata?.workTitle).toBe('An Chloe (Page 1)');
      expect(score.parts.length).toBe(2);
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
