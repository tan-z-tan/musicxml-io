import { XMLParser } from 'fast-xml-parser';
import type {
  Score,
  ScoreMetadata,
  PartInfo,
  Part,
  Measure,
  MeasureAttributes,
  NoteEntry,
  BackupEntry,
  ForwardEntry,
  DirectionEntry,
  DirectionType,
  Pitch,
  NoteType,
  Accidental,
  BeamInfo,
  Notation,
  NotationType,
  Lyric,
  TimeSignature,
  KeySignature,
  Clef,
  Transpose,
  Barline,
  DynamicsValue,
} from './types';

// Parser with preserveOrder to maintain element order
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: true,
  preserveOrder: true,
});

interface OrderedElement {
  [key: string]: unknown;
  ':@'?: Record<string, unknown>;
}

export function parse(xmlString: string): Score {
  const parsed = xmlParser.parse(xmlString) as OrderedElement[];

  // Find score-partwise in the ordered result
  const scorePartwise = findElement(parsed, 'score-partwise');
  if (!scorePartwise) {
    throw new Error('Unsupported MusicXML format: only score-partwise is supported');
  }

  return parseScorePartwise(scorePartwise);
}

function findElement(elements: OrderedElement[], tagName: string): OrderedElement[] | undefined {
  for (const el of elements) {
    if (el[tagName]) {
      return el[tagName] as OrderedElement[];
    }
  }
  return undefined;
}

function getElementContent(elements: OrderedElement[], tagName: string): OrderedElement[] | undefined {
  return findElement(elements, tagName);
}

function getElementText(elements: OrderedElement[], tagName: string): string | undefined {
  const content = findElement(elements, tagName);
  if (!content) return undefined;
  for (const item of content) {
    if (item['#text'] !== undefined) {
      return String(item['#text']);
    }
  }
  return undefined;
}

function getAttributes(element: OrderedElement): Record<string, string> {
  const attrs: Record<string, string> = {};
  const rawAttrs = element[':@'];
  if (rawAttrs) {
    for (const [key, value] of Object.entries(rawAttrs)) {
      if (key.startsWith('@_')) {
        attrs[key.slice(2)] = String(value);
      }
    }
  }
  return attrs;
}

function parseScorePartwise(elements: OrderedElement[]): Score {
  const metadata = parseMetadata(elements);
  const partListContent = getElementContent(elements, 'part-list');
  const partList = partListContent ? parsePartList(partListContent) : [];
  const parts = parseParts(elements);

  return {
    metadata,
    partList,
    parts,
  };
}

function parseMetadata(elements: OrderedElement[]): ScoreMetadata {
  const metadata: ScoreMetadata = {};

  // Work info
  const work = getElementContent(elements, 'work');
  if (work) {
    metadata.workTitle = getElementText(work, 'work-title');
    metadata.workNumber = getElementText(work, 'work-number');
  }

  // Movement info
  metadata.movementTitle = getElementText(elements, 'movement-title');
  metadata.movementNumber = getElementText(elements, 'movement-number');

  // Identification
  const identification = getElementContent(elements, 'identification');
  if (identification) {
    const creators: { type: string; text: string }[] = [];
    for (const el of identification) {
      if (el['creator']) {
        const attrs = getAttributes(el);
        const type = attrs['type'] || '';
        const content = el['creator'] as OrderedElement[];
        let text = '';
        for (const item of content) {
          if (item['#text'] !== undefined) {
            text = String(item['#text']);
            break;
          }
        }
        creators.push({ type, text });
      }
    }

    if (creators.length > 0) {
      metadata.creator = {};
      for (const creator of creators) {
        if (creator.type === 'composer') metadata.creator.composer = creator.text;
        else if (creator.type === 'lyricist') metadata.creator.lyricist = creator.text;
        else if (creator.type === 'arranger') metadata.creator.arranger = creator.text;
      }
    }

    const rights = getElementText(identification, 'rights');
    if (rights) metadata.rights = rights;

    const encoding = getElementContent(identification, 'encoding');
    if (encoding) {
      metadata.encoding = {
        software: getElementText(encoding, 'software'),
        encodingDate: getElementText(encoding, 'encoding-date'),
      };
    }
  }

  return metadata;
}

