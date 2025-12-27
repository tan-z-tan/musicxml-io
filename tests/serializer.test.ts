import { describe, it, expect } from 'vitest';
import { serialize } from '../src/serializer';
import type { Score } from '../src/types';

describe('Serializer', () => {
  it('should serialize a simple score', () => {
    const score: Score = {
      metadata: {
        workTitle: 'Test Score',
      },
      partList: [
        {
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
      partList: [{ id: 'P1', name: 'Piano' }],
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
      partList: [{ id: 'P1', name: 'Test' }],
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
      partList: [{ id: 'P1', name: 'Test' }],
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
      partList: [{ id: 'P1', name: 'Test' }],
      parts: [{ id: 'P1', measures: [] }],
    };

    const xml = serialize(score);

    expect(xml).toContain('Test &amp; &quot;Quotes&quot; &lt;Tags&gt;');
  });

  it('should serialize directions', () => {
    const score: Score = {
      metadata: {},
      partList: [{ id: 'P1', name: 'Test' }],
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
      partList: [{ id: 'P1', name: 'Test' }],
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
                    { type: 'staccato' },
                    { type: 'slur', startStop: 'start', number: 1 },
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
});
