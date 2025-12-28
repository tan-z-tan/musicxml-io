import type {
  Score,
  Measure,
  NoteEntry,
  Pitch,
  KeySignature,
  TimeSignature,
  Part,
  PartInfo,
  Clef,
} from '../types';
import { STEPS, STEP_SEMITONES, getMeasureEndPosition } from '../utils';
import {
  validate,
  validateMeasureLocal,
  getMeasureContext,
  type ValidationError,
  type LocalValidateOptions,
} from '../validator';

// ============================================================
// Result Type
// ============================================================

/**
 * Operation result type - success with data or failure with errors
 */
export type OperationResult<T> =
  | { success: true; data: T; warnings?: ValidationError[] }
  | { success: false; errors: ValidationError[] };

/**
 * Helper to create a success result
 */
function success<T>(data: T, warnings?: ValidationError[]): OperationResult<T> {
  return { success: true, data, warnings };
}

/**
 * Helper to create a failure result
 */
function failure<T>(errors: ValidationError[]): OperationResult<T> {
  return { success: false, errors };
}

/**
 * Deep clone a score
 */
function cloneScore(score: Score): Score {
  return JSON.parse(JSON.stringify(score));
}

/**
 * Transpose a pitch by a number of semitones
 */
function transposePitch(pitch: Pitch, semitones: number): Pitch {
  const currentSemitone = STEP_SEMITONES[pitch.step] + (pitch.alter ?? 0) + pitch.octave * 12;
  const targetSemitone = currentSemitone + semitones;

  const targetOctave = Math.floor(targetSemitone / 12);
  const targetPitchClass = ((targetSemitone % 12) + 12) % 12;

  // Find the closest natural step with smallest alteration
  let bestStep: Pitch['step'] = 'C';
  let bestAlter = 99; // Start with large value so any real alter is smaller

  for (const step of STEPS) {
    const stepSemitone = STEP_SEMITONES[step];
    // Calculate the alteration needed to reach target from this step
    let diff = targetPitchClass - stepSemitone;

    // Normalize to range -6 to +6 for smallest alteration
    if (diff > 6) diff -= 12;
    if (diff < -6) diff += 12;

    // Only consider alterations within -2 to +2 (double flat to double sharp)
    if (diff >= -2 && diff <= 2) {
      if (Math.abs(diff) < Math.abs(bestAlter)) {
        bestStep = step;
        bestAlter = diff;
      }
    }
  }

  return {
    step: bestStep,
    octave: targetOctave,
    alter: bestAlter !== 0 ? bestAlter : undefined,
  };
}

/**
 * Transpose all notes in a score by a number of semitones
 */
export function transpose(score: Score, semitones: number): Score {
  if (semitones === 0) return score;

  const result = cloneScore(score);

  for (const part of result.parts) {
    for (const measure of part.measures) {
      for (const entry of measure.entries) {
        if (entry.type === 'note' && entry.pitch) {
          entry.pitch = transposePitch(entry.pitch, semitones);
        }
      }
    }
  }

  return result;
}

/**
 * Options for adding a note
 */
export interface AddNoteOptions {
  partIndex: number;
  measureIndex: number;
  staff?: number;
  voice: number;
  position: number;
  note: Omit<NoteEntry, 'type' | 'voice' | 'staff'>;
}

/**
 * Add a note to a measure
 * Automatically handles backup/forward insertion
 */
export function addNote(score: Score, options: AddNoteOptions): Score {
  const result = cloneScore(score);
  const part = result.parts[options.partIndex];
  if (!part) return result;

  const measure = part.measures[options.measureIndex];
  if (!measure) return result;

  const newNote: NoteEntry = {
    type: 'note',
    voice: options.voice,
    staff: options.staff,
    ...options.note,
  };

  // Find the current position at the end of the measure using shared utility
  const currentPosition = getMeasureEndPosition(measure);

  // Calculate backup/forward needed
  const positionDiff = options.position - currentPosition;

  if (positionDiff < 0) {
    // Need to backup
    measure.entries.push({
      type: 'backup',
      duration: -positionDiff,
    });
  } else if (positionDiff > 0) {
    // Need to forward
    measure.entries.push({
      type: 'forward',
      duration: positionDiff,
      voice: options.voice,
      staff: options.staff,
    });
  }

  measure.entries.push(newNote);

  return result;
}

