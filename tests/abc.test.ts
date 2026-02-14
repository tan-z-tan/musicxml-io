import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseAbc, serializeAbc, serialize, parse } from '../src';

const fixturesPath = join(__dirname, 'fixtures', 'abc');

function readFixture(name: string): string {
  return readFileSync(join(fixturesPath, name), 'utf-8');
}

// ============================================================
// Parser Unit Tests
// ============================================================

describe('ABC Parser', () => {
  describe('Header Parsing', () => {
    it('should parse title', () => {
      const abc = readFixture('simple-scale.abc');
      const score = parseAbc(abc);
      expect(score.metadata.movementTitle).toBe('C Major Scale');
    });

    it('should parse composer', () => {
      const abc = readFixture('simple-scale.abc');
      const score = parseAbc(abc);
      const composer = score.metadata.creators?.find(c => c.type === 'composer');
      expect(composer?.value).toBe('Traditional');
    });

    it('should parse time signature 4/4', () => {
      const abc = readFixture('simple-scale.abc');
      const score = parseAbc(abc);
      const time = score.parts[0].measures[0].attributes?.time;
      expect(time?.beats).toBe('4');
      expect(time?.beatType).toBe(4);
    });

    it('should parse key signature C major', () => {
      const abc = readFixture('simple-scale.abc');
      const score = parseAbc(abc);
      const key = score.parts[0].measures[0].attributes?.key;
      expect(key?.fifths).toBe(0);
      expect(key?.mode).toBe('major');
    });

    it('should parse key signature G major', () => {
      const abc = readFixture('key-signatures.abc');
      const score = parseAbc(abc);
      const key = score.parts[0].measures[0].attributes?.key;
      expect(key?.fifths).toBe(1);
      expect(key?.mode).toBe('major');
    });

    it('should parse key signature A minor', () => {
      const abc = readFixture('minor-key.abc');
      const score = parseAbc(abc);
      const key = score.parts[0].measures[0].attributes?.key;
      expect(key?.fifths).toBe(0);
      expect(key?.mode).toBe('minor');
    });

    it('should parse tempo', () => {
      const abc = readFixture('twinkle.abc');
      const score = parseAbc(abc);
      const firstMeasure = score.parts[0].measures[0];
      const tempoDir = firstMeasure.entries.find(
        e => e.type === 'direction' && e.directionTypes.some(dt => dt.kind === 'metronome')
      );
      expect(tempoDir).toBeDefined();
      if (tempoDir && tempoDir.type === 'direction') {
        const metronome = tempoDir.directionTypes.find(dt => dt.kind === 'metronome');
        if (metronome && metronome.kind === 'metronome') {
          expect(metronome.perMinute).toBe(100);
        }
      }
    });
  });

  describe('Note Parsing', () => {
    it('should parse C major scale notes', () => {
      const abc = readFixture('simple-scale.abc');
      const score = parseAbc(abc);

      // First measure: C D E F
      const notes1 = score.parts[0].measures[0].entries.filter(
        e => e.type === 'note' && !e.rest
      ) as any[];
      expect(notes1.length).toBe(4);
      expect(notes1[0].pitch?.step).toBe('C');
      expect(notes1[0].pitch?.octave).toBe(4);
      expect(notes1[1].pitch?.step).toBe('D');
      expect(notes1[2].pitch?.step).toBe('E');
      expect(notes1[3].pitch?.step).toBe('F');

      // Second measure: G A B c
      const notes2 = score.parts[0].measures[1].entries.filter(
        e => e.type === 'note' && !e.rest
      ) as any[];
      expect(notes2.length).toBe(4);
      expect(notes2[0].pitch?.step).toBe('G');
      expect(notes2[1].pitch?.step).toBe('A');
      expect(notes2[2].pitch?.step).toBe('B');
      expect(notes2[3].pitch?.step).toBe('C');
      expect(notes2[3].pitch?.octave).toBe(5); // lowercase 'c' = octave 5
    });

    it('should parse octave modifiers', () => {
      const abc = readFixture('octaves.abc');
      const score = parseAbc(abc);

      // First measure: C, D, E, F, (octave 3)
      const notes1 = score.parts[0].measures[0].entries.filter(
        e => e.type === 'note' && !e.rest
      ) as any[];
      expect(notes1[0].pitch?.step).toBe('C');
      expect(notes1[0].pitch?.octave).toBe(3);

      // Fourth measure: g a b c' (octave 5-6)
      const notes4 = score.parts[0].measures[3].entries.filter(
        e => e.type === 'note' && !e.rest
      ) as any[];
      expect(notes4[3].pitch?.step).toBe('C');
      expect(notes4[3].pitch?.octave).toBe(6); // c' = octave 6
    });

    it('should parse accidentals', () => {
      const abc = readFixture('accidentals.abc');
      const score = parseAbc(abc);

      const notes = score.parts[0].measures[0].entries.filter(
        e => e.type === 'note' && !e.rest
      ) as any[];

      expect(notes[0].pitch?.step).toBe('C');
      expect(notes[0].pitch?.alter).toBeUndefined(); // C natural (no alter)
      expect(notes[1].pitch?.step).toBe('D');
      expect(notes[1].pitch?.alter).toBe(1); // ^D = D sharp
      expect(notes[2].pitch?.step).toBe('E');
      expect(notes[2].pitch?.alter).toBeUndefined(); // E (no accidental)
      expect(notes[3].pitch?.step).toBe('B');
      expect(notes[3].pitch?.alter).toBe(-1); // _B = B flat
    });

    it('should parse double accidentals', () => {
      const abc = readFixture('accidentals.abc');
      const score = parseAbc(abc);

      const notes = score.parts[0].measures[1].entries.filter(
        e => e.type === 'note' && !e.rest
      ) as any[];

      // =E (natural), F, ^^G (double sharp), __A (double flat)
      expect(notes[2].pitch?.step).toBe('G');
      expect(notes[2].pitch?.alter).toBe(2); // ^^G
      expect(notes[3].pitch?.step).toBe('A');
      expect(notes[3].pitch?.alter).toBe(-2); // __A
    });

    it('should parse various durations', () => {
      const abc = readFixture('durations.abc');
      const score = parseAbc(abc);

      // L:1/8, M:4/4
      // First measure: C2 D2 E2 F2 (each is 2 eighth notes = quarter note)
      const notes1 = score.parts[0].measures[0].entries.filter(
        e => e.type === 'note'
      ) as any[];
      expect(notes1[0].noteType).toBe('quarter');

      // Second measure: G4 A4 (each is 4 eighth notes = half note)
      const notes2 = score.parts[0].measures[1].entries.filter(
        e => e.type === 'note'
      ) as any[];
      expect(notes2[0].noteType).toBe('half');
    });

    it('should parse rests', () => {
      const abc = readFixture('rests.abc');
      const score = parseAbc(abc);

      // First measure: CDzE (z = rest of default length)
      const entries = score.parts[0].measures[0].entries.filter(
        e => e.type === 'note'
      ) as any[];
      expect(entries[2].rest).toBeDefined();
      expect(entries[2].pitch).toBeUndefined();
    });
  });

  describe('Barlines and Repeats', () => {
    it('should parse repeat barlines', () => {
      const abc = readFixture('repeats.abc');
      const score = parseAbc(abc);

      // Should have measures with repeat barlines
      const allBarlines = score.parts[0].measures.flatMap(m => m.barlines || []);
      const forwardRepeats = allBarlines.filter(b => b.repeat?.direction === 'forward');
      const backwardRepeats = allBarlines.filter(b => b.repeat?.direction === 'backward');

      expect(forwardRepeats.length).toBeGreaterThan(0);
      expect(backwardRepeats.length).toBeGreaterThan(0);
    });
  });

  describe('Chord Symbols', () => {
    it('should parse chord symbols', () => {
      const abc = readFixture('chord-symbols.abc');
      const score = parseAbc(abc);

      const harmonies = score.parts[0].measures[0].entries.filter(
        e => e.type === 'harmony'
      );
      expect(harmonies.length).toBeGreaterThan(0);
      if (harmonies[0].type === 'harmony') {
        expect(harmonies[0].root.rootStep).toBe('C');
        expect(harmonies[0].kind).toBe('major');
      }
    });
  });

  describe('Ties', () => {
    it('should parse ties', () => {
      const abc = readFixture('ties-slurs.abc');
      const score = parseAbc(abc);

      // C2-C2 means C half note tied to C half note
      const notes = score.parts[0].measures[0].entries.filter(
        e => e.type === 'note' && !e.rest
      ) as any[];

      // First C should have tie start
      const tiedNote = notes.find((n: any) => n.tie?.type === 'start');
      expect(tiedNote).toBeDefined();

      // Second C should have tie stop
      const tieStopNote = notes.find((n: any) => n.tie?.type === 'stop');
      expect(tieStopNote).toBeDefined();
    });
  });

  describe('Dynamics', () => {
    it('should parse dynamics', () => {
      const abc = readFixture('dynamics.abc');
      const score = parseAbc(abc);

      const firstMeasureDirEntries = score.parts[0].measures[0].entries.filter(
        e => e.type === 'direction'
      );
      expect(firstMeasureDirEntries.length).toBeGreaterThan(0);
    });
  });

  describe('Multi-Voice', () => {
    it('should parse multiple voices as separate parts', () => {
      const abc = readFixture('multi-voice.abc');
      const score = parseAbc(abc);

      expect(score.parts.length).toBe(2);

      // Voice 1
      const v1Notes = score.parts[0].measures[0].entries.filter(
        e => e.type === 'note' && !e.rest
      ) as any[];
      expect(v1Notes[0].pitch?.step).toBe('C');
      expect(v1Notes[0].pitch?.octave).toBe(4);

      // Voice 2
      const v2Notes = score.parts[1].measures[0].entries.filter(
        e => e.type === 'note' && !e.rest
      ) as any[];
      expect(v2Notes[0].pitch?.step).toBe('C');
      expect(v2Notes[0].pitch?.octave).toBe(3); // C, = octave 3
    });
  });

  describe('Simultaneous Chords', () => {
    it('should parse chord notation [CEG]', () => {
      const abc = readFixture('chords.abc');
      const score = parseAbc(abc);

      const entries = score.parts[0].measures[0].entries.filter(
        e => e.type === 'note' && !e.rest
      ) as any[];

      // First chord [CEG]2 - C is root, E and G are chord members
      expect(entries[0].pitch?.step).toBe('C');
      expect(entries[0].chord).toBeUndefined(); // first note of chord is not marked
      expect(entries[1].pitch?.step).toBe('E');
      expect(entries[1].chord).toBe(true);
      expect(entries[2].pitch?.step).toBe('G');
      expect(entries[2].chord).toBe(true);
    });
  });

  describe('Tuplets', () => {
    it('should parse triplets', () => {
      const abc = readFixture('tuplets.abc');
      const score = parseAbc(abc);

      const notes = score.parts[0].measures[0].entries.filter(
        e => e.type === 'note' && !e.rest
      ) as any[];

      // (3CDE - triplet
      expect(notes[0].timeModification?.actualNotes).toBe(3);
      expect(notes[0].timeModification?.normalNotes).toBe(2);
    });
  });

  describe('Grace Notes', () => {
    it('should parse grace notes', () => {
      const abc = readFixture('grace-notes.abc');
      const score = parseAbc(abc);

      const notes = score.parts[0].measures[0].entries.filter(
        e => e.type === 'note'
      ) as any[];

      // {DE}C2EG - D and E are grace notes
      const graceNotes = notes.filter((n: any) => n.grace);
      expect(graceNotes.length).toBeGreaterThanOrEqual(2);
      expect(graceNotes[0].pitch?.step).toBe('D');
      expect(graceNotes[1].pitch?.step).toBe('E');
      expect(graceNotes[0].duration).toBe(0);
    });
  });

  describe('Lyrics', () => {
    it('should parse lyrics', () => {
      const abc = readFixture('lyrics.abc');
      const score = parseAbc(abc);

      // Find notes with lyrics
      const notesWithLyrics = score.parts[0].measures[0].entries.filter(
        e => e.type === 'note' && !e.rest && e.lyrics && e.lyrics.length > 0
      ) as any[];

      expect(notesWithLyrics.length).toBeGreaterThan(0);
    });
  });
});

