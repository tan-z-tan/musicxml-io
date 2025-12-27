// ============================================================
// Score (ルート)
// ============================================================
export interface Score {
  metadata: ScoreMetadata;
  partList: PartInfo[];
  parts: Part[];
}

export interface ScoreMetadata {
  workTitle?: string;
  workNumber?: string;
  movementTitle?: string;
  movementNumber?: string;
  creator?: {
    composer?: string;
    lyricist?: string;
    arranger?: string;
  };
  rights?: string;
  encoding?: {
    software?: string;
    encodingDate?: string;
  };
}

export interface PartInfo {
  id: string;
  name: string;
  abbreviation?: string;
  midiInstrument?: {
    channel: number;
    program: number;
    volume?: number;
    pan?: number;
  };
}

// ============================================================
// Part / Measure
// ============================================================
export interface Part {
  id: string;
  measures: Measure[];
}

export interface Measure {
  number: number;
  attributes?: MeasureAttributes;
  entries: MeasureEntry[];
  barline?: Barline;
  _unknown?: unknown[];
}

export interface MeasureAttributes {
  divisions?: number;
  time?: TimeSignature;
  key?: KeySignature;
  clef?: Clef[];
  staves?: number;
  transpose?: Transpose;
}

export interface TimeSignature {
  beats: number;
  beatType: number;
  symbol?: 'common' | 'cut';
}

export interface KeySignature {
  fifths: number;
  mode?: 'major' | 'minor';
}

export interface Clef {
  sign: 'G' | 'F' | 'C' | 'percussion' | 'TAB';
  line: number;
  staff?: number;
}

export interface Transpose {
  diatonic: number;
  chromatic: number;
  octaveChange?: number;
}

export interface Barline {
  location: 'left' | 'right' | 'middle';
  barStyle?: 'regular' | 'dotted' | 'dashed' | 'heavy' | 'light-light' | 'light-heavy' | 'heavy-light' | 'heavy-heavy' | 'none';
  repeat?: {
    direction: 'forward' | 'backward';
    times?: number;
  };
  ending?: {
    number: string;
    type: 'start' | 'stop' | 'discontinue';
  };
}

// ============================================================
// MeasureEntry (MusicXML順序を保持するフラット構造)
// ============================================================
export type MeasureEntry = NoteEntry | BackupEntry | ForwardEntry | DirectionEntry;

export interface NoteEntry {
  type: 'note';
  pitch?: Pitch;
  duration: number;
  voice: number;
  staff?: number;
  chord?: boolean;

  // Note details
  noteType?: NoteType;
  dots?: number;
  accidental?: Accidental;
  stem?: 'up' | 'down' | 'none';

  // Connections
  tie?: TieInfo;
  beam?: BeamInfo[];

  // Notations
  notations?: Notation[];
  lyrics?: Lyric[];

  // Grace note
  grace?: {
    slash?: boolean;
    stealTimePrevious?: number;
    stealTimeFollowing?: number;
  };

  // Tuplet
  timeModification?: {
    actualNotes: number;
    normalNotes: number;
    normalType?: NoteType;
  };
}

export interface BackupEntry {
  type: 'backup';
  duration: number;
}

export interface ForwardEntry {
  type: 'forward';
  duration: number;
  voice?: number;
  staff?: number;
}

export interface DirectionEntry {
  type: 'direction';
  directionTypes: DirectionType[];
  placement?: 'above' | 'below';
  staff?: number;
  voice?: number;
  sound?: {
    tempo?: number;
    dynamics?: number;
  };
}

// ============================================================
// Pitch / Note詳細
// ============================================================
export interface Pitch {
  step: 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';
  octave: number;
  alter?: number;
}

export type NoteType =
  | 'maxima' | 'long' | 'breve'
  | 'whole' | 'half' | 'quarter'
  | 'eighth' | '16th' | '32nd' | '64th' | '128th' | '256th' | '512th' | '1024th';

export type Accidental =
  | 'sharp' | 'natural' | 'flat'
  | 'double-sharp' | 'double-flat'
  | 'natural-sharp' | 'natural-flat'
  | 'quarter-flat' | 'quarter-sharp'
  | 'three-quarters-flat' | 'three-quarters-sharp';

export interface TieInfo {
  type: 'start' | 'stop' | 'continue';
}

export interface BeamInfo {
  number: number;
  type: 'begin' | 'continue' | 'end' | 'forward hook' | 'backward hook';
}

// ============================================================
// Notation (装飾、アーティキュレーション)
// ============================================================
export interface Notation {
  type: NotationType;
  placement?: 'above' | 'below';
  number?: number;
  startStop?: 'start' | 'stop';
}

export type NotationType =
  // Articulation
  | 'accent' | 'strong-accent' | 'staccato' | 'staccatissimo'
  | 'tenuto' | 'detached-legato' | 'marcato'
  // Ornaments
  | 'trill-mark' | 'mordent' | 'inverted-mordent' | 'turn' | 'inverted-turn'
  // Technical
  | 'up-bow' | 'down-bow' | 'pizzicato' | 'harmonic'
  // Other
  | 'fermata' | 'arpeggiate'
  // Slur/Tied (スパナー)
  | 'slur' | 'tied';

// ============================================================
// Direction (強弱、テンポ、etc)
// ============================================================
export type DirectionType =
  | { kind: 'dynamics'; value: DynamicsValue }
  | { kind: 'wedge'; type: 'crescendo' | 'diminuendo' | 'stop'; spread?: number }
  | { kind: 'metronome'; beatUnit: NoteType; perMinute: number; beatUnitDot?: boolean }
  | { kind: 'words'; text: string; fontStyle?: string; fontWeight?: string }
  | { kind: 'rehearsal'; text: string }
  | { kind: 'segno' }
  | { kind: 'coda' }
  | { kind: 'pedal'; type: 'start' | 'stop' | 'change' | 'continue' }
  | { kind: 'octave-shift'; type: 'up' | 'down' | 'stop'; size?: number };

export type DynamicsValue =
  | 'ppppp' | 'pppp' | 'ppp' | 'pp' | 'p'
  | 'mp' | 'mf'
  | 'f' | 'ff' | 'fff' | 'ffff' | 'fffff'
  | 'sf' | 'sfz' | 'sfp' | 'fp' | 'rf' | 'rfz' | 'fz';

// ============================================================
// Lyrics
// ============================================================
export interface Lyric {
  number?: number;
  syllabic?: 'single' | 'begin' | 'middle' | 'end';
  text: string;
  extend?: boolean;
}

// ============================================================
// Accessor Helper Types
// ============================================================
export interface VoiceGroup {
  staff: number;
  voice: number;
  notes: NoteEntry[];
}

export interface StaffGroup {
  staff: number;
  notes: NoteEntry[];
}

export interface NoteWithPosition extends NoteEntry {
  absolutePosition: number;
}

export interface Chord {
  position: number;
  duration: number;
  notes: NoteEntry[];
}

export interface NoteIteratorItem {
  part: Part;
  measure: Measure;
  note: NoteEntry;
  position: number;
}
