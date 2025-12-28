/**
 * MusicXML-IO Demo: Musical Manipulation Showcase
 *
 * This demo creates "Twinkle Twinkle Little Star" and applies various
 * musical transformations to demonstrate the library's capabilities.
 *
 * Run with: npx tsx examples/music-manipulation-demo.ts
 */

import { parse, serialize, exportMidi, getAllNotes, countNotes } from '../src';
import {
  transpose,
  addDynamics,
  addArticulation,
  addTempo,
  addSlur,
  addFermata,
} from '../src/operations';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Step 1: Create "Twinkle Twinkle Little Star" as MusicXML
// ============================================================================

const twinkleTwinkle = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <work>
    <work-title>Twinkle Twinkle Little Star</work-title>
  </work>
  <identification>
    <creator type="composer">Traditional</creator>
    <encoding>
      <software>musicxml-io demo</software>
      <encoding-date>2024-01-01</encoding-date>
    </encoding>
  </identification>
  <part-list>
    <score-part id="P1">
      <part-name>Piano</part-name>
      <midi-instrument id="P1-I1">
        <midi-channel>1</midi-channel>
        <midi-program>1</midi-program>
      </midi-instrument>
    </score-part>
  </part-list>
  <part id="P1">
    <!-- Measure 1: C C G G -->
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <key><fifths>0</fifths><mode>major</mode></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1</duration><voice>1</voice><type>quarter</type>
      </note>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1</duration><voice>1</voice><type>quarter</type>
      </note>
      <note>
        <pitch><step>G</step><octave>4</octave></pitch>
        <duration>1</duration><voice>1</voice><type>quarter</type>
      </note>
      <note>
        <pitch><step>G</step><octave>4</octave></pitch>
        <duration>1</duration><voice>1</voice><type>quarter</type>
      </note>
    </measure>
    <!-- Measure 2: A A G- (half note) -->
    <measure number="2">
      <note>
        <pitch><step>A</step><octave>4</octave></pitch>
        <duration>1</duration><voice>1</voice><type>quarter</type>
      </note>
      <note>
        <pitch><step>A</step><octave>4</octave></pitch>
        <duration>1</duration><voice>1</voice><type>quarter</type>
      </note>
      <note>
        <pitch><step>G</step><octave>4</octave></pitch>
        <duration>2</duration><voice>1</voice><type>half</type>
      </note>
    </measure>
    <!-- Measure 3: F F E E -->
    <measure number="3">
      <note>
        <pitch><step>F</step><octave>4</octave></pitch>
        <duration>1</duration><voice>1</voice><type>quarter</type>
      </note>
      <note>
        <pitch><step>F</step><octave>4</octave></pitch>
        <duration>1</duration><voice>1</voice><type>quarter</type>
      </note>
      <note>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>1</duration><voice>1</voice><type>quarter</type>
      </note>
      <note>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>1</duration><voice>1</voice><type>quarter</type>
      </note>
    </measure>
    <!-- Measure 4: D D C- (half note) -->
    <measure number="4">
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>1</duration><voice>1</voice><type>quarter</type>
      </note>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>1</duration><voice>1</voice><type>quarter</type>
      </note>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>2</duration><voice>1</voice><type>half</type>
      </note>
    </measure>
    <!-- Measure 5: G G F F -->
    <measure number="5">
      <note>
        <pitch><step>G</step><octave>4</octave></pitch>
        <duration>1</duration><voice>1</voice><type>quarter</type>
      </note>
      <note>
        <pitch><step>G</step><octave>4</octave></pitch>
        <duration>1</duration><voice>1</voice><type>quarter</type>
      </note>
      <note>
        <pitch><step>F</step><octave>4</octave></pitch>
        <duration>1</duration><voice>1</voice><type>quarter</type>
      </note>
      <note>
        <pitch><step>F</step><octave>4</octave></pitch>
        <duration>1</duration><voice>1</voice><type>quarter</type>
      </note>
    </measure>
    <!-- Measure 6: E E D- (half note) -->
    <measure number="6">
      <note>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>1</duration><voice>1</voice><type>quarter</type>
      </note>
      <note>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>1</duration><voice>1</voice><type>quarter</type>
      </note>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>2</duration><voice>1</voice><type>half</type>
      </note>
    </measure>
    <!-- Measure 7: G G F F -->
    <measure number="7">
      <note>
        <pitch><step>G</step><octave>4</octave></pitch>
        <duration>1</duration><voice>1</voice><type>quarter</type>
      </note>
      <note>
        <pitch><step>G</step><octave>4</octave></pitch>
        <duration>1</duration><voice>1</voice><type>quarter</type>
      </note>
      <note>
        <pitch><step>F</step><octave>4</octave></pitch>
        <duration>1</duration><voice>1</voice><type>quarter</type>
      </note>
      <note>
        <pitch><step>F</step><octave>4</octave></pitch>
        <duration>1</duration><voice>1</voice><type>quarter</type>
      </note>
    </measure>
    <!-- Measure 8: E E D- (half note) -->
    <measure number="8">
      <note>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>1</duration><voice>1</voice><type>quarter</type>
      </note>
      <note>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>1</duration><voice>1</voice><type>quarter</type>
      </note>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>2</duration><voice>1</voice><type>half</type>
      </note>
    </measure>
    <!-- Measure 9: C C G G -->
    <measure number="9">
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1</duration><voice>1</voice><type>quarter</type>
      </note>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1</duration><voice>1</voice><type>quarter</type>
      </note>
      <note>
        <pitch><step>G</step><octave>4</octave></pitch>
        <duration>1</duration><voice>1</voice><type>quarter</type>
      </note>
      <note>
        <pitch><step>G</step><octave>4</octave></pitch>
        <duration>1</duration><voice>1</voice><type>quarter</type>
      </note>
    </measure>
    <!-- Measure 10: A A G- (half note) -->
    <measure number="10">
      <note>
        <pitch><step>A</step><octave>4</octave></pitch>
        <duration>1</duration><voice>1</voice><type>quarter</type>
      </note>
      <note>
        <pitch><step>A</step><octave>4</octave></pitch>
        <duration>1</duration><voice>1</voice><type>quarter</type>
      </note>
      <note>
        <pitch><step>G</step><octave>4</octave></pitch>
        <duration>2</duration><voice>1</voice><type>half</type>
      </note>
    </measure>
    <!-- Measure 11: F F E E -->
    <measure number="11">
      <note>
        <pitch><step>F</step><octave>4</octave></pitch>
        <duration>1</duration><voice>1</voice><type>quarter</type>
      </note>
      <note>
        <pitch><step>F</step><octave>4</octave></pitch>
        <duration>1</duration><voice>1</voice><type>quarter</type>
      </note>
      <note>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>1</duration><voice>1</voice><type>quarter</type>
      </note>
      <note>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>1</duration><voice>1</voice><type>quarter</type>
      </note>
    </measure>
    <!-- Measure 12: D D C- (whole note with fermata) -->
    <measure number="12">
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>1</duration><voice>1</voice><type>quarter</type>
      </note>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>1</duration><voice>1</voice><type>quarter</type>
      </note>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>2</duration><voice>1</voice><type>half</type>
      </note>
      <barline location="right">
        <bar-style>light-heavy</bar-style>
      </barline>
    </measure>
  </part>
