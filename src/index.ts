// Core types
export type {
  Score,
  ScoreMetadata,
  PartInfo,
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
  TieInfo,
  BeamInfo,
  Notation,
  NotationType,
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
} from './types';

// Parser
export { parse } from './parser';

// Serializer
export { serialize } from './serializer';
export type { SerializeOptions } from './serializer';

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
} from './accessors';
export type { VoiceFilter } from './accessors';

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
} from './query';
export type { PitchRange, FindNotesFilter } from './query';

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

// Compressed format (.mxl)
export {
  parseCompressed,
  serializeCompressed,
  isCompressed,
  parseAuto,
} from './compressed';

// File operations
export { parseFile, serializeToFile } from './file';
