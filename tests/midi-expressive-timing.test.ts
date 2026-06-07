import { describe, it, expect } from 'vitest';
import type {
  Score,
  Measure,
  NoteEntry,
  DirectionEntry,
  SoundEntry,
  TimeSignature,
} from '../src/types';
import { exportMidi, exportMidiWithTimingMap } from '../src/exporters';
import { generatePlaybackTimeline } from '../src/query';

let idCounter = 0;
const id = () => `ex-${idCounter++}`;

const TPQN = 480;

// ---- Score builders -------------------------------------------------------

/** A note; `duration` is in divisions (scores below use divisions=1 → quarters). */
function note(opts: { step?: string; octave?: number; duration?: number; fermata?: boolean } = {}): NoteEntry {
  const n: NoteEntry = {
    _id: id(),
    type: 'note',
    pitch: { step: (opts.step ?? 'C') as any, octave: opts.octave ?? 4 },
    duration: opts.duration ?? 4,
    voice: '1',
  };
  if (opts.fermata) n.notations = [{ type: 'fermata' }];
  return n;
}

function caesuraNote(): NoteEntry {
  return {
    _id: id(),
    type: 'note',
    pitch: { step: 'C', octave: 4 },
    duration: 4,
    voice: '1',
    notations: [{ type: 'articulation', articulation: 'caesura' }],
  };
}

function metronomeDir(perMinute: number): DirectionEntry {
  return {
    _id: id(),
    type: 'direction',
    directionTypes: [{ kind: 'metronome', beatUnit: 'quarter', perMinute }],
  };
}

function soundTempoDir(tempo: number): DirectionEntry {
  return { _id: id(), type: 'direction', directionTypes: [], sound: { tempo } };
}

function standaloneSoundTempo(tempo: number): SoundEntry {
  return { _id: id(), type: 'sound', tempo };
}

function wordsDir(text: string): DirectionEntry {
  return { _id: id(), type: 'direction', directionTypes: [{ kind: 'words', text }] };
}

function measure(num: number, entries: Measure['entries'], time?: TimeSignature): Measure {
  const m: Measure = { _id: id(), number: String(num), entries };
  if (time) m.attributes = { time };
  return m;
}

function ts(beats: number, beatType: number): TimeSignature {
  return { beats: String(beats), beatType };
}

function scoreOf(measures: Measure[]): Score {
  return {
    _id: id(),
    metadata: {},
    partList: [{ type: 'score-part', _id: id(), id: 'P1' }],
    parts: [{ _id: id(), id: 'P1', measures }],
  } as Score;
}

// ---- MIDI parser (tempos + time signatures) -------------------------------

interface ConductorEvents {
  tempos: { tick: number; usPerQuarter: number }[];
  timeSigs: { tick: number; numerator: number; denominator: number }[];
  /** Tick of the conductor track's end_of_track meta event. */
  endTick: number;
}

function parseConductor(data: Uint8Array): ConductorEvents {
  let pos = 14; // skip 14-byte MThd
  const u32 = (p: number) =>
    (data[p] << 24) | (data[p + 1] << 16) | (data[p + 2] << 8) | data[p + 3];

  // Conductor track is track 0.
  const len = u32(pos + 4);
  const bodyStart = pos + 8;
  const bodyEnd = bodyStart + len;

  const ev: ConductorEvents = { tempos: [], timeSigs: [], endTick: 0 };
  let i = bodyStart;
  let tick = 0;
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
    tick += readVarLen();
    const status = data[i++];
    if (status === 0xff) {
      const metaType = data[i++];
      const metaLen = readVarLen();
      if (metaType === 0x51 && metaLen === 3) {
        ev.tempos.push({
          tick,
          usPerQuarter: (data[i] << 16) | (data[i + 1] << 8) | data[i + 2],
        });
      } else if (metaType === 0x58 && metaLen === 4) {
        ev.timeSigs.push({ tick, numerator: data[i], denominator: data[i + 1] });
      } else if (metaType === 0x2f) {
        ev.endTick = tick;
      }
      i += metaLen;
    } else {
      // No channel events are expected on the conductor track.
      break;
    }
  }
  return ev;
}