// ============================================================
// Serializer Unit Tests
// ============================================================

describe('ABC Serializer', () => {
  it('should serialize header fields', () => {
    const abc = readFixture('simple-scale.abc');
    const score = parseAbc(abc);
    const output = serializeAbc(score);

    expect(output).toContain('X:1');
    expect(output).toContain('T:C Major Scale');
    expect(output).toContain('C:Traditional');
    expect(output).toContain('M:4/4');
    expect(output).toContain('K:C');
  });

  it('should serialize key signatures correctly', () => {
    const abc = readFixture('key-signatures.abc');
    const score = parseAbc(abc);
    const output = serializeAbc(score);

    expect(output).toContain('K:G');
  });

  it('should serialize minor key correctly', () => {
    const abc = readFixture('minor-key.abc');
    const score = parseAbc(abc);
    const output = serializeAbc(score);

    expect(output).toContain('K:Am');
  });

  it('should serialize note pitches correctly', () => {
    const abc = readFixture('simple-scale.abc');
    const score = parseAbc(abc);
    const output = serializeAbc(score);

    // Should contain note letters
    expect(output).toMatch(/[CDEFGAB]/);
  });

  it('should include tempo when present', () => {
    const abc = readFixture('twinkle.abc');
    const score = parseAbc(abc);
    const output = serializeAbc(score);

    expect(output).toContain('Q:');
    expect(output).toContain('100');
  });

  it('should serialize chord symbols', () => {
    const abc = readFixture('chord-symbols.abc');
    const score = parseAbc(abc);
    const output = serializeAbc(score);

    expect(output).toContain('"C"');
    expect(output).toContain('"F"');
    expect(output).toContain('"G"');
  });

  it('should serialize dynamics', () => {
    const abc = readFixture('dynamics.abc');
    const score = parseAbc(abc);
    const output = serializeAbc(score);

    expect(output).toContain('!p!');
    expect(output).toContain('!f!');
  });

  it('should serialize multi-voice with V: fields', () => {
    const abc = readFixture('multi-voice.abc');
    const score = parseAbc(abc);
    const output = serializeAbc(score);

    expect(output).toContain('V:1');
    expect(output).toContain('V:2');
  });
});

