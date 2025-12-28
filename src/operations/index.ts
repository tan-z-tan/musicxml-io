import type {
  Score,
  Measure,
  MeasureEntry,
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

// ============================================================
// Error Codes for Operations
// ============================================================

export type OperationErrorCode =
  | 'NOTE_CONFLICT'
  | 'EXCEEDS_MEASURE'
  | 'INVALID_POSITION'
  | 'NOTE_NOT_FOUND'
  | 'VOICE_NOT_FOUND'
  | 'PART_NOT_FOUND'
  | 'MEASURE_NOT_FOUND'
  | 'INVALID_DURATION'
  | 'INVALID_STAFF'
  | 'DUPLICATE_PART_ID';

function operationError(
  code: OperationErrorCode,
  message: string,
  location: ValidationError['location'] = {},
  details?: Record<string, unknown>
): ValidationError {
  return {
    code: code as ValidationError['code'],
    level: 'error',
    message,
    location,
    details,
  };
}

// ============================================================
// Internal Utilities
// ============================================================

function cloneScore(score: Score): Score {
  return JSON.parse(JSON.stringify(score));
}

/**
 * Calculate measure duration from time signature
 */
function getMeasureDuration(divisions: number, time: TimeSignature): number {
  const beats = parseInt(time.beats, 10);
  if (isNaN(beats)) return divisions * 4; // Default to 4/4
  return (beats / time.beatType) * 4 * divisions;
}

/**
 * Get entries for a specific voice in a measure, with their positions
 */
interface EntryWithPosition {
  entry: MeasureEntry;
  entryIndex: number;
  position: number;
  endPosition: number;
}

function getVoiceEntries(measure: Measure, voice: number, staff?: number): EntryWithPosition[] {
  const result: EntryWithPosition[] = [];
  let position = 0;

  for (let i = 0; i < measure.entries.length; i++) {
    const entry = measure.entries[i];

    if (entry.type === 'note') {
      const noteStaff = entry.staff ?? 1;
      if (entry.voice === voice && (staff === undefined || noteStaff === staff)) {
        if (!entry.chord) {
          result.push({
            entry,
            entryIndex: i,
            position,
            endPosition: position + entry.duration,
          });
          position += entry.duration;
        } else {
          // Chord notes share position with previous note
          if (result.length > 0) {
            const prev = result[result.length - 1];
            result.push({
              entry,
              entryIndex: i,
              position: prev.position,
              endPosition: prev.endPosition,
            });
          }
        }
      } else if (!entry.chord) {
        position += entry.duration;
      }
    } else if (entry.type === 'backup') {
      position -= entry.duration;
    } else if (entry.type === 'forward') {
      if (entry.voice === voice) {
        result.push({
          entry,
          entryIndex: i,
          position,
          endPosition: position + entry.duration,
        });
      }
      position += entry.duration;
    }
  }

  return result;
}

/**
 * Check if a time range has any notes (not rests/forwards)
 */
function hasNotesInRange(
  voiceEntries: EntryWithPosition[],
  startPos: number,
  endPos: number
): { hasNotes: boolean; conflictingNotes: EntryWithPosition[] } {
  const conflicting = voiceEntries.filter(e => {
    if (e.entry.type !== 'note') return false;
    const note = e.entry as NoteEntry;
    if (note.rest) return false; // Rests are OK
    // Check overlap
    return e.position < endPos && e.endPosition > startPos;
  });
  return { hasNotes: conflicting.length > 0, conflictingNotes: conflicting };
}

/**
 * Create a rest note entry
 */
function createRest(duration: number, voice: number, staff?: number): NoteEntry {
  return {
    type: 'note',
    rest: { displayStep: undefined, displayOctave: undefined },
    duration,
    voice,
    staff,
  };
}

/**
 * Rebuild measure entries for a voice with new content
 * This replaces the voice's content while preserving other voices
 */
function rebuildMeasureWithVoice(
  measure: Measure,
  voice: number,
  newEntries: Array<{ position: number; entry: NoteEntry }>,
  measureDuration: number,
  staff?: number
): MeasureEntry[] {
  // Get all entries not belonging to this voice
  const otherEntries: Array<{ position: number; entry: MeasureEntry }> = [];
  let position = 0;

  for (const entry of measure.entries) {
    if (entry.type === 'note') {
      if (entry.voice !== voice || (staff !== undefined && (entry.staff ?? 1) !== staff)) {
        if (!entry.chord) {
          otherEntries.push({ position, entry });
          position += entry.duration;
        } else {
          otherEntries.push({ position, entry });
        }
      } else if (!entry.chord) {
        position += entry.duration;
      }
    } else if (entry.type === 'backup') {
      position -= entry.duration;
    } else if (entry.type === 'forward') {
      if (entry.voice !== voice) {
        otherEntries.push({ position, entry });
      }
      position += entry.duration;
    } else {
      // Directions, harmonies, etc. - keep them
      otherEntries.push({ position, entry });
    }
  }

  // Fill gaps in new voice entries with rests
  const filledNewEntries: Array<{ position: number; entry: NoteEntry }> = [];
  let currentPos = 0;

  // Sort new entries by position
  const sortedNew = [...newEntries].sort((a, b) => a.position - b.position);

  for (const { position: notePos, entry } of sortedNew) {
    if (notePos > currentPos) {
      // Add rest to fill gap
      filledNewEntries.push({
        position: currentPos,
        entry: createRest(notePos - currentPos, voice, staff),
      });
    }
    filledNewEntries.push({ position: notePos, entry });
    if (!entry.chord) {
      currentPos = notePos + entry.duration;
    }
  }

  // Fill remaining with rest if needed
  if (currentPos < measureDuration) {
    filledNewEntries.push({
      position: currentPos,
      entry: createRest(measureDuration - currentPos, voice, staff),
    });
  }

  // Merge all entries and sort by position
  const allEntries = [...otherEntries, ...filledNewEntries];
  allEntries.sort((a, b) => a.position - b.position);

  // Build final entries array with backup/forward
  const result: MeasureEntry[] = [];
  let currentPosition = 0;

  for (const { position: targetPos, entry } of allEntries) {
    const diff = targetPos - currentPosition;

    if (diff < 0) {
      result.push({ type: 'backup', duration: -diff });
      currentPosition = targetPos;
    } else if (diff > 0) {
      result.push({
        type: 'forward',
        duration: diff,
        voice: entry.type === 'note' ? entry.voice : 1,
        staff: entry.type === 'note' ? entry.staff : undefined,
      });
      currentPosition = targetPos;
    }

    result.push(entry);

    if (entry.type === 'note' && !entry.chord) {
      currentPosition += entry.duration;
    } else if (entry.type === 'forward') {
      currentPosition += entry.duration;
    }
  }

  return result;
}

// ============================================================
// Note Operations (Piano Roll Semantics)
// ============================================================

export interface InsertNoteOptions {
  partIndex: number;
  measureIndex: number;
  voice: number;
  staff?: number;
  position: number;
  pitch: Pitch;
  duration: number;
  noteType?: NoteEntry['noteType'];
  dots?: number;
}

/**
 * Insert a note at the specified position in a voice.
 * - If the position has a rest, replaces it with the note
 * - If there's a conflicting note, returns NOTE_CONFLICT error
 * - If the note exceeds measure duration, returns EXCEEDS_MEASURE error
 */
export function insertNote(
  score: Score,
  options: InsertNoteOptions
): OperationResult<Score> {
  // Validate bounds
  if (options.partIndex < 0 || options.partIndex >= score.parts.length) {
    return failure([operationError('PART_NOT_FOUND', `Part index ${options.partIndex} out of bounds`, { partIndex: options.partIndex })]);
  }

  const part = score.parts[options.partIndex];
  if (options.measureIndex < 0 || options.measureIndex >= part.measures.length) {
    return failure([operationError('MEASURE_NOT_FOUND', `Measure index ${options.measureIndex} out of bounds`, { partIndex: options.partIndex, measureIndex: options.measureIndex })]);
  }

  if (options.duration <= 0) {
    return failure([operationError('INVALID_DURATION', `Duration must be positive`, { partIndex: options.partIndex, measureIndex: options.measureIndex })]);
  }

  if (options.position < 0) {
    return failure([operationError('INVALID_POSITION', `Position cannot be negative`, { partIndex: options.partIndex, measureIndex: options.measureIndex })]);
  }

  const result = cloneScore(score);
  const measure = result.parts[options.partIndex].measures[options.measureIndex];

  // Get context for measure duration
  const context = getMeasureContext(result, options.partIndex, options.measureIndex);
  const measureDuration = context.time
    ? getMeasureDuration(context.divisions, context.time)
    : context.divisions * 4;

  // Check if note exceeds measure
  const noteEnd = options.position + options.duration;
  if (noteEnd > measureDuration) {
    return failure([operationError(
      'EXCEEDS_MEASURE',
      `Note ending at ${noteEnd} exceeds measure duration ${measureDuration}`,
      { partIndex: options.partIndex, measureIndex: options.measureIndex },
      { noteEnd, measureDuration }
    )]);
  }

  // Get voice entries and check for conflicts
  const voiceEntries = getVoiceEntries(measure, options.voice, options.staff);
  const { hasNotes, conflictingNotes } = hasNotesInRange(voiceEntries, options.position, noteEnd);

  if (hasNotes) {
    return failure([operationError(
      'NOTE_CONFLICT',
      `Position ${options.position}-${noteEnd} conflicts with existing note(s)`,
      { partIndex: options.partIndex, measureIndex: options.measureIndex, voice: options.voice },
      { conflictingPositions: conflictingNotes.map(n => ({ start: n.position, end: n.endPosition })) }
    )]);
  }

  // Create new note
  const newNote: NoteEntry = {
    type: 'note',
    pitch: options.pitch,
    duration: options.duration,
    voice: options.voice,
    staff: options.staff,
    noteType: options.noteType,
    dots: options.dots,
  };

  // Get existing notes for this voice (excluding rests in the target range)
  const existingNotes = voiceEntries
    .filter(e => {
      if (e.entry.type !== 'note') return true;
      const note = e.entry as NoteEntry;
      if (note.rest) {
        // Exclude rests that overlap with our new note
        return !(e.position < noteEnd && e.endPosition > options.position);
      }
      return true;
    })
    .map(e => ({ position: e.position, entry: e.entry as NoteEntry }));

  // Add new note
  existingNotes.push({ position: options.position, entry: newNote });

  // Rebuild measure
  measure.entries = rebuildMeasureWithVoice(
    measure,
    options.voice,
    existingNotes,
    measureDuration,
    options.staff
  );

  // Validate
  const errors = validateMeasureLocal(measure, context, {
    checkMeasureDuration: true,
    checkPosition: true,
    checkVoiceStaff: true,
  });

  const criticalErrors = errors.filter(e => e.level === 'error');
  if (criticalErrors.length > 0) {
    return failure(criticalErrors);
  }

  return success(result, errors.filter(e => e.level !== 'error'));
}

/**
 * Remove a note and replace with rest
 */
export function removeNote(
  score: Score,
  options: {
    partIndex: number;
    measureIndex: number;
    noteIndex: number;
  }
): OperationResult<Score> {
  if (options.partIndex < 0 || options.partIndex >= score.parts.length) {
    return failure([operationError('PART_NOT_FOUND', `Part index ${options.partIndex} out of bounds`, { partIndex: options.partIndex })]);
  }

  const part = score.parts[options.partIndex];
  if (options.measureIndex < 0 || options.measureIndex >= part.measures.length) {
    return failure([operationError('MEASURE_NOT_FOUND', `Measure index ${options.measureIndex} out of bounds`, { partIndex: options.partIndex, measureIndex: options.measureIndex })]);
  }

  const result = cloneScore(score);
  const measure = result.parts[options.partIndex].measures[options.measureIndex];

  // Find the note
  let noteCount = 0;
  let targetEntry: NoteEntry | null = null;
  let targetIndex = -1;

  for (let i = 0; i < measure.entries.length; i++) {
    const entry = measure.entries[i];
    if (entry.type === 'note' && !entry.rest) {
      if (noteCount === options.noteIndex) {
        targetEntry = entry;
        targetIndex = i;
        break;
      }
      noteCount++;
    }
  }

  if (!targetEntry || targetIndex === -1) {
    return failure([operationError('NOTE_NOT_FOUND', `Note index ${options.noteIndex} not found`, { partIndex: options.partIndex, measureIndex: options.measureIndex })]);
  }

  // Replace with rest
  measure.entries[targetIndex] = createRest(
    targetEntry.duration,
    targetEntry.voice,
    targetEntry.staff
  );

  // Also remove any chord notes attached to this note
  let i = targetIndex + 1;
  while (i < measure.entries.length) {
    const entry = measure.entries[i];
    if (entry.type === 'note' && entry.chord) {
      measure.entries.splice(i, 1);
    } else {
      break;
    }
  }

  return success(result);
}

/**
 * Add a chord note to an existing note
 */
export function addChord(
  score: Score,
  options: {
    partIndex: number;
    measureIndex: number;
    noteIndex: number;
    pitch: Pitch;
  }
): OperationResult<Score> {
  if (options.partIndex < 0 || options.partIndex >= score.parts.length) {
    return failure([operationError('PART_NOT_FOUND', `Part index ${options.partIndex} out of bounds`, { partIndex: options.partIndex })]);
  }

  const part = score.parts[options.partIndex];
  if (options.measureIndex < 0 || options.measureIndex >= part.measures.length) {
    return failure([operationError('MEASURE_NOT_FOUND', `Measure index ${options.measureIndex} out of bounds`, { partIndex: options.partIndex, measureIndex: options.measureIndex })]);
  }

  const result = cloneScore(score);
  const measure = result.parts[options.partIndex].measures[options.measureIndex];

  // Find the note
  let noteCount = 0;
  let targetEntry: NoteEntry | null = null;
  let targetIndex = -1;

  for (let i = 0; i < measure.entries.length; i++) {
    const entry = measure.entries[i];
    if (entry.type === 'note' && !entry.rest && !entry.chord) {
      if (noteCount === options.noteIndex) {
        targetEntry = entry;
        targetIndex = i;
        break;
      }
      noteCount++;
    }
  }

  if (!targetEntry || targetIndex === -1) {
    return failure([operationError('NOTE_NOT_FOUND', `Note index ${options.noteIndex} not found`, { partIndex: options.partIndex, measureIndex: options.measureIndex })]);
  }

  // Create chord note
  const chordNote: NoteEntry = {
    type: 'note',
    pitch: options.pitch,
    duration: targetEntry.duration,
    voice: targetEntry.voice,
    staff: targetEntry.staff,
    chord: true,
    noteType: targetEntry.noteType,
    dots: targetEntry.dots,
  };

  // Find insert position (after all existing chord notes)
  let insertIndex = targetIndex + 1;
  while (insertIndex < measure.entries.length) {
    const entry = measure.entries[insertIndex];
    if (entry.type === 'note' && entry.chord) {
      insertIndex++;
    } else {
      break;
    }
  }

  measure.entries.splice(insertIndex, 0, chordNote);

  return success(result);
}

/**
 * Change note duration with proper handling of following notes
 * - If longer: consumes following rests/notes, returns error if would overwrite notes
 * - If shorter: fills remainder with rest
 */
export function changeNoteDuration(
  score: Score,
  options: {
    partIndex: number;
    measureIndex: number;
    noteIndex: number;
    newDuration: number;
    noteType?: NoteEntry['noteType'];
    dots?: number;
  }
): OperationResult<Score> {
  if (options.partIndex < 0 || options.partIndex >= score.parts.length) {
    return failure([operationError('PART_NOT_FOUND', `Part index ${options.partIndex} out of bounds`, { partIndex: options.partIndex })]);
  }

  const part = score.parts[options.partIndex];
  if (options.measureIndex < 0 || options.measureIndex >= part.measures.length) {
    return failure([operationError('MEASURE_NOT_FOUND', `Measure index ${options.measureIndex} out of bounds`, { partIndex: options.partIndex, measureIndex: options.measureIndex })]);
  }

  if (options.newDuration <= 0) {
    return failure([operationError('INVALID_DURATION', `Duration must be positive`, { partIndex: options.partIndex, measureIndex: options.measureIndex })]);
  }

  const result = cloneScore(score);
  const measure = result.parts[options.partIndex].measures[options.measureIndex];

  // Get context
  const context = getMeasureContext(result, options.partIndex, options.measureIndex);
  const measureDuration = context.time
    ? getMeasureDuration(context.divisions, context.time)
    : context.divisions * 4;

  // Find the note and its position
  let noteCount = 0;
  let targetEntry: NoteEntry | null = null;
  let targetPosition = 0;
  let position = 0;

  for (const entry of measure.entries) {
    if (entry.type === 'note') {
      if (!entry.rest && !entry.chord) {
        if (noteCount === options.noteIndex) {
          targetEntry = entry;
          targetPosition = position;
          break;
        }
        noteCount++;
      }
      if (!entry.chord) {
        position += entry.duration;
      }
    } else if (entry.type === 'backup') {
      position -= entry.duration;
    } else if (entry.type === 'forward') {
      position += entry.duration;
    }
  }

  if (!targetEntry) {
    return failure([operationError('NOTE_NOT_FOUND', `Note index ${options.noteIndex} not found`, { partIndex: options.partIndex, measureIndex: options.measureIndex })]);
  }

  const oldDuration = targetEntry.duration;
  const newEnd = targetPosition + options.newDuration;

  // Check if exceeds measure
  if (newEnd > measureDuration) {
    return failure([operationError(
      'EXCEEDS_MEASURE',
      `New duration would exceed measure (ends at ${newEnd}, measure is ${measureDuration})`,
      { partIndex: options.partIndex, measureIndex: options.measureIndex },
      { newEnd, measureDuration }
    )]);
  }

  // Get voice entries
  const voiceEntries = getVoiceEntries(measure, targetEntry.voice, targetEntry.staff);

  if (options.newDuration > oldDuration) {
    // Extending: check for conflicts
    const { hasNotes, conflictingNotes } = hasNotesInRange(
      voiceEntries.filter(e => e.position !== targetPosition), // Exclude current note
      targetPosition + oldDuration,
      newEnd
    );

    if (hasNotes) {
      return failure([operationError(
        'NOTE_CONFLICT',
        `Cannot extend note: conflicts with existing note(s)`,
        { partIndex: options.partIndex, measureIndex: options.measureIndex },
        { conflictingPositions: conflictingNotes.map(n => ({ start: n.position, end: n.endPosition })) }
      )]);
    }
  }

  // Update duration
  targetEntry.duration = options.newDuration;
  if (options.noteType !== undefined) {
    targetEntry.noteType = options.noteType;
  }
  if (options.dots !== undefined) {
    targetEntry.dots = options.dots;
  }

  // Rebuild voice entries
  const existingNotes = voiceEntries
    .filter(e => {
      if (e.position === targetPosition) return true; // Keep the modified note
      const note = e.entry as NoteEntry;
      if (note.rest) {
        // Remove rests that are now covered by the extended note
        if (options.newDuration > oldDuration) {
          return !(e.position >= targetPosition + oldDuration && e.position < newEnd);
        }
      }
      return true;
    })
    .map(e => ({ position: e.position, entry: e.entry as NoteEntry }));

  // Update the modified note's duration in the list
  const modifiedIdx = existingNotes.findIndex(e => e.position === targetPosition);
  if (modifiedIdx >= 0) {
    existingNotes[modifiedIdx].entry = targetEntry;
  }

  // Rebuild measure
  measure.entries = rebuildMeasureWithVoice(
    measure,
    targetEntry.voice,
    existingNotes,
    measureDuration,
    targetEntry.staff
  );

  // Validate
  const errors = validateMeasureLocal(measure, context, {
    checkMeasureDuration: true,
    checkPosition: true,
    checkVoiceStaff: true,
  });

  const criticalErrors = errors.filter(e => e.level === 'error');
  if (criticalErrors.length > 0) {
    return failure(criticalErrors);
  }

  return success(result, errors.filter(e => e.level !== 'error'));
}

/**
 * Set note pitch (simple pitch change, no validation needed)
 */
export function setNotePitch(
  score: Score,
  options: {
    partIndex: number;
    measureIndex: number;
    noteIndex: number;
    pitch: Pitch;
  }
): OperationResult<Score> {
  if (options.partIndex < 0 || options.partIndex >= score.parts.length) {
    return failure([operationError('PART_NOT_FOUND', `Part index ${options.partIndex} out of bounds`, { partIndex: options.partIndex })]);
  }

  const part = score.parts[options.partIndex];
  if (options.measureIndex < 0 || options.measureIndex >= part.measures.length) {
    return failure([operationError('MEASURE_NOT_FOUND', `Measure index ${options.measureIndex} out of bounds`, { partIndex: options.partIndex, measureIndex: options.measureIndex })]);
  }

  const result = cloneScore(score);
  const measure = result.parts[options.partIndex].measures[options.measureIndex];

  let noteCount = 0;
  for (const entry of measure.entries) {
    if (entry.type === 'note' && !entry.rest) {
      if (noteCount === options.noteIndex) {
        entry.pitch = options.pitch;
        return success(result);
      }
      noteCount++;
    }
  }

  return failure([operationError('NOTE_NOT_FOUND', `Note index ${options.noteIndex} not found`, { partIndex: options.partIndex, measureIndex: options.measureIndex })]);
}

// ============================================================
// Voice Operations
// ============================================================

/**
 * Add a new voice to a measure, filled with a whole-measure rest
 */
export function addVoice(
  score: Score,
  options: {
    partIndex: number;
    measureIndex: number;
    voice: number;
    staff?: number;
  }
): OperationResult<Score> {
  if (options.partIndex < 0 || options.partIndex >= score.parts.length) {
    return failure([operationError('PART_NOT_FOUND', `Part index ${options.partIndex} out of bounds`, { partIndex: options.partIndex })]);
  }

  const part = score.parts[options.partIndex];
  if (options.measureIndex < 0 || options.measureIndex >= part.measures.length) {
    return failure([operationError('MEASURE_NOT_FOUND', `Measure index ${options.measureIndex} out of bounds`, { partIndex: options.partIndex, measureIndex: options.measureIndex })]);
  }

  const result = cloneScore(score);
  const measure = result.parts[options.partIndex].measures[options.measureIndex];

  // Check if voice already exists
  const existingVoiceEntries = getVoiceEntries(measure, options.voice, options.staff);
  if (existingVoiceEntries.length > 0) {
    return failure([operationError(
      'NOTE_CONFLICT',
      `Voice ${options.voice} already exists in this measure`,
      { partIndex: options.partIndex, measureIndex: options.measureIndex, voice: options.voice }
    )]);
  }

  // Get measure duration
  const context = getMeasureContext(result, options.partIndex, options.measureIndex);
  const measureDuration = context.time
    ? getMeasureDuration(context.divisions, context.time)
    : context.divisions * 4;

  // Add rest for entire measure
  const rest = createRest(measureDuration, options.voice, options.staff);

  // Add backup to go to start, then add rest
  const currentEnd = getMeasureEndPosition(measure);
  if (currentEnd > 0) {
    measure.entries.push({ type: 'backup', duration: currentEnd });
  }
  measure.entries.push(rest);

  return success(result);
}

// ============================================================
// Transpose Operation
// ============================================================

function transposePitch(pitch: Pitch, semitones: number): Pitch {
  const currentSemitone = STEP_SEMITONES[pitch.step] + (pitch.alter ?? 0) + pitch.octave * 12;
  const targetSemitone = currentSemitone + semitones;

  const targetOctave = Math.floor(targetSemitone / 12);
  const targetPitchClass = ((targetSemitone % 12) + 12) % 12;

  let bestStep: Pitch['step'] = 'C';
  let bestAlter = 99;

  for (const step of STEPS) {
    const stepSemitone = STEP_SEMITONES[step];
    let diff = targetPitchClass - stepSemitone;

    if (diff > 6) diff -= 12;
    if (diff < -6) diff += 12;

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
 * Transpose all notes in the score
 */
export function transpose(
  score: Score,
  semitones: number
): OperationResult<Score> {
  if (semitones === 0) return success(score);

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

  return success(result);
}

// ============================================================
// Part Operations
// ============================================================

export interface AddPartOptions {
  id: string;
  name?: string;
  abbreviation?: string;
  insertIndex?: number;
  time?: TimeSignature;
  key?: KeySignature;
  clef?: Clef;
  divisions?: number;
}

export function addPart(
  score: Score,
  options: AddPartOptions
): OperationResult<Score> {
  if (score.parts.find(p => p.id === options.id)) {
    return failure([operationError('DUPLICATE_PART_ID', `Part ID "${options.id}" already exists`, { partId: options.id })]);
  }

  const result = cloneScore(score);
  const insertIndex = options.insertIndex ?? result.parts.length;

  const partInfo: PartInfo = {
    type: 'score-part',
    id: options.id,
    name: options.name,
    abbreviation: options.abbreviation,
  };

  // Insert into partList
  let partListInsertIndex = result.partList.length;
  let partCount = 0;
  for (let i = 0; i < result.partList.length; i++) {
    if (result.partList[i].type === 'score-part') {
      if (partCount === insertIndex) {
        partListInsertIndex = i;
        break;
      }
      partCount++;
    }
  }
  result.partList.splice(partListInsertIndex, 0, partInfo);

  // Create new part with measures
  const measureCount = result.parts.length > 0 ? result.parts[0].measures.length : 1;
  const newPart: Part = { id: options.id, measures: [] };

  for (let i = 0; i < measureCount; i++) {
    const measureNumber = result.parts.length > 0
      ? result.parts[0].measures[i]?.number ?? String(i + 1)
      : String(i + 1);

    const measure: Measure = { number: measureNumber, entries: [] };

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

  const validationResult = validate(result, { checkPartReferences: true, checkPartStructure: true });
  if (!validationResult.valid) {
    return failure(validationResult.errors);
  }

  return success(result, validationResult.warnings);
}

export function removePart(score: Score, partId: string): OperationResult<Score> {
  const partIndex = score.parts.findIndex(p => p.id === partId);
  if (partIndex === -1) {
    return failure([operationError('PART_NOT_FOUND', `Part "${partId}" not found`, { partId })]);
  }

  if (score.parts.length <= 1) {
    return failure([operationError('PART_NOT_FOUND', 'Cannot remove the only remaining part', { partId })]);
  }

  const result = cloneScore(score);
  result.parts.splice(partIndex, 1);

  const partListIndex = result.partList.findIndex(e => e.type === 'score-part' && e.id === partId);
  if (partListIndex !== -1) {
    result.partList.splice(partListIndex, 1);
  }

  return success(result);
}

export function duplicatePart(
  score: Score,
  options: { sourcePartId: string; newPartId: string; newPartName?: string }
): OperationResult<Score> {
  const sourceIndex = score.parts.findIndex(p => p.id === options.sourcePartId);
  if (sourceIndex === -1) {
    return failure([operationError('PART_NOT_FOUND', `Source part "${options.sourcePartId}" not found`, { partId: options.sourcePartId })]);
  }

  if (score.parts.find(p => p.id === options.newPartId)) {
    return failure([operationError('DUPLICATE_PART_ID', `Part ID "${options.newPartId}" already exists`, { partId: options.newPartId })]);
  }

  const result = cloneScore(score);

  const sourcePart = result.parts[sourceIndex];
  const newPart: Part = JSON.parse(JSON.stringify(sourcePart));
  newPart.id = options.newPartId;

  const sourcePartInfo = result.partList.find(e => e.type === 'score-part' && e.id === options.sourcePartId) as PartInfo | undefined;

  const newPartInfo: PartInfo = {
    type: 'score-part',
    id: options.newPartId,
    name: options.newPartName ?? sourcePartInfo?.name,
    abbreviation: sourcePartInfo?.abbreviation,
  };

  result.parts.splice(sourceIndex + 1, 0, newPart);

  const partListSourceIndex = result.partList.findIndex(e => e.type === 'score-part' && e.id === options.sourcePartId);
  if (partListSourceIndex !== -1) {
    result.partList.splice(partListSourceIndex + 1, 0, newPartInfo);
  } else {
    result.partList.push(newPartInfo);
  }

  return success(result);
}

// ============================================================
// Staff Operations
// ============================================================

export function setStaves(
  score: Score,
  options: { partIndex: number; staves: number; clefs?: Clef[]; fromMeasure?: number }
): OperationResult<Score> {
  if (options.partIndex < 0 || options.partIndex >= score.parts.length) {
    return failure([operationError('PART_NOT_FOUND', `Part index ${options.partIndex} out of bounds`, { partIndex: options.partIndex })]);
  }

  if (options.staves < 1) {
    return failure([operationError('INVALID_STAFF', `Staves count must be at least 1`, { partIndex: options.partIndex })]);
  }

  const result = cloneScore(score);
  const part = result.parts[options.partIndex];
  const fromMeasureIndex = options.fromMeasure ?? 0;

  const measure = part.measures[fromMeasureIndex];
  if (!measure) {
    return failure([operationError('MEASURE_NOT_FOUND', `Measure index ${fromMeasureIndex} out of bounds`, { partIndex: options.partIndex, measureIndex: fromMeasureIndex })]);
  }

  if (!measure.attributes) {
    measure.attributes = {};
  }
  measure.attributes.staves = options.staves;

  if (options.clefs) {
    measure.attributes.clef = options.clefs;
  } else {
    const existingClefs = measure.attributes.clef ?? [];
    const newClefs: Clef[] = [...existingClefs];

    for (let staff = existingClefs.length + 1; staff <= options.staves; staff++) {
      newClefs.push(staff === 2 ? { sign: 'F', line: 4, staff } : { sign: 'G', line: 2, staff });
    }

    measure.attributes.clef = newClefs;
  }

  const validationResult = validate(result, { checkVoiceStaff: true, checkStaffStructure: true });
  if (!validationResult.valid) {
    return failure(validationResult.errors);
  }

  return success(result, validationResult.warnings);
}

export function moveNoteToStaff(
  score: Score,
  options: { partIndex: number; measureIndex: number; noteIndex: number; targetStaff: number }
): OperationResult<Score> {
  if (options.partIndex < 0 || options.partIndex >= score.parts.length) {
    return failure([operationError('PART_NOT_FOUND', `Part index ${options.partIndex} out of bounds`, { partIndex: options.partIndex })]);
  }

  const part = score.parts[options.partIndex];
  if (options.measureIndex < 0 || options.measureIndex >= part.measures.length) {
    return failure([operationError('MEASURE_NOT_FOUND', `Measure index ${options.measureIndex} out of bounds`, { partIndex: options.partIndex, measureIndex: options.measureIndex })]);
  }

  if (options.targetStaff < 1) {
    return failure([operationError('INVALID_STAFF', `Target staff must be at least 1`, { partIndex: options.partIndex, measureIndex: options.measureIndex })]);
  }

  const result = cloneScore(score);
  const measure = result.parts[options.partIndex].measures[options.measureIndex];

  let noteCount = 0;
  for (const entry of measure.entries) {
    if (entry.type === 'note' && !entry.rest) {
      if (noteCount === options.noteIndex) {
        entry.staff = options.targetStaff;

        const context = getMeasureContext(result, options.partIndex, options.measureIndex);
        const errors = validateMeasureLocal(measure, context, { checkVoiceStaff: true });
        const criticalErrors = errors.filter(e => e.level === 'error');
        if (criticalErrors.length > 0) {
          return failure(criticalErrors);
        }
        return success(result, errors.filter(e => e.level !== 'error'));
      }
      noteCount++;
    }
  }

  return failure([operationError('NOTE_NOT_FOUND', `Note index ${options.noteIndex} not found`, { partIndex: options.partIndex, measureIndex: options.measureIndex })]);
}

// ============================================================
// Measure Operations (kept for compatibility)
// ============================================================

export function changeKey(score: Score, key: KeySignature, options: { fromMeasure: string | number }): Score {
  const result = cloneScore(score);
  const targetMeasure = String(options.fromMeasure);

  for (const part of result.parts) {
    for (const measure of part.measures) {
      if (measure.number === targetMeasure) {
        if (!measure.attributes) measure.attributes = {};
        measure.attributes.key = key;
      }
    }
  }

  return result;
}

export function changeTime(score: Score, time: TimeSignature, options: { fromMeasure: string | number }): Score {
  const result = cloneScore(score);
  const targetMeasure = String(options.fromMeasure);

  for (const part of result.parts) {
    for (const measure of part.measures) {
      if (measure.number === targetMeasure) {
        if (!measure.attributes) measure.attributes = {};
        measure.attributes.time = time;
      }
    }
  }

  return result;
}

export function insertMeasure(score: Score, options: { afterMeasure: string | number; copyAttributes?: boolean }): Score {
  const result = cloneScore(score);
  const targetMeasure = String(options.afterMeasure);

  for (const part of result.parts) {
    const insertIndex = part.measures.findIndex(m => m.number === targetMeasure);
    if (insertIndex === -1) continue;

    const numericPart = parseInt(targetMeasure, 10);
    const newMeasureNumber = String(isNaN(numericPart) ? insertIndex + 2 : numericPart + 1);

    const newMeasure: Measure = { number: newMeasureNumber, entries: [] };

    if (options.copyAttributes && part.measures[insertIndex].attributes) {
      newMeasure.attributes = { ...part.measures[insertIndex].attributes };
    }

    part.measures.splice(insertIndex + 1, 0, newMeasure);

    for (let i = insertIndex + 2; i < part.measures.length; i++) {
      const currentNum = parseInt(part.measures[i].number, 10);
      if (!isNaN(currentNum)) {
        part.measures[i].number = String(currentNum + 1);
      }
    }
  }

  return result;
}

export function deleteMeasure(score: Score, measureNumber: string | number): Score {
  const result = cloneScore(score);
  const targetMeasure = String(measureNumber);

  for (const part of result.parts) {
    const deleteIndex = part.measures.findIndex(m => m.number === targetMeasure);
    if (deleteIndex === -1) continue;

    part.measures.splice(deleteIndex, 1);

    for (let i = deleteIndex; i < part.measures.length; i++) {
      const currentNum = parseInt(part.measures[i].number, 10);
      if (!isNaN(currentNum)) {
        part.measures[i].number = String(currentNum - 1);
      }
    }
  }

  return result;
}

// ============================================================
// Legacy exports (for backwards compatibility)
// ============================================================

/** @deprecated Use insertNote instead */
export const addNote = (score: Score, options: {
  partIndex: number;
  measureIndex: number;
  staff?: number;
  voice: number;
  position: number;
  note: Omit<NoteEntry, 'type' | 'voice' | 'staff'>;
}): Score => {
  const result = insertNote(score, {
    partIndex: options.partIndex,
    measureIndex: options.measureIndex,
    voice: options.voice,
    staff: options.staff,
    position: options.position,
    pitch: options.note.pitch ?? { step: 'C', octave: 4 },
    duration: options.note.duration,
    noteType: options.note.noteType,
    dots: options.note.dots,
  });
  return result.success ? result.data : score;
};

/** @deprecated Use removeNote instead */
export const deleteNote = (score: Score, options: { partIndex: number; measureIndex: number; noteIndex: number }): Score => {
  const result = removeNote(score, options);
  return result.success ? result.data : score;
};

/** @deprecated Use addChord instead */
export const addChordNote = (score: Score, options: { partIndex: number; measureIndex: number; afterNoteIndex: number; pitch: Pitch }): Score => {
  const result = addChord(score, { ...options, noteIndex: options.afterNoteIndex });
  return result.success ? result.data : score;
};

/** @deprecated Use setNotePitch instead */
export const modifyNotePitch = (score: Score, options: { partIndex: number; measureIndex: number; noteIndex: number; pitch: Pitch }): Score => {
  const result = setNotePitch(score, options);
  return result.success ? result.data : score;
};

/** @deprecated Use changeNoteDuration instead */
export const modifyNoteDuration = (score: Score, options: { partIndex: number; measureIndex: number; noteIndex: number; duration: number; noteType?: NoteEntry['noteType']; dots?: number }): Score => {
  const result = changeNoteDuration(score, { ...options, newDuration: options.duration });
  return result.success ? result.data : score;
};

// Legacy Checked versions (now just aliases to new API)
/** @deprecated Use insertNote instead */
export const addNoteChecked = (score: Score, options: {
  partIndex: number;
  measureIndex: number;
  staff?: number;
  voice: number;
  position: number;
  note: Omit<NoteEntry, 'type' | 'voice' | 'staff'>;
}): OperationResult<Score> => {
  return insertNote(score, {
    partIndex: options.partIndex,
    measureIndex: options.measureIndex,
    voice: options.voice,
    staff: options.staff,
    position: options.position,
    pitch: options.note.pitch ?? { step: 'C', octave: 4 },
    duration: options.note.duration,
    noteType: options.note.noteType,
    dots: options.note.dots,
  });
};

/** @deprecated Use removeNote instead */
export const deleteNoteChecked = removeNote;

/** @deprecated Use addChord instead */
export const addChordNoteChecked = (score: Score, options: { partIndex: number; measureIndex: number; afterNoteIndex: number; pitch: Pitch }): OperationResult<Score> => {
  return addChord(score, { ...options, noteIndex: options.afterNoteIndex });
};

/** @deprecated Use setNotePitch instead */
export const modifyNotePitchChecked = setNotePitch;

/** @deprecated Use changeNoteDuration instead */
export const modifyNoteDurationChecked = (score: Score, options: { partIndex: number; measureIndex: number; noteIndex: number; duration: number; noteType?: NoteEntry['noteType']; dots?: number }): OperationResult<Score> => {
  return changeNoteDuration(score, { ...options, newDuration: options.duration });
};

/** @deprecated Use transpose instead */
export const transposeChecked = transpose;

// Re-exports
export type { ValidationError } from '../validator';
