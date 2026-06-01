/**
 * Playback Timeline
 *
 * Where {@link generatePlaybackSequence} gives the ORDER measures are played
 * (with repeats/voltas/jumps expanded), this gives the same expanded playback
 * WITH absolute times: a mapping between elapsed seconds and conceptual musical
 * position (measure + beat).
 *
 * This is a pure analysis of the score's playback interpretation (tempo +
 * repeat expansion). It is the one thing a downstream audio-to-score aligner
 * integration cannot recompute from the MusicXML alone — everything else about
 * the score (pitches, parts, voices, durations) the consumer already has and
 * can derive from a musical position. The seconds here are tempo-derived and
 * therefore equal to the playback time of the MIDI produced by `exportMidi`,
 * which shares this exact timeline computation.
 */
import type { Score, Part, Measure } from '../types';
import { generatePlaybackSequence } from './playback-sequence';

/** Options controlling the rendered timeline. */
export interface TimingMapOptions {
  /**
   * Ticks per quarter note (default: 480). Only affects internal tick rounding;
   * `midiSec`/`quarterPos` are otherwise independent of it.
   */
  ticksPerQuarterNote?: number;
  /** Default tempo in BPM when the score carries no tempo marking (default: 120). */
  defaultTempo?: number;
}

/** A single point on the timeline: a time ↔ musical-position correspondence. */
export interface TimingBreakpoint {
  /** Elapsed playback time, in seconds (equals the MIDI time of `exportMidi`). */
  midiSec: number;
  /**
   * Cumulative quarter notes from the start of (repeat-expanded) playback.
   * This is the monotone axis to interpolate against: within a constant-tempo
   * segment `midiSec` is linear in `quarterPos`.
   */
  quarterPos: number;
  /** Printed measure number (MusicXML `<measure number>`), e.g. "12". */
  measureNumber: string;
  /** Quarter-note offset within the measure (0 at the measure start). */
  beatInMeasure: number;
  /**
   * Which repeat iteration produced this measure (1-based; 0 = not in a
   * repeat). The same measure appears multiple times when repeated.
   */
  repeatIteration: number;
}

/**
 * Maps the playback timeline to conceptual musical positions.
 *
 * Pair it with an audio aligner that returns `audioSec ↔ midiSec` to follow a
 * recording on the score:
 * `audioSec → (aligner) → midiSec → (this, interpolate quarterPos) → (measure, beat)`.
 */
export interface TimingSidecar {
  /** Sidecar schema version. */
  version: string;
  /** Total duration of the playback, in seconds. */
  durationSec: number;
  /** Ticks per quarter note used internally. */
  ticksPerQuarterNote: number;
  /** Breakpoints, sorted ascending and monotone by `midiSec`. */
  breakpoints: TimingBreakpoint[];
}

/** A tempo change at an absolute tick. */
export interface TempoChange {
  tick: number;
  bpm: number;
}

/** One played measure, with the absolute tick span it occupies. */
export interface GridMeasure {
  measureIndex: number;
  repeatIteration: number;
  measureNumber: string;
  startTick: number;
  endTick: number;
}

/**
 * The shared time computation that both the MIDI bytes and the timing sidecar
 * are derived from: the playback grid (measure spans in absolute ticks) plus
 * the tempo changes. Computed once so the two outputs can never drift.
 */
export interface GridTimeline {
  /** Tempo changes in document order (unsorted). */
  tempoEvents: TempoChange[];
  /** Played measures in playback (repeat-expanded) order. */
  measures: GridMeasure[];
  /** Absolute tick at the end of the last measure. */
  totalTicks: number;
}

/** Parse a metronome per-minute value to a numeric BPM, or null. */
function metronomeBpm(perMinute: number | string | undefined): number | null {
  if (perMinute === undefined) return null;
  const bpm = typeof perMinute === 'number' ? perMinute : parseFloat(perMinute);
  return isNaN(bpm) ? null : bpm;
}

/**
 * Maximum position (in divisions) reached within a measure, accounting for
 * multi-voice writing via backup/forward. Grace notes carry no duration and
 * therefore do not advance the position.
 */
export function measureMaxPosition(measure: Measure): number {
  let position = 0;
  let max = 0;
  for (const entry of measure.entries) {
    if (entry.type === 'note') {
      // Grace notes carry no time and must not advance the position
      // (mirrors the part-track loop, which skips them entirely).
      if (!entry.chord && !entry.grace) {
        position += entry.duration;
        if (position > max) max = position;
      }
    } else if (entry.type === 'backup') {
      position -= entry.duration;
    } else if (entry.type === 'forward') {
      position += entry.duration;
      if (position > max) max = position;
    }
  }
  return max;
}

