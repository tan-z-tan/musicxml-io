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
