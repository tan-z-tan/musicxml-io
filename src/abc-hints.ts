/**
 * Round-trip hints of the ABC importer, kept in line with the score.
 *
 * Parsing ABC records how the tune was written — its header lines, voice
 * layout, line breaks and comments — in `metadata.miscellaneous`, so that
 * writing it back gives the same text. Those hints describe the score as it
 * was parsed, and once the score is edited they can disagree with it.
 *
 * The importer therefore also stores a snapshot of what the hints were
 * written for (`abc-snapshot`): the header values, and the parts and
 * measures by id. Before serializing, `reconcileAbcHints` compares it with
 * the score. Hints whose source is unchanged are kept as they are; hints
 * about parts and measures follow them by id; header lines whose value has
 * changed are rewritten from the score. The score is always the source of
 * truth: a hint can change how something is written, never what.
 */

import type { Score, Clef, KeySignature, Measure, TimeSignature, DirectionEntry } from './types';
import { locateAbcClefSpec, withKeyTonic } from './abc-fields';

// ============================================================
// Snapshot
// ============================================================

/** Header values that ABC header lines are written for. */
type HeaderGroup = 'title' | 'composer' | 'origin' | 'source' | 'encoder' | 'meter' | 'key' | 'tempo';

interface AbcSnapshot {
  /** Each header value as JSON, as it was when the header lines were read. */
  header: Record<HeaderGroup, string>;
  /** Parts in order, with their measures by id. */
  parts: Array<{ id: string; measures: string[] }>;
}

const SNAPSHOT = 'abc-snapshot';

/** JSON of a value without its `_id`s, which say nothing about the music. */
function project(value: unknown): string {
  return JSON.stringify(value ?? null, (key, v) => (key === '_id' ? undefined : v));
}

/** The direction that sets the tempo at the start of the tune, if any. */
function firstTempo(measure?: Measure): DirectionEntry | undefined {
  return measure?.entries.find((e): e is DirectionEntry =>
    e.type === 'direction' &&
    (e.directionTypes.some(dt => dt.kind === 'metronome') || e.sound?.tempo !== undefined));
}

function headerValues(score: Score): Record<HeaderGroup, string> {
  const meta = score.metadata;
  const first = score.parts[0]?.measures[0];
  const time = first?.attributes?.time;
  const key = first?.attributes?.key;
  const tempo = firstTempo(first);
  return {
    title: project(meta.movementTitle),
    composer: project(meta.creators?.filter(c => c.type === 'composer').map(c => c.value)),
    origin: project(meta.creators?.filter(c => c.type === 'origin').map(c => c.value)),
    source: project(meta.source),
    encoder: project(meta.encoding?.encoder),
    meter: project(time && {
      beats: time.beats, beatType: time.beatType, symbol: time.symbol,
      senzaMisura: time.senzaMisura, beatsList: time.beatsList,
    }),
    key: project(key && { fifths: key.fifths, mode: key.mode ?? 'major' }),
    tempo: project(tempo && {
      metronome: tempo.directionTypes.filter(dt => dt.kind === 'metronome'),
      tempo: tempo.sound?.tempo,
    }),
  };
}

function structureOf(score: Score): AbcSnapshot['parts'] {
  return score.parts.map(p => ({ id: p.id, measures: p.measures.map(m => m._id) }));
}

/** The snapshot entry the importer stores next to its round-trip hints. */
export function abcSnapshotField(score: Score): { name: string; value: string } {
  const snapshot: AbcSnapshot = { header: headerValues(score), parts: structureOf(score) };
  return { name: SNAPSHOT, value: JSON.stringify(snapshot) };
}

// ============================================================
// Reconciliation
// ============================================================

/** How the serializer writes the values a rewritten header line needs. */
export interface AbcHeaderWriters {
  key(key: KeySignature): string;
  time(time: TimeSignature): string;
  /** Q: value for the tempo set in a measure, or null when it sets none. */
  tempo(measure?: Measure): string | null;
  /** ABC name of a clef, or null when ABC has none for it. */
  clef(clef: Clef): string | null;
}

/** Mutable view of `metadata.miscellaneous`, read and written by name. */
class Hints {
  constructor(public entries: Array<{ name: string; value: string }>) {}

  json<T>(name: string): T | undefined {
    const value = this.entries.find(m => m.name === name)?.value;
    return value ? JSON.parse(value) as T : undefined;
  }

