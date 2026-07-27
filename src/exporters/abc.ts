/**
 * ABC Notation Serializer
 * Converts Score internal model to ABC notation format string.
 */

import type {
  Score,
  Part,
  Measure,
  NoteEntry,
  DirectionEntry,
  HarmonyEntry,
  Pitch,
  KeySignature,
  TimeSignature,
  Barline,
  Notation,
  MeasureEntry,
} from '../types';
import {
  ABC_BODY_FIELD_MARKER,
  ABC_SHORTHAND_DECORATIONS,
  abcDecorationFor,
  type AbcDecorationTarget,
} from '../abc-decorations';

// ============================================================
// Options
// ============================================================

export interface AbcSerializeOptions {
  /** Reference number (X: field). Default: 1 */
  referenceNumber?: number;
  /** Maximum notes per line before wrapping. Default: no limit */
  notesPerLine?: number;
  /** Include chord symbols. Default: true */
  includeChordSymbols?: boolean;
  /** Include dynamics. Default: true */
  includeDynamics?: boolean;
  /** Include lyrics. Default: true */
  includeLyrics?: boolean;
}

// ============================================================
// Constants
// ============================================================

const DIVISIONS_PER_QUARTER = 960;

// Module-level flag: whether to use explicit /2 form instead of shorthand /
let useExplicitHalf = false;
let useIndividualChordDurations = false;
/**
 * Hairpin currently open. MusicXML closes both crescendo and diminuendo with
 * `<wedge type="stop"/>`, so the direction has to be carried across entries to
 * pick between `!crescendo)!` and `!diminuendo)!`.
 */
let openWedge: 'crescendo' | 'diminuendo' | null = null;
/**
 * octave= shift of the voice being serialized. The importer folds it into the
 * pitches, so writing ABC has to take it back out.
 */
let voiceOctaveShift = 0;

/** Map KeySignature fifths to ABC key note */
const FIFTHS_TO_KEY_MAJOR: Record<number, string> = {
  [-7]: 'Cb', [-6]: 'Gb', [-5]: 'Db', [-4]: 'Ab', [-3]: 'Eb', [-2]: 'Bb', [-1]: 'F',
  0: 'C', 1: 'G', 2: 'D', 3: 'A', 4: 'E', 5: 'B', 6: 'F#', 7: 'C#',
};

const FIFTHS_TO_KEY_MINOR: Record<number, string> = {
  [-7]: 'Ab', [-6]: 'Eb', [-5]: 'Bb', [-4]: 'F', [-3]: 'C', [-2]: 'G', [-1]: 'D',
  0: 'A', 1: 'E', 2: 'B', 3: 'F#', 4: 'C#', 5: 'G#', 6: 'D#', 7: 'A#',
};

const MODE_FIFTHS_OFFSET: Record<string, number> = {
  'major': 0, 'ionian': 0,
  'minor': 3, 'aeolian': 3,
  'dorian': 2,
  'phrygian': 4,
  'lydian': -1,
  'mixolydian': 1,
  'locrian': 5,
};

const NOTE_TYPE_TO_QUARTER_LENGTH: Record<string, number> = {
  'long': 16,
  'breve': 8,
  'whole': 4,
  'half': 2,
  'quarter': 1,
  'eighth': 0.5,
  '16th': 0.25,
  '32nd': 0.125,
  '64th': 0.0625,
  '128th': 0.03125,
};

// ============================================================
// Key Serialization
// ============================================================

function musicXmlClefToAbc(clef: { sign: string; line?: number; clefOctaveChange?: number }): string | null {
  let name: string | null = null;
  if (clef.sign === 'G' && (clef.line === 2 || clef.line === undefined)) name = 'treble';
  else if (clef.sign === 'F' && clef.line === 3) name = 'bass3';
  else if (clef.sign === 'F' && (clef.line === 4 || clef.line === undefined)) name = 'bass';
  else if (clef.sign === 'C' && clef.line === 3) name = 'alto';
  else if (clef.sign === 'C' && clef.line === 4) name = 'tenor';
  else if (clef.sign === 'C' && clef.line === 1) name = 'soprano';
  else if (clef.sign === 'C' && clef.line === 2) name = 'mezzo-soprano';
  else if (clef.sign === 'C' && clef.line === 5) name = 'baritone';
  else if (clef.sign === 'percussion') name = 'perc';
  if (name === null) return null;

  // Octave-transposing clefs are written treble-8, bass+8, treble-15, ...
  const shift = clef.clefOctaveChange;
  if (shift === undefined || shift === 0) return name;
  const steps = Math.abs(shift) === 2 ? '15' : '8';
  return `${name}${shift > 0 ? '+' : '-'}${steps}`;
}

function serializeKey(key: KeySignature): string {
  const mode = key.mode || 'major';
  const modeOffset = MODE_FIFTHS_OFFSET[mode] ?? 0;
  const majorFifths = key.fifths + modeOffset;

  let keyNote: string;
  if (mode === 'minor' || mode === 'aeolian') {
    keyNote = FIFTHS_TO_KEY_MINOR[key.fifths] || 'A';
    return keyNote + 'm';
  }

  keyNote = FIFTHS_TO_KEY_MAJOR[majorFifths] || 'C';

  const modeStr = modeToAbcString(mode);
  return keyNote + modeStr;
}

function modeToAbcString(mode: string): string {
  switch (mode) {
    case 'major': case 'ionian': return '';
    case 'minor': case 'aeolian': return 'm';
    case 'dorian': return 'dor';
    case 'phrygian': return 'phr';
    case 'lydian': return 'lyd';
    case 'mixolydian': return 'mix';
    case 'locrian': return 'loc';
    default: return '';
  }
}

// ============================================================
// Time Signature Serialization
// ============================================================

function serializeTimeSignature(time: TimeSignature): string {
  if (time.senzaMisura) return 'none';
  if (time.symbol === 'common') return 'C';
  if (time.symbol === 'cut') return 'C|';
  // Additive meters are parenthesised, as in M:(2+3+2)/8
  if (time.beats.includes('+')) return `(${time.beats})/${time.beatType}`;
  return `${time.beats}/${time.beatType}`;
}

// ============================================================
// Note Duration Calculation
// ============================================================

interface UnitNote {
  num: number;
  den: number;
}

function computeUnitNoteLength(score: Score): UnitNote {
  // Determine the best default note length based on the most common note duration
  // For simplicity, default to 1/8 for most meters
  const firstMeasure = score.parts[0]?.measures[0];
  const time = firstMeasure?.attributes?.time;

  if (time) {
    // Additive meters (2+3+2) sum their groups
    const beats = time.beats.split('+').reduce((sum, b) => sum + parseInt(b, 10), 0);
    const ratio = beats / time.beatType;
    if (ratio < 0.75) {
      return { num: 1, den: 16 };
    }
  }
  return { num: 1, den: 8 };
}

/**
 * Convert a MusicXML duration (in divisions) to ABC duration string relative to unit note length.
 * Returns the fraction num/den relative to L: value.
 */
function durationToAbcFraction(
  duration: number,
  divisions: number,
  unitNote: UnitNote,
): { num: number; den: number } {
  // duration in quarter notes = duration / divisions
  // duration in whole notes = duration / (divisions * 4)
  // duration in unit notes = duration_in_whole / (unitNote.num / unitNote.den)
  //                       = duration / (divisions * 4) * (unitNote.den / unitNote.num)
  //                       = (duration * unitNote.den) / (divisions * 4 * unitNote.num)

  const abcNum = duration * unitNote.den;
  const abcDen = divisions * 4 * unitNote.num;

  // Simplify the fraction
  const g = gcd(abcNum, abcDen);
  return { num: abcNum / g, den: abcDen / g };
}

function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) {
    [a, b] = [b, a % b];
  }
  return a;
}

function formatAbcDuration(num: number, den: number): string {
  if (num === 1 && den === 1) return '';
  if (den === 1) return String(num);
  if (num === 1) {
    if (den === 2 && !useExplicitHalf) return '/';
    return `/${den}`;
  }
  return `${num}/${den}`;
}

// ============================================================
// Note Pitch Serialization
// ============================================================

/**
 * ABC spelling for a microtonal alteration, e.g. 0.5 → `^1/2`, -1.5 → `_3/2`.
 * The fraction is written explicitly so the value survives a round-trip.
 */
function serializeMicrotone(alter: number): string {
  const symbol = alter > 0 ? '^' : '_';
  const magnitude = Math.abs(alter);
  // Find the simplest fraction that reproduces the alteration
  for (let den = 2; den <= 64; den++) {
    const num = magnitude * den;
    if (Math.abs(num - Math.round(num)) < 1e-9) {
      return `${symbol}${Math.round(num)}/${den}`;
    }
  }
  // Not expressible as a simple fraction: fall back to the nearest semitone
  return magnitude >= 1.5 ? symbol + symbol : symbol;
}

