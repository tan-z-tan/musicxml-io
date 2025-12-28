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
  ArticulationType,
  DynamicsValue,
  SlurNotation,
  TiedNotation,
  ArticulationNotation,
  DirectionEntry,
  DirectionType,
  AttributesEntry,
  FermataNotation,
  OrnamentNotation,
  OrnamentType,
  Lyric,
  HarmonyEntry,
  SoundEntry,
  NoteType,
} from '../types';
import {
  STEPS,
  STEP_SEMITONES,
  getMeasureEndPosition,
  pitchToSemitone,
  semitoneToKeyAwarePitch,
  getAccidentalsInMeasure,
  determineAccidental,
  getAbsolutePositionForNote,
} from '../utils';
import {
  validate,
  validateMeasureLocal,
  getMeasureContext,
  type ValidationError,
} from '../validator';
import { getAttributesAtMeasure } from '../query';

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
  | 'PART_NOT_FOUND'
  | 'MEASURE_NOT_FOUND'
  | 'INVALID_DURATION'
  | 'INVALID_STAFF'
  | 'DUPLICATE_PART_ID'
  | 'TIE_ALREADY_EXISTS'
  | 'TIE_NOT_FOUND'
  | 'TIE_PITCH_MISMATCH'
  | 'TIE_INVALID_TARGET'
  | 'SLUR_ALREADY_EXISTS'
  | 'SLUR_NOT_FOUND'
  | 'ARTICULATION_ALREADY_EXISTS'
  | 'ARTICULATION_NOT_FOUND'
  | 'DYNAMICS_ALREADY_EXISTS'
  | 'DYNAMICS_NOT_FOUND'
  | 'INVALID_CLEF'
  | 'ACCIDENTAL_OUT_OF_BOUNDS'
  | 'BARLINE_NOT_FOUND'
  | 'BARLINE_ALREADY_EXISTS'
  | 'ENDING_NOT_FOUND'
  | 'ENDING_ALREADY_EXISTS'
  | 'REPEAT_NOT_FOUND'
  | 'REPEAT_ALREADY_EXISTS'
  | 'GRACE_NOTE_NOT_FOUND'
  | 'INVALID_GRACE_NOTE'
  | 'LYRIC_NOT_FOUND'
  | 'LYRIC_ALREADY_EXISTS'
  | 'HARMONY_NOT_FOUND'
  | 'HARMONY_ALREADY_EXISTS'
  | 'INVALID_HARMONY'
  | 'TEMPO_NOT_FOUND'
  | 'INVALID_RANGE'
  | 'WEDGE_NOT_FOUND'
  | 'FERMATA_ALREADY_EXISTS'
  | 'FERMATA_NOT_FOUND'
  | 'ORNAMENT_ALREADY_EXISTS'
  | 'ORNAMENT_NOT_FOUND'
  | 'PEDAL_NOT_FOUND'
  | 'INVALID_TEXT';

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
// Key-Aware Pitch Operations
// ============================================================

export interface SetNotePitchBySemitoneOptions {
  partIndex: number;
  measureIndex: number;
  noteIndex: number;
  /** MIDI-like semitone value (C4 = 48, C#4 = 49, etc.) */
  semitone: number;
  /** Prefer sharp spelling over flat (defaults to key signature preference) */
  preferSharp?: boolean;
}

/**
 * Set note pitch by semitone value, considering key signature and accidentals.
 * Automatically determines the appropriate enharmonic spelling and sets the accidental if needed.
 */
export function setNotePitchBySemitone(
  score: Score,
  options: SetNotePitchBySemitoneOptions
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

  // Get key signature from measure attributes
  const measureNumber = measure.number ?? String(options.measureIndex + 1);
  const attrs = getAttributesAtMeasure(result, { part: options.partIndex, measure: measureNumber });
  const keySignature = attrs.key ?? { fifths: 0 };

  // Find the note
  let noteCount = 0;
  for (const entry of measure.entries) {
    if (entry.type === 'note' && !entry.rest) {
      if (noteCount === options.noteIndex) {
        // Get position of this note for accidental tracking
        const notePosition = getAbsolutePositionForNote(entry, measure);

        // Get accidentals used earlier in the measure
        const accidentalsInMeasure = getAccidentalsInMeasure(measure, notePosition, entry.voice);

        // Convert semitone to pitch with key-aware spelling
        const newPitch = semitoneToKeyAwarePitch(options.semitone, keySignature, {
          preferSharp: options.preferSharp,
        });

        // Determine if we need to show an accidental
        const accidental = determineAccidental(newPitch, keySignature, accidentalsInMeasure);

        // Update the note
        entry.pitch = newPitch;
        if (accidental) {
          entry.accidental = { value: accidental };
        } else {
          delete entry.accidental;
        }

        return success(result);
      }
      noteCount++;
    }
  }

  return failure([operationError('NOTE_NOT_FOUND', `Note index ${options.noteIndex} not found`, { partIndex: options.partIndex, measureIndex: options.measureIndex })]);
}

export interface ShiftNotePitchOptions {
  partIndex: number;
  measureIndex: number;
  noteIndex: number;
  /** Number of semitones to shift (positive = up, negative = down) */
  semitones: number;
  /** Prefer sharp spelling over flat (defaults to key signature preference) */
  preferSharp?: boolean;
}

/**
 * Shift note pitch by a number of semitones, considering key signature and accidentals.
 * Automatically determines the appropriate enharmonic spelling and sets the accidental if needed.
 */
export function shiftNotePitch(
  score: Score,
  options: ShiftNotePitchOptions
): OperationResult<Score> {
  if (options.semitones === 0) {
    return success(score);
  }

  if (options.partIndex < 0 || options.partIndex >= score.parts.length) {
    return failure([operationError('PART_NOT_FOUND', `Part index ${options.partIndex} out of bounds`, { partIndex: options.partIndex })]);
  }

  const part = score.parts[options.partIndex];
  if (options.measureIndex < 0 || options.measureIndex >= part.measures.length) {
    return failure([operationError('MEASURE_NOT_FOUND', `Measure index ${options.measureIndex} out of bounds`, { partIndex: options.partIndex, measureIndex: options.measureIndex })]);
  }

  // Find the note and get its current semitone
  const measure = part.measures[options.measureIndex];
  let noteCount = 0;
  let currentSemitone: number | null = null;

  for (const entry of measure.entries) {
    if (entry.type === 'note' && !entry.rest) {
      if (noteCount === options.noteIndex) {
        if (!entry.pitch) {
          return failure([operationError('NOTE_NOT_FOUND', 'Note has no pitch', { partIndex: options.partIndex, measureIndex: options.measureIndex })]);
        }
        currentSemitone = pitchToSemitone(entry.pitch);
        break;
      }
      noteCount++;
    }
  }

  if (currentSemitone === null) {
    return failure([operationError('NOTE_NOT_FOUND', `Note index ${options.noteIndex} not found`, { partIndex: options.partIndex, measureIndex: options.measureIndex })]);
  }

  // Calculate new semitone and delegate to setNotePitchBySemitone
  return setNotePitchBySemitone(score, {
    partIndex: options.partIndex,
    measureIndex: options.measureIndex,
    noteIndex: options.noteIndex,
    semitone: currentSemitone + options.semitones,
    preferSharp: options.preferSharp,
  });
}

// ============================================================
// Accidental Operations
// ============================================================

export interface RaiseAccidentalOptions {
  partIndex: number;
  measureIndex: number;
  noteIndex: number;
}

/**
 * Raise the accidental of a note by one step.
 * C → C#, C# → C##, Db → D, etc.
 * Keeps the note's step (letter name) and increments alter by 1.
 * Returns error if alter would exceed +2.
 */
export function raiseAccidental(
  score: Score,
  options: RaiseAccidentalOptions
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

  // Get key signature for accidental display
  const measureNumber = measure.number ?? String(options.measureIndex + 1);
  const attrs = getAttributesAtMeasure(result, { part: options.partIndex, measure: measureNumber });
  const keySignature = attrs.key ?? { fifths: 0 };

  // Find the note
  let noteCount = 0;
  for (const entry of measure.entries) {
    if (entry.type === 'note' && !entry.rest) {
      if (noteCount === options.noteIndex) {
        if (!entry.pitch) {
          return failure([operationError('NOTE_NOT_FOUND', 'Note has no pitch', { partIndex: options.partIndex, measureIndex: options.measureIndex })]);
        }

        const currentAlter = entry.pitch.alter ?? 0;
        const newAlter = currentAlter + 1;

        // Check bounds
        if (newAlter > 2) {
          return failure([operationError('ACCIDENTAL_OUT_OF_BOUNDS', `Cannot raise accidental beyond double-sharp (current: ${currentAlter})`, { partIndex: options.partIndex, measureIndex: options.measureIndex })]);
        }

        // Update pitch
        entry.pitch.alter = newAlter === 0 ? undefined : newAlter;

        // Get position for accidental tracking
        const notePosition = getAbsolutePositionForNote(entry, measure);
        const accidentalsInMeasure = getAccidentalsInMeasure(measure, notePosition, entry.voice);

        // Determine accidental to display
        const accidental = determineAccidental(entry.pitch, keySignature, accidentalsInMeasure);
        if (accidental) {
          entry.accidental = { value: accidental };
        } else {
          delete entry.accidental;
        }

        return success(result);
      }
      noteCount++;
    }
  }

  return failure([operationError('NOTE_NOT_FOUND', `Note index ${options.noteIndex} not found`, { partIndex: options.partIndex, measureIndex: options.measureIndex })]);
}

export interface LowerAccidentalOptions {
  partIndex: number;
  measureIndex: number;
  noteIndex: number;
}

/**
 * Lower the accidental of a note by one step.
 * C# → C, C## → C#, D → Db, Db → Dbb, etc.
 * Keeps the note's step (letter name) and decrements alter by 1.
 * Returns error if alter would go below -2.
 */
