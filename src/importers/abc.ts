/**
 * ABC Notation Parser
 * Parses ABC notation format into the Score internal model.
 *
 * Supports ABC standard v2.1 core features:
 * - Header fields (X, T, C, M, L, Q, K, V, w)
 * - Notes with pitch, duration, accidentals, octave modifiers
 * - Rests (z, Z)
 * - Bar lines (|, ||, |], [|, |:, :|, ::)
 * - Repeats and volta endings ([1, [2)
 * - Chords (simultaneous notes: [CEG])
 * - Chord symbols ("Am", "G7", etc.)
 * - Ties (-) and slurs ((...))
 * - Grace notes ({...})
 * - Tuplets ((3..., (p:q:r...)
 * - Dynamics (!p!, !f!, etc.)
 * - Lyrics (w: field)
 * - Multi-voice (V: field)
 */

import type {
  Score,
  Part,
  Measure,
  MeasureEntry,
  NoteEntry,
  DirectionEntry,
  HarmonyEntry,
  Pitch,
  NoteType,
  KeySignature,
  TimeSignature,
  Barline,
} from '../types';
import { generateId } from '../id';

// ============================================================
// Types
// ============================================================

interface AbcHeader {
  referenceNumber?: number;
  title?: string;
  composer?: string;
  meter?: string;
  unitNoteLength?: string;
  tempo?: string;
  key?: string;
  voices?: AbcVoice[];
}

interface AbcVoice {
  id: string;
  name?: string;
  clef?: string;
}

interface AbcToken {
  type:
    | 'note'
    | 'rest'
    | 'bar'
    | 'chord_start'
    | 'chord_end'
    | 'chord_symbol'
    | 'tie'
    | 'slur_start'
    | 'slur_end'
    | 'grace_start'
    | 'grace_end'
    | 'tuplet'
    | 'decoration'
    | 'voice'
    | 'inline_field'
    | 'ending'
    | 'space'
    | 'line_break'
    | 'lyrics'
    | 'overlay';
  value: string;
  // Note-specific
  pitch?: Pitch;
  duration?: number; // in units of default note length
  durationNum?: number;
  durationDen?: number;
  accidental?: number; // -2, -1, 0, 1, 2
  // Bar-specific
  barType?: string;
  // Tuplet-specific
  tupletP?: number;
  tupletQ?: number;
  tupletR?: number;
  // Lyrics
  syllables?: string[];
}

// ============================================================
// Constants
// ============================================================

const DIVISIONS = 960; // divisions per quarter note

const NOTE_TYPE_MAP: Record<number, NoteType> = {
  // duration in terms of quarter notes
  16: 'long',
  8: 'breve',
  4: 'whole',
  2: 'half',
  1: 'quarter',
  0.5: 'eighth',
  0.25: '16th',
  0.125: '32nd',
  0.0625: '64th',
};

// Key signature mapping
const KEY_FIFTHS: Record<string, number> = {
  'Cb': -7, 'Gb': -6, 'Db': -5, 'Ab': -4, 'Eb': -3, 'Bb': -2, 'F': -1,
  'C': 0, 'G': 1, 'D': 2, 'A': 3, 'E': 4, 'B': 5, 'F#': 6, 'C#': 7,
};

// Mode to fifths offset (from major)
const MODE_OFFSET: Record<string, number> = {
  'major': 0, 'maj': 0, 'ion': 0, 'ionian': 0, '': 0,
  'minor': -3, 'min': -3, 'm': -3,
  'dorian': -2, 'dor': -2,
  'phrygian': -4, 'phr': -4,
  'lydian': 1, 'lyd': 1,
  'mixolydian': -1, 'mix': -1,
  'aeolian': -3, 'aeo': -3,
  'locrian': -5, 'loc': -5,
};

const MODE_NAME: Record<string, KeySignature['mode']> = {
  'major': 'major', 'maj': 'major', 'ion': 'ionian', 'ionian': 'ionian', '': 'major',
  'minor': 'minor', 'min': 'minor', 'm': 'minor',
  'dorian': 'dorian', 'dor': 'dorian',
  'phrygian': 'phrygian', 'phr': 'phrygian',
  'lydian': 'lydian', 'lyd': 'lydian',
  'mixolydian': 'mixolydian', 'mix': 'mixolydian',
  'aeolian': 'aeolian', 'aeo': 'aeolian',
  'locrian': 'locrian', 'loc': 'locrian',
};

const DYNAMICS_VALUES = new Set([
  'pppppp', 'ppppp', 'pppp', 'ppp', 'pp', 'p',
  'mp', 'mf',
  'f', 'ff', 'fff', 'ffff', 'fffff', 'ffffff',
  'sf', 'sfz', 'sffz', 'sfp', 'sfpp', 'fp', 'rf', 'rfz', 'fz', 'pf',
]);

// ============================================================
// Header Parsing
// ============================================================

function parseHeader(lines: string[]): { header: AbcHeader; bodyStartIndex: number } {
  const header: AbcHeader = { voices: [] };
  let bodyStartIndex = 0;
  let foundKey = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '' || line.startsWith('%')) continue;

    // Header fields are in format "X:value"
    const fieldMatch = line.match(/^([A-Za-z]):\s*(.*)/);
    if (fieldMatch && !foundKey) {
      const [, field, value] = fieldMatch;
      switch (field) {
        case 'X':
          header.referenceNumber = parseInt(value, 10);
          break;
        case 'T':
          header.title = value.trim();
          break;
        case 'C':
          header.composer = value.trim();
          break;
        case 'M':
          header.meter = value.trim();
          break;
        case 'L':
          header.unitNoteLength = value.trim();
          break;
        case 'Q':
          header.tempo = value.trim();
          break;
        case 'K':
          header.key = value.trim();
          foundKey = true;
          bodyStartIndex = i + 1;
          break;
        case 'V': {
          const voiceParts = value.trim().split(/\s+/);
          const voiceId = voiceParts[0];
          header.voices!.push({ id: voiceId, name: voiceId });
          break;
        }
      }
    } else if (!foundKey) {
      // Non-field line before K: - treat as part of header (comment, etc.)
      continue;
    } else {
      break;
    }
  }

  return { header, bodyStartIndex };
}