function serializePitch(pitch: Pitch, explicitNatural?: boolean): string {
  let result = '';

  // Accidental
  if (explicitNatural) {
    result += '=';
  } else if (pitch.alter !== undefined && pitch.alter !== 0) {
    if (pitch.alter === 1) result += '^';
    else if (pitch.alter === 2) result += '^^';
    else if (pitch.alter === -1) result += '_';
    else if (pitch.alter === -2) result += '__';
    else result += serializeMicrotone(pitch.alter);
  }

  // Note letter and octave, with the voice's octave= shift removed
  const step = pitch.step;
  const octave = pitch.octave - voiceOctaveShift;

  if (octave >= 5) {
    // Lowercase letter
    result += step.toLowerCase();
    // Add apostrophes for higher octaves
    for (let o = 6; o <= octave; o++) {
      result += '\'';
    }
  } else {
    // Uppercase letter
    result += step;
    // Add commas for lower octaves
    for (let o = 3; o >= octave; o--) {
      result += ',';
    }
  }

  return result;
}

// ============================================================
// Chord Symbol Serialization
// ============================================================

function serializeHarmony(harmony: HarmonyEntry): string {
  let result = harmony.root.rootStep;
  if (harmony.root.rootAlter === 1) result += '#';
  else if (harmony.root.rootAlter === -1) result += 'b';

  // Map kind to ABC chord suffix
  switch (harmony.kind) {
    case 'major': break; // no suffix
    case 'minor': result += 'm'; break;
    case 'dominant': result += '7'; break;
    case 'major-seventh': result += 'maj7'; break;
    case 'minor-seventh': result += 'm7'; break;
    case 'diminished': result += 'dim'; break;
    case 'diminished-seventh': result += 'dim7'; break;
    case 'augmented': result += 'aug'; break;
    case 'augmented-seventh': result += 'aug7'; break;
    case 'major-sixth': result += '6'; break;
    case 'minor-sixth': result += 'm6'; break;
    case 'dominant-ninth': result += '9'; break;
    case 'minor-ninth': result += 'm9'; break;
    case 'suspended-fourth': result += 'sus4'; break;
    case 'suspended-second': result += 'sus2'; break;
    default:
      if (harmony.kindText) result += harmony.kindText;
      break;
  }

  if (harmony.bass) {
    result += '/' + harmony.bass.bassStep;
    if (harmony.bass.bassAlter === 1) result += '#';
    else if (harmony.bass.bassAlter === -1) result += 'b';
  }

  return '"' + result + '"';
}

// ============================================================
// Decoration Serialization
// ============================================================

/** Map a `<notations>` child back to the ABC decoration it came from. */
function notationToDecoration(notation: Notation): AbcDecorationTarget | null {
  switch (notation.type) {
    case 'articulation':
      return { kind: 'articulation', articulation: notation.articulation };
    case 'ornament':
      if (notation.ornament === 'wavy-line') {
        if (notation.wavyLineType === 'start' || notation.wavyLineType === 'stop') {
          return { kind: 'trill-line', wavyLineType: notation.wavyLineType };
        }
        return null;
      }
      return { kind: 'ornament', ornament: notation.ornament };
    case 'technical':
      if (notation.technical === 'fingering') {
        const digits = notation.text ?? notation.fingering;
        return digits !== undefined ? { kind: 'fingering', fingering: digits } : null;
      }
      return { kind: 'technical', technical: notation.technical };
    case 'fermata':
      return { kind: 'fermata', inverted: notation.fermataType === 'inverted' };
    case 'arpeggiate':
      return { kind: 'arpeggiate' };
    default:
      return null;
  }
}

/** ABC decorations for a note, emitted immediately before the note itself. */
function serializeNoteDecorations(note: NoteEntry): string {
  if (!note.notations) return '';
  let result = '';
  for (const notation of note.notations) {
    const target = notationToDecoration(notation);
    if (!target) continue;
    const spelling = abcDecorationFor(target);
    if (spelling) result += spelling;
  }
  return result;
}

// ============================================================
// Dynamics Serialization
// ============================================================

/**
 * ABC text for a `<direction>` that is not a tempo mark: dynamics, hairpins,
 * navigation marks, ABC round-trip markers and free text annotations.
 *
 * @returns The ABC text, or `null` when the direction has no ABC form.
 */
function serializeDirectionText(
  direction: DirectionEntry,
  opts: Required<AbcSerializeOptions>,
): string | null {
  for (const dt of direction.directionTypes) {
    switch (dt.kind) {
      case 'dynamics':
        return opts.includeDynamics && dt.value ? `!${dt.value}!` : null;

      case 'wedge': {
        if (dt.type === 'stop') {
          const closing = openWedge ?? 'crescendo';
          openWedge = null;
          return abcDecorationFor({ kind: 'wedge', wedge: closing, stop: true });
        }
        openWedge = dt.type;
        return abcDecorationFor({ kind: 'wedge', wedge: dt.type, stop: false });
      }

      case 'segno':
        return abcDecorationFor({ kind: 'segno' });
      case 'coda':
        return abcDecorationFor({ kind: 'coda' });

      case 'words':
        return serializeWordsDirection(dt.text, direction);

      default:
        break;
    }
  }
  return null;
}

/**
 * ABC text for a `<words>` direction.
 *
 * ABC constructs with no MusicXML counterpart (spacers, unmapped decorations)
 * are stored as `<words>` carrying their literal ABC text; anything else is a
 * text annotation and is quoted with the placement prefix ABC uses.
 */
function serializeWordsDirection(text: string, direction: DirectionEntry): string | null {
  // Decorations preserved verbatim: !name! long form or single-char shorthand
  if (/^![^!]+!$/.test(text)) return text;
  if (text.length === 1 && ABC_SHORTHAND_DECORATIONS.has(text)) return text;
  // Spacer (y, y4, ...)
  if (/^y\d*$/.test(text)) return text;
  // Navigation words that ABC spells as decorations (!D.C.!, !fine!, ...)
  const asDecoration = abcDecorationFor({ kind: 'words', text });
  if (asDecoration) return asDecoration;
  if (text === '') return null;

  // Otherwise a text annotation: restore the ABC placement prefix
  const halign = direction.directionTypes.find(d => d.kind === 'words' && d.text === text) as
    | { halign?: string }
    | undefined;
  let marker = '^';
  if (direction.placement === 'below') marker = '_';
  else if (direction.placement === 'above') marker = '^';
  else if (halign?.halign === 'right') marker = '<';
  else if (halign?.halign === 'left') marker = '>';
  else if (halign?.halign === 'center') marker = '@';
  return `"${marker}${text}"`;
}

// ============================================================
// Tempo Serialization
// ============================================================

function serializeTempo(direction: DirectionEntry): string | null {
  for (const dt of direction.directionTypes) {
    if (dt.kind === 'metronome') {
      const beatUnit = dt.beatUnit;
      const perMinute = dt.perMinute;
      if (!perMinute) return null;

      // Convert beat unit to fraction of a whole note
      // quarter = 1/4, half = 1/2, eighth = 1/8, etc.
      const quarterLen = NOTE_TYPE_TO_QUARTER_LENGTH[beatUnit] ?? 1;
      const den = Math.round(4 / quarterLen);

      return `1/${den}=${perMinute}`;
    }
  }
  return null;
}

// ============================================================
// Main Serializer
// ============================================================

/**
 * Serialize several Scores into a single multi-tune ABC file.
 *
 * Counterpart to `parseAbcTunes`: each Score becomes one tune, separated by a
 * blank line as the ABC standard requires.
 */
export function serializeAbcTunes(scores: Score[], options?: AbcSerializeOptions): string {
  return scores
    .map((score, index) => serializeAbc(score, {
      ...options,
      // Number the tunes when they carry no reference number of their own
      referenceNumber: options?.referenceNumber ?? index + 1,
    }))
    .join('\n');
}

/**
 * Serialize a Score object to ABC notation format string.
 */
