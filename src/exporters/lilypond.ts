/**
 * LilyPond Serializer
 *
 * Converts the Score model to a LilyPond (.ly) source file. Export only: the
 * output is meant to be engraved by `lilypond`, not parsed back.
 *
 * Layout of the generated file:
 * - one music variable per voice (`partAStaffAVoiceA = { ... }`), one line per
 *   measure ending in a bar check and the measure number,
 * - a `\chordmode` variable per part with chord symbols,
 * - a `\lyricmode` variable per voice and verse,
 * - a `\score` block wiring them into staves, piano staves and staff groups.
 *
 * MusicXML stores voices as one stream per measure with `<backup>`/`<forward>`;
 * LilyPond wants each voice as its own continuous sequence. Every note is
 * placed by its onset inside the measure and each voice is padded with spacer
 * rests (`s`), so all voices of all staves stay aligned bar by bar.
 */

import type {
  Score,
  Part,
  Measure,
  NoteEntry,
  DirectionEntry,
  DirectionType,
  HarmonyEntry,
  Pitch,
  KeySignature,
  TimeSignature,
  NoteType,
  Barline,
  Notation,
  Clef,
  Transpose,
  StaffTuning,
  PartInfo,
  PartGroup,
  Lyric,
  MeasureAttributes,
} from '../types';

// ============================================================
// Options
// ============================================================

export interface LilyPondSerializeOptions {
  /** Value of the `\version` statement. Default: "2.24.0" */
  version?: string;
  /** Write the `\header` block (title, composer, ...). Default: true */
  includeHeader?: boolean;
  /** Write chord symbols as a `ChordNames` context. Default: true */
  includeChordSymbols?: boolean;
  /** Write lyrics. Default: true */
  includeLyrics?: boolean;
  /** Write dynamics and hairpins. Default: true */
  includeDynamics?: boolean;
  /** Turn MusicXML system and page breaks into `\break` / `\pageBreak`. Default: false */
  includeLayoutBreaks?: boolean;
  /** Use the beams from the score instead of LilyPond's automatic beaming. Default: true */
  preserveBeams?: boolean;
  /** Add a `\midi { }` block to the score. Default: false */
  midi?: boolean;
}

// ============================================================
// Rational arithmetic (positions and durations in whole notes)
// ============================================================

interface Frac { n: number; d: number }

function gcd(a: number, b: number): number {
  a = Math.abs(a); b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a || 1;
}

function frac(n: number, d = 1): Frac {
  if (d < 0) { n = -n; d = -d; }
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return { n: 0, d: 1 };
  if (!Number.isInteger(n) || !Number.isInteger(d)) {
    // Non-integer durations (e.g. "0.5" divisions) — scale to integers.
    const scale = 1e6;
    return frac(Math.round(n * scale), Math.round(d * scale));
  }
  const g = gcd(n, d);
  return { n: n / g, d: d / g };
}

const ZERO: Frac = { n: 0, d: 1 };
const add = (a: Frac, b: Frac) => frac(a.n * b.d + b.n * a.d, a.d * b.d);
const sub = (a: Frac, b: Frac) => frac(a.n * b.d - b.n * a.d, a.d * b.d);
const mul = (a: Frac, b: Frac) => frac(a.n * b.n, a.d * b.d);
const div = (a: Frac, b: Frac) => frac(a.n * b.d, a.d * b.n);
const cmp = (a: Frac, b: Frac) => a.n * b.d - b.n * a.d;
const eq = (a: Frac, b: Frac) => cmp(a, b) === 0;
const max = (a: Frac, b: Frac) => (cmp(a, b) >= 0 ? a : b);
const isZero = (a: Frac) => a.n === 0;

// ============================================================
// Durations
// ============================================================

// Plain literals, not frac() calls: a top-level call would keep this module in
// bundles that only use MusicXML when the bundler ignores "sideEffects".
const NOTE_TYPE_VALUE: Record<NoteType, Frac> = {
  maxima: { n: 8, d: 1 }, long: { n: 4, d: 1 }, breve: { n: 2, d: 1 }, whole: { n: 1, d: 1 },
  half: { n: 1, d: 2 }, quarter: { n: 1, d: 4 }, eighth: { n: 1, d: 8 }, '16th': { n: 1, d: 16 },
  '32nd': { n: 1, d: 32 }, '64th': { n: 1, d: 64 }, '128th': { n: 1, d: 128 },
  '256th': { n: 1, d: 256 }, '512th': { n: 1, d: 512 }, '1024th': { n: 1, d: 1024 },
};

const NOTE_TYPE_LY: Record<NoteType, string> = {
  maxima: '\\maxima', long: '\\longa', breve: '\\breve', whole: '1', half: '2', quarter: '4',
  eighth: '8', '16th': '16', '32nd': '32', '64th': '64', '128th': '128', '256th': '256',
  '512th': '512', '1024th': '1024',
};

const SIMPLE_TYPES: NoteType[] = ['maxima', 'long', 'breve', 'whole', 'half', 'quarter', 'eighth', '16th', '32nd', '64th', '128th'];

function dottedValue(type: NoteType, dots: number): Frac {
  const base = NOTE_TYPE_VALUE[type];
  // base * (2 - 1/2^dots)
  return mul(base, frac(2 ** (dots + 1) - 1, 2 ** dots));
}

/** A duration as a single note value with dots, if there is one. */
function simpleDuration(value: Frac): string | null {
  for (const type of SIMPLE_TYPES) {
    for (let dots = 0; dots <= 3; dots++) {
      if (eq(dottedValue(type, dots), value)) return NOTE_TYPE_LY[type] + '.'.repeat(dots);
    }
  }
  return null;
}

/** Any duration: a plain note value where possible, else a scaled whole note (`1*5/8`). */
function durationString(value: Frac): string {
  const simple = simpleDuration(value);
  if (simple) return simple;
  return value.d === 1 ? `1*${value.n}` : `1*${value.n}/${value.d}`;
}

function multiplierString(k: Frac): string {
  if (eq(k, frac(1))) return '';
  return k.d === 1 ? `*${k.n}` : `*${k.n}/${k.d}`;
}

function momentString(value: Frac): string {
  return `#(ly:make-moment ${value.n}/${value.d})`;
}

// ============================================================
// Pitches
// ============================================================

const ALTER_SUFFIX: Record<string, string> = {
  '-2': 'eses', '-1.5': 'eseh', '-1': 'es', '-0.5': 'eh', '0': '', '0.5': 'ih', '1': 'is', '1.5': 'isih', '2': 'isis',
};

function pitchName(step: string, alter = 0): string {
  const s = step.toLowerCase();
  const rounded = Math.max(-2, Math.min(2, Math.round(alter * 2) / 2));
  const suffix = ALTER_SUFFIX[String(rounded)] ?? '';
  // Dutch names drop the doubled vowel: es / as, not ees / aes.
  if ((s === 'e' || s === 'a') && suffix.startsWith('es')) return s + suffix.slice(1);
  return s + suffix;
}

function octaveMarks(octave: number): string {
  const diff = octave - 3;
  return diff > 0 ? "'".repeat(diff) : ",".repeat(-diff);
}

function serializePitch(pitch: Pitch): string {
  return pitchName(pitch.step, pitch.alter ?? 0) + octaveMarks(pitch.octave);
}

const STEPS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
const STEP_SEMITONES = [0, 2, 4, 5, 7, 9, 11];

/** Tonic on the line of fifths: 0 = C, 1 = G, -1 = F, ... */
function fifthsTonic(fifths: number): string {
  const order = 'FCGDAEB';
  const k = fifths + 1;
  const step = order[((k % 7) + 7) % 7];
  const alter = Math.floor(k / 7);
  return pitchName(step, alter);
}

const MODE_OFFSET: Record<string, number> = {
  major: 0, ionian: 0, none: 0, mixolydian: 1, dorian: 2, minor: 3, aeolian: 3, phrygian: 4, locrian: 5, lydian: -1,
};

function serializeKey(key: KeySignature): string | null {
  if (key.fifths === undefined || Number.isNaN(key.fifths)) return null;
  const mode = key.mode && key.mode !== 'none' ? key.mode : 'major';
  const tonic = fifthsTonic(key.fifths + (MODE_OFFSET[mode] ?? 0));
  return `\\key ${tonic} \\${mode}`;
}

