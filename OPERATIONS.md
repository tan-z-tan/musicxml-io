# Operations API

This document defines the Operations API for musicxml-io. All operations are designed to:
1. Return a `OperationResult<T>` type (success with new score, or error with validation details)
2. Guarantee musical validity when successful (no musical inconsistencies)
3. Use the Validator to ensure score integrity after mutation

## Design Principles

### Piano Roll Semantics
Operations follow "Piano Roll" semantics where measures are always **filled** (充足):
- Measures always contain either notes or rests that fill the entire duration
- When a note is removed, it's replaced with a rest of the same duration
- When a note's duration changes, subsequent space is filled with rests or consumed from following notes/rests

### Result Type Pattern
All operations return a `OperationResult<T>` type:
```typescript
type OperationResult<T> =
  | { success: true; data: T; warnings?: ValidationError[] }
  | { success: false; errors: ValidationError[] };
```

This ensures:
- Caller knows exactly whether the operation succeeded
- On failure, detailed validation errors are provided
- No invalid scores are ever returned

---

## Note Operations

Piano Roll style note manipulation.

| Operation | Description |
|-----------|-------------|
| `insertNote` | Insert note at position (replaces rests, errors on note conflict) |
| `removeNote` | Remove note and replace with rest |
| `addChord` | Add chord note to existing note |
| `setNotePitch` | Change note pitch |
| `setNotePitchBySemitone` | Set pitch using MIDI semitone value |
| `shiftNotePitch` | Shift pitch by interval |
| `changeNoteDuration` | Change duration (consumes/fills adjacent space) |
| `raiseAccidental` | Raise note by semitone (add sharp) |
| `lowerAccidental` | Lower note by semitone (add flat) |
| `transpose` | Transpose all notes by semitones |

---

## Voice Operations

| Operation | Description |
|-----------|-------------|
| `addVoice` | Add new voice to measure (filled with rest) |

---

## Part Operations

| Operation | Description |
|-----------|-------------|
| `addPart` | Add a new part to the score |
| `removePart` | Remove a part from the score |
| `duplicatePart` | Duplicate an existing part |

---

## Staff Operations

| Operation | Description |
|-----------|-------------|
| `setStaves` | Set the number of staves for a part |
| `moveNoteToStaff` | Move a note to a different staff |

---

## Measure Operations

| Operation | Description |
|-----------|-------------|
| `insertMeasure` | Insert measure after specified measure |
| `deleteMeasure` | Delete a measure |
| `changeKey` | Change key signature |
| `changeTime` | Change time signature |

---

## Tie Operations

| Operation | Description |
|-----------|-------------|
| `addTie` | Add tie between two notes |
| `removeTie` | Remove tie from note |

---

## Slur Operations

| Operation | Description |
|-----------|-------------|
| `addSlur` | Add slur between notes |
| `removeSlur` | Remove slur from note |

---

## Articulation Operations

| Operation | Description |
|-----------|-------------|
| `addArticulation` | Add articulation (staccato, accent, tenuto, marcato, etc.) |
| `removeArticulation` | Remove articulation from note |

---

## Dynamics Operations

| Operation | Alias | Description |
|-----------|-------|-------------|
| `addDynamics` | - | Add dynamics marking (pp, p, mp, mf, f, ff, etc.) |
| `removeDynamics` | - | Remove dynamics direction |
| `modifyDynamics` | - | Modify existing dynamics value or placement |

---

## Tempo Operations

| Operation | Alias | Description |
|-----------|-------|-------------|
| `addTempo` | - | Add tempo marking with metronome/text |
| `removeTempo` | - | Remove tempo direction |
| `modifyTempo` | - | Modify existing tempo (BPM, beat unit, text) |

---

## Ornament Operations

| Operation | Description |
|-----------|-------------|
| `addOrnament` | Add ornament (trill, turn, mordent, inverted-mordent, tremolo, etc.) |
| `removeOrnament` | Remove ornament from note |

---

## Text / Lyric Operations

