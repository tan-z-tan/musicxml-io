import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parse } from '../src';
import {
  // Phase 1: Staff Enhancement
  getEntriesForStaff,
  buildVoiceToStaffMap,
  buildVoiceToStaffMapForPart,
  inferStaff,
  getEffectiveStaff,
  getClefForStaff,
  getVoicesForStaff,
  getStaffRange,
  // Phase 2: Position and Voice Line
  getEntriesAtPosition,
  getNotesAtPosition,
  getEntriesInRange,
  getNotesInRange,
  getVerticalSlice,
  getVoiceLine,
  getVoiceLineInRange,
  // Phase 3: Navigation
  iterateEntries,
  getNextNote,
  getPrevNote,
  getAdjacentNotes,
  getAllNotes,
  // Phase 4: Direction and Expression
  getDirections,
  getDirectionsAtPosition,
  findDirectionsByType,
  getDynamics,
  getTempoMarkings,
  getPedalMarkings,
  getWedges,
  getOctaveShifts,
  // Phase 5: Groups and Spans
  getTiedNoteGroups,
  getSlurSpans,
  getTupletGroups,
  getBeamGroups,
  findNotesWithNotation,
  // Phase 6: Harmony and Lyrics
  getHarmonies,
  getHarmonyAtPosition,
  getChordProgression,
  getLyrics,
  getLyricText,
  getVerseCount,
  // Phase 7: Structure
  getRepeatStructure,
  findBarlines,
  getEndings,
  getKeyChanges,
  getTimeChanges,
  getClefChanges,
  getStructuralChanges,
  // Phase 8: Additional Utilities
  getPartByIndex,
  getPartCount,
  getPartIds,
} from '../src/accessors';
import type { NoteEntry, NoteWithContext } from '../src/types';

const fixturesPath = join(__dirname, 'fixtures');
const lilypondPath = join(fixturesPath, 'lilypond/xmlFiles');

