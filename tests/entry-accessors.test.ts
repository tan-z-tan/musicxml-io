import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parse } from '../src';
import type { DirectionEntry, NoteEntry } from '../src';
import {
  // DirectionEntry - Generic
  getDirectionOfKind,
  getDirectionsOfKind,
  hasDirectionOfKind,
  // DirectionEntry - Sound
  getSoundTempo,
  getSoundDynamics,
  getSoundDamperPedal,
  getSoundSoftPedal,
  getSoundSostenutoPedal,
  // NoteEntry
  isRest,
  isPitchedNote,
  isUnpitchedNote,
  isChordNote,
  isGraceNote,
  hasTie,
  hasTieStart,
  hasTieStop,
  isCueNote,
  hasBeam,
  hasLyrics,
  hasNotations,
  hasTuplet,
  // PartList
  isPartInfo,
  getPartInfo,
  getPartName,
  getPartAbbreviation,
  getAllPartInfos,
  getPartNameMap,
} from '../src/entry-accessors';

const fixturesPath = join(__dirname, 'fixtures');

describe('Entry Accessors', () => {
  describe('DirectionEntry Accessors', () => {
    const directionsXml = readFileSync(
      join(fixturesPath, 'lilypond/xmlFiles/31a-Directions.xml'),
      'utf-8'
    );
    const directionsScore = parse(directionsXml);

    // Helper to get directions from a specific measure
    function getDirectionsFromMeasure(measureNumber: number): DirectionEntry[] {
      const measure = directionsScore.parts[0].measures[measureNumber - 1];
      return measure.entries.filter((e): e is DirectionEntry => e.type === 'direction');
    }

    describe('getDirectionOfKind', () => {
      it('should return dynamics from a direction entry', () => {
        const directions = getDirectionsFromMeasure(3);
        const dynamics = getDirectionOfKind(directions[0], 'dynamics');

        expect(dynamics).toBeDefined();
        expect(dynamics?.kind).toBe('dynamics');
        expect(dynamics?.value).toBe('p');
      });

      it('should return rehearsal from a direction entry', () => {
        const directions = getDirectionsFromMeasure(1);
        const rehearsal = getDirectionOfKind(directions[0], 'rehearsal');

        expect(rehearsal).toBeDefined();
        expect(rehearsal?.kind).toBe('rehearsal');
        expect(rehearsal?.text).toBe('A');
      });

      it('should return segno from a direction entry', () => {
        const directions = getDirectionsFromMeasure(2);
        const segno = getDirectionOfKind(directions[0], 'segno');

        expect(segno).toBeDefined();
        expect(segno?.kind).toBe('segno');
      });

      it('should return coda from a direction entry', () => {
        const directions = getDirectionsFromMeasure(2);
        const coda = getDirectionOfKind(directions[1], 'coda');

        expect(coda).toBeDefined();
        expect(coda?.kind).toBe('coda');
      });

      it('should return words from a direction entry', () => {
        const directions = getDirectionsFromMeasure(2);
        const words = getDirectionOfKind(directions[2], 'words');

        expect(words).toBeDefined();
        expect(words?.kind).toBe('words');
        expect(words?.text).toBe('words');
      });

      it('should return wedge from a direction entry', () => {
        const directions = getDirectionsFromMeasure(9);
        const wedge = getDirectionOfKind(directions[0], 'wedge');

        expect(wedge).toBeDefined();
        expect(wedge?.kind).toBe('wedge');
        expect(wedge?.type).toBe('crescendo');
      });

      it('should return pedal from a direction entry', () => {
        const directions = getDirectionsFromMeasure(11);
        const pedal = getDirectionOfKind(directions[0], 'pedal');

        expect(pedal).toBeDefined();
        expect(pedal?.kind).toBe('pedal');
        expect(pedal?.type).toBe('start');
      });

      it('should return metronome from a direction entry', () => {
        const directions = getDirectionsFromMeasure(12);
        const metronome = getDirectionOfKind(directions[0], 'metronome');

        expect(metronome).toBeDefined();
        expect(metronome?.kind).toBe('metronome');
        expect(metronome?.beatUnit).toBe('quarter');
        expect(metronome?.perMinute).toBe(60);
      });

      it('should return octave-shift from a direction entry', () => {
        const directions = getDirectionsFromMeasure(10);
        const octaveShift = getDirectionOfKind(directions[2], 'octave-shift');

        expect(octaveShift).toBeDefined();
        expect(octaveShift?.kind).toBe('octave-shift');
        expect(octaveShift?.type).toBe('up');
      });

      it('should return undefined for non-matching kind', () => {
        const directions = getDirectionsFromMeasure(3);
        const result = getDirectionOfKind(directions[0], 'segno');

        expect(result).toBeUndefined();
      });
    });

    describe('getDirectionsOfKind', () => {
      it('should return all matching direction types', () => {
        // Measure 14 has multiple direction types in a single entry
        const directions = getDirectionsFromMeasure(14);
        // First direction in measure 14 has "subito", " ", and dynamics
        const allWords = getDirectionsOfKind(directions[0], 'words');

        expect(allWords.length).toBeGreaterThanOrEqual(1);
        allWords.forEach((w) => expect(w.kind).toBe('words'));
      });

      it('should return empty array when no match', () => {
        const directions = getDirectionsFromMeasure(3);
        const result = getDirectionsOfKind(directions[0], 'segno');

        expect(result).toEqual([]);
      });
    });

    describe('hasDirectionOfKind', () => {
      it('should return true when direction type exists', () => {
        const directions = getDirectionsFromMeasure(3);

        expect(hasDirectionOfKind(directions[0], 'dynamics')).toBe(true);
      });

      it('should return false when direction type does not exist', () => {
        const directions = getDirectionsFromMeasure(3);

        expect(hasDirectionOfKind(directions[0], 'segno')).toBe(false);
      });
    });
  });

  describe('Sound Accessors', () => {
    it('should return tempo from sound', () => {
      // Create a mock DirectionEntry with sound
      const entry: DirectionEntry = {
        _id: 'test-1',
        type: 'direction',
        directionTypes: [],
        sound: { tempo: 120 },
      };

      expect(getSoundTempo(entry)).toBe(120);
    });

    it('should return dynamics from sound', () => {
      const entry: DirectionEntry = {
        _id: 'test-2',
        type: 'direction',
        directionTypes: [],
        sound: { dynamics: 80 },
      };

      expect(getSoundDynamics(entry)).toBe(80);
    });

    it('should return pedal states from sound', () => {
      const entry: DirectionEntry = {
        _id: 'test-3',
        type: 'direction',
        directionTypes: [],
        sound: {
          damperPedal: 'yes',
          softPedal: 'no',
          sostenutoPedal: 'yes',
        },
      };

      expect(getSoundDamperPedal(entry)).toBe('yes');
      expect(getSoundSoftPedal(entry)).toBe('no');
      expect(getSoundSostenutoPedal(entry)).toBe('yes');
    });

    it('should return undefined when sound is not present', () => {
      const entry: DirectionEntry = {
        _id: 'test-4',
        type: 'direction',
        directionTypes: [],
      };

      expect(getSoundTempo(entry)).toBeUndefined();
      expect(getSoundDynamics(entry)).toBeUndefined();
      expect(getSoundDamperPedal(entry)).toBeUndefined();
    });
  });

  describe('NoteEntry Accessors', () => {
    const voicesXml = readFileSync(join(fixturesPath, 'voices/two-voices.xml'), 'utf-8');
    const voicesScore = parse(voicesXml);

    // Helper to get notes from a specific measure
    function getNotesFromMeasure(measureNumber: number): NoteEntry[] {
      const measure = voicesScore.parts[0].measures[measureNumber - 1];
      return measure.entries.filter((e): e is NoteEntry => e.type === 'note');
    }

    describe('isRest', () => {
      it('should return true for a rest', () => {
        // Measure 13 in Directions.xml has a rest
        const directionsXml = readFileSync(
          join(fixturesPath, 'lilypond/xmlFiles/31a-Directions.xml'),
          'utf-8'
        );
        const score = parse(directionsXml);
        const measure = score.parts[0].measures[12]; // measure 13 (0-indexed)
        const notes = measure.entries.filter((e): e is NoteEntry => e.type === 'note');
        const rest = notes.find((n) => n.rest);

        expect(rest).toBeDefined();
        expect(isRest(rest!)).toBe(true);
      });

      it('should return false for a pitched note', () => {
        const notes = getNotesFromMeasure(1);
        const pitchedNote = notes.find((n) => n.pitch);

        expect(pitchedNote).toBeDefined();
        expect(isRest(pitchedNote!)).toBe(false);
      });
    });

    describe('isPitchedNote', () => {
      it('should return true for a note with pitch', () => {
        const notes = getNotesFromMeasure(1);
        const pitchedNote = notes.find((n) => n.pitch);

        expect(pitchedNote).toBeDefined();
        expect(isPitchedNote(pitchedNote!)).toBe(true);
      });

      it('should return false for a rest', () => {
        const directionsXml = readFileSync(
          join(fixturesPath, 'lilypond/xmlFiles/31a-Directions.xml'),
          'utf-8'
        );
        const score = parse(directionsXml);
        const measure = score.parts[0].measures[12];
        const notes = measure.entries.filter((e): e is NoteEntry => e.type === 'note');
        const rest = notes.find((n) => n.rest);

        expect(rest).toBeDefined();
        expect(isPitchedNote(rest!)).toBe(false);
      });
    });

    describe('isUnpitchedNote', () => {
      it('should return false for a pitched note', () => {
        const notes = getNotesFromMeasure(1);
        const pitchedNote = notes.find((n) => n.pitch);

        expect(pitchedNote).toBeDefined();
        expect(isUnpitchedNote(pitchedNote!)).toBe(false);
      });

      it('should return true for an unpitched note', () => {
        const unpitchedNote: NoteEntry = {
          _id: 'test-unpitched',
          type: 'note',
          unpitched: { displayStep: 'E', displayOctave: 4 },
          duration: 1,
          voice: 1,
        };

        expect(isUnpitchedNote(unpitchedNote)).toBe(true);
      });
    });

    describe('isChordNote', () => {
      it('should return false for a non-chord note', () => {
        const notes = getNotesFromMeasure(1);
        const note = notes[0];

        expect(isChordNote(note)).toBe(false);
      });

      it('should return true for a chord note', () => {
        const chordNote: NoteEntry = {
          _id: 'test-chord',
          type: 'note',
          pitch: { step: 'C', octave: 4 },
          duration: 1,
          voice: 1,
          chord: true,
        };

        expect(isChordNote(chordNote)).toBe(true);
      });
    });

    describe('isGraceNote', () => {
      it('should return false for a regular note', () => {
        const notes = getNotesFromMeasure(1);
        const note = notes[0];

        expect(isGraceNote(note)).toBe(false);
      });

      it('should return true for a grace note', () => {
        const graceNote: NoteEntry = {
          _id: 'test-grace',
          type: 'note',
          pitch: { step: 'C', octave: 4 },
          duration: 0,
          voice: 1,
          grace: { slash: true },
        };

        expect(isGraceNote(graceNote)).toBe(true);
      });
    });

    describe('hasTie', () => {
      it('should return false for a note without tie', () => {
        const notes = getNotesFromMeasure(1);
        const note = notes[0];

        expect(hasTie(note)).toBe(false);
      });

      it('should return true for a note with tie', () => {
        const tiedNote: NoteEntry = {
          _id: 'test-tie',
          type: 'note',
          pitch: { step: 'C', octave: 4 },
          duration: 1,
          voice: 1,
          tie: { type: 'start' },
        };

        expect(hasTie(tiedNote)).toBe(true);
      });

      it('should return true for a note with ties array', () => {
        const tiedNote: NoteEntry = {
          _id: 'test-ties',
          type: 'note',
          pitch: { step: 'C', octave: 4 },
          duration: 1,
          voice: 1,
          ties: [{ type: 'start' }, { type: 'stop' }],
        };

        expect(hasTie(tiedNote)).toBe(true);
      });
    });

    describe('hasTieStart and hasTieStop', () => {
      it('should detect tie start', () => {
        const note: NoteEntry = {
          _id: 'test-tie-start',
          type: 'note',
          pitch: { step: 'C', octave: 4 },
          duration: 1,
          voice: 1,
          tie: { type: 'start' },
        };

        expect(hasTieStart(note)).toBe(true);
        expect(hasTieStop(note)).toBe(false);
      });

      it('should detect tie stop', () => {
        const note: NoteEntry = {
          _id: 'test-tie-stop',
          type: 'note',
          pitch: { step: 'C', octave: 4 },
          duration: 1,
          voice: 1,
          tie: { type: 'stop' },
        };

        expect(hasTieStart(note)).toBe(false);
        expect(hasTieStop(note)).toBe(true);
      });

      it('should detect both tie start and stop in ties array', () => {
        const note: NoteEntry = {
          _id: 'test-ties-both',
          type: 'note',
          pitch: { step: 'C', octave: 4 },
          duration: 1,
          voice: 1,
          ties: [{ type: 'start' }, { type: 'stop' }],
        };

        expect(hasTieStart(note)).toBe(true);
        expect(hasTieStop(note)).toBe(true);
      });
    });

    describe('isCueNote', () => {
      it('should return false for a regular note', () => {
        const notes = getNotesFromMeasure(1);
        const note = notes[0];

        expect(isCueNote(note)).toBe(false);
      });

      it('should return true for a cue note', () => {
        const cueNote: NoteEntry = {
          _id: 'test-cue',
          type: 'note',
          pitch: { step: 'C', octave: 4 },
          duration: 1,
          voice: 1,
          cue: true,
        };

        expect(isCueNote(cueNote)).toBe(true);
      });
    });

    describe('hasBeam', () => {
      it('should return false for a note without beams', () => {
        const note: NoteEntry = {
          _id: 'test-no-beam',
          type: 'note',
          pitch: { step: 'C', octave: 4 },
          duration: 1,
          voice: 1,
        };

        expect(hasBeam(note)).toBe(false);
      });

      it('should return true for a beamed note', () => {
        const beamedNote: NoteEntry = {
          _id: 'test-beam',
          type: 'note',
          pitch: { step: 'C', octave: 4 },
          duration: 1,
          voice: 1,
          beam: [{ number: 1, type: 'begin' }],
        };

        expect(hasBeam(beamedNote)).toBe(true);
      });
    });

    describe('hasLyrics', () => {
      it('should return false for a note without lyrics', () => {
        const note: NoteEntry = {
          _id: 'test-no-lyrics',
          type: 'note',
          pitch: { step: 'C', octave: 4 },
          duration: 1,
          voice: 1,
        };

        expect(hasLyrics(note)).toBe(false);
      });

      it('should return true for a note with lyrics', () => {
        const directionsXml = readFileSync(
          join(fixturesPath, 'lilypond/xmlFiles/31a-Directions.xml'),
          'utf-8'
        );
        const score = parse(directionsXml);
        const measure = score.parts[0].measures[0];
        const notes = measure.entries.filter((e): e is NoteEntry => e.type === 'note');
        const noteWithLyrics = notes.find((n) => n.lyrics && n.lyrics.length > 0);

        expect(noteWithLyrics).toBeDefined();
        expect(hasLyrics(noteWithLyrics!)).toBe(true);
      });
    });

    describe('hasNotations', () => {
      it('should return false for a note without notations', () => {
        const notes = getNotesFromMeasure(1);
        const note = notes[0];

        expect(hasNotations(note)).toBe(false);
      });

      it('should return true for a note with notations', () => {
        const notatedNote: NoteEntry = {
          _id: 'test-notations',
          type: 'note',
          pitch: { step: 'C', octave: 4 },
          duration: 1,
          voice: 1,
          notations: [{ type: 'slur', slurType: 'start', number: 1 }],
        };

        expect(hasNotations(notatedNote)).toBe(true);
      });
    });

    describe('hasTuplet', () => {
      it('should return false for a regular note', () => {
        const notes = getNotesFromMeasure(1);
        const note = notes[0];

        expect(hasTuplet(note)).toBe(false);
      });

      it('should return true for a tuplet note', () => {
        const tupletNote: NoteEntry = {
          _id: 'test-tuplet',
          type: 'note',
          pitch: { step: 'C', octave: 4 },
          duration: 1,
          voice: 1,
          timeModification: { actualNotes: 3, normalNotes: 2 },
        };

        expect(hasTuplet(tupletNote)).toBe(true);
      });
    });
  });

  describe('PartList Accessors', () => {
    const directionsXml = readFileSync(
      join(fixturesPath, 'lilypond/xmlFiles/31a-Directions.xml'),
      'utf-8'
    );
    const directionsScore = parse(directionsXml);

    describe('isPartInfo', () => {
      it('should return true for a PartInfo entry', () => {
        const partListEntry = directionsScore.partList[0];

        expect(isPartInfo(partListEntry)).toBe(true);
      });
    });

    describe('getPartInfo', () => {
      it('should return PartInfo for existing part ID', () => {
        const partInfo = getPartInfo(directionsScore, 'P1');

        expect(partInfo).toBeDefined();
        expect(partInfo?.id).toBe('P1');
      });

      it('should return undefined for non-existing part ID', () => {
        const partInfo = getPartInfo(directionsScore, 'P99');

        expect(partInfo).toBeUndefined();
      });
    });

    describe('getPartName', () => {
      it('should return part name for existing part', () => {
        const name = getPartName(directionsScore, 'P1');

        expect(name).toBe('MusicXML Part');
      });

      it('should return undefined for non-existing part', () => {
        const name = getPartName(directionsScore, 'P99');

        expect(name).toBeUndefined();
      });
    });

    describe('getPartAbbreviation', () => {
      it('should return abbreviation if available', () => {
        // Note: The test file doesn't have abbreviations, so we test with undefined
        const abbr = getPartAbbreviation(directionsScore, 'P1');

        expect(abbr).toBeUndefined();
      });

      it('should return undefined for non-existing part', () => {
        const abbr = getPartAbbreviation(directionsScore, 'P99');

        expect(abbr).toBeUndefined();
      });
    });

    describe('getAllPartInfos', () => {
      it('should return all PartInfo entries', () => {
        const infos = getAllPartInfos(directionsScore);

        expect(infos).toHaveLength(1);
        expect(infos[0].id).toBe('P1');
      });
    });

    describe('getPartNameMap', () => {
      it('should return a map of part ID to name', () => {
        const map = getPartNameMap(directionsScore);

        expect(map).toEqual({ P1: 'MusicXML Part' });
      });
    });

    describe('Multiple parts', () => {
      it('should work with multiple parts', () => {
        const multiPartXml = readFileSync(
          join(fixturesPath, 'musicxml_samples/MozartTrio.musicxml'),
          'utf-8'
        );
        const multiPartScore = parse(multiPartXml);

        const infos = getAllPartInfos(multiPartScore);
        expect(infos.length).toBeGreaterThan(1);

        const nameMap = getPartNameMap(multiPartScore);
        expect(Object.keys(nameMap).length).toBeGreaterThan(1);

        // Test each part has name accessible
        for (const info of infos) {
          const name = getPartName(multiPartScore, info.id);
          expect(name).toBe(info.name);
        }
      });
    });
  });
});
