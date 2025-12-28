import type { Pitch, Measure, MeasureEntry, NoteEntry, KeySignature, Accidental } from '../types';

// Pitch constants
export const STEPS: Pitch['step'][] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
export const STEP_SEMITONES: Record<Pitch['step'], number> = {
  'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11,
};

// Sharp order for key signatures (fifths > 0)
const SHARP_ORDER: Pitch['step'][] = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
// Flat order for key signatures (fifths < 0)
const FLAT_ORDER: Pitch['step'][] = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];

/** Convert pitch to semitone value (MIDI-like) */
export function pitchToSemitone(pitch: Pitch): number {
  return pitch.octave * 12 + STEP_SEMITONES[pitch.step] + (pitch.alter ?? 0);
}

/**
 * Get the alteration for a step based on key signature
 * Returns the default alter value for that step in the given key
 */
export function getAlterForStepInKey(step: Pitch['step'], key: KeySignature): number {
  const fifths = key.fifths;

  if (fifths > 0) {
    // Sharps
    const sharps = SHARP_ORDER.slice(0, fifths);
    return sharps.includes(step) ? 1 : 0;
  } else if (fifths < 0) {
    // Flats
    const flats = FLAT_ORDER.slice(0, -fifths);
    return flats.includes(step) ? -1 : 0;
  }

  return 0; // C major / A minor
}

/**
 * Get all altered steps in a key signature
 */
export function getAlteredStepsInKey(key: KeySignature): Map<Pitch['step'], number> {
  const alterations = new Map<Pitch['step'], number>();
  const fifths = key.fifths;

  if (fifths > 0) {
    SHARP_ORDER.slice(0, fifths).forEach(step => alterations.set(step, 1));
  } else if (fifths < 0) {
    FLAT_ORDER.slice(0, -fifths).forEach(step => alterations.set(step, -1));
  }

  return alterations;
}

/**
 * Track accidentals used in a measure up to a specific position
 * Returns a map of step+octave to alter value
 */