function parsePartList(elements: OrderedElement[]): PartInfo[] {
  const partList: PartInfo[] = [];

  for (const el of elements) {
    if (el['score-part']) {
      const attrs = getAttributes(el);
      const content = el['score-part'] as OrderedElement[];

      const partInfo: PartInfo = {
        id: attrs['id'] || '',
        name: getElementText(content, 'part-name') || '',
      };

      const abbr = getElementText(content, 'part-abbreviation');
      if (abbr) partInfo.abbreviation = abbr;

      const midi = getElementContent(content, 'midi-instrument');
      if (midi) {
        partInfo.midiInstrument = {
          channel: parseInt(getElementText(midi, 'midi-channel') || '1', 10),
          program: parseInt(getElementText(midi, 'midi-program') || '1', 10),
        };
        const volume = getElementText(midi, 'volume');
        if (volume) partInfo.midiInstrument.volume = parseFloat(volume);
        const pan = getElementText(midi, 'pan');
        if (pan) partInfo.midiInstrument.pan = parseFloat(pan);
      }

      partList.push(partInfo);
    }
  }

  return partList;
}

function parseParts(elements: OrderedElement[]): Part[] {
  const parts: Part[] = [];

  for (const el of elements) {
    if (el['part']) {
      const attrs = getAttributes(el);
      const content = el['part'] as OrderedElement[];

      const part: Part = {
        id: attrs['id'] || '',
        measures: [],
      };

      for (const measureEl of content) {
        if (measureEl['measure']) {
          const measureAttrs = getAttributes(measureEl);
          const measureContent = measureEl['measure'] as OrderedElement[];
          part.measures.push(parseMeasure(measureContent, measureAttrs));
        }
      }

      parts.push(part);
    }
  }

  return parts;
}

function parseMeasure(elements: OrderedElement[], attrs: Record<string, string>): Measure {
  const measure: Measure = {
    number: parseInt(attrs['number'] || '0', 10),
    entries: [],
  };

  // Process elements in order - this is the key to maintaining order!
  for (const el of elements) {
    if (el['attributes']) {
      measure.attributes = parseAttributes(el['attributes'] as OrderedElement[]);
    } else if (el['note']) {
      measure.entries.push(parseNote(el['note'] as OrderedElement[], getAttributes(el)));
    } else if (el['backup']) {
      measure.entries.push(parseBackup(el['backup'] as OrderedElement[]));
    } else if (el['forward']) {
      measure.entries.push(parseForward(el['forward'] as OrderedElement[]));
    } else if (el['direction']) {
      measure.entries.push(parseDirection(el['direction'] as OrderedElement[], getAttributes(el)));
    } else if (el['barline']) {
      measure.barline = parseBarline(el['barline'] as OrderedElement[], getAttributes(el));
    }
  }

  return measure;
}

function parseAttributes(elements: OrderedElement[]): MeasureAttributes {
  const attrs: MeasureAttributes = {};

  const divisions = getElementText(elements, 'divisions');
  if (divisions) attrs.divisions = parseInt(divisions, 10);

  const staves = getElementText(elements, 'staves');
  if (staves) attrs.staves = parseInt(staves, 10);

  // Time signature
  const time = getElementContent(elements, 'time');
  if (time) {
    attrs.time = parseTimeSignature(time, elements);
  }

  // Key signature
  const key = getElementContent(elements, 'key');
  if (key) {
    attrs.key = parseKeySignature(key);
  }

  // Clef(s)
  const clefs: Clef[] = [];
  for (const el of elements) {
    if (el['clef']) {
      const clefAttrs = getAttributes(el);
      clefs.push(parseClef(el['clef'] as OrderedElement[], clefAttrs));
    }
  }
  if (clefs.length > 0) attrs.clef = clefs;

  // Transpose
  const transpose = getElementContent(elements, 'transpose');
  if (transpose) {
    attrs.transpose = parseTranspose(transpose);
  }

  return attrs;
}

