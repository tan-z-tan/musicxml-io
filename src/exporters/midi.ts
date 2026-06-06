import type { Score, NoteEntry, Pitch, Part, DynamicsValue } from '../types';
import { hasTieStart, hasTieStop } from '../entry-accessors';
import { generatePlaybackSequence } from '../query/playback-sequence';
import {
  buildGridTimeline,
  buildTimingSidecar,
  measureEndTick,
  bpmToUsPerQuarter,
} from '../query/playback-timeline';
import type {
  GridTimeline,
  TimingSidecar,
  ExpressionOptions,
} from '../query/playback-timeline';

/**
 * MIDI export options
 *
 * Extends {@link ExpressionOptions} so fermata holds and rit./accel. ramps land
 * in the exported tempo map (and the timing sidecar) identically.
 */
export interface MidiExportOptions extends ExpressionOptions {
  /** Ticks per quarter note (default: 480) */
  ticksPerQuarterNote?: number;
  /** Default tempo in BPM (default: 120) */
  defaultTempo?: number;
  /** Default velocity for notes when no dynamics are present (default: 80) */
  defaultVelocity?: number;
}

/**
 * A single point on the timing sidecar: a correspondence between a time in the
 * generated MIDI and a conceptual musical position (measure + beat).
 *
 * Breakpoints are emitted at every played-measure start and every tempo change
 * (plus a terminal point). Between two consecutive breakpoints the relationship
 * `midiSec ↔ quarterPos` is linear (tempo is piecewise-constant), so a consumer
 * can interpolate any intermediate time exactly.
 */
/** Result of {@link exportMidiWithTimingMap}. */
export interface MidiWithTimingMap {
  /** The Standard MIDI File data. */
  midi: Uint8Array;
  /** The MIDI-time ↔ musical-position sidecar. */
  sidecar: TimingSidecar;
}

/**
 * Absolute dynamic markings mapped to MIDI velocity.
 * Mirrors the validated mapping used by the Octava playback engine.
 */
const DYNAMICS_VELOCITY: Partial<Record<DynamicsValue, number>> = {
  pppppp: 12, ppppp: 20, pppp: 25, ppp: 30, pp: 40, p: 50,
  mp: 60, mf: 75,
  f: 90, ff: 105, fff: 115, ffff: 120, fffff: 125, ffffff: 127,
  fp: 90, // forte-piano: forte attack
  n: 25, // niente
  pf: 70,
};

/**
 * Sforzando-family markings are relative accents applied to the current
 * baseline velocity rather than absolute levels.
 */
const SF_ACCENT_MULTIPLIER: Partial<Record<DynamicsValue, number>> = {
  sf: 1.3, sfz: 1.35, sffz: 1.45, fz: 1.3, rf: 1.2, rfz: 1.3, sfp: 1.3, sfpp: 1.3,
};

/**
 * Articulation velocity multipliers (accents). Duration-affecting
 * articulations (staccato etc.) are intentionally not handled here.
 */
const ARTICULATION_VELOCITY: Record<string, number> = {
  'accent': 1.25,
  'strong-accent': 1.35,
  'marcato': 1.35,
  'tenuto': 1.05,
  'stress': 1.15,
  'unstress': 0.85,
  'soft-accent': 0.8,
};

/** Velocity scaling for grace notes (slightly softer than their principal). */
const GRACE_VELOCITY_MULTIPLIER = 0.85;

function clampVelocity(v: number): number {
  return Math.round(Math.min(127, Math.max(1, v)));
}

/**
 * Combined articulation velocity multiplier for a note's notations.
 */
function articulationVelocityMultiplier(note: NoteEntry): number {
  if (!note.notations) return 1;
  let mult = 1;
  for (const n of note.notations) {
    if (n.type === 'articulation') {
      const m = ARTICULATION_VELOCITY[n.articulation];
      if (m) mult *= m;
    }
  }
  return mult;
}

interface MidiNoteEvent {
  tick: number;
  type: 'on' | 'off';
  note: number;
  velocity: number;
}

/**
 * Schedule grace notes immediately before the beat of their principal note,
 * matching the validated Octava behaviour (grace notes precede the onset and
 * borrow time from before it rather than delaying the principal note).
 *
 * Chord grace notes (chord=true) share their predecessor's time slot.
 */
