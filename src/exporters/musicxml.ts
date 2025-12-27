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
} from '../types';

export interface SerializeOptions {
  version?: '3.1' | '4.0';
  indent?: string;
}

export function serialize(score: Score, options: SerializeOptions = {}): string {
  const version = options.version || '4.0';
  const indent = options.indent ?? '  ';

  const lines: string[] = [];

  // XML declaration
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');

  // DOCTYPE
  if (version === '4.0') {
    lines.push('<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">');
  } else {
    lines.push('<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">');
  }

  // score-partwise
  lines.push(`<score-partwise version="${version}">`);

  // Metadata
  lines.push(...serializeMetadata(score.metadata, indent));

  // Defaults
  if (score.defaults) {
    lines.push(...serializeDefaults(score.defaults, indent));
  }

  // Credits
  if (score.credits) {
    for (const credit of score.credits) {
      lines.push(...serializeCredit(credit, indent));
    }
  }

  // Part list
  lines.push(...serializePartList(score.partList, indent));

  // Parts
  for (const part of score.parts) {
    lines.push(...serializePart(part, indent));
  }

  lines.push('</score-partwise>');

  return lines.join('\n');
}

function serializeMetadata(metadata: ScoreMetadata, indent: string): string[] {
  const lines: string[] = [];

  // Work
  if (metadata.workTitle || metadata.workNumber) {
    lines.push(`${indent}<work>`);
    if (metadata.workNumber) {
      lines.push(`${indent}${indent}<work-number>${escapeXml(metadata.workNumber)}</work-number>`);
    }
    if (metadata.workTitle) {
      lines.push(`${indent}${indent}<work-title>${escapeXml(metadata.workTitle)}</work-title>`);
    }
    lines.push(`${indent}</work>`);
  }

  // Movement
  if (metadata.movementNumber) {
    lines.push(`${indent}<movement-number>${escapeXml(metadata.movementNumber)}</movement-number>`);
  }
  if (metadata.movementTitle) {
    lines.push(`${indent}<movement-title>${escapeXml(metadata.movementTitle)}</movement-title>`);
  }

  // Identification
  if (metadata.creators || metadata.rights || metadata.encoding || metadata.source || metadata.miscellaneous) {
    lines.push(`${indent}<identification>`);

    if (metadata.creators) {
      for (const creator of metadata.creators) {
        const typeAttr = creator.type ? ` type="${escapeXml(creator.type)}"` : '';
        lines.push(`${indent}${indent}<creator${typeAttr}>${escapeXml(creator.value)}</creator>`);
      }
    }

    if (metadata.rights) {
      for (const right of metadata.rights) {
        lines.push(`${indent}${indent}<rights>${escapeXml(right)}</rights>`);
      }
    }

    if (metadata.encoding) {
      lines.push(`${indent}${indent}<encoding>`);
      if (metadata.encoding.software) {
        for (const sw of metadata.encoding.software) {
          lines.push(`${indent}${indent}${indent}<software>${escapeXml(sw)}</software>`);
        }
      }
      if (metadata.encoding.encodingDate) {
        lines.push(`${indent}${indent}${indent}<encoding-date>${escapeXml(metadata.encoding.encodingDate)}</encoding-date>`);
      }
      if (metadata.encoding.encoder) {
        for (const enc of metadata.encoding.encoder) {
          lines.push(`${indent}${indent}${indent}<encoder>${escapeXml(enc)}</encoder>`);
        }
      }
      if (metadata.encoding.encodingDescription) {
        lines.push(`${indent}${indent}${indent}<encoding-description>${escapeXml(metadata.encoding.encodingDescription)}</encoding-description>`);
      }
      if (metadata.encoding.supports) {
        for (const support of metadata.encoding.supports) {
          let attrs = ` element="${escapeXml(support.element)}" type="${support.type}"`;
          if (support.attribute) attrs += ` attribute="${escapeXml(support.attribute)}"`;
          if (support.value) attrs += ` value="${escapeXml(support.value)}"`;
          lines.push(`${indent}${indent}${indent}<supports${attrs}/>`);
        }
      }
      lines.push(`${indent}${indent}</encoding>`);
    }

    if (metadata.source) {
      lines.push(`${indent}${indent}<source>${escapeXml(metadata.source)}</source>`);
    }

    if (metadata.miscellaneous) {
      lines.push(`${indent}${indent}<miscellaneous>`);
      for (const field of metadata.miscellaneous) {
        lines.push(`${indent}${indent}${indent}<miscellaneous-field name="${escapeXml(field.name)}">${escapeXml(field.value)}</miscellaneous-field>`);
      }
      lines.push(`${indent}${indent}</miscellaneous>`);
    }

    lines.push(`${indent}</identification>`);
  }

  return lines;
}