/**
 * Delete a note from a measure
 */
export function deleteNote(score: Score, options: {
  partIndex: number;
  measureIndex: number;
  noteIndex: number;
}): Score {
  const result = cloneScore(score);
  const part = result.parts[options.partIndex];
  if (!part) return result;

  const measure = part.measures[options.measureIndex];
  if (!measure) return result;

  // Find the note by counting only notes
  let noteCount = 0;
  let entryIndex = -1;

  for (let i = 0; i < measure.entries.length; i++) {
    if (measure.entries[i].type === 'note') {
      if (noteCount === options.noteIndex) {
        entryIndex = i;
        break;
      }
      noteCount++;
    }
  }

  if (entryIndex !== -1) {
    measure.entries.splice(entryIndex, 1);
  }

  return result;
}

/**
 * Change key signature from a specific measure
 */
export function changeKey(
  score: Score,
  key: KeySignature,
  options: { fromMeasure: string | number }
): Score {
  const result = cloneScore(score);
  const targetMeasure = String(options.fromMeasure);

  for (const part of result.parts) {
    for (const measure of part.measures) {
      if (measure.number === targetMeasure) {
        if (!measure.attributes) {
          measure.attributes = {};
        }
        measure.attributes.key = key;
      }
    }
  }

  return result;
}

/**
 * Change time signature from a specific measure
 */
export function changeTime(
  score: Score,
  time: TimeSignature,
  options: { fromMeasure: string | number }
): Score {
  const result = cloneScore(score);
  const targetMeasure = String(options.fromMeasure);

  for (const part of result.parts) {
    for (const measure of part.measures) {
      if (measure.number === targetMeasure) {
        if (!measure.attributes) {
          measure.attributes = {};
        }
        measure.attributes.time = time;
      }
    }
  }

  return result;
}

/**
 * Insert a new measure after a specific measure number
 */
export function insertMeasure(
  score: Score,
  options: {
    afterMeasure: string | number;
    copyAttributes?: boolean;
  }
): Score {
  const result = cloneScore(score);
  const targetMeasure = String(options.afterMeasure);

  for (const part of result.parts) {
    const insertIndex = part.measures.findIndex((m) => m.number === targetMeasure);
    if (insertIndex === -1) continue;

    // Parse target measure number and increment for new measure
    const numericPart = parseInt(targetMeasure, 10);
    const newMeasureNumber = String(isNaN(numericPart) ? insertIndex + 2 : numericPart + 1);

    // Create new empty measure
    const newMeasure: Measure = {
      number: newMeasureNumber,
      entries: [],
    };

    // Copy attributes if requested
    if (options.copyAttributes) {
      const sourceMeasure = part.measures[insertIndex];
      if (sourceMeasure.attributes) {
        newMeasure.attributes = { ...sourceMeasure.attributes };
      }
    }

    // Insert the new measure
    part.measures.splice(insertIndex + 1, 0, newMeasure);

    // Update measure numbers for subsequent measures
    for (let i = insertIndex + 2; i < part.measures.length; i++) {
      const currentNum = parseInt(part.measures[i].number, 10);
      if (!isNaN(currentNum)) {
        part.measures[i].number = String(currentNum + 1);
      }
    }
  }

  return result;
}

/**
 * Delete a measure
 */
export function deleteMeasure(score: Score, measureNumber: string | number): Score {
  const result = cloneScore(score);
  const targetMeasure = String(measureNumber);

  for (const part of result.parts) {
    const deleteIndex = part.measures.findIndex((m) => m.number === targetMeasure);
    if (deleteIndex === -1) continue;

    // Remove the measure
    part.measures.splice(deleteIndex, 1);

    // Update measure numbers for subsequent measures
    for (let i = deleteIndex; i < part.measures.length; i++) {
      const currentNum = parseInt(part.measures[i].number, 10);
      if (!isNaN(currentNum)) {
        part.measures[i].number = String(currentNum - 1);
      }
    }
  }

  return result;
}

