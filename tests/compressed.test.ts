import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parse } from '../src/parser';
import { serialize } from '../src/serializer';
import {
  parseCompressed,
  serializeCompressed,
  isCompressed,
  parseAuto,
} from '../src/compressed';

const fixturesPath = join(__dirname, 'fixtures');
const lilypondPath = join(fixturesPath, 'lilypond', 'xmlFiles');

describe('Compressed MusicXML (.mxl)', () => {
  describe('isCompressed', () => {
    it('should detect ZIP files by magic number', () => {
      const zipHeader = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
      expect(isCompressed(zipHeader)).toBe(true);
    });

    it('should return false for XML data', () => {
      const xmlData = new TextEncoder().encode('<?xml version="1.0"?>');
      expect(isCompressed(xmlData)).toBe(false);
    });
  });

  describe('parseCompressed', () => {
    it('should parse .mxl file from LilyPond test suite', () => {
      const mxlPath = join(lilypondPath, '90a-Compressed-MusicXML.mxl');
      const data = readFileSync(mxlPath);

      const score = parseCompressed(new Uint8Array(data));

      expect(score.parts).toBeDefined();
      expect(score.parts.length).toBeGreaterThan(0);
      expect(score.parts[0].measures.length).toBeGreaterThan(0);
    });
  });

  describe('serializeCompressed', () => {
    it('should create valid .mxl file that can be parsed back', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      const mxlData = serializeCompressed(score);

      expect(isCompressed(mxlData)).toBe(true);

      const parsedBack = parseCompressed(mxlData);

      expect(parsedBack.parts.length).toBe(score.parts.length);
      expect(parsedBack.parts[0].measures.length).toBe(score.parts[0].measures.length);

      const originalNote = score.parts[0].measures[0].entries[0];
      const parsedNote = parsedBack.parts[0].measures[0].entries[0];

      if (originalNote.type === 'note' && parsedNote.type === 'note') {
        expect(parsedNote.pitch?.step).toBe(originalNote.pitch?.step);
        expect(parsedNote.pitch?.octave).toBe(originalNote.pitch?.octave);
      }
    });

    it('should preserve metadata through compression', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);
      score.metadata.workTitle = 'Test Compression';
      score.metadata.creator = { composer: 'Test Composer' };

      const mxlData = serializeCompressed(score);
      const parsedBack = parseCompressed(mxlData);

      expect(parsedBack.metadata.workTitle).toBe('Test Compression');
      expect(parsedBack.metadata.creator?.composer).toBe('Test Composer');
    });
  });

  describe('parseAuto', () => {
    it('should parse XML string', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');

      const score = parseAuto(xml);

      expect(score.parts.length).toBe(1);
    });

    it('should parse XML Uint8Array', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const data = new TextEncoder().encode(xml);

      const score = parseAuto(data);

      expect(score.parts.length).toBe(1);
    });

    it('should parse compressed .mxl data', () => {
      const mxlPath = join(lilypondPath, '90a-Compressed-MusicXML.mxl');
      const data = readFileSync(mxlPath);

      const score = parseAuto(new Uint8Array(data));

      expect(score.parts.length).toBeGreaterThan(0);
    });
  });

  describe('round-trip', () => {
    it('should maintain round-trip fidelity for compressed format', () => {
      const mxlPath = join(lilypondPath, '90a-Compressed-MusicXML.mxl');
      const originalData = readFileSync(mxlPath);

      const score = parseCompressed(new Uint8Array(originalData));
      const recompressed = serializeCompressed(score);
      const reparsed = parseCompressed(recompressed);

      expect(reparsed.parts.length).toBe(score.parts.length);

      for (let i = 0; i < score.parts.length; i++) {
        expect(reparsed.parts[i].measures.length).toBe(score.parts[i].measures.length);
      }
    });
  });
});
