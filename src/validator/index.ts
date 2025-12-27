import type {
  Score,
  Part,
  Measure,
  TimeSignature,
  Pitch,
} from '../types';

// ============================================================
// Validation Error Types
// ============================================================

export type ValidationErrorCode =
  // Divisions
  | 'MISSING_DIVISIONS'
  | 'INVALID_DIVISIONS'
  // Measure duration
  | 'MEASURE_DURATION_MISMATCH'
  | 'MEASURE_DURATION_OVERFLOW'
  | 'MEASURE_DURATION_UNDERFLOW'
  // Position
  | 'NEGATIVE_POSITION'
  | 'BACKUP_EXCEEDS_POSITION'
  // Ties
  | 'TIE_START_WITHOUT_STOP'
  | 'TIE_STOP_WITHOUT_START'
  | 'TIE_PITCH_MISMATCH'
  // Beams
  | 'BEAM_BEGIN_WITHOUT_END'
  | 'BEAM_END_WITHOUT_BEGIN'
  // Slurs
  | 'SLUR_START_WITHOUT_STOP'
  | 'SLUR_STOP_WITHOUT_START'
  // Tuplets
  | 'TUPLET_START_WITHOUT_STOP'
  | 'TUPLET_STOP_WITHOUT_START'
  // Part references
  | 'PART_ID_NOT_IN_PART_LIST'
  | 'PART_LIST_ID_NOT_IN_PARTS'
  // Part structure
  | 'PART_MEASURE_COUNT_MISMATCH'
  | 'PART_MEASURE_NUMBER_MISMATCH'
  | 'PART_GROUP_START_WITHOUT_STOP'
  | 'PART_GROUP_STOP_WITHOUT_START'
  | 'DUPLICATE_PART_ID'
  // Voice/Staff
  | 'INVALID_VOICE_NUMBER'
  | 'INVALID_STAFF_NUMBER'
  | 'STAFF_EXCEEDS_STAVES'
  // Staff structure
  | 'MISSING_STAVES_DECLARATION'
  | 'STAVES_DECLARATION_MISMATCH'
  | 'MISSING_CLEF_FOR_STAFF'
  | 'CLEF_STAFF_EXCEEDS_STAVES'
  // General
  | 'INVALID_DURATION'
  | 'EMPTY_MEASURE';

export type ValidationLevel = 'error' | 'warning' | 'info';

export interface ValidationLocation {
  partIndex?: number;
  partId?: string;
  measureIndex?: number;
  measureNumber?: string;
  entryIndex?: number;
  voice?: number;
  staff?: number;
}

export interface ValidationError {
  code: ValidationErrorCode;
  level: ValidationLevel;
  message: string;
  location: ValidationLocation;
  details?: Record<string, unknown>;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  infos: ValidationError[];
}

export interface ValidateOptions {
  /** Check divisions consistency (default: true) */
  checkDivisions?: boolean;
  /** Check measure durations match time signature (default: true) */
  checkMeasureDuration?: boolean;
  /** Check backup/forward position consistency (default: true) */
  checkPosition?: boolean;
  /** Check tie start/stop pairing (default: true) */
  checkTies?: boolean;
  /** Check beam begin/end pairing (default: true) */
  checkBeams?: boolean;
  /** Check slur start/stop pairing (default: true) */
  checkSlurs?: boolean;
  /** Check tuplet start/stop pairing (default: true) */
  checkTuplets?: boolean;
  /** Check part ID references (default: true) */
  checkPartReferences?: boolean;
  /** Check part structure (measure count, numbers) (default: true) */
  checkPartStructure?: boolean;
  /** Check voice/staff numbers (default: true) */
  checkVoiceStaff?: boolean;
  /** Check staff structure (staves declaration, clefs) (default: true) */
  checkStaffStructure?: boolean;
  /** Tolerance for measure duration (in divisions, default: 0) */
  durationTolerance?: number;
}

const DEFAULT_OPTIONS: Required<ValidateOptions> = {
  checkDivisions: true,
  checkMeasureDuration: true,
  checkPosition: true,
  checkTies: true,
  checkBeams: true,
  checkSlurs: true,
  checkTuplets: true,
  checkPartReferences: true,
  checkPartStructure: true,
  checkVoiceStaff: true,
  checkStaffStructure: true,
  durationTolerance: 0,
};

// ============================================================
// Main Validate Function
// ============================================================

/**
 * Validate a Score for internal consistency
 */
