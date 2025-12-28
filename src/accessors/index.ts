import type {
  Score,
  Part,
  Measure,
  MeasureEntry,
  NoteEntry,
  DirectionEntry,
  HarmonyEntry,
  Clef,
  VoiceGroup,
  StaffGroup,
  NoteWithPosition,
  Chord,
  NoteIteratorItem,
  VoiceToStaffMap,
  NoteWithContext,
  EntryWithContext,
  DirectionWithContext,
  StaffRange,
  PositionQueryOptions,
  VerticalSlice,
  VoiceLine,
  AdjacentNotes,
  DirectionKind,
  DynamicWithContext,
  TempoWithContext,
  PedalWithContext,
  WedgeWithContext,
  OctaveShiftWithContext,
  TiedNoteGroup,
  SlurSpan,
  TupletGroup,
  BeamGroup,
  NotationType,
  HarmonyWithContext,
  LyricWithContext,
  AssembledLyrics,
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

// ============================================================
// Phase 1: Staff Enhancement
// ============================================================

/**
 * Get all entries for a specific staff (including notes, directions, etc.)
 */
export function getEntriesForStaff(measure: Measure, staff: number): MeasureEntry[] {
  return measure.entries.filter((entry) => {
    if (entry.type === 'note') {
      return (entry.staff ?? 1) === staff;
    }
    if (entry.type === 'forward') {
      return (entry.staff ?? 1) === staff;
    }
    if (entry.type === 'direction') {
      return (entry.staff ?? 1) === staff;
    }
    // backup is staff-neutral
    if (entry.type === 'backup') {
      return false;
    }
    return false;
  });
}

/**
 * Build a Voice to Staff mapping from a measure
 * Uses explicitly specified staff values to infer staff for voices
 */
export function buildVoiceToStaffMap(measure: Measure): VoiceToStaffMap {
  const map = new Map<number, number>();

  for (const entry of measure.entries) {
    if (entry.type === 'note' && entry.staff !== undefined) {
      const voice = entry.voice;
      const staff = entry.staff;
      // Use the first occurrence for each voice
      if (!map.has(voice)) {
        map.set(voice, staff);
      }
    }
  }

  return {
    get: (voice: number) => map.get(voice),
    has: (voice: number) => map.has(voice),
    entries: () => map.entries(),
    size: map.size,
  };
}

/**
 * Build a Voice to Staff mapping from all measures in a part
 */
export function buildVoiceToStaffMapForPart(part: Part): VoiceToStaffMap {
  const map = new Map<number, number>();

  for (const measure of part.measures) {
    for (const entry of measure.entries) {
      if (entry.type === 'note' && entry.staff !== undefined) {
        const voice = entry.voice;
        const staff = entry.staff;
        if (!map.has(voice)) {
          map.set(voice, staff);
        }
      }
    }
  }

  return {
    get: (voice: number) => map.get(voice),
    has: (voice: number) => map.has(voice),
    entries: () => map.entries(),
    size: map.size,
  };
}

/**
 * Infer staff number for an entry using voice-to-staff mapping
 * Returns 1 as default if unable to infer (per MusicXML spec)
 */
export function inferStaff(
  entry: NoteEntry,
  voiceToStaffMap: VoiceToStaffMap
): number {
  // If staff is explicitly set, use it
  if (entry.staff !== undefined) {
    return entry.staff;
  }

  // Try to infer from voice mapping
  const inferredStaff = voiceToStaffMap.get(entry.voice);
  if (inferredStaff !== undefined) {
    return inferredStaff;
  }

  // Default to 1 per MusicXML spec
  return 1;
}

/**
 * Get effective staff for an entry (explicit or inferred)
 */
export function getEffectiveStaff(entry: NoteEntry, measure: Measure): number {
  if (entry.staff !== undefined) {
    return entry.staff;
  }
  const map = buildVoiceToStaffMap(measure);
  return inferStaff(entry, map);
}

/**
 * Get the clef for a specific staff at a given measure
 * Searches backwards from the specified measure to find the most recent clef
 */
export function getClefForStaff(
  score: Score,
  options: { partIndex: number; measureIndex: number; staff: number }
): Clef | undefined {
  const part = score.parts[options.partIndex];
  if (!part) return undefined;

  // Search from the beginning up to the specified measure
  for (let i = options.measureIndex; i >= 0; i--) {
    const measure = part.measures[i];

    // Check inline attributes entries
    for (const entry of measure.entries) {
      if (entry.type === 'attributes' && entry.attributes.clef) {
        for (const clef of entry.attributes.clef) {
          if ((clef.staff ?? 1) === options.staff) {
            return clef;
          }
        }
      }
    }

    // Check measure attributes
    if (measure.attributes?.clef) {
      for (const clef of measure.attributes.clef) {
        if ((clef.staff ?? 1) === options.staff) {
          return clef;
        }
      }
    }
  }

  return undefined;
}

/**
 * Get all voices used within a specific staff
 */
export function getVoicesForStaff(measure: Measure, staff: number): number[] {
  const voices = new Set<number>();

  for (const entry of measure.entries) {
    if (entry.type === 'note') {
      const entryStaff = entry.staff ?? 1;
      if (entryStaff === staff) {
        voices.add(entry.voice);
      }
    }
  }

  return Array.from(voices).sort((a, b) => a - b);
}

/**
 * Get the range of staff numbers used in a part
 */
export function getStaffRange(score: Score, partIndex: number): StaffRange {
  const part = score.parts[partIndex];
  if (!part) return { min: 1, max: 1 };

  let min = 1;
  let max = 1;

  for (const measure of part.measures) {
    // Check staves attribute
    if (measure.attributes?.staves !== undefined) {
      max = Math.max(max, measure.attributes.staves);
    }

    // Also check actual note staves
    for (const entry of measure.entries) {
      if (entry.type === 'note' && entry.staff !== undefined) {
        max = Math.max(max, entry.staff);
      }
    }
  }

  return { min, max };
}

// ============================================================
// Phase 2: Position and Voice Line
// ============================================================

/**
 * Get all entries at a specific position in a measure
 */
export function getEntriesAtPosition(
  measure: Measure,
  position: number,
  options?: PositionQueryOptions
): MeasureEntry[] {
  const result: MeasureEntry[] = [];
  const state = createPositionState();

  for (const entry of measure.entries) {
    const currentPosition = entry.type === 'note' && entry.chord
      ? state.lastNonChordPosition
      : state.position;

    if (currentPosition === position) {
      // Apply filters
      if (entry.type === 'note') {
        if (options?.staff !== undefined && (entry.staff ?? 1) !== options.staff) {
          updatePositionForEntry(state, entry);
          continue;
        }
        if (options?.voice !== undefined && entry.voice !== options.voice) {
          updatePositionForEntry(state, entry);
          continue;
        }
        if (options?.includeChordNotes === false && entry.chord) {
          updatePositionForEntry(state, entry);
          continue;
        }
      }
      result.push(entry);
    }

    updatePositionForEntry(state, entry);
  }

  return result;
}

/**
 * Get all notes at a specific position in a measure
 */
export function getNotesAtPosition(
  measure: Measure,
  position: number,
  options?: PositionQueryOptions
): NoteEntry[] {
  return getEntriesAtPosition(measure, position, options).filter(
    (entry): entry is NoteEntry => entry.type === 'note'
  );
}

/**
 * Get all entries within a position range
 */
export function getEntriesInRange(
  measure: Measure,
  range: { start: number; end: number },
  options?: PositionQueryOptions
): MeasureEntry[] {
  const result: MeasureEntry[] = [];
  const state = createPositionState();

  for (const entry of measure.entries) {
    const currentPosition = entry.type === 'note' && entry.chord
      ? state.lastNonChordPosition
      : state.position;

    if (currentPosition >= range.start && currentPosition < range.end) {
      if (entry.type === 'note') {
        if (options?.staff !== undefined && (entry.staff ?? 1) !== options.staff) {
          updatePositionForEntry(state, entry);
          continue;
        }
        if (options?.voice !== undefined && entry.voice !== options.voice) {
          updatePositionForEntry(state, entry);
          continue;
        }
        if (options?.includeChordNotes === false && entry.chord) {
          updatePositionForEntry(state, entry);
          continue;
        }
      }
      result.push(entry);
    }

    updatePositionForEntry(state, entry);
  }

  return result;
}

/**
 * Get all notes within a position range
 */
export function getNotesInRange(
  measure: Measure,
  range: { start: number; end: number },
  options?: PositionQueryOptions
): NoteEntry[] {
  return getEntriesInRange(measure, range, options).filter(
    (entry): entry is NoteEntry => entry.type === 'note'
  );
}

/**
 * Get a vertical slice of all notes at a specific position across all parts
 */
export function getVerticalSlice(
  score: Score,
  options: { measureIndex: number; position: number }
): VerticalSlice {
  const parts = new Map<number, NoteEntry[]>();

  for (let partIndex = 0; partIndex < score.parts.length; partIndex++) {
    const part = score.parts[partIndex];
    const measure = part.measures[options.measureIndex];
    if (!measure) continue;

    const notes = getNotesAtPosition(measure, options.position);
    if (notes.length > 0) {
      parts.set(partIndex, notes);
    }
  }

  return {
    measureIndex: options.measureIndex,
    position: options.position,
    parts,
  };
}

/**
 * Get a continuous voice line across all measures
 */
export function getVoiceLine(
  score: Score,
  options: { partIndex: number; voice: number; staff?: number }
): VoiceLine {
  const part = score.parts[options.partIndex];
  if (!part) {
    return { partIndex: options.partIndex, voice: options.voice, staff: options.staff, notes: [] };
  }

  const notes: NoteWithContext[] = [];

  for (let measureIndex = 0; measureIndex < part.measures.length; measureIndex++) {
    const measure = part.measures[measureIndex];
    const state = createPositionState();

    for (const entry of measure.entries) {
      if (entry.type === 'note') {
        const entryStaff = entry.staff ?? 1;
        const matchesVoice = entry.voice === options.voice;
        const matchesStaff = options.staff === undefined || entryStaff === options.staff;

        if (matchesVoice && matchesStaff) {
          const position = entry.chord ? state.lastNonChordPosition : state.position;
          notes.push({
            note: entry,
            part,
            partIndex: options.partIndex,
            measure,
            measureIndex,
            position,
          });
        }
      }
      updatePositionForEntry(state, entry);
    }
  }

  return {
    partIndex: options.partIndex,
    voice: options.voice,
    staff: options.staff,
    notes,
  };
}

/**
 * Get a voice line within a measure range
 */
export function getVoiceLineInRange(
  score: Score,
  options: { partIndex: number; voice: number; startMeasure: number; endMeasure: number; staff?: number }
): VoiceLine {
  const part = score.parts[options.partIndex];
  if (!part) {
    return { partIndex: options.partIndex, voice: options.voice, staff: options.staff, notes: [] };
  }

  const notes: NoteWithContext[] = [];

  for (let measureIndex = options.startMeasure; measureIndex <= options.endMeasure && measureIndex < part.measures.length; measureIndex++) {
    const measure = part.measures[measureIndex];
    const state = createPositionState();

    for (const entry of measure.entries) {
      if (entry.type === 'note') {
        const entryStaff = entry.staff ?? 1;
        const matchesVoice = entry.voice === options.voice;
        const matchesStaff = options.staff === undefined || entryStaff === options.staff;

        if (matchesVoice && matchesStaff) {
          const position = entry.chord ? state.lastNonChordPosition : state.position;
          notes.push({
            note: entry,
            part,
            partIndex: options.partIndex,
            measure,
            measureIndex,
            position,
          });
        }
      }
      updatePositionForEntry(state, entry);
    }
  }

  return {
    partIndex: options.partIndex,
    voice: options.voice,
    staff: options.staff,
    notes,
  };
}

// ============================================================
// Phase 3: Navigation
// ============================================================

/**
 * Iterate over all entries in a score (not just notes)
 */
export function* iterateEntries(score: Score): Generator<EntryWithContext> {
  for (let partIndex = 0; partIndex < score.parts.length; partIndex++) {
    const part = score.parts[partIndex];
    for (let measureIndex = 0; measureIndex < part.measures.length; measureIndex++) {
      const measure = part.measures[measureIndex];
      const state = createPositionState();

      for (const entry of measure.entries) {
        const position = entry.type === 'note' && entry.chord
          ? state.lastNonChordPosition
          : state.position;

        yield {
          entry,
          part,
          partIndex,
          measure,
          measureIndex,
          position,
        };

        updatePositionForEntry(state, entry);
      }
    }
  }
}

/**
 * Get the next note in the same voice
 */
export function getNextNote(
  score: Score,
  context: NoteWithContext
): NoteWithContext | null {
  const part = score.parts[context.partIndex];
  if (!part) return null;

  let foundCurrent = false;

  for (let measureIndex = context.measureIndex; measureIndex < part.measures.length; measureIndex++) {
    const measure = part.measures[measureIndex];
    const state = createPositionState();

    for (const entry of measure.entries) {
      if (entry.type === 'note') {
        const entryPosition = entry.chord ? state.lastNonChordPosition : state.position;

        // Check if this is the current note
        if (
          measureIndex === context.measureIndex &&
          entry === context.note
        ) {
          foundCurrent = true;
          updatePositionForEntry(state, entry);
          continue;
        }

        // If we've found the current note, look for the next one in the same voice
        if (foundCurrent && entry.voice === context.note.voice && !entry.chord) {
          // Also check staff if the original note had a staff
          if (context.note.staff !== undefined) {
            if ((entry.staff ?? 1) !== context.note.staff) {
              updatePositionForEntry(state, entry);
              continue;
            }
          }
          return {
            note: entry,
            part,
            partIndex: context.partIndex,
            measure,
            measureIndex,
            position: entryPosition,
          };
        }
      }
      updatePositionForEntry(state, entry);
    }
  }

  return null;
}

/**
 * Get the previous note in the same voice
 */
export function getPrevNote(
  score: Score,
  context: NoteWithContext
): NoteWithContext | null {
  const part = score.parts[context.partIndex];
  if (!part) return null;

  let lastCandidate: NoteWithContext | null = null;

  for (let measureIndex = 0; measureIndex <= context.measureIndex; measureIndex++) {
    const measure = part.measures[measureIndex];
    const state = createPositionState();

    for (const entry of measure.entries) {
      if (entry.type === 'note') {
        const entryPosition = entry.chord ? state.lastNonChordPosition : state.position;

        // Check if this is the current note - return the last candidate
        if (
          measureIndex === context.measureIndex &&
          entry === context.note
        ) {
          return lastCandidate;
        }

        // Check if this note is in the same voice (and potentially staff)
        if (entry.voice === context.note.voice && !entry.chord) {
          if (context.note.staff !== undefined) {
            if ((entry.staff ?? 1) !== context.note.staff) {
              updatePositionForEntry(state, entry);
              continue;
            }
          }
          lastCandidate = {
            note: entry,
            part,
            partIndex: context.partIndex,
            measure,
            measureIndex,
            position: entryPosition,
          };
        }
      }
      updatePositionForEntry(state, entry);
    }
  }

  return null;
}

/**
 * Get both previous and next notes
 */
export function getAdjacentNotes(
  score: Score,
  context: NoteWithContext
): AdjacentNotes {
  return {
    prev: getPrevNote(score, context),
    next: getNextNote(score, context),
  };
}

// ============================================================
// Phase 4: Direction and Expression
// ============================================================

/**
 * Get all directions from a score or specific part/measure
 */
export function getDirections(
  score: Score,
  options?: { partIndex?: number; measureIndex?: number }
): DirectionWithContext[] {
  const results: DirectionWithContext[] = [];

  const startPart = options?.partIndex ?? 0;
  const endPart = options?.partIndex !== undefined ? options.partIndex + 1 : score.parts.length;

  for (let partIndex = startPart; partIndex < endPart; partIndex++) {
    const part = score.parts[partIndex];
    if (!part) continue;

    const startMeasure = options?.measureIndex ?? 0;
    const endMeasure = options?.measureIndex !== undefined ? options.measureIndex + 1 : part.measures.length;

    for (let measureIndex = startMeasure; measureIndex < endMeasure; measureIndex++) {
      const measure = part.measures[measureIndex];
      if (!measure) continue;

      const state = createPositionState();

      for (const entry of measure.entries) {
        if (entry.type === 'direction') {
          results.push({
            direction: entry,
            part,
            partIndex,
            measure,
            measureIndex,
            position: state.position,
          });
        }
        updatePositionForEntry(state, entry);
      }
    }
  }

  return results;
}

/**
 * Get directions at a specific position in a measure
 */
export function getDirectionsAtPosition(
  measure: Measure,
  position: number
): DirectionEntry[] {
  const results: DirectionEntry[] = [];
  const state = createPositionState();

  for (const entry of measure.entries) {
    if (entry.type === 'direction' && state.position === position) {
      results.push(entry);
    }
    updatePositionForEntry(state, entry);
  }

  return results;
}

/**
 * Find directions by type (kind)
 */
export function findDirectionsByType(
  score: Score,
  kind: DirectionKind
): DirectionWithContext[] {
  const allDirections = getDirections(score);
  return allDirections.filter((d) =>
    d.direction.directionTypes.some((dt) => dt.kind === kind)
  );
}

/**
 * Get all dynamics markings from a score
 */
export function getDynamics(
  score: Score,
  options?: { partIndex?: number }
): DynamicWithContext[] {
  const results: DynamicWithContext[] = [];

  const startPart = options?.partIndex ?? 0;
  const endPart = options?.partIndex !== undefined ? options.partIndex + 1 : score.parts.length;

  for (let partIndex = startPart; partIndex < endPart; partIndex++) {
    const part = score.parts[partIndex];
    if (!part) continue;

    for (let measureIndex = 0; measureIndex < part.measures.length; measureIndex++) {
      const measure = part.measures[measureIndex];
      const state = createPositionState();

      for (const entry of measure.entries) {
        if (entry.type === 'direction') {
          for (const dirType of entry.directionTypes) {
            if (dirType.kind === 'dynamics') {
              results.push({
                dynamic: dirType.value,
                direction: entry,
                part,
                partIndex,
                measure,
                measureIndex,
                position: state.position,
              });
            }
          }
        }
        updatePositionForEntry(state, entry);
      }
    }
  }

  return results;
}

/**
 * Get all tempo markings from a score
 */
export function getTempoMarkings(score: Score): TempoWithContext[] {
  const results: TempoWithContext[] = [];

  for (let partIndex = 0; partIndex < score.parts.length; partIndex++) {
    const part = score.parts[partIndex];

    for (let measureIndex = 0; measureIndex < part.measures.length; measureIndex++) {
      const measure = part.measures[measureIndex];
      const state = createPositionState();

      for (const entry of measure.entries) {
        if (entry.type === 'direction') {
          for (const dirType of entry.directionTypes) {
            if (dirType.kind === 'metronome') {
              results.push({
                beatUnit: dirType.beatUnit,
                perMinute: dirType.perMinute,
                beatUnitDot: dirType.beatUnitDot,
                direction: entry,
                partIndex,
                measureIndex,
                position: state.position,
              });
            }
          }
        }
        updatePositionForEntry(state, entry);
      }
    }
  }

  return results;
}

/**
 * Get all pedal markings from a score
 */
export function getPedalMarkings(
  score: Score,
  options?: { partIndex?: number }
): PedalWithContext[] {
  const results: PedalWithContext[] = [];

  const startPart = options?.partIndex ?? 0;
  const endPart = options?.partIndex !== undefined ? options.partIndex + 1 : score.parts.length;

  for (let partIndex = startPart; partIndex < endPart; partIndex++) {
    const part = score.parts[partIndex];
    if (!part) continue;

    for (let measureIndex = 0; measureIndex < part.measures.length; measureIndex++) {
      const measure = part.measures[measureIndex];
      const state = createPositionState();

      for (const entry of measure.entries) {
        if (entry.type === 'direction') {
          for (const dirType of entry.directionTypes) {
            if (dirType.kind === 'pedal') {
              results.push({
                pedalType: dirType.type,
                direction: entry,
                partIndex,
                measureIndex,
                position: state.position,
              });
            }
          }
        }
        updatePositionForEntry(state, entry);
      }
    }
  }

  return results;
}

/**
 * Get all wedges (crescendo/diminuendo) from a score
 */
export function getWedges(
  score: Score,
  options?: { partIndex?: number }
): WedgeWithContext[] {
  const results: WedgeWithContext[] = [];

  const startPart = options?.partIndex ?? 0;
  const endPart = options?.partIndex !== undefined ? options.partIndex + 1 : score.parts.length;

  for (let partIndex = startPart; partIndex < endPart; partIndex++) {
    const part = score.parts[partIndex];
    if (!part) continue;

    for (let measureIndex = 0; measureIndex < part.measures.length; measureIndex++) {
      const measure = part.measures[measureIndex];
      const state = createPositionState();

      for (const entry of measure.entries) {
        if (entry.type === 'direction') {
          for (const dirType of entry.directionTypes) {
            if (dirType.kind === 'wedge') {
              results.push({
                wedgeType: dirType.type,
                direction: entry,
                partIndex,
                measureIndex,
                position: state.position,
              });
            }
          }
        }
        updatePositionForEntry(state, entry);
      }
    }
  }

  return results;
}

/**
 * Get all octave shifts from a score
 */
export function getOctaveShifts(
  score: Score,
  options?: { partIndex?: number }
): OctaveShiftWithContext[] {
  const results: OctaveShiftWithContext[] = [];

  const startPart = options?.partIndex ?? 0;
  const endPart = options?.partIndex !== undefined ? options.partIndex + 1 : score.parts.length;

  for (let partIndex = startPart; partIndex < endPart; partIndex++) {
    const part = score.parts[partIndex];
    if (!part) continue;

    for (let measureIndex = 0; measureIndex < part.measures.length; measureIndex++) {
      const measure = part.measures[measureIndex];
      const state = createPositionState();

      for (const entry of measure.entries) {
        if (entry.type === 'direction') {
          for (const dirType of entry.directionTypes) {
            if (dirType.kind === 'octave-shift') {
              results.push({
                shiftType: dirType.type,
                size: dirType.size,
                direction: entry,
                partIndex,
                measureIndex,
                position: state.position,
              });
            }
          }
        }
        updatePositionForEntry(state, entry);
      }
    }
  }

  return results;
}

// ============================================================
// Phase 5: Groups and Spans
// ============================================================

/**
 * Get all groups of tied notes in a score
 * Each group represents notes connected by ties
 */
export function getTiedNoteGroups(
  score: Score,
  options?: { partIndex?: number }
): TiedNoteGroup[] {
  const results: TiedNoteGroup[] = [];

  const startPart = options?.partIndex ?? 0;
  const endPart = options?.partIndex !== undefined ? options.partIndex + 1 : score.parts.length;

  for (let partIndex = startPart; partIndex < endPart; partIndex++) {
    const part = score.parts[partIndex];
    if (!part) continue;

    // Track pending ties by pitch key (step + octave + voice)
    const pendingTies = new Map<string, NoteWithContext[]>();

    for (let measureIndex = 0; measureIndex < part.measures.length; measureIndex++) {
      const measure = part.measures[measureIndex];
      const state = createPositionState();

      for (const entry of measure.entries) {
        if (entry.type === 'note' && entry.pitch) {
          const position = entry.chord ? state.lastNonChordPosition : state.position;
          const pitchKey = `${entry.pitch.step}${entry.pitch.octave}-${entry.voice}`;
          const context: NoteWithContext = {
            note: entry,
            part,
            partIndex,
            measure,
            measureIndex,
            position,
          };

          // Check for tie start
          const hasTieStart = entry.tie?.type === 'start' ||
            entry.ties?.some(t => t.type === 'start') ||
            entry.notations?.some(n => n.type === 'tied' && n.tiedType === 'start');

          // Check for tie stop
          const hasTieStop = entry.tie?.type === 'stop' ||
            entry.ties?.some(t => t.type === 'stop') ||
            entry.notations?.some(n => n.type === 'tied' && n.tiedType === 'stop');

          if (hasTieStop && pendingTies.has(pitchKey)) {
            // End of a tie group
            const group = pendingTies.get(pitchKey)!;
            group.push(context);

            if (!hasTieStart) {
              // This is the final note, finalize the group
              const totalDuration = group.reduce((sum, nc) => sum + nc.note.duration, 0);
              results.push({ notes: group, totalDuration });
              pendingTies.delete(pitchKey);
            }
          } else if (hasTieStart) {
            // Start of a new tie group
            pendingTies.set(pitchKey, [context]);
          }
        }
        updatePositionForEntry(state, entry);
      }
    }
  }

  return results;
}

/**
 * Get all slur spans in a score
 * Each span represents a slur from start to stop
 */
export function getSlurSpans(
  score: Score,
  options?: { partIndex?: number }
): SlurSpan[] {
  const results: SlurSpan[] = [];

  const startPart = options?.partIndex ?? 0;
  const endPart = options?.partIndex !== undefined ? options.partIndex + 1 : score.parts.length;

  for (let partIndex = startPart; partIndex < endPart; partIndex++) {
    const part = score.parts[partIndex];
    if (!part) continue;

    // Track pending slurs by slur number
    const pendingSlurs = new Map<number, { startNote: NoteWithContext; notes: NoteWithContext[] }>();

    for (let measureIndex = 0; measureIndex < part.measures.length; measureIndex++) {
      const measure = part.measures[measureIndex];
      const state = createPositionState();

      for (const entry of measure.entries) {
        if (entry.type === 'note') {
          const position = entry.chord ? state.lastNonChordPosition : state.position;
          const context: NoteWithContext = {
            note: entry,
            part,
            partIndex,
            measure,
            measureIndex,
            position,
          };

          // Check for slur notations
          if (entry.notations) {
            for (const notation of entry.notations) {
              if (notation.type === 'slur') {
                const slurNumber = notation.number ?? 1;

                if (notation.slurType === 'start') {
                  pendingSlurs.set(slurNumber, { startNote: context, notes: [context] });
                } else if (notation.slurType === 'stop' && pendingSlurs.has(slurNumber)) {
                  const pending = pendingSlurs.get(slurNumber)!;
                  pending.notes.push(context);
                  results.push({
                    number: slurNumber,
                    startNote: pending.startNote,
                    endNote: context,
                    notes: pending.notes,
                  });
                  pendingSlurs.delete(slurNumber);
                } else if (notation.slurType === 'continue' && pendingSlurs.has(slurNumber)) {
                  pendingSlurs.get(slurNumber)!.notes.push(context);
                }
              }
            }
          }

          // Add note to any active slurs (if not already added)
          for (const [, pending] of pendingSlurs) {
            const lastNote = pending.notes[pending.notes.length - 1];
            if (lastNote !== context) {
              pending.notes.push(context);
            }
          }
        }
        updatePositionForEntry(state, entry);
      }
    }
  }

  return results;
}

/**
 * Get all tuplet groups in a score
 */
export function getTupletGroups(
  score: Score,
  options?: { partIndex?: number }
): TupletGroup[] {
  const results: TupletGroup[] = [];

  const startPart = options?.partIndex ?? 0;
  const endPart = options?.partIndex !== undefined ? options.partIndex + 1 : score.parts.length;

  for (let partIndex = startPart; partIndex < endPart; partIndex++) {
    const part = score.parts[partIndex];
    if (!part) continue;

    // Track pending tuplets by tuplet number
    const pendingTuplets = new Map<number, { notes: NoteWithContext[]; actualNotes: number; normalNotes: number }>();

    for (let measureIndex = 0; measureIndex < part.measures.length; measureIndex++) {
      const measure = part.measures[measureIndex];
      const state = createPositionState();

      for (const entry of measure.entries) {
        if (entry.type === 'note') {
          const position = entry.chord ? state.lastNonChordPosition : state.position;
          const context: NoteWithContext = {
            note: entry,
            part,
            partIndex,
            measure,
            measureIndex,
            position,
          };

          // Check for tuplet notations
          if (entry.notations) {
            for (const notation of entry.notations) {
              if (notation.type === 'tuplet') {
                const tupletNumber = notation.number ?? 1;

                if (notation.tupletType === 'start') {
                  const actualNotes = entry.timeModification?.actualNotes ?? 3;
                  const normalNotes = entry.timeModification?.normalNotes ?? 2;
                  pendingTuplets.set(tupletNumber, {
                    notes: [context],
                    actualNotes,
                    normalNotes,
                  });
                } else if (notation.tupletType === 'stop' && pendingTuplets.has(tupletNumber)) {
                  const pending = pendingTuplets.get(tupletNumber)!;
                  pending.notes.push(context);
                  results.push({
                    number: tupletNumber,
                    notes: pending.notes,
                    actualNotes: pending.actualNotes,
                    normalNotes: pending.normalNotes,
                  });
                  pendingTuplets.delete(tupletNumber);
                }
              }
            }
          }

          // Add notes with timeModification to pending tuplets
          if (entry.timeModification && !entry.notations?.some(n => n.type === 'tuplet')) {
            for (const [, pending] of pendingTuplets) {
              if (entry.timeModification.actualNotes === pending.actualNotes &&
                  entry.timeModification.normalNotes === pending.normalNotes) {
                pending.notes.push(context);
              }
            }
          }
        }
        updatePositionForEntry(state, entry);
      }
    }
  }

  return results;
}

/**
 * Get all beam groups in a measure
 * Returns groups of notes connected by beams
 */
export function getBeamGroups(measure: Measure): BeamGroup[] {
  const results: BeamGroup[] = [];
  const state = createPositionState();

  // Track pending beams by beam number
  const pendingBeams = new Map<number, NoteWithContext[]>();

  for (const entry of measure.entries) {
    if (entry.type === 'note' && entry.beam) {
      const position = entry.chord ? state.lastNonChordPosition : state.position;
      const context: NoteWithContext = {
        note: entry,
        part: {} as Part, // Will be set by caller if needed
        partIndex: 0,
        measure,
        measureIndex: 0,
        position,
      };

      for (const beam of entry.beam) {
        const beamNumber = beam.number;

        if (beam.type === 'begin') {
          pendingBeams.set(beamNumber, [context]);
        } else if (beam.type === 'continue' && pendingBeams.has(beamNumber)) {
          pendingBeams.get(beamNumber)!.push(context);
        } else if (beam.type === 'end' && pendingBeams.has(beamNumber)) {
          const group = pendingBeams.get(beamNumber)!;
          group.push(context);
          results.push({
            notes: group,
            beamLevel: beamNumber,
          });
          pendingBeams.delete(beamNumber);
        }
      }
    }
    updatePositionForEntry(state, entry);
  }

  return results;
}

/**
 * Find all notes with a specific notation type
 */
export function findNotesWithNotation(
  score: Score,
  notationType: NotationType,
  options?: { partIndex?: number }
): NoteWithContext[] {
  const results: NoteWithContext[] = [];

  const startPart = options?.partIndex ?? 0;
  const endPart = options?.partIndex !== undefined ? options.partIndex + 1 : score.parts.length;

  for (let partIndex = startPart; partIndex < endPart; partIndex++) {
    const part = score.parts[partIndex];
    if (!part) continue;

    for (let measureIndex = 0; measureIndex < part.measures.length; measureIndex++) {
      const measure = part.measures[measureIndex];
      const state = createPositionState();

      for (const entry of measure.entries) {
        if (entry.type === 'note') {
          const position = entry.chord ? state.lastNonChordPosition : state.position;

          if (entry.notations?.some(n => n.type === notationType)) {
            results.push({
              note: entry,
              part,
              partIndex,
              measure,
              measureIndex,
              position,
            });
          }
        }
        updatePositionForEntry(state, entry);
      }
    }
  }

  return results;
}

// ============================================================
// Phase 6: Harmony and Lyrics
// ============================================================

/**
 * Get all harmonies from a score
 */
export function getHarmonies(
  score: Score,
  options?: { partIndex?: number }
): HarmonyWithContext[] {
  const results: HarmonyWithContext[] = [];

  const startPart = options?.partIndex ?? 0;
  const endPart = options?.partIndex !== undefined ? options.partIndex + 1 : score.parts.length;

  for (let partIndex = startPart; partIndex < endPart; partIndex++) {
    const part = score.parts[partIndex];
    if (!part) continue;

    for (let measureIndex = 0; measureIndex < part.measures.length; measureIndex++) {
      const measure = part.measures[measureIndex];
      const state = createPositionState();

      for (const entry of measure.entries) {
        if (entry.type === 'harmony') {
          results.push({
            harmony: entry,
            part,
            partIndex,
            measure,
            measureIndex,
            position: state.position,
          });
        }
        updatePositionForEntry(state, entry);
      }
    }
  }

  return results;
}

/**
 * Get harmony at a specific position in a measure
 */
export function getHarmonyAtPosition(
  measure: Measure,
  position: number
): HarmonyEntry | undefined {
  const state = createPositionState();
  let lastHarmony: HarmonyEntry | undefined;

  for (const entry of measure.entries) {
    if (entry.type === 'harmony') {
      if (state.position <= position) {
        lastHarmony = entry;
      }
    }
    updatePositionForEntry(state, entry);
    if (state.position > position && lastHarmony) {
      break;
    }
  }

  return lastHarmony;
}

/**
 * Get chord progression (all harmonies in order)
 * Returns a simplified representation of the chord progression
 */
export function getChordProgression(
  score: Score,
  options?: { partIndex?: number }
): { root: string; kind: string; bass?: string; measureIndex: number; position: number }[] {
  const harmonies = getHarmonies(score, options);

  return harmonies.map(h => {
    const rootAlter = h.harmony.root.rootAlter ?? 0;
    const rootAccidental = rootAlter > 0 ? '#'.repeat(rootAlter) : 'b'.repeat(-rootAlter);
    const root = h.harmony.root.rootStep + rootAccidental;

    let bass: string | undefined;
    if (h.harmony.bass) {
      const bassAlter = h.harmony.bass.bassAlter ?? 0;
      const bassAccidental = bassAlter > 0 ? '#'.repeat(bassAlter) : 'b'.repeat(-bassAlter);
      bass = h.harmony.bass.bassStep + bassAccidental;
    }

    return {
      root,
      kind: h.harmony.kind,
      bass,
      measureIndex: h.measureIndex,
      position: h.position,
    };
  });
}

/**
 * Get all lyrics from a score
 */
export function getLyrics(
  score: Score,
  options?: { partIndex?: number; verse?: number }
): LyricWithContext[] {
  const results: LyricWithContext[] = [];

  const startPart = options?.partIndex ?? 0;
  const endPart = options?.partIndex !== undefined ? options.partIndex + 1 : score.parts.length;

  for (let partIndex = startPart; partIndex < endPart; partIndex++) {
    const part = score.parts[partIndex];
    if (!part) continue;

    for (let measureIndex = 0; measureIndex < part.measures.length; measureIndex++) {
      const measure = part.measures[measureIndex];
      const state = createPositionState();

      for (const entry of measure.entries) {
        if (entry.type === 'note' && entry.lyrics) {
          const position = entry.chord ? state.lastNonChordPosition : state.position;

          for (const lyric of entry.lyrics) {
            const verse = lyric.number ?? 1;

            if (options?.verse !== undefined && verse !== options.verse) {
              continue;
            }

            results.push({
              lyric,
              note: entry,
              part,
              partIndex,
              measure,
              measureIndex,
              position,
              verse,
            });
          }
        }
        updatePositionForEntry(state, entry);
      }
    }
  }

  return results;
}

/**
 * Get assembled lyric text for a specific verse
 * Joins syllables with proper hyphenation
 */
export function getLyricText(
  score: Score,
  options?: { partIndex?: number; verse?: number }
): AssembledLyrics[] {
  const lyrics = getLyrics(score, options);

  // Group by verse
  const verseMap = new Map<number, LyricWithContext[]>();
  for (const lyric of lyrics) {
    if (!verseMap.has(lyric.verse)) {
      verseMap.set(lyric.verse, []);
    }
    verseMap.get(lyric.verse)!.push(lyric);
  }

  const results: AssembledLyrics[] = [];

  for (const [verse, verseLyrics] of verseMap) {
    const syllables: { text: string; position: number; measureIndex: number }[] = [];
    const textParts: string[] = [];

    for (const lyric of verseLyrics) {
      const text = lyric.lyric.text;
      syllables.push({
        text,
        position: lyric.position,
        measureIndex: lyric.measureIndex,
      });

      // Handle syllabic joining
      const syllabic = lyric.lyric.syllabic;
      if (syllabic === 'begin' || syllabic === 'middle') {
        textParts.push(text + '-');
      } else if (syllabic === 'end') {
        textParts.push(text + ' ');
      } else {
        // 'single' or undefined
        textParts.push(text + ' ');
      }
    }

    results.push({
      verse,
      text: textParts.join('').trim(),
      syllables,
    });
  }

  // Sort by verse number
  return results.sort((a, b) => a.verse - b.verse);
}

/**
 * Get the number of verses in a score
 */
export function getVerseCount(
  score: Score,
  options?: { partIndex?: number }
): number {
  const verses = new Set<number>();

  const startPart = options?.partIndex ?? 0;
  const endPart = options?.partIndex !== undefined ? options.partIndex + 1 : score.parts.length;

  for (let partIndex = startPart; partIndex < endPart; partIndex++) {
    const part = score.parts[partIndex];
    if (!part) continue;

    for (const measure of part.measures) {
      for (const entry of measure.entries) {
        if (entry.type === 'note' && entry.lyrics) {
          for (const lyric of entry.lyrics) {
            verses.add(lyric.number ?? 1);
          }
        }
      }
    }
  }

  return verses.size;
}
