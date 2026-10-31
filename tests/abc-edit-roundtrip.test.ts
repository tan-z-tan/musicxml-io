import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import {
  parse, serialize, parseAbcTunes, serializeAbc,
  changeKey, changeTime, insertClefChange, addTempo, modifyTempo, removeTempo,
  addPart, removePart, duplicatePart, insertMeasure, deleteMeasure, transpose, addLyric,
} from '../src';
import type { Score, OperationResult } from '../src';
import { abcSemanticTokens } from './helpers/abcSemantic';

/**
 * Parsing ABC keeps hints about how the tune was written so that it can be
 * written back the same way. Those hints must never undo an edit: after any
 * operation, the ABC written for a parsed score has to read back as the
 * edited score. Two checks per fixture and edit:
 *
 * - the ABC reads back with the edited score's parts, measures, key, meter,
 *   clef, tempo, title and pitches;
 * - it means the same as the ABC written from the score alone (with every
 *   hint stripped), so no hint changes what is written, only how.
 */

const dirs = ['abc', 'abc-hard'].map(d => join(__dirname, 'fixtures', d));

function data(result: OperationResult<Score> | Score | null): Score | null {
  if (!result) return null;
  if ('success' in result) return result.success ? result.data : null;
  return result;
}

function hasDirection(score: Score, mi: number, test: (dt: { kind: string; text?: string }) => boolean): boolean {
  return score.parts[0].measures[mi].entries.some(e => e.type === 'direction' && e.directionTypes.some(test));
}

/** Index of the first measure after the first that carries an inline field marker. */
function measureWithMarker(score: Score, field: string): number {
  return score.parts[0].measures.findIndex((m, mi) => mi > 0 &&
    hasDirection(score, mi, dt => dt.kind === 'words' && (dt.text ?? '').startsWith(`[${field}:`)));
}

function measureWithTempo(score: Score): number {
  return score.parts[0].measures.findIndex((m, mi) => mi > 0 && hasDirection(score, mi, dt => dt.kind === 'metronome'));
}

const EDITS: Record<string, (s: Score) => Score | null> = {
  key: s => data(changeKey(s, { fifths: 3, mode: 'major' }, { fromMeasure: s.parts[0].measures[0].number })),
  'key later': s => s.parts[0].measures.length > 2
    ? data(changeKey(s, { fifths: -2, mode: 'major' }, { fromMeasure: s.parts[0].measures[2].number })) : null,
  'key at an inline [K:]': s => {
    const mi = measureWithMarker(s, 'K');
    return mi > 0 && s.parts[0].measures[mi].attributes?.key
      ? data(changeKey(s, { fifths: 5, mode: 'major' }, { fromMeasure: s.parts[0].measures[mi].number })) : null;
  },
  meter: s => data(changeTime(s, { beats: '7', beatType: 8 }, { fromMeasure: s.parts[0].measures[0].number })),
  'meter at an inline [M:]': s => {
    const mi = measureWithMarker(s, 'M');
    return mi > 0 && s.parts[0].measures[mi].attributes?.time
      ? data(changeTime(s, { beats: '5', beatType: 4 }, { fromMeasure: s.parts[0].measures[mi].number })) : null;
  },
  clef: s => data(insertClefChange(s, { partIndex: 0, measureIndex: 0, position: 0, clef: { sign: 'C', line: 3 } })),
  'clef later': s => s.parts[0].measures.length > 2
    ? data(insertClefChange(s, { partIndex: 0, measureIndex: 2, position: 0, clef: { sign: 'F', line: 4 } })) : null,
  tempo: s => data(addTempo(s, { partIndex: 0, measureIndex: 0, position: 0, bpm: 177 })),
  'tempo later': s => s.parts[0].measures.length > 2
    ? data(addTempo(s, { partIndex: 0, measureIndex: 2, position: 0, bpm: 133 })) : null,
  'tempo at an inline [Q:]': s => {
    const mi = measureWithTempo(s);
    return mi > 0 ? data(modifyTempo(s, { partIndex: 0, measureIndex: mi, bpm: 61 })) : null;
  },
  'remove an inline tempo': s => {
    const mi = measureWithTempo(s);
    return mi > 0 ? data(removeTempo(s, { partIndex: 0, measureIndex: mi })) : null;
  },
  title: s => ({ ...s, metadata: { ...s.metadata, movementTitle: 'Edited Title' } }),
  composer: s => ({ ...s, metadata: { ...s.metadata, creators: [{ type: 'composer', value: 'Someone Else' }] } }),
  'add a part': s => data(addPart(s, { id: 'PNEW', name: 'New' })),
  'add a bass part': s => data(addPart(s, { id: 'PNEW', name: 'New', clef: { sign: 'F', line: 4 } })),
  'remove the first part': s => s.parts.length > 1 ? data(removePart(s, s.parts[0].id)) : null,
  'duplicate a part': s => data(duplicatePart(s, { sourcePartId: s.parts[0].id, newPartId: 'PDUP' })),
  'insert a measure': s => insertMeasure(s, { afterMeasure: s.parts[0].measures[0].number }),
  'delete a measure': s => s.parts[0].measures.length > 2 ? deleteMeasure(s, s.parts[0].measures[1].number) : null,
  transpose: s => data(transpose(s, 2)),
  'add a lyric': s => {
    const measures = s.parts[0].measures;
    const isSung = (e: Score['parts'][0]['measures'][0]['entries'][0]) => e.type === 'note' && !e.rest && !e.chord && !e.grace;
    const mi = measures.findIndex(m => m.entries.some(isSung));
    if (mi < 0) return null;
    const noteIndex = measures[mi].entries.filter(e => e.type === 'note').findIndex(isSung);
    return data(addLyric(s, { partIndex: 0, measureIndex: mi, noteIndex, text: 'zz', verse: 1 }));
  },
  'several edits': s => {
    let x: Score | null = insertMeasure(s, { afterMeasure: s.parts[0].measures[0].number });
    x = data(changeKey(x, { fifths: -3, mode: 'minor' }, { fromMeasure: x.parts[0].measures[0].number }));
    x = x && data(addPart(x, { id: 'PX', name: 'X', clef: { sign: 'F', line: 4 } }));
    x = x && x.parts.length > 2 ? data(removePart(x, x.parts[1].id)) : x;
    return x && x.parts[0].measures.length > 3 ? deleteMeasure(x, x.parts[0].measures[3].number) : x;
  },
  'edit after MusicXML': s => {
    const viaXml = parse(serialize(s));
    return viaXml.parts.length > 1
      ? data(removePart(viaXml, viaXml.parts[0].id))
      : data(changeKey(viaXml, { fifths: 4, mode: 'major' }, { fromMeasure: viaXml.parts[0].measures[0].number }));
  },
};

