import { describe, it, expect } from 'vitest';
import { parse, serialize } from '../src';

const wrap = (m1: string, partExtra = '') => `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P</part-name>${partExtra}</score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>1</divisions></attributes>
    ${m1}
  </measure></part>
</score-partwise>`;
const note = (inner = '') => `<note><pitch><step>C</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type>${inner}</note>`;
const dir = (inner: string) => `<direction><direction-type>${inner}</direction-type></direction>`;
const dirTypes = (xml: string) => {
  const score = parse(xml);
  return score.parts[0].measures[0].entries.filter((e) => e.type === 'direction').flatMap((e: any) => e.directionTypes);
};
/** parse → serialize → parse keeps the value. */
const roundtrip = (xml: string) => serialize(parse(xml));

describe('notation attributes added for layout', () => {
  it('reads words enclosure / underline / overline / line-through', () => {
    const xml = wrap(dir('<words enclosure="rectangle" underline="1" overline="2" line-through="1">solo</words>') + note());
    for (const x of [xml, roundtrip(xml)]) {
      expect(dirTypes(x)[0]).toMatchObject({ kind: 'words', text: 'solo', enclosure: 'rectangle', underline: 1, overline: 2, lineThrough: 1 });
    }
  });

  it('reads wedge niente and line-type', () => {
    const xml = wrap(dir('<wedge type="diminuendo" niente="yes" line-type="dashed"/>') + note() + dir('<wedge type="stop"/>'));
    for (const x of [xml, roundtrip(xml)]) {
      expect(dirTypes(x)[0]).toMatchObject({ kind: 'wedge', type: 'diminuendo', niente: true, lineType: 'dashed' });
      expect(dirTypes(x)[1].niente).toBeUndefined();
    }
  });

  it('reads pedal sign / abbreviated and the sostenuto, discontinue, resume types', () => {
    const xml = wrap(
      dir('<pedal type="start" line="yes" sign="yes" abbreviated="yes"/>') + note()
      + dir('<pedal type="discontinue" line="yes"/>') + dir('<pedal type="resume" line="yes"/>')
      + dir('<pedal type="stop" line="yes"/>') + dir('<pedal type="sostenuto"/>'));
    for (const x of [xml, roundtrip(xml)]) {
      const d = dirTypes(x);
      expect(d[0]).toMatchObject({ kind: 'pedal', type: 'start', line: true, sign: true, abbreviated: true });
      expect(d.map((t: any) => t.type)).toEqual(['start', 'discontinue', 'resume', 'stop', 'sostenuto']);
      expect(d[3].sign).toBeUndefined();
    }
  });

  it('reads lyric and harmony print-object', () => {
    const xml = wrap(
      '<harmony print-object="no"><root><root-step>C</root-step></root><kind use-symbols="yes">major-seventh</kind></harmony>'
      + note('<lyric number="1" print-object="no"><syllabic>single</syllabic><text>la</text></lyric>'));
    for (const x of [xml, roundtrip(xml)]) {
      const entries = parse(x).parts[0].measures[0].entries as any[];
      const harmony = entries.find((e) => e.type === 'harmony');
      expect(harmony.printObject).toBe(false);
      expect(harmony.kindUseSymbols).toBe(true);
      expect(entries.find((e) => e.type === 'note').lyrics[0].printObject).toBe(false);
    }
  });

  it('leaves the new fields undefined when the attributes are absent', () => {
    const xml = wrap('<harmony><root><root-step>C</root-step></root><kind>major</kind></harmony>'
      + dir('<words>a</words>') + note('<lyric number="1"><syllabic>single</syllabic><text>la</text></lyric>'));
    const entries = parse(xml).parts[0].measures[0].entries as any[];
    const harmony = entries.find((e) => e.type === 'harmony');
    expect(harmony.printObject).toBeUndefined();
    expect(harmony.kindUseSymbols).toBeUndefined();
    expect(entries.find((e) => e.type === 'note').lyrics[0].printObject).toBeUndefined();
    expect(dirTypes(xml)[0].enclosure).toBeUndefined();
    expect(roundtrip(xml)).not.toMatch(/print-object|use-symbols|enclosure/);
  });

  it('keeps accidental-text in order inside part-name-display', () => {
    const xml = wrap(note(), '<part-name-display><display-text>Clarinet in B</display-text><accidental-text>flat</accidental-text></part-name-display>');
    for (const x of [xml, roundtrip(xml)]) {
      const part = parse(x).partList.find((p: any) => p.type === 'score-part') as any;
      expect(part.partNameDisplay).toMatchObject([{ text: 'Clarinet in B' }, { text: '', accidentalText: 'flat' }]);
    }
    expect(roundtrip(xml)).toContain('<accidental-text>flat</accidental-text>');
  });

  it('reads tied line-type', () => {
    const xml = wrap(note('<notations><tied type="start" line-type="dashed"/></notations>') + note('<notations><tied type="stop"/></notations>'));
    for (const x of [xml, roundtrip(xml)]) {
      const notes = (parse(x).parts[0].measures[0].entries as any[]).filter((e) => e.type === 'note');
      expect(notes[0].notations[0]).toMatchObject({ type: 'tied', tiedType: 'start', lineType: 'dashed' });
      expect(notes[1].notations[0].lineType).toBeUndefined();
    }
  });

  it('reads mordent long, turn slash and inverted-vertical-turn', () => {
    const xml = wrap(
      note('<notations><ornaments><mordent long="yes"/></ornaments></notations>')
      + note('<notations><ornaments><turn slash="yes"/></ornaments></notations>')
      + note('<notations><ornaments><inverted-vertical-turn/></ornaments></notations>'));
    for (const x of [xml, roundtrip(xml)]) {
      const orns = (parse(x).parts[0].measures[0].entries as any[]).filter((e) => e.type === 'note').map((n) => n.notations[0]);
      expect(orns[0]).toMatchObject({ ornament: 'mordent', long: true });
      expect(orns[1]).toMatchObject({ ornament: 'turn', slash: true });
      expect(orns[2]).toMatchObject({ ornament: 'inverted-vertical-turn' });
      expect(orns[2].long).toBeUndefined();
    }
  });
});