export function validate(score: Score, options: ValidateOptions = {}): ValidationResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const allErrors: ValidationError[] = [];

  if (opts.checkPartReferences) {
    allErrors.push(...validatePartReferences(score));
  }

  if (opts.checkPartStructure) {
    allErrors.push(...validatePartStructure(score));
  }

  if (opts.checkDivisions) {
    allErrors.push(...validateDivisions(score));
  }

  for (let partIndex = 0; partIndex < score.parts.length; partIndex++) {
    const part = score.parts[partIndex];

    // Track current attributes state
    let currentDivisions = 1;
    let currentTime: TimeSignature | undefined;
    let currentStaves = 1;

    for (let measureIndex = 0; measureIndex < part.measures.length; measureIndex++) {
      const measure = part.measures[measureIndex];
      const location: ValidationLocation = {
        partIndex,
        partId: part.id,
        measureIndex,
        measureNumber: measure.number,
      };

      // Update attributes
      if (measure.attributes) {
        if (measure.attributes.divisions !== undefined) {
          currentDivisions = measure.attributes.divisions;
        }
        if (measure.attributes.time !== undefined) {
          currentTime = measure.attributes.time;
        }
        if (measure.attributes.staves !== undefined) {
          currentStaves = measure.attributes.staves;
        }
      }

      if (opts.checkMeasureDuration && currentTime) {
        allErrors.push(...validateMeasureDuration(
          measure,
          currentDivisions,
          currentTime,
          location,
          opts.durationTolerance
        ));
      }

      if (opts.checkPosition) {
        allErrors.push(...validateBackupForward(measure, location));
      }

      if (opts.checkTies) {
        allErrors.push(...validateTies(measure, location));
      }

      if (opts.checkBeams) {
        allErrors.push(...validateBeams(measure, location));
      }

      if (opts.checkSlurs) {
        allErrors.push(...validateSlurs(measure, location));
      }

      if (opts.checkTuplets) {
        allErrors.push(...validateTuplets(measure, location));
      }

      if (opts.checkVoiceStaff) {
        allErrors.push(...validateVoiceStaff(measure, currentStaves, location));
      }
    }

    // Staff structure validation for the entire part
    if (opts.checkStaffStructure) {
      allErrors.push(...validateStaffStructure(part, partIndex));
    }
  }

  // Categorize errors
  const errors = allErrors.filter(e => e.level === 'error');
  const warnings = allErrors.filter(e => e.level === 'warning');
  const infos = allErrors.filter(e => e.level === 'info');

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    infos,
  };
}

// ============================================================
// Individual Validators
// ============================================================

/**
 * Validate that divisions are defined and consistent
 */
export function validateDivisions(score: Score): ValidationError[] {
  const errors: ValidationError[] = [];

  for (let partIndex = 0; partIndex < score.parts.length; partIndex++) {
    const part = score.parts[partIndex];
    let hasDivisions = false;

    for (let measureIndex = 0; measureIndex < part.measures.length; measureIndex++) {
      const measure = part.measures[measureIndex];

      if (measure.attributes?.divisions !== undefined) {
        hasDivisions = true;

        if (measure.attributes.divisions <= 0) {
          errors.push({
            code: 'INVALID_DIVISIONS',
            level: 'error',
            message: `Invalid divisions value: ${measure.attributes.divisions}. Must be positive.`,
            location: {
              partIndex,
              partId: part.id,
              measureIndex,
              measureNumber: measure.number,
            },
            details: { divisions: measure.attributes.divisions },
          });
        }
      }

      // Check for notes before divisions are defined
      if (!hasDivisions) {
        const hasNotes = measure.entries.some(e => e.type === 'note');
        if (hasNotes) {
          errors.push({
            code: 'MISSING_DIVISIONS',
            level: 'error',
            message: 'Notes found before divisions are defined',
            location: {
              partIndex,
              partId: part.id,
              measureIndex,
              measureNumber: measure.number,
            },
          });
          hasDivisions = true; // Only report once
        }
      }
    }
  }

  return errors;
}

/**
 * Validate measure duration matches time signature
 */
export function validateMeasureDuration(
  measure: Measure,
  divisions: number,
  time: TimeSignature,
  location: ValidationLocation,
  tolerance: number = 0
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Skip if senzaMisura (free time)
  if (time.senzaMisura) {
    return errors;
  }

  // Calculate expected duration
  const beats = parseInt(time.beats, 10);
  if (isNaN(beats)) {
    return errors; // Complex beats string, skip validation
  }

  const expectedDuration = (beats / time.beatType) * 4 * divisions;

  // Calculate actual duration per voice
  const voiceDurations = calculateVoiceDurations(measure);

  for (const [voiceKey, actualDuration] of voiceDurations.entries()) {
    const [staff, voice] = voiceKey.split('-').map(Number);
    const diff = actualDuration - expectedDuration;

    if (Math.abs(diff) > tolerance) {
      if (diff > 0) {
        errors.push({
          code: 'MEASURE_DURATION_OVERFLOW',
          level: 'error',
          message: `Voice ${voice} (staff ${staff}) duration ${actualDuration} exceeds expected ${expectedDuration}`,
          location: { ...location, voice, staff },
          details: {
            expected: expectedDuration,
            actual: actualDuration,
            difference: diff,
          },
        });
      } else {
        errors.push({
          code: 'MEASURE_DURATION_UNDERFLOW',
          level: 'warning',
          message: `Voice ${voice} (staff ${staff}) duration ${actualDuration} is less than expected ${expectedDuration}`,
          location: { ...location, voice, staff },
          details: {
            expected: expectedDuration,
            actual: actualDuration,
            difference: diff,
          },
        });
      }
    }
  }

  return errors;
}

/**
 * Calculate the total duration for each voice in a measure
 */