  /** Replace a hint, or remove it when `value` is undefined. */
  put(name: string, value: unknown): void {
    const index = this.entries.findIndex(m => m.name === name);
    this.entries = this.entries.filter(m => m.name !== name);
    if (value === undefined) return;
    const entry = { name, value: typeof value === 'string' ? value : JSON.stringify(value) };
    this.entries.splice(index >= 0 ? index : this.entries.length, 0, entry);
  }

  names(prefix: string): string[] {
    return this.entries.filter(m => m.name.startsWith(prefix)).map(m => m.name);
  }
}

/**
 * The score with its ABC round-trip hints brought in line with it, so that
 * serializing writes what the score holds now rather than what was parsed.
 * A score without hints, or whose hints still match, is returned unchanged.
 */
export function reconcileAbcHints(score: Score, write: AbcHeaderWriters): Score {
  const misc = score.metadata.miscellaneous;
  if (!misc?.some(m => m.name.startsWith('abc-'))) return score;
  const hints = new Hints([...misc]);
  const snapshot = hints.json<AbcSnapshot>(SNAPSHOT);

  // Scores parsed before snapshots were stored can only have their clefs checked
  if (snapshot) {
    if (project(snapshot.parts) !== project(structureOf(score))) followParts(hints, snapshot, score);
    const now = headerValues(score);
    const stale = new Set((Object.keys(now) as HeaderGroup[]).filter(g => snapshot.header[g] !== now[g]));
    if (stale.size > 0) rewriteHeader(hints, stale, score, write);
  }
  syncClefs(hints, score, write);

  if (project(hints.entries) === project(misc)) return score;
  return { ...score, metadata: { ...score.metadata, miscellaneous: hints.entries } };
}

// ============================================================
// Parts and measures
// ============================================================

/**
 * Re-key the hints stored by part index or measure index after parts or
 * measures were added, removed or reordered. Hints of a removed part go;
 * an added part gets none, and is written from the score alone.
 */
