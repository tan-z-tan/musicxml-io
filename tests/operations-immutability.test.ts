import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parse } from '../src';
import type { Score } from '../src/types';
import {
  insertNote,
  removeNote,
  addChord,
  changeNoteDuration,
  setNotePitch,
  setNotePitchBySemitone,
  shiftNotePitch,
  raiseAccidental,
  lowerAccidental,
  addVoice,
  moveNoteToStaff,
  addTie,
  removeTie,
  addSlur,
  removeSlur,
  addArticulation,
  removeArticulation,
  addDynamics,
  removeDynamics,
  modifyDynamics,
  createTuplet,
  removeTuplet,
  addBeam,
  removeBeam,
  autoBeam,
  copyNotes,
  pasteNotes,
  cutNotes,
  addTempo,
  removeTempo,
  modifyTempo,
  addFermata,
  removeFermata,
  addOrnament,
  removeOrnament,
  addPedal,
  removePedal,
  addTextDirection,
  addRehearsalMark,
  addSegno,
  addCoda,
  addGraceNote,
  removeGraceNote,
  convertToGrace,
  addLyric,
  removeLyric,
  updateLyric,
  addHarmony,
  removeHarmony,
  updateHarmony,
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
} from '../src/operations';

const fixturesPath = join(__dirname, 'fixtures');

/**
 * Operations use copy-on-write cloning: only the mutated measures are
 * deep-cloned and everything else is shared structurally with the input.
 * These tests deep-freeze the input score before every operation, so any
 * accidental mutation of shared state throws a TypeError in strict mode.
 */

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  Object.freeze(value);
  for (const key of Object.keys(value as object)) {
    deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
}

function loadScore(fixture = 'basic/scale.xml'): Score {
  const xml = readFileSync(join(fixturesPath, fixture), 'utf-8');
  return parse(xml);
}

/**
 * Runs `op` against a deep-frozen copy of `score` and asserts that the input
 * is byte-identical afterwards. Returns the operation result.
 */
function runFrozen<R>(score: Score, op: (s: Score) => R): R {
  const before = JSON.stringify(score);
  deepFreeze(score);
  const result = op(score);
  expect(JSON.stringify(score)).toBe(before);
  return result;
}

function expectSuccess(result: OperationResult<Score>): Score {
  expect(result.success).toBe(true);
  if (!result.success) throw new Error('expected success');
  return result.data;
}