function scheduleGraceNotes(
  graceNotes: NoteEntry[],
  targetTick: number,
  baseVelocity: number,
  chromaticTranspose: number,
  ticksPerQuarterNote: number,
  noteEvents: MidiNoteEvent[]
): void {
  if (graceNotes.length === 0) return;

  const graceUnit = Math.max(1, Math.round(ticksPerQuarterNote / 8)); // ~32nd note

  // Assign a time slot to each grace note; chord notes reuse the prior slot.
  const slots: number[] = [];
  let slot = -1;
  for (const g of graceNotes) {
    if (!g.chord || slot < 0) slot++;
    slots.push(slot);
  }
  const numSlots = slot + 1;
  const velocity = clampVelocity(baseVelocity * GRACE_VELOCITY_MULTIPLIER);

  for (let i = 0; i < graceNotes.length; i++) {
    const g = graceNotes[i];
    if (!g.pitch) continue;
    const s = slots[i];
    const onset = Math.max(0, targetTick - (numSlots - s) * graceUnit);
    const off = Math.max(onset + 1, targetTick - (numSlots - s - 1) * graceUnit);
    const midiNote = pitchToMidiNote(g.pitch, chromaticTranspose);
    noteEvents.push({ tick: onset, type: 'on', note: midiNote, velocity });
    noteEvents.push({ tick: off, type: 'off', note: midiNote, velocity: 0 });
  }
}

/**
 * Export a Score to Standard MIDI File format (SMF Type 1)
 * @param score - The Score to export
 * @param options - Export options
 * @returns The MIDI file data as Uint8Array
 */
export function exportMidi(score: Score, options: MidiExportOptions = {}): Uint8Array {
  const { tracks, ticksPerQuarterNote } = buildMidiTracks(score, options);
  return buildMidiFile(tracks, ticksPerQuarterNote);
}

/**
 * Export a Score to MIDI together with a timing sidecar that maps the generated
 * MIDI timeline to conceptual musical positions (measure + beat).
 *
 * The MIDI bytes are byte-for-byte identical to {@link exportMidi}; the sidecar
 * is derived from the same internal time computation so the two can never drift.
 *
 * @param score - The Score to export
 * @param options - Export options (must match those used for any aligned audio)
 * @returns The MIDI data and its timing sidecar
 */
export function exportMidiWithTimingMap(
  score: Score,
  options: MidiExportOptions = {}
): MidiWithTimingMap {
  const { tracks, ticksPerQuarterNote, defaultTempo, grid } = buildMidiTracks(score, options);
  return {
    midi: buildMidiFile(tracks, ticksPerQuarterNote),
    sidecar: buildTimingSidecar(grid, defaultTempo, ticksPerQuarterNote),
  };
}

/**
 * Build the per-track MIDI byte arrays and the shared playback grid. Both
 * {@link exportMidi} and {@link exportMidiWithTimingMap} go through here so the
 * MIDI and the sidecar are always computed from the same timeline.
 */
function buildMidiTracks(
  score: Score,
  options: MidiExportOptions
): { tracks: Uint8Array[]; ticksPerQuarterNote: number; defaultTempo: number; grid: GridTimeline } {
  const ticksPerQuarterNote = options.ticksPerQuarterNote ?? 480;
  const defaultTempo = options.defaultTempo ?? 120;
  const defaultVelocity = options.defaultVelocity ?? 80;

  const tracks: Uint8Array[] = [];

  // Expand repeats, voltas, and jump instructions (D.C./D.S./Coda/Fine) into
  // the actual order measures should be played. Structure is read from the
  // first part and applied to every part so all tracks stay in sync.
  const sequence = generatePlaybackSequence(score);
  const measureOrder = sequence.map((m) => m.measureIndex);

  // Shared time computation: measure spans (ticks) + tempo changes (including
  // fermata holds and rit./accel. ramps).
  const grid = buildGridTimeline(score, ticksPerQuarterNote, sequence, {
    defaultTempo,
    fermataHoldMultiplier: options.fermataHoldMultiplier,
    caesuraSeconds: options.caesuraSeconds,
    breathSeconds: options.breathSeconds,
    tempoRampSteps: options.tempoRampSteps,
  });

  // Track 0: Tempo and time signature
  tracks.push(createConductorTrack(score, defaultTempo, grid));

  // Create a track for each part
  // Filter partList to only include score-parts (exclude part-groups)
  const scoreParts = score.partList.filter(entry => entry.type === 'score-part');

  for (let partIndex = 0; partIndex < score.parts.length; partIndex++) {
    const part = score.parts[partIndex];
    const partEntry = scoreParts[partIndex];
    // Only score-part entries have MIDI instruments
    let channel = partIndex % 16;
    let program = 1;
    if (partEntry && partEntry.midiInstruments?.[0]) {
      const midiInst = partEntry.midiInstruments[0];
      channel = midiInst.channel ?? channel;
      program = midiInst.program ?? program;
    }

    const trackData = createPartTrack(
      part,
      score,
      channel,
      program,
      ticksPerQuarterNote,
      defaultVelocity,
      measureOrder
    );
    tracks.push(trackData);
  }

  return { tracks, ticksPerQuarterNote, defaultTempo, grid };
}