/**
 * Set divisions for a measure
 */
export function setDivisions(
  score: Score,
  options: {
    partIndex: number;
    measureIndex: number;
    divisions: number;
  }
): Score {
  const result = cloneScore(score);
  const part = result.parts[options.partIndex];
  if (!part) return result;

  const measure = part.measures[options.measureIndex];
  if (!measure) return result;

  if (!measure.attributes) {
    measure.attributes = {};
  }
  measure.attributes.divisions = options.divisions;

  return result;
}

/**
 * Add a chord note (note that sounds simultaneously with the previous note)
 */
export function addChordNote(
  score: Score,
  options: {
    partIndex: number;
    measureIndex: number;
    afterNoteIndex: number;
    pitch: Pitch;
  }
): Score {
  const result = cloneScore(score);
  const part = result.parts[options.partIndex];
  if (!part) return result;

  const measure = part.measures[options.measureIndex];
  if (!measure) return result;

  // Find the note by counting only notes
  let noteCount = 0;
  let entryIndex = -1;
  let targetNote: NoteEntry | null = null;

  for (let i = 0; i < measure.entries.length; i++) {
    const entry = measure.entries[i];
    if (entry.type === 'note') {
      if (noteCount === options.afterNoteIndex) {
        entryIndex = i;
        targetNote = entry;
        break;
      }
      noteCount++;
    }
  }

  if (entryIndex !== -1 && targetNote) {
    const chordNote: NoteEntry = {
      type: 'note',
      pitch: options.pitch,
      duration: targetNote.duration,
      voice: targetNote.voice,
      staff: targetNote.staff,
      chord: true,
      noteType: targetNote.noteType,
      dots: targetNote.dots,
    };

    measure.entries.splice(entryIndex + 1, 0, chordNote);
  }

  return result;
}

/**
 * Modify a note's pitch
 */
export function modifyNotePitch(
  score: Score,
  options: {
    partIndex: number;
    measureIndex: number;
    noteIndex: number;
    pitch: Pitch;
  }
): Score {
  const result = cloneScore(score);
  const part = result.parts[options.partIndex];
  if (!part) return result;

  const measure = part.measures[options.measureIndex];
  if (!measure) return result;

  // Find the note by counting only notes
  let noteCount = 0;

  for (const entry of measure.entries) {
    if (entry.type === 'note') {
      if (noteCount === options.noteIndex) {
        entry.pitch = options.pitch;
        break;
      }
      noteCount++;
    }
  }

  return result;
}

/**
 * Modify a note's duration
 */
export function modifyNoteDuration(
  score: Score,
  options: {
    partIndex: number;
    measureIndex: number;
    noteIndex: number;
    duration: number;
    noteType?: NoteEntry['noteType'];
    dots?: number;
  }
): Score {
  const result = cloneScore(score);
  const part = result.parts[options.partIndex];
  if (!part) return result;

  const measure = part.measures[options.measureIndex];
  if (!measure) return result;

  // Find the note by counting only notes
  let noteCount = 0;

  for (const entry of measure.entries) {
    if (entry.type === 'note') {
      if (noteCount === options.noteIndex) {
        entry.duration = options.duration;
        if (options.noteType !== undefined) {
          entry.noteType = options.noteType;
        }
        if (options.dots !== undefined) {
          entry.dots = options.dots;
        }
        break;
      }
      noteCount++;
    }
  }

  return result;
}

// ============================================================
// Validated Note Operations
// ============================================================

/**
 * Add a note with validation - ensures the resulting score is musically valid
 */
