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
import type { Score, Part, Measure, NoteEntry } from '../types';
import { generatePlaybackSequence } from './playback-sequence';

/**
 * Expressive-timing options shared by the MIDI exporter and the timeline query.
 *
 * These shape the TEMPO map only — never note durations. The whole module
 * follows "method A": notated tick lengths (and therefore `quarterPos`) are the
 * score's, and every expressive change in elapsed time is carried by tempo
 * (`set_tempo`). This keeps `tick ÷ tpqn` exactly equal to the musical quarter
 * position so the sidecar maps with zero drift.
 */
export interface ExpressionOptions {
  /**
   * Fermata hold factor: a fermata note/rest's tick span is stretched in
   * elapsed time by this factor by dividing the prevailing BPM over the span
   * (e.g. 2 → the span plays at half BPM, lasting twice as long). The note's
   * tick length and `quarterPos` are unchanged. `1` disables. Default `1.75`.
   */
  fermataHoldMultiplier?: number;
  /**
   * Seconds of extra time a caesura ("railroad tracks") inserts, modelled as a
   * tempo dip over the tail of the note carrying it (no tick is added).
   * Default `0.4`. `0` disables.
   */
  caesuraSeconds?: number;
  /**
   * Seconds of extra time a breath mark inserts, modelled like a caesura but
   * shorter. Default `0.25`. `0` disables.
   */
  breathSeconds?: number;
  /**
   * Number of discrete `set_tempo` steps used to approximate a rit./accel.
   * tempo ramp between two tempo anchors. Higher = smoother. Default `12`.
   */
  tempoRampSteps?: number;
}

/** Options controlling the rendered timeline. */
export interface TimingMapOptions extends ExpressionOptions {
  /**
   * Ticks per quarter note (default: 480). Only affects internal tick rounding;
   * `midiSec`/`quarterPos` are otherwise independent of it.
   */
  ticksPerQuarterNote?: number;
  /** Default tempo in BPM when the score carries no tempo marking (default: 120). */
  defaultTempo?: number;
}

/** Resolved expressive-timing defaults. */
const DEFAULT_FERMATA_HOLD = 1.75;
const DEFAULT_CAESURA_SECONDS = 0.4;
const DEFAULT_BREATH_SECONDS = 0.25;
const DEFAULT_RAMP_STEPS = 12;

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
  /**
   * Expressive-timing regions (fermatas, caesuras, breaths, rit./accel.). An
   * aligner can relax its time constraints inside these spans, since the human
   * performance is free to depart most from the grid there. Sorted by
   * `fromMidiSec`. Omitted entirely when there are none.
   */
  expressions?: ExpressionHint[];
}

/** The kind of expressive timing a span represents. */
export type ExpressionKind = 'fermata' | 'caesura' | 'breath' | 'rit' | 'accel';

/** A time region (in MIDI seconds) carrying expressive tempo change. */
export interface ExpressionHint {
  type: ExpressionKind;
  /** Start of the region in MIDI seconds. */
  fromMidiSec: number;
  /** End of the region in MIDI seconds. */
  toMidiSec: number;
}

/** A time region in absolute ticks, before conversion to seconds. */
export interface ExpressionSpan {
  type: ExpressionKind;
  startTick: number;
  endTick: number;
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
  /**
   * Tempo changes (absolute tick), already expanded to include fermata dips and
   * rit./accel. ramp steps. Treated as piecewise-constant by both the MIDI
   * conductor track and the sidecar, so the two never drift.
   */
  tempoEvents: TempoChange[];
  /** Played measures in playback (repeat-expanded) order. */
  measures: GridMeasure[];
  /** Absolute tick at the end of the last measure. */
  totalTicks: number;
  /** Expressive-timing regions (fermata/caesura/breath/rit./accel.), in ticks. */
  expressions: ExpressionSpan[];
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
 *
 * The measure spans its ACTUAL notated content whenever it has any: implicit
 * (pickup) and incomplete measures come out shorter than the meter, and
 * over-full measures come out longer. The latter is the irregular case that
 * matters for alignment — e.g. a written-out arpeggiated roll (cue notes with
 * real durations, tied into the chord that follows) pushes a 4/4 bar past four
 * beats. Clamping such a bar back to the time signature would drop the overflow
 * onto the next measure's downbeat (two onsets colliding at one tick); honoring
 * the content instead lets the next measure begin cleanly after it.
 *
 * The time signature is only a fallback for measures with no timed content at
 * all (e.g. a bar carrying only directions), so an empty bar still advances.
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