function followParts(hints: Hints, snapshot: AbcSnapshot, score: Score): void {
  const voiceIds = hints.json<string[]>('abc-voice-ids') ?? snapshot.parts.map((_, i) => String(i + 1));
  const origIndex = score.parts.map(p => snapshot.parts.findIndex(o => o.id === p.id));

  // Voice IDs follow their parts; an added part gets the next free number
  const used = new Set(voiceIds);
  let next = voiceIds.length;
  const newVoiceIds = origIndex.map(o => {
    if (o >= 0 && voiceIds[o] !== undefined) return voiceIds[o];
    while (used.has(String(++next)));
    used.add(String(next));
    return String(next);
  });
  const removed = new Set(voiceIds.filter((_, o) => !origIndex.includes(o)));

  /** Current index of each original measure of a part (-1 when deleted). */
  const measureMaps = origIndex.map((o, j) => {
    if (o < 0) return [];
    const now = new Map(score.parts[j].measures.map((m, i) => [m._id, i]));
    return snapshot.parts[o].measures.map(id => now.get(id) ?? -1);
  });
  /** Current index of the measure that was at `orig`, or of the first one kept after it. */
  const followMeasure = (j: number, orig: number): number => {
    const map = measureMaps[j];
    for (let k = orig; k < map.length; k++) if (map[k] >= 0) return map[k];
    return score.parts[j].measures.length;
  };

  hints.put('abc-voice-ids', newVoiceIds);

  // Per-part hints stored by part index
  const octaves = hints.names('abc-voice-octave-').map(n => [n, hints.json<number>(n)] as const);
  const breaks = hints.names('abc-line-breaks-').map(n => [n, hints.json<number[]>(n)] as const);
  for (const [n] of [...octaves, ...breaks]) hints.put(n, undefined);
  origIndex.forEach((o, j) => {
    if (o < 0) return;
    const octave = octaves.find(([n]) => n === `abc-voice-octave-${o}`)?.[1];
    if (octave !== undefined) hints.put(`abc-voice-octave-${j}`, String(octave));
    const lineBreaks = breaks.find(([n]) => n === `abc-line-breaks-${o}`)?.[1];
    if (lineBreaks) {
      // A line that ended on a deleted measure now ends on the last one kept
      // before it; negative values are continuations (\)
      const moved = new Map<number, number>();
      for (const v of lineBreaks) {
        let orig = Math.abs(v) - 1;
        while (orig >= 0 && (measureMaps[j][orig] ?? -1) < 0) orig--;
        if (orig >= 0 && !moved.has(measureMaps[j][orig])) moved.set(measureMaps[j][orig], Math.sign(v));
      }
      hints.put(`abc-line-breaks-${j}`, [...moved].map(([at, sign]) => sign * (at + 1)));
    }
  });
  // The part-wide hints describe the first voice
  const firstIsFirst = origIndex[0] === 0;
  hints.put('abc-line-breaks', hints.json<number[]>('abc-line-breaks-0') ?? undefined);
  if (!firstIsFirst || measureMaps[0].some(i => i < 0) || measureMaps[0].length !== score.parts[0]?.measures.length) {
    for (const n of ['abc-lyrics-after-all', 'abc-lyrics-line-counts', 'abc-lyrics-line-verses']) hints.put(n, undefined);
  }

  // Hints stored by voice ID: drop those of removed voices
  const isRemovedLine = (line: string) => {
    const id = line.match(/^\[?V:\s*([^\s\]%]+)/)?.[1];
    return id !== undefined && removed.has(id);
  };
  const headerOrder = hints.json<string[]>('abc-header-order');
  if (headerOrder) hints.put('abc-header-order', headerOrder.filter(l => !isRemovedLine(l)));
  for (const name of ['abc-voice-full-lines', 'abc-inline-voice-markers']) {
    const byVoice = hints.json<Record<string, string>>(name);
    if (byVoice) {
      for (const id of removed) delete byVoice[id];
      hints.put(name, byVoice);
    }
  }
  const declLines = hints.json<string[]>('abc-voice-declaration-lines');
  if (declLines) hints.put('abc-voice-declaration-lines', declLines.filter(l => !isRemovedLine(l)));
  const bodyLines = hints.json<string[]>('abc-body-voice-lines');
  const preComments = hints.json<string[][]>('abc-pre-voice-comments');
  if (bodyLines) {
    const keep = bodyLines.map(l => !isRemovedLine(l));
    hints.put('abc-body-voice-lines', bodyLines.filter((_, i) => keep[i]));
    if (preComments) hints.put('abc-pre-voice-comments', preComments.filter((_, i) => keep[i]));
  }

  // Comments inside a voice sit before a measure: they move with it
  const voiceComments = hints.json<Record<string, Array<{ barIndex: number; comment: string }>>>('abc-voice-comments');
  if (voiceComments) {
    const moved: typeof voiceComments = {};
    newVoiceIds.forEach((id, j) => {
      if (origIndex[j] < 0 || !voiceComments[id]) return;
      moved[id] = voiceComments[id].map(c => ({ ...c, barIndex: followMeasure(j, c.barIndex) }));
    });
    hints.put('abc-voice-comments', moved);
  }

  // Voice groups: re-count each group's bars from the measures it held
  const pattern = hints.json<string[][]>('abc-voice-interleave');
  const counts = hints.json<number[][]>('abc-group-bar-counts');
  if (pattern && counts) {
    const regrouped = regroup(pattern, counts, newVoiceIds, origIndex.map(o => o < 0), measureMaps, score);
    hints.put('abc-voice-interleave', regrouped?.pattern);
    hints.put('abc-group-bar-counts', regrouped?.counts);
  }
}

/**
 * Voice groups (the voices written one after another before switching back,
 * with the bars each writes) recounted for the current measures. A measure
 * stays in the group it was in; an inserted one joins the group of the
 * measure before it; an added voice is written after all of them. Returns
 * null when the groups can no longer be kept, and the voices are then written
 * one after another.
 */
