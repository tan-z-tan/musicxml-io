# musicxml-io

[![npm version](https://img.shields.io/npm/v/musicxml-io.svg)](https://www.npmjs.com/package/musicxml-io)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)

**Parse, manipulate, and serialize MusicXML with 99.6% round-trip fidelity.**

A TypeScript-first library for working with MusicXML files. Import scores from Finale, Sibelius, MuseScore, or any MusicXML-compatible software, transform them programmatically, and export back to MusicXML or MIDI.

## Why musicxml-io?

- **High Fidelity** - 99.6% round-trip accuracy. What you parse is what you get back.
- **Full Format Support** - Works with both `.xml` and compressed `.mxl` files
- **Type Safe** - Written in TypeScript with comprehensive type definitions
- **Batteries Included** - Transpose, add/delete notes, change keys, export to MIDI
- **Zero Config** - Just install and start using. No complex setup required.

## Installation

```bash
npm install musicxml-io
```

## Quick Start

```typescript
import { parse, serialize, transpose } from 'musicxml-io';

// Parse a MusicXML string
const score = parse(xmlString);

// Transpose up a major second (2 semitones)
const transposed = transpose(score, 2);

// Serialize back to MusicXML
const output = serialize(transposed);
```

## Examples

### Read and Write Files (Node.js)

```typescript
import { parseFile, serializeToFile } from 'musicxml-io';

const score = await parseFile('beethoven-sonata.mxl');
await serializeToFile(score, 'output.xml');
```

### Manipulate Notes

```typescript
import { addNote, deleteNote, changeKey, changeTime } from 'musicxml-io';

// Add a quarter note C4 to measure 1
const updated = addNote(score, {
  partIndex: 0,
  measureNumber: 1,
  pitch: { step: 'C', octave: 4 },
  duration: 4,
  type: 'quarter',
});

// Change to G major
const inGMajor = changeKey(score, { fifths: 1 }, 0, 1);

// Change to 3/4 time
const waltz = changeTime(score, { beats: 3, beatType: 4 }, 0, 1);
```

### Query and Analyze

```typescript
import { findNotes, getAllNotes, getMeasureCount } from 'musicxml-io';

// Get all notes in the score
const notes = getAllNotes(score);

// Find quarter notes in a specific pitch range
const filtered = findNotes(score, {
  pitchRange: { low: { step: 'C', octave: 4 }, high: { step: 'G', octave: 5 } },
  type: 'quarter',
});

// Get measure count
const measures = getMeasureCount(score.parts[0]);
```

### Export to MIDI

```typescript
import { exportMidi } from 'musicxml-io';

const midiBuffer = exportMidi(score, { tempo: 120 });
```

### Validate Scores

```typescript
import { validate, isValid } from 'musicxml-io';

if (!isValid(score)) {
  const { errors } = validate(score);
  console.log(errors);
}
```

## API Overview

### Parsing & Serialization

| Function | Description |
|----------|-------------|
| `parse(xml)` | Parse MusicXML string |
| `parseFile(path)` | Parse from file (Node.js) |
| `parseCompressed(buffer)` | Parse .mxl format |
| `parseAuto(data)` | Auto-detect format |
| `serialize(score)` | Convert to MusicXML string |
| `serializeToFile(score, path)` | Write to file (Node.js) |
| `serializeCompressed(score)` | Convert to .mxl format |
| `exportMidi(score)` | Export to MIDI |

### Score Operations

| Function | Description |
|----------|-------------|
| `transpose(score, semitones)` | Transpose all pitches |
| `addNote(score, options)` | Add a note |
| `deleteNote(score, options)` | Remove a note |
| `addChordNote(score, options)` | Add note to chord |
| `changeKey(score, key, ...)` | Change key signature |
| `changeTime(score, time, ...)` | Change time signature |
| `insertMeasure(score, ...)` | Insert new measure |
| `deleteMeasure(score, ...)` | Delete a measure |

### Query Functions

| Function | Description |
|----------|-------------|
| `getAllNotes(score)` | Get all notes |
| `findNotes(score, filter)` | Find notes by criteria |
| `getMeasure(part, number)` | Get specific measure |
| `getMeasureCount(part)` | Count measures |
| `getChords(measure)` | Get chord groups |
| `countNotes(score)` | Count notes per part |

### Validation

| Function | Description |
|----------|-------------|
| `validate(score)` | Get validation errors |
| `isValid(score)` | Check validity |
| `assertValid(score)` | Throw if invalid |

## Tree-Shaking Support

Import only what you need:

```typescript
import { transpose } from 'musicxml-io/operations';
import { findNotes } from 'musicxml-io/query';
import { getAllNotes } from 'musicxml-io/accessors';
```

## Compatibility

Works with MusicXML files exported from:
- MuseScore
- Finale
- Sibelius
- Dorico
- Noteflight
- Flat.io
- And any other MusicXML 3.x/4.x compatible software

## Round-Trip Fidelity

We continuously test against real-world MusicXML files to ensure high fidelity:

| Metric | Score |
|--------|------:|
| **Overall** | **99.6%** |
| Node coverage | 99.9% |
| Attribute coverage | 95.9% |
| Text value coverage | 99.8% |

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT
