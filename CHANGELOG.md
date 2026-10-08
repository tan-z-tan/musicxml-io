# Changelog

## [Unreleased]

### Added
- **Full MusicXML `%position` support.** `default-x`, `default-y`, `relative-x` and `relative-y` now round-trip on every element the `Score` model represents that the MusicXML schema gives them to, so the layout a notation program baked into a file can be read back from the `Score` alone. The values stay the producer's raw tenths — `default-*` is the engraver's computed position, `relative-*` the user's offset from it. Newly carried through:
  - Every `<direction-type>` child — dynamics, wedge, metronome, words, rehearsal, segno, coda, pedal, octave-shift, bracket, dashes, accordion-registration, eyeglasses, damp, damp-all, harp-pedals, image and other-direction. `<swing>` and `<scordatura>` have no position attributes in the schema; they declare the four keys as `undefined` so a `DirectionType` can be read without narrowing on `kind` first.
  - `<notations>` children — tuplets, ties, slurs, articulations, ornaments (including `<wavy-line>`, `<tremolo>` and `<accidental-mark>`), technicals, fermatas, arpeggios and standalone `<accidental-mark>`.
  - `<slur>` and `<tied>` also carry the full `%bezier` group. `<tied>` had no position or bezier attributes at all; `bezier-offset` and `bezier-offset2` are new on both (they are divisions, not tenths).
  - `<lyric>`, `<harmony>`, `<accidental>` and `<ending>`.

  A position attribute of `0` is now kept rather than dropped as falsy, and a non-numeric value is ignored instead of becoming `NaN` in the output.
- **Full MusicXML `color` support.** The `color` attribute now round-trips on every element the `Score` model represents, not just `<accidental>` and `<words>`. Newly carried through:
  - Notes and their parts — `<note>`, `<type>`, `<dot>`, `<stem>`, `<notehead>`, `<beam>`.
  - Every `<notations>` child — ties, slurs, articulations, ornaments (including `<accidental-mark>`, `<wavy-line>`, `<tremolo>`), technicals, dynamics, fermatas, arpeggios, glissandi and slides. `<tuplet>` is the one notation element with no `color` attribute in the MusicXML schema, so a colour set there is not written out.
  - Lyrics — `<lyric>`, each `<text>` (including across elisions), and `<extend>`.
  - Every `<direction-type>` child that has a `color` attribute: dynamics, wedges, metronome, rehearsal, segno, coda, pedal, octave-shift, bracket, dashes, accordion-registration, eyeglasses, damp, damp-all, scordatura, harp-pedals and other-direction. `<image>` and `<swing>` have none.
  - `<harmony>`, `<kind>`, `<frame>` and `<figured-bass>` (with its `<extend>`).
  - `<key>`, `<time>`, `<clef>`, `<measure-style>`, `<bar-style>` and `<ending>`.
  - `<part-name>`, `<part-abbreviation>`, `<group-name>`, `<group-abbreviation>`, `<group-symbol>`, `<display-text>` and `<credit-words>`.

  Colours were previously dropped on parse and never emitted on serialize, so a coloured score came back monochrome.
- `setColor(score, options)` and `clearColors(score)` operations for changing colours. `setColor` selects by part index or ID, measure number, a note predicate, and a list of element kinds (`ColorTarget`, with `ALL_COLOR_TARGETS` exported for "everything"); passing `color: null` removes a colour. `clearColors` strips every colour in a score, including the part-list and credit colours `setColor`'s targets do not cover. Both return a new `Score` and leave the input untouched. See [OPERATIONS.md](OPERATIONS.md#color-operations).
- New exported type `Color` (the MusicXML `#RRGGBB` / `#AARRGGBB` string), plus `NoteheadInfo`, `StemInfo`, `AccidentalMarkInfo`, `LyricTextElement`, `DisplayText`, `HarmonyEntry`, `HarmonyFrame`, `FiguredBassEntry` and `MeasureStyle`, which colour-editing code needs to name.
- Much broader ABC notation coverage, targeting the ABC standard v2.1. Newly supported:
  - **Decorations** — the single-character shorthand set (`. ~ H L M O P S T u v`), the `!name!` long form and the deprecated `+name+` form now map onto real MusicXML articulations, ornaments, technicals, fermatas, hairpins and navigation marks instead of being carried as opaque `<words>`. Decorations with no MusicXML counterpart keep their ABC text.
  - **Text annotations** — `"^above"`, `"_below"`, `"<"`, `">"` and `"@"` become `<direction><words>` with the matching placement. They were previously dropped, and mistaken for chord symbols.
  - **Microtonal accidentals** — `^/2`, `^3/2`, `_/4` and friends. Previously the accidental was lost entirely.
  - **Multiple lyric verses** — consecutive `w:` lines become numbered `<lyric>` elements; only the first verse used to survive.
  - **Multi-tune files** — `parseAbcTunes` / `serializeAbcTunes` handle files with several `X:` fields. `parseAbc` returns the first tune instead of merging the rest into it.
  - **Clefs** — the clef named on a `K:` field (`clef=bass`, or the bare `K:C bass`) now reaches the model, as do octave-transposing clefs (`treble-8`, `bass+15`). Previously every tune imported as treble.
  - **Voice `octave=`** — folded into the pitches on import and taken back out on serialization. Parts declaring an octave shift previously imported in the wrong register.
  - **Meters** — additive meters (`M:(2+3+2)/8`) and `M:none`, which used to fall back to 4/4.
  - **Inline fields** — `[M:]` and `[Q:]` are applied; other inline fields are carried through in place.
  - Multi-measure rests (`Zn`) via `<measure-style><multiple-rest>`, spacers (`y`), acciaccaturas (`{/g}`), dotted slurs (`.(`), chords and rests inside chords and grace groups, invisible (`[|]`) and dotted (`.|`) bar lines, volta lists and ranges (`[1,3`, `[1-3`), and `+:` field continuations.
  - Body field lines with no model counterpart (`P:`, `s:`, `r:`) survive a round-trip instead of being dropped.