function calculateVoiceDurations(measure: Measure): Map<string, number> {
  const voiceDurations = new Map<string, number>();
  let currentPosition = 0;
  const voiceMaxPositions = new Map<string, number>();

  for (const entry of measure.entries) {
    if (entry.type === 'note') {
      const staff = entry.staff ?? 1;
      const voice = entry.voice;
      const key = `${staff}-${voice}`;

      if (!entry.chord) {
        // Track the max position reached by each voice
        const endPosition = currentPosition + entry.duration;
        const currentMax = voiceMaxPositions.get(key) ?? 0;
        voiceMaxPositions.set(key, Math.max(currentMax, endPosition));
        currentPosition = endPosition;
      }
    } else if (entry.type === 'backup') {
      currentPosition -= entry.duration;
    } else if (entry.type === 'forward') {
      currentPosition += entry.duration;
    }
  }

  // Convert max positions to durations
  for (const [key, maxPos] of voiceMaxPositions.entries()) {
    voiceDurations.set(key, maxPos);
  }

  return voiceDurations;
}

/**
 * Validate backup/forward position consistency
 */
export function validateBackupForward(
  measure: Measure,
  location: ValidationLocation
): ValidationError[] {
  const errors: ValidationError[] = [];
  let position = 0;
  let minPosition = 0;

  for (let entryIndex = 0; entryIndex < measure.entries.length; entryIndex++) {
    const entry = measure.entries[entryIndex];

    if (entry.type === 'note') {
      if (!entry.chord) {
        position += entry.duration;
      }
    } else if (entry.type === 'backup') {
      const newPosition = position - entry.duration;
      if (newPosition < 0) {
        errors.push({
          code: 'BACKUP_EXCEEDS_POSITION',
          level: 'error',
          message: `Backup of ${entry.duration} at position ${position} results in negative position ${newPosition}`,
          location: { ...location, entryIndex },
          details: {
            backupDuration: entry.duration,
            positionBefore: position,
            positionAfter: newPosition,
          },
        });
      }
      position = newPosition;
      minPosition = Math.min(minPosition, position);
    } else if (entry.type === 'forward') {
      position += entry.duration;
    }
  }

  if (minPosition < 0) {
    errors.push({
      code: 'NEGATIVE_POSITION',
      level: 'error',
      message: `Position went negative (min: ${minPosition}) in measure`,
      location,
      details: { minPosition },
    });
  }

  return errors;
}

/**
 * Validate tie start/stop pairing
 */
export function validateTies(
  measure: Measure,
  location: ValidationLocation
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Track open ties by pitch
  const openTies = new Map<string, { entryIndex: number; pitch: Pitch }>();

  for (let entryIndex = 0; entryIndex < measure.entries.length; entryIndex++) {
    const entry = measure.entries[entryIndex];
    if (entry.type !== 'note' || !entry.pitch) continue;

    const pitchKey = `${entry.pitch.step}${entry.pitch.octave}${entry.pitch.alter ?? 0}-${entry.voice}-${entry.staff ?? 1}`;

    // Handle tie array
    const ties = entry.ties ?? (entry.tie ? [entry.tie] : []);

    for (const tie of ties) {
      if (tie.type === 'start') {
        if (openTies.has(pitchKey)) {
          // Already have an open tie for this pitch - might be valid in some cases
          // but worth warning about
        }
        openTies.set(pitchKey, { entryIndex, pitch: entry.pitch });
      } else if (tie.type === 'stop') {
        if (!openTies.has(pitchKey)) {
          errors.push({
            code: 'TIE_STOP_WITHOUT_START',
            level: 'warning',
            message: `Tie stop without matching start for ${entry.pitch.step}${entry.pitch.octave}`,
            location: { ...location, entryIndex, voice: entry.voice, staff: entry.staff ?? 1 },
            details: { pitch: entry.pitch },
          });
        } else {
          openTies.delete(pitchKey);
        }
      }
      // 'continue' type doesn't change open/closed state within a measure
    }
  }

  // Note: We don't report unclosed ties as errors because they may continue to next measure
  // This is a cross-measure validation that would need a different approach

  return errors;
}

/**
 * Validate beam begin/end pairing
 */
export function validateBeams(
  measure: Measure,
  location: ValidationLocation
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Track open beams by beam number and voice
  const openBeams = new Map<string, number>(); // key -> entryIndex

  for (let entryIndex = 0; entryIndex < measure.entries.length; entryIndex++) {
    const entry = measure.entries[entryIndex];
    if (entry.type !== 'note' || !entry.beam) continue;

    for (const beam of entry.beam) {
      const beamKey = `${beam.number}-${entry.voice}-${entry.staff ?? 1}`;

      if (beam.type === 'begin') {
        if (openBeams.has(beamKey)) {
          errors.push({
            code: 'BEAM_BEGIN_WITHOUT_END',
            level: 'error',
            message: `Beam ${beam.number} started again before previous beam ended`,
            location: { ...location, entryIndex, voice: entry.voice, staff: entry.staff ?? 1 },
            details: { beamNumber: beam.number },
          });
        }
        openBeams.set(beamKey, entryIndex);
      } else if (beam.type === 'end') {
        if (!openBeams.has(beamKey)) {
          errors.push({
            code: 'BEAM_END_WITHOUT_BEGIN',
            level: 'error',
            message: `Beam ${beam.number} end without matching begin`,
            location: { ...location, entryIndex, voice: entry.voice, staff: entry.staff ?? 1 },
            details: { beamNumber: beam.number },
          });
        } else {
          openBeams.delete(beamKey);
        }
      }
      // 'continue', 'forward hook', 'backward hook' don't affect open/closed state
    }
  }

  // Report unclosed beams
  for (const [beamKey, startIndex] of openBeams.entries()) {
    const [beamNumber, voice, staff] = beamKey.split('-').map(Number);
    errors.push({
      code: 'BEAM_BEGIN_WITHOUT_END',
      level: 'error',
      message: `Beam ${beamNumber} started but never ended in measure`,
      location: { ...location, entryIndex: startIndex, voice, staff },
      details: { beamNumber },
    });
  }

  return errors;
}