</score-partwise>`;

// ============================================================================
// Helper: Print score info
// ============================================================================

function printScoreInfo(label: string, score: ReturnType<typeof parse>) {
  const notes = getAllNotes(score);
  const noteCount = countNotes(score);
  console.log(`\n${'='.repeat(60)}`);
  console.log(`${label}`);
  console.log('='.repeat(60));
  console.log(`Title: ${score.metadata?.workTitle ?? 'Untitled'}`);
  console.log(`Measures: ${score.parts[0].measures.length}`);
  console.log(`Total notes: ${noteCount}`);

  // Show first few notes with pitches
  const firstNotes = notes.slice(0, 8);
  const pitchStr = firstNotes
    .map((item) => {
      const n = item.note;
      if (n.pitch) {
        const alter = n.pitch.alter ? (n.pitch.alter > 0 ? '#' : 'b') : '';
        return `${n.pitch.step}${alter}${n.pitch.octave}`;
      }
      return 'rest';
    })
    .join(' ');
  console.log(`First notes: ${pitchStr}...`);
}

// ============================================================================
// Main Demo
// ============================================================================

async function main() {
  console.log('\n');
  console.log('*'.repeat(60));
  console.log('*   MusicXML-IO: Musical Manipulation Demo                 *');
  console.log('*'.repeat(60));

  // Create output directory
  const outputDir = path.join(__dirname, 'output');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Step 1: Parse the original song
  console.log('\n[Step 1] Parsing original "Twinkle Twinkle Little Star"...');
  let score = parse(twinkleTwinkle);
  printScoreInfo('Original Score', score);

  // Save original
  const originalXml = serialize(score);
  fs.writeFileSync(path.join(outputDir, '01-original.xml'), originalXml);
  console.log('  -> Saved: output/01-original.xml');

  // Step 2: Add tempo marking
  console.log('\n[Step 2] Adding tempo marking (Allegretto, 108 BPM)...');
  const tempoResult = addTempo(score, {
    partIndex: 0,
    measureIndex: 0,
    position: 0,
    tempo: 108,
    text: 'Allegretto',
  });
  if (tempoResult.success) {
    score = tempoResult.data;
    console.log('  -> Added tempo: Allegretto (quarter = 108)');
  }

  // Step 3: Add dynamics
  console.log('\n[Step 3] Adding dynamics (mf at start, f at measure 5, p at measure 9)...');

  // Add mf at the beginning
  let dynResult = addDynamics(score, {
    partIndex: 0,
    measureIndex: 0,
    position: 0,
    dynamics: 'mf',
  });
  if (dynResult.success) {
    score = dynResult.data;
    console.log('  -> Added mf at measure 1');
  }

  // Add f at measure 5
  dynResult = addDynamics(score, {
    partIndex: 0,
    measureIndex: 4, // 0-indexed
    position: 0,
    dynamics: 'f',
  });
  if (dynResult.success) {
    score = dynResult.data;
    console.log('  -> Added f at measure 5');
  }

  // Add p at measure 9
  dynResult = addDynamics(score, {
    partIndex: 0,
    measureIndex: 8,
    position: 0,
    dynamics: 'p',
  });
  if (dynResult.success) {
    score = dynResult.data;
    console.log('  -> Added p at measure 9');
  }

  // Save with dynamics
  const dynamicsXml = serialize(score);
  fs.writeFileSync(path.join(outputDir, '02-with-dynamics.xml'), dynamicsXml);
  console.log('  -> Saved: output/02-with-dynamics.xml');

  // Step 4: Add articulations (staccato on some notes)
  console.log('\n[Step 4] Adding articulations (staccato on first beat of each phrase)...');

  // Add staccato to first notes of measures 1, 5, 9
  for (const measureIdx of [0, 4, 8]) {
    const artResult = addArticulation(score, {
      partIndex: 0,
      measureIndex: measureIdx,
      noteIndex: 0,
      articulation: 'staccato',
    });
    if (artResult.success) {
      score = artResult.data;
    }
  }
  console.log('  -> Added staccato to measure 1, 5, 9 (first beats)');

  // Step 5: Add slurs for phrasing
  console.log('\n[Step 5] Adding slurs for phrasing...');

  // Slur over measures 1-2 (first phrase)
  let slurResult = addSlur(score, {
    partIndex: 0,
    startMeasureIndex: 0,
    startNoteIndex: 0,
    endMeasureIndex: 1,
    endNoteIndex: 2, // The half note G
  });
  if (slurResult.success) {
    score = slurResult.data;
    console.log('  -> Added slur: measures 1-2');
  }

  // Slur over measures 3-4
  slurResult = addSlur(score, {
    partIndex: 0,
    startMeasureIndex: 2,
    startNoteIndex: 0,
    endMeasureIndex: 3,
    endNoteIndex: 2,
  });
  if (slurResult.success) {
    score = slurResult.data;
    console.log('  -> Added slur: measures 3-4');
  }

  // Save with articulations and slurs
  const articulatedXml = serialize(score);
  fs.writeFileSync(path.join(outputDir, '03-with-articulations.xml'), articulatedXml);
  console.log('  -> Saved: output/03-with-articulations.xml');

  // Step 6: Add fermata to the final note
  console.log('\n[Step 6] Adding fermata to final note...');
  const fermataResult = addFermata(score, {
    partIndex: 0,
    measureIndex: 11, // Last measure (0-indexed)
    noteIndex: 2, // The final C half note
  });
  if (fermataResult.success) {
    score = fermataResult.data;
    console.log('  -> Added fermata to final C');
  }

  // Save complete version
  const completeXml = serialize(score);
  fs.writeFileSync(path.join(outputDir, '04-complete.xml'), completeXml);
  console.log('  -> Saved: output/04-complete.xml');

  // Step 7: Create transposed versions
  console.log('\n[Step 7] Creating transposed versions...');

  // Transpose up a major 3rd (4 semitones) -> E major
  const transposedUpResult = transpose(score, 4);
  if (!transposedUpResult.success) {
    console.error('  -> Transpose failed:', transposedUpResult.errors);
  } else {
    const transposedUp = transposedUpResult.data;
    const transposedUpXml = serialize(transposedUp);
    fs.writeFileSync(path.join(outputDir, '05-transposed-E-major.xml'), transposedUpXml);
    console.log('  -> Transposed +4 semitones (to E major)');
    printScoreInfo('Transposed to E Major', transposedUp);

    // Transposed MIDI (E major) - moved here to have access to transposedUp
    const transposedMidi = exportMidi(transposedUp, {
      ticksPerQuarterNote: 480,
      defaultTempo: 120,
      defaultVelocity: 90,
    });
    fs.writeFileSync(path.join(outputDir, '09-twinkle-E-major.mid'), transposedMidi);
  }

  // Transpose down a minor 3rd (-3 semitones) -> A major
  const transposedDownResult = transpose(score, -3);
  if (transposedDownResult.success) {
    const transposedDownXml = serialize(transposedDownResult.data);
    fs.writeFileSync(path.join(outputDir, '06-transposed-A-major.xml'), transposedDownXml);
    console.log('  -> Transposed -3 semitones (to A major)');
  }

  // Transpose up an octave (12 semitones)
  const octaveUpResult = transpose(score, 12);
  if (octaveUpResult.success) {
    const octaveUpXml = serialize(octaveUpResult.data);
    fs.writeFileSync(path.join(outputDir, '07-octave-higher.xml'), octaveUpXml);
    console.log('  -> Transposed +12 semitones (octave higher)');
  }

  // Step 8: Export to MIDI
  console.log('\n[Step 8] Exporting to MIDI files...');

  // Original MIDI
  const originalMidi = exportMidi(score, {
    ticksPerQuarterNote: 480,
    defaultTempo: 108,
    defaultVelocity: 80,
  });
  fs.writeFileSync(path.join(outputDir, '08-twinkle-original.mid'), originalMidi);
  console.log('  -> Saved: output/08-twinkle-original.mid (tempo=108 BPM)');
  console.log('  -> Saved: output/09-twinkle-E-major.mid (tempo=120 BPM)');

  // Slow tempo version
  const slowMidi = exportMidi(score, {
    ticksPerQuarterNote: 480,
    defaultTempo: 60,
    defaultVelocity: 64,
  });
  fs.writeFileSync(path.join(outputDir, '10-twinkle-lullaby.mid'), slowMidi);
  console.log('  -> Saved: output/10-twinkle-lullaby.mid (tempo=60 BPM, soft)');

  // Summary
  console.log('\n');
  console.log('*'.repeat(60));
  console.log('*   Demo Complete!                                         *');
  console.log('*'.repeat(60));
  console.log('\nGenerated files:');
  console.log('  MusicXML files:');
  console.log('    - 01-original.xml            (C major, no expressions)');
  console.log('    - 02-with-dynamics.xml       (with mf, f, p markings)');
  console.log('    - 03-with-articulations.xml  (staccato, slurs)');
  console.log('    - 04-complete.xml            (all expressions + fermata)');
  console.log('    - 05-transposed-E-major.xml  (up major 3rd)');
  console.log('    - 06-transposed-A-major.xml  (down minor 3rd)');
  console.log('    - 07-octave-higher.xml       (up one octave)');
  console.log('\n  MIDI files:');
  console.log('    - 08-twinkle-original.mid    (tempo=108, velocity=80)');
  console.log('    - 09-twinkle-E-major.mid     (transposed, tempo=120)');
  console.log('    - 10-twinkle-lullaby.mid     (slow lullaby, tempo=60)');
  console.log('\nOpen the MusicXML files in MuseScore, Finale, or Dorico to see the score!');
  console.log('Play the MIDI files in any media player to hear the music!\n');
}

main().catch(console.error);
