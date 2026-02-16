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
  Clef,
  DynamicsValue,
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
  /** Extra header fields (R:, S:, N:, I:, etc.) preserved for round-trip */
  extraFields?: { field: string; value: string }[];
  /** %% directives preserved for round-trip */
  directives?: string[];
}

interface AbcVoice {
  id: string;
  name?: string;
  clef?: string;
  /** Full original V: definition line text (for round-trip) */
  fullLine?: string;
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
  // Accidental
  explicitNatural?: boolean;
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

function parseHeader(lines: string[]): { header: AbcHeader; bodyStartIndex: number; headerFieldOrder: string[] } {
  const header: AbcHeader = { voices: [], extraFields: [], directives: [] };
  let bodyStartIndex = 0;
  let foundKey = false;
  let postKHeaderDone = false; // true once we've seen non-header content after K:
  const headerFieldOrder: string[] = []; // Track order of all header fields

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '') continue;

    // %% directives
    if (line.startsWith('%%')) {
      if (!foundKey) {
        header.directives!.push(line);
        headerFieldOrder.push(line);
      } else if (!postKHeaderDone) {
        // Post-K: directives are part of the header section
        header.directives!.push(line);
        headerFieldOrder.push(line);
        bodyStartIndex = i + 1;
      }
      // If postKHeaderDone, these are body directives - don't advance bodyStartIndex
      continue;
    }

    // Regular comments (% but not %%)
    if (line.startsWith('%')) {
      if (!foundKey) {
        // Pre-K: comments are part of header
        headerFieldOrder.push(lines[i]);
      } else if (!postKHeaderDone) {
        // Post-K: comments before any music content
        headerFieldOrder.push(lines[i]);
        bodyStartIndex = i + 1;
      }
      // If postKHeaderDone, these are body comments - don't advance bodyStartIndex
      continue;
    }

    // Header fields are in format "X:value"
    const fieldMatch = line.match(/^([A-Za-z]):\s*(.*)/);
    // After K: is found, only accept specific header-like fields (I:, N:)
    // V: lines after K: are handled separately - they go to both header (for voice defs)
    // and remain in the body (for voice switching), so they DON'T go in headerFieldOrder
    const postKFields = new Set(['I', 'N']);
    if (fieldMatch && (!foundKey || fieldMatch[1] === 'V' || (foundKey && postKFields.has(fieldMatch[1])))) {
      const [, field, value] = fieldMatch;
      // If we're after K: and this is a post-K: header field (I:, N:)
      if (foundKey && field !== 'V') {
        if (!postKHeaderDone) {
          // Post-K: fields (I:, N:, etc.) - store as extra fields
          header.extraFields!.push({ field, value: value.trim() });
          headerFieldOrder.push(line);
          bodyStartIndex = i + 1;
        }
        continue;
      }
      switch (field) {
        case 'X':
          header.referenceNumber = parseInt(value, 10);
          headerFieldOrder.push(line);
          break;
        case 'T':
          header.title = value.trim();
          headerFieldOrder.push(line);
          break;
        case 'C':
          header.composer = value.trim();
          headerFieldOrder.push(line);
          break;
        case 'M':
          header.meter = value.trim();
          headerFieldOrder.push(line);
          break;
        case 'L':
          header.unitNoteLength = value.trim();
          headerFieldOrder.push(line);
          break;
        case 'Q':
          header.tempo = value.trim();
          headerFieldOrder.push(line);
          break;
        case 'K':
          header.key = value.trim();
          foundKey = true;
          bodyStartIndex = i + 1;
          headerFieldOrder.push(line);
          break;
        case 'V': {
          const voiceValue = value.trim();
          const voiceId = voiceValue.split(/\s+/)[0];
          const nameMatch = voiceValue.match(/name=["']?([^"'\s]+)["']?/i);
          const nmMatch = voiceValue.match(/nm=["']([^"']*)["']/i);
          const clefMatch = voiceValue.match(/clef=(\S+)/i);
          const displayName = nameMatch ? nameMatch[1] : nmMatch ? nmMatch[1] : voiceId;

          // After K:, determine if this V: line is a header definition or body voice switch
          // V: lines with parameters (clef=, nm=, name=, Program, etc.) are definitions
          // V: lines with just an ID (possibly + comment) are body voice switches
          const hasParams = clefMatch || nameMatch || nmMatch ||
            /\b(Program|merge|up|down|bass|treble|alto|tenor|soprano|octave|snm|stem)\b/i.test(voiceValue);
          const isBodyVoiceSwitch = foundKey && !hasParams;

          if (isBodyVoiceSwitch) {
            // This is a body voice switch, mark post-K: header as done
            postKHeaderDone = true;
          }

          // Update existing or add new voice entry
          const existingVoice = header.voices!.find(v => v.id === voiceId);
          if (existingVoice) {
            if (nameMatch || nmMatch) existingVoice.name = displayName;
            if (clefMatch) existingVoice.clef = clefMatch[1];
            // Keep the most detailed full line (post-K: definitions typically have more detail)
            if (foundKey && !isBodyVoiceSwitch) existingVoice.fullLine = lines[i];
          } else {
            header.voices!.push({
              id: voiceId,
              name: displayName,
              clef: clefMatch ? clefMatch[1] : undefined,
              fullLine: lines[i],
            });
          }
          // Include V: in header order if before K: or in post-K: header section
          if (!foundKey) {
            headerFieldOrder.push(lines[i]);
          } else if (!isBodyVoiceSwitch && !postKHeaderDone) {
            headerFieldOrder.push(lines[i]);
            bodyStartIndex = i + 1;
          }
          break;
        }
        default:
          // Unknown header fields (R:, S:, N:, I:, etc.)
          header.extraFields!.push({ field, value: value.trim() });
          headerFieldOrder.push(line);
          break;
      }
    } else if (!foundKey) {
      // Non-field line before K: - treat as part of header (comment, etc.)
      continue;
    } else {
      // After K: found, non-header line means post-K: header section is done
      postKHeaderDone = true;
      // Stop scanning - the rest is body content
      break;
    }
  }

  return { header, bodyStartIndex, headerFieldOrder };
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

