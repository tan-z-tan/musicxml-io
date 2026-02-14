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
} from '../types';

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

function musicXmlClefToAbc(clef: { sign: string; line?: number }): string | null {
  if (clef.sign === 'G' && (clef.line === 2 || clef.line === undefined)) return 'treble';
  if (clef.sign === 'F' && (clef.line === 4 || clef.line === undefined)) return 'bass';
  if (clef.sign === 'C' && clef.line === 3) return 'alto';
  if (clef.sign === 'C' && clef.line === 4) return 'tenor';
  if (clef.sign === 'C' && clef.line === 1) return 'soprano';
  if (clef.sign === 'C' && clef.line === 2) return 'mezzo-soprano';
  if (clef.sign === 'C' && clef.line === 5) return 'baritone';
  if (clef.sign === 'percussion') return 'perc';
  return null;
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
  if (time.symbol === 'common') return 'C';
  if (time.symbol === 'cut') return 'C|';
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
    const beats = parseInt(time.beats, 10);
    const beatType = time.beatType;
    const ratio = beats / beatType;
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
    if (den === 2) return '/';
    return `/${den}`;
  }
  return `${num}/${den}`;
}

// ============================================================
// Note Pitch Serialization
// ============================================================

function serializePitch(pitch: Pitch): string {
  let result = '';

  // Accidental
  if (pitch.alter !== undefined && pitch.alter !== 0) {
    if (pitch.alter === 1) result += '^';
    else if (pitch.alter === 2) result += '^^';
    else if (pitch.alter === -1) result += '_';
    else if (pitch.alter === -2) result += '__';
  }

  // Note letter and octave
  const step = pitch.step;
  const octave = pitch.octave;

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
// Dynamics Serialization
// ============================================================

function serializeDynamics(direction: DirectionEntry): string | null {
  for (const dt of direction.directionTypes) {
    if (dt.kind === 'dynamics' && dt.value) {
      return `!${dt.value}!`;
    }
  }
  return null;
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

  const unitNote = computeUnitNoteLength(score);
  const lines: string[] = [];

  // Get attributes from first measure
  const firstPart = score.parts[0];
  const firstMeasure = firstPart?.measures[0];
  const attrs = firstMeasure?.attributes;

  // Header - use stored reference number if available, then options, then default 1
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

  if (attrs?.time) {
    lines.push(`M:${serializeTimeSignature(attrs.time)}`);
  }

  lines.push(`L:${unitNote.num}/${unitNote.den}`);

  // Tempo from first measure directions
  const tempoStr = findTempoInMeasure(firstMeasure);
  if (tempoStr) {
    lines.push(`Q:${tempoStr}`);
  }

  if (attrs?.key) {
    lines.push(`K:${serializeKey(attrs.key)}`);
  } else {
    lines.push('K:C');
  }

  // Body
  const multiVoice = score.parts.length > 1;

  // If multi-voice, declare voices in header
  if (multiVoice) {
    // Voice declarations already implied by V: in body
  }

  for (let partIdx = 0; partIdx < score.parts.length; partIdx++) {
    const part = score.parts[partIdx];

    if (multiVoice) {
      let voiceLine = `V:${partIdx + 1}`;
      // Add clef if not treble
      const partClef = part.measures[0]?.attributes?.clef?.[0];
      if (partClef) {
        const clefName = musicXmlClefToAbc(partClef);
        if (clefName && clefName !== 'treble') {
          voiceLine += ` clef=${clefName}`;
        }
      }
      lines.push(voiceLine);
    }

    const divisions = getPartDivisions(part);
    const bodyResult = serializePartBody(part, divisions, unitNote, opts);

    lines.push(bodyResult.music);

    if (opts.includeLyrics && bodyResult.lyrics) {
      lines.push(bodyResult.lyrics);
    }
  }

  return lines.join('\n') + '\n';
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
  unitNote: UnitNote,
  opts: Required<AbcSerializeOptions>,
): PartBodyResult {
  const musicParts: string[] = [];
  const allLyrics: Map<number, string[]> = new Map(); // measureIndex -> lyrics array

  for (let mi = 0; mi < part.measures.length; mi++) {
    const measure = part.measures[mi];
    const measDivisions = measure.attributes?.divisions ?? divisions;

    // Check for left barline (repeats, etc.)
    const leftBarline = measure.barlines?.find(b => b.location === 'left');
    if (leftBarline) {
      musicParts.push(serializeBarline(leftBarline));
    }

    // Serialize entries
    const { noteStr, lyrics } = serializeMeasureEntries(
      measure, measDivisions, unitNote, opts,
    );
    musicParts.push(noteStr);

    if (lyrics.length > 0) {
      allLyrics.set(mi, lyrics);
    }

    // Right barline
    const rightBarline = measure.barlines?.find(b => b.location === 'right');
    if (rightBarline) {
      musicParts.push(serializeBarline(rightBarline));
    } else if (mi < part.measures.length - 1) {
      musicParts.push('|');
    } else {
      musicParts.push('|');
    }
  }

  // Assemble lyrics
  let lyricsStr: string | null = null;
  if (allLyrics.size > 0) {
    // Build lyrics line(s)
    // Group lyrics by contiguous measure ranges
    const lyricLines: string[] = [];
    const sortedMeasures = Array.from(allLyrics.keys()).sort((a, b) => a - b);

    // Build line breaks to match the music output
    let currentLyricLine: string[] = [];
    let lastMeasure = -1;

    for (const mi of sortedMeasures) {
      const syllables = allLyrics.get(mi)!;
      if (lastMeasure >= 0 && mi > lastMeasure + 1) {
        // Gap - push current line and start new
        if (currentLyricLine.length > 0) {
          lyricLines.push('w:' + currentLyricLine.join(' '));
          currentLyricLine = [];
        }
      }
      currentLyricLine.push(...syllables);
      lastMeasure = mi;
    }
    if (currentLyricLine.length > 0) {
      lyricLines.push('w:' + currentLyricLine.join(' '));
    }

    lyricsStr = lyricLines.join('\n');
  }

  return { music: musicParts.join(''), lyrics: lyricsStr };
}

function serializeMeasureEntries(
  measure: Measure,
  divisions: number,
  unitNote: UnitNote,
  opts: Required<AbcSerializeOptions>,
): { noteStr: string; lyrics: string[] } {
  const parts: string[] = [];
  const lyrics: string[] = [];
  // Collect chord pitches to emit them as [CEG] when the chord ends
  let chordPitches: string[] = [];
  let chordDurationStr = '';
  let chordTieStr = '';
  let chordSlurStart = '';
  let chordSlurEnd = '';
  let inChord = false;

  for (let ei = 0; ei < measure.entries.length; ei++) {
    const entry = measure.entries[ei];

    switch (entry.type) {
      case 'note': {
        const note = entry;
        const serialized = serializeNote(note, divisions, unitNote, false);

        if (note.chord) {
          // Accumulate chord pitch
          if (!inChord) {
            // Previous note was the first in this chord; re-categorize
            inChord = true;
          }
          chordPitches.push(serialized.pitch);
          break;
        }

        // If we were in a chord, flush it first
        if (inChord) {
          parts.push('[' + chordPitches.join('') + ']' + chordDurationStr + chordTieStr + chordSlurEnd);
          inChord = false;
          chordPitches = [];
          chordDurationStr = '';
          chordTieStr = '';
          chordSlurStart = '';
          chordSlurEnd = '';
        }

        // Handle lyrics
        if (note.lyrics && note.lyrics.length > 0 && opts.includeLyrics) {
          const lyric = note.lyrics[0];
          if (lyric.text) {
            const syllabic = lyric.syllabic || 'single';
            const suffix = syllabic === 'begin' || syllabic === 'middle' ? '-' : '';
            lyrics.push(lyric.text + suffix);
          }
        }

        // Check if next entry is a chord note (this note starts a chord)
        const nextEntry = ei + 1 < measure.entries.length ? measure.entries[ei + 1] : null;
        if (nextEntry && nextEntry.type === 'note' && nextEntry.chord) {
          // Start collecting chord pitches
          inChord = true;
          chordPitches = [serialized.pitch];
          chordDurationStr = serialized.duration;
          // Capture tie/slur from the first note
          chordTieStr = '';
          chordSlurStart = '';
          chordSlurEnd = '';
          if (note.tie?.type === 'start' || note.ties?.some(t => t.type === 'start')) {
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
          parts.push(chordSlurStart); // push slur start before chord if any
          break;
        }

        parts.push(serialized.full);
        break;
      }

      case 'harmony': {
        if (opts.includeChordSymbols) {
          parts.push(serializeHarmony(entry));
        }
        break;
      }

      case 'direction': {
        if (opts.includeDynamics) {
          const dynStr = serializeDynamics(entry);
          if (dynStr) {
            parts.push(dynStr);
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

  return { noteStr: parts.join(''), lyrics };
}

interface SerializedNote {
  full: string;
  pitch: string;
  duration: string;
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
      pitchStr = 'z';
      const { num, den } = durationToAbcFraction(note.duration, divisions, unitNote);
      durationStr = formatAbcDuration(num, den);
    }
  } else if (note.grace) {
    // Grace notes
    if (note.pitch) {
      pitchStr = '{' + serializePitch(note.pitch) + '}';
    }
    durationStr = '';
  } else if (note.pitch) {
    pitchStr = serializePitch(note.pitch);
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
        if (notation.slurType === 'start') slurStart += '(';
        if (notation.slurType === 'stop') slurEnd += ')';
      }
    }
  }

  const full = slurStart + pitchStr + durationStr + tieStr + slurEnd;
  return { full, pitch: pitchStr, duration: durationStr };
}


function serializeBarline(barline: Barline): string {
  const hasRepeatForward = barline.repeat?.direction === 'forward';
  const hasRepeatBackward = barline.repeat?.direction === 'backward';
  const hasEnding = barline.ending;

  let result = '';

  if (hasEnding && hasEnding.type === 'start') {
    result += `[${hasEnding.number} `;
  }

  if (hasRepeatForward) {
    result += '|:';
  } else if (hasRepeatBackward) {
    result += ':|';
  } else {
    switch (barline.barStyle) {
      case 'light-light': result += '||'; break;
      case 'light-heavy': result += '|]'; break;
      case 'heavy-light': result += '[|'; break;
      default: result += '|'; break;
    }
  }

  if (hasEnding && hasEnding.type === 'stop') {
    // Ending stop doesn't need special notation in ABC
  }

  return result;
}