export function serializeAbc(score: Score, options?: AbcSerializeOptions): string {
  const opts: Required<AbcSerializeOptions> = {
    referenceNumber: options?.referenceNumber ?? 1,
    notesPerLine: options?.notesPerLine ?? 0,
    includeChordSymbols: options?.includeChordSymbols ?? true,
    includeDynamics: options?.includeDynamics ?? true,
    includeLyrics: options?.includeLyrics ?? true,
  };

  openWedge = null;
  voiceOctaveShift = 0;

  // Set module-level flag for explicit /2 duration format
  useExplicitHalf = score.metadata.miscellaneous?.find(m => m.name === 'abc-explicit-half')?.value === 'true';

  // Set module-level flag for individual chord durations
  useIndividualChordDurations = score.metadata.miscellaneous?.some(m => m.name === 'abc-chord-individual-durations' && m.value === 'true') ?? false;

  // Use stored unit note length if available, otherwise compute
  const storedUnitNote = score.metadata.miscellaneous?.find(m => m.name === 'abc-unit-note-length')?.value;
  let unitNote: UnitNote;
  if (storedUnitNote) {
    const match = storedUnitNote.match(/^(\d+)\/(\d+)$/);
    if (match) {
      unitNote = { num: parseInt(match[1], 10), den: parseInt(match[2], 10) };
    } else {
      unitNote = computeUnitNoteLength(score);
    }
  } else {
    unitNote = computeUnitNoteLength(score);
  }

  const lines: string[] = [];

  // Get attributes from first measure
  const firstPart = score.parts[0];
  const firstMeasure = firstPart?.measures[0];
  const attrs = firstMeasure?.attributes;

  // Check if we have stored header field order for round-trip
  const storedHeaderOrder = score.metadata.miscellaneous?.find(m => m.name === 'abc-header-order')?.value;

  if (storedHeaderOrder) {
    // Use stored header order to reconstruct header exactly
    const headerOrder: string[] = JSON.parse(storedHeaderOrder);
    for (const field of headerOrder) {
      lines.push(field);
    }
  } else {
    // Default header construction
    const storedRefNum = score.metadata.miscellaneous?.find(m => m.name === 'abc-reference-number')?.value;
    const refNum = storedRefNum ? parseInt(storedRefNum, 10) : opts.referenceNumber;
    lines.push(`X:${refNum}`);

    if (score.metadata.movementTitle) {
      lines.push(`T:${score.metadata.movementTitle}`);
    }

    const composer = score.metadata.creators?.find(c => c.type === 'composer');
    if (composer) {
      lines.push(`C:${composer.value}`);
    }

    // Extra header fields mapped to proper Score fields
    // R: rhythm
    const rhythmFields = score.metadata.miscellaneous?.filter(m => m.name === 'abc-R');
    if (rhythmFields) {
      for (const rf of rhythmFields) lines.push(`R:${rf.value}`);
    }
    // O: origin (from creator type='origin')
    const originCreators = score.metadata.creators?.filter(c => c.type === 'origin');
    if (originCreators) {
      for (const oc of originCreators) lines.push(`O:${oc.value}`);
    }
    // S: source
    if (score.metadata.source) {
      lines.push(`S:${score.metadata.source}`);
    }
    // N: notes
    const noteFields = score.metadata.miscellaneous?.filter(m => m.name === 'abc-N');
    if (noteFields) {
      for (const nf of noteFields) lines.push(`N:${nf.value}`);
    }
    // Z: transcription (from encoding.encoder)
    if (score.metadata.encoding?.encoder) {
      for (const enc of score.metadata.encoding.encoder) lines.push(`Z:${enc}`);
    }
    // I: instruction
    const instrFields = score.metadata.miscellaneous?.filter(m => m.name === 'abc-I');
    if (instrFields) {
      for (const inf of instrFields) lines.push(`I:${inf.value}`);
    }
    // F: file URL
    const fileFields = score.metadata.miscellaneous?.filter(m => m.name === 'abc-F');
    if (fileFields) {
      for (const ff of fileFields) lines.push(`F:${ff.value}`);
    }

    if (attrs?.time) {
      lines.push(`M:${serializeTimeSignature(attrs.time)}`);
    }

    lines.push(`L:${unitNote.num}/${unitNote.den}`);

    // Tempo: use stored original tempo string if available
    const storedTempo = score.metadata.miscellaneous?.find(m => m.name === 'abc-tempo')?.value;
    if (storedTempo) {
      lines.push(`Q:${storedTempo}`);
    } else {
      const tempoStr = findTempoInMeasure(firstMeasure);
      if (tempoStr) {
        lines.push(`Q:${tempoStr}`);
      }
    }

    // A single-voice tune carries its clef on the K: field; multi-voice tunes
    // put it on their V: lines instead
    let clefSuffix = '';
    if (score.parts.length === 1) {
      const clef = attrs?.clef?.[0];
      const clefName = clef ? musicXmlClefToAbc(clef) : null;
      if (clefName && clefName !== 'treble') clefSuffix = ` clef=${clefName}`;
    }
    lines.push(`K:${attrs?.key ? serializeKey(attrs.key) : 'C'}${clefSuffix}`);
  }

  // Read line break positions from metadata
  const lineBreaksStr = score.metadata.miscellaneous?.find(m => m.name === 'abc-line-breaks')?.value;
  const lineBreaks: number[] = lineBreaksStr ? JSON.parse(lineBreaksStr) : [];

  // Read stored voice IDs
  const storedVoiceIdsStr = score.metadata.miscellaneous?.find(m => m.name === 'abc-voice-ids')?.value;
  const storedVoiceIds: string[] = storedVoiceIdsStr ? JSON.parse(storedVoiceIdsStr) : [];

  // Check lyrics layout
  const lyricsAfterAll = score.metadata.miscellaneous?.find(m => m.name === 'abc-lyrics-after-all')?.value === 'true';
  const lyricsLineCountsStr = score.metadata.miscellaneous?.find(m => m.name === 'abc-lyrics-line-counts')?.value;
  const lyricsLineCounts: number[] = lyricsLineCountsStr ? JSON.parse(lyricsLineCountsStr) : [];
  const lyricsLineVersesStr = score.metadata.miscellaneous?.find(m => m.name === 'abc-lyrics-line-verses')?.value;
  const lyricsLineVerses: number[] = lyricsLineVersesStr ? JSON.parse(lyricsLineVersesStr) : [];

  // Check for inline voice markers
  const inlineVoiceMarkersStr = score.metadata.miscellaneous?.find(m => m.name === 'abc-inline-voice-markers')?.value;
  const inlineVoiceMarkers: Record<string, string> = inlineVoiceMarkersStr ? JSON.parse(inlineVoiceMarkersStr) : {};
  const useInlineVoiceMarkers = Object.keys(inlineVoiceMarkers).length > 0;

  // Output standalone V: declaration lines (when inline [V:] markers are used)
  if (useInlineVoiceMarkers) {
    const voiceDeclStr = score.metadata.miscellaneous?.find(m => m.name === 'abc-voice-declaration-lines')?.value;
    if (voiceDeclStr) {
      const voiceDeclLines: string[] = JSON.parse(voiceDeclStr);
      for (const vl of voiceDeclLines) {
        lines.push(vl);
      }
    }
  }

  // Read body comments, directives, W: fields, and voice interleave pattern
  const bodyCommentsStr = score.metadata.miscellaneous?.find(m => m.name === 'abc-body-comments')?.value;
  const bodyComments: string[] = bodyCommentsStr ? JSON.parse(bodyCommentsStr) : [];
  const bodyDirectivesStr = score.metadata.miscellaneous?.find(m => m.name === 'abc-body-directives')?.value;
  const bodyDirectives: string[] = bodyDirectivesStr ? JSON.parse(bodyDirectivesStr) : [];
  const wFieldsStr = score.metadata.miscellaneous?.find(m => m.name === 'abc-w-fields')?.value;
  const wFieldsList: string[] = wFieldsStr ? JSON.parse(wFieldsStr) : [];
  const voiceInterleaveStr = score.metadata.miscellaneous?.find(m => m.name === 'abc-voice-interleave')?.value;
  const voiceInterleavePattern: string[][] = voiceInterleaveStr ? JSON.parse(voiceInterleaveStr) : [];
  const groupBarCountsStr = score.metadata.miscellaneous?.find(m => m.name === 'abc-group-bar-counts')?.value;
  const groupBarCounts: number[][] = groupBarCountsStr ? JSON.parse(groupBarCountsStr) : [];
  const bodyVoiceLinesStr = score.metadata.miscellaneous?.find(m => m.name === 'abc-body-voice-lines')?.value;
  const bodyVoiceLines: string[] = bodyVoiceLinesStr ? JSON.parse(bodyVoiceLinesStr) : [];
  const voiceFullLinesStr = score.metadata.miscellaneous?.find(m => m.name === 'abc-voice-full-lines')?.value;
  const voiceFullLines: Record<string, string> = voiceFullLinesStr ? JSON.parse(voiceFullLinesStr) : {};
  const voiceCommentsStr = score.metadata.miscellaneous?.find(m => m.name === 'abc-voice-comments')?.value;
  const voiceCommentsData: Record<string, Array<{barIndex: number; comment: string}>> = voiceCommentsStr ? JSON.parse(voiceCommentsStr) : {};
  const preVoiceCommentsStr = score.metadata.miscellaneous?.find(m => m.name === 'abc-pre-voice-comments')?.value;
  const preVoiceComments: string[][] = preVoiceCommentsStr ? JSON.parse(preVoiceCommentsStr) : [];

  // Body
  const multiVoice = score.parts.length > 1;

  // Pre-compute serialized measures for each part
  const partMeasureStrings: string[][] = [];
  const partDivisions: number[] = [];
  for (let partIdx = 0; partIdx < score.parts.length; partIdx++) {
    const part = score.parts[partIdx];
    voiceOctaveShift = readVoiceOctaveShift(score, partIdx);
    const divisions = getPartDivisions(part);
    partDivisions.push(divisions);
    const measStrings: string[] = [];
    let currentUnitNote = { ...unitNote };
    let currentKey: KeySignature | undefined = part.measures[0]?.attributes?.key;
    // Measures absorbed into a preceding Zn multi-measure rest
    const absorbedMeasures = new Set<number>();
    for (let mi = 0; mi < part.measures.length; mi++) {
      if (absorbedMeasures.has(mi)) {
        measStrings.push('');
        continue;
      }
      const measure = part.measures[mi];
      const measDivisions = measure.attributes?.divisions ?? divisions;
      let measureStr = '';

      // Detect inline key change
      if (mi > 0 && measure.attributes?.key) {
        const newKey = measure.attributes.key;
        if (currentKey === undefined ||
            newKey.fifths !== currentKey.fifths ||
            (newKey.mode || 'major') !== (currentKey.mode || 'major')) {
          // An inline [K:...] marker already writes the change in place
          if (!hasInlineKeyMarker(measure)) {
            measureStr += '\nK:' + serializeKey(newKey) + '\n';
          }
          currentKey = newKey;
        }
      }

      // Left barline
      const leftBarline = measure.barlines?.find(b => b.location === 'left');
      if (leftBarline) {
        measureStr += serializeBarline(leftBarline);
      }

      // Entries
      const { noteStr, updatedUnitNote } = serializeMeasureEntries(measure, measDivisions, currentUnitNote, opts);
      if (updatedUnitNote) currentUnitNote = updatedUnitNote;
      const collapsed = applyMultiMeasureRest(measure, noteStr);
      for (let k = 1; k <= collapsed.absorbed; k++) absorbedMeasures.add(mi + k);
      measureStr += collapsed.text;

      // Right barline
      const rightBarline = measure.barlines?.find(b => b.location === 'right');
      if (rightBarline) {
        measureStr += serializeBarline(rightBarline);
      } else if (!measureHasNotes(measure)) {
        // A measure holding only round-trip markers gets no bar line
      } else if (mi < part.measures.length - 1) {
        // Don't add default | if the next measure has a left barline with barStyle or repeat
        // (the left barline serves as both the right of this measure and left of next)
        const nextMeasure = part.measures[mi + 1];
        const nextLeftBarline = nextMeasure?.barlines?.find(b => b.location === 'left' && (b.barStyle || b.repeat));
        if (!nextLeftBarline) {
          measureStr += '|';
        }
      } else {
        // Last measure: skip trailing | only if previous measure had a final barline (|])
        const prevMeas = mi > 0 ? part.measures[mi - 1] : null;
        const prevRightBl = prevMeas?.barlines?.find(b => b.location === 'right');
        const prevWasFinal = prevRightBl?.barStyle === 'light-heavy' && !prevRightBl.repeat;
        if (!prevWasFinal) {
          measureStr += '|';
        }
      }

      measStrings.push(measureStr);
    }
    partMeasureStrings.push(measStrings);
  }

  // Determine how to output: interleaved or sequential
  const hasInterleave = voiceInterleavePattern.length > 0 && multiVoice;

  if (hasInterleave && !useInlineVoiceMarkers) {
    // Output interleaved voices using the stored pattern
    // Each voice group specifies which voices appear in sequence before a comment separator
    const voiceMeasureCursor: Record<string, number> = {};
    for (const voiceId of storedVoiceIds) {
      voiceMeasureCursor[voiceId] = 0;
    }

    // Build a map from voice ID to part index
    const voiceIdToPartIdx: Record<string, number> = {};
    for (let i = 0; i < storedVoiceIds.length; i++) {
      voiceIdToPartIdx[storedVoiceIds[i]] = i;
    }

    // Track V: declaration line index for round-trip
    let voiceDeclIdx = 0;

    let commentIdx = 0;
    for (let gi = 0; gi < voiceInterleavePattern.length; gi++) {
      const group = voiceInterleavePattern[gi];

      for (const voiceId of group) {
        const partIdx = voiceIdToPartIdx[voiceId];
        if (partIdx === undefined) continue;
        const measStrings = partMeasureStrings[partIdx];

        // Find the body V: line for this voice ID
        const bodyVoiceLineIdx = bodyVoiceLines.findIndex((l, idx) => {
          const m = l.match(/^V:\s*(\S+)/);
          return m && m[1] === voiceId && idx >= voiceDeclIdx;
        });

        if (bodyVoiceLineIdx >= 0) {
          // Output pre-voice comments for this declaration
          if (bodyVoiceLineIdx < preVoiceComments.length) {
            for (const c of preVoiceComments[bodyVoiceLineIdx]) {
              lines.push(c);
            }
          }
          lines.push(bodyVoiceLines[bodyVoiceLineIdx]);
          voiceDeclIdx = bodyVoiceLineIdx + 1;
        } else if (voiceFullLines[voiceId]) {
          // Voice declared in header only (no body V: line) - don't output V: line
          // (it was already output in the header section)
        } else {
          // Fallback: construct V: line
          let voiceLine = `V:${voiceId}`;
          const partClef = score.parts[partIdx]?.measures[0]?.attributes?.clef?.[0];
          if (partClef) {
            const clefName = musicXmlClefToAbc(partClef);
            if (clefName && clefName !== 'treble') {
              voiceLine += ` clef=${clefName}`;
            }
          }
          lines.push(voiceLine);
        }

        // Output measures for this voice in this group
        const voiceIdxInGroup = group.indexOf(voiceId);
        const barCount = groupBarCounts[gi]?.[voiceIdxInGroup] ?? 0;
        const measuresInGroup = barCount > 0 ? barCount : Math.ceil((partMeasureStrings[0]?.length || 0) / voiceInterleavePattern.length);
        const startMeasure = voiceMeasureCursor[voiceId] || 0;
        const endMeasure = Math.min(startMeasure + measuresInGroup, measStrings.length);

        // Get per-voice line breaks
        const voiceLineBreaksStr = score.metadata.miscellaneous?.find(m => m.name === `abc-line-breaks-${partIdx}`)?.value;
        const voiceLineBreaks: number[] = voiceLineBreaksStr ? JSON.parse(voiceLineBreaksStr) : lineBreaks;
        const voiceLineBreakSet = new Set(voiceLineBreaks.map(v => Math.abs(v)));
        const voiceLineContinuationSet = new Set(voiceLineBreaks.filter(v => v < 0).map(v => Math.abs(v)));

        // Get within-voice comments for this voice
        const thisVoiceComments = voiceCommentsData[voiceId] || [];

        let groupMusic = '';
        for (let mi = startMeasure; mi < endMeasure; mi++) {
          // Check for within-voice comments before this measure
          for (const vc of thisVoiceComments) {
            if (vc.barIndex === mi) {
              groupMusic += vc.comment + '\n';
            }
          }
          groupMusic += measStrings[mi];
          // Insert line breaks
          if (mi < endMeasure - 1) {
            const absMeasureNum = mi + 1;
            if (voiceLineContinuationSet.has(absMeasureNum)) {
              groupMusic += '\\\n';
            } else if (voiceLineBreakSet.has(absMeasureNum)) {
              groupMusic += '\n';
            }
          }
        }
        voiceMeasureCursor[voiceId] = endMeasure;
        lines.push(stripLeadingBlankLines(groupMusic));
      }

      // Output comment separator between groups (if not last group)
      if (gi < voiceInterleavePattern.length - 1 && commentIdx < bodyComments.length) {
        lines.push(bodyComments[commentIdx]);
        commentIdx++;
      }
    }
  } else {
    // Sequential voice output (original behavior)
    for (let partIdx = 0; partIdx < score.parts.length; partIdx++) {
      const part = score.parts[partIdx];

      if (multiVoice && !useInlineVoiceMarkers) {
        // Use full voice line if available
        const voiceId = storedVoiceIds[partIdx] || String(partIdx + 1);
        if (voiceFullLines[voiceId]) {
          lines.push(voiceFullLines[voiceId]);
        } else {
          let voiceLine = `V:${voiceId}`;
          const partClef = part.measures[0]?.attributes?.clef?.[0];
          if (partClef) {
            const clefName = musicXmlClefToAbc(partClef);
            if (clefName && clefName !== 'treble') {
              voiceLine += ` clef=${clefName}`;
            }
          }
          lines.push(voiceLine);
        }
      }

      const divisions = partDivisions[partIdx];
      voiceOctaveShift = readVoiceOctaveShift(score, partIdx);
      const bodyResult = serializePartBody(part, divisions, unitNote, opts, lineBreaks, lyricsAfterAll, lyricsLineCounts, lyricsLineVerses);

      let musicLine = bodyResult.music;

      // Prefix with inline voice marker if applicable
      if (multiVoice && useInlineVoiceMarkers) {
        const voiceId = storedVoiceIds[partIdx] || String(partIdx + 1);
        const marker = inlineVoiceMarkers[voiceId] || `[V:${voiceId}]`;
        musicLine = marker + musicLine;
      }

      lines.push(stripLeadingBlankLines(musicLine));

      if (opts.includeLyrics && bodyResult.lyrics) {
        lines.push(bodyResult.lyrics);
      }
    }
  }

  // Output body directives (%%... lines that appeared in body)
  for (const directive of bodyDirectives) {
    lines.push(directive);
  }

  // Output W: fields at end of tune
  for (const wField of wFieldsList) {
    lines.push(wField);
  }

  // Output trailing comments
  const trailingCommentsStr = score.metadata.miscellaneous?.find(m => m.name === 'abc-trailing-comments')?.value;
  const trailingComments: string[] = trailingCommentsStr ? JSON.parse(trailingCommentsStr) : [];
  for (const comment of trailingComments) {
    lines.push(comment);
  }

  return lines.join('\n') + '\n';
}