function regroup(
  pattern: string[][],
  counts: number[][],
  voiceIds: string[],
  added: boolean[],
  measureMaps: number[][],
  score: Score,
): { pattern: string[][]; counts: number[][] } | null {
  const newPattern: string[][] = [];
  const newCounts: number[][] = [];
  const groupOf = new Map<string, number[]>();
  for (const [j, id] of voiceIds.entries()) {
    if (added[j]) continue;
    // Group of each original measure, in the order the groups wrote them
    const origGroups: number[] = [];
    pattern.forEach((group, gi) => {
      const at = group.indexOf(id);
      if (at >= 0) for (let k = 0; k < (counts[gi]?.[at] ?? 0); k++) origGroups.push(gi);
    });
    if (origGroups.length !== measureMaps[j].length) return null;
    const current: number[] = [];
    let last = origGroups[0] ?? 0;
    const origAt = new Map(measureMaps[j].map((now, orig) => [now, orig]));
    for (let i = 0; i < score.parts[j].measures.length; i++) {
      const orig = origAt.get(i);
      if (orig !== undefined) last = origGroups[orig];
      current.push(last);
    }
    groupOf.set(id, current);
  }
  pattern.forEach((group, gi) => {
    const voices = group.filter(id => groupOf.has(id));
    if (voices.length === 0) return;
    const voiceCounts = voices.map(id => groupOf.get(id)!.filter(g => g === gi).length);
    // A voice with no bar left in a group would be written with a guessed length
    if (voiceCounts.includes(0)) return;
    newPattern.push(voices);
    newCounts.push(voiceCounts);
  });
  // Every measure must still be written by exactly one group
  for (const [id, groups] of groupOf) {
    const kept = newPattern.reduce((n, g, gi) => n + (g.includes(id) ? newCounts[gi][g.indexOf(id)] : 0), 0);
    if (kept !== groups.length) return null;
  }
  // Voices are read back in the order they first appear: that must be the order of the parts
  const firstAppearance = [...new Set(newPattern.flat())];
  const kept = voiceIds.filter((id, j) => !added[j] && groupOf.has(id));
  if (firstAppearance.join('\n') !== kept.join('\n')) return null;
  if (added.some((isAdded, j) => isAdded && added.slice(j).includes(false))) return null;
  const addedVoices = voiceIds.filter((_, j) => added[j] && score.parts[j].measures.length > 0);
  if (addedVoices.length > 0) {
    newPattern.push(addedVoices);
    newCounts.push(addedVoices.map(id => score.parts[voiceIds.indexOf(id)].measures.length));
  }
  return { pattern: newPattern, counts: newCounts };
}

// ============================================================
// Header
// ============================================================

const FIELD_GROUP: Record<string, HeaderGroup> = {
  T: 'title', C: 'composer', O: 'origin', S: 'source', Z: 'encoder', M: 'meter', Q: 'tempo', K: 'key',
};
/** Order of the fields as the serializer writes a header of its own. */
const CANONICAL_ORDER = 'XTCOSZMLQK';

/** Header lines for a value, as the serializer writes them. */
function headerLines(group: HeaderGroup, score: Score, write: AbcHeaderWriters): string[] {
  const meta = score.metadata;
  const first = score.parts[0]?.measures[0];
  switch (group) {
    case 'title': return meta.movementTitle !== undefined ? [`T:${meta.movementTitle}`] : [];
    case 'composer': return (meta.creators ?? []).filter(c => c.type === 'composer').map(c => `C:${c.value}`);
    case 'origin': return (meta.creators ?? []).filter(c => c.type === 'origin').map(c => `O:${c.value}`);
    case 'source': return meta.source !== undefined ? [`S:${meta.source}`] : [];
    case 'encoder': return (meta.encoding?.encoder ?? []).map(e => `Z:${e}`);
    case 'meter': {
      const time = first?.attributes?.time;
      return time ? [`M:${write.time(time)}`] : [];
    }
    case 'tempo': {
      const tempo = write.tempo(first);
      return tempo ? [`Q:${tempo}`] : [];
    }
    case 'key': {
      const key = first?.attributes?.key;
      return [`K:${key ? write.key(key) : 'C'}`];
    }
  }
}

/**
 * Rewrite the header lines of values that changed since parsing, keeping
 * every other line (and the order of all of them) as it was written.
 */