/** What an edit must not lose: one line per part, measure and header value. */
function scoreFacts(score: Score): string[] {
  const meta = score.metadata;
  const tempos = score.parts[0]?.measures.map(m => m.entries.flatMap(e =>
    e.type === 'direction' ? e.directionTypes.flatMap(dt => dt.kind === 'metronome' ? [dt.perMinute] : []) : []));
  const out = [
    `title ${meta.movementTitle}`,
    `composer ${meta.creators?.filter(c => c.type === 'composer').map(c => c.value)}`,
    `tempo ${JSON.stringify(tempos)}`,
    `parts ${score.parts.length}`,
  ];
  score.parts.forEach((p, pi) => {
    out.push(`P${pi} measures ${p.measures.length}`);
    const clef = p.measures[0]?.attributes?.clef?.[0];
    out.push(`P${pi} clef ${clef?.sign}${clef?.line ?? ''}`);
    let divisions = 1;
    let key = '';
    let time = '';
    p.measures.forEach((m, mi) => {
      if (m.attributes?.divisions) divisions = m.attributes.divisions;
      if (m.attributes?.key) key = `${m.attributes.key.fifths}`;
      if (m.attributes?.time) time = `${m.attributes.time.beats}/${m.attributes.time.beatType}`;
      const notes = m.entries.flatMap(e => e.type === 'note' && !e.grace
        ? [`${e.rest ? 'z' : e.pitch ? `${e.pitch.step}${e.pitch.alter ?? ''}${e.pitch.octave}` : 'x'}/${(e.duration / divisions).toFixed(3)}`]
        : []);
      // An empty measure is written as a bar rest
      const music = notes.length === 0 || (notes.length === 1 && notes[0].startsWith('z/')) ? 'bar rest' : notes.join(' ');
      out.push(`P${pi} M${mi + 1} key ${key} meter ${time}: ${music}`);
    });
  });
  return out;
}

function withoutHints(score: Score): Score {
  return {
    ...score,
    metadata: { ...score.metadata, miscellaneous: score.metadata.miscellaneous?.filter(m => !m.name.startsWith('abc-')) },
  };
}

/** First differing line of two fact lists, or null when they are the same. */
function firstDifference(actual: string[], expected: string[]): string | null {
  for (let i = 0; i < Math.max(actual.length, expected.length); i++) {
    if (actual[i] !== expected[i]) return `${actual[i]}  ≠  ${expected[i]}`;
  }
  return null;
}

describe('ABC edits after parsing', () => {
  const tunes = dirs.flatMap(dir => readdirSync(dir).filter(f => f.endsWith('.abc')).flatMap(file =>
    parseAbcTunes(readFileSync(join(dir, file), 'utf-8')).map((score, i) => ({ name: `${file}#${i + 1}`, score }))));

  for (const [editName, edit] of Object.entries(EDITS)) {
    it(`keeps the edit: ${editName}`, () => {
      const failures: string[] = [];
      for (const { name, score } of tunes) {
        const edited = edit(score);
        if (!edited) continue;
        const written = parseAbcTunes(serializeAbc(edited))[0];
        const lost = firstDifference(scoreFacts(written), scoreFacts(edited));
        if (lost) failures.push(`${name}: ${lost}`);
        const plain = parseAbcTunes(serializeAbc(withoutHints(edited)))[0];
        const differs = firstDifference(abcSemanticTokens(written), abcSemanticTokens(plain));
        if (differs) failures.push(`${name} (hints change the music): ${differs}`);
      }
      expect(failures).toEqual([]);
    });
  }
});