function serializeTime(time: TimeSignature): string {
  const parts: string[] = [];
  if (!time.beatType || !(parseInt(String(time.beats), 10) > 0)) {
    // Senza misura and other signatures without a meter: keep the current one, hide it.
    return '\\once \\omit Staff.TimeSignature';
  }
  if (time.printObject === false || time.senzaMisura) parts.push('\\once \\omit Staff.TimeSignature');
  if (time.beatsList && time.beatTypeList && time.beatTypeList.length > 1 && time.beatsList.length === time.beatTypeList.length) {
    const groups = time.beatsList.map((b, i) => `(${b} ${time.beatTypeList![i]})`).join(' ');
    parts.push(`\\compoundMeter #'(${groups})`);
    return parts.join(' ');
  }
  const beats = String(time.beats).trim();
  if (beats.includes('+')) {
    const groups = beats.split('+').map(s => parseInt(s, 10)).filter(n => n > 0);
    const total = groups.reduce((a, b) => a + b, 0);
    parts.push(`\\time ${groups.join(',')} ${total}/${time.beatType}`);
    return parts.join(' ');
  }
  const n = parseInt(beats, 10) || 4;
  const isCommon = (n === 4 && time.beatType === 4) || (n === 2 && time.beatType === 2);
  if (isCommon) {
    parts.push(time.symbol === 'common' || time.symbol === 'cut' ? '\\defaultTimeSignature' : '\\numericTimeSignature');
  } else if (time.symbol === 'single-number') {
    parts.push(`\\once \\override Staff.TimeSignature.stencil = #(lambda (grob) (grob-interpret-markup grob (markup #:number "${n}")))`);
  }
  parts.push(`\\time ${n}/${time.beatType}`);
  return parts.join(' ');
}

function timeLength(time: TimeSignature | undefined): Frac {
  if (!time || !time.beatType) return frac(1);
  if (time.beatsList && time.beatTypeList && time.beatsList.length === time.beatTypeList.length && time.beatTypeList.length > 0) {
    return time.beatsList.reduce((acc, b, i) => add(acc, frac(b, time.beatTypeList![i])), ZERO);
  }
  const beats = String(time.beats).split('+').reduce((a, s) => a + (parseInt(s, 10) || 0), 0) || 4;
  return frac(beats, time.beatType || 4);
}

function sameTime(a: TimeSignature | undefined, b: TimeSignature | undefined): boolean {
  if (!a || !b) return a === b;
  return a.beats === b.beats && a.beatType === b.beatType && a.symbol === b.symbol
    && JSON.stringify(a.beatsList) === JSON.stringify(b.beatsList)
    && JSON.stringify(a.beatTypeList) === JSON.stringify(b.beatTypeList);
}

function clefName(clef: Clef): string | null {
  let name: string | null = null;
  const line = clef.line;
  switch (clef.sign) {
    case 'G': name = line === 1 ? 'french' : 'treble'; break;
    case 'F': name = line === 3 ? 'varbaritone' : line === 5 ? 'subbass' : 'bass'; break;
    case 'C': name = ({ 1: 'soprano', 2: 'mezzosoprano', 3: 'alto', 4: 'tenor', 5: 'baritone' } as Record<number, string>)[line ?? 3] ?? 'alto'; break;
    case 'percussion': return 'percussion';
    case 'TAB': return null;
  }
  if (!name) return null;
  const change = clef.clefOctaveChange ?? 0;
  if (change === 1) return `"${name}^8"`;
  if (change === -1) return `"${name}_8"`;
  if (change === 2) return `"${name}^15"`;
  if (change === -2) return `"${name}_15"`;
  return name;
}

function transpositionPitch(t: Transpose): string {
  const octaveChange = t.octaveChange ?? 0;
  const steps = t.diatonic + 7 * octaveChange;
  const semis = t.chromatic + 12 * octaveChange;
  const octave = 4 + Math.floor(steps / 7);
  const stepIndex = ((steps % 7) + 7) % 7;
  const natural = STEP_SEMITONES[stepIndex] + 12 * (octave - 4);
  return pitchName(STEPS[stepIndex], semis - natural) + octaveMarks(octave);
}

function stringTuning(tunings: StaffTuning[]): string {
  const sorted = [...tunings].sort((a, b) => a.line - b.line);
  const pitches = sorted.map(t => serializePitch({ step: t.tuningStep as Pitch['step'], octave: t.tuningOctave, alter: t.tuningAlter }));
  return `\\stringTuning <${pitches.join(' ')}>`;
}

// ============================================================
// Text
// ============================================================

function quote(text: string): string {
  return '"' + text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, ' ') + '"';
}

