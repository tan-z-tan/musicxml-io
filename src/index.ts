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
export { parse, parseCompressed, isCompressed, parseAuto, parseAbc } from './importers';

// Exporters
export { serialize, serializeCompressed, exportMidi, serializeAbc } from './exporters';
export type { SerializeOptions, MidiExportOptions, AbcSerializeOptions } from './exporters';

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
  // Note operations
  insertNote,
  removeNote,
  addChord,
  setNotePitch,
  setNotePitchBySemitone,
  shiftNotePitch,
  changeNoteDuration,
  raiseAccidental,
  lowerAccidental,
  transpose,
  // Legacy note operations (backwards compatibility)
  addNote,
  deleteNote,
  addChordNote,
  modifyNotePitch,
  modifyNoteDuration,
  addNoteChecked,
  deleteNoteChecked,
  addChordNoteChecked,
  modifyNotePitchChecked,
  modifyNoteDurationChecked,
  transposeChecked,
  // Voice operations
  addVoice,
  // Part operations
  addPart,
  removePart,
  duplicatePart,
  // Staff operations
  setStaves,
  moveNoteToStaff,
  // Measure operations
  changeKey,
  changeTime,
  insertMeasure,
  deleteMeasure,
  // Tie operations
  addTie,
  removeTie,
  // Slur operations
  addSlur,
  removeSlur,
  // Articulation operations
  addArticulation,
  removeArticulation,
  // Dynamics operations
  addDynamics,
  removeDynamics,
  modifyDynamics,
  // Clef operations
  insertClefChange,
  changeClef,
  // Tuplet operations
  createTuplet,
  removeTuplet,
  // Beam operations
  addBeam,
  removeBeam,
  autoBeam,
  setBeaming,
  // Copy/Paste operations
  copyNotes,
  pasteNotes,
  cutNotes,
  copyNotesMultiMeasure,
  pasteNotesMultiMeasure,
  // Tempo operations
  addTempo,
  removeTempo,
  modifyTempo,
  // Wedge (crescendo/diminuendo) operations
  addWedge,
  removeWedge,
  // Fermata operations
  addFermata,
  removeFermata,
  // Ornament operations
  addOrnament,
  removeOrnament,
  // Pedal operations
  addPedal,
  removePedal,
  // Text operations
  addTextDirection,
  addText,
  addRehearsalMark,
  // Repeat and barline operations
  addRepeatBarline,
  removeRepeatBarline,
  addRepeat,
  removeRepeat,
  addEnding,
  removeEnding,
  changeBarline,
  setBarline,
  addSegno,
  addCoda,
  addDaCapo,
  addDalSegno,
  addFine,
  addToCoda,
  // Grace note operations
  addGraceNote,
  removeGraceNote,
  convertToGrace,
  // Lyric operations
  addLyric,
  removeLyric,
  updateLyric,
  // Harmony (chord symbol) operations
  addHarmony,
  removeHarmony,
  updateHarmony,
  addChordSymbol,
  removeChordSymbol,
  updateChordSymbol,
  // Technical notation operations
  addFingering,
  removeFingering,
  addBowing,
  removeBowing,
  addStringNumber,
  removeStringNumber,
  // Octave shift operations
  addOctaveShift,
  stopOctaveShift,
  removeOctaveShift,
  // Breath mark operations
  addBreathMark,
  removeBreathMark,
  // Caesura operations
  addCaesura,
  removeCaesura,
} from './operations';

// Operation types
export type {
  OperationResult,
  OperationErrorCode,
  // Note operation options
  InsertNoteOptions,
  RemoveNoteOptions,
  AddChordOptions,
  ChangeNoteDurationOptions,
  SetNotePitchOptions,
  SetNotePitchBySemitoneOptions,
  ShiftNotePitchOptions,
  RaiseAccidentalOptions,
  LowerAccidentalOptions,
  // Voice operation options
  AddVoiceOptions,
  // Part operation options
  AddPartOptions,
  DuplicatePartOptions,
  // Staff operation options
  SetStavesOptions,
  MoveNoteToStaffOptions,
  // Tie operation options
  AddTieOptions,
  RemoveTieOptions,
  // Slur operation options
  AddSlurOptions,
  RemoveSlurOptions,
  // Articulation operation options
  AddArticulationOptions,
  RemoveArticulationOptions,
  // Dynamics operation options
  AddDynamicsOptions,
  RemoveDynamicsOptions,
  ModifyDynamicsOptions,
  // Clef operation options
  InsertClefChangeOptions,
  ChangeClefOptions,
  // Tuplet operation options
  CreateTupletOptions,
  RemoveTupletOptions,
  // Beam operation options
  AddBeamOptions,
  RemoveBeamOptions,
  AutoBeamOptions,
  SetBeamingOptions,
  // Copy/Paste operation options
  NoteSelection,
  CopyNotesOptions,
  PasteNotesOptions,
  CutNotesOptions,
  CopyNotesMultiMeasureOptions,
  MultiMeasureSelection,
  PasteNotesMultiMeasureOptions,
  // Tempo operation options
  AddTempoOptions,
  RemoveTempoOptions,
  ModifyTempoOptions,
  // Wedge operation options
  AddWedgeOptions,
  RemoveWedgeOptions,
  // Fermata operation options
  AddFermataOptions,
  RemoveFermataOptions,
  // Ornament operation options
  AddOrnamentOptions,
  RemoveOrnamentOptions,
  // Pedal operation options
  AddPedalOptions,
  RemovePedalOptions,
  // Text operation options
  AddTextDirectionOptions,
  AddTextOptions,
  AddRehearsalMarkOptions,
  // Repeat and barline operation options
  AddRepeatBarlineOptions,
  RemoveRepeatBarlineOptions,
  AddRepeatOptions,
  RemoveRepeatOptions,
  AddEndingOptions,
  RemoveEndingOptions,
  ChangeBarlineOptions,
  SetBarlineOptions,
  BarStyle,
  AddSegnoOptions,
  AddCodaOptions,
  AddNavigationOptions,
  // Grace note operation options
  AddGraceNoteOptions,
  RemoveGraceNoteOptions,
  ConvertToGraceOptions,
  // Lyric operation options
  AddLyricOptions,
  RemoveLyricOptions,
  UpdateLyricOptions,
  // Harmony (chord symbol) operation options
  HarmonyKind,
  AddHarmonyOptions,
  RemoveHarmonyOptions,
  UpdateHarmonyOptions,
  AddChordSymbolOptions,
  RemoveChordSymbolOptions,
  UpdateChordSymbolOptions,
  // Technical notation operation options
  AddFingeringOptions,
  RemoveFingeringOptions,
  BowingType,
  AddBowingOptions,
  RemoveBowingOptions,
  AddStringNumberOptions,
  RemoveStringNumberOptions,
  // Octave shift operation options
  OctaveShiftType,
  AddOctaveShiftOptions,
  StopOctaveShiftOptions,
  RemoveOctaveShiftOptions,
  // Breath mark operation options
  BreathMarkValue,
  AddBreathMarkOptions,
  RemoveBreathMarkOptions,
  // Caesura operation options
  CaesuraValue,
  AddCaesuraOptions,
  RemoveCaesuraOptions,
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
