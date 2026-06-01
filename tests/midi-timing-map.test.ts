import { describe, it, expect } from 'vitest';
import type { Score, Measure, Barline, SoundEntry, NoteEntry } from '../src/types';
import { exportMidi, exportMidiWithTimingMap } from '../src/exporters';
import { generatePlaybackTimeline } from '../src/query';

let idCounter = 0;
const id = () => `t-${idCounter++}`;

/** A quarter-note's worth is `duration` divisions; scores below use divisions=1. */
function note(duration = 4, octave = 4): NoteEntry {
  return { _id: id(), type: 'note', pitch: { step: 'C', octave }, duration, voice: '1' };
}

function soundTempo(tempo: number): SoundEntry {
  return { _id: id(), type: 'sound', tempo };
}

function measure(
  num: number,
  entries: Measure['entries'],
  barlines?: Barline[]
): Measure {
  return { _id: id(), number: String(num), entries, barlines };
}

function scoreOf(measures: Measure[]): Score {
  return {
    _id: id(),
    metadata: {},
    partList: [{ type: 'score-part', _id: id(), id: 'P1' }],
    parts: [{ _id: id(), id: 'P1', measures }],
  } as Score;
}

function forwardRepeat(): Barline {
  return { _id: id(), location: 'left', repeat: { direction: 'forward' } };
}
function backwardRepeat(times = 2): Barline {
  return { _id: id(), location: 'right', repeat: { direction: 'backward', times } };
}

// With divisions defaulting to 1 and a single duration-4 note, each measure spans
// 4 quarter notes = 1920 ticks (tpq 480). At the default 120 BPM that is 2s/measure.
const SIMPLE = [note()];

describe('playback timeline', () => {
  it('exportMidiWithTimingMap: MIDI bytes identical to exportMidi, sidecar equal to the query', () => {
    const score = scoreOf([measure(1, SIMPLE), measure(2, SIMPLE), measure(3, SIMPLE)]);
    const { midi, sidecar } = exportMidiWithTimingMap(score);
    // The convenience function is exactly exportMidi + generatePlaybackTimeline.
    expect(midi).toEqual(exportMidi(score));
    expect(sidecar).toEqual(generatePlaybackTimeline(score));
  });

  it('maps each measure start to a monotonic (midiSec, quarterPos) breakpoint', () => {
    const score = scoreOf([measure(1, SIMPLE), measure(2, SIMPLE), measure(3, SIMPLE)]);
    const sidecar = generatePlaybackTimeline(score);

    expect(sidecar.version).toBe('1');
    expect(sidecar.ticksPerQuarterNote).toBe(480);

    // 3 measure starts + 1 terminal breakpoint, no tempo changes.
    expect(sidecar.breakpoints).toHaveLength(4);

    const starts = sidecar.breakpoints.slice(0, 3);
    expect(starts.map((b) => b.measureNumber)).toEqual(['1', '2', '3']);
    expect(starts.map((b) => b.beatInMeasure)).toEqual([0, 0, 0]);
    expect(starts.map((b) => b.quarterPos)).toEqual([0, 4, 8]);
    // 120 BPM -> 0.5 s/quarter -> 2 s/measure.
    expect(starts.map((b) => b.midiSec)).toEqual([0, 2, 4]);

    // Monotonic in midiSec and quarterPos.
    for (let i = 1; i < sidecar.breakpoints.length; i++) {
      expect(sidecar.breakpoints[i].midiSec).toBeGreaterThan(sidecar.breakpoints[i - 1].midiSec);
      expect(sidecar.breakpoints[i].quarterPos).toBeGreaterThan(
        sidecar.breakpoints[i - 1].quarterPos
      );
    }

    // Terminal point closes out the last measure.
    const terminal = sidecar.breakpoints[3];
    expect(terminal.quarterPos).toBe(12);
    expect(terminal.midiSec).toBe(6);
    expect(sidecar.durationSec).toBe(6);
  });

  it('reflects a tempo change at a measure start in midiSec', () => {
    const score = scoreOf([
      measure(1, SIMPLE),
      measure(2, [soundTempo(240), note()]),
      measure(3, SIMPLE),
    ]);
    const sidecar = generatePlaybackTimeline(score);

    const byMeasure = (n: string) => sidecar.breakpoints.find((b) => b.measureNumber === n)!;
    // m1 at 120 BPM (2s), then 240 BPM (1s/measure) from m2.
    expect(byMeasure('1').midiSec).toBe(0);
    expect(byMeasure('2').midiSec).toBe(2);
    expect(byMeasure('3').midiSec).toBe(3);
    expect(sidecar.durationSec).toBe(4);

    // The change sits exactly at m2's start, so it does not add a separate
    // mid-measure breakpoint.
    expect(sidecar.breakpoints.filter((b) => b.measureNumber === '2')).toHaveLength(1);
  });

  it('emits a mid-measure breakpoint for a tempo change inside a measure', () => {
    // m1 spans 4 quarters; a tempo change after 2 quarters.
    const score = scoreOf([
      measure(1, [note(2), soundTempo(240), note(2)]),
      measure(2, SIMPLE),
    ]);
    const sidecar = generatePlaybackTimeline(score);

    const m1 = sidecar.breakpoints.filter((b) => b.measureNumber === '1');
    expect(m1).toHaveLength(2); // measure start + mid-measure tempo change
    expect(m1[0].beatInMeasure).toBe(0);
    expect(m1[1].beatInMeasure).toBe(2);
    expect(m1[0].midiSec).toBe(0);
    expect(m1[1].midiSec).toBe(1); // 2 quarters at 120 BPM
  });

  it('expands repeats: a repeated measure appears multiple times with rising iteration', () => {
    // |: m1 m2 :| m3  ->  played 1 2 1 2 3
    const score = scoreOf([
      measure(1, SIMPLE, [forwardRepeat()]),
      measure(2, SIMPLE, [backwardRepeat()]),
      measure(3, SIMPLE),
    ]);
    const sidecar = generatePlaybackTimeline(score);

    const starts = sidecar.breakpoints.filter((b) => b.beatInMeasure === 0);
    expect(starts.map((b) => b.measureNumber)).toEqual(['1', '2', '1', '2', '3']);

    // Each occurrence advances in MIDI time.
    for (let i = 1; i < starts.length; i++) {
      expect(starts[i].midiSec).toBeGreaterThan(starts[i - 1].midiSec);
    }

    // The two passes of measure 1 carry distinct, positive repeat iterations;
    // the non-repeated tail measure carries 0.
    const m1s = starts.filter((b) => b.measureNumber === '1');
    expect(m1s[0].repeatIteration).toBeGreaterThan(0);
    expect(m1s[1].repeatIteration).toBeGreaterThan(m1s[0].repeatIteration);
    expect(starts.find((b) => b.measureNumber === '3')!.repeatIteration).toBe(0);
  });

  it('handles an empty score without throwing', () => {
    const score = scoreOf([]);
    const sidecar = generatePlaybackTimeline(score);
    expect(sidecar.durationSec).toBe(0);
    // Only the terminal breakpoint.
    expect(sidecar.breakpoints).toHaveLength(1);
  });
});
