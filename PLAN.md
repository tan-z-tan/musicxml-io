# ABC Notation Import/Export Implementation Plan

## Goal
Add ABC notation (.abc) format support to musicxml-io, enabling:
- **Import**: Parse ABC notation string → Score (internal model)
- **Export**: Score → ABC notation string
- **Round-trip test**: ABC → Score → ABC should preserve musical content

## ABC Notation Format Summary

ABC notation is a text-based music notation format. Key elements:

### File Structure
```
X:1              (reference number - required, first field)
T:Title          (title)
C:Composer       (composer)
M:4/4            (time signature)
L:1/8            (default note length)
Q:1/4=120        (tempo)
K:G              (key signature - required, last header field)
|:GABc dedB|...  (tune body)
```

### Note Syntax
- Pitch: `C D E F G A B` (octave 4), `c d e f g a b` (octave 5)
- Lower octave: `C, D,` (octave 3), `C,, D,,` (octave 2)
- Higher octave: `c' d'` (octave 6), `c'' d''` (octave 7)
- Duration: `A2` (2x default), `A/2` or `A/` (half default), `A3/2` (dotted)
- Accidentals: `^C` (sharp), `^^C` (double sharp), `_B` (flat), `__B` (double flat), `=C` (natural)
- Rest: `z` (rest), `Z` (whole-measure rest), with durations like `z2`
- Chord (simultaneous): `[CEG]`
- Chord symbols: `"Am"CEG` (quoted text before notes)

### Bar Lines & Repeats
- `|` bar, `||` double bar, `|]` final bar, `[|` thick-thin
- `|:` start repeat, `:|` end repeat, `::` double repeat
- `[1` `[2` volta endings

### Other Features
- Ties: `A-A` (hyphen between same-pitch notes)
- Slurs: `(ABC)` (parentheses around notes)
- Grace notes: `{abc}` (curly braces)
- Tuplets: `(3ABC` (triplet), `(p:q:r` (general tuplet)
- Dynamics: `!p!` `!f!` `!mf!` `!ff!` etc.
- Multi-voice: `V:1` / `V:2` sections
- Key modes: `K:Am` (minor), `K:Ddor` (Dorian), `K:Emix` (Mixolydian)
- Lyrics: `w:` field aligned with notes

## Architecture

### File Structure
```
src/
├── importers/
│   ├── abc.ts              # ABC parser → Score
│   └── index.ts            # Updated: export parseAbc
├── exporters/
│   ├── abc.ts              # Score → ABC string
│   └── index.ts            # Updated: export serializeAbc
tests/
├── abc.test.ts             # ABC round-trip and unit tests
├── fixtures/
│   └── abc/                # ABC fixture files
│       ├── simple-scale.abc
│       ├── twinkle.abc
│       ├── chord-symbols.abc
│       ├── multi-voice.abc
│       ├── repeats.abc
│       ├── tuplets-grace.abc
│       └── lyrics.abc
```

### Implementation Approach

The ABC format has a very different structure from MusicXML. The key mapping decisions:

| ABC Concept | Score Model Mapping |
|---|---|
| `X:` reference number | `metadata.movementNumber` |
| `T:` title | `metadata.movementTitle` |
| `C:` composer | `metadata.creators[{type:'composer'}]` |
| `M:` meter | `MeasureAttributes.time` |
| `L:` default length | Used during parse only (not stored) |
| `Q:` tempo | `DirectionEntry` with metronome |
| `K:` key | `MeasureAttributes.key` |
| `V:` voices | Multiple voices via `voice` field, potentially separate `Part`s |
| Notes | `NoteEntry` with pitch, duration |
| `z` rest | `NoteEntry` with `rest: {}` |
| `[CEG]` chord | Multiple `NoteEntry` with `chord: true` |
| `"Am"` chord symbol | `HarmonyEntry` |
| `(...)` slur | `SlurNotation` on notes |
| `-` tie | `TieInfo` and `TiedNotation` |
| `{abc}` grace | `NoteEntry` with `grace` |
| `(3...` tuplet | `timeModification` + `TupletNotation` |
| `!p!` dynamics | `DirectionEntry` with dynamics |
| `|:` `:| ` repeats | `Barline` with `repeat` |
| `[1` `[2` endings | `Barline` with `ending` |
| `w:` lyrics | `Lyric` on `NoteEntry` |

### Divisions Strategy
ABC durations are fractional (relative to default note length `L:`).
- Use `divisions = 960` per quarter note (LCM-friendly for common durations)
- This allows precise representation of 1/8, 1/16, 1/32, triplets, etc.

## Implementation Steps

### Step 1: ABC Parser (Importer)
Create `src/importers/abc.ts`:

1. **Header parser**: Extract `X:`, `T:`, `M:`, `L:`, `Q:`, `K:`, `C:`, `V:`, `w:` fields
2. **Key signature parser**: Handle major/minor/modes, explicit accidentals
3. **Time signature parser**: Handle `M:4/4`, `M:C`, `M:C|`, `M:6/8`
4. **Tokenizer**: Break tune body into tokens (notes, barlines, chords, decorations, etc.)
5. **Note parser**: Parse pitch (octave modifiers, accidentals), duration, ties
6. **Measure builder**: Group notes into measures based on bar lines and time signature
7. **Score builder**: Assemble `Score` object from parsed data

Exported function: `parseAbc(abcString: string): Score`

### Step 2: ABC Serializer (Exporter)
Create `src/exporters/abc.ts`:

1. **Header generator**: Generate header fields from Score metadata
2. **Key serializer**: Convert `KeySignature` → ABC key string
3. **Time serializer**: Convert `TimeSignature` → ABC meter string
4. **Note serializer**: Convert `NoteEntry` → ABC note string (pitch + duration)
5. **Measure serializer**: Convert measure entries to ABC body text with barlines
6. **Full serializer**: Combine headers + body

Exported function: `serializeAbc(score: Score, options?: AbcSerializeOptions): string`

### Step 3: Test Fixtures
Create realistic ABC files covering:
1. Simple scale (C major scale, basic notes)
2. Twinkle Twinkle Little Star (simple melody with repeats)
3. Chord symbols (melody with guitar chords)
4. Multi-voice (two voices in same part)
5. Repeats and endings (volta brackets)
6. Tuplets and grace notes
7. Lyrics

### Step 4: Round-trip Tests
Test strategy: ABC → Score → ABC → Score, compare the two Score objects:
- Same number of parts, measures, entries
- Same pitches, durations, voices
- Same key/time signatures
- Same barlines and repeats
- Same dynamics, chord symbols, lyrics

### Step 5: Integration
1. Update `src/importers/index.ts` to export `parseAbc`
2. Update `src/exporters/index.ts` to export `serializeAbc`
3. Update `src/index.ts` to export both
4. Update `src/file.ts` to handle `.abc` file extension

## Scope Limitations (Phase 1)
Focus on the core ABC features. The following can be deferred:
- Multi-tune files (multiple `X:` in one file) - parse first tune only
- Inline fields (e.g., `[M:3/4]` mid-tune) - basic support
- Complex line continuations (`\` at end of line)
- Decoration shortcuts (`~`, `.`, etc.) - only `!...!` form
- Complex multi-voice with per-voice key/time changes
- Formatting directives (`%%`)
- Guitar TAB in ABC
- Macros and transposition directives
