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
  // Tuplet operations
  createTuplet,
  removeTuplet,
  // Beam operations
  addBeam,
  removeBeam,
  autoBeam,
  // Copy/Paste operations
  copyNotes,
  pasteNotes,
  cutNotes,
  copyNotesMultiMeasure,
  pasteNotesMultiMeasure,
  // Expression/Performance operations
  addTempo,
  removeTempo,
  modifyTempo,
  modifyDynamics,
  // Convenience aliases
  addText,
  setBeaming,
  addChordSymbol,
  removeChordSymbol,
  updateChordSymbol,
  changeClef,
  setBarline,
  addRepeat,
  removeRepeat,
  addWedge,
  removeWedge,
  addFermata,
  removeFermata,
  addOrnament,
  removeOrnament,
  addPedal,
  removePedal,
  addTextDirection,
  addRehearsalMark,
  // Phase 1: Repeat and Structure operations
  addRepeatBarline,
  removeRepeatBarline,
  addEnding,
  removeEnding,
  changeBarline,
  addSegno,
  addCoda,
  addDaCapo,
  addDalSegno,
  addFine,
  addToCoda,
  // Phase 2: Grace note operations
  addGraceNote,
  removeGraceNote,
  convertToGrace,
  // Phase 3: Lyric operations
  addLyric,
  removeLyric,
  updateLyric,
  // Phase 4: Harmony operations
  addHarmony,
  removeHarmony,
  updateHarmony,
  // Phase 5: Technical notations, Octave shift, Breath operations
  addFingering,
  removeFingering,
  addBowing,
  removeBowing,
  addStringNumber,
  removeStringNumber,
  addOctaveShift,
  stopOctaveShift,
  removeOctaveShift,
  addBreathMark,
  removeBreathMark,
  addCaesura,
  removeCaesura,
  type OperationResult,
  type NoteSelection,
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

    it('should modify dynamics value', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      // Add dynamics first
      const withDynamics = addDynamics(score, {
        partIndex: 0,
        measureIndex: 0,
        position: 0,
        dynamics: 'p',
      });
      expect(withDynamics.success).toBe(true);
      if (!withDynamics.success) return;

      // Modify to forte
      const result = modifyDynamics(withDynamics.data, {
        partIndex: 0,
        measureIndex: 0,
        directionIndex: 0,
        dynamics: 'f',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const measure = result.data.parts[0].measures[0];
        const dynamicsDirection = measure.entries.find(
          e => e.type === 'direction' && e.directionTypes.some(dt => dt.kind === 'dynamics')
        );
        expect(dynamicsDirection).toBeDefined();
        if (dynamicsDirection?.type === 'direction') {
          const dynamicsType = dynamicsDirection.directionTypes.find(dt => dt.kind === 'dynamics');
          expect(dynamicsType).toBeDefined();
          if (dynamicsType?.kind === 'dynamics') {
            expect(dynamicsType.value).toBe('f');
          }
        }
      }
    });

    it('should modify dynamics placement', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      // Add dynamics with placement below
      const withDynamics = addDynamics(score, {
        partIndex: 0,
        measureIndex: 0,
        position: 0,
        dynamics: 'mf',
        placement: 'below',
      });
      expect(withDynamics.success).toBe(true);
      if (!withDynamics.success) return;

      // Modify placement to above
      const result = modifyDynamics(withDynamics.data, {
        partIndex: 0,
        measureIndex: 0,
        directionIndex: 0,
        dynamics: 'mf',
        placement: 'above',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const measure = result.data.parts[0].measures[0];
        const dynamicsDirection = measure.entries.find(
          e => e.type === 'direction' && e.directionTypes.some(dt => dt.kind === 'dynamics')
        );
        expect(dynamicsDirection).toBeDefined();
        if (dynamicsDirection?.type === 'direction') {
          expect(dynamicsDirection.placement).toBe('above');
        }
      }
    });

    it('should fail when modifying non-existent dynamics', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      const result = modifyDynamics(score, {
        partIndex: 0,
        measureIndex: 0,
        directionIndex: 0,
        dynamics: 'ff',
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

// ============================================================
// Tuplet Operations Tests
// ============================================================

describe('Tuplet Operations', () => {
  describe('createTuplet', () => {
    it('should create a triplet from three notes', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const result = createTuplet(score, {
        partIndex: 0,
        measureIndex: 0,
        startNoteIndex: 0,
        noteCount: 3,
        actualNotes: 3,
        normalNotes: 2,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const entries = result.data.parts[0].measures[0].entries.filter(e => e.type === 'note' && !e.rest);
        // First 3 notes should have timeModification
        for (let i = 0; i < 3; i++) {
          if (entries[i].type === 'note') {
            expect(entries[i].timeModification).toBeDefined();
            expect(entries[i].timeModification?.actualNotes).toBe(3);
            expect(entries[i].timeModification?.normalNotes).toBe(2);
          }
        }
      }
    });

    it('should add bracket notation to tuplet', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const result = createTuplet(score, {
        partIndex: 0,
        measureIndex: 0,
        startNoteIndex: 0,
        noteCount: 3,
        actualNotes: 3,
        normalNotes: 2,
        bracket: true,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const entries = result.data.parts[0].measures[0].entries.filter(e => e.type === 'note' && !e.rest);
        // First note should have tuplet start
        if (entries[0].type === 'note') {
          const tupletNotation = entries[0].notations?.find(n => n.type === 'tuplet');
          expect(tupletNotation).toBeDefined();
          if (tupletNotation?.type === 'tuplet') {
            expect(tupletNotation.tupletType).toBe('start');
            expect(tupletNotation.bracket).toBe(true);
          }
        }
        // Last note of tuplet should have tuplet stop
        if (entries[2].type === 'note') {
          const tupletNotation = entries[2].notations?.find(n => n.type === 'tuplet');
          expect(tupletNotation).toBeDefined();
          if (tupletNotation?.type === 'tuplet') {
            expect(tupletNotation.tupletType).toBe('stop');
          }
        }
      }
    });

    it('should fail with invalid note count', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      const result = createTuplet(score, {
        partIndex: 0,
        measureIndex: 0,
        startNoteIndex: 0,
        noteCount: 5, // Only 1 note in measure
        actualNotes: 3,
        normalNotes: 2,
      });

      expect(result.success).toBe(false);
    });

    it('should fail with invalid part index', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const result = createTuplet(score, {
        partIndex: 99,
        measureIndex: 0,
        startNoteIndex: 0,
        noteCount: 3,
        actualNotes: 3,
        normalNotes: 2,
      });

      expect(result.success).toBe(false);
    });
  });

  describe('removeTuplet', () => {
    it('should remove tuplet from notes', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      // First create a tuplet
      const withTuplet = createTuplet(score, {
        partIndex: 0,
        measureIndex: 0,
        startNoteIndex: 0,
        noteCount: 3,
        actualNotes: 3,
        normalNotes: 2,
        bracket: true,
      });
      expect(withTuplet.success).toBe(true);
      if (!withTuplet.success) return;

      // Then remove it - use noteIndex instead of startNoteIndex
      const result = removeTuplet(withTuplet.data, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0, // any note in the tuplet
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const entries = result.data.parts[0].measures[0].entries.filter(e => e.type === 'note' && !e.rest);
        // Notes should no longer have timeModification
        for (let i = 0; i < 3; i++) {
          if (entries[i].type === 'note') {
            expect(entries[i].timeModification).toBeUndefined();
          }
        }
      }
    });

    it('should fail when no tuplet exists', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const result = removeTuplet(score, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        // Returns NOTE_NOT_FOUND if note doesn't have a tuplet
        expect(result.errors[0].code).toMatch(/NOTE_NOT_FOUND|TUPLET_NOT_FOUND/);
      }
    });
  });
});