/** Maximum end-tick across all tracks (= the MIDI file's total length in ticks). */
function maxTrackEndTick(data: Uint8Array): number {
  let pos = 14;
  const u32 = (p: number) =>
    (data[p] << 24) | (data[p + 1] << 16) | (data[p + 2] << 8) | data[p + 3];
  let maxTick = 0;
  while (pos < data.length) {
    const len = u32(pos + 4);
    let i = pos + 8;
    const end = i + len;
    let tick = 0;
    let running = 0;
    const readVarLen = () => {
      let value = 0;
      for (;;) {
        const byte = data[i++];
        value = (value << 7) | (byte & 0x7f);
        if (!(byte & 0x80)) break;
      }
      return value;
    };
    while (i < end) {
      tick += readVarLen();
      let status = data[i];
      if (status & 0x80) {
        i++;
        running = status;
      } else {
        status = running;
      }
      if (status === 0xff) {
        i++; // meta type
        const metaLen = readVarLen();
        i += metaLen;
      } else if ((status & 0xf0) === 0xc0 || (status & 0xf0) === 0xd0) {
        i += 1;
      } else {
        i += 2;
      }
    }
    if (tick > maxTick) maxTick = tick;
    pos = end;
  }
  return maxTick;
}

function rest(duration = 4): NoteEntry {
  return { _id: id(), type: 'note', rest: {}, duration, voice: '1' };
}

/** Tick → seconds using the parsed (piecewise-constant) MIDI tempo map. */
function midiTickToSec(tempos: { tick: number; usPerQuarter: number }[], tick: number): number {
  const sorted = [...tempos].sort((a, b) => a.tick - b.tick);
  const cum: number[] = [0];
  for (let i = 1; i < sorted.length; i++) {
    const dTick = sorted[i].tick - sorted[i - 1].tick;
    cum[i] = cum[i - 1] + (dTick * sorted[i - 1].usPerQuarter) / 1_000_000 / TPQN;
  }
  let i = sorted.length - 1;
  while (i > 0 && sorted[i].tick > tick) i--;
  return cum[i] + ((tick - sorted[i].tick) * sorted[i].usPerQuarter) / 1_000_000 / TPQN;
}

// ---- Tests ----------------------------------------------------------------

describe('fermata as a local tempo dip', () => {
  // m1 note, m2 fermata note, m3 note — all single whole-measure notes at 120 BPM
  // (divisions=1 → 4 quarters = 1920 ticks = 2 s/measure).
  const score = scoreOf([
    measure(1, [note()]),
    measure(2, [note({ fermata: true })]),
    measure(3, [note()]),
  ]);

  it('stretches the fermata note in time by the hold multiplier, leaving quarterPos untouched', () => {
    const sidecar = generatePlaybackTimeline(score, { fermataHoldMultiplier: 2 });
    const byMeasure = (n: string) =>
      sidecar.breakpoints.find((b) => b.measureNumber === n && b.beatInMeasure === 0)!;

    // m2's note holds at half tempo, so it lasts 4 s instead of 2 s.
    expect(byMeasure('2').midiSec).toBeCloseTo(2, 9); // m1 at 120 BPM
    expect(byMeasure('3').midiSec).toBeCloseTo(6, 9); // 2 + 4 (stretched), not 4
    expect(sidecar.durationSec).toBeCloseTo(8, 9); // m3 plays at 120 again

    // quarterPos is purely notated and must not move (method A, not B).
    expect(byMeasure('2').quarterPos).toBe(4);
    expect(byMeasure('3').quarterPos).toBe(8);
  });

  it('keeps quarterPos identical with and without the hold (B-method guard)', () => {
    const held = generatePlaybackTimeline(score, { fermataHoldMultiplier: 2 });
    const plain = generatePlaybackTimeline(score, { fermataHoldMultiplier: 1 });
    expect(held.breakpoints.map((b) => b.quarterPos)).toEqual(
      plain.breakpoints.map((b) => b.quarterPos)
    );
    // ...but the elapsed seconds differ (time came from tempo, not from ticks).
    expect(held.durationSec).toBeGreaterThan(plain.durationSec);
  });

  it('emits a fermata expression hint over the stretched seconds', () => {
    const sidecar = generatePlaybackTimeline(score, { fermataHoldMultiplier: 2 });
    expect(sidecar.expressions).toBeDefined();
    const fermata = sidecar.expressions!.find((e) => e.type === 'fermata')!;
    expect(fermata.fromMidiSec).toBeCloseTo(2, 9);
    expect(fermata.toMidiSec).toBeCloseTo(6, 9);
  });

  it('disabling the hold (multiplier 1) leaves the tempo flat', () => {
    const sidecar = generatePlaybackTimeline(score, { fermataHoldMultiplier: 1 });
    expect(sidecar.durationSec).toBeCloseTo(6, 9);
    expect(sidecar.expressions).toBeUndefined();
  });

  it('reflects the fermata hold in the MIDI tempo map too', () => {
    const { midi } = exportMidiWithTimingMap(score, { fermataHoldMultiplier: 2 });
    const { tempos } = parseConductor(midi);
    // 120 BPM (initial), 60 BPM over the fermata span, back to 120 after it.
    expect(tempos.map((t) => t.usPerQuarter)).toEqual([
      Math.round(60000000 / 120),
      Math.round(60000000 / 60),
      Math.round(60000000 / 120),
    ]);
    expect(tempos[1].tick).toBe(1920); // m2 start
    expect(tempos[2].tick).toBe(3840); // m3 start
  });
});

