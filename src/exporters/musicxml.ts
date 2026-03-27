import type {
  Score,
  ScoreMetadata,
  PartListEntry,
  PartInfo,
  PartGroup,
  Part,
  Measure,
  MeasureAttributes,
  MeasureEntry,
  NoteEntry,
  BackupEntry,
  ForwardEntry,
  DirectionEntry,
  DirectionType,
  Pitch,
  BeamInfo,
  Notation,
  Lyric,
  TimeSignature,
  KeySignature,
  Clef,
  Transpose,
  Barline,
  Print,
  Defaults,
  Credit,
  SystemLayout,
  PageLayout,
  StaffDetails,
  MeasureStyle,
  HarmonyEntry,
  FiguredBassEntry,
  TupletNotation,
  SoundEntry,
  TechnicalNotation,
  OrnamentNotation,
  DisplayText,
  AttributesEntry,
  GroupingEntry,
} from '../types';
import {
  validate,
  ValidationException,
  type ValidateOptions,
  type ValidationResult,
} from '../validator';

export interface SerializeOptions {
  version?: string;
  indent?: string;
  /** Validate score before serializing (default: false) */
  validate?: boolean;
  /** Options for validation (if validate is true) */
  validateOptions?: ValidateOptions;
  /** Throw error if validation fails (default: false, will only warn) */
  throwOnValidationError?: boolean;
  /** Callback to receive validation result */
  onValidation?: (result: ValidationResult) => void;
}

export function serialize(score: Score, options: SerializeOptions = {}): string {
  const version = options.version || score.version || '4.0';
  const indent = options.indent ?? '  ';

  // Validation
  if (options.validate) {
    const result = validate(score, options.validateOptions);

    // Call the callback if provided
    if (options.onValidation) {
      options.onValidation(result);
    }

    if (!result.valid && options.throwOnValidationError) {
      const errorMessages = result.errors
        .map(e => `[${e.code}] ${e.message}`)
        .join('\n');
      throw new ValidationException(result.errors, `Score validation failed:\n${errorMessages}`);
    }
  }

  const lines: string[] = [];

  // XML declaration
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');

  // DOCTYPE
  lines.push(`<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML ${version} Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">`);

  // score-partwise
  lines.push(`<score-partwise version="${version}">`);

  // Metadata
  serializeMetadata(score.metadata, indent, lines);

  // Defaults
  if (score.defaults) {
    serializeDefaults(score.defaults, indent, lines);
  }

  // Credits
  if (score.credits) {
    for (const credit of score.credits) {
      serializeCredit(credit, indent, lines);
    }
  }

  // Part list
  serializePartList(score.partList, indent, lines);

  // Parts
  for (const part of score.parts) {
    serializePart(part, indent, lines);
  }

  lines.push('</score-partwise>');

  return lines.join('\n');
}

function serializeMetadata(metadata: ScoreMetadata, indent: string, out: string[]): void {
  // Work
  if (metadata.workTitle !== undefined || metadata.workNumber !== undefined) {
    out.push(`${indent}<work>`);
    if (metadata.workNumber !== undefined) {
      out.push(`${indent}${indent}<work-number>${escapeXml(metadata.workNumber)}</work-number>`);
    }
    if (metadata.workTitle !== undefined) {
      out.push(`${indent}${indent}<work-title>${escapeXml(metadata.workTitle)}</work-title>`);
    }
    out.push(`${indent}</work>`);
  }

  // Movement
  if (metadata.movementNumber !== undefined) {
    out.push(`${indent}<movement-number>${escapeXml(metadata.movementNumber)}</movement-number>`);
  }
  if (metadata.movementTitle !== undefined) {
    out.push(`${indent}<movement-title>${escapeXml(metadata.movementTitle)}</movement-title>`);
  }

  // Identification
  if (metadata.creators || metadata.rights || metadata.encoding || metadata.source || metadata.miscellaneous) {
    out.push(`${indent}<identification>`);

    if (metadata.creators) {
      for (const creator of metadata.creators) {
        const typeAttr = creator.type ? ` type="${escapeXml(creator.type)}"` : '';
        out.push(`${indent}${indent}<creator${typeAttr}>${escapeXml(creator.value)}</creator>`);
      }
    }

    if (metadata.rights) {
      for (const right of metadata.rights) {
        out.push(`${indent}${indent}<rights>${escapeXml(right)}</rights>`);
      }
    }

    if (metadata.encoding) {
      out.push(`${indent}${indent}<encoding>`);
      if (metadata.encoding.software) {
        for (const sw of metadata.encoding.software) {
          out.push(`${indent}${indent}${indent}<software>${escapeXml(sw)}</software>`);
        }
      }
      if (metadata.encoding.encodingDate) {
        out.push(`${indent}${indent}${indent}<encoding-date>${escapeXml(metadata.encoding.encodingDate)}</encoding-date>`);
      }
      if (metadata.encoding.encoder) {
        for (const enc of metadata.encoding.encoder) {
          out.push(`${indent}${indent}${indent}<encoder>${escapeXml(enc)}</encoder>`);
        }
      }
      if (metadata.encoding.encodingDescription) {
        out.push(`${indent}${indent}${indent}<encoding-description>${escapeXml(metadata.encoding.encodingDescription)}</encoding-description>`);
      }
      if (metadata.encoding.supports) {
        for (const support of metadata.encoding.supports) {
          let attrs = ` element="${escapeXml(support.element)}" type="${support.type}"`;
          if (support.attribute) attrs += ` attribute="${escapeXml(support.attribute)}"`;
          if (support.value) attrs += ` value="${escapeXml(support.value)}"`;
          out.push(`${indent}${indent}${indent}<supports${attrs}/>`);
        }
      }
      out.push(`${indent}${indent}</encoding>`);
    }

    if (metadata.source) {
      out.push(`${indent}${indent}<source>${escapeXml(metadata.source)}</source>`);
    }

    if (metadata.miscellaneous) {
      out.push(`${indent}${indent}<miscellaneous>`);
      for (const field of metadata.miscellaneous) {
        out.push(`${indent}${indent}${indent}<miscellaneous-field name="${escapeXml(field.name)}">${escapeXml(field.value)}</miscellaneous-field>`);
      }
      out.push(`${indent}${indent}</miscellaneous>`);
    }

    out.push(`${indent}</identification>`);
  }
}

function serializeDefaults(defaults: Defaults, indent: string, out: string[]): void {
  out.push(`${indent}<defaults>`);

  if (defaults.scaling) {
    out.push(`${indent}${indent}<scaling>`);
    out.push(`${indent}${indent}${indent}<millimeters>${defaults.scaling.millimeters}</millimeters>`);
    out.push(`${indent}${indent}${indent}<tenths>${defaults.scaling.tenths}</tenths>`);
    out.push(`${indent}${indent}</scaling>`);
  }

  if (defaults.pageLayout) {
    serializePageLayout(defaults.pageLayout, indent + indent, out);
  }

  if (defaults.systemLayout) {
    serializeSystemLayout(defaults.systemLayout, indent + indent, out);
  }

  if (defaults.staffLayout) {
    for (const sl of defaults.staffLayout) {
      const numAttr = sl.number !== undefined ? ` number="${sl.number}"` : '';
      out.push(`${indent}${indent}<staff-layout${numAttr}>`);
      if (sl.staffDistance !== undefined) {
        out.push(`${indent}${indent}${indent}<staff-distance>${sl.staffDistance}</staff-distance>`);
      }
      out.push(`${indent}${indent}</staff-layout>`);
    }
  }

  // Appearance
  if (defaults.appearance) {
    out.push(`${indent}${indent}<appearance>`);
    const app = defaults.appearance;
    if (app['line-widths']) {
      for (const lw of app['line-widths'] as Array<{ type: string; value: number }>) {
        out.push(`${indent}${indent}${indent}<line-width type="${escapeXml(lw.type)}">${lw.value}</line-width>`);
      }
    }
    if (app['note-sizes']) {
      for (const ns of app['note-sizes'] as Array<{ type: string; value: number }>) {
        out.push(`${indent}${indent}${indent}<note-size type="${escapeXml(ns.type)}">${ns.value}</note-size>`);
      }
    }
    if (app['distances']) {
      for (const d of app['distances'] as Array<{ type: string; value: number }>) {
        out.push(`${indent}${indent}${indent}<distance type="${escapeXml(d.type)}">${d.value}</distance>`);
      }
    }
    if (app['glyphs']) {
      for (const g of app['glyphs'] as Array<{ type: string; value: string }>) {
        out.push(`${indent}${indent}${indent}<glyph type="${escapeXml(g.type)}">${escapeXml(g.value)}</glyph>`);
      }
    }
    out.push(`${indent}${indent}</appearance>`);
  }

  // Music font
  if (defaults.musicFont) {
    let attrs = '';
    if (defaults.musicFont.fontFamily) attrs += ` font-family="${escapeXml(defaults.musicFont.fontFamily)}"`;
    if (defaults.musicFont.fontSize) attrs += ` font-size="${escapeXml(defaults.musicFont.fontSize)}"`;
    if (defaults.musicFont.fontStyle) attrs += ` font-style="${escapeXml(defaults.musicFont.fontStyle)}"`;
    if (defaults.musicFont.fontWeight) attrs += ` font-weight="${escapeXml(defaults.musicFont.fontWeight)}"`;
    out.push(`${indent}${indent}<music-font${attrs}/>`);
  }

  // Word font
  if (defaults.wordFont) {
    let attrs = '';
    if (defaults.wordFont.fontFamily) attrs += ` font-family="${escapeXml(defaults.wordFont.fontFamily)}"`;
    if (defaults.wordFont.fontSize) attrs += ` font-size="${escapeXml(defaults.wordFont.fontSize)}"`;
    if (defaults.wordFont.fontStyle) attrs += ` font-style="${escapeXml(defaults.wordFont.fontStyle)}"`;
    if (defaults.wordFont.fontWeight) attrs += ` font-weight="${escapeXml(defaults.wordFont.fontWeight)}"`;
    out.push(`${indent}${indent}<word-font${attrs}/>`);
  }

  // Lyric fonts
  if (defaults.lyricFont) {
    for (const lf of defaults.lyricFont) {
      let attrs = '';
      if (lf.number !== undefined) attrs += ` number="${lf.number}"`;
      if (lf.name) attrs += ` name="${escapeXml(lf.name)}"`;
      if (lf.fontFamily) attrs += ` font-family="${escapeXml(lf.fontFamily)}"`;
      if (lf.fontSize) attrs += ` font-size="${escapeXml(lf.fontSize)}"`;
      if (lf.fontStyle) attrs += ` font-style="${escapeXml(lf.fontStyle)}"`;
      if (lf.fontWeight) attrs += ` font-weight="${escapeXml(lf.fontWeight)}"`;
      out.push(`${indent}${indent}<lyric-font${attrs}/>`);
    }
  }

  // Lyric languages
  if (defaults.lyricLanguage) {
    for (const ll of defaults.lyricLanguage) {
      let attrs = '';
      if (ll.number !== undefined) attrs += ` number="${ll.number}"`;
      if (ll.name) attrs += ` name="${escapeXml(ll.name)}"`;
      attrs += ` xml:lang="${escapeXml(ll.xmlLang)}"`;
      out.push(`${indent}${indent}<lyric-language${attrs}/>`);
    }
  }

  out.push(`${indent}</defaults>`);
}