function serializeDefaults(defaults: Defaults, indent: string): string[] {
  const lines: string[] = [];

  lines.push(`${indent}<defaults>`);

  if (defaults.scaling) {
    lines.push(`${indent}${indent}<scaling>`);
    lines.push(`${indent}${indent}${indent}<millimeters>${defaults.scaling.millimeters}</millimeters>`);
    lines.push(`${indent}${indent}${indent}<tenths>${defaults.scaling.tenths}</tenths>`);
    lines.push(`${indent}${indent}</scaling>`);
  }

  if (defaults.pageLayout) {
    lines.push(...serializePageLayout(defaults.pageLayout, indent + indent));
  }

  if (defaults.systemLayout) {
    lines.push(...serializeSystemLayout(defaults.systemLayout, indent + indent));
  }

  if (defaults.staffLayout) {
    for (const sl of defaults.staffLayout) {
      const numAttr = sl.number !== undefined ? ` number="${sl.number}"` : '';
      lines.push(`${indent}${indent}<staff-layout${numAttr}>`);
      if (sl.staffDistance !== undefined) {
        lines.push(`${indent}${indent}${indent}<staff-distance>${sl.staffDistance}</staff-distance>`);
      }
      lines.push(`${indent}${indent}</staff-layout>`);
    }
  }

  // Appearance
  if (defaults.appearance) {
    lines.push(`${indent}${indent}<appearance>`);
    const app = defaults.appearance;
    if (app['line-widths']) {
      for (const lw of app['line-widths'] as Array<{ type: string; value: number }>) {
        lines.push(`${indent}${indent}${indent}<line-width type="${escapeXml(lw.type)}">${lw.value}</line-width>`);
      }
    }
    if (app['note-sizes']) {
      for (const ns of app['note-sizes'] as Array<{ type: string; value: number }>) {
        lines.push(`${indent}${indent}${indent}<note-size type="${escapeXml(ns.type)}">${ns.value}</note-size>`);
      }
    }
    if (app['distances']) {
      for (const d of app['distances'] as Array<{ type: string; value: number }>) {
        lines.push(`${indent}${indent}${indent}<distance type="${escapeXml(d.type)}">${d.value}</distance>`);
      }
    }
    lines.push(`${indent}${indent}</appearance>`);
  }

  // Music font
  if (defaults.musicFont) {
    let attrs = '';
    if (defaults.musicFont.fontFamily) attrs += ` font-family="${escapeXml(defaults.musicFont.fontFamily)}"`;
    if (defaults.musicFont.fontSize) attrs += ` font-size="${escapeXml(defaults.musicFont.fontSize)}"`;
    if (defaults.musicFont.fontStyle) attrs += ` font-style="${escapeXml(defaults.musicFont.fontStyle)}"`;
    if (defaults.musicFont.fontWeight) attrs += ` font-weight="${escapeXml(defaults.musicFont.fontWeight)}"`;
    lines.push(`${indent}${indent}<music-font${attrs}/>`);
  }

  // Word font
  if (defaults.wordFont) {
    let attrs = '';
    if (defaults.wordFont.fontFamily) attrs += ` font-family="${escapeXml(defaults.wordFont.fontFamily)}"`;
    if (defaults.wordFont.fontSize) attrs += ` font-size="${escapeXml(defaults.wordFont.fontSize)}"`;
    if (defaults.wordFont.fontStyle) attrs += ` font-style="${escapeXml(defaults.wordFont.fontStyle)}"`;
    if (defaults.wordFont.fontWeight) attrs += ` font-weight="${escapeXml(defaults.wordFont.fontWeight)}"`;
    lines.push(`${indent}${indent}<word-font${attrs}/>`);
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
      lines.push(`${indent}${indent}<lyric-font${attrs}/>`);
    }
  }

  // Lyric languages
  if (defaults.lyricLanguage) {
    for (const ll of defaults.lyricLanguage) {
      let attrs = '';
      if (ll.number !== undefined) attrs += ` number="${ll.number}"`;
      if (ll.name) attrs += ` name="${escapeXml(ll.name)}"`;
      attrs += ` xml:lang="${escapeXml(ll.xmlLang)}"`;
      lines.push(`${indent}${indent}<lyric-language${attrs}/>`);
    }
  }

  lines.push(`${indent}</defaults>`);

  return lines;
}

function serializePageLayout(layout: PageLayout, indent: string): string[] {
  const lines: string[] = [];

  lines.push(`${indent}<page-layout>`);

  if (layout.pageHeight !== undefined) {
    lines.push(`${indent}  <page-height>${layout.pageHeight}</page-height>`);
  }
  if (layout.pageWidth !== undefined) {
    lines.push(`${indent}  <page-width>${layout.pageWidth}</page-width>`);
  }

  if (layout.pageMargins) {
    for (const m of layout.pageMargins) {
      const typeAttr = m.type ? ` type="${m.type}"` : '';
      lines.push(`${indent}  <page-margins${typeAttr}>`);
      if (m.leftMargin !== undefined) {
        lines.push(`${indent}    <left-margin>${m.leftMargin}</left-margin>`);
      }
      if (m.rightMargin !== undefined) {
        lines.push(`${indent}    <right-margin>${m.rightMargin}</right-margin>`);
      }
      if (m.topMargin !== undefined) {
        lines.push(`${indent}    <top-margin>${m.topMargin}</top-margin>`);
      }
      if (m.bottomMargin !== undefined) {
        lines.push(`${indent}    <bottom-margin>${m.bottomMargin}</bottom-margin>`);
      }
      lines.push(`${indent}  </page-margins>`);
    }
  }

  lines.push(`${indent}</page-layout>`);

  return lines;
}

function serializeSystemLayout(layout: SystemLayout, indent: string): string[] {
  const lines: string[] = [];

  lines.push(`${indent}<system-layout>`);

  if (layout.systemMargins) {
    lines.push(`${indent}  <system-margins>`);
    if (layout.systemMargins.leftMargin !== undefined) {
      lines.push(`${indent}    <left-margin>${layout.systemMargins.leftMargin}</left-margin>`);
    }
    if (layout.systemMargins.rightMargin !== undefined) {
      lines.push(`${indent}    <right-margin>${layout.systemMargins.rightMargin}</right-margin>`);
    }
    lines.push(`${indent}  </system-margins>`);
  }

  if (layout.systemDistance !== undefined) {
    lines.push(`${indent}  <system-distance>${layout.systemDistance}</system-distance>`);
  }

  if (layout.topSystemDistance !== undefined) {
    lines.push(`${indent}  <top-system-distance>${layout.topSystemDistance}</top-system-distance>`);
  }

  lines.push(`${indent}</system-layout>`);

  return lines;
}

function serializeCredit(credit: Credit, indent: string): string[] {
  const lines: string[] = [];

  const pageAttr = credit.page !== undefined ? ` page="${credit.page}"` : '';
  lines.push(`${indent}<credit${pageAttr}>`);

  if (credit.creditType) {
    for (const ct of credit.creditType) {
      lines.push(`${indent}${indent}<credit-type>${escapeXml(ct)}</credit-type>`);
    }
  }

  if (credit.creditWords) {
    for (const cw of credit.creditWords) {
      let attrs = '';
      if (cw.defaultX !== undefined) attrs += ` default-x="${cw.defaultX}"`;
      if (cw.defaultY !== undefined) attrs += ` default-y="${cw.defaultY}"`;
      if (cw.fontSize) attrs += ` font-size="${escapeXml(cw.fontSize)}"`;
      if (cw.fontWeight) attrs += ` font-weight="${escapeXml(cw.fontWeight)}"`;
      if (cw.fontStyle) attrs += ` font-style="${escapeXml(cw.fontStyle)}"`;
      if (cw.justify) attrs += ` justify="${escapeXml(cw.justify)}"`;
      if (cw.halign) attrs += ` halign="${escapeXml(cw.halign)}"`;
      if (cw.valign) attrs += ` valign="${escapeXml(cw.valign)}"`;
      lines.push(`${indent}${indent}<credit-words${attrs}>${escapeXml(cw.text)}</credit-words>`);
    }
  }

  lines.push(`${indent}</credit>`);

  return lines;
}

function serializePartList(partList: PartListEntry[], indent: string): string[] {
  const lines: string[] = [];

  lines.push(`${indent}<part-list>`);

  for (const entry of partList) {
    if (entry.type === 'score-part') {
      lines.push(...serializeScorePart(entry, indent + indent));
    } else if (entry.type === 'part-group') {
      lines.push(...serializePartGroup(entry, indent + indent));
    }
  }

  lines.push(`${indent}</part-list>`);

  return lines;
}