/**
 * Validate slur start/stop pairing
 */
export function validateSlurs(
  measure: Measure,
  _location: ValidationLocation
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Track open slurs by slur number and voice
  const openSlurs = new Map<string, number>(); // key -> entryIndex

  for (let entryIndex = 0; entryIndex < measure.entries.length; entryIndex++) {
    const entry = measure.entries[entryIndex];
    if (entry.type !== 'note' || !entry.notations) continue;

    for (const notation of entry.notations) {
      if (notation.type !== 'slur') continue;

      const slurNumber = notation.number ?? 1;
      const slurKey = `${slurNumber}-${entry.voice}-${entry.staff ?? 1}`;

      if (notation.slurType === 'start') {
        if (openSlurs.has(slurKey)) {
          // Starting a new slur while one is open - might be nested slurs which is valid
          // Don't report as error, but could be a warning
        }
        openSlurs.set(slurKey, entryIndex);
      } else if (notation.slurType === 'stop') {
        if (!openSlurs.has(slurKey)) {
          // Slur stop without start in this measure - could be continuing from previous measure
          // Only report as info, not error
        } else {
          openSlurs.delete(slurKey);
        }
      }
      // 'continue' doesn't affect open/closed state
    }
  }

  // Note: Open slurs at end of measure are valid (continue to next measure)
  // So we don't report them as errors

  return errors;
}

/**
 * Validate tuplet start/stop pairing
 */
export function validateTuplets(
  measure: Measure,
  location: ValidationLocation
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Track open tuplets by tuplet number and voice
  const openTuplets = new Map<string, number>(); // key -> entryIndex

  for (let entryIndex = 0; entryIndex < measure.entries.length; entryIndex++) {
    const entry = measure.entries[entryIndex];
    if (entry.type !== 'note' || !entry.notations) continue;

    for (const notation of entry.notations) {
      if (notation.type !== 'tuplet') continue;

      const tupletNumber = notation.number ?? 1;
      const tupletKey = `${tupletNumber}-${entry.voice}-${entry.staff ?? 1}`;

      if (notation.tupletType === 'start') {
        if (openTuplets.has(tupletKey)) {
          errors.push({
            code: 'TUPLET_START_WITHOUT_STOP',
            level: 'error',
            message: `Tuplet ${tupletNumber} started again before previous tuplet ended`,
            location: { ...location, entryIndex, voice: entry.voice, staff: entry.staff ?? 1 },
            details: { tupletNumber },
          });
        }
        openTuplets.set(tupletKey, entryIndex);
      } else if (notation.tupletType === 'stop') {
        if (!openTuplets.has(tupletKey)) {
          errors.push({
            code: 'TUPLET_STOP_WITHOUT_START',
            level: 'error',
            message: `Tuplet ${tupletNumber} stop without matching start`,
            location: { ...location, entryIndex, voice: entry.voice, staff: entry.staff ?? 1 },
            details: { tupletNumber },
          });
        } else {
          openTuplets.delete(tupletKey);
        }
      }
    }
  }

  // Report unclosed tuplets
  for (const [tupletKey, startIndex] of openTuplets.entries()) {
    const [tupletNumber, voice, staff] = tupletKey.split('-').map(Number);
    errors.push({
      code: 'TUPLET_START_WITHOUT_STOP',
      level: 'error',
      message: `Tuplet ${tupletNumber} started but never ended in measure`,
      location: { ...location, entryIndex: startIndex, voice, staff },
      details: { tupletNumber },
    });
  }

  return errors;
}

/**
 * Validate part ID references between partList and parts
 */
export function validatePartReferences(score: Score): ValidationError[] {
  const errors: ValidationError[] = [];

  // Get IDs from partList
  const partListIds = new Set<string>();
  for (const entry of score.partList) {
    if (entry.type === 'score-part') {
      partListIds.add(entry.id);
    }
  }

  // Get IDs from parts
  const partIds = new Set<string>();
  for (const part of score.parts) {
    partIds.add(part.id);
  }

  // Check for parts not in partList
  for (let partIndex = 0; partIndex < score.parts.length; partIndex++) {
    const part = score.parts[partIndex];
    if (!partListIds.has(part.id)) {
      errors.push({
        code: 'PART_ID_NOT_IN_PART_LIST',
        level: 'error',
        message: `Part "${part.id}" is not defined in partList`,
        location: { partIndex, partId: part.id },
      });
    }
  }

  // Check for partList entries not in parts
  for (const entry of score.partList) {
    if (entry.type === 'score-part' && !partIds.has(entry.id)) {
      errors.push({
        code: 'PART_LIST_ID_NOT_IN_PARTS',
        level: 'error',
        message: `PartList entry "${entry.id}" has no corresponding part`,
        location: { partId: entry.id },
      });
    }
  }

  return errors;
}