/**
 * Convert pitch to MIDI note number with optional transposition
 * @param pitch - The pitch to convert
 * @param transpose - Optional transpose settings (chromatic semitones to add)
 */
function pitchToMidiNote(pitch: Pitch, chromaticTranspose: number = 0): number {
  const stepValues: Record<string, number> = {
    'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11,
  };
  const baseMidi = (pitch.octave + 1) * 12 + stepValues[pitch.step] + (pitch.alter ?? 0);
  // Apply transposition for transposing instruments
  // chromatic value indicates how many semitones the written pitch should be transposed
  return baseMidi + chromaticTranspose;
}

/**
 * Create conductor track: all tempo changes and all time-signature changes,
 * merged in absolute-tick order.
 *
 * Tempo is read from three sources, in document order at each position:
 * metronome direction-types, the <sound tempo> inside a direction, and
 * standalone <sound tempo> entries — plus fermata holds and rit./accel. ramps
 * folded in by {@link buildGridTimeline}. Time signatures are emitted for every
 * change across the playback (repeat-expanded) order, not just the first
 * measure. Events are placed at absolute ticks so changes inside repeated
 * sections land correctly.
 */
function createConductorTrack(
  score: Score,
  defaultTempo: number,
  grid: GridTimeline
): Uint8Array {
  // Collect all meta events as (tick, order, bytes); `order` breaks ties so that
  // at a shared tick the tempo is written before the time signature (matching
  // the historical tick-0 layout).
  interface MetaEvent {
    tick: number;
    order: number;
    bytes: number[];
  }
  const metaEvents: MetaEvent[] = [];

  const tempoBytes = (bpm: number): number[] => {
    const us = bpmToUsPerQuarter(bpm);
    return [0xff, 0x51, 0x03, (us >> 16) & 0xff, (us >> 8) & 0xff, us & 0xff];
  };

  // --- Tempo changes (deduped, mirroring makeTickToSec). ---
  const tempoEvents = [...grid.tempoEvents].sort((a, b) => a.tick - b.tick);
  const startBpm =
    tempoEvents.length > 0 && tempoEvents[0].tick === 0 ? tempoEvents[0].bpm : defaultTempo;
  metaEvents.push({ tick: 0, order: 0, bytes: tempoBytes(startBpm) });
  let lastBpm = startBpm;
  for (const ev of tempoEvents) {
    if (ev.tick === 0) continue; // already emitted as the initial tempo
    if (ev.bpm === lastBpm) continue; // no audible change
    metaEvents.push({ tick: ev.tick, order: 0, bytes: tempoBytes(ev.bpm) });
    lastBpm = ev.bpm;
  }

  // --- Time-signature changes across the played measures. ---
  const part = score.parts.length > 0 ? score.parts[0] : undefined;
  if (part) {
    let lastSig: string | null = null;
    for (const m of grid.measures) {
      const time = part.measures[m.measureIndex]?.attributes?.time;
      if (!time) continue; // unchanged from the prevailing signature
      const numerator = parseInt(time.beats, 10) || 4;
      const denominator = Math.log2(time.beatType);
      const sig = `${numerator}/${denominator}`;
      if (sig === lastSig) continue;
      lastSig = sig;
      metaEvents.push({
        tick: m.startTick,
        order: 1,
        bytes: [0xff, 0x58, 0x04, numerator, denominator, 24, 8],
      });
    }
  }

  // --- Emit as delta-timed meta events. ---
  metaEvents.sort((a, b) => a.tick - b.tick || a.order - b.order);
  const events: number[] = [];
  let lastTick = 0;
  for (const ev of metaEvents) {
    events.push(...writeVariableLength(ev.tick - lastTick), ...ev.bytes);
    lastTick = ev.tick;
  }

  // End of track
  events.push(...writeVariableLength(0), 0xff, 0x2f, 0x00);

  return new Uint8Array(events);
}