function parseTimeSignature(elements: OrderedElement[], parentElements: OrderedElement[]): TimeSignature {
  const beats = getElementText(elements, 'beats');
  const beatType = getElementText(elements, 'beat-type');

  const time: TimeSignature = {
    beats: parseInt(beats || '4', 10),
    beatType: parseInt(beatType || '4', 10),
  };

  // Get symbol attribute from parent
  for (const el of parentElements) {
    if (el['time']) {
      const attrs = getAttributes(el);
      if (attrs['symbol'] === 'common' || attrs['symbol'] === 'cut') {
        time.symbol = attrs['symbol'];
      }
      break;
    }
  }

  return time;
}

function parseKeySignature(elements: OrderedElement[]): KeySignature {
  const fifths = getElementText(elements, 'fifths');
  const mode = getElementText(elements, 'mode');

  const key: KeySignature = {
    fifths: parseInt(fifths || '0', 10),
  };

  if (mode === 'major' || mode === 'minor') {
    key.mode = mode;
  }

  return key;
}

function parseClef(elements: OrderedElement[], attrs: Record<string, string>): Clef {
  const sign = getElementText(elements, 'sign') as Clef['sign'] || 'G';
  const line = parseInt(getElementText(elements, 'line') || '2', 10);

  const clef: Clef = { sign, line };

  if (attrs['number']) {
    clef.staff = parseInt(attrs['number'], 10);
  }

  return clef;
}

function parseTranspose(elements: OrderedElement[]): Transpose {
  const diatonic = getElementText(elements, 'diatonic');
  const chromatic = getElementText(elements, 'chromatic');
  const octaveChange = getElementText(elements, 'octave-change');

  const transpose: Transpose = {
    diatonic: parseInt(diatonic || '0', 10),
    chromatic: parseInt(chromatic || '0', 10),
  };

  if (octaveChange) {
    transpose.octaveChange = parseInt(octaveChange, 10);
  }

  return transpose;
}

function parseNote(elements: OrderedElement[], _attrs: Record<string, string>): NoteEntry {
  const note: NoteEntry = {
    type: 'note',
    duration: parseInt(getElementText(elements, 'duration') || '0', 10),
    voice: parseInt(getElementText(elements, 'voice') || '1', 10),
  };

  // Pitch or rest
  const pitch = getElementContent(elements, 'pitch');
  if (pitch) {
    note.pitch = parsePitch(pitch);
  }

  // Staff
  const staff = getElementText(elements, 'staff');
  if (staff) note.staff = parseInt(staff, 10);

  // Chord - check if chord element exists
  for (const el of elements) {
    if (el['chord'] !== undefined) {
      note.chord = true;
      break;
    }
  }

  // Note type
  const noteType = getElementText(elements, 'type');
  if (noteType && isValidNoteType(noteType)) {
    note.noteType = noteType;
  }

  // Dots
  let dotCount = 0;
  for (const el of elements) {
    if (el['dot'] !== undefined) {
      dotCount++;
    }
  }
  if (dotCount > 0) note.dots = dotCount;

  // Accidental
  const accidental = getElementText(elements, 'accidental');
  if (accidental && isValidAccidental(accidental)) {
    note.accidental = accidental;
  }

  // Stem
  const stem = getElementText(elements, 'stem');
  if (stem === 'up' || stem === 'down' || stem === 'none') {
    note.stem = stem;
  }

  // Tie
  for (const el of elements) {
    if (el['tie']) {
      const tieAttrs = getAttributes(el);
      const tieType = tieAttrs['type'];
      if (tieType === 'start' || tieType === 'stop' || tieType === 'continue') {
        note.tie = { type: tieType };
        break;
      }
    }
  }

  // Beam
  const beams: BeamInfo[] = [];
  for (const el of elements) {
    if (el['beam']) {
      beams.push(parseBeam(el['beam'] as OrderedElement[], getAttributes(el)));
    }
  }
  if (beams.length > 0) note.beam = beams;

  // Notations
  const notations = getElementContent(elements, 'notations');
  if (notations) {
    note.notations = parseNotations(notations);
  }

  // Lyrics
  const lyrics: Lyric[] = [];
  for (const el of elements) {
    if (el['lyric']) {
      lyrics.push(parseLyric(el['lyric'] as OrderedElement[], getAttributes(el)));
    }
  }
  if (lyrics.length > 0) note.lyrics = lyrics;

  // Grace note
  for (const el of elements) {
    if (el['grace'] !== undefined) {
      const graceAttrs = getAttributes(el);
      note.grace = {
        slash: graceAttrs['slash'] === 'yes',
      };
      note.duration = 0;
      break;
    }
  }

  // Time modification (tuplet)
  const timeMod = getElementContent(elements, 'time-modification');
  if (timeMod) {
    const actualNotes = getElementText(timeMod, 'actual-notes');
    const normalNotes = getElementText(timeMod, 'normal-notes');
    const normalType = getElementText(timeMod, 'normal-type');

    note.timeModification = {
      actualNotes: parseInt(actualNotes || '3', 10),
      normalNotes: parseInt(normalNotes || '2', 10),
    };

    if (normalType && isValidNoteType(normalType)) {
      note.timeModification.normalType = normalType;
    }
  }

  return note;
}

