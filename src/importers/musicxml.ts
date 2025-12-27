import { XMLParser } from 'fast-xml-parser';
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
  MiscellaneousField,
  Creator,
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

function getElementText(elements: OrderedElement[], tagName: string): string | undefined {
  const content = findElement(elements, tagName);
  if (!content) return undefined;
  for (const item of content) {
    if (item['#text'] !== undefined) {
      return String(item['#text']);
    }
  }
  // Element exists but has no text content - return empty string
  return '';
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
  const defaults = parseDefaults(elements);
  const credits = parseCredits(elements);

  return {
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
    const creators: Creator[] = [];
    for (const el of identification) {
      if (el['creator']) {
        const attrs = getAttributes(el);
        const content = el['creator'] as OrderedElement[];
        let text = '';
        for (const item of content) {
          if (item['#text'] !== undefined) {
            text = String(item['#text']);
            break;
          }
        }
        creators.push({ type: attrs['type'], value: text });
      }
    }
    if (creators.length > 0) metadata.creators = creators;

    // Rights
    const rights: string[] = [];
    for (const el of identification) {
      if (el['rights']) {
        const content = el['rights'] as OrderedElement[];
        for (const item of content) {
          if (item['#text'] !== undefined) {
            rights.push(String(item['#text']));
            break;
          }
        }
      }
    }
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
      const fields: MiscellaneousField[] = [];
      for (const el of miscellaneous) {
        if (el['miscellaneous-field']) {
          const attrs = getAttributes(el);
          const content = el['miscellaneous-field'] as OrderedElement[];
          let text = '';
          for (const item of content) {
            if (item['#text'] !== undefined) {
              text = String(item['#text']);
              break;
            }
          }
          fields.push({ name: attrs['name'] || '', value: text });
        }
      }
      if (fields.length > 0) metadata.miscellaneous = fields;
    }
  }

  return metadata;
}

function parseEncoding(elements: OrderedElement[]): Encoding {
  const encoding: Encoding = {};

  const software: string[] = [];
  const encoder: string[] = [];
  const supports: Support[] = [];

  for (const el of elements) {
    if (el['software']) {
      const content = el['software'] as OrderedElement[];
      for (const item of content) {
        if (item['#text'] !== undefined) {
          software.push(String(item['#text']));
          break;
        }
      }
    } else if (el['encoding-date']) {
      const content = el['encoding-date'] as OrderedElement[];
      for (const item of content) {
        if (item['#text'] !== undefined) {
          encoding.encodingDate = String(item['#text']);
          break;
        }
      }
    } else if (el['encoder']) {
      const content = el['encoder'] as OrderedElement[];
      for (const item of content) {
        if (item['#text'] !== undefined) {
          encoder.push(String(item['#text']));
          break;
        }
      }
    } else if (el['encoding-description']) {
      const content = el['encoding-description'] as OrderedElement[];
      for (const item of content) {
        if (item['#text'] !== undefined) {
          encoding.encodingDescription = String(item['#text']);
          break;
        }
      }
    } else if (el['supports']) {
      const attrs = getAttributes(el);
      const support: Support = {
        element: attrs['element'] || '',
        type: attrs['type'] === 'no' ? 'no' : 'yes',
      };
      if (attrs['attribute']) support.attribute = attrs['attribute'];
      if (attrs['value']) support.value = attrs['value'];
      supports.push(support);
    }
  }

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
  for (const el of defaultsContent) {
    if (el['appearance']) {
      const appContent = el['appearance'] as OrderedElement[];
      const appearance: Record<string, unknown> = {};
      for (const appEl of appContent) {
        // Handle common appearance children
        if (appEl['line-width']) {
          if (!appearance['line-widths']) appearance['line-widths'] = [];
          const attrs = getAttributes(appEl);
          const content = appEl['line-width'] as OrderedElement[];
          let value = '';
          for (const item of content) {
            if (item['#text'] !== undefined) {
              value = String(item['#text']);
              break;
            }
          }
          (appearance['line-widths'] as Array<{ type: string; value: number }>).push({
            type: attrs['type'] || '',
            value: parseFloat(value) || 0,
          });
        } else if (appEl['note-size']) {
          if (!appearance['note-sizes']) appearance['note-sizes'] = [];
          const attrs = getAttributes(appEl);
          const content = appEl['note-size'] as OrderedElement[];
          let value = '';
          for (const item of content) {
            if (item['#text'] !== undefined) {
              value = String(item['#text']);
              break;
            }
          }
          (appearance['note-sizes'] as Array<{ type: string; value: number }>).push({
            type: attrs['type'] || '',
            value: parseFloat(value) || 0,
          });
        } else if (appEl['distance']) {
          if (!appearance['distances']) appearance['distances'] = [];
          const attrs = getAttributes(appEl);
          const content = appEl['distance'] as OrderedElement[];
          let value = '';
          for (const item of content) {
            if (item['#text'] !== undefined) {
              value = String(item['#text']);
              break;
            }
          }
          (appearance['distances'] as Array<{ type: string; value: number }>).push({
            type: attrs['type'] || '',
            value: parseFloat(value) || 0,
          });
        }
      }
      if (Object.keys(appearance).length > 0) {
        defaults.appearance = appearance;
      }
      break;
    }
  }

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

  return layout;
}

