import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parse } from '../src';

const fixturesPath = join(__dirname, 'fixtures');

describe('Parser', () => {
  describe('basic parsing', () => {
    it('should parse a single note', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      expect(score.metadata.workTitle).toBe('Single Note');
      expect(score.metadata.creators?.find(c => c.type === 'composer')?.value).toBe('Test');
      expect(score.partList).toHaveLength(1);
      const part0 = score.partList[0];
      expect(part0.type).toBe('score-part');
      if (part0.type === 'score-part') {
        expect(part0.id).toBe('P1');
        expect(part0.name).toBe('Piano');
      }

      expect(score.parts).toHaveLength(1);
      expect(score.parts[0].measures).toHaveLength(1);

      const measure = score.parts[0].measures[0];
      expect(measure.number).toBe('1');
      expect(measure.attributes?.divisions).toBe(1);
      expect(measure.attributes?.key?.fifths).toBe(0);
      expect(measure.attributes?.time?.beats).toBe('4');
      expect(measure.attributes?.time?.beatType).toBe(4);
      expect(measure.attributes?.clef).toHaveLength(1);
      expect(measure.attributes?.clef?.[0].sign).toBe('G');
      expect(measure.attributes?.clef?.[0].line).toBe(2);

      expect(measure.entries).toHaveLength(1);
      const note = measure.entries[0];
      expect(note.type).toBe('note');
      if (note.type === 'note') {
        expect(note.pitch?.step).toBe('C');
        expect(note.pitch?.octave).toBe(4);
        expect(note.duration).toBe(4);
        expect(note.voice).toBe(1);
        expect(note.noteType).toBe('whole');
      }
    });

    it('should parse a scale', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      expect(score.metadata.workTitle).toBe('C Major Scale');
      expect(score.parts[0].measures).toHaveLength(2);

      const measure1 = score.parts[0].measures[0];
      expect(measure1.entries).toHaveLength(4);

      const notes = measure1.entries.filter((e) => e.type === 'note');
      expect(notes).toHaveLength(4);

      const expectedSteps = ['C', 'D', 'E', 'F'];
      notes.forEach((note, i) => {
        if (note.type === 'note') {
          expect(note.pitch?.step).toBe(expectedSteps[i]);
          expect(note.pitch?.octave).toBe(4);
          expect(note.noteType).toBe('quarter');
        }
      });
    });

    it('should parse a chord', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/chord.xml'), 'utf-8');
      const score = parse(xml);

      expect(score.metadata.workTitle).toBe('C Major Chord');

      const measure = score.parts[0].measures[0];
      expect(measure.entries).toHaveLength(3);

      const notes = measure.entries.filter((e) => e.type === 'note');
      expect(notes).toHaveLength(3);

      if (notes[0].type === 'note') {
        expect(notes[0].pitch?.step).toBe('C');
        expect(notes[0].chord).toBeUndefined();
      }
      if (notes[1].type === 'note') {
        expect(notes[1].pitch?.step).toBe('E');
        expect(notes[1].chord).toBe(true);
      }
      if (notes[2].type === 'note') {
        expect(notes[2].pitch?.step).toBe('G');
        expect(notes[2].chord).toBe(true);
      }
    });
  });

  describe('voice and staff parsing', () => {
    it('should parse two voices', () => {
      const xml = readFileSync(join(fixturesPath, 'voices/two-voices.xml'), 'utf-8');
      const score = parse(xml);

      expect(score.metadata.workTitle).toBe('Two Voices');

      const measure = score.parts[0].measures[0];

      // Should have notes for both voices and a backup
      const notes = measure.entries.filter((e) => e.type === 'note');
      const backups = measure.entries.filter((e) => e.type === 'backup');

      expect(notes.length).toBe(6); // 2 half notes + 4 quarter notes
      expect(backups.length).toBe(1);

      const voice1Notes = notes.filter((n) => n.type === 'note' && n.voice === 1);
      const voice2Notes = notes.filter((n) => n.type === 'note' && n.voice === 2);

      expect(voice1Notes).toHaveLength(2);
      expect(voice2Notes).toHaveLength(4);
    });

    it('should parse piano grand staff', () => {
      const xml = readFileSync(join(fixturesPath, 'voices/piano-grand-staff.xml'), 'utf-8');
      const score = parse(xml);

      expect(score.metadata.workTitle).toBe('Piano Grand Staff');

      const measure = score.parts[0].measures[0];
      expect(measure.attributes?.staves).toBe(2);
      expect(measure.attributes?.clef).toHaveLength(2);
      expect(measure.attributes?.clef?.[0].sign).toBe('G');
      expect(measure.attributes?.clef?.[0].staff).toBe(1);
      expect(measure.attributes?.clef?.[1].sign).toBe('F');
      expect(measure.attributes?.clef?.[1].staff).toBe(2);

      const notes = measure.entries.filter((e) => e.type === 'note');
      expect(notes).toHaveLength(2);

      if (notes[0].type === 'note') {
        expect(notes[0].staff).toBe(1);
        expect(notes[0].pitch?.octave).toBe(5);
      }
      if (notes[1].type === 'note') {
        expect(notes[1].staff).toBe(2);
        expect(notes[1].pitch?.octave).toBe(3);
      }
    });
  });
});