function parsePitch(elements: OrderedElement[]): Pitch {
  const step = getElementText(elements, 'step') as Pitch['step'] || 'C';
  const octave = parseInt(getElementText(elements, 'octave') || '4', 10);
  const alter = getElementText(elements, 'alter');

  const pitch: Pitch = { step, octave };

  if (alter) {
    const alterValue = parseInt(alter, 10);
    if (alterValue !== 0) {
      pitch.alter = alterValue;
    }
  }

  return pitch;
}

function parseBeam(elements: OrderedElement[], attrs: Record<string, string>): BeamInfo {
  const beam: BeamInfo = {
    number: parseInt(attrs['number'] || '1', 10),
    type: 'begin',
  };

  for (const el of elements) {
    if (el['#text'] !== undefined) {
      const text = String(el['#text']);
      if (text === 'begin' || text === 'continue' || text === 'end' ||
          text === 'forward hook' || text === 'backward hook') {
        beam.type = text;
      }
      break;
    }
  }

  return beam;
}

function parseNotations(elements: OrderedElement[]): Notation[] {
  const notations: Notation[] = [];

  for (const el of elements) {
    if (el['tied']) {
      const attrs = getAttributes(el);
      const notation: Notation = { type: 'tied' };
      if (attrs['type'] === 'start' || attrs['type'] === 'stop') {
        notation.startStop = attrs['type'];
      }
      notations.push(notation);
    } else if (el['slur']) {
      const attrs = getAttributes(el);
      const notation: Notation = { type: 'slur' };
      if (attrs['type'] === 'start' || attrs['type'] === 'stop') {
        notation.startStop = attrs['type'];
      }
      if (attrs['number']) {
        notation.number = parseInt(attrs['number'], 10);
      }
      notations.push(notation);
    } else if (el['articulations']) {
      const artContent = el['articulations'] as OrderedElement[];
      const articulationTypes: NotationType[] = [
        'accent', 'strong-accent', 'staccato', 'staccatissimo',
        'tenuto', 'detached-legato', 'marcato',
      ];
      for (const art of artContent) {
        for (const artType of articulationTypes) {
          if (art[artType] !== undefined) {
            notations.push({ type: artType });
          }
        }
      }
    } else if (el['ornaments']) {
      const ornContent = el['ornaments'] as OrderedElement[];
      const ornamentTypes: NotationType[] = [
        'trill-mark', 'mordent', 'inverted-mordent', 'turn', 'inverted-turn',
      ];
      for (const orn of ornContent) {
        for (const ornType of ornamentTypes) {
          if (orn[ornType] !== undefined) {
            notations.push({ type: ornType });
          }
        }
      }
    } else if (el['technical']) {
      const techContent = el['technical'] as OrderedElement[];
      const technicalTypes: NotationType[] = [
        'up-bow', 'down-bow', 'harmonic', 'pizzicato',
      ];
      for (const tech of techContent) {
        for (const techType of technicalTypes) {
          if (tech[techType] !== undefined) {
            notations.push({ type: techType });
          }
        }
      }
    } else if (el['fermata'] !== undefined) {
      notations.push({ type: 'fermata' });
    } else if (el['arpeggiate'] !== undefined) {
      notations.push({ type: 'arpeggiate' });
    }
  }

  return notations;
}