function serializeScorePart(part: PartInfo, indent: string): string[] {
  const lines: string[] = [];

  lines.push(`${indent}<score-part id="${escapeXml(part.id)}">`);

  if (part.name !== undefined) {
    lines.push(`${indent}  <part-name>${escapeXml(part.name)}</part-name>`);
  }

  if (part.abbreviation) {
    lines.push(`${indent}  <part-abbreviation>${escapeXml(part.abbreviation)}</part-abbreviation>`);
  }

  if (part.scoreInstruments) {
    for (const inst of part.scoreInstruments) {
      lines.push(`${indent}  <score-instrument id="${escapeXml(inst.id)}">`);
      lines.push(`${indent}    <instrument-name>${escapeXml(inst.name)}</instrument-name>`);
      if (inst.abbreviation) {
        lines.push(`${indent}    <instrument-abbreviation>${escapeXml(inst.abbreviation)}</instrument-abbreviation>`);
      }
      if (inst.sound) {
        lines.push(`${indent}    <instrument-sound>${escapeXml(inst.sound)}</instrument-sound>`);
      }
      if (inst.solo) {
        lines.push(`${indent}    <solo/>`);
      }
      if (inst.ensemble !== undefined) {
        lines.push(`${indent}    <ensemble>${inst.ensemble}</ensemble>`);
      }
      lines.push(`${indent}  </score-instrument>`);
    }
  }

  if (part.groups) {
    for (const group of part.groups) {
      lines.push(`${indent}  <group>${escapeXml(group)}</group>`);
    }
  }

  if (part.midiInstruments) {
    for (const midi of part.midiInstruments) {
      lines.push(`${indent}  <midi-instrument id="${escapeXml(midi.id)}">`);
      if (midi.channel !== undefined) {
        lines.push(`${indent}    <midi-channel>${midi.channel}</midi-channel>`);
      }
      if (midi.name) {
        lines.push(`${indent}    <midi-name>${escapeXml(midi.name)}</midi-name>`);
      }
      if (midi.bank !== undefined) {
        lines.push(`${indent}    <midi-bank>${midi.bank}</midi-bank>`);
      }
      if (midi.program !== undefined) {
        lines.push(`${indent}    <midi-program>${midi.program}</midi-program>`);
      }
      if (midi.unpitched !== undefined) {
        lines.push(`${indent}    <midi-unpitched>${midi.unpitched}</midi-unpitched>`);
      }
      if (midi.volume !== undefined) {
        lines.push(`${indent}    <volume>${midi.volume}</volume>`);
      }
      if (midi.pan !== undefined) {
        lines.push(`${indent}    <pan>${midi.pan}</pan>`);
      }
      if (midi.elevation !== undefined) {
        lines.push(`${indent}    <elevation>${midi.elevation}</elevation>`);
      }
      lines.push(`${indent}  </midi-instrument>`);
    }
  }

  lines.push(`${indent}</score-part>`);

  return lines;
}

function serializePartGroup(group: PartGroup, indent: string): string[] {
  const lines: string[] = [];

  let attrs = ` type="${group.groupType}"`;
  if (group.number !== undefined) attrs += ` number="${group.number}"`;
  lines.push(`${indent}<part-group${attrs}>`);

  if (group.groupName) {
    lines.push(`${indent}  <group-name>${escapeXml(group.groupName)}</group-name>`);
  }

  if (group.groupAbbreviation) {
    lines.push(`${indent}  <group-abbreviation>${escapeXml(group.groupAbbreviation)}</group-abbreviation>`);
  }

  if (group.groupSymbol) {
    lines.push(`${indent}  <group-symbol>${group.groupSymbol}</group-symbol>`);
  }

  if (group.groupBarline) {
    lines.push(`${indent}  <group-barline>${group.groupBarline}</group-barline>`);
  }

  lines.push(`${indent}</part-group>`);

  return lines;
}

function serializePart(part: Part, indent: string): string[] {
  const lines: string[] = [];

  lines.push(`${indent}<part id="${escapeXml(part.id)}">`);

  for (const measure of part.measures) {
    lines.push(...serializeMeasure(measure, indent + indent));
  }

  lines.push(`${indent}</part>`);

  return lines;
}

function serializeMeasure(measure: Measure, indent: string): string[] {
  const lines: string[] = [];

  let attrs = ` number="${measure.number}"`;
  if (measure.width !== undefined) attrs += ` width="${measure.width}"`;
  if (measure.implicit) attrs += ` implicit="yes"`;
  lines.push(`${indent}<measure${attrs}>`);

  // Print
  if (measure.print) {
    lines.push(...serializePrint(measure.print, indent + '  '));
  }

  // Attributes
  if (measure.attributes) {
    lines.push(...serializeAttributes(measure.attributes, indent + '  '));
  }

  // Entries
  for (const entry of measure.entries) {
    lines.push(...serializeEntry(entry, indent + '  '));
  }

  // Barlines
  if (measure.barlines) {
    for (const barline of measure.barlines) {
      lines.push(...serializeBarline(barline, indent + '  '));
    }
  }

  lines.push(`${indent}</measure>`);

  return lines;
}

function serializePrint(print: Print, indent: string): string[] {
  const lines: string[] = [];

  let attrs = '';
  if (print.newSystem) attrs += ' new-system="yes"';
  if (print.newPage) attrs += ' new-page="yes"';
  if (print.blankPage !== undefined) attrs += ` blank-page="${print.blankPage}"`;
  if (print.pageNumber) attrs += ` page-number="${escapeXml(print.pageNumber)}"`;

  lines.push(`${indent}<print${attrs}>`);

  if (print.pageLayout) {
    lines.push(...serializePageLayout(print.pageLayout, indent + '  '));
  }

  if (print.systemLayout) {
    lines.push(...serializeSystemLayout(print.systemLayout, indent + '  '));
  }

  if (print.staffLayouts) {
    for (const sl of print.staffLayouts) {
      const numAttr = sl.number !== undefined ? ` number="${sl.number}"` : '';
      lines.push(`${indent}  <staff-layout${numAttr}>`);
      if (sl.staffDistance !== undefined) {
        lines.push(`${indent}    <staff-distance>${sl.staffDistance}</staff-distance>`);
      }
      lines.push(`${indent}  </staff-layout>`);
    }
  }

  if (print.measureLayout) {
    lines.push(`${indent}  <measure-layout>`);
    if (print.measureLayout.measureDistance !== undefined) {
      lines.push(`${indent}    <measure-distance>${print.measureLayout.measureDistance}</measure-distance>`);
    }
    lines.push(`${indent}  </measure-layout>`);
  }

  if (print.measureNumbering) {
    lines.push(`${indent}  <measure-numbering>${escapeXml(print.measureNumbering)}</measure-numbering>`);
  }

  lines.push(`${indent}</print>`);

  return lines;
}

