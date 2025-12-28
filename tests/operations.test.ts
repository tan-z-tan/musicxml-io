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
  // Validated operations
  addNoteChecked,
  deleteNoteChecked,
  modifyNotePitchChecked,
  modifyNoteDurationChecked,
  addChordNoteChecked,
  transposeChecked,
  // Part operations
  addPart,
  removePart,
  duplicatePart,
  // Staff operations
  setStaves,
  moveNoteToStaff,
  // Notation operations
  addTie,
  removeTie,
  addSlur,
  removeSlur,
  addArticulation,
  removeArticulation,
  addDynamics,
  removeDynamics,
  insertClefChange,
  // Key-aware pitch operations
  setNotePitchBySemitone,
  shiftNotePitch,
  // Accidental operations
  raiseAccidental,
  lowerAccidental,
  type OperationResult,
} from '../src/operations';

const fixturesPath = join(__dirname, 'fixtures');

describe('Operations', () => {
  describe('transpose', () => {
    it('should transpose all notes by semitones', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      // Transpose up by 2 semitones (C -> D)
      const result = transpose(score, 2);
      expect(result.success).toBe(true);
      if (!result.success) return;

      const note = result.data.parts[0].measures[0].entries[0];
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
      const result = transpose(score, 12);
      expect(result.success).toBe(true);
      if (!result.success) return;

      const note = result.data.parts[0].measures[0].entries[0];
      if (note.type === 'note') {
        expect(note.pitch?.step).toBe('C');
        expect(note.pitch?.octave).toBe(5);
      }
    });

    it('should handle sharps and flats', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      // Transpose up by 1 semitone (C -> C#)
      const result = transpose(score, 1);
      expect(result.success).toBe(true);
      if (!result.success) return;

      const note = result.data.parts[0].measures[0].entries[0];
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
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(score);
      }
    });
  });

  describe('addNote', () => {
    it('should add a note to measure', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      // Add in voice 2 at position 0 (parallel with existing note in voice 1)
      const updated = addNote(score, {
        partIndex: 0,
        measureIndex: 0,
        voice: 2,
        position: 0,
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
    it('should delete a note from measure (replaces with rest)', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const updated = deleteNote(score, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0, // Delete first note
      });

      const measure = updated.parts[0].measures[0];
      const noteEntries = measure.entries.filter((e) => e.type === 'note');
      // Piano Roll semantics: deleted note becomes rest, so still 4 note entries
      expect(noteEntries).toHaveLength(4);

      // First entry should now be a rest
      if (noteEntries[0].type === 'note') {
        expect(noteEntries[0].rest).toBeDefined();
      }
      // Second entry should be D (was the second note)
      if (noteEntries[1].type === 'note') {
        expect(noteEntries[1].pitch?.step).toBe('D');
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

  // ============================================================
  // Validated Operations
  // ============================================================

  describe('addNoteChecked', () => {
    it('should add a note and return success', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      // Add at end of measure (position = duration of first note)
      const firstNote = score.parts[0].measures[0].entries[0];
      const position = firstNote.type === 'note' ? firstNote.duration : 0;

      const result = addNoteChecked(score, {
        partIndex: 0,
        measureIndex: 0,
        voice: 2, // Use different voice to avoid duration overflow in voice 1
        position: 0,
        note: {
          pitch: { step: 'D', octave: 4 },
          duration: 4, // Quarter note duration
          noteType: 'quarter',
        },
      });

      // Debug output if test fails
      if (!result.success) {
        console.log('addNoteChecked failed:', JSON.stringify(result.errors, null, 2));
      }

      expect(result.success).toBe(true);
      if (result.success) {
        const notes = result.data.parts[0].measures[0].entries.filter(e => e.type === 'note');
        expect(notes).toHaveLength(2);
      }
    });

    it('should fail with invalid part index', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      const result = addNoteChecked(score, {
        partIndex: 99,
        measureIndex: 0,
        voice: 1,
        position: 0,
        note: {
          pitch: { step: 'C', octave: 4 },
          duration: 4,
          noteType: 'whole',
        },
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors.length).toBeGreaterThan(0);
      }
    });

    it('should fail with invalid measure index', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      const result = addNoteChecked(score, {
        partIndex: 0,
        measureIndex: 99,
        voice: 1,
        position: 0,
        note: {
          pitch: { step: 'C', octave: 4 },
          duration: 4,
          noteType: 'whole',
        },
      });

      expect(result.success).toBe(false);
    });
  });

  describe('deleteNoteChecked', () => {
    it('should delete a note and return success (replaces with rest)', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const result = deleteNoteChecked(score, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const noteEntries = result.data.parts[0].measures[0].entries.filter(e => e.type === 'note');
        // Piano Roll semantics: deleted note becomes rest, so still 4 note entries
        expect(noteEntries).toHaveLength(4);
        // First should be a rest
        if (noteEntries[0].type === 'note') {
          expect(noteEntries[0].rest).toBeDefined();
        }
      }
    });
  });

  describe('modifyNotePitchChecked', () => {
    it('should modify pitch and return success', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      const result = modifyNotePitchChecked(score, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
        pitch: { step: 'G', octave: 5 },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const note = result.data.parts[0].measures[0].entries[0];
        if (note.type === 'note') {
          expect(note.pitch?.step).toBe('G');
          expect(note.pitch?.octave).toBe(5);
        }
      }
    });
  });

  describe('modifyNoteDurationChecked', () => {
    it('should modify duration and return success', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      const result = modifyNoteDurationChecked(score, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
        duration: 2,
        noteType: 'half',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const note = result.data.parts[0].measures[0].entries[0];
        if (note.type === 'note') {
          expect(note.duration).toBe(2);
        }
      }
    });

    it('should fail with negative duration', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      const result = modifyNoteDurationChecked(score, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
        duration: -1,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors[0].code).toBe('INVALID_DURATION');
      }
    });
  });

  describe('addChordNoteChecked', () => {
    it('should add a chord note and return success', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      const result = addChordNoteChecked(score, {
        partIndex: 0,
        measureIndex: 0,
        afterNoteIndex: 0,
        pitch: { step: 'E', octave: 4 },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const notes = result.data.parts[0].measures[0].entries.filter(e => e.type === 'note');
        expect(notes).toHaveLength(2);
        if (notes[1].type === 'note') {
          expect(notes[1].chord).toBe(true);
        }
      }
    });
  });

  describe('transposeChecked', () => {
    it('should transpose and return success', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      const result = transposeChecked(score, 2);

      expect(result.success).toBe(true);
      if (result.success) {
        const note = result.data.parts[0].measures[0].entries[0];
        if (note.type === 'note') {
          expect(note.pitch?.step).toBe('D');
        }
      }
    });

    it('should return original score when transposing by 0', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      const result = transposeChecked(score, 0);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(score);
      }
    });
  });

  // ============================================================
  // Part Operations
  // ============================================================

  describe('addPart', () => {
    it('should add a new part to the score', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      const result = addPart(score, {
        id: 'P2',
        name: 'Violin',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.parts).toHaveLength(2);
        expect(result.data.parts[1].id).toBe('P2');
        // Measures should match first part
        expect(result.data.parts[1].measures).toHaveLength(result.data.parts[0].measures.length);
      }
    });

    it('should fail with duplicate part ID', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      const result = addPart(score, {
        id: 'P1', // Already exists
        name: 'Duplicate',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors[0].code).toBe('DUPLICATE_PART_ID');
      }
    });

    it('should add part at specific index', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      const result = addPart(score, {
        id: 'P0',
        name: 'First',
        insertIndex: 0,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.parts[0].id).toBe('P0');
        expect(result.data.parts[1].id).toBe('P1');
      }
    });
  });

  describe('removePart', () => {
    it('should remove a part from the score', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      // First add a part
      const withNewPart = addPart(score, { id: 'P2', name: 'Temp' });
      expect(withNewPart.success).toBe(true);
      if (!withNewPart.success) return;

      // Then remove it
      const result = removePart(withNewPart.data, 'P2');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.parts).toHaveLength(1);
        expect(result.data.parts[0].id).toBe('P1');
      }
    });

    it('should fail when removing non-existent part', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      const result = removePart(score, 'NonExistent');

      expect(result.success).toBe(false);
    });

    it('should fail when removing the only part', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      const result = removePart(score, 'P1');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors[0].message).toContain('Cannot remove the only remaining part');
      }
    });
  });

  describe('duplicatePart', () => {
    it('should duplicate an existing part', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      const result = duplicatePart(score, {
        sourcePartId: 'P1',
        newPartId: 'P1-copy',
        newPartName: 'Piano Copy',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.parts).toHaveLength(2);
        expect(result.data.parts[1].id).toBe('P1-copy');
        // Should have same measures
        expect(result.data.parts[1].measures).toHaveLength(result.data.parts[0].measures.length);
      }
    });

    it('should fail with duplicate new ID', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      const result = duplicatePart(score, {
        sourcePartId: 'P1',
        newPartId: 'P1', // Same as source
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors[0].code).toBe('DUPLICATE_PART_ID');
      }
    });
  });

  // ============================================================
  // Staff Operations
  // ============================================================

  describe('setStaves', () => {
    it('should set number of staves for a part', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      const result = setStaves(score, {
        partIndex: 0,
        staves: 2,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.parts[0].measures[0].attributes?.staves).toBe(2);
        // Should have clefs for both staves
        expect(result.data.parts[0].measures[0].attributes?.clef?.length).toBe(2);
      }
    });

    it('should use provided clefs', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      const result = setStaves(score, {
        partIndex: 0,
        staves: 2,
        clefs: [
          { sign: 'G', line: 2, staff: 1 },
          { sign: 'F', line: 4, staff: 2 },
        ],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const clefs = result.data.parts[0].measures[0].attributes?.clef;
        expect(clefs?.[0].sign).toBe('G');
        expect(clefs?.[1].sign).toBe('F');
      }
    });

    it('should fail with invalid staves count', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      const result = setStaves(score, {
        partIndex: 0,
        staves: 0,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors[0].code).toBe('INVALID_STAFF');
      }
    });
  });

  describe('moveNoteToStaff', () => {
    it('should move a note to a different staff', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      // First set up 2 staves
      const withStaves = setStaves(score, { partIndex: 0, staves: 2 });
      expect(withStaves.success).toBe(true);
      if (!withStaves.success) return;

      // Move note to staff 2
      const result = moveNoteToStaff(withStaves.data, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
        targetStaff: 2,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const note = result.data.parts[0].measures[0].entries[0];
        if (note.type === 'note') {
          expect(note.staff).toBe(2);
        }
      }
    });

    it('should fail with invalid target staff', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      const result = moveNoteToStaff(score, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
        targetStaff: 0, // Invalid
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors[0].code).toBe('INVALID_STAFF');
      }
    });

    it('should fail when moving to non-existent staff', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      // Score has only 1 staff by default
      const result = moveNoteToStaff(score, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
        targetStaff: 5, // Doesn't exist
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors[0].code).toBe('STAFF_EXCEEDS_STAVES');
      }
    });
  });
});