/**
 * Drop leading newlines from a body chunk. Field and key-change markers are
 * written with a newline on both sides; at the start of a chunk that would
 * open the body with a blank line.
 */
function stripLeadingBlankLines(text: string): string {
  return text.replace(/^\n+/, '');
}

/** The octave= shift the importer folded into this part's pitches. */
function readVoiceOctaveShift(score: Score, partIndex: number): number {
  const stored = score.metadata.miscellaneous?.find(
    m => m.name === `abc-voice-octave-${partIndex}`,
  )?.value;
  const shift = stored ? parseInt(stored, 10) : 0;
  return Number.isFinite(shift) ? shift : 0;
}

function findTempoInMeasure(measure?: Measure): string | null {
  if (!measure) return null;

  for (const entry of measure.entries) {
    if (entry.type === 'direction') {
      const tempo = serializeTempo(entry);
      if (tempo) return tempo;
    }
  }

  return null;
}

function getPartDivisions(part: Part): number {
  for (const measure of part.measures) {
    if (measure.attributes?.divisions) {
      return measure.attributes.divisions;
    }
    // Check inline attributes
    for (const entry of measure.entries) {
      if (entry.type === 'attributes' && entry.attributes.divisions) {
        return entry.attributes.divisions;
      }
    }
  }
  return DIVISIONS_PER_QUARTER;
}