function serializeAttributes(attrs: MeasureAttributes, indent: string): string[] {
  const lines: string[] = [];

  lines.push(`${indent}<attributes>`);

  if (attrs.divisions !== undefined) {
    lines.push(`${indent}  <divisions>${attrs.divisions}</divisions>`);
  }

  if (attrs.key) {
    lines.push(...serializeKey(attrs.key, indent + '  '));
  }

  if (attrs.time) {
    lines.push(...serializeTime(attrs.time, indent + '  '));
  }

  if (attrs.staves !== undefined) {
    lines.push(`${indent}  <staves>${attrs.staves}</staves>`);
  }

  if (attrs.clef) {
    for (const clef of attrs.clef) {
      lines.push(...serializeClef(clef, indent + '  '));
    }
  }

  if (attrs.transpose) {
    lines.push(...serializeTranspose(attrs.transpose, indent + '  '));
  }

  if (attrs.staffDetails) {
    for (const sd of attrs.staffDetails) {
      lines.push(...serializeStaffDetails(sd, indent + '  '));
    }
  }

  if (attrs.measureStyle) {
    for (const ms of attrs.measureStyle) {
      lines.push(...serializeMeasureStyle(ms, indent + '  '));
    }
  }

  lines.push(`${indent}</attributes>`);

  return lines;
}

function serializeKey(key: KeySignature, indent: string): string[] {
  const lines: string[] = [];

  lines.push(`${indent}<key>`);

  // Non-traditional key signatures
  if (key.keySteps && key.keyAlters && key.keySteps.length > 0) {
    for (let i = 0; i < key.keySteps.length; i++) {
      lines.push(`${indent}  <key-step>${key.keySteps[i]}</key-step>`);
      if (i < key.keyAlters.length) {
        lines.push(`${indent}  <key-alter>${key.keyAlters[i]}</key-alter>`);
      }
    }
    if (key.keyOctaves) {
      for (const ko of key.keyOctaves) {
        lines.push(`${indent}  <key-octave number="${ko.number}">${ko.octave}</key-octave>`);
      }
    }
  } else {
    lines.push(`${indent}  <fifths>${key.fifths}</fifths>`);
    if (key.mode) {
      lines.push(`${indent}  <mode>${key.mode}</mode>`);
    }
  }

  lines.push(`${indent}</key>`);

  return lines;
}

function serializeTime(time: TimeSignature, indent: string): string[] {
  const lines: string[] = [];

  const symbolAttr = time.symbol ? ` symbol="${time.symbol}"` : '';
  lines.push(`${indent}<time${symbolAttr}>`);
  lines.push(`${indent}  <beats>${time.beats}</beats>`);
  lines.push(`${indent}  <beat-type>${time.beatType}</beat-type>`);
  lines.push(`${indent}</time>`);

  return lines;
}

function serializeClef(clef: Clef, indent: string): string[] {
  const lines: string[] = [];

  const numberAttr = clef.staff ? ` number="${clef.staff}"` : '';
  lines.push(`${indent}<clef${numberAttr}>`);
  lines.push(`${indent}  <sign>${clef.sign}</sign>`);
  lines.push(`${indent}  <line>${clef.line}</line>`);
  if (clef.clefOctaveChange !== undefined) {
    lines.push(`${indent}  <clef-octave-change>${clef.clefOctaveChange}</clef-octave-change>`);
  }
  lines.push(`${indent}</clef>`);

  return lines;
}

function serializeTranspose(transpose: Transpose, indent: string): string[] {
  const lines: string[] = [];

  lines.push(`${indent}<transpose>`);
  lines.push(`${indent}  <diatonic>${transpose.diatonic}</diatonic>`);
  lines.push(`${indent}  <chromatic>${transpose.chromatic}</chromatic>`);
  if (transpose.octaveChange !== undefined) {
    lines.push(`${indent}  <octave-change>${transpose.octaveChange}</octave-change>`);
  }
  lines.push(`${indent}</transpose>`);

  return lines;
}

function serializeEntry(entry: MeasureEntry, indent: string): string[] {
  switch (entry.type) {
    case 'note':
      return serializeNote(entry, indent);
    case 'backup':
      return serializeBackup(entry, indent);
    case 'forward':
      return serializeForward(entry, indent);
    case 'direction':
      return serializeDirection(entry, indent);
    case 'harmony':
      return serializeHarmony(entry, indent);
    case 'figured-bass':
      return serializeFiguredBass(entry, indent);
    default:
      return [];
  }
}

