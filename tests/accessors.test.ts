import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parse } from '../src/parser';
import {
  getNotesForVoice,
  getNotesForStaff,
  groupByVoice,
  groupByStaff,
  getAbsolutePosition,
  withAbsolutePositions,
  getChords,
  iterateNotes,
  getAllNotes,
  getVoices,
  getStaves,
  hasNotes,
  isRestMeasure,
  getNormalizedPosition,
  getNormalizedDuration,
} from '../src/accessors';

const fixturesPath = join(__dirname, 'fixtures');

describe('Accessors', () => {
  describe('getNotesForVoice', () => {
    it('should filter notes by voice', () => {
      const xml = readFileSync(join(fixturesPath, 'voices/two-voices.xml'), 'utf-8');
      const score = parse(xml);
      const measure = score.parts[0].measures[0];

      const voice1Notes = getNotesForVoice(measure, { voice: 1 });
      const voice2Notes = getNotesForVoice(measure, { voice: 2 });

      expect(voice1Notes).toHaveLength(2);
      expect(voice2Notes).toHaveLength(4);

      expect(voice1Notes.every((n) => n.voice === 1)).toBe(true);
      expect(voice2Notes.every((n) => n.voice === 2)).toBe(true);
    });

    it('should filter notes by voice and staff', () => {
      const xml = readFileSync(join(fixturesPath, 'voices/piano-grand-staff.xml'), 'utf-8');
      const score = parse(xml);
      const measure = score.parts[0].measures[0];

      const staff1Notes = getNotesForVoice(measure, { staff: 1 });
      const staff2Notes = getNotesForVoice(measure, { staff: 2 });

      expect(staff1Notes).toHaveLength(1);
      expect(staff2Notes).toHaveLength(1);
    });
  });

  describe('getNotesForStaff', () => {
    it('should filter notes by staff', () => {
      const xml = readFileSync(join(fixturesPath, 'voices/piano-grand-staff.xml'), 'utf-8');
      const score = parse(xml);
      const measure = score.parts[0].measures[0];

      const staff1Notes = getNotesForStaff(measure, { staff: 1 });
      const staff2Notes = getNotesForStaff(measure, { staff: 2 });

      expect(staff1Notes).toHaveLength(1);
      expect(staff2Notes).toHaveLength(1);

      expect(staff1Notes[0].pitch?.octave).toBe(5);
      expect(staff2Notes[0].pitch?.octave).toBe(3);
    });
  });

  describe('groupByVoice', () => {
    it('should group notes by voice', () => {
      const xml = readFileSync(join(fixturesPath, 'voices/two-voices.xml'), 'utf-8');
      const score = parse(xml);
      const measure = score.parts[0].measures[0];

      const groups = groupByVoice(measure);

      expect(groups).toHaveLength(2);
      expect(groups[0].voice).toBe(1);
      expect(groups[0].notes).toHaveLength(2);
      expect(groups[1].voice).toBe(2);
      expect(groups[1].notes).toHaveLength(4);
    });
  });

  describe('groupByStaff', () => {
    it('should group notes by staff', () => {
      const xml = readFileSync(join(fixturesPath, 'voices/piano-grand-staff.xml'), 'utf-8');
      const score = parse(xml);
      const measure = score.parts[0].measures[0];

      const groups = groupByStaff(measure);

      expect(groups).toHaveLength(2);
      expect(groups[0].staff).toBe(1);
      expect(groups[1].staff).toBe(2);
    });
  });

  describe('getAbsolutePosition', () => {
    it('should calculate absolute position for notes', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);
      const measure = score.parts[0].measures[0];

      const notes = measure.entries.filter((e) => e.type === 'note');

      expect(getAbsolutePosition(notes[0], measure)).toBe(0);
      expect(getAbsolutePosition(notes[1], measure)).toBe(1);
      expect(getAbsolutePosition(notes[2], measure)).toBe(2);
      expect(getAbsolutePosition(notes[3], measure)).toBe(3);
    });

    it('should handle backup correctly', () => {
      const xml = readFileSync(join(fixturesPath, 'voices/two-voices.xml'), 'utf-8');
      const score = parse(xml);
      const measure = score.parts[0].measures[0];

      // Voice 2 starts after backup, so position should be 0
      const voice2Notes = getNotesForVoice(measure, { voice: 2 });
      expect(getAbsolutePosition(voice2Notes[0], measure)).toBe(0);
    });
  });

  describe('withAbsolutePositions', () => {
    it('should add absolute position to all notes', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);
      const measure = score.parts[0].measures[0];

      const notesWithPos = withAbsolutePositions(measure);

      expect(notesWithPos).toHaveLength(4);
      expect(notesWithPos[0].absolutePosition).toBe(0);
      expect(notesWithPos[1].absolutePosition).toBe(1);
      expect(notesWithPos[2].absolutePosition).toBe(2);
      expect(notesWithPos[3].absolutePosition).toBe(3);
    });
  });

  describe('getChords', () => {
    it('should group chord notes together', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/chord.xml'), 'utf-8');
      const score = parse(xml);
      const measure = score.parts[0].measures[0];

      const chords = getChords(measure);

      expect(chords).toHaveLength(1);
      expect(chords[0].position).toBe(0);
      expect(chords[0].notes).toHaveLength(3);
    });

    it('should separate notes at different positions', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);
      const measure = score.parts[0].measures[0];

      const chords = getChords(measure);

      expect(chords).toHaveLength(4);
      expect(chords[0].notes).toHaveLength(1);
      expect(chords[1].notes).toHaveLength(1);
    });
  });

  describe('iterateNotes', () => {
    it('should iterate over all notes in score', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const notes = [...iterateNotes(score)];

      expect(notes).toHaveLength(8); // 4 notes in measure 1, 4 in measure 2

      expect(notes[0].note.pitch?.step).toBe('C');
      expect(notes[0].measure.number).toBe(1);
      expect(notes[4].note.pitch?.step).toBe('G');
      expect(notes[4].measure.number).toBe(2);
    });
  });

  describe('getAllNotes', () => {
    it('should return all notes as array', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const notes = getAllNotes(score);

      expect(notes).toHaveLength(8);
    });
  });

  describe('getVoices', () => {
    it('should return unique voices in measure', () => {
      const xml = readFileSync(join(fixturesPath, 'voices/two-voices.xml'), 'utf-8');
      const score = parse(xml);
      const measure = score.parts[0].measures[0];

      const voices = getVoices(measure);

      expect(voices).toEqual([1, 2]);
    });
  });

  describe('getStaves', () => {
    it('should return unique staves in measure', () => {
      const xml = readFileSync(join(fixturesPath, 'voices/piano-grand-staff.xml'), 'utf-8');
      const score = parse(xml);
      const measure = score.parts[0].measures[0];

      const staves = getStaves(measure);

      expect(staves).toEqual([1, 2]);
    });
  });

  describe('hasNotes', () => {
    it('should return true for measures with notes', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);
      const measure = score.parts[0].measures[0];

      expect(hasNotes(measure)).toBe(true);
    });

    it('should return false for empty measures', () => {
      expect(hasNotes({ number: 1, entries: [] })).toBe(false);
    });
  });

  describe('isRestMeasure', () => {
    it('should return false for measures with pitched notes', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);
      const measure = score.parts[0].measures[0];

      expect(isRestMeasure(measure)).toBe(false);
    });

    it('should return true for empty measures', () => {
      expect(isRestMeasure({ number: 1, entries: [] })).toBe(true);
    });
  });

  describe('getNormalizedPosition', () => {
    it('should normalize position to base divisions', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);
      const measure = score.parts[0].measures[0];
      const divisions = measure.attributes?.divisions ?? 1;

      const notes = measure.entries.filter((e) => e.type === 'note');
      const note = notes[1]; // Second note

      // Position 1 with divisions 1, normalized to base 480
      const normalizedPos = getNormalizedPosition(note, measure, {
        baseDivisions: 480,
        currentDivisions: divisions,
      });

      expect(normalizedPos).toBe(480); // 1 * 480 / 1 = 480
    });
  });

  describe('getNormalizedDuration', () => {
    it('should normalize duration to base divisions', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);
      const measure = score.parts[0].measures[0];
      const divisions = measure.attributes?.divisions ?? 1;

      const notes = measure.entries.filter((e) => e.type === 'note');
      const note = notes[0];

      if (note.type === 'note') {
        const normalizedDur = getNormalizedDuration(note, {
          baseDivisions: 480,
          currentDivisions: divisions,
        });

        // Quarter note with divisions 1, normalized to base 480
        expect(normalizedDur).toBe(note.duration * 480 / divisions);
      }
    });
  });
});