- `<credit-image>` support: credit images are now parsed into `credit.creditImage` and serialized back to MusicXML. The `CreditImage` type covers the full MusicXML image attribute set (`source`, `type`, `height`, `width`, `default-x/y`, `relative-x/y`, `halign`, `valign`). Previously the field existed on the `Credit` type but was silently dropped on both parse and serialize. `CreditImage` and `CreditWords` are now exported from the package root.

### Performance
- MusicXML parsing allocates ~105k fewer short-lived strings per parse of the 3.4 MB sample corpus. Pretty-printed MusicXML puts an indentation run between almost every pair of tags — 61% of the text runs between tags are whitespace only — and each one was materialized with `slice` before being tested and discarded. The whitespace test now runs in place on the source string, so only text that is actually kept is allocated. Worth ~8% of parse time at the median, less when the heap is quiet and the saving is mostly GC pressure.
- ABC parsing is ~1.5x faster. `durationToNoteType`, which runs once per note, rebuilt a 9-entry array with `Object.entries` and re-ran `parseFloat` on every key on each call; it accounted for ~35% of ABC parse time. The table is now pre-parsed once at module load.
- MusicXML parsing is ~1.45x faster. The txml dependency was replaced with a built-in parser specialized for MusicXML that skips pretty-printing whitespace nodes at scan time, decodes entities inline (no second pass over the tree), and handles processing instructions natively (no regex preprocessing). Node.js additionally gets a faster `Buffer` → string decode path.
- Bundle size: importing only `parse` now costs ~47 KB minified / ~13 KB gzipped (was ~49 KB / ~14 KB); the txml dependency is gone.

