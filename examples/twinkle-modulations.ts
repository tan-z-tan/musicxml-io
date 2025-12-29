/**
 * Twinkle Twinkle Little Star - Modulating Journey
 *
 * A simple demo: the melody travels through different keys
 * C major → G major → D major → A major → back to C
 *
 * Run: npx tsx examples/twinkle-modulations.ts
 */

import { parse, serialize, exportMidi } from '../src';
import { transpose, changeKey, addDynamics, addArticulation } from '../src/operations';
import { writeFileSync } from 'fs';

// Twinkle Twinkle (first phrase only: C C G G A A G | F F E E D D C)
const baseMelody = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <work><work-title>Twinkle Twinkle - Modulating Journey</work-title></work>
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
    </measure>
    <measure number="2">
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>half</type></note>
    </measure>
    <measure number="3">
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
    </measure>
    <measure number="4">
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;

// Modulation plan: key (fifths), semitones from C, dynamics, articulation
const modulations = [
  { key: 0, semitones: 0, dynamics: 'mp', articulation: null, label: 'C major' },
  { key: 1, semitones: 7, dynamics: 'mf', articulation: 'staccato', label: 'G major' },
  { key: 2, semitones: 2, dynamics: 'f', articulation: 'accent', label: 'D major' },
  { key: 3, semitones: 9, dynamics: 'ff', articulation: 'marcato', label: 'A major' },
  { key: 0, semitones: 0, dynamics: 'p', articulation: null, label: 'C major (return)' },
];

console.log('🎵 Twinkle Twinkle - Modulating Journey\n');

// Build the full score by combining transposed versions
let fullScore = parse(baseMelody);
let measureOffset = 0;

for (let i = 0; i < modulations.length; i++) {
  const mod = modulations[i];
  console.log(`  Section ${i + 1}: ${mod.label} (${mod.dynamics}${mod.articulation ? ', ' + mod.articulation : ''})`);

  // Parse fresh copy and transpose
  let section = parse(baseMelody);

  // Transpose
  if (mod.semitones !== 0) {
    const result = transpose(section, mod.semitones);
    if (result.success) section = result.data;
  }

  // Change key signature
  section = changeKey(section, { fifths: mod.key }, { fromMeasure: 1 });

  // Add dynamics at start
  const dynResult = addDynamics(section, {
    partIndex: 0,
    measureIndex: 0,
    position: 0,
    dynamics: mod.dynamics as 'mp' | 'mf' | 'f' | 'ff' | 'p',
  });
  if (dynResult.success) section = dynResult.data;

  // Add articulation to first note if specified
  if (mod.articulation) {
    const artResult = addArticulation(section, {
      partIndex: 0,
      measureIndex: 0,
      noteIndex: 0,
      articulation: mod.articulation as 'staccato' | 'accent' | 'marcato',
    });
    if (artResult.success) section = artResult.data;
  }

  // Append measures to fullScore (skip first section, it's already there)
  if (i === 0) {
    fullScore = section;
    measureOffset = 4;
  } else {
    // Renumber and append measures
    for (const measure of section.parts[0].measures) {
      const newMeasure = {
        ...measure,
        number: String(measureOffset + parseInt(measure.number)),
      };
      fullScore.parts[0].measures.push(newMeasure);
    }
    measureOffset += 4;
  }
}

// Export
const xml = serialize(fullScore);
writeFileSync('examples/output/twinkle-modulations.xml', xml);

const midi = exportMidi(fullScore, { defaultTempo: 100 });
writeFileSync('examples/output/twinkle-modulations.mid', midi);

console.log(`
✅ Generated:
   - examples/output/twinkle-modulations.xml (${modulations.length * 4} measures)
   - examples/output/twinkle-modulations.mid

🎹 The melody modulates: C → G → D → A → C
   Each section has different dynamics and articulations!
`);