export function addNoteChecked(
  score: Score,
  options: AddNoteOptions
): OperationResult<Score> {
  // Validate input
  if (options.partIndex < 0 || options.partIndex >= score.parts.length) {
    return failure([{
      code: 'PART_ID_NOT_IN_PART_LIST',
      level: 'error',
      message: `Part index ${options.partIndex} out of bounds (0-${score.parts.length - 1})`,
      location: { partIndex: options.partIndex },
    }]);
  }

  const part = score.parts[options.partIndex];
  if (options.measureIndex < 0 || options.measureIndex >= part.measures.length) {
    return failure([{
      code: 'INVALID_DURATION',
      level: 'error',
      message: `Measure index ${options.measureIndex} out of bounds (0-${part.measures.length - 1})`,
      location: { partIndex: options.partIndex, measureIndex: options.measureIndex },
    }]);
  }

  // Apply the operation
  const result = addNote(score, options);

  // Validate the affected measure
  const context = getMeasureContext(result, options.partIndex, options.measureIndex);
  const measure = result.parts[options.partIndex].measures[options.measureIndex];

  const validationOpts: LocalValidateOptions = {
    checkMeasureDuration: true,
    checkPosition: true,
    checkVoiceStaff: true,
    checkBeams: false,
    checkTuplets: false,
  };

  const errors = validateMeasureLocal(measure, context, validationOpts);
  const criticalErrors = errors.filter(e => e.level === 'error');
  const warnings = errors.filter(e => e.level === 'warning' || e.level === 'info');

  if (criticalErrors.length > 0) {
    return failure(criticalErrors);
  }

  return success(result, warnings.length > 0 ? warnings : undefined);
}

/**
 * Delete a note with validation
 */
export function deleteNoteChecked(
  score: Score,
  options: {
    partIndex: number;
    measureIndex: number;
    noteIndex: number;
  }
): OperationResult<Score> {
  // Validate input bounds
  if (options.partIndex < 0 || options.partIndex >= score.parts.length) {
    return failure([{
      code: 'PART_ID_NOT_IN_PART_LIST',
      level: 'error',
      message: `Part index ${options.partIndex} out of bounds`,
      location: { partIndex: options.partIndex },
    }]);
  }

  const part = score.parts[options.partIndex];
  if (options.measureIndex < 0 || options.measureIndex >= part.measures.length) {
    return failure([{
      code: 'INVALID_DURATION',
      level: 'error',
      message: `Measure index ${options.measureIndex} out of bounds`,
      location: { partIndex: options.partIndex, measureIndex: options.measureIndex },
    }]);
  }

  // Apply the operation
  const result = deleteNote(score, options);

  // Validate the affected measure
  const context = getMeasureContext(result, options.partIndex, options.measureIndex);
  const measure = result.parts[options.partIndex].measures[options.measureIndex];

  const validationOpts: LocalValidateOptions = {
    checkMeasureDuration: true,
    checkPosition: true,
    checkVoiceStaff: true,
    checkBeams: true,
    checkTuplets: true,
  };

  const errors = validateMeasureLocal(measure, context, validationOpts);
  const criticalErrors = errors.filter(e => e.level === 'error');
  const warnings = errors.filter(e => e.level === 'warning' || e.level === 'info');

  if (criticalErrors.length > 0) {
    return failure(criticalErrors);
  }

  return success(result, warnings.length > 0 ? warnings : undefined);
}

/**
 * Modify a note's pitch with validation
 */
export function modifyNotePitchChecked(
  score: Score,
  options: {
    partIndex: number;
    measureIndex: number;
    noteIndex: number;
    pitch: Pitch;
  }
): OperationResult<Score> {
  // Validate input bounds
  if (options.partIndex < 0 || options.partIndex >= score.parts.length) {
    return failure([{
      code: 'PART_ID_NOT_IN_PART_LIST',
      level: 'error',
      message: `Part index ${options.partIndex} out of bounds`,
      location: { partIndex: options.partIndex },
    }]);
  }

  const part = score.parts[options.partIndex];
  if (options.measureIndex < 0 || options.measureIndex >= part.measures.length) {
    return failure([{
      code: 'INVALID_DURATION',
      level: 'error',
      message: `Measure index ${options.measureIndex} out of bounds`,
      location: { partIndex: options.partIndex, measureIndex: options.measureIndex },
    }]);
  }

  // Pitch modification doesn't affect duration, so no validation needed after
  const result = modifyNotePitch(score, options);
  return success(result);
}

/**
 * Modify a note's duration with validation
 */
