import { describe, it, expect } from 'vitest';
import { parse, serialize, type Score, type Lyric } from '../src';

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

/** A `<note>` carrying the given `<lyric>` elements. */
function noteWithLyrics(lyrics: string): string {
  return `      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1</duration>
        <type>quarter</type>
${lyrics}
      </note>`;
}

function roundtrip(xml: string): { first: Score; second: Score; xml: string } {
  const first = parse(xml);
  const serialized = serialize(first);
  return { first, second: parse(serialized), xml: serialized };
}

function lyricsOf(score: Score): Lyric[] {
  const note = score.parts[0].measures[0].entries.find(e => e.type === 'note');
  if (!note || note.type !== 'note') throw new Error('no note in measure');
  return note.lyrics ?? [];
}

describe('Lyric number is an NMTOKEN, not an integer', () => {
  it('keeps a Sibelius-style verse id instead of turning it into NaN', () => {
    // Sibelius writes ids like this; the whole music21 Sibelius corpus does.
    const xml = scoreXml(noteWithLyrics(
      `        <lyric number="part1verse1" default-y="-80"><syllabic>single</syllabic><text>first</text></lyric>
        <lyric number="part1verse2" default-y="-105"><syllabic>single</syllabic><text>second</text></lyric>`,
    ));
    const { first, second, xml: out } = roundtrip(xml);

    const lyrics = lyricsOf(first);
    expect(lyrics).toHaveLength(2);
    expect(lyrics[0]).toMatchObject({ numberText: 'part1verse1', text: 'first', defaultY: -80 });
    expect(lyrics[1]).toMatchObject({ numberText: 'part1verse2', text: 'second', defaultY: -105 });

    // A non-numeric id has no numeric reading — and must never be NaN.
    expect(lyrics[0].number).toBeUndefined();
    expect(lyrics[1].number).toBeUndefined();
    expect(out).not.toContain('NaN');

    // The raw ids are written back, so the verses stay distinguishable.
    expect(out).toContain('number="part1verse1"');
    expect(out).toContain('number="part1verse2"');
    expect(lyricsOf(second).map(l => l.numberText)).toEqual(['part1verse1', 'part1verse2']);
  });

  it('still gives a plain integer a numeric reading', () => {
    const xml = scoreXml(noteWithLyrics(
      `        <lyric number="1"><syllabic>single</syllabic><text>la</text></lyric>
        <lyric number="2"><syllabic>single</syllabic><text>li</text></lyric>`,
    ));
    const { first, second, xml: out } = roundtrip(xml);

    expect(lyricsOf(first).map(l => l.number)).toEqual([1, 2]);
    expect(lyricsOf(first).map(l => l.numberText)).toEqual(['1', '2']);
    expect(out).toContain('number="1"');
    expect(out).toContain('number="2"');
    expect(lyricsOf(second).map(l => l.number)).toEqual([1, 2]);
  });

  it('carries the verse id on an extend-only lyric with no text', () => {
    const xml = scoreXml(noteWithLyrics(
      `        <lyric number="part1verse2"><extend type="stop"/></lyric>`,
    ));
    const { first, second, xml: out } = roundtrip(xml);

    expect(lyricsOf(first)[0]).toMatchObject({ numberText: 'part1verse2', text: '' });
    expect(out).toContain('number="part1verse2"');
    expect(lyricsOf(second)[0]).toMatchObject({ numberText: 'part1verse2' });
  });

  it('does not read a leading digit run out of a mixed token', () => {
    const xml = scoreXml(noteWithLyrics(
      `        <lyric number="2ndverse"><text>la</text></lyric>`,
    ));
    const lyric = lyricsOf(parse(xml))[0];
    expect(lyric.numberText).toBe('2ndverse');
    expect(lyric.number).toBeUndefined();
  });

  it('preserves a number attribute of "0"', () => {
    const xml = scoreXml(noteWithLyrics(`        <lyric number="0"><text>la</text></lyric>`));
    const { first, xml: out } = roundtrip(xml);
    expect(lyricsOf(first)[0]).toMatchObject({ number: 0, numberText: '0' });
    expect(out).toContain('number="0"');
  });

  it('writes a number set programmatically on a lyric that has no raw value', () => {
    const xml = scoreXml(noteWithLyrics(`        <lyric><text>la</text></lyric>`));
    const score = parse(xml);
    const lyric = lyricsOf(score)[0];
    expect(lyric.number).toBeUndefined();
    expect(lyric.numberText).toBeUndefined();

    lyric.number = 3;
    expect(serialize(score)).toContain('number="3"');
  });

  it('omits the attribute entirely when the producer wrote none', () => {
    const xml = scoreXml(noteWithLyrics(`        <lyric><text>la</text></lyric>`));
    const { xml: out } = roundtrip(xml);
    // Bare `<lyric>` — no number attribute of any kind on the element itself.
    expect(out).toContain('<lyric>');
    expect(out).not.toMatch(/<lyric[^>]*number=/);
  });
});
