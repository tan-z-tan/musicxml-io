# musicxml-io

A TypeScript library for parsing, manipulating, and serializing MusicXML with high round-trip fidelity.

## Features

- Parse MusicXML (.xml) and compressed MusicXML (.mxl) files
- Serialize to MusicXML and compressed MusicXML formats
- Export to MIDI format
- Manipulate scores: transpose, add/delete notes, change key/time signatures
- Query scores: find notes, get measures, analyze structure
- Validate score consistency
- 99.6% round-trip fidelity

## Installation

```bash
npm install musicxml-io
```

## Quick Start

### Parse and Serialize

```typescript
import { parse, serialize } from 'musicxml-io';

// Parse MusicXML string
const score = parse(xmlString);

// Access score data
console.log(score.parts.length); // Number of parts
console.log(score.parts[0].measures.length); // Number of measures

// Serialize back to MusicXML
const outputXml = serialize(score);
```

### Parse from File (Node.js)

```typescript
import { parseFile, serializeToFile } from 'musicxml-io';

// Parse from file (auto-detects .xml or .mxl)
const score = await parseFile('song.xml');

// Save to file
await serializeToFile(score, 'output.xml');
await serializeToFile(score, 'output.mxl'); // Compressed format
```

### Work with Compressed MusicXML

```typescript
import { parseCompressed, serializeCompressed, isCompressed } from 'musicxml-io';

// Check if data is compressed MusicXML
if (isCompressed(buffer)) {
  const score = await parseCompressed(buffer);
}

// Or use parseAuto to auto-detect format
import { parseAuto } from 'musicxml-io';
const score = await parseAuto(data); // Works with both .xml and .mxl
```

### Transpose

```typescript
import { parse, serialize, transpose } from 'musicxml-io';

const score = parse(xmlString);

// Transpose up 2 semitones
const transposed = transpose(score, 2);

const outputXml = serialize(transposed);
```

### Add and Delete Notes

```typescript
import { addNote, deleteNote, addChordNote } from 'musicxml-io';

// Add a note
const updatedScore = addNote(score, {
  partIndex: 0,
  measureNumber: 1,
  pitch: { step: 'C', octave: 4 },
  duration: 4,
  type: 'quarter',
});

// Add a chord note (to an existing note)
const withChord = addChordNote(score, {
  partIndex: 0,
  measureNumber: 1,
  position: 0,
  pitch: { step: 'E', octave: 4 },
});

// Delete a note
const afterDelete = deleteNote(score, {
  partIndex: 0,
  measureNumber: 1,
  noteIndex: 0,
});
```

### Change Key and Time Signature

```typescript
import { changeKey, changeTime } from 'musicxml-io';

// Change to G major
const newKey = changeKey(score, { fifths: 1 }, 0, 1);

// Change to 3/4 time
const newTime = changeTime(score, { beats: 3, beatType: 4 }, 0, 1);
```

### Query Notes

```typescript
import { findNotes, getAllNotes, countNotes } from 'musicxml-io';

// Find all notes
const allNotes = getAllNotes(score);

// Find notes with filters
const filtered = findNotes(score, {
  pitchRange: { low: { step: 'C', octave: 4 }, high: { step: 'G', octave: 5 } },
  voice: '1',
  type: 'quarter',
});

// Count notes per part
const counts = countNotes(score);
```

### Export to MIDI

```typescript
import { exportMidi } from 'musicxml-io';

const midiBuffer = exportMidi(score, {
  tempo: 120,
});
```

### Validation

```typescript
import { validate, isValid, assertValid } from 'musicxml-io';

// Get validation errors
const result = validate(score);
if (!result.valid) {
  console.log(result.errors);
}

// Simple validity check
if (isValid(score)) {
  // Score is valid
}

// Throw on invalid
assertValid(score); // Throws ValidationException if invalid

// Validate during serialization
const xml = serialize(score, { validate: true });
```

## API Reference

### Importers

| Function | Description |
|----------|-------------|
| `parse(xml)` | Parse MusicXML string |
| `parseCompressed(buffer)` | Parse compressed MusicXML (.mxl) |
| `parseAuto(data)` | Auto-detect and parse either format |
| `isCompressed(buffer)` | Check if data is compressed MusicXML |

### Exporters

| Function | Description |
|----------|-------------|
| `serialize(score, options?)` | Serialize to MusicXML string |
| `serializeCompressed(score, options?)` | Serialize to compressed MusicXML |
| `exportMidi(score, options?)` | Export to MIDI buffer |

