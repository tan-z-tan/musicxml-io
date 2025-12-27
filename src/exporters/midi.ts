import type { Score, NoteEntry, Pitch, Part, Measure } from '../types';

/**
 * MIDI export options
 */
export interface MidiExportOptions {
  /** Ticks per quarter note (default: 480) */
  ticksPerQuarterNote?: number;
  /** Default tempo in BPM (default: 120) */
  defaultTempo?: number;
  /** Default velocity for notes (default: 80) */
  defaultVelocity?: number;
}

/**
 * Export a Score to Standard MIDI File format (SMF Type 1)
 * @param score - The Score to export
 * @param options - Export options
 * @returns The MIDI file data as Uint8Array
 */
export function exportMidi(score: Score, options: MidiExportOptions = {}): Uint8Array {
  const ticksPerQuarterNote = options.ticksPerQuarterNote ?? 480;
  const defaultTempo = options.defaultTempo ?? 120;
  const defaultVelocity = options.defaultVelocity ?? 80;

  const tracks: Uint8Array[] = [];

  // Track 0: Tempo and time signature
  const conductorTrack = createConductorTrack(score, defaultTempo, ticksPerQuarterNote);
  tracks.push(conductorTrack);

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
      defaultVelocity
    );
    tracks.push(trackData);
  }

  // Build the complete MIDI file
  return buildMidiFile(tracks, ticksPerQuarterNote);
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
 * Create conductor track (tempo, time signature, key signature)
 */