function serializePageLayout(layout: PageLayout, indent: string, out: string[]): void {
  out.push(`${indent}<page-layout>`);

  if (layout.pageHeight !== undefined) {
    out.push(`${indent}  <page-height>${layout.pageHeight}</page-height>`);
  }
  if (layout.pageWidth !== undefined) {
    out.push(`${indent}  <page-width>${layout.pageWidth}</page-width>`);
  }

  if (layout.pageMargins) {
    for (const m of layout.pageMargins) {
      const typeAttr = m.type ? ` type="${m.type}"` : '';
      out.push(`${indent}  <page-margins${typeAttr}>`);
      if (m.leftMargin !== undefined) {
        out.push(`${indent}    <left-margin>${m.leftMarginRaw ?? m.leftMargin}</left-margin>`);
      }
      if (m.rightMargin !== undefined) {
        out.push(`${indent}    <right-margin>${m.rightMarginRaw ?? m.rightMargin}</right-margin>`);
      }
      if (m.topMargin !== undefined) {
        out.push(`${indent}    <top-margin>${m.topMarginRaw ?? m.topMargin}</top-margin>`);
      }
      if (m.bottomMargin !== undefined) {
        out.push(`${indent}    <bottom-margin>${m.bottomMarginRaw ?? m.bottomMargin}</bottom-margin>`);
      }
      out.push(`${indent}  </page-margins>`);
    }
  }

  out.push(`${indent}</page-layout>`);
}

function serializeSystemLayout(layout: SystemLayout, indent: string, out: string[]): void {
  out.push(`${indent}<system-layout>`);

  if (layout.systemMargins) {
    out.push(`${indent}  <system-margins>`);
    if (layout.systemMargins.leftMargin !== undefined) {
      out.push(`${indent}    <left-margin>${layout.systemMargins.leftMarginRaw ?? layout.systemMargins.leftMargin}</left-margin>`);
    }
    if (layout.systemMargins.rightMargin !== undefined) {
      out.push(`${indent}    <right-margin>${layout.systemMargins.rightMarginRaw ?? layout.systemMargins.rightMargin}</right-margin>`);
    }
    out.push(`${indent}  </system-margins>`);
  }

  if (layout.systemDistance !== undefined) {
    out.push(`${indent}  <system-distance>${layout.systemDistanceRaw ?? layout.systemDistance}</system-distance>`);
  }

  if (layout.topSystemDistance !== undefined) {
    out.push(`${indent}  <top-system-distance>${layout.topSystemDistanceRaw ?? layout.topSystemDistance}</top-system-distance>`);
  }

  if (layout.systemDividers) {
    out.push(`${indent}  <system-dividers>`);
    if (layout.systemDividers.leftDivider) {
      let attrs = '';
      if (layout.systemDividers.leftDivider.printObject !== undefined) {
        attrs += ` print-object="${layout.systemDividers.leftDivider.printObject ? 'yes' : 'no'}"`;
      }
      if (layout.systemDividers.leftDivider.halign) {
        attrs += ` halign="${layout.systemDividers.leftDivider.halign}"`;
      }
      if (layout.systemDividers.leftDivider.valign) {
        attrs += ` valign="${layout.systemDividers.leftDivider.valign}"`;
      }
      out.push(`${indent}    <left-divider${attrs}/>`);
    }
    if (layout.systemDividers.rightDivider) {
      let attrs = '';
      if (layout.systemDividers.rightDivider.printObject !== undefined) {
        attrs += ` print-object="${layout.systemDividers.rightDivider.printObject ? 'yes' : 'no'}"`;
      }
      if (layout.systemDividers.rightDivider.halign) {
        attrs += ` halign="${layout.systemDividers.rightDivider.halign}"`;
      }
      if (layout.systemDividers.rightDivider.valign) {
        attrs += ` valign="${layout.systemDividers.rightDivider.valign}"`;
      }
      out.push(`${indent}    <right-divider${attrs}/>`);
    }
    out.push(`${indent}  </system-dividers>`);
  }

  out.push(`${indent}</system-layout>`);
}

function serializeCredit(credit: Credit, indent: string, out: string[]): void {
  let attrs = '';
  if (credit._id) attrs += ` id="${escapeXml(credit._id)}"`;
  if (credit.page !== undefined) attrs += ` page="${credit.page}"`;
  out.push(`${indent}<credit${attrs}>`);

  if (credit.creditType) {
    for (const ct of credit.creditType) {
      out.push(`${indent}${indent}<credit-type>${escapeXml(ct)}</credit-type>`);
    }
  }

  if (credit.creditWords) {
    for (const cw of credit.creditWords) {
      let attrs = '';
      if (cw.defaultX !== undefined) attrs += ` default-x="${cw.defaultX}"`;
      if (cw.defaultY !== undefined) attrs += ` default-y="${cw.defaultY}"`;
      if (cw.fontFamily) attrs += ` font-family="${escapeXml(cw.fontFamily)}"`;
      if (cw.fontSize) attrs += ` font-size="${escapeXml(cw.fontSize)}"`;
      if (cw.fontWeight) attrs += ` font-weight="${escapeXml(cw.fontWeight)}"`;
      if (cw.fontStyle) attrs += ` font-style="${escapeXml(cw.fontStyle)}"`;
      if (cw.justify) attrs += ` justify="${escapeXml(cw.justify)}"`;
      if (cw.halign) attrs += ` halign="${escapeXml(cw.halign)}"`;
      if (cw.valign) attrs += ` valign="${escapeXml(cw.valign)}"`;
      if (cw.letterSpacing) attrs += ` letter-spacing="${escapeXml(cw.letterSpacing)}"`;
      if (cw.xmlLang) attrs += ` xml:lang="${escapeXml(cw.xmlLang)}"`;
      if (cw.xmlSpace) attrs += ` xml:space="${escapeXml(cw.xmlSpace)}"`;
      out.push(`${indent}${indent}<credit-words${attrs}>${escapeXml(cw.text)}</credit-words>`);
    }
  }

  out.push(`${indent}</credit>`);
}

function serializePartList(partList: PartListEntry[], indent: string, out: string[]): void {
  out.push(`${indent}<part-list>`);

  for (const entry of partList) {
    if (entry.type === 'score-part') {
      serializeScorePart(entry, indent + indent, out);
    } else if (entry.type === 'part-group') {
      serializePartGroup(entry, indent + indent, out);
    }
  }

  out.push(`${indent}</part-list>`);
}

function serializeDisplayTexts(texts: DisplayText[], indent: string, out: string[]): void {
  for (const dt of texts) {
    let attrs = '';
    if (dt.fontFamily) attrs += ` font-family="${escapeXml(dt.fontFamily)}"`;
    if (dt.fontSize) attrs += ` font-size="${escapeXml(dt.fontSize)}"`;
    if (dt.fontStyle) attrs += ` font-style="${escapeXml(dt.fontStyle)}"`;
    if (dt.fontWeight) attrs += ` font-weight="${escapeXml(dt.fontWeight)}"`;
    if (dt.xmlSpace) attrs += ` xml:space="${escapeXml(dt.xmlSpace)}"`;
    out.push(`${indent}<display-text${attrs}>${escapeXml(dt.text)}</display-text>`);
  }
}

function serializeScorePart(part: PartInfo, indent: string, out: string[]): void {
  out.push(`${indent}<score-part id="${escapeXml(part.id)}">`);

  if (part.name !== undefined) {
    let pnAttrs = '';
    if (part.namePrintObject === false) pnAttrs += ' print-object="no"';
    out.push(`${indent}  <part-name${pnAttrs}>${escapeXml(part.name)}</part-name>`);
  }

  if (part.partNameDisplay && part.partNameDisplay.length > 0) {
    out.push(`${indent}  <part-name-display>`);
    serializeDisplayTexts(part.partNameDisplay, indent + '    ', out);
    out.push(`${indent}  </part-name-display>`);
  }

  if (part.abbreviation !== undefined) {
    let paAttrs = '';
    if (part.abbreviationPrintObject === false) paAttrs += ' print-object="no"';
    out.push(`${indent}  <part-abbreviation${paAttrs}>${escapeXml(part.abbreviation)}</part-abbreviation>`);
  }

  if (part.partAbbreviationDisplay && part.partAbbreviationDisplay.length > 0) {
    out.push(`${indent}  <part-abbreviation-display>`);
    serializeDisplayTexts(part.partAbbreviationDisplay, indent + '    ', out);
    out.push(`${indent}  </part-abbreviation-display>`);
  }

  if (part.scoreInstruments) {
    for (const inst of part.scoreInstruments) {
      out.push(`${indent}  <score-instrument id="${escapeXml(inst.id)}">`);
      out.push(`${indent}    <instrument-name>${escapeXml(inst.name)}</instrument-name>`);
      if (inst.abbreviation) {
        out.push(`${indent}    <instrument-abbreviation>${escapeXml(inst.abbreviation)}</instrument-abbreviation>`);
      }
      if (inst.sound) {
        out.push(`${indent}    <instrument-sound>${escapeXml(inst.sound)}</instrument-sound>`);
      }
      if (inst.solo) {
        out.push(`${indent}    <solo/>`);
      }
      if (inst.ensemble !== undefined) {
        // ensemble can be empty (0) or have a number
        if (inst.ensemble === 0) {
          out.push(`${indent}    <ensemble/>`);
        } else {
          out.push(`${indent}    <ensemble>${inst.ensemble}</ensemble>`);
        }
      }
      out.push(`${indent}  </score-instrument>`);
    }
  }

  if (part.groups) {
    for (const group of part.groups) {
      out.push(`${indent}  <group>${escapeXml(group)}</group>`);
    }
  }

  if (part.midiInstruments) {
    for (const midi of part.midiInstruments) {
      out.push(`${indent}  <midi-instrument id="${escapeXml(midi.id)}">`);
      if (midi.channel !== undefined) {
        out.push(`${indent}    <midi-channel>${midi.channel}</midi-channel>`);
      }
      if (midi.name) {
        out.push(`${indent}    <midi-name>${escapeXml(midi.name)}</midi-name>`);
      }
      if (midi.bank !== undefined) {
        out.push(`${indent}    <midi-bank>${midi.bank}</midi-bank>`);
      }
      if (midi.program !== undefined) {
        out.push(`${indent}    <midi-program>${midi.program}</midi-program>`);
      }
      if (midi.unpitched !== undefined) {
        out.push(`${indent}    <midi-unpitched>${midi.unpitched}</midi-unpitched>`);
      }
      if (midi.volume !== undefined) {
        out.push(`${indent}    <volume>${midi.volume}</volume>`);
      }
      if (midi.pan !== undefined) {
        out.push(`${indent}    <pan>${midi.pan}</pan>`);
      }
      if (midi.elevation !== undefined) {
        out.push(`${indent}    <elevation>${midi.elevation}</elevation>`);
      }
      out.push(`${indent}  </midi-instrument>`);
    }
  }

  out.push(`${indent}</score-part>`);
}

