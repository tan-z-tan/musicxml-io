import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  parse,
  serialize,
  setColor,
  clearColors,
  ALL_COLOR_TARGETS,
  type Score,
  type NoteEntry,
  type DirectionEntry,
  type HarmonyEntry,
  type FiguredBassEntry,
  type PartGroup,
} from '../src';

const RED = '#FF0000';
const BLUE = '#0000FF';
const GREEN = '#00FF00';
/** MusicXML also allows an alpha channel: #AARRGGBB. */
const TRANSLUCENT_RED = '#80FF0000';

/**
 * Wrap measure content in a minimal score-partwise document.
 */
function scoreXml(measureBody: string, opts: { partList?: string; extra?: string } = {}): string {
  const partList = opts.partList ?? `
    <score-part id="P1">
      <part-name>Music</part-name>
    </score-part>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  ${opts.extra ?? ''}
  <part-list>${partList}
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
      </attributes>
${measureBody}
    </measure>
  </part>
</score-partwise>`;
}

/** Parse → serialize → parse, so we assert the colour survives both directions. */
function roundtrip(xml: string): { first: Score; second: Score; xml: string } {
  const first = parse(xml);
  const serialized = serialize(first);
  return { first, second: parse(serialized), xml: serialized };
}

function firstNote(score: Score): NoteEntry {
  const note = score.parts[0].measures[0].entries.find(e => e.type === 'note');
  if (!note || note.type !== 'note') throw new Error('no note in measure');
  return note;
}

function firstDirection(score: Score): DirectionEntry {
  const dir = score.parts[0].measures[0].entries.find(e => e.type === 'direction');
  if (!dir || dir.type !== 'direction') throw new Error('no direction in measure');
  return dir;
}

describe('Color: note-level elements', () => {
  const NOTE_XML = scoreXml(`      <note color="${RED}">
        <pitch><step>C</step><alter>1</alter><octave>4</octave></pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type color="${BLUE}">eighth</type>
        <dot color="${GREEN}"/>
        <accidental color="${RED}">sharp</accidental>
        <stem color="${BLUE}">up</stem>
        <notehead color="${GREEN}">diamond</notehead>
        <beam number="1" color="${RED}">begin</beam>
      </note>`);

  it('parses colour on note, type, dot, accidental, stem, notehead and beam', () => {
    const note = firstNote(parse(NOTE_XML));

    expect(note.color).toBe(RED);
    expect(note.noteTypeColor).toBe(BLUE);
    expect(note.dotColor).toBe(GREEN);
    expect(note.accidental?.color).toBe(RED);
    expect(note.stem?.color).toBe(BLUE);
    expect(note.notehead?.color).toBe(GREEN);
    expect(note.beam?.[0].color).toBe(RED);
  });

  it('round-trips every note-level colour', () => {
    const { second } = roundtrip(NOTE_XML);
    const note = second.parts[0].measures[0].entries[0] as NoteEntry;

    expect(note.color).toBe(RED);
    expect(note.noteTypeColor).toBe(BLUE);
    expect(note.dotColor).toBe(GREEN);
    expect(note.accidental?.color).toBe(RED);
    expect(note.stem?.color).toBe(BLUE);
    expect(note.notehead?.color).toBe(GREEN);
    expect(note.beam?.[0].color).toBe(RED);
  });

  it('preserves the ARGB form of a colour verbatim', () => {
    const xml = scoreXml(`      <note color="${TRANSLUCENT_RED}">
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>4</duration>
        <type>whole</type>
      </note>`);
    const { second, xml: serialized } = roundtrip(xml);

    expect(serialized).toContain(`color="${TRANSLUCENT_RED}"`);
    expect(firstNote(second).color).toBe(TRANSLUCENT_RED);
  });

  it('leaves uncoloured notes without a color attribute', () => {
    const xml = scoreXml(`      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>4</duration>
        <type>whole</type>
      </note>`);
    const { second, xml: serialized } = roundtrip(xml);

    expect(serialized).not.toContain('color=');
    expect(firstNote(second).color).toBeUndefined();
  });
});