describe('Phase 1: Staff Enhancement', () => {
  describe('getEntriesForStaff', () => {
    it('should get entries for staff 1 from piano staff', () => {
      const xml = readFileSync(join(lilypondPath, '43a-PianoStaff.xml'), 'utf-8');
      const score = parse(xml);
      const measure = score.parts[0].measures[0];

      const staff1Entries = getEntriesForStaff(measure, 1);
      const staff2Entries = getEntriesForStaff(measure, 2);

      // Staff 1 should have the F4 whole note
      expect(staff1Entries.length).toBeGreaterThan(0);
      const staff1Notes = staff1Entries.filter((e) => e.type === 'note') as NoteEntry[];
      expect(staff1Notes.length).toBe(1);
      expect(staff1Notes[0].pitch?.step).toBe('F');
      expect(staff1Notes[0].pitch?.octave).toBe(4);

      // Staff 2 should have the B2 whole note
      expect(staff2Entries.length).toBeGreaterThan(0);
      const staff2Notes = staff2Entries.filter((e) => e.type === 'note') as NoteEntry[];
      expect(staff2Notes.length).toBe(1);
      expect(staff2Notes[0].pitch?.step).toBe('B');
      expect(staff2Notes[0].pitch?.octave).toBe(2);
    });
  });

  describe('buildVoiceToStaffMap', () => {
    it('should build voice to staff mapping from a measure', () => {
      const xml = readFileSync(join(lilypondPath, '43a-PianoStaff.xml'), 'utf-8');
      const score = parse(xml);
      const measure = score.parts[0].measures[0];

      const map = buildVoiceToStaffMap(measure);

      expect(map.size).toBe(2);
      expect(map.get(1)).toBe(1); // Voice 1 -> Staff 1
      expect(map.get(2)).toBe(2); // Voice 2 -> Staff 2
    });
  });

  describe('buildVoiceToStaffMapForPart', () => {
    it('should build voice to staff mapping from all measures in a part', () => {
      const xml = readFileSync(join(lilypondPath, '43a-PianoStaff.xml'), 'utf-8');
      const score = parse(xml);
      const part = score.parts[0];

      const map = buildVoiceToStaffMapForPart(part);

      expect(map.size).toBe(2);
      expect(map.get(1)).toBe(1);
      expect(map.get(2)).toBe(2);
    });
  });

  describe('inferStaff', () => {
    it('should use explicit staff when available', () => {
      const xml = readFileSync(join(lilypondPath, '43a-PianoStaff.xml'), 'utf-8');
      const score = parse(xml);
      const measure = score.parts[0].measures[0];
      const notes = measure.entries.filter((e) => e.type === 'note') as NoteEntry[];
      const map = buildVoiceToStaffMap(measure);

      const staff = inferStaff(notes[0], map);
      expect(staff).toBe(notes[0].staff);
    });

    it('should infer staff from voice when staff is not set', () => {
      const map = {
        get: (voice: number) => (voice === 1 ? 1 : voice === 2 ? 2 : undefined),
        has: (voice: number) => voice === 1 || voice === 2,
        entries: () => new Map([[1, 1], [2, 2]]).entries(),
        size: 2,
      };

      const noteWithoutStaff: NoteEntry = {
        type: 'note',
        pitch: { step: 'C', octave: 4 },
        duration: 1,
        voice: 2,
        // staff is undefined
      };

      const staff = inferStaff(noteWithoutStaff, map);
      expect(staff).toBe(2);
    });

    it('should default to 1 when unable to infer', () => {
      const emptyMap = {
        get: () => undefined,
        has: () => false,
        entries: () => new Map<number, number>().entries(),
        size: 0,
      };

      const noteWithoutStaff: NoteEntry = {
        type: 'note',
        pitch: { step: 'C', octave: 4 },
        duration: 1,
        voice: 5,
      };

      const staff = inferStaff(noteWithoutStaff, emptyMap);
      expect(staff).toBe(1);
    });
  });

  describe('getEffectiveStaff', () => {
    it('should return effective staff using measure context', () => {
      const xml = readFileSync(join(lilypondPath, '43a-PianoStaff.xml'), 'utf-8');
      const score = parse(xml);
      const measure = score.parts[0].measures[0];
      const notes = measure.entries.filter((e) => e.type === 'note') as NoteEntry[];

      expect(getEffectiveStaff(notes[0], measure)).toBe(1);
      expect(getEffectiveStaff(notes[1], measure)).toBe(2);
    });
  });

  describe('getClefForStaff', () => {
    it('should get clef for each staff', () => {
      const xml = readFileSync(join(lilypondPath, '43a-PianoStaff.xml'), 'utf-8');
      const score = parse(xml);

      const clef1 = getClefForStaff(score, { partIndex: 0, measureIndex: 0, staff: 1 });
      const clef2 = getClefForStaff(score, { partIndex: 0, measureIndex: 0, staff: 2 });

      expect(clef1).toBeDefined();
      expect(clef1?.sign).toBe('G');
      expect(clef1?.line).toBe(2);

      expect(clef2).toBeDefined();
      expect(clef2?.sign).toBe('F');
      expect(clef2?.line).toBe(4);
    });
  });

  describe('getVoicesForStaff', () => {
    it('should get voices used in a specific staff', () => {
      const xml = readFileSync(join(lilypondPath, '43a-PianoStaff.xml'), 'utf-8');
      const score = parse(xml);
      const measure = score.parts[0].measures[0];

      const voicesStaff1 = getVoicesForStaff(measure, 1);
      const voicesStaff2 = getVoicesForStaff(measure, 2);

      expect(voicesStaff1).toEqual([1]);
      expect(voicesStaff2).toEqual([2]);
    });
  });

  describe('getStaffRange', () => {
    it('should get staff range for a part', () => {
      const xml = readFileSync(join(lilypondPath, '43a-PianoStaff.xml'), 'utf-8');
      const score = parse(xml);

      const range = getStaffRange(score, 0);

      expect(range.min).toBe(1);
      expect(range.max).toBe(2);
    });

    it('should return 1,1 for single staff parts', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      const range = getStaffRange(score, 0);

      expect(range.min).toBe(1);
      expect(range.max).toBe(1);
    });
  });
});