// ============================================================
// Round-trip Tests: ABC → Score → ABC → Score
// ============================================================

describe('ABC Round-trip', () => {
  const fixtures = [
    'simple-scale.abc',
    'twinkle.abc',
    'key-signatures.abc',
    'chord-symbols.abc',
    'accidentals.abc',
    'durations.abc',
    'rests.abc',
    'octaves.abc',
    'minor-key.abc',
    'chords.abc',
    'dynamics.abc',
    'ties-slurs.abc',
    'multi-voice.abc',
  ];

  for (const fixture of fixtures) {
    it(`should round-trip ${fixture}: ABC → Score → ABC → Score preserving music`, () => {
      const originalAbc = readFixture(fixture);

      // First pass: ABC → Score
      const score1 = parseAbc(originalAbc);

      // Serialize back to ABC
      const exportedAbc = serializeAbc(score1);

      // Second pass: ABC → Score
      const score2 = parseAbc(exportedAbc);

      // Compare the two Score objects
      // Same number of parts
      expect(score2.parts.length).toBe(score1.parts.length);

      // Same title
      expect(score2.metadata.movementTitle).toBe(score1.metadata.movementTitle);

      // Compare each part
      for (let pi = 0; pi < score1.parts.length; pi++) {
        const part1 = score1.parts[pi];
        const part2 = score2.parts[pi];

        // Same number of measures
        expect(part2.measures.length).toBe(part1.measures.length);

        // Compare each measure
        for (let mi = 0; mi < part1.measures.length; mi++) {
          const m1 = part1.measures[mi];
          const m2 = part2.measures[mi];

          // Compare key signature (first measure)
          if (m1.attributes?.key && m2.attributes?.key) {
            expect(m2.attributes.key.fifths).toBe(m1.attributes.key.fifths);
            expect(m2.attributes.key.mode).toBe(m1.attributes.key.mode);
          }

          // Compare time signature (first measure)
          if (m1.attributes?.time && m2.attributes?.time) {
            expect(m2.attributes.time.beats).toBe(m1.attributes.time.beats);
            expect(m2.attributes.time.beatType).toBe(m1.attributes.time.beatType);
          }

          // Compare notes - pitch and duration
          const notes1 = m1.entries.filter(e => e.type === 'note') as any[];
          const notes2 = m2.entries.filter(e => e.type === 'note') as any[];

          expect(notes2.length).toBe(notes1.length);

          for (let ni = 0; ni < notes1.length; ni++) {
            const n1 = notes1[ni];
            const n2 = notes2[ni];

            // Same pitch
            if (n1.pitch) {
              expect(n2.pitch?.step).toBe(n1.pitch.step);
              expect(n2.pitch?.octave).toBe(n1.pitch.octave);
              expect(n2.pitch?.alter).toBe(n1.pitch.alter);
            }

            // Same rest status
            if (n1.rest) {
              expect(n2.rest).toBeDefined();
            }

            // Same duration
            expect(n2.duration).toBe(n1.duration);

            // Same chord status
            expect(n2.chord).toBe(n1.chord);
          }

          // Compare harmonies
          const harms1 = m1.entries.filter(e => e.type === 'harmony') as any[];
          const harms2 = m2.entries.filter(e => e.type === 'harmony') as any[];
          expect(harms2.length).toBe(harms1.length);
          for (let hi = 0; hi < harms1.length; hi++) {
            expect(harms2[hi].root.rootStep).toBe(harms1[hi].root.rootStep);
            expect(harms2[hi].kind).toBe(harms1[hi].kind);
          }
        }
      }
    });
  }
});