describe('caesura inserts held time without moving onsets', () => {
  const score = scoreOf([measure(1, [caesuraNote()]), measure(2, [note()])]);

  it('adds the configured pause seconds and keeps quarterPos', () => {
    const withPause = generatePlaybackTimeline(score, { caesuraSeconds: 1 });
    const noPause = generatePlaybackTimeline(score, { caesuraSeconds: 0 });

    const m2With = withPause.breakpoints.find((b) => b.measureNumber === '2')!;
    const m2No = noPause.breakpoints.find((b) => b.measureNumber === '2')!;

    expect(m2With.quarterPos).toBe(m2No.quarterPos); // onset grid unchanged
    expect(m2With.midiSec).toBeCloseTo(m2No.midiSec + 1, 6); // ~1 s inserted
    expect(withPause.expressions!.some((e) => e.type === 'caesura')).toBe(true);
  });
});

describe('rit./accel. continuous tempo interpolation', () => {
  // m1 @120, m2 has "rit." and ramps toward m3's @60.
  const score = scoreOf([
    measure(1, [metronomeDir(120), note()]),
    measure(2, [wordsDir('rit.'), note()]),
    measure(3, [metronomeDir(60), note()]),
  ]);

  it('bakes a staircase of distinct tempo steps between the two anchors', () => {
    const { midi } = exportMidiWithTimingMap(score, { tempoRampSteps: 8 });
    const { tempos } = parseConductor(midi);

    // Steps that live strictly inside the ramp span (1920 < tick < 3840).
    const rampTicks = tempos.filter((t) => t.tick > 1920 && t.tick < 3840);
    expect(rampTicks.length).toBeGreaterThan(1); // not a single step

    // Tempo decreases monotonically across the ramp (BPM down → us/quarter up).
    for (let i = 1; i < tempos.length; i++) {
      if (tempos[i].tick <= 1920) continue;
      if (tempos[i].tick > 3840) continue;
      expect(tempos[i].usPerQuarter).toBeGreaterThan(tempos[i - 1].usPerQuarter);
    }
  });

  it('produces a continuous (non-stair-step) midiSec curve in the ramp region', () => {
    const sidecar = generatePlaybackTimeline(score, { tempoRampSteps: 8 });
    const m2 = sidecar.breakpoints.filter((b) => b.measureNumber === '2');
    // Many intermediate breakpoints, not just the measure start.
    expect(m2.length).toBeGreaterThan(2);

    // Strictly increasing midiSec, and the per-step slope keeps growing as the
    // tempo slows — i.e. the curve bends rather than jumping.
    const sorted = [...m2].sort((a, b) => a.quarterPos - b.quarterPos);
    let prevSlope = 0;
    for (let i = 1; i < sorted.length; i++) {
      const dSec = sorted[i].midiSec - sorted[i - 1].midiSec;
      const dQ = sorted[i].quarterPos - sorted[i - 1].quarterPos;
      const slope = dSec / dQ;
      expect(slope).toBeGreaterThanOrEqual(prevSlope - 1e-9);
      prevSlope = slope;
    }
  });

  it('labels the ramp span as a rit. expression hint', () => {
    const sidecar = generatePlaybackTimeline(score, { tempoRampSteps: 8 });
    expect(sidecar.expressions!.some((e) => e.type === 'rit')).toBe(true);
  });
});

