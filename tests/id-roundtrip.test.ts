import { describe, it, expect } from 'vitest';
import { parse, serialize } from '../src';

// The exporter writes entry _id values as MusicXML `id` attributes.
// The importer must read them back so that _id survives a
// serialize -> parse round-trip (consumers like musicxml-layout rely on
// _id to map rendered SVG elements back to source entries).
describe('Entry _id round-trip via id attributes', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>
    <part-group type="start" number="1" id="group-G1"><group-symbol>bracket</group-symbol></part-group>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
    <part-group type="stop" number="1"/>
  </part-list>
  <part id="P1">
    <measure number="1" id="measure-M1">
      <attributes>
        <divisions>4</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note id="note-N1">
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>4</duration><type>quarter</type>
      </note>
      <direction placement="below" id="direction-D1">
        <direction-type><dynamics><p/></dynamics></direction-type>
      </direction>
      <harmony id="harmony-H1"><root><root-step>C</root-step></root><kind>major</kind></harmony>
      <note id="note-N2">
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>4</duration><type>quarter</type>
      </note>
      <forward id="forward-F1"><duration>4</duration></forward>
      <note id="note-N3">
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>4</duration><type>quarter</type>
      </note>
      <barline location="right" id="barline-B1"><bar-style>light-heavy</bar-style></barline>
    </measure>
  </part>
</score-partwise>`;

  it('preserves id attributes as _id when parsing', () => {
    const score = parse(xml);
    const measure = score.parts[0].measures[0];

    expect(measure._id).toBe('measure-M1');

    const byType = (type: string) => measure.entries.filter((e) => e.type === type);
    expect(byType('note').map((e) => e._id)).toEqual(['note-N1', 'note-N2', 'note-N3']);
    expect(byType('direction')[0]._id).toBe('direction-D1');
    expect(byType('harmony')[0]._id).toBe('harmony-H1');
    expect(byType('forward')[0]._id).toBe('forward-F1');
    expect(measure.barlines?.[0]._id).toBe('barline-B1');
    expect(score.partList.find((p) => p.type === 'part-group')?._id).toBe('group-G1');
  });

  it('keeps _id stable across serialize -> parse round-trip', () => {
    const score1 = parse(xml);
    const score2 = parse(serialize(score1));

    const ids = (s: typeof score1) =>
      s.parts[0].measures[0].entries.map((e) => `${e.type}:${e._id}`);

    expect(ids(score2)).toEqual(ids(score1));
    expect(score2.parts[0].measures[0]._id).toBe(score1.parts[0].measures[0]._id);
  });

  it('still generates ids when the id attribute is absent', () => {
    const score = parse(xml.replace(/ id="note-N1"/, ''));
    const note = score.parts[0].measures[0].entries.find((e) => e.type === 'note');
    expect(note?._id).toBeTruthy();
    expect(note?._id).not.toBe('note-N1');
  });
});
