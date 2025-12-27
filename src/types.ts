// ============================================================
// Score (ルート)
// ============================================================
export interface Score {
  metadata: ScoreMetadata;
  partList: PartListEntry[];
  parts: Part[];
  defaults?: Defaults;
  credits?: Credit[];
}

export interface ScoreMetadata {
  workTitle?: string;
  workNumber?: string;
  movementTitle?: string;
  movementNumber?: string;
  creators?: Creator[];
  rights?: string[];
  encoding?: Encoding;
  source?: string;
  miscellaneous?: MiscellaneousField[];
}

export interface Creator {
  type?: string;
  value: string;
}

export interface Encoding {
  software?: string[];
  encodingDate?: string;
  encoder?: string[];
  encodingDescription?: string;
  supports?: Support[];
}

export interface Support {
  element: string;
  type: 'yes' | 'no';
  attribute?: string;
  value?: string;
}

export interface MiscellaneousField {
  name: string;
  value: string;
}

export interface Defaults {
  scaling?: { millimeters: number; tenths: number };
  pageLayout?: PageLayout;
  systemLayout?: SystemLayout;
  staffLayout?: { number?: number; staffDistance?: number }[];
  appearance?: Record<string, unknown>;
  musicFont?: FontInfo;
  wordFont?: FontInfo;
  lyricFont?: LyricFontInfo[];
  lyricLanguage?: LyricLanguageInfo[];
}

export interface LyricFontInfo extends FontInfo {
  number?: number;
  name?: string;
}

export interface LyricLanguageInfo {
  number?: number;
  name?: string;
  xmlLang: string;
}

export interface PageLayout {
  pageHeight?: number;
  pageWidth?: number;
  pageMargins?: PageMargins[];
}

export interface PageMargins {
  type?: 'odd' | 'even' | 'both';
  leftMargin?: number;
  rightMargin?: number;
  topMargin?: number;
  bottomMargin?: number;
}

export interface SystemLayout {
  systemMargins?: { leftMargin?: number; rightMargin?: number };
  systemDistance?: number;
  topSystemDistance?: number;
}

export interface FontInfo {
  fontFamily?: string;
  fontSize?: string;
  fontStyle?: string;
  fontWeight?: string;
}

export interface Credit {
  page?: number;
  creditType?: string[];
  creditWords?: CreditWords[];
  creditImage?: { source: string; type: string; height?: number; width?: number };
}

export interface CreditWords {
  text: string;
  defaultX?: number;
  defaultY?: number;
  fontSize?: string;
  fontWeight?: string;
  fontStyle?: string;
  justify?: string;
  halign?: string;
  valign?: string;
  letterSpacing?: string;
  xmlLang?: string;
  xmlSpace?: string;
}

// PartListEntry is either a PartInfo (score-part) or PartGroup
export type PartListEntry = PartInfo | PartGroup;

export interface PartInfo {
  type: 'score-part';
  id: string;
  name?: string;
  namePrintObject?: boolean;
  partNameDisplay?: DisplayText[];
  abbreviation?: string;
  abbreviationPrintObject?: boolean;
  partAbbreviationDisplay?: DisplayText[];
  scoreInstruments?: ScoreInstrument[];
  midiDevices?: MidiDevice[];
  midiInstruments?: MidiInstrument[];
  groups?: string[];
}

export interface DisplayText {
  text: string;
  fontFamily?: string;
  fontSize?: string;
  fontStyle?: string;
  fontWeight?: string;
  xmlSpace?: string;
  isAccidental?: boolean; // true for accidental-text elements
}

export interface ScoreInstrument {
  id: string;
  name: string;
  abbreviation?: string;
  sound?: string;
  solo?: boolean;
  ensemble?: number;
}

export interface MidiDevice {
  id?: string;
  port?: number;
}

export interface MidiInstrument {
  id: string;
  channel?: number;
  name?: string;
  bank?: number;
  program?: number;
  unpitched?: number;
  volume?: number;
  pan?: number;
  elevation?: number;
}

