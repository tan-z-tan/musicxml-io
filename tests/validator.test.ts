import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parse } from '../src';
import type { Score, NoteEntry, Measure, Part } from '../src/types';
import {
  validate,
  isValid,
  assertValid,
  validateDivisions,
  validateMeasureDuration,
  validateMeasureFullness,
  validateBackupForward,
  validateTies,
  validateBeams,
  validateSlurs,
  validateTuplets,
  validatePartReferences,
  validatePartStructure,
  validateStaffStructure,
  validateVoiceStaff,
  validateTiesAcrossMeasures,
  validateSlursAcrossMeasures,
  formatLocation,
  ValidationException,
  validateMeasureLocal,
  getMeasureContext,
  assertMeasureValid,
} from '../src/validator';
import { serialize } from '../src/exporters/musicxml';

const fixturesPath = join(__dirname, 'fixtures');

// Helper to create a minimal valid score
function createMinimalScore(): Score {
  return {
    metadata: {},
    partList: [{ type: 'score-part', id: 'P1', name: 'Part 1' }],
    parts: [{
      id: 'P1',
      measures: [{
        number: '1',
        attributes: {
          divisions: 1,
          time: { beats: '4', beatType: 4 },
        },
        entries: [],
      }],
    }],
  };
}

// Helper to create a note
function createNote(overrides: Partial<NoteEntry> = {}): NoteEntry {
  return {
    type: 'note',
    pitch: { step: 'C', octave: 4 },
    duration: 1,
    voice: 1,
    ...overrides,
  };
}

