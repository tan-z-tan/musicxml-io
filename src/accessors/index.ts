import type {
  Score,
  Measure,
  NoteEntry,
  VoiceGroup,
  StaffGroup,
  NoteWithPosition,
  Chord,
  NoteIteratorItem,
} from '../types';
import { getAbsolutePositionForNote, createPositionState, updatePositionForEntry } from '../utils';

/**
 * Filter options for voice/staff selection
 */
export interface VoiceFilter {
  voice?: number;
  staff?: number;
}

/**
 * Get all notes for a specific voice (and optionally staff)
 */
export function getNotesForVoice(measure: Measure, filter: VoiceFilter): NoteEntry[] {
  return measure.entries.filter((entry): entry is NoteEntry => {
    if (entry.type !== 'note') return false;
    if (filter.voice !== undefined && entry.voice !== filter.voice) return false;
    if (filter.staff !== undefined && (entry.staff ?? 1) !== filter.staff) return false;
    return true;
  });
}

/**
 * Get all notes for a specific staff (regardless of voice)
 */
export function getNotesForStaff(measure: Measure, filter: { staff: number }): NoteEntry[] {
  return measure.entries.filter((entry): entry is NoteEntry => {
    if (entry.type !== 'note') return false;
    return (entry.staff ?? 1) === filter.staff;
  });
}

/**
 * Group notes by voice (and staff)
 */
export function groupByVoice(measure: Measure): VoiceGroup[] {
  const groups = new Map<string, VoiceGroup>();

  for (const entry of measure.entries) {
    if (entry.type !== 'note') continue;

    const staff = entry.staff ?? 1;
    const voice = entry.voice;
    const key = `${staff}-${voice}`;

    if (!groups.has(key)) {
      groups.set(key, { staff, voice, notes: [] });
    }

    groups.get(key)!.notes.push(entry);
  }

  // Sort by staff, then by voice
  return Array.from(groups.values()).sort((a, b) => {
    if (a.staff !== b.staff) return a.staff - b.staff;
    return a.voice - b.voice;
  });
}

/**
 * Group notes by staff
 */
export function groupByStaff(measure: Measure): StaffGroup[] {
  const groups = new Map<number, StaffGroup>();

  for (const entry of measure.entries) {
    if (entry.type !== 'note') continue;

    const staff = entry.staff ?? 1;

    if (!groups.has(staff)) {
      groups.set(staff, { staff, notes: [] });
    }

    groups.get(staff)!.notes.push(entry);
  }

  return Array.from(groups.values()).sort((a, b) => a.staff - b.staff);
}

/**
 * Calculate absolute position of a note within a measure
 * Position is in divisions from the start of the measure
 */
export function getAbsolutePosition(note: NoteEntry, measure: Measure): number {
  return getAbsolutePositionForNote(note, measure);
}

/**
 * Add absolute position to all notes in a measure
 */
export function withAbsolutePositions(measure: Measure): NoteWithPosition[] {
  const result: NoteWithPosition[] = [];
  const state = createPositionState();

  for (const entry of measure.entries) {
    if (entry.type === 'note') {
      const notePosition = entry.chord ? state.lastNonChordPosition : state.position;
      result.push({
        ...entry,
        absolutePosition: notePosition,
      });
    }
    updatePositionForEntry(state, entry);
  }

  return result;
}

/**
 * Get chords (groups of simultaneously sounding notes)
 */
export function getChords(measure: Measure, filter?: VoiceFilter): Chord[] {
  const notesWithPos = withAbsolutePositions(measure);

  // Filter by voice/staff if specified
  const filteredNotes = filter
    ? notesWithPos.filter((note) => {
        if (filter.voice !== undefined && note.voice !== filter.voice) return false;
        if (filter.staff !== undefined && (note.staff ?? 1) !== filter.staff) return false;
        return true;
      })
    : notesWithPos;

  // Group by position
  const chordMap = new Map<number, NoteWithPosition[]>();

  for (const note of filteredNotes) {
    const pos = note.absolutePosition;
    if (!chordMap.has(pos)) {
      chordMap.set(pos, []);
    }
    chordMap.get(pos)!.push(note);
  }

  // Convert to Chord array
  const chords: Chord[] = [];

  for (const [position, notes] of chordMap.entries()) {
    // All notes in a chord should have the same duration (using first note's duration)
    const duration = notes[0].duration;

    chords.push({
      position,
      duration,
      notes: notes.map(({ absolutePosition, ...note }) => note),
    });
  }

  // Sort by position
  return chords.sort((a, b) => a.position - b.position);
}

/**
 * Iterate over all notes in a score
 */
export function* iterateNotes(score: Score): Generator<NoteIteratorItem> {
  for (const part of score.parts) {
    for (const measure of part.measures) {
      const state = createPositionState();

      for (const entry of measure.entries) {
        if (entry.type === 'note') {
          const notePosition = entry.chord ? state.lastNonChordPosition : state.position;
          yield {
            part,
            measure,
            note: entry,
            position: notePosition,
          };
        }
        updatePositionForEntry(state, entry);
      }
    }
  }
}

/**
 * Get all notes from a score as an array
 */
export function getAllNotes(score: Score): NoteIteratorItem[] {
  return Array.from(iterateNotes(score));
}

/**
 * Get unique voices used in a measure
 */
export function getVoices(measure: Measure): number[] {
  const voices = new Set<number>();

  for (const entry of measure.entries) {
    if (entry.type === 'note') {
      voices.add(entry.voice);
    }
  }

  return Array.from(voices).sort((a, b) => a - b);
}

/**
 * Get unique staves used in a measure
 */
export function getStaves(measure: Measure): number[] {
  const staves = new Set<number>();

  for (const entry of measure.entries) {
    if (entry.type === 'note') {
      staves.add(entry.staff ?? 1);
    }
  }

  return Array.from(staves).sort((a, b) => a - b);
}

/**
 * Check if a measure contains any notes
 */
export function hasNotes(measure: Measure): boolean {
  return measure.entries.some((entry) => entry.type === 'note');
}

/**
 * Check if a measure is a rest (no pitched notes)
 */
export function isRestMeasure(measure: Measure): boolean {
  const notes = measure.entries.filter((entry): entry is NoteEntry => entry.type === 'note');
  return notes.length === 0 || notes.every((note) => !note.pitch);
}

/**
 * Options for normalized position calculation
 */
export interface NormalizedPositionOptions {
  baseDivisions: number;
  currentDivisions?: number;
}

/**
 * Get a normalized position of a note using a common base divisions
 * This is useful when comparing positions across measures with different divisions
 */
export function getNormalizedPosition(
  note: NoteEntry,
  measure: Measure,
  options: NormalizedPositionOptions
): number {
  const absolutePosition = getAbsolutePosition(note, measure);
  const currentDivisions = options.currentDivisions ?? measure.attributes?.divisions ?? 1;

  // Convert from current divisions to base divisions
  return (absolutePosition * options.baseDivisions) / currentDivisions;
}

/**
 * Get normalized duration of a note using a common base divisions
 */
export function getNormalizedDuration(
  note: NoteEntry,
  options: NormalizedPositionOptions
): number {
  const currentDivisions = options.currentDivisions ?? 1;
  return (note.duration * options.baseDivisions) / currentDivisions;
}
