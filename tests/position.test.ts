import { describe, it, expect } from 'vitest';
import {
  parse,
  serialize,
  type Score,
  type NoteEntry,
  type DirectionEntry,
  type DirectionType,
  type HarmonyEntry,
  type Notation,
} from '../src';

/**
 * The `%position` attribute group, written as raw tenths. `relative-y` is 0 on
 * purpose: 0 is a meaningful offset and must survive the round-trip rather than
 * being dropped as falsy.
 */
const POS_XML = 'default-x="12.5" default-y="-34" relative-x="5" relative-y="0"';
const POS = { defaultX: 12.5, defaultY: -34, relativeX: 5, relativeY: 0 };

/** Wrap measure content in a minimal score-partwise document. */
function scoreXml(measureBody: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1">
      <part-name>Music</part-name>
    </score-part>
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

/** Parse → serialize → parse, so we assert the values survive both directions. */
function roundtrip(xml: string): { first: Score; second: Score; xml: string } {
  const first = parse(xml);
  const serialized = serialize(first);
  return { first, second: parse(serialized), xml: serialized };
}

function directionOf(score: Score): DirectionEntry {
  const dir = score.parts[0].measures[0].entries.find(e => e.type === 'direction');
  if (!dir || dir.type !== 'direction') throw new Error('no direction in measure');
  return dir;
}

function noteOf(score: Score): NoteEntry {
  const note = score.parts[0].measures[0].entries.find(e => e.type === 'note');
  if (!note || note.type !== 'note') throw new Error('no note in measure');
  return note;
}

function harmonyOf(score: Score): HarmonyEntry {
  const h = score.parts[0].measures[0].entries.find(e => e.type === 'harmony');
  if (!h || h.type !== 'harmony') throw new Error('no harmony in measure');
  return h;
}

function notationOf(score: Score, type: Notation['type']): Notation {
  const found = noteOf(score).notations?.find(n => n.type === type);
  if (!found) throw new Error(`no ${type} notation on note`);
  return found;
}

/** A `<note>` carrying the given `<notations>` body. */
function noteWithNotations(body: string): string {
  return `      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1</duration>
        <type>quarter</type>
        <notations>
${body}
        </notations>
      </note>`;
}

function expectPosition(target: unknown): void {
  expect(target).toMatchObject(POS);
}

describe('Position attributes: direction-type', () => {
  // Every direction-type but <swing> and <scordatura> carries %position.
  const cases: { kind: DirectionType['kind']; body: string }[] = [
    { kind: 'dynamics', body: `<dynamics ${POS_XML}><f/></dynamics>` },
    { kind: 'wedge', body: `<wedge type="crescendo" spread="15" ${POS_XML}/>` },
    {
      kind: 'metronome',
      body: `<metronome ${POS_XML}><beat-unit>quarter</beat-unit><per-minute>120</per-minute></metronome>`,
    },
    { kind: 'words', body: `<words ${POS_XML}>Allegro</words>` },
    { kind: 'rehearsal', body: `<rehearsal ${POS_XML}>A</rehearsal>` },
    { kind: 'segno', body: `<segno ${POS_XML}/>` },
    { kind: 'coda', body: `<coda ${POS_XML}/>` },
    { kind: 'pedal', body: `<pedal type="start" line="yes" ${POS_XML}/>` },
    { kind: 'octave-shift', body: `<octave-shift type="down" size="8" ${POS_XML}/>` },
    { kind: 'bracket', body: `<bracket type="start" line-end="down" ${POS_XML}/>` },
    { kind: 'dashes', body: `<dashes type="start" ${POS_XML}/>` },
    {
      kind: 'accordion-registration',
      body: `<accordion-registration ${POS_XML}><accordion-high/></accordion-registration>`,
    },
    { kind: 'eyeglasses', body: `<eyeglasses ${POS_XML}/>` },
    { kind: 'damp', body: `<damp ${POS_XML}/>` },
    { kind: 'damp-all', body: `<damp-all ${POS_XML}/>` },
    {
      kind: 'harp-pedals',
      body: `<harp-pedals ${POS_XML}><pedal-tuning><pedal-step>D</pedal-step><pedal-alter>0</pedal-alter></pedal-tuning></harp-pedals>`,
    },
    { kind: 'image', body: `<image source="cover.png" type="image/png" ${POS_XML}/>` },
    { kind: 'other-direction', body: `<other-direction ${POS_XML}>tacet</other-direction>` },
  ];

  for (const { kind, body } of cases) {
    it(`preserves default-x/y and relative-x/y on <${kind}>`, () => {
      const xml = scoreXml(`      <direction placement="above">
        <direction-type>${body}</direction-type>
      </direction>`);
      const { first, second, xml: out } = roundtrip(xml);

      const parsed = directionOf(first).directionTypes[0];
      expect(parsed.kind).toBe(kind);
      expectPosition(parsed);

      expect(out).toContain('default-x="12.5"');
      expect(out).toContain('default-y="-34"');
      expect(out).toContain('relative-x="5"');
      expect(out).toContain('relative-y="0"');

      expectPosition(directionOf(second).directionTypes[0]);
    });
  }
});

describe('Position attributes: note-level elements', () => {
  it('preserves them on <lyric>', () => {
    const xml = scoreXml(`      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1</duration>
        <type>quarter</type>
        <lyric number="1" ${POS_XML}>
          <syllabic>single</syllabic>
          <text>la</text>
        </lyric>
      </note>`);
    const { first, second } = roundtrip(xml);
    expectPosition(noteOf(first).lyrics?.[0]);
    expectPosition(noteOf(second).lyrics?.[0]);
  });

  it('preserves them on <accidental>', () => {
    const xml = scoreXml(`      <note>
        <pitch><step>C</step><alter>1</alter><octave>4</octave></pitch>
        <duration>1</duration>
        <type>quarter</type>
        <accidental ${POS_XML}>sharp</accidental>
      </note>`);
    const { first, second } = roundtrip(xml);
    expectPosition(noteOf(first).accidental);
    expectPosition(noteOf(second).accidental);
  });

  it('preserves them on <harmony>', () => {
    const xml = scoreXml(`      <harmony ${POS_XML}>
        <root><root-step>C</root-step></root>
        <kind>major</kind>
      </harmony>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1</duration>
        <type>quarter</type>
      </note>`);
    const { first, second } = roundtrip(xml);
    expectPosition(harmonyOf(first));
    expectPosition(harmonyOf(second));
  });

  it('preserves them on <ending>', () => {
    const xml = scoreXml(`      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1</duration>
        <type>quarter</type>
      </note>
      <barline location="right">
        <ending number="1" type="stop" end-length="20" ${POS_XML}/>
      </barline>`);
    const { first, second } = roundtrip(xml);
    expectPosition(first.parts[0].measures[0].barlines?.[0].ending);
    expectPosition(second.parts[0].measures[0].barlines?.[0].ending);
  });
});

describe('Position attributes: notations', () => {
  const cases: { type: Notation['type']; body: string }[] = [
    { type: 'tuplet', body: `<tuplet type="start" bracket="yes" ${POS_XML}/>` },
    { type: 'fermata', body: `<fermata type="upright" ${POS_XML}/>` },
    { type: 'arpeggiate', body: `<arpeggiate direction="up" ${POS_XML}/>` },
    { type: 'articulation', body: `<articulations><staccato ${POS_XML}/></articulations>` },
    { type: 'ornament', body: `<ornaments><trill-mark ${POS_XML}/></ornaments>` },
    { type: 'technical', body: `<technical><up-bow ${POS_XML}/></technical>` },
  ];

  for (const { type, body } of cases) {
    it(`preserves default-x/y and relative-x/y on ${type} notations`, () => {
      const { first, second } = roundtrip(scoreXml(noteWithNotations(`          ${body}`)));
      expectPosition(notationOf(first, type));
      expectPosition(notationOf(second, type));
    });
  }

  it('preserves them on a standalone <accidental-mark>', () => {
    const body = `<accidental-mark placement="above" ${POS_XML}>sharp</accidental-mark>`;
    const { first, second } = roundtrip(scoreXml(noteWithNotations(`          ${body}`)));
    expectPosition(notationOf(first, 'accidental-mark'));
    expectPosition(notationOf(second, 'accidental-mark'));
  });

  it('preserves them on an <accidental-mark> inside <ornaments>', () => {
    const body = `<ornaments><turn/><accidental-mark ${POS_XML}>flat</accidental-mark></ornaments>`;
    const { first, second } = roundtrip(scoreXml(noteWithNotations(`          ${body}`)));
    const marksOf = (score: Score) => {
      const orn = notationOf(score, 'ornament');
      if (orn.type !== 'ornament') throw new Error('not an ornament');
      return orn.accidentalMarks?.[0];
    };
    expectPosition(marksOf(first));
    expectPosition(marksOf(second));
  });

  it('preserves position and bezier attributes on <slur>', () => {
    const body = `<slur number="1" type="start" ${POS_XML} bezier-x="1" bezier-y="2" bezier-x2="3" bezier-y2="4" bezier-offset="5" bezier-offset2="6"/>`;
    const { first, second, xml } = roundtrip(scoreXml(noteWithNotations(`          ${body}`)));
    const expected = {
      ...POS,
      bezierX: 1, bezierY: 2, bezierX2: 3, bezierY2: 4, bezierOffset: 5, bezierOffset2: 6,
    };
    expect(notationOf(first, 'slur')).toMatchObject(expected);
    expect(xml).toContain('bezier-offset="5"');
    expect(xml).toContain('bezier-offset2="6"');
    expect(notationOf(second, 'slur')).toMatchObject(expected);
  });

  it('preserves position and bezier attributes on <tied>', () => {
    const body = `<tied type="start" orientation="over" ${POS_XML} bezier-x="1" bezier-y="2" bezier-x2="3" bezier-y2="4" bezier-offset="5" bezier-offset2="6"/>`;
    const { first, second, xml } = roundtrip(scoreXml(noteWithNotations(`          ${body}`)));
    const expected = {
      ...POS,
      bezierX: 1, bezierY: 2, bezierX2: 3, bezierY2: 4, bezierOffset: 5, bezierOffset2: 6,
    };
    expect(notationOf(first, 'tied')).toMatchObject(expected);
    expect(xml).toContain('bezier-x2="3"');
    expect(xml).toContain('bezier-offset2="6"');
    expect(notationOf(second, 'tied')).toMatchObject(expected);
  });
});

describe('Position attributes: edge cases', () => {
  it('keeps a zero-valued offset instead of dropping it as falsy', () => {
    const xml = scoreXml(`      <note default-x="0" default-y="0" relative-x="0" relative-y="0">
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1</duration>
        <type>quarter</type>
      </note>`);
    const { first, xml: out } = roundtrip(xml);
    expect(noteOf(first)).toMatchObject({ defaultX: 0, defaultY: 0, relativeX: 0, relativeY: 0 });
    expect(out).toContain('default-x="0"');
    expect(out).toContain('relative-y="0"');
  });

  it('leaves the fields unset when the producer wrote no position', () => {
    const xml = scoreXml(`      <direction placement="above">
        <direction-type><words>Allegro</words></direction-type>
      </direction>`);
    const dirType = directionOf(parse(xml)).directionTypes[0];
    expect(dirType).toMatchObject({ kind: 'words' });
    expect(dirType.defaultX).toBeUndefined();
    expect(dirType.defaultY).toBeUndefined();
    expect(dirType.relativeX).toBeUndefined();
    expect(dirType.relativeY).toBeUndefined();
  });

  it('ignores a non-numeric position attribute rather than emitting NaN', () => {
    const xml = scoreXml(`      <direction placement="above">
        <direction-type><words default-x="" default-y="abc" relative-x="7">Allegro</words></direction-type>
      </direction>`);
    const { first, xml: out } = roundtrip(xml);
    const dirType = directionOf(first).directionTypes[0];
    expect(dirType).toMatchObject({ relativeX: 7 });
    expect(dirType.defaultX).toBeUndefined();
    expect(dirType.defaultY).toBeUndefined();
    expect(out).not.toContain('NaN');
  });
});
