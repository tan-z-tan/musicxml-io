import { describe, it, expect } from 'vitest';
import type {
  Score,
  Measure,
  NoteEntry,
  DirectionEntry,
  SoundEntry,
  DynamicsValue,
  ArticulationType,
} from '../src/types';
import { exportMidi } from '../src/exporters';

let idCounter = 0;
const id = () => `idx-${idCounter++}`;

// ---- Score builders -------------------------------------------------------

function note(opts: { step?: string; octave?: number; duration?: number; chord?: boolean; grace?: boolean; articulation?: ArticulationType } = {}): NoteEntry {
  const n: NoteEntry = {
    _id: id(),
    type: 'note',
    pitch: { step: (opts.step ?? 'C') as any, octave: opts.octave ?? 4 },
    duration: opts.duration ?? 4,
    voice: '1',
  };
  if (opts.chord) n.chord = true;
  if (opts.grace) {
    n.grace = {};
    n.duration = 0;
  }
  if (opts.articulation) {
    n.notations = [{ type: 'articulation', articulation: opts.articulation }];
  }
  return n;
}

function dynamicsDir(value: DynamicsValue): DirectionEntry {
  return { _id: id(), type: 'direction', directionTypes: [{ kind: 'dynamics', value }] };
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

function soundTempo(tempo: number): SoundEntry {
  return { _id: id(), type: 'sound', tempo };
}

function measure(num: number, entries: Measure['entries']): Measure {
  return { _id: id(), number: String(num), entries };
}

function scoreOf(measures: Measure[]): Score {
  return {
    _id: id(),
    metadata: {},
    partList: [{ type: 'score-part', _id: id(), id: 'P1' }],
    parts: [{ _id: id(), id: 'P1', measures }],
  } as Score;
}

// ---- MIDI parser ----------------------------------------------------------

interface TrackEvents {
  noteOns: { tick: number; note: number; velocity: number }[];
  tempos: { tick: number; usPerQuarter: number }[];
}

function parseMidi(data: Uint8Array): TrackEvents[] {
  const tracks: TrackEvents[] = [];
  let pos = 14; // skip 14-byte MThd

  const u32 = (p: number) =>
    (data[p] << 24) | (data[p + 1] << 16) | (data[p + 2] << 8) | data[p + 3];

  while (pos < data.length) {
    // 'MTrk'
    const len = u32(pos + 4);
    const bodyStart = pos + 8;
    const bodyEnd = bodyStart + len;

    const ev: TrackEvents = { noteOns: [], tempos: [] };
    let i = bodyStart;
    let tick = 0;
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
      tick += readVarLen();
      let status = data[i];
      if (status & 0x80) {
        i++;
        runningStatus = status;
      } else {
        status = runningStatus;
      }

      const hi = status & 0xf0;
      if (status === 0xff) {
        const metaType = data[i++];
        const metaLen = readVarLen();
        if (metaType === 0x51 && metaLen === 3) {
          const us = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
          ev.tempos.push({ tick, usPerQuarter: us });
        }
        i += metaLen;
      } else if (hi === 0x90) {
        const n = data[i++];
        const v = data[i++];
        if (v > 0) ev.noteOns.push({ tick, note: n, velocity: v });
      } else if (hi === 0x80) {
        i += 2;
      } else if (hi === 0xc0 || hi === 0xd0) {
        i += 1;
      } else {
        i += 2;
      }
    }

    tracks.push(ev);
    pos = bodyEnd;
  }

  return tracks;
}

const bpmToUs = (bpm: number) => Math.round(60000000 / bpm);

// ---- Tests ----------------------------------------------------------------

describe('MIDI velocity from dynamics', () => {
  it('uses the default velocity when no dynamics are present', () => {
    const data = exportMidi(scoreOf([measure(1, [note()])]));
    const part = parseMidi(data)[1];
    expect(part.noteOns[0].velocity).toBe(80);
  });

  it('maps dynamic markings to velocity and persists them', () => {
    const measures = [
      measure(1, [dynamicsDir('p'), note()]),
      measure(2, [note()]), // p still in effect
      measure(3, [dynamicsDir('ff'), note()]),
    ];
    const part = parseMidi(exportMidi(scoreOf(measures)))[1];
    expect(part.noteOns.map((n) => n.velocity)).toEqual([50, 50, 105]);
  });

  it('applies accent articulation as a velocity multiplier', () => {
    const measures = [
      measure(1, [dynamicsDir('mf'), note(), note({ step: 'D', articulation: 'accent' })]),
    ];
    const part = parseMidi(exportMidi(scoreOf(measures)))[1];
    // mf = 75; accent x1.25 -> 94
    expect(part.noteOns[0].velocity).toBe(75);
    expect(part.noteOns[1].velocity).toBe(Math.round(75 * 1.25));
  });

  it('applies a sforzando as a one-shot relative accent', () => {
    const measures = [
      measure(1, [dynamicsDir('p'), note(), dynamicsDir('sf'), note({ step: 'D' }), note({ step: 'E' })]),
    ];
    const part = parseMidi(exportMidi(scoreOf(measures)))[1];
    // p=50; sf x1.3 on the next onset only, then back to 50
    expect(part.noteOns.map((n) => n.velocity)).toEqual([50, Math.round(50 * 1.3), 50]);
  });
});