function serializeNote(note: NoteEntry, indent: string): string[] {
  const lines: string[] = [];

  // Build note attributes
  let noteAttrs = '';
  if (note.defaultX !== undefined) noteAttrs += ` default-x="${note.defaultX}"`;
  if (note.defaultY !== undefined) noteAttrs += ` default-y="${note.defaultY}"`;
  if (note.relativeX !== undefined) noteAttrs += ` relative-x="${note.relativeX}"`;
  if (note.relativeY !== undefined) noteAttrs += ` relative-y="${note.relativeY}"`;
  lines.push(`${indent}<note${noteAttrs}>`);

  // Grace note
  if (note.grace) {
    const slashAttr = note.grace.slash ? ' slash="yes"' : '';
    lines.push(`${indent}  <grace${slashAttr}/>`);
  }

  // Chord
  if (note.chord) {
    lines.push(`${indent}  <chord/>`);
  }

  // Pitch, rest, or unpitched
  if (note.pitch) {
    lines.push(...serializePitch(note.pitch, indent + '  '));
  } else if (note.rest) {
    let restAttrs = '';
    if (note.rest.measure) restAttrs += ' measure="yes"';
    if (note.rest.displayStep || note.rest.displayOctave !== undefined) {
      lines.push(`${indent}  <rest${restAttrs}>`);
      if (note.rest.displayStep) {
        lines.push(`${indent}    <display-step>${note.rest.displayStep}</display-step>`);
      }
      if (note.rest.displayOctave !== undefined) {
        lines.push(`${indent}    <display-octave>${note.rest.displayOctave}</display-octave>`);
      }
      lines.push(`${indent}  </rest>`);
    } else {
      lines.push(`${indent}  <rest${restAttrs}/>`);
    }
  } else if (note.unpitched) {
    if (note.unpitched.displayStep || note.unpitched.displayOctave !== undefined) {
      lines.push(`${indent}  <unpitched>`);
      if (note.unpitched.displayStep) {
        lines.push(`${indent}    <display-step>${note.unpitched.displayStep}</display-step>`);
      }
      if (note.unpitched.displayOctave !== undefined) {
        lines.push(`${indent}    <display-octave>${note.unpitched.displayOctave}</display-octave>`);
      }
      lines.push(`${indent}  </unpitched>`);
    } else {
      lines.push(`${indent}  <unpitched/>`);
    }
  } else {
    lines.push(`${indent}  <rest/>`);
  }

  // Duration (not for grace notes)
  if (!note.grace) {
    lines.push(`${indent}  <duration>${note.duration}</duration>`);
  }

  // Tie
  if (note.ties && note.ties.length > 0) {
    for (const tie of note.ties) {
      lines.push(`${indent}  <tie type="${tie.type}"/>`);
    }
  } else if (note.tie) {
    lines.push(`${indent}  <tie type="${note.tie.type}"/>`);
  }

  // Voice
  lines.push(`${indent}  <voice>${note.voice}</voice>`);

  // Type
  if (note.noteType) {
    lines.push(`${indent}  <type>${note.noteType}</type>`);
  }

  // Dots
  if (note.dots) {
    for (let i = 0; i < note.dots; i++) {
      lines.push(`${indent}  <dot/>`);
    }
  }

  // Accidental
  if (note.accidental) {
    let accAttrs = '';
    if (note.accidental.cautionary) accAttrs += ' cautionary="yes"';
    if (note.accidental.editorial) accAttrs += ' editorial="yes"';
    if (note.accidental.parentheses) accAttrs += ' parentheses="yes"';
    if (note.accidental.bracket) accAttrs += ' bracket="yes"';
    lines.push(`${indent}  <accidental${accAttrs}>${note.accidental.value}</accidental>`);
  }

  // Time modification
  if (note.timeModification) {
    lines.push(`${indent}  <time-modification>`);
    lines.push(`${indent}    <actual-notes>${note.timeModification.actualNotes}</actual-notes>`);
    lines.push(`${indent}    <normal-notes>${note.timeModification.normalNotes}</normal-notes>`);
    if (note.timeModification.normalType) {
      lines.push(`${indent}    <normal-type>${note.timeModification.normalType}</normal-type>`);
    }
    if (note.timeModification.normalDots) {
      for (let i = 0; i < note.timeModification.normalDots; i++) {
        lines.push(`${indent}    <normal-dot/>`);
      }
    }
    lines.push(`${indent}  </time-modification>`);
  }

  // Stem
  if (note.stem) {
    lines.push(`${indent}  <stem>${note.stem}</stem>`);
  }

  // Notehead
  if (note.notehead) {
    let nhAttrs = '';
    if (note.notehead.filled !== undefined) {
      nhAttrs += ` filled="${note.notehead.filled ? 'yes' : 'no'}"`;
    }
    if (note.notehead.parentheses) nhAttrs += ' parentheses="yes"';
    lines.push(`${indent}  <notehead${nhAttrs}>${note.notehead.value}</notehead>`);
  }

  // Staff
  if (note.staff !== undefined) {
    lines.push(`${indent}  <staff>${note.staff}</staff>`);
  }

  // Beam
  if (note.beam) {
    for (const beam of note.beam) {
      lines.push(...serializeBeam(beam, indent + '  '));
    }
  }

  // Notations
  if (note.notations && note.notations.length > 0) {
    lines.push(...serializeNotations(note.notations, indent + '  '));
  }

  // Lyrics
  if (note.lyrics) {
    for (const lyric of note.lyrics) {
      lines.push(...serializeLyric(lyric, indent + '  '));
    }
  }

  lines.push(`${indent}</note>`);

  return lines;
}

function serializePitch(pitch: Pitch, indent: string): string[] {
  const lines: string[] = [];

  lines.push(`${indent}<pitch>`);
  lines.push(`${indent}  <step>${pitch.step}</step>`);
  if (pitch.alter !== undefined && pitch.alter !== 0) {
    lines.push(`${indent}  <alter>${pitch.alter}</alter>`);
  }
  lines.push(`${indent}  <octave>${pitch.octave}</octave>`);
  lines.push(`${indent}</pitch>`);

  return lines;
}

function serializeBeam(beam: BeamInfo, indent: string): string[] {
  return [`${indent}<beam number="${beam.number}">${beam.type}</beam>`];
}

