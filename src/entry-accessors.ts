/**
 * Entry-level accessors for DirectionEntry, NoteEntry, and PartInfo
 *
 * These are simple helper functions for working with individual entries,
 * complementing the score-level accessors in ./accessors.
 */

import type {
  Score,
  DirectionEntry,
  DirectionType,
  NoteEntry,
  PartInfo,
  PartListEntry,
} from './types';

// ============================================================
// DirectionType extraction helpers
// ============================================================

/**
 * Extracts a specific DirectionType union member by its kind
 */
export type DirectionTypeOfKind<K extends DirectionType['kind']> = Extract<
  DirectionType,
  { kind: K }
>;

// ============================================================
// DirectionEntry Accessors - Generic
// ============================================================

/**
 * Get the first direction type of a specific kind from a DirectionEntry
 *
 * @example
 * const dynamics = getDirectionOfKind(entry, 'dynamics');
 * if (dynamics) {
 *   console.log(dynamics.value); // 'ff', 'pp', etc.
 * }
 */
export function getDirectionOfKind<K extends DirectionType['kind']>(
  entry: DirectionEntry,
  kind: K
): DirectionTypeOfKind<K> | undefined {
  return entry.directionTypes.find((d) => d.kind === kind) as
    | DirectionTypeOfKind<K>
    | undefined;
}

/**
 * Get all direction types of a specific kind from a DirectionEntry
 *
 * @example
 * const allWords = getDirectionsOfKind(entry, 'words');
 * allWords.forEach(w => console.log(w.text));
 */
export function getDirectionsOfKind<K extends DirectionType['kind']>(
  entry: DirectionEntry,
  kind: K
): DirectionTypeOfKind<K>[] {
  return entry.directionTypes.filter((d) => d.kind === kind) as DirectionTypeOfKind<K>[];
}

/**
 * Check if a DirectionEntry contains a specific direction type
 *
 * @example
 * if (hasDirectionOfKind(entry, 'metronome')) {
 *   // Handle tempo marking
 * }
 */
export function hasDirectionOfKind(entry: DirectionEntry, kind: DirectionType['kind']): boolean {
  return entry.directionTypes.some((d) => d.kind === kind);
}

// ============================================================
// DirectionEntry Accessors - Sound
// ============================================================

/**
 * Get tempo from DirectionEntry.sound
 *
 * @example
 * const tempo = getSoundTempo(entry); // 120
 */
export function getSoundTempo(entry: DirectionEntry): number | undefined {
  return entry.sound?.tempo;
}

/**
 * Get dynamics value from DirectionEntry.sound (MIDI velocity 0-127)
 *
 * @example
 * const dynamics = getSoundDynamics(entry); // 80
 */
export function getSoundDynamics(entry: DirectionEntry): number | undefined {
  return entry.sound?.dynamics;
}

/**
 * Get damper pedal state from DirectionEntry.sound
 */
export function getSoundDamperPedal(entry: DirectionEntry): 'yes' | 'no' | undefined {
  return entry.sound?.damperPedal;
}

/**
 * Get soft pedal state from DirectionEntry.sound
 */
export function getSoundSoftPedal(entry: DirectionEntry): 'yes' | 'no' | undefined {
  return entry.sound?.softPedal;
}

/**
 * Get sostenuto pedal state from DirectionEntry.sound
 */
export function getSoundSostenutoPedal(entry: DirectionEntry): 'yes' | 'no' | undefined {
  return entry.sound?.sostenutoPedal;
}

// ============================================================
// NoteEntry Accessors
// ============================================================

/**
 * Check if a NoteEntry is a rest
 *
 * @example
 * if (isRest(note)) {
 *   console.log('This is a rest');
 * }
 */
export function isRest(entry: NoteEntry): boolean {
  return entry.rest !== undefined || (!entry.pitch && !entry.unpitched);
}

/**
 * Check if a NoteEntry is a pitched note (has pitch information)
 *
 * @example
 * if (isPitchedNote(note)) {
 *   console.log(`Note: ${note.pitch!.step}${note.pitch!.octave}`);
 * }
 */
export function isPitchedNote(entry: NoteEntry): boolean {
  return entry.pitch !== undefined;
}

/**
 * Check if a NoteEntry is an unpitched note (percussion)
 */
