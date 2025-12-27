import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { parse } from '../src/parser';
import { serialize } from '../src/serializer';

const fixturesPath = join(__dirname, 'fixtures');

function getAllFixtures(dir: string): string[] {
  const files: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getAllFixtures(fullPath));
    } else if (entry.name.endsWith('.xml')) {
      files.push(fullPath);
    }
  }

  return files;
}

describe('Round-trip', () => {
  const fixtures = getAllFixtures(fixturesPath);

  for (const file of fixtures) {
    const relativePath = file.replace(fixturesPath + '/', '');

    it(`should preserve ${relativePath}`, () => {
      const original = readFileSync(file, 'utf-8');
      const score = parse(original);
      const exported = serialize(score);
      const reparsed = parse(exported);

      // Compare structure
      expect(reparsed.metadata.workTitle).toEqual(score.metadata.workTitle);
      expect(reparsed.partList.length).toEqual(score.partList.length);
      expect(reparsed.parts.length).toEqual(score.parts.length);

      // Compare each part
      for (let i = 0; i < score.parts.length; i++) {
        const originalPart = score.parts[i];
        const reparsedPart = reparsed.parts[i];

        expect(reparsedPart.id).toEqual(originalPart.id);
        expect(reparsedPart.measures.length).toEqual(originalPart.measures.length);

        // Compare each measure
        for (let j = 0; j < originalPart.measures.length; j++) {
          const originalMeasure = originalPart.measures[j];
          const reparsedMeasure = reparsedPart.measures[j];

          expect(reparsedMeasure.number).toEqual(originalMeasure.number);

          // Compare attributes
          if (originalMeasure.attributes) {
            expect(reparsedMeasure.attributes?.divisions).toEqual(originalMeasure.attributes.divisions);
            expect(reparsedMeasure.attributes?.key?.fifths).toEqual(originalMeasure.attributes.key?.fifths);
            expect(reparsedMeasure.attributes?.time?.beats).toEqual(originalMeasure.attributes.time?.beats);
            expect(reparsedMeasure.attributes?.time?.beatType).toEqual(originalMeasure.attributes.time?.beatType);
          }

          // Compare entries count and types
          expect(reparsedMeasure.entries.length).toEqual(originalMeasure.entries.length);

          for (let k = 0; k < originalMeasure.entries.length; k++) {
            const originalEntry = originalMeasure.entries[k];
            const reparsedEntry = reparsedMeasure.entries[k];

            expect(reparsedEntry.type).toEqual(originalEntry.type);

            if (originalEntry.type === 'note' && reparsedEntry.type === 'note') {
              expect(reparsedEntry.pitch?.step).toEqual(originalEntry.pitch?.step);
              expect(reparsedEntry.pitch?.octave).toEqual(originalEntry.pitch?.octave);
              expect(reparsedEntry.pitch?.alter).toEqual(originalEntry.pitch?.alter);
              expect(reparsedEntry.duration).toEqual(originalEntry.duration);
              expect(reparsedEntry.voice).toEqual(originalEntry.voice);
              expect(reparsedEntry.noteType).toEqual(originalEntry.noteType);
              expect(reparsedEntry.chord).toEqual(originalEntry.chord);
              expect(reparsedEntry.staff).toEqual(originalEntry.staff);
            }

            if (originalEntry.type === 'backup' && reparsedEntry.type === 'backup') {
              expect(reparsedEntry.duration).toEqual(originalEntry.duration);
            }

            if (originalEntry.type === 'forward' && reparsedEntry.type === 'forward') {
              expect(reparsedEntry.duration).toEqual(originalEntry.duration);
            }
          }
        }
      }
    });
  }

  it('should produce valid XML output', () => {
    const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
    const score = parse(xml);
    const exported = serialize(score);

    // Basic XML structure checks
    expect(exported.startsWith('<?xml')).toBe(true);
    expect(exported).toContain('<!DOCTYPE score-partwise');
    expect(exported).toContain('<score-partwise');
    expect(exported).toContain('</score-partwise>');

    // Should be re-parseable
    expect(() => parse(exported)).not.toThrow();
  });
});
