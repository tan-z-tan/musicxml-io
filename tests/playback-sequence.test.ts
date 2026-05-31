import { describe, it, expect } from 'vitest';
import type { Score, Measure, Barline, DirectionEntry, SoundEntry, NoteEntry } from '../src/types';
import { generatePlaybackSequence, hasPlaybackControls } from '../src/query/playback-sequence';
import { exportMidi } from '../src/exporters';

let idCounter = 0;
const id = () => `id-${idCounter++}`;

function note(octave = 4): NoteEntry {
  return {
    _id: id(),
    type: 'note',
    pitch: { step: 'C', octave },
    duration: 4,
    voice: '1',
  };
}

interface MeasureSpec {
  /** barlines on the measure (repeats, endings) */
  barlines?: Barline[];
  /** direction word text, e.g. "D.C. al Fine" */
  words?: string;
  /** segno/coda symbol direction-types */
  symbol?: 'segno' | 'coda';
  /** standalone <sound> flags */
  sound?: Partial<Omit<SoundEntry, '_id' | 'type'>>;
}

function measure(num: number, spec: MeasureSpec = {}): Measure {
  // Encode the measure number into the pitch (octave) so MIDI note-ons can be
  // mapped back to their source measure: C(octave=num) -> midi 12*(num+1).
  const entries: Measure['entries'] = [note(num)];

  if (spec.words) {
    const dir: DirectionEntry = {
      _id: id(),
      type: 'direction',
      directionTypes: [{ kind: 'words', text: spec.words }],
    };
    entries.push(dir);
  }
  if (spec.symbol) {
    const dir: DirectionEntry = {
      _id: id(),
      type: 'direction',
      directionTypes: [{ kind: spec.symbol }],
    };
    entries.push(dir);
  }
  if (spec.sound) {
    const s: SoundEntry = { _id: id(), type: 'sound', ...spec.sound };
    entries.push(s);
  }

  return {
    _id: id(),
    number: String(num),
    entries,
    barlines: spec.barlines,
  };
}

function forwardRepeat(): Barline {
  return { _id: id(), location: 'left', repeat: { direction: 'forward' } };
}
function backwardRepeat(times = 2): Barline {
  return { _id: id(), location: 'right', repeat: { direction: 'backward', times } };
}
function endingStart(number: string): Barline {
  return { _id: id(), location: 'left', ending: { number, type: 'start' } };
}
function endingStop(number: string): Barline {
  return { _id: id(), location: 'right', ending: { number, type: 'stop' } };
}

function scoreOf(measures: Measure[]): Score {
  return {
    _id: id(),
    metadata: {},
    partList: [{ type: 'score-part', _id: id(), id: 'P1' }],
    parts: [{ _id: id(), id: 'P1', measures }],
  } as Score;
}

/** Convenience: run the sequence and return the played measure numbers (1-based). */
function play(measures: Measure[]): number[] {
  const score = scoreOf(measures);
  return generatePlaybackSequence(score).map((m) => Number(measures[m.measureIndex].number));
}