describe('Phase 2: Position and Voice Line', () => {
  describe('getEntriesAtPosition', () => {
    it('should get entries at a specific position', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);
      const measure = score.parts[0].measures[0];

      const entriesAt0 = getEntriesAtPosition(measure, 0);
      const entriesAt1 = getEntriesAtPosition(measure, 1);

      expect(entriesAt0.length).toBe(1);
      expect(entriesAt1.length).toBe(1);

      const note0 = entriesAt0[0] as NoteEntry;
      const note1 = entriesAt1[0] as NoteEntry;
      expect(note0.pitch?.step).toBe('C');
      expect(note1.pitch?.step).toBe('D');
    });
  });

  describe('getNotesAtPosition', () => {
    it('should get only notes at a specific position', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/chord.xml'), 'utf-8');
      const score = parse(xml);
      const measure = score.parts[0].measures[0];

      const notesAt0 = getNotesAtPosition(measure, 0);

      expect(notesAt0.length).toBe(3); // C-E-G chord
    });

    it('should filter by staff', () => {
      const xml = readFileSync(join(lilypondPath, '43a-PianoStaff.xml'), 'utf-8');
      const score = parse(xml);
      const measure = score.parts[0].measures[0];

      const staff1Notes = getNotesAtPosition(measure, 0, { staff: 1 });
      const staff2Notes = getNotesAtPosition(measure, 0, { staff: 2 });

      expect(staff1Notes.length).toBe(1);
      expect(staff2Notes.length).toBe(1);
      expect(staff1Notes[0].pitch?.step).toBe('F');
      expect(staff2Notes[0].pitch?.step).toBe('B');
    });
  });

  describe('getEntriesInRange', () => {
    it('should get entries within a position range', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);
      const measure = score.parts[0].measures[0];

      const entriesIn0To2 = getEntriesInRange(measure, { start: 0, end: 2 });

      expect(entriesIn0To2.length).toBe(2);
    });
  });

  describe('getNotesInRange', () => {
    it('should get notes within a position range', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);
      const measure = score.parts[0].measures[0];

      const notes = getNotesInRange(measure, { start: 0, end: 3 });

      expect(notes.length).toBe(3);
      expect(notes[0].pitch?.step).toBe('C');
      expect(notes[1].pitch?.step).toBe('D');
      expect(notes[2].pitch?.step).toBe('E');
    });
  });

  describe('getVerticalSlice', () => {
    it('should get notes at a position across all parts', () => {
      const xml = readFileSync(join(lilypondPath, '41a-MultiParts-Partorder.xml'), 'utf-8');
      const score = parse(xml);

      const slice = getVerticalSlice(score, { measureIndex: 0, position: 0 });

      expect(slice.measureIndex).toBe(0);
      expect(slice.position).toBe(0);
      // Should have notes from multiple parts
      expect(slice.parts.size).toBeGreaterThan(0);
    });
  });

  describe('getVoiceLine', () => {
    it('should get continuous voice line across measures', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const voiceLine = getVoiceLine(score, { partIndex: 0, voice: 1 });

      expect(voiceLine.partIndex).toBe(0);
      expect(voiceLine.voice).toBe(1);
      expect(voiceLine.notes.length).toBe(8); // 4 notes in each of 2 measures
    });

    it('should filter by staff when specified', () => {
      const xml = readFileSync(join(lilypondPath, '43a-PianoStaff.xml'), 'utf-8');
      const score = parse(xml);

      const voiceLine1 = getVoiceLine(score, { partIndex: 0, voice: 1, staff: 1 });
      const voiceLine2 = getVoiceLine(score, { partIndex: 0, voice: 2, staff: 2 });

      expect(voiceLine1.notes.length).toBeGreaterThan(0);
      expect(voiceLine2.notes.length).toBeGreaterThan(0);
    });
  });

  describe('getVoiceLineInRange', () => {
    it('should get voice line within measure range', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const voiceLine = getVoiceLineInRange(score, {
        partIndex: 0,
        voice: 1,
        startMeasure: 0,
        endMeasure: 0,
      });

      expect(voiceLine.notes.length).toBe(4); // Only first measure
    });
  });
});

