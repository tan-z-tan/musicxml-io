# Changelog

## [Unreleased]

### Performance
- Operations are dramatically faster on large scores:
  - Single-measure operations (`insertNote`, `setNotePitch`, `addLyric`, `addArticulation`, etc.) now use copy-on-write structural sharing — only the modified measure is deep-cloned, everything else is shared by reference with the input score. On a 1.2 MB orchestral score, `insertNote` went from ~12.5 ms to ~0.02 ms per call.
  - Whole-score operations (`transpose`, `changeKey`, part operations, etc.) replace `JSON.parse(JSON.stringify(...))` with a hand-rolled deep clone (~3.7x faster).
- Unchanged measures keep their object identity across operations, which enables reference-equality-based rendering optimizations (e.g. `React.memo` per measure).
- As before, operations never mutate the input score, but scores should be treated as immutable data — see "Immutability and Structural Sharing" in OPERATIONS.md.

## [0.3.6] - 2025-02-25

### Fixed
- First `<attributes>` in a measure was always stored in `measure.attributes`, even when preceded by `<note>` elements
  - Now correctly placed as `AttributesEntry` in `entries` array when notes appear before it
  - `getClefChanges()` and similar queries now report correct `position` for mid-measure attribute changes

## [0.3.3] - 2025-02-17

### Added
- **ABC notation format support** with full bidirectional conversion
  - `parseAbc(abcString)` — Parse ABC notation into Score
  - `serializeAbc(score, options?)` — Serialize Score to ABC notation
  - `parseAuto()` now auto-detects ABC format
- **ABC → Score → ABC round-trip** with high fidelity (42 test fixtures passing)
- **ABC → MusicXML → ABC round-trip** with musical content preservation
- ABC parser supports:
  - Header fields (X:, T:, C:, M:, L:, Q:, K:, V:, w:, R:, S:, N:, etc.)
  - Notes with pitches, octaves, accidentals, durations, rests
  - Barlines, repeats, and volta endings
  - Chord symbols, simultaneous chords ([CEG])
  - Ties, slurs, grace notes, tuplets
  - Dynamics (20+ values)
  - Lyrics (w: field with syllable alignment)
  - Multi-voice (V: field with interleaving)
  - Inline fields ([V:], [L:], [K:] mid-tune changes)
  - %% directives and comments preservation
- ABC serializer options: `referenceNumber`, `notesPerLine`, `includeChordSymbols`, `includeDynamics`, `includeLyrics`
- 42 ABC test fixtures covering basic features, intermediate features, and complex real-world tunes (Bach, Irish traditional, folk songs)

## [0.3.2] - 2025-01-xx

### Added
- MIDI export (`exportMidi`)
- Score validation (`validate`, `isValid`, `assertValid`)

## [0.3.0] - 2025-01-xx

### Added
- Operations API (transpose, addNote, changeKey, etc.)
- Query API (getAllNotes, findNotes, getMeasure, etc.)
- Entry-level accessors (isRest, isPitchedNote, hasTie, etc.)
- Unique element IDs with `_id` property
- Tree-shaking support via subpath exports

## [0.2.0] - 2024-xx-xx

### Added
- .mxl compressed format support (`parseCompressed`, `serializeCompressed`)
- File I/O helpers (`parseFile`, `serializeToFile`)

## [0.1.0] - 2024-xx-xx

### Added
- Initial release
- MusicXML parsing and serialization
- High round-trip fidelity (99.6%)