// ============================================================
// Tests with Real MusicXML Files
// ============================================================

const samplesPath = join(__dirname, 'fixtures/musicxml_samples');

describe('Operations with Real MusicXML Files', () => {
  describe('FaurReveSample (Fauré - Après un rêve)', () => {
    it('should parse and transpose the score', () => {
      const xml = readFileSync(join(samplesPath, 'FaurReveSample.musicxml'), 'utf-8');
      const score = parse(xml);

      expect(score.parts.length).toBeGreaterThan(0);
      expect(score.parts[0].measures.length).toBeGreaterThan(0);

      // Transpose up by 2 semitones
      const result = transpose(score, 2);
      expect(result.success).toBe(true);
    });

    it('should allow adding a part', () => {
      const xml = readFileSync(join(samplesPath, 'FaurReveSample.musicxml'), 'utf-8');
      const score = parse(xml);

      const originalPartCount = score.parts.length;
      const result = addPart(score, {
        id: 'P-NEW',
        name: 'New Instrument',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.parts.length).toBe(originalPartCount + 1);
      }
    });
  });

  describe('MozartPianoSonata (Mozart K.331)', () => {
    it('should parse piano score with 2 staves', () => {
      const xml = readFileSync(join(samplesPath, 'MozartPianoSonata.musicxml'), 'utf-8');
      const score = parse(xml);

      expect(score.parts.length).toBe(1);
      // Check first measure has staves attribute
      const firstMeasure = score.parts[0].measures[0];
      expect(firstMeasure.attributes?.staves).toBe(2);
    });

    it('should transpose piano score correctly', () => {
      const xml = readFileSync(join(samplesPath, 'MozartPianoSonata.musicxml'), 'utf-8');
      const score = parse(xml);

      const result = transpose(score, -2); // Transpose down 2 semitones
      expect(result.success).toBe(true);
      if (result.success) {
        // Should have same structure
        expect(result.data.parts.length).toBe(score.parts.length);
        expect(result.data.parts[0].measures.length).toBe(score.parts[0].measures.length);
      }
    });

    it('should allow setting staves on piano score', () => {
      const xml = readFileSync(join(samplesPath, 'MozartPianoSonata.musicxml'), 'utf-8');
      const score = parse(xml);

      const result = setStaves(score, {
        partIndex: 0,
        staves: 3, // Add a third staff
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.parts[0].measures[0].attributes?.staves).toBe(3);
      }
    });
  });

  describe('BeetAnGeSample (Beethoven - An die Geliebte)', () => {
    it('should parse and validate structure', () => {
      const xml = readFileSync(join(samplesPath, 'BeetAnGeSample.musicxml'), 'utf-8');
      const score = parse(xml);

      expect(score.parts.length).toBeGreaterThan(0);
      // Beethoven song typically has voice + piano
      expect(score.parts.length).toBeGreaterThanOrEqual(2);
    });

    it('should allow duplicating a part', () => {
      const xml = readFileSync(join(samplesPath, 'BeetAnGeSample.musicxml'), 'utf-8');
      const score = parse(xml);

      const firstPartId = score.parts[0].id;
      const result = duplicatePart(score, {
        sourcePartId: firstPartId,
        newPartId: 'P-DUP',
        newPartName: 'Duplicated Part',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.parts.length).toBe(score.parts.length + 1);
        const dupPart = result.data.parts.find(p => p.id === 'P-DUP');
        expect(dupPart).toBeDefined();
      }
    });
  });

  describe('Dichterliebe01 (Schumann - Im wunderschönen Monat Mai)', () => {
    it('should parse and maintain measure consistency', () => {
      const xml = readFileSync(join(samplesPath, 'Dichterliebe01.musicxml'), 'utf-8');
      const score = parse(xml);

      // All parts should have same number of measures
      const measureCount = score.parts[0].measures.length;
      for (const part of score.parts) {
        expect(part.measures.length).toBe(measureCount);
      }
    });

    it('should allow removing a part if multiple exist', () => {
      const xml = readFileSync(join(samplesPath, 'Dichterliebe01.musicxml'), 'utf-8');
      const score = parse(xml);

      if (score.parts.length > 1) {
        const lastPartId = score.parts[score.parts.length - 1].id;
        const result = removePart(score, lastPartId);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.parts.length).toBe(score.parts.length - 1);
        }
      }
    });
  });

  describe('MozartTrio (Mozart Piano Trio)', () => {
    it('should parse trio with multiple instruments', () => {
      const xml = readFileSync(join(samplesPath, 'MozartTrio.musicxml'), 'utf-8');
      const score = parse(xml);

      // Trio should have 3 parts (typically violin, cello, piano)
      expect(score.parts.length).toBeGreaterThanOrEqual(3);
    });

    it('should transpose all parts together', () => {
      const xml = readFileSync(join(samplesPath, 'MozartTrio.musicxml'), 'utf-8');
      const score = parse(xml);

      const result = transpose(score, 5); // Up a fourth
      expect(result.success).toBe(true);

      if (result.success) {
        // All parts should still exist
        expect(result.data.parts.length).toBe(score.parts.length);
      }
    });
  });

  describe('Chant (Gregorian Chant)', () => {
    it('should handle chant notation', () => {
      const xml = readFileSync(join(samplesPath, 'Chant.musicxml'), 'utf-8');
      const score = parse(xml);

      expect(score.parts.length).toBeGreaterThan(0);

      // Transpose should work even on chant
      const result = transpose(score, 3);
      expect(result.success).toBe(true);
    });
  });

  describe('Large File Performance', () => {
    it('should handle ActorPreludeSample (large orchestral score)', () => {
      const xml = readFileSync(join(samplesPath, 'ActorPreludeSample.musicxml'), 'utf-8');
      const startTime = Date.now();
      const score = parse(xml);
      const parseTime = Date.now() - startTime;

      // Should parse reasonably quickly (under 5 seconds)
      expect(parseTime).toBeLessThan(5000);
      expect(score.parts.length).toBeGreaterThan(0);

      // Transpose should also be reasonably fast
      const transposeStart = Date.now();
      const result = transpose(score, 1);
      const transposeTime = Date.now() - transposeStart;

      expect(result.success).toBe(true);
      expect(transposeTime).toBeLessThan(3000);
    });
  });
});