/**
 * Find time signature at a measure.
 */
function findTimeSignature(
  part: Part,
  measureNumber: string | number
): { beats: number; beatType: number } | undefined {
  const targetMeasure = parseInt(String(measureNumber), 10);
  let time: { beats: number; beatType: number } | undefined;

  for (const measure of part.measures) {
    const mNum = parseInt(measure.number, 10);
    if (!isNaN(targetMeasure) && !isNaN(mNum) && mNum > targetMeasure) break;
    if (measure.attributes?.time) {
      time = {
        beats: parseInt(measure.attributes.time.beats, 10) || 4,
        beatType: measure.attributes.time.beatType,
      };
    }
  }

  return time;
}

/**
 * Absolute tick at the end of a measure, given where it started.
 * Implicit (pickup) measures use their actual content length; regular
 * measures use the time signature but never exceed their actual content.
 */
export function measureEndTick(
  measure: Measure,
  part: Part,
  divisions: number,
  measureStartTick: number,
  maxPosition: number,
  ticksPerQuarterNote: number
): number {
  const actualTicks = Math.round((maxPosition * ticksPerQuarterNote) / divisions);

  if (measure.implicit) {
    return measureStartTick + actualTicks;
  }

  const timeAttrs = findTimeSignature(part, measure.number);
  if (timeAttrs) {
    const measureDuration = (timeAttrs.beats / timeAttrs.beatType) * 4 * divisions;
    const calculatedTicks = Math.round((measureDuration * ticksPerQuarterNote) / divisions);
    // Use the smaller of calculated and actual for incomplete measures
    // (e.g., last measure before a repeat that combines with a pickup).
    const ticksToAdd = Math.min(calculatedTicks, actualTicks > 0 ? actualTicks : calculatedTicks);
    return measureStartTick + ticksToAdd;
  }

  return measureStartTick + actualTicks;
}

/**
 * Walk the first part in playback (repeat-expanded) order and record, for each
 * played measure, the absolute tick span it occupies, plus every tempo change
 * as an absolute-tick event. This is the single source of truth both the MIDI
 * tempo map and the timing sidecar are built from, so they always agree.
 */
export function buildGridTimeline(
  score: Score,
  ticksPerQuarterNote: number,
  sequence: { measureIndex: number; repeatIteration: number }[]
): GridTimeline {
  const tempoEvents: TempoChange[] = [];
  const measures: GridMeasure[] = [];

  if (score.parts.length === 0) {
    return { tempoEvents, measures, totalTicks: 0 };
  }

  const part = score.parts[0];
  let divisions = 1;
  let currentTick = 0;

  for (const { measureIndex, repeatIteration } of sequence) {
    const measure = part.measures[measureIndex];
    if (!measure) continue;
    if (measure.attributes?.divisions) {
      divisions = measure.attributes.divisions;
    }

    const measureStartTick = currentTick;
    let position = 0;
    const tickAt = (pos: number) =>
      measureStartTick + Math.round((pos * ticksPerQuarterNote) / divisions);

    for (const entry of measure.entries) {
      if (entry.type === 'direction') {
        for (const dirType of entry.directionTypes) {
          if (dirType.kind === 'metronome') {
            const bpm = metronomeBpm(dirType.perMinute);
            if (bpm !== null) tempoEvents.push({ tick: tickAt(position), bpm });
          }
        }
        if (entry.sound?.tempo) {
          tempoEvents.push({ tick: tickAt(position), bpm: entry.sound.tempo });
        }
      } else if (entry.type === 'sound') {
        if (entry.tempo) tempoEvents.push({ tick: tickAt(position), bpm: entry.tempo });
      } else if (entry.type === 'note' && !entry.chord) {
        position += entry.duration;
      } else if (entry.type === 'backup') {
        position -= entry.duration;
      } else if (entry.type === 'forward') {
        position += entry.duration;
      }
    }

    const endTick = measureEndTick(
      measure,
      part,
      divisions,
      measureStartTick,
      measureMaxPosition(measure),
      ticksPerQuarterNote
    );

    measures.push({
      measureIndex,
      repeatIteration,
      measureNumber: measure.number,
      startTick: measureStartTick,
      endTick,
    });

    currentTick = endTick;
  }

  return { tempoEvents, measures, totalTicks: currentTick };
}

/**
 * Build a tick→seconds converter from a tempo map, using the SAME tempo-change
 * points the conductor track emits (initial tempo at tick 0, then changes where
 * the BPM actually differs). This guarantees `midiSec` matches the playback time
 * of the generated MIDI.
 */
