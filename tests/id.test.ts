import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  parse,
  generateId,
  insertMeasure,
  changeKey,
  changeTime,
  NoteEntry,
} from '../src';
import {
  insertNote,
  duplicatePart,
  copyNotes,
  pasteNotes,
  copyNotesMultiMeasure,
} from '../src/operations';

const fixturesPath = join(__dirname, 'fixtures');

describe('Unique Element IDs', () => {
  describe('generateId', () => {
    it('should generate IDs with correct format', () => {
      const id = generateId();
      expect(id).toMatch(/^i[A-Za-z0-9_-]{10}$/);
      expect(id.length).toBe(11);
    });

    it('should generate unique IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 1000; i++) {
        ids.add(generateId());
      }
      expect(ids.size).toBe(1000);
    });
  });

  describe('parsing generates IDs', () => {
    it('should generate _id for Score', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);
      expect(score._id).toMatch(/^i[A-Za-z0-9_-]{10}$/);
    });

    it('should generate _id for Parts', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);
      expect(score.parts.length).toBeGreaterThan(0);
      score.parts.forEach((part) => {
        expect(part._id).toMatch(/^i[A-Za-z0-9_-]{10}$/);
      });
    });

    it('should generate _id for Measures', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);
      score.parts.forEach((part) => {
        part.measures.forEach((measure) => {
          expect(measure._id).toMatch(/^i[A-Za-z0-9_-]{10}$/);
        });
      });
    });

    it('should generate _id for Notes', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);
      const notes = score.parts[0].measures[0].entries.filter(
        (e) => e.type === 'note'
      ) as NoteEntry[];
      expect(notes.length).toBeGreaterThan(0);
      notes.forEach((note) => {
        expect(note._id).toMatch(/^i[A-Za-z0-9_-]{10}$/);
      });
    });

    it('should generate unique IDs for all elements', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const allIds: string[] = [];
      allIds.push(score._id);

      score.parts.forEach((part) => {
        allIds.push(part._id);
        part.measures.forEach((measure) => {
          allIds.push(measure._id);
          measure.entries.forEach((entry) => {
            allIds.push(entry._id);
          });
        });
      });

      const uniqueIds = new Set(allIds);
      expect(uniqueIds.size).toBe(allIds.length);
    });

    it('should generate _id for partList entries', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);
      score.partList.forEach((entry) => {
        expect(entry._id).toMatch(/^i[A-Za-z0-9_-]{10}$/);
      });
    });
  });

  describe('operations generate IDs', () => {
    it('insertNote should generate _id for new note', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      // Collect all existing note IDs
      const originalNoteIds: string[] = [];
      score.parts[0].measures.forEach((m) => {
        m.entries.forEach((e) => {
          if (e.type === 'note') originalNoteIds.push(e._id);
        });
      });

      // Use voice 2 to avoid conflicts with existing notes
      const result = insertNote(score, {
        partIndex: 0,
        measureIndex: 1,
        voice: 2,
        position: 0,
        pitch: { step: 'E', octave: 4 },
        duration: 1,
        noteType: 'quarter',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const newNotes = result.data.parts[0].measures[1].entries.filter(
          (e) => e.type === 'note'
        ) as NoteEntry[];
        const newNote = newNotes.find((n) => !originalNoteIds.includes(n._id));
        expect(newNote).toBeDefined();
        expect(newNote!._id).toMatch(/^i[A-Za-z0-9_-]{10}$/);
      }
    });

    it('insertMeasure should generate _id for new measure', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);
      const originalMeasureIds = score.parts[0].measures.map((m) => m._id);

      const result = insertMeasure(score, { afterMeasure: 1 });

      expect(result.parts[0].measures.length).toBe(2);
      const newMeasure = result.parts[0].measures.find(
        (m) => !originalMeasureIds.includes(m._id)
      );
      expect(newMeasure).toBeDefined();
      expect(newMeasure!._id).toMatch(/^i[A-Za-z0-9_-]{10}$/);
    });

    it('changeKey should generate _id for new barline if created', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const result = changeKey(score, { fifths: 2 }, { fromMeasure: 1 });

      // If barlines are created, they should have IDs
      result.parts[0].measures.forEach((measure) => {
        if (measure.barlines) {
          measure.barlines.forEach((barline) => {
            expect(barline._id).toMatch(/^i[A-Za-z0-9_-]{10}$/);
          });
        }
      });
    });
  });

  describe('duplicatePart generates new IDs', () => {
    it('should generate new IDs for duplicated part and all contents', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      // Collect all IDs from original score
      const originalIds = new Set<string>();
      originalIds.add(score._id);
      score.parts.forEach((part) => {
        originalIds.add(part._id);
        part.measures.forEach((measure) => {
          originalIds.add(measure._id);
          measure.entries.forEach((entry) => {
            originalIds.add(entry._id);
          });
        });
      });

      // Get the part ID
      const sourcePartId = score.parts[0].id;

      const result = duplicatePart(score, {
        sourcePartId,
        newPartId: 'P2',
        newPartName: 'Copy',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const newPart = result.data.parts.find((p) => p.id === 'P2');
        expect(newPart).toBeDefined();

        // New part should have unique ID
        expect(newPart!._id).toMatch(/^i[A-Za-z0-9_-]{10}$/);
        expect(originalIds.has(newPart!._id)).toBe(false);

        // All measures in new part should have unique IDs
        newPart!.measures.forEach((measure) => {
          expect(measure._id).toMatch(/^i[A-Za-z0-9_-]{10}$/);
          expect(originalIds.has(measure._id)).toBe(false);

          // All entries in new measures should have unique IDs
          measure.entries.forEach((entry) => {
            expect(entry._id).toMatch(/^i[A-Za-z0-9_-]{10}$/);
            expect(originalIds.has(entry._id)).toBe(false);
          });
        });
      }
    });
  });

  describe('copy/paste generates new IDs', () => {
    it('copyNotes should generate new IDs for copied notes', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      // Get original note IDs
      const originalNoteIds = score.parts[0].measures[0].entries
        .filter((e) => e.type === 'note')
        .map((e) => e._id);

      const copyResult = copyNotes(score, {
        partIndex: 0,
        measureIndex: 0,
        voice: 1,
        startPosition: 0,
        endPosition: 4,
      });

      expect(copyResult.success).toBe(true);
      if (copyResult.success) {
        // Copied notes should have new IDs
        copyResult.data.notes.forEach(({ note }) => {
          expect(note._id).toMatch(/^i[A-Za-z0-9_-]{10}$/);
          expect(originalNoteIds.includes(note._id)).toBe(false);
        });
      }
    });

    it('pasteNotes should generate new IDs for pasted notes', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      // Copy first measure
      const copyResult = copyNotes(score, {
        partIndex: 0,
        measureIndex: 0,
        voice: 1,
        startPosition: 0,
        endPosition: 2,
      });

      expect(copyResult.success).toBe(true);
      if (!copyResult.success) return;

      // Get IDs from copied notes
      const copiedIds = copyResult.data.notes.map(({ note }) => note._id);

      // Paste into second measure
      const pasteResult = pasteNotes(score, {
        selection: copyResult.data,
        partIndex: 0,
        measureIndex: 1,
        position: 0,
        voice: 1,
        overwrite: true,
      });

      expect(pasteResult.success).toBe(true);
      if (pasteResult.success) {
        // Pasted notes should have new IDs (different from copied IDs)
        const pastedNotes = pasteResult.data.parts[0].measures[1].entries.filter(
          (e) => e.type === 'note'
        ) as NoteEntry[];

        pastedNotes.forEach((note) => {
          expect(note._id).toMatch(/^i[A-Za-z0-9_-]{10}$/);
          // Each paste generates new IDs
          expect(copiedIds.includes(note._id)).toBe(false);
        });
      }
    });

    it('copyNotesMultiMeasure should generate new IDs for copied notes', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      // Get original note IDs from both measures
      const originalNoteIds: string[] = [];
      score.parts[0].measures.forEach((measure) => {
        measure.entries.forEach((entry) => {
          if (entry.type === 'note') {
            originalNoteIds.push(entry._id);
          }
        });
      });

      const copyResult = copyNotesMultiMeasure(score, {
        partIndex: 0,
        startMeasureIndex: 0,
        endMeasureIndex: 1,
        voice: 1,
      });

      expect(copyResult.success).toBe(true);
      if (copyResult.success) {
        // All copied notes should have new IDs
        copyResult.data.measures.forEach((measureData) => {
          measureData.notes.forEach(({ note }) => {
            expect(note._id).toMatch(/^i[A-Za-z0-9_-]{10}$/);
            expect(originalNoteIds.includes(note._id)).toBe(false);
          });
        });
      }
    });
  });

  describe('ID uniqueness across operations', () => {
    it('multiple insertNote operations should create unique IDs', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      let score = parse(xml);

      const allNoteIds: string[] = [];
      score.parts[0].measures.forEach((m) => {
        m.entries.forEach((e) => {
          if (e.type === 'note') allNoteIds.push(e._id);
        });
      });

      // Add notes to measure index 1 at different positions
      for (let i = 0; i < 4; i++) {
        const result = insertNote(score, {
          partIndex: 0,
          measureIndex: 1,
          voice: 2, // Use voice 2 to avoid conflicts
          position: i,
          pitch: { step: 'C', octave: 4 + i },
          duration: 1,
          noteType: 'quarter',
        });

        if (result.success) {
          score = result.data;
          // Collect new note IDs
          score.parts[0].measures[1].entries.forEach((e) => {
            if (e.type === 'note' && !allNoteIds.includes(e._id)) {
              allNoteIds.push(e._id);
            }
          });
        }
      }

      // All IDs should be unique
      const uniqueIds = new Set(allNoteIds);
      expect(uniqueIds.size).toBe(allNoteIds.length);
    });

    it('multiple paste operations should create unique IDs each time', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      let score = parse(xml);

      // Copy first note
      const copyResult = copyNotes(score, {
        partIndex: 0,
        measureIndex: 0,
        voice: 1,
        startPosition: 0,
        endPosition: 1,
      });

      expect(copyResult.success).toBe(true);
      if (!copyResult.success) return;

      const selection = copyResult.data;
      const pastedIds: string[] = [];

      // Paste into measure 1
      const result1 = pasteNotes(score, {
        selection,
        partIndex: 0,
        measureIndex: 1,
        position: 0,
        voice: 1,
        overwrite: true,
      });

      if (result1.success) {
        score = result1.data;
        const notes = score.parts[0].measures[1].entries.filter(
          (e) => e.type === 'note'
        ) as NoteEntry[];
        notes.forEach((n) => pastedIds.push(n._id));
      }

      // Paste again into same measure (to a different voice to avoid conflict)
      const result2 = pasteNotes(score, {
        selection,
        partIndex: 0,
        measureIndex: 1,
        position: 0,
        voice: 2, // Different voice to avoid conflict
      });

      if (result2.success) {
        score = result2.data;
        const notes = score.parts[0].measures[1].entries.filter(
          (e) => e.type === 'note' && e.voice === 2
        ) as NoteEntry[];
        notes.forEach((n) => pastedIds.push(n._id));
      }

      // All pasted IDs should be unique
      const uniqueIds = new Set(pastedIds);
      expect(uniqueIds.size).toBe(pastedIds.length);
    });
  });
});
