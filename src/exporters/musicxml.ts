import type {
  Score,
  ScoreMetadata,
  PartInfo,
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
  if (metadata.creator || metadata.rights || metadata.encoding) {
    lines.push(`${indent}<identification>`);

    if (metadata.creator) {
      if (metadata.creator.composer) {
        lines.push(`${indent}${indent}<creator type="composer">${escapeXml(metadata.creator.composer)}</creator>`);
      }
      if (metadata.creator.lyricist) {
        lines.push(`${indent}${indent}<creator type="lyricist">${escapeXml(metadata.creator.lyricist)}</creator>`);
      }
      if (metadata.creator.arranger) {
        lines.push(`${indent}${indent}<creator type="arranger">${escapeXml(metadata.creator.arranger)}</creator>`);
      }
    }

    if (metadata.rights) {
      lines.push(`${indent}${indent}<rights>${escapeXml(metadata.rights)}</rights>`);
    }

    if (metadata.encoding) {
      lines.push(`${indent}${indent}<encoding>`);
      if (metadata.encoding.software) {
        lines.push(`${indent}${indent}${indent}<software>${escapeXml(metadata.encoding.software)}</software>`);
      }
      if (metadata.encoding.encodingDate) {
        lines.push(`${indent}${indent}${indent}<encoding-date>${escapeXml(metadata.encoding.encodingDate)}</encoding-date>`);
      }
      lines.push(`${indent}${indent}</encoding>`);
    }

    lines.push(`${indent}</identification>`);
  }

  return lines;
}

function serializePartList(partList: PartInfo[], indent: string): string[] {
  const lines: string[] = [];

  lines.push(`${indent}<part-list>`);

  for (const part of partList) {
    lines.push(`${indent}${indent}<score-part id="${escapeXml(part.id)}">`);
    lines.push(`${indent}${indent}${indent}<part-name>${escapeXml(part.name)}</part-name>`);

    if (part.abbreviation) {
      lines.push(`${indent}${indent}${indent}<part-abbreviation>${escapeXml(part.abbreviation)}</part-abbreviation>`);
    }

    if (part.midiInstrument) {
      lines.push(`${indent}${indent}${indent}<midi-instrument id="${escapeXml(part.id)}-I1">`);
      lines.push(`${indent}${indent}${indent}${indent}<midi-channel>${part.midiInstrument.channel}</midi-channel>`);
      lines.push(`${indent}${indent}${indent}${indent}<midi-program>${part.midiInstrument.program}</midi-program>`);
      if (part.midiInstrument.volume !== undefined) {
        lines.push(`${indent}${indent}${indent}${indent}<volume>${part.midiInstrument.volume}</volume>`);
      }
      if (part.midiInstrument.pan !== undefined) {
        lines.push(`${indent}${indent}${indent}${indent}<pan>${part.midiInstrument.pan}</pan>`);
      }
      lines.push(`${indent}${indent}${indent}</midi-instrument>`);
    }

    lines.push(`${indent}${indent}</score-part>`);
  }

  lines.push(`${indent}</part-list>`);

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

  lines.push(`${indent}<measure number="${measure.number}">`);

  // Attributes
  if (measure.attributes) {
    lines.push(...serializeAttributes(measure.attributes, indent + '  '));
  }

  // Entries
  for (const entry of measure.entries) {
    lines.push(...serializeEntry(entry, indent + '  '));
  }

  // Barline
  if (measure.barline) {
    lines.push(...serializeBarline(measure.barline, indent + '  '));
  }

  lines.push(`${indent}</measure>`);

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

  lines.push(`${indent}</attributes>`);

  return lines;
}

function serializeKey(key: KeySignature, indent: string): string[] {
  const lines: string[] = [];

  lines.push(`${indent}<key>`);
  lines.push(`${indent}  <fifths>${key.fifths}</fifths>`);
  if (key.mode) {
    lines.push(`${indent}  <mode>${key.mode}</mode>`);
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
    default:
      return [];
  }
}

