# Changelog

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