export interface PartGroup {
  type: 'part-group';
  groupType: 'start' | 'stop';
  number?: number;
  groupName?: string;
  groupNameDisplay?: DisplayText[];
  groupAbbreviation?: string;
  groupAbbreviationDisplay?: DisplayText[];
  groupSymbol?: 'none' | 'brace' | 'line' | 'bracket' | 'square';
  groupSymbolDefaultX?: number;
  groupBarline?: 'yes' | 'no' | 'Mensurstrich';
}

// ============================================================
// Part / Measure
// ============================================================
export interface Part {
  id: string;
  measures: Measure[];
}

export interface Measure {
  number: string; // MusicXML spec: token type (string), e.g., "1", "X1", "1a"
  width?: number;
  implicit?: boolean;
  attributes?: MeasureAttributes;
  entries: MeasureEntry[];
  barlines?: Barline[];
  print?: Print;
}

export interface Print {
  newSystem?: boolean;
  newPage?: boolean;
  blankPage?: number;
  pageNumber?: string;
  systemLayout?: SystemLayout;
  pageLayout?: PageLayout;
  staffLayouts?: { number?: number; staffDistance?: number }[];
  measureLayout?: { measureDistance?: number };
  measureNumbering?: MeasureNumbering;
  partNameDisplay?: DisplayText[];
  partAbbreviationDisplay?: DisplayText[];
}

export interface MeasureNumbering {
  value: string;
  system?: 'only-top' | 'only-bottom' | 'all-system-parts' | 'none';
}

export interface MeasureAttributes {
  divisions?: number;
  time?: TimeSignature;
  times?: TimeSignature[]; // For multi-staff time signatures
  key?: KeySignature;
  keys?: KeySignature[]; // For multi-staff key signatures
  clef?: Clef[];
  staves?: number;
  instruments?: number;
  transpose?: Transpose;
  transposes?: Transpose[]; // For multi-staff transpose
  staffDetails?: StaffDetails[];
  measureStyle?: MeasureStyle[];
}

export interface StaffDetails {
  number?: number;
  staffType?: 'ossia' | 'cue' | 'editorial' | 'regular' | 'alternate';
  staffLines?: number;
  staffTuning?: StaffTuning[];
  capo?: number;
  staffSize?: number;
  staffSizeScaling?: number;
  showFrets?: 'numbers' | 'letters';
  printObject?: boolean;
}

export interface StaffTuning {
  line: number;
  tuningStep: string;
  tuningOctave: number;
  tuningAlter?: number;
}

export interface MeasureStyle {
  number?: number;
  multipleRest?: number;
  measureRepeat?: { type: 'start' | 'stop'; slashes?: number };
  beatRepeat?: { type: 'start' | 'stop'; slashes?: number };
  slash?: { type: 'start' | 'stop'; useDots?: boolean; useStems?: boolean };
}

export interface TimeSignature {
  beats: string; // Can be a single number or for display purposes
  beatType: number;
  // For compound time signatures (e.g., 3/8+2/8+3/4)
  beatsList?: number[];
  beatTypeList?: number[];
  symbol?: 'common' | 'cut' | 'single-number' | 'note' | 'dotted-note' | 'normal';
  printObject?: boolean;
  senzaMisura?: boolean; // For unmeasured time
}

export interface KeySignature {
  fifths: number;
  mode?: 'major' | 'minor' | 'dorian' | 'phrygian' | 'lydian' | 'mixolydian' | 'aeolian' | 'ionian' | 'locrian' | 'none';
  cancel?: number;
  cancelLocation?: 'left' | 'right' | 'before-barline';
  number?: number; // Staff number for multi-staff keys
  printObject?: boolean;
  // Non-traditional key signatures
  keySteps?: string[];
  keyAlters?: number[];
  keyOctaves?: KeyOctave[];
}

export interface KeyOctave {
  number: number;
  octave: number;
  cancel?: boolean;
}

export interface Clef {
  sign: 'G' | 'F' | 'C' | 'percussion' | 'TAB';
  line?: number;
  staff?: number;
  clefOctaveChange?: number;
  printObject?: boolean;
  afterBarline?: boolean;
}

export interface Transpose {
  diatonic: number;
  chromatic: number;
  octaveChange?: number;
}

