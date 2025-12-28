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

### Validation Strategy
- Operations validate the affected parts of the score after mutation
- Use `validateMeasureLocal()` for single-measure operations (fast)
- Use `validate()` for cross-measure/cross-part operations
- Critical errors block the operation; warnings are allowed

---

## Phase 1: Note Operations ✅

Piano Roll style note manipulation.

| Operation | Description | Status |
|-----------|-------------|--------|
| `insertNote` | Insert note at position (replaces rests, errors on note conflict) | ✅ |
| `removeNote` | Remove note and replace with rest | ✅ |
| `addChord` | Add chord note to existing note | ✅ |
| `setNotePitch` | Change note pitch | ✅ |
| `changeNoteDuration` | Change duration (consumes/fills adjacent space) | ✅ |
| `transpose` | Transpose all notes by semitones | ✅ |

### Note Operation Errors
- `NOTE_CONFLICT` - Cannot insert note: conflicts with existing note
- `EXCEEDS_MEASURE` - Note duration would exceed measure capacity
- `INVALID_POSITION` - Position is invalid (negative)
- `INVALID_DURATION` - Duration is invalid (zero or negative)
- `NOTE_NOT_FOUND` - Note index not found

---

## Phase 2: Voice Operations ✅

| Operation | Description | Status |
|-----------|-------------|--------|
| `addVoice` | Add new voice to measure (filled with rest) | ✅ |

---

## Phase 3: Part Operations ✅

Part-level manipulation.

| Operation | Description | Status |
|-----------|-------------|--------|
| `addPart` | Add a new part to the score | ✅ |
| `removePart` | Remove a part from the score | ✅ |
| `duplicatePart` | Duplicate an existing part | ✅ |

### Part Operation Errors
- `PART_NOT_FOUND` - Part not found
- `DUPLICATE_PART_ID` - Part ID already exists

---

## Phase 4: Staff Operations ✅

Staff management within parts (e.g., piano grand staff).

| Operation | Description | Status |
|-----------|-------------|--------|
| `setStaves` | Set the number of staves for a part | ✅ |
| `moveNoteToStaff` | Move a note to a different staff | ✅ |

### Staff Operation Errors
- `INVALID_STAFF` - Staff number is invalid
- `STAFF_EXCEEDS_STAVES` - Target staff number exceeds declared staves

---

## Phase 5: Measure Operations (Legacy)

These operations exist without Result pattern (for backwards compatibility).

| Operation | Description | Status |
|-----------|-------------|--------|
| `insertMeasure` | Insert measure after specified measure | ✅ |
| `deleteMeasure` | Delete a measure | ✅ |
| `changeKey` | Change key signature | ✅ |
| `changeTime` | Change time signature | ✅ |

---

## API Usage Examples

### Inserting a Note
```typescript
import { insertNote } from 'musicxml-io/operations';

const result = insertNote(score, {
  partIndex: 0,
  measureIndex: 0,
  voice: 1,
  position: 0,
  pitch: { step: 'C', octave: 4 },
  duration: 4,
  noteType: 'quarter',
});

if (result.success) {
  console.log('Note inserted successfully');
  score = result.data;
} else {
  // Handle errors like NOTE_CONFLICT or EXCEEDS_MEASURE
  console.error('Failed to insert note:', result.errors);
}
```

### Adding a Chord Note
```typescript
import { addChord } from 'musicxml-io/operations';

const result = addChord(score, {
  partIndex: 0,
  measureIndex: 0,
  noteIndex: 0,  // Add chord to first note
  pitch: { step: 'E', octave: 4 },
});

if (result.success) {
  score = result.data;
}
```

### Changing Note Duration
```typescript
import { changeNoteDuration } from 'musicxml-io/operations';

// Extend a quarter note to half note
// Automatically consumes following rests/notes
const result = changeNoteDuration(score, {
  partIndex: 0,
  measureIndex: 0,
  noteIndex: 0,
  newDuration: 8,  // Half note
  noteType: 'half',
});

if (result.success) {
  score = result.data;
}
```

### Adding a Voice
```typescript
import { addVoice } from 'musicxml-io/operations';

// Add voice 2 to measure (filled with whole-measure rest)
const result = addVoice(score, {
  partIndex: 0,
  measureIndex: 0,
  voice: 2,
});

if (result.success) {
  score = result.data;
}
```

### Adding a Part
```typescript
import { addPart } from 'musicxml-io/operations';

const result = addPart(score, {
  id: 'P2',
  name: 'Violin',
});

if (result.success) {
  score = result.data;
}
```

### Moving a Note to Different Staff
```typescript
import { moveNoteToStaff } from 'musicxml-io/operations';

const result = moveNoteToStaff(score, {
  partIndex: 0,
  measureIndex: 0,
  noteIndex: 0,
  targetStaff: 2,
});

if (result.success) {
  score = result.data;
}
```

---

## Validation Integration

### How Operations Use Validator

1. **Clone the score** (immutable pattern)
2. **Apply the mutation**
3. **Validate the affected area**
   - For single-measure ops: `validateMeasureLocal()`
   - For cross-measure ops: `validate()` with focused options
4. **Return Result**
   - Success: return new score
   - Failure: return validation errors

### Validation Options for Operations

Operations use focused validation to be efficient:
```typescript
const opts: LocalValidateOptions = {
  checkMeasureDuration: true,
  checkPosition: true,
  checkVoiceStaff: true,
  checkBeams: false,  // Not affected by note add
  checkTuplets: false, // Not affected by note add
};
```

---

## Error Handling

All operations return structured errors:
```typescript
interface ValidationError {
  code: ValidationErrorCode;
  level: 'error' | 'warning' | 'info';
  message: string;
  location: ValidationLocation;
  details?: Record<string, unknown>;
}
```

Only `level: 'error'` blocks operations. Warnings and infos are allowed.

---

## Legacy API (Deprecated)

For backwards compatibility, these legacy functions are still exported but deprecated:
- `addNote` → Use `insertNote`
- `deleteNote` → Use `removeNote`
- `addChordNote` → Use `addChord`
- `modifyNotePitch` → Use `setNotePitch`
- `modifyNoteDuration` → Use `changeNoteDuration`
- `*Checked` variants → Use the new main API (all operations now return `OperationResult`)