  if (actualTicks > 0) {
    return measureStartTick + actualTicks;
  }

  // No timed content: fall back to the time-signature length so the bar still
  // occupies its meter (implicit pickups with no content simply add nothing).
  if (!measure.implicit) {
    const timeAttrs = findTimeSignature(part, measure.number);
    if (timeAttrs) {
      const measureDuration = (timeAttrs.beats / timeAttrs.beatType) * 4 * divisions;
      const calculatedTicks = Math.round((measureDuration * ticksPerQuarterNote) / divisions);
      return measureStartTick + calculatedTicks;
    }
  }

  return measureStartTick;
}

/** Does this note/rest carry a fermata notation? */
function hasFermata(note: NoteEntry): boolean {
  return note.notations?.some((n) => n.type === 'fermata') ?? false;
}

/**
 * If a note carries a caesura or breath-mark articulation, return which one.
 * (Both are modelled as a short held pause after the note.)
 */
function pauseArticulation(note: NoteEntry): 'caesura' | 'breath' | null {
  if (!note.notations) return null;
  for (const n of note.notations) {
    if (n.type === 'articulation') {
      if (n.articulation === 'caesura') return 'caesura';
      if (n.articulation === 'breath-mark') return 'breath';
    }
  }
  return null;
}

/**
 * Recognise a rit./accel.-family tempo word (the printed text of a `words`
 * direction). These trigger a continuous tempo ramp toward the next anchor;
 * the returned kind only labels the span (the actual direction follows the
 * anchors).
 */
function tempoRampWord(text: string): 'rit' | 'accel' | null {
  const t = text.trim().toLowerCase().replace(/[.\s]+$/, '');
  if (!t) return null;
  // Slowing: ritardando, ritenuto, rallentando, allargando, slargando, calando, smorzando.
  if (/^(rit|riten|rall|allarg|slarg|cala|smorz|morend)/.test(t)) return 'rit';
  // Speeding: accelerando, stringendo, affrettando, incalzando.
  if (/^(accel|string|affret|incalz|pi[uù]\s*mosso)/.test(t)) return 'accel';
  return null;
}

/** A pending rit./accel. marker discovered while walking the grid. */
interface RampMarker {
  tick: number;
  kind: 'rit' | 'accel';
}

/** A region whose elapsed time is stretched by dividing the BPM by `factor`. */
interface StretchInterval {
  startTick: number;
  endTick: number;
  factor: number;
  /** Label for the sidecar expression hint. */
  type: ExpressionKind;
}

/**
 * Walk the first part in playback (repeat-expanded) order and record, for each
 * played measure, the absolute tick span it occupies, plus every tempo change
 * as an absolute-tick event. This is the single source of truth both the MIDI
 * tempo map and the timing sidecar are built from, so they always agree.
 *
 * Expressive timing (fermata, caesura/breath, rit./accel.) is folded into the
 * returned `tempoEvents` as ordinary tempo changes — never into note durations.
 * Notated tick spans (and hence `quarterPos`) are untouched.
 */