interface PartBodyResult {
  music: string;
  lyrics: string | null;
}

function serializePartBody(
  part: Part,
  divisions: number,
  initialUnitNote: UnitNote,
  opts: Required<AbcSerializeOptions>,
  lineBreaks: number[] = [],
  lyricsAfterAll: boolean = false,
  lyricsLineCounts: number[] = [],
  lyricsLineVerses: number[] = [],
): PartBodyResult {
  let unitNote = { ...initialUnitNote };
  const musicParts: string[] = [];
  // measureIndex -> verse number -> syllables
  const allLyrics: Map<number, Map<number, string[]>> = new Map();

  // Track current key for detecting inline key changes
  let currentKey: KeySignature | undefined = part.measures[0]?.attributes?.key;

  // Measures absorbed into a preceding Zn multi-measure rest
  const absorbedMeasures = new Set<number>();

  for (let mi = 0; mi < part.measures.length; mi++) {
    if (absorbedMeasures.has(mi)) continue;
    const measure = part.measures[mi];
    const measDivisions = measure.attributes?.divisions ?? divisions;

    // Detect inline key change by comparing with previous key
    if (mi > 0 && measure.attributes?.key) {
      const newKey = measure.attributes.key;
      if (currentKey === undefined ||
          newKey.fifths !== currentKey.fifths ||
          (newKey.mode || 'major') !== (currentKey.mode || 'major')) {
        // An inline [K:...] marker already writes the change in place
        if (!hasInlineKeyMarker(measure)) {
          musicParts.push('\nK:' + serializeKey(newKey) + '\n');
        }
        currentKey = newKey;
      }
    }

    // Check for left barline (repeats, etc.)
    const leftBarline = measure.barlines?.find(b => b.location === 'left');
    if (leftBarline) {
      musicParts.push(serializeBarline(leftBarline));
    }

    // Serialize entries (pass mutable unitNote reference for inline L: tracking)
    const { noteStr, lyrics, updatedUnitNote } = serializeMeasureEntries(
      measure, measDivisions, unitNote, opts,
    );
    // Update unitNote if inline [L:] changed it
    if (updatedUnitNote) {
      unitNote = updatedUnitNote;
    }
    const collapsed = applyMultiMeasureRest(measure, noteStr);
    for (let k = 1; k <= collapsed.absorbed; k++) absorbedMeasures.add(mi + k);
    musicParts.push(collapsed.text);

    if (lyrics.size > 0) {
      allLyrics.set(mi, lyrics);
    }

    // Right barline
    const rightBarline = measure.barlines?.find(b => b.location === 'right');
    if (rightBarline) {
      musicParts.push(serializeBarline(rightBarline));
    } else if (!measureHasNotes(measure)) {
      // A measure holding only round-trip markers gets no bar line
    } else if (mi < part.measures.length - 1) {
      // Don't add default | if the next measure has a left barline with barStyle or repeat
      // (the left barline serves as both the right of this measure and left of next)
      const nextMeas = part.measures[mi + 1];
      const nextLeftBar = nextMeas?.barlines?.find(b => b.location === 'left' && (b.barStyle || b.repeat));
      if (!nextLeftBar) {
        musicParts.push('|');
      }
    } else {
      // Last measure: skip trailing | only if previous measure had a final barline (|])
      const prevMeas = mi > 0 ? part.measures[mi - 1] : null;
      const prevRightBl = prevMeas?.barlines?.find(b => b.location === 'right');
      const prevWasFinal = prevRightBl?.barStyle === 'light-heavy' && !prevRightBl.repeat;
      if (!prevWasFinal) {
        musicParts.push('|');
      }
    }

    // Insert line break after measure if this is a line break position
    // lineBreaks stores 1-indexed measure counts; negative values are line continuations (\)
    if (mi < part.measures.length - 1) {
      if (lineBreaks.includes(mi + 1)) {
        musicParts.push('\n');
      } else if (lineBreaks.includes(-(mi + 1))) {
        musicParts.push('\\\n');
      }
    }
  }

  // Assemble music and lyrics together, interleaving lyrics after their music lines
  // First, build the music string with line breaks, then insert lyrics at the right positions
  const musicStr = musicParts.join('');

  // If no lyrics, return music only
  if (allLyrics.size === 0) {
    return { music: musicStr, lyrics: null };
  }

  // Verse numbers present anywhere in this part, in ascending order
  const verses = new Set<number>();
  for (const byVerse of allLyrics.values()) {
    for (const verse of byVerse.keys()) verses.add(verse);
  }
  const sortedVerses = Array.from(verses).sort((a, b) => a - b);

  /** Syllables of one verse across the measure range [from, to]. */
  function syllablesIn(verse: number, from: number, to: number): string[] {
    const syllables: string[] = [];
    for (let m = from; m <= to; m++) {
      const forVerse = allLyrics.get(m)?.get(verse);
      if (forVerse) syllables.push(...forVerse);
    }
    return syllables;
  }

  // Group lyrics by line break positions
  // Each "line" spans from one line break to the next
  // lineBreaks can have negative values (line continuations), use absolute values for grouping
  const lineBreakSet = new Set(lineBreaks.map(v => Math.abs(v)));
  const lyricLineRanges: { startMeasure: number; endMeasure: number }[] = [];
  let lineStart = 0;
  for (let mi = 0; mi < part.measures.length; mi++) {
    if (lineBreakSet.has(mi + 1) || mi === part.measures.length - 1) {
      const hasAny = sortedVerses.some(v => syllablesIn(v, lineStart, mi).length > 0);
      if (hasAny) {
        lyricLineRanges.push({ startMeasure: lineStart, endMeasure: mi });
      }
      lineStart = mi + 1;
    }
  }

  // Format lyrics with proper hyphenation
  function formatLyrics(syllables: string[]): string {
    let result = 'w:';
    for (let i = 0; i < syllables.length; i++) {
      const syllable = syllables[i];
      if (i > 0) {
        // Don't add space if previous syllable ends with '-' (hyphenated word)
        const prev = syllables[i - 1];
        if (prev.endsWith('-')) {
          // No space - hyphen connects syllables within a word
        } else {
          result += ' ';
        }
      }
      result += syllable;
    }
    return result;
  }

  /** One `w:` line per verse for the measure range [from, to]. */
  function lyricLinesFor(from: number, to: number): string[] {
    const out: string[] = [];
    for (const verse of sortedVerses) {
      const syllables = syllablesIn(verse, from, to);
      if (syllables.length > 0) out.push(formatLyrics(syllables));
    }
    return out;
  }

  const lastMeasure = part.measures.length - 1;

  // If lyricsAfterAll, output all lyrics after all music lines
  if (lyricsAfterAll) {
    // Split each verse back into w: lines using the stored syllable counts
    if (lyricsLineCounts.length > 0) {
      const lyricsLines: string[] = [];
      const offsets = new Map<number, number>();
      for (let li = 0; li < lyricsLineCounts.length; li++) {
        const verse = lyricsLineVerses[li] ?? 1;
        const all = syllablesIn(verse, 0, lastMeasure);
        const offset = offsets.get(verse) ?? 0;
        const chunk = all.slice(offset, offset + lyricsLineCounts[li]);
        if (chunk.length > 0) lyricsLines.push(formatLyrics(chunk));
        offsets.set(verse, offset + lyricsLineCounts[li]);
      }
      // Any syllables beyond the recorded counts
      for (const verse of sortedVerses) {
        const all = syllablesIn(verse, 0, lastMeasure);
        const offset = offsets.get(verse) ?? 0;
        if (offset < all.length) lyricsLines.push(formatLyrics(all.slice(offset)));
      }
      return { music: musicStr, lyrics: lyricsLines.join('\n') };
    }

    // Fallback: one w: line per verse
    return { music: musicStr, lyrics: lyricLinesFor(0, lastMeasure).join('\n') };
  }

  // If there are line breaks, interleave lyrics
  if (lyricLineRanges.length > 0 && lineBreaks.length > 0) {
    // Split music string by newlines
    const musicLines = musicStr.split('\n');
    const resultLines: string[] = [];
    let lyricIdx = 0;

    for (let li = 0; li < musicLines.length; li++) {
      resultLines.push(musicLines[li]);
      // Check if there are lyrics for this music line
      if (lyricIdx < lyricLineRanges.length) {
        const range = lyricLineRanges[lyricIdx];
        resultLines.push(...lyricLinesFor(range.startMeasure, range.endMeasure));
        lyricIdx++;
      }
    }
    // Any remaining lyrics
    while (lyricIdx < lyricLineRanges.length) {
      const range = lyricLineRanges[lyricIdx];
      resultLines.push(...lyricLinesFor(range.startMeasure, range.endMeasure));
      lyricIdx++;
    }

    return { music: resultLines.join('\n'), lyrics: null };
  }

  // No line breaks - output all lyrics after music
  return { music: musicStr, lyrics: lyricLinesFor(0, lastMeasure).join('\n') };
}