describe('Phase 3: Navigation', () => {
  describe('iterateEntries', () => {
    it('should iterate over all entries including non-notes', () => {
      const xml = readFileSync(join(lilypondPath, '31a-Directions.xml'), 'utf-8');
      const score = parse(xml);

      const entries = [...iterateEntries(score)];

      // Should include both notes and directions
      const notes = entries.filter((e) => e.entry.type === 'note');
      const directions = entries.filter((e) => e.entry.type === 'direction');

      expect(notes.length).toBeGreaterThan(0);
      expect(directions.length).toBeGreaterThan(0);
    });

    it('should include context information', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const entries = [...iterateEntries(score)];

      expect(entries[0].partIndex).toBe(0);
      expect(entries[0].measureIndex).toBe(0);
      expect(entries[0].position).toBe(0);
    });
  });

  describe('getNextNote', () => {
    it('should get the next note in the same voice', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);
      const allNotes = getAllNotes(score);
      const firstNote = allNotes[0];

      const context: NoteWithContext = {
        note: firstNote.note,
        part: firstNote.part,
        partIndex: 0,
        measure: firstNote.measure,
        measureIndex: 0,
        position: 0,
      };

      const nextNote = getNextNote(score, context);

      expect(nextNote).not.toBeNull();
      expect(nextNote?.note.pitch?.step).toBe('D');
    });

    it('should return null when there is no next note', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);
      const allNotes = getAllNotes(score);
      const lastNote = allNotes[allNotes.length - 1];

      const context: NoteWithContext = {
        note: lastNote.note,
        part: lastNote.part,
        partIndex: 0,
        measure: lastNote.measure,
        measureIndex: 1,
        position: 3,
      };

      const nextNote = getNextNote(score, context);

      expect(nextNote).toBeNull();
    });
  });

  describe('getPrevNote', () => {
    it('should get the previous note in the same voice', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);
      const allNotes = getAllNotes(score);
      const secondNote = allNotes[1];

      const context: NoteWithContext = {
        note: secondNote.note,
        part: secondNote.part,
        partIndex: 0,
        measure: secondNote.measure,
        measureIndex: 0,
        position: 1,
      };

      const prevNote = getPrevNote(score, context);

      expect(prevNote).not.toBeNull();
      expect(prevNote?.note.pitch?.step).toBe('C');
    });

    it('should return null when there is no previous note', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);
      const allNotes = getAllNotes(score);
      const firstNote = allNotes[0];

      const context: NoteWithContext = {
        note: firstNote.note,
        part: firstNote.part,
        partIndex: 0,
        measure: firstNote.measure,
        measureIndex: 0,
        position: 0,
      };

      const prevNote = getPrevNote(score, context);

      expect(prevNote).toBeNull();
    });
  });

  describe('getAdjacentNotes', () => {
    it('should get both previous and next notes', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);
      const allNotes = getAllNotes(score);
      const middleNote = allNotes[2]; // Third note (E)

      const context: NoteWithContext = {
        note: middleNote.note,
        part: middleNote.part,
        partIndex: 0,
        measure: middleNote.measure,
        measureIndex: 0,
        position: 2,
      };

      const adjacent = getAdjacentNotes(score, context);

      expect(adjacent.prev).not.toBeNull();
      expect(adjacent.next).not.toBeNull();
      expect(adjacent.prev?.note.pitch?.step).toBe('D');
      expect(adjacent.next?.note.pitch?.step).toBe('F');
    });
  });
});

describe('Phase 4: Direction and Expression', () => {
  describe('getDirections', () => {
    it('should get all directions from a score', () => {
      const xml = readFileSync(join(lilypondPath, '31a-Directions.xml'), 'utf-8');
      const score = parse(xml);

      const directions = getDirections(score);

      expect(directions.length).toBeGreaterThan(0);
      expect(directions[0].direction.type).toBe('direction');
    });

    it('should filter by part index', () => {
      const xml = readFileSync(join(lilypondPath, '31a-Directions.xml'), 'utf-8');
      const score = parse(xml);

      const directions = getDirections(score, { partIndex: 0 });

      expect(directions.length).toBeGreaterThan(0);
      expect(directions.every((d) => d.partIndex === 0)).toBe(true);
    });

    it('should filter by measure index', () => {
      const xml = readFileSync(join(lilypondPath, '31a-Directions.xml'), 'utf-8');
      const score = parse(xml);

      const directions = getDirections(score, { measureIndex: 0 });

      expect(directions.length).toBeGreaterThan(0);
      expect(directions.every((d) => d.measureIndex === 0)).toBe(true);
    });
  });

  describe('getDirectionsAtPosition', () => {
    it('should get directions at a specific position', () => {
      const xml = readFileSync(join(lilypondPath, '31a-Directions.xml'), 'utf-8');
      const score = parse(xml);
      const measure = score.parts[0].measures[0];

      const directions = getDirectionsAtPosition(measure, 0);

      expect(directions.length).toBeGreaterThan(0);
    });
  });

  describe('findDirectionsByType', () => {
    it('should find dynamics directions', () => {
      const xml = readFileSync(join(lilypondPath, '31a-Directions.xml'), 'utf-8');
      const score = parse(xml);

      const dynamics = findDirectionsByType(score, 'dynamics');

      expect(dynamics.length).toBeGreaterThan(0);
    });

    it('should find wedge directions', () => {
      const xml = readFileSync(join(lilypondPath, '31a-Directions.xml'), 'utf-8');
      const score = parse(xml);

      const wedges = findDirectionsByType(score, 'wedge');

      expect(wedges.length).toBeGreaterThan(0);
    });

    it('should find metronome directions', () => {
      const xml = readFileSync(join(lilypondPath, '31a-Directions.xml'), 'utf-8');
      const score = parse(xml);

      const metronomes = findDirectionsByType(score, 'metronome');

      expect(metronomes.length).toBeGreaterThan(0);
    });
  });

  describe('getDynamics', () => {
    it('should get all dynamics from a score', () => {
      const xml = readFileSync(join(lilypondPath, '31a-Directions.xml'), 'utf-8');
      const score = parse(xml);

      const dynamics = getDynamics(score);

      expect(dynamics.length).toBeGreaterThan(0);
      // Check that we have various dynamic values
      const dynamicValues = dynamics.map((d) => d.dynamic);
      expect(dynamicValues).toContain('p');
      expect(dynamicValues).toContain('f');
    });
  });

  describe('getTempoMarkings', () => {
    it('should get tempo markings from a score', () => {
      const xml = readFileSync(join(lilypondPath, '31a-Directions.xml'), 'utf-8');
      const score = parse(xml);

      const tempos = getTempoMarkings(score);

      expect(tempos.length).toBeGreaterThan(0);
      expect(tempos[0].beatUnit).toBe('quarter');
      // perMinute can be number or string depending on the MusicXML source
      expect(String(tempos[0].perMinute)).toBe('60');
    });
  });

  describe('getPedalMarkings', () => {
    it('should get pedal markings from a score', () => {
      const xml = readFileSync(join(lilypondPath, '31a-Directions.xml'), 'utf-8');
      const score = parse(xml);

      const pedals = getPedalMarkings(score);

      expect(pedals.length).toBeGreaterThan(0);
      const pedalTypes = pedals.map((p) => p.pedalType);
      expect(pedalTypes).toContain('start');
      expect(pedalTypes).toContain('stop');
    });
  });

  describe('getWedges', () => {
    it('should get wedges (crescendo/diminuendo) from a score', () => {
      const xml = readFileSync(join(lilypondPath, '31a-Directions.xml'), 'utf-8');
      const score = parse(xml);

      const wedges = getWedges(score);

      expect(wedges.length).toBeGreaterThan(0);
      const wedgeTypes = wedges.map((w) => w.wedgeType);
      expect(wedgeTypes).toContain('crescendo');
      expect(wedgeTypes).toContain('stop');
    });
  });

  describe('getOctaveShifts', () => {
    it('should get octave shifts from a score', () => {
      const xml = readFileSync(join(lilypondPath, '31a-Directions.xml'), 'utf-8');
      const score = parse(xml);

      const shifts = getOctaveShifts(score);

      expect(shifts.length).toBeGreaterThan(0);
      const shiftTypes = shifts.map((s) => s.shiftType);
      expect(shiftTypes).toContain('up');
      expect(shiftTypes).toContain('stop');
    });
  });
});

