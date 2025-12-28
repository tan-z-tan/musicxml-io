# Operations API Implementation Checklist

This document defines the Operations API for musicxml-io. All operations are designed to:
1. Return a `Result` type (success with new score, or error with validation details)
2. Guarantee musical validity when successful (no musical inconsistencies)
3. Use the Validator to ensure score integrity after mutation

## Design Principles

### Result Type Pattern
All operations return a `OperationResult<T>` type:
```typescript
type OperationResult<T> =
  | { success: true; data: T }
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

Basic note manipulation with validation.

| Operation | Description | Status |
|-----------|-------------|--------|
| `addNoteChecked` | Add a note with position/duration validation | ✅ |
| `deleteNoteChecked` | Remove a note with validation | ✅ |
| `modifyNotePitchChecked` | Change note pitch with validation | ✅ |
| `modifyNoteDurationChecked` | Change note duration with validation | ✅ |
| `addChordNoteChecked` | Add chord note with validation | ✅ |
| `transposeChecked` | Transpose all notes with validation | ✅ |

### Note Operation Errors
- `MEASURE_DURATION_OVERFLOW` - Note duration exceeds measure capacity
- `INVALID_STAFF_NUMBER` - Staff number is invalid
- `INVALID_VOICE_NUMBER` - Voice number is invalid
- `NEGATIVE_POSITION` - Operation would create negative position

---

## Phase 2: Part Operations ✅

Part-level manipulation.

| Operation | Description | Status |
|-----------|-------------|--------|
| `addPart` | Add a new part to the score | ✅ |
| `removePart` | Remove a part from the score | ✅ |
| `duplicatePart` | Duplicate an existing part | ✅ |

### Part Operation Errors
- `PART_ID_NOT_IN_PART_LIST` - Part ID consistency error
- `DUPLICATE_PART_ID` - Part ID already exists
- `PART_MEASURE_COUNT_MISMATCH` - Measure count doesn't match other parts

---

## Phase 3: Staff Operations ✅

Staff management within parts (e.g., piano grand staff).

| Operation | Description | Status |
|-----------|-------------|--------|
| `setStaves` | Set the number of staves for a part | ✅ |
| `moveNoteToStaff` | Move a note to a different staff | ✅ |

### Staff Operation Errors
- `STAFF_EXCEEDS_STAVES` - Target staff number exceeds declared staves
- `MISSING_CLEF_FOR_STAFF` - Clef not defined for target staff

---

## Phase 4: Measure Operations (Existing - To Be Enhanced)

Existing measure operations to add validation.

| Operation | Description | Status |
|-----------|-------------|--------|
| `insertMeasureChecked` | Insert measure with validation | 🔲 |
| `deleteMeasureChecked` | Delete measure with validation | 🔲 |
| `changeKeyChecked` | Change key with validation | 🔲 |
| `changeTimeChecked` | Change time with validation | 🔲 |
| `setDivisionsChecked` | Set divisions with validation | 🔲 |

---

## Phase 5: Voice Operations

Voice-level manipulation (future).

| Operation | Description | Status |
|-----------|-------------|--------|
| `mergeVoices` | Merge two voices into one | 🔲 |
| `splitVoice` | Split a voice into two | 🔲 |
| `moveToVoice` | Move notes to different voice | 🔲 |

---

## API Usage Examples

### Adding a Note with Validation
```typescript
import { addNoteChecked } from 'musicxml-io/operations';

const result = addNoteChecked(score, {
  partIndex: 0,
  measureIndex: 0,
  voice: 1,
  position: 0,
  note: {
    pitch: { step: 'C', octave: 4 },
    duration: 4,
    noteType: 'quarter',
  },
});

if (result.success) {
  console.log('Note added successfully');
  score = result.data;
} else {
  console.error('Failed to add note:', result.errors);
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