function serializeMeasureEntries(
  measure: Measure,
  divisions: number,
  unitNote: UnitNote,
  opts: Required<AbcSerializeOptions>,
): { noteStr: string; lyrics: Map<number, string[]>; updatedUnitNote?: UnitNote } {
  const parts: string[] = [];
  // Syllables of this measure, keyed by verse number
  const lyrics = new Map<number, string[]>();
  // Mutable unit note for inline [L:] changes
  let currentUnitNote = { ...unitNote };
  // Collect chord pitches to emit them as [CEG] when the chord ends
  let chordPitches: string[] = [];
  let chordDurationStr = '';
  let chordTieStr = '';
  let chordSlurStart = '';
  let chordSlurEnd = '';
  let inChord = false;
  let chordHasIndividualDurations = false;
  // Tuplet group tracking: how many notes remain in current tuplet group
  let tupletRemaining = 0;

  for (let ei = 0; ei < measure.entries.length; ei++) {
    const entry = measure.entries[ei];

    switch (entry.type) {
      case 'note': {
        const note = entry;

        // Handle grace notes - group consecutive grace notes into {abc}
        if (note.grace) {
          const graceNotes: string[] = [];
          let gi = ei;
          // A chord inside the group ({[ce]}) is written with its brackets kept
          let openChord = false;
          while (gi < measure.entries.length) {
            const ge = measure.entries[gi];
            if (ge.type === 'note' && ge.grace) {
              const gs = serializeNote(ge, divisions, currentUnitNote, false);
              const startsChord = !ge.chord && isChordHead(measure.entries, gi);
              if (startsChord && !openChord) {
                graceNotes.push('[');
                openChord = true;
              } else if (openChord && !ge.chord) {
                graceNotes.push(']');
                openChord = startsChord;
                if (startsChord) graceNotes.push('[');
              }
              graceNotes.push(gs.pitch);
              gi++;
            } else {
              break;
            }
          }
          if (openChord) graceNotes.push(']');
          // ABC {/...} is an acciaccatura (slashed); plain {...} an appoggiatura
          parts.push((note.grace.slash ? '{/' : '{') + graceNotes.join('') + '}');
          ei = gi - 1; // Skip the grouped grace notes
          break;
        }

        const serialized = serializeNote(note, divisions, currentUnitNote, false);

        if (note.chord) {
          // Accumulate chord pitch (with individual duration and tie if applicable)
          if (!inChord) {
            inChord = true;
          }
          let chordNoteStr = serialized.pitch;
          if (chordHasIndividualDurations) {
            chordNoteStr += serialized.duration;
          }
          // Add per-note tie if present
          if (note.tie?.type === 'start' || note.ties?.some(t => t.type === 'start')) {
            chordNoteStr += '-';
          }
          chordPitches.push(chordNoteStr);
          break;
        }

        // If we were in a chord, flush it first
        if (inChord) {
          parts.push('[' + chordPitches.join('') + ']' + chordDurationStr + chordTieStr + chordSlurEnd);
          inChord = false;
          chordHasIndividualDurations = false;
          chordPitches = [];
          chordDurationStr = '';
          chordTieStr = '';
          chordSlurStart = '';
          chordSlurEnd = '';
        }

        // Handle lyrics (one entry per verse)
        if (note.lyrics && note.lyrics.length > 0 && opts.includeLyrics) {
          for (const lyric of note.lyrics) {
            if (!lyric.text) continue;
            const syllabic = lyric.syllabic || 'single';
            const suffix = syllabic === 'begin' || syllabic === 'middle' ? '-' : '';
            const verse = lyric.number ?? 1;
            const bucket = lyrics.get(verse);
            if (bucket) bucket.push(lyric.text + suffix);
            else lyrics.set(verse, [lyric.text + suffix]);
          }
        }

        // Handle tuplet prefix - detect tuplet group start from timeModification
        let tupletPrefix = '';
        if (note.timeModification && !note.chord && !note.grace && tupletRemaining <= 0) {
          // Start of a new tuplet group
          // Default group size is p (actualNotes), e.g. (3 means 3 notes in the time of 2
          const p = note.timeModification.actualNotes;
          tupletRemaining = p;
          tupletPrefix = `(${p}`;
        }
        if (note.timeModification && !note.chord && !note.grace) {
          tupletRemaining--;
        }

        // For tuplet notes, compute the pre-tuplet duration for ABC output
        let effectiveSerialized = serialized;
        if (note.timeModification && note.pitch) {
          // Undo the tuplet modification: ABC notation expects the base duration
          // with the (p prefix handling the modification
          const baseDuration = Math.round(note.duration * note.timeModification.actualNotes / note.timeModification.normalNotes);
          const { num, den } = durationToAbcFraction(baseDuration, divisions, currentUnitNote);
          const baseDurationStr = formatAbcDuration(num, den);
          const pitchStr = serializePitch(note.pitch, note.accidental?.value === 'natural');
          // Rebuild serialized with base duration
          let tieStr = '';
          if (note.tie?.type === 'start' || note.ties?.some(t => t.type === 'start')) {
            tieStr = '-';
          }
          let slurStart = '';
          let slurEnd = '';
          if (note.notations) {
            for (const notation of note.notations) {
              if (notation.type === 'slur') {
                if (notation.slurType === 'start') slurStart += notation.lineType === 'dotted' ? '.(' : '(';
                if (notation.slurType === 'stop') slurEnd += ')';
              }
            }
          }
          const decorations = serializeNoteDecorations(note);
          effectiveSerialized = {
            full: slurStart + decorations + pitchStr + baseDurationStr + tieStr + slurEnd,
            pitch: pitchStr,
            duration: baseDurationStr,
            slurStart,
            slurEnd,
            tieStr,
            decorations,
          };
        }

        // Check if next entry is a chord note (this note starts a chord)
        const nextEntry = ei + 1 < measure.entries.length ? measure.entries[ei + 1] : null;
        if (nextEntry && nextEntry.type === 'note' && nextEntry.chord) {
          // Start collecting chord pitches
          inChord = true;
          // Detect individual durations: use explicit flag if available (ABC→ABC),
          // otherwise detect from duration comparison (MusicXML→ABC)
          const hasIndividualDur = detectChordIndividualDurations(measure.entries, ei);
          chordHasIndividualDurations = hasIndividualDur;

          // Check if chord has per-note ties (individual ties on each note)
          const hasPerNoteTies = detectChordPerNoteTies(measure.entries, ei);
          const firstNoteTie = note.tie?.type === 'start' || note.ties?.some(t => t.type === 'start');

          let firstNoteStr = hasIndividualDur ? effectiveSerialized.pitch + effectiveSerialized.duration : effectiveSerialized.pitch;
          // Add per-note tie to first note if applicable
          if (hasPerNoteTies && firstNoteTie) {
            firstNoteStr += '-';
          }
          chordPitches = [firstNoteStr];
          chordDurationStr = hasIndividualDur ? '' : effectiveSerialized.duration;
          chordTieStr = '';
          chordSlurStart = '';
          chordSlurEnd = '';
          // Only add chord-level tie if NOT using per-note ties
          if (firstNoteTie && !hasPerNoteTies) {
            chordTieStr = '-';
          }
          if (note.notations) {
            for (const notation of note.notations) {
              if (notation.type === 'slur') {
                if (notation.slurType === 'start') chordSlurStart = '(';
                if (notation.slurType === 'stop') chordSlurEnd = ')';
              }
            }
          }
          // Handle slur/decoration ordering for chords too
          if (chordSlurStart) {
            let insertIdx = parts.length;
            for (let pi = parts.length - 1; pi >= 0; pi--) {
              const p = parts[pi];
              if ((p.length === 1 && ABC_SHORTHAND_DECORATIONS.has(p)) || /^![^!]+!$/.test(p) || /^"[^"]*"$/.test(p)) {
                insertIdx = pi;
              } else {
                break;
              }
            }
            if (insertIdx < parts.length) {
              parts.splice(insertIdx, 0, chordSlurStart);
              parts.push(tupletPrefix + effectiveSerialized.decorations);
              break;
            }
          }
          parts.push(tupletPrefix + chordSlurStart + effectiveSerialized.decorations);
          break;
        }

        // Handle slur/decoration ordering: if this note has slur start and
        // preceding parts are decorations/dynamics, the slur ( should go before them
        // e.g. ABC "(vfg)" means slur-start, decoration v, note f - not "v(fg)"
        // e.g. ABC "(!mf!vd=e)" means slur-start, dynamic, decoration, note
        if (effectiveSerialized.slurStart) {
          // Find where to insert slur start (before trailing decorations/dynamics)
          let insertIdx = parts.length;
          for (let pi = parts.length - 1; pi >= 0; pi--) {
            const p = parts[pi];
            if (/^[vuTM]$/.test(p) || /^![^!]+!$/.test(p) || /^"[^"]*"$/.test(p)) {
              insertIdx = pi;
            } else {
              break;
            }
          }
          if (insertIdx < parts.length) {
            // Insert slur start before decorations
            parts.splice(insertIdx, 0, effectiveSerialized.slurStart);
            // Push note without slur start
            const noteOnly = effectiveSerialized.decorations + effectiveSerialized.pitch + effectiveSerialized.duration + effectiveSerialized.tieStr + effectiveSerialized.slurEnd;
            parts.push(tupletPrefix + noteOnly);
            break;
          }
        }

        // Detect broken rhythm: check if this note and the next note form a > or < pair
        // Broken rhythm: A>B means A is dotted (3/2), B is halved (1/2) of their common base
        const brokenResult = detectBrokenRhythm(measure.entries, ei, note, divisions, currentUnitNote);
        if (brokenResult && !note.chord && !note.grace && !note.timeModification) {
          // Re-serialize this note with its base duration
          const baseDurStr1 = formatAbcDuration(brokenResult.baseFrac.num, brokenResult.baseFrac.den);
          const pitchStr1 = effectiveSerialized.pitch;
          const tie1 = effectiveSerialized.tieStr;
          const slurS1 = effectiveSerialized.slurStart;
          const slurE1 = effectiveSerialized.slurEnd;
          parts.push(tupletPrefix + slurS1 + effectiveSerialized.decorations + pitchStr1 + baseDurStr1 + tie1 + brokenResult.marker);

          // Serialize the second note with its base duration
          const note2 = brokenResult.nextNote;
          const pitchStr2 = serializeNoteDecorations(note2) + serializePitch(note2.pitch!, note2.accidental?.value === 'natural');
          let tieStr2 = '';
          if (note2.tie?.type === 'start' || note2.ties?.some(t => t.type === 'start')) tieStr2 = '-';
          let slurEnd2 = '';
          if (note2.notations) {
            for (const notation of note2.notations) {
              if (notation.type === 'slur' && notation.slurType === 'stop') slurEnd2 += ')';
            }
          }
          parts.push(pitchStr2 + baseDurStr1 + tieStr2 + slurEnd2 + slurE1);
          ei = brokenResult.nextIndex; // Skip the second note
          break;
        }

        parts.push(tupletPrefix + effectiveSerialized.full);
        break;
      }

      case 'harmony': {
        if (opts.includeChordSymbols) {
          parts.push(serializeHarmony(entry));
        }
        break;
      }

      case 'direction': {
        // Check for round-trip markers that stand in for ABC layout syntax
        let handledAsSpecial = false;
        for (const dt of entry.directionTypes) {
          if (dt.kind !== 'words') continue;
          // Intra-measure line break/continuation markers
          if (dt.text === '__abc_line_cont__') {
            parts.push('\\\n');
            handledAsSpecial = true;
            break;
          }
          if (dt.text === '__abc_line_break__') {
            parts.push('\n');
            handledAsSpecial = true;
            break;
          }
          // Whole-line body field (P:, s:, r:, ...) kept verbatim
          if (dt.text.startsWith(ABC_BODY_FIELD_MARKER)) {
            // The newline that follows comes from the line break token that
            // separates the field from the music line below it
            parts.push('\n' + dt.text.slice(ABC_BODY_FIELD_MARKER.length));
            handledAsSpecial = true;
            break;
          }
          const inlineField = dt.text.match(/^\[([A-Za-z]):\s*([^\]]*)\]$/);
          if (inlineField) {
            parts.push(dt.text);
            if (inlineField[1] === 'L') {
              const lMatch = inlineField[2].match(/^(\d+)\/(\d+)$/);
              if (lMatch) {
                currentUnitNote = { num: parseInt(lMatch[1], 10), den: parseInt(lMatch[2], 10) };
              }
            }
            handledAsSpecial = true;
            break;
          }
        }
        if (handledAsSpecial) break;

        const text = serializeDirectionText(entry, opts);
        if (text) {
          if (opts.includeChordSymbols || !text.startsWith('"')) {
            parts.push(text);
          }
        }
        // Tempo is handled in header, skip here
        break;
      }

      case 'backup':
        // Emit & overlay marker (go back to start of bar for voice overlay)
        parts.push(' & ');
        break;

      case 'forward':
        // Forward entries are time-advancing spacers, not directly represented in ABC
        break;

      default:
        break;
    }
  }

  // Flush any remaining chord
  if (inChord && chordPitches.length > 0) {
    parts.push('[' + chordPitches.join('') + ']' + chordDurationStr + chordTieStr + chordSlurEnd);
  }

  // Return updated unit note if it changed (from inline [L:] fields)
  const unitNoteChanged = currentUnitNote.num !== unitNote.num || currentUnitNote.den !== unitNote.den;
  return { noteStr: parts.join(''), lyrics, updatedUnitNote: unitNoteChanged ? currentUnitNote : undefined };
}