| Operation | Alias | Description |
|-----------|-------|-------------|
| `addTextDirection` | `addText` | Add text direction (expression text, performance instruction) |
| `addRehearsalMark` | - | Add rehearsal mark |
| `addLyric` | - | Add lyric to note with verse number |
| `removeLyric` | - | Remove lyric from note |
| `updateLyric` | - | Update existing lyric text |

---

## Beam Operations

| Operation | Alias | Description |
|-----------|-------|-------------|
| `addBeam` | - | Add beam to note |
| `removeBeam` | - | Remove beam from note |
| `autoBeam` | `setBeaming` | Automatic beaming based on time signature |

---

## Tuplet Operations

| Operation | Description |
|-----------|-------------|
| `createTuplet` | Create tuplet grouping (triplets, quintuplets, etc.) |
| `removeTuplet` | Remove tuplet from notes |

---

## Harmony (Chord Symbol) Operations

| Operation | Alias | Description |
|-----------|-------|-------------|
| `addHarmony` | `addChordSymbol` | Add chord symbol (C, Dm, G7, etc.) |
| `removeHarmony` | `removeChordSymbol` | Remove chord symbol |
| `updateHarmony` | `updateChordSymbol` | Update existing chord symbol |

---

## Clef Operations

| Operation | Alias | Description |
|-----------|-------|-------------|
| `insertClefChange` | `changeClef` | Insert clef change mid-measure/mid-part |

---

## Barline / Repeat Operations

| Operation | Alias | Description |
|-----------|-------|-------------|
| `changeBarline` | `setBarline` | Change barline style |
| `addRepeatBarline` | `addRepeat` | Add repeat barline (forward/backward) |
| `removeRepeatBarline` | `removeRepeat` | Remove repeat barline |
| `addEnding` | - | Add first/second ending |
| `removeEnding` | - | Remove ending |
| `addSegno` | - | Add segno symbol |
| `addCoda` | - | Add coda symbol |
| `addDaCapo` | - | Add "Da Capo" navigation |
| `addDalSegno` | - | Add "Dal Segno" navigation |
| `addFine` | - | Add "Fine" ending marker |
| `addToCoda` | - | Add "To Coda" navigation |

---

## Grace Note Operations

| Operation | Description |
|-----------|-------------|
| `addGraceNote` | Add grace note to position |
| `removeGraceNote` | Remove grace note |
| `convertToGrace` | Convert regular note to grace note |

---

## Expression / Performance Operations

| Operation | Description |
|-----------|-------------|
| `addWedge` | Add crescendo/diminuendo wedge |
| `removeWedge` | Remove wedge |
| `addFermata` | Add fermata symbol |
| `removeFermata` | Remove fermata |
| `addPedal` | Add pedal marking |
| `removePedal` | Remove pedal |

---

## Technical Notation Operations

| Operation | Description |
|-----------|-------------|
| `addFingering` | Add fingering number |
| `removeFingering` | Remove fingering |
| `addBowing` | Add bowing direction (up-bow/down-bow) |
| `removeBowing` | Remove bowing |
| `addStringNumber` | Add string number for string instruments |
| `removeStringNumber` | Remove string number |

---

## Octave Shift Operations

| Operation | Description |
|-----------|-------------|
| `addOctaveShift` | Add octave shift (8va/8vb) |
| `stopOctaveShift` | Stop octave shift |
| `removeOctaveShift` | Remove octave shift |

---

## Breath / Caesura Operations

| Operation | Description |
|-----------|-------------|
| `addBreathMark` | Add breath mark |
| `removeBreathMark` | Remove breath mark |
| `addCaesura` | Add caesura marking |
| `removeCaesura` | Remove caesura |

---

## Copy / Paste Operations

| Operation | Description |
|-----------|-------------|
| `copyNotes` | Copy notes from selection |
| `pasteNotes` | Paste notes at position |
| `cutNotes` | Cut notes |
| `copyNotesMultiMeasure` | Copy multiple measures |
| `pasteNotesMultiMeasure` | Paste multiple measures |

---

## API Usage Examples