function createConductorTrack(
  score: Score,
  defaultTempo: number,
  ticksPerQuarterNote: number
): Uint8Array {
  const events: number[] = [];

  // Set tempo at the beginning (microseconds per quarter note)
  const microsecondsPerQuarterNote = Math.round(60000000 / defaultTempo);
  events.push(
    ...writeVariableLength(0), // Delta time
    0xff, 0x51, 0x03, // Tempo meta event
    (microsecondsPerQuarterNote >> 16) & 0xff,
    (microsecondsPerQuarterNote >> 8) & 0xff,
    microsecondsPerQuarterNote & 0xff
  );

  // Get initial time signature from first measure
  if (score.parts.length > 0 && score.parts[0].measures.length > 0) {
    const firstMeasure = score.parts[0].measures[0];
    const time = firstMeasure.attributes?.time;
    if (time) {
      const numerator = parseInt(time.beats, 10) || 4;
      const denominator = Math.log2(time.beatType);
      events.push(
        ...writeVariableLength(0), // Delta time
        0xff, 0x58, 0x04, // Time signature meta event
        numerator,
        denominator,
        24, // MIDI clocks per metronome click
        8   // 32nd notes per 24 MIDI clocks
      );
    }
  }

  // Scan for tempo changes in directions (with repeat expansion)
  let currentTick = 0;
  if (score.parts.length > 0) {
    const part = score.parts[0];
    let divisions = 1;

    // Expand repeats for conductor track as well
    const measureOrder = expandRepeats(part.measures);

    for (const measureIndex of measureOrder) {
      const measure = part.measures[measureIndex];
      if (measure.attributes?.divisions) {
        divisions = measure.attributes.divisions;
      }

      let measurePosition = 0;

      for (const entry of measure.entries) {
        if (entry.type === 'direction') {
          for (const dirType of entry.directionTypes) {
            if (dirType.kind === 'metronome') {
              const bpm = typeof dirType.perMinute === 'number' ? dirType.perMinute : parseInt(String(dirType.perMinute), 10);
              if (isNaN(bpm)) continue;
              const usPerQuarter = Math.round(60000000 / bpm);
              const tickDelta = (measurePosition * ticksPerQuarterNote) / divisions;

              events.push(
                ...writeVariableLength(Math.round(tickDelta)),
                0xff, 0x51, 0x03,
                (usPerQuarter >> 16) & 0xff,
                (usPerQuarter >> 8) & 0xff,
                usPerQuarter & 0xff
              );
              currentTick += tickDelta;
            }
          }
        } else if (entry.type === 'note' && !entry.chord) {
          measurePosition += entry.duration;
        } else if (entry.type === 'backup') {
          measurePosition -= entry.duration;
        } else if (entry.type === 'forward') {
          measurePosition += entry.duration;
        }
      }
    }
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
  defaultVelocity: number
): Uint8Array {
  const events: number[] = [];

  // Program change
  events.push(
    ...writeVariableLength(0),
    0xc0 | (channel & 0x0f),
    (program - 1) & 0x7f // MIDI programs are 0-indexed
  );

  // Track note events
  const noteEvents: { tick: number; type: 'on' | 'off'; note: number; velocity: number }[] = [];

  let currentTick = 0;
  let divisions = 1;
  let chromaticTranspose = 0; // Track transposition for transposing instruments

  // Expand repeats to get playback order
  const measureOrder = expandRepeats(part.measures);

  for (const measureIndex of measureOrder) {
    const measure = part.measures[measureIndex];

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
    let maxPosition = 0; // Track maximum position for multi-voice measures

    for (const entry of measure.entries) {
      if (entry.type === 'note') {
        const note = entry as NoteEntry;

        if (note.pitch && !note.grace) {
          const midiNote = pitchToMidiNote(note.pitch, chromaticTranspose);
          const startTick = measureStartTick + Math.round((position * ticksPerQuarterNote) / divisions);
          const durationTicks = Math.round((note.duration * ticksPerQuarterNote) / divisions);

          noteEvents.push({
            tick: startTick,
            type: 'on',
            note: midiNote,
            velocity: defaultVelocity,
          });

          noteEvents.push({
            tick: startTick + durationTicks,
            type: 'off',
            note: midiNote,
            velocity: 0,
          });
        }

        // Chord notes share the same position
        if (!note.chord) {
          position += note.duration;
          if (position > maxPosition) {
            maxPosition = position;
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

    // Move to the end of the measure
    // For implicit (pickup) measures, use actual content duration
    // For regular measures, use time signature-based duration
    if (measure.implicit) {
      // Implicit measures (pickup/anacrusis) should use actual content length
      currentTick = measureStartTick + Math.round((maxPosition * ticksPerQuarterNote) / divisions);
    } else {
      const timeAttrs = findTimeSignature(part, measure.number);
      if (timeAttrs) {
        const measureDuration = (timeAttrs.beats / timeAttrs.beatType) * 4 * divisions;
        const calculatedTicks = Math.round((measureDuration * ticksPerQuarterNote) / divisions);
        const actualTicks = Math.round((maxPosition * ticksPerQuarterNote) / divisions);
        // Use the smaller of calculated and actual for incomplete measures
        // (e.g., last measure before repeat that combines with pickup)
        const ticksToAdd = Math.min(calculatedTicks, actualTicks > 0 ? actualTicks : calculatedTicks);
        currentTick = measureStartTick + ticksToAdd;
      } else {
        currentTick = measureStartTick + Math.round((maxPosition * ticksPerQuarterNote) / divisions);
      }
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
 * Find time signature at a measure
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
        beatType: measure.attributes.time.beatType
      };
    }
  }

  return time;
}

/**
 * Check if a measure has a forward repeat at the start
 */
function hasForwardRepeat(measure: Measure): boolean {
  if (!measure.barlines) return false;
  return measure.barlines.some(
    (b) => b.location === 'left' && b.repeat?.direction === 'forward'
  );
}

/**
 * Check if a measure has a backward repeat at the end
 */
function hasBackwardRepeat(measure: Measure): { found: boolean; times: number } {
  if (!measure.barlines) return { found: false, times: 2 };
  const barline = measure.barlines.find(
    (b) => b.location === 'right' && b.repeat?.direction === 'backward'
  );
  if (barline?.repeat) {
    return { found: true, times: barline.repeat.times ?? 2 };
  }
  return { found: false, times: 2 };
}

/**
 * Expand repeats and return an array of measure indices in playback order
 */
function expandRepeats(measures: Measure[]): number[] {
  const result: number[] = [];
  let i = 0;

  while (i < measures.length) {
    const measure = measures[i];

    // Find if there's a backward repeat ahead
    let backwardRepeatIndex = -1;
    let repeatTimes = 2;

    for (let j = i; j < measures.length; j++) {
      const backwardInfo = hasBackwardRepeat(measures[j]);
      if (backwardInfo.found) {
        backwardRepeatIndex = j;
        repeatTimes = backwardInfo.times;
        break;
      }
      // Stop searching if we hit another forward repeat (nested repeats)
      if (j > i && hasForwardRepeat(measures[j])) {
        break;
      }
    }

    if (backwardRepeatIndex >= 0) {
      // Find the matching forward repeat (or start of piece)
      let forwardRepeatIndex = 0;
      for (let j = i; j <= backwardRepeatIndex; j++) {
        if (hasForwardRepeat(measures[j])) {
          forwardRepeatIndex = j;
          break;
        }
      }

      // Play through the repeat section 'times' times
      for (let rep = 0; rep < repeatTimes; rep++) {
        for (let j = forwardRepeatIndex; j <= backwardRepeatIndex; j++) {
          result.push(j);
        }
      }

      // Continue after the repeat
      i = backwardRepeatIndex + 1;
    } else {
      // No repeat, just add this measure
      result.push(i);
      i++;
    }
  }

  return result;
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
  const chunks: number[] = [];

  // Header chunk
  const headerChunkType = [0x4d, 0x54, 0x68, 0x64]; // "MThd"
  const headerLength = writeUint32BE(6);
  const format = writeUint16BE(1); // Type 1 MIDI file
  const numTracks = writeUint16BE(tracks.length);
  const division = writeUint16BE(ticksPerQuarterNote);

  chunks.push(
    ...headerChunkType,
    ...headerLength,
    ...format,
    ...numTracks,
    ...division
  );

  // Track chunks
  for (const track of tracks) {
    const trackChunkType = [0x4d, 0x54, 0x72, 0x6b]; // "MTrk"
    const trackLength = writeUint32BE(track.length);

    chunks.push(
      ...trackChunkType,
      ...trackLength,
      ...Array.from(track)
    );
  }

  return new Uint8Array(chunks);
}