function parseLyric(elements: OrderedElement[], attrs: Record<string, string>): Lyric {
  const lyric: Lyric = {
    text: getElementText(elements, 'text') || '',
  };

  if (attrs['number']) {
    lyric.number = parseInt(attrs['number'], 10);
  }

  const syllabic = getElementText(elements, 'syllabic');
  if (syllabic === 'single' || syllabic === 'begin' || syllabic === 'middle' || syllabic === 'end') {
    lyric.syllabic = syllabic;
  }

  for (const el of elements) {
    if (el['extend'] !== undefined) {
      lyric.extend = true;
      break;
    }
  }

  return lyric;
}

function parseBackup(elements: OrderedElement[]): BackupEntry {
  return {
    type: 'backup',
    duration: parseInt(getElementText(elements, 'duration') || '0', 10),
  };
}

function parseForward(elements: OrderedElement[]): ForwardEntry {
  const forward: ForwardEntry = {
    type: 'forward',
    duration: parseInt(getElementText(elements, 'duration') || '0', 10),
  };

  const voice = getElementText(elements, 'voice');
  if (voice) forward.voice = parseInt(voice, 10);

  const staff = getElementText(elements, 'staff');
  if (staff) forward.staff = parseInt(staff, 10);

  return forward;
}

function parseDirection(elements: OrderedElement[], attrs: Record<string, string>): DirectionEntry {
  const direction: DirectionEntry = {
    type: 'direction',
    directionTypes: [],
  };

  if (attrs['placement'] === 'above' || attrs['placement'] === 'below') {
    direction.placement = attrs['placement'];
  }

  const staff = getElementText(elements, 'staff');
  if (staff) direction.staff = parseInt(staff, 10);

  const voice = getElementText(elements, 'voice');
  if (voice) direction.voice = parseInt(voice, 10);

  // Direction types
  for (const el of elements) {
    if (el['direction-type']) {
      const parsed = parseDirectionType(el['direction-type'] as OrderedElement[]);
      if (parsed) {
        direction.directionTypes.push(parsed);
      }
    }
  }

  // Sound
  for (const el of elements) {
    if (el['sound']) {
      const soundAttrs = getAttributes(el);
      direction.sound = {};
      if (soundAttrs['tempo']) direction.sound.tempo = parseFloat(soundAttrs['tempo']);
      if (soundAttrs['dynamics']) direction.sound.dynamics = parseFloat(soundAttrs['dynamics']);
      break;
    }
  }

  return direction;
}

