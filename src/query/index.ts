import type {
  Score,
  Part,
  Measure,
  MeasureAttributes,
  NoteEntry,
  Pitch,
} from '../types';

/**
 * Get a specific measure from the score
 */
export function getMeasure(score: Score, options: { part: number; measure: number }): Measure | undefined {
  const part = score.parts[options.part];
  if (!part) return undefined;

  return part.measures.find((m) => m.number === options.measure);
}

/**
 * Get measure by index
 */
export function getMeasureByIndex(score: Score, options: { part: number; measureIndex: number }): Measure | undefined {
  const part = score.parts[options.part];
  if (!part) return undefined;

  return part.measures[options.measureIndex];
}

/**
 * Get the total number of measures in a score
 */
export function getMeasureCount(score: Score): number {
  if (score.parts.length === 0) return 0;
  return score.parts[0].measures.length;
}

/**
 * Get the divisions value at a specific measure
 * Searches backwards from the specified measure to find the most recent divisions
 */
export function getDivisions(score: Score, options: { part: number; measure: number }): number {
  const part = score.parts[options.part];
  if (!part) return 1;

  for (let i = 0; i < part.measures.length; i++) {
    const m = part.measures[i];
    if (m.number > options.measure) break;

    if (m.attributes?.divisions !== undefined) {
      // Continue searching for a more recent value
    }
  }

  // Search from the beginning up to the specified measure
  let divisions = 1;
  for (const m of part.measures) {
    if (m.number > options.measure) break;
    if (m.attributes?.divisions !== undefined) {
      divisions = m.attributes.divisions;
    }
  }

  return divisions;
}

/**
 * Get the current attributes at a specific measure
 * Merges all attribute changes from measure 1 to the specified measure
 */
export function getAttributesAtMeasure(score: Score, options: { part: number; measure: number }): MeasureAttributes {
  const part = score.parts[options.part];
  if (!part) return {};

  const result: MeasureAttributes = {};

  for (const m of part.measures) {
    if (m.number > options.measure) break;

    if (m.attributes) {
      if (m.attributes.divisions !== undefined) result.divisions = m.attributes.divisions;
      if (m.attributes.time !== undefined) result.time = m.attributes.time;
      if (m.attributes.key !== undefined) result.key = m.attributes.key;
      if (m.attributes.clef !== undefined) result.clef = m.attributes.clef;
      if (m.attributes.staves !== undefined) result.staves = m.attributes.staves;
      if (m.attributes.transpose !== undefined) result.transpose = m.attributes.transpose;
    }
  }

  return result;
}

/**
 * Pitch range filter
 */
export interface PitchRange {
  min?: Pitch;
  max?: Pitch;
}

/**
 * Find notes filter
 */
export interface FindNotesFilter {
  pitchRange?: PitchRange;
  voice?: number;
  staff?: number;
  noteType?: string;
  hasTie?: boolean;
}

/**
 * Convert pitch to a numeric value for comparison
 */
function pitchToNumber(pitch: Pitch): number {
  const stepValues: Record<string, number> = {
    'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11,
  };
  return pitch.octave * 12 + stepValues[pitch.step] + (pitch.alter ?? 0);
}

/**
 * Find notes matching specific criteria
 */
export function findNotes(score: Score, filter: FindNotesFilter): NoteEntry[] {
  const results: NoteEntry[] = [];

  for (const part of score.parts) {
    for (const measure of part.measures) {
      for (const entry of measure.entries) {
        if (entry.type !== 'note') continue;

        // Filter by pitch range
        if (filter.pitchRange && entry.pitch) {
          const noteValue = pitchToNumber(entry.pitch);

          if (filter.pitchRange.min) {
            const minValue = pitchToNumber(filter.pitchRange.min);
            if (noteValue < minValue) continue;
          }

          if (filter.pitchRange.max) {
            const maxValue = pitchToNumber(filter.pitchRange.max);
            if (noteValue > maxValue) continue;
          }
        }

        // Filter by voice
        if (filter.voice !== undefined && entry.voice !== filter.voice) continue;

        // Filter by staff
        if (filter.staff !== undefined && (entry.staff ?? 1) !== filter.staff) continue;

        // Filter by note type
        if (filter.noteType !== undefined && entry.noteType !== filter.noteType) continue;

        // Filter by tie
        if (filter.hasTie !== undefined) {
          const hasTie = entry.tie !== undefined;
          if (filter.hasTie !== hasTie) continue;
        }

        results.push(entry);
      }
    }
  }

  return results;
}

/**
 * Get the total duration of the score in divisions
 */
export function getDuration(score: Score): number {
  if (score.parts.length === 0) return 0;

  const part = score.parts[0];
  let totalDuration = 0;
  let divisions = 1;

  for (const measure of part.measures) {
    if (measure.attributes?.divisions !== undefined) {
      divisions = measure.attributes.divisions;
    }

    // Calculate measure duration based on time signature or actual notes
    let measureDuration = 0;

    for (const entry of measure.entries) {
      if (entry.type === 'note' && !entry.chord) {
        measureDuration = Math.max(measureDuration, entry.duration);
      }
    }

    // Use time signature to calculate expected duration if available
    const attrs = getAttributesAtMeasure(score, { part: 0, measure: measure.number });
    if (attrs.time) {
      const expectedDuration = (attrs.time.beats / attrs.time.beatType) * 4 * divisions;
      measureDuration = Math.max(measureDuration, expectedDuration);
    }

    totalDuration += measureDuration;
  }

  return totalDuration;
}

/**
 * Get part by ID
 */
export function getPartById(score: Score, id: string): Part | undefined {
  return score.parts.find((p) => p.id === id);
}

/**
 * Get part index by ID
 */
export function getPartIndex(score: Score, id: string): number {
  return score.parts.findIndex((p) => p.id === id);
}

/**
 * Check if the score has multiple staves (e.g., piano grand staff)
 */
export function hasMultipleStaves(score: Score, partIndex: number = 0): boolean {
  const part = score.parts[partIndex];
  if (!part) return false;

  for (const measure of part.measures) {
    if (measure.attributes?.staves !== undefined && measure.attributes.staves > 1) {
      return true;
    }
  }

  return false;
}

/**
 * Get the number of staves for a part
 */
export function getStaveCount(score: Score, partIndex: number = 0): number {
  const part = score.parts[partIndex];
  if (!part) return 1;

  for (const measure of part.measures) {
    if (measure.attributes?.staves !== undefined) {
      return measure.attributes.staves;
    }
  }

  return 1;
}
