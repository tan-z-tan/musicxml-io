import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parse, getClefChanges } from '../src';

const fixturesPath = join(__dirname, 'fixtures');

describe('Parser', () => {
  describe('basic parsing', () => {
    it('should parse a single note', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      expect(score.metadata.workTitle).toBe('Single Note');
      expect(score.metadata.creators?.find(c => c.type === 'composer')?.value).toBe('Test');
      expect(score.partList).toHaveLength(1);
      const part0 = score.partList[0];
      expect(part0.type).toBe('score-part');
      if (part0.type === 'score-part') {
        expect(part0.id).toBe('P1');
        expect(part0.name).toBe('Piano');
      }

      expect(score.parts).toHaveLength(1);
      expect(score.parts[0].measures).toHaveLength(1);

      const measure = score.parts[0].measures[0];
      expect(measure.number).toBe('1');
      expect(measure.attributes?.divisions).toBe(1);
      expect(measure.attributes?.key?.fifths).toBe(0);
      expect(measure.attributes?.time?.beats).toBe('4');
      expect(measure.attributes?.time?.beatType).toBe(4);
      expect(measure.attributes?.clef).toHaveLength(1);
      expect(measure.attributes?.clef?.[0].sign).toBe('G');
      expect(measure.attributes?.clef?.[0].line).toBe(2);

      expect(measure.entries).toHaveLength(1);
      const note = measure.entries[0];
      expect(note.type).toBe('note');
      if (note.type === 'note') {
        expect(note.pitch?.step).toBe('C');
        expect(note.pitch?.octave).toBe(4);
        expect(note.duration).toBe(4);
        expect(note.voice).toBe('1');
        expect(note.noteType).toBe('whole');
      }
    });

    it('should parse a scale', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      expect(score.metadata.workTitle).toBe('C Major Scale');
      expect(score.parts[0].measures).toHaveLength(2);

      const measure1 = score.parts[0].measures[0];
      expect(measure1.entries).toHaveLength(4);

      const notes = measure1.entries.filter((e) => e.type === 'note');
      expect(notes).toHaveLength(4);

      const expectedSteps = ['C', 'D', 'E', 'F'];
      notes.forEach((note, i) => {
        if (note.type === 'note') {
          expect(note.pitch?.step).toBe(expectedSteps[i]);
          expect(note.pitch?.octave).toBe(4);
          expect(note.noteType).toBe('quarter');
        }
      });
    });

    it('should parse a chord', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/chord.xml'), 'utf-8');
      const score = parse(xml);

      expect(score.metadata.workTitle).toBe('C Major Chord');

      const measure = score.parts[0].measures[0];
      expect(measure.entries).toHaveLength(3);

      const notes = measure.entries.filter((e) => e.type === 'note');
      expect(notes).toHaveLength(3);

      if (notes[0].type === 'note') {
        expect(notes[0].pitch?.step).toBe('C');
        expect(notes[0].chord).toBeUndefined();
      }
      if (notes[1].type === 'note') {
        expect(notes[1].pitch?.step).toBe('E');
        expect(notes[1].chord).toBe(true);
      }
      if (notes[2].type === 'note') {
        expect(notes[2].pitch?.step).toBe('G');
        expect(notes[2].chord).toBe(true);
      }
    });

    it('should parse XML with processing instructions (e.g. Guitar Pro <?GP7 ...?>)', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/processing-instruction.xml'), 'utf-8');
      const score = parse(xml);

      expect(score.parts).toHaveLength(1);
      expect(score.parts[0].measures).toHaveLength(1);
      const measure = score.parts[0].measures[0];
      const note = measure.entries[0];
      expect(note.type).toBe('note');
      if (note.type === 'note') {
        expect(note.pitch?.step).toBe('C');
        expect(note.pitch?.octave).toBe(4);
      }
    });
  });

  describe('voice and staff parsing', () => {
    it('should parse two voices', () => {
      const xml = readFileSync(join(fixturesPath, 'voices/two-voices.xml'), 'utf-8');
      const score = parse(xml);

      expect(score.metadata.workTitle).toBe('Two Voices');

      const measure = score.parts[0].measures[0];

      // Should have notes for both voices and a backup
      const notes = measure.entries.filter((e) => e.type === 'note');
      const backups = measure.entries.filter((e) => e.type === 'backup');

      expect(notes.length).toBe(6); // 2 half notes + 4 quarter notes
      expect(backups.length).toBe(1);

      const voice1Notes = notes.filter((n) => n.type === 'note' && n.voice === '1');
      const voice2Notes = notes.filter((n) => n.type === 'note' && n.voice === '2');

      expect(voice1Notes).toHaveLength(2);
      expect(voice2Notes).toHaveLength(4);
    });

    it('should parse piano grand staff', () => {
      const xml = readFileSync(join(fixturesPath, 'voices/piano-grand-staff.xml'), 'utf-8');
      const score = parse(xml);

      expect(score.metadata.workTitle).toBe('Piano Grand Staff');

      const measure = score.parts[0].measures[0];
      expect(measure.attributes?.staves).toBe(2);
      expect(measure.attributes?.clef).toHaveLength(2);
      expect(measure.attributes?.clef?.[0].sign).toBe('G');
      expect(measure.attributes?.clef?.[0].staff).toBe(1);
      expect(measure.attributes?.clef?.[1].sign).toBe('F');
      expect(measure.attributes?.clef?.[1].staff).toBe(2);

      const notes = measure.entries.filter((e) => e.type === 'note');
      expect(notes).toHaveLength(2);

      if (notes[0].type === 'note') {
        expect(notes[0].staff).toBe(1);
        expect(notes[0].pitch?.octave).toBe(5);
      }
      if (notes[1].type === 'note') {
        expect(notes[1].staff).toBe(2);
        expect(notes[1].pitch?.octave).toBe(3);
      }
    });
  });

  describe('mid-measure attributes parsing', () => {
    const lilypondPath = join(fixturesPath, 'lilypond/xmlFiles');

    it('should put attributes after notes into entries, not measure.attributes (46c)', () => {
      // 46c-Midmeasure-Clef.xml measure 3: notes → <attributes> → notes
      // The <attributes> appears after notes, so it should be an AttributesEntry
      const xml = readFileSync(join(lilypondPath, '46c-Midmeasure-Clef.xml'), 'utf-8');
      const score = parse(xml);

      // Measure 3 (index 2, but it's the 4th measure counting implicit X1)
      // Find measure number "3"
      const measure3 = score.parts[0].measures.find(m => m.number === '3');
      expect(measure3).toBeDefined();

      // measure.attributes should be undefined since the only <attributes> is mid-measure
      expect(measure3!.attributes).toBeUndefined();

      // The attributes should be in entries as an AttributesEntry
      const attrEntries = measure3!.entries.filter(e => e.type === 'attributes');
      expect(attrEntries).toHaveLength(1);

      if (attrEntries[0].type === 'attributes') {
        expect(attrEntries[0].attributes.clef).toHaveLength(1);
        expect(attrEntries[0].attributes.clef![0].sign).toBe('G');
        expect(attrEntries[0].attributes.clef![0].line).toBe(2);
      }

      // Verify the entry order: note, note, attributes, note, note
      const entryTypes = measure3!.entries.map(e => e.type);
      expect(entryTypes).toEqual(['note', 'note', 'attributes', 'note', 'note']);
    });

    it('should keep attributes before notes in measure.attributes (42b measure 84)', () => {
      // 42b measure 84: <attributes> at start → notes → <attributes> mid-measure
      const xml = readFileSync(join(lilypondPath, '42b-MultiVoice-MidMeasureClefChange.xml'), 'utf-8');
      const score = parse(xml);

      const measure84 = score.parts[0].measures.find(m => m.number === '84');
      expect(measure84).toBeDefined();

      // First attributes (at start) should be in measure.attributes
      expect(measure84!.attributes).toBeDefined();
      expect(measure84!.attributes!.divisions).toBe(336);
      expect(measure84!.attributes!.clef).toHaveLength(2);

      // Second attributes (mid-measure, after notes) should be in entries
      const attrEntries = measure84!.entries.filter(e => e.type === 'attributes');
      expect(attrEntries).toHaveLength(1);

      if (attrEntries[0].type === 'attributes') {
        expect(attrEntries[0].attributes.clef).toHaveLength(1);
        expect(attrEntries[0].attributes.clef![0].sign).toBe('F');
      }
    });

    it('should report correct position for mid-measure clef changes (46c)', () => {
      const xml = readFileSync(join(lilypondPath, '46c-Midmeasure-Clef.xml'), 'utf-8');
      const score = parse(xml);

      const clefChanges = getClefChanges(score);

      // Find the G→C clef change (measure X1, at start) and C→G change (measure 3, mid-measure)
      const midMeasureClef = clefChanges.find(
        c => c.measureNumber === '3' && c.clef.sign === 'G'
      );
      expect(midMeasureClef).toBeDefined();
      // Position should be 2 (after two quarter notes with divisions=1)
      expect(midMeasureClef!.position).toBe(2);
    });

    it('should report correct position for mid-measure clef changes (42b)', () => {
      const xml = readFileSync(join(lilypondPath, '42b-MultiVoice-MidMeasureClefChange.xml'), 'utf-8');
      const score = parse(xml);

      const clefChanges = getClefChanges(score);

      // In measure 84, the mid-measure clef change (F clef on staff 1) appears after 3 eighth notes
      // divisions=336, each eighth note = 168 duration, so position should be 3*168 = 504
      const midMeasureClef = clefChanges.find(
        c => c.measureNumber === '84' && c.clef.sign === 'F' && c.staff === 1
      );
      expect(midMeasureClef).toBeDefined();
      expect(midMeasureClef!.position).toBe(504);
    });
  });
});