function parseDirectionType(elements: OrderedElement[]): DirectionType | null {
  for (const el of elements) {
    // Dynamics
    if (el['dynamics']) {
      const dynContent = el['dynamics'] as OrderedElement[];
      const dynamicsValues: DynamicsValue[] = [
        'ppppp', 'pppp', 'ppp', 'pp', 'p',
        'mp', 'mf',
        'f', 'ff', 'fff', 'ffff', 'fffff',
        'sf', 'sfz', 'sfp', 'fp', 'rf', 'rfz', 'fz',
      ];
      for (const dyn of dynContent) {
        for (const dv of dynamicsValues) {
          if (dyn[dv] !== undefined) {
            return { kind: 'dynamics', value: dv };
          }
        }
      }
    }

    // Wedge
    if (el['wedge']) {
      const wedgeAttrs = getAttributes(el);
      const wedgeType = wedgeAttrs['type'];
      if (wedgeType === 'crescendo' || wedgeType === 'diminuendo' || wedgeType === 'stop') {
        const result: DirectionType = { kind: 'wedge', type: wedgeType };
        if (wedgeAttrs['spread']) result.spread = parseFloat(wedgeAttrs['spread']);
        return result;
      }
    }

    // Metronome
    if (el['metronome']) {
      const metContent = el['metronome'] as OrderedElement[];
      const beatUnit = getElementText(metContent, 'beat-unit');
      const perMinute = getElementText(metContent, 'per-minute');
      if (beatUnit && isValidNoteType(beatUnit) && perMinute) {
        const result: DirectionType = {
          kind: 'metronome',
          beatUnit,
          perMinute: parseInt(perMinute, 10),
        };
        for (const met of metContent) {
          if (met['beat-unit-dot'] !== undefined) {
            result.beatUnitDot = true;
            break;
          }
        }
        return result;
      }
    }

    // Words
    if (el['words']) {
      const wordsContent = el['words'] as OrderedElement[];
      for (const w of wordsContent) {
        if (w['#text'] !== undefined) {
          return { kind: 'words', text: String(w['#text']) };
        }
      }
    }

    // Rehearsal
    if (el['rehearsal']) {
      const rehContent = el['rehearsal'] as OrderedElement[];
      for (const r of rehContent) {
        if (r['#text'] !== undefined) {
          return { kind: 'rehearsal', text: String(r['#text']) };
        }
      }
    }

    // Segno
    if (el['segno'] !== undefined) {
      return { kind: 'segno' };
    }

    // Coda
    if (el['coda'] !== undefined) {
      return { kind: 'coda' };
    }

    // Pedal
    if (el['pedal']) {
      const pedalAttrs = getAttributes(el);
      const pedalType = pedalAttrs['type'];
      if (pedalType === 'start' || pedalType === 'stop' || pedalType === 'change' || pedalType === 'continue') {
        return { kind: 'pedal', type: pedalType };
      }
    }

    // Octave shift
    if (el['octave-shift']) {
      const shiftAttrs = getAttributes(el);
      const shiftType = shiftAttrs['type'];
      if (shiftType === 'up' || shiftType === 'down' || shiftType === 'stop') {
        const result: DirectionType = { kind: 'octave-shift', type: shiftType };
        if (shiftAttrs['size']) result.size = parseInt(shiftAttrs['size'], 10);
        return result;
      }
    }
  }

  return null;
}

function parseBarline(elements: OrderedElement[], attrs: Record<string, string>): Barline {
  const location = (attrs['location'] || 'right') as Barline['location'];

  const barline: Barline = { location };

  const barStyle = getElementText(elements, 'bar-style');
  if (barStyle && isValidBarStyle(barStyle)) {
    barline.barStyle = barStyle;
  }

  for (const el of elements) {
    if (el['repeat']) {
      const repeatAttrs = getAttributes(el);
      const direction = repeatAttrs['direction'];
      if (direction === 'forward' || direction === 'backward') {
        barline.repeat = { direction };
        if (repeatAttrs['times']) {
          barline.repeat.times = parseInt(repeatAttrs['times'], 10);
        }
      }
    } else if (el['ending']) {
      const endingAttrs = getAttributes(el);
      const number = endingAttrs['number'];
      const type = endingAttrs['type'];
      if (number && (type === 'start' || type === 'stop' || type === 'discontinue')) {
        barline.ending = { number, type };
      }
    }
  }

  return barline;
}

// Helper functions
function isValidNoteType(value: string): value is NoteType {
  const validTypes = [
    'maxima', 'long', 'breve',
    'whole', 'half', 'quarter',
    'eighth', '16th', '32nd', '64th', '128th', '256th', '512th', '1024th',
  ];
  return validTypes.includes(value);
}

function isValidAccidental(value: string): value is Accidental {
  const validAccidentals = [
    'sharp', 'natural', 'flat',
    'double-sharp', 'double-flat',
    'natural-sharp', 'natural-flat',
    'quarter-flat', 'quarter-sharp',
    'three-quarters-flat', 'three-quarters-sharp',
  ];
  return validAccidentals.includes(value);
}

function isValidBarStyle(value: string): value is NonNullable<Barline['barStyle']> {
  const validStyles = [
    'regular', 'dotted', 'dashed', 'heavy',
    'light-light', 'light-heavy', 'heavy-light', 'heavy-heavy', 'none',
  ];
  return validStyles.includes(value);
}