function serializeNotations(notations: Notation[], indent: string): string[] {
  const lines: string[] = [];

  lines.push(`${indent}<notations>`);

  // Group articulations, ornaments, and technical together
  const articulations: Notation[] = [];
  const ornaments: Notation[] = [];
  const technicals: Notation[] = [];
  const others: Notation[] = [];

  for (const notation of notations) {
    if (notation.type === 'articulation') {
      articulations.push(notation);
    } else if (notation.type === 'ornament') {
      ornaments.push(notation);
    } else if (notation.type === 'technical') {
      technicals.push(notation);
    } else {
      others.push(notation);
    }
  }

  // Serialize non-grouped notations first
  for (const notation of others) {
    if (notation.type === 'tied') {
      let attrs = ` type="${notation.tiedType}"`;
      if (notation.number !== undefined) attrs += ` number="${notation.number}"`;
      lines.push(`${indent}  <tied${attrs}/>`);
    } else if (notation.type === 'slur') {
      let attrs = '';
      if (notation.number !== undefined) attrs += ` number="${notation.number}"`;
      attrs += ` type="${notation.slurType}"`;
      if (notation.lineType) attrs += ` line-type="${notation.lineType}"`;
      if (notation.defaultX !== undefined) attrs += ` default-x="${notation.defaultX}"`;
      if (notation.defaultY !== undefined) attrs += ` default-y="${notation.defaultY}"`;
      if (notation.bezierX !== undefined) attrs += ` bezier-x="${notation.bezierX}"`;
      if (notation.bezierY !== undefined) attrs += ` bezier-y="${notation.bezierY}"`;
      if (notation.bezierX2 !== undefined) attrs += ` bezier-x2="${notation.bezierX2}"`;
      if (notation.bezierY2 !== undefined) attrs += ` bezier-y2="${notation.bezierY2}"`;
      if (notation.placement) attrs += ` placement="${notation.placement}"`;
      lines.push(`${indent}  <slur${attrs}/>`);
    } else if (notation.type === 'tuplet') {
      let attrs = ` type="${notation.tupletType}"`;
      if (notation.number !== undefined) attrs += ` number="${notation.number}"`;
      if (notation.bracket !== undefined) attrs += ` bracket="${notation.bracket ? 'yes' : 'no'}"`;
      if (notation.showNumber) attrs += ` show-number="${notation.showNumber}"`;
      if (notation.showType) attrs += ` show-type="${notation.showType}"`;

      const tup = notation as TupletNotation;
      if (tup.tupletActual || tup.tupletNormal) {
        lines.push(`${indent}  <tuplet${attrs}>`);
        if (tup.tupletActual) {
          lines.push(`${indent}    <tuplet-actual>`);
          if (tup.tupletActual.tupletNumber !== undefined) {
            lines.push(`${indent}      <tuplet-number>${tup.tupletActual.tupletNumber}</tuplet-number>`);
          }
          if (tup.tupletActual.tupletType) {
            lines.push(`${indent}      <tuplet-type>${tup.tupletActual.tupletType}</tuplet-type>`);
          }
          if (tup.tupletActual.tupletDots) {
            for (let i = 0; i < tup.tupletActual.tupletDots; i++) {
              lines.push(`${indent}      <tuplet-dot/>`);
            }
          }
          lines.push(`${indent}    </tuplet-actual>`);
        }
        if (tup.tupletNormal) {
          lines.push(`${indent}    <tuplet-normal>`);
          if (tup.tupletNormal.tupletNumber !== undefined) {
            lines.push(`${indent}      <tuplet-number>${tup.tupletNormal.tupletNumber}</tuplet-number>`);
          }
          if (tup.tupletNormal.tupletType) {
            lines.push(`${indent}      <tuplet-type>${tup.tupletNormal.tupletType}</tuplet-type>`);
          }
          if (tup.tupletNormal.tupletDots) {
            for (let i = 0; i < tup.tupletNormal.tupletDots; i++) {
              lines.push(`${indent}      <tuplet-dot/>`);
            }
          }
          lines.push(`${indent}    </tuplet-normal>`);
        }
        lines.push(`${indent}  </tuplet>`);
      } else {
        lines.push(`${indent}  <tuplet${attrs}/>`);
      }
    } else if (notation.type === 'dynamics') {
      const placementAttr = notation.placement ? ` placement="${notation.placement}"` : '';
      lines.push(`${indent}  <dynamics${placementAttr}>`);
      for (const dyn of notation.dynamics) {
        lines.push(`${indent}    <${dyn}/>`);
      }
      lines.push(`${indent}  </dynamics>`);
    } else if (notation.type === 'fermata') {
      let attrs = '';
      if (notation.fermataType) attrs += ` type="${notation.fermataType}"`;
      if (notation.placement) attrs += ` placement="${notation.placement}"`;
      if (notation.shape) {
        lines.push(`${indent}  <fermata${attrs}>${notation.shape}</fermata>`);
      } else {
        lines.push(`${indent}  <fermata${attrs}/>`);
      }
    } else if (notation.type === 'arpeggiate') {
      let attrs = '';
      if (notation.direction) attrs += ` direction="${notation.direction}"`;
      if (notation.number !== undefined) attrs += ` number="${notation.number}"`;
      lines.push(`${indent}  <arpeggiate${attrs}/>`);
    } else if (notation.type === 'glissando') {
      let attrs = ` type="${notation.glissandoType}"`;
      if (notation.number !== undefined) attrs += ` number="${notation.number}"`;
      if (notation.lineType) attrs += ` line-type="${notation.lineType}"`;
      if (notation.text) {
        lines.push(`${indent}  <glissando${attrs}>${escapeXml(notation.text)}</glissando>`);
      } else {
        lines.push(`${indent}  <glissando${attrs}/>`);
      }
    } else if (notation.type === 'slide') {
      let attrs = ` type="${notation.slideType}"`;
      if (notation.number !== undefined) attrs += ` number="${notation.number}"`;
      if (notation.lineType) attrs += ` line-type="${notation.lineType}"`;
      lines.push(`${indent}  <slide${attrs}/>`);
    }
  }

  // Serialize grouped articulations
  if (articulations.length > 0) {
    lines.push(`${indent}  <articulations>`);
    for (const art of articulations) {
      if (art.type === 'articulation') {
        const placementAttr = art.placement ? ` placement="${art.placement}"` : '';
        lines.push(`${indent}    <${art.articulation}${placementAttr}/>`);
      }
    }
    lines.push(`${indent}  </articulations>`);
  }

  // Serialize grouped ornaments
  if (ornaments.length > 0) {
    lines.push(`${indent}  <ornaments>`);
    for (const orn of ornaments) {
      if (orn.type === 'ornament') {
        const placementAttr = orn.placement ? ` placement="${orn.placement}"` : '';
        if (orn.ornament === 'wavy-line') {
          let wlAttrs = '';
          if (orn.wavyLineType) wlAttrs += ` type="${orn.wavyLineType}"`;
          if (orn.number !== undefined) wlAttrs += ` number="${orn.number}"`;
          wlAttrs += placementAttr;
          lines.push(`${indent}    <wavy-line${wlAttrs}/>`);
        } else if (orn.ornament === 'tremolo') {
          let tremAttrs = '';
          if (orn.tremoloType) tremAttrs += ` type="${orn.tremoloType}"`;
          tremAttrs += placementAttr;
          if (orn.tremoloMarks !== undefined) {
            lines.push(`${indent}    <tremolo${tremAttrs}>${orn.tremoloMarks}</tremolo>`);
          } else {
            lines.push(`${indent}    <tremolo${tremAttrs}/>`);
          }
        } else {
          lines.push(`${indent}    <${orn.ornament}${placementAttr}/>`);
        }
      }
    }
    lines.push(`${indent}  </ornaments>`);
  }

  // Serialize grouped technical
  if (technicals.length > 0) {
    lines.push(`${indent}  <technical>`);
    for (const tech of technicals) {
      if (tech.type === 'technical') {
        const placementAttr = tech.placement ? ` placement="${tech.placement}"` : '';
        lines.push(`${indent}    <${tech.technical}${placementAttr}/>`);
      }
    }
    lines.push(`${indent}  </technical>`);
  }

  lines.push(`${indent}</notations>`);

  return lines;
}

function serializeLyric(lyric: Lyric, indent: string): string[] {
  const lines: string[] = [];

  const numberAttr = lyric.number ? ` number="${lyric.number}"` : '';
  lines.push(`${indent}<lyric${numberAttr}>`);

  if (lyric.syllabic) {
    lines.push(`${indent}  <syllabic>${lyric.syllabic}</syllabic>`);
  }

  lines.push(`${indent}  <text>${escapeXml(lyric.text)}</text>`);

  if (lyric.extend) {
    lines.push(`${indent}  <extend/>`);
  }

  lines.push(`${indent}</lyric>`);

  return lines;
}

function serializeBackup(backup: BackupEntry, indent: string): string[] {
  return [
    `${indent}<backup>`,
    `${indent}  <duration>${backup.duration}</duration>`,
    `${indent}</backup>`,
  ];
}

function serializeForward(forward: ForwardEntry, indent: string): string[] {
  const lines: string[] = [];

  lines.push(`${indent}<forward>`);
  lines.push(`${indent}  <duration>${forward.duration}</duration>`);

  if (forward.voice !== undefined) {
    lines.push(`${indent}  <voice>${forward.voice}</voice>`);
  }

  if (forward.staff !== undefined) {
    lines.push(`${indent}  <staff>${forward.staff}</staff>`);
  }

  lines.push(`${indent}</forward>`);

  return lines;
}

