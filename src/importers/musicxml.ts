import { parse as txmlParse } from 'txml';
import type { tNode } from 'txml';
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
  GroupingEntry,
  SlideNotation,
} from '../types';

// txml node type alias for code readability
type XmlNode = tNode;
type XmlChild = XmlNode | string;

/** Decode XML entities that txml does not decode (single-pass) */
const _entityMap: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const _entityRegex = /&(?:(amp|lt|gt|quot|apos)|#(\d+)|#x([0-9a-fA-F]+));/g;
function decodeXmlEntities(s: string): string {
  if (s.indexOf('&') === -1) return s;
  return s.replace(_entityRegex, (_, named, dec, hex) =>
    named ? _entityMap[named] : dec ? String.fromCharCode(parseInt(dec, 10)) : String.fromCharCode(parseInt(hex!, 16))
  );
}

/**
 * Characters forbidden in XML 1.0 text content:
 *   C0 controls except TAB (#x9), LF (#xA), CR (#xD)
 *   plus the non-characters U+FFFE and U+FFFF
 * Reference: https://www.w3.org/TR/xml/#charsets
 */
const INVALID_XML_CHARS_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF]/g;

/** Recursively decode XML entities in all text nodes and attribute values */
function decodeTree(nodes: XmlChild[]): void {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (typeof node === 'string') {
      let s = node;
      if (s.indexOf('&') !== -1) {
        s = decodeXmlEntities(s);
      }
      // Strip characters forbidden by XML 1.0 (e.g. control char U+0019 from malformed sources
      // or from numeric entity references like &#25; that decode to invalid characters)
      nodes[i] = s.replace(INVALID_XML_CHARS_RE, '');
    } else {
      // Decode attribute values
      const attrs = node.attributes as Record<string, string>;
      for (const key in attrs) {
        const v = attrs[key];
        if (v.indexOf('&') !== -1) {
          attrs[key] = decodeXmlEntities(v);
        }
      }
      // Recurse into children
      decodeTree(node.children);
    }
  }
}

// Reusable txml options: empty noChildNodes skips the default HTML void-element check.
const TXML_OPTIONS = { noChildNodes: [] as string[] };

/**
 * Decode a Uint8Array / Buffer to a UTF-8 string, handling UTF-16 BE/LE BOMs.
 */
function decodeXmlBytes(data: Uint8Array): string {
  // UTF-16 BE BOM: FE FF
  if (data.length >= 2 && data[0] === 0xFE && data[1] === 0xFF) {
    return new TextDecoder('utf-16be').decode(data);
  }
  // UTF-16 LE BOM: FF FE
  if (data.length >= 2 && data[0] === 0xFF && data[1] === 0xFE) {
    return new TextDecoder('utf-16le').decode(data);
  }
  // Default to UTF-8 (handles UTF-8 BOM automatically)
  return new TextDecoder('utf-8').decode(data);
}

export function parse(input: string | Uint8Array): Score {
  let xmlString: string;

  if (typeof input !== 'string') {
    // Buffer / Uint8Array: decode with BOM-based encoding detection
    xmlString = decodeXmlBytes(input);
  } else if (input.includes('\x00')) {
    // String contains NUL bytes — UTF-16 data was read as UTF-8 by the caller.
    // Strip NUL bytes to recover the ASCII content (works for standard MusicXML).
    xmlString = input.replace(/\x00/g, '');
  } else {
    xmlString = input;
  }

  // Strip Processing Instructions (<?...?>) except the XML declaration (<?xml ...?>).
  // Some exporters (e.g. Guitar Pro 7) embed PIs like <?GP7 ...?> that txml cannot handle.
  const cleanedXml = xmlString.replace(/<\?(?!xml\s)[^?]*\?>/g, '');
  const parsed = txmlParse(cleanedXml, TXML_OPTIONS);
  decodeTree(parsed);

  // Find score-partwise in the ordered result
  let scorePartwiseVersion: string | undefined;
  let scorePartwise: XmlChild[] | undefined;
  for (const el of parsed) {
    if (typeof el === 'string') continue;
    if (el.tagName === 'score-partwise') {
      scorePartwise = el.children;
      const attrs = el.attributes as Record<string, string>;
      if (attrs['version']) scorePartwiseVersion = attrs['version'];
      break;
    }
  }
  if (!scorePartwise) {
    throw new Error('Unsupported MusicXML format: only score-partwise is supported');
  }

  const score = parseScorePartwise(scorePartwise);
  if (scorePartwiseVersion) score.version = scorePartwiseVersion;
  return score;
}

function findElement(elements: XmlChild[], tagName: string): XmlChild[] | undefined {
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    if (typeof el !== 'string' && el.tagName === tagName) {
      return el.children;
    }
  }
  return undefined;
}

function getElementContent(elements: XmlChild[], tagName: string): XmlChild[] | undefined {
  return findElement(elements, tagName);
}

/** Extract text content from an element array */
function extractText(elements: XmlChild[], preserveWhitespace = false): string {
  for (let i = 0; i < elements.length; i++) {
    const item = elements[i];
    if (typeof item === 'string') {
      if (preserveWhitespace) return item;
      const trimmed = item.trim();
      if (trimmed.length > 0) return trimmed;
      // Skip whitespace-only text nodes (from keepWhitespace txml mode)
    }
  }
  return '';
}

function getElementText(elements: XmlChild[], tagName: string): string | undefined {
  const content = findElement(elements, tagName);
  if (!content) return undefined;
  const text = extractText(content);
  return text || '';
}

/**
 * Get element text as integer with optional default value
 */
function getElementTextAsInt(elements: XmlChild[], tagName: string, defaultValue?: number): number | undefined {
  const text = getElementText(elements, tagName);
  if (text === undefined || text === '') return defaultValue;
  const value = parseInt(text, 10);
  return isNaN(value) ? defaultValue : value;
}


/**
 * Collect and parse all elements of a given tag name
 */
function collectElements<T>(
  elements: XmlChild[],
  tagName: string,
  parser: (content: XmlChild[], attrs: Record<string, string>) => T
): T[] {
  const results: T[] = [];
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    if (typeof el !== 'string' && el.tagName === tagName) {
      results.push(parser(el.children, el.attributes as Record<string, string>));
    }
  }
  return results;
}

/**
 * Find first element with tag and parse it
 */
function parseFirstElement<T>(
  elements: XmlChild[],
  tagName: string,
  parser: (content: XmlChild[], attrs: Record<string, string>) => T
): T | undefined {
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    if (typeof el !== 'string' && el.tagName === tagName) {
      return parser(el.children, el.attributes as Record<string, string>);
    }
  }
  return undefined;
}

/**
 * Check if an element with the given tag name exists
 */
function hasElement(elements: XmlChild[], tagName: string): boolean {
  return elements.some(el => typeof el !== 'string' && el.tagName === tagName);
}