export function modifyNoteDurationChecked(
  score: Score,
  options: {
    partIndex: number;
    measureIndex: number;
    noteIndex: number;
    duration: number;
    noteType?: NoteEntry['noteType'];
    dots?: number;
  }
): OperationResult<Score> {
  // Validate input bounds
  if (options.partIndex < 0 || options.partIndex >= score.parts.length) {
    return failure([{
      code: 'PART_ID_NOT_IN_PART_LIST',
      level: 'error',
      message: `Part index ${options.partIndex} out of bounds`,
      location: { partIndex: options.partIndex },
    }]);
  }

  const part = score.parts[options.partIndex];
  if (options.measureIndex < 0 || options.measureIndex >= part.measures.length) {
    return failure([{
      code: 'INVALID_DURATION',
      level: 'error',
      message: `Measure index ${options.measureIndex} out of bounds`,
      location: { partIndex: options.partIndex, measureIndex: options.measureIndex },
    }]);
  }

  if (options.duration < 0) {
    return failure([{
      code: 'INVALID_DURATION',
      level: 'error',
      message: `Invalid duration: ${options.duration}. Must be non-negative.`,
      location: { partIndex: options.partIndex, measureIndex: options.measureIndex },
      details: { duration: options.duration },
    }]);
  }

  // Apply the operation
  const result = modifyNoteDuration(score, options);

  // Validate the affected measure (duration affects measure timing)
  const context = getMeasureContext(result, options.partIndex, options.measureIndex);
  const measure = result.parts[options.partIndex].measures[options.measureIndex];

  const validationOpts: LocalValidateOptions = {
    checkMeasureDuration: true,
    checkPosition: true,
    checkVoiceStaff: false,
    checkBeams: false,
    checkTuplets: false,
  };

  const errors = validateMeasureLocal(measure, context, validationOpts);
  const criticalErrors = errors.filter(e => e.level === 'error');
  const warnings = errors.filter(e => e.level === 'warning' || e.level === 'info');

  if (criticalErrors.length > 0) {
    return failure(criticalErrors);
  }

  return success(result, warnings.length > 0 ? warnings : undefined);
}

/**
 * Add a chord note with validation
 */
export function addChordNoteChecked(
  score: Score,
  options: {
    partIndex: number;
    measureIndex: number;
    afterNoteIndex: number;
    pitch: Pitch;
  }
): OperationResult<Score> {
  // Validate input bounds
  if (options.partIndex < 0 || options.partIndex >= score.parts.length) {
    return failure([{
      code: 'PART_ID_NOT_IN_PART_LIST',
      level: 'error',
      message: `Part index ${options.partIndex} out of bounds`,
      location: { partIndex: options.partIndex },
    }]);
  }

  const part = score.parts[options.partIndex];
  if (options.measureIndex < 0 || options.measureIndex >= part.measures.length) {
    return failure([{
      code: 'INVALID_DURATION',
      level: 'error',
      message: `Measure index ${options.measureIndex} out of bounds`,
      location: { partIndex: options.partIndex, measureIndex: options.measureIndex },
    }]);
  }

  // Apply the operation
  const result = addChordNote(score, options);

  // Chord notes don't affect duration/position, minimal validation needed
  return success(result);
}

/**
 * Transpose all notes with validation
 */
export function transposeChecked(
  score: Score,
  semitones: number
): OperationResult<Score> {
  if (semitones === 0) {
    return success(score);
  }

  const result = transpose(score, semitones);

  // Transposition doesn't affect musical structure, just pitches
  // No validation needed
  return success(result);
}

// ============================================================
// Part Operations
// ============================================================

/**
 * Options for adding a new part
 */
export interface AddPartOptions {
  /** Unique part ID (e.g., "P2") */
  id: string;
  /** Part name (e.g., "Violin") */
  name?: string;
  /** Part abbreviation (e.g., "Vln.") */
  abbreviation?: string;
  /** Insert position (default: end) */
  insertIndex?: number;
  /** Initial time signature */
  time?: TimeSignature;
  /** Initial key signature */
  key?: KeySignature;
  /** Initial clef */
  clef?: Clef;
  /** Initial divisions */
  divisions?: number;
}

/**
 * Add a new part to the score
 */