// ============================================================
// Notation Operations Tests
// ============================================================

describe('Notation Operations', () => {
  describe('addTie / removeTie', () => {
    it('should add a tie between two notes with same pitch', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/two-notes.xml'), 'utf-8');
      const score = parse(xml);

      const result = addTie(score, {
        partIndex: 0,
        startMeasureIndex: 0,
        startNoteIndex: 0,
        endMeasureIndex: 0,
        endNoteIndex: 1,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const measure = result.data.parts[0].measures[0];
        const entries = measure.entries.filter(e => e.type === 'note' && !e.rest);
        expect(entries[0].tie?.type).toBe('start');
        expect(entries[1].tie?.type).toBe('stop');
        expect(entries[0].notations?.some(n => n.type === 'tied')).toBe(true);
      }
    });

    it('should fail when tying notes with different pitches', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      // Scale has C, D, E, F, G, A, B, C - different pitches
      const result = addTie(score, {
        partIndex: 0,
        startMeasureIndex: 0,
        startNoteIndex: 0, // C
        endMeasureIndex: 0,
        endNoteIndex: 1,   // D (different pitch)
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors[0].code).toBe('TIE_PITCH_MISMATCH');
      }
    });

    it('should remove a tie from a note', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/two-notes.xml'), 'utf-8');
      const score = parse(xml);

      // First add a tie
      const withTie = addTie(score, {
        partIndex: 0,
        startMeasureIndex: 0,
        startNoteIndex: 0,
        endMeasureIndex: 0,
        endNoteIndex: 1,
      });
      expect(withTie.success).toBe(true);
      if (!withTie.success) return;

      // Then remove it
      const result = removeTie(withTie.data, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const entries = result.data.parts[0].measures[0].entries.filter(e => e.type === 'note' && !e.rest);
        expect(entries[0].tie).toBeUndefined();
      }
    });

    it('should fail to remove tie when none exists', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      const result = removeTie(score, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors[0].code).toBe('TIE_NOT_FOUND');
      }
    });
  });

  describe('addSlur / removeSlur', () => {
    it('should add a slur between two notes', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const result = addSlur(score, {
        partIndex: 0,
        startMeasureIndex: 0,
        startNoteIndex: 0,
        endMeasureIndex: 0,
        endNoteIndex: 3, // Slur over 4 notes
        placement: 'above',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const entries = result.data.parts[0].measures[0].entries.filter(e => e.type === 'note' && !e.rest);
        const startSlur = entries[0].notations?.find(n => n.type === 'slur');
        const endSlur = entries[3].notations?.find(n => n.type === 'slur');

        expect(startSlur).toBeDefined();
        expect(endSlur).toBeDefined();
        if (startSlur?.type === 'slur') {
          expect(startSlur.slurType).toBe('start');
        }
        if (endSlur?.type === 'slur') {
          expect(endSlur.slurType).toBe('stop');
        }
      }
    });

    it('should support multiple slurs with different numbers', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      // Add first slur starting from note 0
      const withSlur1 = addSlur(score, {
        partIndex: 0,
        startMeasureIndex: 0,
        startNoteIndex: 0,
        endMeasureIndex: 0,
        endNoteIndex: 2,
        number: 1,
      });
      expect(withSlur1.success).toBe(true);
      if (!withSlur1.success) return;

      // Add second slur also starting from note 0 with different number
      const withSlur2 = addSlur(withSlur1.data, {
        partIndex: 0,
        startMeasureIndex: 0,
        startNoteIndex: 0,
        endMeasureIndex: 0,
        endNoteIndex: 3, // Fixed: scale.xml measure 1 has notes at index 0-3
        number: 2,
      });

      expect(withSlur2.success).toBe(true);
      if (withSlur2.success) {
        const entries = withSlur2.data.parts[0].measures[0].entries.filter(e => e.type === 'note' && !e.rest);
        // Note at index 0 should have 2 slur starts
        const slurs = entries[0].notations?.filter(n => n.type === 'slur');
        expect(slurs?.length).toBe(2);
      }
    });

    it('should remove a slur from a note', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      // First add a slur
      const withSlur = addSlur(score, {
        partIndex: 0,
        startMeasureIndex: 0,
        startNoteIndex: 0,
        endMeasureIndex: 0,
        endNoteIndex: 2,
      });
      expect(withSlur.success).toBe(true);
      if (!withSlur.success) return;

      // Then remove it
      const result = removeSlur(withSlur.data, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const entries = result.data.parts[0].measures[0].entries.filter(e => e.type === 'note' && !e.rest);
        const slur = entries[0].notations?.find(n => n.type === 'slur');
        expect(slur).toBeUndefined();
      }
    });
  });

  describe('addArticulation / removeArticulation', () => {
    it('should add staccato to a note', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      const result = addArticulation(score, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
        articulation: 'staccato',
        placement: 'above',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const note = result.data.parts[0].measures[0].entries[0];
        if (note.type === 'note') {
          const articulation = note.notations?.find(n => n.type === 'articulation');
          expect(articulation).toBeDefined();
          if (articulation?.type === 'articulation') {
            expect(articulation.articulation).toBe('staccato');
            expect(articulation.placement).toBe('above');
          }
        }
      }
    });

    it('should add accent to a note', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      const result = addArticulation(score, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
        articulation: 'accent',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const note = result.data.parts[0].measures[0].entries[0];
        if (note.type === 'note') {
          const articulation = note.notations?.find(n => n.type === 'articulation');
          expect(articulation?.type === 'articulation' && articulation.articulation).toBe('accent');
        }
      }
    });

    it('should add multiple articulations to the same note', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      // Add staccato
      const withStaccato = addArticulation(score, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
        articulation: 'staccato',
      });
      expect(withStaccato.success).toBe(true);
      if (!withStaccato.success) return;

      // Add accent
      const withBoth = addArticulation(withStaccato.data, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
        articulation: 'accent',
      });

      expect(withBoth.success).toBe(true);
      if (withBoth.success) {
        const note = withBoth.data.parts[0].measures[0].entries[0];
        if (note.type === 'note') {
          const articulations = note.notations?.filter(n => n.type === 'articulation');
          expect(articulations?.length).toBe(2);
        }
      }
    });

    it('should fail when adding duplicate articulation', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      // Add staccato first
      const withStaccato = addArticulation(score, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
        articulation: 'staccato',
      });
      expect(withStaccato.success).toBe(true);
      if (!withStaccato.success) return;

      // Try to add staccato again
      const result = addArticulation(withStaccato.data, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
        articulation: 'staccato',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors[0].code).toBe('ARTICULATION_ALREADY_EXISTS');
      }
    });

    it('should remove an articulation from a note', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      // Add articulation first
      const withArticulation = addArticulation(score, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
        articulation: 'staccato',
      });
      expect(withArticulation.success).toBe(true);
      if (!withArticulation.success) return;

      // Remove it
      const result = removeArticulation(withArticulation.data, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
        articulation: 'staccato',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const note = result.data.parts[0].measures[0].entries[0];
        if (note.type === 'note') {
          expect(note.notations).toBeUndefined();
        }
      }
    });
  });

  describe('addDynamics / removeDynamics', () => {
    it('should add dynamics (f) at measure start', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      const result = addDynamics(score, {
        partIndex: 0,
        measureIndex: 0,
        position: 0,
        dynamics: 'f',
        placement: 'below',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const entries = result.data.parts[0].measures[0].entries;
        const direction = entries.find(e => e.type === 'direction');
        expect(direction).toBeDefined();
        if (direction?.type === 'direction') {
          const dynamicsType = direction.directionTypes.find(dt => dt.kind === 'dynamics');
          expect(dynamicsType).toBeDefined();
          if (dynamicsType?.kind === 'dynamics') {
            expect(dynamicsType.value).toBe('f');
          }
        }
      }
    });

    it('should add different dynamics values', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      // Test various dynamics
      const dynamicsValues: Array<'pp' | 'p' | 'mp' | 'mf' | 'f' | 'ff'> = ['pp', 'p', 'mp', 'mf', 'f', 'ff'];

      for (const dyn of dynamicsValues) {
        const result = addDynamics(score, {
          partIndex: 0,
          measureIndex: 0,
          position: 0,
          dynamics: dyn,
        });
        expect(result.success).toBe(true);
      }
    });

    it('should remove dynamics from a measure', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      // Add dynamics first
      const withDynamics = addDynamics(score, {
        partIndex: 0,
        measureIndex: 0,
        position: 0,
        dynamics: 'mf',
      });
      expect(withDynamics.success).toBe(true);
      if (!withDynamics.success) return;

      // Remove it
      const result = removeDynamics(withDynamics.data, {
        partIndex: 0,
        measureIndex: 0,
        directionIndex: 0,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const entries = result.data.parts[0].measures[0].entries;
        const direction = entries.find(e => e.type === 'direction');
        expect(direction).toBeUndefined();
      }
    });

    it('should fail when removing non-existent dynamics', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      const result = removeDynamics(score, {
        partIndex: 0,
        measureIndex: 0,
        directionIndex: 0,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors[0].code).toBe('DYNAMICS_NOT_FOUND');
      }
    });
  });

  describe('insertClefChange', () => {
    it('should insert a clef change at measure start', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      const result = insertClefChange(score, {
        partIndex: 0,
        measureIndex: 0,
        position: 0,
        clef: { sign: 'F', line: 4 },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const clef = result.data.parts[0].measures[0].attributes?.clef?.[0];
        expect(clef?.sign).toBe('F');
        expect(clef?.line).toBe(4);
      }
    });

    it('should insert a mid-measure clef change', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      // Get divisions to calculate position
      const divisions = score.parts[0].measures[0].attributes?.divisions ?? 1;
      const midPosition = divisions * 2; // After 2 beats

      const result = insertClefChange(score, {
        partIndex: 0,
        measureIndex: 0,
        position: midPosition,
        clef: { sign: 'F', line: 4 },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const entries = result.data.parts[0].measures[0].entries;
        const attrEntry = entries.find(e => e.type === 'attributes');
        expect(attrEntry).toBeDefined();
        if (attrEntry?.type === 'attributes') {
          expect(attrEntry.attributes.clef?.[0].sign).toBe('F');
        }
      }
    });

    it('should handle clef change with staff number', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      // First set up 2 staves
      const withStaves = setStaves(score, { partIndex: 0, staves: 2 });
      expect(withStaves.success).toBe(true);
      if (!withStaves.success) return;

      // Change clef on staff 2
      const result = insertClefChange(withStaves.data, {
        partIndex: 0,
        measureIndex: 0,
        position: 0,
        clef: { sign: 'C', line: 3, staff: 2 },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const clefs = result.data.parts[0].measures[0].attributes?.clef;
        const staff2Clef = clefs?.find(c => c.staff === 2);
        expect(staff2Clef?.sign).toBe('C');
        expect(staff2Clef?.line).toBe(3);
      }
    });

    it('should validate clef sign', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      const result = insertClefChange(score, {
        partIndex: 0,
        measureIndex: 0,
        position: 0,
        clef: { sign: 'X' as any, line: 2 }, // Invalid sign
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors[0].code).toBe('INVALID_CLEF');
      }
    });
  });
});