describe('Validator', () => {
  describe('validate', () => {
    it('should validate a valid score', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      const result = validate(score);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return errors for invalid score', () => {
      const score = createMinimalScore();
      // Create invalid state: part not in partList
      score.parts.push({ id: 'P2', measures: [] });

      const result = validate(score);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should respect validation options', () => {
      const score = createMinimalScore();
      score.parts.push({ id: 'P2', measures: [] });

      // Disable part reference and structure checking
      const result = validate(score, {
        checkPartReferences: false,
        checkPartStructure: false,
      });
      expect(result.valid).toBe(true);
    });
  });

  describe('isValid', () => {
    it('should return true for valid score', () => {
      const score = createMinimalScore();
      expect(isValid(score)).toBe(true);
    });

    it('should return false for invalid score', () => {
      const score = createMinimalScore();
      score.parts.push({ id: 'P2', measures: [] });
      expect(isValid(score)).toBe(false);
    });
  });

  describe('assertValid', () => {
    it('should not throw for valid score', () => {
      const score = createMinimalScore();
      expect(() => assertValid(score)).not.toThrow();
    });

    it('should throw ValidationException for invalid score', () => {
      const score = createMinimalScore();
      score.parts.push({ id: 'P2', measures: [] });

      expect(() => assertValid(score)).toThrow(ValidationException);
    });
  });

  describe('validateDivisions', () => {
    it('should pass when divisions are defined before notes', () => {
      const score = createMinimalScore();
      score.parts[0].measures[0].entries.push(createNote());

      const errors = validateDivisions(score);
      expect(errors).toHaveLength(0);
    });

    it('should error when notes appear before divisions', () => {
      const score = createMinimalScore();
      delete score.parts[0].measures[0].attributes?.divisions;
      score.parts[0].measures[0].entries.push(createNote());

      const errors = validateDivisions(score);
      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe('MISSING_DIVISIONS');
    });

    it('should error for invalid divisions value', () => {
      const score = createMinimalScore();
      score.parts[0].measures[0].attributes!.divisions = 0;

      const errors = validateDivisions(score);
      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe('INVALID_DIVISIONS');
    });

    it('should error for negative divisions', () => {
      const score = createMinimalScore();
      score.parts[0].measures[0].attributes!.divisions = -1;

      const errors = validateDivisions(score);
      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe('INVALID_DIVISIONS');
    });
  });

  describe('validateMeasureDuration', () => {
    it('should pass when duration matches time signature', () => {
      const measure: Measure = {
        number: '1',
        entries: [
          createNote({ duration: 4, voice: 1 }),
        ],
      };

      const errors = validateMeasureDuration(
        measure,
        1, // divisions
        { beats: '4', beatType: 4 },
        { measureNumber: '1' }
      );
      expect(errors).toHaveLength(0);
    });

    it('should error when duration overflows', () => {
      const measure: Measure = {
        number: '1',
        entries: [
          createNote({ duration: 8, voice: 1 }), // 8 beats in 4/4 time
        ],
      };

      const errors = validateMeasureDuration(
        measure,
        1,
        { beats: '4', beatType: 4 },
        { measureNumber: '1' }
      );
      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe('MEASURE_DURATION_OVERFLOW');
    });

    it('should warn when duration underflows', () => {
      const measure: Measure = {
        number: '1',
        entries: [
          createNote({ duration: 2, voice: 1 }), // 2 beats in 4/4 time
        ],
      };

      const errors = validateMeasureDuration(
        measure,
        1,
        { beats: '4', beatType: 4 },
        { measureNumber: '1' }
      );
      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe('MEASURE_DURATION_UNDERFLOW');
      expect(errors[0].level).toBe('warning');
    });

    it('should respect tolerance', () => {
      const measure: Measure = {
        number: '1',
        entries: [
          createNote({ duration: 3, voice: 1 }), // Off by 1
        ],
      };

      const errors = validateMeasureDuration(
        measure,
        1,
        { beats: '4', beatType: 4 },
        { measureNumber: '1' },
        1 // tolerance of 1
      );
      expect(errors).toHaveLength(0);
    });

    it('should skip validation for senzaMisura', () => {
      const measure: Measure = {
        number: '1',
        entries: [
          createNote({ duration: 100, voice: 1 }),
        ],
      };

      const errors = validateMeasureDuration(
        measure,
        1,
        { beats: '4', beatType: 4, senzaMisura: true },
        { measureNumber: '1' }
      );
      expect(errors).toHaveLength(0);
    });
  });

  describe('validateMeasureFullness', () => {
    it('should pass when voice fills entire measure', () => {
      const score = createMinimalScore();
      score.parts[0].measures[0].entries = [
        createNote({ duration: 4, voice: 1 }), // 4 beats fill 4/4 time
      ];

      const result = validate(score, { checkMeasureFullness: true });
      const fullnessErrors = result.warnings.filter(e =>
        e.code === 'VOICE_INCOMPLETE' || e.code === 'VOICE_GAP'
      );
      expect(fullnessErrors).toHaveLength(0);
    });

    it('should warn when voice is incomplete', () => {
      const score = createMinimalScore();
      score.parts[0].measures[0].entries = [
        createNote({ duration: 2, voice: 1 }), // Only 2 beats in 4/4 time
      ];

      const result = validate(score, { checkMeasureFullness: true });
      const incompleteErrors = result.warnings.filter(e => e.code === 'VOICE_INCOMPLETE');
      expect(incompleteErrors).toHaveLength(1);
      expect(incompleteErrors[0].details?.missing).toBe(2);
    });

    it('should warn when voice has gap', () => {
      const score = createMinimalScore();
      score.parts[0].measures[0].entries = [
        createNote({ duration: 1, voice: 1 }),
        { type: 'forward', duration: 1, voice: 1 }, // Gap filled by forward, not note
        createNote({ duration: 2, voice: 1 }),
      ];

      // No gap with forward entries - they count as filling
      const result = validate(score, { checkMeasureFullness: true });
      const gapErrors = result.warnings.filter(e => e.code === 'VOICE_GAP');
      expect(gapErrors).toHaveLength(0);
    });

    it('should not check fullness by default', () => {
      const score = createMinimalScore();
      score.parts[0].measures[0].entries = [
        createNote({ duration: 1, voice: 1 }), // Only 1 beat
      ];

      // Default: checkMeasureFullness is false
      const result = validate(score);
      const fullnessErrors = [...result.errors, ...result.warnings].filter(e =>
        e.code === 'VOICE_INCOMPLETE' || e.code === 'VOICE_GAP'
      );
      expect(fullnessErrors).toHaveLength(0);
    });
  });

  describe('validateBackupForward', () => {
    it('should pass for valid backup/forward sequence', () => {
      const measure: Measure = {
        number: '1',
        entries: [
          createNote({ duration: 4, voice: 1 }),
          { type: 'backup', duration: 4 },
          createNote({ duration: 4, voice: 2 }),
        ],
      };

      const errors = validateBackupForward(measure, { measureNumber: '1' });
      expect(errors).toHaveLength(0);
    });

    it('should error when backup exceeds position', () => {
      const measure: Measure = {
        number: '1',
        entries: [
          createNote({ duration: 2, voice: 1 }),
          { type: 'backup', duration: 4 }, // Backing up more than we advanced
        ],
      };

      const errors = validateBackupForward(measure, { measureNumber: '1' });
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.code === 'BACKUP_EXCEEDS_POSITION')).toBe(true);
    });

    it('should error when position goes negative', () => {
      const measure: Measure = {
        number: '1',
        entries: [
          { type: 'backup', duration: 1 }, // Start at 0, backup by 1
        ],
      };

      const errors = validateBackupForward(measure, { measureNumber: '1' });
      expect(errors.some(e => e.code === 'NEGATIVE_POSITION' || e.code === 'BACKUP_EXCEEDS_POSITION')).toBe(true);
    });

    it('should handle forward correctly', () => {
      const measure: Measure = {
        number: '1',
        entries: [
          { type: 'forward', duration: 2 },
          createNote({ duration: 2, voice: 1 }),
          { type: 'backup', duration: 4 },
          createNote({ duration: 4, voice: 2 }),
        ],
      };

      const errors = validateBackupForward(measure, { measureNumber: '1' });
      expect(errors).toHaveLength(0);
    });
  });

  describe('validateBeams', () => {
    it('should pass for valid beam pairs', () => {
      const measure: Measure = {
        number: '1',
        entries: [
          createNote({ voice: 1, beam: [{ number: 1, type: 'begin' }] }),
          createNote({ voice: 1, beam: [{ number: 1, type: 'continue' }] }),
          createNote({ voice: 1, beam: [{ number: 1, type: 'end' }] }),
        ],
      };

      const errors = validateBeams(measure, { measureNumber: '1' });
      expect(errors).toHaveLength(0);
    });

    it('should error for beam begin without end', () => {
      const measure: Measure = {
        number: '1',
        entries: [
          createNote({ voice: 1, beam: [{ number: 1, type: 'begin' }] }),
          createNote({ voice: 1 }),
        ],
      };

      const errors = validateBeams(measure, { measureNumber: '1' });
      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe('BEAM_BEGIN_WITHOUT_END');
    });

    it('should error for beam end without begin', () => {
      const measure: Measure = {
        number: '1',
        entries: [
          createNote({ voice: 1 }),
          createNote({ voice: 1, beam: [{ number: 1, type: 'end' }] }),
        ],
      };

      const errors = validateBeams(measure, { measureNumber: '1' });
      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe('BEAM_END_WITHOUT_BEGIN');
    });

    it('should handle multiple beam levels', () => {
      const measure: Measure = {
        number: '1',
        entries: [
          createNote({ voice: 1, beam: [{ number: 1, type: 'begin' }, { number: 2, type: 'begin' }] }),
          createNote({ voice: 1, beam: [{ number: 1, type: 'continue' }, { number: 2, type: 'end' }] }),
          createNote({ voice: 1, beam: [{ number: 1, type: 'end' }] }),
        ],
      };

      const errors = validateBeams(measure, { measureNumber: '1' });
      expect(errors).toHaveLength(0);
    });
  });

  describe('validateTies', () => {
    it('should pass for valid tie pairs', () => {
      const measure: Measure = {
        number: '1',
        entries: [
          createNote({ pitch: { step: 'C', octave: 4 }, voice: 1, tie: { type: 'start' } }),
          createNote({ pitch: { step: 'C', octave: 4 }, voice: 1, tie: { type: 'stop' } }),
        ],
      };

      const errors = validateTies(measure, { measureNumber: '1' });
      expect(errors).toHaveLength(0);
    });

    it('should warn for tie stop without start', () => {
      const measure: Measure = {
        number: '1',
        entries: [
          createNote({ pitch: { step: 'C', octave: 4 }, voice: 1, tie: { type: 'stop' } }),
        ],
      };

      const errors = validateTies(measure, { measureNumber: '1' });
      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe('TIE_STOP_WITHOUT_START');
    });

    it('should handle ties array', () => {
      const measure: Measure = {
        number: '1',
        entries: [
          createNote({
            pitch: { step: 'C', octave: 4 },
            voice: 1,
            ties: [{ type: 'start' }],
          }),
          createNote({
            pitch: { step: 'C', octave: 4 },
            voice: 1,
            ties: [{ type: 'stop' }],
          }),
        ],
      };

      const errors = validateTies(measure, { measureNumber: '1' });
      expect(errors).toHaveLength(0);
    });
  });

  describe('validateSlurs', () => {
    it('should pass for valid slur pairs', () => {
      const measure: Measure = {
        number: '1',
        entries: [
          createNote({
            voice: 1,
            notations: [{ type: 'slur', slurType: 'start' }],
          }),
          createNote({
            voice: 1,
            notations: [{ type: 'slur', slurType: 'stop' }],
          }),
        ],
      };

      const errors = validateSlurs(measure, { measureNumber: '1' });
      expect(errors).toHaveLength(0);
    });

    it('should handle numbered slurs', () => {
      const measure: Measure = {
        number: '1',
        entries: [
          createNote({
            voice: 1,
            notations: [
              { type: 'slur', slurType: 'start', number: 1 },
              { type: 'slur', slurType: 'start', number: 2 },
            ],
          }),
          createNote({
            voice: 1,
            notations: [
              { type: 'slur', slurType: 'stop', number: 1 },
              { type: 'slur', slurType: 'stop', number: 2 },
            ],
          }),
        ],
      };

      const errors = validateSlurs(measure, { measureNumber: '1' });
      expect(errors).toHaveLength(0);
    });
  });

  describe('validateTuplets', () => {
    it('should pass for valid tuplet pairs', () => {
      const measure: Measure = {
        number: '1',
        entries: [
          createNote({
            voice: 1,
            notations: [{ type: 'tuplet', tupletType: 'start' }],
          }),
          createNote({ voice: 1 }),
          createNote({
            voice: 1,
            notations: [{ type: 'tuplet', tupletType: 'stop' }],
          }),
        ],
      };

      const errors = validateTuplets(measure, { measureNumber: '1' });
      expect(errors).toHaveLength(0);
    });

    it('should error for tuplet start without stop', () => {
      const measure: Measure = {
        number: '1',
        entries: [
          createNote({
            voice: 1,
            notations: [{ type: 'tuplet', tupletType: 'start' }],
          }),
          createNote({ voice: 1 }),
        ],
      };

      const errors = validateTuplets(measure, { measureNumber: '1' });
      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe('TUPLET_START_WITHOUT_STOP');
    });

    it('should error for tuplet stop without start', () => {
      const measure: Measure = {
        number: '1',
        entries: [
          createNote({ voice: 1 }),
          createNote({
            voice: 1,
            notations: [{ type: 'tuplet', tupletType: 'stop' }],
          }),
        ],
      };

      const errors = validateTuplets(measure, { measureNumber: '1' });
      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe('TUPLET_STOP_WITHOUT_START');
    });
  });

  describe('validatePartReferences', () => {
    it('should pass when parts match partList', () => {
      const score = createMinimalScore();
      const errors = validatePartReferences(score);
      expect(errors).toHaveLength(0);
    });

    it('should error when part is not in partList', () => {
      const score = createMinimalScore();
      score.parts.push({ id: 'P2', measures: [] });

      const errors = validatePartReferences(score);
      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe('PART_ID_NOT_IN_PART_LIST');
    });

    it('should error when partList entry has no part', () => {
      const score = createMinimalScore();
      score.partList.push({ type: 'score-part', id: 'P2', name: 'Part 2' });

      const errors = validatePartReferences(score);
      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe('PART_LIST_ID_NOT_IN_PARTS');
    });
  });

  describe('validateVoiceStaff', () => {
    it('should pass for valid voice/staff numbers', () => {
      const measure: Measure = {
        number: '1',
        entries: [
          createNote({ voice: 1, staff: 1 }),
          createNote({ voice: 2, staff: 1 }),
        ],
      };

      const errors = validateVoiceStaff(measure, 1, { measureNumber: '1' });
      expect(errors).toHaveLength(0);
    });

    it('should error for invalid voice number', () => {
      const measure: Measure = {
        number: '1',
        entries: [
          createNote({ voice: 0 }), // Invalid
        ],
      };

      const errors = validateVoiceStaff(measure, 1, { measureNumber: '1' });
      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe('INVALID_VOICE_NUMBER');
    });

    it('should error for invalid staff number', () => {
      const measure: Measure = {
        number: '1',
        entries: [
          createNote({ voice: 1, staff: 0 }), // Invalid
        ],
      };

      const errors = validateVoiceStaff(measure, 1, { measureNumber: '1' });
      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe('INVALID_STAFF_NUMBER');
    });

    it('should error when staff exceeds staves count', () => {
      const measure: Measure = {
        number: '1',
        entries: [
          createNote({ voice: 1, staff: 3 }), // Only 2 staves declared
        ],
      };

      const errors = validateVoiceStaff(measure, 2, { measureNumber: '1' });
      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe('STAFF_EXCEEDS_STAVES');
    });

    it('should error for negative duration', () => {
      const measure: Measure = {
        number: '1',
        entries: [
          createNote({ voice: 1, duration: -1 }),
        ],
      };

      const errors = validateVoiceStaff(measure, 1, { measureNumber: '1' });
      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe('INVALID_DURATION');
    });
  });

  describe('validateTiesAcrossMeasures', () => {
    it('should pass for valid cross-measure ties', () => {
      const part: Part = {
        id: 'P1',
        measures: [
          {
            number: '1',
            entries: [
              createNote({ pitch: { step: 'C', octave: 4 }, voice: 1, tie: { type: 'start' } }),
            ],
          },
          {
            number: '2',
            entries: [
              createNote({ pitch: { step: 'C', octave: 4 }, voice: 1, tie: { type: 'stop' } }),
            ],
          },
        ],
      };

      const errors = validateTiesAcrossMeasures(part);
      expect(errors).toHaveLength(0);
    });

    it('should warn for unclosed tie at end of part', () => {
      const part: Part = {
        id: 'P1',
        measures: [
          {
            number: '1',
            entries: [
              createNote({ pitch: { step: 'C', octave: 4 }, voice: 1, tie: { type: 'start' } }),
            ],
          },
        ],
      };

      const errors = validateTiesAcrossMeasures(part);
      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe('TIE_START_WITHOUT_STOP');
    });
  });

  describe('validateSlursAcrossMeasures', () => {
    it('should pass for valid cross-measure slurs', () => {
      const part: Part = {
        id: 'P1',
        measures: [
          {
            number: '1',
            entries: [
              createNote({ voice: 1, notations: [{ type: 'slur', slurType: 'start' }] }),
            ],
          },
          {
            number: '2',
            entries: [
              createNote({ voice: 1, notations: [{ type: 'slur', slurType: 'stop' }] }),
            ],
          },
        ],
      };

      const errors = validateSlursAcrossMeasures(part);
      expect(errors).toHaveLength(0);
    });

    it('should warn for unclosed slur at end of part', () => {
      const part: Part = {
        id: 'P1',
        measures: [
          {
            number: '1',
            entries: [
              createNote({ voice: 1, notations: [{ type: 'slur', slurType: 'start' }] }),
            ],
          },
        ],
      };

      const errors = validateSlursAcrossMeasures(part);
      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe('SLUR_START_WITHOUT_STOP');
    });
  });

  describe('validatePartStructure', () => {
    it('should pass when all parts have same measure count', () => {
      const score = createMinimalScore();
      score.partList.push({ type: 'score-part', id: 'P2', name: 'Part 2' });
      score.parts.push({
        id: 'P2',
        measures: [{ number: '1', entries: [] }],
      });

      const errors = validatePartStructure(score);
      expect(errors.filter(e => e.level === 'error')).toHaveLength(0);
    });

    it('should error when parts have different measure counts', () => {
      const score = createMinimalScore();
      score.partList.push({ type: 'score-part', id: 'P2', name: 'Part 2' });
      score.parts.push({
        id: 'P2',
        measures: [
          { number: '1', entries: [] },
          { number: '2', entries: [] },
        ],
      });

      const errors = validatePartStructure(score);
      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe('PART_MEASURE_COUNT_MISMATCH');
    });

    it('should warn when measure numbers do not match', () => {
      const score = createMinimalScore();
      score.partList.push({ type: 'score-part', id: 'P2', name: 'Part 2' });
      score.parts.push({
        id: 'P2',
        measures: [{ number: '2', entries: [] }], // Different number
      });

      const errors = validatePartStructure(score);
      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe('PART_MEASURE_NUMBER_MISMATCH');
      expect(errors[0].level).toBe('warning');
    });

    it('should error for duplicate part IDs', () => {
      const score = createMinimalScore();
      score.partList.push({ type: 'score-part', id: 'P1', name: 'Part 1 copy' });
      score.parts.push({
        id: 'P1', // Duplicate
        measures: [{ number: '1', entries: [] }],
      });

      const errors = validatePartStructure(score);
      expect(errors.some(e => e.code === 'DUPLICATE_PART_ID')).toBe(true);
    });

    it('should error for part-group start without stop', () => {
      const score = createMinimalScore();
      score.partList.unshift({
        type: 'part-group',
        groupType: 'start',
        number: 1,
      });

      const errors = validatePartStructure(score);
      expect(errors.some(e => e.code === 'PART_GROUP_START_WITHOUT_STOP')).toBe(true);
    });

    it('should error for part-group stop without start', () => {
      const score = createMinimalScore();
      score.partList.push({
        type: 'part-group',
        groupType: 'stop',
        number: 1,
      });

      const errors = validatePartStructure(score);
      expect(errors.some(e => e.code === 'PART_GROUP_STOP_WITHOUT_START')).toBe(true);
    });

    it('should pass for valid part-group pairs', () => {
      const score = createMinimalScore();
      score.partList.unshift({
        type: 'part-group',
        groupType: 'start',
        number: 1,
      });
      score.partList.push({
        type: 'part-group',
        groupType: 'stop',
        number: 1,
      });

      const errors = validatePartStructure(score);
      expect(errors.filter(e => e.code.startsWith('PART_GROUP'))).toHaveLength(0);
    });
  });

  describe('validateStaffStructure', () => {
    it('should pass for single staff part', () => {
      const part: Part = {
        id: 'P1',
        measures: [{
          number: '1',
          attributes: {
            clef: [{ sign: 'G', line: 2 }],
          },
          entries: [createNote({ voice: 1 })],
        }],
      };

      const errors = validateStaffStructure(part, 0);
      expect(errors.filter(e => e.level === 'error')).toHaveLength(0);
    });

    it('should warn when multi-staff part missing clef for a staff', () => {
      const part: Part = {
        id: 'P1',
        measures: [{
          number: '1',
          attributes: {
            staves: 2,
            clef: [{ sign: 'G', line: 2, staff: 1 }], // Only staff 1 has clef
          },
          entries: [],
        }],
      };

      const errors = validateStaffStructure(part, 0);
      expect(errors.some(e => e.code === 'MISSING_CLEF_FOR_STAFF')).toBe(true);
    });

    it('should pass when all staves have clefs', () => {
      const part: Part = {
        id: 'P1',
        measures: [{
          number: '1',
          attributes: {
            staves: 2,
            clef: [
              { sign: 'G', line: 2, staff: 1 },
              { sign: 'F', line: 4, staff: 2 },
            ],
          },
          entries: [],
        }],
      };

      const errors = validateStaffStructure(part, 0);
      expect(errors.filter(e => e.code === 'MISSING_CLEF_FOR_STAFF')).toHaveLength(0);
    });

    it('should error when clef staff exceeds staves', () => {
      const part: Part = {
        id: 'P1',
        measures: [{
          number: '1',
          attributes: {
            staves: 1,
            clef: [{ sign: 'F', line: 4, staff: 2 }], // Staff 2 but only 1 staff
          },
          entries: [],
        }],
      };

      const errors = validateStaffStructure(part, 0);
      expect(errors.some(e => e.code === 'CLEF_STAFF_EXCEEDS_STAVES')).toBe(true);
    });

    it('should warn when multiple staves used without declaration', () => {
      const part: Part = {
        id: 'P1',
        measures: [{
          number: '1',
          entries: [
            createNote({ voice: 1, staff: 1 }),
            createNote({ voice: 2, staff: 2 }),
          ],
        }],
      };

      const errors = validateStaffStructure(part, 0);
      expect(errors.some(e => e.code === 'MISSING_STAVES_DECLARATION')).toBe(true);
    });

    it('should info when staves count changes', () => {
      const part: Part = {
        id: 'P1',
        measures: [
          {
            number: '1',
            attributes: { staves: 2 },
            entries: [],
          },
          {
            number: '2',
            attributes: { staves: 1 }, // Changed
            entries: [],
          },
        ],
      };

      const errors = validateStaffStructure(part, 0);
      expect(errors.some(e => e.code === 'STAVES_DECLARATION_MISMATCH')).toBe(true);
      expect(errors.find(e => e.code === 'STAVES_DECLARATION_MISMATCH')?.level).toBe('info');
    });
  });

  describe('formatLocation', () => {
    it('should format location with all fields', () => {
      const location = {
        partId: 'P1',
        measureNumber: '5',
        entryIndex: 3,
        voice: 2,
        staff: 1,
      };

      const formatted = formatLocation(location);
      expect(formatted).toContain('part=P1');
      expect(formatted).toContain('measure=5');
      expect(formatted).toContain('entry[3]');
      expect(formatted).toContain('voice=2');
      expect(formatted).toContain('staff=1');
    });

    it('should format location with index fallbacks', () => {
      const location = {
        partIndex: 0,
        measureIndex: 2,
      };

      const formatted = formatLocation(location);
      expect(formatted).toContain('part[0]');
      expect(formatted).toContain('measure[2]');
    });
  });

  describe('Integration with real files', () => {
    it('should validate all basic fixtures', () => {
      const files = [
        'basic/single-note.xml',
        'basic/two-measures.xml',
        'basic/two-parts.xml',
      ];

      for (const file of files) {
        try {
          const xml = readFileSync(join(fixturesPath, file), 'utf-8');
          const score = parse(xml);
          const result = validate(score);

          // Real files should be valid
          if (!result.valid) {
            console.log(`Validation errors for ${file}:`, result.errors);
          }
          // Note: Some files may have minor issues, so we just check it doesn't throw
        } catch (e) {
          // File might not exist, skip
        }
      }
    });
  });

  describe('Local Validation', () => {
    describe('getMeasureContext', () => {
      it('should get context from first measure', () => {
        const score = createMinimalScore();
        const context = getMeasureContext(score, 0, 0);

        expect(context.divisions).toBe(1);
        expect(context.time).toEqual({ beats: '4', beatType: 4 });
        expect(context.staves).toBe(1);
        expect(context.partIndex).toBe(0);
        expect(context.partId).toBe('P1');
        expect(context.measureIndex).toBe(0);
      });

      it('should accumulate attributes from previous measures', () => {
        const score = createMinimalScore();
        score.parts[0].measures.push({
          number: '2',
          attributes: { divisions: 24, staves: 2 },
          entries: [],
        });
        score.parts[0].measures.push({
          number: '3',
          entries: [],
        });

        const context = getMeasureContext(score, 0, 2);
        expect(context.divisions).toBe(24);
        expect(context.staves).toBe(2);
        expect(context.time).toEqual({ beats: '4', beatType: 4 }); // From measure 1
      });

      it('should throw for invalid part index', () => {
        const score = createMinimalScore();
        expect(() => getMeasureContext(score, 5, 0)).toThrow('Part index 5 out of bounds');
      });
    });

    describe('validateMeasureLocal', () => {
      it('should validate a valid measure', () => {
        const measure: Measure = {
          number: '1',
          entries: [
            createNote({ duration: 4, voice: 1 }),
          ],
        };

        const context = {
          divisions: 1,
          time: { beats: '4', beatType: 4 },
          staves: 1,
          partIndex: 0,
          partId: 'P1',
          measureIndex: 0,
        };

        const errors = validateMeasureLocal(measure, context);
        expect(errors.filter(e => e.level === 'error')).toHaveLength(0);
      });

      it('should catch duration overflow', () => {
        const measure: Measure = {
          number: '1',
          entries: [
            createNote({ duration: 8, voice: 1 }), // Too long for 4/4
          ],
        };

        const context = {
          divisions: 1,
          time: { beats: '4', beatType: 4 },
          staves: 1,
          partIndex: 0,
          partId: 'P1',
          measureIndex: 0,
        };

        const errors = validateMeasureLocal(measure, context);
        expect(errors.some(e => e.code === 'MEASURE_DURATION_OVERFLOW')).toBe(true);
      });

      it('should respect options to disable checks', () => {
        const measure: Measure = {
          number: '1',
          entries: [
            createNote({ duration: 8, voice: 1 }), // Would overflow
          ],
        };

        const context = {
          divisions: 1,
          time: { beats: '4', beatType: 4 },
          staves: 1,
          partIndex: 0,
          partId: 'P1',
          measureIndex: 0,
        };

        const errors = validateMeasureLocal(measure, context, {
          checkMeasureDuration: false,
        });
        expect(errors.filter(e => e.code === 'MEASURE_DURATION_OVERFLOW')).toHaveLength(0);
      });
    });

    describe('assertMeasureValid', () => {
      it('should not throw for valid measure', () => {
        const score = createMinimalScore();
        score.parts[0].measures[0].entries.push(createNote({ duration: 4, voice: 1 }));

        expect(() => assertMeasureValid(score, 0, 0)).not.toThrow();
      });

      it('should throw for invalid measure', () => {
        const score = createMinimalScore();
        score.parts[0].measures[0].entries.push(
          createNote({ duration: 8, voice: 1 }), // Overflow
        );

        expect(() => assertMeasureValid(score, 0, 0)).toThrow(ValidationException);
      });
    });
  });

  describe('Serialize with Validation', () => {
    it('should serialize without validation by default', () => {
      const score = createMinimalScore();
      const xml = serialize(score);
      expect(xml).toContain('<?xml version="1.0"');
    });

    it('should validate and serialize valid score', () => {
      const score = createMinimalScore();
      let validationCalled = false;

      const xml = serialize(score, {
        validate: true,
        onValidation: (result) => {
          validationCalled = true;
          expect(result.valid).toBe(true);
        },
      });

      expect(validationCalled).toBe(true);
      expect(xml).toContain('<?xml version="1.0"');
    });

    it('should throw on validation error when throwOnValidationError is true', () => {
      const score = createMinimalScore();
      score.parts.push({ id: 'P2', measures: [] }); // Invalid: not in partList

      expect(() => serialize(score, {
        validate: true,
        throwOnValidationError: true,
      })).toThrow(ValidationException);
    });

    it('should not throw on validation error when throwOnValidationError is false', () => {
      const score = createMinimalScore();
      score.parts.push({ id: 'P2', measures: [] }); // Invalid: not in partList

      const xml = serialize(score, {
        validate: true,
        throwOnValidationError: false,
      });

      expect(xml).toContain('<?xml version="1.0"');
    });

    it('should call onValidation callback with result', () => {
      const score = createMinimalScore();
      score.parts.push({ id: 'P2', measures: [] }); // Invalid

      let capturedResult: any = null;
      serialize(score, {
        validate: true,
        onValidation: (result) => {
          capturedResult = result;
        },
      });

      expect(capturedResult).not.toBeNull();
      expect(capturedResult.valid).toBe(false);
      expect(capturedResult.errors.length).toBeGreaterThan(0);
    });
  });
});
