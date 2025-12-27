import type {
  Score,
  Measure,
  NoteEntry,
  Pitch,
  KeySignature,
  TimeSignature,
} from '../types';

/**
 * Deep clone a score
 */
function cloneScore(score: Score): Score {
  return JSON.parse(JSON.stringify(score));
}

/**
 * Step order for transposition
 */
const STEPS: Pitch['step'][] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

/**
 * Semitone values for each step
 */
const STEP_SEMITONES: Record<Pitch['step'], number> = {
  'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11,
};

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

  // Find the current position at the end of the measure
  let currentPosition = 0;
  for (const entry of measure.entries) {
    if (entry.type === 'note' && !entry.chord) {
      currentPosition += entry.duration;
    } else if (entry.type === 'backup') {
      currentPosition -= entry.duration;
    } else if (entry.type === 'forward') {
      currentPosition += entry.duration;
    }
  }

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