export function lowerAccidental(
  score: Score,
  options: LowerAccidentalOptions
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

  // Get key signature for accidental display
  const measureNumber = measure.number ?? String(options.measureIndex + 1);
  const attrs = getAttributesAtMeasure(result, { part: options.partIndex, measure: measureNumber });
  const keySignature = attrs.key ?? { fifths: 0 };

  // Find the note
  let noteCount = 0;
  for (const entry of measure.entries) {
    if (entry.type === 'note' && !entry.rest) {
      if (noteCount === options.noteIndex) {
        if (!entry.pitch) {
          return failure([operationError('NOTE_NOT_FOUND', 'Note has no pitch', { partIndex: options.partIndex, measureIndex: options.measureIndex })]);
        }

        const currentAlter = entry.pitch.alter ?? 0;
        const newAlter = currentAlter - 1;

        // Check bounds
        if (newAlter < -2) {
          return failure([operationError('ACCIDENTAL_OUT_OF_BOUNDS', `Cannot lower accidental beyond double-flat (current: ${currentAlter})`, { partIndex: options.partIndex, measureIndex: options.measureIndex })]);
        }

        // Update pitch
        entry.pitch.alter = newAlter === 0 ? undefined : newAlter;

        // Get position for accidental tracking
        const notePosition = getAbsolutePositionForNote(entry, measure);
        const accidentalsInMeasure = getAccidentalsInMeasure(measure, notePosition, entry.voice);

        // Determine accidental to display
        const accidental = determineAccidental(entry.pitch, keySignature, accidentalsInMeasure);
        if (accidental) {
          entry.accidental = { value: accidental };
        } else {
          delete entry.accidental;
        }

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
// Tie Operations
// ============================================================

export interface AddTieOptions {
  partIndex: number;
  startMeasureIndex: number;
  startNoteIndex: number;
  endMeasureIndex: number;
  endNoteIndex: number;
}

/**
 * Find a note by index (counting only pitched notes, not rests)
 */
function findNoteByIndex(measure: Measure, noteIndex: number): { note: NoteEntry; entryIndex: number } | null {
  let noteCount = 0;
  for (let i = 0; i < measure.entries.length; i++) {
    const entry = measure.entries[i];
    if (entry.type === 'note' && !entry.rest) {
      if (noteCount === noteIndex) {
        return { note: entry, entryIndex: i };
      }
      noteCount++;
    }
  }
  return null;
}

/**
 * Check if two pitches are equal
 */
function pitchesEqual(p1: Pitch, p2: Pitch): boolean {
  return p1.step === p2.step && p1.octave === p2.octave && (p1.alter ?? 0) === (p2.alter ?? 0);
}

/**
 * Add a tie between two notes.
 * The notes must have the same pitch.
 * Adds tie start to the first note and tie stop to the second note.
 */
export function addTie(
  score: Score,
  options: AddTieOptions
): OperationResult<Score> {
  // Validate bounds
  if (options.partIndex < 0 || options.partIndex >= score.parts.length) {
    return failure([operationError('PART_NOT_FOUND', `Part index ${options.partIndex} out of bounds`, { partIndex: options.partIndex })]);
  }

  const part = score.parts[options.partIndex];
  if (options.startMeasureIndex < 0 || options.startMeasureIndex >= part.measures.length) {
    return failure([operationError('MEASURE_NOT_FOUND', `Start measure index ${options.startMeasureIndex} out of bounds`, { partIndex: options.partIndex, measureIndex: options.startMeasureIndex })]);
  }
  if (options.endMeasureIndex < 0 || options.endMeasureIndex >= part.measures.length) {
    return failure([operationError('MEASURE_NOT_FOUND', `End measure index ${options.endMeasureIndex} out of bounds`, { partIndex: options.partIndex, measureIndex: options.endMeasureIndex })]);
  }

  const result = cloneScore(score);
  const startMeasure = result.parts[options.partIndex].measures[options.startMeasureIndex];
  const endMeasure = result.parts[options.partIndex].measures[options.endMeasureIndex];

  const startResult = findNoteByIndex(startMeasure, options.startNoteIndex);
  if (!startResult) {
    return failure([operationError('NOTE_NOT_FOUND', `Start note index ${options.startNoteIndex} not found`, { partIndex: options.partIndex, measureIndex: options.startMeasureIndex })]);
  }

  const endResult = findNoteByIndex(endMeasure, options.endNoteIndex);
  if (!endResult) {
    return failure([operationError('NOTE_NOT_FOUND', `End note index ${options.endNoteIndex} not found`, { partIndex: options.partIndex, measureIndex: options.endMeasureIndex })]);
  }

  const startNote = startResult.note;
  const endNote = endResult.note;

  // Check pitch match
  if (!startNote.pitch || !endNote.pitch) {
    return failure([operationError('TIE_INVALID_TARGET', 'Cannot tie notes without pitch', { partIndex: options.partIndex })]);
  }

  if (!pitchesEqual(startNote.pitch, endNote.pitch)) {
    return failure([operationError('TIE_PITCH_MISMATCH', 'Tied notes must have the same pitch', { partIndex: options.partIndex }, { startPitch: startNote.pitch, endPitch: endNote.pitch })]);
  }

  // Check if tie already exists
  if (startNote.tie?.type === 'start' || startNote.tie?.type === 'continue') {
    return failure([operationError('TIE_ALREADY_EXISTS', 'Start note already has a tie start', { partIndex: options.partIndex, measureIndex: options.startMeasureIndex })]);
  }

  // Add tie start to first note
  startNote.tie = { type: 'start' };
  if (!startNote.notations) startNote.notations = [];
  startNote.notations.push({ type: 'tied', tiedType: 'start' } as TiedNotation);

  // Add tie stop to second note
  endNote.tie = { type: 'stop' };
  if (!endNote.notations) endNote.notations = [];
  endNote.notations.push({ type: 'tied', tiedType: 'stop' } as TiedNotation);

  // Validate
  const validationResult = validate(result, { checkTies: true });
  const criticalErrors = validationResult.errors.filter(e => e.level === 'error');
  if (criticalErrors.length > 0) {
    return failure(criticalErrors);
  }

  return success(result, validationResult.warnings);
}

export interface RemoveTieOptions {
  partIndex: number;
  measureIndex: number;
  noteIndex: number;
}

/**
 * Remove a tie from a note (removes both start and stop if the note is part of a tie)
 */
export function removeTie(
  score: Score,
  options: RemoveTieOptions
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

  const noteResult = findNoteByIndex(measure, options.noteIndex);
  if (!noteResult) {
    return failure([operationError('NOTE_NOT_FOUND', `Note index ${options.noteIndex} not found`, { partIndex: options.partIndex, measureIndex: options.measureIndex })]);
  }

  const note = noteResult.note;

  if (!note.tie) {
    return failure([operationError('TIE_NOT_FOUND', 'Note does not have a tie', { partIndex: options.partIndex, measureIndex: options.measureIndex })]);
  }

  // Remove tie
  delete note.tie;
  delete note.ties;

  // Remove tied notation
  if (note.notations) {
    note.notations = note.notations.filter(n => n.type !== 'tied');
    if (note.notations.length === 0) {
      delete note.notations;
    }
  }

  return success(result);
}

// ============================================================
// Slur Operations
// ============================================================

export interface AddSlurOptions {
  partIndex: number;
  startMeasureIndex: number;
  startNoteIndex: number;
  endMeasureIndex: number;
  endNoteIndex: number;
  number?: number;
  placement?: 'above' | 'below';
}

/**
 * Add a slur between two notes
 */
export function addSlur(
  score: Score,
  options: AddSlurOptions
): OperationResult<Score> {
  if (options.partIndex < 0 || options.partIndex >= score.parts.length) {
    return failure([operationError('PART_NOT_FOUND', `Part index ${options.partIndex} out of bounds`, { partIndex: options.partIndex })]);
  }

  const part = score.parts[options.partIndex];
  if (options.startMeasureIndex < 0 || options.startMeasureIndex >= part.measures.length) {
    return failure([operationError('MEASURE_NOT_FOUND', `Start measure index ${options.startMeasureIndex} out of bounds`, { partIndex: options.partIndex, measureIndex: options.startMeasureIndex })]);
  }
  if (options.endMeasureIndex < 0 || options.endMeasureIndex >= part.measures.length) {
    return failure([operationError('MEASURE_NOT_FOUND', `End measure index ${options.endMeasureIndex} out of bounds`, { partIndex: options.partIndex, measureIndex: options.endMeasureIndex })]);
  }

  const result = cloneScore(score);
  const startMeasure = result.parts[options.partIndex].measures[options.startMeasureIndex];
  const endMeasure = result.parts[options.partIndex].measures[options.endMeasureIndex];

  const startResult = findNoteByIndex(startMeasure, options.startNoteIndex);
  if (!startResult) {
    return failure([operationError('NOTE_NOT_FOUND', `Start note index ${options.startNoteIndex} not found`, { partIndex: options.partIndex, measureIndex: options.startMeasureIndex })]);
  }

  const endResult = findNoteByIndex(endMeasure, options.endNoteIndex);
  if (!endResult) {
    return failure([operationError('NOTE_NOT_FOUND', `End note index ${options.endNoteIndex} not found`, { partIndex: options.partIndex, measureIndex: options.endMeasureIndex })]);
  }

  const startNote = startResult.note;
  const endNote = endResult.note;
  const slurNumber = options.number ?? 1;

  // Check if slur with same number already exists on start note
  if (startNote.notations?.some(n => n.type === 'slur' && (n as SlurNotation).slurType === 'start' && ((n as SlurNotation).number ?? 1) === slurNumber)) {
    return failure([operationError('SLUR_ALREADY_EXISTS', `Slur ${slurNumber} already starts on this note`, { partIndex: options.partIndex, measureIndex: options.startMeasureIndex })]);
  }

  // Add slur start
  if (!startNote.notations) startNote.notations = [];
  startNote.notations.push({
    type: 'slur',
    slurType: 'start',
    number: slurNumber,
    placement: options.placement,
  } as SlurNotation);

  // Add slur stop
  if (!endNote.notations) endNote.notations = [];
  endNote.notations.push({
    type: 'slur',
    slurType: 'stop',
    number: slurNumber,
  } as SlurNotation);

  // Validate
  const validationResult = validate(result, { checkSlurs: true });
  const criticalErrors = validationResult.errors.filter(e => e.level === 'error');
  if (criticalErrors.length > 0) {
    return failure(criticalErrors);
  }

  return success(result, validationResult.warnings);
}

export interface RemoveSlurOptions {
  partIndex: number;
  measureIndex: number;
  noteIndex: number;
  number?: number;
}

/**
 * Remove a slur from a note
 */
export function removeSlur(
  score: Score,
  options: RemoveSlurOptions
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

  const noteResult = findNoteByIndex(measure, options.noteIndex);
  if (!noteResult) {
    return failure([operationError('NOTE_NOT_FOUND', `Note index ${options.noteIndex} not found`, { partIndex: options.partIndex, measureIndex: options.measureIndex })]);
  }

  const note = noteResult.note;
  const slurNumber = options.number ?? 1;

  if (!note.notations?.some(n => n.type === 'slur' && ((n as SlurNotation).number ?? 1) === slurNumber)) {
    return failure([operationError('SLUR_NOT_FOUND', `Slur ${slurNumber} not found on this note`, { partIndex: options.partIndex, measureIndex: options.measureIndex })]);
  }

  // Remove slur notation with matching number
  note.notations = note.notations.filter(n => !(n.type === 'slur' && ((n as SlurNotation).number ?? 1) === slurNumber));
  if (note.notations.length === 0) {
    delete note.notations;
  }

  return success(result);
}

// ============================================================
// Articulation Operations
// ============================================================

export interface AddArticulationOptions {
  partIndex: number;
  measureIndex: number;
  noteIndex: number;
  articulation: ArticulationType;
  placement?: 'above' | 'below';
}

/**
 * Add an articulation to a note
 */
export function addArticulation(
  score: Score,
  options: AddArticulationOptions
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

  const noteResult = findNoteByIndex(measure, options.noteIndex);
  if (!noteResult) {
    return failure([operationError('NOTE_NOT_FOUND', `Note index ${options.noteIndex} not found`, { partIndex: options.partIndex, measureIndex: options.measureIndex })]);
  }

  const note = noteResult.note;

  // Check if articulation already exists
  if (note.notations?.some(n => n.type === 'articulation' && (n as ArticulationNotation).articulation === options.articulation)) {
    return failure([operationError('ARTICULATION_ALREADY_EXISTS', `Articulation ${options.articulation} already exists on this note`, { partIndex: options.partIndex, measureIndex: options.measureIndex })]);
  }

  // Add articulation
  if (!note.notations) note.notations = [];
  note.notations.push({
    type: 'articulation',
    articulation: options.articulation,
    placement: options.placement,
  } as ArticulationNotation);

  return success(result);
}

export interface RemoveArticulationOptions {
  partIndex: number;
  measureIndex: number;
  noteIndex: number;
  articulation: ArticulationType;
}

/**
 * Remove an articulation from a note
 */
export function removeArticulation(
  score: Score,
  options: RemoveArticulationOptions
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

  const noteResult = findNoteByIndex(measure, options.noteIndex);
  if (!noteResult) {
    return failure([operationError('NOTE_NOT_FOUND', `Note index ${options.noteIndex} not found`, { partIndex: options.partIndex, measureIndex: options.measureIndex })]);
  }

  const note = noteResult.note;

  if (!note.notations?.some(n => n.type === 'articulation' && (n as ArticulationNotation).articulation === options.articulation)) {
    return failure([operationError('ARTICULATION_NOT_FOUND', `Articulation ${options.articulation} not found on this note`, { partIndex: options.partIndex, measureIndex: options.measureIndex })]);
  }

  // Remove articulation
  note.notations = note.notations.filter(n => !(n.type === 'articulation' && (n as ArticulationNotation).articulation === options.articulation));
  if (note.notations.length === 0) {
    delete note.notations;
  }

  return success(result);
}

// ============================================================
// Dynamics Operations
// ============================================================

export interface AddDynamicsOptions {
  partIndex: number;
  measureIndex: number;
  position: number;
  dynamics: DynamicsValue;
  staff?: number;
  placement?: 'above' | 'below';
}

/**
 * Calculate position for inserting a direction entry
 */
function getInsertPositionForDirection(measure: Measure, targetPosition: number): number {
  let position = 0;
  let insertIndex = 0;

  for (let i = 0; i < measure.entries.length; i++) {
    const entry = measure.entries[i];

    if (position >= targetPosition) {
      return insertIndex;
    }

    if (entry.type === 'note' && !entry.chord) {
      position += entry.duration;
    } else if (entry.type === 'backup') {
      position -= entry.duration;
    } else if (entry.type === 'forward') {
      position += entry.duration;
    }

    insertIndex = i + 1;
  }

  return insertIndex;
}

/**
 * Add a dynamics marking at a specific position in a measure
 */
export function addDynamics(
  score: Score,
  options: AddDynamicsOptions
): OperationResult<Score> {
  if (options.partIndex < 0 || options.partIndex >= score.parts.length) {
    return failure([operationError('PART_NOT_FOUND', `Part index ${options.partIndex} out of bounds`, { partIndex: options.partIndex })]);
  }

  const part = score.parts[options.partIndex];
  if (options.measureIndex < 0 || options.measureIndex >= part.measures.length) {
    return failure([operationError('MEASURE_NOT_FOUND', `Measure index ${options.measureIndex} out of bounds`, { partIndex: options.partIndex, measureIndex: options.measureIndex })]);
  }

  if (options.position < 0) {
    return failure([operationError('INVALID_POSITION', 'Position cannot be negative', { partIndex: options.partIndex, measureIndex: options.measureIndex })]);
  }

  const result = cloneScore(score);
  const measure = result.parts[options.partIndex].measures[options.measureIndex];

  // Create direction entry with dynamics
  const directionEntry: DirectionEntry = {
    type: 'direction',
    directionTypes: [{
      kind: 'dynamics',
      value: options.dynamics,
    }],
    placement: options.placement ?? 'below',
    staff: options.staff,
  };

  // Find insert position
  const insertIndex = getInsertPositionForDirection(measure, options.position);
  measure.entries.splice(insertIndex, 0, directionEntry);

  return success(result);
}

export interface RemoveDynamicsOptions {
  partIndex: number;
  measureIndex: number;
  directionIndex: number;
}

/**
 * Remove a dynamics direction from a measure
 */
export function removeDynamics(
  score: Score,
  options: RemoveDynamicsOptions
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

  // Find direction entries with dynamics
  let directionCount = 0;
  let targetIndex = -1;

  for (let i = 0; i < measure.entries.length; i++) {
    const entry = measure.entries[i];
    if (entry.type === 'direction') {
      const hasDynamics = entry.directionTypes.some(dt => dt.kind === 'dynamics');
      if (hasDynamics) {
        if (directionCount === options.directionIndex) {
          targetIndex = i;
          break;
        }
        directionCount++;
      }
    }
  }

  if (targetIndex === -1) {
    return failure([operationError('DYNAMICS_NOT_FOUND', `Dynamics direction index ${options.directionIndex} not found`, { partIndex: options.partIndex, measureIndex: options.measureIndex })]);
  }

  measure.entries.splice(targetIndex, 1);

  return success(result);
}

// ============================================================
// Clef Change Operations
// ============================================================

export interface InsertClefChangeOptions {
  partIndex: number;
  measureIndex: number;
  position: number;
  clef: Clef;
}

/**
 * Insert a clef change at a specific position within a measure
 */
export function insertClefChange(
  score: Score,
  options: InsertClefChangeOptions
): OperationResult<Score> {
  if (options.partIndex < 0 || options.partIndex >= score.parts.length) {
    return failure([operationError('PART_NOT_FOUND', `Part index ${options.partIndex} out of bounds`, { partIndex: options.partIndex })]);
  }

  const part = score.parts[options.partIndex];
  if (options.measureIndex < 0 || options.measureIndex >= part.measures.length) {
    return failure([operationError('MEASURE_NOT_FOUND', `Measure index ${options.measureIndex} out of bounds`, { partIndex: options.partIndex, measureIndex: options.measureIndex })]);
  }

  if (options.position < 0) {
    return failure([operationError('INVALID_POSITION', 'Position cannot be negative', { partIndex: options.partIndex, measureIndex: options.measureIndex })]);
  }

  // Validate clef
  const validSigns: Clef['sign'][] = ['G', 'F', 'C', 'percussion', 'TAB'];
  if (!validSigns.includes(options.clef.sign)) {
    return failure([operationError('INVALID_CLEF', `Invalid clef sign: ${options.clef.sign}`, { partIndex: options.partIndex, measureIndex: options.measureIndex })]);
  }

  const result = cloneScore(score);
  const measure = result.parts[options.partIndex].measures[options.measureIndex];

  if (options.position === 0) {
    // Insert at measure start - update or create measure attributes
    if (!measure.attributes) {
      measure.attributes = {};
    }

    const staff = options.clef.staff ?? 1;
    if (!measure.attributes.clef) {
      measure.attributes.clef = [];
    }

    // Replace existing clef for this staff or add new one
    const existingIndex = measure.attributes.clef.findIndex(c => (c.staff ?? 1) === staff);
    if (existingIndex >= 0) {
      measure.attributes.clef[existingIndex] = options.clef;
    } else {
      measure.attributes.clef.push(options.clef);
    }
  } else {
    // Insert mid-measure as AttributesEntry
    const attributesEntry: AttributesEntry = {
      type: 'attributes',
      attributes: {
        clef: [options.clef],
      },
    };

    const insertIndex = getInsertPositionForDirection(measure, options.position);
    measure.entries.splice(insertIndex, 0, attributesEntry);
  }

  // Validate
  const validationResult = validate(result, { checkStaffStructure: true });
  const criticalErrors = validationResult.errors.filter(e => e.level === 'error');
  if (criticalErrors.length > 0) {
    return failure(criticalErrors);
  }

  return success(result, validationResult.warnings);
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

// ============================================================
// Tuplet Operations
// ============================================================

export interface CreateTupletOptions {
  partIndex: number;
  measureIndex: number;
  /** Starting note index (0-based, counting pitched notes only) */
  startNoteIndex: number;
  /** Number of notes to include in the tuplet */
  noteCount: number;
  /** Actual notes in the time of normal notes (e.g., 3 for triplet) */
  actualNotes: number;
  /** Normal notes (e.g., 2 for triplet) */
  normalNotes: number;
  /** Show bracket (default: true) */
  bracket?: boolean;
  /** Show number display (default: 'actual') */
  showNumber?: 'actual' | 'both' | 'none';
}

/**
 * Create a tuplet from consecutive notes.
 * A tuplet fits `actualNotes` notes in the time of `normalNotes` (e.g., 3 in the time of 2 for triplets).
 *
 * @example
 * // Create a triplet from 3 eighth notes (3 in the time of 2)
 * createTuplet(score, {
 *   partIndex: 0,
 *   measureIndex: 0,
 *   startNoteIndex: 0,
 *   noteCount: 3,
 *   actualNotes: 3,
 *   normalNotes: 2,
 * })
 */
export function createTuplet(
  score: Score,
  options: CreateTupletOptions
): OperationResult<Score> {
  // Validate bounds
  if (options.partIndex < 0 || options.partIndex >= score.parts.length) {
    return failure([operationError('PART_NOT_FOUND', `Part index ${options.partIndex} out of bounds`, { partIndex: options.partIndex })]);
  }

  const part = score.parts[options.partIndex];
  if (options.measureIndex < 0 || options.measureIndex >= part.measures.length) {
    return failure([operationError('MEASURE_NOT_FOUND', `Measure index ${options.measureIndex} out of bounds`, { partIndex: options.partIndex, measureIndex: options.measureIndex })]);
  }

  if (options.noteCount < 2) {
    return failure([operationError('INVALID_DURATION', 'Tuplet must contain at least 2 notes', { partIndex: options.partIndex, measureIndex: options.measureIndex })]);
  }

  if (options.actualNotes < 2 || options.normalNotes < 1) {
    return failure([operationError('INVALID_DURATION', 'Invalid tuplet ratio', { partIndex: options.partIndex, measureIndex: options.measureIndex })]);
  }

  const result = cloneScore(score);
  const measure = result.parts[options.partIndex].measures[options.measureIndex];

  // Find the notes to include in the tuplet
  const notes: Array<{ note: NoteEntry; entryIndex: number }> = [];
  let noteCount = 0;

  for (let i = 0; i < measure.entries.length; i++) {
    const entry = measure.entries[i];
    if (entry.type === 'note' && !entry.rest && !entry.chord) {
      if (noteCount >= options.startNoteIndex && noteCount < options.startNoteIndex + options.noteCount) {
        notes.push({ note: entry, entryIndex: i });
      }
      noteCount++;
    }
  }

  if (notes.length !== options.noteCount) {
    return failure([operationError('NOTE_NOT_FOUND', `Could not find ${options.noteCount} notes starting at index ${options.startNoteIndex}`, { partIndex: options.partIndex, measureIndex: options.measureIndex })]);
  }

  // Check that all notes have the same voice
  const voice = notes[0].note.voice;
  if (!notes.every(n => n.note.voice === voice)) {
    return failure([operationError('NOTE_CONFLICT', 'All notes in a tuplet must be in the same voice', { partIndex: options.partIndex, measureIndex: options.measureIndex, voice })]);
  }

  // Apply tuplet modifications to each note
  const tupletNumber = 1; // Use tuplet number 1 by default

  for (let i = 0; i < notes.length; i++) {
    const { note } = notes[i];

    // Add time modification
    note.timeModification = {
      actualNotes: options.actualNotes,
      normalNotes: options.normalNotes,
    };

    // Add tuplet notations
    if (!note.notations) note.notations = [];

    if (i === 0) {
      // First note: tuplet start
      note.notations.push({
        type: 'tuplet',
        tupletType: 'start',
        number: tupletNumber,
        bracket: options.bracket ?? true,
        showNumber: options.showNumber ?? 'actual',
        tupletActual: { tupletNumber: options.actualNotes },
        tupletNormal: { tupletNumber: options.normalNotes },
      });
    } else if (i === notes.length - 1) {
      // Last note: tuplet stop
      note.notations.push({
        type: 'tuplet',
        tupletType: 'stop',
        number: tupletNumber,
      });
    }
    // Middle notes don't need tuplet notation, just timeModification
  }

  // Validate
  const context = getMeasureContext(result, options.partIndex, options.measureIndex);
  const errors = validateMeasureLocal(measure, context, {
    checkTuplets: true,
    checkMeasureDuration: true,
  });

  const criticalErrors = errors.filter(e => e.level === 'error');
  if (criticalErrors.length > 0) {
    return failure(criticalErrors);
  }

  return success(result, errors.filter(e => e.level !== 'error'));
}

export interface RemoveTupletOptions {
  partIndex: number;
  measureIndex: number;
  /** Note index of any note within the tuplet */
  noteIndex: number;
}

/**
 * Remove tuplet from notes.
 * Finds the tuplet containing the specified note and removes all tuplet information.
 */
export function removeTuplet(
  score: Score,
  options: RemoveTupletOptions
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

  // Find the target note
  let noteCount = 0;
  let targetNote: NoteEntry | null = null;
  let targetEntryIndex = -1;

  for (let i = 0; i < measure.entries.length; i++) {
    const entry = measure.entries[i];
    if (entry.type === 'note' && !entry.rest) {
      if (noteCount === options.noteIndex) {
        targetNote = entry;
        targetEntryIndex = i;
        break;
      }
      noteCount++;
    }
  }

  if (!targetNote || targetEntryIndex === -1) {
    return failure([operationError('NOTE_NOT_FOUND', `Note index ${options.noteIndex} not found`, { partIndex: options.partIndex, measureIndex: options.measureIndex })]);
  }

  // Check if note is in a tuplet
  if (!targetNote.timeModification) {
    return failure([operationError('NOTE_NOT_FOUND', 'Note is not part of a tuplet', { partIndex: options.partIndex, measureIndex: options.measureIndex })]);
  }

  // Find all notes in the same tuplet (same voice, contiguous notes with same timeModification)
  const voice = targetNote.voice;
  const staff = targetNote.staff;
  const actualNotes = targetNote.timeModification.actualNotes;
  const normalNotes = targetNote.timeModification.normalNotes;

  const tupletNotes: NoteEntry[] = [];
  let inTuplet = false;

  for (const entry of measure.entries) {
    if (entry.type !== 'note' || entry.rest) continue;
    if (entry.voice !== voice || entry.staff !== staff) continue;

    const hasSameTimeModification =
      entry.timeModification?.actualNotes === actualNotes &&
      entry.timeModification?.normalNotes === normalNotes;

    // Check for tuplet start
    const hasTupletStart = entry.notations?.some(
      n => n.type === 'tuplet' && n.tupletType === 'start'
    );

    // Check for tuplet stop
    const hasTupletStop = entry.notations?.some(
      n => n.type === 'tuplet' && n.tupletType === 'stop'
    );

    if (hasTupletStart) {
      inTuplet = true;
    }

    if (inTuplet && hasSameTimeModification) {
      tupletNotes.push(entry);
    }

    if (hasTupletStop && inTuplet) {
      // Check if this tuplet contains our target note
      if (tupletNotes.includes(targetNote)) {
        break;
      } else {
        // Reset and continue looking
        tupletNotes.length = 0;
        inTuplet = false;
      }
    }
  }

  // If we didn't find a complete tuplet, just remove from the individual note
  if (tupletNotes.length === 0) {
    tupletNotes.push(targetNote);
  }

  // Remove tuplet information from all notes
  for (const note of tupletNotes) {
    delete note.timeModification;

    if (note.notations) {
      note.notations = note.notations.filter(n => n.type !== 'tuplet');
      if (note.notations.length === 0) {
        delete note.notations;
      }
    }
  }

  return success(result);
}

// ============================================================
// Beam Operations
// ============================================================

export interface AddBeamOptions {
  partIndex: number;
  measureIndex: number;
  /** Starting note index */
  startNoteIndex: number;
  /** Number of notes to beam together */
  noteCount: number;
  /** Beam level (1 = eighth notes, 2 = sixteenth notes, etc.) */
  beamLevel?: number;
}

/**
 * Add beaming to consecutive notes.
 * Notes must be in the same voice and should be eighth notes or shorter.
 */
export function addBeam(
  score: Score,
  options: AddBeamOptions
): OperationResult<Score> {
  if (options.partIndex < 0 || options.partIndex >= score.parts.length) {
    return failure([operationError('PART_NOT_FOUND', `Part index ${options.partIndex} out of bounds`, { partIndex: options.partIndex })]);
  }

  const part = score.parts[options.partIndex];
  if (options.measureIndex < 0 || options.measureIndex >= part.measures.length) {
    return failure([operationError('MEASURE_NOT_FOUND', `Measure index ${options.measureIndex} out of bounds`, { partIndex: options.partIndex, measureIndex: options.measureIndex })]);
  }

  if (options.noteCount < 2) {
    return failure([operationError('INVALID_DURATION', 'Beam must contain at least 2 notes', { partIndex: options.partIndex, measureIndex: options.measureIndex })]);
  }

  const result = cloneScore(score);
  const measure = result.parts[options.partIndex].measures[options.measureIndex];
  const beamLevel = options.beamLevel ?? 1;

  // Find the notes to beam
  const notes: NoteEntry[] = [];
  let noteCount = 0;

  for (const entry of measure.entries) {
    if (entry.type === 'note' && !entry.rest && !entry.chord) {
      if (noteCount >= options.startNoteIndex && noteCount < options.startNoteIndex + options.noteCount) {
        notes.push(entry);
      }
      noteCount++;
    }
  }

  if (notes.length !== options.noteCount) {
    return failure([operationError('NOTE_NOT_FOUND', `Could not find ${options.noteCount} notes starting at index ${options.startNoteIndex}`, { partIndex: options.partIndex, measureIndex: options.measureIndex })]);
  }

  // Check that all notes are in the same voice
  const voice = notes[0].voice;
  if (!notes.every(n => n.voice === voice)) {
    return failure([operationError('NOTE_CONFLICT', 'All beamed notes must be in the same voice', { partIndex: options.partIndex, measureIndex: options.measureIndex, voice })]);
  }

  // Add beam information to each note
  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];

    // Initialize or update beam array
    if (!note.beam) {
      note.beam = [];
    }

    // Remove existing beam for this level
    note.beam = note.beam.filter(b => b.number !== beamLevel);

    // Add new beam
    let beamType: 'begin' | 'continue' | 'end';
    if (i === 0) {
      beamType = 'begin';
    } else if (i === notes.length - 1) {
      beamType = 'end';
    } else {
      beamType = 'continue';
    }

    note.beam.push({
      number: beamLevel,
      type: beamType,
    });
  }

  // Validate
  const context = getMeasureContext(result, options.partIndex, options.measureIndex);
  const errors = validateMeasureLocal(measure, context, { checkBeams: true });

  const criticalErrors = errors.filter(e => e.level === 'error');
  if (criticalErrors.length > 0) {
    return failure(criticalErrors);
  }

  return success(result, errors.filter(e => e.level !== 'error'));
}

export interface RemoveBeamOptions {
  partIndex: number;
  measureIndex: number;
  /** Note index of any note within the beam group */
  noteIndex: number;
  /** Beam level to remove (default: all levels) */
  beamLevel?: number;
}

/**
 * Remove beaming from notes.
 */
export function removeBeam(
  score: Score,
  options: RemoveBeamOptions
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

  // Find the target note
  let noteCount = 0;
  let targetNote: NoteEntry | null = null;

  for (const entry of measure.entries) {
    if (entry.type === 'note' && !entry.rest) {
      if (noteCount === options.noteIndex) {
        targetNote = entry;
        break;
      }
      noteCount++;
    }
  }

  if (!targetNote) {
    return failure([operationError('NOTE_NOT_FOUND', `Note index ${options.noteIndex} not found`, { partIndex: options.partIndex, measureIndex: options.measureIndex })]);
  }

  if (!targetNote.beam || targetNote.beam.length === 0) {
    return failure([operationError('NOTE_NOT_FOUND', 'Note is not part of a beam group', { partIndex: options.partIndex, measureIndex: options.measureIndex })]);
  }

  const voice = targetNote.voice;
  const staff = targetNote.staff;

  // Find all notes in the same beam group
  const beamNotes: NoteEntry[] = [];
  let inBeam = false;
  const targetBeamLevel = options.beamLevel ?? targetNote.beam[0]?.number ?? 1;

  for (const entry of measure.entries) {
    if (entry.type !== 'note' || entry.rest) continue;
    if (entry.voice !== voice || entry.staff !== staff) continue;

    const beamInfo = entry.beam?.find(b => b.number === targetBeamLevel);
    if (!beamInfo) {
      if (inBeam) {
        // End of beam group
        break;
      }
      continue;
    }

    if (beamInfo.type === 'begin') {
      inBeam = true;
      beamNotes.push(entry);
    } else if (beamInfo.type === 'continue') {
      if (inBeam) beamNotes.push(entry);
    } else if (beamInfo.type === 'end') {
      beamNotes.push(entry);
      // Check if this beam group contains our target
      if (beamNotes.includes(targetNote)) {
        break;
      } else {
        // Reset and continue looking
        beamNotes.length = 0;
        inBeam = false;
      }
    }
  }

  // If we didn't find a complete beam, just remove from the individual note
  if (beamNotes.length === 0) {
    beamNotes.push(targetNote);
  }

  // Remove beam information from all notes
  for (const note of beamNotes) {
    if (note.beam) {
      if (options.beamLevel !== undefined) {
        note.beam = note.beam.filter(b => b.number !== options.beamLevel);
      } else {
        note.beam = [];
      }
      if (note.beam.length === 0) {
        delete note.beam;
      }
    }
  }

  return success(result);
}

export interface AutoBeamOptions {
  partIndex: number;
  measureIndex: number;
  /** Optional voice filter */
  voice?: number;
  /** Group by beat (default: true) */
  groupByBeat?: boolean;
}

/**
 * Automatically beam notes based on time signature and beat groupings.
 * Groups eighth notes and shorter notes by beat.
 */
export function autoBeam(
  score: Score,
  options: AutoBeamOptions
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

  // Get context for time signature
  const context = getMeasureContext(result, options.partIndex, options.measureIndex);
  const divisions = context.divisions;
  const time = context.time ?? { beats: '4', beatType: 4 };
  const beatDuration = (4 / time.beatType) * divisions; // Duration of one beat in divisions

  // First, remove all existing beams
  for (const entry of measure.entries) {
    if (entry.type === 'note') {
      delete entry.beam;
    }
  }

  // Collect notes with their positions
  const notesByVoice = new Map<number, Array<{ note: NoteEntry; position: number }>>();
  let position = 0;

  for (const entry of measure.entries) {
    if (entry.type === 'note') {
      if (!entry.chord && !entry.rest) {
        const voice = entry.voice;
        if (options.voice === undefined || voice === options.voice) {
          if (!notesByVoice.has(voice)) {
            notesByVoice.set(voice, []);
          }
          notesByVoice.get(voice)!.push({ note: entry, position });
        }
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

  // Beam each voice
  for (const [, notes] of notesByVoice) {
    // Group notes by beat
    const beatGroups: Array<Array<{ note: NoteEntry; position: number }>> = [];
    let currentBeat = -1;
    let currentGroup: Array<{ note: NoteEntry; position: number }> = [];

    for (const { note, position: notePos } of notes) {
      // Only beam eighth notes and shorter (duration <= half a beat)
      if (note.duration > beatDuration / 2) {
        // This note is too long to beam
        if (currentGroup.length >= 2) {
          beatGroups.push(currentGroup);
        }
        currentGroup = [];
        currentBeat = -1;
        continue;
      }

      const beat = Math.floor(notePos / beatDuration);

      if (options.groupByBeat !== false && beat !== currentBeat) {
        // New beat - save current group if valid
        if (currentGroup.length >= 2) {
          beatGroups.push(currentGroup);
        }
        currentGroup = [{ note, position: notePos }];
        currentBeat = beat;
      } else {
        currentGroup.push({ note, position: notePos });
      }
    }

    // Don't forget the last group
    if (currentGroup.length >= 2) {
      beatGroups.push(currentGroup);
    }

    // Apply beaming to each group
    for (const group of beatGroups) {
      for (let i = 0; i < group.length; i++) {
        const { note } = group[i];

        if (!note.beam) {
          note.beam = [];
        }

        let beamType: 'begin' | 'continue' | 'end';
        if (i === 0) {
          beamType = 'begin';
        } else if (i === group.length - 1) {
          beamType = 'end';
        } else {
          beamType = 'continue';
        }

        note.beam.push({
          number: 1,
          type: beamType,
        });
      }
    }
  }

  // Validate
  const errors = validateMeasureLocal(measure, context, { checkBeams: true });

  const criticalErrors = errors.filter(e => e.level === 'error');
  if (criticalErrors.length > 0) {
    return failure(criticalErrors);
  }

  return success(result, errors.filter(e => e.level !== 'error'));
}

// ============================================================
// Copy/Paste Operations
// ============================================================

/**
 * Selection represents copied content that can be pasted
 */
export interface NoteSelection {
  /** Source information */
  source: {
    partIndex: number;
    measureIndex: number;
    startPosition: number;
    endPosition: number;
    voice: number;
    staff?: number;
  };
  /** Copied notes with their relative positions */
  notes: Array<{
    /** Relative position from selection start */
    relativePosition: number;
    /** Note data (deep cloned) */
    note: NoteEntry;
  }>;
  /** Total duration of the selection */
  duration: number;
}

export interface CopyNotesOptions {
  partIndex: number;
  measureIndex: number;
  /** Start position in the measure (in divisions) */
  startPosition: number;
  /** End position in the measure (in divisions) */
  endPosition: number;
  /** Voice to copy from */
  voice: number;
  /** Staff to copy from (optional) */
  staff?: number;
}

/**
 * Copy notes from a range in a measure.
 * Returns a NoteSelection that can be used with pasteNotes.
 */
export function copyNotes(
  score: Score,
  options: CopyNotesOptions
): OperationResult<NoteSelection> {
  if (options.partIndex < 0 || options.partIndex >= score.parts.length) {
    return failure([operationError('PART_NOT_FOUND', `Part index ${options.partIndex} out of bounds`, { partIndex: options.partIndex })]);
  }

  const part = score.parts[options.partIndex];
  if (options.measureIndex < 0 || options.measureIndex >= part.measures.length) {
    return failure([operationError('MEASURE_NOT_FOUND', `Measure index ${options.measureIndex} out of bounds`, { partIndex: options.partIndex, measureIndex: options.measureIndex })]);
  }

  if (options.startPosition >= options.endPosition) {
    return failure([operationError('INVALID_POSITION', 'Start position must be less than end position', { partIndex: options.partIndex, measureIndex: options.measureIndex })]);
  }

  const measure = part.measures[options.measureIndex];

  // Collect notes in the range
  const copiedNotes: NoteSelection['notes'] = [];
  let position = 0;

  for (const entry of measure.entries) {
    if (entry.type === 'note') {
      if (entry.voice === options.voice &&
          (options.staff === undefined || (entry.staff ?? 1) === options.staff)) {
        if (!entry.chord) {
          const noteEnd = position + entry.duration;

          // Check if note overlaps with the selection range
          if (position < options.endPosition && noteEnd > options.startPosition) {
            // Deep clone the note
            const clonedNote: NoteEntry = JSON.parse(JSON.stringify(entry));

            // Clear notations that shouldn't be copied (like ties that might be broken)
            if (clonedNote.tie) {
              // Keep tie info, but it will be handled during paste
            }

            copiedNotes.push({
              relativePosition: position - options.startPosition,
              note: clonedNote,
            });
          }
          position += entry.duration;
        } else {
          // Chord note - copy if the parent note was copied
          if (copiedNotes.length > 0) {
            const lastCopied = copiedNotes[copiedNotes.length - 1];
            if (lastCopied.note.voice === entry.voice &&
                (options.staff === undefined || (lastCopied.note.staff ?? 1) === (entry.staff ?? 1))) {
              const clonedNote: NoteEntry = JSON.parse(JSON.stringify(entry));
              copiedNotes.push({
                relativePosition: lastCopied.relativePosition,
                note: clonedNote,
              });
            }
          }
        }
      } else if (!entry.chord) {
        position += entry.duration;
      }
    } else if (entry.type === 'backup') {
      position -= entry.duration;
    } else if (entry.type === 'forward') {
      position += entry.duration;
    }
  }

  if (copiedNotes.length === 0) {
    return failure([operationError('NOTE_NOT_FOUND', 'No notes found in the specified range', { partIndex: options.partIndex, measureIndex: options.measureIndex, voice: options.voice })]);
  }

  const selection: NoteSelection = {
    source: {
      partIndex: options.partIndex,
      measureIndex: options.measureIndex,
      startPosition: options.startPosition,
      endPosition: options.endPosition,
      voice: options.voice,
      staff: options.staff,
    },
    notes: copiedNotes,
    duration: options.endPosition - options.startPosition,
  };

  return success(selection);
}

export interface PasteNotesOptions {
  /** Selection to paste */
  selection: NoteSelection;
  /** Target part index */
  partIndex: number;
  /** Target measure index */
  measureIndex: number;
  /** Target position in the measure */
  position: number;
  /** Target voice (defaults to original voice) */
  voice?: number;
  /** Target staff (defaults to original staff) */
  staff?: number;
  /** Clear existing notes in the paste range (default: true) */
  overwrite?: boolean;
}

/**
 * Paste notes from a NoteSelection to a target position.
 */
export function pasteNotes(
  score: Score,
  options: PasteNotesOptions
): OperationResult<Score> {
  if (options.partIndex < 0 || options.partIndex >= score.parts.length) {
    return failure([operationError('PART_NOT_FOUND', `Part index ${options.partIndex} out of bounds`, { partIndex: options.partIndex })]);
  }

  const part = score.parts[options.partIndex];
  if (options.measureIndex < 0 || options.measureIndex >= part.measures.length) {
    return failure([operationError('MEASURE_NOT_FOUND', `Measure index ${options.measureIndex} out of bounds`, { partIndex: options.partIndex, measureIndex: options.measureIndex })]);
  }

  if (options.position < 0) {
    return failure([operationError('INVALID_POSITION', 'Position cannot be negative', { partIndex: options.partIndex, measureIndex: options.measureIndex })]);
  }

  const result = cloneScore(score);
  const measure = result.parts[options.partIndex].measures[options.measureIndex];

  // Get context
  const context = getMeasureContext(result, options.partIndex, options.measureIndex);
  const measureDuration = context.time
    ? getMeasureDuration(context.divisions, context.time)
    : context.divisions * 4;

  const targetVoice = options.voice ?? options.selection.source.voice;
  const targetStaff = options.staff ?? options.selection.source.staff;
  const pasteEnd = options.position + options.selection.duration;

  // Check if paste would exceed measure
  if (pasteEnd > measureDuration) {
    return failure([operationError(
      'EXCEEDS_MEASURE',
      `Paste would exceed measure duration (ends at ${pasteEnd}, measure is ${measureDuration})`,
      { partIndex: options.partIndex, measureIndex: options.measureIndex },
      { pasteEnd, measureDuration }
    )]);
  }

  // Get voice entries and check for conflicts (unless overwrite is true)
  const voiceEntries = getVoiceEntries(measure, targetVoice, targetStaff);

  if (options.overwrite !== false) {
    // Remove notes in the paste range
    const entriesToKeep = voiceEntries.filter(e => {
      if (e.entry.type !== 'note') return true;
      const note = e.entry as NoteEntry;
      if (note.rest) return true;
      // Keep notes that don't overlap with paste range
      return e.endPosition <= options.position || e.position >= pasteEnd;
    });

    // Rebuild entries for this voice
    const newEntries: Array<{ position: number; entry: NoteEntry }> = [];

    for (const { position, entry } of entriesToKeep) {
      if (entry.type === 'note') {
        newEntries.push({ position, entry: entry as NoteEntry });
      }
    }

    // Add pasted notes
    for (const { relativePosition, note } of options.selection.notes) {
      const pastePosition = options.position + Math.max(0, relativePosition);

      // Clone and update the note
      const newNote: NoteEntry = JSON.parse(JSON.stringify(note));
      newNote.voice = targetVoice;
      if (targetStaff !== undefined) {
        newNote.staff = targetStaff;
      }

      // Clear ties when pasting (they would be broken)
      delete newNote.tie;
      delete newNote.ties;
      if (newNote.notations) {
        newNote.notations = newNote.notations.filter(n => n.type !== 'tied');
        if (newNote.notations.length === 0) {
          delete newNote.notations;
        }
      }

      newEntries.push({ position: pastePosition, entry: newNote });
    }

    // Rebuild measure
    measure.entries = rebuildMeasureWithVoice(
      measure,
      targetVoice,
      newEntries,
      measureDuration,
      targetStaff
    );
  } else {
    // Check for conflicts
    const { hasNotes, conflictingNotes } = hasNotesInRange(voiceEntries, options.position, pasteEnd);

    if (hasNotes) {
      return failure([operationError(
        'NOTE_CONFLICT',
        `Paste range ${options.position}-${pasteEnd} conflicts with existing notes`,
        { partIndex: options.partIndex, measureIndex: options.measureIndex, voice: targetVoice },
        { conflictingPositions: conflictingNotes.map(n => ({ start: n.position, end: n.endPosition })) }
      )]);
    }

    // Get existing notes and add pasted notes
    const existingNotes = voiceEntries
      .filter(e => e.entry.type === 'note')
      .map(e => ({ position: e.position, entry: e.entry as NoteEntry }));

    for (const { relativePosition, note } of options.selection.notes) {
      const pastePosition = options.position + Math.max(0, relativePosition);

      const newNote: NoteEntry = JSON.parse(JSON.stringify(note));
      newNote.voice = targetVoice;
      if (targetStaff !== undefined) {
        newNote.staff = targetStaff;
      }

      delete newNote.tie;
      delete newNote.ties;
      if (newNote.notations) {
        newNote.notations = newNote.notations.filter(n => n.type !== 'tied');
        if (newNote.notations.length === 0) {
          delete newNote.notations;
        }
      }

      existingNotes.push({ position: pastePosition, entry: newNote });
    }

    measure.entries = rebuildMeasureWithVoice(
      measure,
      targetVoice,
      existingNotes,
      measureDuration,
      targetStaff
    );
  }

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

export interface CutNotesOptions extends CopyNotesOptions {}

/**
 * Cut notes from a range (copy and delete).
 * Returns both the selection and the modified score.
 */
export function cutNotes(
  score: Score,
  options: CutNotesOptions
): OperationResult<{ score: Score; selection: NoteSelection }> {
  // First, copy the notes
  const copyResult = copyNotes(score, options);
  if (!copyResult.success) {
    return failure(copyResult.errors);
  }

  const selection = copyResult.data;

  // Then, delete the notes from the score
  const result = cloneScore(score);
  const measure = result.parts[options.partIndex].measures[options.measureIndex];

  // Get context
  const context = getMeasureContext(result, options.partIndex, options.measureIndex);
  const measureDuration = context.time
    ? getMeasureDuration(context.divisions, context.time)
    : context.divisions * 4;

  // Get voice entries and remove notes in the cut range
  const voiceEntries = getVoiceEntries(measure, options.voice, options.staff);

  const entriesToKeep = voiceEntries.filter(e => {
    if (e.entry.type !== 'note') return true;
    const note = e.entry as NoteEntry;
    if (note.rest) return true;
    // Keep notes that don't overlap with cut range
    return e.endPosition <= options.startPosition || e.position >= options.endPosition;
  });

  // Rebuild entries for this voice
  const newEntries: Array<{ position: number; entry: NoteEntry }> = [];

  for (const { position, entry } of entriesToKeep) {
    if (entry.type === 'note') {
      newEntries.push({ position, entry: entry as NoteEntry });
    }
  }

  // Rebuild measure (rests will fill the gap)
  measure.entries = rebuildMeasureWithVoice(
    measure,
    options.voice,
    newEntries,
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

  return success(
    { score: result, selection },
    errors.filter(e => e.level !== 'error')
  );
}

export interface CopyNotesMultiMeasureOptions {
  partIndex: number;
  /** Starting measure index */
  startMeasureIndex: number;
  /** Ending measure index (inclusive) */
  endMeasureIndex: number;
  /** Voice to copy from */
  voice: number;
  /** Staff to copy from (optional) */
  staff?: number;
}

/**
 * Selection for multiple measures
 */
export interface MultiMeasureSelection {
  source: {
    partIndex: number;
    startMeasureIndex: number;
    endMeasureIndex: number;
    voice: number;
    staff?: number;
  };
  /** Notes grouped by measure offset */
  measures: Array<{
    measureOffset: number;
    notes: Array<{
      relativePosition: number;
      note: NoteEntry;
    }>;
  }>;
}

/**
 * Copy notes across multiple measures.
 */
export function copyNotesMultiMeasure(
  score: Score,
  options: CopyNotesMultiMeasureOptions
): OperationResult<MultiMeasureSelection> {
  if (options.partIndex < 0 || options.partIndex >= score.parts.length) {
    return failure([operationError('PART_NOT_FOUND', `Part index ${options.partIndex} out of bounds`, { partIndex: options.partIndex })]);
  }

  const part = score.parts[options.partIndex];
  if (options.startMeasureIndex < 0 || options.startMeasureIndex >= part.measures.length) {
    return failure([operationError('MEASURE_NOT_FOUND', `Start measure index ${options.startMeasureIndex} out of bounds`, { partIndex: options.partIndex, measureIndex: options.startMeasureIndex })]);
  }
  if (options.endMeasureIndex < options.startMeasureIndex || options.endMeasureIndex >= part.measures.length) {
    return failure([operationError('MEASURE_NOT_FOUND', `End measure index ${options.endMeasureIndex} out of bounds`, { partIndex: options.partIndex, measureIndex: options.endMeasureIndex })]);
  }

  const selection: MultiMeasureSelection = {
    source: {
      partIndex: options.partIndex,
      startMeasureIndex: options.startMeasureIndex,
      endMeasureIndex: options.endMeasureIndex,
      voice: options.voice,
      staff: options.staff,
    },
    measures: [],
  };

  for (let measureIndex = options.startMeasureIndex; measureIndex <= options.endMeasureIndex; measureIndex++) {
    const measure = part.measures[measureIndex];
    const measureOffset = measureIndex - options.startMeasureIndex;

    const copiedNotes: Array<{ relativePosition: number; note: NoteEntry }> = [];
    let position = 0;

    for (const entry of measure.entries) {
      if (entry.type === 'note') {
        if (entry.voice === options.voice &&
            (options.staff === undefined || (entry.staff ?? 1) === options.staff)) {
          if (!entry.chord && !entry.rest) {
            const clonedNote: NoteEntry = JSON.parse(JSON.stringify(entry));
            copiedNotes.push({
              relativePosition: position,
              note: clonedNote,
            });
            position += entry.duration;
          } else if (entry.chord && copiedNotes.length > 0) {
            const clonedNote: NoteEntry = JSON.parse(JSON.stringify(entry));
            copiedNotes.push({
              relativePosition: copiedNotes[copiedNotes.length - 1].relativePosition,
              note: clonedNote,
            });
          } else if (!entry.chord) {
            position += entry.duration;
          }
        } else if (!entry.chord) {
          position += entry.duration;
        }
      } else if (entry.type === 'backup') {
        position -= entry.duration;
      } else if (entry.type === 'forward') {
        position += entry.duration;
      }
    }

    if (copiedNotes.length > 0) {
      selection.measures.push({
        measureOffset,
        notes: copiedNotes,
      });
    }
  }

  if (selection.measures.length === 0) {
    return failure([operationError('NOTE_NOT_FOUND', 'No notes found in the specified range', { partIndex: options.partIndex, voice: options.voice })]);
  }

  return success(selection);
}

export interface PasteNotesMultiMeasureOptions {
  selection: MultiMeasureSelection;
  partIndex: number;
  /** Target starting measure index */
  startMeasureIndex: number;
  /** Target voice (defaults to original voice) */
  voice?: number;
  /** Target staff (defaults to original staff) */
  staff?: number;
  /** Clear existing notes in paste measures (default: true) */
  overwrite?: boolean;
}

/**
 * Paste notes across multiple measures.
 */
export function pasteNotesMultiMeasure(
  score: Score,
  options: PasteNotesMultiMeasureOptions
): OperationResult<Score> {
  if (options.partIndex < 0 || options.partIndex >= score.parts.length) {
    return failure([operationError('PART_NOT_FOUND', `Part index ${options.partIndex} out of bounds`, { partIndex: options.partIndex })]);
  }

  const part = score.parts[options.partIndex];
  const measureCount = options.selection.measures.length > 0
    ? options.selection.measures[options.selection.measures.length - 1].measureOffset + 1
    : 0;

  if (options.startMeasureIndex + measureCount > part.measures.length) {
    return failure([operationError('MEASURE_NOT_FOUND', `Not enough measures to paste (need ${measureCount})`, { partIndex: options.partIndex, measureIndex: options.startMeasureIndex })]);
  }

  let result = cloneScore(score);
  const targetVoice = options.voice ?? options.selection.source.voice;
  const targetStaff = options.staff ?? options.selection.source.staff;

  for (const measureData of options.selection.measures) {
    const measureIndex = options.startMeasureIndex + measureData.measureOffset;
    const measure = result.parts[options.partIndex].measures[measureIndex];

    const context = getMeasureContext(result, options.partIndex, measureIndex);
    const measureDuration = context.time
      ? getMeasureDuration(context.divisions, context.time)
      : context.divisions * 4;

    const voiceEntries = getVoiceEntries(measure, targetVoice, targetStaff);

    // Remove existing notes if overwriting
    let entriesToKeep: Array<{ position: number; entry: NoteEntry }>;

    if (options.overwrite !== false) {
      entriesToKeep = voiceEntries
        .filter(e => e.entry.type === 'note' && (e.entry as NoteEntry).rest)
        .map(e => ({ position: e.position, entry: e.entry as NoteEntry }));
    } else {
      entriesToKeep = voiceEntries
        .filter(e => e.entry.type === 'note')
        .map(e => ({ position: e.position, entry: e.entry as NoteEntry }));
    }

    // Add pasted notes
    for (const { relativePosition, note } of measureData.notes) {
      const newNote: NoteEntry = JSON.parse(JSON.stringify(note));
      newNote.voice = targetVoice;
      if (targetStaff !== undefined) {
        newNote.staff = targetStaff;
      }

      // Clear ties
      delete newNote.tie;
      delete newNote.ties;
      if (newNote.notations) {
        newNote.notations = newNote.notations.filter(n => n.type !== 'tied');
        if (newNote.notations.length === 0) {
          delete newNote.notations;
        }
      }

      entriesToKeep.push({ position: relativePosition, entry: newNote });
    }

    measure.entries = rebuildMeasureWithVoice(
      measure,
      targetVoice,
      entriesToKeep,
      measureDuration,
      targetStaff
    );

    // Validate this measure
    const errors = validateMeasureLocal(measure, context, {
      checkMeasureDuration: true,
      checkPosition: true,
      checkVoiceStaff: true,
    });

    const criticalErrors = errors.filter(e => e.level === 'error');
    if (criticalErrors.length > 0) {
      return failure(criticalErrors);
    }
  }

  return success(result);
}

// ============================================================
// Expression / Performance Direction Operations
// ============================================================

export interface AddTempoOptions {
  partIndex: number;
  measureIndex: number;
  /** Position in divisions within the measure */
  position: number;
  /** Tempo in BPM */
  bpm: number;
  /** Beat unit (e.g., 'quarter', 'half', 'eighth') */
  beatUnit?: 'whole' | 'half' | 'quarter' | 'eighth' | '16th';
  /** Whether beat unit has a dot */
  beatUnitDot?: boolean;
  /** Text description (e.g., 'Allegro', 'Andante') */
  text?: string;
  /** Placement (above/below staff) */
  placement?: 'above' | 'below';
}

/**
 * Add a tempo marking to a measure.
 */
export function addTempo(
  score: Score,
  options: AddTempoOptions
): OperationResult<Score> {
  if (options.partIndex < 0 || options.partIndex >= score.parts.length) {
    return failure([operationError('PART_NOT_FOUND', `Part index ${options.partIndex} out of bounds`, { partIndex: options.partIndex })]);
  }

  const part = score.parts[options.partIndex];
  if (options.measureIndex < 0 || options.measureIndex >= part.measures.length) {
    return failure([operationError('MEASURE_NOT_FOUND', `Measure index ${options.measureIndex} out of bounds`, { partIndex: options.partIndex, measureIndex: options.measureIndex })]);
  }

  if (options.bpm <= 0) {
    return failure([operationError('INVALID_DURATION', 'BPM must be positive', { partIndex: options.partIndex, measureIndex: options.measureIndex })]);
  }

  const result = cloneScore(score);
  const measure = result.parts[options.partIndex].measures[options.measureIndex];

  const directionTypes: DirectionType[] = [];

  // Add metronome marking
  directionTypes.push({
    kind: 'metronome',
    beatUnit: options.beatUnit ?? 'quarter',
    beatUnitDot: options.beatUnitDot,
    perMinute: options.bpm,
  });

  // Add text if provided
  if (options.text) {
    directionTypes.push({
      kind: 'words',
      text: options.text,
      fontWeight: 'bold',
    });
  }

  const direction: DirectionEntry = {
    type: 'direction',
    directionTypes,
    placement: options.placement ?? 'above',
    sound: { tempo: options.bpm },
  };

  // Insert at the correct position
  insertDirectionAtPosition(measure, direction, options.position);

  return success(result);
}

export interface RemoveTempoOptions {
  partIndex: number;
  measureIndex: number;
  /** Index of the direction to remove (among tempo directions) */
  directionIndex?: number;
}

/**
 * Remove a tempo marking from a measure.
 */
export function removeTempo(
  score: Score,
  options: RemoveTempoOptions
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

  // Find tempo directions
  const tempoDirectionIndices: number[] = [];
  for (let i = 0; i < measure.entries.length; i++) {
    const entry = measure.entries[i];
    if (entry.type === 'direction' && entry.directionTypes.some(dt => dt.kind === 'metronome')) {
      tempoDirectionIndices.push(i);
    }
  }

  if (tempoDirectionIndices.length === 0) {
    return failure([operationError('TEMPO_NOT_FOUND', 'No tempo marking found in measure', { partIndex: options.partIndex, measureIndex: options.measureIndex })]);
  }

  const targetIndex = options.directionIndex ?? 0;
  if (targetIndex < 0 || targetIndex >= tempoDirectionIndices.length) {
    return failure([operationError('TEMPO_NOT_FOUND', `Tempo direction index ${targetIndex} out of bounds`, { partIndex: options.partIndex, measureIndex: options.measureIndex })]);
  }

  measure.entries.splice(tempoDirectionIndices[targetIndex], 1);

  return success(result);
}

export interface AddWedgeOptions {
  partIndex: number;
  /** Starting measure index */
  startMeasureIndex: number;
  /** Starting position in divisions */
  startPosition: number;
  /** Ending measure index */
  endMeasureIndex: number;
  /** Ending position in divisions */
  endPosition: number;
  /** Wedge type */
  type: 'crescendo' | 'diminuendo';
  /** Staff number (for multi-staff parts) */
  staff?: number;
  /** Placement (above/below) */
  placement?: 'above' | 'below';
}

/**
 * Add a wedge (crescendo or diminuendo) spanning one or more measures.
 */
export function addWedge(
  score: Score,
  options: AddWedgeOptions
): OperationResult<Score> {
  if (options.partIndex < 0 || options.partIndex >= score.parts.length) {
    return failure([operationError('PART_NOT_FOUND', `Part index ${options.partIndex} out of bounds`, { partIndex: options.partIndex })]);
  }

  const part = score.parts[options.partIndex];
  if (options.startMeasureIndex < 0 || options.startMeasureIndex >= part.measures.length) {
    return failure([operationError('MEASURE_NOT_FOUND', `Start measure index ${options.startMeasureIndex} out of bounds`, { partIndex: options.partIndex, measureIndex: options.startMeasureIndex })]);
  }
  if (options.endMeasureIndex < 0 || options.endMeasureIndex >= part.measures.length) {
    return failure([operationError('MEASURE_NOT_FOUND', `End measure index ${options.endMeasureIndex} out of bounds`, { partIndex: options.partIndex, measureIndex: options.endMeasureIndex })]);
  }

  if (options.endMeasureIndex < options.startMeasureIndex ||
      (options.endMeasureIndex === options.startMeasureIndex && options.endPosition <= options.startPosition)) {
    return failure([operationError('INVALID_RANGE', 'End position must be after start position', { partIndex: options.partIndex })]);
  }

  const result = cloneScore(score);

  // Add start wedge
  const startMeasure = result.parts[options.partIndex].measures[options.startMeasureIndex];
  const startDirection: DirectionEntry = {
    type: 'direction',
    directionTypes: [{
      kind: 'wedge',
      type: options.type,
    }],
    placement: options.placement ?? 'below',
    staff: options.staff,
  };
  insertDirectionAtPosition(startMeasure, startDirection, options.startPosition);

  // Add stop wedge
  const endMeasure = result.parts[options.partIndex].measures[options.endMeasureIndex];
  const endDirection: DirectionEntry = {
    type: 'direction',
    directionTypes: [{
      kind: 'wedge',
      type: 'stop',
    }],
    placement: options.placement ?? 'below',
    staff: options.staff,
  };
  insertDirectionAtPosition(endMeasure, endDirection, options.endPosition);

  return success(result);
}

export interface RemoveWedgeOptions {
  partIndex: number;
  measureIndex: number;
  /** Index of the wedge start direction to remove */
  directionIndex?: number;
}

/**
 * Remove a wedge (and its corresponding stop).
 */
export function removeWedge(
  score: Score,
  options: RemoveWedgeOptions
): OperationResult<Score> {
  if (options.partIndex < 0 || options.partIndex >= score.parts.length) {
    return failure([operationError('PART_NOT_FOUND', `Part index ${options.partIndex} out of bounds`, { partIndex: options.partIndex })]);
  }

  const part = score.parts[options.partIndex];
  if (options.measureIndex < 0 || options.measureIndex >= part.measures.length) {
    return failure([operationError('MEASURE_NOT_FOUND', `Measure index ${options.measureIndex} out of bounds`, { partIndex: options.partIndex, measureIndex: options.measureIndex })]);
  }

  const result = cloneScore(score);

  // Find wedge start directions
  const wedgeStarts: { measureIndex: number; entryIndex: number }[] = [];
  for (let mi = options.measureIndex; mi < result.parts[options.partIndex].measures.length; mi++) {
    const measure = result.parts[options.partIndex].measures[mi];
    for (let ei = 0; ei < measure.entries.length; ei++) {
      const entry = measure.entries[ei];
      if (entry.type === 'direction') {
        const wedgeType = entry.directionTypes.find(dt => dt.kind === 'wedge');
        if (wedgeType && wedgeType.kind === 'wedge' && (wedgeType.type === 'crescendo' || wedgeType.type === 'diminuendo')) {
          wedgeStarts.push({ measureIndex: mi, entryIndex: ei });
        }
      }
    }
    if (mi === options.measureIndex && wedgeStarts.length > 0) break;
  }

  if (wedgeStarts.length === 0) {
    return failure([operationError('WEDGE_NOT_FOUND', 'No wedge found starting in measure', { partIndex: options.partIndex, measureIndex: options.measureIndex })]);
  }

  const targetIndex = options.directionIndex ?? 0;
  if (targetIndex >= wedgeStarts.length) {
    return failure([operationError('WEDGE_NOT_FOUND', `Wedge direction index ${targetIndex} out of bounds`, { partIndex: options.partIndex, measureIndex: options.measureIndex })]);
  }

  const startInfo = wedgeStarts[targetIndex];
  const startMeasure = result.parts[options.partIndex].measures[startInfo.measureIndex];

  // Remove the start wedge
  startMeasure.entries.splice(startInfo.entryIndex, 1);

  // Find and remove the corresponding stop wedge
  for (let mi = startInfo.measureIndex; mi < result.parts[options.partIndex].measures.length; mi++) {
    const measure = result.parts[options.partIndex].measures[mi];
    for (let ei = 0; ei < measure.entries.length; ei++) {
      const entry = measure.entries[ei];
      if (entry.type === 'direction') {
        const wedgeType = entry.directionTypes.find(dt => dt.kind === 'wedge' && dt.type === 'stop');
        if (wedgeType) {
          measure.entries.splice(ei, 1);
          return success(result);
        }
      }
    }
  }

  return success(result);
}

export interface AddFermataOptions {
  partIndex: number;
  measureIndex: number;
  noteIndex: number;
  /** Fermata shape */
  shape?: 'normal' | 'angled' | 'square' | 'double-angled' | 'double-square' | 'double-dot' | 'half-curve' | 'curlew';
  /** Fermata type (upright or inverted) */
  fermataType?: 'upright' | 'inverted';
  /** Placement */
  placement?: 'above' | 'below';
}

/**
 * Add a fermata to a note.
 */
export function addFermata(
  score: Score,
  options: AddFermataOptions
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
  const notes = measure.entries.filter(e => e.type === 'note' && !e.rest);
  if (options.noteIndex < 0 || options.noteIndex >= notes.length) {
    return failure([operationError('NOTE_NOT_FOUND', `Note index ${options.noteIndex} out of bounds`, { partIndex: options.partIndex, measureIndex: options.measureIndex })]);
  }

  const note = notes[options.noteIndex] as NoteEntry;

  // Check if fermata already exists
  if (note.notations?.some(n => n.type === 'fermata')) {
    return failure([operationError('FERMATA_ALREADY_EXISTS', 'Note already has a fermata', { partIndex: options.partIndex, measureIndex: options.measureIndex })]);
  }

  // Add fermata
  if (!note.notations) {
    note.notations = [];
  }

  const fermataNotation: FermataNotation = {
    type: 'fermata',
    shape: options.shape ?? 'normal',
    fermataType: options.fermataType ?? 'upright',
    placement: options.placement ?? 'above',
  };

  note.notations.push(fermataNotation);

  return success(result);
}

export interface RemoveFermataOptions {
  partIndex: number;
  measureIndex: number;
  noteIndex: number;
}

/**
 * Remove a fermata from a note.
 */
export function removeFermata(
  score: Score,
  options: RemoveFermataOptions
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

  const notes = measure.entries.filter(e => e.type === 'note' && !e.rest);
  if (options.noteIndex < 0 || options.noteIndex >= notes.length) {
    return failure([operationError('NOTE_NOT_FOUND', `Note index ${options.noteIndex} out of bounds`, { partIndex: options.partIndex, measureIndex: options.measureIndex })]);
  }

  const note = notes[options.noteIndex] as NoteEntry;

  const fermataIndex = note.notations?.findIndex(n => n.type === 'fermata');
  if (fermataIndex === undefined || fermataIndex === -1) {
    return failure([operationError('FERMATA_NOT_FOUND', 'Note does not have a fermata', { partIndex: options.partIndex, measureIndex: options.measureIndex })]);
  }

  note.notations!.splice(fermataIndex, 1);
  if (note.notations!.length === 0) {
    delete note.notations;
  }

  return success(result);
}

export interface AddOrnamentOptions {
  partIndex: number;
  measureIndex: number;
  noteIndex: number;
  /** Ornament type */
  ornament: OrnamentType;
  /** Placement */
  placement?: 'above' | 'below';
  /** Accidental mark for the ornament */
  accidentalMark?: 'sharp' | 'flat' | 'natural' | 'double-sharp' | 'flat-flat';
}

/**
 * Add an ornament (trill, mordent, turn, etc.) to a note.
 */
export function addOrnament(
  score: Score,
  options: AddOrnamentOptions
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

  const notes = measure.entries.filter(e => e.type === 'note' && !e.rest);
  if (options.noteIndex < 0 || options.noteIndex >= notes.length) {
    return failure([operationError('NOTE_NOT_FOUND', `Note index ${options.noteIndex} out of bounds`, { partIndex: options.partIndex, measureIndex: options.measureIndex })]);
  }

  const note = notes[options.noteIndex] as NoteEntry;

  // Check if same ornament already exists
  if (note.notations?.some(n => n.type === 'ornament' && n.ornament === options.ornament)) {
    return failure([operationError('ORNAMENT_ALREADY_EXISTS', `Note already has ornament: ${options.ornament}`, { partIndex: options.partIndex, measureIndex: options.measureIndex })]);
  }

  if (!note.notations) {
    note.notations = [];
  }

  const ornamentNotation: OrnamentNotation = {
    type: 'ornament',
    ornament: options.ornament,
    placement: options.placement,
    accidentalMark: options.accidentalMark,
  };

  note.notations.push(ornamentNotation);

  return success(result);
}

export interface RemoveOrnamentOptions {
  partIndex: number;
  measureIndex: number;
  noteIndex: number;
  /** Specific ornament to remove (removes first ornament if not specified) */
  ornament?: OrnamentType;
}

/**
 * Remove an ornament from a note.
 */
export function removeOrnament(
  score: Score,
  options: RemoveOrnamentOptions
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

  const notes = measure.entries.filter(e => e.type === 'note' && !e.rest);
  if (options.noteIndex < 0 || options.noteIndex >= notes.length) {
    return failure([operationError('NOTE_NOT_FOUND', `Note index ${options.noteIndex} out of bounds`, { partIndex: options.partIndex, measureIndex: options.measureIndex })]);
  }

  const note = notes[options.noteIndex] as NoteEntry;

  const ornamentIndex = options.ornament
    ? note.notations?.findIndex(n => n.type === 'ornament' && n.ornament === options.ornament)
    : note.notations?.findIndex(n => n.type === 'ornament');

  if (ornamentIndex === undefined || ornamentIndex === -1) {
    return failure([operationError('ORNAMENT_NOT_FOUND', 'Note does not have the specified ornament', { partIndex: options.partIndex, measureIndex: options.measureIndex })]);
  }

  note.notations!.splice(ornamentIndex, 1);
  if (note.notations!.length === 0) {
    delete note.notations;
  }

  return success(result);
}

export interface AddPedalOptions {
  partIndex: number;
  measureIndex: number;
  /** Position in divisions */
  position: number;
  /** Pedal type */
  pedalType: 'start' | 'stop' | 'change' | 'continue';
  /** Show as line or Ped/star symbols */
  line?: boolean;
  /** Placement */
  placement?: 'above' | 'below';
}

/**
 * Add a pedal marking.
 */
export function addPedal(
  score: Score,
  options: AddPedalOptions
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

  const direction: DirectionEntry = {
    type: 'direction',
    directionTypes: [{
      kind: 'pedal',
      type: options.pedalType,
      line: options.line,
    }],
    placement: options.placement ?? 'below',
  };

  insertDirectionAtPosition(measure, direction, options.position);

  return success(result);
}

export interface RemovePedalOptions {
  partIndex: number;
  measureIndex: number;
  /** Index of the pedal direction to remove (among pedal directions) */
  directionIndex?: number;
}

/**
 * Remove a pedal marking.
 */
export function removePedal(
  score: Score,
  options: RemovePedalOptions
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

  // Find pedal directions
  const pedalIndices: number[] = [];
  for (let i = 0; i < measure.entries.length; i++) {
    const entry = measure.entries[i];
    if (entry.type === 'direction' && entry.directionTypes.some(dt => dt.kind === 'pedal')) {
      pedalIndices.push(i);
    }
  }

  if (pedalIndices.length === 0) {
    return failure([operationError('PEDAL_NOT_FOUND', 'No pedal marking found in measure', { partIndex: options.partIndex, measureIndex: options.measureIndex })]);
  }

  const targetIndex = options.directionIndex ?? 0;
  if (targetIndex < 0 || targetIndex >= pedalIndices.length) {
    return failure([operationError('PEDAL_NOT_FOUND', `Pedal direction index ${targetIndex} out of bounds`, { partIndex: options.partIndex, measureIndex: options.measureIndex })]);
  }

  measure.entries.splice(pedalIndices[targetIndex], 1);

  return success(result);
}

export interface AddTextDirectionOptions {
  partIndex: number;
  measureIndex: number;
  /** Position in divisions */
  position: number;
  /** Text content */
  text: string;
  /** Font style */
  fontStyle?: 'normal' | 'italic';
  /** Font weight */
  fontWeight?: 'normal' | 'bold';
  /** Placement */
  placement?: 'above' | 'below';
}

/**
 * Add a text direction (expression text, performance instruction).
 */
export function addTextDirection(
  score: Score,
  options: AddTextDirectionOptions
): OperationResult<Score> {
  if (options.partIndex < 0 || options.partIndex >= score.parts.length) {
    return failure([operationError('PART_NOT_FOUND', `Part index ${options.partIndex} out of bounds`, { partIndex: options.partIndex })]);
  }

  const part = score.parts[options.partIndex];
  if (options.measureIndex < 0 || options.measureIndex >= part.measures.length) {
    return failure([operationError('MEASURE_NOT_FOUND', `Measure index ${options.measureIndex} out of bounds`, { partIndex: options.partIndex, measureIndex: options.measureIndex })]);
  }

  if (!options.text.trim()) {
    return failure([operationError('INVALID_TEXT', 'Text cannot be empty', { partIndex: options.partIndex, measureIndex: options.measureIndex })]);
  }

  const result = cloneScore(score);
  const measure = result.parts[options.partIndex].measures[options.measureIndex];

  const direction: DirectionEntry = {
    type: 'direction',
    directionTypes: [{
      kind: 'words',
      text: options.text,
      fontStyle: options.fontStyle,
      fontWeight: options.fontWeight,
    }],
    placement: options.placement ?? 'above',
  };

  insertDirectionAtPosition(measure, direction, options.position);

  return success(result);
}

export interface AddRehearsalMarkOptions {
  partIndex: number;
  measureIndex: number;
  /** Rehearsal mark text (e.g., 'A', 'B', '1', '2') */
  text: string;
  /** Enclosure type */
  enclosure?: 'square' | 'circle' | 'oval' | 'rectangle' | 'diamond' | 'triangle' | 'pentagon' | 'hexagon' | 'none';
}

/**
 * Add a rehearsal mark to a measure.
 */
export function addRehearsalMark(
  score: Score,
  options: AddRehearsalMarkOptions
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

  const direction: DirectionEntry = {
    type: 'direction',
    directionTypes: [{
      kind: 'rehearsal',
      text: options.text,
      enclosure: options.enclosure ?? 'square',
    }],
    placement: 'above',
  };

  // Rehearsal marks go at the beginning of the measure
  insertDirectionAtPosition(measure, direction, 0);

  return success(result);
}

/**
 * Helper function to insert a direction at the correct position in a measure.
 */
function insertDirectionAtPosition(measure: Measure, direction: DirectionEntry, position: number): void {
  let currentPosition = 0;
  let insertIndex = 0;

  for (let i = 0; i < measure.entries.length; i++) {
    const entry = measure.entries[i];

    if (currentPosition >= position) {
      insertIndex = i;
      break;
    }

    if (entry.type === 'note' && !entry.chord) {
      currentPosition += entry.duration;
    } else if (entry.type === 'forward') {
      currentPosition += entry.duration;
    } else if (entry.type === 'backup') {
      currentPosition -= entry.duration;
    }

    insertIndex = i + 1;
  }

  measure.entries.splice(insertIndex, 0, direction);
}

// ============================================================
// Phase 1: Repeat and Structure Operations
// ============================================================

export type BarStyle = 'regular' | 'dotted' | 'dashed' | 'heavy' | 'light-light' | 'light-heavy' | 'heavy-light' | 'heavy-heavy' | 'tick' | 'short' | 'none';

export interface AddRepeatBarlineOptions {
  partIndex: number;
  measureIndex: number;
  direction: 'forward' | 'backward';
  times?: number;
}

/**
 * Add a repeat barline to a measure.
 * Forward repeats go on the left, backward repeats go on the right.
 * This operation applies to all parts at the specified measure index.
 */
export function addRepeatBarline(
  score: Score,
  options: AddRepeatBarlineOptions
): OperationResult<Score> {
  const { partIndex, measureIndex, direction, times } = options;

  if (partIndex < 0 || partIndex >= score.parts.length) {
    return failure([operationError('PART_NOT_FOUND', `Part index ${partIndex} out of bounds`, { partIndex })]);
  }

  const part = score.parts[partIndex];
  if (measureIndex < 0 || measureIndex >= part.measures.length) {
    return failure([operationError('MEASURE_NOT_FOUND', `Measure index ${measureIndex} out of bounds`, { partIndex, measureIndex })]);
  }

  const result = cloneScore(score);
  const location: 'left' | 'right' = direction === 'forward' ? 'left' : 'right';
  const barStyle: BarStyle = direction === 'forward' ? 'heavy-light' : 'light-heavy';

  // Apply to all parts at this measure index
  for (const p of result.parts) {
    if (measureIndex >= p.measures.length) continue;

    const measure = p.measures[measureIndex];
    if (!measure.barlines) {
      measure.barlines = [];
    }

    // Check if repeat already exists at this location
    const existingIndex = measure.barlines.findIndex(b => b.location === location && b.repeat);
    if (existingIndex >= 0) {
      return failure([operationError('REPEAT_ALREADY_EXISTS', `Repeat barline already exists at ${location} of measure ${measureIndex}`, { partIndex, measureIndex })]);
    }

    // Remove any existing barline at this location (without repeat)
    const nonRepeatIndex = measure.barlines.findIndex(b => b.location === location && !b.repeat);
    if (nonRepeatIndex >= 0) {
      measure.barlines.splice(nonRepeatIndex, 1);
    }

    measure.barlines.push({
      location,
      barStyle,
      repeat: {
        direction,
        times,
      },
    });
  }

  return success(result);
}

export interface RemoveRepeatBarlineOptions {
  partIndex: number;
  measureIndex: number;
  location: 'left' | 'right';
}

/**
 * Remove a repeat barline from a measure.
 * This operation applies to all parts at the specified measure index.
 */
export function removeRepeatBarline(
  score: Score,
  options: RemoveRepeatBarlineOptions
): OperationResult<Score> {
  const { partIndex, measureIndex, location } = options;

  if (partIndex < 0 || partIndex >= score.parts.length) {
    return failure([operationError('PART_NOT_FOUND', `Part index ${partIndex} out of bounds`, { partIndex })]);
  }

  const part = score.parts[partIndex];
  if (measureIndex < 0 || measureIndex >= part.measures.length) {
    return failure([operationError('MEASURE_NOT_FOUND', `Measure index ${measureIndex} out of bounds`, { partIndex, measureIndex })]);
  }

  const measure = part.measures[measureIndex];
  if (!measure.barlines) {
    return failure([operationError('REPEAT_NOT_FOUND', `No repeat barline found at ${location} of measure ${measureIndex}`, { partIndex, measureIndex })]);
  }

  const existingIndex = measure.barlines.findIndex(b => b.location === location && b.repeat);
  if (existingIndex < 0) {
    return failure([operationError('REPEAT_NOT_FOUND', `No repeat barline found at ${location} of measure ${measureIndex}`, { partIndex, measureIndex })]);
  }

  const result = cloneScore(score);

  // Apply to all parts at this measure index
  for (const p of result.parts) {
    if (measureIndex >= p.measures.length) continue;

    const m = p.measures[measureIndex];
    if (m.barlines) {
      const idx = m.barlines.findIndex(b => b.location === location && b.repeat);
      if (idx >= 0) {
        m.barlines.splice(idx, 1);
      }
      if (m.barlines.length === 0) {
        delete m.barlines;
      }
    }
  }

  return success(result);
}

export interface AddEndingOptions {
  partIndex: number;
  measureIndex: number;
  number: string; // "1", "2", "1, 2", etc.
  type: 'start' | 'stop' | 'discontinue';
}

/**
 * Add an ending (volta bracket) to a measure.
 * Start endings go on the left barline, stop/discontinue on the right.
 * This operation applies to all parts at the specified measure index.
 */
export function addEnding(
  score: Score,
  options: AddEndingOptions
): OperationResult<Score> {
  const { partIndex, measureIndex, number, type } = options;

  if (partIndex < 0 || partIndex >= score.parts.length) {
    return failure([operationError('PART_NOT_FOUND', `Part index ${partIndex} out of bounds`, { partIndex })]);
  }

  const part = score.parts[partIndex];
  if (measureIndex < 0 || measureIndex >= part.measures.length) {
    return failure([operationError('MEASURE_NOT_FOUND', `Measure index ${measureIndex} out of bounds`, { partIndex, measureIndex })]);
  }

  const result = cloneScore(score);
  const location: 'left' | 'right' = type === 'start' ? 'left' : 'right';

  // Apply to all parts at this measure index
  for (const p of result.parts) {
    if (measureIndex >= p.measures.length) continue;

    const measure = p.measures[measureIndex];
    if (!measure.barlines) {
      measure.barlines = [];
    }

    // Find or create barline at this location
    let barline = measure.barlines.find(b => b.location === location);
    if (!barline) {
      barline = { location };
      measure.barlines.push(barline);
    }

    if (barline.ending) {
      return failure([operationError('ENDING_ALREADY_EXISTS', `Ending already exists at ${location} of measure ${measureIndex}`, { partIndex, measureIndex })]);
    }

    barline.ending = { number, type };
  }

  return success(result);
}

export interface RemoveEndingOptions {
  partIndex: number;
  measureIndex: number;
  location: 'left' | 'right';
}

/**
 * Remove an ending (volta bracket) from a measure.
 * This operation applies to all parts at the specified measure index.
 */
export function removeEnding(
  score: Score,
  options: RemoveEndingOptions
): OperationResult<Score> {
  const { partIndex, measureIndex, location } = options;

  if (partIndex < 0 || partIndex >= score.parts.length) {
    return failure([operationError('PART_NOT_FOUND', `Part index ${partIndex} out of bounds`, { partIndex })]);
  }

  const part = score.parts[partIndex];
  if (measureIndex < 0 || measureIndex >= part.measures.length) {
    return failure([operationError('MEASURE_NOT_FOUND', `Measure index ${measureIndex} out of bounds`, { partIndex, measureIndex })]);
  }

  const measure = part.measures[measureIndex];
  const barline = measure.barlines?.find(b => b.location === location && b.ending);
  if (!barline) {
    return failure([operationError('ENDING_NOT_FOUND', `No ending found at ${location} of measure ${measureIndex}`, { partIndex, measureIndex })]);
  }

  const result = cloneScore(score);

  // Apply to all parts at this measure index
  for (const p of result.parts) {
    if (measureIndex >= p.measures.length) continue;

    const m = p.measures[measureIndex];
    if (m.barlines) {
      const bl = m.barlines.find(b => b.location === location);
      if (bl) {
        delete bl.ending;
        // Clean up empty barline
        if (!bl.barStyle && !bl.repeat && !bl.ending) {
          const idx = m.barlines.indexOf(bl);
          m.barlines.splice(idx, 1);
        }
      }
      if (m.barlines.length === 0) {
        delete m.barlines;
      }
    }
  }

  return success(result);
}

export interface ChangeBarlineOptions {
  partIndex: number;
  measureIndex: number;
  location: 'left' | 'right' | 'middle';
  barStyle: BarStyle;
}

/**
 * Change the barline style at a specific location in a measure.
 * This operation applies to all parts at the specified measure index.
 */
export function changeBarline(
  score: Score,
  options: ChangeBarlineOptions
): OperationResult<Score> {
  const { partIndex, measureIndex, location, barStyle } = options;

  if (partIndex < 0 || partIndex >= score.parts.length) {
    return failure([operationError('PART_NOT_FOUND', `Part index ${partIndex} out of bounds`, { partIndex })]);
  }

  const part = score.parts[partIndex];
  if (measureIndex < 0 || measureIndex >= part.measures.length) {
    return failure([operationError('MEASURE_NOT_FOUND', `Measure index ${measureIndex} out of bounds`, { partIndex, measureIndex })]);
  }

  const result = cloneScore(score);

  // Apply to all parts at this measure index
  for (const p of result.parts) {
    if (measureIndex >= p.measures.length) continue;

    const measure = p.measures[measureIndex];
    if (!measure.barlines) {
      measure.barlines = [];
    }

    // Find or create barline at this location
    let barline = measure.barlines.find(b => b.location === location);
    if (!barline) {
      barline = { location };
      measure.barlines.push(barline);
    }

    barline.barStyle = barStyle;
  }

  return success(result);
}

export interface AddSegnoOptions {
  partIndex: number;
  measureIndex: number;
  position?: number;
}

/**
 * Add a segno sign to a measure.
 */
export function addSegno(
  score: Score,
  options: AddSegnoOptions
): OperationResult<Score> {
  const { partIndex, measureIndex, position = 0 } = options;

  if (partIndex < 0 || partIndex >= score.parts.length) {
    return failure([operationError('PART_NOT_FOUND', `Part index ${partIndex} out of bounds`, { partIndex })]);
  }

  const part = score.parts[partIndex];
  if (measureIndex < 0 || measureIndex >= part.measures.length) {
    return failure([operationError('MEASURE_NOT_FOUND', `Measure index ${measureIndex} out of bounds`, { partIndex, measureIndex })]);
  }

  const result = cloneScore(score);
  const measure = result.parts[partIndex].measures[measureIndex];

  const direction: DirectionEntry = {
    type: 'direction',
    directionTypes: [{ kind: 'segno' }],
    placement: 'above',
  };

  insertDirectionAtPosition(measure, direction, position);

  return success(result);
}

export interface AddCodaOptions {
  partIndex: number;
  measureIndex: number;
  position?: number;
}

/**
 * Add a coda sign to a measure.
 */
export function addCoda(
  score: Score,
  options: AddCodaOptions
): OperationResult<Score> {
  const { partIndex, measureIndex, position = 0 } = options;

  if (partIndex < 0 || partIndex >= score.parts.length) {
    return failure([operationError('PART_NOT_FOUND', `Part index ${partIndex} out of bounds`, { partIndex })]);
  }

  const part = score.parts[partIndex];
  if (measureIndex < 0 || measureIndex >= part.measures.length) {
    return failure([operationError('MEASURE_NOT_FOUND', `Measure index ${measureIndex} out of bounds`, { partIndex, measureIndex })]);
  }

  const result = cloneScore(score);
  const measure = result.parts[partIndex].measures[measureIndex];

  const direction: DirectionEntry = {
    type: 'direction',
    directionTypes: [{ kind: 'coda' }],
    placement: 'above',
  };

  insertDirectionAtPosition(measure, direction, position);

  return success(result);
}

export interface AddNavigationOptions {
  partIndex: number;
  measureIndex: number;
  position?: number;
}

/**
 * Add a D.C. (Da Capo) marking to a measure.
 * This adds both the text direction and the sound element.
 */
export function addDaCapo(
  score: Score,
  options: AddNavigationOptions
): OperationResult<Score> {
  const { partIndex, measureIndex, position } = options;

  if (partIndex < 0 || partIndex >= score.parts.length) {
    return failure([operationError('PART_NOT_FOUND', `Part index ${partIndex} out of bounds`, { partIndex })]);
  }

  const part = score.parts[partIndex];
  if (measureIndex < 0 || measureIndex >= part.measures.length) {
    return failure([operationError('MEASURE_NOT_FOUND', `Measure index ${measureIndex} out of bounds`, { partIndex, measureIndex })]);
  }

  const result = cloneScore(score);
  const measure = result.parts[partIndex].measures[measureIndex];
  const attrs = getAttributesAtMeasure(result, { part: partIndex, measure: measureIndex });
  const measureDuration = getMeasureDuration(attrs.divisions ?? 1, attrs.time ?? { beats: '4', beatType: 4 });
  const insertPos = position ?? measureDuration;

  const direction: DirectionEntry = {
    type: 'direction',
    directionTypes: [{ kind: 'words', text: 'D.C.' }],
    placement: 'above',
  };

  insertDirectionAtPosition(measure, direction, insertPos);

  // Add sound element
  const sound: SoundEntry = {
    type: 'sound',
    dacapo: true,
  };
  measure.entries.push(sound);

  return success(result);
}

/**
 * Add a D.S. (Dal Segno) marking to a measure.
 */
export function addDalSegno(
  score: Score,
  options: AddNavigationOptions
): OperationResult<Score> {
  const { partIndex, measureIndex, position } = options;

  if (partIndex < 0 || partIndex >= score.parts.length) {
    return failure([operationError('PART_NOT_FOUND', `Part index ${partIndex} out of bounds`, { partIndex })]);
  }

  const part = score.parts[partIndex];
  if (measureIndex < 0 || measureIndex >= part.measures.length) {
    return failure([operationError('MEASURE_NOT_FOUND', `Measure index ${measureIndex} out of bounds`, { partIndex, measureIndex })]);
  }

  const result = cloneScore(score);
  const measure = result.parts[partIndex].measures[measureIndex];
  const attrs = getAttributesAtMeasure(result, { part: partIndex, measure: measureIndex });
  const measureDuration = getMeasureDuration(attrs.divisions ?? 1, attrs.time ?? { beats: '4', beatType: 4 });
  const insertPos = position ?? measureDuration;

  const direction: DirectionEntry = {
    type: 'direction',
    directionTypes: [{ kind: 'words', text: 'D.S.' }],
    placement: 'above',
  };

  insertDirectionAtPosition(measure, direction, insertPos);

  // Add sound element
  const sound: SoundEntry = {
    type: 'sound',
    dalsegno: 'segno',
  };
  measure.entries.push(sound);

  return success(result);
}

/**
 * Add a Fine marking to a measure.
 */
export function addFine(
  score: Score,
  options: AddNavigationOptions
): OperationResult<Score> {
  const { partIndex, measureIndex, position } = options;

  if (partIndex < 0 || partIndex >= score.parts.length) {
    return failure([operationError('PART_NOT_FOUND', `Part index ${partIndex} out of bounds`, { partIndex })]);
  }

  const part = score.parts[partIndex];
  if (measureIndex < 0 || measureIndex >= part.measures.length) {
    return failure([operationError('MEASURE_NOT_FOUND', `Measure index ${measureIndex} out of bounds`, { partIndex, measureIndex })]);
  }

  const result = cloneScore(score);
  const measure = result.parts[partIndex].measures[measureIndex];
  const attrs = getAttributesAtMeasure(result, { part: partIndex, measure: measureIndex });
  const measureDuration = getMeasureDuration(attrs.divisions ?? 1, attrs.time ?? { beats: '4', beatType: 4 });
  const insertPos = position ?? measureDuration;

  const direction: DirectionEntry = {
    type: 'direction',
    directionTypes: [{ kind: 'words', text: 'Fine' }],
    placement: 'above',
  };

  insertDirectionAtPosition(measure, direction, insertPos);

  // Add sound element
  const sound: SoundEntry = {
    type: 'sound',
    fine: true,
  };
  measure.entries.push(sound);

  return success(result);
}

/**
 * Add a To Coda marking to a measure.
 */
export function addToCoda(
  score: Score,
  options: AddNavigationOptions
): OperationResult<Score> {
  const { partIndex, measureIndex, position } = options;

  if (partIndex < 0 || partIndex >= score.parts.length) {
    return failure([operationError('PART_NOT_FOUND', `Part index ${partIndex} out of bounds`, { partIndex })]);
  }

  const part = score.parts[partIndex];
  if (measureIndex < 0 || measureIndex >= part.measures.length) {
    return failure([operationError('MEASURE_NOT_FOUND', `Measure index ${measureIndex} out of bounds`, { partIndex, measureIndex })]);
  }

  const result = cloneScore(score);
  const measure = result.parts[partIndex].measures[measureIndex];
  const attrs = getAttributesAtMeasure(result, { part: partIndex, measure: measureIndex });
  const measureDuration = getMeasureDuration(attrs.divisions ?? 1, attrs.time ?? { beats: '4', beatType: 4 });
  const insertPos = position ?? measureDuration;

  const direction: DirectionEntry = {
    type: 'direction',
    directionTypes: [{ kind: 'words', text: 'To Coda' }],
    placement: 'above',
  };

  insertDirectionAtPosition(measure, direction, insertPos);

  // Add sound element
  const sound: SoundEntry = {
    type: 'sound',
    tocoda: 'coda',
  };
  measure.entries.push(sound);

  return success(result);
}

// ============================================================
// Phase 2: Grace Note Operations
// ============================================================

export interface AddGraceNoteOptions {
  partIndex: number;
  measureIndex: number;
  targetNoteIndex: number; // Index of the note to attach grace note to
  pitch: Pitch;
  noteType?: NoteType;
  slash?: boolean;
  voice?: number;
  staff?: number;
}

/**
 * Add a grace note before a target note.
 * Grace notes do not have duration in MusicXML.
 */
export function addGraceNote(
  score: Score,
  options: AddGraceNoteOptions
): OperationResult<Score> {
  const { partIndex, measureIndex, targetNoteIndex, pitch, noteType = 'eighth', slash = true, voice, staff } = options;

  if (partIndex < 0 || partIndex >= score.parts.length) {
    return failure([operationError('PART_NOT_FOUND', `Part index ${partIndex} out of bounds`, { partIndex })]);
  }

  const part = score.parts[partIndex];
  if (measureIndex < 0 || measureIndex >= part.measures.length) {
    return failure([operationError('MEASURE_NOT_FOUND', `Measure index ${measureIndex} out of bounds`, { partIndex, measureIndex })]);
  }

  const measure = part.measures[measureIndex];

  // Find the target note
  let noteCount = 0;
  let targetEntryIndex = -1;
  let targetNote: NoteEntry | null = null;

  for (let i = 0; i < measure.entries.length; i++) {
    const entry = measure.entries[i];
    if (entry.type === 'note' && !entry.chord) {
      if (noteCount === targetNoteIndex) {
        targetEntryIndex = i;
        targetNote = entry;
        break;
      }
      noteCount++;
    }
  }

  if (targetEntryIndex < 0 || !targetNote) {
    return failure([operationError('NOTE_NOT_FOUND', `Note at index ${targetNoteIndex} not found`, { partIndex, measureIndex })]);
  }

  const result = cloneScore(score);
  const resultMeasure = result.parts[partIndex].measures[measureIndex];

  const graceNote: NoteEntry = {
    type: 'note',
    pitch,
    duration: 0, // Grace notes have no duration
    voice: voice ?? targetNote.voice,
    staff: staff ?? targetNote.staff,
    noteType,
    grace: {
      slash,
    },
  };

  // Insert grace note before the target note
  resultMeasure.entries.splice(targetEntryIndex, 0, graceNote);

  return success(result);
}

export interface RemoveGraceNoteOptions {
  partIndex: number;
  measureIndex: number;
  graceNoteIndex: number; // Index among all grace notes in the measure
}

/**
 * Remove a grace note from a measure.
 */
export function removeGraceNote(
  score: Score,
  options: RemoveGraceNoteOptions
): OperationResult<Score> {
  const { partIndex, measureIndex, graceNoteIndex } = options;

  if (partIndex < 0 || partIndex >= score.parts.length) {
    return failure([operationError('PART_NOT_FOUND', `Part index ${partIndex} out of bounds`, { partIndex })]);
  }

  const part = score.parts[partIndex];
  if (measureIndex < 0 || measureIndex >= part.measures.length) {
    return failure([operationError('MEASURE_NOT_FOUND', `Measure index ${measureIndex} out of bounds`, { partIndex, measureIndex })]);
  }

  const measure = part.measures[measureIndex];

  // Find the grace note by index
  let graceCount = 0;
  let targetEntryIndex = -1;

  for (let i = 0; i < measure.entries.length; i++) {
    const entry = measure.entries[i];
    if (entry.type === 'note' && entry.grace) {
      if (graceCount === graceNoteIndex) {
        targetEntryIndex = i;
        break;
      }
      graceCount++;
    }
  }

  if (targetEntryIndex < 0) {
    return failure([operationError('GRACE_NOTE_NOT_FOUND', `Grace note at index ${graceNoteIndex} not found`, { partIndex, measureIndex })]);
  }

  const result = cloneScore(score);
  result.parts[partIndex].measures[measureIndex].entries.splice(targetEntryIndex, 1);

  return success(result);
}

export interface ConvertToGraceOptions {
  partIndex: number;
  measureIndex: number;
  noteIndex: number;
  slash?: boolean;
}

/**
 * Convert a regular note to a grace note.
 * The note's duration will be removed.
 */
export function convertToGrace(
  score: Score,
  options: ConvertToGraceOptions
): OperationResult<Score> {
  const { partIndex, measureIndex, noteIndex, slash = true } = options;

  if (partIndex < 0 || partIndex >= score.parts.length) {
    return failure([operationError('PART_NOT_FOUND', `Part index ${partIndex} out of bounds`, { partIndex })]);
  }

  const part = score.parts[partIndex];
  if (measureIndex < 0 || measureIndex >= part.measures.length) {
    return failure([operationError('MEASURE_NOT_FOUND', `Measure index ${measureIndex} out of bounds`, { partIndex, measureIndex })]);
  }

  const measure = part.measures[measureIndex];

  // Find the target note
  let noteCount = 0;
  let targetEntryIndex = -1;

  for (let i = 0; i < measure.entries.length; i++) {
    const entry = measure.entries[i];
    if (entry.type === 'note' && !entry.chord) {
      if (noteCount === noteIndex) {
        targetEntryIndex = i;
        break;
      }
      noteCount++;
    }
  }

  if (targetEntryIndex < 0) {
    return failure([operationError('NOTE_NOT_FOUND', `Note at index ${noteIndex} not found`, { partIndex, measureIndex })]);
  }

  const targetEntry = measure.entries[targetEntryIndex];
  if (targetEntry.type !== 'note') {
    return failure([operationError('NOTE_NOT_FOUND', `Entry at index is not a note`, { partIndex, measureIndex })]);
  }

  if (targetEntry.grace) {
    return failure([operationError('INVALID_GRACE_NOTE', `Note is already a grace note`, { partIndex, measureIndex })]);
  }

  const result = cloneScore(score);
  const resultNote = result.parts[partIndex].measures[measureIndex].entries[targetEntryIndex] as NoteEntry;

  resultNote.grace = { slash };
  resultNote.duration = 0;

  return success(result);
}

// ============================================================
// Phase 3: Lyric Operations
// ============================================================

export interface AddLyricOptions {
  partIndex: number;
  measureIndex: number;
  noteIndex: number;
  text: string;
  syllabic?: 'single' | 'begin' | 'middle' | 'end';
  verse?: number; // Lyric number/verse (1, 2, 3, etc.)
  extend?: boolean;
}

/**
 * Add a lyric to a note.
 */
export function addLyric(
  score: Score,
  options: AddLyricOptions
): OperationResult<Score> {
  const { partIndex, measureIndex, noteIndex, text, syllabic = 'single', verse = 1, extend = false } = options;

  if (partIndex < 0 || partIndex >= score.parts.length) {
    return failure([operationError('PART_NOT_FOUND', `Part index ${partIndex} out of bounds`, { partIndex })]);
  }

  const part = score.parts[partIndex];
  if (measureIndex < 0 || measureIndex >= part.measures.length) {
    return failure([operationError('MEASURE_NOT_FOUND', `Measure index ${measureIndex} out of bounds`, { partIndex, measureIndex })]);
  }

  const measure = part.measures[measureIndex];

  // Find the target note
  let noteCount = 0;
  let targetEntryIndex = -1;

  for (let i = 0; i < measure.entries.length; i++) {
    const entry = measure.entries[i];
    if (entry.type === 'note' && !entry.chord && !entry.rest) {
      if (noteCount === noteIndex) {
        targetEntryIndex = i;
        break;
      }
      noteCount++;
    }
  }

  if (targetEntryIndex < 0) {
    return failure([operationError('NOTE_NOT_FOUND', `Note at index ${noteIndex} not found`, { partIndex, measureIndex })]);
  }

  const targetEntry = measure.entries[targetEntryIndex];
  if (targetEntry.type !== 'note') {
    return failure([operationError('NOTE_NOT_FOUND', `Entry is not a note`, { partIndex, measureIndex })]);
  }

  // Check if lyric already exists for this verse
  if (targetEntry.lyrics?.some(l => l.number === verse)) {
    return failure([operationError('LYRIC_ALREADY_EXISTS', `Lyric for verse ${verse} already exists on this note`, { partIndex, measureIndex })]);
  }

  const result = cloneScore(score);
  const resultNote = result.parts[partIndex].measures[measureIndex].entries[targetEntryIndex] as NoteEntry;

  if (!resultNote.lyrics) {
    resultNote.lyrics = [];
  }

  const lyric: Lyric = {
    number: verse,
    syllabic,
    text,
    extend,
  };

  resultNote.lyrics.push(lyric);

  return success(result);
}

export interface RemoveLyricOptions {
  partIndex: number;
  measureIndex: number;
  noteIndex: number;
  verse?: number; // If not specified, removes all lyrics
}

/**
 * Remove a lyric from a note.
 */
export function removeLyric(
  score: Score,
  options: RemoveLyricOptions
): OperationResult<Score> {
  const { partIndex, measureIndex, noteIndex, verse } = options;

  if (partIndex < 0 || partIndex >= score.parts.length) {
    return failure([operationError('PART_NOT_FOUND', `Part index ${partIndex} out of bounds`, { partIndex })]);
  }

  const part = score.parts[partIndex];
  if (measureIndex < 0 || measureIndex >= part.measures.length) {
    return failure([operationError('MEASURE_NOT_FOUND', `Measure index ${measureIndex} out of bounds`, { partIndex, measureIndex })]);
  }

  const measure = part.measures[measureIndex];

  // Find the target note
  let noteCount = 0;
  let targetEntryIndex = -1;

  for (let i = 0; i < measure.entries.length; i++) {
    const entry = measure.entries[i];
    if (entry.type === 'note' && !entry.chord && !entry.rest) {
      if (noteCount === noteIndex) {
        targetEntryIndex = i;
        break;
      }
      noteCount++;
    }
  }

  if (targetEntryIndex < 0) {
    return failure([operationError('NOTE_NOT_FOUND', `Note at index ${noteIndex} not found`, { partIndex, measureIndex })]);
  }

  const targetEntry = measure.entries[targetEntryIndex];
  if (targetEntry.type !== 'note' || !targetEntry.lyrics || targetEntry.lyrics.length === 0) {
    return failure([operationError('LYRIC_NOT_FOUND', `No lyrics found on note`, { partIndex, measureIndex })]);
  }

  if (verse !== undefined) {
    const lyricIndex = targetEntry.lyrics.findIndex(l => l.number === verse);
    if (lyricIndex < 0) {
      return failure([operationError('LYRIC_NOT_FOUND', `Lyric for verse ${verse} not found on note`, { partIndex, measureIndex })]);
    }
  }

  const result = cloneScore(score);
  const resultNote = result.parts[partIndex].measures[measureIndex].entries[targetEntryIndex] as NoteEntry;

  if (verse !== undefined) {
    resultNote.lyrics = resultNote.lyrics!.filter(l => l.number !== verse);
  } else {
    delete resultNote.lyrics;
  }

  if (resultNote.lyrics && resultNote.lyrics.length === 0) {
    delete resultNote.lyrics;
  }

  return success(result);
}

export interface UpdateLyricOptions {
  partIndex: number;
  measureIndex: number;
  noteIndex: number;
  verse?: number;
  text?: string;
  syllabic?: 'single' | 'begin' | 'middle' | 'end';
  extend?: boolean;
}

/**
 * Update an existing lyric on a note.
 */
export function updateLyric(
  score: Score,
  options: UpdateLyricOptions
): OperationResult<Score> {
  const { partIndex, measureIndex, noteIndex, verse = 1, text, syllabic, extend } = options;

  if (partIndex < 0 || partIndex >= score.parts.length) {
    return failure([operationError('PART_NOT_FOUND', `Part index ${partIndex} out of bounds`, { partIndex })]);
  }

  const part = score.parts[partIndex];
  if (measureIndex < 0 || measureIndex >= part.measures.length) {
    return failure([operationError('MEASURE_NOT_FOUND', `Measure index ${measureIndex} out of bounds`, { partIndex, measureIndex })]);
  }

  const measure = part.measures[measureIndex];

  // Find the target note
  let noteCount = 0;
  let targetEntryIndex = -1;

  for (let i = 0; i < measure.entries.length; i++) {
    const entry = measure.entries[i];
    if (entry.type === 'note' && !entry.chord && !entry.rest) {
      if (noteCount === noteIndex) {
        targetEntryIndex = i;
        break;
      }
      noteCount++;
    }
  }

  if (targetEntryIndex < 0) {
    return failure([operationError('NOTE_NOT_FOUND', `Note at index ${noteIndex} not found`, { partIndex, measureIndex })]);
  }

  const targetEntry = measure.entries[targetEntryIndex];
  if (targetEntry.type !== 'note' || !targetEntry.lyrics) {
    return failure([operationError('LYRIC_NOT_FOUND', `No lyrics found on note`, { partIndex, measureIndex })]);
  }

  const lyricIndex = targetEntry.lyrics.findIndex(l => l.number === verse);
  if (lyricIndex < 0) {
    return failure([operationError('LYRIC_NOT_FOUND', `Lyric for verse ${verse} not found on note`, { partIndex, measureIndex })]);
  }

  const result = cloneScore(score);
  const resultNote = result.parts[partIndex].measures[measureIndex].entries[targetEntryIndex] as NoteEntry;
  const lyric = resultNote.lyrics![lyricIndex];

  if (text !== undefined) {
    lyric.text = text;
  }
  if (syllabic !== undefined) {
    lyric.syllabic = syllabic;
  }
  if (extend !== undefined) {
    lyric.extend = extend;
  }

  return success(result);
}

// ============================================================
// Phase 4: Harmony Operations
// ============================================================

export type HarmonyKind =
  | 'major' | 'minor' | 'augmented' | 'diminished'
  | 'dominant' | 'major-seventh' | 'minor-seventh' | 'diminished-seventh'
  | 'augmented-seventh' | 'half-diminished' | 'major-minor'
  | 'major-sixth' | 'minor-sixth' | 'dominant-ninth' | 'major-ninth' | 'minor-ninth'
  | 'dominant-11th' | 'major-11th' | 'minor-11th'
  | 'dominant-13th' | 'major-13th' | 'minor-13th'
  | 'suspended-second' | 'suspended-fourth'
  | 'Neapolitan' | 'Italian' | 'French' | 'German'
  | 'pedal' | 'power' | 'Tristan'
  | 'other' | 'none';

export interface AddHarmonyOptions {
  partIndex: number;
  measureIndex: number;
  position: number;
  root: { step: string; alter?: number };
  kind: HarmonyKind;
  kindText?: string; // Display text (e.g., "m7" for minor-seventh)
  bass?: { step: string; alter?: number };
  degrees?: { value: number; alter?: number; type: 'add' | 'alter' | 'subtract' }[];
  staff?: number;
  placement?: 'above' | 'below';
}

/**
 * Add a harmony (chord symbol) to a measure.
 */
export function addHarmony(
  score: Score,
  options: AddHarmonyOptions
): OperationResult<Score> {
  const { partIndex, measureIndex, position, root, kind, kindText, bass, degrees, staff, placement = 'above' } = options;

  if (partIndex < 0 || partIndex >= score.parts.length) {
    return failure([operationError('PART_NOT_FOUND', `Part index ${partIndex} out of bounds`, { partIndex })]);
  }

  const part = score.parts[partIndex];
  if (measureIndex < 0 || measureIndex >= part.measures.length) {
    return failure([operationError('MEASURE_NOT_FOUND', `Measure index ${measureIndex} out of bounds`, { partIndex, measureIndex })]);
  }

  // Validate root step
  const validSteps = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
  if (!validSteps.includes(root.step.toUpperCase())) {
    return failure([operationError('INVALID_HARMONY', `Invalid root step: ${root.step}`, { partIndex, measureIndex })]);
  }

  if (bass && !validSteps.includes(bass.step.toUpperCase())) {
    return failure([operationError('INVALID_HARMONY', `Invalid bass step: ${bass.step}`, { partIndex, measureIndex })]);
  }

  const result = cloneScore(score);
  const measure = result.parts[partIndex].measures[measureIndex];

  const harmony: HarmonyEntry = {
    type: 'harmony',
    root: {
      rootStep: root.step.toUpperCase(),
      rootAlter: root.alter,
    },
    kind,
    kindText,
    bass: bass ? {
      bassStep: bass.step.toUpperCase(),
      bassAlter: bass.alter,
    } : undefined,
    degrees: degrees?.map(d => ({
      degreeValue: d.value,
      degreeAlter: d.alter,
      degreeType: d.type,
    })),
    staff,
    placement,
  };

  // Insert harmony at the correct position
  let currentPosition = 0;
  let insertIndex = 0;

  for (let i = 0; i < measure.entries.length; i++) {
    const entry = measure.entries[i];

    if (currentPosition >= position) {
      insertIndex = i;
      break;
    }

    if (entry.type === 'note' && !entry.chord) {
      currentPosition += entry.duration;
    } else if (entry.type === 'forward') {
      currentPosition += entry.duration;
    } else if (entry.type === 'backup') {
      currentPosition -= entry.duration;
    }

    insertIndex = i + 1;
  }

  measure.entries.splice(insertIndex, 0, harmony);

  return success(result);
}

export interface RemoveHarmonyOptions {
  partIndex: number;
  measureIndex: number;
  harmonyIndex: number; // Index among all harmonies in the measure
}

/**
 * Remove a harmony from a measure.
 */
export function removeHarmony(
  score: Score,
  options: RemoveHarmonyOptions
): OperationResult<Score> {
  const { partIndex, measureIndex, harmonyIndex } = options;

  if (partIndex < 0 || partIndex >= score.parts.length) {
    return failure([operationError('PART_NOT_FOUND', `Part index ${partIndex} out of bounds`, { partIndex })]);
  }

  const part = score.parts[partIndex];
  if (measureIndex < 0 || measureIndex >= part.measures.length) {
    return failure([operationError('MEASURE_NOT_FOUND', `Measure index ${measureIndex} out of bounds`, { partIndex, measureIndex })]);
  }

  const measure = part.measures[measureIndex];

  // Find the harmony by index
  let harmonyCount = 0;
  let targetEntryIndex = -1;

  for (let i = 0; i < measure.entries.length; i++) {
    const entry = measure.entries[i];
    if (entry.type === 'harmony') {
      if (harmonyCount === harmonyIndex) {
        targetEntryIndex = i;
        break;
      }
      harmonyCount++;
    }
  }

  if (targetEntryIndex < 0) {
    return failure([operationError('HARMONY_NOT_FOUND', `Harmony at index ${harmonyIndex} not found`, { partIndex, measureIndex })]);
  }

  const result = cloneScore(score);
  result.parts[partIndex].measures[measureIndex].entries.splice(targetEntryIndex, 1);

  return success(result);
}

export interface UpdateHarmonyOptions {
  partIndex: number;
  measureIndex: number;
  harmonyIndex: number;
  root?: { step: string; alter?: number };
  kind?: HarmonyKind;
  kindText?: string;
  bass?: { step: string; alter?: number } | null; // null to remove bass
  degrees?: { value: number; alter?: number; type: 'add' | 'alter' | 'subtract' }[] | null;
}

/**
 * Update an existing harmony in a measure.
 */
export function updateHarmony(
  score: Score,
  options: UpdateHarmonyOptions
): OperationResult<Score> {
  const { partIndex, measureIndex, harmonyIndex, root, kind, kindText, bass, degrees } = options;

  if (partIndex < 0 || partIndex >= score.parts.length) {
    return failure([operationError('PART_NOT_FOUND', `Part index ${partIndex} out of bounds`, { partIndex })]);
  }

  const part = score.parts[partIndex];
  if (measureIndex < 0 || measureIndex >= part.measures.length) {
    return failure([operationError('MEASURE_NOT_FOUND', `Measure index ${measureIndex} out of bounds`, { partIndex, measureIndex })]);
  }

  const measure = part.measures[measureIndex];

  // Find the harmony by index
  let harmonyCount = 0;
  let targetEntryIndex = -1;

  for (let i = 0; i < measure.entries.length; i++) {
    const entry = measure.entries[i];
    if (entry.type === 'harmony') {
      if (harmonyCount === harmonyIndex) {
        targetEntryIndex = i;
        break;
      }
      harmonyCount++;
    }
  }

  if (targetEntryIndex < 0) {
    return failure([operationError('HARMONY_NOT_FOUND', `Harmony at index ${harmonyIndex} not found`, { partIndex, measureIndex })]);
  }

  // Validate inputs
  const validSteps = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
  if (root && !validSteps.includes(root.step.toUpperCase())) {
    return failure([operationError('INVALID_HARMONY', `Invalid root step: ${root.step}`, { partIndex, measureIndex })]);
  }
  if (bass && !validSteps.includes(bass.step.toUpperCase())) {
    return failure([operationError('INVALID_HARMONY', `Invalid bass step: ${bass.step}`, { partIndex, measureIndex })]);
  }

  const result = cloneScore(score);
  const harmony = result.parts[partIndex].measures[measureIndex].entries[targetEntryIndex] as HarmonyEntry;

  if (root) {
    harmony.root = {
      rootStep: root.step.toUpperCase(),
      rootAlter: root.alter,
    };
  }
  if (kind !== undefined) {
    harmony.kind = kind;
  }
  if (kindText !== undefined) {
    harmony.kindText = kindText;
  }
  if (bass !== undefined) {
    if (bass === null) {
      delete harmony.bass;
    } else {
      harmony.bass = {
        bassStep: bass.step.toUpperCase(),
        bassAlter: bass.alter,
      };
    }
  }
  if (degrees !== undefined) {
    if (degrees === null) {
      delete harmony.degrees;
    } else {
      harmony.degrees = degrees.map(d => ({
        degreeValue: d.value,
        degreeAlter: d.alter,
        degreeType: d.type,
      }));
    }
  }

  return success(result);
}

// ============================================================
// Phase 5: Technical Notations, Octave Shift, and Breath Operations
// ============================================================

export interface AddFingeringOptions {
  partIndex: number;
  measureIndex: number;
  noteIndex: number;
  fingering: string; // "1", "2", "3", "4", "5", or combinations
  substitution?: boolean;
  alternate?: boolean;
  placement?: 'above' | 'below';
}

/**
 * Add fingering notation to a note.
 * Fingering is typically indicated 1,2,3,4,5.
 */
export function addFingering(
  score: Score,
  options: AddFingeringOptions
): OperationResult<Score> {
  const { partIndex, measureIndex, noteIndex, fingering, substitution = false, alternate = false, placement } = options;

  if (partIndex < 0 || partIndex >= score.parts.length) {
    return failure([operationError('PART_NOT_FOUND', `Part index ${partIndex} out of bounds`, { partIndex })]);
  }

  const part = score.parts[partIndex];
  if (measureIndex < 0 || measureIndex >= part.measures.length) {
    return failure([operationError('MEASURE_NOT_FOUND', `Measure index ${measureIndex} out of bounds`, { partIndex, measureIndex })]);
  }

  const measure = part.measures[measureIndex];

  // Find the target note
  let noteCount = 0;
  let targetEntryIndex = -1;

  for (let i = 0; i < measure.entries.length; i++) {
    const entry = measure.entries[i];
    if (entry.type === 'note' && !entry.chord && !entry.rest) {
      if (noteCount === noteIndex) {
        targetEntryIndex = i;
        break;
      }
      noteCount++;
    }
  }

  if (targetEntryIndex < 0) {
    return failure([operationError('NOTE_NOT_FOUND', `Note at index ${noteIndex} not found`, { partIndex, measureIndex })]);
  }

  const result = cloneScore(score);
  const resultNote = result.parts[partIndex].measures[measureIndex].entries[targetEntryIndex] as NoteEntry;

  if (!resultNote.notations) {
    resultNote.notations = [];
  }

  resultNote.notations.push({
    type: 'technical',
    technical: 'fingering',
    fingering,
    fingeringSubstitution: substitution || undefined,
    fingeringAlternate: alternate || undefined,
    placement,
  });

  return success(result);
}

export interface RemoveFingeringOptions {
  partIndex: number;
  measureIndex: number;
  noteIndex: number;
}

/**
 * Remove fingering notation from a note.
 */
export function removeFingering(
  score: Score,
  options: RemoveFingeringOptions
): OperationResult<Score> {
  const { partIndex, measureIndex, noteIndex } = options;

  if (partIndex < 0 || partIndex >= score.parts.length) {
    return failure([operationError('PART_NOT_FOUND', `Part index ${partIndex} out of bounds`, { partIndex })]);
  }

  const part = score.parts[partIndex];
  if (measureIndex < 0 || measureIndex >= part.measures.length) {
    return failure([operationError('MEASURE_NOT_FOUND', `Measure index ${measureIndex} out of bounds`, { partIndex, measureIndex })]);
  }

  const measure = part.measures[measureIndex];

  // Find the target note
  let noteCount = 0;
  let targetEntryIndex = -1;

  for (let i = 0; i < measure.entries.length; i++) {
    const entry = measure.entries[i];
    if (entry.type === 'note' && !entry.chord && !entry.rest) {
      if (noteCount === noteIndex) {
        targetEntryIndex = i;
        break;
      }
      noteCount++;
    }
  }

  if (targetEntryIndex < 0) {
    return failure([operationError('NOTE_NOT_FOUND', `Note at index ${noteIndex} not found`, { partIndex, measureIndex })]);
  }

  const targetEntry = measure.entries[targetEntryIndex];
  if (targetEntry.type !== 'note' || !targetEntry.notations) {
    return failure([operationError('NOTE_NOT_FOUND', `No notations found on note`, { partIndex, measureIndex })]);
  }

  const fingeringIndex = targetEntry.notations.findIndex(
    n => n.type === 'technical' && n.technical === 'fingering'
  );
  if (fingeringIndex < 0) {
    return failure([operationError('NOTE_NOT_FOUND', `No fingering found on note`, { partIndex, measureIndex })]);
  }

  const result = cloneScore(score);
  const resultNote = result.parts[partIndex].measures[measureIndex].entries[targetEntryIndex] as NoteEntry;
  resultNote.notations!.splice(fingeringIndex, 1);

  if (resultNote.notations!.length === 0) {
    delete resultNote.notations;
  }

  return success(result);
}

export type BowingType = 'up-bow' | 'down-bow';

export interface AddBowingOptions {
  partIndex: number;
  measureIndex: number;
  noteIndex: number;
  bowingType: BowingType;
  placement?: 'above' | 'below';
}

/**
 * Add bowing notation (up-bow or down-bow) to a note.
 * Used for bowed string instruments.
 */
export function addBowing(
  score: Score,
  options: AddBowingOptions
): OperationResult<Score> {
  const { partIndex, measureIndex, noteIndex, bowingType, placement } = options;

  if (partIndex < 0 || partIndex >= score.parts.length) {
    return failure([operationError('PART_NOT_FOUND', `Part index ${partIndex} out of bounds`, { partIndex })]);
  }

  const part = score.parts[partIndex];
  if (measureIndex < 0 || measureIndex >= part.measures.length) {
    return failure([operationError('MEASURE_NOT_FOUND', `Measure index ${measureIndex} out of bounds`, { partIndex, measureIndex })]);
  }

  const measure = part.measures[measureIndex];

  // Find the target note
  let noteCount = 0;
  let targetEntryIndex = -1;

  for (let i = 0; i < measure.entries.length; i++) {
    const entry = measure.entries[i];
    if (entry.type === 'note' && !entry.chord && !entry.rest) {
      if (noteCount === noteIndex) {
        targetEntryIndex = i;
        break;
      }
      noteCount++;
    }
  }

  if (targetEntryIndex < 0) {
    return failure([operationError('NOTE_NOT_FOUND', `Note at index ${noteIndex} not found`, { partIndex, measureIndex })]);
  }

  const result = cloneScore(score);
  const resultNote = result.parts[partIndex].measures[measureIndex].entries[targetEntryIndex] as NoteEntry;

  if (!resultNote.notations) {
    resultNote.notations = [];
  }

  resultNote.notations.push({
    type: 'technical',
    technical: bowingType,
    placement,
  });

  return success(result);
}

export interface RemoveBowingOptions {
  partIndex: number;
  measureIndex: number;
  noteIndex: number;
  bowingType?: BowingType; // If not specified, removes any bowing
}

/**
 * Remove bowing notation from a note.
 */
export function removeBowing(
  score: Score,
  options: RemoveBowingOptions
): OperationResult<Score> {
  const { partIndex, measureIndex, noteIndex, bowingType } = options;

  if (partIndex < 0 || partIndex >= score.parts.length) {
    return failure([operationError('PART_NOT_FOUND', `Part index ${partIndex} out of bounds`, { partIndex })]);
  }

  const part = score.parts[partIndex];
  if (measureIndex < 0 || measureIndex >= part.measures.length) {
    return failure([operationError('MEASURE_NOT_FOUND', `Measure index ${measureIndex} out of bounds`, { partIndex, measureIndex })]);
  }

  const measure = part.measures[measureIndex];

  // Find the target note
  let noteCount = 0;
  let targetEntryIndex = -1;

  for (let i = 0; i < measure.entries.length; i++) {
    const entry = measure.entries[i];
    if (entry.type === 'note' && !entry.chord && !entry.rest) {
      if (noteCount === noteIndex) {
        targetEntryIndex = i;
        break;
      }
      noteCount++;
    }
  }

  if (targetEntryIndex < 0) {
    return failure([operationError('NOTE_NOT_FOUND', `Note at index ${noteIndex} not found`, { partIndex, measureIndex })]);
  }

  const targetEntry = measure.entries[targetEntryIndex];
  if (targetEntry.type !== 'note' || !targetEntry.notations) {
    return failure([operationError('NOTE_NOT_FOUND', `No notations found on note`, { partIndex, measureIndex })]);
  }

  const bowingIndex = targetEntry.notations.findIndex(n => {
    if (n.type !== 'technical') return false;
    if (bowingType) return n.technical === bowingType;
    return n.technical === 'up-bow' || n.technical === 'down-bow';
  });

  if (bowingIndex < 0) {
    return failure([operationError('NOTE_NOT_FOUND', `No bowing found on note`, { partIndex, measureIndex })]);
  }

  const result = cloneScore(score);
  const resultNote = result.parts[partIndex].measures[measureIndex].entries[targetEntryIndex] as NoteEntry;
  resultNote.notations!.splice(bowingIndex, 1);

  if (resultNote.notations!.length === 0) {
    delete resultNote.notations;
  }

  return success(result);
}

export interface AddStringNumberOptions {
  partIndex: number;
  measureIndex: number;
  noteIndex: number;
  stringNumber: number;
  placement?: 'above' | 'below';
}

/**
 * Add string number notation to a note.
 * Used for fretted instruments and bowed strings.
 */
export function addStringNumber(
  score: Score,
  options: AddStringNumberOptions
): OperationResult<Score> {
  const { partIndex, measureIndex, noteIndex, stringNumber, placement } = options;

  if (partIndex < 0 || partIndex >= score.parts.length) {
    return failure([operationError('PART_NOT_FOUND', `Part index ${partIndex} out of bounds`, { partIndex })]);
  }

  const part = score.parts[partIndex];
  if (measureIndex < 0 || measureIndex >= part.measures.length) {
    return failure([operationError('MEASURE_NOT_FOUND', `Measure index ${measureIndex} out of bounds`, { partIndex, measureIndex })]);
  }

  if (stringNumber < 1) {
    return failure([operationError('INVALID_POSITION', `String number must be positive`, { partIndex, measureIndex })]);
  }

  const measure = part.measures[measureIndex];

  // Find the target note
  let noteCount = 0;
  let targetEntryIndex = -1;

  for (let i = 0; i < measure.entries.length; i++) {
    const entry = measure.entries[i];
    if (entry.type === 'note' && !entry.chord && !entry.rest) {
      if (noteCount === noteIndex) {
        targetEntryIndex = i;
        break;
      }
      noteCount++;
    }
  }

  if (targetEntryIndex < 0) {
    return failure([operationError('NOTE_NOT_FOUND', `Note at index ${noteIndex} not found`, { partIndex, measureIndex })]);
  }

  const result = cloneScore(score);
  const resultNote = result.parts[partIndex].measures[measureIndex].entries[targetEntryIndex] as NoteEntry;

  if (!resultNote.notations) {
    resultNote.notations = [];
  }

  resultNote.notations.push({
    type: 'technical',
    technical: 'string',
    string: stringNumber,
    placement,
  });

  return success(result);
}

export interface RemoveStringNumberOptions {
  partIndex: number;
  measureIndex: number;
  noteIndex: number;
}

/**
 * Remove string number notation from a note.
 */
export function removeStringNumber(
  score: Score,
  options: RemoveStringNumberOptions
): OperationResult<Score> {
  const { partIndex, measureIndex, noteIndex } = options;

  if (partIndex < 0 || partIndex >= score.parts.length) {
    return failure([operationError('PART_NOT_FOUND', `Part index ${partIndex} out of bounds`, { partIndex })]);
  }

  const part = score.parts[partIndex];
  if (measureIndex < 0 || measureIndex >= part.measures.length) {
    return failure([operationError('MEASURE_NOT_FOUND', `Measure index ${measureIndex} out of bounds`, { partIndex, measureIndex })]);
  }

  const measure = part.measures[measureIndex];

  // Find the target note
  let noteCount = 0;
  let targetEntryIndex = -1;

  for (let i = 0; i < measure.entries.length; i++) {
    const entry = measure.entries[i];
    if (entry.type === 'note' && !entry.chord && !entry.rest) {
      if (noteCount === noteIndex) {
        targetEntryIndex = i;
        break;
      }
      noteCount++;
    }
  }

  if (targetEntryIndex < 0) {
    return failure([operationError('NOTE_NOT_FOUND', `Note at index ${noteIndex} not found`, { partIndex, measureIndex })]);
  }

  const targetEntry = measure.entries[targetEntryIndex];
  if (targetEntry.type !== 'note' || !targetEntry.notations) {
    return failure([operationError('NOTE_NOT_FOUND', `No notations found on note`, { partIndex, measureIndex })]);
  }

  const stringIndex = targetEntry.notations.findIndex(
    n => n.type === 'technical' && n.technical === 'string'
  );

  if (stringIndex < 0) {
    return failure([operationError('NOTE_NOT_FOUND', `No string number found on note`, { partIndex, measureIndex })]);
  }

  const result = cloneScore(score);
  const resultNote = result.parts[partIndex].measures[measureIndex].entries[targetEntryIndex] as NoteEntry;
  resultNote.notations!.splice(stringIndex, 1);

  if (resultNote.notations!.length === 0) {
    delete resultNote.notations;
  }

  return success(result);
}

export type OctaveShiftType = 'up' | 'down';

export interface AddOctaveShiftOptions {
  partIndex: number;
  measureIndex: number;
  position: number;
  shiftType: OctaveShiftType;
  size?: number; // 8 for one octave, 15 for two octaves
}

/**
 * Add an octave shift (8va/8vb) direction.
 * Type 'down' means notes appear higher than sounding (8va).
 * Type 'up' means notes appear lower than sounding (8vb).
 */
export function addOctaveShift(
  score: Score,
  options: AddOctaveShiftOptions
): OperationResult<Score> {
  const { partIndex, measureIndex, position, shiftType, size = 8 } = options;

  if (partIndex < 0 || partIndex >= score.parts.length) {
    return failure([operationError('PART_NOT_FOUND', `Part index ${partIndex} out of bounds`, { partIndex })]);
  }

  const part = score.parts[partIndex];
  if (measureIndex < 0 || measureIndex >= part.measures.length) {
    return failure([operationError('MEASURE_NOT_FOUND', `Measure index ${measureIndex} out of bounds`, { partIndex, measureIndex })]);
  }

  const result = cloneScore(score);
  const measure = result.parts[partIndex].measures[measureIndex];

  const direction: DirectionEntry = {
    type: 'direction',
    directionTypes: [{
      kind: 'octave-shift',
      type: shiftType,
      size,
    }],
    placement: shiftType === 'down' ? 'above' : 'below',
  };

  insertDirectionAtPosition(measure, direction, position);

  return success(result);
}

export interface StopOctaveShiftOptions {
  partIndex: number;
  measureIndex: number;
  position: number;
  size?: number;
}

/**
 * Stop an octave shift at the specified position.
 */
export function stopOctaveShift(
  score: Score,
  options: StopOctaveShiftOptions
): OperationResult<Score> {
  const { partIndex, measureIndex, position, size = 8 } = options;

  if (partIndex < 0 || partIndex >= score.parts.length) {
    return failure([operationError('PART_NOT_FOUND', `Part index ${partIndex} out of bounds`, { partIndex })]);
  }

  const part = score.parts[partIndex];
  if (measureIndex < 0 || measureIndex >= part.measures.length) {
    return failure([operationError('MEASURE_NOT_FOUND', `Measure index ${measureIndex} out of bounds`, { partIndex, measureIndex })]);
  }

  const result = cloneScore(score);
  const measure = result.parts[partIndex].measures[measureIndex];

  const direction: DirectionEntry = {
    type: 'direction',
    directionTypes: [{
      kind: 'octave-shift',
      type: 'stop',
      size,
    }],
  };

  insertDirectionAtPosition(measure, direction, position);

  return success(result);
}

export interface RemoveOctaveShiftOptions {
  partIndex: number;
  measureIndex: number;
  octaveShiftIndex?: number; // Index among octave-shift directions; removes first if not specified
}

/**
 * Remove an octave shift direction from a measure.
 */
export function removeOctaveShift(
  score: Score,
  options: RemoveOctaveShiftOptions
): OperationResult<Score> {
  const { partIndex, measureIndex, octaveShiftIndex = 0 } = options;

  if (partIndex < 0 || partIndex >= score.parts.length) {
    return failure([operationError('PART_NOT_FOUND', `Part index ${partIndex} out of bounds`, { partIndex })]);
  }

  const part = score.parts[partIndex];
  if (measureIndex < 0 || measureIndex >= part.measures.length) {
    return failure([operationError('MEASURE_NOT_FOUND', `Measure index ${measureIndex} out of bounds`, { partIndex, measureIndex })]);
  }

  const measure = part.measures[measureIndex];

  // Find the octave-shift direction by index
  let shiftCount = 0;
  let targetEntryIndex = -1;

  for (let i = 0; i < measure.entries.length; i++) {
    const entry = measure.entries[i];
    if (entry.type === 'direction') {
      const hasOctaveShift = entry.directionTypes.some(dt => dt.kind === 'octave-shift');
      if (hasOctaveShift) {
        if (shiftCount === octaveShiftIndex) {
          targetEntryIndex = i;
          break;
        }
        shiftCount++;
      }
    }
  }

  if (targetEntryIndex < 0) {
    return failure([operationError('NOTE_NOT_FOUND', `Octave shift at index ${octaveShiftIndex} not found`, { partIndex, measureIndex })]);
  }

  const result = cloneScore(score);
  result.parts[partIndex].measures[measureIndex].entries.splice(targetEntryIndex, 1);

  return success(result);
}

export type BreathMarkValue = 'comma' | 'tick' | 'upbow' | 'salzedo';

export interface AddBreathMarkOptions {
  partIndex: number;
  measureIndex: number;
  noteIndex: number;
  breathMarkType?: BreathMarkValue;
  placement?: 'above' | 'below';
}

/**
 * Add a breath mark to a note.
 * Breath marks indicate where a performer should breathe.
 */
export function addBreathMark(
  score: Score,
  options: AddBreathMarkOptions
): OperationResult<Score> {
  const { partIndex, measureIndex, noteIndex, placement = 'above' } = options;

  if (partIndex < 0 || partIndex >= score.parts.length) {
    return failure([operationError('PART_NOT_FOUND', `Part index ${partIndex} out of bounds`, { partIndex })]);
  }

  const part = score.parts[partIndex];
  if (measureIndex < 0 || measureIndex >= part.measures.length) {
    return failure([operationError('MEASURE_NOT_FOUND', `Measure index ${measureIndex} out of bounds`, { partIndex, measureIndex })]);
  }

  const measure = part.measures[measureIndex];

  // Find the target note
  let noteCount = 0;
  let targetEntryIndex = -1;

  for (let i = 0; i < measure.entries.length; i++) {
    const entry = measure.entries[i];
    if (entry.type === 'note' && !entry.chord && !entry.rest) {
      if (noteCount === noteIndex) {
        targetEntryIndex = i;
        break;
      }
      noteCount++;
    }
  }

  if (targetEntryIndex < 0) {
    return failure([operationError('NOTE_NOT_FOUND', `Note at index ${noteIndex} not found`, { partIndex, measureIndex })]);
  }

  const result = cloneScore(score);
  const resultNote = result.parts[partIndex].measures[measureIndex].entries[targetEntryIndex] as NoteEntry;

  if (!resultNote.notations) {
    resultNote.notations = [];
  }

  // Check if breath mark already exists
  const existingBreathMark = resultNote.notations.find(
    n => n.type === 'articulation' && n.articulation === 'breath-mark'
  );
  if (existingBreathMark) {
    return failure([operationError('ARTICULATION_ALREADY_EXISTS', `Breath mark already exists on note`, { partIndex, measureIndex })]);
  }

  resultNote.notations.push({
    type: 'articulation',
    articulation: 'breath-mark',
    placement,
  });

  return success(result);
}

export interface RemoveBreathMarkOptions {
  partIndex: number;
  measureIndex: number;
  noteIndex: number;
}

/**
 * Remove a breath mark from a note.
 */
export function removeBreathMark(
  score: Score,
  options: RemoveBreathMarkOptions
): OperationResult<Score> {
  const { partIndex, measureIndex, noteIndex } = options;

  if (partIndex < 0 || partIndex >= score.parts.length) {
    return failure([operationError('PART_NOT_FOUND', `Part index ${partIndex} out of bounds`, { partIndex })]);
  }

  const part = score.parts[partIndex];
  if (measureIndex < 0 || measureIndex >= part.measures.length) {
    return failure([operationError('MEASURE_NOT_FOUND', `Measure index ${measureIndex} out of bounds`, { partIndex, measureIndex })]);
  }

  const measure = part.measures[measureIndex];

  // Find the target note
  let noteCount = 0;
  let targetEntryIndex = -1;

  for (let i = 0; i < measure.entries.length; i++) {
    const entry = measure.entries[i];
    if (entry.type === 'note' && !entry.chord && !entry.rest) {
      if (noteCount === noteIndex) {
        targetEntryIndex = i;
        break;
      }
      noteCount++;
    }
  }

  if (targetEntryIndex < 0) {
    return failure([operationError('NOTE_NOT_FOUND', `Note at index ${noteIndex} not found`, { partIndex, measureIndex })]);
  }

  const targetEntry = measure.entries[targetEntryIndex];
  if (targetEntry.type !== 'note' || !targetEntry.notations) {
    return failure([operationError('ARTICULATION_NOT_FOUND', `No notations found on note`, { partIndex, measureIndex })]);
  }

  const breathMarkIndex = targetEntry.notations.findIndex(
    n => n.type === 'articulation' && n.articulation === 'breath-mark'
  );

  if (breathMarkIndex < 0) {
    return failure([operationError('ARTICULATION_NOT_FOUND', `No breath mark found on note`, { partIndex, measureIndex })]);
  }

  const result = cloneScore(score);
  const resultNote = result.parts[partIndex].measures[measureIndex].entries[targetEntryIndex] as NoteEntry;
  resultNote.notations!.splice(breathMarkIndex, 1);

  if (resultNote.notations!.length === 0) {
    delete resultNote.notations;
  }

  return success(result);
}

export type CaesuraValue = 'normal' | 'thick' | 'short' | 'curved' | 'single';

export interface AddCaesuraOptions {
  partIndex: number;
  measureIndex: number;
  noteIndex: number;
  caesuraType?: CaesuraValue;
  placement?: 'above' | 'below';
}

/**
 * Add a caesura to a note.
 * A caesura indicates a brief, silent pause.
 * It is notated using a "railroad tracks" symbol.
 */
export function addCaesura(
  score: Score,
  options: AddCaesuraOptions
): OperationResult<Score> {
  const { partIndex, measureIndex, noteIndex, placement = 'above' } = options;

  if (partIndex < 0 || partIndex >= score.parts.length) {
    return failure([operationError('PART_NOT_FOUND', `Part index ${partIndex} out of bounds`, { partIndex })]);
  }

  const part = score.parts[partIndex];
  if (measureIndex < 0 || measureIndex >= part.measures.length) {
    return failure([operationError('MEASURE_NOT_FOUND', `Measure index ${measureIndex} out of bounds`, { partIndex, measureIndex })]);
  }

  const measure = part.measures[measureIndex];

  // Find the target note
  let noteCount = 0;
  let targetEntryIndex = -1;

  for (let i = 0; i < measure.entries.length; i++) {
    const entry = measure.entries[i];
    if (entry.type === 'note' && !entry.chord && !entry.rest) {
      if (noteCount === noteIndex) {
        targetEntryIndex = i;
        break;
      }
      noteCount++;
    }
  }

  if (targetEntryIndex < 0) {
    return failure([operationError('NOTE_NOT_FOUND', `Note at index ${noteIndex} not found`, { partIndex, measureIndex })]);
  }

  const result = cloneScore(score);
  const resultNote = result.parts[partIndex].measures[measureIndex].entries[targetEntryIndex] as NoteEntry;

  if (!resultNote.notations) {
    resultNote.notations = [];
  }

  // Check if caesura already exists
  const existingCaesura = resultNote.notations.find(
    n => n.type === 'articulation' && n.articulation === 'caesura'
  );
  if (existingCaesura) {
    return failure([operationError('ARTICULATION_ALREADY_EXISTS', `Caesura already exists on note`, { partIndex, measureIndex })]);
  }

  resultNote.notations.push({
    type: 'articulation',
    articulation: 'caesura',
    placement,
  });

  return success(result);
}

export interface RemoveCaesuraOptions {
  partIndex: number;
  measureIndex: number;
  noteIndex: number;
}

/**
 * Remove a caesura from a note.
 */
export function removeCaesura(
  score: Score,
  options: RemoveCaesuraOptions
): OperationResult<Score> {
  const { partIndex, measureIndex, noteIndex } = options;

  if (partIndex < 0 || partIndex >= score.parts.length) {
    return failure([operationError('PART_NOT_FOUND', `Part index ${partIndex} out of bounds`, { partIndex })]);
  }

  const part = score.parts[partIndex];
  if (measureIndex < 0 || measureIndex >= part.measures.length) {
    return failure([operationError('MEASURE_NOT_FOUND', `Measure index ${measureIndex} out of bounds`, { partIndex, measureIndex })]);
  }

  const measure = part.measures[measureIndex];

  // Find the target note
  let noteCount = 0;
  let targetEntryIndex = -1;

  for (let i = 0; i < measure.entries.length; i++) {
    const entry = measure.entries[i];
    if (entry.type === 'note' && !entry.chord && !entry.rest) {
      if (noteCount === noteIndex) {
        targetEntryIndex = i;
        break;
      }
      noteCount++;
    }
  }

  if (targetEntryIndex < 0) {
    return failure([operationError('NOTE_NOT_FOUND', `Note at index ${noteIndex} not found`, { partIndex, measureIndex })]);
  }

  const targetEntry = measure.entries[targetEntryIndex];
  if (targetEntry.type !== 'note' || !targetEntry.notations) {
    return failure([operationError('ARTICULATION_NOT_FOUND', `No notations found on note`, { partIndex, measureIndex })]);
  }

  const caesuraIndex = targetEntry.notations.findIndex(
    n => n.type === 'articulation' && n.articulation === 'caesura'
  );

  if (caesuraIndex < 0) {
    return failure([operationError('ARTICULATION_NOT_FOUND', `No caesura found on note`, { partIndex, measureIndex })]);
  }

  const result = cloneScore(score);
  const resultNote = result.parts[partIndex].measures[measureIndex].entries[targetEntryIndex] as NoteEntry;
  resultNote.notations!.splice(caesuraIndex, 1);

  if (resultNote.notations!.length === 0) {
    delete resultNote.notations;
  }

  return success(result);
}

// Re-exports
export type { ValidationError } from '../validator';