export function getAccidentalsInMeasure(
  measure: Measure,
  upToPosition: number,
  voice?: number
): Map<string, number> {
  const accidentals = new Map<string, number>();
  let position = 0;

  for (const entry of measure.entries) {
    if (position >= upToPosition) break;

    if (entry.type === 'note') {
      if (voice === undefined || entry.voice === voice) {
        if (entry.pitch && entry.accidental) {
          const key = `${entry.pitch.step}${entry.pitch.octave}`;
          accidentals.set(key, entry.pitch.alter ?? 0);
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

  return accidentals;
}

/**
 * Get the effective alter for a note considering key signature and preceding accidentals
 */
export function getEffectiveAlter(
  step: Pitch['step'],
  octave: number,
  key: KeySignature,
  accidentalsInMeasure: Map<string, number>
): number {
  const noteKey = `${step}${octave}`;

  // Check if there's an accidental earlier in the measure
  if (accidentalsInMeasure.has(noteKey)) {
    return accidentalsInMeasure.get(noteKey)!;
  }

  // Otherwise use key signature
  return getAlterForStepInKey(step, key);
}

/**
 * Convert semitone to pitch, considering key signature for enharmonic spelling
 */
export function semitoneToKeyAwarePitch(
  semitone: number,
  key: KeySignature,
  options?: { preferSharp?: boolean }
): Pitch {
  const octave = Math.floor(semitone / 12);
  const pitchClass = ((semitone % 12) + 12) % 12;

  // Get key signature's preference for sharp/flat
  const keyPreferSharp = key.fifths >= 0;
  const preferSharp = options?.preferSharp ?? keyPreferSharp;

  // Try to find a natural step first
  for (const step of STEPS) {
    const stepSemitone = STEP_SEMITONES[step];
    if (stepSemitone === pitchClass) {
      return { step, octave };
    }
  }

  // Try to find a step with the key's natural alteration
  const keyAlterations = getAlteredStepsInKey(key);
  for (const step of STEPS) {
    const stepSemitone = STEP_SEMITONES[step];
    const keyAlter = keyAlterations.get(step) ?? 0;
    if ((stepSemitone + keyAlter) % 12 === pitchClass) {
      return { step, octave, alter: keyAlter };
    }
  }

  // Fall back to enharmonic spelling based on preference
  if (preferSharp) {
    // Try sharp
    for (const step of STEPS) {
      const stepSemitone = STEP_SEMITONES[step];
      const diff = (pitchClass - stepSemitone + 12) % 12;
      if (diff === 1) {
        return { step, octave, alter: 1 };
      }
    }
    // Try double sharp
    for (const step of STEPS) {
      const stepSemitone = STEP_SEMITONES[step];
      const diff = (pitchClass - stepSemitone + 12) % 12;
      if (diff === 2) {
        return { step, octave, alter: 2 };
      }
    }
  } else {
    // Try flat
    for (const step of STEPS) {
      const stepSemitone = STEP_SEMITONES[step];
      const diff = (stepSemitone - pitchClass + 12) % 12;
      if (diff === 1) {
        return { step, octave, alter: -1 };
      }
    }
    // Try double flat
    for (const step of STEPS) {
      const stepSemitone = STEP_SEMITONES[step];
      const diff = (stepSemitone - pitchClass + 12) % 12;
      if (diff === 2) {
        return { step, octave, alter: -2 };
      }
    }
  }

  // Should never reach here
  return { step: 'C', octave, alter: pitchClass };
}

/**
 * Determine the appropriate accidental to display based on key signature and context
 */
export function determineAccidental(
  pitch: Pitch,
  key: KeySignature,
  accidentalsInMeasure: Map<string, number>
): Accidental | undefined {
  const noteKey = `${pitch.step}${pitch.octave}`;
  const alter = pitch.alter ?? 0;
  const keyAlter = getAlterForStepInKey(pitch.step, key);

  // Check if same note had an accidental earlier
  const previousAlter = accidentalsInMeasure.get(noteKey);

  if (previousAlter !== undefined) {
    // There was an accidental earlier in the measure
    if (alter === previousAlter) {
      // Same as previous accidental - no need to show
      return undefined;
    }
    // Different from previous - need to show
  } else {
    // No previous accidental
    if (alter === keyAlter) {
      // Matches key signature - no need to show
      return undefined;
    }
  }

  // Need to show accidental
  if (alter === 0) return 'natural';
  if (alter === 1) return 'sharp';
  if (alter === -1) return 'flat';
  if (alter === 2) return 'double-sharp';
  if (alter === -2) return 'double-flat';

  return undefined;
}

// Position tracking for measure iteration
export interface PositionState {
  position: number;
  lastNonChordPosition: number;
}

export function createPositionState(): PositionState {
  return { position: 0, lastNonChordPosition: 0 };
}

/** Update position state for entry, returns position before update */
export function updatePositionForEntry(state: PositionState, entry: MeasureEntry): number {
  const pos = state.position;
  switch (entry.type) {
    case 'note': {
      const note = entry as NoteEntry;
      if (!note.chord) {
        state.lastNonChordPosition = state.position;
        state.position += note.duration;
      }
      return note.chord ? state.lastNonChordPosition : pos;
    }
    case 'backup':
      state.position -= entry.duration;
      state.lastNonChordPosition = state.position;
      return pos;
    case 'forward':
      state.position += entry.duration;
      state.lastNonChordPosition = state.position;
      return pos;
    default:
      return pos;
  }
}

/** Get absolute position of a note within a measure */
export function getAbsolutePositionForNote(note: NoteEntry, measure: Measure): number {
  const state = createPositionState();
  for (const entry of measure.entries) {
    if (entry === note) return entry.chord ? state.lastNonChordPosition : state.position;
    updatePositionForEntry(state, entry);
  }
  return state.position;
}

/** Get position at end of measure */
export function getMeasureEndPosition(measure: Measure): number {
  const state = createPositionState();
  for (const entry of measure.entries) updatePositionForEntry(state, entry);
  return state.position;
}