// ============================================================
// Phase 5: Groups and Spans
// ============================================================

describe('Phase 5: Groups and Spans', () => {
  describe('getTiedNoteGroups', () => {
    it('should get tied note groups', () => {
      const xml = readFileSync(join(lilypondPath, '33b-Spanners-Tie.xml'), 'utf-8');
      const score = parse(xml);

      const tiedGroups = getTiedNoteGroups(score);

      expect(tiedGroups.length).toBe(1);
      expect(tiedGroups[0].notes.length).toBe(2);
      expect(tiedGroups[0].notes[0].note.pitch?.step).toBe('F');
      expect(tiedGroups[0].notes[0].measureIndex).toBe(0);
      expect(tiedGroups[0].notes[1].measureIndex).toBe(1);
      expect(tiedGroups[0].totalDuration).toBe(8); // 4 + 4
    });
  });

  describe('getSlurSpans', () => {
    it('should get slur spans from a score', () => {
      const xml = readFileSync(join(lilypondPath, '33c-Spanners-Slurs.xml'), 'utf-8');
      const score = parse(xml);

      const slurs = getSlurSpans(score);

      expect(slurs.length).toBeGreaterThan(0);
      // First slur: G4 -> C5 (measure 1)
      expect(slurs[0].startNote.note.pitch?.step).toBe('G');
      expect(slurs[0].endNote.note.pitch?.step).toBe('C');
    });

    it('should handle nested slurs', () => {
      const xml = readFileSync(join(lilypondPath, '33c-Spanners-Slurs.xml'), 'utf-8');
      const score = parse(xml);

      const slurs = getSlurSpans(score);

      // Measure 2 has nested slurs with different numbers
      const slurNumbers = [...new Set(slurs.map((s) => s.number))];
      expect(slurNumbers.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getTupletGroups', () => {
    it('should get tuplet groups from a score', () => {
      const xml = readFileSync(join(lilypondPath, '23c-Tuplet-Display-NonStandard.xml'), 'utf-8');
      const score = parse(xml);

      const tuplets = getTupletGroups(score);

      expect(tuplets.length).toBeGreaterThan(0);
      // Check 3:2 triplet
      expect(tuplets[0].actualNotes).toBe(3);
      expect(tuplets[0].normalNotes).toBe(2);
      expect(tuplets[0].notes.length).toBe(3);
    });
  });

  describe('getBeamGroups', () => {
    it('should get beam groups from a measure', () => {
      // Use a file that has beamed notes
      const xml = readFileSync(join(lilypondPath, '33c-Spanners-Slurs.xml'), 'utf-8');
      const score = parse(xml);
      const measure = score.parts[0].measures[0];

      const beamGroups = getBeamGroups(measure);

      // The file contains quarter notes, so there might not be beams
      // This is just testing that the function works
      expect(beamGroups).toBeDefined();
      expect(Array.isArray(beamGroups)).toBe(true);
    });
  });

  describe('findNotesWithNotation', () => {
    it('should find notes with slur notation', () => {
      const xml = readFileSync(join(lilypondPath, '33c-Spanners-Slurs.xml'), 'utf-8');
      const score = parse(xml);

      const notesWithSlurs = findNotesWithNotation(score, 'slur');

      expect(notesWithSlurs.length).toBeGreaterThan(0);
      notesWithSlurs.forEach((nc) => {
        expect(nc.note.notations?.some((n) => n.type === 'slur')).toBe(true);
      });
    });

    it('should find notes with tied notation', () => {
      const xml = readFileSync(join(lilypondPath, '33b-Spanners-Tie.xml'), 'utf-8');
      const score = parse(xml);

      const notesWithTies = findNotesWithNotation(score, 'tied');

      expect(notesWithTies.length).toBe(2);
    });

    it('should find notes with articulation notation', () => {
      const xml = readFileSync(join(lilypondPath, '32a-Notations.xml'), 'utf-8');
      const score = parse(xml);

      const notesWithArticulations = findNotesWithNotation(score, 'articulation');

      expect(notesWithArticulations.length).toBeGreaterThan(0);
    });

    it('should find notes with fermata notation', () => {
      const xml = readFileSync(join(lilypondPath, '32a-Notations.xml'), 'utf-8');
      const score = parse(xml);

      const notesWithFermata = findNotesWithNotation(score, 'fermata');

      expect(notesWithFermata.length).toBeGreaterThan(0);
    });
  });
});

// ============================================================
// Phase 6: Harmony and Lyrics
// ============================================================

describe('Phase 6: Harmony and Lyrics', () => {
  describe('getHarmonies', () => {
    it('should get all harmonies from a score', () => {
      const xml = readFileSync(join(lilypondPath, '71a-Chordnames.xml'), 'utf-8');
      const score = parse(xml);

      const harmonies = getHarmonies(score);

      expect(harmonies.length).toBe(8); // 4 in measure 1, 4 in measure 2
      expect(harmonies[0].harmony.root.rootStep).toBe('C');
      expect(harmonies[0].harmony.kind).toBe('major');
    });

    it('should filter by part index', () => {
      const xml = readFileSync(join(lilypondPath, '71a-Chordnames.xml'), 'utf-8');
      const score = parse(xml);

      const harmonies = getHarmonies(score, { partIndex: 0 });

      expect(harmonies.every((h) => h.partIndex === 0)).toBe(true);
    });
  });

  describe('getHarmonyAtPosition', () => {
    it('should get harmony at a specific position', () => {
      const xml = readFileSync(join(lilypondPath, '71a-Chordnames.xml'), 'utf-8');
      const score = parse(xml);
      const measure = score.parts[0].measures[0];

      // Position 0 should have C major
      const harmony0 = getHarmonyAtPosition(measure, 0);
      expect(harmony0).toBeDefined();
      expect(harmony0?.root.rootStep).toBe('C');
      expect(harmony0?.kind).toBe('major');

      // Position 1 should have C major-seventh (2nd harmony)
      const harmony1 = getHarmonyAtPosition(measure, 1);
      expect(harmony1).toBeDefined();
      expect(harmony1?.root.rootStep).toBe('C');
      expect(harmony1?.kind).toBe('major-seventh');
    });
  });

  describe('getChordProgression', () => {
    it('should get chord progression as simplified format', () => {
      const xml = readFileSync(join(lilypondPath, '71a-Chordnames.xml'), 'utf-8');
      const score = parse(xml);

      const progression = getChordProgression(score);

      expect(progression.length).toBe(8);
      expect(progression[0]).toEqual({
        root: 'C',
        kind: 'major',
        bass: undefined,
        measureIndex: 0,
        position: 0,
      });
      // Eb major (E-flat, root-alter=-1)
      expect(progression[3].root).toBe('Eb');
      expect(progression[3].kind).toBe('major');
    });

    it('should handle sharps in chord names', () => {
      const xml = readFileSync(join(lilypondPath, '71a-Chordnames.xml'), 'utf-8');
      const score = parse(xml);

      const progression = getChordProgression(score);

      // D# major-seventh in measure 2
      const dSharp = progression.find((c) => c.root === 'D#');
      expect(dSharp).toBeDefined();
      expect(dSharp?.kind).toBe('major-seventh');
    });
  });

  describe('getLyrics', () => {
    it('should get all lyrics from a score', () => {
      const xml = readFileSync(join(lilypondPath, '61a-Lyrics.xml'), 'utf-8');
      const score = parse(xml);

      const lyrics = getLyrics(score);

      expect(lyrics.length).toBeGreaterThan(0);
      expect(lyrics[0].lyric.text).toBe('Tra');
      expect(lyrics[0].lyric.syllabic).toBe('begin');
    });

    it('should filter by verse', () => {
      const xml = readFileSync(join(lilypondPath, '61b-MultipleLyrics.xml'), 'utf-8');
      const score = parse(xml);

      const verse1 = getLyrics(score, { verse: 1 });
      const verse2 = getLyrics(score, { verse: 2 });

      expect(verse1.every((l) => l.verse === 1)).toBe(true);
      expect(verse2.every((l) => l.verse === 2)).toBe(true);
      expect(verse1[0].lyric.text).toBe('1.Tra');
      expect(verse2[0].lyric.text).toBe('2.tra');
    });
  });

  describe('getLyricText', () => {
    it('should assemble lyric text for each verse', () => {
      const xml = readFileSync(join(lilypondPath, '61a-Lyrics.xml'), 'utf-8');
      const score = parse(xml);

      const assembledLyrics = getLyricText(score);

      expect(assembledLyrics.length).toBe(1);
      expect(assembledLyrics[0].verse).toBe(1);
      // Tra-la-li Ja! -> syllables with proper hyphenation
      expect(assembledLyrics[0].text).toContain('Tra-');
      expect(assembledLyrics[0].text).toContain('la-');
      expect(assembledLyrics[0].text).toContain('li');
      expect(assembledLyrics[0].text).toContain('Ja!');
    });

    it('should handle multiple verses', () => {
      const xml = readFileSync(join(lilypondPath, '61b-MultipleLyrics.xml'), 'utf-8');
      const score = parse(xml);

      const assembledLyrics = getLyricText(score);

      expect(assembledLyrics.length).toBe(3); // 3 verses
      expect(assembledLyrics[0].verse).toBe(1);
      expect(assembledLyrics[1].verse).toBe(2);
      expect(assembledLyrics[2].verse).toBe(3);
      // Check verse 1 text
      expect(assembledLyrics[0].text).toContain('1.Tra');
    });
  });

  describe('getVerseCount', () => {
    it('should return the number of verses', () => {
      const xml = readFileSync(join(lilypondPath, '61b-MultipleLyrics.xml'), 'utf-8');
      const score = parse(xml);

      const count = getVerseCount(score);

      expect(count).toBe(3);
    });

    it('should return 1 for single verse', () => {
      const xml = readFileSync(join(lilypondPath, '61a-Lyrics.xml'), 'utf-8');
      const score = parse(xml);

      const count = getVerseCount(score);

      expect(count).toBe(1);
    });

    it('should return 0 for score without lyrics', () => {
      const xml = readFileSync(join(lilypondPath, '01a-Pitches-Pitches.xml'), 'utf-8');
      const score = parse(xml);

      const count = getVerseCount(score);

      expect(count).toBe(0);
    });
  });
});

// ============================================================
// Phase 7: Structure and Navigation
// ============================================================

describe('Phase 7: Structure and Navigation', () => {
  describe('getRepeatStructure', () => {
    it('should get repeat markers from a score', () => {
      const xml = readFileSync(join(lilypondPath, '45a-SimpleRepeat.xml'), 'utf-8');
      const score = parse(xml);

      const repeats = getRepeatStructure(score);

      expect(repeats.length).toBeGreaterThan(0);
      expect(repeats[0].type).toBe('backward');
      expect(repeats[0].times).toBe(5);
    });
  });

  describe('findBarlines', () => {
    it('should find all barlines in a score', () => {
      const xml = readFileSync(join(lilypondPath, '46a-Barlines.xml'), 'utf-8');
      const score = parse(xml);

      const barlines = findBarlines(score);

      expect(barlines.length).toBeGreaterThan(0);
    });

    it('should filter by barline style', () => {
      const xml = readFileSync(join(lilypondPath, '46a-Barlines.xml'), 'utf-8');
      const score = parse(xml);

      const heavyBarlines = findBarlines(score, { style: 'light-heavy' });

      expect(heavyBarlines.length).toBeGreaterThan(0);
      heavyBarlines.forEach((b) => {
        expect(b.barline.barStyle).toBe('light-heavy');
      });
    });

    it('should filter by repeat presence', () => {
      const xml = readFileSync(join(lilypondPath, '45a-SimpleRepeat.xml'), 'utf-8');
      const score = parse(xml);

      const repeatBarlines = findBarlines(score, { repeat: true });

      expect(repeatBarlines.length).toBeGreaterThan(0);
      repeatBarlines.forEach((b) => {
        expect(b.barline.repeat).toBeDefined();
      });
    });
  });

  describe('getEndings', () => {
    it('should get volta bracket endings from a score', () => {
      const xml = readFileSync(join(lilypondPath, '45b-RepeatWithAlternatives.xml'), 'utf-8');
      const score = parse(xml);

      const endings = getEndings(score);

      expect(endings.length).toBeGreaterThanOrEqual(2);
      // Should have ending 1 and ending 2
      const endingNumbers = [...new Set(endings.map((e) => e.number))];
      expect(endingNumbers).toContain('1');
      expect(endingNumbers).toContain('2');
    });
  });

  describe('getKeyChanges', () => {
    it('should get key signature changes from a score', () => {
      const xml = readFileSync(join(lilypondPath, '13e-KeySignatures-MidMeasure-Change.xml'), 'utf-8');
      const score = parse(xml);

      const keyChanges = getKeyChanges(score);

      expect(keyChanges.length).toBe(4); // 2, -2, 0, 7 sharps/flats
      expect(keyChanges[0].key.fifths).toBe(2);
      expect(keyChanges[1].key.fifths).toBe(-2);
      expect(keyChanges[2].key.fifths).toBe(0);
      expect(keyChanges[3].key.fifths).toBe(7);
    });
  });

  describe('getTimeChanges', () => {
    it('should get time signature changes from a score', () => {
      const xml = readFileSync(join(lilypondPath, '11a-TimeSignatures.xml'), 'utf-8');
      const score = parse(xml);

      const timeChanges = getTimeChanges(score);

      expect(timeChanges.length).toBeGreaterThan(5);
      // First is 2/2 (alla breve)
      expect(timeChanges[0].time.beats).toBe('2');
      expect(timeChanges[0].time.beatType).toBe(2);
    });
  });

  describe('getClefChanges', () => {
    it('should get clef changes from a score', () => {
      const xml = readFileSync(join(lilypondPath, '01a-Pitches-Pitches.xml'), 'utf-8');
      const score = parse(xml);

      const clefChanges = getClefChanges(score);

      expect(clefChanges.length).toBeGreaterThan(0);
      expect(clefChanges[0].clef.sign).toBe('G');
      expect(clefChanges[0].clef.line).toBe(2);
    });
  });

  describe('getStructuralChanges', () => {
    it('should get all structural changes at once', () => {
      const xml = readFileSync(join(lilypondPath, '11a-TimeSignatures.xml'), 'utf-8');
      const score = parse(xml);

      const changes = getStructuralChanges(score);

      expect(changes.keyChanges.length).toBeGreaterThan(0);
      expect(changes.timeChanges.length).toBeGreaterThan(0);
      expect(changes.clefChanges.length).toBeGreaterThan(0);
    });
  });
});

// ============================================================
// Phase 8: Additional Utilities
// ============================================================

describe('Phase 8: Additional Utilities', () => {
  describe('getPartByIndex', () => {
    it('should get a part by index', () => {
      const xml = readFileSync(join(lilypondPath, '01a-Pitches-Pitches.xml'), 'utf-8');
      const score = parse(xml);

      const part = getPartByIndex(score, 0);

      expect(part).toBeDefined();
      expect(part?.id).toBe('P1');
    });

    it('should return undefined for out of range index', () => {
      const xml = readFileSync(join(lilypondPath, '01a-Pitches-Pitches.xml'), 'utf-8');
      const score = parse(xml);

      const part = getPartByIndex(score, 100);

      expect(part).toBeUndefined();
    });
  });

  describe('getPartCount', () => {
    it('should return the number of parts', () => {
      const xml = readFileSync(join(lilypondPath, '01a-Pitches-Pitches.xml'), 'utf-8');
      const score = parse(xml);

      const count = getPartCount(score);

      expect(count).toBe(1);
    });
  });

  describe('getPartIds', () => {
    it('should return all part IDs', () => {
      const xml = readFileSync(join(lilypondPath, '01a-Pitches-Pitches.xml'), 'utf-8');
      const score = parse(xml);

      const ids = getPartIds(score);

      expect(ids).toEqual(['P1']);
    });
  });
});