function tokenizeBody(bodyLines: string[]): { tokens: AbcToken[][]; voiceIds: string[]; inlineVoiceMarkers: Map<string, string>; voiceDeclarationLines: string[]; bodyComments: string[]; bodyDirectives: string[]; wFields: string[]; voiceInterleavePattern: string[][]; groupBarCounts: number[][]; voiceComments: Record<string, Array<{ barIndex: number; comment: string }>>; preVoiceComments: string[][] } {
  const voiceTokens: Map<string, AbcToken[]> = new Map();
  let currentVoice = '1';
  voiceTokens.set(currentVoice, []);
  let isContinuation = false; // true if previous line ended with \
  const inlineVoiceMarkers: Map<string, string> = new Map(); // voiceId -> original [V:...] text
  const voiceDeclarationLines: string[] = []; // standalone V: lines in body for round-trip
  const bodyComments: string[] = []; // comment lines between voice groups for round-trip
  const bodyDirectives: string[] = []; // real %% directives in body for round-trip
  const wFields: string[] = []; // W: fields (end-of-tune words) for round-trip
  // Track voice interleaving: each element is a group of voice IDs that appear together
  // before a separator (comment line, blank line, etc.)
  const voiceInterleavePattern: string[][] = [];
  let currentGroup: string[] = [];
  let lastVoiceInGroup: string | null = null;
  // Track bar counts per voice per group to determine measures per group
  const groupBarCounts: number[][] = []; // groupBarCounts[groupIdx][voiceInGroupIdx] = number of bars
  let currentGroupBarCounts: number[] = [];
  let currentVoiceBarCount = 0;
  // Per-voice bar counts (independent of group tracking)
  const voiceBarCounts: Map<string, number> = new Map();
  // Within-voice comments with their position (barIndex)
  const voiceCommentsMap: Map<string, Array<{ barIndex: number; comment: string }>> = new Map();
  // Pre-voice comments: comments that appear before each V: declaration line
  const preVoiceComments: string[][] = [];
  // Deferred comments: accumulated until we know if they're within-voice or between-group
  let pendingComments: string[] = [];

  function flushPendingToVoice(voiceId: string) {
    if (pendingComments.length === 0) return;
    if (!voiceCommentsMap.has(voiceId)) {
      voiceCommentsMap.set(voiceId, []);
    }
    const barCount = voiceBarCounts.get(voiceId) || 0;
    for (const comment of pendingComments) {
      voiceCommentsMap.get(voiceId)!.push({ barIndex: barCount, comment });
    }
    pendingComments = [];
  }

  for (const rawLine of bodyLines) {
    const trimmedEnd = rawLine.trimEnd();
    const hasLineContinuation = trimmedEnd.endsWith('\\');
    // Remove trailing backslash if present
    const lineContent = hasLineContinuation ? trimmedEnd.slice(0, -1) : rawLine;
    const line = lineContent.trim();

    // W: fields (end-of-tune words)
    const wFieldMatch = line.match(/^W:(.*)/);
    if (wFieldMatch) {
      wFields.push(rawLine);
      isContinuation = false;
      continue;
    }

    if (line === '') {
      isContinuation = false;
      continue;
    }

    // Classify % lines: real directives (%%keyword) vs comments (everything else starting with %)
    const isRealDirective = line.startsWith('%%') && /^%%[A-Za-z]/.test(line);
    const isComment = line.startsWith('%') && !isRealDirective;

    if (isComment) {
      // Defer: don't decide yet if this is within-voice or between-group
      pendingComments.push(rawLine);
      isContinuation = false;
      continue;
    }

    if (isRealDirective) {
      bodyDirectives.push(rawLine);
      isContinuation = false;
      continue;
    }

    // Check for voice change (standalone V: line)
    const voiceMatch = line.match(/^V:\s*(\S+)/);
    if (voiceMatch) {
      const newVoice = voiceMatch[1];

      // Detect group boundary: voice repeating in current group
      if (currentGroup.includes(newVoice)) {
        // Close current group
        if (lastVoiceInGroup !== null) {
          currentGroupBarCounts.push(currentVoiceBarCount);
          currentVoiceBarCount = 0;
        }
        groupBarCounts.push(currentGroupBarCounts);
        currentGroupBarCounts = [];
        voiceInterleavePattern.push(currentGroup);
        currentGroup = [];
        lastVoiceInGroup = null;
        // Pending comments are between-group separators
        for (const c of pendingComments) {
          bodyComments.push(c);
        }
        pendingComments = [];
      }
      // else: not a group boundary - pending comments are pre-voice comments below

      // Store pre-voice comments for this V: declaration
      preVoiceComments.push([...pendingComments]);
      pendingComments = [];

      currentVoice = newVoice;
      if (!voiceTokens.has(currentVoice)) {
        voiceTokens.set(currentVoice, []);
      }
      voiceDeclarationLines.push(rawLine);
      // Track this voice in the current interleave group
      if (lastVoiceInGroup !== currentVoice) {
        // Save bar count for previous voice in this group
        if (lastVoiceInGroup !== null) {
          currentGroupBarCounts.push(currentVoiceBarCount);
          currentVoiceBarCount = 0;
        }
        currentGroup.push(currentVoice);
        lastVoiceInGroup = currentVoice;
      }
      isContinuation = false;
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
      isContinuation = false;
      continue;
    }

    // Handle body K: line (key change mid-tune)
    const bodyKeyMatch = line.match(/^K:\s*(.*)/);
    if (bodyKeyMatch) {
      const currentTokens = voiceTokens.get(currentVoice)!;
      if (currentTokens.length > 0) {
        const lastToken = currentTokens[currentTokens.length - 1];
        if (lastToken.type !== 'line_break') {
          currentTokens.push({ type: 'line_break', value: '\n' });
        }
      }
      currentTokens.push({ type: 'inline_field', value: `K:${bodyKeyMatch[1]}` });
      // Add a line_break after K: so the next music line starts on a new line
      currentTokens.push({ type: 'line_break', value: '\n' });
      isContinuation = false;
      continue;
    }

    // Skip other header-like fields in body (but not inline fields starting with [)
    if (/^[A-Za-z]:\s*/.test(line) && !/^\[/.test(line)) {
      isContinuation = false;
      continue;
    }

    // Flush pending comments to current voice before processing music
    flushPendingToVoice(currentVoice);

    // Tokenize music line
    const tokens = tokenizeMusicLine(lineContent);

    // Add a line_break or line_continuation token before this music line's tokens
    // (if this voice already has tokens from a previous line)
    const currentTokens = voiceTokens.get(currentVoice)!;
    if (currentTokens.length > 0 && !isContinuation) {
      // Check if previous token is not already a line_break
      const lastToken = currentTokens[currentTokens.length - 1];
      if (lastToken.type !== 'line_break') {
        currentTokens.push({ type: 'line_break', value: '\n' });
      }
    }
    // If this is a continuation from a previous line, don't add a line_break

    // Process tokens, handling inline voice changes
    for (const token of tokens) {
      if (token.type === 'inline_field') {
        const fieldMatch = token.value.match(/^V:\s*(.+)/);
        if (fieldMatch) {
          const voiceId = fieldMatch[1].trim().split(/\s+/)[0];
          currentVoice = voiceId;
          if (!voiceTokens.has(currentVoice)) {
            voiceTokens.set(currentVoice, []);
          }
          // Store the original inline voice marker text for round-trip
          if (!inlineVoiceMarkers.has(voiceId)) {
            inlineVoiceMarkers.set(voiceId, `[${token.value}]`);
          }
          continue;
        }
      }
      voiceTokens.get(currentVoice)!.push(token);
      // Count bar tokens for voice interleave tracking (group-level)
      if (token.type === 'bar') {
        currentVoiceBarCount++;
        // Also track per-voice bar counts (global, not per-group)
        voiceBarCounts.set(currentVoice, (voiceBarCounts.get(currentVoice) || 0) + 1);
      }
    }

    // If this line ends with \, mark continuation and add a line_continuation token
    if (hasLineContinuation) {
      voiceTokens.get(currentVoice)!.push({ type: 'line_break', value: '\\\n' });
      isContinuation = true;
    } else {
      isContinuation = false;
    }
  }

  // Return tokens grouped by voice, preserving voice IDs
  const result: AbcToken[][] = [];
  const voiceIds: string[] = [];
  for (const [voiceId, tokens] of voiceTokens) {
    if (tokens.length > 0) {
      result.push(tokens);
      voiceIds.push(voiceId);
    }
  }

  // Flush any remaining pending comments to the last voice
  flushPendingToVoice(currentVoice);

  // Finalize last interleave group
  if (currentGroup.length > 0) {
    currentGroupBarCounts.push(currentVoiceBarCount);
    groupBarCounts.push(currentGroupBarCounts);
    voiceInterleavePattern.push(currentGroup);
  }

  // Convert voiceCommentsMap to a plain object keyed by voice ID
  const voiceComments: Record<string, Array<{ barIndex: number; comment: string }>> = {};
  for (const [voiceId, comments] of voiceCommentsMap) {
    voiceComments[voiceId] = comments;
  }

  return { tokens: result.length > 0 ? result : [[]], voiceIds, inlineVoiceMarkers, voiceDeclarationLines, bodyComments, bodyDirectives, wFields, voiceInterleavePattern, groupBarCounts, voiceComments, preVoiceComments };
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

    // Emit space token (preserve spaces for round-trip)
    if (ch === ' ' || ch === '\t') {
      tokens.push({ type: 'space', value: ' ' });
      // Consume all consecutive whitespace as a single space
      while (i < line.length && (line[i] === ' ' || line[i] === '\t')) i++;
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

    // ABC shorthand decorations: v (down-bow), u (up-bow), T (trill), M (mordent)
    // These appear as standalone characters before a note (or another decoration)
    if ((ch === 'v' || ch === 'u' || ch === 'T' || ch === 'M') && i + 1 < line.length) {
      const nextCh = line[i + 1];
      // Treat as decoration if followed by a note, chord, rest, another decoration,
      // slur start, !...! decoration, or chord symbol
      if (isNoteStart(nextCh) || nextCh === '[' || nextCh === 'z' || nextCh === 'x' ||
        nextCh === 'v' || nextCh === 'u' || nextCh === 'T' || nextCh === 'M' ||
        nextCh === '(' || nextCh === '!' || nextCh === '"') {
        tokens.push({ type: 'decoration', value: ch });
        i++;
        continue;
      }
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
    ['::', 'double-repeat'],
    [':|:', 'double-repeat'],
    ['|>|', 'thick-thin'],
    ['|:', 'start-repeat'],
    [':|', 'end-repeat'],
    ['||', 'double'],
    ['|]', 'final'],
    ['[|', 'heavy-light'],
    ['|', 'regular'],
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
  let explicitNatural = false;
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
    explicitNatural = true;
    i++;
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

  const token: AbcToken = {
    type: 'note',
    value: line.slice(start, i),
    pitch,
    durationNum: dur.num,
    durationDen: dur.den,
    accidental: accidental !== 0 || explicitNatural ? accidental : undefined,
  };

  if (explicitNatural) {
    token.explicitNatural = true;
  }

  return {
    token,
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

function buildScore(header: AbcHeader, voiceTokensList: AbcToken[][], voiceIds: string[], headerFieldOrder: string[], inlineVoiceMarkers: Map<string, string> = new Map(), voiceDeclarationLines: string[] = [], bodyComments: string[] = [], bodyDirectives: string[] = [], wFields: string[] = [], voiceInterleavePattern: string[][] = [], groupBarCounts: number[][] = [], voiceComments: Record<string, Array<{ barIndex: number; comment: string }>> = {}, preVoiceComments: string[][] = []): Score {
  const unitNote = parseUnitNoteLength(header.unitNoteLength, header.meter);
  const timeSignature = parseTimeSignature(header.meter || '4/4');
  const keySignature = parseKeySignature(header.key || 'C');

  const beatsNum = parseInt(timeSignature.beats, 10);
  const beatType = timeSignature.beatType;
  // Duration of one full measure in divisions
  const measureDuration = Math.round((beatsNum / beatType) * 4 * DIVISIONS);

  const parts: Part[] = [];
  const partListEntries: Score['partList'] = [];

  // Build miscellaneous metadata for ABC round-trip
  const miscellaneous: { name: string; value: string }[] = [];
  if (header.referenceNumber !== undefined) {
    miscellaneous.push({ name: 'abc-reference-number', value: String(header.referenceNumber) });
  }
  if (header.unitNoteLength) {
    miscellaneous.push({ name: 'abc-unit-note-length', value: header.unitNoteLength });
  }
  if (header.tempo) {
    miscellaneous.push({ name: 'abc-tempo', value: header.tempo });
  }
  // Store extra header fields for round-trip
  if (header.extraFields && header.extraFields.length > 0) {
    miscellaneous.push({ name: 'abc-extra-fields', value: JSON.stringify(header.extraFields) });
  }
  // Store %% directives for round-trip
  if (header.directives && header.directives.length > 0) {
    miscellaneous.push({ name: 'abc-directives', value: JSON.stringify(header.directives) });
  }
  // Store original header field order for round-trip
  if (headerFieldOrder.length > 0) {
    miscellaneous.push({ name: 'abc-header-order', value: JSON.stringify(headerFieldOrder) });
  }
  // Store voice IDs for round-trip
  if (voiceIds.length > 0) {
    miscellaneous.push({ name: 'abc-voice-ids', value: JSON.stringify(voiceIds) });
  }
  // Store inline voice markers for round-trip (e.g., "[V: P1]" format)
  if (inlineVoiceMarkers.size > 0) {
    const markersObj: Record<string, string> = {};
    for (const [id, marker] of inlineVoiceMarkers) {
      markersObj[id] = marker;
    }
    miscellaneous.push({ name: 'abc-inline-voice-markers', value: JSON.stringify(markersObj) });
  }
  // Store standalone V: declaration lines from body for round-trip
  // (used when inline [V:] markers are present and V: declarations need separate output)
  if (voiceDeclarationLines.length > 0 && inlineVoiceMarkers.size > 0) {
    miscellaneous.push({ name: 'abc-voice-declaration-lines', value: JSON.stringify(voiceDeclarationLines) });
  }
  // Store standalone V: declaration lines from body (always, for interleaved voice round-trip)
  if (voiceDeclarationLines.length > 0) {
    miscellaneous.push({ name: 'abc-body-voice-lines', value: JSON.stringify(voiceDeclarationLines) });
  }
  // Store body comments for round-trip
  if (bodyComments.length > 0) {
    miscellaneous.push({ name: 'abc-body-comments', value: JSON.stringify(bodyComments) });
  }
  // Store body directives for round-trip
  if (bodyDirectives.length > 0) {
    miscellaneous.push({ name: 'abc-body-directives', value: JSON.stringify(bodyDirectives) });
  }
  // Store W: fields for round-trip
  if (wFields.length > 0) {
    miscellaneous.push({ name: 'abc-w-fields', value: JSON.stringify(wFields) });
  }
  // Store voice interleave pattern for round-trip
  if (voiceInterleavePattern.length > 0) {
    miscellaneous.push({ name: 'abc-voice-interleave', value: JSON.stringify(voiceInterleavePattern) });
  }
  // Store group bar counts (measures per group per voice) for interleave serialization
  if (groupBarCounts.length > 0) {
    miscellaneous.push({ name: 'abc-group-bar-counts', value: JSON.stringify(groupBarCounts) });
  }
  // Store within-voice comments for round-trip
  if (Object.keys(voiceComments).length > 0) {
    miscellaneous.push({ name: 'abc-voice-comments', value: JSON.stringify(voiceComments) });
  }
  // Store pre-voice comments for round-trip
  if (preVoiceComments.length > 0) {
    miscellaneous.push({ name: 'abc-pre-voice-comments', value: JSON.stringify(preVoiceComments) });
  }
  // Store full voice definition lines for round-trip
  const voiceFullLines: Record<string, string> = {};
  for (const voice of header.voices || []) {
    if (voice.fullLine) {
      voiceFullLines[voice.id] = voice.fullLine;
    }
  }
  if (Object.keys(voiceFullLines).length > 0) {
    miscellaneous.push({ name: 'abc-voice-full-lines', value: JSON.stringify(voiceFullLines) });
  }

  for (let voiceIndex = 0; voiceIndex < voiceTokensList.length; voiceIndex++) {
    const tokens = voiceTokensList[voiceIndex];
    const partId = `P${voiceIndex + 1}`;
    // Match voice by ID (from tokenizer) to header voice definitions
    const voiceId = voiceIds[voiceIndex];
    const headerVoice = header.voices?.find(v => v.id === voiceId)
      || (header.voices && header.voices[voiceIndex]);
    const voiceName = headerVoice
      ? headerVoice.name || `Voice ${voiceIndex + 1}`
      : voiceTokensList.length > 1
        ? `Voice ${voiceIndex + 1}`
        : 'Music';

    partListEntries.push({
      _id: generateId(),
      type: 'score-part',
      id: partId,
      name: voiceName,
    });

    const voiceClef = headerVoice
      ? abcClefToMusicXml(headerVoice.clef)
      : undefined;
    const buildResult = buildMeasures(tokens, unitNote, keySignature, timeSignature, measureDuration, voiceClef);
    parts.push({
      _id: generateId(),
      id: partId,
      measures: buildResult.measures,
    });

    // Store line breaks for each part
    if (buildResult.lineBreaks.length > 0) {
      if (voiceIndex === 0) {
        miscellaneous.push({ name: 'abc-line-breaks', value: JSON.stringify(buildResult.lineBreaks) });
      }
      miscellaneous.push({ name: `abc-line-breaks-${voiceIndex}`, value: JSON.stringify(buildResult.lineBreaks) });
    }

    // Store chord individual durations flag
    if (buildResult.hasIndividualChordDurations) {
      miscellaneous.push({ name: 'abc-chord-individual-durations', value: 'true' });
    }

    // Detect lyrics layout and store syllable counts per w: line
    if (voiceIndex === 0) {
      let hasLyrics = false;
      let lyricsAfterAll = true;
      let seenLyrics = false;
      const lyricLineCounts: number[] = []; // syllable count for each w: line
      for (const token of tokens) {
        if (token.type === 'lyrics') {
          hasLyrics = true;
          seenLyrics = true;
          lyricLineCounts.push(token.syllables?.length || 0);
        } else if (seenLyrics && (token.type === 'note' || token.type === 'rest' || token.type === 'bar')) {
          // Music after lyrics means interleaved layout
          lyricsAfterAll = false;
        }
      }
      if (hasLyrics && lyricsAfterAll) {
        miscellaneous.push({ name: 'abc-lyrics-after-all', value: 'true' });
      }
      if (hasLyrics && lyricLineCounts.length > 0) {
        miscellaneous.push({ name: 'abc-lyrics-line-counts', value: JSON.stringify(lyricLineCounts) });
      }
    }
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
      miscellaneous: miscellaneous.length > 0 ? miscellaneous : undefined,
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

function abcClefToMusicXml(abcClef?: string): Clef {
  if (!abcClef) return { sign: 'G', line: 2 };
  const c = abcClef.toLowerCase();
  if (c === 'treble' || c === 'treble-8va' || c === 'treble+8') return { sign: 'G', line: 2 };
  if (c === 'bass' || c === 'bass3') return { sign: 'F', line: 4 };
  if (c === 'alto') return { sign: 'C', line: 3 };
  if (c === 'tenor') return { sign: 'C', line: 4 };
  if (c === 'soprano') return { sign: 'C', line: 1 };
  if (c === 'mezzo' || c === 'mezzo-soprano') return { sign: 'C', line: 2 };
  if (c === 'baritone') return { sign: 'C', line: 5 };
  if (c === 'perc' || c === 'percussion') return { sign: 'percussion' };
  return { sign: 'G', line: 2 };
}

function buildMeasures(
  tokens: AbcToken[],
  unitNote: { num: number; den: number },
  keySignature: KeySignature,
  timeSignature: TimeSignature,
  measureDuration: number,
  clef?: Clef,
): { measures: Measure[]; lineBreaks: number[]; hasIndividualChordDurations: boolean } {
  const measures: Measure[] = [];
  let currentEntries: MeasureEntry[] = [];
  let hasIndividualChordDurations = false;
  let currentBarlines: Barline[] = [];
  let currentPosition = 0;
  let measureNumber = 1;
  let isFirstMeasure = true;
  let pendingTie = false;
  let slurDepth = 0;
  let pendingSlurStarts = 0;
  let slurStartNotes: NoteEntry[] = [];
  let inGrace = false;
  let tupletState: { p: number; q: number; remaining: number } | null = null;
  // Queue to preserve original order of dynamics, decorations, and chord symbols
  const pendingPreNoteItems: Array<{ kind: 'dynamic' | 'harmony' | 'decoration'; value: string }> = [];
  let pendingEndingNumber: string | null = null;
  let currentLyrics: string[] = [];
  let noteCountForLyrics = 0;
  let inChord = false;
  let chordNotes: AbcToken[] = [];
  let chordNoteTies: boolean[] = []; // track ties per chord note
  let currentUnitNote = { ...unitNote };
  let pendingTupletStart = false;
  let pendingKeyChange: string | null = null;
  const lineBreaks: number[] = []; // measure numbers after which line breaks occur

  function flushPendingPreNoteItems() {
    for (const item of pendingPreNoteItems) {
      if (item.kind === 'harmony') {
        const harmony = createHarmonyEntry(item.value);
        if (harmony) currentEntries.push(harmony);
      } else if (item.kind === 'dynamic') {
        const dynDir = createDynamicsDirection(item.value);
        if (dynDir) currentEntries.push(dynDir);
      } else if (item.kind === 'decoration') {
        const decoDir: DirectionEntry = {
          _id: generateId(),
          type: 'direction',
          directionTypes: [{ kind: 'words', text: item.value }],
        };
        currentEntries.push(decoDir);
      }
    }
    pendingPreNoteItems.length = 0;
  }

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
        clef: [clef || { sign: 'G', line: 2 }],
      };
      isFirstMeasure = false;
    }

    // Apply pending key change to this measure
    if (pendingKeyChange) {
      if (!measure.attributes) {
        measure.attributes = {};
      }
      const kValue = pendingKeyChange.replace(/^K:\s*/, '');
      measure.attributes.key = parseKeySignature(kValue);
      pendingKeyChange = null;
    }

    // Add barlines
    if (endBarType || currentBarlines.length > 0) {
      measure.barlines = [...currentBarlines];
      if (endBarType) {
        const barline = createBarline(endBarType, 'right', pendingEndingNumber);
        if (barline) {
          measure.barlines.push(barline);
        }
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

        if (pendingTupletStart && !inGrace) {
          pendingTupletStart = false;
        }

        // Handle chord symbol and dynamics in original order
        flushPendingPreNoteItems();

        // Handle slur start: attach pending slur starts to this note
        while (pendingSlurStarts > 0) {
          if (!entry.notations) entry.notations = [];
          entry.notations.push({ type: 'slur', slurType: 'start', number: slurDepth - pendingSlurStarts + 1 });
          slurStartNotes.push(entry);
          pendingSlurStarts--;
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

        // Handle chord symbol and dynamics in original order
        flushPendingPreNoteItems();

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
        chordNoteTies = [];
        break;

      case 'chord_end': {
        inChord = false;

        if (chordNotes.length > 0) {
          // Handle chord symbol and dynamics in original order
          for (const item of pendingPreNoteItems) {
            if (item.kind === 'harmony') {
              const harmony = createHarmonyEntry(item.value);
              if (harmony) currentEntries.push(harmony);
            } else if (item.kind === 'dynamic') {
              const dynDir = createDynamicsDirection(item.value);
              if (dynDir) currentEntries.push(dynDir);
            }
          }
          pendingPreNoteItems.length = 0;

          // Use duration from the chord_end token (parsed after ']')
          // Falls back to 1/1 (default unit note length)
          const chordDurNum = token.durationNum || 1;
          const chordDurDen = token.durationDen || 1;

          // Check if individual notes have non-default durations
          // If so, use individual durations instead of chord-level duration
          const hasIndividualDurations = chordNotes.some(
            cn => (cn.durationNum !== undefined && cn.durationNum !== 1) ||
              (cn.durationDen !== undefined && cn.durationDen !== 1)
          );
          const useIndividualDurations = hasIndividualDurations && chordDurNum === 1 && chordDurDen === 1;
          if (useIndividualDurations) hasIndividualChordDurations = true;

          for (let ci = 0; ci < chordNotes.length; ci++) {
            const chordToken = chordNotes[ci];
            // Override duration with chord duration (unless using individual durations)
            const originalNum = chordToken.durationNum;
            const originalDen = chordToken.durationDen;
            if (!useIndividualDurations) {
              chordToken.durationNum = chordDurNum;
              chordToken.durationDen = chordDurDen;
            }

            const entry = createNoteEntry(chordToken, currentUnitNote, false, inGrace, tupletState);

            // Restore for any other processing
            chordToken.durationNum = originalNum;
            chordToken.durationDen = originalDen;

            if (ci === 0) {
              // Handle slur start on first note of chord
              while (pendingSlurStarts > 0) {
                if (!entry.notations) entry.notations = [];
                entry.notations.push({ type: 'slur', slurType: 'start', number: slurDepth - pendingSlurStarts + 1 });
                slurStartNotes.push(entry);
                pendingSlurStarts--;
              }
              // Mark if this chord uses individual per-note durations
              if (useIndividualDurations) {
                (entry as any)._abcIndividualChordDurations = true;
              }
            } else {
              entry.chord = true;
            }

            // Apply per-note ties from inside the chord
            if (chordNoteTies[ci]) {
              entry.tie = { type: 'start' };
              entry.ties = [{ type: 'start' }];
              if (!entry.notations) entry.notations = [];
              entry.notations.push({ type: 'tied', tiedType: 'start' });
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
        // Flush any pending items (e.g., chord symbols at end of measure)
        flushPendingPreNoteItems();
        const barType = token.barType || 'regular';

        if (barType === 'double-repeat') {
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

      case 'ending': {
        // Create a left barline with ending marker for the current measure
        const endingBarline: Barline = {
          _id: generateId(),
          location: 'left',
          ending: {
            number: token.value,
            type: 'start',
          },
        };
        currentBarlines.push(endingBarline);
        break;
      }

      case 'tie':
        if (inChord) {
          // Tie inside a chord: mark the most recently added chord note
          if (chordNotes.length > 0) {
            chordNoteTies[chordNotes.length - 1] = true;
          }
        } else {
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
        }
        break;

      case 'slur_start':
        slurDepth++;
        pendingSlurStarts++;
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
        pendingTupletStart = true;
        break;

      case 'chord_symbol':
        pendingPreNoteItems.push({ kind: 'harmony', value: token.value });
        break;

      case 'decoration':
        if (DYNAMICS_VALUES.has(token.value)) {
          pendingPreNoteItems.push({ kind: 'dynamic', value: token.value });
        } else {
          // Non-dynamic decorations: store as direction with words for round-trip
          // Single-char shorthand decorations (v, u, T, M) are stored without !...!
          const isShorthand = token.value.length === 1 && /^[vuTM]$/.test(token.value);
          const decoText = isShorthand ? token.value : `!${token.value}!`;
          // Add to pending queue to preserve order relative to dynamics/harmonies
          pendingPreNoteItems.push({ kind: 'decoration', value: decoText });
        }
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
          // Store inline L: as a direction with words, so it can survive MusicXML round-trip
          const inlineEntry: DirectionEntry = {
            _id: generateId(),
            type: 'direction',
            directionTypes: [{ kind: 'words', text: `[L:${lMatch[1]}/${lMatch[2]}]` }],
          };
          currentEntries.push(inlineEntry);
        }
        const kMatch = token.value.match(/^K:\s*(.*)/);
        if (kMatch) {
          // Store inline K: key change - will be attached to the next measure
          pendingKeyChange = `K:${kMatch[1]}`;
        }
        break;
      }

      case 'space':
        break;

      case 'line_break':
        // Flush pending items before recording line break position
        flushPendingPreNoteItems();
        // Store intra-measure line breaks as direction entries for round-trip
        if (currentEntries.length > 0) {
          const breakText = token.value === '\\\n' ? '__abc_line_cont__' : '__abc_line_break__';
          const lineBreakDir: DirectionEntry = {
            _id: generateId(),
            type: 'direction',
            directionTypes: [{ kind: 'words', text: breakText }],
          };
          currentEntries.push(lineBreakDir);
        }
        // Record line break position: after the last finalized measure
        if (measures.length > 0) {
          if (token.value === '\\\n') {
            // Line continuation: store as negative to distinguish from regular breaks
            lineBreaks.push(-(measures.length));
          } else {
            lineBreaks.push(measures.length);
          }
        }
        break;

      default:
        break;
    }
  }

  // Finalize last measure if it has entries
  if (currentEntries.length > 0) {
    finalizeMeasure();
  }

  // Handle tie stop on notes after tie start
  applyTieStops(measures);

  return { measures, lineBreaks, hasIndividualChordDurations };
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
          // Check if this note already has a tie start (e.g., from chord per-note ties)
          if (next.tie?.type === 'start') {
            // Note is both a tie stop and tie start (continue)
            next.tie = { type: 'stop' };
            next.ties = [{ type: 'stop' }, { type: 'start' }];
          } else {
            next.tie = { type: 'stop' };
            next.ties = [{ type: 'stop' }];
          }
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
  }

  // Set accidental info for MusicXML compatibility
  if (token.explicitNatural) {
    entry.accidental = { value: 'natural' };
  } else if (token.accidental !== undefined && token.accidental !== 0) {
    switch (token.accidental) {
      case 1: entry.accidental = { value: 'sharp' }; break;
      case 2: entry.accidental = { value: 'double-sharp' }; break;
      case -1: entry.accidental = { value: 'flat' }; break;
      case -2: entry.accidental = { value: 'double-flat' }; break;
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
  // Check if this is an invisible rest (x or X)
  const isInvisible = token.value.startsWith('x') || token.value.startsWith('X');
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

  const entry: NoteEntry = {
    _id: generateId(),
    type: 'note',
    rest: isWholeMeasure ? { measure: true } : {},
    duration,
    voice: 1,
    noteType,
    dots: dots > 0 ? dots : undefined,
  };

  if (isInvisible) {
    entry.printObject = false;
  }

  return entry;
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
    case 'thick-thin':
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
      value: dynamic as DynamicsValue,
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
  const { header, bodyStartIndex, headerFieldOrder } = parseHeader(lines);
  const bodyLines = lines.slice(bodyStartIndex);
  const { tokens: voiceTokensList, voiceIds, inlineVoiceMarkers, voiceDeclarationLines, bodyComments, bodyDirectives, wFields, voiceInterleavePattern, groupBarCounts, voiceComments, preVoiceComments } = tokenizeBody(bodyLines);
  const score = buildScore(header, voiceTokensList, voiceIds, headerFieldOrder, inlineVoiceMarkers, voiceDeclarationLines, bodyComments, bodyDirectives, wFields, voiceInterleavePattern, groupBarCounts, voiceComments, preVoiceComments);

  // Detect if the file uses explicit /2 duration form (e.g., "f/2") vs shorthand "f/"
  // Check body text for pattern: note letter followed by /2 (explicit)
  const bodyText = bodyLines.join('\n');
  const hasExplicitHalf = /[A-Ga-gzx]\/2/.test(bodyText);
  if (hasExplicitHalf) {
    if (!score.metadata.miscellaneous) score.metadata.miscellaneous = [];
    score.metadata.miscellaneous.push({ name: 'abc-explicit-half', value: 'true' });
  }

  return score;
}