function parseCredits(elements: OrderedElement[]): Credit[] | undefined {
  const credits: Credit[] = [];

  for (const el of elements) {
    if (el['credit']) {
      const attrs = getAttributes(el);
      const content = el['credit'] as OrderedElement[];
      const credit: Credit = {};

      if (attrs['page']) credit.page = parseInt(attrs['page'], 10);

      const types: string[] = [];
      const words: CreditWords[] = [];

      for (const child of content) {
        if (child['credit-type']) {
          const typeContent = child['credit-type'] as OrderedElement[];
          for (const item of typeContent) {
            if (item['#text'] !== undefined) {
              types.push(String(item['#text']));
              break;
            }
          }
        } else if (child['credit-words']) {
          const wordAttrs = getAttributes(child);
          const wordContent = child['credit-words'] as OrderedElement[];
          let text = '';
          for (const item of wordContent) {
            if (item['#text'] !== undefined) {
              text = String(item['#text']);
              break;
            }
          }
          const cw: CreditWords = { text };
          if (wordAttrs['default-x']) cw.defaultX = parseFloat(wordAttrs['default-x']);
          if (wordAttrs['default-y']) cw.defaultY = parseFloat(wordAttrs['default-y']);
          if (wordAttrs['font-size']) cw.fontSize = wordAttrs['font-size'];
          if (wordAttrs['font-weight']) cw.fontWeight = wordAttrs['font-weight'];
          if (wordAttrs['font-style']) cw.fontStyle = wordAttrs['font-style'];
          if (wordAttrs['justify']) cw.justify = wordAttrs['justify'];
          if (wordAttrs['halign']) cw.halign = wordAttrs['halign'];
          if (wordAttrs['valign']) cw.valign = wordAttrs['valign'];
          if (wordAttrs['letter-spacing']) cw.letterSpacing = wordAttrs['letter-spacing'];
          if (wordAttrs['xml:lang']) cw.xmlLang = wordAttrs['xml:lang'];
          if (wordAttrs['xml:space']) cw.xmlSpace = wordAttrs['xml:space'];
          words.push(cw);
        }
      }

      if (types.length > 0) credit.creditType = types;
      if (words.length > 0) credit.creditWords = words;
      credits.push(credit);
    }
  }

  return credits.length > 0 ? credits : undefined;
}

function parseDisplayTexts(elements: OrderedElement[]): DisplayText[] {
  const displayTexts: DisplayText[] = [];
  for (const el of elements) {
    if (el['display-text']) {
      const dtAttrs = getAttributes(el);
      const dtContent = el['display-text'] as OrderedElement[];
      let text = '';
      for (const item of dtContent) {
        if (item['#text'] !== undefined) {
          text = String(item['#text']);
          break;
        }
      }
      const dt: DisplayText = { text };
      if (dtAttrs['font-family']) dt.fontFamily = dtAttrs['font-family'];
      if (dtAttrs['font-size']) dt.fontSize = dtAttrs['font-size'];
      if (dtAttrs['font-style']) dt.fontStyle = dtAttrs['font-style'];
      if (dtAttrs['font-weight']) dt.fontWeight = dtAttrs['font-weight'];
      if (dtAttrs['xml:space']) dt.xmlSpace = dtAttrs['xml:space'];
      displayTexts.push(dt);
    }
  }
  return displayTexts;
}

