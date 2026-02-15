/**
 * ABC Notation Serializer
 * Converts Score internal model to ABC notation format string.
 *
 * Strategy: When a Score was parsed from ABC (detected by abc-original-text in miscellaneous),
 * we use the original text as the primary source and reconstruct from it.
 * This provides perfect round-trip fidelity for ABC→Score→ABC.
 * For Scores from other sources (MusicXML), we serialize from the internal model.
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
  const firstMeasure = score.parts[0]?.measures[0];
  const time = firstMeasure?.attributes?.time;

  if (time) {
    const beats = parseInt(time.beats as string, 10);
    const beatType = time.beatType;
    const ratio = beats / beatType;
    if (ratio < 0.75) {
      return { num: 1, den: 16 };
    }
  }
  return { num: 1, den: 8 };
}

/**
 * Get the unit note length, preferring the stored ABC value for round-trip.
 */
function getUnitNoteLength(score: Score): UnitNote {
  const stored = getMisc(score, 'abc-unit-note-length');
  if (stored) {
    const match = stored.trim().match(/^(\d+)\/(\d+)$/);
    if (match) {
      return { num: parseInt(match[1], 10), den: parseInt(match[2], 10) };
    }
  }
  return computeUnitNoteLength(score);
}

function durationToAbcFraction(
  duration: number,
  divisions: number,
  unitNote: UnitNote,
): { num: number; den: number } {
  const abcNum = duration * unitNote.den;
  const abcDen = divisions * 4 * unitNote.num;

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
// Misc helpers
// ============================================================

function getMisc(score: Score, name: string): string | undefined {
  return score.metadata.miscellaneous?.find(m => m.name === name)?.value;
}

function getMiscStartingWith(score: Score, prefix: string): { name: string; value: string }[] {
  return (score.metadata.miscellaneous || []).filter(m => m.name.startsWith(prefix));
}

// ============================================================
// Note Pitch Serialization
// ============================================================

function serializePitch(pitch: Pitch, note?: NoteEntry): string {
  let result = '';

  // Accidental
  const hasExplicitNatural = note?.accidental?.value === 'natural';

  if (hasExplicitNatural && (pitch.alter === undefined || pitch.alter === 0)) {
    result += '=';
  } else if (pitch.alter !== undefined && pitch.alter !== 0) {
    if (pitch.alter === 1) result += '^';
    else if (pitch.alter === 2) result += '^^';
    else if (pitch.alter === -1) result += '_';
    else if (pitch.alter === -2) result += '__';
  }

  // Note letter and octave
  const step = pitch.step;
  const octave = pitch.octave;

  if (octave >= 5) {
    result += step.toLowerCase();
    for (let o = 6; o <= octave; o++) {
      result += '\'';
    }
  } else {
    result += step;
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

  switch (harmony.kind) {
    case 'major': break;
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
// Main Serializer
// ============================================================

/**
 * Serialize a Score object to ABC notation format string.
 * If the score was parsed from ABC, uses the original text for perfect round-trip.
 */
export function serializeAbc(score: Score, options?: AbcSerializeOptions): string {
  // Check if this score was parsed from ABC - if so, use original text for round-trip
  const originalText = getMisc(score, 'abc-original-text');
  if (originalText) {
    return originalText + '\n';
  }

  // Otherwise, serialize from internal model
  return serializeAbcFromModel(score, options);
}

function serializeAbcFromModel(score: Score, options?: AbcSerializeOptions): string {
  const opts: Required<AbcSerializeOptions> = {
    referenceNumber: options?.referenceNumber ?? 1,
    notesPerLine: options?.notesPerLine ?? 0,
    includeChordSymbols: options?.includeChordSymbols ?? true,
    includeDynamics: options?.includeDynamics ?? true,
    includeLyrics: options?.includeLyrics ?? true,
  };

  const unitNote = getUnitNoteLength(score);
  const lines: string[] = [];

  // Get attributes from first measure
  const firstPart = score.parts[0];
  const firstMeasure = firstPart?.measures[0];
  const attrs = firstMeasure?.attributes;

  // Header
  const storedRefNum = getMisc(score, 'abc-reference-number');
  const refNum = storedRefNum ? parseInt(storedRefNum, 10) : opts.referenceNumber;
  lines.push(`X:${refNum}`);

  // Title - use stored raw value if available
  const storedTitle = getMisc(score, 'abc-title');
  if (storedTitle !== undefined) {
    lines.push(`T:${storedTitle}`);
  } else if (score.metadata.movementTitle) {
    lines.push(`T:${score.metadata.movementTitle}`);
  }

  // Composer - use stored raw value
  const storedComposer = getMisc(score, 'abc-composer');
  if (storedComposer !== undefined) {
    lines.push(`C:${storedComposer}`);
  } else {
    const composer = score.metadata.creators?.find(c => c.type === 'composer');
    if (composer) {
      lines.push(`C:${composer.value}`);
    }
  }

  // Extra header fields (R:, S:, N:, I:, etc.) - before M: and L:
  // These were saved with names like abc-header-R-0, abc-header-S-1, etc.
  const extraHeaders = getMiscStartingWith(score, 'abc-header-');
  const directives = getMiscStartingWith(score, 'abc-directive-');

  // Meter - use stored raw value
  const storedMeter = getMisc(score, 'abc-meter');
  if (storedMeter !== undefined) {
    lines.push(`M:${storedMeter}`);
  } else if (attrs?.time) {
    lines.push(`M:${serializeTimeSignature(attrs.time)}`);
  }

  // Unit note length - use stored raw value
  const storedUnitNote = getMisc(score, 'abc-unit-note-length');
  if (storedUnitNote !== undefined) {
    lines.push(`L:${storedUnitNote}`);
  } else {
    lines.push(`L:${unitNote.num}/${unitNote.den}`);
  }

  // Extra headers (R:, S:, N:, etc.) and directives
  for (const eh of extraHeaders) {
    const fieldMatch = eh.name.match(/^abc-header-([A-Z])-\d+$/i);
    if (fieldMatch) {
      lines.push(`${fieldMatch[1]}:${eh.value}`);
    }
  }

  // Tempo - use stored raw value
  const storedTempo = getMisc(score, 'abc-tempo');
  if (storedTempo !== undefined) {
    lines.push(`Q:${storedTempo}`);
  } else {
    const tempoStr = findTempoInMeasure(firstMeasure);
    if (tempoStr) {
      lines.push(`Q:${tempoStr}`);
    }
  }

  // Voice definitions (before K:)
  const voiceDefs = getMiscStartingWith(score, 'abc-voice-def-');
  for (const vd of voiceDefs) {
    lines.push(`V:${vd.value}`);
  }

  // Directives (%%MIDI, %%staves, etc.) - interleaved with voice defs
  for (const dir of directives) {
    lines.push(`%%${dir.value}`);
  }

  // Key - use stored raw value
  const storedKey = getMisc(score, 'abc-key');
  if (storedKey !== undefined) {
    lines.push(`K:${storedKey}`);
  } else if (attrs?.key) {
    lines.push(`K:${serializeKey(attrs.key)}`);
  } else {
    lines.push('K:C');
  }

  // Body
  const multiVoice = score.parts.length > 1;
  const useInlineVoice = getMisc(score, 'abc-inline-voice') === 'true';
  const voiceIdsStr = getMisc(score, 'abc-voice-ids');
  const voiceIds: string[] = voiceIdsStr ? JSON.parse(voiceIdsStr) : [];

  for (let partIdx = 0; partIdx < score.parts.length; partIdx++) {
    const part = score.parts[partIdx];
    const voiceId = voiceIds[partIdx] || String(partIdx + 1);

    if (multiVoice && !useInlineVoice) {
      lines.push(`V:${voiceId}`);
    }

    const divisions = getPartDivisions(part);
    const bodyResult = serializePartBody(part, divisions, unitNote, opts, useInlineVoice ? voiceId : undefined);

    if (useInlineVoice) {
      lines.push(`[V:${voiceId}] ${bodyResult.music}`);
    } else {
      lines.push(bodyResult.music);
    }

    // Lyrics interleaved - output w: lines after corresponding music lines
    if (opts.includeLyrics && bodyResult.lyricsLines && bodyResult.lyricsLines.length > 0) {
      for (const ll of bodyResult.lyricsLines) {
        lines.push(ll);
      }
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

function serializeTempo(direction: DirectionEntry): string | null {
  for (const dt of direction.directionTypes) {
    if (dt.kind === 'metronome') {
      const beatUnit = dt.beatUnit;
      const perMinute = dt.perMinute;
      if (!perMinute) return null;

      const quarterLen = NOTE_TYPE_TO_QUARTER_LENGTH[beatUnit] ?? 1;
      const den = Math.round(4 / quarterLen);

      return `1/${den}=${perMinute}`;
    }
  }
  return null;
}

function getPartDivisions(part: Part): number {
  for (const measure of part.measures) {
    if (measure.attributes?.divisions) {
      return measure.attributes.divisions;
    }
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
  lyricsLines: string[] | null;
}

function serializePartBody(
  part: Part,
  divisions: number,
  unitNote: UnitNote,
  opts: Required<AbcSerializeOptions>,
  inlineVoiceId?: string,
): PartBodyResult {
  const musicParts: string[] = [];
  const allLyricsLines: string[] = [];

  for (let mi = 0; mi < part.measures.length; mi++) {
    const measure = part.measures[mi];
    const measDivisions = measure.attributes?.divisions ?? divisions;

    // Check for key change in attributes entries
    for (const entry of measure.entries) {
      if (entry.type === 'attributes' && entry.attributes?.key && mi > 0) {
        // Inline key change
        musicParts.push('\nK:' + serializeKey(entry.attributes.key) + '\n');
      }
    }

    // Check for left barline (repeats, etc.)
    const leftBarline = measure.barlines?.find(b => b.location === 'left');
    if (leftBarline) {
      const barStr = serializeBarline(leftBarline);
      musicParts.push(barStr);
    }

    // Serialize entries
    const { noteStr, lyrics } = serializeMeasureEntries(
      measure, measDivisions, unitNote, opts,
    );
    musicParts.push(noteStr);

    // Collect lyrics for this measure
    if (lyrics.length > 0 && opts.includeLyrics) {
      // We'll build w: lines after processing the music
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

  // Build lyrics lines
  if (opts.includeLyrics) {
    // Collect all lyrics across all measures
    const allLyrics: string[][] = [];
    for (let mi = 0; mi < part.measures.length; mi++) {
      const measure = part.measures[mi];
      const measLyrics: string[] = [];
      for (const entry of measure.entries) {
        if (entry.type === 'note' && !entry.rest && !entry.grace && !entry.chord) {
          if (entry.lyrics && entry.lyrics.length > 0) {
            const lyric = entry.lyrics[0];
            if (lyric.text) {
              const syllabic = lyric.syllabic || 'single';
              const suffix = syllabic === 'begin' || syllabic === 'middle' ? '-' : '';
              measLyrics.push(lyric.text + suffix);
            }
          }
        }
      }
      allLyrics.push(measLyrics);
    }

    // Group lyrics into lines based on music line breaks
    const hasAnyLyrics = allLyrics.some(ml => ml.length > 0);
    if (hasAnyLyrics) {
      const syllables = allLyrics.flat();
      if (syllables.length > 0) {
        allLyricsLines.push('w:' + syllables.join(' '));
      }
    }
  }

  return { music: musicParts.join(''), lyricsLines: allLyricsLines.length > 0 ? allLyricsLines : null };
}

function serializeMeasureEntries(
  measure: Measure,
  divisions: number,
  unitNote: UnitNote,
  opts: Required<AbcSerializeOptions>,
): { noteStr: string; lyrics: string[] } {
  const parts: string[] = [];
  const lyrics: string[] = [];
  let chordPitches: string[] = [];
  let chordDurationStr = '';
  let chordTieStr = '';
  let chordSlurStart = '';
  let chordSlurEnd = '';
  let inChord = false;
  let inGraceGroup = false;

  // Track tuplet state for serialization
  let tupletRemaining = 0;
  let tupletP = 0;

  for (let ei = 0; ei < measure.entries.length; ei++) {
    const entry = measure.entries[ei];

    switch (entry.type) {
      case 'note': {
        const note = entry;

        // Space before note
        if ((note as any).abcSpaceBefore) {
          parts.push(' ');
        }

        // Handle grace notes - group consecutive grace notes into {...}
        if (note.grace) {
          if (!inGraceGroup) {
            parts.push('{');
            inGraceGroup = true;
          }
          if (note.pitch) {
            parts.push(serializePitch(note.pitch, note));
          }
          // Check if next entry is also a grace note
          const nextEntry = ei + 1 < measure.entries.length ? measure.entries[ei + 1] : null;
          if (!nextEntry || nextEntry.type !== 'note' || !nextEntry.grace) {
            parts.push('}');
            inGraceGroup = false;
          }
          break;
        }

        // Handle tuplet prefix
        if (note.timeModification && tupletRemaining <= 0) {
          tupletP = note.timeModification.actualNotes;
          const tupletQ = note.timeModification.normalNotes;
          tupletRemaining = tupletP;
          parts.push(`(${tupletP}`);
        }

        const serialized = serializeNoteForAbc(note, divisions, unitNote);

        if (note.chord) {
          if (!inChord) {
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
          inChord = true;
          chordPitches = [serialized.pitch];
          chordDurationStr = serialized.duration;
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
          parts.push(chordSlurStart);
          break;
        }

        parts.push(serialized.full);

        // Update tuplet tracking
        if (tupletRemaining > 0) {
          tupletRemaining--;
        }

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
        break;
      }

      case 'backup':
        parts.push(' & ');
        break;

      case 'forward':
        break;

      case 'attributes':
        // Key changes are handled at the measure level
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

function serializeNoteForAbc(
  note: NoteEntry,
  divisions: number,
  unitNote: UnitNote,
): SerializedNote {
  let pitchStr = '';
  let durationStr = '';

  if (note.rest) {
    if (note.rest.measure) {
      pitchStr = 'Z';
      durationStr = '';
    } else {
      // Use 'x' for invisible rests
      pitchStr = note.printObject === false ? 'x' : 'z';
      // For tuplet notes, undo the tuplet modification to get the "written" duration
      let effectiveDuration = note.duration;
      if (note.timeModification) {
        effectiveDuration = Math.round(effectiveDuration * note.timeModification.actualNotes / note.timeModification.normalNotes);
      }
      const { num, den } = durationToAbcFraction(effectiveDuration, divisions, unitNote);
      durationStr = formatAbcDuration(num, den);
    }
  } else if (note.pitch) {
    pitchStr = serializePitch(note.pitch, note);
    // For tuplet notes, undo the tuplet modification to get the "written" duration
    let effectiveDuration = note.duration;
    if (note.timeModification) {
      effectiveDuration = Math.round(effectiveDuration * note.timeModification.actualNotes / note.timeModification.normalNotes);
    }
    const { num, den } = durationToAbcFraction(effectiveDuration, divisions, unitNote);
    durationStr = formatAbcDuration(num, den);
  }

  // Tie
  let tieStr = '';
  if (note.tie?.type === 'start' || note.ties?.some(t => t.type === 'start')) {
    tieStr = '-';
  }

  // Slur handling
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

  // Check for forward-bar special type (|>|)
  if ((barline as any).abcBarType === 'forward-bar') {
    return '|>|';
  }

  let result = '';

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

  if (hasEnding && hasEnding.type === 'start') {
    result += `[${hasEnding.number} `;
  }

  return result;
}