// ============================================================
// Key-Aware Pitch Operations Tests
// ============================================================

describe('Key-Aware Pitch Operations', () => {
  describe('setNotePitchBySemitone', () => {
    it('should set pitch by semitone in C major', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      // Set to D4 (semitone 50 - C4 is 48)
      const result = setNotePitchBySemitone(score, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
        semitone: 50, // D4
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const note = result.data.parts[0].measures[0].entries[0];
        if (note.type === 'note') {
          expect(note.pitch?.step).toBe('D');
          expect(note.pitch?.octave).toBe(4);
          expect(note.pitch?.alter).toBeUndefined();
        }
      }
    });

    it('should use sharp spelling in sharp key (G major)', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/g-major-scale.xml'), 'utf-8');
      const score = parse(xml);

      // Set to F#4 (semitone 54) - should be F# in G major
      const result = setNotePitchBySemitone(score, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
        semitone: 54, // F#4
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const note = result.data.parts[0].measures[0].entries[0];
        if (note.type === 'note') {
          expect(note.pitch?.step).toBe('F');
          expect(note.pitch?.alter).toBe(1);
          // No accidental needed because F# is in G major
          expect(note.accidental).toBeUndefined();
        }
      }
    });

    it('should add accidental when note differs from key signature', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/g-major-scale.xml'), 'utf-8');
      const score = parse(xml);

      // Set to F natural (semitone 53) - needs natural accidental in G major
      const result = setNotePitchBySemitone(score, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
        semitone: 53, // F4 natural
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const note = result.data.parts[0].measures[0].entries[0];
        if (note.type === 'note') {
          expect(note.pitch?.step).toBe('F');
          expect(note.pitch?.alter).toBeUndefined();
          // Natural accidental needed because F natural is not in G major
          expect(note.accidental?.value).toBe('natural');
        }
      }
    });

    it('should handle octave changes correctly', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      // Set to C5 (semitone 60)
      const result = setNotePitchBySemitone(score, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
        semitone: 60, // C5
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const note = result.data.parts[0].measures[0].entries[0];
        if (note.type === 'note') {
          expect(note.pitch?.step).toBe('C');
          expect(note.pitch?.octave).toBe(5);
        }
      }
    });

    it('should respect preferSharp option', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      // Set to C#/Db (semitone 49) with preferSharp = false
      const result = setNotePitchBySemitone(score, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
        semitone: 49, // C#4 or Db4
        preferSharp: false,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const note = result.data.parts[0].measures[0].entries[0];
        if (note.type === 'note') {
          expect(note.pitch?.step).toBe('D');
          expect(note.pitch?.alter).toBe(-1); // Db
        }
      }
    });
  });

  describe('shiftNotePitch', () => {
    it('should shift pitch up by semitones', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      // C4 + 2 semitones = D4
      const result = shiftNotePitch(score, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
        semitones: 2,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const note = result.data.parts[0].measures[0].entries[0];
        if (note.type === 'note') {
          expect(note.pitch?.step).toBe('D');
          expect(note.pitch?.octave).toBe(4);
        }
      }
    });

    it('should shift pitch down by semitones', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      // C4 - 2 semitones = A#3 (sharp preferred in C major/neutral key)
      const result = shiftNotePitch(score, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
        semitones: -2,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const note = result.data.parts[0].measures[0].entries[0];
        if (note.type === 'note') {
          expect(note.pitch?.step).toBe('A');
          expect(note.pitch?.alter).toBe(1); // A#
          expect(note.pitch?.octave).toBe(3);
        }
      }
    });

    it('should shift pitch down with flat preference', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      // C4 - 2 semitones = Bb3 (with preferSharp = false)
      const result = shiftNotePitch(score, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
        semitones: -2,
        preferSharp: false,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const note = result.data.parts[0].measures[0].entries[0];
        if (note.type === 'note') {
          expect(note.pitch?.step).toBe('B');
          expect(note.pitch?.alter).toBe(-1); // Bb
          expect(note.pitch?.octave).toBe(3);
        }
      }
    });

    it('should return original score when semitones is 0', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      const result = shiftNotePitch(score, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
        semitones: 0,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(score); // Should be same reference
      }
    });

    it('should handle octave crossing', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      // C4 + 12 semitones = C5
      const result = shiftNotePitch(score, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
        semitones: 12,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const note = result.data.parts[0].measures[0].entries[0];
        if (note.type === 'note') {
          expect(note.pitch?.step).toBe('C');
          expect(note.pitch?.octave).toBe(5);
        }
      }
    });

    it('should consider key signature when shifting in G major', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/g-major-scale.xml'), 'utf-8');
      const score = parse(xml);

      // First note is G4. Shift down 2 semitones to F4
      // In G major, F is naturally F#, so F natural needs an accidental
      const result = shiftNotePitch(score, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
        semitones: -2, // G4 -> F4
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const note = result.data.parts[0].measures[0].entries[0];
        if (note.type === 'note') {
          expect(note.pitch?.step).toBe('F');
          expect(note.pitch?.alter).toBeUndefined();
          expect(note.accidental?.value).toBe('natural');
        }
      }
    });
  });
});

