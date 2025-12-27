import type { Pitch, Measure, MeasureEntry, NoteEntry } from '../types';

// Pitch constants
export const STEPS: Pitch['step'][] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
export const STEP_SEMITONES: Record<Pitch['step'], number> = {
  'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11,
};

/** Convert pitch to semitone value (MIDI-like) */
export function pitchToSemitone(pitch: Pitch): number {
  return pitch.octave * 12 + STEP_SEMITONES[pitch.step] + (pitch.alter ?? 0);
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
