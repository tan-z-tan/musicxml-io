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