/**
 * Validate voice and staff numbers
 */
export function validateVoiceStaff(
  measure: Measure,
  staves: number,
  location: ValidationLocation
): ValidationError[] {
  const errors: ValidationError[] = [];

  for (let entryIndex = 0; entryIndex < measure.entries.length; entryIndex++) {
    const entry = measure.entries[entryIndex];
    if (entry.type !== 'note') continue;

    // Check voice number
    if (entry.voice <= 0) {
      errors.push({
        code: 'INVALID_VOICE_NUMBER',
        level: 'error',
        message: `Invalid voice number: ${entry.voice}. Must be positive.`,
        location: { ...location, entryIndex, voice: entry.voice },
      });
    }

    // Check staff number
    const staff = entry.staff ?? 1;
    if (staff <= 0) {
      errors.push({
        code: 'INVALID_STAFF_NUMBER',
        level: 'error',
        message: `Invalid staff number: ${staff}. Must be positive.`,
        location: { ...location, entryIndex, staff },
      });
    } else if (staff > staves) {
      errors.push({
        code: 'STAFF_EXCEEDS_STAVES',
        level: 'error',
        message: `Staff number ${staff} exceeds declared staves count ${staves}`,
        location: { ...location, entryIndex, staff },
        details: { declaredStaves: staves },
      });
    }

    // Check duration
    if (entry.duration < 0) {
      errors.push({
        code: 'INVALID_DURATION',
        level: 'error',
        message: `Invalid duration: ${entry.duration}. Must be non-negative.`,
        location: { ...location, entryIndex },
        details: { duration: entry.duration },
      });
    }
  }

  return errors;
}

// ============================================================
// Part Structure Validators
// ============================================================

/**
 * Validate part structure (measure counts and numbers match across parts)
 */
export function validatePartStructure(score: Score): ValidationError[] {
  const errors: ValidationError[] = [];

  if (score.parts.length === 0) {
    return errors;
  }

  // Check for duplicate part IDs
  const partIds = new Map<string, number>();
  for (let partIndex = 0; partIndex < score.parts.length; partIndex++) {
    const part = score.parts[partIndex];
    if (partIds.has(part.id)) {
      errors.push({
        code: 'DUPLICATE_PART_ID',
        level: 'error',
        message: `Duplicate part ID "${part.id}" found at index ${partIndex} (first at index ${partIds.get(part.id)})`,
        location: { partIndex, partId: part.id },
        details: { firstIndex: partIds.get(part.id) },
      });
    } else {
      partIds.set(part.id, partIndex);
    }
  }

  // Use first part as reference
  const referencePart = score.parts[0];
  const referenceMeasureCount = referencePart.measures.length;

  // Check all other parts
  for (let partIndex = 1; partIndex < score.parts.length; partIndex++) {
    const part = score.parts[partIndex];

    // Check measure count
    if (part.measures.length !== referenceMeasureCount) {
      errors.push({
        code: 'PART_MEASURE_COUNT_MISMATCH',
        level: 'error',
        message: `Part "${part.id}" has ${part.measures.length} measures, expected ${referenceMeasureCount} (same as first part)`,
        location: { partIndex, partId: part.id },
        details: {
          expected: referenceMeasureCount,
          actual: part.measures.length,
        },
      });
    }

    // Check measure numbers match
    const minLength = Math.min(part.measures.length, referenceMeasureCount);
    for (let measureIndex = 0; measureIndex < minLength; measureIndex++) {
      const refMeasure = referencePart.measures[measureIndex];
      const partMeasure = part.measures[measureIndex];

      if (refMeasure.number !== partMeasure.number) {
        errors.push({
          code: 'PART_MEASURE_NUMBER_MISMATCH',
          level: 'warning',
          message: `Part "${part.id}" measure at index ${measureIndex} has number "${partMeasure.number}", expected "${refMeasure.number}"`,
          location: {
            partIndex,
            partId: part.id,
            measureIndex,
            measureNumber: partMeasure.number,
          },
          details: {
            expected: refMeasure.number,
            actual: partMeasure.number,
          },
        });
      }
    }
  }

  // Check part-group pairing in partList
  const openGroups = new Map<number, number>(); // groupNumber -> index in partList

  for (let i = 0; i < score.partList.length; i++) {
    const entry = score.partList[i];
    if (entry.type !== 'part-group') continue;

    const groupNumber = entry.number ?? 1;

    if (entry.groupType === 'start') {
      if (openGroups.has(groupNumber)) {
        errors.push({
          code: 'PART_GROUP_START_WITHOUT_STOP',
          level: 'error',
          message: `Part group ${groupNumber} started again at index ${i} before previous group ended`,
          location: {},
          details: { groupNumber, partListIndex: i },
        });
      }
      openGroups.set(groupNumber, i);
    } else if (entry.groupType === 'stop') {
      if (!openGroups.has(groupNumber)) {
        errors.push({
          code: 'PART_GROUP_STOP_WITHOUT_START',
          level: 'error',
          message: `Part group ${groupNumber} stop at index ${i} without matching start`,
          location: {},
          details: { groupNumber, partListIndex: i },
        });
      } else {
        openGroups.delete(groupNumber);
      }
    }
  }

  // Report unclosed groups
  for (const [groupNumber, startIndex] of openGroups.entries()) {
    errors.push({
      code: 'PART_GROUP_START_WITHOUT_STOP',
      level: 'error',
      message: `Part group ${groupNumber} started at index ${startIndex} but never stopped`,
      location: {},
      details: { groupNumber, partListIndex: startIndex },
    });
  }

  return errors;
}