// ============================================================
// Beam Operations Tests
// ============================================================

describe('Beam Operations', () => {
  describe('addBeam', () => {
    it('should add beam to consecutive notes', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const result = addBeam(score, {
        partIndex: 0,
        measureIndex: 0,
        startNoteIndex: 0,
        noteCount: 2, // Use noteCount instead of endNoteIndex
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const entries = result.data.parts[0].measures[0].entries.filter(e => e.type === 'note' && !e.rest);
        if (entries[0].type === 'note') {
          expect(entries[0].beam).toBeDefined();
          expect(entries[0].beam?.[0]?.type).toBe('begin');
        }
        if (entries[1].type === 'note') {
          expect(entries[1].beam).toBeDefined();
          expect(entries[1].beam?.[0]?.type).toBe('end');
        }
      }
    });

    it('should add beam across multiple notes', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const result = addBeam(score, {
        partIndex: 0,
        measureIndex: 0,
        startNoteIndex: 0,
        noteCount: 4, // 4 notes beamed together
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const entries = result.data.parts[0].measures[0].entries.filter(e => e.type === 'note' && !e.rest);
        if (entries[0].type === 'note') {
          expect(entries[0].beam?.[0]?.type).toBe('begin');
        }
        // Middle notes should continue
        if (entries[1].type === 'note') {
          expect(entries[1].beam?.[0]?.type).toBe('continue');
        }
        if (entries[2].type === 'note') {
          expect(entries[2].beam?.[0]?.type).toBe('continue');
        }
        if (entries[3].type === 'note') {
          expect(entries[3].beam?.[0]?.type).toBe('end');
        }
      }
    });

    it('should fail with invalid note count', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      const result = addBeam(score, {
        partIndex: 0,
        measureIndex: 0,
        startNoteIndex: 0,
        noteCount: 5, // Only 1 note
      });

      expect(result.success).toBe(false);
    });
  });

  describe('removeBeam', () => {
    it('should remove beam from notes', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      // First add beam
      const withBeam = addBeam(score, {
        partIndex: 0,
        measureIndex: 0,
        startNoteIndex: 0,
        noteCount: 2,
      });
      expect(withBeam.success).toBe(true);
      if (!withBeam.success) return;

      // Then remove it - use noteIndex
      const result = removeBeam(withBeam.data, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const entries = result.data.parts[0].measures[0].entries.filter(e => e.type === 'note' && !e.rest);
        if (entries[0].type === 'note') {
          expect(entries[0].beam).toBeUndefined();
        }
        if (entries[1].type === 'note') {
          expect(entries[1].beam).toBeUndefined();
        }
      }
    });

    it('should fail when no beam exists', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const result = removeBeam(score, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        // Returns NOTE_NOT_FOUND or BEAM_NOT_FOUND depending on implementation
        expect(result.errors[0].code).toMatch(/NOTE_NOT_FOUND|BEAM_NOT_FOUND/);
      }
    });
  });

  describe('autoBeam', () => {
    it('should automatically beam notes in a measure', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const result = autoBeam(score, {
        partIndex: 0,
        measureIndex: 0,
      });

      expect(result.success).toBe(true);
      // The result depends on note durations and time signature
      // At minimum, it should return a valid score
      if (result.success) {
        expect(result.data.parts[0].measures[0]).toBeDefined();
      }
    });

    it('should work with specific voice filter', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const result = autoBeam(score, {
        partIndex: 0,
        measureIndex: 0,
        voice: 1,
      });

      expect(result.success).toBe(true);
    });
  });
});

// ============================================================
// Copy/Paste Operations Tests
// ============================================================

describe('Copy/Paste Operations', () => {
  describe('copyNotes', () => {
    it('should copy notes from a measure', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      // Get divisions from the score to calculate positions
      const divisions = score.parts[0].measures[0].attributes?.divisions ?? 1;

      const result = copyNotes(score, {
        partIndex: 0,
        measureIndex: 0,
        startPosition: 0,
        endPosition: divisions * 2, // Copy 2 beats worth
        voice: 1,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.notes.length).toBeGreaterThan(0);
        expect(result.data.source.partIndex).toBe(0);
        expect(result.data.source.measureIndex).toBe(0);
      }
    });

    it('should copy all notes in the range', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const divisions = score.parts[0].measures[0].attributes?.divisions ?? 1;

      const result = copyNotes(score, {
        partIndex: 0,
        measureIndex: 0,
        startPosition: 0,
        endPosition: divisions * 4, // Full measure (4 beats)
        voice: 1,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.notes.length).toBeGreaterThan(0);
      }
    });

    it('should fail with invalid measure index', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const result = copyNotes(score, {
        partIndex: 0,
        measureIndex: 99,
        startPosition: 0,
        endPosition: 4,
        voice: 1,
      });

      expect(result.success).toBe(false);
    });
  });

  describe('pasteNotes', () => {
    it('should paste copied notes into a measure', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const divisions = score.parts[0].measures[0].attributes?.divisions ?? 1;

      // First copy notes
      const copyResult = copyNotes(score, {
        partIndex: 0,
        measureIndex: 0,
        startPosition: 0,
        endPosition: divisions * 2,
        voice: 1,
      });
      expect(copyResult.success).toBe(true);
      if (!copyResult.success) return;

      // Then paste to second measure (use correct param names)
      const pasteResult = pasteNotes(score, {
        partIndex: 0,
        measureIndex: 1,
        position: 0,
        selection: copyResult.data,
      });

      expect(pasteResult.success).toBe(true);
      if (pasteResult.success) {
        const entries = pasteResult.data.parts[0].measures[1].entries.filter(e => e.type === 'note');
        expect(entries.length).toBeGreaterThan(0);
      }
    });

    it('should fail with invalid target measure', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const divisions = score.parts[0].measures[0].attributes?.divisions ?? 1;

      const copyResult = copyNotes(score, {
        partIndex: 0,
        measureIndex: 0,
        startPosition: 0,
        endPosition: divisions * 4,
        voice: 1,
      });
      expect(copyResult.success).toBe(true);
      if (!copyResult.success) return;

      const pasteResult = pasteNotes(score, {
        partIndex: 0,
        measureIndex: 99, // Invalid measure
        position: 0,
        selection: copyResult.data,
      });

      expect(pasteResult.success).toBe(false);
    });
  });

  describe('cutNotes', () => {
    it('should cut notes and return selection', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const divisions = score.parts[0].measures[0].attributes?.divisions ?? 1;

      // Count notes before cut
      const notesBefore = score.parts[0].measures[0].entries.filter(e => e.type === 'note' && !e.rest).length;

      const result = cutNotes(score, {
        partIndex: 0,
        measureIndex: 0,
        startPosition: 0,
        endPosition: divisions * 2,
        voice: 1,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        // Selection should have notes
        expect(result.data.selection.notes.length).toBeGreaterThan(0);

        // Original notes should be replaced with rests
        const notesAfter = result.data.score.parts[0].measures[0].entries.filter(e => e.type === 'note' && !e.rest);
        expect(notesAfter.length).toBeLessThan(notesBefore);
      }
    });

    it('should allow paste after cut', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const divisions = score.parts[0].measures[0].attributes?.divisions ?? 1;

      // Cut notes from first measure
      const cutResult = cutNotes(score, {
        partIndex: 0,
        measureIndex: 0,
        startPosition: 0,
        endPosition: divisions * 2,
        voice: 1,
      });
      expect(cutResult.success).toBe(true);
      if (!cutResult.success) return;

      // Paste to second measure (use correct param names)
      const pasteResult = pasteNotes(cutResult.data.score, {
        partIndex: 0,
        measureIndex: 1,
        position: 0,
        selection: cutResult.data.selection,
      });

      expect(pasteResult.success).toBe(true);
    });
  });

  describe('copyNotesMultiMeasure', () => {
    it('should copy notes across multiple measures', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const result = copyNotesMultiMeasure(score, {
        partIndex: 0,
        startMeasureIndex: 0,
        endMeasureIndex: 1,
        voice: 1,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.measures.length).toBe(2);
      }
    });

    it('should fail with invalid measure range', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const result = copyNotesMultiMeasure(score, {
        partIndex: 0,
        startMeasureIndex: 1,
        endMeasureIndex: 0, // Invalid: end before start
        voice: 1,
      });

      expect(result.success).toBe(false);
    });
  });

  describe('pasteNotesMultiMeasure', () => {
    it('should paste multi-measure selection', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      // Copy first 2 measures
      const copyResult = copyNotesMultiMeasure(score, {
        partIndex: 0,
        startMeasureIndex: 0,
        endMeasureIndex: 1,
        voice: 1,
      });
      expect(copyResult.success).toBe(true);
      if (!copyResult.success) return;

      // Insert measures to have space for paste
      const withMeasures = insertMeasure(score, { afterMeasure: 2 });
      const withMeasures2 = insertMeasure(withMeasures, { afterMeasure: 3 });

      // Paste to new location (use correct param names)
      const pasteResult = pasteNotesMultiMeasure(withMeasures2, {
        partIndex: 0,
        startMeasureIndex: 2,
        selection: copyResult.data,
      });

      expect(pasteResult.success).toBe(true);
    });
  });
});