function rewriteHeader(hints: Hints, stale: Set<HeaderGroup>, score: Score, write: AbcHeaderWriters): void {
  // The stored tempo text stands in for Q: when the header is built afresh
  if (stale.has('tempo')) hints.put('abc-tempo', undefined);
  const lines = hints.json<string[]>('abc-header-order');
  if (!lines) return;

  const fieldOf = (line: string) => line.match(/^([A-Za-z+]):/)?.[1];
  // Only the last T: line is the title; the ones before it are kept as written
  const lastTitle = lines.map(fieldOf).lastIndexOf('T');
  const out: string[] = [];
  const written = new Set<HeaderGroup>();
  let previous: HeaderGroup | undefined;
  lines.forEach((line, i) => {
    const field = fieldOf(line);
    // A +: continuation goes with the line it continues
    if (field === '+') {
      if (!(previous && stale.has(previous))) out.push(line);
      return;
    }
    const group = field ? FIELD_GROUP[field] : undefined;
    previous = group;
    if (!group || !stale.has(group)) {
      out.push(line);
    } else if (group === 'key') {
      out.push(withKey(line, score, write));
      written.add(group);
    } else if (group === 'title') {
      if (score.metadata.movementTitle === undefined) return;
      out.push(i === lastTitle ? headerLines('title', score, write)[0] : line);
      if (i === lastTitle) written.add(group);
    } else if (!written.has(group)) {
      out.push(...headerLines(group, score, write));
      written.add(group);
    }
  });

  // Values the parsed header had no line for go where the serializer would put them
  for (const group of stale) {
    if (written.has(group)) continue;
    const add = headerLines(group, score, write);
    if (add.length === 0) continue;
    const rank = CANONICAL_ORDER.indexOf(Object.keys(FIELD_GROUP).find(f => FIELD_GROUP[f] === group)!);
    const at = out.findIndex(l => CANONICAL_ORDER.indexOf(fieldOf(l) ?? '') > rank);
    out.splice(at >= 0 ? at : out.length, 0, ...add);
  }
  hints.put('abc-header-order', out);
}

/** A K: line with its key set to the score's, keeping its clef and other parameters. */
function withKey(line: string, score: Score, write: AbcHeaderWriters): string {
  const key = score.parts[0]?.measures[0]?.attributes?.key;
  const { body, comment } = splitComment(line);
  return body.slice(0, 2) + withKeyTonic(body.slice(2), key ? write.key(key) : 'C') + comment;
}

// ============================================================
// Clefs
// ============================================================

/**
 * Bring the clef of the kept K: and V: lines in line with the clef each part
 * starts with. Lines whose clef still matches are left untouched.
 */
function syncClefs(hints: Hints, score: Score, write: AbcHeaderWriters): void {
  const headerOrder = hints.json<string[]>('abc-header-order');
  const fullLines = hints.json<Record<string, string>>('abc-voice-full-lines');
  const declLines = hints.json<string[]>('abc-voice-declaration-lines');
  const bodyLines = hints.json<string[]>('abc-body-voice-lines');
  const voiceIds = hints.json<string[]>('abc-voice-ids') ?? [];
  if (!headerOrder && !fullLines && !declLines && !bodyLines) return;

  // A clef on K: applies to every voice that names none (treble when K: has none either)
  const kIdx = headerOrder?.findIndex(l => /^K:/.test(l)) ?? -1;
  const kClef = kIdx >= 0 ? locateAbcClefSpec(splitComment(headerOrder![kIdx].slice(2)).body)?.clef : undefined;
  const kName = write.clef(kClef ?? { sign: 'G', line: 2 });
  const multiVoice = score.parts.length > 1;
  const inlineMarkers = Object.keys(hints.json<Record<string, string>>('abc-inline-voice-markers') ?? {}).length > 0;
  let changed = false;

  score.parts.forEach((part, partIdx) => {
    const first = part.measures[0];
    const clef = staffOneClef(first?.attributes?.clef);
    const wanted = clef ? write.clef(clef) : null;
    if (!wanted) return;
    // An inline [K:bass] inside the first bar also sets that bar's clef; the
    // marker writes it back, so the clef in the header is not the one changed
    if (first && inlineKeyMarkerClefs(first, write).includes(wanted)) return;

    // Lines that define this voice: in the header, its first V: in the body,
    // and the definition written when the voices are written one by one
    const voiceId = voiceIds[partIdx] ?? String(partIdx + 1);
    const isVoiceLine = (l: string) => new RegExp(`^\\[?V:\\s*${escapeRegExp(voiceId)}(?=[\\s\\]%]|$)`).test(l);
    const defs: Array<{ get: () => string; set: (l: string) => void; kind: 'header' | 'body' | 'full' }> = [];
    headerOrder?.forEach((l, i) => {
      if (isVoiceLine(l)) defs.push({ get: () => headerOrder[i], set: v => { headerOrder[i] = v; }, kind: 'header' });
    });
    // Only lines that get written count: the declaration lines with inline
    // [V:] markers, and the body V: lines only when there are several voices
    if (multiVoice && !inlineMarkers && fullLines?.[voiceId] !== undefined) {
      defs.push({ get: () => fullLines[voiceId], set: v => { fullLines[voiceId] = v; }, kind: 'full' });
    }
    const list = inlineMarkers ? declLines : multiVoice ? bodyLines : undefined;
    const bodyIdx = list?.findIndex(isVoiceLine) ?? -1;
    if (bodyIdx >= 0) defs.push({ get: () => list![bodyIdx], set: v => { list![bodyIdx] = v; }, kind: 'body' });

    const voiceClef = defs.map(d => VOICE_CLEF_RE.exec(splitComment(d.get()).body)?.[1]).find(Boolean);
    const stored = voiceClef ? write.clef(locateAbcClefSpec(`clef=${voiceClef}`)!.clef) : kName;
    if (stored === wanted) return;
    changed = true;

    if (!voiceClef && !multiVoice && kIdx >= 0) {
      headerOrder![kIdx] = withKeyFieldClef(headerOrder![kIdx], wanted);
    } else if (defs.length > 0) {
      // Replace the clef where the voice names one; otherwise add it to the
      // header definition, or to the first body V: line when there is none
      const hasHeaderDef = defs.some(d => d.kind === 'header');
      for (const d of defs) {
        const named = VOICE_CLEF_RE.test(splitComment(d.get()).body);
        const define = d.kind === 'full' || (d.kind === 'header') === hasHeaderDef;
        if (voiceClef ? named : define) d.set(withVoiceFieldClef(d.get(), wanted));
      }
    }
  });
  if (!changed) return;

  if (headerOrder) hints.put('abc-header-order', headerOrder);
  if (fullLines) hints.put('abc-voice-full-lines', fullLines);
  if (declLines) hints.put('abc-voice-declaration-lines', declLines);
  if (bodyLines) hints.put('abc-body-voice-lines', bodyLines);
}

