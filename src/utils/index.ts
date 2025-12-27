/**
 * Shared utility functions and constants for MusicXML processing
 */

import type { Pitch, Measure, MeasureEntry, NoteEntry } from '../types';

// ============================================================
// Pitch Constants
// ============================================================

/**
 * Step order for pitch operations (C D E F G A B)
 */
export const STEPS: Pitch['step'][] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

/**
 * Semitone values for each step (C=0, D=2, E=4, F=5, G=7, A=9, B=11)
 */
export const STEP_SEMITONES: Record<Pitch['step'], number> = {
  'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11,
};

/**
 * Convert a pitch to its semitone value (MIDI-like number)
 */
export function pitchToSemitone(pitch: Pitch): number {
  return pitch.octave * 12 + STEP_SEMITONES[pitch.step] + (pitch.alter ?? 0);
}

// ============================================================
// Position Calculation Helpers
// ============================================================

/**
 * Options for position tracking during measure iteration
 */
export interface PositionState {
  position: number;
  lastNonChordPosition: number;
}

/**
 * Create initial position state
 */
export function createPositionState(): PositionState {
  return { position: 0, lastNonChordPosition: 0 };
}

/**
 * Update position state based on a measure entry
 * Returns the position for the current entry (before update)
 */
export function updatePositionForEntry(state: PositionState, entry: MeasureEntry): number {
  const currentPosition = state.position;

  switch (entry.type) {
    case 'note': {
      const note = entry as NoteEntry;
      if (!note.chord) {
        state.lastNonChordPosition = state.position;
        state.position += note.duration;
      }
      return note.chord ? state.lastNonChordPosition : currentPosition;
    }
    case 'backup':
      state.position -= entry.duration;
      state.lastNonChordPosition = state.position;
      return currentPosition;
    case 'forward':
      state.position += entry.duration;
      state.lastNonChordPosition = state.position;
      return currentPosition;
    default:
      return currentPosition;
  }
}

/**
 * Calculate the absolute position of a note within a measure
 */
export function getAbsolutePositionForNote(note: NoteEntry, measure: Measure): number {
  const state = createPositionState();

  for (const entry of measure.entries) {
    if (entry === note) {
      return entry.chord ? state.lastNonChordPosition : state.position;
    }
    updatePositionForEntry(state, entry);
  }

  return state.position;
}

/**
 * Calculate the current position at the end of a measure
 */
export function getMeasureEndPosition(measure: Measure): number {
  const state = createPositionState();

  for (const entry of measure.entries) {
    updatePositionForEntry(state, entry);
  }

  return state.position;
}