describe('tempo map completeness', () => {
  it('captures all three tempo sources: metronome, direction sound, standalone sound', () => {
    const score = scoreOf([
      measure(1, [metronomeDir(100), note()]),
      measure(2, [soundTempoDir(90), note()]),
      measure(3, [standaloneSoundTempo(80), note()]),
    ]);
    const { tempos } = parseConductor(exportMidi(score));
    const us = (bpm: number) => Math.round(60000000 / bpm);
    const values = tempos.map((t) => t.usPerQuarter);
    expect(values).toContain(us(100));
    expect(values).toContain(us(90));
    expect(values).toContain(us(80));
  });
});

describe('time-signature changes in the conductor track', () => {
  it('emits every mid-piece time-signature change, not just the first', () => {
    // divisions=1 → duration 1 is one quarter; fill each bar to its meter.
    const score = scoreOf([
      measure(1, [note({ duration: 1 }), note({ duration: 1 }), note({ duration: 1 }), note({ duration: 1 })], ts(4, 4)),
      measure(2, [note({ duration: 1 }), note({ duration: 1 }), note({ duration: 1 })], ts(3, 4)),
      measure(3, [note({ duration: 1 }), note({ duration: 1 }), note({ duration: 1 }), note({ duration: 1 })], ts(4, 4)),
    ]);
    const { timeSigs } = parseConductor(exportMidi(score));
    expect(timeSigs.map((t) => t.numerator)).toEqual([4, 3, 4]);
    // 4/4 spans 1920 ticks; 3/4 spans 1440.
    expect(timeSigs.map((t) => t.tick)).toEqual([0, 1920, 1920 + 1440]);
    // denominator is log2(beatType) = 2 for /4.
    expect(timeSigs.every((t) => t.denominator === 2)).toBe(true);
  });
});

/** All note-on ticks across every part track (track 0 is the conductor). */
function noteOnTicks(data: Uint8Array): number[] {
  let pos = 14;
  const u32 = (p: number) =>
    (data[p] << 24) | (data[p + 1] << 16) | (data[p + 2] << 8) | data[p + 3];
  const ticks: number[] = [];
  while (pos < data.length) {
    const len = u32(pos + 4);
    let i = pos + 8;
    const end = i + len;
    let tick = 0;
    let running = 0;
    const readVarLen = () => {
      let value = 0;
      for (;;) {
        const byte = data[i++];
        value = (value << 7) | (byte & 0x7f);
        if (!(byte & 0x80)) break;
      }
      return value;
    };
    while (i < end) {
      tick += readVarLen();
      let status = data[i];
      if (status & 0x80) {
        i++;
        running = status;
      } else {
        status = running;
      }
      if (status === 0xff) {
        i++;
        const metaLen = readVarLen();
        i += metaLen;
      } else if ((status & 0xf0) === 0x90) {
        i++; // note
        const vel = data[i++];
        if (vel > 0) ticks.push(tick);
      } else if ((status & 0xf0) === 0x80) {
        i += 2;
      } else if ((status & 0xf0) === 0xc0 || (status & 0xf0) === 0xd0) {
        i += 1;
      } else {
        i += 2;
      }
    }
    pos = end;
  }
  return ticks;
}