describe('Color: notations', () => {
  const NOTATIONS_XML = scoreXml(`      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>2</duration>
        <type>half</type>
        <notations>
          <tied type="start" color="${RED}"/>
          <slur number="1" type="start" color="${BLUE}"/>
          <articulations>
            <staccato color="${GREEN}"/>
            <accent color="${RED}"/>
          </articulations>
          <ornaments>
            <trill-mark color="${BLUE}"/>
            <tremolo type="single" color="${GREEN}">3</tremolo>
            <wavy-line type="start" color="${RED}"/>
            <accidental-mark color="${BLUE}">sharp</accidental-mark>
          </ornaments>
          <technical>
            <fingering color="${GREEN}">3</fingering>
            <up-bow color="${RED}"/>
          </technical>
          <dynamics color="${BLUE}"><ff/></dynamics>
          <fermata color="${GREEN}">normal</fermata>
          <arpeggiate color="${RED}"/>
          <glissando type="start" color="${BLUE}"/>
          <slide type="start" color="${GREEN}"/>
        </notations>
      </note>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>2</duration>
        <type>half</type>
        <notations>
          <non-arpeggiate type="bottom" color="${RED}"/>
          <accidental-mark color="${GREEN}">flat</accidental-mark>
        </notations>
      </note>`);

  it('round-trips colour on every notation that supports it', () => {
    const { second } = roundtrip(NOTATIONS_XML);
    const entries = second.parts[0].measures[0].entries.filter(e => e.type === 'note') as NoteEntry[];
    const notations = [...(entries[0].notations ?? []), ...(entries[1].notations ?? [])];

    // Every notation parsed here carries a colour, so none may be lost.
    expect(notations.length).toBeGreaterThan(0);
    for (const notation of notations) {
      expect(notation.color, `${notation.type} lost its colour`).toBeDefined();
    }

    const byType = (t: string) => notations.find(n => n.type === t);
    expect(byType('tied')?.color).toBe(RED);
    expect(byType('slur')?.color).toBe(BLUE);
    expect(byType('dynamics')?.color).toBe(BLUE);
    expect(byType('fermata')?.color).toBe(GREEN);
    expect(byType('arpeggiate')?.color).toBe(RED);
    expect(byType('glissando')?.color).toBe(BLUE);
    expect(byType('slide')?.color).toBe(GREEN);
    expect(byType('non-arpeggiate')?.color).toBe(RED);
    expect(byType('accidental-mark')?.color).toBe(GREEN);
  });

  it('keeps the ornament accidental-mark colour', () => {
    const { second, xml } = roundtrip(NOTATIONS_XML);
    const note = second.parts[0].measures[0].entries[0] as NoteEntry;
    const ornament = note.notations?.find(n => n.type === 'ornament' && n.accidentalMarks);

    expect(xml).toContain(`<accidental-mark color="${BLUE}">sharp</accidental-mark>`);
    expect(
      ornament && ornament.type === 'ornament' ? ornament.accidentalMarks?.[0].color : undefined
    ).toBe(BLUE);
  });

  it('does not write a color attribute on <tuplet>, which has none in the schema', () => {
    const score = parse(scoreXml(`      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1</duration>
        <type>eighth</type>
        <time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>
        <notations><tuplet type="start" number="1"/></notations>
      </note>`));
    const note = firstNote(score);
    const tuplet = note.notations?.find(n => n.type === 'tuplet');
    if (tuplet) tuplet.color = RED;

    expect(serialize(score)).not.toMatch(/<tuplet[^>]*color=/);
  });
});

describe('Color: lyrics', () => {
  it('round-trips lyric, text and extend colours', () => {
    const xml = scoreXml(`      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>4</duration>
        <type>whole</type>
        <lyric number="1" color="${RED}">
          <syllabic>single</syllabic>
          <text color="${BLUE}">la</text>
          <extend type="start" color="${GREEN}"/>
        </lyric>
      </note>`);
    const { second, xml: serialized } = roundtrip(xml);
    const lyric = firstNote(second).lyrics?.[0];

    expect(lyric?.color).toBe(RED);
    expect(lyric?.textColor).toBe(BLUE);
    expect(typeof lyric?.extend === 'object' ? lyric.extend.color : undefined).toBe(GREEN);
    expect(serialized).toContain(`<text color="${BLUE}">la</text>`);
  });

  it('keeps per-element colours across an elision', () => {
    const xml = scoreXml(`      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>4</duration>
        <type>whole</type>
        <lyric number="1">
          <syllabic>single</syllabic>
          <text color="${RED}">a</text>
          <elision/>
          <text color="${BLUE}">b</text>
        </lyric>
      </note>`);
    const { second } = roundtrip(xml);
    const lyric = firstNote(second).lyrics?.[0];

    expect(lyric?.textElements?.map(t => t.color)).toEqual([RED, BLUE]);
  });
});

