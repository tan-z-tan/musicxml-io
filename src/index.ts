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
  // Extended Query Types
  VoiceToStaffMap,
  NoteWithContext,
  EntryWithContext,
  DirectionWithContext,
  StaffRange,
  PositionQueryOptions,
  VerticalSlice,
  VoiceLine,
  AdjacentNotes,
  DirectionKind,
  DynamicWithContext,
  TempoWithContext,
  PedalWithContext,
  WedgeWithContext,
  OctaveShiftWithContext,
  // Phase 5: Groups and Spans
  TiedNoteGroup,
  SlurSpan,
  TupletGroup,
  BeamGroup,
  NotationType,
  // Phase 6: Harmony and Lyrics
  HarmonyWithContext,
  LyricWithContext,
  AssembledLyrics,
  // Phase 7: Structure
  BarlineWithContext,
  RepeatInfo,
  EndingInfo,
  KeyChangeInfo,
  TimeChangeInfo,
  ClefChangeInfo,
  StructuralChanges,
} from './types';

// Importers
export { parse, parseCompressed, isCompressed, parseAuto } from './importers';

// Exporters
export { serialize, serializeCompressed, exportMidi } from './exporters';
export type { SerializeOptions, MidiExportOptions } from './exporters';

// Query (all read operations)
export {
  // Measure access
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
  // Staff
  getEntriesForStaff,
  buildVoiceToStaffMap,
  buildVoiceToStaffMapForPart,
  inferStaff,
  getEffectiveStaff,
  getClefForStaff,
  getVoicesForStaff,
  getStaffRange,
  // Position and Voice Line
  getEntriesAtPosition,
  getNotesAtPosition,
  getEntriesInRange,
  getNotesInRange,
  getVerticalSlice,
  getVoiceLine,
  getVoiceLineInRange,
  // Navigation
  iterateEntries,
  getNextNote,
  getPrevNote,
  getAdjacentNotes,
  // Direction and Expression
  getDirections,
  getDirectionsAtPosition,
  findDirectionsByType,
  getDynamics,
  getTempoMarkings,
  getPedalMarkings,
  getWedges,
  getOctaveShifts,
  // Groups and Spans
  getTiedNoteGroups,
  getSlurSpans,
  getTupletGroups,
  getBeamGroups,
  findNotesWithNotation,
  // Harmony and Lyrics
  getHarmonies,
  getHarmonyAtPosition,
  getChordProgression,
  getLyrics,
  getLyricText,
  getVerseCount,
  // Structure
  getRepeatStructure,
  findBarlines,
  getEndings,
  getKeyChanges,
  getTimeChanges,
  getClefChanges,
  getStructuralChanges,
  // Part utilities
  getPartByIndex,
  getPartCount,
  getPartIds,
  // Score-level queries
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
export type { VoiceFilter, NormalizedPositionOptions, PitchRange, FindNotesFilter, RoundtripMetrics } from './query';

// Operations (re-export for convenience)
export {
  transpose,
  addNote,
  deleteNote,
  changeKey,
  changeTime,
  insertMeasure,
  deleteMeasure,
  addChordNote,
  modifyNotePitch,
  modifyNoteDuration,
} from './operations';

// File operations
export { parseFile, serializeToFile, decodeBuffer } from './file';

// Utils (shared pitch and position utilities)
export {
  STEPS,
  STEP_SEMITONES,
  pitchToSemitone,
  getMeasureEndPosition,
} from './utils';

// Entry-level accessors (for DirectionEntry, NoteEntry, PartInfo)
export {
  // DirectionEntry - Generic
  getDirectionOfKind,
  getDirectionsOfKind,
  hasDirectionOfKind,
  // DirectionEntry - Sound
  getSoundTempo,
  getSoundDynamics,
  getSoundDamperPedal,
  getSoundSoftPedal,
  getSoundSostenutoPedal,
  // NoteEntry
  isRest,
  isPitchedNote,
  isUnpitchedNote,
  isChordNote,
  isGraceNote,
  hasTie,
  hasTieStart,
  hasTieStop,
  isCueNote,
  hasBeam,
  hasLyrics,
  hasNotations,
  hasTuplet,
  // PartList
  isPartInfo,
  getPartInfo,
  getPartName,
  getPartAbbreviation,
  getAllPartInfos,
  getPartNameMap,
} from './entry-accessors';
export type { DirectionTypeOfKind } from './entry-accessors';

// ID generation
export { generateId } from './id';

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
  // Local validation for operations
  validateMeasureLocal,
  getMeasureContext,
  assertMeasureValid,
} from './validator';
export type {
  ValidationError,
  ValidationResult,
  ValidationLocation,
  ValidationErrorCode,
  ValidationLevel,
  ValidateOptions,
  // Local validation types
  MeasureValidationContext,
  LocalValidateOptions,
} from './validator';