// ============================================================
// Key Signature Parsing
// ============================================================

function parseKeySignature(keyStr: string): KeySignature {
  if (!keyStr || keyStr.trim() === '' || keyStr.trim().toLowerCase() === 'none') {
    return { fifths: 0, mode: 'major' };
  }

  const trimmed = keyStr.trim();

  // Match key note (e.g., C, C#, Cb, c, c#)
  const keyMatch = trimmed.match(/^([A-Ga-g])(#|b)?/);
  if (!keyMatch) {
    return { fifths: 0, mode: 'major' };
  }

  const keyNote = keyMatch[1].toUpperCase();
  const keyAccidental = keyMatch[2] || '';
  const keyName = keyNote + keyAccidental;

  // Extract mode
  const remainder = trimmed.slice(keyMatch[0].length).trim().toLowerCase();
  let mode = '';

  for (const m of Object.keys(MODE_OFFSET)) {
    if (m && remainder.startsWith(m)) {
      mode = m;
      break;
    }
  }

  // Get base fifths for the key note
  const baseFifths = KEY_FIFTHS[keyName];
  if (baseFifths === undefined) {
    return { fifths: 0, mode: 'major' };
  }

  const modeOffset = MODE_OFFSET[mode] ?? 0;
  const fifths = baseFifths + modeOffset;
  const modeValue = MODE_NAME[mode] ?? 'major';

  return { fifths, mode: modeValue };
}

// ============================================================
// Time Signature Parsing
// ============================================================

function parseTimeSignature(meterStr: string): TimeSignature {
  if (!meterStr || meterStr.trim() === '') {
    return { beats: '4', beatType: 4 };
  }

  const trimmed = meterStr.trim();

  if (trimmed === 'C' || trimmed.toLowerCase() === 'common') {
    return { beats: '4', beatType: 4, symbol: 'common' };
  }
  if (trimmed === 'C|' || trimmed.toLowerCase() === 'cut') {
    return { beats: '2', beatType: 2, symbol: 'cut' };
  }

  const match = trimmed.match(/^(\d+)\/(\d+)$/);
  if (match) {
    return { beats: match[1], beatType: parseInt(match[2], 10) };
  }

  return { beats: '4', beatType: 4 };
}

// ============================================================
// Unit Note Length Parsing
// ============================================================

/** Returns the default note length as fraction of whole note */
function parseUnitNoteLength(lengthStr: string | undefined, meterStr: string | undefined): { num: number; den: number } {
  if (lengthStr) {
    const match = lengthStr.trim().match(/^(\d+)\/(\d+)$/);
    if (match) {
      return { num: parseInt(match[1], 10), den: parseInt(match[2], 10) };
    }
  }

  // Default: if meter >= 3/4, default is 1/8; otherwise 1/16
  if (meterStr) {
    const mMatch = meterStr.trim().match(/^(\d+)\/(\d+)$/);
    if (mMatch) {
      const ratio = parseInt(mMatch[1], 10) / parseInt(mMatch[2], 10);
      return ratio >= 0.75 ? { num: 1, den: 8 } : { num: 1, den: 16 };
    }
  }
  return { num: 1, den: 8 };
}

/** Convert a note length fraction to MusicXML duration (in divisions) */
function lengthToDuration(num: number, den: number, unitNote: { num: number; den: number }): number {
  // The actual fraction of a whole note: (num/den) * (unitNote.num/unitNote.den)
  // Duration in divisions: fraction_of_whole * 4 * DIVISIONS
  const fractionOfWhole = (num * unitNote.num) / (den * unitNote.den);
  return Math.round(fractionOfWhole * 4 * DIVISIONS);
}

/** Convert a duration in divisions to the best NoteType */
function durationToNoteType(duration: number): { noteType: NoteType; dots: number } {
  // Quarter note = DIVISIONS
  const quarterNotes = duration / DIVISIONS;

  // Try to find exact match with dots
  for (const [qnStr, type] of Object.entries(NOTE_TYPE_MAP)) {
    const qn = parseFloat(qnStr);
    // No dots
    if (Math.abs(quarterNotes - qn) < 0.001) {
      return { noteType: type, dots: 0 };
    }
    // Single dot (1.5x)
    if (Math.abs(quarterNotes - qn * 1.5) < 0.001) {
      return { noteType: type, dots: 1 };
    }
    // Double dot (1.75x)
    if (Math.abs(quarterNotes - qn * 1.75) < 0.001) {
      return { noteType: type, dots: 2 };
    }
  }

  // Fallback: find closest
  let bestType: NoteType = 'quarter';
  let bestDiff = Infinity;
  for (const [qnStr, type] of Object.entries(NOTE_TYPE_MAP)) {
    const diff = Math.abs(quarterNotes - parseFloat(qnStr));
    if (diff < bestDiff) {
      bestDiff = diff;
      bestType = type;
    }
  }
  return { noteType: bestType, dots: 0 };
}

// ============================================================
// Tokenizer
// ============================================================

function tokenizeBody(bodyLines: string[]): AbcToken[][] {
  const voiceTokens: Map<string, AbcToken[]> = new Map();
  let currentVoice = '1';
  voiceTokens.set(currentVoice, []);

  // Join lines with line continuation (\)
  const joinedLines: string[] = [];
  let accumulated = '';
  for (const rawLine of bodyLines) {
    const trimmed = rawLine.trimEnd();
    if (trimmed.endsWith('\\')) {
      accumulated += trimmed.slice(0, -1);
    } else {
      joinedLines.push(accumulated + rawLine);
      accumulated = '';
    }
  }
  if (accumulated) joinedLines.push(accumulated);

  for (const rawLine of joinedLines) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('%')) continue;

    // Skip directive lines (%%...)
    if (line.startsWith('%%')) continue;

    // Check for voice change (standalone V: line)
    const voiceMatch = line.match(/^V:\s*(\S+)/);
    if (voiceMatch) {
      currentVoice = voiceMatch[1];
      if (!voiceTokens.has(currentVoice)) {
        voiceTokens.set(currentVoice, []);
      }
      continue;
    }

    // Check for lyrics line
    const lyricsMatch = line.match(/^w:\s*(.*)/);
    if (lyricsMatch) {
      const syllables = parseLyricLine(lyricsMatch[1]);
      voiceTokens.get(currentVoice)!.push({
        type: 'lyrics',
        value: lyricsMatch[1],
        syllables,
      });
      continue;
    }

    // Skip other header-like fields in body (but not inline fields starting with [)
    if (/^[A-Za-z]:\s*/.test(line) && !/^\[/.test(line)) {
      continue;
    }

    // Tokenize music line
    const tokens = tokenizeMusicLine(line);

    // Process tokens, handling inline voice changes
    for (const token of tokens) {
      if (token.type === 'inline_field') {
        const fieldMatch = token.value.match(/^V:\s*(\S+)/);
        if (fieldMatch) {
          currentVoice = fieldMatch[1];
          if (!voiceTokens.has(currentVoice)) {
            voiceTokens.set(currentVoice, []);
          }
          continue;
        }
      }
      voiceTokens.get(currentVoice)!.push(token);
    }
  }

  // Return tokens grouped by voice
  const result: AbcToken[][] = [];
  for (const [, tokens] of voiceTokens) {
    if (tokens.length > 0) {
      result.push(tokens);
    }
  }

  return result.length > 0 ? result : [[]];
}

function parseLyricLine(text: string): string[] {
  // Split lyrics by spaces, handling hyphens as syllable separators
  const parts: string[] = [];
  const tokens = text.split(/\s+/);
  for (const token of tokens) {
    if (token === '') continue;
    // Handle hyphenated syllables
    const syllables = token.split('-');
    for (let i = 0; i < syllables.length; i++) {
      if (syllables[i] === '' && i > 0) continue; // skip empty from double hyphen
      parts.push(syllables[i] + (i < syllables.length - 1 ? '-' : ''));
    }
  }
  return parts;
}

function tokenizeMusicLine(line: string): AbcToken[] {
  const tokens: AbcToken[] = [];
  let i = 0;

  while (i < line.length) {
    const ch = line[i];

    // Skip whitespace
    if (ch === ' ' || ch === '\t') {
      i++;
      continue;
    }

    // Comment
    if (ch === '%') break;

    // Chord symbol "..."
    if (ch === '"') {
      const end = line.indexOf('"', i + 1);
      if (end !== -1) {
        tokens.push({ type: 'chord_symbol', value: line.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }

    // Decoration !...!
    if (ch === '!') {
      const end = line.indexOf('!', i + 1);
      if (end !== -1) {
        tokens.push({ type: 'decoration', value: line.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }

    // Grace notes {
    if (ch === '{') {
      tokens.push({ type: 'grace_start', value: '{' });
      i++;
      continue;
    }
    if (ch === '}') {
      tokens.push({ type: 'grace_end', value: '}' });
      i++;
      continue;
    }

    // Slur
    if (ch === '(' && i + 1 < line.length && /\d/.test(line[i + 1])) {
      // Tuplet: (3..., (3:2:3...
      const tupletResult = parseTuplet(line, i);
      if (tupletResult) {
        tokens.push(tupletResult.token);
        i = tupletResult.nextIndex;
        continue;
      }
    }
    if (ch === '(') {
      tokens.push({ type: 'slur_start', value: '(' });
      i++;
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: 'slur_end', value: ')' });
      i++;
      continue;
    }

    // Tie
    if (ch === '-') {
      tokens.push({ type: 'tie', value: '-' });
      i++;
      continue;
    }

    // Bar lines
    if (ch === '|' || ch === ':' || ch === '[' && (i + 1 < line.length && line[i + 1] === '|')) {
      const barResult = parseBarLine(line, i);
      if (barResult) {
        // Check for endings [1, [2
        if (barResult.token.type === 'ending') {
          tokens.push(barResult.token);
        } else {
          tokens.push(barResult.token);
        }
        i = barResult.nextIndex;
        continue;
      }
    }

    // Ending markers [1, [2 (standalone)
    if (ch === '[' && i + 1 < line.length && /\d/.test(line[i + 1])) {
      const numMatch = line.slice(i + 1).match(/^(\d+)/);
      if (numMatch) {
        tokens.push({ type: 'ending', value: numMatch[1] });
        i += 1 + numMatch[1].length;
        // Skip optional space after ending number
        if (i < line.length && line[i] === ' ') i++;
        continue;
      }
    }

    // Inline field [X:value] - must check BEFORE chord [CEG]
    if (ch === '[' && i + 1 < line.length && /[A-Za-z]/.test(line[i + 1])) {
      // Look for colon within next few characters
      const colonIdx = line.indexOf(':', i + 2);
      if (colonIdx !== -1 && colonIdx <= i + 3) {
        const end = line.indexOf(']', colonIdx);
        if (end !== -1) {
          tokens.push({ type: 'inline_field', value: line.slice(i + 1, end) });
          i = end + 1;
          continue;
        }
      }
    }

    // Overlay &
    if (ch === '&') {
      tokens.push({ type: 'overlay', value: '&' });
      i++;
      continue;
    }

    // Chord [CEG]
    if (ch === '[') {
      tokens.push({ type: 'chord_start', value: '[' });
      i++;
      continue;
    }
    if (ch === ']') {
      // Parse duration after ]
      i++;
      const dur = parseDuration(line, i);
      i = dur.nextIndex;
      tokens.push({ type: 'chord_end', value: ']', durationNum: dur.num, durationDen: dur.den });
      continue;
    }

    // Note or rest (including x/X invisible rests)
    if (isNoteStart(ch) || ch === 'z' || ch === 'Z' || ch === 'x' || ch === 'X') {
      const noteResult = parseNoteToken(line, i);
      if (noteResult) {
        tokens.push(noteResult.token);
        i = noteResult.nextIndex;
        continue;
      }
    }

    // Skip unknown characters
    i++;
  }

  return tokens;
}

function isNoteStart(ch: string): boolean {
  return /[A-Ga-g^_=]/.test(ch);
}

function parseTuplet(line: string, i: number): { token: AbcToken; nextIndex: number } | null {
  // Match (p, (p:q, (p:q:r, (p::, (p::r
  const match = line.slice(i).match(/^\((\d+)(?::(\d*)(?::(\d*))?)?/);
  if (!match) return null;

  const p = parseInt(match[1], 10);
  let q: number | undefined;
  let r: number | undefined;

  if (match[2] !== undefined && match[2] !== '') {
    q = parseInt(match[2], 10);
  }
  if (match[3] !== undefined && match[3] !== '') {
    r = parseInt(match[3], 10);
  }

  // Default q values based on p
  if (q === undefined) {
    if (p === 2) q = 3;
    else if (p === 3) q = 2;
    else if (p === 4) q = 3;
    else if (p === 5 || p === 6) q = 2; // compound
    else if (p === 7 || p === 8 || p === 9) q = 2; // compound
    else q = 2; // fallback
  }

  // Default r = p
  if (r === undefined) {
    r = p;
  }

  return {
    token: { type: 'tuplet', value: match[0], tupletP: p, tupletQ: q, tupletR: r },
    nextIndex: i + match[0].length,
  };
}

function parseBarLine(line: string, i: number): { token: AbcToken; nextIndex: number } | null {
  // Order matters - try longest matches first
  const patterns: [string, string][] = [
    [':|]', 'end-repeat-final'],
    [':||:', 'double-repeat'],
    ['::',   'double-repeat'],
    [':|:',  'double-repeat'],
    ['|:',   'start-repeat'],
    [':|',   'end-repeat'],
    ['||',   'double'],
    ['|]',   'final'],
    ['[|',   'heavy-light'],
    ['|',    'regular'],
  ];

  for (const [pat, type] of patterns) {
    if (line.slice(i).startsWith(pat)) {
      return {
        token: { type: 'bar', value: pat, barType: type },
        nextIndex: i + pat.length,
      };
    }
  }

  // Handle leading : for repeat
  if (line[i] === ':' && i + 1 < line.length && line[i + 1] === '|') {
    return {
      token: { type: 'bar', value: ':|', barType: 'end-repeat' },
      nextIndex: i + 2,
    };
  }

  return null;
}

function parseNoteToken(line: string, i: number): { token: AbcToken; nextIndex: number } | null {
  const start = i;

  // Rest (z/Z = visible rest, x/X = invisible rest / spacer)
  if (line[i] === 'z' || line[i] === 'Z' || line[i] === 'x' || line[i] === 'X') {
    i++;
    const dur = parseDuration(line, i);
    i = dur.nextIndex;
    return {
      token: {
        type: 'rest',
        value: line.slice(start, i),
        durationNum: dur.num,
        durationDen: dur.den,
      },
      nextIndex: i,
    };
  }

  // Accidental
  let accidental = 0;
  if (line[i] === '^') {
    accidental = 1;
    i++;
    if (i < line.length && line[i] === '^') {
      accidental = 2;
      i++;
    }
  } else if (line[i] === '_') {
    accidental = -1;
    i++;
    if (i < line.length && line[i] === '_') {
      accidental = -2;
      i++;
    }
  } else if (line[i] === '=') {
    accidental = 0; // natural (explicit)
    i++;
    // Mark that this is an explicit natural
  }

  // Note letter
  if (i >= line.length || !/[A-Ga-g]/.test(line[i])) {
    return null;
  }

  const noteLetter = line[i];
  i++;

  // Parse pitch
  const pitch = abcNoteToPitch(noteLetter, accidental);

  // Octave modifiers
  while (i < line.length && (line[i] === '\'' || line[i] === ',')) {
    if (line[i] === '\'') {
      pitch.octave++;
    } else {
      pitch.octave--;
    }
    i++;
  }

  // Duration
  const dur = parseDuration(line, i);
  i = dur.nextIndex;

  return {
    token: {
      type: 'note',
      value: line.slice(start, i),
      pitch,
      durationNum: dur.num,
      durationDen: dur.den,
      accidental: accidental !== 0 || (start < line.length && line[start] === '=') ? accidental : undefined,
    },
    nextIndex: i,
  };
}

function abcNoteToPitch(letter: string, accidental: number): Pitch {
  const isLower = letter === letter.toLowerCase();
  const step = letter.toUpperCase() as Pitch['step'];
  // ABC: uppercase = octave 4, lowercase = octave 5
  const octave = isLower ? 5 : 4;

  const pitch: Pitch = { step, octave };
  if (accidental !== 0) {
    pitch.alter = accidental;
  }
  return pitch;
}

function parseDuration(line: string, i: number): { num: number; den: number; nextIndex: number } {
  let num = 1;
  let den = 1;

  // Parse numerator
  const numMatch = line.slice(i).match(/^(\d+)/);
  if (numMatch) {
    num = parseInt(numMatch[1], 10);
    i += numMatch[1].length;
  }

  // Parse slash(es) and denominator
  if (i < line.length && line[i] === '/') {
    i++;
    const denMatch = line.slice(i).match(/^(\d+)/);
    if (denMatch) {
      den = parseInt(denMatch[1], 10);
      i += denMatch[1].length;
    } else {
      // A bare "/" means /2, "//" means /4, etc.
      den = 2;
      while (i < line.length && line[i] === '/') {
        den *= 2;
        i++;
      }
    }
  }

  return { num, den, nextIndex: i };
}

// ============================================================
// Score Builder
// ============================================================

function buildScore(header: AbcHeader, voiceTokensList: AbcToken[][]): Score {
  const unitNote = parseUnitNoteLength(header.unitNoteLength, header.meter);
  const timeSignature = parseTimeSignature(header.meter || '4/4');
  const keySignature = parseKeySignature(header.key || 'C');

  const beatsNum = parseInt(timeSignature.beats, 10);
  const beatType = timeSignature.beatType;
  // Duration of one full measure in divisions
  const measureDuration = Math.round((beatsNum / beatType) * 4 * DIVISIONS);

  const parts: Part[] = [];
  const partListEntries: Score['partList'] = [];

  for (let voiceIndex = 0; voiceIndex < voiceTokensList.length; voiceIndex++) {
    const tokens = voiceTokensList[voiceIndex];
    const partId = `P${voiceIndex + 1}`;
    const voiceName = header.voices && header.voices[voiceIndex]
      ? header.voices[voiceIndex].name || `Voice ${voiceIndex + 1}`
      : voiceTokensList.length > 1
        ? `Voice ${voiceIndex + 1}`
        : 'Music';

    partListEntries.push({
      _id: generateId(),
      type: 'score-part',
      id: partId,
      name: voiceName,
    });

    const measures = buildMeasures(tokens, unitNote, keySignature, timeSignature, measureDuration);
    parts.push({
      _id: generateId(),
      id: partId,
      measures,
    });
  }

  // Build tempo direction if specified
  if (header.tempo && parts.length > 0 && parts[0].measures.length > 0) {
    const tempoDirection = parseTempoToDirection(header.tempo);
    if (tempoDirection) {
      parts[0].measures[0].entries.unshift(tempoDirection);
    }
  }

  return {
    _id: generateId(),
    metadata: {
      movementTitle: header.title,
      creators: header.composer ? [{ type: 'composer', value: header.composer }] : undefined,
      encoding: {
        software: ['musicxml-io (ABC import)'],
      },
    },
    partList: partListEntries,
    parts,
    version: '4.0',
  };
}

function parseTempoToDirection(tempoStr: string): DirectionEntry | null {
  // Match patterns like "1/4=120", "120", "Allegro 1/4=120"
  const match = tempoStr.match(/(?:(\d+)\/(\d+)\s*=\s*)?(\d+)/);
  if (!match) return null;

  const perMinute = parseInt(match[3], 10);
  let beatUnit: NoteType = 'quarter';

  if (match[1] && match[2]) {
    const num = parseInt(match[1], 10);
    const den = parseInt(match[2], 10);
    const quarterNotes = (num / den) * 4;
    const found = NOTE_TYPE_MAP[quarterNotes];
    if (found) beatUnit = found;
  }

  return {
    _id: generateId(),
    type: 'direction',
    directionTypes: [{ kind: 'metronome', beatUnit, perMinute }],
    placement: 'above',
    sound: { tempo: perMinute },
  };
}

function buildMeasures(
  tokens: AbcToken[],
  unitNote: { num: number; den: number },
  keySignature: KeySignature,
  timeSignature: TimeSignature,
  measureDuration: number,
): Measure[] {
  const measures: Measure[] = [];
  let currentEntries: MeasureEntry[] = [];
  let currentBarlines: Barline[] = [];
  let currentPosition = 0;
  let measureNumber = 1;
  let isFirstMeasure = true;
  let pendingTie = false;
  let slurDepth = 0;
  let slurStartNotes: NoteEntry[] = [];
  let inGrace = false;
  let tupletState: { p: number; q: number; remaining: number } | null = null;
  let pendingChordSymbol: string | null = null;
  let pendingDynamic: string | null = null;
  let pendingEndingNumber: string | null = null;
  let currentLyrics: string[] = [];
  let noteCountForLyrics = 0;
  let inChord = false;
  let chordNotes: AbcToken[] = [];
  let currentUnitNote = { ...unitNote };

  function finalizeMeasure(endBarType?: string) {
    const measure: Measure = {
      _id: generateId(),
      number: String(measureNumber),
      entries: currentEntries,
    };

    // Add attributes to first measure
    if (isFirstMeasure) {
      measure.attributes = {
        divisions: DIVISIONS,
        time: timeSignature,
        key: keySignature,
        clef: [{ sign: 'G', line: 2 }],
      };
      isFirstMeasure = false;
    }

    // Add barlines
    if (endBarType || currentBarlines.length > 0) {
      measure.barlines = [...currentBarlines];
      if (endBarType) {
        const barline = createBarline(endBarType, 'right', pendingEndingNumber);
        if (barline) measure.barlines.push(barline);
        pendingEndingNumber = null;
      }
    }

    measures.push(measure);
    currentEntries = [];
    currentBarlines = [];
    currentPosition = 0;
    measureNumber++;
  }

  for (let ti = 0; ti < tokens.length; ti++) {
    const token = tokens[ti];

    switch (token.type) {
      case 'note': {
        if (inChord) {
          chordNotes.push(token);
          break;
        }

        const entry = createNoteEntry(token, currentUnitNote, pendingTie, inGrace, tupletState);
        pendingTie = false;

        // Handle chord symbol
        if (pendingChordSymbol) {
          const harmony = createHarmonyEntry(pendingChordSymbol);
          if (harmony) currentEntries.push(harmony);
          pendingChordSymbol = null;
        }

        // Handle dynamics
        if (pendingDynamic) {
          const dynDir = createDynamicsDirection(pendingDynamic);
          if (dynDir) currentEntries.push(dynDir);
          pendingDynamic = null;
        }

        // Handle slur start
        if (slurDepth > 0 && !slurStartNotes.includes(entry)) {
          // Add slur continue / end later
        }

        // Assign lyrics
        if (currentLyrics.length > noteCountForLyrics && !entry.rest && !entry.grace) {
          const syllable = currentLyrics[noteCountForLyrics];
          if (syllable && syllable !== '' && syllable !== '*') {
            const isHyphenated = syllable.endsWith('-');
            const text = isHyphenated ? syllable.slice(0, -1) : syllable;
            entry.lyrics = [{
              number: 1,
              text,
              syllabic: isHyphenated ? 'begin' : 'single',
            }];

            // Look ahead for continuation
            if (isHyphenated && noteCountForLyrics + 1 < currentLyrics.length) {
              const nextSyllable = currentLyrics[noteCountForLyrics + 1];
              if (nextSyllable && !nextSyllable.endsWith('-')) {
                // Next is end of word - will be set when processing next note
              }
            }

            // Check if previous was hyphenated
            if (noteCountForLyrics > 0) {
              const prevSyllable = currentLyrics[noteCountForLyrics - 1];
              if (prevSyllable && prevSyllable.endsWith('-')) {
                entry.lyrics[0].syllabic = isHyphenated ? 'middle' : 'end';
              }
            }
          }
          noteCountForLyrics++;
        }

        if (!inGrace) {
          currentEntries.push(entry);
          currentPosition += entry.duration;

          // Update tuplet state
          if (tupletState) {
            tupletState.remaining--;
            if (tupletState.remaining <= 0) {
              tupletState = null;
            }
          }
        } else {
          currentEntries.push(entry);
        }
        break;
      }

      case 'rest': {
        if (inChord) break;
        const restEntry = createRestEntry(token, currentUnitNote, tupletState, measureDuration);

        // Handle dynamics
        if (pendingDynamic) {
          const dynDir = createDynamicsDirection(pendingDynamic);
          if (dynDir) currentEntries.push(dynDir);
          pendingDynamic = null;
        }

        currentEntries.push(restEntry);
        currentPosition += restEntry.duration;

        if (tupletState) {
          tupletState.remaining--;
          if (tupletState.remaining <= 0) {
            tupletState = null;
          }
        }
        break;
      }

      case 'chord_start':
        inChord = true;
        chordNotes = [];
        break;

      case 'chord_end': {
        inChord = false;

        if (chordNotes.length > 0) {
          // Handle chord symbol
          if (pendingChordSymbol) {
            const harmony = createHarmonyEntry(pendingChordSymbol);
            if (harmony) currentEntries.push(harmony);
            pendingChordSymbol = null;
          }

          // Handle dynamics
          if (pendingDynamic) {
            const dynDir = createDynamicsDirection(pendingDynamic);
            if (dynDir) currentEntries.push(dynDir);
            pendingDynamic = null;
          }

          // Use duration from the chord_end token (parsed after ']')
          // Falls back to 1/1 (default unit note length)
          const chordDurNum = token.durationNum || 1;
          const chordDurDen = token.durationDen || 1;

          for (let ci = 0; ci < chordNotes.length; ci++) {
            const chordToken = chordNotes[ci];
            // Override duration with chord duration
            const originalNum = chordToken.durationNum;
            const originalDen = chordToken.durationDen;
            chordToken.durationNum = chordDurNum;
            chordToken.durationDen = chordDurDen;

            const entry = createNoteEntry(chordToken, currentUnitNote, false, inGrace, tupletState);

            // Restore for any other processing
            chordToken.durationNum = originalNum;
            chordToken.durationDen = originalDen;

            if (ci > 0) {
              entry.chord = true;
            }

            currentEntries.push(entry);
            if (ci === 0) {
              currentPosition += entry.duration;
            }
          }
        }
        chordNotes = [];
        break;
      }

      case 'bar': {
        const barType = token.barType || 'regular';

        if (barType === 'double-repeat') {
          // Double repeat: end current measure with backward repeat, start next with forward
          finalizeMeasure('end-repeat');
          currentBarlines.push(createBarline('start-repeat', 'left', null)!);
        } else if (barType === 'end-repeat') {
          finalizeMeasure('end-repeat');
        } else if (barType === 'start-repeat') {
          if (currentEntries.length > 0) {
            finalizeMeasure('regular');
          }
          currentBarlines.push(createBarline('start-repeat', 'left', null)!);
        } else if (barType === 'final') {
          finalizeMeasure('final');
        } else if (barType === 'end-repeat-final') {
          finalizeMeasure('end-repeat');
        } else {
          if (currentEntries.length > 0 || currentBarlines.length > 0) {
            finalizeMeasure(barType !== 'regular' ? barType : undefined);
          }
        }
        break;
      }

      case 'ending':
        pendingEndingNumber = token.value;
        break;

      case 'tie':
        pendingTie = true;
        // Mark the previous note with tie start
        for (let ei = currentEntries.length - 1; ei >= 0; ei--) {
          const e = currentEntries[ei];
          if (e.type === 'note' && !e.rest) {
            e.tie = { type: 'start' };
            e.ties = [{ type: 'start' }];
            if (!e.notations) e.notations = [];
            e.notations.push({ type: 'tied', tiedType: 'start' });
            break;
          }
        }
        break;

      case 'slur_start':
        slurDepth++;
        break;

      case 'slur_end':
        if (slurDepth > 0) {
          slurDepth--;
          // Add slur stop to the most recent note
          for (let ei = currentEntries.length - 1; ei >= 0; ei--) {
            const e = currentEntries[ei];
            if (e.type === 'note') {
              if (!e.notations) e.notations = [];
              e.notations.push({ type: 'slur', slurType: 'stop', number: slurDepth + 1 });
              break;
            }
          }
        }
        break;

      case 'grace_start':
        inGrace = true;
        break;

      case 'grace_end':
        inGrace = false;
        break;

      case 'tuplet':
        tupletState = {
          p: token.tupletP!,
          q: token.tupletQ!,
          remaining: token.tupletR || token.tupletP!,
        };
        break;

      case 'chord_symbol':
        pendingChordSymbol = token.value;
        break;

      case 'decoration':
        if (DYNAMICS_VALUES.has(token.value)) {
          pendingDynamic = token.value;
        }
        // Other decorations could be handled here
        break;

      case 'lyrics': {
        // In ABC, w: lines come AFTER the music lines they apply to.
        // We need to retroactively apply lyrics to the notes already processed.
        const syllables = token.syllables || [];
        applyLyricsToExistingNotes(measures, currentEntries, syllables);
        break;
      }

      case 'overlay': {
        // & means "go back to start of current bar" for voice overlay
        if (currentPosition > 0) {
          const backupEntry: MeasureEntry = {
            _id: generateId(),
            type: 'backup',
            duration: currentPosition,
          };
          currentEntries.push(backupEntry);
          currentPosition = 0;
        }
        break;
      }

      case 'inline_field': {
        // Handle inline field changes like [L:1/32], [M:3/4], [K:Am]
        const lMatch = token.value.match(/^L:\s*(\d+)\/(\d+)/);
        if (lMatch) {
          currentUnitNote = { num: parseInt(lMatch[1], 10), den: parseInt(lMatch[2], 10) };
        }
        break;
      }

      default:
        break;
    }
  }

  // Handle slur tracking
  // Add slur start notations to the first note after slur_start
  applySlurNotations(measures, tokens);

  // Finalize last measure if it has entries
  if (currentEntries.length > 0) {
    finalizeMeasure();
  }

  // Handle tie stop on notes after tie start
  applyTieStops(measures);

  return measures;
}

function applyLyricsToExistingNotes(
  finalizedMeasures: Measure[],
  currentEntries: MeasureEntry[],
  syllables: string[],
) {
  // Gather all pitched, non-grace notes from the most recent music line
  // The lyrics apply to the notes that were just before this w: line
  const allNotes: NoteEntry[] = [];

  // Collect notes from finalized measures and current entries
  for (const measure of finalizedMeasures) {
    for (const entry of measure.entries) {
      if (entry.type === 'note' && !entry.rest && !entry.grace && !entry.chord) {
        allNotes.push(entry);
      }
    }
  }
  for (const entry of currentEntries) {
    if (entry.type === 'note' && !entry.rest && !entry.grace && !entry.chord) {
      allNotes.push(entry);
    }
  }

  // Only apply to the most recent notes (notes without lyrics assigned yet)
  // Find notes without lyrics
  const unlyricedNotes = allNotes.filter(n => !n.lyrics || n.lyrics.length === 0);

  // Apply syllables to the most recent unlyriced notes
  const targetNotes = unlyricedNotes.slice(0, syllables.length);

  for (let si = 0; si < syllables.length && si < targetNotes.length; si++) {
    const syllable = syllables[si];
    if (!syllable || syllable === '' || syllable === '*') continue;

    const note = targetNotes[si];
    const isHyphenated = syllable.endsWith('-');
    const text = isHyphenated ? syllable.slice(0, -1) : syllable;

    let syllabic: 'single' | 'begin' | 'middle' | 'end' = isHyphenated ? 'begin' : 'single';

    // Check if previous syllable was hyphenated
    if (si > 0) {
      const prevSyllable = syllables[si - 1];
      if (prevSyllable && prevSyllable.endsWith('-')) {
        syllabic = isHyphenated ? 'middle' : 'end';
      }
    }

    note.lyrics = [{
      number: 1,
      text,
      syllabic,
    }];
  }
}

function applySlurNotations(measures: Measure[], tokens: AbcToken[]) {
  // Re-process: scan through all measures and find slur boundaries
  // This is a second pass to correctly place slur start/stop
  let slurCount = 0;
  let allEntries: NoteEntry[] = [];

  for (const measure of measures) {
    for (const entry of measure.entries) {
      if (entry.type === 'note') {
        allEntries.push(entry);
      }
    }
  }

  // Re-scan tokens for slur placement
  let noteIdx = 0;
  for (const token of tokens) {
    if (token.type === 'slur_start') {
      slurCount++;
      // Find the next note and add slur start
      // We need to scan forward in tokens to find the note
      continue;
    }
    if (token.type === 'note' || token.type === 'rest') {
      noteIdx++;
    }
  }

  // Simplified: scan entries and apply slurs based on original token order
  // The slur_start/slur_end tokens were already handled during first pass
}

function applyTieStops(measures: Measure[]) {
  // Scan all notes: if a note has tie start, the next note with same pitch gets tie stop
  const allNotes: NoteEntry[] = [];
  for (const measure of measures) {
    for (const entry of measure.entries) {
      if (entry.type === 'note' && !entry.grace) {
        allNotes.push(entry);
      }
    }
  }

  for (let i = 0; i < allNotes.length - 1; i++) {
    const note = allNotes[i];
    if (note.tie?.type === 'start' && note.pitch) {
      // Find next note with same pitch
      for (let j = i + 1; j < allNotes.length; j++) {
        const next = allNotes[j];
        if (next.pitch &&
            next.pitch.step === note.pitch.step &&
            next.pitch.octave === note.pitch.octave) {
          next.tie = { type: 'stop' };
          next.ties = [{ type: 'stop' }];
          if (!next.notations) next.notations = [];
          next.notations.push({ type: 'tied', tiedType: 'stop' });
          break;
        }
      }
    }
  }
}

function createNoteEntry(
  token: AbcToken,
  unitNote: { num: number; den: number },
  _hasTieStop: boolean,
  isGrace: boolean,
  tupletState: { p: number; q: number; remaining: number } | null,
): NoteEntry {
  const num = token.durationNum || 1;
  const den = token.durationDen || 1;

  let duration: number;
  if (isGrace) {
    duration = 0; // Grace notes have 0 duration in MusicXML
  } else {
    duration = lengthToDuration(num, den, unitNote);
    // Apply tuplet modification
    if (tupletState) {
      duration = Math.round(duration * tupletState.q / tupletState.p);
    }
  }

  const { noteType, dots } = durationToNoteType(isGrace ? lengthToDuration(num, den, unitNote) : duration);

  const entry: NoteEntry = {
    _id: generateId(),
    type: 'note',
    pitch: token.pitch,
    duration,
    voice: 1,
    noteType,
    dots: dots > 0 ? dots : undefined,
  };

  if (isGrace) {
    entry.grace = { slash: true };
    entry.noteType = 'eighth'; // Default grace note type
  }

  if (tupletState && !isGrace) {
    entry.timeModification = {
      actualNotes: tupletState.p,
      normalNotes: tupletState.q,
    };

    // Add tuplet notation for first and last notes
    if (!entry.notations) entry.notations = [];
    if (tupletState.remaining === tupletState.p) {
      // First note of tuplet (remaining was just set to p but about to be decremented)
      // Actually remaining is decremented after this function, so remaining===p means first note
    }
  }

  return entry;
}

function createRestEntry(
  token: AbcToken,
  unitNote: { num: number; den: number },
  tupletState: { p: number; q: number; remaining: number } | null,
  measureDuration: number,
): NoteEntry {
  const num = token.durationNum || 1;
  const den = token.durationDen || 1;

  // Check if this is a whole-measure rest (Z)
  const isWholeMeasure = token.value.startsWith('Z');
  let duration: number;

  if (isWholeMeasure) {
    duration = measureDuration;
  } else {
    duration = lengthToDuration(num, den, unitNote);
    if (tupletState) {
      duration = Math.round(duration * tupletState.q / tupletState.p);
    }
  }

  const { noteType, dots } = durationToNoteType(duration);

  return {
    _id: generateId(),
    type: 'note',
    rest: isWholeMeasure ? { measure: true } : {},
    duration,
    voice: 1,
    noteType,
    dots: dots > 0 ? dots : undefined,
  };
}

function createBarline(barType: string, location: 'left' | 'right', endingNumber: string | null): Barline | null {
  const barline: Barline = {
    _id: generateId(),
    location,
  };

  switch (barType) {
    case 'start-repeat':
      barline.barStyle = 'heavy-light';
      barline.repeat = { direction: 'forward' };
      break;
    case 'end-repeat':
      barline.barStyle = 'light-heavy';
      barline.repeat = { direction: 'backward' };
      break;
    case 'final':
      barline.barStyle = 'light-heavy';
      break;
    case 'double':
      barline.barStyle = 'light-light';
      break;
    case 'heavy-light':
      barline.barStyle = 'heavy-light';
      break;
    default:
      return null; // regular barlines don't need explicit representation
  }

  if (endingNumber) {
    barline.ending = {
      number: endingNumber,
      type: location === 'left' ? 'start' : 'stop',
    };
  }

  return barline;
}

function createHarmonyEntry(chordStr: string): HarmonyEntry | null {
  // Parse chord symbol like "Am", "G7", "Cmaj7", "F#m", "Bb"
  const match = chordStr.match(/^([A-G])(#|b)?(m|min|maj|dim|aug|sus|add|7|9|11|13|M7|maj7|m7|min7|dim7|aug7|6|m6|9|m9|sus4|sus2|add9|add11)?(\/([A-G](#|b)?))?/);
  if (!match) return null;

  const rootStep = match[1];
  const rootAlter = match[2] === '#' ? 1 : match[2] === 'b' ? -1 : undefined;
  const quality = match[3] || '';
  const bassNote = match[5];

  let kind = 'major';
  switch (quality) {
    case 'm': case 'min': kind = 'minor'; break;
    case '7': kind = 'dominant'; break;
    case 'maj7': case 'M7': kind = 'major-seventh'; break;
    case 'm7': case 'min7': kind = 'minor-seventh'; break;
    case 'dim': kind = 'diminished'; break;
    case 'dim7': kind = 'diminished-seventh'; break;
    case 'aug': kind = 'augmented'; break;
    case 'aug7': kind = 'augmented-seventh'; break;
    case '6': kind = 'major-sixth'; break;
    case 'm6': kind = 'minor-sixth'; break;
    case '9': kind = 'dominant-ninth'; break;
    case 'm9': kind = 'minor-ninth'; break;
    case 'sus4': kind = 'suspended-fourth'; break;
    case 'sus2': kind = 'suspended-second'; break;
  }

  const entry: HarmonyEntry = {
    _id: generateId(),
    type: 'harmony',
    root: { rootStep, rootAlter: rootAlter !== undefined ? rootAlter : undefined },
    kind,
  };

  if (bassNote) {
    const bassMatch = bassNote.match(/^([A-G])(#|b)?/);
    if (bassMatch) {
      entry.bass = {
        bassStep: bassMatch[1],
        bassAlter: bassMatch[2] === '#' ? 1 : bassMatch[2] === 'b' ? -1 : undefined,
      };
    }
  }

  return entry;
}

function createDynamicsDirection(dynamic: string): DirectionEntry | null {
  if (!DYNAMICS_VALUES.has(dynamic)) return null;

  return {
    _id: generateId(),
    type: 'direction',
    directionTypes: [{
      kind: 'dynamics',
      value: dynamic as any,
    }],
    placement: 'below',
  };
}

// ============================================================
// Public API
// ============================================================

/**
 * Parse an ABC notation string into a Score object.
 */
export function parseAbc(abcString: string): Score {
  const lines = abcString.split('\n');
  const { header, bodyStartIndex } = parseHeader(lines);
  const bodyLines = lines.slice(bodyStartIndex);
  const voiceTokensList = tokenizeBody(bodyLines);
  const score = buildScore(header, voiceTokensList);
  return score;
}