// ============================================================
// Accidental Operations Tests
// ============================================================

describe('Accidental Operations', () => {
  describe('raiseAccidental', () => {
    it('should raise C to C#', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      const result = raiseAccidental(score, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const note = result.data.parts[0].measures[0].entries[0];
        if (note.type === 'note') {
          expect(note.pitch?.step).toBe('C'); // Step stays same
          expect(note.pitch?.alter).toBe(1);  // Now sharp
          expect(note.accidental?.value).toBe('sharp');
        }
      }
    });

    it('should raise C# to C##', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      // First raise to C#
      const withSharp = raiseAccidental(score, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
      });
      expect(withSharp.success).toBe(true);
      if (!withSharp.success) return;

      // Then raise again to C##
      const result = raiseAccidental(withSharp.data, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const note = result.data.parts[0].measures[0].entries[0];
        if (note.type === 'note') {
          expect(note.pitch?.step).toBe('C');
          expect(note.pitch?.alter).toBe(2); // Double sharp
          expect(note.accidental?.value).toBe('double-sharp');
        }
      }
    });

    it('should fail when raising beyond double-sharp', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      // Raise twice to get to C##
      let current = score;
      for (let i = 0; i < 2; i++) {
        const result = raiseAccidental(current, {
          partIndex: 0,
          measureIndex: 0,
          noteIndex: 0,
        });
        expect(result.success).toBe(true);
        if (result.success) {
          current = result.data;
        }
      }

      // Third raise should fail
      const result = raiseAccidental(current, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors[0].code).toBe('ACCIDENTAL_OUT_OF_BOUNDS');
      }
    });

    it('should raise Db to D natural', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      // First lower to Cb (C flat)
      const withFlat = lowerAccidental(score, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
      });
      expect(withFlat.success).toBe(true);
      if (!withFlat.success) return;

      // Now raise back to C natural
      const result = raiseAccidental(withFlat.data, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const note = result.data.parts[0].measures[0].entries[0];
        if (note.type === 'note') {
          expect(note.pitch?.step).toBe('C');
          expect(note.pitch?.alter).toBeUndefined(); // Natural
        }
      }
    });

    it('should handle F# in G major (no accidental needed)', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/g-major-scale.xml'), 'utf-8');
      const score = parse(xml);

      // First note is G4. We need a note that is F natural first.
      // Let's use setNotePitchBySemitone to set it to F natural (53)
      const withF = setNotePitchBySemitone(score, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
        semitone: 53, // F4 natural
      });
      expect(withF.success).toBe(true);
      if (!withF.success) return;

      // Now raise F to F# - in G major this should NOT need an accidental
      const result = raiseAccidental(withF.data, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const note = result.data.parts[0].measures[0].entries[0];
        if (note.type === 'note') {
          expect(note.pitch?.step).toBe('F');
          expect(note.pitch?.alter).toBe(1);
          // F# is in G major, so no accidental display needed
          expect(note.accidental).toBeUndefined();
        }
      }
    });
  });

  describe('lowerAccidental', () => {
    it('should lower C to Cb', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      const result = lowerAccidental(score, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const note = result.data.parts[0].measures[0].entries[0];
        if (note.type === 'note') {
          expect(note.pitch?.step).toBe('C'); // Step stays same
          expect(note.pitch?.alter).toBe(-1); // Now flat
          expect(note.accidental?.value).toBe('flat');
        }
      }
    });

    it('should lower Cb to Cbb', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      // First lower to Cb
      const withFlat = lowerAccidental(score, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
      });
      expect(withFlat.success).toBe(true);
      if (!withFlat.success) return;

      // Then lower again to Cbb
      const result = lowerAccidental(withFlat.data, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const note = result.data.parts[0].measures[0].entries[0];
        if (note.type === 'note') {
          expect(note.pitch?.step).toBe('C');
          expect(note.pitch?.alter).toBe(-2); // Double flat
          expect(note.accidental?.value).toBe('double-flat');
        }
      }
    });

    it('should fail when lowering beyond double-flat', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      // Lower twice to get to Cbb
      let current = score;
      for (let i = 0; i < 2; i++) {
        const result = lowerAccidental(current, {
          partIndex: 0,
          measureIndex: 0,
          noteIndex: 0,
        });
        expect(result.success).toBe(true);
        if (result.success) {
          current = result.data;
        }
      }

      // Third lower should fail
      const result = lowerAccidental(current, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors[0].code).toBe('ACCIDENTAL_OUT_OF_BOUNDS');
      }
    });

    it('should lower C# to C natural', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      // First raise to C#
      const withSharp = raiseAccidental(score, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
      });
      expect(withSharp.success).toBe(true);
      if (!withSharp.success) return;

      // Now lower back to C natural
      const result = lowerAccidental(withSharp.data, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const note = result.data.parts[0].measures[0].entries[0];
        if (note.type === 'note') {
          expect(note.pitch?.step).toBe('C');
          expect(note.pitch?.alter).toBeUndefined(); // Natural
        }
      }
    });

    it('should lower F# to F natural in G major (needs natural accidental)', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/g-major-scale.xml'), 'utf-8');
      const score = parse(xml);

      // First set to F#4 (semitone 54)
      const withFSharp = setNotePitchBySemitone(score, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
        semitone: 54, // F#4
      });
      expect(withFSharp.success).toBe(true);
      if (!withFSharp.success) return;

      // Lower F# to F natural
      const result = lowerAccidental(withFSharp.data, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const note = result.data.parts[0].measures[0].entries[0];
        if (note.type === 'note') {
          expect(note.pitch?.step).toBe('F');
          expect(note.pitch?.alter).toBeUndefined();
          // F natural is NOT in G major, so needs natural accidental
          expect(note.accidental?.value).toBe('natural');
        }
      }
    });
  });

  describe('raiseAccidental and lowerAccidental combined', () => {
    it('should be reversible: raise then lower returns to original', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      // Get original pitch
      const originalNote = score.parts[0].measures[0].entries[0];
      const originalAlter = originalNote.type === 'note' ? originalNote.pitch?.alter : undefined;

      // Raise
      const raised = raiseAccidental(score, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
      });
      expect(raised.success).toBe(true);
      if (!raised.success) return;

      // Then lower
      const result = lowerAccidental(raised.data, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const note = result.data.parts[0].measures[0].entries[0];
        if (note.type === 'note') {
          expect(note.pitch?.step).toBe('C');
          expect(note.pitch?.alter).toBe(originalAlter); // Back to original
        }
      }
    });

    it('should be reversible: lower then raise returns to original', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      // Lower
      const lowered = lowerAccidental(score, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
      });
      expect(lowered.success).toBe(true);
      if (!lowered.success) return;

      // Then raise
      const result = raiseAccidental(lowered.data, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const note = result.data.parts[0].measures[0].entries[0];
        if (note.type === 'note') {
          expect(note.pitch?.step).toBe('C');
          expect(note.pitch?.alter).toBeUndefined(); // Back to natural
        }
      }
    });
  });
});