function serializePartGroup(group: PartGroup, indent: string, out: string[]): void {
  let attrs = ` type="${group.groupType}"`;
  if (group.number !== undefined) attrs += ` number="${group.number}"`;
  if (group._id) attrs += ` id="${escapeXml(group._id)}"`;
  out.push(`${indent}<part-group${attrs}>`);

  if (group.groupName) {
    out.push(`${indent}  <group-name>${escapeXml(group.groupName)}</group-name>`);
  }

  if (group.groupNameDisplay && group.groupNameDisplay.length > 0) {
    out.push(`${indent}  <group-name-display>`);
    serializeDisplayTexts(group.groupNameDisplay, indent + '    ', out);
    out.push(`${indent}  </group-name-display>`);
  }

  if (group.groupAbbreviation) {
    out.push(`${indent}  <group-abbreviation>${escapeXml(group.groupAbbreviation)}</group-abbreviation>`);
  }

  if (group.groupAbbreviationDisplay && group.groupAbbreviationDisplay.length > 0) {
    out.push(`${indent}  <group-abbreviation-display>`);
    serializeDisplayTexts(group.groupAbbreviationDisplay, indent + '    ', out);
    out.push(`${indent}  </group-abbreviation-display>`);
  }

  if (group.groupSymbol) {
    const defaultXAttr = group.groupSymbolDefaultX !== undefined ? ` default-x="${group.groupSymbolDefaultX}"` : '';
    out.push(`${indent}  <group-symbol${defaultXAttr}>${group.groupSymbol}</group-symbol>`);
  }

  if (group.groupBarline) {
    out.push(`${indent}  <group-barline>${group.groupBarline}</group-barline>`);
  }

  out.push(`${indent}</part-group>`);
}

function serializePart(part: Part, indent: string, out: string[]): void {
  // Only output id attribute if it's present and non-empty
  const idAttr = part.id ? ` id="${escapeXml(part.id)}"` : '';
  out.push(`${indent}<part${idAttr}>`);

  for (const measure of part.measures) {
    serializeMeasure(measure, indent + indent, out);
  }

  out.push(`${indent}</part>`);
}

function serializeMeasure(measure: Measure, indent: string, out: string[]): void {
  let attrs = ` number="${measure.number}"`;
  if (measure._id) attrs += ` id="${escapeXml(measure._id)}"`;
  if (measure.width !== undefined) attrs += ` width="${measure.width}"`;
  if (measure.implicit) attrs += ` implicit="yes"`;
  out.push(`${indent}<measure${attrs}>`);

  // Print
  if (measure.print) {
    serializePrint(measure.print, indent + '  ', out);
  }

  // Attributes
  if (measure.attributes) {
    serializeAttributes(measure.attributes, indent + '  ', out);
  }

  // Entries
  for (const entry of measure.entries) {
    serializeEntry(entry, indent + '  ', out);
  }

  // Barlines
  if (measure.barlines) {
    for (const barline of measure.barlines) {
      serializeBarline(barline, indent + '  ', out);
    }
  }

  out.push(`${indent}</measure>`);
}

function serializePrint(print: Print, indent: string, out: string[]): void {
  let attrs = '';
  if (print.newSystem) attrs += ' new-system="yes"';
  if (print.newPage) attrs += ' new-page="yes"';
  if (print.blankPage !== undefined) attrs += ` blank-page="${print.blankPage}"`;
  if (print.pageNumber) attrs += ` page-number="${escapeXml(print.pageNumber)}"`;

  out.push(`${indent}<print${attrs}>`);

  if (print.pageLayout) {
    serializePageLayout(print.pageLayout, indent + '  ', out);
  }

  if (print.systemLayout) {
    serializeSystemLayout(print.systemLayout, indent + '  ', out);
  }

  if (print.staffLayouts) {
    for (const sl of print.staffLayouts) {
      const numAttr = sl.number !== undefined ? ` number="${sl.number}"` : '';
      out.push(`${indent}  <staff-layout${numAttr}>`);
      if (sl.staffDistance !== undefined) {
        out.push(`${indent}    <staff-distance>${sl.staffDistance}</staff-distance>`);
      }
      out.push(`${indent}  </staff-layout>`);
    }
  }

  if (print.measureLayout) {
    out.push(`${indent}  <measure-layout>`);
    if (print.measureLayout.measureDistance !== undefined) {
      out.push(`${indent}    <measure-distance>${print.measureLayout.measureDistance}</measure-distance>`);
    }
    out.push(`${indent}  </measure-layout>`);
  }

  if (print.measureNumbering) {
    const mn = print.measureNumbering;
    // Support both string and MeasureNumbering object
    if (typeof mn === 'string') {
      out.push(`${indent}  <measure-numbering>${escapeXml(mn)}</measure-numbering>`);
    } else {
      let mnAttrs = '';
      if (mn.system) mnAttrs += ` system="${mn.system}"`;
      out.push(`${indent}  <measure-numbering${mnAttrs}>${escapeXml(mn.value)}</measure-numbering>`);
    }
  }

  if (print.partNameDisplay && print.partNameDisplay.length > 0) {
    out.push(`${indent}  <part-name-display>`);
    serializeDisplayTexts(print.partNameDisplay, indent + '    ', out);
    out.push(`${indent}  </part-name-display>`);
  }

  if (print.partAbbreviationDisplay && print.partAbbreviationDisplay.length > 0) {
    out.push(`${indent}  <part-abbreviation-display>`);
    serializeDisplayTexts(print.partAbbreviationDisplay, indent + '    ', out);
    out.push(`${indent}  </part-abbreviation-display>`);
  }

  out.push(`${indent}</print>`);
}

function serializeAttributes(attrs: MeasureAttributes, indent: string, out: string[], id?: string): void {
  const idAttr = id ? ` id="${escapeXml(id)}"` : '';
  out.push(`${indent}<attributes${idAttr}>`);

  if (attrs.divisions !== undefined) {
    out.push(`${indent}  <divisions>${attrs.divisions}</divisions>`);
  }

  // Multiple key signatures (for multi-staff)
  if (attrs.keys && attrs.keys.length > 0) {
    for (const key of attrs.keys) {
      serializeKey(key, indent + '  ', out);
    }
  } else if (attrs.key) {
    serializeKey(attrs.key, indent + '  ', out);
  }

  if (attrs.time) {
    serializeTime(attrs.time, indent + '  ', out);
  }

  if (attrs.staves !== undefined) {
    out.push(`${indent}  <staves>${attrs.staves}</staves>`);
  }

  if (attrs.instruments !== undefined) {
    out.push(`${indent}  <instruments>${attrs.instruments}</instruments>`);
  }

  if (attrs.clef) {
    for (const clef of attrs.clef) {
      serializeClef(clef, indent + '  ', out);
    }
  }

  if (attrs.transpose) {
    serializeTranspose(attrs.transpose, indent + '  ', out);
  }

  if (attrs.staffDetails) {
    for (const sd of attrs.staffDetails) {
      serializeStaffDetails(sd, indent + '  ', out);
    }
  }

  if (attrs.measureStyle) {
    for (const ms of attrs.measureStyle) {
      serializeMeasureStyle(ms, indent + '  ', out);
    }
  }

  out.push(`${indent}</attributes>`);
}

function serializeKey(key: KeySignature, indent: string, out: string[]): void {
  let keyAttrs = '';
  if (key.number !== undefined) keyAttrs += ` number="${key.number}"`;
  if (key.printObject === false) keyAttrs += ' print-object="no"';
  else if (key.printObject === true) keyAttrs += ' print-object="yes"';
  out.push(`${indent}<key${keyAttrs}>`);

  // Cancel (for key changes)
  if (key.cancel !== undefined) {
    const locationAttr = key.cancelLocation ? ` location="${key.cancelLocation}"` : '';
    out.push(`${indent}  <cancel${locationAttr}>${key.cancel}</cancel>`);
  }

  // Non-traditional key signatures
  if (key.keySteps && key.keyAlters && key.keySteps.length > 0) {
    for (let i = 0; i < key.keySteps.length; i++) {
      out.push(`${indent}  <key-step>${key.keySteps[i]}</key-step>`);
      if (i < key.keyAlters.length) {
        out.push(`${indent}  <key-alter>${key.keyAlters[i]}</key-alter>`);
      }
    }
    if (key.keyOctaves) {
      for (const ko of key.keyOctaves) {
        let koAttrs = ` number="${ko.number}"`;
        if (ko.cancel !== undefined) koAttrs += ` cancel="${ko.cancel ? 'yes' : 'no'}"`;
        out.push(`${indent}  <key-octave${koAttrs}>${ko.octave}</key-octave>`);
      }
    }
  } else {
    out.push(`${indent}  <fifths>${key.fifths}</fifths>`);
    if (key.mode) {
      out.push(`${indent}  <mode>${key.mode}</mode>`);
    }
    // key-octave can also appear with traditional fifths-based keys
    if (key.keyOctaves) {
      for (const ko of key.keyOctaves) {
        let koAttrs = ` number="${ko.number}"`;
        if (ko.cancel !== undefined) koAttrs += ` cancel="${ko.cancel ? 'yes' : 'no'}"`;
        out.push(`${indent}  <key-octave${koAttrs}>${ko.octave}</key-octave>`);
      }
    }
  }

  out.push(`${indent}</key>`);
}

function serializeTime(time: TimeSignature, indent: string, out: string[]): void {
  let attrs = '';
  if (time.symbol) attrs += ` symbol="${time.symbol}"`;
  if (time.printObject === false) attrs += ' print-object="no"';
  out.push(`${indent}<time${attrs}>`);

  // Senza misura
  if (time.senzaMisura) {
    out.push(`${indent}  <senza-misura/>`);
  }
  // Compound time signatures
  else if (time.beatsList && time.beatTypeList && time.beatsList.length > 1) {
    const maxLen = Math.max(time.beatsList.length, time.beatTypeList.length);
    for (let i = 0; i < maxLen; i++) {
      if (i < time.beatsList.length) {
        // Use beatsStrList for original string values if available, otherwise use beatsList
        const beatsValue = time.beatsStrList && i < time.beatsStrList.length
          ? time.beatsStrList[i]
          : time.beatsList[i];
        out.push(`${indent}  <beats>${beatsValue}</beats>`);
      }
      if (i < time.beatTypeList.length) {
        out.push(`${indent}  <beat-type>${time.beatTypeList[i]}</beat-type>`);
      }
    }
  } else {
    out.push(`${indent}  <beats>${time.beats}</beats>`);
    out.push(`${indent}  <beat-type>${time.beatType}</beat-type>`);
  }

  out.push(`${indent}</time>`);
}

function serializeClef(clef: Clef, indent: string, out: string[]): void {
  let attrs = clef.staff ? ` number="${clef.staff}"` : '';
  if (clef.printObject === false) attrs += ' print-object="no"';
  else if (clef.printObject === true) attrs += ' print-object="yes"';
  if (clef.afterBarline) attrs += ' after-barline="yes"';
  out.push(`${indent}<clef${attrs}>`);
  out.push(`${indent}  <sign>${clef.sign}</sign>`);
  // Only output line if defined (percussion clefs may not have it)
  if (clef.line !== undefined) {
    out.push(`${indent}  <line>${clef.line}</line>`);
  }
  if (clef.clefOctaveChange !== undefined) {
    out.push(`${indent}  <clef-octave-change>${clef.clefOctaveChange}</clef-octave-change>`);
  }
  out.push(`${indent}</clef>`);
}

