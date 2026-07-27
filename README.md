# musicxml-io

[![npm version](https://img.shields.io/npm/v/musicxml-io.svg)](https://www.npmjs.com/package/musicxml-io)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

TypeScript library for parsing and serializing MusicXML and ABC notation.

## Architecture

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│   MusicXML      │      │                 │      │   MusicXML      │
│   .xml / .mxl   │─────▶│      Score      │─────▶│   .xml / .mxl   │
└─────────────────┘      │                 │      └─────────────────┘
                   parse │   ┌─────────┐   │ serialize
┌─────────────────┐      │   │ parts   │   │      ┌─────────────────┐
│   ABC notation  │      │   │  └─measures │      │   ABC notation  │
│   .abc          │─────▶│   │    └─entries│─────▶│   .abc          │
└─────────────────┘      │   └─────────┘   │      └─────────────────┘
              parseAbc   │                 │ serializeAbc
                         │                 │      ┌─────────────────┐
                         │                 │      │     MIDI        │
                         │                 │─────▶│   .mid          │
                         │                 │      └─────────────────┘
                         │                 │ exportMidi
                         └────────┬────────┘
                                  │
              ┌───────────────────┼───────────────────┐
              │                   │                   │
              ▼                   ▼                   ▼
     ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
     │ QUERIES         │ │ OPERATIONS      │ │ ACCESSORS       │
     │                 │ │                 │ │                 │
     │ Score-level     │ │ Score mutation  │ │ Entry-level     │
     │ read operations │ │ operations      │ │ helpers         │
     │                 │ │                 │ │                 │
     │ getMeasure()    │ │ transpose()     │ │ isRest()        │
     │ findNotes()     │ │ addNote()       │ │ isPitchedNote() │
     │ getAllNotes()   │ │ changeKey()     │ │ getPartName()   │
     │ getHarmonies()  │ │ insertMeasure() │ │ hasTie()        │
     └─────────────────┘ └─────────────────┘ └─────────────────┘
                                  │
                                  ▼
                         ┌─────────────────┐
                         │ VALIDATE        │
                         │                 │
                         │ validate()      │
                         │ isValid()       │
                         │ assertValid()   │
                         └─────────────────┘
```

### Module Structure

| Module | File | Description |
|--------|------|-------------|
| Query | `src/query/index.ts` | Score-level read operations (get, find, iterate) |
| Operations | `src/operations/index.ts` | Score mutation operations (add, delete, modify) |
| Accessors | `src/entry-accessors.ts` | Entry-level helpers for notes, directions, parts |

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

### ABC Notation

```typescript
import { parseAbc, serializeAbc } from 'musicxml-io';

// ABC → Score
const score = parseAbc(abcString);

// Score → ABC
const abc = serializeAbc(score, {
  referenceNumber: 1,
  includeChordSymbols: true,
  includeDynamics: true,
  includeLyrics: true,
});

// Files holding several tunes (repeated X: fields)
import { parseAbcTunes, serializeAbcTunes } from 'musicxml-io';
const tunes = parseAbcTunes(abcString);   // Score[]
const book = serializeAbcTunes(tunes);

// Auto-detect format (MusicXML, .mxl, or ABC)
import { parseAuto } from 'musicxml-io';
const score2 = parseAuto(input);
```

`parseAbc` returns the first tune of a multi-tune file; use `parseAbcTunes`
to get them all.

#### Supported ABC syntax

Targets the [ABC notation standard v2.1](https://abcnotation.com/wiki/abc:standard:v2.1).

| Area | Support |
|------|---------|
| Header fields | `X T C M L Q K V P U W Z S O R N I F` and `+:` continuations |
| Meters | `n/m`, `C`, `C\|`, additive `(2+3+2)/8`, `none` |
| Keys | All majors, minors and modes; clef on `K:` (`clef=bass`, bare `K:C bass`) |
| Clefs | treble, bass, bass3, alto, tenor, soprano, mezzo, baritone, perc, and octave-transposing forms (`treble-8`, `bass+15`) |
| Notes | Pitch, octave, duration, broken rhythm (`>` `<`), ties |
| Accidentals | `^ ^^ _ __ =` and microtones (`^/2`, `^3/2`, `_/4`) |
| Rests | `z`, `x`, multi-measure `Zn`, spacer `y` |
| Bar lines | `\| \|\| \|] [\| \|: :\| :: :\|: [\|]` and dotted `.\|` |
| Repeats | Volta brackets, including lists and ranges (`[1,3`, `[1-3`) |
| Chords | `[CEG]`, per-note durations and ties, rests inside chords |
| Grace notes | `{...}` appoggiatura, `{/...}` acciaccatura, chords inside groups |
| Tuplets | `(p`, `(p:q`, `(p:q:r` |
| Decorations | Shorthand (`. ~ H L M O P S T u v`), `!name!`, legacy `+name+` |
| Chord symbols | `"Am"`, `"G7/B"`, ... |
| Annotations | `"^above"`, `"_below"`, `"<"`, `">"`, `"@"` |
| Slurs | `(...)`, dotted `.(...)` |
| Dynamics | `!p!` … `!ffff!`, hairpins `!crescendo(!` / `!diminuendo)!` |
| Lyrics | `w:` with multiple verses, `W:` |
| Voices | `V:` with `clef=`, `name=`, `octave=`; overlay `&` |
| Inline fields | `[K:]`, `[M:]`, `[L:]`, `[Q:]`, `[V:]`, and others carried through |
| Files | Multiple tunes per file, `%` comments, `%%` directives |

Not yet interpreted, but carried through a round-trip unchanged:

- `U:` user-defined symbol redefinitions (the default meanings are used)
- `m:` macros (not expanded)
- `K:` extras beyond the clef: explicit accidentals (`exp`), `transpose=`,
  `middle=`, `K:HP`
- `s:` symbol lines and body `P:` part markers (kept in place, not applied)
- Spacing between notes, which ABC uses as a beaming hint, is treated as
  formatting rather than musical content

Where several ABC spellings mean the same thing — `!trill!` and `T`, or
`!accent!`, `!emphasis!` and `!>!` — serialization settles on one of them.
The choice is stable, so serializing twice yields the same text.

⚠️ **Warning**: This library's API is not yet stable and may change between versions.

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
import { findNotes, getAllNotes, getMeasureCount, getHarmonies } from 'musicxml-io';

const notes = getAllNotes(score);
const quarterNotes = findNotes(score, { noteType: 'quarter' });
const count = getMeasureCount(score);
const harmonies = getHarmonies(score);  // chord symbols (C7, Dm, etc.)
```

### Accessors

Entry-level helpers for working with individual notes, directions, and parts:

```typescript
import {
  getAllNotes,
  isRest, isPitchedNote, hasTie, isChordNote,
  getPartName,
  getDirectionOfKind, getSoundTempo
} from 'musicxml-io';

// NoteEntry helpers
for (const item of getAllNotes(score)) {
  if (isRest(item.note)) continue;
  if (isPitchedNote(item.note)) {
    console.log(`${item.note.pitch!.step}${item.note.pitch!.octave}`);
  }
  if (hasTie(item.note)) console.log('Tied note');
  if (isChordNote(item.note)) console.log('Part of chord');
}

// PartInfo helpers
const partName = getPartName(score, 'P1'); // 'Piano'

// DirectionEntry helpers
for (const entry of measure.entries) {
  if (entry.type === 'direction') {
    const dynamics = getDirectionOfKind(entry, 'dynamics');
    if (dynamics) console.log(dynamics.value); // 'ff', 'pp', etc.

    const tempo = getSoundTempo(entry);
    if (tempo) console.log(`Tempo: ${tempo} BPM`);
  }
}
```

### MIDI Export

```typescript
import { exportMidi } from 'musicxml-io';

const midi = exportMidi(score, { tempo: 120 });
```

#### Playback timeline (for audio alignment)

`generatePlaybackTimeline` returns a **timing sidecar** mapping playback time
(seconds) to conceptual musical positions (`measure` + `beat`), with
repeats/voltas/jumps expanded. It is a read-only analysis (under `query`) — the
sibling of `generatePlaybackSequence`, which gives the play *order*; this gives
the same expansion *with absolute times*.

```typescript
import { generatePlaybackTimeline } from 'musicxml-io';

const sidecar = generatePlaybackTimeline(score);
// sidecar.breakpoints: [{ midiSec, quarterPos, measureNumber, beatInMeasure, repeatIteration }]
```

The timeline is the one thing that cannot be recomputed from the MusicXML alone,
because the seconds depend on the tempo and repeat expansion. Its seconds equal
the playback time of `exportMidi`'s output (they share the same computation).
Pair it with an audio aligner that returns `audioSec ↔ midiSec` to follow a
recording on the score:

```
audioSec ─[aligner]→ midiSec ─[timeline: interpolate quarterPos]→ (measure, beat)
```

Breakpoints are emitted at every played-measure start and every tempo change,
sorted and monotone by `midiSec`. Between two consecutive breakpoints
`midiSec ↔ quarterPos` is linear (tempo is piecewise-constant), so any
intermediate time interpolates exactly. A repeated measure appears multiple
times with a rising `repeatIteration`. The conceptual position is
renderer-independent — resolving `(measure, beat)` to a rendered element is the
caller's responsibility.

When you need both the MIDI and its timeline, `exportMidiWithTimingMap(score)`
returns `{ midi, sidecar }` in one call (just `exportMidi` +
`generatePlaybackTimeline`, guaranteed consistent).

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
| `parseAbc(abc)` | Parse ABC notation string (first tune) |
| `parseAbcTunes(abc)` | Parse every tune in an ABC file → `Score[]` |
| `parseAuto(data)` | Auto-detect format (MusicXML / .mxl / ABC) |
| `serialize(score)` | To MusicXML string |
| `serializeToFile(score, path)` | To file |
| `serializeCompressed(score)` | To .mxl |
| `serializeAbc(score, options?)` | To ABC notation string |
| `serializeAbcTunes(scores, options?)` | Several Scores → one multi-tune ABC file |
| `exportMidi(score)` | To MIDI |
| `exportMidiWithTimingMap(score)` | To MIDI + a MIDI↔(measure, beat) timing sidecar for audio alignment |

### Operations

| Function | Description |
|----------|-------------|
| `transpose(score, semitones)` | Transpose pitches |
| `insertNote(score, options)` | Insert note at position |
| `removeNote(score, options)` | Remove note (replace with rest) |
| `addChord(score, options)` | Add note to chord |
| `setNotePitch(score, options)` | Change note pitch |
| `changeNoteDuration(score, options)` | Change note duration |
| `addVoice(score, options)` | Add voice to measure |
| `addPart(score, options)` | Add part to score |
| `removePart(score, options)` | Remove part from score |
| `setStaves(score, options)` | Set staff count |
| `changeKey(score, key, part, measure)` | Change key signature |
| `changeTime(score, time, part, measure)` | Change time signature |
| `insertMeasure(score, part, after)` | Insert measure |
| `deleteMeasure(score, part, measure)` | Delete measure |
| `addTie(score, options)` | Add tie between notes |
| `addSlur(score, options)` | Add slur between notes |
| `addArticulation(score, options)` | Add staccato, accent, etc. |
| `addDynamics(score, options)` | Add dynamics (f, p, etc.) |
| `modifyDynamics(score, options)` | Modify dynamics |
| `addTempo(score, options)` | Add tempo marking |
| `modifyTempo(score, options)` | Modify tempo |
| `addOrnament(score, options)` | Add trill, turn, etc. |
| `addText(score, options)` | Add text direction |
| `addLyric(score, options)` | Add lyric to note |
| `autoBeam(score, options)` | Auto-beam notes |
| `createTuplet(score, options)` | Create tuplet |
| `addChordSymbol(score, options)` | Add chord symbol |
| `changeClef(score, options)` | Change clef |
| `setBarline(score, options)` | Change barline style |
| `addRepeat(score, options)` | Add repeat barline |
| `addEnding(score, options)` | Add first/second ending |
| `addFermata(score, options)` | Add fermata |
| `addWedge(score, options)` | Add crescendo/diminuendo |
| `addPedal(score, options)` | Add pedal marking |
| `addGraceNote(score, options)` | Add grace note |

See [OPERATIONS.md](OPERATIONS.md) for the complete list.

### Query

| Function | Description |
|----------|-------------|
| `getAllNotes(score)` | All notes with context |
| `findNotes(score, filter)` | Filter notes by criteria |
| `getMeasure(score, { part, measure })` | Get measure by number |
| `getMeasureByIndex(score, { part, measureIndex })` | Get measure by index |
| `getMeasureCount(score)` | Total measure count |
| `getChords(measure)` | Chord groups in measure |
| `countNotes(score)` | Total note count |
| `getHarmonies(score)` | All chord symbols |
| `getDynamics(score)` | All dynamics markings |
| `getTempoMarkings(score)` | All tempo markings |
| `generatePlaybackSequence(score)` | Play order of measures (repeats/voltas/jumps expanded) |
| `generatePlaybackTimeline(score)` | Playback time (sec) ↔ (measure, beat) map for audio alignment |

### Accessors

Entry-level helpers for individual notes, directions, and parts.

**NoteEntry**

| Function | Description |
|----------|-------------|
| `isRest(note)` | Check if rest |
| `isPitchedNote(note)` | Check if has pitch |
| `isUnpitchedNote(note)` | Check if percussion |
| `isChordNote(note)` | Check if part of chord |
| `isGraceNote(note)` | Check if grace note |
| `isCueNote(note)` | Check if cue note |
| `hasTie(note)` | Check if tied |
| `hasTieStart(note)` | Check if tie starts |
| `hasTieStop(note)` | Check if tie stops |
| `hasBeam(note)` | Check if beamed |
| `hasLyrics(note)` | Check if has lyrics |
| `hasNotations(note)` | Check if has notations |
| `hasTuplet(note)` | Check if in tuplet |

**DirectionEntry**

| Function | Description |
|----------|-------------|
| `getDirectionOfKind(entry, kind)` | Get first direction type |
| `getDirectionsOfKind(entry, kind)` | Get all direction types |
| `hasDirectionOfKind(entry, kind)` | Check if has type |
| `getSoundTempo(entry)` | Get tempo from sound |
| `getSoundDynamics(entry)` | Get dynamics (0-127) |
| `getSoundDamperPedal(entry)` | Get damper pedal state |
| `getSoundSoftPedal(entry)` | Get soft pedal state |
| `getSoundSostenutoPedal(entry)` | Get sostenuto pedal state |

**PartInfo**

| Function | Description |
|----------|-------------|
| `getPartInfo(score, id)` | Get part info by ID |
| `getPartName(score, id)` | Get part name |
| `getPartAbbreviation(score, id)` | Get part abbreviation |
| `getAllPartInfos(score)` | Get all part infos |
| `getPartNameMap(score)` | Get ID to name map |
| `isPartInfo(entry)` | Type guard for PartInfo |

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
import { isRest, getPartName } from 'musicxml-io/accessors';
```

The package declares `"sideEffects": false`, so bundlers can drop everything
you don't import — pulling in only `parse` costs roughly 47 KB minified
(~13 KB gzip).

Approximate cost of common imports (minified / gzipped):

| Import | Size |
|--------|------|
| `parse` (.xml only) | ~47 KB / ~13 KB |
| `parseAuto` (.xml + .mxl, adds fflate's unzip) | ~53 KB / ~16 KB |
| `parse` + `serialize` | ~104 KB / ~26 KB |
| everything | ~298 KB / ~72 KB |

The ABC notation codecs (`parseAbc`, `serializeAbc`), MIDI export, query
helpers, operations, and the validator are all separate modules — they only
end up in your bundle if you import them.

### Browser usage

The main entry exports the Node-only file helpers (`parseFile`,
`serializeToFile`), which depend on `fs`. Bundlers that honor the `browser`
condition (webpack, Vite, esbuild with `--platform=browser`, etc.)
automatically get a browser-safe build without any `fs`/`node:*` imports.
You can also import it explicitly:

```typescript
import { parse, serialize } from 'musicxml-io/browser';
```

## Unique Element IDs

All elements in the Score structure have a unique `_id` property that is automatically generated when:
- MusicXML is parsed/imported
- New elements are created via operations

The ID format is `"i"` + 10 random characters (11 characters total), where:
- `"i"` prefix ensures XML ID compatibility (IDs must start with a letter or underscore)
- the suffix is drawn from a 64-character URL-safe alphabet backed by `crypto.getRandomValues` (same format as nanoid)

```typescript
import { parse, generateId } from 'musicxml-io';

const score = parse(xmlString);
console.log(score._id);           // e.g., "iV1StGXR8_Z"
console.log(score.parts[0]._id);  // e.g., "i2x4K9mL1Qp"

// Generate IDs manually for custom elements
const customId = generateId();    // e.g., "iAb3Cd5Ef7H"
```

This feature enables:
- Tracking elements across transformations
- Building element references in external systems
- Implementing undo/redo functionality
- Diffing and merging scores

## Round-trip Fidelity

### MusicXML

| Metric | Score |
|--------|------:|
| Overall | 99.6% |
| Node coverage | 99.9% |
| Attribute coverage | 95.9% |

### ABC Notation

| Path | Fidelity |
|------|----------|
| ABC → Score → ABC | High (49 fixtures passing) |
| ABC → MusicXML → ABC | Musical content preserved |

## Contributing

Contributions are welcome! Whether it's bug reports, feature requests, documentation improvements, or code contributions, we appreciate your help in making this library better.

### Development Setup

```bash
# Clone the repository
git clone https://github.com/tan-z-tan/musicxml-io.git
cd musicxml-io

# Install dependencies
npm install

# Run tests
npm test

# Build
npm run build

# Type check
npm run typecheck

# Lint
npm run lint
```

### How to Contribute

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests to ensure everything works (`npm test`)
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

### Guidelines

- Write tests for new features
- Follow the existing code style
- Update documentation as needed
- Keep PRs focused on a single change

## License

MIT