describe('over-full measure honors its content (no collision into the next bar)', () => {
  // Mirrors the Ravel Pavane m71: a 4/4 bar whose notated content is 5 quarters
  // (a written-out arpeggiated roll pushes the bar past the meter). The bar must
  // span 5 quarters so the final note does not land on the next downbeat.
  const score = scoreOf([
    measure(1, [note({ duration: 1 }), note({ duration: 1, step: 'D' }), note({ duration: 1, step: 'E' }), note({ duration: 1, step: 'F' }), note({ duration: 1, step: 'G' })], ts(4, 4)),
    measure(2, [note({ duration: 1, step: 'A' })], ts(4, 4)),
  ]);

  it('places the next measure after the full content, not clamped to the meter', () => {
    const sidecar = generatePlaybackTimeline(score);
    const m2 = sidecar.breakpoints.find((b) => b.measureNumber === '2' && b.beatInMeasure === 0)!;
    expect(m2.quarterPos).toBe(5); // 5 quarters of content, not clamped to 4
  });

  it("does not collide the bar's last onset with the next bar's downbeat", () => {
    const ticks = noteOnTicks(exportMidi(score)).sort((a, b) => a - b);
    // 6 distinct onsets at 0,480,960,1440,1920 (m1) and 2400 (m2) — all unique.
    expect(ticks).toEqual([0, 480, 960, 1440, 1920, 2400]);
  });
});

describe('sidecar seconds match real MIDI playback seconds', () => {
  it('every breakpoint midiSec equals the time computed from the emitted tempo map', () => {
    // Exercise fractional BPM (ramp) + a fermata so rounding has a chance to drift.
    const score = scoreOf([
      measure(1, [metronomeDir(132), note()]),
      measure(2, [wordsDir('rit.'), note({ fermata: true })]),
      measure(3, [metronomeDir(76), note()]),
    ]);
    const { midi, sidecar } = exportMidiWithTimingMap(score, {
      tempoRampSteps: 10,
      fermataHoldMultiplier: 1.8,
    });
    const { tempos } = parseConductor(midi);

    for (const bp of sidecar.breakpoints) {
      const tick = Math.round(bp.quarterPos * TPQN);
      expect(midiTickToSec(tempos, tick)).toBeCloseTo(bp.midiSec, 6);
    }
    // durationSec is the time at the final (terminal) breakpoint.
    expect(sidecar.durationSec).toBeCloseTo(sidecar.breakpoints.at(-1)!.midiSec, 9);
  });
});

describe('MIDI total length matches sidecar.durationSec', () => {
  it("extends end_of_track to the grid end when the final measure ends in a rest", () => {
    // m2 = half note + half rest: notes stop at tick 2880, but the measure (and
    // the grid) runs to tick 3840. Without padding, the file would end early.
    const score = scoreOf([
      measure(1, [note()]),
      measure(2, [note({ duration: 2 }), rest(2)]),
    ]);
    const { midi, sidecar } = exportMidiWithTimingMap(score);
    const { tempos, endTick } = parseConductor(midi);

    // Conductor end_of_track sits at the grid end (3840 ticks), not the last note.
    expect(endTick).toBe(3840);
    // File length (max track end) converted to seconds equals durationSec.
    const fileSec = midiTickToSec(tempos, maxTrackEndTick(midi));
    expect(fileSec).toBeCloseTo(sidecar.durationSec, 3); // within 1 ms
  });

  it('matches even when a fermata note releases before the barline', () => {
    // m2: fermata half note then half rest. The fermata stretches the first
    // half (tempo dip); the trailing rest still has to be reached at the grid end.
    const score = scoreOf([
      measure(1, [note()]),
      measure(2, [note({ duration: 2, fermata: true }), rest(2)]),
    ]);
    const { midi, sidecar } = exportMidiWithTimingMap(score, { fermataHoldMultiplier: 2 });
    const { tempos } = parseConductor(midi);
    const fileSec = midiTickToSec(tempos, maxTrackEndTick(midi));
    expect(fileSec).toBeCloseTo(sidecar.durationSec, 3);
  });

  it('still matches for a plain score with no trailing rest', () => {
    const score = scoreOf([measure(1, [note()]), measure(2, [note()])]);
    const { midi, sidecar } = exportMidiWithTimingMap(score);
    const { tempos } = parseConductor(midi);
    const fileSec = midiTickToSec(tempos, maxTrackEndTick(midi));
    expect(fileSec).toBeCloseTo(sidecar.durationSec, 3);
  });
});