function serializeTranspose(transpose: Transpose, indent: string, out: string[]): void {
  out.push(`${indent}<transpose>`);
  out.push(`${indent}  <diatonic>${transpose.diatonic}</diatonic>`);
  out.push(`${indent}  <chromatic>${transpose.chromatic}</chromatic>`);
  if (transpose.octaveChange !== undefined) {
    out.push(`${indent}  <octave-change>${transpose.octaveChange}</octave-change>`);
  }
  out.push(`${indent}</transpose>`);
}

function serializeEntry(entry: MeasureEntry, indent: string, out: string[]): void {
  switch (entry.type) {
    case 'note':
      serializeNote(entry, indent, out);
      break;
    case 'backup':
      serializeBackup(entry, indent, out);
      break;
    case 'forward':
      serializeForward(entry, indent, out);
      break;
    case 'direction':
      serializeDirection(entry, indent, out);
      break;
    case 'harmony':
      serializeHarmony(entry, indent, out);
      break;
    case 'figured-bass':
      serializeFiguredBass(entry, indent, out);
      break;
    case 'sound':
      serializeSound(entry, indent, out);
      break;
    case 'attributes':
      serializeAttributes((entry as AttributesEntry).attributes, indent, out, (entry as AttributesEntry)._id);
      break;
    case 'grouping': {
      const grp = entry as GroupingEntry;
      let grpAttrs = ` type="${grp.groupingType}"`;
      if (grp.number) grpAttrs += ` number="${grp.number}"`;
      out.push(`${indent}<grouping${grpAttrs}/>`);
      break;
    }
    default:
      break;
  }
}

function serializeNote(note: NoteEntry, indent: string, out: string[]): void {
  // Build note attributes
  const noteAttrs = buildAttrs({
    'id': note._id,
    'default-x': note.defaultX,
    'default-y': note.defaultY,
    'relative-x': note.relativeX,
    'relative-y': note.relativeY,
    'dynamics': note.dynamics,
    'print-object': note.printObject === false ? false : undefined,
    'print-dot': note.printDot !== undefined ? note.printDot : undefined,
    'print-spacing': note.printSpacing,
  });
  out.push(`${indent}<note${noteAttrs}>`);

  // Grace note
  if (note.grace) {
    const graceAttrs = buildAttrs({
      'slash': note.grace.slash !== undefined ? note.grace.slash : undefined,
      'steal-time-previous': note.grace.stealTimePrevious,
      'steal-time-following': note.grace.stealTimeFollowing,
    });
    out.push(`${indent}  <grace${graceAttrs}/>`);
  }

  // Cue note
  if (note.cue) {
    out.push(`${indent}  <cue/>`);
  }

  // Chord
  if (note.chord) {
    out.push(`${indent}  <chord/>`);
  }

  // Pitch, rest, or unpitched
  if (note.pitch) {
    serializePitch(note.pitch, indent + '  ', out);
  } else if (note.rest) {
    let restAttrs = '';
    if (note.rest.measure) restAttrs += ' measure="yes"';
    if (note.rest.displayStep || note.rest.displayOctave !== undefined) {
      out.push(`${indent}  <rest${restAttrs}>`);
      if (note.rest.displayStep) {
        out.push(`${indent}    <display-step>${note.rest.displayStep}</display-step>`);
      }
      if (note.rest.displayOctave !== undefined) {
        out.push(`${indent}    <display-octave>${note.rest.displayOctave}</display-octave>`);
      }
      out.push(`${indent}  </rest>`);
    } else {
      out.push(`${indent}  <rest${restAttrs}/>`);
    }
  } else if (note.unpitched) {
    if (note.unpitched.displayStep || note.unpitched.displayOctave !== undefined) {
      out.push(`${indent}  <unpitched>`);
      if (note.unpitched.displayStep) {
        out.push(`${indent}    <display-step>${note.unpitched.displayStep}</display-step>`);
      }
      if (note.unpitched.displayOctave !== undefined) {
        out.push(`${indent}    <display-octave>${note.unpitched.displayOctave}</display-octave>`);
      }
      out.push(`${indent}  </unpitched>`);
    } else {
      out.push(`${indent}  <unpitched/>`);
    }
  } else {
    out.push(`${indent}  <rest/>`);
  }

  // Duration (not for grace notes)
  if (!note.grace) {
    out.push(`${indent}  <duration>${note.duration}</duration>`);
  }

  // Tie
  if (note.ties && note.ties.length > 0) {
    for (const tie of note.ties) {
      out.push(`${indent}  <tie type="${tie.type}"/>`);
    }
  } else if (note.tie) {
    out.push(`${indent}  <tie type="${note.tie.type}"/>`);
  }

  // Voice - only output if defined
  if (note.voice !== undefined) {
    out.push(`${indent}  <voice>${note.voice}</voice>`);
  }

  // Type
  if (note.noteType) {
    const typeAttrs = note.noteTypeSize ? ` size="${escapeXml(note.noteTypeSize)}"` : '';
    out.push(`${indent}  <type${typeAttrs}>${note.noteType}</type>`);
  }

  // Dots
  if (note.dots) {
    for (let i = 0; i < note.dots; i++) {
      out.push(`${indent}  <dot/>`);
    }
  }

  // Accidental
  if (note.accidental) {
    const accAttrs = buildAttrs({
      'cautionary': note.accidental.cautionary || undefined,
      'editorial': note.accidental.editorial || undefined,
      'parentheses': note.accidental.parentheses || undefined,
      'bracket': note.accidental.bracket || undefined,
      'relative-x': note.accidental.relativeX,
      'relative-y': note.accidental.relativeY,
      'color': note.accidental.color,
      'size': note.accidental.size,
      'font-size': note.accidental.fontSize,
    });
    out.push(`${indent}  <accidental${accAttrs}>${note.accidental.value}</accidental>`);
  }

  // Time modification
  if (note.timeModification) {
    out.push(`${indent}  <time-modification>`);
    out.push(`${indent}    <actual-notes>${note.timeModification.actualNotes}</actual-notes>`);
    out.push(`${indent}    <normal-notes>${note.timeModification.normalNotes}</normal-notes>`);
    if (note.timeModification.normalType) {
      out.push(`${indent}    <normal-type>${note.timeModification.normalType}</normal-type>`);
    }
    if (note.timeModification.normalDots) {
      for (let i = 0; i < note.timeModification.normalDots; i++) {
        out.push(`${indent}    <normal-dot/>`);
      }
    }
    out.push(`${indent}  </time-modification>`);
  }

  // Stem
  if (note.stem) {
    const stemAttrs = buildAttrs({
      'default-x': note.stem.defaultX,
      'default-y': note.stem.defaultY,
    });
    out.push(`${indent}  <stem${stemAttrs}>${note.stem.value}</stem>`);
  }

  // Notehead
  if (note.notehead) {
    const nhAttrs = buildAttrs({
      'filled': note.notehead.filled,
      'parentheses': note.notehead.parentheses || undefined,
    });
    out.push(`${indent}  <notehead${nhAttrs}>${note.notehead.value}</notehead>`);
  }

  // Staff
  if (note.staff !== undefined) {
    out.push(`${indent}  <staff>${note.staff}</staff>`);
  }

  // Instrument reference
  if (note.instrument) {
    out.push(`${indent}  <instrument id="${escapeXml(note.instrument)}"/>`);
  }

  // Beam
  if (note.beam) {
    for (const beam of note.beam) {
      serializeBeam(beam, indent + '  ', out);
    }
  }

  // Notations
  if (note.notations && note.notations.length > 0) {
    serializeNotations(note.notations, indent + '  ', out);
  }

  // Lyrics
  if (note.lyrics) {
    for (const lyric of note.lyrics) {
      serializeLyric(lyric, indent + '  ', out);
    }
  }

  out.push(`${indent}</note>`);
}

function serializePitch(pitch: Pitch, indent: string, out: string[]): void {
  out.push(`${indent}<pitch>`);
  out.push(`${indent}  <step>${pitch.step}</step>`);
  if (pitch.alter !== undefined && pitch.alter !== 0) {
    out.push(`${indent}  <alter>${pitch.alter}</alter>`);
  }
  out.push(`${indent}  <octave>${pitch.octave}</octave>`);
  out.push(`${indent}</pitch>`);
}

function serializeBeam(beam: BeamInfo, indent: string, out: string[]): void {
  out.push(`${indent}<beam number="${beam.number}">${beam.type}</beam>`);
}

function serializeNotations(notations: Notation[], indent: string, out: string[]): void {
  // Group notations by notationsIndex for separate <notations> elements
  const notationsGroups = new Map<number, Notation[]>();
  for (const notation of notations) {
    const idx = notation.notationsIndex ?? 0;
    if (!notationsGroups.has(idx)) {
      notationsGroups.set(idx, []);
    }
    notationsGroups.get(idx)!.push(notation);
  }

  // Sort by notationsIndex and serialize each group
  const sortedIndices = Array.from(notationsGroups.keys()).sort((a, b) => a - b);

  for (const notationsIdx of sortedIndices) {
    const groupNotations = notationsGroups.get(notationsIdx)!;
    serializeNotationsGroup(groupNotations, indent, out);
  }
}

function serializeNotationsGroup(notations: Notation[], indent: string, out: string[]): void {
  out.push(`${indent}<notations>`);

  // Build ordered chunks that preserve original element interleaving.
  // Container types (articulation, ornament, technical) are grouped with consecutive
  // siblings of the same type, while standalone types (slur, tied, etc.) are emitted individually.
  type Chunk =
    | { kind: 'standalone'; notation: Notation }
    | { kind: 'articulations'; items: Notation[]; articulationsIndex: number }
    | { kind: 'ornaments'; items: Notation[] }
    | { kind: 'technical'; items: Notation[] };

  const chunks: Chunk[] = [];
  for (const notation of notations) {
    if (notation.type === 'articulation') {
      const artIdx = (notation as any).articulationsIndex ?? 0;
      const last = chunks[chunks.length - 1];
      if (last && last.kind === 'articulations' && last.articulationsIndex === artIdx) {
        last.items.push(notation);
      } else {
        chunks.push({ kind: 'articulations', items: [notation], articulationsIndex: artIdx });
      }
    } else if (notation.type === 'ornament') {
      const last = chunks[chunks.length - 1];
      if (last && last.kind === 'ornaments') {
        last.items.push(notation);
      } else {
        chunks.push({ kind: 'ornaments', items: [notation] });
      }
    } else if (notation.type === 'technical') {
      const last = chunks[chunks.length - 1];
      if (last && last.kind === 'technical') {
        last.items.push(notation);
      } else {
        chunks.push({ kind: 'technical', items: [notation] });
      }
    } else {
      chunks.push({ kind: 'standalone', notation });
    }
  }

  // Serialize chunks in order
  for (const chunk of chunks) {
    if (chunk.kind === 'standalone') {
      serializeStandaloneNotation(chunk.notation, indent, out);
    } else if (chunk.kind === 'articulations') {
      serializeArticulationsGroup(chunk.items, indent, out);
    } else if (chunk.kind === 'ornaments') {
      serializeOrnamentsGroup(chunk.items, indent, out);
    } else if (chunk.kind === 'technical') {
      serializeTechnicalGroup(chunk.items, indent, out);
    }
  }

  out.push(`${indent}</notations>`);
}