### Adding Dynamics
```typescript
import { addDynamics, modifyDynamics } from 'musicxml-io';

// Add forte marking
const result = addDynamics(score, {
  partIndex: 0,
  measureIndex: 0,
  position: 0,
  dynamics: 'f',
  placement: 'below',
});

// Later, change to piano
const modified = modifyDynamics(result.data, {
  partIndex: 0,
  measureIndex: 0,
  directionIndex: 0,
  dynamics: 'p',
});
```

### Adding Tempo
```typescript
import { addTempo, modifyTempo } from 'musicxml-io';

// Add Allegro tempo marking
const result = addTempo(score, {
  partIndex: 0,
  measureIndex: 0,
  position: 0,
  bpm: 120,
  beatUnit: 'quarter',
  text: 'Allegro',
});

// Later, change to 140 BPM
const modified = modifyTempo(result.data, {
  partIndex: 0,
  measureIndex: 0,
  bpm: 140,
});
```

### Adding Articulations
```typescript
import { addArticulation } from 'musicxml-io';

const result = addArticulation(score, {
  partIndex: 0,
  measureIndex: 0,
  noteIndex: 0,
  articulation: 'staccato',
});
```

### Adding Chord Symbols
```typescript
import { addChordSymbol } from 'musicxml-io';

const result = addChordSymbol(score, {
  partIndex: 0,
  measureIndex: 0,
  position: 0,
  root: { step: 'C' },
  kind: 'dominant-seventh', // C7
});
```

### Adding Repeat Barlines
```typescript
import { addRepeat, addEnding } from 'musicxml-io';

// Add forward repeat at measure start
const withRepeat = addRepeat(score, {
  partIndex: 0,
  measureIndex: 0,
  direction: 'forward',
});

// Add first ending
const withEnding = addEnding(withRepeat.data, {
  partIndex: 0,
  measureIndex: 3,
  endingNumber: '1',
  type: 'start',
});
```

---

## Error Codes

| Code | Description |
|------|-------------|
| `NOTE_CONFLICT` | Cannot insert note: conflicts with existing note |
| `EXCEEDS_MEASURE` | Note duration would exceed measure capacity |
| `INVALID_POSITION` | Position is invalid (negative) |
| `INVALID_DURATION` | Duration is invalid (zero or negative) |
| `NOTE_NOT_FOUND` | Note index not found |
| `PART_NOT_FOUND` | Part not found |
| `MEASURE_NOT_FOUND` | Measure not found |
| `INVALID_STAFF` | Staff number is invalid |
| `DUPLICATE_PART_ID` | Part ID already exists |
| `TIE_ALREADY_EXISTS` | Tie already exists |
| `TIE_NOT_FOUND` | Tie not found |
| `TIE_PITCH_MISMATCH` | Tie notes have different pitches |
| `SLUR_ALREADY_EXISTS` | Slur already exists |
| `SLUR_NOT_FOUND` | Slur not found |
| `ARTICULATION_ALREADY_EXISTS` | Articulation already exists |
| `ARTICULATION_NOT_FOUND` | Articulation not found |
| `DYNAMICS_NOT_FOUND` | Dynamics not found |
| `TEMPO_NOT_FOUND` | Tempo marking not found |
| `HARMONY_NOT_FOUND` | Harmony/chord symbol not found |
| `INVALID_CLEF` | Invalid clef sign |
| `REPEAT_ALREADY_EXISTS` | Repeat barline already exists |
| `REPEAT_NOT_FOUND` | Repeat barline not found |
| `ENDING_ALREADY_EXISTS` | Ending already exists |
| `ENDING_NOT_FOUND` | Ending not found |

---

## Legacy API (Deprecated)

For backwards compatibility, these legacy functions are still exported but deprecated:
- `addNote` → Use `insertNote`
- `deleteNote` → Use `removeNote`
- `addChordNote` → Use `addChord`
- `modifyNotePitch` → Use `setNotePitch`
- `modifyNoteDuration` → Use `changeNoteDuration`
- `*Checked` variants → Use the new main API (all operations now return `OperationResult`)
