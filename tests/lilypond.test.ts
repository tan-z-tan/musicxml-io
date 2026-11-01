import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, existsSync, unlinkSync, mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { spawnSync } from 'child_process';
import { parse } from '../src/importers';
import { parseAbc } from '../src/importers/abc';
import { serializeLilyPond } from '../src/exporters/lilypond';
import { parseFile, serializeToFile } from '../src/file';
import type { Score } from '../src/types';

const fixturesPath = join(__dirname, 'fixtures');
const fixture = (path: string) => parse(readFileSync(join(fixturesPath, path), 'utf-8'));
const abc = (body: string) => parseAbc(`X:1\nT:Test\n${body}\n`);

/** The music of one voice variable, without the variable wrapper. */
function voice(ly: string, name = 'partAStaffAVoiceA'): string {
  const match = ly.match(new RegExp(`^${name} = \\{\\n([\\s\\S]*?)\\n\\}`, 'm'));
  if (!match) throw new Error(`no variable ${name} in\n${ly}`);
  return match[1];
}

describe('LilyPond exporter', () => {
  describe('document structure', () => {
    it('writes version, header, voice variables and a score block', () => {
      const ly = serializeLilyPond(fixture('basic/single-note.xml'));
      expect(ly.startsWith('\\version "2.24.0"\n')).toBe(true);
      expect(ly).toContain('title = "Single Note"');
      expect(ly).toContain('composer = "Test"');
      expect(voice(ly)).toContain("\\time 4/4 \\key c \\major \\clef treble c'1 | % 1");
      expect(ly).toContain('\\new Staff = "partAStaffA" \\with { instrumentName = "Piano" }');
      expect(ly).toContain('\\new Voice = "partAStaffAVoiceA" { \\partAStaffAVoiceA }');
      expect(ly).toMatch(/\\score \{[\s\S]*\\layout \{ \}\n\}\n$/);
    });

    it('honours version, header and midi options', () => {
      const ly = serializeLilyPond(fixture('basic/single-note.xml'), { version: '2.22.0', includeHeader: false, midi: true });
      expect(ly).toContain('\\version "2.22.0"');
      expect(ly).not.toContain('\\header');
      expect(ly).toContain('\\midi { }');
    });

    it('escapes quotes and backslashes in strings', () => {
      const score = fixture('basic/single-note.xml');
      score.metadata.workTitle = 'Say "hi" \\ bye';
      expect(serializeLilyPond(score)).toContain('title = "Say \\"hi\\" \\\\ bye"');
    });
  });

  describe('pitches and durations', () => {
    it('writes absolute Dutch pitch names with accidentals and octaves', () => {
      const ly = serializeLilyPond(abc('M:3/4\nL:1/8\nK:F\nA,2 _B,2 ^c2|=B,2 __e2 ^^f2|'));
      const music = voice(ly);
      expect(music).toContain('\\key f \\major');
      expect(music).toContain("a4 bes4 cis''4 | % 1");
      expect(music).toContain("b4 eses''4 fisis''4 | % 2");
    });

    it('writes dotted values and ties', () => {
      const music = voice(serializeLilyPond(abc('M:4/4\nL:1/8\nK:C\nc3 d e4-|e8|')));
      expect(music).toContain("c''4. d''8 e''2~ | % 1");
      expect(music).toContain("e''1 | % 2");
    });

    it('writes chords, with ties inside the chord when only some notes are tied', () => {
      expect(voice(serializeLilyPond(fixture('basic/chord-partial-tie.xml')))).toContain("<c' e'~ g'>1");
      expect(voice(serializeLilyPond(fixture('basic/chord-all-tied.xml')))).toMatch(/<[^>]+>\d+~/);
    });

    it('wraps tuplets in \\tuplet and keeps the written values', () => {
      const music = voice(serializeLilyPond(abc('M:2/4\nL:1/8\nK:C\n(3cde f2|')));
      expect(music).toContain("\\tuplet 3/2 { c''8[ d''8 e''8] } f''4 | % 1");
    });

    it('keeps the unreduced tuplet numbers', () => {
      const ly = serializeLilyPond(fixture('lilypond/xmlFiles/23a-Tuplets.xml'));
      expect(ly).toContain('\\tuplet 4/2 {');
      expect(ly).not.toMatch(/\d\*\d+\/\d+ /); // no scaled durations needed
    });

    it('writes grace notes before their note and after-graces with \\afterGrace', () => {
      expect(voice(serializeLilyPond(abc('M:4/4\nL:1/4\nK:C\n{d}c c {/e}c c|')))).toMatch(/\\grace d''\d+ c''4 c''4 \\acciaccatura e''\d+ c''4/);
      expect(voice(serializeLilyPond(fixture('lilypond/xmlFiles/24d-AfterGrace.xml')))).toContain('\\afterGrace');
    });

    it('writes whole-measure rests as R, except in a pickup bar', () => {
      const score = abc('M:3/4\nL:1/4\nK:C\nz|z3|z3|');
      for (const m of score.parts[0].measures) {
        for (const e of m.entries) if (e.type === 'note' && e.rest) e.rest.measure = true;
      }
      const music = voice(serializeLilyPond(score));
      expect(music).toMatch(/\\partial 4 r4 \| % \d+/);
      expect(music).toContain('R2. |');
      // A rest written with a note value stays a normal rest.
      expect(voice(serializeLilyPond(abc('M:3/4\nL:1/4\nK:C\nz3|')))).toContain('r2.');
    });
  });

  describe('measures', () => {
    it('writes a pickup as \\partial and drops the bar check on a short final bar', () => {
      const music = voice(serializeLilyPond(abc('M:3/4\nL:1/4\nK:C\nG|c d e|f2|')));
      expect(music).toMatch(/\\partial 4 g'4 \| % \d+/);
      expect(music).toMatch(/f''2 % \d+$/m);
      expect(music).not.toMatch(/f''2 \|/);
    });

    it('writes time signature changes', () => {
      const music = voice(serializeLilyPond(abc('M:4/4\nL:1/4\nK:C\nc4|[M:3/4]c3|')));
      // The inline field is not printed as text.
      expect(music).toContain("\\time 3/4 c''2. | % 2");
    });

    it('writes repeats and volta brackets as repeatCommands', () => {
      const music = voice(serializeLilyPond(abc('M:4/4\nL:1/4\nK:G\n|:GABc|1 d4:|2 e4|]')));
      const lines = music.split('\n').map(l => l.trim());
      expect(lines[0]).toMatch(/^\\set Score\.repeatCommands = #'\(start-repeat\)/);
      expect(lines[1]).toMatch(/^\\set Score\.repeatCommands = #'\(\(volta "1\."\)\)/);
      expect(lines[2]).toMatch(/^\\set Score\.repeatCommands = #'\(\(volta #f\) end-repeat \(volta "2\."\)\)/);
      expect(lines[3]).toBe("\\set Score.repeatCommands = #'((volta #f)) \\bar \"|.\"");
    });
  });

  describe('voices and staves', () => {
    it('splits MusicXML voices into simultaneous LilyPond voices', () => {
      const ly = serializeLilyPond(fixture('voices/two-voices.xml'));
      expect(voice(ly, 'partAStaffAVoiceA')).toContain("e''2 d''2 | % 1");
      expect(voice(ly, 'partAStaffAVoiceB')).toContain("c'4 d'4 e'4 f'4 | % 1");
      expect(ly).toContain('{ \\voiceOne \\partAStaffAVoiceA }');
      expect(ly).toContain('{ \\voiceTwo \\partAStaffAVoiceB }');
    });

    it('writes a multi-staff part as a PianoStaff', () => {
      const ly = serializeLilyPond(fixture('voices/piano-grand-staff.xml'));
      expect(ly).toContain('\\new PianoStaff \\with { instrumentName = "Piano" shortInstrumentName = "Pno." } <<');
      expect(voice(ly, 'partAStaffBVoiceA')).toContain('\\clef bass c1');
    });

    it('pads voices with spacer rests so they line up', () => {
      const score = fixture('voices/two-voices.xml');
      // Drop the second half of voice 1 in the only measure.
      const entries = score.parts[0].measures[0].entries;
      const i = entries.findIndex(e => e.type === 'note' && e.pitch?.step === 'D' && e.voice === '1');
      entries.splice(i, 1);
      expect(voice(serializeLilyPond(score))).toContain("e''2 s2 | % 1");
    });

    it('writes TAB staves with their tuning and string numbers', () => {
      const ly = serializeLilyPond(fixture('lilypond/xmlFiles/71e-TabStaves.xml'));
      expect(ly).toContain("\\new TabStaff = \"partAStaffA\" \\with { instrumentName = \"Guitar\" shortInstrumentName = \"Gtr.\" stringTunings = \\stringTuning <e, a, d g b e'> }");
      expect(ly).toContain('\\new TabVoice = "partAStaffAVoiceA"');
      expect(voice(ly)).toContain("e''4\\2");
    });

    it('groups parts by their part-group', () => {
      const ly = serializeLilyPond(fixture('lilypond/xmlFiles/41c-StaffGroups.xml'));
      expect(ly).toMatch(/\\new StaffGroup/);
      expect(ly).toMatch(/\\new GrandStaff|\\new PianoStaff/);
    });
  });

  describe('notations and directions', () => {
    it('writes slurs, articulations and dynamics', () => {
      const music = voice(serializeLilyPond(abc('M:4/4\nL:1/4\nK:C\n!p!(c .d) !>!e !fermata!f|')));
      expect(music).toContain("c''4\\p( d''4-.) e''4-> f''4\\fermata");
    });

    it('leaves out slurs whose ends are in different voices', () => {
      const ly = serializeLilyPond(fixture('musicxml_samples/Dichterliebe01.musicxml'));
      for (const name of ly.match(/^\w+(?= = \{)/gm) ?? []) {
        const music = voice(ly, name);
        // Within one voice, slurs must alternate open/close.
        let open = 0;
        for (const ch of music.replace(/"[^"]*"/g, '').replace(/\\=\d+/g, '')) {
          if (ch === '(') open++;
          if (ch === ')') open--;
          expect(open).toBeGreaterThanOrEqual(0);
          expect(open).toBeLessThanOrEqual(2);
        }
      }
    });

    it('writes tempo marks, text and hairpins', () => {
      const ly = serializeLilyPond(fixture('lilypond/xmlFiles/31a-Directions.xml'));
      expect(ly).toMatch(/\\tempo /);
      expect(ly).toContain('\\<');
      expect(ly).toContain('\\!');
      expect(ly).toMatch(/\^"[^"]+"|\\markup/);
    });

    it('can leave out dynamics', () => {
      const music = voice(serializeLilyPond(abc('M:4/4\nL:1/4\nK:C\n!p!c !<(!d e !<)!f|'), { includeDynamics: false }));
      expect(music).not.toMatch(/\\p\b|\\<|\\!/);
    });

    it('uses automatic beaming when asked to', () => {
      const ly = serializeLilyPond(abc('M:2/4\nL:1/8\nK:C\ncdef|'), { preserveBeams: false });
      expect(ly).not.toContain('\\autoBeamOff');
      expect(voice(ly)).not.toContain('[');
    });
  });

  describe('chord symbols and lyrics', () => {
    it('writes chord symbols as a ChordNames context', () => {
      const ly = serializeLilyPond(abc('M:4/4\nL:1/4\nK:G\n"G"G A "D7"B c|"Em"e4|'));
      expect(ly).toContain('partAChords = \\chordmode {\n  g2 d2:7 |\n  e1:m |\n}');
      expect(ly).toContain('\\new ChordNames \\partAChords');
      expect(serializeLilyPond(abc('M:4/4\nL:1/4\nK:G\n"G"G4|'), { includeChordSymbols: false })).not.toContain('chordmode');
    });

    it('writes lyrics with hyphens, extenders and skips aligned to the voice', () => {
      const ly = serializeLilyPond(abc('M:4/4\nL:1/4\nK:C\nc d e2-|e f g2|\nw: Hel-lo world_ * one two'));
      expect(ly).toContain('\\new Lyrics \\with { ignoreMelismata = ##t } \\lyricsto "partAStaffAVoiceA" \\partAStaffAVoiceALyricsA');
      const lyrics = ly.match(/partAStaffAVoiceALyricsA = \\lyricmode \{\n\s*(.*)\n\}/)![1];
      // world is held over the tied note, f is skipped (*), one falls on g.
      expect(lyrics.split(/\s+/)).toEqual(['Hel', '--', 'lo', 'world', '__', '_', '_', 'one']);
    });

    it('writes one Lyrics context per verse', () => {
      const ly = serializeLilyPond(fixture('lilypond/xmlFiles/61b-MultipleLyrics.xml'));
      expect(ly.match(/\\new Lyrics/g)).toHaveLength(3);
    });

    it('quotes syllables LilyPond would read as something else', () => {
      const score = abc('M:4/4\nL:1/4\nK:C\nc d e f|\nw: 1. a_b x y');
      const ly = serializeLilyPond(score);
      expect(ly).toMatch(/lyricmode \{\n\s*"1\."/);
    });
  });

  describe('serializeToFile', () => {
    const files: string[] = [];
    afterEach(() => {
      for (const f of files) if (existsSync(f)) unlinkSync(f);
      files.length = 0;
    });

    it('writes .ly files', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'ly-'));
      const out = join(dir, 'out.ly');
      files.push(out);
      const score = await parseFile(join(fixturesPath, 'basic/scale.xml'));
      await serializeToFile(score, out, { includeHeader: false });
      const text = readFileSync(out, 'utf-8');
      expect(text.startsWith('\\version')).toBe(true);
      expect(text).not.toContain('\\header');
      rmSync(dir, { recursive: true, force: true });
    });
  });
});

// ------------------------------------------------------------
// Engraving with a real LilyPond, when one is installed.
// Set LILYPOND to the binary, or have `lilypond` on PATH.
// ------------------------------------------------------------

const lilypondBin = process.env.LILYPOND || 'lilypond';
const hasLilypond = spawnSync(lilypondBin, ['--version'], { encoding: 'utf-8' }).status === 0;

const ENGRAVE_FIXTURES = [
  'lilypond/xmlFiles/01a-Pitches-Pitches.xml',
  'lilypond/xmlFiles/03aa-Rhythm-Durations.xml',
  'lilypond/xmlFiles/11a-TimeSignatures.xml',
  'lilypond/xmlFiles/23d-Tuplets-Nested.xml',
  'lilypond/xmlFiles/24a-GraceNotes.xml',
  'lilypond/xmlFiles/31a-Directions.xml',
  'lilypond/xmlFiles/41c-StaffGroups.xml',
  'lilypond/xmlFiles/45b-RepeatWithAlternatives.xml',
  'lilypond/xmlFiles/46a-Barlines.xml',
  'lilypond/xmlFiles/61b-MultipleLyrics.xml',
  'lilypond/xmlFiles/71e-TabStaves.xml',
  'lilypond/xmlFiles/71g-MultipleChordnames.xml',
  'musicxml_samples/Dichterliebe01.musicxml',
  'abc/repeats.abc',
];

describe.skipIf(!hasLilypond)('LilyPond engraving', () => {
  it.each(ENGRAVE_FIXTURES)('%s compiles without errors or timing warnings', async (path) => {
    const score: Score = await parseFile(join(fixturesPath, path));
    const dir = mkdtempSync(join(tmpdir(), 'ly-'));
    try {
      const file = join(dir, 'score.ly');
      writeFileSync(file, serializeLilyPond(score));
      const result = spawnSync(lilypondBin, ['-dno-point-and-click', '-o', join(dir, 'score'), file], { encoding: 'utf-8' });
      const log = result.stderr + result.stdout;
      expect(result.status, log).toBe(0);
      expect(log).not.toMatch(/error:/);
      expect(log).not.toMatch(/bar check failed|cannot end slur|already have slur|VoltaBracket|beam was started/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60000);
});
