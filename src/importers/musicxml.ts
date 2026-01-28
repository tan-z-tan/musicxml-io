import { XMLParser } from 'fast-xml-parser';
import { generateId } from '../id';
import type {
  Score,
  ScoreMetadata,
  PartListEntry,
  PartInfo,
  PartGroup,
  ScoreInstrument,
  MidiInstrument,
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
  AccidentalInfo,
  BeamInfo,
  Notation,
  Lyric,
  LyricTextElement,
  TimeSignature,
  KeySignature,
  KeyOctave,
  Clef,
  Transpose,
  Barline,
  DynamicsValue,
  Print,
  Defaults,
  Credit,
  CreditWords,
  RestInfo,
  NoteheadInfo,
  NoteheadValue,
  Support,
  Encoding,
  SystemLayout,
  PageLayout,
  PageMargins,
  StaffDetails,
  StaffTuning,
  MeasureStyle,
  HarmonyEntry,
  HarmonyDegree,
  HarmonyFrame,
  FrameNote,
  FiguredBassEntry,
  Figure,
  TupletNotation,
  TiedNotation,
  SoundEntry,
  Swing,
  TechnicalNotation,
  DisplayText,
  MeasureNumbering,
  AttributesEntry,
  OrnamentNotation,
  ArticulationNotation,
  DynamicsNotation,
} from '../types';

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

/** Extract text content from an element array */
function extractText(elements: OrderedElement[]): string {
  for (const item of elements) {
    if (item['#text'] !== undefined) return String(item['#text']);
  }
  return '';
}

function getElementText(elements: OrderedElement[], tagName: string): string | undefined {
  const content = findElement(elements, tagName);
  if (!content) return undefined;
  const text = extractText(content);
  return text || '';
}

/**
 * Get element text as integer with optional default value
 */