function serializeDirection(direction: DirectionEntry, indent: string): string[] {
  const lines: string[] = [];

  const placementAttr = direction.placement ? ` placement="${direction.placement}"` : '';
  lines.push(`${indent}<direction${placementAttr}>`);

  for (const dirType of direction.directionTypes) {
    lines.push(...serializeDirectionType(dirType, indent + '  '));
  }

  if (direction.offset !== undefined) {
    lines.push(`${indent}  <offset>${direction.offset}</offset>`);
  }

  if (direction.staff !== undefined) {
    lines.push(`${indent}  <staff>${direction.staff}</staff>`);
  }

  if (direction.sound) {
    const attrs: string[] = [];
    if (direction.sound.tempo !== undefined) {
      attrs.push(`tempo="${direction.sound.tempo}"`);
    }
    if (direction.sound.dynamics !== undefined) {
      attrs.push(`dynamics="${direction.sound.dynamics}"`);
    }
    if (attrs.length > 0) {
      lines.push(`${indent}  <sound ${attrs.join(' ')}/>`);
    }
  }

  lines.push(`${indent}</direction>`);

  return lines;
}

function serializeDirectionType(dirType: DirectionType, indent: string): string[] {
  const lines: string[] = [];

  lines.push(`${indent}<direction-type>`);

  switch (dirType.kind) {
    case 'dynamics':
      lines.push(`${indent}  <dynamics>`);
      lines.push(`${indent}    <${dirType.value}/>`);
      lines.push(`${indent}  </dynamics>`);
      break;

    case 'wedge': {
      const spreadAttr = dirType.spread !== undefined ? ` spread="${dirType.spread}"` : '';
      lines.push(`${indent}  <wedge type="${dirType.type}"${spreadAttr}/>`);
      break;
    }

    case 'metronome':
      lines.push(`${indent}  <metronome>`);
      lines.push(`${indent}    <beat-unit>${dirType.beatUnit}</beat-unit>`);
      if (dirType.beatUnitDot) {
        lines.push(`${indent}    <beat-unit-dot/>`);
      }
      if (dirType.beatUnit2) {
        lines.push(`${indent}    <beat-unit>${dirType.beatUnit2}</beat-unit>`);
        if (dirType.beatUnitDot2) {
          lines.push(`${indent}    <beat-unit-dot/>`);
        }
      }
      lines.push(`${indent}    <per-minute>${dirType.perMinute}</per-minute>`);
      lines.push(`${indent}  </metronome>`);
      break;

    case 'words': {
      let wordAttrs = '';
      if (dirType.defaultX !== undefined) wordAttrs += ` default-x="${dirType.defaultX}"`;
      if (dirType.defaultY !== undefined) wordAttrs += ` default-y="${dirType.defaultY}"`;
      if (dirType.fontFamily) wordAttrs += ` font-family="${escapeXml(dirType.fontFamily)}"`;
      if (dirType.fontSize) wordAttrs += ` font-size="${escapeXml(dirType.fontSize)}"`;
      if (dirType.fontStyle) wordAttrs += ` font-style="${escapeXml(dirType.fontStyle)}"`;
      if (dirType.fontWeight) wordAttrs += ` font-weight="${escapeXml(dirType.fontWeight)}"`;
      lines.push(`${indent}  <words${wordAttrs}>${escapeXml(dirType.text)}</words>`);
      break;
    }

    case 'rehearsal': {
      let rehAttrs = '';
      if (dirType.enclosure) rehAttrs += ` enclosure="${escapeXml(dirType.enclosure)}"`;
      lines.push(`${indent}  <rehearsal${rehAttrs}>${escapeXml(dirType.text)}</rehearsal>`);
      break;
    }

    case 'bracket': {
      let bracketAttrs = ` type="${dirType.type}"`;
      if (dirType.number !== undefined) bracketAttrs += ` number="${dirType.number}"`;
      if (dirType.lineEnd) bracketAttrs += ` line-end="${dirType.lineEnd}"`;
      if (dirType.lineType) bracketAttrs += ` line-type="${dirType.lineType}"`;
      lines.push(`${indent}  <bracket${bracketAttrs}/>`);
      break;
    }

    case 'dashes': {
      let dashAttrs = ` type="${dirType.type}"`;
      if (dirType.number !== undefined) dashAttrs += ` number="${dirType.number}"`;
      lines.push(`${indent}  <dashes${dashAttrs}/>`);
      break;
    }

    case 'accordion-registration':
      lines.push(`${indent}  <accordion-registration>`);
      if (dirType.high) {
        lines.push(`${indent}    <accordion-high/>`);
      }
      if (dirType.middle !== undefined) {
        lines.push(`${indent}    <accordion-middle>${dirType.middle}</accordion-middle>`);
      }
      if (dirType.low) {
        lines.push(`${indent}    <accordion-low/>`);
      }
      lines.push(`${indent}  </accordion-registration>`);
      break;

    case 'other-direction':
      lines.push(`${indent}  <other-direction>${escapeXml(dirType.text)}</other-direction>`);
      break;

    case 'segno':
      lines.push(`${indent}  <segno/>`);
      break;

    case 'coda':
      lines.push(`${indent}  <coda/>`);
      break;

    case 'pedal':
      lines.push(`${indent}  <pedal type="${dirType.type}"/>`);
      break;

    case 'octave-shift': {
      const sizeAttr = dirType.size !== undefined ? ` size="${dirType.size}"` : '';
      lines.push(`${indent}  <octave-shift type="${dirType.type}"${sizeAttr}/>`);
      break;
    }
  }

  lines.push(`${indent}</direction-type>`);

  return lines;
}