// ============================================================
// Expression / Performance Direction Operations Tests
// ============================================================

describe('Expression/Performance Operations', () => {
  describe('addTempo', () => {
    it('should add a tempo marking to a measure', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const result = addTempo(score, {
        partIndex: 0,
        measureIndex: 0,
        position: 0,
        bpm: 120,
        beatUnit: 'quarter',
        text: 'Allegro',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const measure = result.data.parts[0].measures[0];
        const tempoDirection = measure.entries.find(
          e => e.type === 'direction' && e.directionTypes.some(dt => dt.kind === 'metronome')
        );
        expect(tempoDirection).toBeDefined();
        if (tempoDirection?.type === 'direction') {
          expect(tempoDirection.sound?.tempo).toBe(120);
        }
      }
    });

    it('should fail with invalid BPM', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const result = addTempo(score, {
        partIndex: 0,
        measureIndex: 0,
        position: 0,
        bpm: 0,
      });

      expect(result.success).toBe(false);
    });
  });

  describe('removeTempo', () => {
    it('should remove a tempo marking', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      // First add tempo
      const withTempo = addTempo(score, {
        partIndex: 0,
        measureIndex: 0,
        position: 0,
        bpm: 120,
      });
      expect(withTempo.success).toBe(true);
      if (!withTempo.success) return;

      // Then remove it
      const result = removeTempo(withTempo.data, {
        partIndex: 0,
        measureIndex: 0,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const measure = result.data.parts[0].measures[0];
        const tempoDirection = measure.entries.find(
          e => e.type === 'direction' && e.directionTypes.some(dt => dt.kind === 'metronome')
        );
        expect(tempoDirection).toBeUndefined();
      }
    });
  });

  describe('modifyTempo', () => {
    it('should modify tempo BPM', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      // First add tempo
      const withTempo = addTempo(score, {
        partIndex: 0,
        measureIndex: 0,
        position: 0,
        bpm: 100,
        beatUnit: 'quarter',
      });
      expect(withTempo.success).toBe(true);
      if (!withTempo.success) return;

      // Modify BPM to 140
      const result = modifyTempo(withTempo.data, {
        partIndex: 0,
        measureIndex: 0,
        bpm: 140,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const measure = result.data.parts[0].measures[0];
        const tempoDirection = measure.entries.find(
          e => e.type === 'direction' && e.directionTypes.some(dt => dt.kind === 'metronome')
        );
        expect(tempoDirection).toBeDefined();
        if (tempoDirection?.type === 'direction') {
          const metronome = tempoDirection.directionTypes.find(dt => dt.kind === 'metronome');
          if (metronome?.kind === 'metronome') {
            expect(metronome.perMinute).toBe(140);
          }
          // Check sound tempo was also updated
          expect(tempoDirection.sound?.tempo).toBe(140);
        }
      }
    });

    it('should modify tempo beat unit', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      // First add tempo with quarter note
      const withTempo = addTempo(score, {
        partIndex: 0,
        measureIndex: 0,
        position: 0,
        bpm: 120,
        beatUnit: 'quarter',
      });
      expect(withTempo.success).toBe(true);
      if (!withTempo.success) return;

      // Change to half note
      const result = modifyTempo(withTempo.data, {
        partIndex: 0,
        measureIndex: 0,
        beatUnit: 'half',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const measure = result.data.parts[0].measures[0];
        const tempoDirection = measure.entries.find(
          e => e.type === 'direction' && e.directionTypes.some(dt => dt.kind === 'metronome')
        );
        if (tempoDirection?.type === 'direction') {
          const metronome = tempoDirection.directionTypes.find(dt => dt.kind === 'metronome');
          if (metronome?.kind === 'metronome') {
            expect(metronome.beatUnit).toBe('half');
          }
        }
      }
    });

    it('should add tempo text', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      // First add tempo without text
      const withTempo = addTempo(score, {
        partIndex: 0,
        measureIndex: 0,
        position: 0,
        bpm: 120,
      });
      expect(withTempo.success).toBe(true);
      if (!withTempo.success) return;

      // Add text
      const result = modifyTempo(withTempo.data, {
        partIndex: 0,
        measureIndex: 0,
        text: 'Allegro',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const measure = result.data.parts[0].measures[0];
        const tempoDirection = measure.entries.find(
          e => e.type === 'direction' && e.directionTypes.some(dt => dt.kind === 'metronome')
        );
        if (tempoDirection?.type === 'direction') {
          const words = tempoDirection.directionTypes.find(dt => dt.kind === 'words');
          expect(words).toBeDefined();
          if (words?.kind === 'words') {
            expect(words.text).toBe('Allegro');
          }
        }
      }
    });

    it('should fail when modifying non-existent tempo', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const result = modifyTempo(score, {
        partIndex: 0,
        measureIndex: 0,
        bpm: 120,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors[0].code).toBe('TEMPO_NOT_FOUND');
      }
    });
  });

  describe('addWedge', () => {
    it('should add a crescendo wedge', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const divisions = score.parts[0].measures[0].attributes?.divisions ?? 1;

      const result = addWedge(score, {
        partIndex: 0,
        startMeasureIndex: 0,
        startPosition: 0,
        endMeasureIndex: 0,
        endPosition: divisions * 4, // End of measure
        type: 'crescendo',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const measure = result.data.parts[0].measures[0];
        const wedgeStart = measure.entries.find(
          e => e.type === 'direction' && e.directionTypes.some(dt => dt.kind === 'wedge' && dt.type === 'crescendo')
        );
        const wedgeStop = measure.entries.find(
          e => e.type === 'direction' && e.directionTypes.some(dt => dt.kind === 'wedge' && dt.type === 'stop')
        );
        expect(wedgeStart).toBeDefined();
        expect(wedgeStop).toBeDefined();
      }
    });

    it('should add a diminuendo wedge', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const divisions = score.parts[0].measures[0].attributes?.divisions ?? 1;

      const result = addWedge(score, {
        partIndex: 0,
        startMeasureIndex: 0,
        startPosition: 0,
        endMeasureIndex: 0,
        endPosition: divisions * 2,
        type: 'diminuendo',
      });

      expect(result.success).toBe(true);
    });

    it('should fail with invalid range', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const result = addWedge(score, {
        partIndex: 0,
        startMeasureIndex: 0,
        startPosition: 4,
        endMeasureIndex: 0,
        endPosition: 2, // Before start
        type: 'crescendo',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('removeWedge', () => {
    it('should remove a wedge and its stop', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const divisions = score.parts[0].measures[0].attributes?.divisions ?? 1;

      // First add wedge
      const withWedge = addWedge(score, {
        partIndex: 0,
        startMeasureIndex: 0,
        startPosition: 0,
        endMeasureIndex: 0,
        endPosition: divisions * 4,
        type: 'crescendo',
      });
      expect(withWedge.success).toBe(true);
      if (!withWedge.success) return;

      // Then remove it
      const result = removeWedge(withWedge.data, {
        partIndex: 0,
        measureIndex: 0,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const measure = result.data.parts[0].measures[0];
        const wedgeDirections = measure.entries.filter(
          e => e.type === 'direction' && e.directionTypes.some(dt => dt.kind === 'wedge')
        );
        expect(wedgeDirections.length).toBe(0);
      }
    });
  });

  describe('addFermata', () => {
    it('should add a fermata to a note', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const result = addFermata(score, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const note = result.data.parts[0].measures[0].entries.find(e => e.type === 'note' && !e.rest);
        if (note?.type === 'note') {
          const fermata = note.notations?.find(n => n.type === 'fermata');
          expect(fermata).toBeDefined();
        }
      }
    });

    it('should fail if fermata already exists', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      // Add first fermata
      const withFermata = addFermata(score, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
      });
      expect(withFermata.success).toBe(true);
      if (!withFermata.success) return;

      // Try to add another
      const result = addFermata(withFermata.data, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
      });

      expect(result.success).toBe(false);
    });
  });

  describe('removeFermata', () => {
    it('should remove a fermata from a note', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      // First add fermata
      const withFermata = addFermata(score, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
      });
      expect(withFermata.success).toBe(true);
      if (!withFermata.success) return;

      // Then remove it
      const result = removeFermata(withFermata.data, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const note = result.data.parts[0].measures[0].entries.find(e => e.type === 'note' && !e.rest);
        if (note?.type === 'note') {
          const fermata = note.notations?.find(n => n.type === 'fermata');
          expect(fermata).toBeUndefined();
        }
      }
    });
  });

  describe('addOrnament', () => {
    it('should add a trill to a note', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const result = addOrnament(score, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
        ornament: 'trill-mark',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const note = result.data.parts[0].measures[0].entries.find(e => e.type === 'note' && !e.rest);
        if (note?.type === 'note') {
          const ornament = note.notations?.find(n => n.type === 'ornament');
          expect(ornament).toBeDefined();
          if (ornament?.type === 'ornament') {
            expect(ornament.ornament).toBe('trill-mark');
          }
        }
      }
    });

    it('should add a mordent to a note', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const result = addOrnament(score, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
        ornament: 'mordent',
      });

      expect(result.success).toBe(true);
    });

    it('should add a turn to a note', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const result = addOrnament(score, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
        ornament: 'turn',
      });

      expect(result.success).toBe(true);
    });

    it('should fail if same ornament already exists', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const withOrnament = addOrnament(score, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
        ornament: 'trill-mark',
      });
      expect(withOrnament.success).toBe(true);
      if (!withOrnament.success) return;

      const result = addOrnament(withOrnament.data, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
        ornament: 'trill-mark',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('removeOrnament', () => {
    it('should remove an ornament from a note', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const withOrnament = addOrnament(score, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
        ornament: 'trill-mark',
      });
      expect(withOrnament.success).toBe(true);
      if (!withOrnament.success) return;

      const result = removeOrnament(withOrnament.data, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
        ornament: 'trill-mark',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const note = result.data.parts[0].measures[0].entries.find(e => e.type === 'note' && !e.rest);
        if (note?.type === 'note') {
          const ornament = note.notations?.find(n => n.type === 'ornament');
          expect(ornament).toBeUndefined();
        }
      }
    });
  });

  describe('addPedal', () => {
    it('should add a pedal start marking', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const result = addPedal(score, {
        partIndex: 0,
        measureIndex: 0,
        position: 0,
        pedalType: 'start',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const measure = result.data.parts[0].measures[0];
        const pedalDirection = measure.entries.find(
          e => e.type === 'direction' && e.directionTypes.some(dt => dt.kind === 'pedal')
        );
        expect(pedalDirection).toBeDefined();
      }
    });

    it('should add start and stop pedal markings', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const divisions = score.parts[0].measures[0].attributes?.divisions ?? 1;

      // Add start
      const withStart = addPedal(score, {
        partIndex: 0,
        measureIndex: 0,
        position: 0,
        pedalType: 'start',
      });
      expect(withStart.success).toBe(true);
      if (!withStart.success) return;

      // Add stop
      const result = addPedal(withStart.data, {
        partIndex: 0,
        measureIndex: 0,
        position: divisions * 4,
        pedalType: 'stop',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('removePedal', () => {
    it('should remove a pedal marking', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      // First add pedal
      const withPedal = addPedal(score, {
        partIndex: 0,
        measureIndex: 0,
        position: 0,
        pedalType: 'start',
      });
      expect(withPedal.success).toBe(true);
      if (!withPedal.success) return;

      // Then remove it
      const result = removePedal(withPedal.data, {
        partIndex: 0,
        measureIndex: 0,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const measure = result.data.parts[0].measures[0];
        const pedalDirection = measure.entries.find(
          e => e.type === 'direction' && e.directionTypes.some(dt => dt.kind === 'pedal')
        );
        expect(pedalDirection).toBeUndefined();
      }
    });
  });

  describe('addTextDirection', () => {
    it('should add a text direction', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const result = addTextDirection(score, {
        partIndex: 0,
        measureIndex: 0,
        position: 0,
        text: 'dolce',
        fontStyle: 'italic',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const measure = result.data.parts[0].measures[0];
        const textDirection = measure.entries.find(
          e => e.type === 'direction' && e.directionTypes.some(dt => dt.kind === 'words' && dt.text === 'dolce')
        );
        expect(textDirection).toBeDefined();
      }
    });

    it('should fail with empty text', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const result = addTextDirection(score, {
        partIndex: 0,
        measureIndex: 0,
        position: 0,
        text: '',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('addRehearsalMark', () => {
    it('should add a rehearsal mark', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const result = addRehearsalMark(score, {
        partIndex: 0,
        measureIndex: 0,
        text: 'A',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const measure = result.data.parts[0].measures[0];
        const rehearsalDirection = measure.entries.find(
          e => e.type === 'direction' && e.directionTypes.some(dt => dt.kind === 'rehearsal')
        );
        expect(rehearsalDirection).toBeDefined();
      }
    });

    it('should add numbered rehearsal marks', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const result = addRehearsalMark(score, {
        partIndex: 0,
        measureIndex: 0,
        text: '1',
        enclosure: 'circle',
      });

      expect(result.success).toBe(true);
    });
  });

  // ============================================================
  // Phase 1: Repeat and Structure Operations Tests
  // ============================================================
  describe('addRepeatBarline', () => {
    it('should add a forward repeat barline', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const result = addRepeatBarline(score, {
        partIndex: 0,
        measureIndex: 0,
        direction: 'forward',
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      const measure = result.data.parts[0].measures[0];
      expect(measure.barlines).toBeDefined();
      const leftBarline = measure.barlines?.find(b => b.location === 'left');
      expect(leftBarline).toBeDefined();
      expect(leftBarline?.repeat?.direction).toBe('forward');
      expect(leftBarline?.barStyle).toBe('heavy-light');
    });

    it('should add a backward repeat barline', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const result = addRepeatBarline(score, {
        partIndex: 0,
        measureIndex: 0,
        direction: 'backward',
        times: 2,
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      const measure = result.data.parts[0].measures[0];
      const rightBarline = measure.barlines?.find(b => b.location === 'right');
      expect(rightBarline).toBeDefined();
      expect(rightBarline?.repeat?.direction).toBe('backward');
      expect(rightBarline?.repeat?.times).toBe(2);
    });

    it('should fail if repeat already exists', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const result1 = addRepeatBarline(score, {
        partIndex: 0,
        measureIndex: 0,
        direction: 'forward',
      });
      expect(result1.success).toBe(true);
      if (!result1.success) return;

      const result2 = addRepeatBarline(result1.data, {
        partIndex: 0,
        measureIndex: 0,
        direction: 'forward',
      });
      expect(result2.success).toBe(false);
    });
  });

  describe('removeRepeatBarline', () => {
    it('should remove a repeat barline', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      // First add a repeat
      const addResult = addRepeatBarline(score, {
        partIndex: 0,
        measureIndex: 0,
        direction: 'forward',
      });
      expect(addResult.success).toBe(true);
      if (!addResult.success) return;

      // Then remove it
      const removeResult = removeRepeatBarline(addResult.data, {
        partIndex: 0,
        measureIndex: 0,
        location: 'left',
      });
      expect(removeResult.success).toBe(true);
      if (!removeResult.success) return;

      const measure = removeResult.data.parts[0].measures[0];
      expect(measure.barlines).toBeUndefined();
    });
  });

  describe('addEnding', () => {
    it('should add a volta bracket (ending)', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const result = addEnding(score, {
        partIndex: 0,
        measureIndex: 0,
        number: '1',
        type: 'start',
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      const measure = result.data.parts[0].measures[0];
      const leftBarline = measure.barlines?.find(b => b.location === 'left');
      expect(leftBarline?.ending).toBeDefined();
      expect(leftBarline?.ending?.number).toBe('1');
      expect(leftBarline?.ending?.type).toBe('start');
    });
  });

  describe('removeEnding', () => {
    it('should remove a volta bracket', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      // Add then remove
      const addResult = addEnding(score, {
        partIndex: 0,
        measureIndex: 0,
        number: '1',
        type: 'start',
      });
      expect(addResult.success).toBe(true);
      if (!addResult.success) return;

      const removeResult = removeEnding(addResult.data, {
        partIndex: 0,
        measureIndex: 0,
        location: 'left',
      });
      expect(removeResult.success).toBe(true);
    });
  });

  describe('changeBarline', () => {
    it('should change barline style', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const result = changeBarline(score, {
        partIndex: 0,
        measureIndex: 0,
        location: 'right',
        barStyle: 'light-heavy',
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      const measure = result.data.parts[0].measures[0];
      const rightBarline = measure.barlines?.find(b => b.location === 'right');
      expect(rightBarline?.barStyle).toBe('light-heavy');
    });
  });

  describe('addSegno', () => {
    it('should add a segno sign', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const result = addSegno(score, {
        partIndex: 0,
        measureIndex: 0,
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      const measure = result.data.parts[0].measures[0];
      const segnoDirection = measure.entries.find(
        e => e.type === 'direction' && e.directionTypes.some(dt => dt.kind === 'segno')
      );
      expect(segnoDirection).toBeDefined();
    });
  });

  describe('addCoda', () => {
    it('should add a coda sign', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const result = addCoda(score, {
        partIndex: 0,
        measureIndex: 0,
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      const measure = result.data.parts[0].measures[0];
      const codaDirection = measure.entries.find(
        e => e.type === 'direction' && e.directionTypes.some(dt => dt.kind === 'coda')
      );
      expect(codaDirection).toBeDefined();
    });
  });

  describe('addDaCapo', () => {
    it('should add D.C. marking with sound element', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const result = addDaCapo(score, {
        partIndex: 0,
        measureIndex: 0,
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      const measure = result.data.parts[0].measures[0];
      const dcDirection = measure.entries.find(
        e => e.type === 'direction' && e.directionTypes.some(dt => dt.kind === 'words' && dt.text === 'D.C.')
      );
      expect(dcDirection).toBeDefined();

      const soundEntry = measure.entries.find(e => e.type === 'sound' && e.dacapo === true);
      expect(soundEntry).toBeDefined();
    });
  });

  describe('addDalSegno', () => {
    it('should add D.S. marking with sound element', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const result = addDalSegno(score, {
        partIndex: 0,
        measureIndex: 0,
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      const measure = result.data.parts[0].measures[0];
      const soundEntry = measure.entries.find(e => e.type === 'sound' && e.dalsegno);
      expect(soundEntry).toBeDefined();
    });
  });

  describe('addFine', () => {
    it('should add Fine marking with sound element', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const result = addFine(score, {
        partIndex: 0,
        measureIndex: 0,
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      const measure = result.data.parts[0].measures[0];
      const soundEntry = measure.entries.find(e => e.type === 'sound' && e.fine === true);
      expect(soundEntry).toBeDefined();
    });
  });

  describe('addToCoda', () => {
    it('should add To Coda marking with sound element', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const result = addToCoda(score, {
        partIndex: 0,
        measureIndex: 0,
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      const measure = result.data.parts[0].measures[0];
      const soundEntry = measure.entries.find(e => e.type === 'sound' && e.tocoda);
      expect(soundEntry).toBeDefined();
    });
  });

  // ============================================================
  // Phase 2: Grace Note Operations Tests
  // ============================================================
  describe('addGraceNote', () => {
    it('should add a grace note before target note', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const result = addGraceNote(score, {
        partIndex: 0,
        measureIndex: 0,
        targetNoteIndex: 0,
        pitch: { step: 'D', octave: 4 },
        slash: true,
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      const measure = result.data.parts[0].measures[0];
      const graceNote = measure.entries.find(e => e.type === 'note' && e.grace);
      expect(graceNote).toBeDefined();
      if (graceNote?.type === 'note') {
        expect(graceNote.pitch?.step).toBe('D');
        expect(graceNote.grace?.slash).toBe(true);
        expect(graceNote.duration).toBe(0);
      }
    });

    it('should fail for invalid note index', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      const result = addGraceNote(score, {
        partIndex: 0,
        measureIndex: 0,
        targetNoteIndex: 99,
        pitch: { step: 'D', octave: 4 },
      });

      expect(result.success).toBe(false);
    });
  });

  describe('removeGraceNote', () => {
    it('should remove a grace note', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      // Add then remove
      const addResult = addGraceNote(score, {
        partIndex: 0,
        measureIndex: 0,
        targetNoteIndex: 0,
        pitch: { step: 'D', octave: 4 },
      });
      expect(addResult.success).toBe(true);
      if (!addResult.success) return;

      const removeResult = removeGraceNote(addResult.data, {
        partIndex: 0,
        measureIndex: 0,
        graceNoteIndex: 0,
      });
      expect(removeResult.success).toBe(true);
      if (!removeResult.success) return;

      const measure = removeResult.data.parts[0].measures[0];
      const graceNote = measure.entries.find(e => e.type === 'note' && e.grace);
      expect(graceNote).toBeUndefined();
    });
  });

  describe('convertToGrace', () => {
    it('should convert a regular note to grace note', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const result = convertToGrace(score, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
        slash: false,
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      const measure = result.data.parts[0].measures[0];
      const firstNote = measure.entries.find(e => e.type === 'note');
      if (firstNote?.type === 'note') {
        expect(firstNote.grace).toBeDefined();
        expect(firstNote.grace?.slash).toBe(false);
        expect(firstNote.duration).toBe(0);
      }
    });
  });

  // ============================================================
  // Phase 3: Lyric Operations Tests
  // ============================================================
  describe('addLyric', () => {
    it('should add a lyric to a note', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const result = addLyric(score, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
        text: 'La',
        syllabic: 'single',
        verse: 1,
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      const measure = result.data.parts[0].measures[0];
      const note = measure.entries.find(e => e.type === 'note' && !e.rest);
      if (note?.type === 'note') {
        expect(note.lyrics).toBeDefined();
        expect(note.lyrics?.[0].text).toBe('La');
        expect(note.lyrics?.[0].syllabic).toBe('single');
        expect(note.lyrics?.[0].number).toBe(1);
      }
    });

    it('should fail if lyric already exists for verse', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const result1 = addLyric(score, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
        text: 'La',
        verse: 1,
      });
      expect(result1.success).toBe(true);
      if (!result1.success) return;

      const result2 = addLyric(result1.data, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
        text: 'Ti',
        verse: 1,
      });
      expect(result2.success).toBe(false);
    });

    it('should allow multiple verses on same note', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const result1 = addLyric(score, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
        text: 'First',
        verse: 1,
      });
      expect(result1.success).toBe(true);
      if (!result1.success) return;

      const result2 = addLyric(result1.data, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
        text: 'Second',
        verse: 2,
      });
      expect(result2.success).toBe(true);
      if (!result2.success) return;

      const measure = result2.data.parts[0].measures[0];
      const note = measure.entries.find(e => e.type === 'note' && !e.rest);
      if (note?.type === 'note') {
        expect(note.lyrics?.length).toBe(2);
      }
    });
  });

  describe('removeLyric', () => {
    it('should remove a lyric from a note', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      // Add then remove
      const addResult = addLyric(score, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
        text: 'La',
        verse: 1,
      });
      expect(addResult.success).toBe(true);
      if (!addResult.success) return;

      const removeResult = removeLyric(addResult.data, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
        verse: 1,
      });
      expect(removeResult.success).toBe(true);
      if (!removeResult.success) return;

      const measure = removeResult.data.parts[0].measures[0];
      const note = measure.entries.find(e => e.type === 'note' && !e.rest);
      if (note?.type === 'note') {
        expect(note.lyrics).toBeUndefined();
      }
    });
  });

  describe('updateLyric', () => {
    it('should update an existing lyric', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      // Add first
      const addResult = addLyric(score, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
        text: 'La',
        syllabic: 'single',
        verse: 1,
      });
      expect(addResult.success).toBe(true);
      if (!addResult.success) return;

      // Update
      const updateResult = updateLyric(addResult.data, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
        verse: 1,
        text: 'Fa',
        syllabic: 'begin',
      });
      expect(updateResult.success).toBe(true);
      if (!updateResult.success) return;

      const measure = updateResult.data.parts[0].measures[0];
      const note = measure.entries.find(e => e.type === 'note' && !e.rest);
      if (note?.type === 'note') {
        expect(note.lyrics?.[0].text).toBe('Fa');
        expect(note.lyrics?.[0].syllabic).toBe('begin');
      }
    });
  });

  // ============================================================
  // Phase 4: Harmony Operations Tests
  // ============================================================
  describe('addHarmony', () => {
    it('should add a harmony (chord symbol)', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const result = addHarmony(score, {
        partIndex: 0,
        measureIndex: 0,
        position: 0,
        root: { step: 'C' },
        kind: 'major',
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      const measure = result.data.parts[0].measures[0];
      const harmony = measure.entries.find(e => e.type === 'harmony');
      expect(harmony).toBeDefined();
      if (harmony?.type === 'harmony') {
        expect(harmony.root.rootStep).toBe('C');
        expect(harmony.kind).toBe('major');
      }
    });

    it('should add harmony with bass note', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const result = addHarmony(score, {
        partIndex: 0,
        measureIndex: 0,
        position: 0,
        root: { step: 'C' },
        kind: 'major',
        bass: { step: 'E' },
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      const measure = result.data.parts[0].measures[0];
      const harmony = measure.entries.find(e => e.type === 'harmony');
      if (harmony?.type === 'harmony') {
        expect(harmony.bass?.bassStep).toBe('E');
      }
    });

    it('should add harmony with alterations', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const result = addHarmony(score, {
        partIndex: 0,
        measureIndex: 0,
        position: 0,
        root: { step: 'C', alter: 1 }, // C#
        kind: 'minor-seventh',
        degrees: [{ value: 9, alter: 0, type: 'add' }],
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      const measure = result.data.parts[0].measures[0];
      const harmony = measure.entries.find(e => e.type === 'harmony');
      if (harmony?.type === 'harmony') {
        expect(harmony.root.rootAlter).toBe(1);
        expect(harmony.kind).toBe('minor-seventh');
        expect(harmony.degrees?.[0].degreeValue).toBe(9);
      }
    });

    it('should fail for invalid root step', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const result = addHarmony(score, {
        partIndex: 0,
        measureIndex: 0,
        position: 0,
        root: { step: 'X' },
        kind: 'major',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('removeHarmony', () => {
    it('should remove a harmony', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      // Add then remove
      const addResult = addHarmony(score, {
        partIndex: 0,
        measureIndex: 0,
        position: 0,
        root: { step: 'C' },
        kind: 'major',
      });
      expect(addResult.success).toBe(true);
      if (!addResult.success) return;

      const removeResult = removeHarmony(addResult.data, {
        partIndex: 0,
        measureIndex: 0,
        harmonyIndex: 0,
      });
      expect(removeResult.success).toBe(true);
      if (!removeResult.success) return;

      const measure = removeResult.data.parts[0].measures[0];
      const harmony = measure.entries.find(e => e.type === 'harmony');
      expect(harmony).toBeUndefined();
    });
  });

  describe('updateHarmony', () => {
    it('should update an existing harmony', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      // Add first
      const addResult = addHarmony(score, {
        partIndex: 0,
        measureIndex: 0,
        position: 0,
        root: { step: 'C' },
        kind: 'major',
      });
      expect(addResult.success).toBe(true);
      if (!addResult.success) return;

      // Update to Cm7
      const updateResult = updateHarmony(addResult.data, {
        partIndex: 0,
        measureIndex: 0,
        harmonyIndex: 0,
        kind: 'minor-seventh',
        bass: { step: 'G' },
      });
      expect(updateResult.success).toBe(true);
      if (!updateResult.success) return;

      const measure = updateResult.data.parts[0].measures[0];
      const harmony = measure.entries.find(e => e.type === 'harmony');
      if (harmony?.type === 'harmony') {
        expect(harmony.root.rootStep).toBe('C'); // unchanged
        expect(harmony.kind).toBe('minor-seventh');
        expect(harmony.bass?.bassStep).toBe('G');
      }
    });

    it('should remove bass with null', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      // Add with bass
      const addResult = addHarmony(score, {
        partIndex: 0,
        measureIndex: 0,
        position: 0,
        root: { step: 'C' },
        kind: 'major',
        bass: { step: 'E' },
      });
      expect(addResult.success).toBe(true);
      if (!addResult.success) return;

      // Remove bass
      const updateResult = updateHarmony(addResult.data, {
        partIndex: 0,
        measureIndex: 0,
        harmonyIndex: 0,
        bass: null,
      });
      expect(updateResult.success).toBe(true);
      if (!updateResult.success) return;

      const measure = updateResult.data.parts[0].measures[0];
      const harmony = measure.entries.find(e => e.type === 'harmony');
      if (harmony?.type === 'harmony') {
        expect(harmony.bass).toBeUndefined();
      }
    });
  });

  // ============================================================
  // Phase 5: Technical Notations, Octave Shift, and Breath Operations
  // ============================================================

  describe('addFingering', () => {
    it('should add fingering to a note', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const result = addFingering(score, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
        fingering: '1',
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      const note = result.data.parts[0].measures[0].entries.find(e => e.type === 'note');
      if (note?.type === 'note') {
        expect(note.notations).toBeDefined();
        const technical = note.notations?.find(n => n.type === 'technical' && n.technical === 'fingering');
        expect(technical).toBeDefined();
        if (technical?.type === 'technical' && technical.technical === 'fingering') {
          expect(technical.fingering).toBe('1');
        }
      }
    });

    it('should add fingering with substitution flag', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const result = addFingering(score, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
        fingering: '3',
        substitution: true,
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      const note = result.data.parts[0].measures[0].entries.find(e => e.type === 'note');
      if (note?.type === 'note') {
        const technical = note.notations?.find(n => n.type === 'technical' && n.technical === 'fingering');
        if (technical?.type === 'technical' && technical.technical === 'fingering') {
          expect(technical.fingeringSubstitution).toBe(true);
        }
      }
    });

    it('should fail for invalid note index', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const result = addFingering(score, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 999,
        fingering: '1',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('removeFingering', () => {
    it('should remove fingering from a note', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      // Add then remove
      const addResult = addFingering(score, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
        fingering: '1',
      });
      expect(addResult.success).toBe(true);
      if (!addResult.success) return;

      const removeResult = removeFingering(addResult.data, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
      });
      expect(removeResult.success).toBe(true);
      if (!removeResult.success) return;

      const note = removeResult.data.parts[0].measures[0].entries.find(e => e.type === 'note');
      if (note?.type === 'note') {
        const technical = note.notations?.find(n => n.type === 'technical' && n.technical === 'fingering');
        expect(technical).toBeUndefined();
      }
    });
  });

  describe('addBowing', () => {
    it('should add up-bow to a note', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const result = addBowing(score, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
        bowingType: 'up-bow',
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      const note = result.data.parts[0].measures[0].entries.find(e => e.type === 'note');
      if (note?.type === 'note') {
        expect(note.notations).toBeDefined();
        const technical = note.notations?.find(n => n.type === 'technical' && n.technical === 'up-bow');
        expect(technical).toBeDefined();
      }
    });

    it('should add down-bow to a note', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const result = addBowing(score, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
        bowingType: 'down-bow',
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      const note = result.data.parts[0].measures[0].entries.find(e => e.type === 'note');
      if (note?.type === 'note') {
        const technical = note.notations?.find(n => n.type === 'technical' && n.technical === 'down-bow');
        expect(technical).toBeDefined();
      }
    });
  });

  describe('removeBowing', () => {
    it('should remove bowing from a note', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      // Add then remove
      const addResult = addBowing(score, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
        bowingType: 'up-bow',
      });
      expect(addResult.success).toBe(true);
      if (!addResult.success) return;

      const removeResult = removeBowing(addResult.data, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
        bowingType: 'up-bow',
      });
      expect(removeResult.success).toBe(true);
      if (!removeResult.success) return;

      const note = removeResult.data.parts[0].measures[0].entries.find(e => e.type === 'note');
      if (note?.type === 'note') {
        const technical = note.notations?.find(n => n.type === 'technical' && n.technical === 'up-bow');
        expect(technical).toBeUndefined();
      }
    });
  });

  describe('addStringNumber', () => {
    it('should add string number to a note', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const result = addStringNumber(score, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
        stringNumber: 1,
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      const note = result.data.parts[0].measures[0].entries.find(e => e.type === 'note');
      if (note?.type === 'note') {
        expect(note.notations).toBeDefined();
        const technical = note.notations?.find(n => n.type === 'technical' && n.technical === 'string');
        expect(technical).toBeDefined();
        if (technical?.type === 'technical' && technical.technical === 'string') {
          expect(technical.string).toBe(1);
        }
      }
    });
  });

  describe('removeStringNumber', () => {
    it('should remove string number from a note', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      // Add then remove
      const addResult = addStringNumber(score, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
        stringNumber: 1,
      });
      expect(addResult.success).toBe(true);
      if (!addResult.success) return;

      const removeResult = removeStringNumber(addResult.data, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
      });
      expect(removeResult.success).toBe(true);
      if (!removeResult.success) return;

      const note = removeResult.data.parts[0].measures[0].entries.find(e => e.type === 'note');
      if (note?.type === 'note') {
        const technical = note.notations?.find(n => n.type === 'technical' && n.technical === 'string');
        expect(technical).toBeUndefined();
      }
    });
  });

  describe('addOctaveShift', () => {
    it('should add 8va (octave up shift)', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const result = addOctaveShift(score, {
        partIndex: 0,
        measureIndex: 0,
        position: 0,
        shiftType: 'down', // down type = 8va (notes written higher)
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      const measure = result.data.parts[0].measures[0];
      const direction = measure.entries.find(e => e.type === 'direction');
      expect(direction).toBeDefined();
      if (direction?.type === 'direction') {
        const octaveShift = direction.directionTypes.find(dt => dt.kind === 'octave-shift');
        expect(octaveShift).toBeDefined();
        if (octaveShift?.kind === 'octave-shift') {
          expect(octaveShift.type).toBe('down');
          expect(octaveShift.size).toBe(8);
        }
      }
    });

    it('should add 8vb (octave down shift)', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const result = addOctaveShift(score, {
        partIndex: 0,
        measureIndex: 0,
        position: 0,
        shiftType: 'up', // up type = 8vb (notes written lower)
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      const measure = result.data.parts[0].measures[0];
      const direction = measure.entries.find(e => e.type === 'direction');
      if (direction?.type === 'direction') {
        const octaveShift = direction.directionTypes.find(dt => dt.kind === 'octave-shift');
        if (octaveShift?.kind === 'octave-shift') {
          expect(octaveShift.type).toBe('up');
        }
      }
    });

    it('should add 15ma (two octaves)', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const result = addOctaveShift(score, {
        partIndex: 0,
        measureIndex: 0,
        position: 0,
        shiftType: 'down',
        size: 15,
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      const measure = result.data.parts[0].measures[0];
      const direction = measure.entries.find(e => e.type === 'direction');
      if (direction?.type === 'direction') {
        const octaveShift = direction.directionTypes.find(dt => dt.kind === 'octave-shift');
        if (octaveShift?.kind === 'octave-shift') {
          expect(octaveShift.size).toBe(15);
        }
      }
    });
  });

  describe('stopOctaveShift', () => {
    it('should stop an octave shift', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      // Add then stop
      const addResult = addOctaveShift(score, {
        partIndex: 0,
        measureIndex: 0,
        position: 0,
        shiftType: 'down',
      });
      expect(addResult.success).toBe(true);
      if (!addResult.success) return;

      const stopResult = stopOctaveShift(addResult.data, {
        partIndex: 0,
        measureIndex: 0,
        position: 480, // Stop at end of measure
      });

      expect(stopResult.success).toBe(true);
      if (!stopResult.success) return;

      const measure = stopResult.data.parts[0].measures[0];
      const directions = measure.entries.filter(e => e.type === 'direction');
      // Should have two directions: start and stop
      const stopDirection = directions.find(d =>
        d.type === 'direction' &&
        d.directionTypes.some(dt => dt.kind === 'octave-shift' && dt.type === 'stop')
      );
      expect(stopDirection).toBeDefined();
    });
  });

  describe('removeOctaveShift', () => {
    it('should remove an octave shift', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      // Add then remove
      const addResult = addOctaveShift(score, {
        partIndex: 0,
        measureIndex: 0,
        position: 0,
        shiftType: 'down',
      });
      expect(addResult.success).toBe(true);
      if (!addResult.success) return;

      const removeResult = removeOctaveShift(addResult.data, {
        partIndex: 0,
        measureIndex: 0,
      });

      expect(removeResult.success).toBe(true);
      if (!removeResult.success) return;

      const measure = removeResult.data.parts[0].measures[0];
      const octaveShift = measure.entries.find(e =>
        e.type === 'direction' &&
        e.directionTypes.some(dt => dt.kind === 'octave-shift')
      );
      expect(octaveShift).toBeUndefined();
    });
  });

  describe('addBreathMark', () => {
    it('should add a breath mark to a note', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const result = addBreathMark(score, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      const note = result.data.parts[0].measures[0].entries.find(e => e.type === 'note');
      if (note?.type === 'note') {
        expect(note.notations).toBeDefined();
        const breathMark = note.notations?.find(n => n.type === 'articulation' && n.articulation === 'breath-mark');
        expect(breathMark).toBeDefined();
      }
    });

    it('should not add duplicate breath mark', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const firstResult = addBreathMark(score, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
      });
      expect(firstResult.success).toBe(true);
      if (!firstResult.success) return;

      const secondResult = addBreathMark(firstResult.data, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
      });
      expect(secondResult.success).toBe(false);
    });
  });

  describe('removeBreathMark', () => {
    it('should remove a breath mark from a note', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      // Add then remove
      const addResult = addBreathMark(score, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
      });
      expect(addResult.success).toBe(true);
      if (!addResult.success) return;

      const removeResult = removeBreathMark(addResult.data, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
      });
      expect(removeResult.success).toBe(true);
      if (!removeResult.success) return;

      const note = removeResult.data.parts[0].measures[0].entries.find(e => e.type === 'note');
      if (note?.type === 'note') {
        const breathMark = note.notations?.find(n => n.type === 'articulation' && n.articulation === 'breath-mark');
        expect(breathMark).toBeUndefined();
      }
    });
  });

  describe('addCaesura', () => {
    it('should add a caesura to a note', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const result = addCaesura(score, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      const note = result.data.parts[0].measures[0].entries.find(e => e.type === 'note');
      if (note?.type === 'note') {
        expect(note.notations).toBeDefined();
        const caesura = note.notations?.find(n => n.type === 'articulation' && n.articulation === 'caesura');
        expect(caesura).toBeDefined();
      }
    });

    it('should not add duplicate caesura', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const firstResult = addCaesura(score, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
      });
      expect(firstResult.success).toBe(true);
      if (!firstResult.success) return;

      const secondResult = addCaesura(firstResult.data, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
      });
      expect(secondResult.success).toBe(false);
    });
  });

  describe('removeCaesura', () => {
    it('should remove a caesura from a note', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      // Add then remove
      const addResult = addCaesura(score, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
      });
      expect(addResult.success).toBe(true);
      if (!addResult.success) return;

      const removeResult = removeCaesura(addResult.data, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
      });
      expect(removeResult.success).toBe(true);
      if (!removeResult.success) return;

      const note = removeResult.data.parts[0].measures[0].entries.find(e => e.type === 'note');
      if (note?.type === 'note') {
        const caesura = note.notations?.find(n => n.type === 'articulation' && n.articulation === 'caesura');
        expect(caesura).toBeUndefined();
      }
    });

    it('should fail when caesura not found', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const result = removeCaesura(score, {
        partIndex: 0,
        measureIndex: 0,
        noteIndex: 0,
      });
      expect(result.success).toBe(false);
    });
  });

  // ============================================================
  // Convenience Alias Tests
  // ============================================================

  describe('Convenience Aliases', () => {
    it('addText should be an alias for addTextDirection', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const result = addText(score, {
        partIndex: 0,
        measureIndex: 0,
        position: 0,
        text: 'dolce',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const measure = result.data.parts[0].measures[0];
        const textDirection = measure.entries.find(
          e => e.type === 'direction' && e.directionTypes.some(dt => dt.kind === 'words')
        );
        expect(textDirection).toBeDefined();
      }
    });

    it('setBeaming should be an alias for autoBeam', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const result = setBeaming(score, {
        partIndex: 0,
        measureIndex: 0,
      });

      expect(result.success).toBe(true);
    });

    it('addChordSymbol should be an alias for addHarmony', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const result = addChordSymbol(score, {
        partIndex: 0,
        measureIndex: 0,
        position: 0,
        root: { step: 'C' },
        kind: 'major',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const measure = result.data.parts[0].measures[0];
        const harmony = measure.entries.find(e => e.type === 'harmony');
        expect(harmony).toBeDefined();
      }
    });

    it('changeClef should be an alias for insertClefChange', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      const result = changeClef(score, {
        partIndex: 0,
        measureIndex: 0,
        position: 0,
        clef: { sign: 'F', line: 4 },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const clef = result.data.parts[0].measures[0].attributes?.clef?.[0];
        expect(clef?.sign).toBe('F');
      }
    });

    it('setBarline should be an alias for changeBarline', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const result = setBarline(score, {
        partIndex: 0,
        measureIndex: 0,
        location: 'right',
        barStyle: 'light-heavy',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const measure = result.data.parts[0].measures[0];
        const barline = measure.barlines?.find(b => b.location === 'right');
        expect(barline?.barStyle).toBe('light-heavy');
      }
    });

    it('addRepeat should be an alias for addRepeatBarline', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const result = addRepeat(score, {
        partIndex: 0,
        measureIndex: 0,
        direction: 'forward',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const measure = result.data.parts[0].measures[0];
        const repeatBarline = measure.barlines?.find(b => b.repeat);
        expect(repeatBarline).toBeDefined();
        expect(repeatBarline?.repeat?.direction).toBe('forward');
      }
    });

    it('removeChordSymbol should be an alias for removeHarmony', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      // First add a chord symbol
      const withChord = addChordSymbol(score, {
        partIndex: 0,
        measureIndex: 0,
        position: 0,
        root: { step: 'G' },
        kind: 'major',
      });
      expect(withChord.success).toBe(true);
      if (!withChord.success) return;

      // Then remove it
      const result = removeChordSymbol(withChord.data, {
        partIndex: 0,
        measureIndex: 0,
        harmonyIndex: 0,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const measure = result.data.parts[0].measures[0];
        const harmony = measure.entries.find(e => e.type === 'harmony');
        expect(harmony).toBeUndefined();
      }
    });

    it('updateChordSymbol should be an alias for updateHarmony', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      // First add a chord symbol
      const withChord = addChordSymbol(score, {
        partIndex: 0,
        measureIndex: 0,
        position: 0,
        root: { step: 'D' },
        kind: 'minor',
      });
      expect(withChord.success).toBe(true);
      if (!withChord.success) return;

      // Update it
      const result = updateChordSymbol(withChord.data, {
        partIndex: 0,
        measureIndex: 0,
        harmonyIndex: 0,
        root: { step: 'E' },
        kind: 'major',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const measure = result.data.parts[0].measures[0];
        const harmony = measure.entries.find(e => e.type === 'harmony');
        if (harmony?.type === 'harmony') {
          // HarmonyEntry uses rootStep, not step
          expect(harmony.root.rootStep).toBe('E');
          expect(harmony.kind).toBe('major');
        }
      }
    });

    it('removeRepeat should be an alias for removeRepeatBarline', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      // First add a repeat (forward goes to left barline)
      const withRepeat = addRepeat(score, {
        partIndex: 0,
        measureIndex: 0,
        direction: 'forward',
      });
      expect(withRepeat.success).toBe(true);
      if (!withRepeat.success) return;

      // Then remove it (forward barline is at 'left' location)
      const result = removeRepeat(withRepeat.data, {
        partIndex: 0,
        measureIndex: 0,
        location: 'left',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const measure = result.data.parts[0].measures[0];
        const repeatBarline = measure.barlines?.find(b => b.repeat);
        expect(repeatBarline).toBeUndefined();
      }
    });
  });
});