describe('MIDI grace notes', () => {
  // divisions defaults to 1, so a duration-4 note is one quarter = 480 ticks.
  it('schedules a grace note before its principal, slightly softer', () => {
    const measures = [
      measure(1, [
        dynamicsDir('mf'),
        note({ step: 'C', octave: 4 }), // beat 1, ends at tick 1920
        note({ step: 'D', grace: true, octave: 5 }), // grace before beat 2
        note({ step: 'E', octave: 4 }), // beat 2 principal at tick 1920
      ]),
    ];
    const part = parseMidi(exportMidi(scoreOf(measures)))[1];
    expect(part.noteOns.length).toBe(3);

    const grace = part.noteOns.find((n) => n.note === 74)!; // D5
    const principal = part.noteOns.find((n) => n.note === 64)!; // E4
    expect(grace).toBeDefined();
    // Grace comes strictly before the principal's onset
    expect(grace.tick).toBeLessThan(principal.tick);
    expect(principal.tick).toBe(1920);
    // Grace is softer than the mf principal (75)
    expect(principal.velocity).toBe(75);
    expect(grace.velocity).toBe(Math.round(75 * 0.85));
  });

  it('stacks multiple grace notes in order before the beat', () => {
    const measures = [
      measure(1, [
        note({ step: 'C', octave: 4 }), // beat 1 -> tick 0
        note({ step: 'C', grace: true, octave: 5 }),
        note({ step: 'D', grace: true, octave: 5 }),
        note({ step: 'E', octave: 4 }), // beat 2 -> tick 1920
      ]),
    ];
    const part = parseMidi(exportMidi(scoreOf(measures)))[1];
    expect(part.noteOns.length).toBe(4);

    const c5 = part.noteOns.find((n) => n.note === 72)!;
    const d5 = part.noteOns.find((n) => n.note === 74)!;
    const principal = part.noteOns.find((n) => n.note === 64)!;
    // grace C5 then grace D5 then principal E4, strictly increasing
    expect(c5.tick).toBeLessThan(d5.tick);
    expect(d5.tick).toBeLessThan(principal.tick);
    expect(principal.tick).toBe(1920);
  });
});

describe('MIDI tempo sources', () => {
  it('reads tempo from a metronome direction', () => {
    const measures = [measure(1, [metronomeDir(90), note()])];
    const tempos = parseMidi(exportMidi(scoreOf(measures)))[0].tempos;
    // initial default (120) at tick 0, then 90 once we reach the marking
    expect(tempos.some((t) => t.usPerQuarter === bpmToUs(90))).toBe(true);
  });

  it('reads tempo from a <sound tempo> inside a direction', () => {
    const measures = [measure(1, [soundTempoDir(100), note()])];
    const tempos = parseMidi(exportMidi(scoreOf(measures)))[0].tempos;
    expect(tempos[0].usPerQuarter).toBe(bpmToUs(100)); // tempo at tick 0 becomes the initial tempo
    expect(tempos[0].tick).toBe(0);
  });

  it('reads tempo from a standalone <sound> entry', () => {
    const measures = [
      measure(1, [note()]),
      measure(2, [soundTempo(60), note()]),
    ];
    const tempos = parseMidi(exportMidi(scoreOf(measures)))[0].tempos;
    // default at 0, then 60 at the start of measure 2
    expect(tempos[0].usPerQuarter).toBe(bpmToUs(120));
    const change = tempos.find((t) => t.usPerQuarter === bpmToUs(60));
    expect(change).toBeDefined();
    // divisions defaults to 1, so measure 1's single duration-4 note spans
    // 4 quarters = 1920 ticks; measure 2 (and its tempo) start there.
    expect(change!.tick).toBe(1920);
  });
});