function serializeStandaloneNotation(notation: Notation, indent: string, out: string[]): void {
  if (notation.type === 'tied') {
    let attrs = ` type="${notation.tiedType}"`;
    if (notation.number !== undefined) attrs += ` number="${notation.number}"`;
    if (notation.orientation) attrs += ` orientation="${notation.orientation}"`;
    out.push(`${indent}  <tied${attrs}/>`);
  } else if (notation.type === 'slur') {
    let attrs = '';
    if (notation.number !== undefined) attrs += ` number="${notation.number}"`;
    attrs += ` type="${notation.slurType}"`;
    if (notation.lineType) attrs += ` line-type="${notation.lineType}"`;
    if (notation.orientation) attrs += ` orientation="${notation.orientation}"`;
    if (notation.defaultX !== undefined) attrs += ` default-x="${notation.defaultX}"`;
    if (notation.defaultY !== undefined) attrs += ` default-y="${notation.defaultY}"`;
    if (notation.bezierX !== undefined) attrs += ` bezier-x="${notation.bezierX}"`;
    if (notation.bezierY !== undefined) attrs += ` bezier-y="${notation.bezierY}"`;
    if (notation.bezierX2 !== undefined) attrs += ` bezier-x2="${notation.bezierX2}"`;
    if (notation.bezierY2 !== undefined) attrs += ` bezier-y2="${notation.bezierY2}"`;
    if (notation.placement) attrs += ` placement="${notation.placement}"`;
    out.push(`${indent}  <slur${attrs}/>`);
  } else if (notation.type === 'tuplet') {
    let attrs = ` type="${notation.tupletType}"`;
    if (notation.number !== undefined) attrs += ` number="${notation.number}"`;
    if (notation.bracket !== undefined) attrs += ` bracket="${notation.bracket ? 'yes' : 'no'}"`;
    if (notation.showNumber) attrs += ` show-number="${notation.showNumber}"`;
    if (notation.showType) attrs += ` show-type="${notation.showType}"`;
    if (notation.lineShape) attrs += ` line-shape="${notation.lineShape}"`;
    if (notation.placement) attrs += ` placement="${notation.placement}"`;

    const tup = notation as TupletNotation;
    if (tup.tupletActual || tup.tupletNormal) {
      out.push(`${indent}  <tuplet${attrs}>`);
      if (tup.tupletActual) {
        out.push(`${indent}    <tuplet-actual>`);
        if (tup.tupletActual.tupletNumber !== undefined) {
          out.push(`${indent}      <tuplet-number>${tup.tupletActual.tupletNumber}</tuplet-number>`);
        }
        if (tup.tupletActual.tupletType) {
          out.push(`${indent}      <tuplet-type>${tup.tupletActual.tupletType}</tuplet-type>`);
        }
        if (tup.tupletActual.tupletDots) {
          for (let i = 0; i < tup.tupletActual.tupletDots; i++) {
            out.push(`${indent}      <tuplet-dot/>`);
          }
        }
        out.push(`${indent}    </tuplet-actual>`);
      }
      if (tup.tupletNormal) {
        out.push(`${indent}    <tuplet-normal>`);
        if (tup.tupletNormal.tupletNumber !== undefined) {
          out.push(`${indent}      <tuplet-number>${tup.tupletNormal.tupletNumber}</tuplet-number>`);
        }
        if (tup.tupletNormal.tupletType) {
          out.push(`${indent}      <tuplet-type>${tup.tupletNormal.tupletType}</tuplet-type>`);
        }
        if (tup.tupletNormal.tupletDots) {
          for (let i = 0; i < tup.tupletNormal.tupletDots; i++) {
            out.push(`${indent}      <tuplet-dot/>`);
          }
        }
        out.push(`${indent}    </tuplet-normal>`);
      }
      out.push(`${indent}  </tuplet>`);
    } else {
      out.push(`${indent}  <tuplet${attrs}/>`);
    }
  } else if (notation.type === 'dynamics') {
    const placementAttr = notation.placement ? ` placement="${notation.placement}"` : '';
    out.push(`${indent}  <dynamics${placementAttr}>`);
    for (const dyn of notation.dynamics) {
      out.push(`${indent}    <${dyn}/>`);
    }
    if (notation.otherDynamics) {
      out.push(`${indent}    <other-dynamics>${escapeXml(notation.otherDynamics)}</other-dynamics>`);
    }
    out.push(`${indent}  </dynamics>`);
  } else if (notation.type === 'fermata') {
    let attrs = '';
    if (notation.fermataType) attrs += ` type="${notation.fermataType}"`;
    if (notation.placement) attrs += ` placement="${notation.placement}"`;
    if (notation.defaultX !== undefined) attrs += ` default-x="${notation.defaultX}"`;
    if (notation.defaultY !== undefined) attrs += ` default-y="${notation.defaultY}"`;
    if (notation.shape) {
      out.push(`${indent}  <fermata${attrs}>${notation.shape}</fermata>`);
    } else {
      out.push(`${indent}  <fermata${attrs}/>`);
    }
  } else if (notation.type === 'arpeggiate') {
    let attrs = '';
    if (notation.direction) attrs += ` direction="${notation.direction}"`;
    if (notation.number !== undefined) attrs += ` number="${notation.number}"`;
    if (notation.defaultX !== undefined) attrs += ` default-x="${notation.defaultX}"`;
    if (notation.defaultY !== undefined) attrs += ` default-y="${notation.defaultY}"`;
    out.push(`${indent}  <arpeggiate${attrs}/>`);
  } else if (notation.type === 'non-arpeggiate') {
    let attrs = ` type="${notation.nonArpeggiateType}"`;
    if (notation.number !== undefined) attrs += ` number="${notation.number}"`;
    if (notation.placement) attrs += ` placement="${notation.placement}"`;
    out.push(`${indent}  <non-arpeggiate${attrs}/>`);
  } else if (notation.type === 'accidental-mark') {
    let attrs = '';
    if (notation.placement) attrs += ` placement="${notation.placement}"`;
    out.push(`${indent}  <accidental-mark${attrs}>${escapeXml(notation.value)}</accidental-mark>`);
  } else if (notation.type === 'glissando') {
    let attrs = ` type="${notation.glissandoType}"`;
    if (notation.number !== undefined) attrs += ` number="${notation.number}"`;
    if (notation.lineType) attrs += ` line-type="${notation.lineType}"`;
    if (notation.text) {
      out.push(`${indent}  <glissando${attrs}>${escapeXml(notation.text)}</glissando>`);
    } else {
      out.push(`${indent}  <glissando${attrs}/>`);
    }
  } else if (notation.type === 'slide') {
    let attrs = ` type="${notation.slideType}"`;
    if (notation.number !== undefined) attrs += ` number="${notation.number}"`;
    if (notation.lineType) attrs += ` line-type="${notation.lineType}"`;
    if (notation.text) {
      out.push(`${indent}  <slide${attrs}>${escapeXml(notation.text)}</slide>`);
    } else {
      out.push(`${indent}  <slide${attrs}/>`);
    }
  }
}

function serializeArticulationsGroup(artGroup: Notation[], indent: string, out: string[]): void {
  out.push(`${indent}  <articulations>`);
  for (const art of artGroup) {
    if (art.type === 'articulation') {
      let artAttrs = art.placement ? ` placement="${art.placement}"` : '';
      // Handle strong-accent type attribute
      if (art.articulation === 'strong-accent' && art.strongAccentType) {
        artAttrs += ` type="${art.strongAccentType}"`;
      }
      // Handle positioning attributes
      if (art.defaultX !== undefined) artAttrs += ` default-x="${art.defaultX}"`;
      if (art.defaultY !== undefined) artAttrs += ` default-y="${art.defaultY}"`;
      out.push(`${indent}    <${art.articulation}${artAttrs}/>`);
    }
  }
  out.push(`${indent}  </articulations>`);
}

function serializeOrnamentsGroup(ornaments: Notation[], indent: string, out: string[]): void {
  // Check if this is just an empty ornaments marker
  const hasOnlyEmptyMarker = ornaments.length === 1 && ornaments[0].type === 'ornament' && (ornaments[0] as OrnamentNotation).ornament === 'empty';
  if (hasOnlyEmptyMarker) {
    out.push(`${indent}  <ornaments/>`);
  } else {
    out.push(`${indent}  <ornaments>`);
    // Collect all accidental-marks from ornaments for serialization after ornaments
    const allAccidentalMarks: { value: string; placement?: 'above' | 'below' }[] = [];
    for (const orn of ornaments) {
      if (orn.type === 'ornament') {
        // Skip empty markers when outputting with other ornaments
        if ((orn as OrnamentNotation).ornament === 'empty') continue;
        const placementAttr = orn.placement ? ` placement="${orn.placement}"` : '';
        if (orn.ornament === 'wavy-line') {
        let wlAttrs = '';
        if (orn.wavyLineType) wlAttrs += ` type="${orn.wavyLineType}"`;
        if (orn.number !== undefined) wlAttrs += ` number="${orn.number}"`;
        wlAttrs += placementAttr;
        if (orn.defaultY !== undefined) wlAttrs += ` default-y="${orn.defaultY}"`;
        out.push(`${indent}    <wavy-line${wlAttrs}/>`);
      } else if (orn.ornament === 'tremolo') {
        let tremAttrs = '';
        if (orn.tremoloType) tremAttrs += ` type="${orn.tremoloType}"`;
        tremAttrs += placementAttr;
        if (orn.defaultX !== undefined) tremAttrs += ` default-x="${orn.defaultX}"`;
        if (orn.defaultY !== undefined) tremAttrs += ` default-y="${orn.defaultY}"`;
        if (orn.tremoloMarks !== undefined) {
          out.push(`${indent}    <tremolo${tremAttrs}>${orn.tremoloMarks}</tremolo>`);
        } else {
          out.push(`${indent}    <tremolo${tremAttrs}/>`);
        }
      } else {
        let ornAttrs = placementAttr;
        if (orn.defaultY !== undefined) ornAttrs += ` default-y="${orn.defaultY}"`;
        out.push(`${indent}    <${orn.ornament}${ornAttrs}/>`);
      }
      // Collect accidental marks
      if (orn.accidentalMarks) {
        allAccidentalMarks.push(...orn.accidentalMarks);
      }
      }
    }
    // Serialize accidental-marks after other ornaments
    for (const am of allAccidentalMarks) {
      const amPlacement = am.placement ? ` placement="${am.placement}"` : '';
      out.push(`${indent}    <accidental-mark${amPlacement}>${am.value}</accidental-mark>`);
    }
    out.push(`${indent}  </ornaments>`);
  }
}