### Fixed
- **ABC pitches now follow the key signature and bar accidentals.** `parseAbc` took a note's pitch only from its own accidental, so in `K:G` an `F` was F natural, and in `^c c` the second C lost its sharp. Every tune outside C major therefore had wrong pitches in the `Score`, and so in the MusicXML and MIDI made from it (the ABC round-trip hid this, since it wrote the same letters back). Notes now take the key signature, then any accidental already written on the same pitch and octave in the bar, and a note tied across the bar line keeps its accidental; an inline or body `K:` changes the key from that point. `serializeAbc` does the reverse and writes an accidental only where the key and the bar so far would imply a different pitch (or the score shows one), so MusicXML in G major no longer gets a `^F` on every F.
- ABC mixolydian keys (`K:Amix`, `K:Dmix`, `K:Gmixolydian`) were read as minor — the mode lookup matched the `m` of "mix" first — giving the wrong key signature. Only the first three letters of a mode now count, as the standard specifies.
- ABC chord symbols: the whole quoted text must now be a chord. `"Ending"`, `"Fine"` or `"D.C."` used to become an E, F or D chord; they are now annotations above the staff. Suffixes with no MusicXML kind (`m7b5`, `7sus4`, `add9`, `7#9`) are kept as `<kind text>` instead of being cut to the nearest known chord, and non-chord text such as `"N.C."` is no longer dropped.
- ABC slurs survive a round-trip when they start on a grace note (`({d}e2)`), on the second note of a broken rhythm (`D>(B`), or end on its first note (`e)>e`). A dotted note followed by a chord (`D3/2[C/c/]`) is no longer written as a broken rhythm, which produced `D>C[c]`.
- ABC tuplets: notes after a `(p:q:r` tuplet that covers fewer than `p` notes (`(3:2:2A2B2 c2`) are no longer pulled into it on serialize — the `r` is written out, read from new `<tuplet>` start/stop marks the parser now records. A chord now counts as one note of a tuplet (`(3[CEG]zz c4` used to leave `c4` inside the tuplet), and rests in a tuplet get their `<time-modification>` and are written at their pre-tuplet length (they came back shortened twice).
- ABC header fields with a trailing comment (`M:6/8 %Meter`) are read correctly. The comment made the meter unreadable, so such tunes fell back to 4/4.
- Added `scripts/abc-semantic-roundtrip.ts` and a test suite that compare ABC round-trips note by note (pitch, length, tuplets, ties, slurs, beams, decorations, lyrics, bars) instead of as whitespace-insensitive text, plus `tests/fixtures/abc-hard` with harder ABC 2.1 constructs.
- ABC: `serializeAbc` no longer pairs two notes into a broken rhythm (`>` / `<`) across a beam break. `C/CC/ C>C` came back as `C/CC<CC/`, losing the space and so the beam break; the dotted note and the short note on either side of a space are now written as plain durations ([#109](https://github.com/tan-z-tan/musicxml-io/issues/109)).
- ABC beaming now survives a round-trip ([#109](https://github.com/tan-z-tan/musicxml-io/issues/109)). In ABC, adjacent eighth-or-shorter notes are beamed and a space breaks the beam; the parser ignored the spaces and the serializer wrote none, so `CE GA/B/ c/B/A G/E/C` came back as `CEGA/B/c/B/AG/E/C` — one long beam. `parseAbc` now gives notes `<beam>` elements (with hooks for a lone shorter note, e.g. the sixteenth of `A>B`), and `serializeAbc` writes a space wherever the `<beam>` elements say a beam ends, so beams from MusicXML input come out right too. Notes with no `<beam>` are unbeamed, as in MusicXML. A space is also kept between a beam group and a neighbouring longer note (`AGF G3`). ABC cannot beam only the first level across a space, so a broken secondary beam is not represented.
- ABC tuplet notes now get the type they are written as: a triplet eighth (`(3ABC` with `L:1/8`) was typed as a sixteenth.
- A chord symbol or annotation that follows a chord in ABC (`[CE]"G"A`) is no longer moved in front of the chord on serialize.
- The lyric `number` attribute is an NMTOKEN, not an integer, and is no longer forced through `parseInt`. Sibelius writes verse ids like `part1verse2` (every Sibelius-derived score in the music21 corpus does), which used to parse as `NaN` — `null` once serialized to JSON — so every verse on a note collapsed into one and the ids were lost on the way back out. The raw attribute is now kept on the new `Lyric.numberText` and written back verbatim; `Lyric.number` still holds a numeric reading, but only when the attribute really is a plain integer, and is `undefined` otherwise instead of `NaN`. A `number="0"` also survives, where the previous truthiness check dropped it.
- MIDI export now clamps `<midi-program>` to the spec range (1–128) before the 0-based conversion. MuseScore 3.x writes the out-of-spec value `0` for piano; it previously wrapped to program 127 (GM Gunshot), which rendered the whole part as unpitched noise and, downstream, collapsed audio–score alignment confidence (observed 0.42 → 0.60 on a real score after the fix).
- MIDI export now converts `<midi-channel>` from the MusicXML spec's 1-based range (1–16) to the 0-based channel used in raw MIDI status bytes, mirroring the `<midi-program>` conversion above. It previously passed the value straight through unconverted, so `<midi-channel>10</midi-channel>` (the GM convention for percussion) landed on channel nibble 10 instead of the percussion channel (0-based 9), and `<midi-channel>16</midi-channel>` wrapped to channel 0 via the `& 0x0f` mask, colliding with whatever part already occupied channel 0.
- Fixed a quadratic-backtracking regular expression in the ABC serializer (CodeQL `js/polynomial-redos`). A `<words>` direction carrying text that opens an ABC inline field without closing it — `[A:` followed by whitespace, which MusicXML input can supply — was matched against a pattern whose whitespace run overlapped its value run. 64k characters took ~4.4s; it is now immeasurable. Six further ABC field patterns with the same ambiguity were made unambiguous; none of those were reachable with an input that triggered the blowup, but the shape is a hazard worth removing.
- ABC fingering decorations (`!0!` … `!5!`) kept their digits through a MusicXML round-trip. The value was written to the wrong field, so `<fingering>` came out empty.
- Whitespace-significant text is no longer lost when parsing: whitespace-only `<words>`/`<credit-words>` content (including `xml:space="preserve"`), and whitespace-only lyric `<text>` such as the ideographic space `　` used in Japanese lyrics, are now preserved. The previous XML parser silently trimmed or dropped them.
- Astral-plane numeric character references (e.g. `&#x1D11E;` MUSICAL SYMBOL G CLEF, used by SMuFL text) now decode correctly. The previous entity decoder used `String.fromCharCode`, which corrupted code points above U+FFFF.

### Operations performance
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