describe('generatePlaybackSequence', () => {
  it('plays straight through when there are no controls', () => {
    expect(play([measure(1), measure(2), measure(3)])).toEqual([1, 2, 3]);
  });

  it('hasPlaybackControls reflects presence of structure', () => {
    expect(hasPlaybackControls(scoreOf([measure(1), measure(2)]))).toBe(false);
    expect(
      hasPlaybackControls(scoreOf([measure(1, { barlines: [backwardRepeat()] }), measure(2)]))
    ).toBe(true);
  });

  describe('simple repeats', () => {
    it('repeats a section back to a forward repeat', () => {
      // |: m1 m2 :| m3
      const measures = [
        measure(1, { barlines: [forwardRepeat()] }),
        measure(2, { barlines: [backwardRepeat()] }),
        measure(3),
      ];
      expect(play(measures)).toEqual([1, 2, 1, 2, 3]);
    });

    it('repeats from the start of the piece when no forward repeat is marked', () => {
      // m1 m2 :| m3
      const measures = [
        measure(1),
        measure(2, { barlines: [backwardRepeat()] }),
        measure(3),
      ];
      expect(play(measures)).toEqual([1, 2, 1, 2, 3]);
    });

    it('honors an explicit repeat count', () => {
      // |: m1 :|x3
      const measures = [measure(1, { barlines: [forwardRepeat(), backwardRepeat(3)] })];
      expect(play(measures)).toEqual([1, 1, 1]);
    });

    it('handles two sequential (non-nested) repeat sections', () => {
      // |: m1 :| |: m2 :| m3
      const measures = [
        measure(1, { barlines: [forwardRepeat(), backwardRepeat()] }),
        measure(2, { barlines: [forwardRepeat(), backwardRepeat()] }),
        measure(3),
      ];
      expect(play(measures)).toEqual([1, 1, 2, 2, 3]);
    });
  });

  describe('voltas (1st/2nd endings)', () => {
    it('skips the 1st ending on the repeat pass', () => {
      // |: m1 [1. m2 :| ] [2. m3 ] m4
      const measures = [
        measure(1, { barlines: [forwardRepeat()] }),
        measure(2, { barlines: [endingStart('1'), backwardRepeat(), endingStop('1')] }),
        measure(3, { barlines: [endingStart('2'), endingStop('2')] }),
        measure(4),
      ];
      // Pass 1: m1, m2 (ending 1), repeat. Pass 2: m1, skip m2, m3 (ending 2), m4
      expect(play(measures)).toEqual([1, 2, 1, 3, 4]);
    });
  });

  describe('jumps', () => {
    it('D.C. returns to the beginning once', () => {
      // m1 m2 m3(D.C.)
      const measures = [measure(1), measure(2), measure(3, { words: 'D.C.' })];
      expect(play(measures)).toEqual([1, 2, 3, 1, 2, 3]);
    });

    it('D.C. al Fine returns to the start and stops at Fine', () => {
      // m1 m2(Fine) m3 m4(D.C. al Fine)
      const measures = [
        measure(1),
        measure(2, { words: 'Fine' }),
        measure(3),
        measure(4, { words: 'D.C. al Fine' }),
      ];
      expect(play(measures)).toEqual([1, 2, 3, 4, 1, 2]);
    });

    it('D.S. al Coda jumps to segno then out to the coda', () => {
      // m1 m2(Segno) m3(To Coda) m4(D.S. al Coda) m5(Coda)
      const measures = [
        measure(1),
        measure(2, { symbol: 'segno' }),
        measure(3, { words: 'To Coda' }),
        measure(4, { words: 'D.S. al Coda' }),
        measure(5, { symbol: 'coda' }),
      ];
      // straight to m4, jump to segno (m2), play m3=To Coda then jump to coda (m5)
      expect(play(measures)).toEqual([1, 2, 3, 4, 2, 3, 5]);
    });

    it('detects D.C. from a standalone <sound dacapo>', () => {
      const measures = [measure(1), measure(2, { sound: { dacapo: true } })];
      expect(play(measures)).toEqual([1, 2, 1, 2]);
    });
  });

  describe('MIDI export integration', () => {
    // Walk the first part track (track index 1) and return note-on pitches in
    // time order, then map each pitch back to its source measure number.
    function playedMeasuresFromMidi(measures: Measure[]): number[] {
      const data = exportMidi(scoreOf(measures));

      // Skip the 14-byte header, then the conductor track (track 0).
      let pos = 14;
      const readChunkLen = (p: number) =>
        (data[p + 4] << 24) | (data[p + 5] << 16) | (data[p + 6] << 8) | data[p + 7];

      // Track 0 (conductor)
      const track0Len = readChunkLen(pos);
      pos += 8 + track0Len;

      // Track 1 (first part)
      const trackLen = readChunkLen(pos);
      const bodyStart = pos + 8;
      const bodyEnd = bodyStart + trackLen;

      const pitches: number[] = [];
      let i = bodyStart;
      let runningStatus = 0;
      const readVarLen = () => {
        let value = 0;
        for (;;) {
          const byte = data[i++];
          value = (value << 7) | (byte & 0x7f);
          if (!(byte & 0x80)) break;
        }
        return value;
      };

      while (i < bodyEnd) {
        readVarLen(); // delta time
        let status = data[i];
        if (status & 0x80) {
          i++;
          runningStatus = status;
        } else {
          status = runningStatus;
        }

        const hi = status & 0xf0;
        if (status === 0xff) {
          i++; // meta type
          const len = readVarLen();
          i += len;
        } else if (hi === 0x90) {
          const noteNum = data[i++];
          const vel = data[i++];
          if (vel > 0) pitches.push(noteNum);
        } else if (hi === 0x80) {
          i += 2;
        } else if (hi === 0xc0 || hi === 0xd0) {
          i += 1;
        } else {
          i += 2;
        }
      }

      // midi = 12*(num+1)  ->  num = midi/12 - 1
      return pitches.map((m) => m / 12 - 1);
    }

    it('reflects a simple repeat in the rendered note-ons', () => {
      const measures = [
        measure(1, { barlines: [forwardRepeat()] }),
        measure(2, { barlines: [backwardRepeat()] }),
        measure(3),
      ];
      expect(playedMeasuresFromMidi(measures)).toEqual([1, 2, 1, 2, 3]);
    });

    it('reflects voltas in the rendered note-ons', () => {
      const measures = [
        measure(1, { barlines: [forwardRepeat()] }),
        measure(2, { barlines: [endingStart('1'), backwardRepeat(), endingStop('1')] }),
        measure(3, { barlines: [endingStart('2'), endingStop('2')] }),
        measure(4),
      ];
      expect(playedMeasuresFromMidi(measures)).toEqual([1, 2, 1, 3, 4]);
    });

    it('reflects D.C. al Fine in the rendered note-ons', () => {
      const measures = [
        measure(1),
        measure(2, { words: 'Fine' }),
        measure(3),
        measure(4, { words: 'D.C. al Fine' }),
      ];
      expect(playedMeasuresFromMidi(measures)).toEqual([1, 2, 3, 4, 1, 2]);
    });
  });
});