// ============================================================
// Staff Structure Validators
// ============================================================

/**
 * Validate staff structure within a part
 */
export function validateStaffStructure(part: Part, partIndex: number): ValidationError[] {
  const errors: ValidationError[] = [];

  let currentStaves: number | undefined = undefined;
  let stavesDeclarationMeasure: string | undefined = undefined;
  const clefsDeclaredForStaves = new Set<number>();

  for (let measureIndex = 0; measureIndex < part.measures.length; measureIndex++) {
    const measure = part.measures[measureIndex];
    const location: ValidationLocation = {
      partIndex,
      partId: part.id,
      measureIndex,
      measureNumber: measure.number,
    };

    // Check staves declaration
    if (measure.attributes?.staves !== undefined) {
      const newStaves = measure.attributes.staves;

      if (currentStaves !== undefined && newStaves !== currentStaves) {
        // Staves count changed - this is valid but might indicate an issue
        errors.push({
          code: 'STAVES_DECLARATION_MISMATCH',
          level: 'info',
          message: `Staves count changed from ${currentStaves} to ${newStaves}`,
          location,
          details: {
            previous: currentStaves,
            new: newStaves,
            previousMeasure: stavesDeclarationMeasure,
          },
        });
        // Reset clef tracking when staves change
        clefsDeclaredForStaves.clear();
      }

      currentStaves = newStaves;
      stavesDeclarationMeasure = measure.number;
    }

    // Check clef declarations
    if (measure.attributes?.clef) {
      for (const clef of measure.attributes.clef) {
        const staffNum = clef.staff ?? 1;
        clefsDeclaredForStaves.add(staffNum);

        // Check if clef staff exceeds staves
        if (currentStaves !== undefined && staffNum > currentStaves) {
          errors.push({
            code: 'CLEF_STAFF_EXCEEDS_STAVES',
            level: 'error',
            message: `Clef declared for staff ${staffNum}, but only ${currentStaves} staves declared`,
            location,
            details: {
              clefStaff: staffNum,
              declaredStaves: currentStaves,
            },
          });
        }
      }
    }

    // Check if notes use staff numbers that exceed staves
    if (currentStaves !== undefined) {
      const usedStaves = new Set<number>();
      for (const entry of measure.entries) {
        if (entry.type === 'note') {
          usedStaves.add(entry.staff ?? 1);
        } else if (entry.type === 'forward' && entry.staff) {
          usedStaves.add(entry.staff);
        }
      }

      for (const usedStaff of usedStaves) {
        if (usedStaff > currentStaves) {
          // This is already caught by validateVoiceStaff, so we skip it here
        }
      }
    }
  }

  // Check if multi-staff parts have clefs for all staves (at the end)
  if (currentStaves !== undefined && currentStaves > 1) {
    for (let staff = 1; staff <= currentStaves; staff++) {
      if (!clefsDeclaredForStaves.has(staff)) {
        errors.push({
          code: 'MISSING_CLEF_FOR_STAFF',
          level: 'warning',
          message: `No clef declared for staff ${staff} in part "${part.id}"`,
          location: { partIndex, partId: part.id },
          details: { staff, totalStaves: currentStaves },
        });
      }
    }
  }

  // Check if notes use multiple staves but staves not declared
  const allUsedStaves = new Set<number>();
  for (const measure of part.measures) {
    for (const entry of measure.entries) {
      if (entry.type === 'note' && entry.staff !== undefined) {
        allUsedStaves.add(entry.staff);
      }
    }
  }

  if (allUsedStaves.size > 1 && currentStaves === undefined) {
    errors.push({
      code: 'MISSING_STAVES_DECLARATION',
      level: 'warning',
      message: `Part "${part.id}" uses staff numbers ${Array.from(allUsedStaves).sort().join(', ')} but has no staves declaration`,
      location: { partIndex, partId: part.id },
      details: { usedStaves: Array.from(allUsedStaves).sort() },
    });
  }

  return errors;
}

// ============================================================
// Local Validation (for operations)
// ============================================================

/**
 * Context needed to validate a single measure
 */
export interface MeasureValidationContext {
  /** Current divisions value (from previous attributes) */
  divisions: number;
  /** Current time signature */
  time?: TimeSignature;
  /** Current staves count */
  staves: number;
  /** Part index (for error location) */
  partIndex: number;
  /** Part ID (for error location) */
  partId: string;
  /** Measure index (for error location) */
  measureIndex: number;
}

/**
 * Options for local measure validation
 */