function serializeTechnicalGroup(technicals: Notation[], indent: string, out: string[]): void {
  out.push(`${indent}  <technical>`);
  for (const tech of technicals) {
    if (tech.type === 'technical') {
      let placementAttr = tech.placement ? ` placement="${tech.placement}"` : '';
      const techNotation = tech as TechnicalNotation;
      if (techNotation.defaultX !== undefined) placementAttr += ` default-x="${techNotation.defaultX}"`;
      if (techNotation.defaultY !== undefined) placementAttr += ` default-y="${techNotation.defaultY}"`;
      if (tech.technical === 'bend' && (techNotation.bendAlter !== undefined || techNotation.preBend || techNotation.release)) {
        out.push(`${indent}    <bend${placementAttr}>`);
        if (techNotation.bendAlter !== undefined) {
          out.push(`${indent}      <bend-alter>${techNotation.bendAlter}</bend-alter>`);
        }
        if (techNotation.preBend) {
          out.push(`${indent}      <pre-bend/>`);
        }
        if (techNotation.release) {
          out.push(`${indent}      <release/>`);
        }
        if (techNotation.withBar) {
          out.push(`${indent}      <with-bar/>`);
        }
        out.push(`${indent}    </bend>`);
      } else if (tech.technical === 'harmonic') {
        // harmonic with optional children
        const hasChildren = techNotation.harmonicNatural || techNotation.harmonicArtificial ||
                            techNotation.basePitch || techNotation.touchingPitch || techNotation.soundingPitch;
        if (hasChildren) {
          out.push(`${indent}    <harmonic${placementAttr}>`);
          if (techNotation.harmonicNatural) out.push(`${indent}      <natural/>`);
          if (techNotation.harmonicArtificial) out.push(`${indent}      <artificial/>`);
          if (techNotation.basePitch) out.push(`${indent}      <base-pitch/>`);
          if (techNotation.touchingPitch) out.push(`${indent}      <touching-pitch/>`);
          if (techNotation.soundingPitch) out.push(`${indent}      <sounding-pitch/>`);
          out.push(`${indent}    </harmonic>`);
        } else {
          out.push(`${indent}    <harmonic${placementAttr}/>`);
        }
      } else if (tech.technical === 'hammer-on' || tech.technical === 'pull-off') {
        let attrs = '';
        if (techNotation.number !== undefined) attrs += ` number="${techNotation.number}"`;
        if (techNotation.startStop) attrs += ` type="${techNotation.startStop}"`;
        attrs += placementAttr;
        if (techNotation.text !== undefined) {
          out.push(`${indent}    <${tech.technical}${attrs}>${escapeXml(techNotation.text)}</${tech.technical}>`);
        } else {
          out.push(`${indent}    <${tech.technical}${attrs}/>`);
        }
      } else if (tech.technical === 'string' && techNotation.string !== undefined) {
        out.push(`${indent}    <string${placementAttr}>${techNotation.string}</string>`);
      } else if (tech.technical === 'fret' && techNotation.fret !== undefined) {
        out.push(`${indent}    <fret${placementAttr}>${techNotation.fret}</fret>`);
      } else if (tech.technical === 'fingering') {
        let fAttrs = placementAttr;
        if (techNotation.fingeringSubstitution) fAttrs += ' substitution="yes"';
        if (techNotation.fingeringAlternate) fAttrs += ' alternate="yes"';
        if (techNotation.text !== undefined) {
          out.push(`${indent}    <fingering${fAttrs}>${escapeXml(techNotation.text)}</fingering>`);
        } else {
          out.push(`${indent}    <fingering${fAttrs}/>`);
        }
      } else if (tech.technical === 'heel' || tech.technical === 'toe') {
        let htAttrs = placementAttr;
        if (techNotation.substitution) htAttrs += ' substitution="yes"';
        out.push(`${indent}    <${tech.technical}${htAttrs}/>`);
      } else if (techNotation.text !== undefined) {
        // Elements that can have text content (tap, etc.)
        out.push(`${indent}    <${tech.technical}${placementAttr}>${escapeXml(techNotation.text)}</${tech.technical}>`);
      } else {
        out.push(`${indent}    <${tech.technical}${placementAttr}/>`);
      }
    }
  }
  out.push(`${indent}  </technical>`);
}

function serializeLyric(lyric: Lyric, indent: string, out: string[]): void {
  let attrs = '';
  if (lyric.number) attrs += ` number="${lyric.number}"`;
  if (lyric.name) attrs += ` name="${escapeXml(lyric.name)}"`;
  if (lyric.defaultY !== undefined) attrs += ` default-y="${lyric.defaultY}"`;
  if (lyric.relativeX !== undefined) attrs += ` relative-x="${lyric.relativeX}"`;
  if (lyric.justify) attrs += ` justify="${escapeXml(lyric.justify)}"`;
  if (lyric.placement) attrs += ` placement="${lyric.placement}"`;
  out.push(`${indent}<lyric${attrs}>`);

  // Multiple text elements with elision
  if (lyric.textElements && lyric.textElements.length > 1) {
    for (let i = 0; i < lyric.textElements.length; i++) {
      const te = lyric.textElements[i];
      if (te.syllabic) {
        out.push(`${indent}  <syllabic>${te.syllabic}</syllabic>`);
      }
      out.push(`${indent}  <text>${escapeXml(te.text)}</text>`);
      // Add elision between text elements (but not after the last one)
      if (i < lyric.textElements.length - 1) {
        out.push(`${indent}  <elision/>`);
      }
    }
  } else if (lyric.syllabic || lyric.text) {
    // Single text element (skip for extend-only lyrics with no text content)
    if (lyric.syllabic) {
      out.push(`${indent}  <syllabic>${lyric.syllabic}</syllabic>`);
    }
    out.push(`${indent}  <text>${escapeXml(lyric.text)}</text>`);
  }

  if (lyric.extend) {
    if (typeof lyric.extend === 'object' && lyric.extend.type) {
      out.push(`${indent}  <extend type="${lyric.extend.type}"/>`);
    } else {
      out.push(`${indent}  <extend/>`);
    }
  }

  if (lyric.endLine) {
    out.push(`${indent}  <end-line/>`);
  }

  if (lyric.endParagraph) {
    out.push(`${indent}  <end-paragraph/>`);
  }

  out.push(`${indent}</lyric>`);
}

function serializeBackup(backup: BackupEntry, indent: string, out: string[]): void {
  out.push(`${indent}<backup>`);
  out.push(`${indent}  <duration>${backup.duration}</duration>`);
  out.push(`${indent}</backup>`);
}

function serializeForward(forward: ForwardEntry, indent: string, out: string[]): void {
  const idAttr = forward._id ? ` id="${escapeXml(forward._id)}"` : '';
  out.push(`${indent}<forward${idAttr}>`);
  out.push(`${indent}  <duration>${forward.duration}</duration>`);

  if (forward.voice !== undefined) {
    out.push(`${indent}  <voice>${forward.voice}</voice>`);
  }

  if (forward.staff !== undefined) {
    out.push(`${indent}  <staff>${forward.staff}</staff>`);
  }

  out.push(`${indent}</forward>`);
}

function serializeDirection(direction: DirectionEntry, indent: string, out: string[]): void {
  let attrs = '';
  if (direction._id) attrs += ` id="${escapeXml(direction._id)}"`;
  if (direction.placement) attrs += ` placement="${direction.placement}"`;
  if (direction.directive) attrs += ' directive="yes"';
  if (direction.system) attrs += ` system="${direction.system}"`;
  out.push(`${indent}<direction${attrs}>`);

  for (const dirType of direction.directionTypes) {
    serializeDirectionType(dirType, indent + '  ', out);
  }

  if (direction.offset !== undefined) {
    const soundAttr = direction.offsetSound ? ' sound="yes"' : '';
    out.push(`${indent}  <offset${soundAttr}>${direction.offset}</offset>`);
  }

  if (direction.staff !== undefined) {
    out.push(`${indent}  <staff>${direction.staff}</staff>`);
  }

  if (direction.sound) {
    const attrs: string[] = [];
    if (direction.sound.tempo !== undefined) {
      attrs.push(`tempo="${direction.sound.tempo}"`);
    }
    if (direction.sound.dynamics !== undefined) {
      attrs.push(`dynamics="${direction.sound.dynamics}"`);
    }
    if (direction.sound.damperPedal) {
      attrs.push(`damper-pedal="${direction.sound.damperPedal}"`);
    }
    if (direction.sound.softPedal) {
      attrs.push(`soft-pedal="${direction.sound.softPedal}"`);
    }
    if (direction.sound.sostenutoPedal) {
      attrs.push(`sostenuto-pedal="${direction.sound.sostenutoPedal}"`);
    }
    const attrStr = attrs.length > 0 ? ` ${attrs.join(' ')}` : '';

    if (direction.sound.midiInstrument) {
      out.push(`${indent}  <sound${attrStr}>`);
      const midi = direction.sound.midiInstrument;
      out.push(`${indent}    <midi-instrument id="${escapeXml(midi.id)}">`);
      if (midi.midiChannel !== undefined) {
        out.push(`${indent}      <midi-channel>${midi.midiChannel}</midi-channel>`);
      }
      if (midi.midiProgram !== undefined) {
        out.push(`${indent}      <midi-program>${midi.midiProgram}</midi-program>`);
      }
      if (midi.volume !== undefined) {
        out.push(`${indent}      <volume>${midi.volume}</volume>`);
      }
      if (midi.pan !== undefined) {
        out.push(`${indent}      <pan>${midi.pan}</pan>`);
      }
      out.push(`${indent}    </midi-instrument>`);
      out.push(`${indent}  </sound>`);
    } else if (attrs.length > 0) {
      out.push(`${indent}  <sound${attrStr}/>`);
    }
  }

  out.push(`${indent}</direction>`);
}