describe('Color: directions', () => {
  const DIRECTIONS_XML = scoreXml(`      <direction placement="above">
        <direction-type><words color="${RED}">dolce</words></direction-type>
      </direction>
      <direction>
        <direction-type><dynamics color="${BLUE}"><p/></dynamics></direction-type>
      </direction>
      <direction>
        <direction-type><wedge type="crescendo" color="${GREEN}"/></direction-type>
      </direction>
      <direction>
        <direction-type><metronome color="${RED}"><beat-unit>quarter</beat-unit><per-minute>120</per-minute></metronome></direction-type>
      </direction>
      <direction>
        <direction-type><rehearsal color="${BLUE}">A</rehearsal></direction-type>
      </direction>
      <direction>
        <direction-type><segno color="${GREEN}"/></direction-type>
      </direction>
      <direction>
        <direction-type><coda color="${RED}"/></direction-type>
      </direction>
      <direction>
        <direction-type><pedal type="start" color="${BLUE}"/></direction-type>
      </direction>
      <direction>
        <direction-type><octave-shift type="down" size="8" color="${GREEN}"/></direction-type>
      </direction>
      <direction>
        <direction-type><bracket type="start" line-end="down" color="${RED}"/></direction-type>
      </direction>
      <direction>
        <direction-type><dashes type="start" color="${BLUE}"/></direction-type>
      </direction>
      <direction>
        <direction-type><eyeglasses color="${GREEN}"/></direction-type>
      </direction>
      <direction>
        <direction-type><damp color="${RED}"/></direction-type>
      </direction>
      <direction>
        <direction-type><damp-all color="${BLUE}"/></direction-type>
      </direction>
      <direction>
        <direction-type><accordion-registration color="${GREEN}"><accordion-high/></accordion-registration></direction-type>
      </direction>
      <direction>
        <direction-type><harp-pedals color="${RED}"><pedal-tuning><pedal-step>D</pedal-step><pedal-alter>0</pedal-alter></pedal-tuning></harp-pedals></direction-type>
      </direction>
      <direction>
        <direction-type><scordatura color="${BLUE}"><accord string="1"><tuning-step>E</tuning-step><tuning-octave>5</tuning-octave></accord></scordatura></direction-type>
      </direction>
      <direction>
        <direction-type><other-direction color="${GREEN}">custom</other-direction></direction-type>
      </direction>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>4</duration>
        <type>whole</type>
      </note>`);

  it('round-trips colour on every colourable direction-type', () => {
    const { second } = roundtrip(DIRECTIONS_XML);
    const dirTypes = second.parts[0].measures[0].entries
      .filter((e): e is DirectionEntry => e.type === 'direction')
      .flatMap(d => d.directionTypes);

    expect(dirTypes.length).toBe(18);
    for (const dirType of dirTypes) {
      expect(
        (dirType as { color?: string }).color,
        `direction-type "${dirType.kind}" lost its colour`
      ).toBeDefined();
    }
  });

  it('keeps the words colour it already supported', () => {
    const { second } = roundtrip(DIRECTIONS_XML);
    const words = firstDirection(second).directionTypes[0];

    expect(words.kind).toBe('words');
    expect((words as { color?: string }).color).toBe(RED);
  });
});