function serializeNote(note: NoteEntry, indent: string): string[] {
  const lines: string[] = [];

  lines.push(`${indent}<note>`);

  // Grace note
  if (note.grace) {
    const slashAttr = note.grace.slash ? ' slash="yes"' : '';
    lines.push(`${indent}  <grace${slashAttr}/>`);
  }

  // Chord
  if (note.chord) {
    lines.push(`${indent}  <chord/>`);
  }

  // Pitch or rest
  if (note.pitch) {
    lines.push(...serializePitch(note.pitch, indent + '  '));
  } else {
    lines.push(`${indent}  <rest/>`);
  }

  // Duration (not for grace notes)
  if (!note.grace) {
    lines.push(`${indent}  <duration>${note.duration}</duration>`);
  }

  // Tie
  if (note.tie) {
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
    lines.push(`${indent}  <accidental>${note.accidental}</accidental>`);
  }

  // Time modification
  if (note.timeModification) {
    lines.push(`${indent}  <time-modification>`);
    lines.push(`${indent}    <actual-notes>${note.timeModification.actualNotes}</actual-notes>`);
    lines.push(`${indent}    <normal-notes>${note.timeModification.normalNotes}</normal-notes>`);
    if (note.timeModification.normalType) {
      lines.push(`${indent}    <normal-type>${note.timeModification.normalType}</normal-type>`);
    }
    lines.push(`${indent}  </time-modification>`);
  }

  // Stem
  if (note.stem) {
    lines.push(`${indent}  <stem>${note.stem}</stem>`);
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

  for (const notation of notations) {
    if (notation.type === 'tied') {
      const typeAttr = notation.startStop ? ` type="${notation.startStop}"` : '';
      lines.push(`${indent}  <tied${typeAttr}/>`);
    } else if (notation.type === 'slur') {
      const typeAttr = notation.startStop ? ` type="${notation.startStop}"` : '';
      const numberAttr = notation.number ? ` number="${notation.number}"` : '';
      lines.push(`${indent}  <slur${numberAttr}${typeAttr}/>`);
    } else if (notation.type === 'fermata') {
      lines.push(`${indent}  <fermata/>`);
    } else if (notation.type === 'arpeggiate') {
      lines.push(`${indent}  <arpeggiate/>`);
    } else if (isArticulation(notation.type)) {
      lines.push(`${indent}  <articulations>`);
      lines.push(`${indent}    <${notation.type}/>`);
      lines.push(`${indent}  </articulations>`);
    } else if (isOrnament(notation.type)) {
      lines.push(`${indent}  <ornaments>`);
      lines.push(`${indent}    <${notation.type}/>`);
      lines.push(`${indent}  </ornaments>`);
    } else if (isTechnical(notation.type)) {
      lines.push(`${indent}  <technical>`);
      lines.push(`${indent}    <${notation.type}/>`);
      lines.push(`${indent}  </technical>`);
    }
  }

  lines.push(`${indent}</notations>`);

  return lines;
}

function isArticulation(type: string): boolean {
  return ['accent', 'strong-accent', 'staccato', 'staccatissimo', 'tenuto', 'detached-legato', 'marcato'].includes(type);
}

function isOrnament(type: string): boolean {
  return ['trill-mark', 'mordent', 'inverted-mordent', 'turn', 'inverted-turn'].includes(type);
}

function isTechnical(type: string): boolean {
  return ['up-bow', 'down-bow', 'pizzicato', 'harmonic'].includes(type);
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
      lines.push(`${indent}    <per-minute>${dirType.perMinute}</per-minute>`);
      lines.push(`${indent}  </metronome>`);
      break;

    case 'words':
      lines.push(`${indent}  <words>${escapeXml(dirType.text)}</words>`);
      break;

    case 'rehearsal':
      lines.push(`${indent}  <rehearsal>${escapeXml(dirType.text)}</rehearsal>`);
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