/**
 * Number of bars covered by the multi-measure rest starting at this measure,
 * or 0 when the measure does not start one.
 */
function multipleRestCount(measure: Measure): number {
  const styles = measure.attributes?.measureStyle;
  if (!styles) return 0;
  for (const style of styles) {
    if (style.multipleRest && style.multipleRest > 1) return style.multipleRest;
  }
  return 0;
}

/**
 * Collapse a multi-measure rest back to ABC's `Zn` form.
 *
 * @returns The measure text, and how many following measures it absorbed.
 */
function applyMultiMeasureRest(measure: Measure, noteStr: string): { text: string; absorbed: number } {
  const count = multipleRestCount(measure);
  if (count < 2 || noteStr.trim() !== 'Z') return { text: noteStr, absorbed: 0 };
  return { text: `Z${count}`, absorbed: count - 1 };
}

/** True when a measure already writes its key change as an inline [K:...] field. */
function hasInlineKeyMarker(measure: Measure): boolean {
  return measure.entries.some(e =>
    e.type === 'direction' &&
    e.directionTypes.some(dt => dt.kind === 'words' && /^\[K:/.test(dt.text)));
}

/** True when a measure carries any note or rest (as opposed to markers only). */
function measureHasNotes(measure: Measure): boolean {
  return measure.entries.some(e => e.type === 'note');
}

/** True when the entry at `index` is the first note of a chord. */
function isChordHead(entries: MeasureEntry[], index: number): boolean {
  const next = entries[index + 1];
  return next !== undefined && next.type === 'note' && next.chord === true;
}

/**
 * Detect if two consecutive notes form a broken rhythm pair.
 * Broken rhythm: A>B means first note gets 3/2 of base, second gets 1/2.
 * Returns null if not a broken rhythm pattern.
 */
function detectBrokenRhythm(
  entries: Measure['entries'],
  currentIdx: number,
  currentNote: NoteEntry,
  divisions: number,
  unitNote: UnitNote,
): { marker: string; nextNote: NoteEntry; nextIndex: number; baseFrac: { num: number; den: number } } | null {
  // Skip if current note is a chord member, grace note, rest, or in a tuplet
  if (currentNote.chord || currentNote.grace || currentNote.rest || currentNote.timeModification) return null;

  // Find the next pitched note (skip directions, harmonies, etc.)
  let nextIdx = currentIdx + 1;
  // Skip chord members after current note
  while (nextIdx < entries.length && entries[nextIdx].type === 'note' && (entries[nextIdx] as NoteEntry).chord) {
    nextIdx++;
  }
  // Skip non-note entries (directions, harmonies)
  while (nextIdx < entries.length && entries[nextIdx].type !== 'note') {
    nextIdx++;
  }

  if (nextIdx >= entries.length) return null;
  const nextEntry = entries[nextIdx];
  if (nextEntry.type !== 'note') return null;
  const nextNote = nextEntry as NoteEntry;

  // Skip if next note is a chord member, grace, rest, or tuplet
  if (nextNote.chord || nextNote.grace || nextNote.rest || nextNote.timeModification) return null;

  const d1 = currentNote.duration;
  const d2 = nextNote.duration;
  if (d1 <= 0 || d2 <= 0) return null;

  // Check for > pattern: d1:d2 = 3:1, base = (d1+d2)/2
  // Check for >> pattern: d1:d2 = 7:1, base = (d1+d2)/2
  // Check for < pattern: d1:d2 = 1:3, base = (d1+d2)/2
  // Check for << pattern: d1:d2 = 1:7, base = (d1+d2)/2
  const sum = d1 + d2;
  if (sum % 2 !== 0) return null;
  const base = sum / 2;

  // Verify base duration produces a clean ABC fraction
  const baseFrac = durationToAbcFraction(base, divisions, unitNote);
  // Reject if the fraction is too complex (not a simple duration)
  if (baseFrac.den > 16 || baseFrac.num > 16) return null;

  // Only use broken rhythm when at least one note has a fractional duration.
  // This prevents converting explicit integer durations like D3F to D2>F2.
  const frac1 = durationToAbcFraction(d1, divisions, unitNote);
  const frac2 = durationToAbcFraction(d2, divisions, unitNote);
  if (frac1.den === 1 && frac2.den === 1) return null;

  let marker: string | null = null;
  if (d1 * 1 === d2 * 3) {
    // d1:d2 = 3:1 → >
    marker = '>';
  } else if (d1 * 3 === d2 * 1) {
    // d1:d2 = 1:3 → <
    marker = '<';
  } else if (d1 * 1 === d2 * 7) {
    // d1:d2 = 7:1 → >>
    marker = '>>';
  } else if (d1 * 7 === d2 * 1) {
    // d1:d2 = 1:7 → <<
    marker = '<<';
  }

  if (!marker) return null;

  return { marker, nextNote, nextIndex: nextIdx, baseFrac };
}

/**
 * Detect if a chord starting at entry index `startIdx` has per-note ties
 * (multiple notes each with their own tie, not just a chord-level tie).
 */
function detectChordPerNoteTies(entries: Measure['entries'], startIdx: number): boolean {
  let tiedCount = 0;
  let totalCount = 1; // counting first note

  const firstNote = entries[startIdx];
  if (firstNote.type === 'note') {
    const hasTieStart = firstNote.tie?.type === 'start' || firstNote.ties?.some(t => t.type === 'start');
    if (hasTieStart) tiedCount++;
  }

  for (let i = startIdx + 1; i < entries.length; i++) {
    const e = entries[i];
    if (e.type !== 'note' || !e.chord) break;
    totalCount++;
    const hasTieStart = e.tie?.type === 'start' || e.ties?.some(t => t.type === 'start');
    if (hasTieStart) tiedCount++;
  }

  // Per-note ties: multiple notes have ties (not just first/last)
  return tiedCount > 1 || (tiedCount > 0 && totalCount > 1);
}

/**
 * Detect if a chord starting at entry index `startIdx` has individually different durations.
 * Returns true if the notes in the chord have differing durations,
 * or if the score-level flag indicates individual chord durations should be used.
 */
function detectChordIndividualDurations(entries: Measure['entries'], startIdx: number): boolean {
  // The first note is at startIdx, subsequent chord notes have chord=true
  const firstNote = entries[startIdx];
  if (firstNote.type !== 'note') return false;

  // Check for explicit flag from ABC importer (direct ABC→ABC roundtrip)
  if ((firstNote as any)._abcIndividualChordDurations) return true;

  // Check module-level flag from score metadata (survives MusicXML roundtrip)
  if (useIndividualChordDurations) return true;

  const baseDuration = firstNote.duration;
  for (let i = startIdx + 1; i < entries.length; i++) {
    const e = entries[i];
    if (e.type !== 'note' || !e.chord) break;
    if (e.duration !== baseDuration) return true;
  }
  return false;
}

interface SerializedNote {
  full: string;
  pitch: string;
  duration: string;
  slurStart: string;
  slurEnd: string;
  tieStr: string;
  /** ABC decorations, emitted between the slur opening and the note. */
  decorations: string;
}

function serializeNote(
  note: NoteEntry,
  divisions: number,
  unitNote: UnitNote,
  _inChord: boolean,
): SerializedNote {
  let pitchStr = '';
  let durationStr = '';

  if (note.rest) {
    if (note.rest.measure) {
      pitchStr = 'Z';
      durationStr = '';
    } else {
      // Check for invisible rest
      const isInvisible = note.printObject === false;
      pitchStr = isInvisible ? 'x' : 'z';
      const { num, den } = durationToAbcFraction(note.duration, divisions, unitNote);
      durationStr = formatAbcDuration(num, den);
    }
  } else if (note.grace) {
    // Grace notes - pitch only (grouping handled in serializeMeasureEntries)
    if (note.pitch) {
      pitchStr = serializePitch(note.pitch, note.accidental?.value === 'natural');
    }
    durationStr = '';
  } else if (note.pitch) {
    pitchStr = serializePitch(note.pitch, note.accidental?.value === 'natural');
    const effectiveDuration = note.duration;
    const { num, den } = durationToAbcFraction(effectiveDuration, divisions, unitNote);
    durationStr = formatAbcDuration(num, den);
  }

  // Tie
  let tieStr = '';
  if (note.tie?.type === 'start' || note.ties?.some(t => t.type === 'start')) {
    tieStr = '-';
  }

  // Slur handling: we track slur start/stop via notations
  let slurStart = '';
  let slurEnd = '';
  if (note.notations) {
    for (const notation of note.notations) {
      if (notation.type === 'slur') {
        if (notation.slurType === 'start') slurStart += notation.lineType === 'dotted' ? '.(' : '(';
        if (notation.slurType === 'stop') slurEnd += ')';
      }
    }
  }

  const decorations = serializeNoteDecorations(note);
  const full = slurStart + decorations + pitchStr + durationStr + tieStr + slurEnd;
  return { full, pitch: pitchStr, duration: durationStr, slurStart, slurEnd, tieStr, decorations };
}


function serializeBarline(barline: Barline): string {
  const hasRepeatForward = barline.repeat?.direction === 'forward';
  const hasRepeatBackward = barline.repeat?.direction === 'backward';
  const hasEnding = barline.ending;

  let result = '';

  if (hasRepeatForward) {
    result += '|:';
  } else if (hasRepeatBackward) {
    result += ':|';
  } else if (hasEnding && !barline.barStyle) {
    // Ending-only barline (no bar style) - don't output barline character
    // The barline was already output by the previous measure's right barline
  } else {
    switch (barline.barStyle) {
      case 'light-light': result += '||'; break;
      case 'light-heavy': result += '|]'; break;
      case 'heavy-light': result += '[|'; break;
      case 'none': result += '[|]'; break;
      case 'dotted': case 'dashed': result += '.|'; break;
      default: result += '|'; break;
    }
  }

  // Add ending marker after barline
  if (hasEnding && hasEnding.type === 'start') {
    if (result) {
      // Barline already present (e.g., ||, |, |:, :|) - just append number
      result += hasEnding.number;
    } else {
      // Standalone ending (no barline) - use bracket notation [1
      result += `[${hasEnding.number} `;
    }
  }

  return result;
}