export function addPart(
  score: Score,
  options: AddPartOptions
): OperationResult<Score> {
  // Check for duplicate ID
  const existingPart = score.parts.find(p => p.id === options.id);
  if (existingPart) {
    return failure([{
      code: 'DUPLICATE_PART_ID',
      level: 'error',
      message: `Part ID "${options.id}" already exists`,
      location: { partId: options.id },
    }]);
  }

  const existingPartInfo = score.partList.find(
    e => e.type === 'score-part' && e.id === options.id
  );
  if (existingPartInfo) {
    return failure([{
      code: 'DUPLICATE_PART_ID',
      level: 'error',
      message: `Part ID "${options.id}" already exists in partList`,
      location: { partId: options.id },
    }]);
  }

  const result = cloneScore(score);

  // Determine insert position
  const insertIndex = options.insertIndex ?? result.parts.length;

  // Create PartInfo for partList
  const partInfo: PartInfo = {
    type: 'score-part',
    id: options.id,
    name: options.name,
    abbreviation: options.abbreviation,
  };

  // Find the correct position in partList (after part-groups are considered)
  // For simplicity, insert at end of score-parts
  let partListInsertIndex = result.partList.length;
  for (let i = 0; i < result.partList.length; i++) {
    if (result.partList[i].type === 'score-part') {
      // Count how many parts come before our target insert index
      let partCount = 0;
      for (let j = 0; j <= i; j++) {
        if (result.partList[j].type === 'score-part') {
          partCount++;
        }
      }
      if (partCount > insertIndex) {
        partListInsertIndex = i;
        break;
      }
    }
  }

  result.partList.splice(partListInsertIndex, 0, partInfo);

  // Create new Part with measures matching other parts
  const measureCount = result.parts.length > 0 ? result.parts[0].measures.length : 1;

  const newPart: Part = {
    id: options.id,
    measures: [],
  };

  // Create empty measures (or with initial attributes)
  for (let i = 0; i < measureCount; i++) {
    const measureNumber = result.parts.length > 0
      ? result.parts[0].measures[i]?.number ?? String(i + 1)
      : String(i + 1);

    const measure: Measure = {
      number: measureNumber,
      entries: [],
    };

    // Add attributes to first measure
    if (i === 0) {
      measure.attributes = {
        divisions: options.divisions ?? 4,
        time: options.time ?? { beats: '4', beatType: 4 },
        key: options.key ?? { fifths: 0 },
        clef: options.clef ? [options.clef] : [{ sign: 'G', line: 2 }],
      };
    }

    newPart.measures.push(measure);
  }

  result.parts.splice(insertIndex, 0, newPart);

  // Validate the result
  const validationResult = validate(result, {
    checkPartReferences: true,
    checkPartStructure: true,
    checkDivisions: false,
    checkMeasureDuration: false,
    checkPosition: false,
    checkTies: false,
    checkBeams: false,
    checkSlurs: false,
    checkTuplets: false,
    checkVoiceStaff: false,
    checkStaffStructure: false,
  });

  if (!validationResult.valid) {
    return failure(validationResult.errors);
  }

  return success(result, validationResult.warnings.length > 0 ? validationResult.warnings : undefined);
}

/**
 * Remove a part from the score
 */
export function removePart(
  score: Score,
  partId: string
): OperationResult<Score> {
  const partIndex = score.parts.findIndex(p => p.id === partId);
  if (partIndex === -1) {
    return failure([{
      code: 'PART_ID_NOT_IN_PART_LIST',
      level: 'error',
      message: `Part "${partId}" not found`,
      location: { partId },
    }]);
  }

  // Must have at least one part
  if (score.parts.length <= 1) {
    return failure([{
      code: 'PART_MEASURE_COUNT_MISMATCH',
      level: 'error',
      message: 'Cannot remove the only remaining part',
      location: { partId },
    }]);
  }

  const result = cloneScore(score);

  // Remove from parts
  result.parts.splice(partIndex, 1);

  // Remove from partList
  const partListIndex = result.partList.findIndex(
    e => e.type === 'score-part' && e.id === partId
  );
  if (partListIndex !== -1) {
    result.partList.splice(partListIndex, 1);
  }

  // Validate
  const validationResult = validate(result, {
    checkPartReferences: true,
    checkPartStructure: true,
    checkDivisions: false,
    checkMeasureDuration: false,
    checkPosition: false,
    checkTies: false,
    checkBeams: false,
    checkSlurs: false,
    checkTuplets: false,
    checkVoiceStaff: false,
    checkStaffStructure: false,
  });

  if (!validationResult.valid) {
    return failure(validationResult.errors);
  }

  return success(result);
}

