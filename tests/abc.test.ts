import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
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
      const abc = `X:1\nT:Tuplet\nM:4/4\nL:1/8\nK:C\n(3CDE (3FGA B2c2|\n`;
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
  // Automatically discover all .abc files in the fixtures directory
  const fixtures = readdirSync(fixturesPath)
    .filter(f => f.endsWith('.abc'))
    .sort();

  for (const fixture of fixtures) {
    it(`should round-trip ${fixture}: ABC → Score → ABC preserving text`, () => {
      const original = readFixture(fixture);

      // ABC → Score → ABC
      const roundTripped = serializeAbc(parseAbc(original));

      // Compare ignoring whitespace differences
      const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();
      expect(normalize(roundTripped)).toBe(normalize(original));
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

// ============================================================
// Real-world ABC Tunes: Round-trip Tests
// ============================================================

describe('Real-world ABC round-trip', () => {
  const realFixtures = [
    'real-kesh-jig.abc',
    'real-cooleys-reel.abc',
    'real-greensleeves.abc',
    'real-scarborough-fair.abc',
    'real-star-county-down.abc',
    'real-si-bheag.abc',
    'real-irish-washerwoman.abc',
    'real-amazing-grace.abc',
    'real-dotted-rhythms.abc',
    'real-complex-keys.abc',
  ];

  for (const fixture of realFixtures) {
    it(`should parse ${fixture} without errors`, () => {
      const abc = readFixture(fixture);
      expect(() => parseAbc(abc)).not.toThrow();
      const score = parseAbc(abc);
      expect(score.parts.length).toBeGreaterThan(0);
      expect(score.parts[0].measures.length).toBeGreaterThan(0);
    });

    it(`should round-trip ${fixture}: ABC → Score → ABC → Score`, () => {
      const originalAbc = readFixture(fixture);
      const score1 = parseAbc(originalAbc);
      const exportedAbc = serializeAbc(score1);
      const score2 = parseAbc(exportedAbc);

      // Same number of parts and measures
      expect(score2.parts.length).toBe(score1.parts.length);
      for (let pi = 0; pi < score1.parts.length; pi++) {
        expect(score2.parts[pi].measures.length).toBe(score1.parts[pi].measures.length);

        for (let mi = 0; mi < score1.parts[pi].measures.length; mi++) {
          const m1 = score1.parts[pi].measures[mi];
          const m2 = score2.parts[pi].measures[mi];

          // Compare notes
          const notes1 = m1.entries.filter(e => e.type === 'note') as any[];
          const notes2 = m2.entries.filter(e => e.type === 'note') as any[];
          expect(notes2.length).toBe(notes1.length);

          for (let ni = 0; ni < notes1.length; ni++) {
            const n1 = notes1[ni];
            const n2 = notes2[ni];

            if (n1.pitch) {
              expect(n2.pitch?.step).toBe(n1.pitch.step);
              expect(n2.pitch?.octave).toBe(n1.pitch.octave);
              expect(n2.pitch?.alter).toBe(n1.pitch.alter);
            }
            if (n1.rest) {
              expect(n2.rest).toBeDefined();
            }
            expect(n2.duration).toBe(n1.duration);
            expect(n2.chord).toBe(n1.chord);
          }
        }
      }
    });

    it(`should produce valid MusicXML from ${fixture}`, () => {
      const abc = readFixture(fixture);
      const score = parseAbc(abc);
      const xml = serialize(score);

      expect(xml).toContain('<?xml');
      expect(xml).toContain('<score-partwise');
      expect(() => parse(xml)).not.toThrow();

      // Verify the re-parsed MusicXML preserves structure
      const reparsed = parse(xml);
      expect(reparsed.parts.length).toBe(score.parts.length);
      expect(reparsed.parts[0].measures.length).toBe(score.parts[0].measures.length);
    });
  }

  // Specific musical content checks on real tunes

  it('should correctly parse 6/8 time for The Kesh Jig', () => {
    const abc = readFixture('real-kesh-jig.abc');
    const score = parseAbc(abc);
    const time = score.parts[0].measures[0].attributes?.time;
    expect(time?.beats).toBe('6');
    expect(time?.beatType).toBe(8);
  });

  it('should correctly parse Em key for Cooleys Reel', () => {
    const abc = readFixture('real-cooleys-reel.abc');
    const score = parseAbc(abc);
    const key = score.parts[0].measures[0].attributes?.key;
    // Em = 1 sharp, mode minor
    expect(key?.fifths).toBe(1);
    expect(key?.mode).toBe('minor');
  });

  it('should correctly parse Am key for Greensleeves', () => {
    const abc = readFixture('real-greensleeves.abc');
    const score = parseAbc(abc);
    const key = score.parts[0].measures[0].attributes?.key;
    expect(key?.fifths).toBe(0);
    expect(key?.mode).toBe('minor');
  });

  it('should correctly parse 3/4 time for Greensleeves', () => {
    const abc = readFixture('real-greensleeves.abc');
    const score = parseAbc(abc);
    const time = score.parts[0].measures[0].attributes?.time;
    expect(time?.beats).toBe('3');
    expect(time?.beatType).toBe(4);
  });

  it('should correctly parse Dm key for Scarborough Fair', () => {
    const abc = readFixture('real-scarborough-fair.abc');
    const score = parseAbc(abc);
    const key = score.parts[0].measures[0].attributes?.key;
    // Dm = -1 fifths, mode minor
    expect(key?.fifths).toBe(-1);
    expect(key?.mode).toBe('minor');
  });

  it('should parse chord symbols in Star of County Down', () => {
    const abc = readFixture('real-star-county-down.abc');
    const score = parseAbc(abc);
    const harmonies = score.parts[0].measures.flatMap(
      m => m.entries.filter(e => e.type === 'harmony')
    );
    expect(harmonies.length).toBeGreaterThan(0);
  });

  it('should parse D key for Si Bheag Si Mhor', () => {
    const abc = readFixture('real-si-bheag.abc');
    const score = parseAbc(abc);
    const key = score.parts[0].measures[0].attributes?.key;
    expect(key?.fifths).toBe(2);
    expect(key?.mode).toBe('major');
  });

  it('should parse lyrics in Amazing Grace', () => {
    const abc = readFixture('real-amazing-grace.abc');
    const score = parseAbc(abc);
    const notesWithLyrics = score.parts[0].measures.flatMap(
      m => m.entries.filter(e => e.type === 'note' && e.lyrics && e.lyrics.length > 0)
    );
    expect(notesWithLyrics.length).toBeGreaterThan(0);
  });

  it('should parse lyrics in Scarborough Fair', () => {
    const abc = readFixture('real-scarborough-fair.abc');
    const score = parseAbc(abc);
    const notesWithLyrics = score.parts[0].measures.flatMap(
      m => m.entries.filter(e => e.type === 'note' && e.lyrics && e.lyrics.length > 0)
    );
    expect(notesWithLyrics.length).toBeGreaterThan(0);
  });

  it('should handle dotted rhythms', () => {
    const abc = readFixture('real-dotted-rhythms.abc');
    const score = parseAbc(abc);
    const notes = score.parts[0].measures[0].entries.filter(
      e => e.type === 'note' && !e.rest
    ) as any[];

    // C3D with L:1/8: C is dotted quarter (3 eighth notes = 3*480 = 1440 divisions)
    // Actually 3 * unit = 3 * eighth = dotted quarter
    expect(notes[0].duration).toBe(3 * 480); // 3 eighth notes
    expect(notes[0].dots).toBe(1); // dotted quarter
  });

  it('should handle key change in complex keys', () => {
    const abc = readFixture('real-complex-keys.abc');
    const score = parseAbc(abc);
    const key = score.parts[0].measures[0].attributes?.key;
    expect(key?.fifths).toBe(2); // D major
  });

  it('should handle accidentals within key context (Greensleeves ^G)', () => {
    const abc = readFixture('real-greensleeves.abc');
    const score = parseAbc(abc);

    // Find notes with sharp G
    const allNotes = score.parts[0].measures.flatMap(
      m => m.entries.filter(e => e.type === 'note' && e.pitch)
    ) as any[];
    const sharpG = allNotes.find(n => n.pitch?.step === 'G' && n.pitch?.alter === 1);
    expect(sharpG).toBeDefined();
  });

  it('should handle anacrusis (pickup notes) in Cooleys Reel', () => {
    const abc = readFixture('real-cooleys-reel.abc');
    const score = parseAbc(abc);
    // The first measure starts with |:D2| which is a pickup
    // After the barline, D2 should be parsed as a note
    const firstMeasureNotes = score.parts[0].measures[0].entries.filter(
      e => e.type === 'note'
    );
    expect(firstMeasureNotes.length).toBeGreaterThan(0);
  });
});

// ============================================================
// User-provided Sample Tests
// ============================================================

describe('User-provided ABC samples', () => {
  describe('piano.abc - Bach BWV 1030 (multi-voice, overlay, inline L:)', () => {
    it('should parse into 2 voice parts', () => {
      const abc = readFixture('piano.abc');
      const score = parseAbc(abc);
      expect(score.parts.length).toBe(2);
    });

    it('should apply treble clef to V1 and bass clef to V2', () => {
      const abc = readFixture('piano.abc');
      const score = parseAbc(abc);
      const clef1 = score.parts[0].measures[0].attributes?.clef?.[0];
      const clef2 = score.parts[1].measures[0].attributes?.clef?.[0];
      expect(clef1?.sign).toBe('G');
      expect(clef1?.line).toBe(2);
      expect(clef2?.sign).toBe('F');
      expect(clef2?.line).toBe(4);
    });

    it('should round-trip clef preservation', () => {
      const abc = readFixture('piano.abc');
      const score1 = parseAbc(abc);
      const out = serializeAbc(score1);
      expect(out).toContain('clef=bass');
      const score2 = parseAbc(out);
      const clef2 = score2.parts[1].measures[0].attributes?.clef?.[0];
      expect(clef2?.sign).toBe('F');
      expect(clef2?.line).toBe(4);
    });

    it('should parse chords in V1 correctly', () => {
      const abc = readFixture('piano.abc');
      const score = parseAbc(abc);
      const v1 = score.parts[0];
      const entries = v1.measures[0].entries;
      // First chord [dAF]: 3 notes with chord flag on 2nd and 3rd
      const noteEntries = entries.filter(e => e.type === 'note' && e.pitch);
      expect(noteEntries.length).toBeGreaterThanOrEqual(3);
      // First note D5
      expect(noteEntries[0].type === 'note' && noteEntries[0].pitch?.step).toBe('D');
      expect(noteEntries[0].type === 'note' && noteEntries[0].pitch?.octave).toBe(5);
      // Second note A4 (chord)
      if (noteEntries[1].type === 'note') {
        expect(noteEntries[1].pitch?.step).toBe('A');
        expect(noteEntries[1].chord).toBe(true);
      }
    });

    it('should handle inline [L:1/32] duration change', () => {
      const abc = readFixture('piano.abc');
      const score = parseAbc(abc);
      const v1 = score.parts[0];
      const entries = v1.measures[0].entries.filter(e => e.type === 'note' && e.pitch);
      // After [L:1/32], notes ^cedc dcBA should have duration 120 (1/32 of whole = 960/8 = 120)
      const shortNotes = entries.filter(e => e.type === 'note' && e.duration === 120);
      expect(shortNotes.length).toBe(8); // ^c e d c d c B A
    });

    it('should handle & overlay with BackupEntry', () => {
      const abc = readFixture('piano.abc');
      const score = parseAbc(abc);
      const v1 = score.parts[0];
      const backups = v1.measures[0].entries.filter(e => e.type === 'backup');
      expect(backups.length).toBe(1);
    });

    it('should handle invisible rest x', () => {
      const abc = readFixture('piano.abc');
      const score = parseAbc(abc);
      const v1 = score.parts[0];
      // After & overlay, x3 should be parsed as a rest of duration 3 eighth notes
      const entries = v1.measures[0].entries;
      const backupIdx = entries.findIndex(e => e.type === 'backup');
      const restAfterBackup = entries[backupIdx + 1];
      expect(restAfterBackup.type).toBe('note');
      if (restAfterBackup.type === 'note') {
        expect(restAfterBackup.rest).toBeTruthy();
      }
    });

    it('should round-trip correctly', () => {
      const abc = readFixture('piano.abc');
      const score1 = parseAbc(abc);
      const out = serializeAbc(score1);
      const score2 = parseAbc(out);
      expect(score2.parts.length).toBe(2);
      for (let i = 0; i < score1.parts.length; i++) {
        let n1 = 0, n2 = 0;
        for (const m of score1.parts[i].measures) for (const e of m.entries) if (e.type === 'note') n1++;
        for (const m of score2.parts[i].measures) for (const e of m.entries) if (e.type === 'note') n2++;
        expect(n2).toBe(n1);
      }
    });

    it('should serialize with & overlay and V: markers', () => {
      const abc = readFixture('piano.abc');
      const score = parseAbc(abc);
      const out = serializeAbc(score);
      expect(out).toContain('V:1');
      expect(out).toContain('V:2');
      expect(out).toContain('&');
    });
  });

  describe('tune_008268.abc - Amelias Waltz (chord symbols, line continuation)', () => {
    it('should parse title and key', () => {
      const abc = readFixture('tune_008268.abc');
      const score = parseAbc(abc);
      expect(score.metadata.movementTitle).toBe("Amelia's Waltz");
      const key = score.parts[0].measures[0].attributes?.key;
      expect(key?.fifths).toBe(2); // D major
    });

    it('should preserve X: reference number through round-trip', () => {
      const abc = readFixture('tune_008268.abc');
      const score = parseAbc(abc);
      const out = serializeAbc(score);
      expect(out).toContain('X:448');
      const score2 = parseAbc(out);
      const out2 = serializeAbc(score2);
      expect(out2).toContain('X:448');
    });

    it('should parse 3/4 time signature', () => {
      const abc = readFixture('tune_008268.abc');
      const score = parseAbc(abc);
      const time = score.parts[0].measures[0].attributes?.time;
      expect(time?.beats).toBe('3');
      expect(time?.beatType).toBe(4);
    });

    it('should parse chord symbols', () => {
      const abc = readFixture('tune_008268.abc');
      const score = parseAbc(abc);
      const harmonies = score.parts[0].measures[0].entries.filter(e => e.type === 'harmony');
      expect(harmonies.length).toBeGreaterThan(0);
      if (harmonies[0].type === 'harmony') {
        expect(harmonies[0].root?.rootStep).toBe('D');
      }
    });

    it('should handle line continuation (backslash)', () => {
      const abc = readFixture('tune_008268.abc');
      const score = parseAbc(abc);
      // Should have ~31 measures despite lines being split with \
      expect(score.parts[0].measures.length).toBeGreaterThanOrEqual(20);
    });

    it('should round-trip note count', () => {
      const abc = readFixture('tune_008268.abc');
      const score1 = parseAbc(abc);
      const out = serializeAbc(score1);
      const score2 = parseAbc(out);
      let n1 = 0, n2 = 0;
      for (const m of score1.parts[0].measures) for (const e of m.entries) if (e.type === 'note') n1++;
      for (const m of score2.parts[0].measures) for (const e of m.entries) if (e.type === 'note') n2++;
      expect(n2).toBe(n1);
    });

    it('should preserve chord symbols in round-trip', () => {
      const abc = readFixture('tune_008268.abc');
      const score1 = parseAbc(abc);
      const out = serializeAbc(score1);
      const score2 = parseAbc(out);
      const h1 = score1.parts[0].measures.flatMap(m => m.entries.filter(e => e.type === 'harmony'));
      const h2 = score2.parts[0].measures.flatMap(m => m.entries.filter(e => e.type === 'harmony'));
      expect(h2.length).toBe(h1.length);
    });

    it('should generate valid MusicXML', () => {
      const abc = readFixture('tune_008268.abc');
      const score = parseAbc(abc);
      const xml = serialize(score);
      expect(xml).toContain('<score-partwise');
      expect(xml).toContain("Amelia");
    });
  });

  describe('tune_009270.abc - Angels From Heaven (4 voices)', () => {
    it('should parse into 4 voice parts', () => {
      const abc = readFixture('tune_009270.abc');
      const score = parseAbc(abc);
      expect(score.parts.length).toBe(4);
    });

    it('should parse each part with 18 measures', () => {
      const abc = readFixture('tune_009270.abc');
      const score = parseAbc(abc);
      for (const part of score.parts) {
        expect(part.measures.length).toBe(18);
      }
    });

    it('should parse complex chords like [B,G]', () => {
      const abc = readFixture('tune_009270.abc');
      const score = parseAbc(abc);
      // P1 measure 2 (index 2) starts with [B,G]
      const m2 = score.parts[0].measures[2];
      const notes = m2.entries.filter(e => e.type === 'note' && e.pitch);
      // [B,G] = B3 + G4 chord
      expect(notes.length).toBeGreaterThanOrEqual(2);
      if (notes[0].type === 'note') {
        expect(notes[0].pitch?.step).toBe('B');
        expect(notes[0].pitch?.octave).toBe(3);
      }
      if (notes[1].type === 'note') {
        expect(notes[1].pitch?.step).toBe('G');
        expect(notes[1].chord).toBe(true);
      }
    });

    it('should handle accidentals (sharp, natural)', () => {
      const abc = readFixture('tune_009270.abc');
      const score = parseAbc(abc);
      // P1 has ^F (F#) in measure 2
      const entries = score.parts[0].measures[2].entries;
      const fSharp = entries.find(
        e => e.type === 'note' && e.pitch?.step === 'F' && e.pitch?.alter === 1
      );
      expect(fSharp).toBeTruthy();
    });

    it('should round-trip all 4 parts', () => {
      const abc = readFixture('tune_009270.abc');
      const score1 = parseAbc(abc);
      const out = serializeAbc(score1);
      const score2 = parseAbc(out);
      expect(score2.parts.length).toBe(4);
      for (let i = 0; i < 4; i++) {
        let n1 = 0, n2 = 0;
        for (const m of score1.parts[i].measures) for (const e of m.entries) if (e.type === 'note') n1++;
        for (const m of score2.parts[i].measures) for (const e of m.entries) if (e.type === 'note') n2++;
        expect(n2).toBe(n1);
      }
    });

    it('should generate valid MusicXML with multiple parts', () => {
      const abc = readFixture('tune_009270.abc');
      const score = parseAbc(abc);
      const xml = serialize(score);
      expect(xml).toContain('<score-partwise');
      expect(xml).toContain('Angels From Heaven');
      // Should have 4 parts
      const partMatches = xml.match(/<part id=/g);
      expect(partMatches?.length).toBe(4);
    });
  });
});