/** Identifier made of letters only (LilyPond variable names cannot contain digits). */
function letters(index: number): string {
  let s = '';
  let n = index + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function textMarkup(text: string, style?: { fontStyle?: string; fontWeight?: string }): string {
  let m = quote(text);
  if (style?.fontWeight === 'bold') m = `\\bold ${m}`;
  if (style?.fontStyle === 'italic') m = `\\italic ${m}`;
  return m === quote(text) ? m : `\\markup { ${m} }`;
}

function lyricToken(text: string): string {
  if (/^[\p{L}\p{M}'’][\p{L}\p{M}'’,.!?;:]*$/u.test(text) && !text.endsWith('-')) return text;
  return quote(text);
}

// ============================================================
// Notations
// ============================================================

const DYNAMICS = new Set(['ppppp', 'pppp', 'ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff', 'ffff', 'fffff', 'fp', 'sf', 'sff', 'sp', 'spp', 'sfz', 'rfz', 'n']);

function dynamicMark(value: string): string {
  if (DYNAMICS.has(value)) return `\\${value}`;
  // The dynamics font only has the letters p, m, f, r, s, z and n.
  if (/^[pmfrszn]+$/.test(value)) return `#(make-dynamic-script ${quote(value)})`;
  return `#(make-dynamic-script (markup #:normal-text #:italic ${quote(value)}))`;
}

function dirPrefix(placement?: 'above' | 'below'): string {
  return placement === 'above' ? '^' : placement === 'below' ? '_' : '-';
}

const ARTICULATIONS: Partial<Record<string, string>> = {
  accent: '>', 'strong-accent': '^', staccato: '.', staccatissimo: '!', tenuto: '-',
  'detached-legato': '_', spiccato: '!',
};

const ARTICULATION_COMMANDS: Partial<Record<string, string>> = {
  'soft-accent': '\\espressivo',
};

const ORNAMENTS: Partial<Record<string, string>> = {
  'trill-mark': '\\trill', mordent: '\\mordent', 'inverted-mordent': '\\prall', turn: '\\turn',
  'inverted-turn': '\\reverseturn', 'delayed-turn': '\\turn', shake: '\\prall', haydn: '\\prall',
};

const TECHNICALS: Partial<Record<string, string>> = {
  'up-bow': '\\upbow', 'down-bow': '\\downbow', harmonic: '\\flageolet', 'open-string': '\\open',
  'thumb-position': '\\thumb', stopped: '\\stopped', 'snap-pizzicato': '\\snappizzicato',
  heel: '\\lheel', toe: '\\ltoe', open: '\\open', 'half-muted': '\\halfopen',
};

const NOTEHEAD_STYLE: Partial<Record<string, string>> = {
  x: 'cross', cross: 'cross', 'circle-x': 'xcircle', diamond: 'diamond', triangle: 'triangle', slash: 'slash',
  'inverted triangle': 'triangle', square: 'la', rectangle: 'la',
};

/** Post-events of a note that LilyPond writes inside a chord, per note. */
function perNoteMarks(note: NoteEntry): string {
  let s = '';
  for (const n of note.notations ?? []) {
    if (n.type !== 'technical') continue;
    if (n.technical === 'fingering' && n.fingering) {
      s += /^\d$/.test(n.fingering) ? `-${n.fingering}` : `-\\finger ${quote(n.fingering)}`;
    } else if (n.technical === 'string' && n.string) {
      s += `\\${n.string}`;
    }
  }
  return s;
}

interface NoteMarks {
  post: string[];
  tremolo?: number;
  arpeggio: boolean;
  breathe: boolean;
}

function noteMarks(notes: NoteEntry[], options: Required<LilyPondSerializeOptions>, dropped: Set<Notation>): NoteMarks {
  const post: string[] = [];
  const seen = new Set<string>();
  let tremolo: number | undefined;
  let arpeggio = false;
  let breathe = false;
  const push = (s: string) => { if (!seen.has(s)) { seen.add(s); post.push(s); } };
  const slurStops: string[] = [];
  const slurStarts: string[] = [];
  let trillSpan: 'start' | 'stop' | null = null;
  let hasTrillMark = false;

  for (const note of notes) {
    for (const n of note.notations ?? []) {
      switch (n.type) {
        case 'articulation': {
          if (n.articulation === 'breath-mark') { breathe = true; break; }
          if (n.articulation === 'caesura') { push('\\caesura'); break; }
          if (n.articulation === 'marcato') { push(`${dirPrefix(n.placement)}^`); break; }
          if (n.articulation === 'doit') { push('\\bendAfter #+4'); break; }
          if (n.articulation === 'falloff') { push('\\bendAfter #-4'); break; }
          const short = ARTICULATIONS[n.articulation];
          if (short) push(`${dirPrefix(n.placement)}${short}`);
          const cmd = ARTICULATION_COMMANDS[n.articulation];
          if (cmd) push(`${n.placement ? dirPrefix(n.placement) : ''}${cmd}`);
          break;
        }
        case 'ornament': {
          if (n.ornament === 'tremolo') {
            if ((n.tremoloType ?? 'single') === 'single' && n.tremoloMarks) tremolo = n.tremoloMarks;
            break;
          }
          if (n.ornament === 'wavy-line') {
            if (n.wavyLineType === 'start') trillSpan = 'start';
            else if (n.wavyLineType === 'stop') trillSpan = trillSpan === 'start' ? null : 'stop';
            break;
          }
          if (n.ornament === 'trill-mark') hasTrillMark = true;
          const cmd = ORNAMENTS[n.ornament];
          if (cmd) push(`${n.placement ? dirPrefix(n.placement) : ''}${cmd}`);
          break;
        }
        case 'technical': {
          if (n.technical === 'fingering' || n.technical === 'string') break; // per note
          const cmd = TECHNICALS[n.technical];
          if (cmd) push(`${n.placement ? dirPrefix(n.placement) : ''}${cmd}`);
          break;
        }
        case 'fermata': {
          const name = n.shape === 'angled' || n.shape === 'double-angled' ? '\\shortfermata'
            : n.shape === 'square' || n.shape === 'double-square' ? '\\longfermata' : '\\fermata';
          push(`${n.fermataType === 'inverted' ? '_' : ''}${name}`);
          break;
        }
        case 'dynamics':
          if (!options.includeDynamics) break;
          for (const d of n.dynamics) push(dynamicMark(d));
          if (n.otherDynamics) push(dynamicMark(n.otherDynamics));
          break;
        case 'slur': {
          if (dropped.has(n)) break;
          const id = n.number && n.number > 1 ? `\\=${n.number}` : '';
          if (n.slurType === 'start') slurStarts.push(`${id}(`);
          else if (n.slurType === 'stop') slurStops.push(`${id})`);
          break;
        }
        case 'arpeggiate':
          arpeggio = true;
          break;
        case 'glissando':
        case 'slide':
          if ((n.type === 'glissando' ? n.glissandoType : n.slideType) === 'start') push('\\glissando');
          break;
        case 'tied':
          if (n.tiedType === 'let-ring') push('\\laissezVibrer');
          break;
      }
    }
  }
  if (hasTrillMark && trillSpan === 'start') {
    // \startTrillSpan prints its own "tr".
    const i = post.findIndex(p => p.endsWith('\\trill'));
    if (i >= 0) post.splice(i, 1);
  }
  if (trillSpan === 'stop') post.push('\\stopTrillSpan');
  if (trillSpan === 'start') post.push('\\startTrillSpan');
  // A note can end one slur and start the next: close before opening.
  post.push(...slurStops, ...slurStarts);
  return { post, tremolo, arpeggio, breathe };
}

function hasTieStart(note: NoteEntry): boolean {
  if (note.tie?.type === 'start' || note.tie?.type === 'continue') return true;
  if (note.ties?.some(t => t.type === 'start' || t.type === 'continue')) return true;
  return (note.notations ?? []).some(n => n.type === 'tied' && (n.tiedType === 'start' || n.tiedType === 'continue'));
}

function notationsOf<T extends Notation['type']>(note: NoteEntry, type: T): Extract<Notation, { type: T }>[] {
  return (note.notations ?? []).filter(n => n.type === type) as Extract<Notation, { type: T }>[];
}

// ============================================================
// Chord symbols
// ============================================================

const CHORD_KINDS: Record<string, string> = {
  major: '', minor: 'm', augmented: 'aug', diminished: 'dim', dominant: '7',
  'major-seventh': 'maj7', 'minor-seventh': 'm7', 'diminished-seventh': 'dim7',
  'augmented-seventh': 'aug7', 'half-diminished': 'm7.5-', 'major-minor': 'm7+',
  'major-sixth': '6', 'minor-sixth': 'm6', 'dominant-ninth': '9', 'major-ninth': 'maj9',
  'minor-ninth': 'm9', 'dominant-11th': '11', 'major-11th': 'maj11', 'minor-11th': 'm11',
  'dominant-13th': '13', 'major-13th': 'maj13', 'minor-13th': 'm13',
  'suspended-second': 'sus2', 'suspended-fourth': 'sus4', power: '1.5', pedal: '1',
};

function serializeChordSymbol(h: HarmonyEntry, dur: string): string {
  if (h.kind === 'none') return `r${dur}`;
  let name = pitchName(h.root.rootStep, h.root.rootAlter ?? 0) + dur;
  let mod = CHORD_KINDS[h.kind] ?? '';
  const adds: string[] = [];
  const removes: string[] = [];
  for (const d of h.degrees ?? []) {
    const alt = (d.degreeAlter ?? 0) > 0 ? '+' : (d.degreeAlter ?? 0) < 0 ? '-' : '';
    if (d.degreeType === 'subtract') removes.push(String(d.degreeValue));
    else adds.push(`${d.degreeValue}${alt}`);
  }
  // Additions only combine with plain step chords (5, 7, m7, maj7, ...).
  if (adds.length && /^(m|maj)?\d*$|^$/.test(mod)) {
    if (mod === '' || mod === 'm') mod += '5';
    mod += '.' + adds.join('.');
  }
  if (removes.length && !mod.startsWith('sus')) mod = (mod || '5') + '^' + removes.join('.');
  if (mod) name += ':' + mod;
  if (h.bass) name += '/' + pitchName(h.bass.bassStep, h.bass.bassAlter ?? 0);
  return name;
}

// ============================================================
// Score analysis
// ============================================================


interface NoteEvent {
  start: Frac;
  dur: Frac;
  notes: NoteEntry[];
  grace: boolean;
}

interface Marker {
  pos: Frac;
  text: string;
  /** Post-event (attached to a note) or a standalone command. */
  post: boolean;
}

interface MarkerTarget { staff: number; voice?: string }

interface MeasureInfo {
  events: Map<string, NoteEvent[]>;
  markers: { target: MarkerTarget; marker: Marker }[];
  /** Commands placed at the start of every staff of the part (clef, key, time). */
  staffStart: Map<number, string[]>;
  staffMid: { staff: number; marker: Marker }[];
  harmonies: { pos: Frac; harmony: HarmonyEntry }[];
  end: Frac;
}

interface PartInfoData {
  part: Part;
  info: PartInfo | undefined;
  measures: MeasureInfo[];
  staves: number;
  /** Voice ids per staff in first-appearance order. */
  voices: Map<number, string[]>;
  /** Lyric verses per voice key. */
  verses: Map<string, string[]>;
  tabStaves: Map<number, StaffTuning[] | undefined>;
  transpose?: Transpose;
  times: (TimeSignature | undefined)[];
  hasBeams: Set<string>;
  droppedSlurs: Set<Notation>;
}

const vkey = (staff: number, voice: string) => `${staff}:${voice}`;

interface ScoreMarker { measure: number; pos: Frac; text: string }

function analyzePart(part: Part, info: PartInfo | undefined, scoreMarkers: ScoreMarker[], options: Required<LilyPondSerializeOptions>): PartInfoData {
  let divisions = 1;
  let staves = 1;
  const voices = new Map<number, string[]>();
  const verses = new Map<string, string[]>();
  const tabStaves = new Map<number, StaffTuning[] | undefined>();
  const hasBeams = new Set<string>();
  let transpose: Transpose | undefined;
  const times: (TimeSignature | undefined)[] = [];
  let currentTime: TimeSignature | undefined;
  const currentKey = new Map<number, string>();
  const currentClef = new Map<number, string>();
  const tunings = new Map<number, StaffTuning[]>();

  const addVoice = (staff: number, voice: string) => {
    const list = voices.get(staff) ?? [];
    if (!list.includes(voice)) list.push(voice);
    voices.set(staff, list);
  };

  const measures: MeasureInfo[] = part.measures.map((measure, mi) => {
    const m: MeasureInfo = { events: new Map(), markers: [], staffStart: new Map(), staffMid: [], harmonies: [], end: ZERO };
    const startCommands = (staff: number) => {
      const list = m.staffStart.get(staff) ?? [];
      m.staffStart.set(staff, list);
      return list;
    };

    const applyAttributes = (attrs: MeasureAttributes, pos: Frac) => {
      if (attrs.divisions) divisions = attrs.divisions;
      if (attrs.staves) staves = Math.max(staves, attrs.staves);
      if (attrs.transpose && mi === 0) transpose = attrs.transpose;
      for (const sd of attrs.staffDetails ?? []) {
        if (sd.staffTuning?.length) tunings.set(sd.number ?? 1, sd.staffTuning);
      }
      const atStart = isZero(pos);
      const staffList = () => Array.from({ length: staves }, (_, i) => i + 1);
      const time = attrs.time ?? attrs.times?.[0];
      if (time && !sameTime(time, currentTime)) {
        currentTime = time;
        if (atStart) for (const s of staffList()) startCommands(s).push(serializeTime(time));
        else for (const s of staffList()) m.staffMid.push({ staff: s, marker: { pos, text: serializeTime(time), post: false } });
      }
      const keys = attrs.keys?.length ? attrs.keys : attrs.key ? [attrs.key] : [];
      for (const key of keys) {
        const text = serializeKey(key);
        if (!text) continue;
        for (const s of key.number ? [key.number] : staffList()) {
          if (currentKey.get(s) === text) continue;
          currentKey.set(s, text);
          const full = key.printObject === false ? `\\once \\omit Staff.KeySignature ${text}` : text;
          if (atStart) startCommands(s).push(full);
          else m.staffMid.push({ staff: s, marker: { pos, text: full, post: false } });
        }
      }
      for (const clef of attrs.clef ?? []) {
        const s = clef.staff ?? 1;
        if (clef.sign === 'TAB') { tabStaves.set(s, undefined); continue; }
        const name = clefName(clef);
        if (!name || currentClef.get(s) === name) continue;
        currentClef.set(s, name);
        if (atStart) startCommands(s).push(`\\clef ${name}`);
        else m.staffMid.push({ staff: s, marker: { pos, text: `\\clef ${name}`, post: false } });
      }
    };

    if (measure.attributes) applyAttributes(measure.attributes, ZERO);
    times.push(currentTime);

    let pos: Frac = ZERO;
    let lastEvent: NoteEvent | null = null;
    const toFrac = (d: number) => frac(d, divisions * 4);

    for (const entry of measure.entries) {
      switch (entry.type) {
        case 'attributes':
          applyAttributes(entry.attributes, pos);
          break;
        case 'backup':
          pos = sub(pos, toFrac(entry.duration));
          if (cmp(pos, ZERO) < 0) pos = ZERO;
          break;
        case 'forward':
          pos = add(pos, toFrac(entry.duration));
          m.end = max(m.end, pos);
          break;
        case 'note': {
          const note = entry;
          if (note.chord && lastEvent) {
            lastEvent.notes.push(note);
            break;
          }
          const grace = !!note.grace;
          const dur = grace ? ZERO : toFrac(note.duration);
          if (!grace && isZero(dur)) break;
          const staff = note.staff ?? 1;
          const voice = note.voice ?? '1';
          staves = Math.max(staves, staff);
          const ev: NoteEvent = { start: pos, dur, notes: [note], grace };
          lastEvent = ev;
          const key = vkey(staff, voice);
          const list = m.events.get(key) ?? [];
          list.push(ev);
          m.events.set(key, list);
          if (!grace) pos = add(pos, dur);
          m.end = max(m.end, pos);
          break;
        }
        case 'direction': {
          // <offset> mostly nudges where a mark is drawn; the mark stays with its note.
          collectDirection(entry, pos, mi, m, scoreMarkers, options);
          break;
        }
        case 'harmony': {
          const hpos = entry.offset ? max(ZERO, add(pos, toFrac(entry.offset))) : pos;
          m.harmonies.push({ pos: hpos, harmony: entry });
          break;
        }
        default:
          break;
      }
    }

    // Sort each voice by onset and move overlapping notes into extra voices.
    const resolved = new Map<string, NoteEvent[]>();
    for (const [key, list] of m.events) {
      const [staffStr, voice] = splitKey(key);
      const staff = Number(staffStr);
      list.sort((a, b) => cmp(a.start, b.start));
      const lanes: { voice: string; events: NoteEvent[]; end: Frac }[] = [];
      for (const ev of list) {
        let lane = lanes.find(l => cmp(ev.start, l.end) >= 0);
        if (!lane) {
          lane = { voice: voice + "'".repeat(lanes.length), events: [], end: ZERO };
          lanes.push(lane);
        }
        lane.events.push(ev);
        lane.end = max(lane.end, add(ev.start, ev.dur));
      }
      for (const lane of lanes) {
        addVoice(staff, lane.voice);
        resolved.set(vkey(staff, lane.voice), lane.events);
        for (const ev of lane.events) {
          for (const note of ev.notes) {
            if (note.beam?.length) hasBeams.add(vkey(staff, lane.voice));
            for (const lyric of note.lyrics ?? []) {
              if (!lyric.text && !lyric.textElements?.length) continue;
              const verse = lyric.numberText ?? String(lyric.number ?? 1);
              const vk = vkey(staff, lane.voice);
              const vs = verses.get(vk) ?? [];
              if (!vs.includes(verse)) vs.push(verse);
              verses.set(vk, vs);
            }
          }
        }
      }
    }
    m.events = resolved;
    return m;
  });

  const droppedSlurs = findCrossVoiceSlurs(measures);

  for (let s = 1; s <= staves; s++) if (!voices.has(s)) voices.set(s, ['1']);
  for (const [s] of tabStaves) tabStaves.set(s, tunings.get(s));
  for (const list of voices.values()) list.sort(compareVoiceIds);

  return { part, info, measures, staves, voices, verses, tabStaves, transpose, times, hasBeams, droppedSlurs };
}

/**
 * Slurs whose start and stop are not in the same voice, or that are never
 * closed. MusicXML pairs slurs by number across voices and staves; LilyPond
 * slurs live in one voice, so these are left out.
 */
function findCrossVoiceSlurs(measures: MeasureInfo[]): Set<Notation> {
  const items: { mi: number; pos: Frac; grace: boolean; voice: string; slur: Extract<Notation, { type: 'slur' }>; order: number }[] = [];
  let order = 0;
  measures.forEach((m, mi) => {
    for (const [voice, events] of m.events) {
      for (const ev of events) {
        for (const note of ev.notes) {
          for (const n of note.notations ?? []) {
            if (n.type === 'slur') items.push({ mi, pos: ev.start, grace: ev.grace, voice, slur: n, order: order++ });
          }
        }
      }
    }
  });
  const rank = (t: string) => (t === 'stop' ? 0 : t === 'continue' ? 1 : 2);
  items.sort((a, b) => a.mi - b.mi || cmp(a.pos, b.pos) || Number(b.grace) - Number(a.grace) || rank(a.slur.slurType) - rank(b.slur.slurType) || a.order - b.order);
  const dropped = new Set<Notation>();
  const open = new Map<number, (typeof items)[number]>();
  for (const item of items) {
    const number = item.slur.number ?? 1;
    if (item.slur.slurType === 'start') {
      const prev = open.get(number);
      if (prev) dropped.add(prev.slur);
      open.set(number, item);
    } else if (item.slur.slurType === 'stop') {
      const start = open.get(number);
      open.delete(number);
      if (!start || start.voice !== item.voice) {
        dropped.add(item.slur);
        if (start) dropped.add(start.slur);
      }
    }
  }
  for (const item of open.values()) dropped.add(item.slur);
  return dropped;
}

function splitKey(key: string): [string, string] {
  const i = key.indexOf(':');
  return [key.slice(0, i), key.slice(i + 1)];
}

function compareVoiceIds(a: string, b: string): number {
  const na = parseInt(a, 10);
  const nb = parseInt(b, 10);
  if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb;
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Text the ABC importer keeps only so ABC can be written back: inline fields
 * (`[M:3/4]`), line-break markers and decorations with no MusicXML meaning.
 */
function isAbcRoundTripText(text: string): boolean {
  return text.startsWith('__abc_') || /^\[[A-Za-z]:.*\]$/s.test(text) || /^(![^!]*!|\+[^+]*\+)$/.test(text);
}

function collectDirection(
  dir: DirectionEntry,
  pos: Frac,
  mi: number,
  m: MeasureInfo,
  scoreMarkers: ScoreMarker[],
  options: Required<LilyPondSerializeOptions>,
) {
  const target: MarkerTarget = { staff: dir.staff ?? 1, voice: dir.voice };
  const post = (text: string) => m.markers.push({ target, marker: { pos, text, post: true } });
  const pre = (text: string) => m.markers.push({ target, marker: { pos, text, post: false } });
  const types = dir.directionTypes;
  const metronome = types.find((t): t is Extract<DirectionType, { kind: 'metronome' }> => t.kind === 'metronome');
  const words = types.filter((t): t is Extract<DirectionType, { kind: 'words' }> => t.kind === 'words');

  if (metronome) {
    const text = words.map(w => w.text).join(' ').trim();
    const unit = NOTE_TYPE_LY[metronome.beatUnit] + (metronome.beatUnitDot ? '.' : '');
    const perMinute = String(metronome.perMinute ?? '').trim();
    const range = perMinute.match(/^(\d+)\s*[-–]\s*(\d+)$/);
    let tempo: string | null = null;
    if (/^\d+$/.test(perMinute)) tempo = `${unit} = ${perMinute}`;
    else if (range) tempo = `${unit} = ${range[1]} - ${range[2]}`;
    if (metronome.printObject === false && tempo) {
      scoreMarkers.push({ measure: mi, pos, text: text ? `\\tempo ${quote(text)}` : `\\tempo ${tempo}` });
    } else if (tempo || text) {
      scoreMarkers.push({ measure: mi, pos, text: `\\tempo ${[text ? quote(text) : '', tempo ?? ''].filter(Boolean).join(' ')}` });
    }
  }

  for (const t of types) {
    switch (t.kind) {
      case 'dynamics': {
        if (!options.includeDynamics) break;
        const value = t.value ?? t.otherDynamics;
        if (value) post(`${dir.placement === 'above' ? '^' : ''}${dynamicMark(value)}`);
        break;
      }
      case 'wedge':
        if (!options.includeDynamics) break;
        post(t.type === 'crescendo' ? '\\<' : t.type === 'diminuendo' ? '\\>' : '\\!');
        break;
      case 'words':
        if (metronome || !t.text.trim() || isAbcRoundTripText(t.text)) break;
        post(`${dir.placement === 'below' ? '_' : '^'}${textMarkup(t.text, t)}`);
        break;
      case 'rehearsal': {
        const m2 = quote(t.text);
        const boxed = t.enclosure === 'none' ? m2 : t.enclosure === 'circle' ? `\\circle ${m2}` : `\\box ${m2}`;
        scoreMarkers.push({ measure: mi, pos, text: `\\mark \\markup { ${boxed} }` });
        break;
      }
      case 'segno':
        scoreMarkers.push({ measure: mi, pos, text: '\\mark \\markup { \\musicglyph "scripts.segno" }' });
        break;
      case 'coda':
        scoreMarkers.push({ measure: mi, pos, text: '\\mark \\markup { \\musicglyph "scripts.coda" }' });
        break;
      case 'pedal':
        if (t.type === 'start') post('\\sustainOn');
        else if (t.type === 'stop') post('\\sustainOff');
        else if (t.type === 'change') post('\\sustainOff\\sustainOn');
        break;
      case 'octave-shift': {
        const size = t.size === 15 ? 2 : t.size === 22 ? 3 : 1;
        // Pitches are sounding; "down" means the notes are printed lower, i.e. 8va.
        if (t.type === 'down') pre(`\\ottava #${size}`);
        else if (t.type === 'up') pre(`\\ottava #-${size}`);
        else pre('\\ottava #0');
        break;
      }
      default:
        break;
    }
  }
}

// ============================================================
// Barlines and repeats
// ============================================================

const BAR_STYLES: Partial<Record<NonNullable<Barline['barStyle']>, string>> = {
  'light-light': '||', 'light-heavy': '|.', 'heavy-light': '.|', 'heavy-heavy': '..',
  heavy: '.', dotted: ';', dashed: '!', tick: "'", short: ',', none: '',
};

function endingText(ending: NonNullable<Barline['ending']>): string {
  if (ending.text?.trim()) return ending.text.trim();
  return ending.number.split(/[,\s]+/).filter(Boolean).map(n => `${n}.`).join(' ');
}

/**
 * Bar line, repeat and volta commands at each measure boundary: index `mi` is
 * the boundary before measure `mi`, the last one is after the final measure.
 */
function boundaryCommands(measures: Measure[]): string[][] {
  const result: string[][] = [];
  let voltaOpen = false;
  for (let mi = 0; mi <= measures.length; mi++) {
    const prev = measures[mi - 1];
    const cur = measures[mi];
    // The bar line between two measures can be stored on either side of it.
    const bars = [
      ...(prev?.barlines?.filter(b => b.location === 'right') ?? []),
      ...(cur?.barlines?.filter(b => b.location === 'left') ?? []),
    ];
    const endingStart = bars.find(b => b.ending?.type === 'start')?.ending;
    const backward = bars.some(b => b.repeat?.direction === 'backward');
    const forward = bars.some(b => b.repeat?.direction === 'forward');
    const repeat: string[] = [];
    const closesVolta = bars.some(b => b.ending && b.ending.type !== 'start')
      || !!endingStart || forward || mi === measures.length;
    if (voltaOpen && closesVolta) {
      repeat.push('(volta #f)');
      voltaOpen = false;
    }
    if (backward) repeat.push('end-repeat');
    if (forward) repeat.push('start-repeat');
    if (endingStart) {
      repeat.push(`(volta ${quote(endingText(endingStart))})`);
      voltaOpen = true;
    }
    const out: string[] = [];
    if (repeat.length) out.push(`\\set Score.repeatCommands = #'(${repeat.join(' ')})`);
    if (!backward && !forward) {
      const style = bars.map(b => b.barStyle).find(st => st && st !== 'regular');
      if (style && BAR_STYLES[style] !== undefined) out.push(`\\bar ${quote(BAR_STYLES[style]!)}`);
    }
    result.push(out);
  }
  return result;
}

// ============================================================
// Voice serialization
// ============================================================

interface TupletFrame {
  /** Sounding length of written values: normal / actual. */
  ratio: Frac;
}

interface VoiceContext {
  partIndex: number;
  staff: number;
  voice: string;
  key: string;
  isFirstVoice: boolean;
  isGlobal: boolean;
  isTab: boolean;
  beams: boolean;
  verses: string[];
  /** The measure being written is as long as its time signature (so `R` fits). */
  fullMeasure: boolean;
  lastMeasure: boolean;
  droppedSlurs: Set<Notation>;
}

interface Emitter {
  tokens: string[];
  lyrics: Map<string, string[]>;
  beamOpen: boolean;
  /** Index of the token of the last note (beam ends move onto it). */
  lastNoteToken: number;
  /** Index of the token that opened the current beam. */
  beamStartToken: number;
  tuplets: TupletFrame[];
}

function tupletScale(tuplets: TupletFrame[]): Frac {
  return tuplets.reduce((acc, t) => mul(acc, t.ratio), frac(1));
}

function writtenDuration(note: NoteEntry, actual: Frac, tuplets: TupletFrame[], grace: boolean): string {
  // Inside \tuplet a/n written values sound n/a as long.
  const scale = tupletScale(tuplets);
  if (note.noteType && NOTE_TYPE_LY[note.noteType]) {
    const base = NOTE_TYPE_LY[note.noteType] + '.'.repeat(note.dots ?? 0);
    if (grace) return base;
    const expected = mul(dottedValue(note.noteType, note.dots ?? 0), scale);
    if (eq(expected, actual)) return base;
    return base + multiplierString(div(actual, expected));
  }
  if (grace) return '8';
  return durationString(div(actual, scale));
}

function lyricText(lyric: Lyric): string {
  const parts = lyric.textElements?.length ? lyric.textElements.map(t => t.text) : [lyric.text];
  let token = parts.map(lyricToken).join('~');
  if (lyric.syllabic === 'begin' || lyric.syllabic === 'middle') token += ' --';
  const extend = lyric.extend === true || (typeof lyric.extend === 'object' && lyric.extend.type !== 'stop');
  if (extend) token += ' __';
  return token;
}

function serializeEvent(
  ev: NoteEvent,
  ctx: VoiceContext,
  em: Emitter,
  posts: string[],
  measureLength: Frac,
  options: Required<LilyPondSerializeOptions>,
): string {
  const head = ev.notes[0];
  const marks = noteMarks(ev.notes, options, ctx.droppedSlurs);
  const allPosts = [...posts, ...marks.post];

  // Rests
  if (head.rest) {
    // Beams start and end on notes: a beam ending on a rest ends on the note before it.
    if (ctx.beams && em.beamOpen && head.beam?.find(b => b.number === 1)?.type === 'end') closeBeam(em);
    const hidden = head.printObject === false;
    const isMeasureRest = ctx.fullMeasure && !ev.grace && isZero(ev.start) && (head.rest.measure || !head.noteType) && eq(ev.dur, measureLength) && em.tuplets.length === 0;
    if (isMeasureRest && !hidden && !head.rest.displayStep) return `R${durationString(ev.dur)}${allPosts.join('')}`;
    const dur = writtenDuration(head, ev.dur, em.tuplets, ev.grace);
    if (hidden) return `s${dur}${allPosts.join('')}`;
    if (head.rest.displayStep && head.rest.displayOctave !== undefined) {
      return `${serializePitch({ step: head.rest.displayStep as Pitch['step'], octave: head.rest.displayOctave })}${dur}\\rest${allPosts.join('')}`;
    }
    return `r${dur}${allPosts.join('')}`;
  }

  const pitchOf = (note: NoteEntry): string => {
    if (note.pitch) return serializePitch(note.pitch);
    if (note.unpitched?.displayStep) {
      return serializePitch({ step: note.unpitched.displayStep as Pitch['step'], octave: note.unpitched.displayOctave ?? 4 });
    }
    return "b'";
  };
  const accidentalFlag = (note: NoteEntry): string => {
    const acc = note.accidental;
    if (!acc) return '';
    if (acc.cautionary || acc.parentheses) return '?';
    if (acc.editorial || acc.bracket) return '!';
    return '';
  };
  const tweaks = (note: NoteEntry): string => {
    const style = note.notehead ? NOTEHEAD_STYLE[note.notehead.value] : undefined;
    let s = style ? `\\tweak style #'${style} ` : '';
    if (note.notehead?.parentheses) s += '\\parenthesize ';
    return s;
  };

  const dur = writtenDuration(head, ev.dur, em.tuplets, ev.grace);
  const flags = head.noteType ? Math.max(0, Math.round(Math.log2(1 / (NOTE_TYPE_VALUE[head.noteType].n / NOTE_TYPE_VALUE[head.noteType].d))) - 2) : 0;
  const tremolo = marks.tremolo ? `:${2 ** (2 + flags + marks.tremolo)}` : '';
  const notes = ev.notes.filter((n, i) => i === 0 || !n.rest);
  const ties = notes.map(hasTieStart);
  const allTied = ties.every(Boolean);

  let body: string;
  if (notes.length === 1) {
    body = `${tweaks(head)}${pitchOf(head)}${accidentalFlag(head)}${dur}${tremolo}${ties[0] ? '~' : ''}${perNoteMarks(head)}`;
  } else {
    const inner = notes.map((n, i) => `${tweaks(n)}${pitchOf(n)}${accidentalFlag(n)}${perNoteMarks(n)}${ties[i] && !allTied ? '~' : ''}`);
    body = `<${inner.join(' ')}>${dur}${tremolo}${allTied ? '~' : ''}`;
  }

  if (marks.arpeggio) allPosts.push('\\arpeggio');

  // Beams
  let beamMark = '';
  if (ctx.beams && !ev.grace) {
    const beam1 = head.beam?.find(b => b.number === 1);
    if (beam1?.type === 'begin' && !em.beamOpen) {
      beamMark = '[';
      em.beamOpen = true;
      em.beamStartToken = em.tokens.length;
    } else if (beam1?.type === 'end' && em.beamOpen) {
      beamMark = ']';
      em.beamOpen = false;
    }
  }

  let text = body + beamMark + allPosts.join('');
  if (marks.breathe) text += ' \\breathe';
  return text;
}

/** Whether the first beamed note of the next measure continues an open beam. */
function beamContinues(next: NoteEvent[] | undefined): boolean {
  const ev = next?.find(e => !e.grace && !e.notes[0].rest);
  const type = ev?.notes[0].beam?.find(b => b.number === 1)?.type;
  return type === 'continue' || type === 'end';
}

/** End an open beam on the last note written (or drop it if that note opened it). */
function closeBeam(em: Emitter) {
  em.beamOpen = false;
  const last = em.lastNoteToken;
  if (last < 0) return;
  if (last === em.beamStartToken) {
    em.tokens[last] = em.tokens[last].replace('[', '');
    return;
  }
  const token = em.tokens[last];
  const breathe = token.indexOf(' \\breathe');
  em.tokens[last] = breathe >= 0 ? `${token.slice(0, breathe)}]${token.slice(breathe)}` : `${token}]`;
}

function serializeVoiceMeasure(
  events: NoteEvent[],
  markers: Marker[],
  length: Frac,
  ctx: VoiceContext,
  em: Emitter,
  options: Required<LilyPondSerializeOptions>,
) {
  let cursor: Frac = ZERO;
  const pending = [...markers].sort((a, b) => cmp(a.pos, b.pos));
  let postQueue: string[] = [];

  const takeMarkers = (upTo: Frac) => {
    while (pending.length && cmp(pending[0].pos, upTo) <= 0) {
      const mk = pending.shift()!;
      if (mk.post) postQueue.push(mk.text);
      else em.tokens.push(mk.text);
    }
  };

  const fillTo = (target: Frac) => {
    takeMarkers(cursor);
    while (cmp(cursor, target) < 0) {
      let boundary = target;
      if (pending.length && cmp(pending[0].pos, target) < 0) boundary = pending[0].pos;
      const gap = sub(boundary, cursor);
      const written = div(gap, tupletScale(em.tuplets));
      em.tokens.push(`s${durationString(written)}${postQueue.join('')}`);
      postQueue = [];
      cursor = boundary;
      takeMarkers(cursor);
    }
  };

  let i = 0;
  while (i < events.length) {
    const ev = events[i];
    if (cmp(ev.start, cursor) > 0) fillTo(ev.start);
    else takeMarkers(cursor);

    if (ev.grace) {
      // A run of grace notes before the next main note.
      const run: NoteEvent[] = [];
      while (i < events.length && events[i].grace) run.push(events[i++]);
      const inner = run.map(g => serializeEvent(g, ctx, em, [], length, options)).join(' ');
      const slash = run[0].notes[0].grace?.slash;
      const cmd = slash ? (run.length === 1 ? '\\acciaccatura' : '\\slashedGrace') : '\\grace';
      em.tokens.push(run.length === 1 ? `${cmd} ${inner}` : `${cmd} { ${inner} }`);
      continue;
    }

    const head = ev.notes[0];
    for (const t of notationsOf(head, 'tuplet')) {
      if (t.tupletType !== 'start') continue;
      const tm = head.timeModification;
      let actual: number;
      let normal: number;
      if (t.tupletActual?.tupletNumber && t.tupletNormal?.tupletNumber) {
        actual = t.tupletActual.tupletNumber;
        normal = t.tupletNormal.tupletNumber;
      } else if (tm && em.tuplets.length === 0) {
        actual = tm.actualNotes;
        normal = tm.normalNotes;
      } else if (tm) {
        const inner = div(frac(tm.normalNotes, tm.actualNotes), tupletScale(em.tuplets));
        actual = inner.d;
        normal = inner.n;
      } else continue;
      if (!actual || !normal || actual === normal) continue;
      const ratio = frac(normal, actual);
      em.tuplets.push({ ratio });
      em.tokens.push(`\\tuplet ${actual}/${normal} {`);
    }

    let text = serializeEvent(ev, ctx, em, postQueue, length, options);
    postQueue = [];
    // Grace notes after the last note of the measure belong to that note.
    const following = events.slice(i + 1);
    const afterGraces = following.length > 0 && following.every(e => e.grace);
    if (afterGraces) {
      const graces = following.map(g => serializeEvent(g, ctx, em, [], length, options)).join(' ');
      text = `\\afterGrace ${text} { ${graces} }`;
    }
    em.tokens.push(text);
    if (!head.rest) em.lastNoteToken = em.tokens.length - 1;

    // Lyrics: one syllable (or skip) per sounding note.
    if (!head.rest && ctx.verses.length) {
      for (const verse of ctx.verses) {
        const list = em.lyrics.get(verse) ?? [];
        const lyric = ev.notes.flatMap(n => n.lyrics ?? []).find(l => (l.numberText ?? String(l.number ?? 1)) === verse && (l.text || l.textElements?.length));
        list.push(lyric ? lyricText(lyric) : '_');
        em.lyrics.set(verse, list);
      }
    }

    for (const t of notationsOf(head, 'tuplet')) {
      if (t.tupletType === 'stop' && em.tuplets.length) {
        em.tuplets.pop();
        em.tokens.push('}');
      }
    }
    cursor = max(cursor, add(ev.start, ev.dur));
    i = afterGraces ? events.length : i + 1;
  }

  // Tuplets do not continue across the bar line.
  while (em.tuplets.length) {
    em.tuplets.pop();
    em.tokens.push('}');
  }
  if (cmp(cursor, length) < 0) fillTo(length);
  takeMarkers(frac(Number.MAX_SAFE_INTEGER));
  if (postQueue.length) {
    // After the final bar line there is nothing to attach to: use the last note.
    const last = em.lastNoteToken;
    if (ctx.lastMeasure && last >= 0 && !em.tokens[last].startsWith('\\afterGrace')) {
      const token = em.tokens[last];
      const breathe = token.indexOf(' \\breathe');
      const marks = postQueue.join('');
      em.tokens[last] = breathe >= 0 ? `${token.slice(0, breathe)}${marks}${token.slice(breathe)}` : `${token}${marks}`;
    } else {
      em.tokens.push(`<>${postQueue.join('')}`);
    }
    postQueue = [];
  }
}

// ============================================================
// Score structure
// ============================================================

type StaffTree =
  | { kind: 'part'; index: number }
  | { kind: 'group'; group: PartGroup; children: StaffTree[] };

function buildTree(score: Score): StaffTree[] {
  const root: StaffTree[] = [];
  const stack: { number: number; node: Extract<StaffTree, { kind: 'group' }> }[] = [];
  let partIndex = 0;
  const current = () => (stack.length ? stack[stack.length - 1].node.children : root);
  for (const entry of score.partList) {
    if (entry.type === 'part-group') {
      const number = entry.number ?? 1;
      if (entry.groupType === 'start') {
        const node: Extract<StaffTree, { kind: 'group' }> = { kind: 'group', group: entry, children: [] };
        current().push(node);
        stack.push({ number, node });
      } else {
        const i = stack.map(s => s.number).lastIndexOf(number);
        if (i >= 0) stack.splice(i);
      }
    } else if (partIndex < score.parts.length) {
      current().push({ kind: 'part', index: partIndex++ });
    }
  }
  while (partIndex < score.parts.length) root.push({ kind: 'part', index: partIndex++ });
  return root;
}

function indentLines(lines: string[], depth: number): string[] {
  const pad = '  '.repeat(depth);
  return lines.map(l => (l ? pad + l : l));
}

// ============================================================
// Entry point
// ============================================================

const DEFAULTS: Required<LilyPondSerializeOptions> = {
  version: '2.24.0',
  includeHeader: true,
  includeChordSymbols: true,
  includeLyrics: true,
  includeDynamics: true,
  includeLayoutBreaks: false,
  preserveBeams: true,
  midi: false,
};

/**
 * Serialize a Score to LilyPond source.
 *
 * @example
 * ```ts
 * import { parse } from 'musicxml-io';
 * import { serializeLilyPond } from 'musicxml-io/lilypond';
 *
 * const ly = serializeLilyPond(parse(xml));
 * // write to score.ly and run `lilypond score.ly`
 * ```
 */
export function serializeLilyPond(score: Score, options: LilyPondSerializeOptions = {}): string {
  const opts: Required<LilyPondSerializeOptions> = { ...DEFAULTS, ...options };
  const out: string[] = [`\\version ${quote(opts.version)}`, ''];

  if (opts.includeHeader) {
    const header = headerLines(score);
    if (header.length) out.push('\\header {', ...indentLines(header, 1), '}', '');
  }

  const partInfos = score.partList.filter((p): p is PartInfo => p.type === 'score-part');
  const scoreMarkers: ScoreMarker[] = [];
  const parts = score.parts.map((part, i) => analyzePart(part, partInfos.find(p => p.id === part.id) ?? partInfos[i], scoreMarkers, opts));
  const measureCount = Math.max(0, ...parts.map(p => p.measures.length));

  // Measure lengths shared by all parts.
  const lengths: Frac[] = [];
  const nominal: Frac[] = [];
  for (let mi = 0; mi < measureCount; mi++) {
    const time = parts.find(p => p.times[mi])?.times[mi];
    const nominalLength = timeLength(time);
    nominal.push(nominalLength);
    let content = ZERO;
    for (const p of parts) if (p.measures[mi]) content = max(content, p.measures[mi].end);
    const implicit = parts.some(p => p.part.measures[mi]?.implicit);
    const edge = mi === 0 || mi === measureCount - 1 || implicit;
    lengths.push(isZero(content) ? nominalLength : edge ? content : max(content, nominalLength));
  }

  const firstMeasures = parts[0]?.part.measures ?? [];
  const boundaries = boundaryCommands(firstMeasures);
  const variables: string[] = [];
  const staffBlocks = new Map<number, string[]>();

  parts.forEach((p, pi) => {
    const partName = `part${letters(pi)}`;
    const staffContexts: { staff: number; lines: string[]; lyrics: string[] }[] = [];

    for (let staff = 1; staff <= p.staves; staff++) {
      const voiceIds = p.voices.get(staff) ?? ['1'];
      const staffName = `${partName}Staff${letters(staff - 1)}`;
      const voiceLines: string[] = [];
      const lyricLines: string[] = [];

      voiceIds.forEach((voice, vi) => {
        const key = vkey(staff, voice);
        const voiceName = `${staffName}Voice${letters(vi)}`;
        const ctx: VoiceContext = {
          partIndex: pi, staff, voice, key,
          isFirstVoice: vi === 0,
          isGlobal: pi === 0 && staff === 1 && vi === 0,
          isTab: p.tabStaves.has(staff),
          beams: opts.preserveBeams && p.hasBeams.has(key),
          verses: opts.includeLyrics ? p.verses.get(key) ?? [] : [],
          fullMeasure: true,
          lastMeasure: false,
          droppedSlurs: p.droppedSlurs,
        };
        const em: Emitter = { tokens: [], lyrics: new Map(), beamOpen: false, lastNoteToken: -1, beamStartToken: -1, tuplets: [] };
        const lines: string[] = [];
        let timingLength = nominal[0] ?? frac(1);
        if (ctx.beams) lines.push('\\autoBeamOff');
        if (ctx.isFirstVoice && p.transpose) lines.push(`\\transposition ${transpositionPitch(p.transpose)}`);

        for (let mi = 0; mi < measureCount; mi++) {
          const m = p.measures[mi];
          const firstToken = em.tokens.length;
          const length = lengths[mi];
          const head: string[] = [];
          if (ctx.isGlobal) {
            head.push(...boundaries[mi]);
            if (opts.includeLayoutBreaks && mi > 0) {
              const print = firstMeasures[mi]?.print;
              if (print?.newPage) head.push('\\pageBreak');
              else if (print?.newSystem) head.push('\\break');
            }
          }
          if (ctx.isFirstVoice && m) head.push(...(m.staffStart.get(staff) ?? []));
          if (ctx.isFirstVoice) {
            // In every staff: a \time elsewhere at the same moment would reset the length.
            if (mi === 0 || !eq(nominal[mi], nominal[mi - 1])) timingLength = nominal[mi];
            if (mi === 0 && cmp(length, nominal[0]) < 0) {
              head.push(`\\partial ${durationString(length)}`);
            } else {
              const shortLast = mi === measureCount - 1 && cmp(length, nominal[mi]) < 0;
              const wanted = shortLast ? timingLength : length;
              if (!eq(wanted, timingLength)) {
                head.push(`\\set Timing.measureLength = ${momentString(wanted)}`);
                timingLength = wanted;
              }
            }
          }

          const markers: Marker[] = [];
          if (m) {
            for (const { target, marker } of m.markers) {
              if (target.staff !== staff) continue;
              const voices = p.voices.get(staff) ?? [];
              const owner = target.voice && voices.includes(target.voice) ? target.voice : voices[0];
              if (owner === voice) markers.push(marker);
            }
            if (ctx.isFirstVoice) for (const sm of m.staffMid) if (sm.staff === staff) markers.push(sm.marker);
          }
          if (ctx.isGlobal) {
            for (const sm of dedupeScoreMarkers(scoreMarkers, mi)) markers.push({ pos: sm.pos, text: sm.text, post: false });
          }

          em.tokens.push(...head);
          ctx.fullMeasure = eq(length, nominal[mi]);
          ctx.lastMeasure = mi === measureCount - 1;
          serializeVoiceMeasure(m?.events.get(key) ?? [], markers, length, ctx, em, opts);
          if (em.beamOpen && !beamContinues(p.measures[mi + 1]?.events.get(key))) closeBeam(em);
          const number = firstMeasures[mi]?.number ?? p.part.measures[mi]?.number ?? String(mi + 1);
          // A short final bar ends mid-measure, where a bar check would fail.
          const barCheck = mi === measureCount - 1 && cmp(length, nominal[mi]) < 0 ? '' : '| ';
          lines.push(`${em.tokens.slice(firstToken).join(' ')} ${barCheck}% ${number}`);
        }
        if (ctx.isGlobal) {
          const end = [...(boundaries[measureCount] ?? [])];
          if (!end.some(c => c.startsWith('\\bar') || c.includes('end-repeat'))) end.push('\\bar "|."');
          lines.push(end.join(' '));
        }

        variables.push(`${voiceName} = {`, ...indentLines(lines, 1), '}', '');

        const voiceCommand = voiceIds.length > 1 ? `${['\\voiceOne', '\\voiceTwo', '\\voiceThree', '\\voiceFour'][Math.min(vi, 3)]} ` : '';
        voiceLines.push(`\\new ${ctx.isTab ? "TabVoice" : "Voice"} = ${quote(voiceName)} { ${voiceCommand}\\${voiceName} }`);

        ctx.verses.forEach((verse, li) => {
          const syllables = em.lyrics.get(verse) ?? [];
          while (syllables.length && syllables[syllables.length - 1] === '_') syllables.pop();
          if (!syllables.length) return;
          syllables[syllables.length - 1] = syllables[syllables.length - 1].replace(/ --$/, '');
          const lyricName = `${voiceName}Lyrics${letters(li)}`;
          variables.push(`${lyricName} = \\lyricmode {`, ...indentLines(wrapTokens(syllables), 1), '}', '');
          lyricLines.push(`\\new Lyrics \\with { ignoreMelismata = ##t } \\lyricsto ${quote(voiceName)} \\${lyricName}`);
        });
      });

      const tabTuning = p.tabStaves.get(staff);
      const isTab = p.tabStaves.has(staff);
      const withItems: string[] = [];
      if (p.staves === 1) withItems.push(...instrumentNames(p.info));
      if (isTab && tabTuning?.length) withItems.push(`stringTunings = ${stringTuning(tabTuning)}`);
      const withBlock = withItems.length ? ` \\with { ${withItems.join(' ')} }` : '';
      const lines = [`\\new ${isTab ? 'TabStaff' : 'Staff'} = ${quote(staffName)}${withBlock} <<`, ...indentLines(voiceLines, 1), '>>'];
      staffContexts.push({ staff, lines, lyrics: lyricLines });
    }

    const block: string[] = [];
    if (opts.includeChordSymbols && p.measures.some(m => m.harmonies.length)) {
      const chordName = `${partName}Chords`;
      variables.push(`${chordName} = \\chordmode {`, ...indentLines(chordLines(p, lengths, nominal), 1), '}', '');
      block.push(`\\new ChordNames \\${chordName}`);
    }
    if (p.staves > 1) {
      const names = instrumentNames(p.info);
      block.push(`\\new PianoStaff${names.length ? ` \\with { ${names.join(' ')} }` : ''} <<`);
      for (const sc of staffContexts) block.push(...indentLines([...sc.lines, ...sc.lyrics], 1));
      block.push('>>');
    } else {
      for (const sc of staffContexts) block.push(...sc.lines, ...sc.lyrics);
    }
    staffBlocks.set(pi, block);
  });

  out.push(...variables);

  const renderTree = (nodes: StaffTree[]): string[] => nodes.flatMap(node => {
    if (node.kind === 'part') return staffBlocks.get(node.index) ?? [];
    const g = node.group;
    const children = renderTree(node.children);
    if (g.groupSymbol === 'none' || !g.groupSymbol && !g.groupName) return children;
    const withItems: string[] = [];
    if (g.groupName) withItems.push(`instrumentName = ${quote(g.groupName)}`);
    if (g.groupAbbreviation) withItems.push(`shortInstrumentName = ${quote(g.groupAbbreviation)}`);
    let context = g.groupBarline === 'no' ? 'ChoirStaff' : 'StaffGroup';
    if (g.groupSymbol === 'brace') context = 'GrandStaff';
    if (g.groupSymbol === 'square') withItems.push("systemStartDelimiter = #'SystemStartSquare");
    if (g.groupSymbol === 'line') withItems.push("systemStartDelimiter = #'SystemStartBar");
    const withBlock = withItems.length ? ` \\with { ${withItems.join(' ')} }` : '';
    return [`\\new ${context}${withBlock} <<`, ...indentLines(children, 1), '>>'];
  });

  out.push('\\score {', '  <<', ...indentLines(renderTree(buildTree(score)), 2), '  >>', '  \\layout { }');
  if (opts.midi) out.push('  \\midi { }');
  out.push('}', '');
  return out.join('\n');
}

function dedupeScoreMarkers(markers: ScoreMarker[], mi: number): ScoreMarker[] {
  const seen = new Set<string>();
  const result: ScoreMarker[] = [];
  const marks = new Map<string, ScoreMarker>();
  for (const m of markers) {
    if (m.measure !== mi) continue;
    const at = `${m.pos.n}/${m.pos.d}`;
    if (seen.has(`${at}:${m.text}`)) continue;
    seen.add(`${at}:${m.text}`);
    // One \mark per moment: rehearsal letter, segno and coda share it.
    const markup = m.text.match(/^\\mark \\markup \{ (.*) \}$/)?.[1];
    const existing = markup ? marks.get(at) : undefined;
    if (markup && existing) {
      existing.text = existing.text.replace(/ \}$/, ` ${markup} }`);
      continue;
    }
    const copy = { ...m };
    if (markup) marks.set(at, copy);
    result.push(copy);
  }
  return result;
}

function instrumentNames(info: PartInfo | undefined): string[] {
  if (!info) return [];
  const items: string[] = [];
  if (info.name && info.namePrintObject !== false) items.push(`instrumentName = ${quote(info.name)}`);
  if (info.abbreviation && info.abbreviationPrintObject !== false) items.push(`shortInstrumentName = ${quote(info.abbreviation)}`);
  return items;
}

function wrapTokens(tokens: string[], width = 72): string[] {
  const lines: string[] = [];
  let line = '';
  for (const t of tokens) {
    if (line && line.length + t.length + 1 > width) {
      lines.push(line);
      line = t;
    } else {
      line = line ? `${line} ${t}` : t;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function chordLines(p: PartInfoData, lengths: Frac[], nominal: Frac[]): string[] {
  const lines: string[] = [];
  for (let mi = 0; mi < lengths.length; mi++) {
    const length = lengths[mi];
    const harmonies = [...(p.measures[mi]?.harmonies ?? [])]
      .filter(h => cmp(h.pos, length) < 0)
      .sort((a, b) => cmp(a.pos, b.pos));
    const tokens: string[] = [];
    let cursor: Frac = ZERO;
    harmonies.forEach((h, i) => {
      if (cmp(h.pos, cursor) > 0) tokens.push(`s${durationString(sub(h.pos, cursor))}`);
      const start = max(h.pos, cursor);
      const next = harmonies.slice(i + 1).find(n => cmp(n.pos, start) > 0);
      const end = next ? next.pos : length;
      if (cmp(end, start) <= 0) return;
      tokens.push(serializeChordSymbol(h.harmony, durationString(sub(end, start))));
      cursor = end;
    });
    if (cmp(cursor, length) < 0) tokens.push(`s${durationString(sub(length, cursor))}`);
    const shortLast = mi === lengths.length - 1 && cmp(length, nominal[mi]) < 0;
    lines.push(shortLast ? tokens.join(' ') : `${tokens.join(' ')} |`);
  }
  return lines;
}

function headerLines(score: Score): string[] {
  const lines: string[] = [];
  const md = score.metadata;
  const title = md.workTitle ?? md.movementTitle;
  if (title) lines.push(`title = ${quote(title)}`);
  if (md.workTitle && md.movementTitle && md.movementTitle !== md.workTitle) lines.push(`subtitle = ${quote(md.movementTitle)}`);
  const fields: Record<string, string> = { composer: 'composer', lyricist: 'poet', poet: 'poet', arranger: 'arranger' };
  const written = new Set<string>();
  for (const c of md.creators ?? []) {
    const field = c.type ? fields[c.type] : undefined;
    if (!field || written.has(field) || !c.value?.trim()) continue;
    written.add(field);
    lines.push(`${field} = ${quote(c.value.trim())}`);
  }
  if (md.rights?.length) lines.push(`copyright = ${quote(md.rights.join(' '))}`);
  return lines;
}