function serializeDirectionType(dirType: DirectionType, indent: string, out: string[]): void {
  out.push(`${indent}<direction-type>`);

  switch (dirType.kind) {
    case 'dynamics': {
      let dynAttrs = '';
      if (dirType.defaultX !== undefined) dynAttrs += ` default-x="${dirType.defaultX}"`;
      if (dirType.defaultY !== undefined) dynAttrs += ` default-y="${dirType.defaultY}"`;
      if (dirType.relativeX !== undefined) dynAttrs += ` relative-x="${dirType.relativeX}"`;
      if (dirType.halign) dynAttrs += ` halign="${dirType.halign}"`;
      out.push(`${indent}  <dynamics${dynAttrs}>`);
      if (dirType.value) {
        out.push(`${indent}    <${dirType.value}/>`);
      }
      if (dirType.otherDynamics) {
        out.push(`${indent}    <other-dynamics>${escapeXml(dirType.otherDynamics)}</other-dynamics>`);
      }
      out.push(`${indent}  </dynamics>`);
      break;
    }

    case 'wedge': {
      let wedgeAttrs = ` type="${dirType.type}"`;
      if (dirType.spread !== undefined) wedgeAttrs += ` spread="${dirType.spread}"`;
      if (dirType.defaultY !== undefined) wedgeAttrs += ` default-y="${dirType.defaultY}"`;
      if (dirType.relativeX !== undefined) wedgeAttrs += ` relative-x="${dirType.relativeX}"`;
      out.push(`${indent}  <wedge${wedgeAttrs}/>`);
      break;
    }

    case 'metronome': {
      let metAttrs = '';
      if (dirType.printObject === false) metAttrs += ' print-object="no"';
      if (dirType.parentheses) metAttrs += ' parentheses="yes"';
      if (dirType.defaultY !== undefined) metAttrs += ` default-y="${dirType.defaultY}"`;
      if (dirType.fontFamily) metAttrs += ` font-family="${escapeXml(dirType.fontFamily)}"`;
      if (dirType.fontSize) metAttrs += ` font-size="${escapeXml(dirType.fontSize)}"`;
      out.push(`${indent}  <metronome${metAttrs}>`);
      out.push(`${indent}    <beat-unit>${dirType.beatUnit}</beat-unit>`);
      if (dirType.beatUnitDot) {
        out.push(`${indent}    <beat-unit-dot/>`);
      }
      if (dirType.beatUnit2) {
        out.push(`${indent}    <beat-unit>${dirType.beatUnit2}</beat-unit>`);
        if (dirType.beatUnitDot2) {
          out.push(`${indent}    <beat-unit-dot/>`);
        }
      }
      if (dirType.perMinute !== undefined) {
        out.push(`${indent}    <per-minute>${dirType.perMinute}</per-minute>`);
      }
      out.push(`${indent}  </metronome>`);
      break;
    }

    case 'words': {
      let wordAttrs = '';
      if (dirType.defaultX !== undefined) wordAttrs += ` default-x="${dirType.defaultX}"`;
      if (dirType.defaultY !== undefined) wordAttrs += ` default-y="${dirType.defaultY}"`;
      if (dirType.relativeX !== undefined) wordAttrs += ` relative-x="${dirType.relativeX}"`;
      if (dirType.relativeY !== undefined) wordAttrs += ` relative-y="${dirType.relativeY}"`;
      if (dirType.fontFamily) wordAttrs += ` font-family="${escapeXml(dirType.fontFamily)}"`;
      if (dirType.fontSize) wordAttrs += ` font-size="${escapeXml(dirType.fontSize)}"`;
      if (dirType.fontStyle) wordAttrs += ` font-style="${escapeXml(dirType.fontStyle)}"`;
      if (dirType.fontWeight) wordAttrs += ` font-weight="${escapeXml(dirType.fontWeight)}"`;
      if (dirType.xmlLang) wordAttrs += ` xml:lang="${escapeXml(dirType.xmlLang)}"`;
      if (dirType.justify) wordAttrs += ` justify="${escapeXml(dirType.justify)}"`;
      if (dirType.color) wordAttrs += ` color="${escapeXml(dirType.color)}"`;
      if (dirType.xmlSpace) wordAttrs += ` xml:space="${escapeXml(dirType.xmlSpace)}"`;
      if (dirType.halign) wordAttrs += ` halign="${escapeXml(dirType.halign)}"`;
      out.push(`${indent}  <words${wordAttrs}>${escapeXml(dirType.text)}</words>`);
      break;
    }

    case 'rehearsal': {
      let rehAttrs = '';
      if (dirType.enclosure) rehAttrs += ` enclosure="${escapeXml(dirType.enclosure)}"`;
      if (dirType.defaultX !== undefined) rehAttrs += ` default-x="${dirType.defaultX}"`;
      if (dirType.defaultY !== undefined) rehAttrs += ` default-y="${dirType.defaultY}"`;
      if (dirType.fontSize) rehAttrs += ` font-size="${escapeXml(dirType.fontSize)}"`;
      if (dirType.fontWeight) rehAttrs += ` font-weight="${escapeXml(dirType.fontWeight)}"`;
      out.push(`${indent}  <rehearsal${rehAttrs}>${escapeXml(dirType.text)}</rehearsal>`);
      break;
    }

    case 'bracket': {
      let bracketAttrs = ` type="${dirType.type}"`;
      if (dirType.number !== undefined) bracketAttrs += ` number="${dirType.number}"`;
      if (dirType.lineEnd) bracketAttrs += ` line-end="${dirType.lineEnd}"`;
      if (dirType.lineType) bracketAttrs += ` line-type="${dirType.lineType}"`;
      if (dirType.defaultY !== undefined) bracketAttrs += ` default-y="${dirType.defaultY}"`;
      if (dirType.relativeX !== undefined) bracketAttrs += ` relative-x="${dirType.relativeX}"`;
      out.push(`${indent}  <bracket${bracketAttrs}/>`);
      break;
    }

    case 'dashes': {
      let dashAttrs = ` type="${dirType.type}"`;
      if (dirType.number !== undefined) dashAttrs += ` number="${dirType.number}"`;
      if (dirType.dashLength !== undefined) dashAttrs += ` dash-length="${dirType.dashLength}"`;
      if (dirType.defaultY !== undefined) dashAttrs += ` default-y="${dirType.defaultY}"`;
      if (dirType.spaceLength !== undefined) dashAttrs += ` space-length="${dirType.spaceLength}"`;
      out.push(`${indent}  <dashes${dashAttrs}/>`);
      break;
    }

    case 'accordion-registration':
      out.push(`${indent}  <accordion-registration>`);
      if (dirType.high) {
        out.push(`${indent}    <accordion-high/>`);
      }
      // Handle accordion-middle: output if middlePresent is true OR middle has a value
      if (dirType.middlePresent || dirType.middle !== undefined) {
        if (dirType.middle !== undefined) {
          out.push(`${indent}    <accordion-middle>${dirType.middle}</accordion-middle>`);
        } else {
          out.push(`${indent}    <accordion-middle/>`);
        }
      }
      if (dirType.low) {
        out.push(`${indent}    <accordion-low/>`);
      }
      out.push(`${indent}  </accordion-registration>`);
      break;

    case 'other-direction': {
      let otherAttrs = '';
      if (dirType.defaultX !== undefined) otherAttrs += ` default-x="${dirType.defaultX}"`;
      if (dirType.defaultY !== undefined) otherAttrs += ` default-y="${dirType.defaultY}"`;
      if (dirType.halign) otherAttrs += ` halign="${escapeXml(dirType.halign)}"`;
      if (dirType.printObject === false) otherAttrs += ' print-object="no"';
      out.push(`${indent}  <other-direction${otherAttrs}>${escapeXml(dirType.text)}</other-direction>`);
    }
      break;

    case 'segno':
      out.push(`${indent}  <segno/>`);
      break;

    case 'coda':
      out.push(`${indent}  <coda/>`);
      break;

    case 'eyeglasses':
      out.push(`${indent}  <eyeglasses/>`);
      break;

    case 'damp':
      out.push(`${indent}  <damp/>`);
      break;

    case 'damp-all':
      out.push(`${indent}  <damp-all/>`);
      break;

    case 'scordatura':
      if (dirType.accords && dirType.accords.length > 0) {
        out.push(`${indent}  <scordatura>`);
        for (const accord of dirType.accords) {
          out.push(`${indent}    <accord string="${accord.string}">`);
          out.push(`${indent}      <tuning-step>${accord.tuningStep}</tuning-step>`);
          if (accord.tuningAlter !== undefined) {
            out.push(`${indent}      <tuning-alter>${accord.tuningAlter}</tuning-alter>`);
          }
          out.push(`${indent}      <tuning-octave>${accord.tuningOctave}</tuning-octave>`);
          out.push(`${indent}    </accord>`);
        }
        out.push(`${indent}  </scordatura>`);
      } else {
        out.push(`${indent}  <scordatura/>`);
      }
      break;

    case 'harp-pedals':
      if (dirType.pedalTunings && dirType.pedalTunings.length > 0) {
        out.push(`${indent}  <harp-pedals>`);
        for (const pt of dirType.pedalTunings) {
          out.push(`${indent}    <pedal-tuning>`);
          out.push(`${indent}      <pedal-step>${pt.pedalStep}</pedal-step>`);
          out.push(`${indent}      <pedal-alter>${pt.pedalAlter}</pedal-alter>`);
          out.push(`${indent}    </pedal-tuning>`);
        }
        out.push(`${indent}  </harp-pedals>`);
      } else {
        out.push(`${indent}  <harp-pedals/>`);
      }
      break;

    case 'image':
      let imgAttrs = '';
      if (dirType.source) imgAttrs += ` source="${escapeXml(dirType.source)}"`;
      if (dirType.type) imgAttrs += ` type="${escapeXml(dirType.type)}"`;
      out.push(`${indent}  <image${imgAttrs}/>`);
      break;

    case 'pedal': {
      let pedalAttrs = ` type="${dirType.type}"`;
      if (dirType.line !== undefined) pedalAttrs += ` line="${dirType.line ? 'yes' : 'no'}"`;
      if (dirType.defaultY !== undefined) pedalAttrs += ` default-y="${dirType.defaultY}"`;
      if (dirType.relativeX !== undefined) pedalAttrs += ` relative-x="${dirType.relativeX}"`;
      if (dirType.halign) pedalAttrs += ` halign="${dirType.halign}"`;
      out.push(`${indent}  <pedal${pedalAttrs}/>`);
      break;
    }

    case 'octave-shift': {
      const sizeAttr = dirType.size !== undefined ? ` size="${dirType.size}"` : '';
      out.push(`${indent}  <octave-shift type="${dirType.type}"${sizeAttr}/>`);
      break;
    }

    case 'swing':
      out.push(`${indent}  <swing>`);
      if (dirType.straight) {
        out.push(`${indent}    <straight/>`);
      } else {
        if (dirType.first !== undefined) {
          out.push(`${indent}    <first>${dirType.first}</first>`);
        }
        if (dirType.second !== undefined) {
          out.push(`${indent}    <second>${dirType.second}</second>`);
        }
        if (dirType.swingType) {
          out.push(`${indent}    <swing-type>${dirType.swingType}</swing-type>`);
        }
      }
      out.push(`${indent}  </swing>`);
      break;
  }

  out.push(`${indent}</direction-type>`);
}

function serializeBarline(barline: Barline, indent: string, out: string[]): void {
  let attrs = ` location="${barline.location}"`;
  if (barline._id) attrs += ` id="${escapeXml(barline._id)}"`;
  out.push(`${indent}<barline${attrs}>`);

  if (barline.barStyle) {
    out.push(`${indent}  <bar-style>${barline.barStyle}</bar-style>`);
  }

  if (barline.ending) {
    let endingAttrs = ` number="${barline.ending.number}" type="${barline.ending.type}"`;
    if (barline.ending.defaultY !== undefined) endingAttrs += ` default-y="${barline.ending.defaultY}"`;
    if (barline.ending.endLength !== undefined) endingAttrs += ` end-length="${barline.ending.endLength}"`;
    if (barline.ending.text) {
      out.push(`${indent}  <ending${endingAttrs}>${escapeXml(barline.ending.text)}</ending>`);
    } else {
      out.push(`${indent}  <ending${endingAttrs}/>`);
    }
  }

  if (barline.repeat) {
    let repeatAttrs = ` direction="${barline.repeat.direction}"`;
    if (barline.repeat.times !== undefined) repeatAttrs += ` times="${barline.repeat.times}"`;
    if (barline.repeat.winged) repeatAttrs += ` winged="${barline.repeat.winged}"`;
    out.push(`${indent}  <repeat${repeatAttrs}/>`);
  }

  out.push(`${indent}</barline>`);
}