function parseScorePartwise(elements: XmlChild[]): Score {
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

function parseMetadata(elements: XmlChild[]): ScoreMetadata {
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

function parseEncoding(elements: XmlChild[]): Encoding {
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

function parseDefaults(elements: XmlChild[]): Defaults | undefined {
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
    if (typeof el === 'string') continue;
    if (el.tagName === 'staff-layout') {
      const attrs = el.attributes as Record<string, string>;
      const content = el.children;
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
    if (typeof el === 'string') continue;
    if (el.tagName === 'music-font') {
      const attrs = el.attributes as Record<string, string>;
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
    if (typeof el === 'string') continue;
    if (el.tagName === 'word-font') {
      const attrs = el.attributes as Record<string, string>;
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
    if (typeof el === 'string') continue;
    if (el.tagName === 'lyric-font') {
      const attrs = el.attributes as Record<string, string>;
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
    if (typeof el === 'string') continue;
    if (el.tagName === 'lyric-language') {
      const attrs = el.attributes as Record<string, string>;
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

function parsePageLayout(elements: XmlChild[]): PageLayout {
  const layout: PageLayout = {};

  const height = getElementText(elements, 'page-height');
  if (height) layout.pageHeight = parseFloat(height);

  const width = getElementText(elements, 'page-width');
  if (width) layout.pageWidth = parseFloat(width);

  const margins: PageMargins[] = [];
  for (const el of elements) {
    if (typeof el === 'string') continue;
    if (el.tagName === 'page-margins') {
      const attrs = el.attributes as Record<string, string>;
      const content = el.children;
      const m: PageMargins = {};
      if (attrs['type'] === 'odd' || attrs['type'] === 'even' || attrs['type'] === 'both') {
        m.type = attrs['type'];
      }
      const left = getElementText(content, 'left-margin');
      if (left) {
        m.leftMargin = parseFloat(left);
        m.leftMarginRaw = left;
      }
      const right = getElementText(content, 'right-margin');
      if (right) {
        m.rightMargin = parseFloat(right);
        m.rightMarginRaw = right;
      }
      const top = getElementText(content, 'top-margin');
      if (top) {
        m.topMargin = parseFloat(top);
        m.topMarginRaw = top;
      }
      const bottom = getElementText(content, 'bottom-margin');
      if (bottom) {
        m.bottomMargin = parseFloat(bottom);
        m.bottomMarginRaw = bottom;
      }
      margins.push(m);
    }
  }
  if (margins.length > 0) layout.pageMargins = margins;

  return layout;
}

function parseSystemLayout(elements: XmlChild[]): SystemLayout {
  const layout: SystemLayout = {};

  const margins = getElementContent(elements, 'system-margins');
  if (margins) {
    layout.systemMargins = {};
    const left = getElementText(margins, 'left-margin');
    if (left) {
      layout.systemMargins.leftMargin = parseFloat(left);
      layout.systemMargins.leftMarginRaw = left;
    }
    const right = getElementText(margins, 'right-margin');
    if (right) {
      layout.systemMargins.rightMargin = parseFloat(right);
      layout.systemMargins.rightMarginRaw = right;
    }
  }

  const dist = getElementText(elements, 'system-distance');
  if (dist) {
    layout.systemDistance = parseFloat(dist);
    layout.systemDistanceRaw = dist;
  }

  const topDist = getElementText(elements, 'top-system-distance');
  if (topDist) {
    layout.topSystemDistance = parseFloat(topDist);
    layout.topSystemDistanceRaw = topDist;
  }

  // Parse system-dividers
  const dividers = getElementContent(elements, 'system-dividers');
  if (dividers) {
    layout.systemDividers = {};
    for (const el of dividers) {
      if (typeof el === 'string') continue;
      if (el.tagName === 'left-divider') {
        const attrs = el.attributes as Record<string, string>;
        layout.systemDividers.leftDivider = {
          printObject: attrs['print-object'] === 'yes' ? true : attrs['print-object'] === 'no' ? false : undefined,
          halign: attrs['halign'],
          valign: attrs['valign'],
        };
      }
      if (el.tagName === 'right-divider') {
        const attrs = el.attributes as Record<string, string>;
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

function parseCredits(elements: XmlChild[]): Credit[] | undefined {
  const credits = collectElements(elements, 'credit', (content, attrs) => {
    const credit: Credit = { _id: generateId() };
    if (attrs['page']) credit.page = parseInt(attrs['page'], 10);
    const types = collectElements(content, 'credit-type', (c) => extractText(c));
    const words = collectElements(content, 'credit-words', (c, a) => {
      const cw: CreditWords = { text: extractText(c, true) };
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

function parseDisplayTexts(elements: XmlChild[]): DisplayText[] {
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

function parsePartList(elements: XmlChild[]): PartListEntry[] {
  const partList: PartListEntry[] = [];

  for (const el of elements) {
    if (typeof el === 'string') continue;
    if (el.tagName === 'score-part') {
      const attrs = el.attributes as Record<string, string>;
      const content = el.children;

      const partInfo: PartInfo = {
        _id: generateId(),
        type: 'score-part',
        id: attrs['id'] || '',
      };

      // Check if part-name element exists (even if empty)
      for (const child of content) {
        if (typeof child === 'string') continue;
        if (child.tagName === 'part-name') {
          const pnAttrs = child.attributes as Record<string, string>;
          partInfo.name = getElementText(content, 'part-name') ?? '';
          if (pnAttrs['print-object'] === 'no') {
            partInfo.namePrintObject = false;
          }
          break;
        }
      }

      // part-name-display
      for (const child of content) {
        if (typeof child === 'string') continue;
        if (child.tagName === 'part-name-display') {
          partInfo.partNameDisplay = parseDisplayTexts(child.children);
          break;
        }
      }

      // part-abbreviation
      for (const child of content) {
        if (typeof child === 'string') continue;
        if (child.tagName === 'part-abbreviation') {
          const paAttrs = child.attributes as Record<string, string>;
          partInfo.abbreviation = getElementText(content, 'part-abbreviation') ?? '';
          if (paAttrs['print-object'] === 'no') {
            partInfo.abbreviationPrintObject = false;
          }
          break;
        }
      }

      // part-abbreviation-display
      for (const child of content) {
        if (typeof child === 'string') continue;
        if (child.tagName === 'part-abbreviation-display') {
          partInfo.partAbbreviationDisplay = parseDisplayTexts(child.children);
          break;
        }
      }

      // Score instruments
      const instruments: ScoreInstrument[] = [];
      for (const child of content) {
        if (typeof child === 'string') continue;
        if (child.tagName === 'score-instrument') {
          const instAttrs = child.attributes as Record<string, string>;
          const instContent = child.children;
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
        if (typeof child === 'string') continue;
        if (child.tagName === 'midi-instrument') {
          const midiAttrs = child.attributes as Record<string, string>;
          const midiContent = child.children;
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
    } else if (el.tagName === 'part-group') {
      const attrs = el.attributes as Record<string, string>;
      const content = el.children;

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

function parseParts(elements: XmlChild[]): Part[] {
  const parts: Part[] = [];

  for (const el of elements) {
    if (typeof el === 'string') continue;
    if (el.tagName === 'part') {
      const attrs = el.attributes as Record<string, string>;
      const content = el.children;

      const part: Part = {
        _id: generateId(),
        id: attrs['id'] || '',
        measures: [],
      };

      for (const measureEl of content) {
        if (typeof measureEl === 'string') continue;
        if (measureEl.tagName === 'measure') {
          const measureAttrs = measureEl.attributes as Record<string, string>;
          const measureContent = measureEl.children;
          part.measures.push(parseMeasure(measureContent, measureAttrs));
        }
      }

      parts.push(part);
    }
  }

  return parts;
}

function parseMeasure(elements: XmlChild[], attrs: Record<string, string>): Measure {
  const measure: Measure = {
    _id: generateId(),
    number: attrs['number'] || '0', // Keep as string per MusicXML spec (token type)
    entries: [],
  };

  if (attrs['width']) measure.width = parseFloat(attrs['width']);
  if (attrs['implicit'] === 'yes') measure.implicit = true;

  const barlines: Barline[] = [];
  let hasSeenNote = false;

  // Process elements in order - this is the key to maintaining order!
  for (const el of elements) {
    if (typeof el === 'string') continue;
    if (el.tagName === 'attributes') {
      const parsedAttrs = parseAttributes(el.children);
      if (!hasSeenNote && !measure.attributes) {
        // Only store in measure.attributes if no notes have appeared yet
        measure.attributes = parsedAttrs;
      } else {
        // Mid-measure attributes (after notes) go into entries
        const attrEntry: AttributesEntry = {
          _id: generateId(),
          type: 'attributes',
          attributes: parsedAttrs,
        };
        measure.entries.push(attrEntry);
      }
    } else if (el.tagName === 'note') {
      hasSeenNote = true;
      measure.entries.push(parseNote(el.children, el.attributes as Record<string, string>));
    } else if (el.tagName === 'backup') {
      measure.entries.push(parseBackup(el.children));
    } else if (el.tagName === 'forward') {
      measure.entries.push(parseForward(el.children));
    } else if (el.tagName === 'direction') {
      measure.entries.push(parseDirection(el.children, el.attributes as Record<string, string>));
    } else if (el.tagName === 'barline') {
      barlines.push(parseBarline(el.children, el.attributes as Record<string, string>));
    } else if (el.tagName === 'print') {
      measure.print = parsePrint(el.children, el.attributes as Record<string, string>);
    } else if (el.tagName === 'harmony') {
      measure.entries.push(parseHarmony(el.children, el.attributes as Record<string, string>));
    } else if (el.tagName === 'figured-bass') {
      measure.entries.push(parseFiguredBass(el.children, el.attributes as Record<string, string>));
    } else if (el.tagName === 'sound') {
      measure.entries.push(parseSound(el.children, el.attributes as Record<string, string>));
    } else if (el.tagName === 'grouping') {
      const grpAttrs = el.attributes as Record<string, string>;
      const grouping: GroupingEntry = {
        _id: generateId(),
        type: 'grouping',
        groupingType: (grpAttrs['type'] as 'start' | 'stop' | 'single') || 'start',
      };
      if (grpAttrs['number']) grouping.number = grpAttrs['number'];
      measure.entries.push(grouping);
    }
  }

  if (barlines.length > 0) measure.barlines = barlines;

  return measure;
}

function parsePrint(elements: XmlChild[], attrs: Record<string, string>): Print {
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
    if (typeof el === 'string') continue;
    if (el.tagName === 'staff-layout') {
      const layoutAttrs = el.attributes as Record<string, string>;
      const content = el.children;
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

function parseAttributes(elements: XmlChild[]): MeasureAttributes {
  const attrs: MeasureAttributes = { _id: generateId() };

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
    if (typeof el === 'string') continue;
    if (el.tagName === 'key') {
      const keyAttrs = el.attributes as Record<string, string>;
      const keyContent = el.children;
      const key = parseKeySignature(keyContent);
      if (keyAttrs['number']) key.number = parseInt(keyAttrs['number'], 10);
      if (keyAttrs['print-object'] === 'no') key.printObject = false;
      else if (keyAttrs['print-object'] === 'yes') key.printObject = true;
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
    if (typeof el === 'string') continue;
    if (el.tagName === 'clef') {
      const clefAttrs = el.attributes as Record<string, string>;
      clefs.push(parseClef(el.children, clefAttrs));
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
    if (typeof el === 'string') continue;
    if (el.tagName === 'staff-details') {
      const sdAttrs = el.attributes as Record<string, string>;
      const content = el.children;
      staffDetailsList.push(parseStaffDetails(content, sdAttrs));
    }
  }
  if (staffDetailsList.length > 0) attrs.staffDetails = staffDetailsList;

  // Measure style
  const measureStyleList: MeasureStyle[] = [];
  for (const el of elements) {
    if (typeof el === 'string') continue;
    if (el.tagName === 'measure-style') {
      const msAttrs = el.attributes as Record<string, string>;
      const content = el.children;
      measureStyleList.push(parseMeasureStyle(content, msAttrs));
    }
  }
  if (measureStyleList.length > 0) attrs.measureStyle = measureStyleList;

  return attrs;
}

function parseTimeSignature(elements: XmlChild[], parentElements: XmlChild[]): TimeSignature {
  // Check for senza-misura first
  if (hasElement(elements, 'senza-misura')) {
    const time: TimeSignature = {
      beats: '',
      beatType: 0,
      senzaMisura: true,
    };
    return time;
  }

  // Collect all beats (as strings to preserve values like "3+2") and beat-type values
  const beatsStrList = collectElements(elements, 'beats', (c) => extractText(c));
  const beatTypeList = collectElements(elements, 'beat-type', (c) => parseInt(extractText(c), 10));

  const time: TimeSignature = {
    beats: beatsStrList.length > 0 ? beatsStrList[0] : '4',
    beatType: beatTypeList.length > 0 ? beatTypeList[0] : 4,
  };

  // Store compound time signature data
  if (beatsStrList.length > 1 || beatTypeList.length > 1) {
    time.beatsList = beatsStrList.map(b => parseInt(b, 10));
    time.beatsStrList = beatsStrList; // Store original strings for roundtrip
    time.beatTypeList = beatTypeList;
  }

  // Get symbol and print-object attributes from parent
  for (const el of parentElements) {
    if (typeof el === 'string') continue;
    if (el.tagName === 'time') {
      const attrs = el.attributes as Record<string, string>;
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

function parseKeySignature(elements: XmlChild[]): KeySignature {
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
    else if (a['cancel'] === 'no') ko.cancel = false;
    return ko;
  });

  if (keySteps.length > 0) key.keySteps = keySteps;
  if (keyAlters.length > 0) key.keyAlters = keyAlters;
  if (keyOctaves.length > 0) key.keyOctaves = keyOctaves;

  return key;
}

function parseClef(elements: XmlChild[], attrs: Record<string, string>): Clef {
  const sign = getElementText(elements, 'sign') as Clef['sign'] || 'G';
  const lineText = getElementText(elements, 'line');

  const clef: Clef = { sign };

  // Only set line if present in the XML (percussion clefs may not have it)
  if (lineText) {
    clef.line = parseInt(lineText, 10);
  }

  if (attrs['number']) {
    clef.staff = parseInt(attrs['number'], 10);
  }

  const octaveChange = getElementTextAsInt(elements, 'clef-octave-change');
  if (octaveChange !== undefined) {
    clef.clefOctaveChange = octaveChange;
  }

  if (attrs['print-object'] === 'no') {
    clef.printObject = false;
  } else if (attrs['print-object'] === 'yes') {
    clef.printObject = true;
  }
  if (attrs['after-barline'] === 'yes') {
    clef.afterBarline = true;
  }

  return clef;
}

function parseTranspose(elements: XmlChild[]): Transpose {
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

function parseNote(elements: XmlChild[], attrs: Record<string, string>): NoteEntry {
  const note: NoteEntry = {
    _id: generateId(),
    type: 'note',
    duration: 0,
  };

  // Layout attributes (from attrs, not children - no loop needed)
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

  // Single pass over all child elements
  let dotCount = 0;
  let notationsIndex = 0;
  let tieElements: { type: 'start' | 'stop' | 'continue' }[] | undefined;
  let beams: BeamInfo[] | undefined;
  let allNotations: Notation[] | undefined;
  let lyrics: Lyric[] | undefined;
  let hasGrace = false;

  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    if (typeof el === 'string') continue;
    const tag = el.tagName;
    const elAttrs = el.attributes as Record<string, string>;
    const c = el.children;

    switch (tag) {
      case 'duration': {
        const text = extractText(c);
        if (text) note.duration = parseInt(text, 10) || 0;
        break;
      }
      case 'voice': {
        const text = extractText(c);
        if (text) note.voice = text;
        break;
      }
      case 'cue':
        note.cue = true;
        break;
      case 'chord':
        note.chord = true;
        break;
      case 'dot':
        dotCount++;
        break;
      case 'instrument':
        if (elAttrs['id']) note.instrument = elAttrs['id'];
        break;
      case 'pitch':
        note.pitch = parsePitch(c);
        break;
      case 'rest': {
        const restInfo: RestInfo = {};
        if (elAttrs['measure'] === 'yes') restInfo.measure = true;
        const displayStep = getElementText(c, 'display-step');
        if (displayStep) restInfo.displayStep = displayStep;
        const displayOctave = getElementText(c, 'display-octave');
        if (displayOctave) restInfo.displayOctave = parseInt(displayOctave, 10);
        note.rest = restInfo;
        break;
      }
      case 'unpitched': {
        note.unpitched = {};
        const displayStep = getElementText(c, 'display-step');
        if (displayStep) note.unpitched.displayStep = displayStep;
        const displayOctave = getElementText(c, 'display-octave');
        if (displayOctave) note.unpitched.displayOctave = parseInt(displayOctave, 10);
        break;
      }
      case 'staff': {
        const text = extractText(c);
        if (text) { const v = parseInt(text, 10); if (!isNaN(v)) note.staff = v; }
        break;
      }
      case 'type': {
        const noteType = extractText(c);
        if (isValidNoteType(noteType)) note.noteType = noteType;
        if (elAttrs['size']) note.noteTypeSize = elAttrs['size'];
        break;
      }
      case 'accidental': {
        const accValue = extractText(c);
        if (isValidAccidental(accValue)) {
          const accInfo: AccidentalInfo = { value: accValue };
          if (elAttrs['cautionary'] === 'yes') accInfo.cautionary = true;
          if (elAttrs['editorial'] === 'yes') accInfo.editorial = true;
          if (elAttrs['parentheses'] === 'yes') accInfo.parentheses = true;
          if (elAttrs['bracket'] === 'yes') accInfo.bracket = true;
          if (elAttrs['relative-x']) accInfo.relativeX = parseFloat(elAttrs['relative-x']);
          if (elAttrs['relative-y']) accInfo.relativeY = parseFloat(elAttrs['relative-y']);
          if (elAttrs['color']) accInfo.color = elAttrs['color'];
          if (elAttrs['size']) accInfo.size = elAttrs['size'];
          if (elAttrs['font-size']) accInfo.fontSize = elAttrs['font-size'];
          note.accidental = accInfo;
        }
        break;
      }
      case 'stem': {
        const stemValue = extractText(c);
        if (stemValue === 'up' || stemValue === 'down' || stemValue === 'none' || stemValue === 'double') {
          note.stem = { value: stemValue };
          if (elAttrs['default-x']) note.stem.defaultX = parseFloat(elAttrs['default-x']);
          if (elAttrs['default-y']) note.stem.defaultY = parseFloat(elAttrs['default-y']);
        }
        break;
      }
      case 'notehead': {
        const nhValue = extractText(c);
        if (isValidNotehead(nhValue)) {
          const nhInfo: NoteheadInfo = { value: nhValue };
          if (elAttrs['filled'] === 'yes') nhInfo.filled = true;
          else if (elAttrs['filled'] === 'no') nhInfo.filled = false;
          if (elAttrs['parentheses'] === 'yes') nhInfo.parentheses = true;
          note.notehead = nhInfo;
        }
        break;
      }
      case 'tie': {
        const t = elAttrs['type'];
        if (t === 'start' || t === 'stop' || t === 'continue') {
          if (!tieElements) tieElements = [];
          tieElements.push({ type: t });
        }
        break;
      }
      case 'beam': {
        if (!beams) beams = [];
        beams.push(parseBeam(c, elAttrs));
        break;
      }
      case 'notations': {
        const parsedNotations = parseNotations(c, notationsIndex);
        if (parsedNotations.length > 0) {
          if (!allNotations) allNotations = [];
          for (let j = 0; j < parsedNotations.length; j++) allNotations.push(parsedNotations[j]);
        }
        notationsIndex++;
        break;
      }
      case 'lyric': {
        if (!lyrics) lyrics = [];
        lyrics.push(parseLyric(c, elAttrs));
        break;
      }
      case 'grace': {
        hasGrace = true;
        note.grace = {};
        if (elAttrs['slash'] === 'yes') note.grace.slash = true;
        else if (elAttrs['slash'] === 'no') note.grace.slash = false;
        if (elAttrs['steal-time-previous']) {
          note.grace.stealTimePrevious = parseFloat(elAttrs['steal-time-previous']);
        }
        if (elAttrs['steal-time-following']) {
          note.grace.stealTimeFollowing = parseFloat(elAttrs['steal-time-following']);
        }
        break;
      }
      case 'time-modification': {
        const actualNotes = getElementText(c, 'actual-notes');
        const normalNotes = getElementText(c, 'normal-notes');
        const normalType = getElementText(c, 'normal-type');
        note.timeModification = {
          actualNotes: parseInt(actualNotes || '3', 10),
          normalNotes: parseInt(normalNotes || '2', 10),
        };
        if (normalType && isValidNoteType(normalType)) {
          note.timeModification.normalType = normalType;
        }
        let ndCount = 0;
        for (const tm of c) {
          if (typeof tm !== 'string' && tm.tagName === 'normal-dot') ndCount++;
        }
        if (ndCount > 0) note.timeModification.normalDots = ndCount;
        break;
      }
    }
  }

  if (dotCount > 0) note.dots = dotCount;
  if (tieElements) {
    note.tie = tieElements[0];
    if (tieElements.length > 1) note.ties = tieElements;
  }
  if (beams) note.beam = beams;
  if (allNotations) note.notations = allNotations;
  if (lyrics) note.lyrics = lyrics;
  if (hasGrace) note.duration = 0;

  return note;
}

function parsePitch(elements: XmlChild[]): Pitch {
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

function parseBeam(elements: XmlChild[], attrs: Record<string, string>): BeamInfo {
  const text = extractText(elements);
  const validTypes = ['begin', 'continue', 'end', 'forward hook', 'backward hook'];
  return {
    number: parseInt(attrs['number'] || '1', 10),
    type: validTypes.includes(text) ? text as BeamInfo['type'] : 'begin',
  };
}

function parseNotations(elements: XmlChild[], notationsIndex: number = 0): Notation[] {
  const notations: Notation[] = [];
  let articulationsIndex = 0;

  for (const el of elements) {
    if (typeof el === 'string') continue;
    if (el.tagName === 'tied') {
      const attrs = el.attributes as Record<string, string>;
      const tied: TiedNotation = {
        type: 'tied',
        tiedType: (attrs['type'] as 'start' | 'stop' | 'continue' | 'let-ring') || 'start',
        number: attrs['number'] ? parseInt(attrs['number'], 10) : undefined,
        orientation: attrs['orientation'] as 'over' | 'under' | undefined,
        notationsIndex,
      };
      notations.push(tied);
    } else if (el.tagName === 'slur') {
      const attrs = el.attributes as Record<string, string>;
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
    } else if (el.tagName === 'tuplet') {
      const attrs = el.attributes as Record<string, string>;
      const tupletContent = el.children;
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
        if (typeof tc === 'string') continue;
        if (tc.tagName === 'tuplet-actual') {
          const actualContent = tc.children;
          const actual: NonNullable<TupletNotation['tupletActual']> = {};
          const num = getElementText(actualContent, 'tuplet-number');
          if (num) actual.tupletNumber = parseInt(num, 10);
          const type = getElementText(actualContent, 'tuplet-type');
          if (type && isValidNoteType(type)) actual.tupletType = type;
          let dotCount = 0;
          for (const ac of actualContent) {
            if (typeof ac !== 'string' && ac.tagName === 'tuplet-dot') dotCount++;
          }
          if (dotCount > 0) actual.tupletDots = dotCount;
          if (Object.keys(actual).length > 0) tuplet.tupletActual = actual;
        } else if (tc.tagName === 'tuplet-normal') {
          const normalContent = tc.children;
          const normal: NonNullable<TupletNotation['tupletNormal']> = {};
          const num = getElementText(normalContent, 'tuplet-number');
          if (num) normal.tupletNumber = parseInt(num, 10);
          const type = getElementText(normalContent, 'tuplet-type');
          if (type && isValidNoteType(type)) normal.tupletType = type;
          let dotCount = 0;
          for (const nc of normalContent) {
            if (typeof nc !== 'string' && nc.tagName === 'tuplet-dot') dotCount++;
          }
          if (dotCount > 0) normal.tupletDots = dotCount;
          if (Object.keys(normal).length > 0) tuplet.tupletNormal = normal;
        }
      }

      notations.push(tuplet);
    } else if (el.tagName === 'articulations') {
      const artContent = el.children;
      const articulationTypes = [
        'accent', 'strong-accent', 'staccato', 'staccatissimo',
        'tenuto', 'detached-legato', 'marcato', 'spiccato',
        'scoop', 'plop', 'doit', 'falloff', 'breath-mark',
        'caesura', 'stress', 'unstress', 'soft-accent',
      ];
      const currentArtIndex = articulationsIndex;
      articulationsIndex++;
      for (const art of artContent) {
        if (typeof art === 'string') continue;
        for (const artType of articulationTypes) {
          if (art.tagName === artType) {
            const artAttrs = art.attributes as Record<string, string>;
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
    } else if (el.tagName === 'ornaments') {
      const ornContent = el.children;
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
        if (typeof orn === 'string') continue;
        // Simple ornaments
        for (const ornType of simpleOrnamentTypes) {
          if (orn.tagName === ornType) {
            const ornAttrs = orn.attributes as Record<string, string>;
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
        if (orn.tagName === 'wavy-line') {
          const wlAttrs = orn.attributes as Record<string, string>;
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
        if (orn.tagName === 'tremolo') {
          const tremAttrs = orn.attributes as Record<string, string>;
          const marks = extractText(orn.children);
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

      // Check if this ornaments element was empty - add marker for roundtrip
      const ornamentNotationsAdded = notations.filter(n => n.type === 'ornament' && n.notationsIndex === notationsIndex);
      if (ornamentNotationsAdded.length === 0) {
        notations.push({
          type: 'ornament',
          ornament: 'empty',
          notationsIndex,
        });
      }
    } else if (el.tagName === 'technical') {
      const techContent = el.children;
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
        if (typeof tech === 'string') continue;
        // Handle bend with bend-alter
        if (tech.tagName === 'bend') {
          const bendContent = tech.children;
          const techAttrs = tech.attributes as Record<string, string>;
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
          if (hasElement(bendContent, 'with-bar')) techNotation.withBar = true;
          notations.push(techNotation);
        }
        // Handle other technical elements
        for (const techType of technicalTypes) {
          if (tech.tagName === techType) {
            const techAttrs = tech.attributes as Record<string, string>;
            const notation: TechnicalNotation = {
              type: 'technical',
              technical: techType as any,
              placement: techAttrs['placement'] as 'above' | 'below' | undefined,
              notationsIndex,
            };
            const techElContent = tech.children;
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
    } else if (el.tagName === 'dynamics') {
      const dynContent = el.children;
      const dynamicsValues: DynamicsValue[] = [];
      const allDynamics: DynamicsValue[] = [
        'pppppp', 'ppppp', 'pppp', 'ppp', 'pp', 'p',
        'mp', 'mf',
        'f', 'ff', 'fff', 'ffff', 'fffff', 'ffffff',
        'sf', 'sfz', 'sffz', 'sfp', 'sfpp', 'fp', 'rf', 'rfz', 'fz', 'n', 'pf',
      ];
      let otherDynamics: string | undefined;
      for (const dyn of dynContent) {
        if (typeof dyn === 'string') continue;
        for (const dv of allDynamics) {
          if (dyn.tagName === dv) dynamicsValues.push(dv);
        }
        // Handle other-dynamics
        const od = parseFirstElement([dyn], 'other-dynamics', (c) => extractText(c));
        if (od) otherDynamics = od;
      }
      if (dynamicsValues.length > 0 || otherDynamics) {
        const dynAttrs = el.attributes as Record<string, string>;
        const dynNotation: DynamicsNotation = {
          type: 'dynamics',
          dynamics: dynamicsValues,
          placement: dynAttrs['placement'] as 'above' | 'below' | undefined,
          notationsIndex,
        };
        if (otherDynamics) dynNotation.otherDynamics = otherDynamics;
        notations.push(dynNotation);
      }
    } else if (el.tagName === 'fermata') {
      const a = el.attributes as Record<string, string>;
      const shape = extractText(el.children);
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
    } else if (el.tagName === 'arpeggiate') {
      const arpAttrs = el.attributes as Record<string, string>;
      const arpNotation: any = {
        type: 'arpeggiate',
        direction: arpAttrs['direction'] as 'up' | 'down' | undefined,
        number: arpAttrs['number'] ? parseInt(arpAttrs['number'], 10) : undefined,
        notationsIndex,
      };
      if (arpAttrs['default-x']) arpNotation.defaultX = parseFloat(arpAttrs['default-x']);
      if (arpAttrs['default-y']) arpNotation.defaultY = parseFloat(arpAttrs['default-y']);
      notations.push(arpNotation);
    } else if (el.tagName === 'non-arpeggiate') {
      const nonArpAttrs = el.attributes as Record<string, string>;
      notations.push({
        type: 'non-arpeggiate',
        nonArpeggiateType: nonArpAttrs['type'] as 'top' | 'bottom',
        number: nonArpAttrs['number'] ? parseInt(nonArpAttrs['number'], 10) : undefined,
        placement: nonArpAttrs['placement'] as 'above' | 'below' | undefined,
        notationsIndex,
      });
    } else if (el.tagName === 'accidental-mark') {
      const amAttrs = el.attributes as Record<string, string>;
      const amContent = el.children;
      const value = extractText(amContent);
      notations.push({
        type: 'accidental-mark',
        value,
        placement: amAttrs['placement'] as 'above' | 'below' | undefined,
        notationsIndex,
      });
    } else if (el.tagName === 'glissando') {
      const glissAttrs = el.attributes as Record<string, string>;
      const glissContent = el.children;
      let text: string | undefined;
      for (const item of glissContent) {
        if (typeof item === 'string') {
          text = item.trim();
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
    } else if (el.tagName === 'slide') {
      const slideAttrs = el.attributes as Record<string, string>;
      const slideContent = el.children;
      const slideText = extractText(slideContent);
      const slideNotation: SlideNotation = {
        type: 'slide',
        slideType: slideAttrs['type'] === 'stop' ? 'stop' : 'start',
        number: slideAttrs['number'] ? parseInt(slideAttrs['number'], 10) : undefined,
        lineType: slideAttrs['line-type'] as 'solid' | 'dashed' | 'dotted' | 'wavy' | undefined,
        notationsIndex,
      };
      if (slideText) slideNotation.text = slideText;
      notations.push(slideNotation);
    }
  }

  return notations;
}

function parseLyric(elements: XmlChild[], attrs: Record<string, string>): Lyric {
  // Collect all text elements and check for elision
  const textElements: LyricTextElement[] = [];
  let hasElision = false;
  let currentSyllabic: 'single' | 'begin' | 'middle' | 'end' | undefined;

  for (const el of elements) {
    if (typeof el === 'string') continue;
    if (el.tagName === 'syllabic') {
      const content = el.children;
      for (const item of content) {
        if (typeof item === 'string') {
          const syl = item.trim();
          if (syl === 'single' || syl === 'begin' || syl === 'middle' || syl === 'end') {
            currentSyllabic = syl;
          }
          break;
        }
      }
    } else if (el.tagName === 'text') {
      const content = el.children;
      let foundText = false;
      for (const item of content) {
        if (typeof item === 'string') {
          textElements.push({
            text: item,
            syllabic: currentSyllabic,
          });
          currentSyllabic = undefined;
          foundText = true;
          break;
        }
      }
      // Handle text elements with empty/whitespace-only content (e.g., fullwidth space trimmed by parser)
      if (!foundText) {
        textElements.push({
          text: '',
          syllabic: currentSyllabic,
        });
        currentSyllabic = undefined;
      }
    } else if (el.tagName === 'elision') {
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
    if (typeof el === 'string') continue;
    if (el.tagName === 'extend') {
      const extendAttrs = el.attributes as Record<string, string>;
      const extendType = extendAttrs['type'] as 'start' | 'stop' | 'continue' | undefined;
      if (extendType) {
        lyric.extend = { type: extendType };
      } else {
        lyric.extend = true;
      }
    } else if (el.tagName === 'end-line') {
      lyric.endLine = true;
    } else if (el.tagName === 'end-paragraph') {
      lyric.endParagraph = true;
    }
  }

  return lyric;
}

function parseBackup(elements: XmlChild[]): BackupEntry {
  return {
    _id: generateId(),
    type: 'backup',
    duration: parseInt(getElementText(elements, 'duration') || '0', 10),
  };
}

function parseForward(elements: XmlChild[]): ForwardEntry {
  const forward: ForwardEntry = {
    _id: generateId(),
    type: 'forward',
    duration: parseInt(getElementText(elements, 'duration') || '0', 10),
  };

  const voice = getElementText(elements, 'voice');
  if (voice) forward.voice = voice;

  const staff = getElementText(elements, 'staff');
  if (staff) forward.staff = parseInt(staff, 10);

  return forward;
}

function parseDirection(elements: XmlChild[], attrs: Record<string, string>): DirectionEntry {
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
  if (voice) direction.voice = voice;

  // Parse offset with sound attribute
  parseFirstElement(elements, 'offset', (c, a) => {
    const text = extractText(c);
    if (text) direction.offset = parseInt(text, 10);
    if (a['sound'] === 'yes') direction.offsetSound = true;
  });

  // Direction types
  for (const el of elements) {
    if (typeof el === 'string') continue;
    if (el.tagName === 'direction-type') {
      const parsedTypes = parseDirectionTypes(el.children);
      for (const parsed of parsedTypes) {
        direction.directionTypes.push(parsed);
      }
    }
  }

  // Sound
  for (const el of elements) {
    if (typeof el === 'string') continue;
    if (el.tagName === 'sound') {
      const soundAttrs = el.attributes as Record<string, string>;
      const soundContent = el.children;
      direction.sound = {};
      if (soundAttrs['tempo']) direction.sound.tempo = parseFloat(soundAttrs['tempo']);
      if (soundAttrs['dynamics']) direction.sound.dynamics = parseFloat(soundAttrs['dynamics']);
      if (soundAttrs['damper-pedal']) direction.sound.damperPedal = soundAttrs['damper-pedal'] as 'yes' | 'no';
      if (soundAttrs['soft-pedal']) direction.sound.softPedal = soundAttrs['soft-pedal'] as 'yes' | 'no';
      if (soundAttrs['sostenuto-pedal']) direction.sound.sostenutoPedal = soundAttrs['sostenuto-pedal'] as 'yes' | 'no';

      // Parse midi-instrument
      for (const soundEl of soundContent) {
        if (typeof soundEl === 'string') continue;
        if (soundEl.tagName === 'midi-instrument') {
          const midiAttrs = soundEl.attributes as Record<string, string>;
          const midiContent = soundEl.children;
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
function parseDirectionTypes(elements: XmlChild[]): DirectionType[] {
  const results: DirectionType[] = [];

  for (const el of elements) {
    if (typeof el === 'string') continue;
    // Dynamics
    if (el.tagName === 'dynamics') {
      const dynAttrs = el.attributes as Record<string, string>;
      const dynContent = el.children;
      const dynamicsValues: DynamicsValue[] = [
        'pppppp', 'ppppp', 'pppp', 'ppp', 'pp', 'p',
        'mp', 'mf',
        'f', 'ff', 'fff', 'ffff', 'fffff', 'ffffff',
        'sf', 'sfz', 'sffz', 'sfp', 'sfpp', 'fp', 'rf', 'rfz', 'fz', 'n', 'pf',
      ];
      for (const dyn of dynContent) {
        if (typeof dyn === 'string') continue;
        // Check for standard dynamics
        let foundStandard = false;
        for (const dv of dynamicsValues) {
          if (dyn.tagName === dv) {
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
        if (!foundStandard && dyn.tagName === 'other-dynamics') {
          const otherDynText = extractText(dyn.children);
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
    if (el.tagName === 'wedge') {
      const wedgeAttrs = el.attributes as Record<string, string>;
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
    if (el.tagName === 'metronome') {
      const metAttrs = el.attributes as Record<string, string>;
      const metContent = el.children;
      const perMinute = getElementText(metContent, 'per-minute');

      // Parse beat-units (could be one or two for tied/ratio)
      const beatUnits: string[] = [];
      const beatUnitDots: boolean[] = [];
      let dotForPrev = false;

      for (const met of metContent) {
        if (typeof met === 'string') continue;
        if (met.tagName === 'beat-unit') {
          const buContent = met.children;
          for (const item of buContent) {
            if (typeof item === 'string') {
              beatUnits.push(item.trim());
              dotForPrev = true;
              break;
            }
          }
        } else if (met.tagName === 'beat-unit-dot' && dotForPrev) {
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
        if (metAttrs['print-object'] === 'no') result.printObject = false;
        if (metAttrs['default-y']) result.defaultY = parseFloat(metAttrs['default-y']);
        if (metAttrs['font-family']) result.fontFamily = metAttrs['font-family'];
        if (metAttrs['font-size']) result.fontSize = metAttrs['font-size'];
        results.push(result);
      }
      continue;
    }

    // Words - collect all words elements in this direction-type
    if (el.tagName === 'words') {
      const a = el.attributes as Record<string, string>;
      const text = extractText(el.children, true);
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
    if (el.tagName === 'rehearsal') {
      const a = el.attributes as Record<string, string>;
      const text = extractText(el.children);
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
    if (el.tagName === 'bracket') {
      const bracketAttrs = el.attributes as Record<string, string>;
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
    if (el.tagName === 'dashes') {
      const dashAttrs = el.attributes as Record<string, string>;
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
    if (el.tagName === 'accordion-registration') {
      const accContent = el.children;
      const result: DirectionType = { kind: 'accordion-registration' };
      for (const acc of accContent) {
        if (typeof acc === 'string') continue;
        if (acc.tagName === 'accordion-high') {
          result.high = true;
        } else if (acc.tagName === 'accordion-middle') {
          // Track that accordion-middle is present (even if empty)
          result.middlePresent = true;
          const midContent = acc.children;
          for (const item of midContent) {
            if (typeof item === 'string') {
              const textValue = item;
              const numValue = parseInt(textValue, 10);
              // Preserve the original value - use number if valid, otherwise string
              result.middle = !isNaN(numValue) ? numValue : textValue;
              break;
            }
          }
        } else if (acc.tagName === 'accordion-low') {
          result.low = true;
        }
      }
      results.push(result);
      continue;
    }

    // Other direction
    if (el.tagName === 'other-direction') {
      const otherAttrs = el.attributes as Record<string, string>;
      const otherContent = el.children;
      for (const o of otherContent) {
        if (typeof o === 'string') {
          const result: DirectionType = { kind: 'other-direction', text: o.trim() };
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
    if (el.tagName === 'segno') {
      results.push({ kind: 'segno' });
      continue;
    }

    // Coda
    if (el.tagName === 'coda') {
      results.push({ kind: 'coda' });
      continue;
    }

    // Eyeglasses
    if (el.tagName === 'eyeglasses') {
      results.push({ kind: 'eyeglasses' });
      continue;
    }

    // Damp
    if (el.tagName === 'damp') {
      results.push({ kind: 'damp' });
      continue;
    }

    // Damp-all
    if (el.tagName === 'damp-all') {
      results.push({ kind: 'damp-all' });
      continue;
    }

    // Scordatura
    if (el.tagName === 'scordatura') {
      const scordContent = el.children;
      const accords: { string: number; tuningStep: string; tuningAlter?: number; tuningOctave: number }[] = [];
      for (const sc of scordContent) {
        if (typeof sc === 'string') continue;
        if (sc.tagName === 'accord') {
          const accAttrs = sc.attributes as Record<string, string>;
          const accContent = sc.children;
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
    if (el.tagName === 'harp-pedals') {
      const harpContent = el.children;
      const pedalTunings: { pedalStep: string; pedalAlter: number }[] = [];
      for (const hp of harpContent) {
        if (typeof hp === 'string') continue;
        if (hp.tagName === 'pedal-tuning') {
          const ptContent = hp.children;
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
    if (el.tagName === 'image') {
      const imgAttrs = el.attributes as Record<string, string>;
      results.push({
        kind: 'image',
        source: imgAttrs['source'],
        type: imgAttrs['type'],
      });
      continue;
    }

    // Pedal
    if (el.tagName === 'pedal') {
      const pedalAttrs = el.attributes as Record<string, string>;
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
    if (el.tagName === 'octave-shift') {
      const shiftAttrs = el.attributes as Record<string, string>;
      const shiftType = shiftAttrs['type'];
      if (shiftType === 'up' || shiftType === 'down' || shiftType === 'stop') {
        const result: DirectionType = { kind: 'octave-shift', type: shiftType };
        if (shiftAttrs['size']) result.size = parseInt(shiftAttrs['size'], 10);
        results.push(result);
      }
      continue;
    }

    // Swing
    if (el.tagName === 'swing') {
      const swingContent = el.children;
      const result: DirectionType = { kind: 'swing' };

      for (const sw of swingContent) {
        if (typeof sw === 'string') continue;
        if (sw.tagName === 'straight') {
          result.straight = true;
        } else if (sw.tagName === 'first') {
          const firstContent = sw.children;
          for (const item of firstContent) {
            if (typeof item === 'string') {
              result.first = parseInt(item, 10);
              break;
            }
          }
        } else if (sw.tagName === 'second') {
          const secondContent = sw.children;
          for (const item of secondContent) {
            if (typeof item === 'string') {
              result.second = parseInt(item, 10);
              break;
            }
          }
        } else if (sw.tagName === 'swing-type') {
          const stContent = sw.children;
          for (const item of stContent) {
            if (typeof item === 'string' && isValidNoteType(item.trim())) {
              result.swingType = item.trim() as any;
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

function parseBarline(elements: XmlChild[], attrs: Record<string, string>): Barline {
  const location = (attrs['location'] || 'right') as Barline['location'];

  const barline: Barline = { _id: generateId(), location };

  const barStyle = getElementText(elements, 'bar-style');
  if (barStyle && isValidBarStyle(barStyle)) {
    barline.barStyle = barStyle;
  }

  for (const el of elements) {
    if (typeof el === 'string') continue;
    if (el.tagName === 'repeat') {
      const repeatAttrs = el.attributes as Record<string, string>;
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
    } else if (el.tagName === 'ending') {
      const endingAttrs = el.attributes as Record<string, string>;
      const number = endingAttrs['number'];
      const type = endingAttrs['type'];
      if (number && (type === 'start' || type === 'stop' || type === 'discontinue')) {
        barline.ending = { number, type };
        const endingContent = el.children;
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

function parseStaffDetails(elements: XmlChild[], attrs: Record<string, string>): StaffDetails {
  const sd: StaffDetails = {};

  if (attrs['number']) sd.number = parseInt(attrs['number'], 10);
  if (attrs['print-object'] === 'no') sd.printObject = false;
  else if (attrs['print-object'] === 'yes') sd.printObject = true;
  if (attrs['print-spacing'] === 'yes') sd.printSpacing = true;
  else if (attrs['print-spacing'] === 'no') sd.printSpacing = false;

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
    if (typeof el === 'string') continue;
    if (el.tagName === 'staff-size') {
      const sizeContent = el.children;
      const sizeAttrs = el.attributes as Record<string, string>;
      for (const item of sizeContent) {
        if (typeof item === 'string') {
          sd.staffSize = parseFloat(item);
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
    if (typeof el === 'string') continue;
    if (el.tagName === 'staff-tuning') {
      const tuningAttrs = el.attributes as Record<string, string>;
      const tuningContent = el.children;
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

function parseMeasureStyle(elements: XmlChild[], attrs: Record<string, string>): MeasureStyle {
  const ms: MeasureStyle = {};

  if (attrs['number']) ms.number = parseInt(attrs['number'], 10);

  const multipleRest = getElementText(elements, 'multiple-rest');
  if (multipleRest) ms.multipleRest = parseInt(multipleRest, 10);

  for (const el of elements) {
    if (typeof el === 'string') continue;
    if (el.tagName === 'measure-repeat') {
      const mrAttrs = el.attributes as Record<string, string>;
      ms.measureRepeat = { type: mrAttrs['type'] === 'stop' ? 'stop' : 'start' };
      if (mrAttrs['slashes']) ms.measureRepeat.slashes = parseInt(mrAttrs['slashes'], 10);
    } else if (el.tagName === 'beat-repeat') {
      const brAttrs = el.attributes as Record<string, string>;
      ms.beatRepeat = { type: brAttrs['type'] === 'stop' ? 'stop' : 'start' };
      if (brAttrs['slashes']) ms.beatRepeat.slashes = parseInt(brAttrs['slashes'], 10);
    } else if (el.tagName === 'slash') {
      const slAttrs = el.attributes as Record<string, string>;
      ms.slash = { type: slAttrs['type'] === 'stop' ? 'stop' : 'start' };
      if (slAttrs['use-dots'] === 'yes') ms.slash.useDots = true;
      else if (slAttrs['use-dots'] === 'no') ms.slash.useDots = false;
      if (slAttrs['use-stems'] === 'yes') ms.slash.useStems = true;
      else if (slAttrs['use-stems'] === 'no') ms.slash.useStems = false;
    }
  }

  return ms;
}

function parseHarmony(elements: XmlChild[], attrs: Record<string, string>): HarmonyEntry {
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
    if (typeof el === 'string') continue;
    if (el.tagName === 'kind') {
      const kindAttrs = el.attributes as Record<string, string>;
      const kindContent = el.children;
      for (const item of kindContent) {
        if (typeof item === 'string') {
          harmony.kind = item.trim();
          break;
        }
      }
      if (kindAttrs['text'] !== undefined) harmony.kindText = kindAttrs['text'];
      if (kindAttrs['halign']) harmony.kindHalign = kindAttrs['halign'];
      break;
    }
  }

  // Parse bass
  for (const el of elements) {
    if (typeof el === 'string') continue;
    if (el.tagName === 'bass') {
      const bassAttrs = el.attributes as Record<string, string>;
      const bassContent = el.children;
      const bassStep = getElementText(bassContent, 'bass-step');
      if (bassStep) {
        harmony.bass = { bassStep };
        const bassAlter = getElementText(bassContent, 'bass-alter');
        if (bassAlter) harmony.bass.bassAlter = parseFloat(bassAlter);
        if (bassAttrs['arrangement']) harmony.bass.arrangement = bassAttrs['arrangement'];
      }
      break;
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
    if (typeof el === 'string') continue;
    if (el.tagName === 'degree') {
      const degContent = el.children;
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
      if (typeof fel === 'string') continue;
      if (fel.tagName === 'first-fret') {
        const ffAttrs = fel.attributes as Record<string, string>;
        const ffContent = fel.children;
        for (const item of ffContent) {
          if (typeof item === 'string') {
            frameObj.firstFret = parseInt(item, 10);
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
      if (typeof fel === 'string') continue;
      if (fel.tagName === 'frame-note') {
        const fnContent = fel.children;
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
            if (typeof fnEl === 'string') continue;
            if (fnEl.tagName === 'barre') {
              const barreAttrs = fnEl.attributes as Record<string, string>;
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

function parseFiguredBass(elements: XmlChild[], attrs: Record<string, string>): FiguredBassEntry {
  const fb: FiguredBassEntry = {
    _id: generateId(),
    type: 'figured-bass',
    figures: [],
  };

  if (attrs['parentheses'] === 'yes') fb.parentheses = true;

  const duration = getElementText(elements, 'duration');
  if (duration) fb.duration = parseInt(duration, 10);

  for (const el of elements) {
    if (typeof el === 'string') continue;
    if (el.tagName === 'figure') {
      const figContent = el.children;
      const figure: Figure = {};

      const figNumber = getElementText(figContent, 'figure-number');
      if (figNumber) figure.figureNumber = figNumber;

      for (const figEl of figContent) {
        if (typeof figEl === 'string') continue;
        if (figEl.tagName === 'prefix') {
          const prefixContent = figEl.children;
          for (const item of prefixContent) {
            if (typeof item === 'string') {
              figure.prefix = item.trim();
              break;
            }
          }
        } else if (figEl.tagName === 'suffix') {
          const suffixContent = figEl.children;
          for (const item of suffixContent) {
            if (typeof item === 'string') {
              figure.suffix = item.trim();
              break;
            }
          }
        } else if (figEl.tagName === 'extend') {
          const extendAttrs = figEl.attributes as Record<string, string>;
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

function parseSound(elements: XmlChild[], attrs: Record<string, string>): SoundEntry {
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
    if (typeof el === 'string') continue;
    if (el.tagName === 'swing') {
      const swingContent = el.children;
      const swing: Swing = {};
      for (const swingEl of swingContent) {
        if (typeof swingEl === 'string') continue;
        if (swingEl.tagName === 'straight') {
          swing.straight = true;
        } else if (swingEl.tagName === 'first') {
          const firstContent = swingEl.children;
          for (const item of firstContent) {
            if (typeof item === 'string') {
              swing.first = parseInt(item, 10);
              break;
            }
          }
        } else if (swingEl.tagName === 'second') {
          const secondContent = swingEl.children;
          for (const item of secondContent) {
            if (typeof item === 'string') {
              swing.second = parseInt(item, 10);
              break;
            }
          }
        } else if (swingEl.tagName === 'swing-type') {
          const typeContent = swingEl.children;
          for (const item of typeContent) {
            if (typeof item === 'string') {
              swing.swingType = item.trim();
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