describe('Color: attributes, barlines, harmony and figured bass', () => {
  it('round-trips key, time and clef colours', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Music</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <key color="${RED}"><fifths>2</fifths></key>
        <time color="${BLUE}"><beats>3</beats><beat-type>4</beat-type></time>
        <clef color="${GREEN}"><sign>G</sign><line>2</line></clef>
        <measure-style color="${RED}"><multiple-rest>4</multiple-rest></measure-style>
      </attributes>
    </measure>
  </part>
</score-partwise>`;
    const { second } = roundtrip(xml);
    const attrs = second.parts[0].measures[0].attributes!;

    expect(attrs.key?.color).toBe(RED);
    expect(attrs.time?.color).toBe(BLUE);
    expect(attrs.clef?.[0].color).toBe(GREEN);
    expect(attrs.measureStyle?.[0].color).toBe(RED);
  });

  it('round-trips bar-style and ending colours', () => {
    const xml = scoreXml(`      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>4</duration>
        <type>whole</type>
      </note>
      <barline location="right">
        <bar-style color="${RED}">light-heavy</bar-style>
        <ending number="1" type="stop" color="${BLUE}"/>
      </barline>`);
    const { second, xml: serialized } = roundtrip(xml);
    const barline = second.parts[0].measures[0].barlines?.[0];

    expect(barline?.barStyleColor).toBe(RED);
    expect(barline?.ending?.color).toBe(BLUE);
    expect(serialized).toContain(`<bar-style color="${RED}">light-heavy</bar-style>`);
  });

  it('round-trips harmony, kind, frame and figured-bass colours', () => {
    const xml = scoreXml(`      <harmony color="${RED}">
        <root><root-step>C</root-step></root>
        <kind color="${BLUE}">major</kind>
        <frame color="${GREEN}">
          <frame-strings>6</frame-strings>
          <frame-frets>4</frame-frets>
        </frame>
      </harmony>
      <figured-bass color="${RED}">
        <figure>
          <figure-number>6</figure-number>
          <extend type="start" color="${BLUE}"/>
        </figure>
      </figured-bass>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>4</duration>
        <type>whole</type>
      </note>`);
    const { second } = roundtrip(xml);
    const entries = second.parts[0].measures[0].entries;
    const harmony = entries.find((e): e is HarmonyEntry => e.type === 'harmony')!;
    const figuredBass = entries.find((e): e is FiguredBassEntry => e.type === 'figured-bass')!;
    const extend = figuredBass.figures[0].extend;

    expect(harmony.color).toBe(RED);
    expect(harmony.kindColor).toBe(BLUE);
    expect(harmony.frame?.color).toBe(GREEN);
    expect(figuredBass.color).toBe(RED);
    expect(typeof extend === 'object' ? extend.color : undefined).toBe(BLUE);
  });
});

describe('Color: header elements', () => {
  it('round-trips part-list, credit and display-text colours', () => {
    const xml = scoreXml(`      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>4</duration>
        <type>whole</type>
      </note>`, {
      extra: `<credit page="1"><credit-words color="${RED}">Title</credit-words></credit>`,
      partList: `
    <part-group type="start" number="1">
      <group-name color="${RED}">Strings</group-name>
      <group-abbreviation color="${BLUE}">Str.</group-abbreviation>
      <group-symbol color="${GREEN}">bracket</group-symbol>
    </part-group>
    <score-part id="P1">
      <part-name color="${BLUE}">Violin</part-name>
      <part-name-display><display-text color="${GREEN}">Vln.</display-text></part-name-display>
      <part-abbreviation color="${RED}">Vln.</part-abbreviation>
    </score-part>
    <part-group type="stop" number="1"/>`,
    });
    const { second } = roundtrip(xml);
    const group = second.partList.find((e): e is PartGroup => e.type === 'part-group')!;
    const part = second.partList.find(e => e.type === 'score-part')!;

    expect(second.credits?.[0].creditWords?.[0].color).toBe(RED);
    expect(group.groupNameColor).toBe(RED);
    expect(group.groupAbbreviationColor).toBe(BLUE);
    expect(group.groupSymbolColor).toBe(GREEN);
    expect(part.type === 'score-part' && part.nameColor).toBe(BLUE);
    expect(part.type === 'score-part' && part.abbreviationColor).toBe(RED);
    expect(part.type === 'score-part' && part.partNameDisplay?.[0].color).toBe(GREEN);
  });
});

describe('Color: fixture', () => {
  it('keeps every color attribute of the color-elements fixture', () => {
    const path = join(__dirname, 'fixtures', 'color-elements.musicxml');
    const source = readFileSync(path, 'utf8');
    const serialized = serialize(parse(source));

    const count = (s: string) => (s.match(/\scolor="[^"]*"/g) ?? []).length;
    expect(count(source)).toBeGreaterThan(0);
    expect(count(serialized)).toBe(count(source));
  });
});

// ============================================================
// Operations
// ============================================================

const OPERATIONS_XML = scoreXml(`      <direction placement="above">
        <direction-type><words>dolce</words></direction-type>
      </direction>
      <harmony>
        <root><root-step>C</root-step></root>
        <kind>major</kind>
      </harmony>
      <note>
        <pitch><step>C</step><alter>1</alter><octave>4</octave></pitch>
        <duration>1</duration>
        <type>eighth</type>
        <dot/>
        <accidental>sharp</accidental>
        <stem>up</stem>
        <notehead>normal</notehead>
        <beam number="1">begin</beam>
        <lyric number="1"><syllabic>single</syllabic><text>la</text></lyric>
        <notations><articulations><staccato/></articulations></notations>
      </note>
      <note>
        <rest/>
        <duration>3</duration>
        <type>half</type>
        <dot/>
      </note>
      <barline location="right"><bar-style>light-heavy</bar-style></barline>`);

describe('setColor', () => {
  it('colours the <note> elements by default and leaves the rest alone', () => {
    const score = parse(OPERATIONS_XML);
    const colored = setColor(score, { color: RED });
    const notes = colored.parts[0].measures[0].entries.filter((e): e is NoteEntry => e.type === 'note');

    expect(notes.map(n => n.color)).toEqual([RED, RED]);
    expect(notes[0].stem?.color).toBeUndefined();
    expect(notes[0].notehead?.color).toBeUndefined();
  });

  it('colours rests as well as pitched notes', () => {
    const colored = setColor(parse(OPERATIONS_XML), { color: RED });
    const rest = colored.parts[0].measures[0].entries
      .filter((e): e is NoteEntry => e.type === 'note')
      .find(n => n.rest);

    expect(rest?.color).toBe(RED);
  });

  it('does not mutate the input score', () => {
    const score = parse(OPERATIONS_XML);
    setColor(score, { color: RED, targets: [...ALL_COLOR_TARGETS] });

    expect(firstNote(score).color).toBeUndefined();
  });

  it('colours the requested note sub-elements', () => {
    const colored = setColor(parse(OPERATIONS_XML), {
      color: BLUE,
      targets: ['notehead', 'stem', 'beam', 'accidental', 'dot', 'noteType', 'notation', 'lyric'],
    });
    const note = firstNote(colored);

    expect(note.color).toBeUndefined();
    expect(note.notehead?.color).toBe(BLUE);
    expect(note.stem?.color).toBe(BLUE);
    expect(note.beam?.[0].color).toBe(BLUE);
    expect(note.accidental?.color).toBe(BLUE);
    expect(note.dotColor).toBe(BLUE);
    expect(note.noteTypeColor).toBe(BLUE);
    expect(note.notations?.[0].color).toBe(BLUE);
    expect(note.lyrics?.[0].color).toBe(BLUE);
    expect(note.lyrics?.[0].textColor).toBe(BLUE);
  });

  it('colours directions, harmony, attributes and barlines', () => {
    const colored = setColor(parse(OPERATIONS_XML), {
      color: GREEN,
      targets: ['direction', 'harmony', 'clef', 'key', 'time', 'barline'],
    });
    const measure = colored.parts[0].measures[0];
    const direction = measure.entries.find((e): e is DirectionEntry => e.type === 'direction')!;
    const harmony = measure.entries.find((e): e is HarmonyEntry => e.type === 'harmony')!;

    expect((direction.directionTypes[0] as { color?: string }).color).toBe(GREEN);
    expect(harmony.color).toBe(GREEN);
    expect(harmony.kindColor).toBe(GREEN);
    expect(measure.barlines?.[0].barStyleColor).toBe(GREEN);
  });

  it('honours noteFilter', () => {
    const score = parse(OPERATIONS_XML);
    const target = firstNote(score);
    const colored = setColor(score, { color: RED, noteFilter: n => n._id === target._id });
    const notes = colored.parts[0].measures[0].entries.filter((e): e is NoteEntry => e.type === 'note');

    expect(notes[0].color).toBe(RED);
    expect(notes[1].color).toBeUndefined();
  });

  it('honours partIndices, partIds and measureNumbers', () => {
    const score = parse(OPERATIONS_XML);

    expect(firstNote(setColor(score, { color: RED, partIndices: [1] })).color).toBeUndefined();
    expect(firstNote(setColor(score, { color: RED, partIndices: [0] })).color).toBe(RED);
    expect(firstNote(setColor(score, { color: RED, partIds: ['P2'] })).color).toBeUndefined();
    expect(firstNote(setColor(score, { color: RED, partIds: ['P1'] })).color).toBe(RED);
    expect(firstNote(setColor(score, { color: RED, measureNumbers: [2] })).color).toBeUndefined();
    expect(firstNote(setColor(score, { color: RED, measureNumbers: [1] })).color).toBe(RED);
    expect(firstNote(setColor(score, { color: RED, measureNumbers: ['1'] })).color).toBe(RED);
  });

  it('removes the colour when passed null', () => {
    const colored = setColor(parse(OPERATIONS_XML), { color: RED, targets: ['note', 'stem'] });
    const cleared = setColor(colored, { color: null, targets: ['note', 'stem'] });
    const note = firstNote(cleared);

    expect('color' in note).toBe(false);
    expect(note.stem?.color).toBeUndefined();
  });

  it('survives serialization', () => {
    const colored = setColor(parse(OPERATIONS_XML), {
      color: RED,
      targets: [...ALL_COLOR_TARGETS],
    });
    const reparsed = parse(serialize(colored));
    const note = firstNote(reparsed);

    expect(note.color).toBe(RED);
    expect(note.stem?.color).toBe(RED);
    expect(note.notations?.[0].color).toBe(RED);
    expect(reparsed.parts[0].measures[0].barlines?.[0].barStyleColor).toBe(RED);
  });

  it('never writes an unsupported colour attribute', () => {
    // <image> and <swing> have no color attribute; painting everything must
    // still produce a document without one on them.
    const xml = scoreXml(`      <direction>
        <direction-type><image source="x.png" type="application/png"/></direction-type>
      </direction>
      <direction>
        <direction-type><swing><first>2</first><second>1</second></swing></direction-type>
      </direction>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>4</duration>
        <type>whole</type>
      </note>`);
    const serialized = serialize(setColor(parse(xml), { color: RED, targets: ['direction'] }));

    expect(serialized).not.toMatch(/<image[^>]*color=/);
    expect(serialized).not.toMatch(/<swing[^>]*color=/);
  });
});

describe('clearColors', () => {
  it('removes every colour, including header colours setColor does not reach', () => {
    const xml = scoreXml(`      <note color="${RED}">
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>4</duration>
        <type color="${BLUE}">whole</type>
        <stem color="${GREEN}">up</stem>
        <notations><slur number="1" type="start" color="${RED}"/></notations>
      </note>`, {
      extra: `<credit><credit-words color="${RED}">Title</credit-words></credit>`,
      partList: `
    <score-part id="P1">
      <part-name color="${BLUE}">Violin</part-name>
    </score-part>`,
    });
    const cleared = clearColors(parse(xml));

    expect(serialize(cleared)).not.toContain('color=');
  });

  it('does not mutate the input score', () => {
    const score = parse(scoreXml(`      <note color="${RED}">
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>4</duration>
        <type>whole</type>
      </note>`));
    clearColors(score);

    expect(firstNote(score).color).toBe(RED);
  });

  it('leaves the rest of the score intact', () => {
    const score = parse(scoreXml(`      <note color="${RED}">
        <pitch><step>C</step><alter>1</alter><octave>4</octave></pitch>
        <duration>4</duration>
        <type>whole</type>
        <lyric number="1" color="${BLUE}"><text color="${GREEN}">la</text></lyric>
      </note>`));
    const cleared = clearColors(score);
    const note = firstNote(cleared);

    expect(note.pitch).toEqual({ step: 'C', octave: 4, alter: 1 });
    expect(note.noteType).toBe('whole');
    expect(note.lyrics?.[0].text).toBe('la');
    expect(note.lyrics?.[0].color).toBeUndefined();
  });
});