export function buildGridTimeline(
  score: Score,
  ticksPerQuarterNote: number,
  sequence: { measureIndex: number; repeatIteration: number }[],
  options: ExpressionOptions & { defaultTempo?: number } = {}
): GridTimeline {
  const rawTempo: TempoChange[] = [];
  const measures: GridMeasure[] = [];
  const rampMarkers: RampMarker[] = [];
  const stretches: StretchInterval[] = [];

  if (score.parts.length === 0) {
    return { tempoEvents: [], measures, totalTicks: 0, expressions: [] };
  }

  const fermataHold = options.fermataHoldMultiplier ?? DEFAULT_FERMATA_HOLD;
  const caesuraSeconds = options.caesuraSeconds ?? DEFAULT_CAESURA_SECONDS;
  const breathSeconds = options.breathSeconds ?? DEFAULT_BREATH_SECONDS;
  const rampSteps = Math.max(1, Math.round(options.tempoRampSteps ?? DEFAULT_RAMP_STEPS));
  const defaultTempo = options.defaultTempo ?? 120;

  const part = score.parts[0];
  let divisions = 1;
  let currentTick = 0;
  // Prevailing BPM from explicit anchors, used to size a caesura/breath dip.
  let prevailingBpm = defaultTempo;

  // Convert a pause in seconds to a stretch factor over a tick window: the
  // window's notated time is `windowTicks/tpqn * 60/bpm`, and we want to add
  // `pauseSeconds` to it.
  const pauseFactor = (windowTicks: number, bpm: number, pauseSeconds: number): number => {
    const baseSeconds = (windowTicks / ticksPerQuarterNote) * (60 / bpm);
    if (baseSeconds <= 0) return 1;
    return (baseSeconds + pauseSeconds) / baseSeconds;
  };

  for (const { measureIndex, repeatIteration } of sequence) {
    const measure = part.measures[measureIndex];
    if (!measure) continue;
    if (measure.attributes?.divisions) {
      divisions = measure.attributes.divisions;
    }

    const measureStartTick = currentTick;
    let position = 0;
    let chordBasePosition = 0;
    const tickAt = (pos: number) =>
      measureStartTick + Math.round((pos * ticksPerQuarterNote) / divisions);

    for (const entry of measure.entries) {
      if (entry.type === 'direction') {
        for (const dirType of entry.directionTypes) {
          if (dirType.kind === 'metronome') {
            const bpm = metronomeBpm(dirType.perMinute);
            if (bpm !== null) {
              rawTempo.push({ tick: tickAt(position), bpm });
              prevailingBpm = bpm;
            }
          } else if (dirType.kind === 'words') {
            const kind = tempoRampWord(dirType.text);
            if (kind) rampMarkers.push({ tick: tickAt(position), kind });
          }
        }
        if (entry.sound?.tempo) {
          rawTempo.push({ tick: tickAt(position), bpm: entry.sound.tempo });
          prevailingBpm = entry.sound.tempo;
        }
      } else if (entry.type === 'sound') {
        if (entry.tempo) {
          rawTempo.push({ tick: tickAt(position), bpm: entry.tempo });
          prevailingBpm = entry.tempo;
        }
      } else if (entry.type === 'note') {
        const notePos = entry.chord ? chordBasePosition : position;
        const noteStartTick = tickAt(notePos);
        const noteEndTick = tickAt(notePos + entry.duration);

        if (noteEndTick > noteStartTick) {
          if (fermataHold !== 1 && hasFermata(entry)) {
            // Hold the whole note span at a fraction of the prevailing tempo.
            stretches.push({
              startTick: noteStartTick,
              endTick: noteEndTick,
              factor: fermataHold,
              type: 'fermata',
            });
          }
          const pause = pauseArticulation(entry);
          if (pause) {
            const seconds = pause === 'caesura' ? caesuraSeconds : breathSeconds;
            if (seconds > 0) {
              // Dip the tail of the note (capped at a quarter note) so the break
              // happens after the note sounds, without moving any onset.
              const window = Math.min(noteEndTick - noteStartTick, ticksPerQuarterNote);
              stretches.push({
                startTick: noteEndTick - window,
                endTick: noteEndTick,
                factor: pauseFactor(window, prevailingBpm, seconds),
                type: pause,
              });
            }
          }
        }

        if (!entry.chord) {
          chordBasePosition = position;
          position += entry.duration;
        }
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

  const { tempoEvents, expressions } = bakeTempoMap(
    rawTempo,
    rampMarkers,
    stretches,
    defaultTempo,
    rampSteps
  );

  return { tempoEvents, measures, totalTicks: currentTick, expressions };
}

/**
 * Combine explicit tempo anchors, rit./accel. ramp markers, and time-stretch
 * intervals (fermata/caesura/breath) into a single piecewise-constant tempo
 * map. Ramps become a staircase of small steps; stretches divide the prevailing
 * BPM over their span. The result is consumed identically by the MIDI conductor
 * track and the sidecar, so elapsed seconds can never diverge between them.
 */
function bakeTempoMap(
  rawTempo: TempoChange[],
  rampMarkers: RampMarker[],
  stretches: StretchInterval[],
  defaultTempo: number,
  rampSteps: number
): { tempoEvents: TempoChange[]; expressions: ExpressionSpan[] } {
  // --- Base tempo as change points (mirrors the conductor track's dedup). ---
  const sortedRaw = [...rawTempo].sort((a, b) => a.tick - b.tick);
  const startBpm =
    sortedRaw.length > 0 && sortedRaw[0].tick === 0 ? sortedRaw[0].bpm : defaultTempo;
  const baseChanges: TempoChange[] = [{ tick: 0, bpm: startBpm }];
  let lastBpm = startBpm;
  for (const ev of sortedRaw) {
    if (ev.tick === 0) continue;
    if (ev.bpm === lastBpm) continue;
    // Collapse same-tick anchors: the last one at a tick wins.
    if (baseChanges[baseChanges.length - 1].tick === ev.tick) {
      baseChanges[baseChanges.length - 1].bpm = ev.bpm;
    } else {
      baseChanges.push({ tick: ev.tick, bpm: ev.bpm });
    }
    lastBpm = ev.bpm;
  }

  const baseBpmAt = (tick: number): number => {
    let i = baseChanges.length - 1;
    while (i > 0 && baseChanges[i].tick > tick) i--;
    return baseChanges[i].bpm;
  };

  // --- Expand rit./accel. markers into staircase ramp points. ---
  const rampExpressions: ExpressionSpan[] = [];
  const rampPoints: TempoChange[] = [];
  for (const marker of rampMarkers) {
    // Target = first base change strictly after the marker with a different BPM.
    const from = baseBpmAt(marker.tick);
    const next = baseChanges.find((c) => c.tick > marker.tick && c.bpm !== from);
    if (!next) continue; // No anchor to ramp toward; leave tempo as-is.
    const span = next.tick - marker.tick;
    if (span <= 0) continue;
    for (let k = 1; k < rampSteps; k++) {
      const tick = Math.round(marker.tick + (span * k) / rampSteps);
      if (tick <= marker.tick || tick >= next.tick) continue;
      const bpm = from + ((next.bpm - from) * k) / rampSteps;
      rampPoints.push({ tick, bpm });
    }
    rampExpressions.push({ type: marker.kind, startTick: marker.tick, endTick: next.tick });
  }

  // Merge base changes and ramp points into a single sorted step list. Where a
  // ramp point shares a tick with a base change, the base change wins.
  const baseTicks = new Set(baseChanges.map((c) => c.tick));
  const stepList: TempoChange[] = [...baseChanges];
  for (const p of rampPoints) {
    if (!baseTicks.has(p.tick)) stepList.push(p);
  }
  stepList.sort((a, b) => a.tick - b.tick);
  const stepBpmAt = (tick: number): number => {
    let i = stepList.length - 1;
    while (i > 0 && stepList[i].tick > tick) i--;
    return stepList[i].bpm;
  };

  // --- Apply stretch intervals over the stepped base. ---
  const boundaries = new Set<number>(stepList.map((s) => s.tick));
  for (const s of stretches) {
    boundaries.add(s.startTick);
    boundaries.add(s.endTick);
  }
  const sortedBoundaries = [...boundaries].sort((a, b) => a - b);

  const tempoEvents: TempoChange[] = [];
  let emittedBpm: number | null = null;
  for (const tick of sortedBoundaries) {
    let bpm = stepBpmAt(tick);
    for (const s of stretches) {
      if (tick >= s.startTick && tick < s.endTick) bpm /= s.factor;
    }
    if (emittedBpm === null || bpm !== emittedBpm) {
      tempoEvents.push({ tick, bpm });
      emittedBpm = bpm;
    }
  }

  const expressions: ExpressionSpan[] = [
    ...stretches.map((s) => ({ type: s.type, startTick: s.startTick, endTick: s.endTick })),
    ...rampExpressions,
  ].sort((a, b) => a.startTick - b.startTick || a.endTick - b.endTick);

  return { tempoEvents, expressions };
}

/**
 * Microseconds per quarter note for a BPM, exactly as the MIDI `set_tempo`
 * meta-event stores it. Both the conductor track and {@link makeTickToSec} go
 * through this, so the sidecar's seconds match real MIDI playback to the
 * microsecond (with no per-step rounding drift, which matters once rit./accel.
 * ramps introduce many fractional BPM steps).
 */
export function bpmToUsPerQuarter(bpm: number): number {
  return Math.round(60000000 / bpm);
}

/**
 * Build a tick→seconds converter from a tempo map, using the SAME tempo-change
 * points the conductor track emits (initial tempo at tick 0, then changes where
 * the BPM actually differs) and the SAME rounded microseconds-per-quarter. This
 * guarantees `midiSec` matches the playback time of the generated MIDI.
 */
function makeTickToSec(
  tempoEvents: TempoChange[],
  defaultTempo: number,
  ticksPerQuarterNote: number
): (tick: number) => number {
  const sorted = [...tempoEvents].sort((a, b) => a.tick - b.tick);
  const startBpm = sorted.length > 0 && sorted[0].tick === 0 ? sorted[0].bpm : defaultTempo;

  // Effective change points (mirrors the conductor track's emission), carrying
  // the rounded microseconds-per-quarter the MIDI actually stores.
  const changes: { tick: number; usPerQuarter: number }[] = [
    { tick: 0, usPerQuarter: bpmToUsPerQuarter(startBpm) },
  ];
  let lastBpm = startBpm;
  for (const ev of sorted) {
    if (ev.tick === 0) continue;
    if (ev.bpm === lastBpm) continue;
    changes.push({ tick: ev.tick, usPerQuarter: bpmToUsPerQuarter(ev.bpm) });
    lastBpm = ev.bpm;
  }

  const secPerTick = (usPerQuarter: number) => usPerQuarter / 1_000_000 / ticksPerQuarterNote;

  // Cumulative seconds at the start of each segment.
  const cumSec: number[] = [0];
  for (let i = 1; i < changes.length; i++) {
    const dTick = changes[i].tick - changes[i - 1].tick;
    cumSec[i] = cumSec[i - 1] + dTick * secPerTick(changes[i - 1].usPerQuarter);
  }

  return (tick: number) => {
    let i = changes.length - 1;
    while (i > 0 && changes[i].tick > tick) i--;
    return cumSec[i] + (tick - changes[i].tick) * secPerTick(changes[i].usPerQuarter);
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

  const sidecar: TimingSidecar = {
    version: '1',
    durationSec: tickToSec(grid.totalTicks),
    ticksPerQuarterNote,
    breakpoints,
  };

  if (grid.expressions.length > 0) {
    sidecar.expressions = grid.expressions
      .map((e) => ({
        type: e.type,
        fromMidiSec: tickToSec(e.startTick),
        toMidiSec: tickToSec(e.endTick),
      }))
      .sort((a, b) => a.fromMidiSec - b.fromMidiSec || a.toMidiSec - b.toMidiSec);
  }

  return sidecar;
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
  const grid = buildGridTimeline(score, ticksPerQuarterNote, sequence, {
    defaultTempo,
    fermataHoldMultiplier: options.fermataHoldMultiplier,
    caesuraSeconds: options.caesuraSeconds,
    breathSeconds: options.breathSeconds,
    tempoRampSteps: options.tempoRampSteps,
  });
  return buildTimingSidecar(grid, defaultTempo, ticksPerQuarterNote);
}