function getElementTextAsInt(elements: OrderedElement[], tagName: string, defaultValue?: number): number | undefined {
  const text = getElementText(elements, tagName);
  if (text === undefined || text === '') return defaultValue;
  const value = parseInt(text, 10);
  return isNaN(value) ? defaultValue : value;
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

/**
 * Collect and parse all elements of a given tag name
 */
function collectElements<T>(
  elements: OrderedElement[],
  tagName: string,
  parser: (content: OrderedElement[], attrs: Record<string, string>) => T
): T[] {
  const results: T[] = [];
  for (const el of elements) {
    if (el[tagName]) {
      results.push(parser(el[tagName] as OrderedElement[], getAttributes(el)));
    }
  }
  return results;
}

/**
 * Find first element with tag and parse it
 */
function parseFirstElement<T>(
  elements: OrderedElement[],
  tagName: string,
  parser: (content: OrderedElement[], attrs: Record<string, string>) => T
): T | undefined {
  for (const el of elements) {
    if (el[tagName]) {
      return parser(el[tagName] as OrderedElement[], getAttributes(el));
    }
  }
  return undefined;
}

/**
 * Check if an element with the given tag name exists
 */
function hasElement(elements: OrderedElement[], tagName: string): boolean {
  return elements.some(el => el[tagName] !== undefined);
}

function parseScorePartwise(elements: OrderedElement[]): Score {
  const metadata = parseMetadata(elements);
  const partListContent = getElementContent(elements, 'part-list');
  const partList = partListContent ? parsePartList(partListContent) : [];
  const parts = parseParts(elements);
  const defaults = parseDefaults(elements);
  const credits = parseCredits(elements);

  return {
    _id: generateId(),
    metadata,
    partList,
    parts,
    defaults,
    credits,
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
    // Creators
    const creators = collectElements(identification, 'creator', (content, attrs) =>
      ({ type: attrs['type'], value: extractText(content) }));
    if (creators.length > 0) metadata.creators = creators;

    // Rights
    const rights = collectElements(identification, 'rights', (content) => extractText(content));
    if (rights.length > 0) metadata.rights = rights;

    // Source
    metadata.source = getElementText(identification, 'source');

    // Encoding
    const encoding = getElementContent(identification, 'encoding');
    if (encoding) {
      metadata.encoding = parseEncoding(encoding);
    }

    // Miscellaneous
    const miscellaneous = getElementContent(identification, 'miscellaneous');
    if (miscellaneous) {
      const fields = collectElements(miscellaneous, 'miscellaneous-field', (content, attrs) =>
        ({ name: attrs['name'] || '', value: extractText(content) }));
      if (fields.length > 0) metadata.miscellaneous = fields;
    }
  }

  return metadata;
}

function parseEncoding(elements: OrderedElement[]): Encoding {
  const encoding: Encoding = {};

  const software = collectElements(elements, 'software', (c) => extractText(c));
  const encoder = collectElements(elements, 'encoder', (c) => extractText(c));
  const supports = collectElements(elements, 'supports', (_, attrs) => {
    const support: Support = { element: attrs['element'] || '', type: attrs['type'] === 'no' ? 'no' : 'yes' };
    if (attrs['attribute']) support.attribute = attrs['attribute'];
    if (attrs['value']) support.value = attrs['value'];
    return support;
  });

  encoding.encodingDate = getElementText(elements, 'encoding-date');
  encoding.encodingDescription = getElementText(elements, 'encoding-description');
  if (software.length > 0) encoding.software = software;
  if (encoder.length > 0) encoding.encoder = encoder;
  if (supports.length > 0) encoding.supports = supports;

  return encoding;
}

function parseDefaults(elements: OrderedElement[]): Defaults | undefined {
  const defaultsContent = getElementContent(elements, 'defaults');
  if (!defaultsContent) return undefined;

  const defaults: Defaults = {};

  // Scaling
  const scaling = getElementContent(defaultsContent, 'scaling');
  if (scaling) {
    const mm = getElementText(scaling, 'millimeters');
    const tenths = getElementText(scaling, 'tenths');
    if (mm && tenths) {
      defaults.scaling = {
        millimeters: parseFloat(mm),
        tenths: parseFloat(tenths),
      };
    }
  }

  // Page layout
  const pageLayout = getElementContent(defaultsContent, 'page-layout');
  if (pageLayout) {
    defaults.pageLayout = parsePageLayout(pageLayout);
  }

  // System layout
  const systemLayout = getElementContent(defaultsContent, 'system-layout');
  if (systemLayout) {
    defaults.systemLayout = parseSystemLayout(systemLayout);
  }

  // Staff layout
  const staffLayouts: { number?: number; staffDistance?: number }[] = [];
  for (const el of defaultsContent) {
    if (el['staff-layout']) {
      const attrs = getAttributes(el);
      const content = el['staff-layout'] as OrderedElement[];
      const layout: { number?: number; staffDistance?: number } = {};
      if (attrs['number']) layout.number = parseInt(attrs['number'], 10);
      const dist = getElementText(content, 'staff-distance');
      if (dist) layout.staffDistance = parseFloat(dist);
      staffLayouts.push(layout);
    }
  }
  if (staffLayouts.length > 0) defaults.staffLayout = staffLayouts;

  // Music font
  for (const el of defaultsContent) {
    if (el['music-font']) {
      const attrs = getAttributes(el);
      defaults.musicFont = {
        fontFamily: attrs['font-family'],
        fontSize: attrs['font-size'],
        fontStyle: attrs['font-style'],
        fontWeight: attrs['font-weight'],
      };
      break;
    }
  }

  // Word font
  for (const el of defaultsContent) {
    if (el['word-font']) {
      const attrs = getAttributes(el);
      defaults.wordFont = {
        fontFamily: attrs['font-family'],
        fontSize: attrs['font-size'],
        fontStyle: attrs['font-style'],
        fontWeight: attrs['font-weight'],
      };
      break;
    }
  }

  // Lyric fonts
  const lyricFonts: import('../types').LyricFontInfo[] = [];
  for (const el of defaultsContent) {
    if (el['lyric-font']) {
      const attrs = getAttributes(el);
      const lf: import('../types').LyricFontInfo = {
        fontFamily: attrs['font-family'],
        fontSize: attrs['font-size'],
        fontStyle: attrs['font-style'],
        fontWeight: attrs['font-weight'],
      };
      if (attrs['number']) lf.number = parseInt(attrs['number'], 10);
      if (attrs['name']) lf.name = attrs['name'];
      lyricFonts.push(lf);
    }
  }
  if (lyricFonts.length > 0) defaults.lyricFont = lyricFonts;

  // Lyric languages
  const lyricLanguages: import('../types').LyricLanguageInfo[] = [];
  for (const el of defaultsContent) {
    if (el['lyric-language']) {
      const attrs = getAttributes(el);
      const ll: import('../types').LyricLanguageInfo = {
        xmlLang: attrs['xml:lang'] || '',
      };
      if (attrs['number']) ll.number = parseInt(attrs['number'], 10);
      if (attrs['name']) ll.name = attrs['name'];
      lyricLanguages.push(ll);
    }
  }
  if (lyricLanguages.length > 0) defaults.lyricLanguage = lyricLanguages;

  // Appearance (store as raw key-value pairs)
  const appResult = parseFirstElement(defaultsContent, 'appearance', (appContent) => {
    const appearance: Record<string, unknown> = {};
    const lineWidths = collectElements(appContent, 'line-width', (c, a) =>
      ({ type: a['type'] || '', value: parseFloat(extractText(c)) || 0 }));
    const noteSizes = collectElements(appContent, 'note-size', (c, a) =>
      ({ type: a['type'] || '', value: parseFloat(extractText(c)) || 0 }));
    const distances = collectElements(appContent, 'distance', (c, a) =>
      ({ type: a['type'] || '', value: parseFloat(extractText(c)) || 0 }));
    const glyphs = collectElements(appContent, 'glyph', (c, a) =>
      ({ type: a['type'] || '', value: extractText(c) }));
    if (lineWidths.length > 0) appearance['line-widths'] = lineWidths;
    if (noteSizes.length > 0) appearance['note-sizes'] = noteSizes;
    if (distances.length > 0) appearance['distances'] = distances;
    if (glyphs.length > 0) appearance['glyphs'] = glyphs;
    return Object.keys(appearance).length > 0 ? appearance : undefined;
  });
  if (appResult) defaults.appearance = appResult;

  return defaults;
}

function parsePageLayout(elements: OrderedElement[]): PageLayout {
  const layout: PageLayout = {};

  const height = getElementText(elements, 'page-height');
  if (height) layout.pageHeight = parseFloat(height);

  const width = getElementText(elements, 'page-width');
  if (width) layout.pageWidth = parseFloat(width);

  const margins: PageMargins[] = [];
  for (const el of elements) {
    if (el['page-margins']) {
      const attrs = getAttributes(el);
      const content = el['page-margins'] as OrderedElement[];
      const m: PageMargins = {};
      if (attrs['type'] === 'odd' || attrs['type'] === 'even' || attrs['type'] === 'both') {
        m.type = attrs['type'];
      }
      const left = getElementText(content, 'left-margin');
      if (left) m.leftMargin = parseFloat(left);
      const right = getElementText(content, 'right-margin');
      if (right) m.rightMargin = parseFloat(right);
      const top = getElementText(content, 'top-margin');
      if (top) m.topMargin = parseFloat(top);
      const bottom = getElementText(content, 'bottom-margin');
      if (bottom) m.bottomMargin = parseFloat(bottom);
      margins.push(m);
    }
  }
  if (margins.length > 0) layout.pageMargins = margins;

  return layout;
}

function parseSystemLayout(elements: OrderedElement[]): SystemLayout {
  const layout: SystemLayout = {};

  const margins = getElementContent(elements, 'system-margins');
  if (margins) {
    layout.systemMargins = {};
    const left = getElementText(margins, 'left-margin');
    if (left) layout.systemMargins.leftMargin = parseFloat(left);
    const right = getElementText(margins, 'right-margin');
    if (right) layout.systemMargins.rightMargin = parseFloat(right);
  }

  const dist = getElementText(elements, 'system-distance');
  if (dist) layout.systemDistance = parseFloat(dist);

  const topDist = getElementText(elements, 'top-system-distance');
  if (topDist) layout.topSystemDistance = parseFloat(topDist);

  // Parse system-dividers
  const dividers = getElementContent(elements, 'system-dividers');
  if (dividers) {
    layout.systemDividers = {};
    for (const el of dividers) {
      if (el['left-divider']) {
        const attrs = getAttributes(el);
        layout.systemDividers.leftDivider = {
          printObject: attrs['print-object'] === 'yes' ? true : attrs['print-object'] === 'no' ? false : undefined,
          halign: attrs['halign'],
          valign: attrs['valign'],
        };
      }
      if (el['right-divider']) {
        const attrs = getAttributes(el);
        layout.systemDividers.rightDivider = {
          printObject: attrs['print-object'] === 'yes' ? true : attrs['print-object'] === 'no' ? false : undefined,
          halign: attrs['halign'],
          valign: attrs['valign'],
        };
      }
    }
  }

  return layout;
}

function parseCredits(elements: OrderedElement[]): Credit[] | undefined {
  const credits = collectElements(elements, 'credit', (content, attrs) => {
    const credit: Credit = { _id: generateId() };
    if (attrs['page']) credit.page = parseInt(attrs['page'], 10);
    const types = collectElements(content, 'credit-type', (c) => extractText(c));
    const words = collectElements(content, 'credit-words', (c, a) => {
      const cw: CreditWords = { text: extractText(c) };
      if (a['default-x']) cw.defaultX = parseFloat(a['default-x']);
      if (a['default-y']) cw.defaultY = parseFloat(a['default-y']);
      if (a['font-family']) cw.fontFamily = a['font-family'];
      if (a['font-size']) cw.fontSize = a['font-size'];
      if (a['font-weight']) cw.fontWeight = a['font-weight'];
      if (a['font-style']) cw.fontStyle = a['font-style'];
      if (a['justify']) cw.justify = a['justify'];
      if (a['halign']) cw.halign = a['halign'];
      if (a['valign']) cw.valign = a['valign'];
      if (a['letter-spacing']) cw.letterSpacing = a['letter-spacing'];
      if (a['xml:lang']) cw.xmlLang = a['xml:lang'];
      if (a['xml:space']) cw.xmlSpace = a['xml:space'];
      return cw;
    });
    if (types.length > 0) credit.creditType = types;
    if (words.length > 0) credit.creditWords = words;
    return credit;
  });
  return credits.length > 0 ? credits : undefined;
}

function parseDisplayTexts(elements: OrderedElement[]): DisplayText[] {
  return collectElements(elements, 'display-text', (c, a) => {
    const dt: DisplayText = { text: extractText(c) };
    if (a['font-family']) dt.fontFamily = a['font-family'];
    if (a['font-size']) dt.fontSize = a['font-size'];
    if (a['font-style']) dt.fontStyle = a['font-style'];
    if (a['font-weight']) dt.fontWeight = a['font-weight'];
    if (a['xml:space']) dt.xmlSpace = a['xml:space'];
    return dt;
  });
}

function parsePartList(elements: OrderedElement[]): PartListEntry[] {
  const partList: PartListEntry[] = [];

  for (const el of elements) {
    if (el['score-part']) {
      const attrs = getAttributes(el);
      const content = el['score-part'] as OrderedElement[];

      const partInfo: PartInfo = {
        _id: generateId(),
        type: 'score-part',
        id: attrs['id'] || '',
      };

      // Check if part-name element exists (even if empty)
      for (const child of content) {
        if (child['part-name'] !== undefined) {
          const pnAttrs = getAttributes(child);
          partInfo.name = getElementText(content, 'part-name') ?? '';
          if (pnAttrs['print-object'] === 'no') {
            partInfo.namePrintObject = false;
          }
          break;
        }
      }

      // part-name-display
      for (const child of content) {
        if (child['part-name-display']) {
          partInfo.partNameDisplay = parseDisplayTexts(child['part-name-display'] as OrderedElement[]);
          break;
        }
      }

      // part-abbreviation
      for (const child of content) {
        if (child['part-abbreviation'] !== undefined) {
          const paAttrs = getAttributes(child);
          partInfo.abbreviation = getElementText(content, 'part-abbreviation') ?? '';
          if (paAttrs['print-object'] === 'no') {
            partInfo.abbreviationPrintObject = false;
          }
          break;
        }
      }

      // part-abbreviation-display
      for (const child of content) {
        if (child['part-abbreviation-display']) {
          partInfo.partAbbreviationDisplay = parseDisplayTexts(child['part-abbreviation-display'] as OrderedElement[]);
          break;
        }
      }

      // Score instruments
      const instruments: ScoreInstrument[] = [];
      for (const child of content) {
        if (child['score-instrument']) {
          const instAttrs = getAttributes(child);
          const instContent = child['score-instrument'] as OrderedElement[];
          const inst: ScoreInstrument = {
            id: instAttrs['id'] || '',
            name: getElementText(instContent, 'instrument-name') || '',
          };
          const abbr = getElementText(instContent, 'instrument-abbreviation');
          if (abbr) inst.abbreviation = abbr;
          const sound = getElementText(instContent, 'instrument-sound');
          if (sound) inst.sound = sound;
          // Check for solo/ensemble
          if (hasElement(instContent, 'solo')) inst.solo = true;
          if (hasElement(instContent, 'ensemble')) {
            const ensText = getElementText(instContent, 'ensemble');
            // ensemble can be empty (no value) or have a number
            inst.ensemble = ensText ? parseInt(ensText, 10) : 0;
          }
          instruments.push(inst);
        }
      }
      if (instruments.length > 0) partInfo.scoreInstruments = instruments;

      // Group elements (after MIDI instruments in score-part)
      const groups = collectElements(content, 'group', (c) => extractText(c));
      if (groups.length > 0) partInfo.groups = groups;

      // MIDI instruments
      const midiInstruments: MidiInstrument[] = [];
      for (const child of content) {
        if (child['midi-instrument']) {
          const midiAttrs = getAttributes(child);
          const midiContent = child['midi-instrument'] as OrderedElement[];
          const midi: MidiInstrument = {
            id: midiAttrs['id'] || '',
          };
          const channel = getElementText(midiContent, 'midi-channel');
          if (channel) midi.channel = parseInt(channel, 10);
          const name = getElementText(midiContent, 'midi-name');
          if (name) midi.name = name;
          const bank = getElementText(midiContent, 'midi-bank');
          if (bank) midi.bank = parseInt(bank, 10);
          const program = getElementText(midiContent, 'midi-program');
          if (program) midi.program = parseInt(program, 10);
          const unpitched = getElementText(midiContent, 'midi-unpitched');
          if (unpitched) midi.unpitched = parseInt(unpitched, 10);
          const volume = getElementText(midiContent, 'volume');
          if (volume) midi.volume = parseFloat(volume);
          const pan = getElementText(midiContent, 'pan');
          if (pan) midi.pan = parseFloat(pan);
          const elevation = getElementText(midiContent, 'elevation');
          if (elevation) midi.elevation = parseFloat(elevation);
          midiInstruments.push(midi);
        }
      }
      if (midiInstruments.length > 0) partInfo.midiInstruments = midiInstruments;

      partList.push(partInfo);
    } else if (el['part-group']) {
      const attrs = getAttributes(el);
      const content = el['part-group'] as OrderedElement[];

      const group: PartGroup = {
        _id: generateId(),
        type: 'part-group',
        groupType: attrs['type'] === 'stop' ? 'stop' : 'start',
      };
      if (attrs['number']) group.number = parseInt(attrs['number'], 10);

      const name = getElementText(content, 'group-name');
      if (name) group.groupName = name;
      const gnd = parseFirstElement(content, 'group-name-display', (c) => parseDisplayTexts(c));
      if (gnd) group.groupNameDisplay = gnd;

      const abbr = getElementText(content, 'group-abbreviation');
      if (abbr) group.groupAbbreviation = abbr;
      const gad = parseFirstElement(content, 'group-abbreviation-display', (c) => parseDisplayTexts(c));
      if (gad) group.groupAbbreviationDisplay = gad;

      // Parse group-symbol with default-x attribute
      parseFirstElement(content, 'group-symbol', (c, a) => {
        const symbol = extractText(c);
        if (['none', 'brace', 'line', 'bracket', 'square'].includes(symbol)) {
          group.groupSymbol = symbol as PartGroup['groupSymbol'];
        }
        if (a['default-x']) group.groupSymbolDefaultX = parseFloat(a['default-x']);
      });

      const barline = getElementText(content, 'group-barline');
      if (barline && ['yes', 'no', 'Mensurstrich'].includes(barline)) {
        group.groupBarline = barline as PartGroup['groupBarline'];
      }

      partList.push(group);
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
        _id: generateId(),
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
    _id: generateId(),
    number: attrs['number'] || '0', // Keep as string per MusicXML spec (token type)
    entries: [],
  };

  if (attrs['width']) measure.width = parseFloat(attrs['width']);
  if (attrs['implicit'] === 'yes') measure.implicit = true;

  const barlines: Barline[] = [];
  let isFirstAttributes = true;

  // Process elements in order - this is the key to maintaining order!
  for (const el of elements) {
    if (el['attributes']) {
      const parsedAttrs = parseAttributes(el['attributes'] as OrderedElement[]);
      if (isFirstAttributes) {
        measure.attributes = parsedAttrs;
        isFirstAttributes = false;
      } else {
        // Mid-measure attributes go into entries
        const attrEntry: AttributesEntry = {
          _id: generateId(),
          type: 'attributes',
          attributes: parsedAttrs,
        };
        measure.entries.push(attrEntry);
      }
    } else if (el['note']) {
      measure.entries.push(parseNote(el['note'] as OrderedElement[], getAttributes(el)));
    } else if (el['backup']) {
      measure.entries.push(parseBackup(el['backup'] as OrderedElement[]));
    } else if (el['forward']) {
      measure.entries.push(parseForward(el['forward'] as OrderedElement[]));
    } else if (el['direction']) {
      measure.entries.push(parseDirection(el['direction'] as OrderedElement[], getAttributes(el)));
    } else if (el['barline']) {
      barlines.push(parseBarline(el['barline'] as OrderedElement[], getAttributes(el)));
    } else if (el['print']) {
      measure.print = parsePrint(el['print'] as OrderedElement[], getAttributes(el));
    } else if (el['harmony']) {
      measure.entries.push(parseHarmony(el['harmony'] as OrderedElement[], getAttributes(el)));
    } else if (el['figured-bass']) {
      measure.entries.push(parseFiguredBass(el['figured-bass'] as OrderedElement[], getAttributes(el)));
    } else if (el['sound']) {
      measure.entries.push(parseSound(el['sound'] as OrderedElement[], getAttributes(el)));
    }
  }

  if (barlines.length > 0) measure.barlines = barlines;

  return measure;
}

function parsePrint(elements: OrderedElement[], attrs: Record<string, string>): Print {
  const print: Print = {};

  if (attrs['new-system'] === 'yes') print.newSystem = true;
  if (attrs['new-page'] === 'yes') print.newPage = true;
  if (attrs['blank-page']) print.blankPage = parseInt(attrs['blank-page'], 10);
  if (attrs['page-number']) print.pageNumber = attrs['page-number'];

  const sysLayout = getElementContent(elements, 'system-layout');
  if (sysLayout) print.systemLayout = parseSystemLayout(sysLayout);

  const pageLayout = getElementContent(elements, 'page-layout');
  if (pageLayout) print.pageLayout = parsePageLayout(pageLayout);

  const staffLayouts: { number?: number; staffDistance?: number }[] = [];
  for (const el of elements) {
    if (el['staff-layout']) {
      const layoutAttrs = getAttributes(el);
      const content = el['staff-layout'] as OrderedElement[];
      const layout: { number?: number; staffDistance?: number } = {};
      if (layoutAttrs['number']) layout.number = parseInt(layoutAttrs['number'], 10);
      const dist = getElementText(content, 'staff-distance');
      if (dist) layout.staffDistance = parseFloat(dist);
      staffLayouts.push(layout);
    }
  }
  if (staffLayouts.length > 0) print.staffLayouts = staffLayouts;

  const measureLayout = getElementContent(elements, 'measure-layout');
  if (measureLayout) {
    const dist = getElementText(measureLayout, 'measure-distance');
    if (dist) print.measureLayout = { measureDistance: parseFloat(dist) };
  }

  // measure-numbering with attributes
  parseFirstElement(elements, 'measure-numbering', (c, a) => {
    const measureNumbering: MeasureNumbering = { value: extractText(c) };
    if (a['system'] && ['only-top', 'only-bottom', 'all-system-parts', 'none'].includes(a['system'])) {
      measureNumbering.system = a['system'] as MeasureNumbering['system'];
    }
    print.measureNumbering = measureNumbering;
  });

  const pnd = parseFirstElement(elements, 'part-name-display', (c) => parseDisplayTexts(c));
  if (pnd) print.partNameDisplay = pnd;
  const pad = parseFirstElement(elements, 'part-abbreviation-display', (c) => parseDisplayTexts(c));
  if (pad) print.partAbbreviationDisplay = pad;

  return print;
}

function parseAttributes(elements: OrderedElement[]): MeasureAttributes {
  const attrs: MeasureAttributes = {};

  const divisions = getElementTextAsInt(elements, 'divisions');
  if (divisions !== undefined) attrs.divisions = divisions;

  const staves = getElementTextAsInt(elements, 'staves');
  if (staves !== undefined) attrs.staves = staves;

  const instruments = getElementTextAsInt(elements, 'instruments');
  if (instruments !== undefined) attrs.instruments = instruments;

  // Time signature
  const time = getElementContent(elements, 'time');
  if (time) {
    attrs.time = parseTimeSignature(time, elements);
  }

  // Key signature(s) - can be multiple for multi-staff
  const keys: KeySignature[] = [];
  for (const el of elements) {
    if (el['key']) {
      const keyAttrs = getAttributes(el);
      const keyContent = el['key'] as OrderedElement[];
      const key = parseKeySignature(keyContent);
      if (keyAttrs['number']) key.number = parseInt(keyAttrs['number'], 10);
      if (keyAttrs['print-object'] === 'no') key.printObject = false;
      keys.push(key);
    }
  }
  if (keys.length === 1) {
    attrs.key = keys[0];
  } else if (keys.length > 1) {
    // Store as array in a separate property
    attrs.keys = keys;
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

  // Staff details
  const staffDetailsList: StaffDetails[] = [];
  for (const el of elements) {
    if (el['staff-details']) {
      const sdAttrs = getAttributes(el);
      const content = el['staff-details'] as OrderedElement[];
      staffDetailsList.push(parseStaffDetails(content, sdAttrs));
    }
  }
  if (staffDetailsList.length > 0) attrs.staffDetails = staffDetailsList;

  // Measure style
  const measureStyleList: MeasureStyle[] = [];
  for (const el of elements) {
    if (el['measure-style']) {
      const msAttrs = getAttributes(el);
      const content = el['measure-style'] as OrderedElement[];
      measureStyleList.push(parseMeasureStyle(content, msAttrs));
    }
  }
  if (measureStyleList.length > 0) attrs.measureStyle = measureStyleList;

  return attrs;
}

function parseTimeSignature(elements: OrderedElement[], parentElements: OrderedElement[]): TimeSignature {
  // Check for senza-misura first
  for (const el of elements) {
    if (el['senza-misura'] !== undefined) {
      const time: TimeSignature = {
        beats: '',
        beatType: 0,
        senzaMisura: true,
      };
      return time;
    }
  }

  // Collect all beats and beat-type values for compound time signatures
  const beatsList = collectElements(elements, 'beats', (c) => parseInt(extractText(c), 10));
  const beatTypeList = collectElements(elements, 'beat-type', (c) => parseInt(extractText(c), 10));

  const time: TimeSignature = {
    beats: beatsList.length > 0 ? String(beatsList[0]) : '4',
    beatType: beatTypeList.length > 0 ? beatTypeList[0] : 4,
  };

  // Store compound time signature data
  if (beatsList.length > 1 || beatTypeList.length > 1) {
    time.beatsList = beatsList;
    time.beatTypeList = beatTypeList;
  }

  // Get symbol and print-object attributes from parent
  for (const el of parentElements) {
    if (el['time']) {
      const attrs = getAttributes(el);
      if (attrs['symbol']) {
        const sym = attrs['symbol'];
        if (['common', 'cut', 'single-number', 'note', 'dotted-note', 'normal'].includes(sym)) {
          time.symbol = sym as TimeSignature['symbol'];
        }
      }
      if (attrs['print-object'] === 'no') {
        time.printObject = false;
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

  const validModes = ['major', 'minor', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'aeolian', 'ionian', 'locrian', 'none'];
  if (mode && validModes.includes(mode)) {
    key.mode = mode as KeySignature['mode'];
  }

  // Parse cancel element with its location attribute
  parseFirstElement(elements, 'cancel', (c, a) => {
    key.cancel = parseInt(extractText(c), 10);
    if (a['location']) key.cancelLocation = a['location'] as 'left' | 'right' | 'before-barline';
  });

  // Non-traditional key signatures
  const keySteps = collectElements(elements, 'key-step', (c) => extractText(c));
  const keyAlters = collectElements(elements, 'key-alter', (c) => parseFloat(extractText(c)));
  const keyOctaves = collectElements(elements, 'key-octave', (c, a) => {
    const ko: KeyOctave = { number: parseInt(a['number'] || '1', 10), octave: parseInt(extractText(c), 10) };
    if (a['cancel'] === 'yes') ko.cancel = true;
    return ko;
  });

  if (keySteps.length > 0) key.keySteps = keySteps;
  if (keyAlters.length > 0) key.keyAlters = keyAlters;
  if (keyOctaves.length > 0) key.keyOctaves = keyOctaves;

  return key;
}

function parseClef(elements: OrderedElement[], attrs: Record<string, string>): Clef {
  const sign = getElementText(elements, 'sign') as Clef['sign'] || 'G';
  const line = parseInt(getElementText(elements, 'line') || '2', 10);

  const clef: Clef = { sign, line };

  if (attrs['number']) {
    clef.staff = parseInt(attrs['number'], 10);
  }

  const octaveChange = getElementTextAsInt(elements, 'clef-octave-change');
  if (octaveChange !== undefined) {
    clef.clefOctaveChange = octaveChange;
  }

  if (attrs['print-object'] === 'no') {
    clef.printObject = false;
  }
  if (attrs['after-barline'] === 'yes') {
    clef.afterBarline = true;
  }

  return clef;
}

function parseTranspose(elements: OrderedElement[]): Transpose {
  const transpose: Transpose = {
    diatonic: getElementTextAsInt(elements, 'diatonic', 0)!,
    chromatic: getElementTextAsInt(elements, 'chromatic', 0)!,
  };

  const octaveChange = getElementTextAsInt(elements, 'octave-change');
  if (octaveChange !== undefined) {
    transpose.octaveChange = octaveChange;
  }

  return transpose;
}

function parseNote(elements: OrderedElement[], attrs: Record<string, string>): NoteEntry {
  const note: NoteEntry = {
    _id: generateId(),
    type: 'note',
    duration: getElementTextAsInt(elements, 'duration', 0)!,
    voice: getElementTextAsInt(elements, 'voice', 1)!,
  };

  // Layout attributes
  if (attrs['default-x']) note.defaultX = parseFloat(attrs['default-x']);
  if (attrs['default-y']) note.defaultY = parseFloat(attrs['default-y']);
  if (attrs['relative-x']) note.relativeX = parseFloat(attrs['relative-x']);
  if (attrs['relative-y']) note.relativeY = parseFloat(attrs['relative-y']);
  if (attrs['dynamics']) note.dynamics = parseFloat(attrs['dynamics']);
  if (attrs['print-object'] === 'no') note.printObject = false;
  if (attrs['print-dot'] === 'no') note.printDot = false;
  if (attrs['print-dot'] === 'yes') note.printDot = true;
  if (attrs['print-spacing'] === 'yes') note.printSpacing = true;
  if (attrs['print-spacing'] === 'no') note.printSpacing = false;

  // Cue note
  if (hasElement(elements, 'cue')) {
    note.cue = true;
  }

  // Instrument reference
  const instData = parseFirstElement(elements, 'instrument', (_, attrs) => attrs['id']);
  if (instData) note.instrument = instData;

  // Pitch or rest
  const pitch = getElementContent(elements, 'pitch');
  if (pitch) {
    note.pitch = parsePitch(pitch);
  }

  // Rest
  for (const el of elements) {
    if (el['rest'] !== undefined) {
      const restContent = el['rest'] as OrderedElement[];
      const restInfo: RestInfo = {};

      const restAttrs = getAttributes(el);
      if (restAttrs['measure'] === 'yes') restInfo.measure = true;

      const displayStep = getElementText(restContent, 'display-step');
      if (displayStep) restInfo.displayStep = displayStep;

      const displayOctave = getElementText(restContent, 'display-octave');
      if (displayOctave) restInfo.displayOctave = parseInt(displayOctave, 10);

      note.rest = restInfo;
      break;
    }
  }

  // Unpitched (percussion)
  parseFirstElement(elements, 'unpitched', (c) => {
    note.unpitched = {};
    const displayStep = getElementText(c, 'display-step');
    if (displayStep) note.unpitched.displayStep = displayStep;
    const displayOctave = getElementText(c, 'display-octave');
    if (displayOctave) note.unpitched.displayOctave = parseInt(displayOctave, 10);
  });

  // Staff
  const staff = getElementTextAsInt(elements, 'staff');
  if (staff !== undefined) note.staff = staff;

  // Chord - check if chord element exists
  if (hasElement(elements, 'chord')) {
    note.chord = true;
  }

  // Note type
  parseFirstElement(elements, 'type', (c, a) => {
    const noteType = extractText(c);
    if (isValidNoteType(noteType)) note.noteType = noteType;
    if (a['size']) note.noteTypeSize = a['size'];
  });

  // Dots
  const dotCount = elements.filter(el => el['dot'] !== undefined).length;
  if (dotCount > 0) note.dots = dotCount;

  // Accidental
  parseFirstElement(elements, 'accidental', (c, a) => {
    const accValue = extractText(c);
    if (isValidAccidental(accValue)) {
      const accInfo: AccidentalInfo = { value: accValue };
      if (a['cautionary'] === 'yes') accInfo.cautionary = true;
      if (a['editorial'] === 'yes') accInfo.editorial = true;
      if (a['parentheses'] === 'yes') accInfo.parentheses = true;
      if (a['bracket'] === 'yes') accInfo.bracket = true;
      if (a['relative-x']) accInfo.relativeX = parseFloat(a['relative-x']);
      if (a['relative-y']) accInfo.relativeY = parseFloat(a['relative-y']);
      if (a['color']) accInfo.color = a['color'];
      if (a['size']) accInfo.size = a['size'];
      if (a['font-size']) accInfo.fontSize = a['font-size'];
      note.accidental = accInfo;
    }
  });

  // Stem
  parseFirstElement(elements, 'stem', (c, a) => {
    const stemValue = extractText(c);
    if (stemValue === 'up' || stemValue === 'down' || stemValue === 'none' || stemValue === 'double') {
      note.stem = { value: stemValue };
      if (a['default-x']) note.stem.defaultX = parseFloat(a['default-x']);
      if (a['default-y']) note.stem.defaultY = parseFloat(a['default-y']);
    }
  });

  // Notehead
  parseFirstElement(elements, 'notehead', (c, a) => {
    const nhValue = extractText(c);
    if (isValidNotehead(nhValue)) {
      const nhInfo: NoteheadInfo = { value: nhValue };
      if (a['filled'] === 'yes') nhInfo.filled = true;
      else if (a['filled'] === 'no') nhInfo.filled = false;
      if (a['parentheses'] === 'yes') nhInfo.parentheses = true;
      note.notehead = nhInfo;
    }
  });

  // Tie (collect all tie elements)
  const tieElements = collectElements(elements, 'tie', (_, a) => {
    const t = a['type'];
    return (t === 'start' || t === 'stop' || t === 'continue') ? { type: t } : null;
  }).filter((t): t is { type: 'start' | 'stop' | 'continue' } => t !== null);
  if (tieElements.length > 0) {
    note.tie = tieElements[0];
    if (tieElements.length > 1) note.ties = tieElements;
  }

  // Beam
  const beams = collectElements(elements, 'beam', (c, a) => parseBeam(c, a));
  if (beams.length > 0) note.beam = beams;

  // Notations - collect ALL notations elements, not just the first
  const allNotations: Notation[] = [];
  let notationsIndex = 0;
  for (const el of elements) {
    if (el['notations']) {
      const parsedNotations = parseNotations(el['notations'] as OrderedElement[], notationsIndex);
      allNotations.push(...parsedNotations);
      notationsIndex++;
    }
  }
  if (allNotations.length > 0) {
    note.notations = allNotations;
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
      note.grace = {};
      if (graceAttrs['slash'] === 'yes') note.grace.slash = true;
      else if (graceAttrs['slash'] === 'no') note.grace.slash = false;
      if (graceAttrs['steal-time-previous']) {
        note.grace.stealTimePrevious = parseFloat(graceAttrs['steal-time-previous']);
      }
      if (graceAttrs['steal-time-following']) {
        note.grace.stealTimeFollowing = parseFloat(graceAttrs['steal-time-following']);
      }
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

    // Count normal-dot elements
    let dotCount = 0;
    for (const tm of timeMod) {
      if (tm['normal-dot'] !== undefined) dotCount++;
    }
    if (dotCount > 0) note.timeModification.normalDots = dotCount;
  }

  return note;
}

function parsePitch(elements: OrderedElement[]): Pitch {
  const step = getElementText(elements, 'step') as Pitch['step'] || 'C';
  const octave = parseInt(getElementText(elements, 'octave') || '4', 10);
  const alter = getElementText(elements, 'alter');

  const pitch: Pitch = { step, octave };

  if (alter) {
    const alterValue = parseFloat(alter);
    if (alterValue !== 0) {
      pitch.alter = alterValue;
    }
  }

  return pitch;
}

function parseBeam(elements: OrderedElement[], attrs: Record<string, string>): BeamInfo {
  const text = extractText(elements);
  const validTypes = ['begin', 'continue', 'end', 'forward hook', 'backward hook'];
  return {
    number: parseInt(attrs['number'] || '1', 10),
    type: validTypes.includes(text) ? text as BeamInfo['type'] : 'begin',
  };
}

function parseNotations(elements: OrderedElement[], notationsIndex: number = 0): Notation[] {
  const notations: Notation[] = [];
  let articulationsIndex = 0;

  for (const el of elements) {
    if (el['tied']) {
      const attrs = getAttributes(el);
      const tied: TiedNotation = {
        type: 'tied',
        tiedType: (attrs['type'] as 'start' | 'stop' | 'continue' | 'let-ring') || 'start',
        number: attrs['number'] ? parseInt(attrs['number'], 10) : undefined,
        orientation: attrs['orientation'] as 'over' | 'under' | undefined,
        notationsIndex,
      };
      notations.push(tied);
    } else if (el['slur']) {
      const attrs = getAttributes(el);
      const slur: Notation = {
        type: 'slur',
        slurType: (attrs['type'] as 'start' | 'stop' | 'continue') || 'start',
        number: attrs['number'] ? parseInt(attrs['number'], 10) : undefined,
        lineType: attrs['line-type'] as 'solid' | 'dashed' | 'dotted' | 'wavy' | undefined,
        orientation: attrs['orientation'] as 'over' | 'under' | undefined,
        defaultX: attrs['default-x'] ? parseFloat(attrs['default-x']) : undefined,
        defaultY: attrs['default-y'] ? parseFloat(attrs['default-y']) : undefined,
        bezierX: attrs['bezier-x'] ? parseFloat(attrs['bezier-x']) : undefined,
        bezierY: attrs['bezier-y'] ? parseFloat(attrs['bezier-y']) : undefined,
        bezierX2: attrs['bezier-x2'] ? parseFloat(attrs['bezier-x2']) : undefined,
        bezierY2: attrs['bezier-y2'] ? parseFloat(attrs['bezier-y2']) : undefined,
        placement: attrs['placement'] as 'above' | 'below' | undefined,
        notationsIndex,
      };
      notations.push(slur);
    } else if (el['tuplet']) {
      const attrs = getAttributes(el);
      const tupletContent = el['tuplet'] as OrderedElement[];
      const tuplet: TupletNotation = {
        type: 'tuplet',
        tupletType: attrs['type'] === 'stop' ? 'stop' : 'start',
        number: attrs['number'] ? parseInt(attrs['number'], 10) : undefined,
        bracket: attrs['bracket'] === 'yes' ? true : attrs['bracket'] === 'no' ? false : undefined,
        showNumber: attrs['show-number'] as 'actual' | 'both' | 'none' | undefined,
        showType: attrs['show-type'] as 'actual' | 'both' | 'none' | undefined,
        lineShape: attrs['line-shape'] as 'straight' | 'curved' | undefined,
        placement: attrs['placement'] as 'above' | 'below' | undefined,
        notationsIndex,
      };

      // Parse tuplet-actual and tuplet-normal
      for (const tc of tupletContent) {
        if (tc['tuplet-actual']) {
          const actualContent = tc['tuplet-actual'] as OrderedElement[];
          const actual: NonNullable<TupletNotation['tupletActual']> = {};
          const num = getElementText(actualContent, 'tuplet-number');
          if (num) actual.tupletNumber = parseInt(num, 10);
          const type = getElementText(actualContent, 'tuplet-type');
          if (type && isValidNoteType(type)) actual.tupletType = type;
          let dotCount = 0;
          for (const ac of actualContent) {
            if (ac['tuplet-dot'] !== undefined) dotCount++;
          }
          if (dotCount > 0) actual.tupletDots = dotCount;
          if (Object.keys(actual).length > 0) tuplet.tupletActual = actual;
        } else if (tc['tuplet-normal']) {
          const normalContent = tc['tuplet-normal'] as OrderedElement[];
          const normal: NonNullable<TupletNotation['tupletNormal']> = {};
          const num = getElementText(normalContent, 'tuplet-number');
          if (num) normal.tupletNumber = parseInt(num, 10);
          const type = getElementText(normalContent, 'tuplet-type');
          if (type && isValidNoteType(type)) normal.tupletType = type;
          let dotCount = 0;
          for (const nc of normalContent) {
            if (nc['tuplet-dot'] !== undefined) dotCount++;
          }
          if (dotCount > 0) normal.tupletDots = dotCount;
          if (Object.keys(normal).length > 0) tuplet.tupletNormal = normal;
        }
      }

      notations.push(tuplet);
    } else if (el['articulations']) {
      const artContent = el['articulations'] as OrderedElement[];
      const articulationTypes = [
        'accent', 'strong-accent', 'staccato', 'staccatissimo',
        'tenuto', 'detached-legato', 'marcato', 'spiccato',
        'scoop', 'plop', 'doit', 'falloff', 'breath-mark',
        'caesura', 'stress', 'unstress', 'soft-accent',
      ];
      const currentArtIndex = articulationsIndex;
      articulationsIndex++;
      for (const art of artContent) {
        for (const artType of articulationTypes) {
          if (art[artType] !== undefined) {
            const artAttrs = getAttributes(art);
            const artNotation: ArticulationNotation = {
              type: 'articulation',
              articulation: artType as any,
              placement: artAttrs['placement'] as 'above' | 'below' | undefined,
              notationsIndex,
              articulationsIndex: currentArtIndex,
            };
            // Handle strong-accent type attribute
            if (artType === 'strong-accent') {
              if (artAttrs['type'] === 'up' || artAttrs['type'] === 'down') {
                artNotation.strongAccentType = artAttrs['type'];
              }
            }
            // Handle positioning attributes
            if (artAttrs['default-x']) {
              artNotation.defaultX = parseFloat(artAttrs['default-x']);
            }
            if (artAttrs['default-y']) {
              artNotation.defaultY = parseFloat(artAttrs['default-y']);
            }
            notations.push(artNotation);
          }
        }
      }
    } else if (el['ornaments']) {
      const ornContent = el['ornaments'] as OrderedElement[];
      const simpleOrnamentTypes = [
        'trill-mark', 'mordent', 'inverted-mordent', 'turn', 'inverted-turn',
        'delayed-turn', 'delayed-inverted-turn', 'vertical-turn', 'shake',
        'schleifer', 'haydn',
      ];

      // Collect accidental-marks for the ornaments group
      const accidentalMarks = collectElements(ornContent, 'accidental-mark', (c, a) => {
        const value = extractText(c);
        return isValidAccidental(value) ? { value: value as Accidental, placement: a['placement'] as 'above' | 'below' | undefined } : null;
      }).filter((m) => m !== null);

      for (const orn of ornContent) {
        // Simple ornaments
        for (const ornType of simpleOrnamentTypes) {
          if (orn[ornType] !== undefined) {
            const ornAttrs = getAttributes(orn);
            const ornNotation: OrnamentNotation = {
              type: 'ornament',
              ornament: ornType as any,
              placement: ornAttrs['placement'] as 'above' | 'below' | undefined,
              notationsIndex,
            };
            // Handle default-y positioning
            if (ornAttrs['default-y']) {
              ornNotation.defaultY = parseFloat(ornAttrs['default-y']);
            }
            // Attach accidental marks to the first ornament in the group
            if (accidentalMarks.length > 0 && notations.filter(n => n.type === 'ornament').length === 0) {
              ornNotation.accidentalMarks = accidentalMarks as any;
            }
            notations.push(ornNotation);
          }
        }
        // Wavy-line
        if (orn['wavy-line'] !== undefined) {
          const wlAttrs = getAttributes(orn);
          const wlNotation: OrnamentNotation = {
            type: 'ornament',
            ornament: 'wavy-line',
            wavyLineType: wlAttrs['type'] as 'start' | 'stop' | 'continue' | undefined,
            number: wlAttrs['number'] ? parseInt(wlAttrs['number'], 10) : undefined,
            placement: wlAttrs['placement'] as 'above' | 'below' | undefined,
            notationsIndex,
          };
          if (wlAttrs['default-y']) {
            wlNotation.defaultY = parseFloat(wlAttrs['default-y']);
          }
          notations.push(wlNotation);
        }
        // Tremolo
        if (orn['tremolo'] !== undefined) {
          const tremAttrs = getAttributes(orn);
          const marks = extractText(orn['tremolo'] as OrderedElement[]);
          const tremNotation: OrnamentNotation = {
            type: 'ornament',
            ornament: 'tremolo',
            tremoloMarks: marks ? parseInt(marks, 10) : undefined,
            tremoloType: tremAttrs['type'] as 'start' | 'stop' | 'single' | 'unmeasured' | undefined,
            placement: tremAttrs['placement'] as 'above' | 'below' | undefined,
            notationsIndex,
          };
          if (tremAttrs['default-x']) tremNotation.defaultX = parseFloat(tremAttrs['default-x']);
          if (tremAttrs['default-y']) tremNotation.defaultY = parseFloat(tremAttrs['default-y']);
          notations.push(tremNotation);
        }
      }
    } else if (el['technical']) {
      const techContent = el['technical'] as OrderedElement[];
      // Technical elements that can have text content
      const technicalWithText = ['hammer-on', 'pull-off', 'tap', 'pluck', 'fingering', 'other-technical'];
      const technicalTypes = [
        'up-bow', 'down-bow', 'harmonic', 'open-string', 'thumb-position',
        'fingering', 'pluck', 'double-tongue', 'triple-tongue', 'stopped',
        'snap-pizzicato', 'fret', 'string', 'hammer-on', 'pull-off',
        'tap', 'heel', 'toe', 'fingernails', 'hole', 'arrow', 'handbell',
        'brass-bend', 'flip', 'smear', 'open', 'half-muted', 'harmon-mute',
        'golpe', 'other-technical',
      ];
      for (const tech of techContent) {
        // Handle bend with bend-alter
        if (tech['bend'] !== undefined) {
          const bendContent = tech['bend'] as OrderedElement[];
          const techAttrs = getAttributes(tech);
          const techNotation: TechnicalNotation = {
            type: 'technical',
            technical: 'bend',
            placement: techAttrs['placement'] as 'above' | 'below' | undefined,
            notationsIndex,
          };
          const bendAlter = getElementText(bendContent, 'bend-alter');
          if (bendAlter) techNotation.bendAlter = parseFloat(bendAlter);
          if (hasElement(bendContent, 'pre-bend')) techNotation.preBend = true;
          if (hasElement(bendContent, 'release')) techNotation.release = true;
          const withBar = getElementText(bendContent, 'with-bar');
          if (withBar) techNotation.withBar = parseFloat(withBar);
          notations.push(techNotation);
        }
        // Handle other technical elements
        for (const techType of technicalTypes) {
          if (tech[techType] !== undefined) {
            const techAttrs = getAttributes(tech);
            const notation: TechnicalNotation = {
              type: 'technical',
              technical: techType as any,
              placement: techAttrs['placement'] as 'above' | 'below' | undefined,
              notationsIndex,
            };
            const techElContent = tech[techType] as OrderedElement[];
            // Get text content for elements that have it
            if (technicalWithText.includes(techType)) {
              const text = extractText(techElContent);
              if (text) notation.text = text;
            }
            // Get string/fret for those elements
            if (techType === 'string') {
              const text = extractText(techElContent);
              if (text) notation.string = parseInt(text, 10);
            }
            if (techType === 'fret') {
              const text = extractText(techElContent);
              if (text) notation.fret = parseInt(text, 10);
            }
            // Handle harmonic children
            if (techType === 'harmonic') {
              if (hasElement(techElContent, 'natural')) notation.harmonicNatural = true;
              if (hasElement(techElContent, 'artificial')) notation.harmonicArtificial = true;
              if (hasElement(techElContent, 'base-pitch')) notation.basePitch = true;
              if (hasElement(techElContent, 'touching-pitch')) notation.touchingPitch = true;
              if (hasElement(techElContent, 'sounding-pitch')) notation.soundingPitch = true;
            }
            // Handle hammer-on/pull-off type and number attributes
            if (techType === 'hammer-on' || techType === 'pull-off') {
              const typeAttr = techAttrs['type'];
              if (typeAttr === 'start' || typeAttr === 'stop') {
                notation.startStop = typeAttr;
              }
              if (techAttrs['number']) notation.number = parseInt(techAttrs['number'], 10);
            }
            // Handle fingering substitution/alternate
            if (techType === 'fingering') {
              if (techAttrs['substitution'] === 'yes') notation.fingeringSubstitution = true;
              if (techAttrs['alternate'] === 'yes') notation.fingeringAlternate = true;
            }
            // Handle heel/toe substitution
            if (techType === 'heel' || techType === 'toe') {
              if (techAttrs['substitution'] === 'yes') notation.substitution = true;
            }
            // Positioning attributes
            if (techAttrs['default-x']) {
              notation.defaultX = parseFloat(techAttrs['default-x']);
            }
            if (techAttrs['default-y']) {
              notation.defaultY = parseFloat(techAttrs['default-y']);
            }
            notations.push(notation);
          }
        }
      }
    } else if (el['dynamics']) {
      const dynContent = el['dynamics'] as OrderedElement[];
      const dynamicsValues: DynamicsValue[] = [];
      const allDynamics: DynamicsValue[] = [
        'pppppp', 'ppppp', 'pppp', 'ppp', 'pp', 'p',
        'mp', 'mf',
        'f', 'ff', 'fff', 'ffff', 'fffff', 'ffffff',
        'sf', 'sfz', 'sffz', 'sfp', 'sfpp', 'fp', 'rf', 'rfz', 'fz', 'n', 'pf',
      ];
      let otherDynamics: string | undefined;
      for (const dyn of dynContent) {
        for (const dv of allDynamics) {
          if (dyn[dv] !== undefined) dynamicsValues.push(dv);
        }
        // Handle other-dynamics
        const od = parseFirstElement([dyn], 'other-dynamics', (c) => extractText(c));
        if (od) otherDynamics = od;
      }
      if (dynamicsValues.length > 0 || otherDynamics) {
        const dynAttrs = getAttributes(el);
        const dynNotation: DynamicsNotation = {
          type: 'dynamics',
          dynamics: dynamicsValues,
          placement: dynAttrs['placement'] as 'above' | 'below' | undefined,
          notationsIndex,
        };
        if (otherDynamics) dynNotation.otherDynamics = otherDynamics;
        notations.push(dynNotation);
      }
    } else if (el['fermata'] !== undefined) {
      const a = getAttributes(el);
      const shape = extractText(el['fermata'] as OrderedElement[]);
      const fermataNotation: Notation = {
        type: 'fermata',
        shape: shape as any || undefined,
        fermataType: a['type'] as 'upright' | 'inverted' | undefined,
        placement: a['placement'] as 'above' | 'below' | undefined,
        notationsIndex,
      };
      if (a['default-x']) (fermataNotation as any).defaultX = parseFloat(a['default-x']);
      if (a['default-y']) (fermataNotation as any).defaultY = parseFloat(a['default-y']);
      notations.push(fermataNotation);
    } else if (el['arpeggiate'] !== undefined) {
      const arpAttrs = getAttributes(el);
      const arpNotation: any = {
        type: 'arpeggiate',
        direction: arpAttrs['direction'] as 'up' | 'down' | undefined,
        number: arpAttrs['number'] ? parseInt(arpAttrs['number'], 10) : undefined,
        notationsIndex,
      };
      if (arpAttrs['default-x']) arpNotation.defaultX = parseFloat(arpAttrs['default-x']);
      if (arpAttrs['default-y']) arpNotation.defaultY = parseFloat(arpAttrs['default-y']);
      notations.push(arpNotation);
    } else if (el['non-arpeggiate'] !== undefined) {
      const nonArpAttrs = getAttributes(el);
      notations.push({
        type: 'non-arpeggiate',
        nonArpeggiateType: nonArpAttrs['type'] as 'top' | 'bottom',
        number: nonArpAttrs['number'] ? parseInt(nonArpAttrs['number'], 10) : undefined,
        placement: nonArpAttrs['placement'] as 'above' | 'below' | undefined,
        notationsIndex,
      });
    } else if (el['accidental-mark']) {
      const amAttrs = getAttributes(el);
      const amContent = el['accidental-mark'] as OrderedElement[];
      const value = extractText(amContent);
      notations.push({
        type: 'accidental-mark',
        value,
        placement: amAttrs['placement'] as 'above' | 'below' | undefined,
        notationsIndex,
      });
    } else if (el['glissando']) {
      const glissAttrs = getAttributes(el);
      const glissContent = el['glissando'] as OrderedElement[];
      let text: string | undefined;
      for (const item of glissContent) {
        if (item['#text'] !== undefined) {
          text = String(item['#text']);
          break;
        }
      }
      notations.push({
        type: 'glissando',
        glissandoType: glissAttrs['type'] === 'stop' ? 'stop' : 'start',
        number: glissAttrs['number'] ? parseInt(glissAttrs['number'], 10) : undefined,
        lineType: glissAttrs['line-type'] as 'solid' | 'dashed' | 'dotted' | 'wavy' | undefined,
        text,
        notationsIndex,
      });
    } else if (el['slide']) {
      const slideAttrs = getAttributes(el);
      notations.push({
        type: 'slide',
        slideType: slideAttrs['type'] === 'stop' ? 'stop' : 'start',
        number: slideAttrs['number'] ? parseInt(slideAttrs['number'], 10) : undefined,
        lineType: slideAttrs['line-type'] as 'solid' | 'dashed' | 'dotted' | 'wavy' | undefined,
        notationsIndex,
      });
    }
  }

  return notations;
}

function parseLyric(elements: OrderedElement[], attrs: Record<string, string>): Lyric {
  // Collect all text elements and check for elision
  const textElements: LyricTextElement[] = [];
  let hasElision = false;
  let currentSyllabic: 'single' | 'begin' | 'middle' | 'end' | undefined;

  for (const el of elements) {
    if (el['syllabic']) {
      const content = el['syllabic'] as OrderedElement[];
      for (const item of content) {
        if (item['#text'] !== undefined) {
          const syl = String(item['#text']);
          if (syl === 'single' || syl === 'begin' || syl === 'middle' || syl === 'end') {
            currentSyllabic = syl;
          }
          break;
        }
      }
    } else if (el['text']) {
      const content = el['text'] as OrderedElement[];
      for (const item of content) {
        if (item['#text'] !== undefined) {
          textElements.push({
            text: String(item['#text']),
            syllabic: currentSyllabic,
          });
          currentSyllabic = undefined;
          break;
        }
      }
    } else if (el['elision'] !== undefined) {
      hasElision = true;
    }
  }

  const lyric: Lyric = {
    text: textElements.length > 0 ? textElements[0].text : '',
  };

  if (attrs['number']) {
    lyric.number = parseInt(attrs['number'], 10);
  }

  if (attrs['default-y']) {
    lyric.defaultY = parseFloat(attrs['default-y']);
  }

  if (attrs['name']) {
    lyric.name = attrs['name'];
  }

  if (attrs['justify']) {
    lyric.justify = attrs['justify'];
  }

  if (attrs['relative-x']) {
    lyric.relativeX = parseFloat(attrs['relative-x']);
  }

  if (attrs['placement']) {
    lyric.placement = attrs['placement'] as 'above' | 'below';
  }

  // Set syllabic from first text element
  if (textElements.length > 0 && textElements[0].syllabic) {
    lyric.syllabic = textElements[0].syllabic;
  }

  // If multiple text elements (elision case), store all of them
  if (textElements.length > 1) {
    lyric.textElements = textElements;
  }

  if (hasElision) {
    lyric.elision = true;
  }

  for (const el of elements) {
    if (el['extend'] !== undefined) {
      const extendAttrs = getAttributes(el);
      const extendType = extendAttrs['type'] as 'start' | 'stop' | 'continue' | undefined;
      if (extendType) {
        lyric.extend = { type: extendType };
      } else {
        lyric.extend = true;
      }
    } else if (el['end-line'] !== undefined) {
      lyric.endLine = true;
    } else if (el['end-paragraph'] !== undefined) {
      lyric.endParagraph = true;
    }
  }

  return lyric;
}

function parseBackup(elements: OrderedElement[]): BackupEntry {
  return {
    _id: generateId(),
    type: 'backup',
    duration: parseInt(getElementText(elements, 'duration') || '0', 10),
  };
}

function parseForward(elements: OrderedElement[]): ForwardEntry {
  const forward: ForwardEntry = {
    _id: generateId(),
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
    _id: generateId(),
    type: 'direction',
    directionTypes: [],
  };

  if (attrs['placement'] === 'above' || attrs['placement'] === 'below') {
    direction.placement = attrs['placement'];
  }

  if (attrs['directive'] === 'yes') {
    direction.directive = true;
  }

  if (attrs['system'] === 'only-top' || attrs['system'] === 'also-top' || attrs['system'] === 'none') {
    direction.system = attrs['system'];
  }

  const staff = getElementText(elements, 'staff');
  if (staff) direction.staff = parseInt(staff, 10);

  const voice = getElementText(elements, 'voice');
  if (voice) direction.voice = parseInt(voice, 10);

  // Parse offset with sound attribute
  parseFirstElement(elements, 'offset', (c, a) => {
    const text = extractText(c);
    if (text) direction.offset = parseInt(text, 10);
    if (a['sound'] === 'yes') direction.offsetSound = true;
  });

  // Direction types
  for (const el of elements) {
    if (el['direction-type']) {
      const parsedTypes = parseDirectionTypes(el['direction-type'] as OrderedElement[]);
      for (const parsed of parsedTypes) {
        direction.directionTypes.push(parsed);
      }
    }
  }

  // Sound
  for (const el of elements) {
    if (el['sound']) {
      const soundAttrs = getAttributes(el);
      const soundContent = el['sound'] as OrderedElement[];
      direction.sound = {};
      if (soundAttrs['tempo']) direction.sound.tempo = parseFloat(soundAttrs['tempo']);
      if (soundAttrs['dynamics']) direction.sound.dynamics = parseFloat(soundAttrs['dynamics']);
      if (soundAttrs['damper-pedal']) direction.sound.damperPedal = soundAttrs['damper-pedal'] as 'yes' | 'no';
      if (soundAttrs['soft-pedal']) direction.sound.softPedal = soundAttrs['soft-pedal'] as 'yes' | 'no';
      if (soundAttrs['sostenuto-pedal']) direction.sound.sostenutoPedal = soundAttrs['sostenuto-pedal'] as 'yes' | 'no';

      // Parse midi-instrument
      for (const soundEl of soundContent) {
        if (soundEl['midi-instrument']) {
          const midiAttrs = getAttributes(soundEl);
          const midiContent = soundEl['midi-instrument'] as OrderedElement[];
          direction.sound.midiInstrument = {
            id: midiAttrs['id'] || '',
          };
          const midiProgram = getElementText(midiContent, 'midi-program');
          if (midiProgram) direction.sound.midiInstrument.midiProgram = parseInt(midiProgram, 10);
          const midiChannel = getElementText(midiContent, 'midi-channel');
          if (midiChannel) direction.sound.midiInstrument.midiChannel = parseInt(midiChannel, 10);
          const volume = getElementText(midiContent, 'volume');
          if (volume) direction.sound.midiInstrument.volume = parseFloat(volume);
          const pan = getElementText(midiContent, 'pan');
          if (pan) direction.sound.midiInstrument.pan = parseFloat(pan);
        }
      }
      break;
    }
  }

  return direction;
}

/**
 * Parse direction-type elements and return all direction types found.
 * A single direction-type can contain multiple elements (e.g., multiple words),
 * and we need to return all of them.
 */
function parseDirectionTypes(elements: OrderedElement[]): DirectionType[] {
  const results: DirectionType[] = [];

  for (const el of elements) {
    // Dynamics
    if (el['dynamics']) {
      const dynAttrs = getAttributes(el);
      const dynContent = el['dynamics'] as OrderedElement[];
      const dynamicsValues: DynamicsValue[] = [
        'pppppp', 'ppppp', 'pppp', 'ppp', 'pp', 'p',
        'mp', 'mf',
        'f', 'ff', 'fff', 'ffff', 'fffff', 'ffffff',
        'sf', 'sfz', 'sffz', 'sfp', 'sfpp', 'fp', 'rf', 'rfz', 'fz', 'n', 'pf',
      ];
      for (const dyn of dynContent) {
        // Check for standard dynamics
        let foundStandard = false;
        for (const dv of dynamicsValues) {
          if (dyn[dv] !== undefined) {
            const result: DirectionType = { kind: 'dynamics', value: dv };
            if (dynAttrs['default-x']) result.defaultX = parseFloat(dynAttrs['default-x']);
            if (dynAttrs['default-y']) result.defaultY = parseFloat(dynAttrs['default-y']);
            if (dynAttrs['relative-x']) result.relativeX = parseFloat(dynAttrs['relative-x']);
            if (dynAttrs['halign']) result.halign = dynAttrs['halign'];
            results.push(result);
            foundStandard = true;
            break; // Only one dynamics value per dynamics element
          }
        }
        // Check for other-dynamics
        if (!foundStandard && dyn['other-dynamics'] !== undefined) {
          const otherDynContent = dyn['other-dynamics'] as OrderedElement[];
          const otherDynText = extractText(otherDynContent);
          if (otherDynText) {
            const result: DirectionType = { kind: 'dynamics', otherDynamics: otherDynText };
            if (dynAttrs['default-x']) result.defaultX = parseFloat(dynAttrs['default-x']);
            if (dynAttrs['default-y']) result.defaultY = parseFloat(dynAttrs['default-y']);
            if (dynAttrs['relative-x']) result.relativeX = parseFloat(dynAttrs['relative-x']);
            if (dynAttrs['halign']) result.halign = dynAttrs['halign'];
            results.push(result);
          }
        }
      }
      continue; // Continue to next element in direction-type
    }

    // Wedge
    if (el['wedge']) {
      const wedgeAttrs = getAttributes(el);
      const wedgeType = wedgeAttrs['type'];
      if (wedgeType === 'crescendo' || wedgeType === 'diminuendo' || wedgeType === 'stop') {
        const result: DirectionType = { kind: 'wedge', type: wedgeType };
        if (wedgeAttrs['spread']) result.spread = parseFloat(wedgeAttrs['spread']);
        if (wedgeAttrs['default-y']) result.defaultY = parseFloat(wedgeAttrs['default-y']);
        if (wedgeAttrs['relative-x']) result.relativeX = parseFloat(wedgeAttrs['relative-x']);
        results.push(result);
      }
      continue;
    }

    // Metronome
    if (el['metronome']) {
      const metAttrs = getAttributes(el);
      const metContent = el['metronome'] as OrderedElement[];
      const perMinute = getElementText(metContent, 'per-minute');

      // Parse beat-units (could be one or two for tied/ratio)
      const beatUnits: string[] = [];
      const beatUnitDots: boolean[] = [];
      let dotForPrev = false;

      for (const met of metContent) {
        if (met['beat-unit']) {
          const buContent = met['beat-unit'] as OrderedElement[];
          for (const item of buContent) {
            if (item['#text'] !== undefined) {
              beatUnits.push(String(item['#text']));
              dotForPrev = true;
              break;
            }
          }
        } else if (met['beat-unit-dot'] !== undefined && dotForPrev) {
          beatUnitDots[beatUnits.length - 1] = true;
        }
      }

      if (beatUnits.length > 0 && isValidNoteType(beatUnits[0])) {
        const result: DirectionType = {
          kind: 'metronome',
          beatUnit: beatUnits[0] as any,
        };
        if (perMinute) {
          result.perMinute = isNaN(parseInt(perMinute, 10)) ? perMinute : parseInt(perMinute, 10);
        }
        if (beatUnitDots[0]) result.beatUnitDot = true;
        if (beatUnits.length > 1 && isValidNoteType(beatUnits[1])) {
          result.beatUnit2 = beatUnits[1] as any;
          if (beatUnitDots[1]) result.beatUnitDot2 = true;
        }
        if (metAttrs['parentheses'] === 'yes') result.parentheses = true;
        if (metAttrs['default-y']) result.defaultY = parseFloat(metAttrs['default-y']);
        if (metAttrs['font-family']) result.fontFamily = metAttrs['font-family'];
        if (metAttrs['font-size']) result.fontSize = metAttrs['font-size'];
        results.push(result);
      }
      continue;
    }

    // Words - collect all words elements in this direction-type
    if (el['words']) {
      const a = getAttributes(el);
      const text = extractText(el['words'] as OrderedElement[]);
      // Include words even if text is empty - preserve styling info
      const result: DirectionType = { kind: 'words', text: text || '' };
      if (a['default-x']) result.defaultX = parseFloat(a['default-x']);
      if (a['default-y']) result.defaultY = parseFloat(a['default-y']);
      if (a['relative-x']) result.relativeX = parseFloat(a['relative-x']);
      if (a['relative-y']) result.relativeY = parseFloat(a['relative-y']);
      if (a['font-family']) result.fontFamily = a['font-family'];
      if (a['font-size']) result.fontSize = a['font-size'];
      if (a['font-style']) result.fontStyle = a['font-style'];
      if (a['font-weight']) result.fontWeight = a['font-weight'];
      if (a['xml:lang']) result.xmlLang = a['xml:lang'];
      if (a['justify']) result.justify = a['justify'];
      if (a['color']) result.color = a['color'];
      if (a['xml:space']) result.xmlSpace = a['xml:space'];
      if (a['halign']) result.halign = a['halign'];
      results.push(result);
      continue;
    }

    // Rehearsal
    if (el['rehearsal']) {
      const a = getAttributes(el);
      const text = extractText(el['rehearsal'] as OrderedElement[]);
      if (text) {
        const result: DirectionType = { kind: 'rehearsal', text };
        if (a['enclosure']) result.enclosure = a['enclosure'];
        if (a['default-x']) result.defaultX = parseFloat(a['default-x']);
        if (a['default-y']) result.defaultY = parseFloat(a['default-y']);
        if (a['font-size']) result.fontSize = a['font-size'];
        if (a['font-weight']) result.fontWeight = a['font-weight'];
        results.push(result);
      }
      continue;
    }

    // Bracket
    if (el['bracket']) {
      const bracketAttrs = getAttributes(el);
      const bracketType = bracketAttrs['type'];
      if (bracketType === 'start' || bracketType === 'stop' || bracketType === 'continue') {
        const result: DirectionType = { kind: 'bracket', type: bracketType };
        if (bracketAttrs['number']) result.number = parseInt(bracketAttrs['number'], 10);
        if (bracketAttrs['line-end']) result.lineEnd = bracketAttrs['line-end'] as 'up' | 'down' | 'both' | 'arrow' | 'none';
        if (bracketAttrs['line-type']) result.lineType = bracketAttrs['line-type'] as 'solid' | 'dashed' | 'dotted' | 'wavy';
        if (bracketAttrs['default-y']) result.defaultY = parseFloat(bracketAttrs['default-y']);
        if (bracketAttrs['relative-x']) result.relativeX = parseFloat(bracketAttrs['relative-x']);
        results.push(result);
      }
      continue;
    }

    // Dashes
    if (el['dashes']) {
      const dashAttrs = getAttributes(el);
      const dashType = dashAttrs['type'];
      if (dashType === 'start' || dashType === 'stop' || dashType === 'continue') {
        const result: DirectionType = { kind: 'dashes', type: dashType };
        if (dashAttrs['number']) result.number = parseInt(dashAttrs['number'], 10);
        if (dashAttrs['dash-length']) result.dashLength = parseFloat(dashAttrs['dash-length']);
        if (dashAttrs['default-y']) result.defaultY = parseFloat(dashAttrs['default-y']);
        if (dashAttrs['space-length']) result.spaceLength = parseFloat(dashAttrs['space-length']);
        results.push(result);
      }
      continue;
    }

    // Accordion registration
    if (el['accordion-registration']) {
      const accContent = el['accordion-registration'] as OrderedElement[];
      const result: DirectionType = { kind: 'accordion-registration' };
      for (const acc of accContent) {
        if (acc['accordion-high'] !== undefined) {
          result.high = true;
        } else if (acc['accordion-middle']) {
          const midContent = acc['accordion-middle'] as OrderedElement[];
          for (const item of midContent) {
            if (item['#text'] !== undefined) {
              result.middle = parseInt(String(item['#text']), 10);
              break;
            }
          }
        } else if (acc['accordion-low'] !== undefined) {
          result.low = true;
        }
      }
      results.push(result);
      continue;
    }

    // Other direction
    if (el['other-direction']) {
      const otherAttrs = getAttributes(el);
      const otherContent = el['other-direction'] as OrderedElement[];
      for (const o of otherContent) {
        if (o['#text'] !== undefined) {
          const result: DirectionType = { kind: 'other-direction', text: String(o['#text']) };
          if (otherAttrs['default-x']) result.defaultX = parseFloat(otherAttrs['default-x']);
          if (otherAttrs['default-y']) result.defaultY = parseFloat(otherAttrs['default-y']);
          if (otherAttrs['halign']) result.halign = otherAttrs['halign'];
          if (otherAttrs['print-object'] === 'no') result.printObject = false;
          results.push(result);
          break;
        }
      }
      continue;
    }

    // Segno
    if (el['segno'] !== undefined) {
      results.push({ kind: 'segno' });
      continue;
    }

    // Coda
    if (el['coda'] !== undefined) {
      results.push({ kind: 'coda' });
      continue;
    }

    // Eyeglasses
    if (el['eyeglasses'] !== undefined) {
      results.push({ kind: 'eyeglasses' });
      continue;
    }

    // Damp
    if (el['damp'] !== undefined) {
      results.push({ kind: 'damp' });
      continue;
    }

    // Damp-all
    if (el['damp-all'] !== undefined) {
      results.push({ kind: 'damp-all' });
      continue;
    }

    // Scordatura
    if (el['scordatura'] !== undefined) {
      const scordContent = el['scordatura'] as OrderedElement[];
      const accords: { string: number; tuningStep: string; tuningAlter?: number; tuningOctave: number }[] = [];
      for (const sc of scordContent) {
        if (sc['accord']) {
          const accAttrs = getAttributes(sc);
          const accContent = sc['accord'] as OrderedElement[];
          const tuningStep = getElementText(accContent, 'tuning-step');
          const tuningOctave = getElementText(accContent, 'tuning-octave');
          const tuningAlter = getElementText(accContent, 'tuning-alter');
          if (tuningStep && tuningOctave) {
            const accord: { string: number; tuningStep: string; tuningAlter?: number; tuningOctave: number } = {
              string: parseInt(accAttrs['string'] || '1', 10),
              tuningStep,
              tuningOctave: parseInt(tuningOctave, 10),
            };
            if (tuningAlter) accord.tuningAlter = parseFloat(tuningAlter);
            accords.push(accord);
          }
        }
      }
      results.push({ kind: 'scordatura', accords: accords.length > 0 ? accords : undefined });
      continue;
    }

    // Harp pedals
    if (el['harp-pedals'] !== undefined) {
      const harpContent = el['harp-pedals'] as OrderedElement[];
      const pedalTunings: { pedalStep: string; pedalAlter: number }[] = [];
      for (const hp of harpContent) {
        if (hp['pedal-tuning']) {
          const ptContent = hp['pedal-tuning'] as OrderedElement[];
          const pedalStep = getElementText(ptContent, 'pedal-step');
          const pedalAlter = getElementText(ptContent, 'pedal-alter');
          if (pedalStep) {
            pedalTunings.push({
              pedalStep,
              pedalAlter: pedalAlter ? parseFloat(pedalAlter) : 0,
            });
          }
        }
      }
      results.push({ kind: 'harp-pedals', pedalTunings: pedalTunings.length > 0 ? pedalTunings : undefined });
      continue;
    }

    // Image
    if (el['image'] !== undefined) {
      const imgAttrs = getAttributes(el);
      results.push({
        kind: 'image',
        source: imgAttrs['source'],
        type: imgAttrs['type'],
      });
      continue;
    }

    // Pedal
    if (el['pedal']) {
      const pedalAttrs = getAttributes(el);
      const pedalType = pedalAttrs['type'];
      if (pedalType === 'start' || pedalType === 'stop' || pedalType === 'change' || pedalType === 'continue') {
        const result: DirectionType = { kind: 'pedal', type: pedalType };
        if (pedalAttrs['line'] === 'yes') result.line = true;
        else if (pedalAttrs['line'] === 'no') result.line = false;
        if (pedalAttrs['default-y']) result.defaultY = parseFloat(pedalAttrs['default-y']);
        if (pedalAttrs['relative-x']) result.relativeX = parseFloat(pedalAttrs['relative-x']);
        if (pedalAttrs['halign']) result.halign = pedalAttrs['halign'];
        results.push(result);
      }
      continue;
    }

    // Octave shift
    if (el['octave-shift']) {
      const shiftAttrs = getAttributes(el);
      const shiftType = shiftAttrs['type'];
      if (shiftType === 'up' || shiftType === 'down' || shiftType === 'stop') {
        const result: DirectionType = { kind: 'octave-shift', type: shiftType };
        if (shiftAttrs['size']) result.size = parseInt(shiftAttrs['size'], 10);
        results.push(result);
      }
      continue;
    }

    // Swing
    if (el['swing']) {
      const swingContent = el['swing'] as OrderedElement[];
      const result: DirectionType = { kind: 'swing' };

      for (const sw of swingContent) {
        if (sw['straight'] !== undefined) {
          result.straight = true;
        } else if (sw['first']) {
          const firstContent = sw['first'] as OrderedElement[];
          for (const item of firstContent) {
            if (item['#text'] !== undefined) {
              result.first = parseInt(String(item['#text']), 10);
              break;
            }
          }
        } else if (sw['second']) {
          const secondContent = sw['second'] as OrderedElement[];
          for (const item of secondContent) {
            if (item['#text'] !== undefined) {
              result.second = parseInt(String(item['#text']), 10);
              break;
            }
          }
        } else if (sw['swing-type']) {
          const stContent = sw['swing-type'] as OrderedElement[];
          for (const item of stContent) {
            if (item['#text'] !== undefined && isValidNoteType(String(item['#text']))) {
              result.swingType = String(item['#text']) as any;
              break;
            }
          }
        }
      }

      results.push(result);
      continue;
    }
  }

  return results;
}

function parseBarline(elements: OrderedElement[], attrs: Record<string, string>): Barline {
  const location = (attrs['location'] || 'right') as Barline['location'];

  const barline: Barline = { _id: generateId(), location };

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
        if (repeatAttrs['winged']) {
          barline.repeat.winged = repeatAttrs['winged'];
        }
      }
    } else if (el['ending']) {
      const endingAttrs = getAttributes(el);
      const number = endingAttrs['number'];
      const type = endingAttrs['type'];
      if (number && (type === 'start' || type === 'stop' || type === 'discontinue')) {
        barline.ending = { number, type };
        const endingContent = el['ending'] as OrderedElement[];
        const endingText = extractText(endingContent);
        if (endingText) barline.ending.text = endingText;
        if (endingAttrs['default-y']) barline.ending.defaultY = parseFloat(endingAttrs['default-y']);
        if (endingAttrs['end-length']) barline.ending.endLength = parseFloat(endingAttrs['end-length']);
      }
    }
  }

  return barline;
}

// ============================================================
// Type Validators (using Sets for O(1) lookup)
// ============================================================

const VALID_NOTE_TYPES = new Set<string>([
  'maxima', 'long', 'breve', 'whole', 'half', 'quarter',
  'eighth', '16th', '32nd', '64th', '128th', '256th', '512th', '1024th',
]);

const VALID_ACCIDENTALS = new Set<string>([
  'sharp', 'natural', 'flat', 'double-sharp', 'double-flat', 'sharp-sharp', 'flat-flat',
  'natural-sharp', 'natural-flat', 'quarter-flat', 'quarter-sharp',
  'three-quarters-flat', 'three-quarters-sharp', 'sharp-down', 'sharp-up',
  'natural-down', 'natural-up', 'flat-down', 'flat-up', 'double-sharp-down',
  'double-sharp-up', 'flat-flat-down', 'flat-flat-up', 'arrow-down', 'arrow-up',
  'triple-sharp', 'triple-flat', 'slash-quarter-sharp', 'slash-sharp',
  'slash-flat', 'double-slash-flat', 'sharp-1', 'sharp-2', 'sharp-3', 'sharp-5',
  'flat-1', 'flat-2', 'flat-3', 'flat-4', 'sori', 'koron', 'other',
]);

const VALID_NOTEHEADS = new Set<string>([
  'slash', 'triangle', 'diamond', 'square', 'cross', 'x', 'circle-x',
  'inverted triangle', 'arrow down', 'arrow up', 'circled', 'slashed',
  'back slashed', 'normal', 'cluster', 'circle dot', 'left triangle',
  'rectangle', 'none', 'do', 're', 'mi', 'fa', 'fa up', 'so', 'la', 'ti', 'other',
]);

const VALID_BAR_STYLES = new Set<string>([
  'regular', 'dotted', 'dashed', 'heavy',
  'light-light', 'light-heavy', 'heavy-light', 'heavy-heavy', 'tick', 'short', 'none',
]);

function isValidNoteType(value: string): value is NoteType {
  return VALID_NOTE_TYPES.has(value);
}

function isValidAccidental(value: string): value is Accidental {
  return VALID_ACCIDENTALS.has(value);
}

function isValidNotehead(value: string): value is NoteheadValue {
  return VALID_NOTEHEADS.has(value);
}

function isValidBarStyle(value: string): value is NonNullable<Barline['barStyle']> {
  return VALID_BAR_STYLES.has(value);
}

// ============================================================
// New Parse Functions for Extended Support
// ============================================================

function parseStaffDetails(elements: OrderedElement[], attrs: Record<string, string>): StaffDetails {
  const sd: StaffDetails = {};

  if (attrs['number']) sd.number = parseInt(attrs['number'], 10);
  if (attrs['print-object'] === 'no') sd.printObject = false;
  else if (attrs['print-object'] === 'yes') sd.printObject = true;

  const staffType = getElementText(elements, 'staff-type');
  if (staffType && ['ossia', 'cue', 'editorial', 'regular', 'alternate'].includes(staffType)) {
    sd.staffType = staffType as StaffDetails['staffType'];
  }

  const staffLines = getElementText(elements, 'staff-lines');
  if (staffLines) sd.staffLines = parseInt(staffLines, 10);

  const capo = getElementText(elements, 'capo');
  if (capo) sd.capo = parseInt(capo, 10);

  // Parse staff-size with scaling attribute
  for (const el of elements) {
    if (el['staff-size'] !== undefined) {
      const sizeContent = el['staff-size'] as OrderedElement[];
      const sizeAttrs = getAttributes(el);
      for (const item of sizeContent) {
        if (item['#text'] !== undefined) {
          sd.staffSize = parseFloat(String(item['#text']));
          break;
        }
      }
      if (sizeAttrs['scaling']) {
        sd.staffSizeScaling = parseFloat(sizeAttrs['scaling']);
      }
      break;
    }
  }

  // Check for show-frets attribute
  if (attrs['show-frets'] === 'numbers' || attrs['show-frets'] === 'letters') {
    sd.showFrets = attrs['show-frets'];
  }

  // Staff tuning
  const tunings: StaffTuning[] = [];
  for (const el of elements) {
    if (el['staff-tuning']) {
      const tuningAttrs = getAttributes(el);
      const tuningContent = el['staff-tuning'] as OrderedElement[];
      const tuning: StaffTuning = {
        line: parseInt(tuningAttrs['line'] || '1', 10),
        tuningStep: getElementText(tuningContent, 'tuning-step') || 'E',
        tuningOctave: parseInt(getElementText(tuningContent, 'tuning-octave') || '4', 10),
      };
      const tuningAlter = getElementText(tuningContent, 'tuning-alter');
      if (tuningAlter) tuning.tuningAlter = parseFloat(tuningAlter);
      tunings.push(tuning);
    }
  }
  if (tunings.length > 0) sd.staffTuning = tunings;

  return sd;
}

function parseMeasureStyle(elements: OrderedElement[], attrs: Record<string, string>): MeasureStyle {
  const ms: MeasureStyle = {};

  if (attrs['number']) ms.number = parseInt(attrs['number'], 10);

  const multipleRest = getElementText(elements, 'multiple-rest');
  if (multipleRest) ms.multipleRest = parseInt(multipleRest, 10);

  for (const el of elements) {
    if (el['measure-repeat']) {
      const mrAttrs = getAttributes(el);
      ms.measureRepeat = { type: mrAttrs['type'] === 'stop' ? 'stop' : 'start' };
      if (mrAttrs['slashes']) ms.measureRepeat.slashes = parseInt(mrAttrs['slashes'], 10);
    } else if (el['beat-repeat']) {
      const brAttrs = getAttributes(el);
      ms.beatRepeat = { type: brAttrs['type'] === 'stop' ? 'stop' : 'start' };
      if (brAttrs['slashes']) ms.beatRepeat.slashes = parseInt(brAttrs['slashes'], 10);
    } else if (el['slash']) {
      const slAttrs = getAttributes(el);
      ms.slash = { type: slAttrs['type'] === 'stop' ? 'stop' : 'start' };
      if (slAttrs['use-dots'] === 'yes') ms.slash.useDots = true;
      if (slAttrs['use-stems'] === 'yes') ms.slash.useStems = true;
    }
  }

  return ms;
}

function parseHarmony(elements: OrderedElement[], attrs: Record<string, string>): HarmonyEntry {
  const harmony: HarmonyEntry = {
    _id: generateId(),
    type: 'harmony',
    root: { rootStep: 'C' },
    kind: 'major',
  };

  if (attrs['placement'] === 'above' || attrs['placement'] === 'below') {
    harmony.placement = attrs['placement'];
  }

  if (attrs['print-frame'] === 'yes') {
    harmony.printFrame = true;
  } else if (attrs['print-frame'] === 'no') {
    harmony.printFrame = false;
  }
  if (attrs['default-y']) harmony.defaultY = parseFloat(attrs['default-y']);
  if (attrs['halign']) harmony.halign = attrs['halign'];
  if (attrs['font-size']) harmony.fontSize = attrs['font-size'];

  // Parse root
  const root = getElementContent(elements, 'root');
  if (root) {
    const rootStep = getElementText(root, 'root-step');
    if (rootStep) harmony.root.rootStep = rootStep;
    const rootAlter = getElementText(root, 'root-alter');
    if (rootAlter) harmony.root.rootAlter = parseFloat(rootAlter);
  }

  // Parse kind
  for (const el of elements) {
    if (el['kind']) {
      const kindAttrs = getAttributes(el);
      const kindContent = el['kind'] as OrderedElement[];
      for (const item of kindContent) {
        if (item['#text'] !== undefined) {
          harmony.kind = String(item['#text']);
          break;
        }
      }
      if (kindAttrs['text']) harmony.kindText = kindAttrs['text'];
      break;
    }
  }

  // Parse bass
  const bass = getElementContent(elements, 'bass');
  if (bass) {
    const bassStep = getElementText(bass, 'bass-step');
    if (bassStep) {
      harmony.bass = { bassStep };
      const bassAlter = getElementText(bass, 'bass-alter');
      if (bassAlter) harmony.bass.bassAlter = parseFloat(bassAlter);
    }
  }

  // Parse inversion
  const inversionText = getElementText(elements, 'inversion');
  if (inversionText) {
    harmony.inversion = parseInt(inversionText, 10);
  }

  // Parse degrees
  const degrees: HarmonyDegree[] = [];
  for (const el of elements) {
    if (el['degree']) {
      const degContent = el['degree'] as OrderedElement[];
      const degValue = getElementText(degContent, 'degree-value');
      const degAlter = getElementText(degContent, 'degree-alter');
      const degType = getElementText(degContent, 'degree-type');
      if (degValue && degType && ['add', 'alter', 'subtract'].includes(degType)) {
        const degree: HarmonyDegree = {
          degreeValue: parseInt(degValue, 10),
          degreeType: degType as 'add' | 'alter' | 'subtract',
        };
        if (degAlter) degree.degreeAlter = parseFloat(degAlter);
        degrees.push(degree);
      }
    }
  }
  if (degrees.length > 0) harmony.degrees = degrees;

  // Parse frame
  const frame = getElementContent(elements, 'frame');
  if (frame) {
    const frameObj: HarmonyFrame = {};
    const frameStrings = getElementText(frame, 'frame-strings');
    if (frameStrings) frameObj.frameStrings = parseInt(frameStrings, 10);
    const frameFrets = getElementText(frame, 'frame-frets');
    if (frameFrets) frameObj.frameFrets = parseInt(frameFrets, 10);

    // Parse first-fret
    for (const fel of frame) {
      if (fel['first-fret']) {
        const ffAttrs = getAttributes(fel);
        const ffContent = fel['first-fret'] as OrderedElement[];
        for (const item of ffContent) {
          if (item['#text'] !== undefined) {
            frameObj.firstFret = parseInt(String(item['#text']), 10);
            break;
          }
        }
        if (ffAttrs['text']) frameObj.firstFretText = ffAttrs['text'];
        if (ffAttrs['location'] === 'left' || ffAttrs['location'] === 'right') {
          frameObj.firstFretLocation = ffAttrs['location'];
        }
        break;
      }
    }

    const frameNotes: FrameNote[] = [];
    for (const fel of frame) {
      if (fel['frame-note']) {
        const fnContent = fel['frame-note'] as OrderedElement[];
        const stringNum = getElementText(fnContent, 'string');
        const fretNum = getElementText(fnContent, 'fret');
        if (stringNum && fretNum) {
          const fn: FrameNote = {
            string: parseInt(stringNum, 10),
            fret: parseInt(fretNum, 10),
          };
          const fingering = getElementText(fnContent, 'fingering');
          if (fingering) fn.fingering = fingering;
          for (const fnEl of fnContent) {
            if (fnEl['barre']) {
              const barreAttrs = getAttributes(fnEl);
              if (barreAttrs['type'] === 'start' || barreAttrs['type'] === 'stop') {
                fn.barre = barreAttrs['type'];
              }
            }
          }
          frameNotes.push(fn);
        }
      }
    }
    if (frameNotes.length > 0) frameObj.frameNotes = frameNotes;

    if (Object.keys(frameObj).length > 0) harmony.frame = frameObj;
  }

  // Parse offset
  const offset = getElementText(elements, 'offset');
  if (offset) harmony.offset = parseInt(offset, 10);

  // Parse staff
  const staff = getElementText(elements, 'staff');
  if (staff) harmony.staff = parseInt(staff, 10);

  return harmony;
}

function parseFiguredBass(elements: OrderedElement[], attrs: Record<string, string>): FiguredBassEntry {
  const fb: FiguredBassEntry = {
    _id: generateId(),
    type: 'figured-bass',
    figures: [],
  };

  if (attrs['parentheses'] === 'yes') fb.parentheses = true;

  const duration = getElementText(elements, 'duration');
  if (duration) fb.duration = parseInt(duration, 10);

  for (const el of elements) {
    if (el['figure']) {
      const figContent = el['figure'] as OrderedElement[];
      const figure: Figure = {};

      const figNumber = getElementText(figContent, 'figure-number');
      if (figNumber) figure.figureNumber = figNumber;

      for (const figEl of figContent) {
        if (figEl['prefix']) {
          const prefixContent = figEl['prefix'] as OrderedElement[];
          for (const item of prefixContent) {
            if (item['#text'] !== undefined) {
              figure.prefix = String(item['#text']);
              break;
            }
          }
        } else if (figEl['suffix']) {
          const suffixContent = figEl['suffix'] as OrderedElement[];
          for (const item of suffixContent) {
            if (item['#text'] !== undefined) {
              figure.suffix = String(item['#text']);
              break;
            }
          }
        } else if (figEl['extend'] !== undefined) {
          const extendAttrs = getAttributes(figEl);
          const extendType = extendAttrs['type'] as 'start' | 'stop' | 'continue' | undefined;
          if (extendType) {
            figure.extend = { type: extendType };
          } else {
            figure.extend = true;
          }
        }
      }

      fb.figures.push(figure);
    }
  }

  return fb;
}

function parseSound(elements: OrderedElement[], attrs: Record<string, string>): SoundEntry {
  const sound: SoundEntry = {
    _id: generateId(),
    type: 'sound',
  };

  if (attrs['tempo']) sound.tempo = parseFloat(attrs['tempo']);
  if (attrs['dynamics']) sound.dynamics = parseFloat(attrs['dynamics']);
  if (attrs['dacapo'] === 'yes') sound.dacapo = true;
  if (attrs['segno']) sound.segno = attrs['segno'];
  if (attrs['dalsegno']) sound.dalsegno = attrs['dalsegno'];
  if (attrs['coda']) sound.coda = attrs['coda'];
  if (attrs['tocoda']) sound.tocoda = attrs['tocoda'];
  if (attrs['fine'] === 'yes') sound.fine = true;
  if (attrs['forward-repeat'] === 'yes') sound.forwardRepeat = true;
  if (attrs['damper-pedal']) sound.damperPedal = attrs['damper-pedal'] as 'yes' | 'no';
  if (attrs['soft-pedal']) sound.softPedal = attrs['soft-pedal'] as 'yes' | 'no';
  if (attrs['sostenuto-pedal']) sound.sostenutoPedal = attrs['sostenuto-pedal'] as 'yes' | 'no';

  // Parse swing element
  for (const el of elements) {
    if (el['swing']) {
      const swingContent = el['swing'] as OrderedElement[];
      const swing: Swing = {};
      for (const swingEl of swingContent) {
        if (swingEl['straight'] !== undefined) {
          swing.straight = true;
        } else if (swingEl['first'] !== undefined) {
          const firstContent = swingEl['first'] as OrderedElement[];
          for (const item of firstContent) {
            if (item['#text'] !== undefined) {
              swing.first = parseInt(String(item['#text']), 10);
              break;
            }
          }
        } else if (swingEl['second'] !== undefined) {
          const secondContent = swingEl['second'] as OrderedElement[];
          for (const item of secondContent) {
            if (item['#text'] !== undefined) {
              swing.second = parseInt(String(item['#text']), 10);
              break;
            }
          }
        } else if (swingEl['swing-type'] !== undefined) {
          const typeContent = swingEl['swing-type'] as OrderedElement[];
          for (const item of typeContent) {
            if (item['#text'] !== undefined) {
              swing.swingType = String(item['#text']);
              break;
            }
          }
        }
      }
      if (Object.keys(swing).length > 0) {
        sound.swing = swing;
      }
    }
  }

  return sound;
}