export interface Barline {
  location: 'left' | 'right' | 'middle';
  barStyle?: 'regular' | 'dotted' | 'dashed' | 'heavy' | 'light-light' | 'light-heavy' | 'heavy-light' | 'heavy-heavy' | 'tick' | 'short' | 'none';
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
export type MeasureEntry = NoteEntry | BackupEntry | ForwardEntry | DirectionEntry | HarmonyEntry | FiguredBassEntry | SoundEntry | AttributesEntry | GroupingEntry;

export interface GroupingEntry {
  type: 'grouping';
  groupingType: 'start' | 'stop' | 'single';
  number?: string;
  memberOf?: string;
}

export interface AttributesEntry {
  type: 'attributes';
  attributes: MeasureAttributes;
}

export interface NoteEntry {
  type: 'note';
  pitch?: Pitch;
  rest?: RestInfo;
  unpitched?: { displayStep?: string; displayOctave?: number };
  duration: number;
  voice: number;
  staff?: number;
  chord?: boolean;
  cue?: boolean;
  instrument?: string; // instrument reference id
  dynamics?: number; // MIDI dynamics for playback
  printObject?: boolean;
  printSpacing?: boolean;

  // Layout attributes
  defaultX?: number;
  defaultY?: number;
  relativeX?: number;
  relativeY?: number;

  // Note details
  noteType?: NoteType;
  noteTypeSize?: string;
  dots?: number;
  accidental?: AccidentalInfo;
  stem?: StemInfo;
  notehead?: NoteheadInfo;
  noteheadText?: string;