function makeTickToSec(
  tempoEvents: TempoChange[],
  defaultTempo: number,
  ticksPerQuarterNote: number
): (tick: number) => number {
  const sorted = [...tempoEvents].sort((a, b) => a.tick - b.tick);
  const startBpm = sorted.length > 0 && sorted[0].tick === 0 ? sorted[0].bpm : defaultTempo;

  // Effective change points (mirrors the conductor track's emission).
  const changes: TempoChange[] = [{ tick: 0, bpm: startBpm }];
  let lastBpm = startBpm;
  for (const ev of sorted) {
    if (ev.tick === 0) continue;
    if (ev.bpm === lastBpm) continue;
    changes.push({ tick: ev.tick, bpm: ev.bpm });
    lastBpm = ev.bpm;
  }

  // Cumulative seconds at the start of each segment.
  const cumSec: number[] = [0];
  for (let i = 1; i < changes.length; i++) {
    const dTick = changes[i].tick - changes[i - 1].tick;
    cumSec[i] = cumSec[i - 1] + (dTick / ticksPerQuarterNote) * (60 / changes[i - 1].bpm);
  }

  return (tick: number) => {
    let i = changes.length - 1;
    while (i > 0 && changes[i].tick > tick) i--;
    return cumSec[i] + ((tick - changes[i].tick) / ticksPerQuarterNote) * (60 / changes[i].bpm);
  };
}

/**
 * Assemble the timing sidecar from a playback grid: a breakpoint at every
 * played-measure start and every tempo change, plus a terminal point.
 */
export function buildTimingSidecar(
  grid: GridTimeline,
  defaultTempo: number,
  ticksPerQuarterNote: number
): TimingSidecar {
  const tickToSec = makeTickToSec(grid.tempoEvents, defaultTempo, ticksPerQuarterNote);
  const breakpoints: TimingBreakpoint[] = [];

  const measureStartTicks = new Set(grid.measures.map((m) => m.startTick));

  // Measure starts (beat 0).
  for (const m of grid.measures) {
    breakpoints.push({
      midiSec: tickToSec(m.startTick),
      quarterPos: m.startTick / ticksPerQuarterNote,
      measureNumber: m.measureNumber,
      beatInMeasure: 0,
      repeatIteration: m.repeatIteration,
    });
  }

  // Mid-measure tempo changes (a change exactly at a measure start is already
  // covered by that measure's breakpoint).
  for (const ev of grid.tempoEvents) {
    if (measureStartTicks.has(ev.tick)) continue;
    const m = grid.measures.find((mm) => ev.tick >= mm.startTick && ev.tick < mm.endTick);
    if (!m) continue;
    breakpoints.push({
      midiSec: tickToSec(ev.tick),
      quarterPos: ev.tick / ticksPerQuarterNote,
      measureNumber: m.measureNumber,
      beatInMeasure: (ev.tick - m.startTick) / ticksPerQuarterNote,
      repeatIteration: m.repeatIteration,
    });
  }

  // Terminal breakpoint at the end of playback.
  const last = grid.measures[grid.measures.length - 1];
  breakpoints.push({
    midiSec: tickToSec(grid.totalTicks),
    quarterPos: grid.totalTicks / ticksPerQuarterNote,
    measureNumber: last ? last.measureNumber : '0',
    beatInMeasure: last ? (grid.totalTicks - last.startTick) / ticksPerQuarterNote : 0,
    repeatIteration: last ? last.repeatIteration : 0,
  });

  breakpoints.sort((a, b) => a.midiSec - b.midiSec || a.quarterPos - b.quarterPos);

  return {
    version: '1',
    durationSec: tickToSec(grid.totalTicks),
    ticksPerQuarterNote,
    breakpoints,
  };
}

/**
 * Generate the playback timeline (MIDI seconds ↔ conceptual musical position)
 * for a score, with repeats/voltas/jumps expanded.
 *
 * @param score - The score to analyze
 * @param options - Tempo/resolution options (use the same values as any MIDI
 *   export the timeline is paired with)
 * @returns The timing sidecar
 */
export function generatePlaybackTimeline(
  score: Score,
  options: TimingMapOptions = {}
): TimingSidecar {
  const ticksPerQuarterNote = options.ticksPerQuarterNote ?? 480;
  const defaultTempo = options.defaultTempo ?? 120;
  const sequence = generatePlaybackSequence(score);
  const grid = buildGridTimeline(score, ticksPerQuarterNote, sequence);
  return buildTimingSidecar(grid, defaultTempo, ticksPerQuarterNote);
}