/** `clef=` parameter of a V: field (the only clef form a voice definition is read with). */
const VOICE_CLEF_RE = /clef\s*=\s*([^\s\]]+)/i;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Split a field line into its content and a trailing `% comment` (with the space before it). */
function splitComment(line: string): { body: string; comment: string } {
  const m = line.match(/^([^%]*?)(\s*%.*)?$/);
  return { body: m?.[1] ?? line, comment: m?.[2] ?? '' };
}

/** A K: line with its clef (`clef=perc`, bare `bass`, or none) set to `name`. */
function withKeyFieldClef(line: string, name: string): string {
  const { body, comment } = splitComment(line);
  const value = body.slice(2);
  const found = locateAbcClefSpec(value);
  const newValue = found
    ? value.slice(0, found.start) + `clef=${name}` + value.slice(found.end)
    : value.trimEnd() + (value.trim() ? ' ' : '') + `clef=${name}`;
  return body.slice(0, 2) + newValue + comment;
}

/** A V: line (or inline [V:...] marker) with its `clef=` set to `name`. */
function withVoiceFieldClef(line: string, name: string): string {
  const { body, comment } = splitComment(line);
  if (VOICE_CLEF_RE.test(body)) return body.replace(VOICE_CLEF_RE, `clef=${name}`) + comment;
  const close = body.match(/\s*\]\s*$/)?.[0] ?? '';
  return body.slice(0, body.length - close.length).trimEnd() + ` clef=${name}` + close + comment;
}

/** The clef of the first (or only) staff, which is the one an ABC voice shows. */
export function staffOneClef(clefs?: Clef[]): Clef | undefined {
  return clefs?.find(c => (c.staff ?? 1) === 1);
}

/** ABC names of the clefs set by inline [K:...] markers in a measure. */
function inlineKeyMarkerClefs(measure: Measure, write: AbcHeaderWriters): string[] {
  const names: string[] = [];
  for (const e of measure.entries) {
    if (e.type !== 'direction') continue;
    for (const dt of e.directionTypes) {
      const field = dt.kind === 'words' ? dt.text.match(/^\[K:([^\]]*)\]$/) : null;
      const clef = field ? locateAbcClefSpec(field[1])?.clef : undefined;
      const name = clef ? write.clef(clef) : null;
      if (name) names.push(name);
    }
  }
  return names;
}