export interface LocalValidateOptions {
  checkMeasureDuration?: boolean;
  checkPosition?: boolean;
  checkBeams?: boolean;
  checkTuplets?: boolean;
  checkVoiceStaff?: boolean;
  durationTolerance?: number;
}

const DEFAULT_LOCAL_OPTIONS: Required<LocalValidateOptions> = {
  checkMeasureDuration: true,
  checkPosition: true,
  checkBeams: true,
  checkTuplets: true,
  checkVoiceStaff: true,
  durationTolerance: 0,
};

/**
 * Validate a single measure with provided context.
 * This is useful for validating after local operations like addNote, deleteNote.
 *
 * @example
 * ```typescript
 * const context = getMeasureContext(score, partIndex, measureIndex);
 * const errors = validateMeasureLocal(measure, context);
 * if (errors.length > 0) {
 *   throw new Error('Operation created invalid state');
 * }
 * ```
 */
export function validateMeasureLocal(
  measure: Measure,
  context: MeasureValidationContext,
  options: LocalValidateOptions = {}
): ValidationError[] {
  const opts = { ...DEFAULT_LOCAL_OPTIONS, ...options };
  const errors: ValidationError[] = [];

  const location: ValidationLocation = {
    partIndex: context.partIndex,
    partId: context.partId,
    measureIndex: context.measureIndex,
    measureNumber: measure.number,
  };

  if (opts.checkMeasureDuration && context.time) {
    errors.push(...validateMeasureDuration(
      measure,
      context.divisions,
      context.time,
      location,
      opts.durationTolerance
    ));
  }

  if (opts.checkPosition) {
    errors.push(...validateBackupForward(measure, location));
  }

  if (opts.checkBeams) {
    errors.push(...validateBeams(measure, location));
  }

  if (opts.checkTuplets) {
    errors.push(...validateTuplets(measure, location));
  }

  if (opts.checkVoiceStaff) {
    errors.push(...validateVoiceStaff(measure, context.staves, location));
  }

  return errors;
}

/**
 * Get the validation context for a measure by traversing previous attributes.
 * This collects divisions, time, and staves from measure 0 to the target measure.
 */
export function getMeasureContext(
  score: Score,
  partIndex: number,
  measureIndex: number
): MeasureValidationContext {
  const part = score.parts[partIndex];
  if (!part) {
    throw new Error(`Part index ${partIndex} out of bounds`);
  }

  let divisions = 1;
  let time: TimeSignature | undefined;
  let staves = 1;

  // Traverse from start to the target measure to collect current state
  for (let i = 0; i <= measureIndex && i < part.measures.length; i++) {
    const measure = part.measures[i];
    if (measure.attributes) {
      if (measure.attributes.divisions !== undefined) {
        divisions = measure.attributes.divisions;
      }
      if (measure.attributes.time !== undefined) {
        time = measure.attributes.time;
      }
      if (measure.attributes.staves !== undefined) {
        staves = measure.attributes.staves;
      }
    }

    // Also check for mid-measure attribute changes
    for (const entry of measure.entries) {
      if (entry.type === 'attributes') {
        if (entry.attributes.divisions !== undefined) {
          divisions = entry.attributes.divisions;
        }
        if (entry.attributes.time !== undefined) {
          time = entry.attributes.time;
        }
        if (entry.attributes.staves !== undefined) {
          staves = entry.attributes.staves;
        }
      }
    }
  }

  return {
    divisions,
    time,
    staves,
    partIndex,
    partId: part.id,
    measureIndex,
  };
}

/**
 * Validate a measure after an operation, throwing if invalid.
 * Convenience wrapper around validateMeasureLocal.
 */
export function assertMeasureValid(
  score: Score,
  partIndex: number,
  measureIndex: number,
  options?: LocalValidateOptions
): void {
  const part = score.parts[partIndex];
  if (!part) {
    throw new Error(`Part index ${partIndex} out of bounds`);
  }

  const measure = part.measures[measureIndex];
  if (!measure) {
    throw new Error(`Measure index ${measureIndex} out of bounds`);
  }

  const context = getMeasureContext(score, partIndex, measureIndex);
  const errors = validateMeasureLocal(measure, context, options);

  const criticalErrors = errors.filter(e => e.level === 'error');
  if (criticalErrors.length > 0) {
    const errorMessages = criticalErrors
      .map(e => `[${e.code}] ${e.message}`)
      .join('\n');
    throw new ValidationException(criticalErrors, errorMessages);
  }
}

// ============================================================
// Convenience Functions
// ============================================================

/**
 * Check if a score is valid (no errors)
 */
export function isValid(score: Score, options?: ValidateOptions): boolean {
  return validate(score, options).valid;
}

/**
 * Validate and throw if invalid
 */
export function assertValid(score: Score, options?: ValidateOptions): void {
  const result = validate(score, options);
  if (!result.valid) {
    const errorMessages = result.errors.map(e =>
      `[${e.code}] ${e.message} at ${formatLocation(e.location)}`
    ).join('\n');
    throw new ValidationException(result.errors, errorMessages);
  }
}

/**
 * Format a validation location for display
 */
