import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parse } from '../src';
import {
  transpose,
  addNote,
  deleteNote,
  changeKey,
  changeTime,
  insertMeasure,
  deleteMeasure,
  addChordNote,
  modifyNotePitch,
  modifyNoteDuration,
} from '../src/operations';

const fixturesPath = join(__dirname, 'fixtures');

describe('Operations', () => {
  describe('transpose', () => {
    it('should transpose all notes by semitones', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      // Transpose up by 2 semitones (C -> D)
      const transposed = transpose(score, 2);

      const note = transposed.parts[0].measures[0].entries[0];
      expect(note.type).toBe('note');
      if (note.type === 'note') {
        expect(note.pitch?.step).toBe('D');
        expect(note.pitch?.octave).toBe(4);
      }
    });

    it('should handle octave changes', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      // Transpose up by 12 semitones (one octave)
      const transposed = transpose(score, 12);

      const note = transposed.parts[0].measures[0].entries[0];
      if (note.type === 'note') {
        expect(note.pitch?.step).toBe('C');
        expect(note.pitch?.octave).toBe(5);
      }
    });

    it('should handle sharps and flats', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      // Transpose up by 1 semitone (C -> C#)
      const transposed = transpose(score, 1);

      const note = transposed.parts[0].measures[0].entries[0];
      if (note.type === 'note') {
        expect(note.pitch?.step).toBe('C');
        expect(note.pitch?.alter).toBe(1);
        expect(note.pitch?.octave).toBe(4);
      }
    });

    it('should not modify original score', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);
      const originalNote = score.parts[0].measures[0].entries[0];

      transpose(score, 2);

      // Original should be unchanged
      if (originalNote.type === 'note') {
        expect(originalNote.pitch?.step).toBe('C');
      }
    });

    it('should return original score if semitones is 0', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      const result = transpose(score, 0);
      expect(result).toBe(score);
    });
  });

  describe('addNote', () => {
    it('should add a note to measure', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      const updated = addNote(score, {
        partIndex: 0,
        measureIndex: 0,
        voice: 1,
        position: 4, // After the whole note
        note: {
          pitch: { step: 'D', octave: 4 },
          duration: 4,
          noteType: 'whole',
        },
      });

      const measure = updated.parts[0].measures[0];
      const notes = measure.entries.filter((e) => e.type === 'note');
      expect(notes).toHaveLength(2);
    });

    it('should add backup when needed', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      const updated = addNote(score, {
        partIndex: 0,
        measureIndex: 0,
        voice: 2,
        position: 0, // Same position as existing note
        note: {
          pitch: { step: 'E', octave: 3 },
          duration: 4,
          noteType: 'whole',
        },
      });

      const measure = updated.parts[0].measures[0];
      const backups = measure.entries.filter((e) => e.type === 'backup');
      expect(backups.length).toBeGreaterThan(0);
    });
  });

  describe('deleteNote', () => {
    it('should delete a note from measure', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const updated = deleteNote(score, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0, // Delete first note
      });

      const measure = updated.parts[0].measures[0];
      const notes = measure.entries.filter((e) => e.type === 'note');
      expect(notes).toHaveLength(3);

      // Second note should now be first
      if (notes[0].type === 'note') {
        expect(notes[0].pitch?.step).toBe('D');
      }
    });
  });

  describe('changeKey', () => {
    it('should change key signature at specified measure', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const updated = changeKey(score, { fifths: 2, mode: 'major' }, { fromMeasure: 2 });

      expect(updated.parts[0].measures[0].attributes?.key?.fifths).toBe(0);
      expect(updated.parts[0].measures[1].attributes?.key?.fifths).toBe(2);
      expect(updated.parts[0].measures[1].attributes?.key?.mode).toBe('major');
    });
  });

  describe('changeTime', () => {
    it('should change time signature at specified measure', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const updated = changeTime(score, { beats: '3', beatType: 4 }, { fromMeasure: 2 });

      expect(updated.parts[0].measures[0].attributes?.time?.beats).toBe('4');
      expect(updated.parts[0].measures[1].attributes?.time?.beats).toBe('3');
      expect(updated.parts[0].measures[1].attributes?.time?.beatType).toBe(4);
    });
  });

  describe('insertMeasure', () => {
    it('should insert a new measure', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const updated = insertMeasure(score, { afterMeasure: 1 });

      expect(updated.parts[0].measures).toHaveLength(3);
      expect(updated.parts[0].measures[0].number).toBe('1');
      expect(updated.parts[0].measures[1].number).toBe('2');
      expect(updated.parts[0].measures[2].number).toBe('3');
    });

    it('should copy attributes when requested', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const updated = insertMeasure(score, {
        afterMeasure: 1,
        copyAttributes: true,
      });

      const newMeasure = updated.parts[0].measures[1];
      expect(newMeasure.attributes?.key?.fifths).toBe(0);
      expect(newMeasure.attributes?.time?.beats).toBe('4');
    });
  });

  describe('deleteMeasure', () => {
    it('should delete a measure', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const updated = deleteMeasure(score, 1);

      expect(updated.parts[0].measures).toHaveLength(1);
      expect(updated.parts[0].measures[0].number).toBe('1'); // Was measure 2, now renumbered
    });
  });

  describe('addChordNote', () => {
    it('should add a chord note after specified note', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      const updated = addChordNote(score, {
        partIndex: 0,
        measureIndex: 0,
        afterNoteIndex: 0,
        pitch: { step: 'E', octave: 4 },
      });

      const measure = updated.parts[0].measures[0];
      const notes = measure.entries.filter((e) => e.type === 'note');
      expect(notes).toHaveLength(2);

      if (notes[1].type === 'note') {
        expect(notes[1].pitch?.step).toBe('E');
        expect(notes[1].chord).toBe(true);
      }
    });
  });

  describe('modifyNotePitch', () => {
    it('should modify a note\'s pitch', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      const updated = modifyNotePitch(score, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
        pitch: { step: 'G', octave: 5 },
      });

      const note = updated.parts[0].measures[0].entries[0];
      if (note.type === 'note') {
        expect(note.pitch?.step).toBe('G');
        expect(note.pitch?.octave).toBe(5);
      }
    });
  });

  describe('modifyNoteDuration', () => {
    it('should modify a note\'s duration', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      const updated = modifyNoteDuration(score, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
        duration: 2,
        noteType: 'half',
      });

      const note = updated.parts[0].measures[0].entries[0];
      if (note.type === 'note') {
        expect(note.duration).toBe(2);
        expect(note.noteType).toBe('half');
      }
    });
  });
});
