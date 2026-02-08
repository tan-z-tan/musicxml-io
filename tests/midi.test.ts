import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { parse } from '../src/importers';
import { exportMidi } from '../src/exporters';
import { parseFile, serializeToFile } from '../src/file';

const fixturesPath = join(__dirname, 'fixtures');
const tempPath = join(__dirname, 'temp');

describe('MIDI Exporter', () => {
  const cleanupFiles: string[] = [];

  afterEach(() => {
    for (const file of cleanupFiles) {
      if (existsSync(file)) {
        unlinkSync(file);
      }
    }
    cleanupFiles.length = 0;
  });

  describe('exportMidi', () => {
    it('should export a single note to MIDI', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      const midiData = exportMidi(score);

      // Check MIDI header
      expect(midiData[0]).toBe(0x4d); // 'M'
      expect(midiData[1]).toBe(0x54); // 'T'
      expect(midiData[2]).toBe(0x68); // 'h'
      expect(midiData[3]).toBe(0x64); // 'd'

      // Format type should be 1
      expect(midiData[8]).toBe(0x00);
      expect(midiData[9]).toBe(0x01);

      // Should have at least 2 tracks (conductor + 1 part)
      const numTracks = (midiData[10] << 8) | midiData[11];
      expect(numTracks).toBeGreaterThanOrEqual(2);
    });

    it('should export a scale to MIDI', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/scale.xml'), 'utf-8');
      const score = parse(xml);

      const midiData = exportMidi(score);

      // Verify MIDI header
      expect(midiData[0]).toBe(0x4d);
      expect(midiData[1]).toBe(0x54);
      expect(midiData[2]).toBe(0x68);
      expect(midiData[3]).toBe(0x64);

      // Should be larger than single note (more events)
      expect(midiData.length).toBeGreaterThan(50);
    });

    it('should export a chord to MIDI', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/chord.xml'), 'utf-8');
      const score = parse(xml);

      const midiData = exportMidi(score);

      // Verify MIDI header
      expect(midiData.slice(0, 4)).toEqual(new Uint8Array([0x4d, 0x54, 0x68, 0x64]));
    });

    it('should respect custom options', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      const midiData = exportMidi(score, {
        ticksPerQuarterNote: 960,
        defaultTempo: 140,
        defaultVelocity: 100,
      });

      // Check division (ticks per quarter note)
      const division = (midiData[12] << 8) | midiData[13];
      expect(division).toBe(960);
    });
  });

  describe('serializeToFile with MIDI', () => {
    it('should write .mid file', async () => {
      const sourcePath = join(fixturesPath, 'basic/scale.xml');
      const score = await parseFile(sourcePath);

      const outputPath = join(tempPath, 'test-output.mid');
      cleanupFiles.push(outputPath);

      await serializeToFile(score, outputPath);

      expect(existsSync(outputPath)).toBe(true);

      const content = readFileSync(outputPath);
      // Verify MIDI header
      expect(content[0]).toBe(0x4d);
      expect(content[1]).toBe(0x54);
      expect(content[2]).toBe(0x68);
      expect(content[3]).toBe(0x64);
    });

    it('should write .midi file', async () => {
      const sourcePath = join(fixturesPath, 'basic/single-note.xml');
      const score = await parseFile(sourcePath);

      const outputPath = join(tempPath, 'test-output.midi');
      cleanupFiles.push(outputPath);

      await serializeToFile(score, outputPath);

      expect(existsSync(outputPath)).toBe(true);
    });
  });

  describe('MIDI note conversion', () => {
    it('should correctly convert C4 to MIDI note 60', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/single-note.xml'), 'utf-8');
      const score = parse(xml);

      // Verify the note is C4
      const note = score.parts[0].measures[0].entries[0];
      if (note.type === 'note') {
        expect(note.pitch?.step).toBe('C');
        expect(note.pitch?.octave).toBe(4);
      }

      const midiData = exportMidi(score);

      // Find note-on event (0x90 + channel)
      let foundNoteOn = false;
      for (let i = 0; i < midiData.length - 2; i++) {
        if ((midiData[i] & 0xf0) === 0x90) {
          const noteNumber = midiData[i + 1];
          // C4 should be MIDI note 60
          expect(noteNumber).toBe(60);
          foundNoteOn = true;
          break;
        }
      }
      expect(foundNoteOn).toBe(true);
    });
  });

  describe('transposing instruments', () => {
    it('should apply transposition for Bb trumpet (chromatic -2)', () => {
      const xml = readFileSync(join(fixturesPath, 'lilypond/xmlFiles/72a-TransposingInstruments.xml'), 'utf-8');
      const score = parse(xml);

      // Verify the first part has transpose info
      expect(score.parts[0].measures[0].attributes?.transpose?.chromatic).toBe(-2);

      const midiData = exportMidi(score);

      // Find note-on events for first track (channel 0)
      // Skip header and conductor track to find the first part's track
      const noteOns: number[] = [];
      for (let i = 0; i < midiData.length - 2; i++) {
        // Note-on on channel 0
        if (midiData[i] === 0x90) {
          const noteNumber = midiData[i + 1];
          const velocity = midiData[i + 2];
          if (velocity > 0) {
            noteOns.push(noteNumber);
          }
        }
      }

      // Written D4 (62) transposed down by 2 should be C4 (60)
      // Written E4 (64) transposed down by 2 should be D4 (62)
      // Written F#4 (66) transposed down by 2 should be E4 (64)
      // Written G4 (67) transposed down by 2 should be F4 (65)
      expect(noteOns[0]).toBe(60); // D4 - 2 = C4
      expect(noteOns[1]).toBe(62); // E4 - 2 = D4
      expect(noteOns[2]).toBe(64); // F#4 - 2 = E4
      expect(noteOns[3]).toBe(65); // G4 - 2 = F4
    });
  });

  describe('tie handling', () => {
    /**
     * Parse MIDI note events from the first part track (second track in file).
     * Returns arrays of note-on and note-off events with tick positions.
     */
    function parseMidiNoteEvents(midiData: Uint8Array): {
      noteOns: { tick: number; note: number; velocity: number }[];
      noteOffs: { tick: number; note: number }[];
    } {
      const noteOns: { tick: number; note: number; velocity: number }[] = [];
      const noteOffs: { tick: number; note: number }[] = [];

      // Skip header (14 bytes) and find the second track (first part track)
      let i = 14;
      let trackCount = 0;

      while (i < midiData.length && trackCount < 2) {
        if (midiData[i] === 0x4d && midiData[i+1] === 0x54 &&
            midiData[i+2] === 0x72 && midiData[i+3] === 0x6b) {
          const trackLength = (midiData[i+4] << 24) | (midiData[i+5] << 16) |
                              (midiData[i+6] << 8) | midiData[i+7];

          if (trackCount === 1) {
            let pos = i + 8;
            const trackEnd = pos + trackLength;
            let currentTick = 0;

            while (pos < trackEnd) {
              // Read variable-length delta time
              let delta = 0;
              let byte = midiData[pos++];
              delta = byte & 0x7f;
              while (byte & 0x80) {
                byte = midiData[pos++];
                delta = (delta << 7) | (byte & 0x7f);
              }
              currentTick += delta;

              const status = midiData[pos];
              if ((status & 0xf0) === 0x90) {
                noteOns.push({ tick: currentTick, note: midiData[pos + 1], velocity: midiData[pos + 2] });
                pos += 3;
              } else if ((status & 0xf0) === 0x80) {
                noteOffs.push({ tick: currentTick, note: midiData[pos + 1] });
                pos += 3;
              } else if ((status & 0xf0) === 0xc0) {
                pos += 2;
              } else if (status === 0xff) {
                let metaLenPos = pos + 2;
                byte = midiData[metaLenPos++];
                let metaLen = byte & 0x7f;
                while (byte & 0x80) {
                  byte = midiData[metaLenPos++];
                  metaLen = (metaLen << 7) | (byte & 0x7f);
                }
                pos = metaLenPos + metaLen;
              } else {
                pos++;
              }
            }
          }

          i += 8 + trackLength;
          trackCount++;
        } else {
          i++;
        }
      }

      return { noteOns, noteOffs };
    }

    it('should not play tied notes twice', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/tied-notes.xml'), 'utf-8');
      const score = parse(xml);

      const midiData = exportMidi(score);
      const { noteOns, noteOffs } = parseMidiNoteEvents(midiData);

      // E4 (MIDI 64) is tied across measures 1-2
      // It should have only ONE note-on and ONE note-off
      const e4NoteOns = noteOns.filter(e => e.note === 64);
      const e4NoteOffs = noteOffs.filter(e => e.note === 64);

      expect(e4NoteOns).toHaveLength(1);
      expect(e4NoteOffs).toHaveLength(1);

      // C4 (MIDI 60) is untied - should have exactly one on/off pair
      const c4NoteOns = noteOns.filter(e => e.note === 60);
      const c4NoteOffs = noteOffs.filter(e => e.note === 60);

      expect(c4NoteOns).toHaveLength(1);
      expect(c4NoteOffs).toHaveLength(1);
    });

    it('should produce correct duration for tied notes', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/tied-notes.xml'), 'utf-8');
      const score = parse(xml);

      // divisions=1, so half note = 2 divisions, whole = 4 divisions
      // With 480 ticks per quarter: half = 960 ticks, whole = 1920 ticks
      const midiData = exportMidi(score);
      const { noteOns, noteOffs } = parseMidiNoteEvents(midiData);

      // E4 tied: half (960 ticks) + whole (1920 ticks) = 2880 ticks total
      const e4On = noteOns.find(e => e.note === 64)!;
      const e4Off = noteOffs.find(e => e.note === 64)!;

      expect(e4On.tick).toBe(960); // Starts at beat 3 of measure 1
      expect(e4Off.tick).toBe(960 + 960 + 1920); // Half + whole = 2880 ticks from start
      expect(e4Off.tick - e4On.tick).toBe(2880); // Total tied duration
    });

    it('should handle tie chains across multiple measures', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/tied-notes-chain.xml'), 'utf-8');
      const score = parse(xml);

      const midiData = exportMidi(score);
      const { noteOns, noteOffs } = parseMidiNoteEvents(midiData);

      // C4 (MIDI 60) tied across 3 measures: whole + whole + whole
      // Should produce exactly ONE note-on and ONE note-off
      const c4NoteOns = noteOns.filter(e => e.note === 60);
      const c4NoteOffs = noteOffs.filter(e => e.note === 60);

      expect(c4NoteOns).toHaveLength(1);
      expect(c4NoteOffs).toHaveLength(1);

      // Total duration: 3 whole notes = 3 * 1920 = 5760 ticks
      expect(c4NoteOns[0].tick).toBe(0);
      expect(c4NoteOffs[0].tick).toBe(5760);
    });

    it('should handle chord with partial ties (only some notes tied)', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/chord-partial-tie.xml'), 'utf-8');
      const score = parse(xml);

      const midiData = exportMidi(score);
      const { noteOns, noteOffs } = parseMidiNoteEvents(midiData);

      // Measure 1: C4-E4-G4 chord (whole), E4 tied to measure 2
      // Measure 2: E4 half (tie-stop), then D4-F4-A4 chord (half)

      // C4 (60): one on/off (untied, whole in m1)
      expect(noteOns.filter(e => e.note === 60)).toHaveLength(1);
      expect(noteOffs.filter(e => e.note === 60)).toHaveLength(1);

      // G4 (67): one on/off (untied, whole in m1)
      expect(noteOns.filter(e => e.note === 67)).toHaveLength(1);
      expect(noteOffs.filter(e => e.note === 67)).toHaveLength(1);

      // E4 (64): ONE on/off (tied across measures)
      const e4Ons = noteOns.filter(e => e.note === 64);
      const e4Offs = noteOffs.filter(e => e.note === 64);
      expect(e4Ons).toHaveLength(1);
      expect(e4Offs).toHaveLength(1);

      // E4 duration: whole (1920) + half (960) = 2880 ticks
      expect(e4Offs[0].tick - e4Ons[0].tick).toBe(2880);

      // D4 (62), F4 (65), A4 (69): each one on/off (untied in m2)
      expect(noteOns.filter(e => e.note === 62)).toHaveLength(1);
      expect(noteOns.filter(e => e.note === 65)).toHaveLength(1);
      expect(noteOns.filter(e => e.note === 69)).toHaveLength(1);
    });

    it('should handle chord with all notes tied', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/chord-all-tied.xml'), 'utf-8');
      const score = parse(xml);

      const midiData = exportMidi(score);
      const { noteOns, noteOffs } = parseMidiNoteEvents(midiData);

      // C4-E4-G4 chord tied across 2 measures
      // Each note should have exactly ONE note-on and ONE note-off
      for (const midiNote of [60, 64, 67]) {
        const ons = noteOns.filter(e => e.note === midiNote);
        const offs = noteOffs.filter(e => e.note === midiNote);
        expect(ons).toHaveLength(1);
        expect(offs).toHaveLength(1);

        // Duration: whole + whole = 1920 + 1920 = 3840 ticks
        expect(ons[0].tick).toBe(0);
        expect(offs[0].tick).toBe(3840);
      }
    });

    it('should handle ties in multi-voice passages with backup', () => {
      const xml = readFileSync(join(fixturesPath, 'basic/multivoice-tie.xml'), 'utf-8');
      const score = parse(xml);

      const midiData = exportMidi(score);
      const { noteOns, noteOffs } = parseMidiNoteEvents(midiData);

      // Voice 1: E4 half (tied) + G4 half | E4 half (tie-stop) + A4 half
      // Voice 2: C4 whole                 | D4 whole

      // E4 (64): tied across measures - ONE note-on, ONE note-off
      const e4Ons = noteOns.filter(e => e.note === 64);
      const e4Offs = noteOffs.filter(e => e.note === 64);
      expect(e4Ons).toHaveLength(1);
      expect(e4Offs).toHaveLength(1);
      // E4: starts at tick 0, sustains through tie across measure boundary
      // Half note ends at tick 960, but note-off is suppressed (tie-start)
      // Measure 2 E4 half (tie-stop) ends at tick 1920 + 960 = 2880
      expect(e4Ons[0].tick).toBe(0);
      expect(e4Offs[0].tick).toBe(2880);

      // G4 (67): normal note in voice 1, measure 1 beat 3
      expect(noteOns.filter(e => e.note === 67)).toHaveLength(1);

      // C4 (60): voice 2, measure 1 whole
      expect(noteOns.filter(e => e.note === 60)).toHaveLength(1);

      // A4 (69): voice 1, measure 2 beat 3
      expect(noteOns.filter(e => e.note === 69)).toHaveLength(1);

      // D4 (62): voice 2, measure 2 whole
      expect(noteOns.filter(e => e.note === 62)).toHaveLength(1);
    });

    it('should produce note-off for every note-on (no hanging notes from unterminated ties)', () => {
      const xml = readFileSync(join(fixturesPath, 'lilypond/xmlFiles/33i-Ties-NotEnded.xml'), 'utf-8');
      const score = parse(xml);

      const midiData = exportMidi(score);
      const { noteOns, noteOffs } = parseMidiNoteEvents(midiData);

      // Every note-on should have a matching note-off (no hanging notes)
      const onCounts = new Map<number, number>();
      const offCounts = new Map<number, number>();
      for (const e of noteOns) {
        onCounts.set(e.note, (onCounts.get(e.note) ?? 0) + 1);
      }
      for (const e of noteOffs) {
        offCounts.set(e.note, (offCounts.get(e.note) ?? 0) + 1);
      }

      for (const [note, count] of onCounts) {
        const offCount = offCounts.get(note) ?? 0;
        expect(offCount).toBeGreaterThanOrEqual(count);
      }
    });
  });

  describe('anacrusis (pickup measure)', () => {
    it('should handle pickup measures correctly', () => {
      const xml = readFileSync(join(fixturesPath, 'musicxml_samples/MozartTrio.musicxml'), 'utf-8');
      const score = parse(xml);

      // Verify first measure is implicit (anacrusis)
      expect(score.parts[0].measures[0].implicit).toBe(true);

      const midiData = exportMidi(score);

      // Find note-on events for first track (channel 0 - the clarinet)
      const noteOns: { tick: number; note: number }[] = [];
      let currentTick = 0;

      // Skip header (14 bytes for MThd chunk) and find track data
      let i = 14;
      let trackCount = 0;

      while (i < midiData.length && trackCount < 2) {
        // Look for MTrk header
        if (midiData[i] === 0x4d && midiData[i+1] === 0x54 &&
            midiData[i+2] === 0x72 && midiData[i+3] === 0x6b) {
          const trackLength = (midiData[i+4] << 24) | (midiData[i+5] << 16) |
                              (midiData[i+6] << 8) | midiData[i+7];

          if (trackCount === 1) {
            // This is the first part track
            let pos = i + 8;
            const trackEnd = pos + trackLength;
            currentTick = 0;

            while (pos < trackEnd) {
              // Read variable-length delta time
              let delta = 0;
              let byte = midiData[pos++];
              delta = byte & 0x7f;
              while (byte & 0x80) {
                byte = midiData[pos++];
                delta = (delta << 7) | (byte & 0x7f);
              }
              currentTick += delta;

              // Read event
              const status = midiData[pos];
              if ((status & 0xf0) === 0x90) {
                // Note-on
                const note = midiData[pos + 1];
                const velocity = midiData[pos + 2];
                if (velocity > 0) {
                  noteOns.push({ tick: currentTick, note });
                }
                pos += 3;
              } else if ((status & 0xf0) === 0x80) {
                // Note-off
                pos += 3;
              } else if ((status & 0xf0) === 0xc0) {
                // Program change
                pos += 2;
              } else if (status === 0xff) {
                // Meta event
                const metaType = midiData[pos + 1];
                let metaLen = 0;
                let metaLenPos = pos + 2;
                byte = midiData[metaLenPos++];
                metaLen = byte & 0x7f;
                while (byte & 0x80) {
                  byte = midiData[metaLenPos++];
                  metaLen = (metaLen << 7) | (byte & 0x7f);
                }
                pos = metaLenPos + metaLen;
              } else {
                pos++;
              }
            }
          }

          i += 8 + trackLength;
          trackCount++;
        } else {
          i++;
        }
      }

      // The first two notes in the anacrusis should start at tick 0
      // and their combined duration should be less than a full 3/4 measure
      // With 480 ticks per quarter note and 3/4 time, full measure = 1440 ticks
      // The anacrusis has 2 eighth notes (3+3 duration = 6 in divisions=6 = 1 quarter = 480 ticks)
      expect(noteOns.length).toBeGreaterThan(0);
      expect(noteOns[0].tick).toBe(0);

      // The third note should start after the anacrusis (480 ticks, not 1440)
      // This ensures anacrusis timing is correct
      if (noteOns.length >= 3) {
        // After anacrusis (480 ticks for 2 eighth notes), measure 1 starts
        expect(noteOns[2].tick).toBe(480);
      }
    });
  });
});