/**
 * Duplicate an existing part
 */
export function duplicatePart(
  score: Score,
  options: {
    sourcePartId: string;
    newPartId: string;
    newPartName?: string;
  }
): OperationResult<Score> {
  const sourceIndex = score.parts.findIndex(p => p.id === options.sourcePartId);
  if (sourceIndex === -1) {
    return failure([{
      code: 'PART_ID_NOT_IN_PART_LIST',
      level: 'error',
      message: `Source part "${options.sourcePartId}" not found`,
      location: { partId: options.sourcePartId },
    }]);
  }

  // Check for duplicate new ID
  if (score.parts.find(p => p.id === options.newPartId)) {
    return failure([{
      code: 'DUPLICATE_PART_ID',
      level: 'error',
      message: `Part ID "${options.newPartId}" already exists`,
      location: { partId: options.newPartId },
    }]);
  }

  const result = cloneScore(score);

  // Clone the source part
  const sourcePart = result.parts[sourceIndex];
  const newPart: Part = JSON.parse(JSON.stringify(sourcePart));
  newPart.id = options.newPartId;

  // Find source part info
  const sourcePartInfo = result.partList.find(
    e => e.type === 'score-part' && e.id === options.sourcePartId
  ) as PartInfo | undefined;

  // Create new part info
  const newPartInfo: PartInfo = {
    type: 'score-part',
    id: options.newPartId,
    name: options.newPartName ?? sourcePartInfo?.name,
    abbreviation: sourcePartInfo?.abbreviation,
  };

  // Insert after source part
  result.parts.splice(sourceIndex + 1, 0, newPart);

  // Insert in partList after source
  const partListSourceIndex = result.partList.findIndex(
    e => e.type === 'score-part' && e.id === options.sourcePartId
  );
  if (partListSourceIndex !== -1) {
    result.partList.splice(partListSourceIndex + 1, 0, newPartInfo);
  } else {
    result.partList.push(newPartInfo);
  }

  // Validate
  const validationResult = validate(result, {
    checkPartReferences: true,
    checkPartStructure: true,
    checkDivisions: false,
    checkMeasureDuration: false,
    checkPosition: false,
    checkTies: false,
    checkBeams: false,
    checkSlurs: false,
    checkTuplets: false,
    checkVoiceStaff: false,
    checkStaffStructure: false,
  });

  if (!validationResult.valid) {
    return failure(validationResult.errors);
  }

  return success(result);
}

// ============================================================
// Staff Operations
// ============================================================

/**
 * Set the number of staves for a part
 */