export function formatLocation(location: ValidationLocation): string {
  const parts: string[] = [];

  if (location.partId !== undefined) {
    parts.push(`part=${location.partId}`);
  } else if (location.partIndex !== undefined) {
    parts.push(`part[${location.partIndex}]`);
  }

  if (location.measureNumber !== undefined) {
    parts.push(`measure=${location.measureNumber}`);
  } else if (location.measureIndex !== undefined) {
    parts.push(`measure[${location.measureIndex}]`);
  }

  if (location.entryIndex !== undefined) {
    parts.push(`entry[${location.entryIndex}]`);
  }

  if (location.voice !== undefined) {
    parts.push(`voice=${location.voice}`);
  }

  if (location.staff !== undefined) {
    parts.push(`staff=${location.staff}`);
  }

  return parts.join(', ');
}

/**
 * Validation exception with structured error information
 */
export class ValidationException extends Error {
  constructor(
    public readonly errors: ValidationError[],
    message: string
  ) {
    super(message);
    this.name = 'ValidationException';
  }
}

// ============================================================
// Cross-Measure Validators (for future use)
// ============================================================

/**
 * Validate ties across measures
 * This is more complex as ties can span multiple measures
 */
export function validateTiesAcrossMeasures(part: Part): ValidationError[] {
  const errors: ValidationError[] = [];

  // Track open ties by pitch across all measures
  const openTies = new Map<string, { measureIndex: number; entryIndex: number; pitch: Pitch }>();

  for (let measureIndex = 0; measureIndex < part.measures.length; measureIndex++) {
    const measure = part.measures[measureIndex];

    for (let entryIndex = 0; entryIndex < measure.entries.length; entryIndex++) {
      const entry = measure.entries[entryIndex];
      if (entry.type !== 'note' || !entry.pitch) continue;

      const pitchKey = `${entry.pitch.step}${entry.pitch.octave}${entry.pitch.alter ?? 0}-${entry.voice}-${entry.staff ?? 1}`;
      const ties = entry.ties ?? (entry.tie ? [entry.tie] : []);

      for (const tie of ties) {
        if (tie.type === 'start') {
          openTies.set(pitchKey, { measureIndex, entryIndex, pitch: entry.pitch });
        } else if (tie.type === 'stop') {
          if (!openTies.has(pitchKey)) {
            errors.push({
              code: 'TIE_STOP_WITHOUT_START',
              level: 'error',
              message: `Tie stop without matching start for ${entry.pitch.step}${entry.pitch.octave}`,
              location: {
                measureIndex,
                measureNumber: measure.number,
                entryIndex,
                voice: entry.voice,
                staff: entry.staff ?? 1,
              },
              details: { pitch: entry.pitch },
            });
          } else {
            openTies.delete(pitchKey);
          }
        }
      }
    }
  }

  // Report unclosed ties at end of part
  for (const [, { measureIndex, entryIndex, pitch }] of openTies.entries()) {
    const measure = part.measures[measureIndex];
    errors.push({
      code: 'TIE_START_WITHOUT_STOP',
      level: 'warning',
      message: `Tie started for ${pitch.step}${pitch.octave} but never stopped`,
      location: {
        measureIndex,
        measureNumber: measure.number,
        entryIndex,
      },
      details: { pitch },
    });
  }

  return errors;
}

/**
 * Validate slurs across measures
 */
export function validateSlursAcrossMeasures(part: Part): ValidationError[] {
  const errors: ValidationError[] = [];

  // Track open slurs across all measures
  const openSlurs = new Map<string, { measureIndex: number; entryIndex: number }>();

  for (let measureIndex = 0; measureIndex < part.measures.length; measureIndex++) {
    const measure = part.measures[measureIndex];

    for (let entryIndex = 0; entryIndex < measure.entries.length; entryIndex++) {
      const entry = measure.entries[entryIndex];
      if (entry.type !== 'note' || !entry.notations) continue;

      for (const notation of entry.notations) {
        if (notation.type !== 'slur') continue;

        const slurNumber = notation.number ?? 1;
        const slurKey = `${slurNumber}-${entry.voice}-${entry.staff ?? 1}`;

        if (notation.slurType === 'start') {
          openSlurs.set(slurKey, { measureIndex, entryIndex });
        } else if (notation.slurType === 'stop') {
          if (!openSlurs.has(slurKey)) {
            errors.push({
              code: 'SLUR_STOP_WITHOUT_START',
              level: 'error',
              message: `Slur ${slurNumber} stop without matching start`,
              location: {
                measureIndex,
                measureNumber: measure.number,
                entryIndex,
                voice: entry.voice,
                staff: entry.staff ?? 1,
              },
              details: { slurNumber },
            });
          } else {
            openSlurs.delete(slurKey);
          }
        }
      }
    }
  }

  // Report unclosed slurs at end of part
  for (const [slurKey, { measureIndex, entryIndex }] of openSlurs.entries()) {
    const [slurNumber, voice, staff] = slurKey.split('-').map(Number);
    const measure = part.measures[measureIndex];
    errors.push({
      code: 'SLUR_START_WITHOUT_STOP',
      level: 'warning',
      message: `Slur ${slurNumber} started but never stopped`,
      location: {
        measureIndex,
        measureNumber: measure.number,
        entryIndex,
        voice,
        staff,
      },
      details: { slurNumber },
    });
  }

  return errors;
}