function parsePartList(elements: OrderedElement[]): PartListEntry[] {
  const partList: PartListEntry[] = [];

  for (const el of elements) {
    if (el['score-part']) {
      const attrs = getAttributes(el);
      const content = el['score-part'] as OrderedElement[];

      const partInfo: PartInfo = {
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
          for (const ic of instContent) {
            if (ic['solo'] !== undefined) {
              inst.solo = true;
            } else if (ic['ensemble']) {
              const ensContent = ic['ensemble'] as OrderedElement[];
              for (const item of ensContent) {
                if (item['#text'] !== undefined) {
                  inst.ensemble = parseInt(String(item['#text']), 10);
                  break;
                }
              }
            }
          }
          instruments.push(inst);
        }
      }
      if (instruments.length > 0) partInfo.scoreInstruments = instruments;

      // Group elements (after MIDI instruments in score-part)
      const groups: string[] = [];
      for (const child of content) {
        if (child['group']) {
          const groupContent = child['group'] as OrderedElement[];
          for (const item of groupContent) {
            if (item['#text'] !== undefined) {
              groups.push(String(item['#text']));
              break;
            }
          }
        }
      }
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
        type: 'part-group',
        groupType: attrs['type'] === 'stop' ? 'stop' : 'start',
      };
      if (attrs['number']) group.number = parseInt(attrs['number'], 10);

      const name = getElementText(content, 'group-name');
      if (name) group.groupName = name;

      // group-name-display
      for (const child of content) {
        if (child['group-name-display']) {
          group.groupNameDisplay = parseDisplayTexts(child['group-name-display'] as OrderedElement[]);
          break;
        }
      }

      const abbr = getElementText(content, 'group-abbreviation');
      if (abbr) group.groupAbbreviation = abbr;

      // group-abbreviation-display
      for (const child of content) {
        if (child['group-abbreviation-display']) {
          group.groupAbbreviationDisplay = parseDisplayTexts(child['group-abbreviation-display'] as OrderedElement[]);
          break;
        }
      }

      // Parse group-symbol with default-x attribute
      for (const child of content) {
        if (child['group-symbol']) {
          const symbolContent = child['group-symbol'] as OrderedElement[];
          for (const item of symbolContent) {
            if (item['#text'] !== undefined) {
              const symbol = String(item['#text']);
              if (['none', 'brace', 'line', 'bracket', 'square'].includes(symbol)) {
                group.groupSymbol = symbol as PartGroup['groupSymbol'];
              }
              break;
            }
          }
          const symbolAttrs = getAttributes(child);
          if (symbolAttrs['default-x']) {
            group.groupSymbolDefaultX = parseFloat(symbolAttrs['default-x']);
          }
          break;
        }
      }

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
  for (const el of elements) {
    if (el['measure-numbering']) {
      const mnAttrs = getAttributes(el);
      const mnContent = el['measure-numbering'] as OrderedElement[];
      let value = '';
      for (const item of mnContent) {
        if (item['#text'] !== undefined) {
          value = String(item['#text']);
          break;
        }
      }
      const measureNumbering: MeasureNumbering = { value };
      if (mnAttrs['system'] && ['only-top', 'only-bottom', 'all-system-parts', 'none'].includes(mnAttrs['system'])) {
        measureNumbering.system = mnAttrs['system'] as MeasureNumbering['system'];
      }
      print.measureNumbering = measureNumbering;
      break;
    }
  }

  // part-name-display
  for (const el of elements) {
    if (el['part-name-display']) {
      print.partNameDisplay = parseDisplayTexts(el['part-name-display'] as OrderedElement[]);
      break;
    }
  }

  // part-abbreviation-display
  for (const el of elements) {
    if (el['part-abbreviation-display']) {
      print.partAbbreviationDisplay = parseDisplayTexts(el['part-abbreviation-display'] as OrderedElement[]);
      break;
    }
  }

  return print;
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
  const beatsList: number[] = [];
  const beatTypeList: number[] = [];

  for (const el of elements) {
    if (el['beats']) {
      const content = el['beats'] as OrderedElement[];
      for (const item of content) {
        if (item['#text'] !== undefined) {
          beatsList.push(parseInt(String(item['#text']), 10));
          break;
        }
      }
    } else if (el['beat-type']) {
      const content = el['beat-type'] as OrderedElement[];
      for (const item of content) {
        if (item['#text'] !== undefined) {
          beatTypeList.push(parseInt(String(item['#text']), 10));
          break;
        }
      }
    }
  }

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

  const validModes = ['major', 'minor', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'aeolian', 'ionian', 'locrian'];
  if (mode && validModes.includes(mode)) {
    key.mode = mode as KeySignature['mode'];
  }

  // Parse cancel element with its location attribute
  for (const el of elements) {
    if (el['cancel'] !== undefined) {
      const cancelContent = el['cancel'] as OrderedElement[];
      const cancelAttrs = getAttributes(el);
      for (const item of cancelContent) {
        if (item['#text'] !== undefined) {
          key.cancel = parseInt(String(item['#text']), 10);
          break;
        }
      }
      if (cancelAttrs['location']) {
        key.cancelLocation = cancelAttrs['location'] as 'left' | 'right' | 'before-barline';
      }
      break;
    }
  }

  // Non-traditional key signatures
  const keySteps: string[] = [];
  const keyAlters: number[] = [];
  const keyOctaves: KeyOctave[] = [];

  for (const el of elements) {
    if (el['key-step']) {
      const content = el['key-step'] as OrderedElement[];
      for (const item of content) {
        if (item['#text'] !== undefined) {
          keySteps.push(String(item['#text']));
          break;
        }
      }
    } else if (el['key-alter']) {
      const content = el['key-alter'] as OrderedElement[];
      for (const item of content) {
        if (item['#text'] !== undefined) {
          keyAlters.push(parseFloat(String(item['#text'])));
          break;
        }
      }
    } else if (el['key-octave']) {
      const koAttrs = getAttributes(el);
      const content = el['key-octave'] as OrderedElement[];
      for (const item of content) {
        if (item['#text'] !== undefined) {
          const ko: KeyOctave = {
            number: parseInt(koAttrs['number'] || '1', 10),
            octave: parseInt(String(item['#text']), 10),
          };
          if (koAttrs['cancel'] === 'yes') ko.cancel = true;
          keyOctaves.push(ko);
          break;
        }
      }
    }
  }

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

  const octaveChange = getElementText(elements, 'clef-octave-change');
  if (octaveChange) {
    clef.clefOctaveChange = parseInt(octaveChange, 10);
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

function parseNote(elements: OrderedElement[], attrs: Record<string, string>): NoteEntry {
  const note: NoteEntry = {
    type: 'note',
    duration: parseInt(getElementText(elements, 'duration') || '0', 10),
    voice: parseInt(getElementText(elements, 'voice') || '1', 10),
  };

  // Layout attributes
  if (attrs['default-x']) note.defaultX = parseFloat(attrs['default-x']);
  if (attrs['default-y']) note.defaultY = parseFloat(attrs['default-y']);
  if (attrs['relative-x']) note.relativeX = parseFloat(attrs['relative-x']);
  if (attrs['relative-y']) note.relativeY = parseFloat(attrs['relative-y']);
  if (attrs['dynamics']) note.dynamics = parseFloat(attrs['dynamics']);
  if (attrs['print-object'] === 'no') note.printObject = false;
  if (attrs['print-spacing'] === 'yes') note.printSpacing = true;
  if (attrs['print-spacing'] === 'no') note.printSpacing = false;

  // Cue note
  for (const el of elements) {
    if (el['cue'] !== undefined) {
      note.cue = true;
      break;
    }
  }

  // Instrument reference
  for (const el of elements) {
    if (el['instrument'] !== undefined) {
      const instAttrs = getAttributes(el);
      if (instAttrs['id']) {
        note.instrument = instAttrs['id'];
      }
      break;
    }
  }

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
  for (const el of elements) {
    if (el['unpitched'] !== undefined) {
      const unpitchedContent = el['unpitched'] as OrderedElement[];
      note.unpitched = {};

      const displayStep = getElementText(unpitchedContent, 'display-step');
      if (displayStep) note.unpitched.displayStep = displayStep;

      const displayOctave = getElementText(unpitchedContent, 'display-octave');
      if (displayOctave) note.unpitched.displayOctave = parseInt(displayOctave, 10);

      break;
    }
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
  for (const el of elements) {
    if (el['accidental']) {
      const accAttrs = getAttributes(el);
      const accContent = el['accidental'] as OrderedElement[];
      let accValue = '';
      for (const item of accContent) {
        if (item['#text'] !== undefined) {
          accValue = String(item['#text']);
          break;
        }
      }
      if (isValidAccidental(accValue)) {
        const accInfo: AccidentalInfo = { value: accValue };
        if (accAttrs['cautionary'] === 'yes') accInfo.cautionary = true;
        if (accAttrs['editorial'] === 'yes') accInfo.editorial = true;
        if (accAttrs['parentheses'] === 'yes') accInfo.parentheses = true;
        if (accAttrs['bracket'] === 'yes') accInfo.bracket = true;
        if (accAttrs['relative-x']) accInfo.relativeX = parseFloat(accAttrs['relative-x']);
        if (accAttrs['relative-y']) accInfo.relativeY = parseFloat(accAttrs['relative-y']);
        if (accAttrs['color']) accInfo.color = accAttrs['color'];
        if (accAttrs['size']) accInfo.size = accAttrs['size'];
        if (accAttrs['font-size']) accInfo.fontSize = accAttrs['font-size'];
        note.accidental = accInfo;
      }
      break;
    }
  }

  // Stem
  for (const el of elements) {
    if (el['stem']) {
      const stemAttrs = getAttributes(el);
      const stemContent = el['stem'] as OrderedElement[];
      let stemValue = '';
      for (const item of stemContent) {
        if (item['#text'] !== undefined) {
          stemValue = String(item['#text']);
          break;
        }
      }
      if (stemValue === 'up' || stemValue === 'down' || stemValue === 'none' || stemValue === 'double') {
        note.stem = { value: stemValue };
        if (stemAttrs['default-x']) note.stem.defaultX = parseFloat(stemAttrs['default-x']);
        if (stemAttrs['default-y']) note.stem.defaultY = parseFloat(stemAttrs['default-y']);
      }
      break;
    }
  }

  // Notehead
  for (const el of elements) {
    if (el['notehead']) {
      const nhAttrs = getAttributes(el);
      const nhContent = el['notehead'] as OrderedElement[];
      let nhValue = '';
      for (const item of nhContent) {
        if (item['#text'] !== undefined) {
          nhValue = String(item['#text']);
          break;
        }
      }
      if (isValidNotehead(nhValue)) {
        const nhInfo: NoteheadInfo = { value: nhValue };
        if (nhAttrs['filled'] === 'yes') nhInfo.filled = true;
        else if (nhAttrs['filled'] === 'no') nhInfo.filled = false;
        if (nhAttrs['parentheses'] === 'yes') nhInfo.parentheses = true;
        note.notehead = nhInfo;
      }
      break;
    }
  }

  // Tie (collect all tie elements)
  const tieElements: { type: 'start' | 'stop' | 'continue' }[] = [];
  for (const el of elements) {
    if (el['tie']) {
      const tieAttrs = getAttributes(el);
      const tieType = tieAttrs['type'];
      if (tieType === 'start' || tieType === 'stop' || tieType === 'continue') {
        tieElements.push({ type: tieType });
      }
    }
  }
  if (tieElements.length > 0) {
    note.tie = tieElements[0];
    if (tieElements.length > 1) {
      note.ties = tieElements;
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
      const accidentalMarks: { value: string; placement?: 'above' | 'below' }[] = [];
      for (const orn of ornContent) {
        if (orn['accidental-mark'] !== undefined) {
          const amAttrs = getAttributes(orn);
          const amContent = orn['accidental-mark'] as OrderedElement[];
          for (const item of amContent) {
            if (item['#text'] !== undefined && isValidAccidental(String(item['#text']))) {
              accidentalMarks.push({
                value: String(item['#text']),
                placement: amAttrs['placement'] as 'above' | 'below' | undefined,
              });
              break;
            }
          }
        }
      }

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
          const tremContent = orn['tremolo'] as OrderedElement[];
          let marks: number | undefined;
          for (const item of tremContent) {
            if (item['#text'] !== undefined) {
              marks = parseInt(String(item['#text']), 10);
              break;
            }
          }
          const tremNotation: OrnamentNotation = {
            type: 'ornament',
            ornament: 'tremolo',
            tremoloMarks: marks,
            tremoloType: tremAttrs['type'] as 'start' | 'stop' | 'single' | 'unmeasured' | undefined,
            placement: tremAttrs['placement'] as 'above' | 'below' | undefined,
            notationsIndex,
          };
          if (tremAttrs['default-x']) {
            tremNotation.defaultX = parseFloat(tremAttrs['default-x']);
          }
          if (tremAttrs['default-y']) {
            tremNotation.defaultY = parseFloat(tremAttrs['default-y']);
          }
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
          for (const bc of bendContent) {
            if (bc['pre-bend'] !== undefined) techNotation.preBend = true;
            if (bc['release'] !== undefined) techNotation.release = true;
            if (bc['with-bar']) {
              const wbContent = bc['with-bar'] as OrderedElement[];
              for (const item of wbContent) {
                if (item['#text'] !== undefined) {
                  techNotation.withBar = parseFloat(String(item['#text']));
                  break;
                }
              }
            }
          }
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
            // Get text content for elements that have it
            if (technicalWithText.includes(techType)) {
              const techElContent = tech[techType] as OrderedElement[];
              for (const item of techElContent) {
                if (item['#text'] !== undefined) {
                  notation.text = String(item['#text']);
                  break;
                }
              }
            }
            // Get string/fret for those elements
            if (techType === 'string') {
              const techElContent = tech[techType] as OrderedElement[];
              for (const item of techElContent) {
                if (item['#text'] !== undefined) {
                  notation.string = parseInt(String(item['#text']), 10);
                  break;
                }
              }
            }
            if (techType === 'fret') {
              const techElContent = tech[techType] as OrderedElement[];
              for (const item of techElContent) {
                if (item['#text'] !== undefined) {
                  notation.fret = parseInt(String(item['#text']), 10);
                  break;
                }
              }
            }
            // Handle harmonic children
            if (techType === 'harmonic') {
              const harmContent = tech[techType] as OrderedElement[];
              for (const hc of harmContent) {
                if (hc['natural'] !== undefined) notation.harmonicNatural = true;
                if (hc['artificial'] !== undefined) notation.harmonicArtificial = true;
                if (hc['base-pitch'] !== undefined) notation.basePitch = true;
                if (hc['touching-pitch'] !== undefined) notation.touchingPitch = true;
                if (hc['sounding-pitch'] !== undefined) notation.soundingPitch = true;
              }
            }
            // Handle hammer-on/pull-off type attribute
            if (techType === 'hammer-on' || techType === 'pull-off') {
              const typeAttr = techAttrs['type'];
              if (typeAttr === 'start' || typeAttr === 'stop') {
                notation.startStop = typeAttr;
              }
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
          if (dyn[dv] !== undefined) {
            dynamicsValues.push(dv);
          }
        }
        // Handle other-dynamics
        if (dyn['other-dynamics']) {
          const odContent = dyn['other-dynamics'] as OrderedElement[];
          for (const item of odContent) {
            if (item['#text'] !== undefined) {
              otherDynamics = String(item['#text']);
              break;
            }
          }
        }
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
      const fermataContent = el['fermata'] as OrderedElement[];
      const fermataAttrs = getAttributes(el);
      let shape: string | undefined;
      for (const item of fermataContent) {
        if (item['#text'] !== undefined) {
          shape = String(item['#text']);
          break;
        }
      }
      const fermataNotation: Notation = {
        type: 'fermata',
        shape: shape as any,
        fermataType: fermataAttrs['type'] as 'upright' | 'inverted' | undefined,
        placement: fermataAttrs['placement'] as 'above' | 'below' | undefined,
        notationsIndex,
      };
      if (fermataAttrs['default-x']) {
        (fermataNotation as any).defaultX = parseFloat(fermataAttrs['default-x']);
      }
      if (fermataAttrs['default-y']) {
        (fermataNotation as any).defaultY = parseFloat(fermataAttrs['default-y']);
      }
      notations.push(fermataNotation);
    } else if (el['arpeggiate'] !== undefined) {
      const arpAttrs = getAttributes(el);
      notations.push({
        type: 'arpeggiate',
        direction: arpAttrs['direction'] as 'up' | 'down' | undefined,
        number: arpAttrs['number'] ? parseInt(arpAttrs['number'], 10) : undefined,
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

  if (attrs['directive'] === 'yes') {
    direction.directive = true;
  }

  const staff = getElementText(elements, 'staff');
  if (staff) direction.staff = parseInt(staff, 10);

  const voice = getElementText(elements, 'voice');
  if (voice) direction.voice = parseInt(voice, 10);

  // Parse offset with sound attribute
  for (const el of elements) {
    if (el['offset']) {
      const offsetContent = el['offset'] as OrderedElement[];
      for (const item of offsetContent) {
        if (item['#text'] !== undefined) {
          direction.offset = parseInt(String(item['#text']), 10);
          break;
        }
      }
      const offsetAttrs = getAttributes(el);
      if (offsetAttrs['sound'] === 'yes') {
        direction.offsetSound = true;
      }
      break;
    }
  }

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
      const soundContent = el['sound'] as OrderedElement[];
      direction.sound = {};
      if (soundAttrs['tempo']) direction.sound.tempo = parseFloat(soundAttrs['tempo']);
      if (soundAttrs['dynamics']) direction.sound.dynamics = parseFloat(soundAttrs['dynamics']);

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

function parseDirectionType(elements: OrderedElement[]): DirectionType | null {
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
        for (const dv of dynamicsValues) {
          if (dyn[dv] !== undefined) {
            const result: DirectionType = { kind: 'dynamics', value: dv };
            if (dynAttrs['default-x']) result.defaultX = parseFloat(dynAttrs['default-x']);
            if (dynAttrs['default-y']) result.defaultY = parseFloat(dynAttrs['default-y']);
            if (dynAttrs['relative-x']) result.relativeX = parseFloat(dynAttrs['relative-x']);
            if (dynAttrs['halign']) result.halign = dynAttrs['halign'];
            return result;
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
        if (wedgeAttrs['default-y']) result.defaultY = parseFloat(wedgeAttrs['default-y']);
        if (wedgeAttrs['relative-x']) result.relativeX = parseFloat(wedgeAttrs['relative-x']);
        return result;
      }
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
        return result;
      }
    }

    // Words
    if (el['words']) {
      const wordAttrs = getAttributes(el);
      const wordsContent = el['words'] as OrderedElement[];
      for (const w of wordsContent) {
        if (w['#text'] !== undefined) {
          const result: DirectionType = { kind: 'words', text: String(w['#text']) };
          if (wordAttrs['default-x']) result.defaultX = parseFloat(wordAttrs['default-x']);
          if (wordAttrs['default-y']) result.defaultY = parseFloat(wordAttrs['default-y']);
          if (wordAttrs['relative-x']) result.relativeX = parseFloat(wordAttrs['relative-x']);
          if (wordAttrs['font-family']) result.fontFamily = wordAttrs['font-family'];
          if (wordAttrs['font-size']) result.fontSize = wordAttrs['font-size'];
          if (wordAttrs['font-style']) result.fontStyle = wordAttrs['font-style'];
          if (wordAttrs['font-weight']) result.fontWeight = wordAttrs['font-weight'];
          if (wordAttrs['xml:lang']) result.xmlLang = wordAttrs['xml:lang'];
          if (wordAttrs['justify']) result.justify = wordAttrs['justify'];
          if (wordAttrs['color']) result.color = wordAttrs['color'];
          if (wordAttrs['xml:space']) result.xmlSpace = wordAttrs['xml:space'];
          if (wordAttrs['halign']) result.halign = wordAttrs['halign'];
          return result;
        }
      }
    }

    // Rehearsal
    if (el['rehearsal']) {
      const rehAttrs = getAttributes(el);
      const rehContent = el['rehearsal'] as OrderedElement[];
      for (const r of rehContent) {
        if (r['#text'] !== undefined) {
          const result: DirectionType = { kind: 'rehearsal', text: String(r['#text']) };
          if (rehAttrs['enclosure']) result.enclosure = rehAttrs['enclosure'];
          if (rehAttrs['default-x']) result.defaultX = parseFloat(rehAttrs['default-x']);
          if (rehAttrs['default-y']) result.defaultY = parseFloat(rehAttrs['default-y']);
          if (rehAttrs['font-size']) result.fontSize = rehAttrs['font-size'];
          if (rehAttrs['font-weight']) result.fontWeight = rehAttrs['font-weight'];
          return result;
        }
      }
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
        return result;
      }
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
        return result;
      }
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
      return result;
    }

    // Other direction
    if (el['other-direction']) {
      const otherContent = el['other-direction'] as OrderedElement[];
      for (const o of otherContent) {
        if (o['#text'] !== undefined) {
          return { kind: 'other-direction', text: String(o['#text']) };
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

    // Eyeglasses
    if (el['eyeglasses'] !== undefined) {
      return { kind: 'eyeglasses' };
    }

    // Damp
    if (el['damp'] !== undefined) {
      return { kind: 'damp' };
    }

    // Damp-all
    if (el['damp-all'] !== undefined) {
      return { kind: 'damp-all' };
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
      return { kind: 'scordatura', accords: accords.length > 0 ? accords : undefined };
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
      return { kind: 'harp-pedals', pedalTunings: pedalTunings.length > 0 ? pedalTunings : undefined };
    }

    // Image
    if (el['image'] !== undefined) {
      const imgAttrs = getAttributes(el);
      return {
        kind: 'image',
        source: imgAttrs['source'],
        type: imgAttrs['type'],
      };
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
        return result;
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

      return result;
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
    'double-sharp', 'double-flat', 'sharp-sharp', 'flat-flat',
    'natural-sharp', 'natural-flat',
    'quarter-flat', 'quarter-sharp',
    'three-quarters-flat', 'three-quarters-sharp',
    'sharp-down', 'sharp-up', 'natural-down', 'natural-up',
    'flat-down', 'flat-up', 'double-sharp-down', 'double-sharp-up',
    'flat-flat-down', 'flat-flat-up', 'arrow-down', 'arrow-up',
    'triple-sharp', 'triple-flat', 'slash-quarter-sharp', 'slash-sharp',
    'slash-flat', 'double-slash-flat', 'sharp-1', 'sharp-2', 'sharp-3', 'sharp-5',
    'flat-1', 'flat-2', 'flat-3', 'flat-4', 'sori', 'koron', 'other',
  ];
  return validAccidentals.includes(value);
}

function isValidNotehead(value: string): value is NoteheadValue {
  const validNoteheads = [
    'slash', 'triangle', 'diamond', 'square', 'cross', 'x', 'circle-x',
    'inverted triangle', 'arrow down', 'arrow up', 'circled', 'slashed',
    'back slashed', 'normal', 'cluster', 'circle dot', 'left triangle',
    'rectangle', 'none', 'do', 're', 'mi', 'fa', 'fa up', 'so', 'la', 'ti', 'other',
  ];
  return validNoteheads.includes(value);
}

function isValidBarStyle(value: string): value is NonNullable<Barline['barStyle']> {
  const validStyles = [
    'regular', 'dotted', 'dashed', 'heavy',
    'light-light', 'light-heavy', 'heavy-light', 'heavy-heavy', 'none',
  ];
  return validStyles.includes(value);
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
