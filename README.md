# musicxml-io

[![npm version](https://img.shields.io/npm/v/musicxml-io.svg)](https://www.npmjs.com/package/musicxml-io)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

TypeScript library for parsing and serializing MusicXML.

## Architecture

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│   MusicXML      │      │                 │      │   MusicXML      │
│   .xml / .mxl   │─────▶│      Score      │─────▶│   .xml / .mxl   │
└─────────────────┘      │                 │      └─────────────────┘
                   parse │   ┌─────────┐   │ serialize
                         │   │  parts  │   │      ┌─────────────────┐
                         │   │   └─measures      │      MIDI        │
                         │   │       └─entries   │─────▶│   .mid          │
                         │   └─────────┘   │      └─────────────────┘
                         │                 │ exportMidi
                         └────────┬────────┘
                                  │
                    ┌─────────────┼─────────────┐
                    │             │             │
                    ▼             ▼             ▼
              ┌──────────┐ ┌──────────┐ ┌──────────┐
              │ Query    │ │Operations│ │ Validate │
              │          │ │          │ │          │
              │findNotes │ │transpose │ │validate  │
              │getMeasure│ │addNote   │ │isValid   │
              │countNotes│ │changeKey │ │assertValid
              └──────────┘ └──────────┘ └──────────┘
```

## Install

```bash
npm install musicxml-io
```

## Usage

```typescript
import { parse, serialize, transpose } from 'musicxml-io';

const score = parse(xmlString);
const transposed = transpose(score, 2);  // up 2 semitones
const output = serialize(transposed);
```

### File I/O (Node.js)

```typescript
import { parseFile, serializeToFile } from 'musicxml-io';

const score = await parseFile('input.mxl');
await serializeToFile(score, 'output.xml');
```

### Operations

```typescript
import { addNote, changeKey, changeTime } from 'musicxml-io';

const updated = addNote(score, {
  partIndex: 0,
  measureNumber: 1,
  pitch: { step: 'C', octave: 4 },
  duration: 4,
  type: 'quarter',
});

const inG = changeKey(score, { fifths: 1 }, 0, 1);
const waltz = changeTime(score, { beats: 3, beatType: 4 }, 0, 1);
```

### Query

```typescript
import { findNotes, getAllNotes, getMeasureCount } from 'musicxml-io';

const notes = getAllNotes(score);
const quarterNotes = findNotes(score, { type: 'quarter' });
const count = getMeasureCount(score.parts[0]);
```

### MIDI Export

```typescript
import { exportMidi } from 'musicxml-io';

const midi = exportMidi(score, { tempo: 120 });
```

### Validation

```typescript
import { validate, isValid } from 'musicxml-io';

const { valid, errors } = validate(score);
```

## API

### Parse / Serialize

| Function | Description |
|----------|-------------|
| `parse(xml)` | Parse MusicXML string |
| `parseFile(path)` | Parse from file |
| `parseCompressed(buffer)` | Parse .mxl |
| `parseAuto(data)` | Auto-detect format |
| `serialize(score)` | To MusicXML string |
| `serializeToFile(score, path)` | To file |
| `serializeCompressed(score)` | To .mxl |
| `exportMidi(score)` | To MIDI |

### Operations

| Function | Description |
|----------|-------------|
| `transpose(score, semitones)` | Transpose pitches |
| `addNote(score, options)` | Add note |
| `deleteNote(score, options)` | Delete note |
| `addChordNote(score, options)` | Add to chord |
| `changeKey(score, key, part, measure)` | Change key |
| `changeTime(score, time, part, measure)` | Change time |
| `insertMeasure(score, part, after)` | Insert measure |
| `deleteMeasure(score, part, measure)` | Delete measure |

### Query

| Function | Description |
|----------|-------------|
| `getAllNotes(score)` | All notes |
| `findNotes(score, filter)` | Filter notes |
| `getMeasure(part, number)` | Get measure |
| `getMeasureCount(part)` | Measure count |
| `getChords(measure)` | Chord groups |
| `countNotes(score)` | Notes per part |

### Validate

| Function | Description |
|----------|-------------|
| `validate(score)` | Validation errors |
| `isValid(score)` | Boolean check |
| `assertValid(score)` | Throw if invalid |

## Tree-shaking

```typescript
import { transpose } from 'musicxml-io/operations';
import { findNotes } from 'musicxml-io/query';
```

## Round-trip Fidelity

| Metric | Score |
|--------|------:|
| Overall | 99.6% |
| Node coverage | 99.9% |
| Attribute coverage | 95.9% |

## License

MIT