describe('score-timewise', () => {
  const timewise = `<?xml version="1.0" encoding="UTF-8"?>
<score-timewise version="4.0">
  <work><work-title>T</work-title></work>
  <part-list><score-part id="P1"><part-name>A</part-name></score-part><score-part id="P2"><part-name>B</part-name></score-part></part-list>
  <measure number="1" width="200">
    <part id="P1"><attributes><divisions>1</divisions></attributes>${note()}</part>
    <part id="P2"><attributes><divisions>1</divisions></attributes>${note()}${note()}</part>
  </measure>
  <measure number="2">
    <part id="P1">${note()}</part>
    <part id="P2">${note()}</part>
  </measure>
</score-timewise>`;

  it('is read as parts containing measures', () => {
    const score = parse(timewise);
    expect(score.version).toBe('4.0');
    expect(score.metadata.workTitle).toBe('T');
    expect(score.parts.map((p) => p.id)).toEqual(['P1', 'P2']);
    expect(score.parts.map((p) => p.measures.map((m) => m.number))).toEqual([['1', '2'], ['1', '2']]);
    expect(score.parts[0].measures[0].width).toBe(200);
    expect(score.parts[1].measures[0].entries.filter((e) => e.type === 'note')).toHaveLength(2);
    expect(score.parts[1].measures[1].entries.filter((e) => e.type === 'note')).toHaveLength(1);
  });

  it('serializes as score-partwise with the same content', () => {
    const out = serialize(parse(timewise));
    expect(out).toContain('<score-partwise');
    const again = parse(out);
    expect(again.parts.map((p) => p.measures.length)).toEqual([2, 2]);
  });

  it('still rejects an unrelated root', () => {
    expect(() => parse('<?xml version="1.0"?><opus/>')).toThrow(/score-partwise or score-timewise/);
  });
});
