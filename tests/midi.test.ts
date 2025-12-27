import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { parse } from '../src/importers';
import { exportMidi } from '../src/exporters';
import { parseFile, serializeToFile } from '../src/file';

const fixturesPath = join(__dirname, 'fixtures');
const tempPath = join(__dirname, 'temp');

describe('MIDI Exporter', () => {
  const cleanupFiles: string[] = [];

  afterEach(() => {
    for (const file of cleanupFiles) {
      if (existsSync(file)) {
        unlinkSync(file);
      }
    }
    cleanupFiles.length = 0;
  });

  describe('exportMidi', () => {
    it('should export a single note to MIDI', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      const midiData = exportMidi(score);

      // Check MIDI header
      expect(midiData[0]).toBe(0x4d); // 'M'
      expect(midiData[1]).toBe(0x54); // 'T'
      expect(midiData[2]).toBe(0x68); // 'h'
      expect(midiData[3]).toBe(0x64); // 'd'

      // Format type should be 1
      expect(midiData[8]).toBe(0x00);
      expect(midiData[9]).toBe(0x01);

      // Should have at least 2 tracks (conductor + 1 part)
      const numTracks = (midiData[10] << 8) | midiData[11];
      expect(numTracks).toBeGreaterThanOrEqual(2);
    });

    it('should export a scale to MIDI', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const midiData = exportMidi(score);

      // Verify MIDI header
      expect(midiData[0]).toBe(0x4d);
      expect(midiData[1]).toBe(0x54);
      expect(midiData[2]).toBe(0x68);
      expect(midiData[3]).toBe(0x64);

      // Should be larger than single note (more events)
      expect(midiData.length).toBeGreaterThan(50);
    });

    it('should export a chord to MIDI', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/chord.xml'), 'utf-8');
      const score = parse(xml);

      const midiData = exportMidi(score);

      // Verify MIDI header
      expect(midiData.slice(0, 4)).toEqual(new Uint8Array([0x4d, 0x54, 0x68, 0x64]));
    });

    it('should respect custom options', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      const midiData = exportMidi(score, {
        ticksPerQuarterNote: 960,
        defaultTempo: 140,
        defaultVelocity: 100,
      });

      // Check division (ticks per quarter note)
      const division = (midiData[12] << 8) | midiData[13];
      expect(division).toBe(960);
    });
  });

  describe('serializeToFile with MIDI', () => {
    it('should write .mid file', async () => {
      const sourcePath = join(fixturesPath, 'basic/scale.xml');
      const score = await parseFile(sourcePath);

      const outputPath = join(tempPath, 'test-output.mid');
      cleanupFiles.push(outputPath);

      await serializeToFile(score, outputPath);

      expect(existsSync(outputPath)).toBe(true);

      const content = readFileSync(outputPath);
      // Verify MIDI header
      expect(content[0]).toBe(0x4d);
      expect(content[1]).toBe(0x54);
      expect(content[2]).toBe(0x68);
      expect(content[3]).toBe(0x64);
    });

    it('should write .midi file', async () => {
      const sourcePath = join(fixturesPath, 'basic/single-note.xml');
      const score = await parseFile(sourcePath);

      const outputPath = join(tempPath, 'test-output.midi');
      cleanupFiles.push(outputPath);

      await serializeToFile(score, outputPath);

      expect(existsSync(outputPath)).toBe(true);
    });
  });

  describe('MIDI note conversion', () => {
    it('should correctly convert C4 to MIDI note 60', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      // Verify the note is C4
      const note = score.parts[0].measures[0].entries[0];
      if (note.type === 'note') {
        expect(note.pitch?.step).toBe('C');
        expect(note.pitch?.octave).toBe(4);
      }

      const midiData = exportMidi(score);

      // Find note-on event (0x90 + channel)
      let foundNoteOn = false;
      for (let i = 0; i < midiData.length - 2; i++) {
        if ((midiData[i] & 0xf0) === 0x90) {
          const noteNumber = midiData[i + 1];
          // C4 should be MIDI note 60
          expect(noteNumber).toBe(60);
          foundNoteOn = true;
          break;
        }
      }
      expect(foundNoteOn).toBe(true);
    });
  });
});