### File Operations (Node.js)

| Function | Description |
|----------|-------------|
| `parseFile(path)` | Read and parse MusicXML file |
| `serializeToFile(score, path, options?)` | Write score to file |
| `decodeBuffer(buffer)` | Decode buffer with encoding detection |

### Operations

| Function | Description |
|----------|-------------|
| `transpose(score, semitones)` | Transpose all pitches |
| `addNote(score, options)` | Add a note to a measure |
| `deleteNote(score, options)` | Delete a note from a measure |
| `addChordNote(score, options)` | Add a note to form a chord |
| `modifyNotePitch(score, options)` | Change a note's pitch |
| `modifyNoteDuration(score, options)` | Change a note's duration |
| `changeKey(score, key, partIndex, measureNumber)` | Change key signature |
| `changeTime(score, time, partIndex, measureNumber)` | Change time signature |
| `insertMeasure(score, partIndex, afterMeasure)` | Insert a new measure |
| `deleteMeasure(score, partIndex, measureNumber)` | Delete a measure |
| `setDivisions(score, divisions)` | Set divisions value |

### Query Functions

| Function | Description |
|----------|-------------|
| `getMeasure(part, measureNumber)` | Get measure by number |
| `getMeasureByIndex(part, index)` | Get measure by index |
| `getMeasureCount(part)` | Get total measure count |
| `getDivisions(part, measureNumber)` | Get divisions at measure |
| `getAttributesAtMeasure(part, measureNumber)` | Get attributes at measure |
| `findNotes(score, filter)` | Find notes matching criteria |
| `getDuration(note)` | Get note duration |
| `getPartById(score, id)` | Get part by ID |
| `getPartIndex(score, id)` | Get part index by ID |
| `hasMultipleStaves(part)` | Check if part has multiple staves |
| `getStaveCount(part)` | Get number of staves |

### Accessors

| Function | Description |
|----------|-------------|
| `getAllNotes(score)` | Get all notes in score |
| `iterateNotes(score)` | Iterator over all notes |
| `getNotesForVoice(measure, voice)` | Get notes for a voice |
| `getNotesForStaff(measure, staff)` | Get notes for a staff |
| `groupByVoice(measure)` | Group notes by voice |
| `groupByStaff(measure)` | Group notes by staff |
| `getChords(measure)` | Get chord groups |
| `getVoices(measure)` | Get all voice numbers |
| `getStaves(measure)` | Get all staff numbers |
| `hasNotes(measure)` | Check if measure has notes |
| `isRestMeasure(measure)` | Check if measure is all rests |
| `getAbsolutePosition(note, measure)` | Get absolute position |
| `withAbsolutePositions(notes, measure)` | Add positions to notes |
| `getNormalizedPosition(note, options)` | Get normalized position (0-1) |
| `getNormalizedDuration(note, options)` | Get normalized duration |

### Validation

| Function | Description |
|----------|-------------|
| `validate(score, options?)` | Validate score, return errors |
| `isValid(score)` | Check if score is valid |
| `assertValid(score)` | Throw if score is invalid |

### Utilities

| Export | Description |
|--------|-------------|
| `STEPS` | Array of step names: C, D, E, F, G, A, B |
| `STEP_SEMITONES` | Map of step to semitone offset |
| `pitchToSemitone(pitch)` | Convert pitch to semitone number |
| `getMeasureEndPosition(measure)` | Get end position of measure |

## Sub-module Imports

For tree-shaking or modular imports:

```typescript
// Import only accessors
import { getAllNotes, getChords } from 'musicxml-io/accessors';

// Import only operations
import { transpose, addNote } from 'musicxml-io/operations';

// Import only query functions
import { findNotes, getMeasure } from 'musicxml-io/query';
```

## Roundtrip Coverage

We measure implementation completeness by comparing original MusicXML files with their roundtrip output (parse → internal representation → serialize).

### Current Score: 99.6%

| Metric | Score |
|--------|------:|
| Overall | 99.6% |
| Node coverage | 99.9% |
| Attribute coverage | 95.9% |
| Text value coverage | 99.8% |

### Running Coverage Tests

```bash
# Get overall coverage score
npm run coverage:roundtrip

# Compare a specific file (string diff)
npm run diff:roundtrip -- path/to/file.xml
```

## License

MIT