  // Connections
  tie?: TieInfo;
  ties?: TieInfo[];
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
    normalDots?: number;
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

export interface DirectionSound {
  tempo?: number;
  dynamics?: number;
  midiInstrument?: {
    id: string;
    midiProgram?: number;
    midiChannel?: number;
    volume?: number;
    pan?: number;
  };
  damperPedal?: 'yes' | 'no';
  softPedal?: 'yes' | 'no';
  sostenutoPedal?: 'yes' | 'no';
}

export interface DirectionEntry {
  type: 'direction';
  directionTypes: DirectionType[];
  placement?: 'above' | 'below';
  directive?: boolean;
  staff?: number;
  voice?: number;
  offset?: number;
  offsetSound?: boolean;
  sound?: DirectionSound;
  system?: 'only-top' | 'also-top' | 'none';
}

export interface Swing {
  straight?: boolean;
  first?: number;
  second?: number;
  swingType?: string;
}

export interface SoundEntry {
  type: 'sound';
  tempo?: number;
  dynamics?: number;
  dacapo?: boolean;
  segno?: string;
  dalsegno?: string;
  coda?: string;
  tocoda?: string;
  fine?: boolean;
  forwardRepeat?: boolean;
  swing?: Swing;
  damperPedal?: boolean | 'yes' | 'no';
  softPedal?: boolean | 'yes' | 'no';
  sostenutoPedal?: boolean | 'yes' | 'no';
}

export interface HarmonyEntry {
  type: 'harmony';
  root: { rootStep: string; rootAlter?: number };
  kind: string;
  kindText?: string;
  inversion?: number;
  bass?: { bassStep: string; bassAlter?: number };
  degrees?: HarmonyDegree[];
  frame?: HarmonyFrame;
  staff?: number;
  placement?: 'above' | 'below';
  offset?: number;
  printFrame?: boolean;
  // Positioning attributes
  defaultY?: number;
  fontSize?: string;
  halign?: string;
}

export interface HarmonyDegree {
  degreeValue: number;
  degreeAlter?: number;
  degreeType: 'add' | 'alter' | 'subtract';
}

export interface HarmonyFrame {
  frameStrings?: number;
  frameFrets?: number;
  firstFret?: number;
  firstFretText?: string;
  firstFretLocation?: 'left' | 'right';
  frameNotes?: FrameNote[];
}

export interface FrameNote {
  string: number;
  fret: number;
  fingering?: string;
  barre?: 'start' | 'stop';
}

export interface FiguredBassEntry {
  type: 'figured-bass';
  figures: Figure[];
  duration?: number;
  parentheses?: boolean;
}

export interface Figure {
  figureNumber?: string;
  prefix?: string;
  suffix?: string;
  extend?: boolean | { type?: 'start' | 'stop' | 'continue' };
}

// ============================================================
// Pitch / Note詳細
// ============================================================
export interface Pitch {
  step: 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';
  octave: number;
  alter?: number;
}

export interface RestInfo {
  measure?: boolean;
  displayStep?: string;
  displayOctave?: number;
}

export type NoteType =
  | 'maxima' | 'long' | 'breve'
  | 'whole' | 'half' | 'quarter'
  | 'eighth' | '16th' | '32nd' | '64th' | '128th' | '256th' | '512th' | '1024th';

export type Accidental =
  | 'sharp' | 'natural' | 'flat'
  | 'double-sharp' | 'double-flat' | 'sharp-sharp' | 'flat-flat'
  | 'natural-sharp' | 'natural-flat'
  | 'quarter-flat' | 'quarter-sharp'
  | 'three-quarters-flat' | 'three-quarters-sharp'
  | 'sharp-down' | 'sharp-up' | 'natural-down' | 'natural-up'
  | 'flat-down' | 'flat-up' | 'double-sharp-down' | 'double-sharp-up'
  | 'flat-flat-down' | 'flat-flat-up' | 'arrow-down' | 'arrow-up'
  | 'triple-sharp' | 'triple-flat' | 'slash-quarter-sharp' | 'slash-sharp'
  | 'slash-flat' | 'double-slash-flat' | 'sharp-1' | 'sharp-2' | 'sharp-3' | 'sharp-5'
  | 'flat-1' | 'flat-2' | 'flat-3' | 'flat-4' | 'sori' | 'koron' | 'other';

export interface AccidentalInfo {
  value: Accidental;
  cautionary?: boolean;
  editorial?: boolean;
  parentheses?: boolean;
  bracket?: boolean;
  // Positioning attributes
  relativeX?: number;
  relativeY?: number;
  color?: string;
  size?: string;
  fontSize?: string;
}

export interface NoteheadInfo {
  value: NoteheadValue;
  filled?: boolean;
  parentheses?: boolean;
}

export interface StemInfo {
  value: 'up' | 'down' | 'none' | 'double';
  defaultX?: number;
  defaultY?: number;
}

export type NoteheadValue =
  | 'slash' | 'triangle' | 'diamond' | 'square' | 'cross' | 'x' | 'circle-x'
  | 'inverted triangle' | 'arrow down' | 'arrow up' | 'circled' | 'slashed'
  | 'back slashed' | 'normal' | 'cluster' | 'circle dot' | 'left triangle'
  | 'rectangle' | 'none' | 'do' | 're' | 'mi' | 'fa' | 'fa up' | 'so' | 'la' | 'ti' | 'other';

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
export type Notation =
  | ArticulationNotation
  | OrnamentNotation
  | TechnicalNotation
  | SlurNotation
  | TiedNotation
  | TupletNotation
  | DynamicsNotation
  | FermataNotation
  | ArpeggiateNotation
  | GlissandoNotation
  | SlideNotation
  | OtherNotation;

export interface BaseNotation {
  placement?: 'above' | 'below';
  // For roundtrip: track which <notations> element this came from
  notationsIndex?: number;
  // For roundtrip: track which <articulations> element within <notations>
  articulationsIndex?: number;
}

export interface ArticulationNotation extends BaseNotation {
  type: 'articulation';
  articulation: ArticulationType;
  // For strong-accent: up/down
  strongAccentType?: 'up' | 'down';
  // Positioning
  defaultX?: number;
  defaultY?: number;
}

export type ArticulationType =
  | 'accent' | 'strong-accent' | 'staccato' | 'staccatissimo'
  | 'tenuto' | 'detached-legato' | 'marcato' | 'spiccato'
  | 'scoop' | 'plop' | 'doit' | 'falloff' | 'breath-mark'
  | 'caesura' | 'stress' | 'unstress' | 'soft-accent';

export interface AccidentalMarkInfo {
  value: Accidental;
  placement?: 'above' | 'below';
}

export interface OrnamentNotation extends BaseNotation {
  type: 'ornament';
  ornament: OrnamentType;
  accidentalMark?: Accidental;
  accidentalMarks?: AccidentalMarkInfo[];
  // For wavy-line
  wavyLineType?: 'start' | 'stop' | 'continue';
  number?: number;
  // For tremolo
  tremoloMarks?: number;
  tremoloType?: 'start' | 'stop' | 'single' | 'unmeasured';
  // Positioning
  defaultX?: number;
  defaultY?: number;
}

export type OrnamentType =
  | 'trill-mark' | 'mordent' | 'inverted-mordent' | 'turn' | 'inverted-turn'
  | 'delayed-turn' | 'delayed-inverted-turn' | 'vertical-turn' | 'shake'
  | 'wavy-line' | 'schleifer' | 'tremolo' | 'haydn' | 'empty';

export interface TechnicalNotation extends BaseNotation {
  type: 'technical';
  technical: TechnicalType;
  string?: number;
  fret?: number;
  fingering?: string;
  fingeringSubstitution?: boolean;
  fingeringAlternate?: boolean;
  text?: string; // For hammer-on, pull-off, tap, etc.
  bendAlter?: number;
  preBend?: boolean;
  release?: boolean;
  withBar?: number | true; // true for empty <with-bar/>
  // For harmonic
  harmonicNatural?: boolean;
  harmonicArtificial?: boolean;
  basePitch?: boolean;
  touchingPitch?: boolean;
  soundingPitch?: boolean;
  // For hammer-on, pull-off
  startStop?: 'start' | 'stop';
  number?: number;
  // For heel, toe
  substitution?: boolean;
  // Positioning
  defaultX?: number;
  defaultY?: number;
}

export type TechnicalType =
  | 'up-bow' | 'down-bow' | 'harmonic' | 'open-string' | 'thumb-position'
  | 'fingering' | 'pluck' | 'double-tongue' | 'triple-tongue' | 'stopped'
  | 'snap-pizzicato' | 'fret' | 'string' | 'hammer-on' | 'pull-off' | 'bend'
  | 'tap' | 'heel' | 'toe' | 'fingernails' | 'hole' | 'arrow' | 'handbell'
  | 'brass-bend' | 'flip' | 'smear' | 'open' | 'half-muted' | 'harmon-mute'
  | 'golpe' | 'other-technical';

export interface SlurNotation extends BaseNotation {
  type: 'slur';
  slurType: 'start' | 'stop' | 'continue';
  number?: number;
  lineType?: 'solid' | 'dashed' | 'dotted' | 'wavy';
  orientation?: 'over' | 'under';
  defaultX?: number;
  defaultY?: number;
  bezierX?: number;
  bezierY?: number;
  bezierX2?: number;
  bezierY2?: number;
}

export interface TiedNotation extends BaseNotation {
  type: 'tied';
  tiedType: 'start' | 'stop' | 'continue' | 'let-ring';
  number?: number;
  orientation?: 'over' | 'under';
}

export interface TupletNotation extends BaseNotation {
  type: 'tuplet';
  tupletType: 'start' | 'stop';
  number?: number;
  bracket?: boolean;
  showNumber?: 'actual' | 'both' | 'none';
  showType?: 'actual' | 'both' | 'none';
  lineShape?: 'straight' | 'curved';
  tupletActual?: { tupletNumber?: number; tupletType?: NoteType; tupletDots?: number };
  tupletNormal?: { tupletNumber?: number; tupletType?: NoteType; tupletDots?: number };
}

export interface DynamicsNotation extends BaseNotation {
  type: 'dynamics';
  dynamics: DynamicsValue[];
  otherDynamics?: string; // For <other-dynamics> element
}

export interface FermataNotation extends BaseNotation {
  type: 'fermata';
  shape?: 'normal' | 'angled' | 'square' | 'double-angled' | 'double-square' | 'double-dot' | 'half-curve' | 'curlew';
  fermataType?: 'upright' | 'inverted';
  // Positioning
  defaultX?: number;
  defaultY?: number;
}

export interface ArpeggiateNotation extends BaseNotation {
  type: 'arpeggiate';
  direction?: 'up' | 'down';
  number?: number;
}

export interface GlissandoNotation extends BaseNotation {
  type: 'glissando';
  glissandoType: 'start' | 'stop';
  number?: number;
  lineType?: 'solid' | 'dashed' | 'dotted' | 'wavy';
  text?: string;
}

export interface SlideNotation extends BaseNotation {
  type: 'slide';
  slideType: 'start' | 'stop';
  number?: number;
  lineType?: 'solid' | 'dashed' | 'dotted' | 'wavy';
}

export interface OtherNotation extends BaseNotation {
  type: 'other-notation';
  name: string;
  text?: string;
}

// ============================================================
// Direction (強弱、テンポ、etc)
// ============================================================
export type DirectionType =
  | { kind: 'dynamics'; value: DynamicsValue; defaultX?: number; defaultY?: number; relativeX?: number; halign?: string }
  | { kind: 'wedge'; type: 'crescendo' | 'diminuendo' | 'stop'; spread?: number; defaultY?: number; relativeX?: number }
  | { kind: 'metronome'; beatUnit: NoteType; perMinute?: number | string; beatUnitDot?: boolean; beatUnit2?: NoteType; beatUnitDot2?: boolean; parentheses?: boolean; defaultY?: number; fontFamily?: string; fontSize?: string }
  | { kind: 'words'; text: string; defaultX?: number; defaultY?: number; relativeX?: number; fontFamily?: string; fontSize?: string; fontStyle?: string; fontWeight?: string; xmlLang?: string; justify?: string; color?: string; xmlSpace?: string; halign?: string }
  | { kind: 'rehearsal'; text: string; enclosure?: string; defaultX?: number; defaultY?: number; fontSize?: string; fontWeight?: string }
  | { kind: 'segno' }
  | { kind: 'coda' }
  | { kind: 'pedal'; type: 'start' | 'stop' | 'change' | 'continue'; line?: boolean; defaultY?: number; relativeX?: number; halign?: string }
  | { kind: 'octave-shift'; type: 'up' | 'down' | 'stop'; size?: number }
  | { kind: 'bracket'; type: 'start' | 'stop' | 'continue'; number?: number; lineEnd?: 'up' | 'down' | 'both' | 'arrow' | 'none'; lineType?: 'solid' | 'dashed' | 'dotted' | 'wavy'; defaultY?: number; relativeX?: number }
  | { kind: 'dashes'; type: 'start' | 'stop' | 'continue'; number?: number; dashLength?: number; defaultY?: number; spaceLength?: number }
  | { kind: 'accordion-registration'; high?: boolean; middle?: number | true; low?: boolean }
  | { kind: 'swing'; straight?: boolean; first?: number; second?: number; swingType?: NoteType }
  | { kind: 'eyeglasses' }
  | { kind: 'damp' }
  | { kind: 'damp-all' }
  | { kind: 'scordatura'; accords?: Accord[] }
  | { kind: 'harp-pedals'; pedalTunings?: PedalTuning[] }
  | { kind: 'image'; source?: string; type?: string }
  | { kind: 'other-direction'; text: string; defaultX?: number; defaultY?: number; halign?: string; printObject?: boolean };

export interface Accord {
  string: number;
  tuningStep: string;
  tuningAlter?: number;
  tuningOctave: number;
}

export interface PedalTuning {
  pedalStep: string;
  pedalAlter: number;
}

export type DynamicsValue =
  | 'pppppp' | 'ppppp' | 'pppp' | 'ppp' | 'pp' | 'p'
  | 'mp' | 'mf'
  | 'f' | 'ff' | 'fff' | 'ffff' | 'fffff' | 'ffffff'
  | 'sf' | 'sfz' | 'sffz' | 'sfp' | 'sfpp' | 'fp' | 'rf' | 'rfz' | 'fz' | 'n' | 'pf';

// ============================================================
// Lyrics
// ============================================================
export interface LyricTextElement {
  text: string;
  syllabic?: 'single' | 'begin' | 'middle' | 'end';
}

export interface Lyric {
  number?: number;
  name?: string;
  syllabic?: 'single' | 'begin' | 'middle' | 'end';
  text: string;
  textElements?: LyricTextElement[]; // For multiple text/elision pairs
  elision?: boolean; // Simple flag for single elision
  extend?: boolean | { type?: 'start' | 'stop' | 'continue' };
  endLine?: boolean;
  endParagraph?: boolean;
  defaultY?: number;
  relativeX?: number;
  justify?: string;
  placement?: 'above' | 'below';
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