export function setStaves(
  score: Score,
  options: {
    partIndex: number;
    staves: number;
    clefs?: Clef[];
    fromMeasure?: number;
  }
): OperationResult<Score> {
  if (options.partIndex < 0 || options.partIndex >= score.parts.length) {
    return failure([{
      code: 'PART_ID_NOT_IN_PART_LIST',
      level: 'error',
      message: `Part index ${options.partIndex} out of bounds`,
      location: { partIndex: options.partIndex },
    }]);
  }

  if (options.staves < 1) {
    return failure([{
      code: 'INVALID_STAFF_NUMBER',
      level: 'error',
      message: `Invalid staves count: ${options.staves}. Must be at least 1.`,
      location: { partIndex: options.partIndex },
    }]);
  }

  const result = cloneScore(score);
  const part = result.parts[options.partIndex];
  const fromMeasureIndex = options.fromMeasure ?? 0;

  // Update staves in the specified measure
  const measure = part.measures[fromMeasureIndex];
  if (!measure) {
    return failure([{
      code: 'INVALID_DURATION',
      level: 'error',
      message: `Measure index ${fromMeasureIndex} out of bounds`,
      location: { partIndex: options.partIndex, measureIndex: fromMeasureIndex },
    }]);
  }

  if (!measure.attributes) {
    measure.attributes = {};
  }
  measure.attributes.staves = options.staves;

  // Set clefs if provided
  if (options.clefs) {
    measure.attributes.clef = options.clefs;
  } else if (!measure.attributes.clef || measure.attributes.clef.length < options.staves) {
    // Create default clefs for missing staves
    const existingClefs = measure.attributes.clef ?? [];
    const newClefs: Clef[] = [...existingClefs];

    for (let staff = existingClefs.length + 1; staff <= options.staves; staff++) {
      // Default: treble for staff 1, bass for staff 2, treble for others
      if (staff === 2) {
        newClefs.push({ sign: 'F', line: 4, staff });
      } else {
        newClefs.push({ sign: 'G', line: 2, staff });
      }
    }

    measure.attributes.clef = newClefs;
  }

  // Validate staff structure
  const validationResult = validate(result, {
    checkPartReferences: false,
    checkPartStructure: false,
    checkDivisions: false,
    checkMeasureDuration: false,
    checkPosition: false,
    checkTies: false,
    checkBeams: false,
    checkSlurs: false,
    checkTuplets: false,
    checkVoiceStaff: true,
    checkStaffStructure: true,
  });

  if (!validationResult.valid) {
    return failure(validationResult.errors);
  }

  return success(result, validationResult.warnings.length > 0 ? validationResult.warnings : undefined);
}

/**
 * Move a note to a different staff
 */
export function moveNoteToStaff(
  score: Score,
  options: {
    partIndex: number;
    measureIndex: number;
    noteIndex: number;
    targetStaff: number;
  }
): OperationResult<Score> {
  if (options.partIndex < 0 || options.partIndex >= score.parts.length) {
    return failure([{
      code: 'PART_ID_NOT_IN_PART_LIST',
      level: 'error',
      message: `Part index ${options.partIndex} out of bounds`,
      location: { partIndex: options.partIndex },
    }]);
  }

  const part = score.parts[options.partIndex];
  if (options.measureIndex < 0 || options.measureIndex >= part.measures.length) {
    return failure([{
      code: 'INVALID_DURATION',
      level: 'error',
      message: `Measure index ${options.measureIndex} out of bounds`,
      location: { partIndex: options.partIndex, measureIndex: options.measureIndex },
    }]);
  }

  if (options.targetStaff < 1) {
    return failure([{
      code: 'INVALID_STAFF_NUMBER',
      level: 'error',
      message: `Invalid target staff: ${options.targetStaff}. Must be at least 1.`,
      location: { partIndex: options.partIndex, measureIndex: options.measureIndex },
    }]);
  }

  const result = cloneScore(score);
  const measure = result.parts[options.partIndex].measures[options.measureIndex];

  // Find the note by index
  let noteCount = 0;
  let foundEntry: NoteEntry | null = null;

  for (const entry of measure.entries) {
    if (entry.type === 'note') {
      if (noteCount === options.noteIndex) {
        foundEntry = entry;
        break;
      }
      noteCount++;
    }
  }

  if (!foundEntry) {
    return failure([{
      code: 'INVALID_DURATION',
      level: 'error',
      message: `Note index ${options.noteIndex} not found`,
      location: { partIndex: options.partIndex, measureIndex: options.measureIndex },
    }]);
  }

  // Update the staff
  foundEntry.staff = options.targetStaff;

  // Validate
  const context = getMeasureContext(result, options.partIndex, options.measureIndex);
  const errors = validateMeasureLocal(measure, context, {
    checkMeasureDuration: false,
    checkPosition: false,
    checkVoiceStaff: true,
    checkBeams: false,
    checkTuplets: false,
  });

  const criticalErrors = errors.filter(e => e.level === 'error');
  if (criticalErrors.length > 0) {
    return failure(criticalErrors);
  }

  const warnings = errors.filter(e => e.level === 'warning' || e.level === 'info');
  return success(result, warnings.length > 0 ? warnings : undefined);
}

// ============================================================
// Re-export ValidationError type for consumers
// ============================================================
export type { ValidationError } from '../validator';
