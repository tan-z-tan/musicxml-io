// Core types
export type {
  Score,
  ScoreMetadata,
  PartInfo,
  PartGroup,
  PartListEntry,
  Part,
  Measure,
  MeasureAttributes,
  MeasureEntry,
  NoteEntry,
  BackupEntry,
  ForwardEntry,
  DirectionEntry,
  Pitch,
  NoteType,
  Accidental,
  AccidentalInfo,
  TieInfo,
  BeamInfo,
  Notation,
  DirectionType,
  DynamicsValue,
  Lyric,
  TimeSignature,
  KeySignature,
  Clef,
  Transpose,
  Barline,
  VoiceGroup,
  StaffGroup,
  NoteWithPosition,
  Chord,
  NoteIteratorItem,
  Print,
  Defaults,
  Credit,
} from './types';

// Importers
export { parse, parseCompressed, isCompressed, parseAuto } from './importers';

// Exporters
export { serialize, serializeCompressed, exportMidi } from './exporters';
export type { SerializeOptions, MidiExportOptions } from './exporters';

// Accessors (re-export for convenience)
export {
  getNotesForVoice,
  getNotesForStaff,
  groupByVoice,
  groupByStaff,
  getAbsolutePosition,
  withAbsolutePositions,
  getChords,
  iterateNotes,
  getAllNotes,
  getVoices,
  getStaves,
  hasNotes,
  isRestMeasure,
  getNormalizedPosition,
  getNormalizedDuration,
} from './accessors';
export type { VoiceFilter, NormalizedPositionOptions } from './accessors';

// Query (re-export for convenience)
export {
  getMeasure,
  getMeasureByIndex,
  getMeasureCount,
  getDivisions,
  getAttributesAtMeasure,
  findNotes,
  getDuration,
  getPartById,
  getPartIndex,
  hasMultipleStaves,
  getStaveCount,
  measureRoundtrip,
  countNotes,
  scoresEqual,
} from './query';
export type { PitchRange, FindNotesFilter, RoundtripMetrics } from './query';

// Operations (re-export for convenience)
export {
  transpose,
  addNote,
  deleteNote,
  changeKey,
  changeTime,
  insertMeasure,
  deleteMeasure,
  setDivisions,
  addChordNote,
  modifyNotePitch,
  modifyNoteDuration,
} from './operations';
export type { AddNoteOptions } from './operations';

// File operations
export { parseFile, serializeToFile, decodeBuffer } from './file';

// Validator
export {
  validate,
  isValid,
  assertValid,
  validateDivisions,
  validateMeasureDuration,
  validateBackupForward,
  validateTies,
  validateBeams,
  validateSlurs,
  validateTuplets,
  validatePartReferences,
  validatePartStructure,
  validateStaffStructure,
  validateVoiceStaff,
  validateTiesAcrossMeasures,
  validateSlursAcrossMeasures,
  formatLocation,
  ValidationException,
} from './validator';
export type {
  ValidationError,
  ValidationResult,
  ValidationLocation,
  ValidationErrorCode,
  ValidationLevel,
  ValidateOptions,
} from './validator';