// Pre-compiled regex for XML special characters — single-pass replacement.
const XML_ESCAPE_RE = /[&<>"']/g;
const XML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

// Non-global regex for fast path check (avoids lastIndex statefulness).
const XML_ESCAPE_TEST = /[&<>"']/;

function escapeXml(str: string): string {
  // Fast path: most attribute/text values contain no special chars.
  if (!XML_ESCAPE_TEST.test(str)) return str;
  return str.replace(XML_ESCAPE_RE, (ch) => XML_ESCAPE_MAP[ch]);
}

/**
 * Build XML attributes from an object.
 * Only includes attributes with defined values.
 */
type AttrValue = string | number | boolean | undefined;

function buildAttrs(attrs: Record<string, AttrValue>): string {
  let result = '';
  for (const key in attrs) {
    const value = attrs[key];
    if (value === undefined) continue;
    if (typeof value === 'boolean') {
      result += ` ${key}="${value ? 'yes' : 'no'}"`;
    } else if (typeof value === 'number') {
      result += ` ${key}="${value}"`;
    } else {
      result += ` ${key}="${escapeXml(value)}"`;
    }
  }
  return result;
}

/**
 * Push an optional XML element if value is defined
 */
function pushOptionalElement(lines: string[], indent: string, tag: string, value: string | number | undefined): void {
  if (value !== undefined) {
    const escaped = typeof value === 'string' ? escapeXml(value) : value;
    lines.push(`${indent}<${tag}>${escaped}</${tag}>`);
  }
}

// ============================================================
// New Serialize Functions for Extended Support
// ============================================================

function serializeStaffDetails(sd: StaffDetails, indent: string, out: string[]): void {
  const attrs = buildAttrs({
    'number': sd.number,
    'show-frets': sd.showFrets,
    'print-object': sd.printObject,
    'print-spacing': sd.printSpacing,
  });
  out.push(`${indent}<staff-details${attrs}>`);

  pushOptionalElement(out, `${indent}  `, 'staff-type', sd.staffType);

  pushOptionalElement(out, `${indent}  `, 'staff-lines', sd.staffLines);

  if (sd.staffTuning) {
    for (const tuning of sd.staffTuning) {
      out.push(`${indent}  <staff-tuning${buildAttrs({ line: tuning.line })}>`);
      out.push(`${indent}    <tuning-step>${tuning.tuningStep}</tuning-step>`);
      pushOptionalElement(out, `${indent}    `, 'tuning-alter', tuning.tuningAlter);
      out.push(`${indent}    <tuning-octave>${tuning.tuningOctave}</tuning-octave>`);
      out.push(`${indent}  </staff-tuning>`);
    }
  }

  pushOptionalElement(out, `${indent}  `, 'capo', sd.capo);

  if (sd.staffSize !== undefined) {
    const attrs = buildAttrs({ scaling: sd.staffSizeScaling });
    out.push(`${indent}  <staff-size${attrs}>${sd.staffSize}</staff-size>`);
  }

  out.push(`${indent}</staff-details>`);
}

function serializeMeasureStyle(ms: MeasureStyle, indent: string, out: string[]): void {
  out.push(`${indent}<measure-style${buildAttrs({ number: ms.number })}>`);

  pushOptionalElement(out, `${indent}  `, 'multiple-rest', ms.multipleRest);

  if (ms.measureRepeat) {
    const mrAttrs = buildAttrs({
      type: ms.measureRepeat.type,
      slashes: ms.measureRepeat.slashes,
    });
    out.push(`${indent}  <measure-repeat${mrAttrs}/>`);
  }

  if (ms.beatRepeat) {
    const brAttrs = buildAttrs({ type: ms.beatRepeat.type, slashes: ms.beatRepeat.slashes });
    out.push(`${indent}  <beat-repeat${brAttrs}/>`);
  }

  if (ms.slash) {
    const slAttrs = buildAttrs({
      type: ms.slash.type,
      'use-dots': ms.slash.useDots,
      'use-stems': ms.slash.useStems,
    });
    out.push(`${indent}  <slash${slAttrs}/>`);
  }

  out.push(`${indent}</measure-style>`);
}

function serializeHarmony(harmony: HarmonyEntry, indent: string, out: string[]): void {
  const attrs = buildAttrs({
    id: harmony._id,
    placement: harmony.placement,
    'print-frame': harmony.printFrame,
    'default-y': harmony.defaultY,
    halign: harmony.halign,
    'font-size': harmony.fontSize,
  });
  out.push(`${indent}<harmony${attrs}>`);

  // Root
  out.push(`${indent}  <root>`);
  out.push(`${indent}    <root-step>${harmony.root.rootStep}</root-step>`);
  if (harmony.root.rootAlter !== undefined) {
    out.push(`${indent}    <root-alter>${harmony.root.rootAlter}</root-alter>`);
  }
  out.push(`${indent}  </root>`);

  // Kind
  let kindAttrs = '';
  if (harmony.kindText !== undefined) kindAttrs += ` text="${escapeXml(harmony.kindText)}"`;
  if (harmony.kindHalign) kindAttrs += ` halign="${escapeXml(harmony.kindHalign)}"`;
  out.push(`${indent}  <kind${kindAttrs}>${escapeXml(harmony.kind)}</kind>`);

  // Bass
  if (harmony.bass) {
    let bassAttrs = '';
    if (harmony.bass.arrangement) bassAttrs += ` arrangement="${escapeXml(harmony.bass.arrangement)}"`;
    out.push(`${indent}  <bass${bassAttrs}>`);
    out.push(`${indent}    <bass-step>${harmony.bass.bassStep}</bass-step>`);
    if (harmony.bass.bassAlter !== undefined) {
      out.push(`${indent}    <bass-alter>${harmony.bass.bassAlter}</bass-alter>`);
    }
    out.push(`${indent}  </bass>`);
  }

  // Inversion
  if (harmony.inversion !== undefined) {
    out.push(`${indent}  <inversion>${harmony.inversion}</inversion>`);
  }

  // Degrees
  if (harmony.degrees) {
    for (const deg of harmony.degrees) {
      out.push(`${indent}  <degree>`);
      out.push(`${indent}    <degree-value>${deg.degreeValue}</degree-value>`);
      if (deg.degreeAlter !== undefined) {
        out.push(`${indent}    <degree-alter>${deg.degreeAlter}</degree-alter>`);
      }
      out.push(`${indent}    <degree-type>${deg.degreeType}</degree-type>`);
      out.push(`${indent}  </degree>`);
    }
  }

  // Frame
  if (harmony.frame) {
    out.push(`${indent}  <frame>`);
    if (harmony.frame.frameStrings !== undefined) {
      out.push(`${indent}    <frame-strings>${harmony.frame.frameStrings}</frame-strings>`);
    }
    if (harmony.frame.frameFrets !== undefined) {
      out.push(`${indent}    <frame-frets>${harmony.frame.frameFrets}</frame-frets>`);
    }
    if (harmony.frame.firstFret !== undefined) {
      let ffAttrs = '';
      if (harmony.frame.firstFretText) ffAttrs += ` text="${escapeXml(harmony.frame.firstFretText)}"`;
      if (harmony.frame.firstFretLocation) ffAttrs += ` location="${harmony.frame.firstFretLocation}"`;
      out.push(`${indent}    <first-fret${ffAttrs}>${harmony.frame.firstFret}</first-fret>`);
    }
    if (harmony.frame.frameNotes) {
      for (const fn of harmony.frame.frameNotes) {
        out.push(`${indent}    <frame-note>`);
        out.push(`${indent}      <string>${fn.string}</string>`);
        out.push(`${indent}      <fret>${fn.fret}</fret>`);
        if (fn.fingering) {
          out.push(`${indent}      <fingering>${escapeXml(fn.fingering)}</fingering>`);
        }
        if (fn.barre) {
          out.push(`${indent}      <barre type="${fn.barre}"/>`);
        }
        out.push(`${indent}    </frame-note>`);
      }
    }
    out.push(`${indent}  </frame>`);
  }

  // Offset
  if (harmony.offset !== undefined) {
    out.push(`${indent}  <offset>${harmony.offset}</offset>`);
  }

  // Staff
  if (harmony.staff !== undefined) {
    out.push(`${indent}  <staff>${harmony.staff}</staff>`);
  }

  out.push(`${indent}</harmony>`);
}

function serializeFiguredBass(fb: FiguredBassEntry, indent: string, out: string[]): void {
  let attrs = '';
  if (fb._id) attrs += ` id="${escapeXml(fb._id)}"`;
  if (fb.parentheses) attrs += ' parentheses="yes"';
  out.push(`${indent}<figured-bass${attrs}>`);

  for (const fig of fb.figures) {
    out.push(`${indent}  <figure>`);
    if (fig.prefix) {
      out.push(`${indent}    <prefix>${escapeXml(fig.prefix)}</prefix>`);
    }
    if (fig.figureNumber) {
      out.push(`${indent}    <figure-number>${escapeXml(fig.figureNumber)}</figure-number>`);
    }
    if (fig.suffix) {
      out.push(`${indent}    <suffix>${escapeXml(fig.suffix)}</suffix>`);
    }
    if (fig.extend) {
      if (typeof fig.extend === 'object' && fig.extend.type) {
        out.push(`${indent}    <extend type="${fig.extend.type}"/>`);
      } else {
        out.push(`${indent}    <extend/>`);
      }
    }
    out.push(`${indent}  </figure>`);
  }

  if (fb.duration !== undefined) {
    out.push(`${indent}  <duration>${fb.duration}</duration>`);
  }

  out.push(`${indent}</figured-bass>`);
}

function serializeSound(sound: SoundEntry, indent: string, out: string[]): void {
  const attrs: string[] = [];

  if (sound._id) attrs.push(`id="${escapeXml(sound._id)}"`);
  if (sound.tempo !== undefined) attrs.push(`tempo="${sound.tempo}"`);
  if (sound.dynamics !== undefined) attrs.push(`dynamics="${sound.dynamics}"`);
  if (sound.dacapo) attrs.push('dacapo="yes"');
  if (sound.segno) attrs.push(`segno="${escapeXml(sound.segno)}"`);
  if (sound.dalsegno) attrs.push(`dalsegno="${escapeXml(sound.dalsegno)}"`);
  if (sound.coda) attrs.push(`coda="${escapeXml(sound.coda)}"`);
  if (sound.tocoda) attrs.push(`tocoda="${escapeXml(sound.tocoda)}"`);
  if (sound.fine) attrs.push('fine="yes"');
  if (sound.forwardRepeat) attrs.push('forward-repeat="yes"');
  if (sound.damperPedal) attrs.push(`damper-pedal="${sound.damperPedal === true ? 'yes' : sound.damperPedal}"`);
  if (sound.softPedal) attrs.push(`soft-pedal="${sound.softPedal === true ? 'yes' : sound.softPedal}"`);
  if (sound.sostenutoPedal) attrs.push(`sostenuto-pedal="${sound.sostenutoPedal === true ? 'yes' : sound.sostenutoPedal}"`);

  const attrStr = attrs.length > 0 ? ` ${attrs.join(' ')}` : '';

  // If there's a swing element, we need opening/closing tags
  if (sound.swing) {
    out.push(`${indent}<sound${attrStr}>`);
    out.push(`${indent}  <swing>`);
    if (sound.swing.straight) {
      out.push(`${indent}    <straight/>`);
    } else {
      if (sound.swing.first !== undefined) {
        out.push(`${indent}    <first>${sound.swing.first}</first>`);
      }
      if (sound.swing.second !== undefined) {
        out.push(`${indent}    <second>${sound.swing.second}</second>`);
      }
      if (sound.swing.swingType) {
        out.push(`${indent}    <swing-type>${sound.swing.swingType}</swing-type>`);
      }
    }
    out.push(`${indent}  </swing>`);
    out.push(`${indent}</sound>`);
  } else if (attrs.length === 0 && !sound._id) {
    out.push(`${indent}<sound/>`);
  } else {
    out.push(`${indent}<sound${attrStr}/>`);
  }
}