/**
 * Create a track for a part
 */
function createPartTrack(
  part: Part,
  _score: Score,
  channel: number,
  program: number,
  ticksPerQuarterNote: number,
  defaultVelocity: number,
  measureOrder: number[]
): Uint8Array {
  const events: number[] = [];

  // Program change
  events.push(
    ...writeVariableLength(0),
    0xc0 | (channel & 0x0f),
    (program - 1) & 0x7f // MIDI programs are 0-indexed
  );

  // Track note events
  const noteEvents: MidiNoteEvent[] = [];

  let currentTick = 0;
  let divisions = 1;
  let chromaticTranspose = 0; // Track transposition for transposing instruments

  // Expressive state carried across measures.
  let currentVelocity = defaultVelocity; // baseline from dynamics markings
  let pendingAccent = 1; // sforzando-family accent for the next onset
  let accentBound = false; // whether pendingAccent is already tied to an onset
  let pendingGrace: NoteEntry[] = []; // grace notes awaiting their principal

  for (const measureIndex of measureOrder) {
    const measure = part.measures[measureIndex];
    // Parts may differ in length; the order is derived from the first part.
    if (!measure) continue;

    // Update divisions from the original measure (need to track last seen divisions)
    if (measure.attributes?.divisions) {
      divisions = measure.attributes.divisions;
    }
    // Update transposition if specified in this measure's attributes
    if (measure.attributes?.transpose) {
      chromaticTranspose = measure.attributes.transpose.chromatic;
    }

    const measureStartTick = currentTick;
    let position = 0;
    let chordBasePosition = 0; // Position for chord notes (same as previous non-chord note)
    let maxPosition = 0; // Track maximum position for multi-voice measures

    for (const entry of measure.entries) {
      if (entry.type === 'note') {
        const note = entry as NoteEntry;

        // Grace notes carry no duration; defer them until their principal note.
        if (note.grace) {
          if (note.pitch) pendingGrace.push(note);
          continue;
        }

        // New onset: retire a spent accent and bind a fresh one.
        if (!note.chord) {
          if (accentBound) {
            pendingAccent = 1;
            accentBound = false;
          }
          if (pendingAccent !== 1) accentBound = true;
        }

        if (note.pitch) {
          const midiNote = pitchToMidiNote(note.pitch, chromaticTranspose);
          // Chord notes use the same position as the previous non-chord note
          const notePosition = note.chord ? chordBasePosition : position;
          const startTick = measureStartTick + Math.round((notePosition * ticksPerQuarterNote) / divisions);
          const durationTicks = Math.round((note.duration * ticksPerQuarterNote) / divisions);

          // Flush any pending grace notes onto this onset (head note only).
          if (!note.chord && pendingGrace.length > 0) {
            scheduleGraceNotes(pendingGrace, startTick, currentVelocity, chromaticTranspose, ticksPerQuarterNote, noteEvents);
            pendingGrace = [];
          }

          const velocity = clampVelocity(currentVelocity * pendingAccent * articulationVelocityMultiplier(note));

          const isTieStop = hasTieStop(note);
          const isTieStart = hasTieStart(note);

          // Don't generate note-on for tie continuations (the note is already sounding)
          if (!isTieStop) {
            noteEvents.push({ tick: startTick, type: 'on', note: midiNote, velocity });
          }

          // Don't generate note-off for tie starts (the note continues into the next tied note)
          if (!isTieStart) {
            noteEvents.push({ tick: startTick + durationTicks, type: 'off', note: midiNote, velocity: 0 });
          }
        }

        // Chord notes share the same position
        if (!note.chord) {
          chordBasePosition = position; // Save position for subsequent chord notes
          position += note.duration;
          if (position > maxPosition) {
            maxPosition = position;
          }
        }
      } else if (entry.type === 'direction') {
        // Dynamics markings update the baseline velocity / accent.
        for (const dt of entry.directionTypes) {
          if (dt.kind === 'dynamics' && dt.value) {
            const abs = DYNAMICS_VELOCITY[dt.value];
            if (abs !== undefined) {
              currentVelocity = abs;
            } else {
              const accent = SF_ACCENT_MULTIPLIER[dt.value];
              if (accent !== undefined) {
                pendingAccent = accent;
                accentBound = false;
              }
            }
          }
        }
      } else if (entry.type === 'backup') {
        position -= entry.duration;
      } else if (entry.type === 'forward') {
        position += entry.duration;
        if (position > maxPosition) {
          maxPosition = position;
        }
      }
    }

    currentTick = measureEndTick(
      measure,
      part,
      divisions,
      measureStartTick,
      maxPosition,
      ticksPerQuarterNote
    );
  }

  // Any grace notes left unattached (e.g. trailing the final note) play just
  // before the end of the part.
  if (pendingGrace.length > 0) {
    scheduleGraceNotes(pendingGrace, currentTick, currentVelocity, chromaticTranspose, ticksPerQuarterNote, noteEvents);
    pendingGrace = [];
  }

  // Safety: ensure every note-on has a matching note-off.
  // Unterminated ties (tie-start without a matching tie-stop) can leave
  // notes without a note-off, causing hanging notes in MIDI playback.
  const onCounts = new Map<number, number>();
  const offCounts = new Map<number, number>();
  for (const e of noteEvents) {
    const map = e.type === 'on' ? onCounts : offCounts;
    map.set(e.note, (map.get(e.note) ?? 0) + 1);
  }
  for (const [note, onCount] of onCounts) {
    const offCount = offCounts.get(note) ?? 0;
    for (let i = 0; i < onCount - offCount; i++) {
      noteEvents.push({ tick: currentTick, type: 'off', note, velocity: 0 });
    }
  }

  // Sort events by tick, then note-off before note-on at same tick
  noteEvents.sort((a, b) => {
    if (a.tick !== b.tick) return a.tick - b.tick;
    if (a.type !== b.type) return a.type === 'off' ? -1 : 1;
    return a.note - b.note;
  });

  // Convert to MIDI events with delta times
  let lastTick = 0;
  for (const event of noteEvents) {
    const deltaTick = event.tick - lastTick;
    lastTick = event.tick;

    if (event.type === 'on') {
      events.push(
        ...writeVariableLength(deltaTick),
        0x90 | (channel & 0x0f),
        event.note & 0x7f,
        event.velocity & 0x7f
      );
    } else {
      events.push(
        ...writeVariableLength(deltaTick),
        0x80 | (channel & 0x0f),
        event.note & 0x7f,
        0
      );
    }
  }

  // End of track
  events.push(...writeVariableLength(0), 0xff, 0x2f, 0x00);

  return new Uint8Array(events);
}