describe('Operations do not mutate the input score', () => {
  describe('note operations', () => {
    it('insertNote', () => {
      const data = expectSuccess(runFrozen(loadScore(), s => insertNote(s, {
        partIndex: 0, measureIndex: 0, voice: '2', position: 0,
        pitch: { step: 'E', octave: 3 }, duration: 1,
      })));
      expect(data.parts[0].measures[0].entries.length).toBeGreaterThan(4);
    });

    it('removeNote', () => {
      expectSuccess(runFrozen(loadScore(), s => removeNote(s, {
        partIndex: 0, measureIndex: 0, noteIndex: 0,
      })));
    });

    it('addChord', () => {
      expectSuccess(runFrozen(loadScore(), s => addChord(s, {
        partIndex: 0, measureIndex: 0, noteIndex: 0, pitch: { step: 'E', octave: 4 },
      })));
    });

    it('changeNoteDuration', () => {
      expectSuccess(runFrozen(loadScore(), s => changeNoteDuration(s, {
        partIndex: 0, measureIndex: 0, noteIndex: 0, newDuration: 1,
      })));
    });

    it('setNotePitch', () => {
      expectSuccess(runFrozen(loadScore(), s => setNotePitch(s, {
        partIndex: 0, measureIndex: 0, noteIndex: 0, pitch: { step: 'A', octave: 4 },
      })));
    });

    it('setNotePitchBySemitone', () => {
      expectSuccess(runFrozen(loadScore(), s => setNotePitchBySemitone(s, {
        partIndex: 0, measureIndex: 0, noteIndex: 0, semitone: 50,
      })));
    });

    it('shiftNotePitch', () => {
      expectSuccess(runFrozen(loadScore(), s => shiftNotePitch(s, {
        partIndex: 0, measureIndex: 0, noteIndex: 0, semitones: 2,
      })));
    });

    it('raiseAccidental', () => {
      expectSuccess(runFrozen(loadScore(), s => raiseAccidental(s, {
        partIndex: 0, measureIndex: 0, noteIndex: 0,
      })));
    });

    it('lowerAccidental', () => {
      expectSuccess(runFrozen(loadScore(), s => lowerAccidental(s, {
        partIndex: 0, measureIndex: 0, noteIndex: 0,
      })));
    });

    it('addVoice', () => {
      expectSuccess(runFrozen(loadScore(), s => addVoice(s, {
        partIndex: 0, measureIndex: 0, voice: '2',
      })));
    });

    it('moveNoteToStaff', () => {
      expectSuccess(runFrozen(loadScore(), s => moveNoteToStaff(s, {
        partIndex: 0, measureIndex: 0, noteIndex: 0, targetStaff: 1,
      })));
    });
  });

  describe('tie and slur operations', () => {
    it('addTie across measures', () => {
      // tied-notes.xml: measure 0 note 1 (E) is tied to measure 1 note 0 (E)
      const score = loadScore('basic/tied-notes.xml');
      const withoutTie = expectSuccess(removeTie(score, { partIndex: 0, measureIndex: 0, noteIndex: 1 }));
      const cleared = expectSuccess(removeTie(withoutTie, { partIndex: 0, measureIndex: 1, noteIndex: 0 }));
      expectSuccess(runFrozen(cleared, s => addTie(s, {
        partIndex: 0, startMeasureIndex: 0, startNoteIndex: 1,
        endMeasureIndex: 1, endNoteIndex: 0,
      })));
    });

    it('removeTie', () => {
      expectSuccess(runFrozen(loadScore('basic/tied-notes.xml'), s => removeTie(s, {
        partIndex: 0, measureIndex: 0, noteIndex: 1,
      })));
    });

    it('addSlur within and across measures', () => {
      expectSuccess(runFrozen(loadScore(), s => addSlur(s, {
        partIndex: 0, startMeasureIndex: 0, startNoteIndex: 0,
        endMeasureIndex: 0, endNoteIndex: 2,
      })));
      expectSuccess(runFrozen(loadScore(), s => addSlur(s, {
        partIndex: 0, startMeasureIndex: 0, startNoteIndex: 0,
        endMeasureIndex: 1, endNoteIndex: 0,
      })));
    });

    it('removeSlur', () => {
      const withSlur = expectSuccess(addSlur(loadScore(), {
        partIndex: 0, startMeasureIndex: 0, startNoteIndex: 0,
        endMeasureIndex: 0, endNoteIndex: 2,
      }));
      expectSuccess(runFrozen(withSlur, s => removeSlur(s, {
        partIndex: 0, measureIndex: 0, noteIndex: 0,
      })));
    });
  });

  describe('notation operations', () => {
    it('addArticulation / removeArticulation', () => {
      const withArt = expectSuccess(runFrozen(loadScore(), s => addArticulation(s, {
        partIndex: 0, measureIndex: 0, noteIndex: 0, articulation: 'staccato',
      })));
      expectSuccess(runFrozen(withArt, s => removeArticulation(s, {
        partIndex: 0, measureIndex: 0, noteIndex: 0, articulation: 'staccato',
      })));
    });

    it('addFermata / removeFermata', () => {
      const withFermata = expectSuccess(runFrozen(loadScore(), s => addFermata(s, {
        partIndex: 0, measureIndex: 0, noteIndex: 0,
      })));
      expectSuccess(runFrozen(withFermata, s => removeFermata(s, {
        partIndex: 0, measureIndex: 0, noteIndex: 0,
      })));
    });

    it('addOrnament / removeOrnament', () => {
      const withOrnament = expectSuccess(runFrozen(loadScore(), s => addOrnament(s, {
        partIndex: 0, measureIndex: 0, noteIndex: 0, ornament: 'trill-mark',
      })));
      expectSuccess(runFrozen(withOrnament, s => removeOrnament(s, {
        partIndex: 0, measureIndex: 0, noteIndex: 0, ornament: 'trill-mark',
      })));
    });

    it('addBreathMark / removeBreathMark', () => {
      const withBreath = expectSuccess(runFrozen(loadScore(), s => addBreathMark(s, {
        partIndex: 0, measureIndex: 0, noteIndex: 0,
      })));
      expectSuccess(runFrozen(withBreath, s => removeBreathMark(s, {
        partIndex: 0, measureIndex: 0, noteIndex: 0,
      })));
    });

    it('addCaesura / removeCaesura', () => {
      const withCaesura = expectSuccess(runFrozen(loadScore(), s => addCaesura(s, {
        partIndex: 0, measureIndex: 0, noteIndex: 0,
      })));
      expectSuccess(runFrozen(withCaesura, s => removeCaesura(s, {
        partIndex: 0, measureIndex: 0, noteIndex: 0,
      })));
    });
  });

  describe('direction operations', () => {
    it('addDynamics / modifyDynamics / removeDynamics', () => {
      const withDyn = expectSuccess(runFrozen(loadScore(), s => addDynamics(s, {
        partIndex: 0, measureIndex: 0, position: 0, dynamics: 'mf',
      })));
      const modified = expectSuccess(runFrozen(withDyn, s => modifyDynamics(s, {
        partIndex: 0, measureIndex: 0, directionIndex: 0, dynamics: 'ff',
      })));
      expectSuccess(runFrozen(modified, s => removeDynamics(s, {
        partIndex: 0, measureIndex: 0, directionIndex: 0,
      })));
    });

    it('addTempo / modifyTempo / removeTempo', () => {
      const withTempo = expectSuccess(runFrozen(loadScore(), s => addTempo(s, {
        partIndex: 0, measureIndex: 0, position: 0, bpm: 120,
      })));
      const modified = expectSuccess(runFrozen(withTempo, s => modifyTempo(s, {
        partIndex: 0, measureIndex: 0, bpm: 90,
      })));
      expectSuccess(runFrozen(modified, s => removeTempo(s, {
        partIndex: 0, measureIndex: 0,
      })));
    });

    it('addPedal / removePedal', () => {
      const withPedal = expectSuccess(runFrozen(loadScore(), s => addPedal(s, {
        partIndex: 0, measureIndex: 0, position: 0, pedalType: 'start',
      })));
      expectSuccess(runFrozen(withPedal, s => removePedal(s, {
        partIndex: 0, measureIndex: 0,
      })));
    });

    it('addTextDirection', () => {
      expectSuccess(runFrozen(loadScore(), s => addTextDirection(s, {
        partIndex: 0, measureIndex: 0, position: 0, text: 'dolce',
      })));
    });

    it('addRehearsalMark', () => {
      expectSuccess(runFrozen(loadScore(), s => addRehearsalMark(s, {
        partIndex: 0, measureIndex: 0, text: 'A',
      })));
    });

    it('addSegno / addCoda', () => {
      expectSuccess(runFrozen(loadScore(), s => addSegno(s, { partIndex: 0, measureIndex: 0 })));
      expectSuccess(runFrozen(loadScore(), s => addCoda(s, { partIndex: 0, measureIndex: 1 })));
    });

    it('addOctaveShift / stopOctaveShift / removeOctaveShift', () => {
      const withShift = expectSuccess(runFrozen(loadScore(), s => addOctaveShift(s, {
        partIndex: 0, measureIndex: 0, position: 0, shiftType: 'down',
      })));
      expectSuccess(runFrozen(withShift, s => stopOctaveShift(s, {
        partIndex: 0, measureIndex: 1, position: 0,
      })));
      expectSuccess(runFrozen(withShift, s => removeOctaveShift(s, {
        partIndex: 0, measureIndex: 0,
      })));
    });
  });

  describe('tuplet and beam operations', () => {
    it('createTuplet / removeTuplet', () => {
      const withTuplet = expectSuccess(runFrozen(loadScore(), s => createTuplet(s, {
        partIndex: 0, measureIndex: 0, startNoteIndex: 0, noteCount: 3,
        actualNotes: 3, normalNotes: 2,
      })));
      expectSuccess(runFrozen(withTuplet, s => removeTuplet(s, {
        partIndex: 0, measureIndex: 0, noteIndex: 0,
      })));
    });

    it('addBeam / removeBeam / autoBeam', () => {
      // scale.xml has quarter notes, which cannot be beamed; halve them first
      let score = loadScore();
      for (let i = 0; i < 2; i++) {
        score = expectSuccess(changeNoteDuration(score, {
          partIndex: 0, measureIndex: 0, noteIndex: i, newDuration: 1, noteType: 'eighth',
        }));
      }
      const withBeam = expectSuccess(runFrozen(score, s => addBeam(s, {
        partIndex: 0, measureIndex: 0, startNoteIndex: 0, noteCount: 2,
      })));
      expectSuccess(runFrozen(withBeam, s => removeBeam(s, {
        partIndex: 0, measureIndex: 0, noteIndex: 0,
      })));
      runFrozen(score, s => autoBeam(s, { partIndex: 0, measureIndex: 0 }));
    });
  });

  describe('copy/paste operations', () => {
    it('pasteNotes / cutNotes', () => {
      const score = loadScore();
      const selection = copyNotes(score, {
        partIndex: 0, measureIndex: 0, startPosition: 0, endPosition: 2, voice: '1',
      });
      expect(selection.success).toBe(true);
      if (!selection.success) return;

      expectSuccess(runFrozen(loadScore(), s => pasteNotes(s, {
        selection: selection.data, partIndex: 0, measureIndex: 1, position: 0,
      })));
      expectSuccess(runFrozen(loadScore(), s => cutNotes(s, {
        partIndex: 0, measureIndex: 0, startPosition: 0, endPosition: 2, voice: '1',
      })));
    });
  });

  describe('grace note operations', () => {
    it('addGraceNote / removeGraceNote / convertToGrace', () => {
      const withGrace = expectSuccess(runFrozen(loadScore(), s => addGraceNote(s, {
        partIndex: 0, measureIndex: 0, targetNoteIndex: 0, pitch: { step: 'B', octave: 3 },
      })));
      expectSuccess(runFrozen(withGrace, s => removeGraceNote(s, {
        partIndex: 0, measureIndex: 0, graceNoteIndex: 0,
      })));
      expectSuccess(runFrozen(loadScore(), s => convertToGrace(s, {
        partIndex: 0, measureIndex: 0, noteIndex: 0,
      })));
    });
  });

  describe('lyric operations', () => {
    it('addLyric / updateLyric / removeLyric', () => {
      const withLyric = expectSuccess(runFrozen(loadScore(), s => addLyric(s, {
        partIndex: 0, measureIndex: 0, noteIndex: 0, text: 'la',
      })));
      const updated = expectSuccess(runFrozen(withLyric, s => updateLyric(s, {
        partIndex: 0, measureIndex: 0, noteIndex: 0, text: 'lo',
      })));
      expectSuccess(runFrozen(updated, s => removeLyric(s, {
        partIndex: 0, measureIndex: 0, noteIndex: 0,
      })));
    });
  });

  describe('harmony operations', () => {
    it('addHarmony / updateHarmony / removeHarmony', () => {
      const withHarmony = expectSuccess(runFrozen(loadScore(), s => addHarmony(s, {
        partIndex: 0, measureIndex: 0, position: 0, root: { step: 'C' }, kind: 'major',
      })));
      const updated = expectSuccess(runFrozen(withHarmony, s => updateHarmony(s, {
        partIndex: 0, measureIndex: 0, harmonyIndex: 0, kind: 'minor',
      })));
      expectSuccess(runFrozen(updated, s => removeHarmony(s, {
        partIndex: 0, measureIndex: 0, harmonyIndex: 0,
      })));
    });
  });

  describe('technical notation operations', () => {
    it('addFingering / removeFingering', () => {
      const withFingering = expectSuccess(runFrozen(loadScore(), s => addFingering(s, {
        partIndex: 0, measureIndex: 0, noteIndex: 0, fingering: '1',
      })));
      expectSuccess(runFrozen(withFingering, s => removeFingering(s, {
        partIndex: 0, measureIndex: 0, noteIndex: 0,
      })));
    });

    it('addBowing / removeBowing', () => {
      const withBowing = expectSuccess(runFrozen(loadScore(), s => addBowing(s, {
        partIndex: 0, measureIndex: 0, noteIndex: 0, bowingType: 'up-bow',
      })));
      expectSuccess(runFrozen(withBowing, s => removeBowing(s, {
        partIndex: 0, measureIndex: 0, noteIndex: 0,
      })));
    });

    it('addStringNumber / removeStringNumber', () => {
      const withString = expectSuccess(runFrozen(loadScore(), s => addStringNumber(s, {
        partIndex: 0, measureIndex: 0, noteIndex: 0, stringNumber: 3,
      })));
      expectSuccess(runFrozen(withString, s => removeStringNumber(s, {
        partIndex: 0, measureIndex: 0, noteIndex: 0,
      })));
    });
  });

  describe('failure paths', () => {
    it('do not mutate the input when the operation fails', () => {
      const conflict = runFrozen(loadScore(), s => insertNote(s, {
        partIndex: 0, measureIndex: 0, voice: '1', position: 0,
        pitch: { step: 'C', octave: 4 }, duration: 1,
      }));
      expect(conflict.success).toBe(false);

      const exceeds = runFrozen(loadScore(), s => changeNoteDuration(s, {
        partIndex: 0, measureIndex: 0, noteIndex: 3, newDuration: 4,
      }));
      expect(exceeds.success).toBe(false);
    });
  });

  describe('structural sharing', () => {
    it('shares untouched measures with the input and clones the target', () => {
      const score = loadScore();
      const result = expectSuccess(setNotePitch(score, {
        partIndex: 0, measureIndex: 0, noteIndex: 0, pitch: { step: 'A', octave: 4 },
      }));
      // target measure is a fresh object
      expect(result.parts[0].measures[0]).not.toBe(score.parts[0].measures[0]);
      // untouched measure and metadata are shared (cheap + React-friendly)
      expect(result.parts[0].measures[1]).toBe(score.parts[0].measures[1]);
      expect(result.partList).toBe(score.partList);
    });
  });
});