// ============================================================
// Cross-format Tests: ABC → MusicXML → ABC
// ============================================================

describe('ABC to MusicXML cross-format', () => {
  it('should convert ABC to valid MusicXML', () => {
    const abc = readFixture('simple-scale.abc');
    const score = parseAbc(abc);
    const xml = serialize(score);

    // Should be valid XML
    expect(xml).toContain('<?xml');
    expect(xml).toContain('<score-partwise');

    // Should be re-parseable
    const reparsed = parse(xml);
    expect(reparsed.parts.length).toBe(score.parts.length);
  });

  it('should preserve musical content through ABC → MusicXML → Score', () => {
    const abc = readFixture('twinkle.abc');
    const score1 = parseAbc(abc);
    const xml = serialize(score1);
    const score2 = parse(xml);

    // Same number of parts and measures
    expect(score2.parts.length).toBe(score1.parts.length);
    expect(score2.parts[0].measures.length).toBe(score1.parts[0].measures.length);

    // Spot check first measure notes
    const notes1 = score1.parts[0].measures[0].entries.filter(
      e => e.type === 'note' && !e.rest
    ) as any[];
    const notes2 = score2.parts[0].measures[0].entries.filter(
      e => e.type === 'note' && !e.rest
    ) as any[];

    expect(notes2.length).toBe(notes1.length);
    for (let i = 0; i < notes1.length; i++) {
      expect(notes2[i].pitch?.step).toBe(notes1[i].pitch?.step);
      expect(notes2[i].pitch?.octave).toBe(notes1[i].pitch?.octave);
      expect(notes2[i].duration).toBe(notes1[i].duration);
    }
  });
});