function serializeBarline(barline: Barline, indent: string): string[] {
  const lines: string[] = [];

  lines.push(`${indent}<barline location="${barline.location}">`);

  if (barline.barStyle) {
    lines.push(`${indent}  <bar-style>${barline.barStyle}</bar-style>`);
  }

  if (barline.ending) {
    lines.push(`${indent}  <ending number="${barline.ending.number}" type="${barline.ending.type}"/>`);
  }

  if (barline.repeat) {
    const timesAttr = barline.repeat.times !== undefined ? ` times="${barline.repeat.times}"` : '';
    lines.push(`${indent}  <repeat direction="${barline.repeat.direction}"${timesAttr}/>`);
  }

  lines.push(`${indent}</barline>`);

  return lines;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ============================================================
// New Serialize Functions for Extended Support
// ============================================================

function serializeStaffDetails(sd: StaffDetails, indent: string): string[] {
  const lines: string[] = [];

  let attrs = '';
  if (sd.number !== undefined) attrs += ` number="${sd.number}"`;
  if (sd.showFrets) attrs += ` show-frets="${sd.showFrets}"`;
  lines.push(`${indent}<staff-details${attrs}>`);

  if (sd.staffType) {
    lines.push(`${indent}  <staff-type>${sd.staffType}</staff-type>`);
  }

  if (sd.staffLines !== undefined) {
    lines.push(`${indent}  <staff-lines>${sd.staffLines}</staff-lines>`);
  }

  if (sd.staffTuning) {
    for (const tuning of sd.staffTuning) {
      const tuningAttr = ` line="${tuning.line}"`;
      lines.push(`${indent}  <staff-tuning${tuningAttr}>`);
      lines.push(`${indent}    <tuning-step>${tuning.tuningStep}</tuning-step>`);
      if (tuning.tuningAlter !== undefined) {
        lines.push(`${indent}    <tuning-alter>${tuning.tuningAlter}</tuning-alter>`);
      }
      lines.push(`${indent}    <tuning-octave>${tuning.tuningOctave}</tuning-octave>`);
      lines.push(`${indent}  </staff-tuning>`);
    }
  }

  if (sd.capo !== undefined) {
    lines.push(`${indent}  <capo>${sd.capo}</capo>`);
  }

  if (sd.staffSize !== undefined) {
    lines.push(`${indent}  <staff-size>${sd.staffSize}</staff-size>`);
  }

  lines.push(`${indent}</staff-details>`);

  return lines;
}

function serializeMeasureStyle(ms: MeasureStyle, indent: string): string[] {
  const lines: string[] = [];

  const attrs = ms.number !== undefined ? ` number="${ms.number}"` : '';
  lines.push(`${indent}<measure-style${attrs}>`);

  if (ms.multipleRest !== undefined) {
    lines.push(`${indent}  <multiple-rest>${ms.multipleRest}</multiple-rest>`);
  }

  if (ms.measureRepeat) {
    let mrAttrs = ` type="${ms.measureRepeat.type}"`;
    if (ms.measureRepeat.slashes !== undefined) mrAttrs += ` slashes="${ms.measureRepeat.slashes}"`;
    lines.push(`${indent}  <measure-repeat${mrAttrs}/>`);
  }

  if (ms.beatRepeat) {
    let brAttrs = ` type="${ms.beatRepeat.type}"`;
    if (ms.beatRepeat.slashes !== undefined) brAttrs += ` slashes="${ms.beatRepeat.slashes}"`;
    lines.push(`${indent}  <beat-repeat${brAttrs}/>`);
  }

  if (ms.slash) {
    let slAttrs = ` type="${ms.slash.type}"`;
    if (ms.slash.useDots) slAttrs += ' use-dots="yes"';
    if (ms.slash.useStems) slAttrs += ' use-stems="yes"';
    lines.push(`${indent}  <slash${slAttrs}/>`);
  }

  lines.push(`${indent}</measure-style>`);

  return lines;
}

function serializeHarmony(harmony: HarmonyEntry, indent: string): string[] {
  const lines: string[] = [];

  let attrs = '';
  if (harmony.placement) attrs += ` placement="${harmony.placement}"`;
  lines.push(`${indent}<harmony${attrs}>`);

  // Root
  lines.push(`${indent}  <root>`);
  lines.push(`${indent}    <root-step>${harmony.root.rootStep}</root-step>`);
  if (harmony.root.rootAlter !== undefined) {
    lines.push(`${indent}    <root-alter>${harmony.root.rootAlter}</root-alter>`);
  }
  lines.push(`${indent}  </root>`);

  // Kind
  let kindAttrs = '';
  if (harmony.kindText) kindAttrs += ` text="${escapeXml(harmony.kindText)}"`;
  lines.push(`${indent}  <kind${kindAttrs}>${escapeXml(harmony.kind)}</kind>`);

  // Bass
  if (harmony.bass) {
    lines.push(`${indent}  <bass>`);
    lines.push(`${indent}    <bass-step>${harmony.bass.bassStep}</bass-step>`);
    if (harmony.bass.bassAlter !== undefined) {
      lines.push(`${indent}    <bass-alter>${harmony.bass.bassAlter}</bass-alter>`);
    }
    lines.push(`${indent}  </bass>`);
  }

  // Degrees
  if (harmony.degrees) {
    for (const deg of harmony.degrees) {
      lines.push(`${indent}  <degree>`);
      lines.push(`${indent}    <degree-value>${deg.degreeValue}</degree-value>`);
      if (deg.degreeAlter !== undefined) {
        lines.push(`${indent}    <degree-alter>${deg.degreeAlter}</degree-alter>`);
      }
      lines.push(`${indent}    <degree-type>${deg.degreeType}</degree-type>`);
      lines.push(`${indent}  </degree>`);
    }
  }

  // Frame
  if (harmony.frame) {
    lines.push(`${indent}  <frame>`);
    if (harmony.frame.frameStrings !== undefined) {
      lines.push(`${indent}    <frame-strings>${harmony.frame.frameStrings}</frame-strings>`);
    }
    if (harmony.frame.frameFrets !== undefined) {
      lines.push(`${indent}    <frame-frets>${harmony.frame.frameFrets}</frame-frets>`);
    }
    if (harmony.frame.frameNotes) {
      for (const fn of harmony.frame.frameNotes) {
        lines.push(`${indent}    <frame-note>`);
        lines.push(`${indent}      <string>${fn.string}</string>`);
        lines.push(`${indent}      <fret>${fn.fret}</fret>`);
        if (fn.fingering) {
          lines.push(`${indent}      <fingering>${escapeXml(fn.fingering)}</fingering>`);
        }
        if (fn.barre) {
          lines.push(`${indent}      <barre type="${fn.barre}"/>`);
        }
        lines.push(`${indent}    </frame-note>`);
      }
    }
    lines.push(`${indent}  </frame>`);
  }

  // Offset
  if (harmony.offset !== undefined) {
    lines.push(`${indent}  <offset>${harmony.offset}</offset>`);
  }

  // Staff
  if (harmony.staff !== undefined) {
    lines.push(`${indent}  <staff>${harmony.staff}</staff>`);
  }

  lines.push(`${indent}</harmony>`);

  return lines;
}

function serializeFiguredBass(fb: FiguredBassEntry, indent: string): string[] {
  const lines: string[] = [];

  let attrs = '';
  if (fb.parentheses) attrs += ' parentheses="yes"';
  lines.push(`${indent}<figured-bass${attrs}>`);

  for (const fig of fb.figures) {
    lines.push(`${indent}  <figure>`);
    if (fig.prefix) {
      lines.push(`${indent}    <prefix>${escapeXml(fig.prefix)}</prefix>`);
    }
    if (fig.figureNumber) {
      lines.push(`${indent}    <figure-number>${escapeXml(fig.figureNumber)}</figure-number>`);
    }
    if (fig.suffix) {
      lines.push(`${indent}    <suffix>${escapeXml(fig.suffix)}</suffix>`);
    }
    if (fig.extend) {
      lines.push(`${indent}    <extend/>`);
    }
    lines.push(`${indent}  </figure>`);
  }

  if (fb.duration !== undefined) {
    lines.push(`${indent}  <duration>${fb.duration}</duration>`);
  }

  lines.push(`${indent}</figured-bass>`);

  return lines;
}