/**
 * Write a variable-length quantity
 */
function writeVariableLength(value: number): number[] {
  if (value < 0) value = 0;

  const bytes: number[] = [];
  bytes.unshift(value & 0x7f);
  value >>= 7;

  while (value > 0) {
    bytes.unshift((value & 0x7f) | 0x80);
    value >>= 7;
  }

  return bytes;
}

/**
 * Write a 32-bit big-endian integer
 */
function writeUint32BE(value: number): number[] {
  return [
    (value >> 24) & 0xff,
    (value >> 16) & 0xff,
    (value >> 8) & 0xff,
    value & 0xff,
  ];
}

/**
 * Write a 16-bit big-endian integer
 */
function writeUint16BE(value: number): number[] {
  return [
    (value >> 8) & 0xff,
    value & 0xff,
  ];
}

/**
 * Build the complete MIDI file
 */
function buildMidiFile(tracks: Uint8Array[], ticksPerQuarterNote: number): Uint8Array {
  // Header chunk: "MThd" + length(6) + format(1) + numTracks + division.
  const header = Uint8Array.from([
    0x4d, 0x54, 0x68, 0x64,
    ...writeUint32BE(6),
    ...writeUint16BE(1),
    ...writeUint16BE(tracks.length),
    ...writeUint16BE(ticksPerQuarterNote),
  ]);

  // Total size up front so we can write into one buffer (no large spreads,
  // which would risk a stack overflow on big repeat-expanded tracks).
  let total = header.length;
  for (const track of tracks) total += 8 + track.length;

  const out = new Uint8Array(total);
  let offset = 0;
  out.set(header, offset);
  offset += header.length;

  for (const track of tracks) {
    out.set([0x4d, 0x54, 0x72, 0x6b], offset); // "MTrk"
    offset += 4;
    out.set(writeUint32BE(track.length), offset);
    offset += 4;
    out.set(track, offset);
    offset += track.length;
  }

  return out;
}
