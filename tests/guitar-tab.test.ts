import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parse, serialize } from '../src';
import type { NoteEntry, TechnicalNotation } from '../src/types';

const fixturesPath = join(__dirname, 'fixtures');

function getNotes(entries: any[]): NoteEntry[] {
  return entries.filter(e => e.type === 'note') as NoteEntry[];
}

describe('Guitar TAB', () => {
  const xml = readFileSync(join(fixturesPath, 'guitar/guitar-tab-hammer-pull.xml'), 'utf-8');

  describe('parse', () => {
    const score = parse(xml);

    it('should parse two parts (standard notation + TAB)', () => {
      expect(score.parts).toHaveLength(2);
      expect(score.partList).toHaveLength(2);
    });

    it('should parse part-name and part-abbreviation with print-object="no"', () => {
      const p1 = score.partList[0];
      expect(p1.type).toBe('score-part');
      if (p1.type === 'score-part') {
        expect(p1.name).toBe('Guitar');
        expect(p1.namePrintObject).toBe(false);
        expect(p1.abbreviation).toBe('Gtr.');
        expect(p1.abbreviationPrintObject).toBe(false);
      }

      const p2 = score.partList[1];
      expect(p2.type).toBe('score-part');
      if (p2.type === 'score-part') {
        expect(p2.name).toBe('Guitar [TAB]');
        expect(p2.namePrintObject).toBe(false);
      }
    });

    it('should parse score-instrument with instrument-sound', () => {
      const p1 = score.partList[0];
      if (p1.type === 'score-part') {
        expect(p1.scoreInstruments).toHaveLength(1);
        expect(p1.scoreInstruments![0].id).toBe('P1-I1');
        expect(p1.scoreInstruments![0].name).toBe('Acoustic Guitar (steel)');
        expect(p1.scoreInstruments![0].sound).toBe('pluck.guitar');
      }
    });

    it('should parse midi-instrument', () => {
      const p1 = score.partList[0];
      if (p1.type === 'score-part') {
        expect(p1.midiInstruments).toHaveLength(1);
        expect(p1.midiInstruments![0].id).toBe('P1-I1');
        expect(p1.midiInstruments![0].channel).toBe(1);
        expect(p1.midiInstruments![0].program).toBe(26);
        expect(p1.midiInstruments![0].volume).toBe(80);
        expect(p1.midiInstruments![0].pan).toBe(0);
      }
    });

    it('should parse transpose with octave-change', () => {
      const attrs = score.parts[0].measures[0].attributes;
      expect(attrs?.transpose).toBeDefined();
      expect(attrs!.transpose!.diatonic).toBe(0);
      expect(attrs!.transpose!.chromatic).toBe(0);
      expect(attrs!.transpose!.octaveChange).toBe(-1);
    });

    it('should parse TAB clef', () => {
      const attrs = score.parts[1].measures[0].attributes;
      expect(attrs?.clef).toHaveLength(1);
      expect(attrs!.clef![0].sign).toBe('TAB');
      expect(attrs!.clef![0].line).toBe(5);
    });

    it('should parse key with print-object="no"', () => {
      const attrs = score.parts[1].measures[0].attributes;
      expect(attrs?.key?.printObject).toBe(false);
      expect(attrs?.key?.fifths).toBe(0);
      expect(attrs?.key?.mode).toBe('major');
    });

    it('should parse time with print-object="no"', () => {
      const attrs = score.parts[1].measures[0].attributes;
      expect(attrs?.time?.printObject).toBe(false);
    });

    it('should parse staff-details with 6 lines and tuning', () => {
      const attrs = score.parts[1].measures[0].attributes;
      expect(attrs?.staffDetails).toHaveLength(1);
      const sd = attrs!.staffDetails![0];
      expect(sd.staffLines).toBe(6);
      expect(sd.staffTuning).toHaveLength(6);

      // Standard guitar tuning E2-A2-D3-G3-B3-E4
      const expectedTuning = [
        { line: 1, step: 'E', octave: 2 },
        { line: 2, step: 'A', octave: 2 },
        { line: 3, step: 'D', octave: 3 },
        { line: 4, step: 'G', octave: 3 },
        { line: 5, step: 'B', octave: 3 },
        { line: 6, step: 'E', octave: 4 },
      ];
      for (let i = 0; i < 6; i++) {
        expect(sd.staffTuning![i].line).toBe(expectedTuning[i].line);
        expect(sd.staffTuning![i].tuningStep).toBe(expectedTuning[i].step);
        expect(sd.staffTuning![i].tuningOctave).toBe(expectedTuning[i].octave);
      }
    });

    it('should parse staff-size with scaling attribute', () => {
      const sd = score.parts[1].measures[0].attributes!.staffDetails![0];
      expect(sd.staffSize).toBe(167);
      expect(sd.staffSizeScaling).toBe(100);
    });

    it('should parse stem="none" for TAB notes', () => {
      const notes = getNotes(score.parts[1].measures[0].entries);
      expect(notes.length).toBe(5);
      for (const note of notes) {
        expect(note.stem?.value).toBe('none');
      }
    });

    it('should parse hammer-on notations in standard part', () => {
      const notes = getNotes(score.parts[0].measures[0].entries);
      // Note 0: C5 with hammer-on start
      const hammerOnStart = notes[0].notations?.find(
        (n): n is TechnicalNotation => n.type === 'technical' && n.technical === 'hammer-on' && n.startStop === 'start'
      );
      expect(hammerOnStart).toBeDefined();
      expect(hammerOnStart!.text).toBe('H');
      expect(hammerOnStart!.number).toBe(1);

      // Note 1: D5 with hammer-on stop
      const hammerOnStop = notes[1].notations?.find(
        (n): n is TechnicalNotation => n.type === 'technical' && n.technical === 'hammer-on' && n.startStop === 'stop'
      );
      expect(hammerOnStop).toBeDefined();
      expect(hammerOnStop!.number).toBe(1);
    });

    it('should parse pull-off notations with consecutive stop/start', () => {
      const notes = getNotes(score.parts[0].measures[0].entries);
      // Note 3: D5 has pull-off stop + pull-off start
      const pullOffs = notes[3].notations?.filter(
        (n): n is TechnicalNotation => n.type === 'technical' && n.technical === 'pull-off'
      );
      expect(pullOffs).toHaveLength(2);
      expect(pullOffs![0].startStop).toBe('stop');
      expect(pullOffs![1].startStop).toBe('start');
      expect(pullOffs![1].text).toBe('P');
    });

    it('should parse TAB part hammer-on with string and fret', () => {
      const notes = getNotes(score.parts[1].measures[0].entries);
      const technicals = notes[0].notations?.filter(
        (n): n is TechnicalNotation => n.type === 'technical'
      );

      const hammerOn = technicals?.find(t => t.technical === 'hammer-on');
      expect(hammerOn).toBeDefined();
      expect(hammerOn!.startStop).toBe('start');
      expect(hammerOn!.text).toBe('H');

      const str = technicals?.find(t => t.technical === 'string');
      expect(str).toBeDefined();
      expect(str!.string).toBe(3);

      const fret = technicals?.find(t => t.technical === 'fret');
      expect(fret).toBeDefined();
      expect(fret!.fret).toBe(5);
    });

    it('should parse slur with bezier attributes in TAB part', () => {
      const notes = getNotes(score.parts[1].measures[0].entries);
      const slur = notes[0].notations?.find(n => n.type === 'slur');
      expect(slur).toBeDefined();
      if (slur?.type === 'slur') {
        expect(slur.bezierX).toBe(18);
        expect(slur.bezierY).toBe(28);
        expect(slur.defaultX).toBe(5);
        expect(slur.defaultY).toBe(-20);
        expect(slur.placement).toBe('above');
        expect(slur.slurType).toBe('start');
      }
    });

    it('should parse accidental flat on Eb note', () => {
      const notes = getNotes(score.parts[0].measures[0].entries);
      // Note 2: Eb5
      expect(notes[2].pitch?.step).toBe('E');
      expect(notes[2].pitch?.alter).toBe(-1);
      expect(notes[2].accidental?.value).toBe('flat');
    });

    it('should parse beam elements', () => {
      const notes = getNotes(score.parts[0].measures[0].entries);
      // Note 2: Eb with beam begin
      expect(notes[2].beam).toHaveLength(1);
      expect(notes[2].beam![0].number).toBe(1);
      expect(notes[2].beam![0].type).toBe('begin');

      // Note 3: D with beam end
      expect(notes[3].beam).toHaveLength(1);
      expect(notes[3].beam![0].type).toBe('end');
    });

    it('should parse measure-numbering in print', () => {
      const m1 = score.parts[0].measures[0];
      expect(m1.print?.measureNumbering).toBeDefined();

      const m2 = score.parts[1].measures[0];
      expect(m2.print?.measureNumbering).toBeDefined();
    });

    it('should parse print page-layout and system-layout', () => {
      const print = score.parts[0].measures[0].print;
      expect(print?.pageLayout).toBeDefined();
      expect(print?.pageLayout?.pageHeight).toBe(1760);
      expect(print?.pageLayout?.pageWidth).toBe(1360);
      expect(print?.systemLayout).toBeDefined();
      expect(print?.systemLayout?.systemMargins?.leftMargin).toBe(68);
      expect(print?.systemLayout?.topSystemDistance).toBe(187);
    });
  });

  describe('roundtrip', () => {
    it('should preserve all data after import/export/reimport', () => {
      const score = parse(xml);
      const exported = serialize(score);
      const reparsed = parse(exported);

      // Part list
      expect(reparsed.partList.length).toBe(score.partList.length);
      for (let i = 0; i < score.partList.length; i++) {
        const orig = score.partList[i];
        const re = reparsed.partList[i];
        if (orig.type === 'score-part' && re.type === 'score-part') {
          expect(re.name).toBe(orig.name);
          expect(re.namePrintObject).toBe(orig.namePrintObject);
          expect(re.abbreviation).toBe(orig.abbreviation);
          expect(re.abbreviationPrintObject).toBe(orig.abbreviationPrintObject);
          expect(re.scoreInstruments).toEqual(orig.scoreInstruments);
          expect(re.midiInstruments).toEqual(orig.midiInstruments);
        }
      }

      // Parts structure
      expect(reparsed.parts.length).toBe(score.parts.length);
      for (let pi = 0; pi < score.parts.length; pi++) {
        const origPart = score.parts[pi];
        const rePart = reparsed.parts[pi];
        expect(rePart.id).toBe(origPart.id);
        expect(rePart.measures.length).toBe(origPart.measures.length);

        for (let mi = 0; mi < origPart.measures.length; mi++) {
          const origM = origPart.measures[mi];
          const reM = rePart.measures[mi];

          // Attributes
          if (origM.attributes) {
            expect(reM.attributes?.divisions).toBe(origM.attributes.divisions);
            expect(reM.attributes?.key?.fifths).toBe(origM.attributes.key?.fifths);
            expect(reM.attributes?.key?.mode).toBe(origM.attributes.key?.mode);
            expect(reM.attributes?.key?.printObject).toBe(origM.attributes.key?.printObject);
            expect(reM.attributes?.time?.beats).toBe(origM.attributes.time?.beats);
            expect(reM.attributes?.time?.beatType).toBe(origM.attributes.time?.beatType);
            expect(reM.attributes?.time?.printObject).toBe(origM.attributes.time?.printObject);
            expect(reM.attributes?.clef).toEqual(origM.attributes.clef);
            expect(reM.attributes?.transpose).toEqual(origM.attributes.transpose);
            expect(reM.attributes?.staffDetails).toEqual(origM.attributes.staffDetails);
          }

          // Notes
          const origNotes = getNotes(origM.entries);
          const reNotes = getNotes(reM.entries);
          expect(reNotes.length).toBe(origNotes.length);

          for (let ni = 0; ni < origNotes.length; ni++) {
            const origNote = origNotes[ni];
            const reNote = reNotes[ni];

            // Pitch
            expect(reNote.pitch?.step).toBe(origNote.pitch?.step);
            expect(reNote.pitch?.octave).toBe(origNote.pitch?.octave);
            expect(reNote.pitch?.alter).toBe(origNote.pitch?.alter);
            // Duration and voice
            expect(reNote.duration).toBe(origNote.duration);
            expect(reNote.voice).toBe(origNote.voice);
            expect(reNote.noteType).toBe(origNote.noteType);
            // Stem
            expect(reNote.stem?.value).toBe(origNote.stem?.value);
            // Accidental
            expect(reNote.accidental?.value).toBe(origNote.accidental?.value);
            // Beam
            expect(reNote.beam).toEqual(origNote.beam);

            // Notations: compare by type-specific content, not by index
            if (origNote.notations) {
              expect(reNote.notations).toBeDefined();
              expect(reNote.notations!.length).toBe(origNote.notations.length);

              // Compare technicals
              const origTech = origNote.notations.filter(n => n.type === 'technical') as TechnicalNotation[];
              const reTech = reNote.notations!.filter(n => n.type === 'technical') as TechnicalNotation[];
              expect(reTech.length).toBe(origTech.length);
              for (let ti = 0; ti < origTech.length; ti++) {
                expect(reTech[ti].technical).toBe(origTech[ti].technical);
                expect(reTech[ti].startStop).toBe(origTech[ti].startStop);
                expect(reTech[ti].number).toBe(origTech[ti].number);
                expect(reTech[ti].text).toBe(origTech[ti].text);
                expect(reTech[ti].string).toBe(origTech[ti].string);
                expect(reTech[ti].fret).toBe(origTech[ti].fret);
              }

              // Compare slurs
              const origSlurs = origNote.notations.filter(n => n.type === 'slur');
              const reSlurs = reNote.notations!.filter(n => n.type === 'slur');
              expect(reSlurs.length).toBe(origSlurs.length);
              for (let si = 0; si < origSlurs.length; si++) {
                const os = origSlurs[si];
                const rs = reSlurs[si];
                if (os.type === 'slur' && rs.type === 'slur') {
                  expect(rs.slurType).toBe(os.slurType);
                  expect(rs.number).toBe(os.number);
                  expect(rs.placement).toBe(os.placement);
                  expect(rs.bezierX).toBe(os.bezierX);
                  expect(rs.bezierY).toBe(os.bezierY);
                  expect(rs.defaultX).toBe(os.defaultX);
                  expect(rs.defaultY).toBe(os.defaultY);
                }
              }
            }
          }
        }
      }
    });

    it('should preserve XML content after serialize', () => {
      const score = parse(xml);
      const exported = serialize(score);

      // Key structural elements should be present
      expect(exported).toContain('<score-partwise');
      expect(exported).toContain('<part-name print-object="no">Guitar</part-name>');
      expect(exported).toContain('<part-name print-object="no">Guitar [TAB]</part-name>');
      expect(exported).toContain('<instrument-name>Acoustic Guitar (steel)</instrument-name>');
      expect(exported).toContain('<instrument-sound>pluck.guitar</instrument-sound>');
      expect(exported).toContain('<midi-channel>1</midi-channel>');
      expect(exported).toContain('<midi-program>26</midi-program>');
      expect(exported).toContain('<sign>TAB</sign>');
      expect(exported).toContain('<staff-lines>6</staff-lines>');
      expect(exported).toContain('<tuning-step>E</tuning-step>');
      expect(exported).toContain('<staff-size scaling="100">167</staff-size>');
      expect(exported).toContain('<octave-change>-1</octave-change>');
      expect(exported).toContain('<stem>none</stem>');
      expect(exported).toContain('<hammer-on number="1" type="start">H</hammer-on>');
      expect(exported).toContain('<hammer-on number="1" type="stop"/>');
      expect(exported).toContain('<pull-off number="1" type="start">P</pull-off>');
      expect(exported).toContain('<pull-off number="1" type="stop"/>');
      expect(exported).toContain('<string>3</string>');
      expect(exported).toContain('<fret>5</fret>');
      expect(exported).toContain('<fret>7</fret>');
      expect(exported).toContain('<fret>8</fret>');
      expect(exported).toContain('<accidental>flat</accidental>');
      expect(exported).toContain('key print-object="no"');
      expect(exported).toContain('time print-object="no"');
      expect(exported).toContain('<measure-numbering>system</measure-numbering>');
      expect(exported).toContain('<measure-numbering>none</measure-numbering>');
      expect(exported).toContain('bezier-x="18"');
      expect(exported).toContain('bezier-y="28"');
    });

    it('should preserve version attribute', () => {
      const score = parse(xml);
      expect(score.version).toBe('4.1');
      const exported = serialize(score);
      expect(exported).toContain('version="4.1"');
      expect(exported).toContain('MusicXML 4.1 Partwise');
    });

    it('should preserve element ordering: technical before slur in TAB part', () => {
      const score = parse(xml);
      const exported = serialize(score);
      // Find the TAB part section (part id="P2")
      const p2Start = exported.indexOf('<part id="P2">');
      expect(p2Start).toBeGreaterThan(-1);
      // In the TAB part, <technical> should come before <slur> within first <notations>
      const firstNotations = exported.indexOf('<notations>', p2Start);
      const techInNotations = exported.indexOf('<technical>', firstNotations);
      const slurInNotations = exported.indexOf('<slur', firstNotations);
      const notationsClose = exported.indexOf('</notations>', firstNotations);
      // technical should come before slur, and both before </notations>
      expect(techInNotations).toBeGreaterThan(firstNotations);
      expect(slurInNotations).toBeGreaterThan(techInNotations);
      expect(slurInNotations).toBeLessThan(notationsClose);
    });

    it('should produce text-equivalent XML after normalization', () => {
      const score = parse(xml);
      const exported = serialize(score);

      // Normalize: strip id attributes, strip leading whitespace, sort XML attributes
      function normalize(s: string): string {
        return s
          // Remove id="..." attributes
          .replace(/ id="[^"]*"/g, '')
          // Strip all leading whitespace (ignore indentation differences)
          .split('\n')
          .map(l => l.trim())
          .filter(l => l.length > 0)
          // Sort attributes within each element tag for comparison
          .map(line => {
            return line.replace(/<(\w[\w-]*)((?:\s+[\w:-]+="[^"]*")+)(\/?>)/g, (_match, tag, attrs, close) => {
              const attrList = attrs.trim().split(/\s+(?=[\w:-]+=")/);
              attrList.sort();
              return `<${tag} ${attrList.join(' ')}${close}`;
            });
          })
          .join('\n');
      }

      const normalizedOrig = normalize(xml);
      const normalizedExported = normalize(exported);

      // Split into lines and compare
      const origLines = normalizedOrig.split('\n');
      const exportedLines = normalizedExported.split('\n');

      // Find content differences (ignoring DOCTYPE which may differ in format)
      const origContent = origLines.filter(l => !l.includes('DOCTYPE') && !l.includes('<?xml'));
      const exportedContent = exportedLines.filter(l => !l.includes('DOCTYPE') && !l.includes('<?xml'));

      expect(exportedContent.length).toBe(origContent.length);
      for (let i = 0; i < origContent.length; i++) {
        expect(exportedContent[i]).toBe(origContent[i]);
      }
    });
  });
});