export function isUnpitchedNote(entry: NoteEntry): boolean {
  return entry.unpitched !== undefined;
}

/**
 * Check if a NoteEntry is part of a chord (shares onset with previous note)
 *
 * @example
 * const chordNotes = notes.filter(isChordNote);
 */
export function isChordNote(entry: NoteEntry): boolean {
  return entry.chord === true;
}

/**
 * Check if a NoteEntry is a grace note
 *
 * @example
 * if (isGraceNote(note)) {
 *   console.log('Grace note with slash:', note.grace?.slash);
 * }
 */
export function isGraceNote(entry: NoteEntry): boolean {
  return entry.grace !== undefined;
}

/**
 * Check if a NoteEntry has any tie (start, stop, or continue)
 *
 * @example
 * if (hasTie(note)) {
 *   // Note is tied to another note
 * }
 */
export function hasTie(entry: NoteEntry): boolean {
  return entry.tie !== undefined || (entry.ties !== undefined && entry.ties.length > 0);
}

/**
 * Check if a NoteEntry has a tie start
 */
export function hasTieStart(entry: NoteEntry): boolean {
  if (entry.tie?.type === 'start') return true;
  return entry.ties?.some((t) => t.type === 'start') ?? false;
}

/**
 * Check if a NoteEntry has a tie stop
 */
export function hasTieStop(entry: NoteEntry): boolean {
  if (entry.tie?.type === 'stop') return true;
  return entry.ties?.some((t) => t.type === 'stop') ?? false;
}

/**
 * Check if a NoteEntry is a cue note
 */
export function isCueNote(entry: NoteEntry): boolean {
  return entry.cue === true;
}

/**
 * Check if a NoteEntry has any beams
 */
export function hasBeam(entry: NoteEntry): boolean {
  return entry.beam !== undefined && entry.beam.length > 0;
}

/**
 * Check if a NoteEntry has any lyrics
 */
export function hasLyrics(entry: NoteEntry): boolean {
  return entry.lyrics !== undefined && entry.lyrics.length > 0;
}

/**
 * Check if a NoteEntry has any notations (articulations, slurs, ornaments, etc.)
 */
export function hasNotations(entry: NoteEntry): boolean {
  return entry.notations !== undefined && entry.notations.length > 0;
}

/**
 * Check if a NoteEntry is part of a tuplet
 */
export function hasTuplet(entry: NoteEntry): boolean {
  return entry.timeModification !== undefined;
}

// ============================================================
// PartList Accessors
// ============================================================

/**
 * Check if a PartListEntry is a PartInfo (score-part)
 */
export function isPartInfo(entry: PartListEntry): entry is PartInfo {
  return entry.type === 'score-part';
}

/**
 * Get PartInfo by part ID
 *
 * @example
 * const partInfo = getPartInfo(score, 'P1');
 * if (partInfo) {
 *   console.log(partInfo.name); // 'Piano'
 * }
 */
export function getPartInfo(score: Score, partId: string): PartInfo | undefined {
  return score.partList.find((entry): entry is PartInfo => {
    return entry.type === 'score-part' && entry.id === partId;
  });
}

/**
 * Get part name by part ID
 *
 * @example
 * const name = getPartName(score, 'P1'); // 'Piano'
 */
export function getPartName(score: Score, partId: string): string | undefined {
  return getPartInfo(score, partId)?.name;
}

/**
 * Get part abbreviation by part ID
 *
 * @example
 * const abbr = getPartAbbreviation(score, 'P1'); // 'Pno.'
 */
export function getPartAbbreviation(score: Score, partId: string): string | undefined {
  return getPartInfo(score, partId)?.abbreviation;
}

/**
 * Get all PartInfo entries from a score
 */
export function getAllPartInfos(score: Score): PartInfo[] {
  return score.partList.filter(isPartInfo);
}

/**
 * Get a map of part ID to part name
 *
 * @example
 * const names = getPartNameMap(score);
 * // { 'P1': 'Piano', 'P2': 'Violin' }
 */
export function getPartNameMap(score: Score): Record<string, string | undefined> {
  const map: Record<string, string | undefined> = {};
  for (const part of getAllPartInfos(score)) {
    map[part.id] = part.name;
  }
  return map;
}
