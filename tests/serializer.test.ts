import { describe, it, expect } from 'vitest';
import { serialize, parse } from '../src';
import type { Score, NoteEntry, DirectionEntry, HarmonyEntry, Measure } from '../src/types';

describe('Serializer', () => {
  it('should serialize a simple score', () => {
    const score: Score = {
      metadata: {
        workTitle: 'Test Score',
      },
      partList: [
        {
          type: 'score-part',
          id: 'P1',
          name: 'Piano',
        },
      ],
      parts: [
        {
          id: 'P1',
          measures: [
            {
              number: 1,
              attributes: {
                divisions: 1,
                key: { fifths: 0 },
                time: { beats: 4, beatType: 4 },
                clef: [{ sign: 'G', line: 2 }],
              },
              entries: [
                {
                  type: 'note',
                  pitch: { step: 'C', octave: 4 },
                  duration: 4,
                  voice: 1,
                  noteType: 'whole',
                },
              ],
            },
          ],
        },
      ],
    };

    const xml = serialize(score);

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<score-partwise version="4.0">');
    expect(xml).toContain('<work-title>Test Score</work-title>');
    expect(xml).toContain('<score-part id="P1">');
    expect(xml).toContain('<part-name>Piano</part-name>');
    expect(xml).toContain('<part id="P1">');
    expect(xml).toContain('<measure number="1">');
    expect(xml).toContain('<divisions>1</divisions>');
    expect(xml).toContain('<fifths>0</fifths>');
    expect(xml).toContain('<beats>4</beats>');
    expect(xml).toContain('<beat-type>4</beat-type>');
    expect(xml).toContain('<sign>G</sign>');
    expect(xml).toContain('<line>2</line>');
    expect(xml).toContain('<note>');
    expect(xml).toContain('<step>C</step>');
    expect(xml).toContain('<octave>4</octave>');
    expect(xml).toContain('<duration>4</duration>');
    expect(xml).toContain('<voice>1</voice>');
    expect(xml).toContain('<type>whole</type>');
    expect(xml).toContain('</score-partwise>');
  });

  it('should serialize a chord', () => {
    const score: Score = {
      metadata: {},
      partList: [{ type: 'score-part', id: 'P1', name: 'Piano' }],
      parts: [
        {
          id: 'P1',
          measures: [
            {
              number: 1,
              entries: [
                {
                  type: 'note',
                  pitch: { step: 'C', octave: 4 },
                  duration: 4,
                  voice: 1,
                },
                {
                  type: 'note',
                  pitch: { step: 'E', octave: 4 },
                  duration: 4,
                  voice: 1,
                  chord: true,
                },
                {
                  type: 'note',
                  pitch: { step: 'G', octave: 4 },
                  duration: 4,
                  voice: 1,
                  chord: true,
                },
              ],
            },
          ],
        },
      ],
    };

    const xml = serialize(score);

    expect(xml).toContain('<chord/>');
    // Count occurrences of <chord/>
    const chordMatches = xml.match(/<chord\/>/g);
    expect(chordMatches).toHaveLength(2);
  });

  it('should serialize backup and forward', () => {
    const score: Score = {
      metadata: {},
      partList: [{ type: 'score-part', id: 'P1', name: 'Test' }],
      parts: [
        {
          id: 'P1',
          measures: [
            {
              number: 1,
              entries: [
                { type: 'note', pitch: { step: 'C', octave: 4 }, duration: 4, voice: 1 },
                { type: 'backup', duration: 4 },
                { type: 'note', pitch: { step: 'E', octave: 3 }, duration: 4, voice: 2 },
              ],
            },
          ],
        },
      ],
    };

    const xml = serialize(score);

    expect(xml).toContain('<backup>');
    expect(xml).toContain('<duration>4</duration>');
    expect(xml).toContain('</backup>');
  });

  it('should serialize with version 3.1', () => {
    const score: Score = {
      metadata: {},
      partList: [{ type: 'score-part', id: 'P1', name: 'Test' }],
      parts: [{ id: 'P1', measures: [] }],
    };

    const xml = serialize(score, { version: '3.1' });

    expect(xml).toContain('version="3.1"');
    expect(xml).toContain('MusicXML 3.1');
  });

  it('should escape XML special characters', () => {
    const score: Score = {
      metadata: {
        workTitle: 'Test & "Quotes" <Tags>',
      },
      partList: [{ type: 'score-part', id: 'P1', name: 'Test' }],
      parts: [{ id: 'P1', measures: [] }],
    };

    const xml = serialize(score);

    expect(xml).toContain('Test &amp; &quot;Quotes&quot; &lt;Tags&gt;');
  });

  it('should serialize directions', () => {
    const score: Score = {
      metadata: {},
      partList: [{ type: 'score-part', id: 'P1', name: 'Test' }],
      parts: [
        {
          id: 'P1',
          measures: [
            {
              number: 1,
              entries: [
                {
                  type: 'direction',
                  placement: 'above',
                  directionTypes: [
                    { kind: 'dynamics', value: 'f' },
                  ],
                },
                {
                  type: 'note',
                  pitch: { step: 'C', octave: 4 },
                  duration: 4,
                  voice: 1,
                },
              ],
            },
          ],
        },
      ],
    };

    const xml = serialize(score);

    expect(xml).toContain('<direction placement="above">');
    expect(xml).toContain('<dynamics>');
    expect(xml).toContain('<f/>');
    expect(xml).toContain('</dynamics>');
    expect(xml).toContain('</direction>');
  });

  it('should serialize notations', () => {
    const score: Score = {
      metadata: {},
      partList: [{ type: 'score-part', id: 'P1', name: 'Test' }],
      parts: [
        {
          id: 'P1',
          measures: [
            {
              number: 1,
              entries: [
                {
                  type: 'note',
                  pitch: { step: 'C', octave: 4 },
                  duration: 4,
                  voice: 1,
                  notations: [
                    { type: 'articulation', articulation: 'staccato' },
                    { type: 'slur', slurType: 'start', number: 1 },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const xml = serialize(score);

    expect(xml).toContain('<notations>');
    expect(xml).toContain('<articulations>');
    expect(xml).toContain('<staccato/>');
    expect(xml).toContain('</articulations>');
    expect(xml).toContain('<slur number="1" type="start"/>');
    expect(xml).toContain('</notations>');
  });

  it('should serialize _id as id attribute on XML elements', () => {
    const score: Score = {
      _id: 'score123',
      metadata: {},
      partList: [
        {
          _id: 'partInfo1',
          type: 'score-part',
          id: 'P1',
          name: 'Test',
        },
      ],
      parts: [
        {
          _id: 'part1',
          id: 'P1',
          measures: [
            {
              _id: 'measure1',
              number: '1',
              entries: [
                {
                  _id: 'note1',
                  type: 'note',
                  pitch: { step: 'C', octave: 4 },
                  duration: 4,
                  voice: 1,
                } as NoteEntry,
                {
                  _id: 'direction1',
                  type: 'direction',
                  directionTypes: [{ kind: 'dynamics', value: 'f' }],
                } as DirectionEntry,
                {
                  _id: 'harmony1',
                  type: 'harmony',
                  root: { rootStep: 'C' },
                  kind: 'major',
                } as HarmonyEntry,
              ],
              barlines: [
                {
                  _id: 'barline1',
                  location: 'right',
                  barStyle: 'light-heavy',
                },
              ],
            } as Measure,
          ],
        },
      ],
      credits: [
        {
          _id: 'credit1',
          creditWords: [{ text: 'Test Credit' }],
        },
      ],
    };

    const xml = serialize(score);

    // Note should have id attribute
    expect(xml).toContain('<note id="note1"');
    // Measure should have id attribute
    expect(xml).toContain('<measure number="1" id="measure1"');
    // Direction should have id attribute
    expect(xml).toContain('<direction id="direction1"');
    // Harmony should have id attribute
    expect(xml).toContain('<harmony id="harmony1"');
    // Barline should have id attribute
    expect(xml).toContain('<barline location="right" id="barline1"');
    // Credit should have id attribute
    expect(xml).toContain('<credit id="credit1"');
  });

  it('should preserve _id through parse-serialize roundtrip', () => {
    const simpleXml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1">
      <part-name>Test</part-name>
    </score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <note>
        <pitch>
          <step>C</step>
          <octave>4</octave>
        </pitch>
        <duration>4</duration>
        <voice>1</voice>
        <type>whole</type>
      </note>
    </measure>
  </part>
</score-partwise>`;

    const score = parse(simpleXml);
    const xml = serialize(score);

    // After parse, elements should have _id generated
    const measure = score.parts[0].measures[0];
    expect(measure._id).toBeDefined();
    expect(measure._id.length).toBeGreaterThan(0);

    const note = measure.entries[0] as NoteEntry;
    expect(note._id).toBeDefined();
    expect(note._id.length).toBeGreaterThan(0);

    // Serialized XML should contain the id attributes
    expect(xml).toContain(`<measure number="1" id="${measure._id}"`);
    expect(xml).toContain(`<note id="${note._id}"`);
  });
});
