/**
 * Reading of ABC K: and V: field values (ABC standard v2.1 §3.1.14, §4.6),
 * shared by the parser and by the serializer, which updates stored header
 * lines when the score's clef has changed.
 */

import type { Clef, KeySignature, TimeSignature } from './types';

const KEY_FIFTHS: Record<string, number> = {
  'Cb': -7, 'Gb': -6, 'Db': -5, 'Ab': -4, 'Eb': -3, 'Bb': -2, 'F': -1,
  'C': 0, 'G': 1, 'D': 2, 'A': 3, 'E': 4, 'B': 5, 'F#': 6, 'C#': 7,
};

// Mode to fifths offset (from major)
const MODE_OFFSET: Record<string, number> = {
  'major': 0, 'maj': 0, 'ion': 0, 'ionian': 0, '': 0,
  'minor': -3, 'min': -3, 'm': -3,
  'dorian': -2, 'dor': -2,
  'phrygian': -4, 'phr': -4,
  'lydian': 1, 'lyd': 1,
  'mixolydian': -1, 'mix': -1,
  'aeolian': -3, 'aeo': -3,
  'locrian': -5, 'loc': -5,
};

const MODE_NAME: Record<string, KeySignature['mode']> = {
  'major': 'major', 'maj': 'major', 'ion': 'ionian', 'ionian': 'ionian', '': 'major',
  'minor': 'minor', 'min': 'minor', 'm': 'minor',
  'dorian': 'dorian', 'dor': 'dorian',
  'phrygian': 'phrygian', 'phr': 'phrygian',
  'lydian': 'lydian', 'lyd': 'lydian',
  'mixolydian': 'mixolydian', 'mix': 'mixolydian',
  'aeolian': 'aeolian', 'aeo': 'aeolian',
  'locrian': 'locrian', 'loc': 'locrian',
};

/**
 * Whether a K: value names a key (tonic + optional mode) rather than only
 * parameters: "K:bass" or "K:clef=treble-8" change the clef and keep the key.
 */
export function hasKeyTonic(keyStr: string): boolean {
  const word = keyStr.trim().split(/\s+/)[0] ?? '';
  const m = word.match(/^[A-Ga-g][#b]?([A-Za-z]*)$/);
  if (!m) return /^(none|HP|Hp)$/.test(word);
  const mode = m[1].toLowerCase();
  return mode === '' || mode === 'm' || mode.slice(0, 3) in MODE_OFFSET;
}

/** Base clef names accepted in K: and V: fields (ABC v2.1 §4.6). */
const ABC_CLEF_NAMES: Record<string, Clef> = {
  'treble': { sign: 'G', line: 2 },
  'bass': { sign: 'F', line: 4 },
  'bass3': { sign: 'F', line: 3 },
  'alto': { sign: 'C', line: 3 },
  'tenor': { sign: 'C', line: 4 },
  'soprano': { sign: 'C', line: 1 },
  'mezzo': { sign: 'C', line: 2 },
  'mezzo-soprano': { sign: 'C', line: 2 },
  'baritone': { sign: 'C', line: 5 },
  'perc': { sign: 'percussion' },
  'percussion': { sign: 'percussion' },
  'none': { sign: 'G', line: 2 },
};

export function abcClefToMusicXml(abcClef?: string): Clef {
  if (!abcClef) return { sign: 'G', line: 2 };

  // Split off an octave shift suffix: treble-8, bass+8, treble-8va, ...
  const match = abcClef.trim().toLowerCase().match(/^([a-z-]*?)\s*([+-])?(8|15)(?:va|vb)?$/);
  const baseName = match ? match[1] : abcClef.trim().toLowerCase();
  const base = ABC_CLEF_NAMES[baseName] ?? ABC_CLEF_NAMES[abcClef.trim().toLowerCase()];
  if (!base) return { sign: 'G', line: 2 };

  const clef: Clef = { ...base };
  if (match && match[3]) {
    // -8 sounds an octave lower, +8 an octave higher; 15 is two octaves
    const octaves = match[3] === '15' ? 2 : 1;
    clef.clefOctaveChange = (match[2] === '+' ? octaves : -octaves);
  }
  return clef;
}

/**
 * Clef specification carried by a K: or V: field, e.g. `clef=bass`,
 * `clef=treble-8`, or the bare form `K:C bass` (ABC v2.1 §4.6).
 *
 * @returns The clef, or undefined when the field names none.
 */
export function parseAbcClefSpec(fieldValue: string): Clef | undefined {
  return locateAbcClefSpec(fieldValue)?.clef;
}

/**
 * Like parseAbcClefSpec, but also reports where the clef is written in the
 * field value (`start`/`end` offsets of `clef=bass` or the bare `bass`), so
 * a serializer can replace it in a stored line.
 */
export function locateAbcClefSpec(fieldValue: string): { clef: Clef; start: number; end: number } | undefined {
  const explicit = /clef\s*=\s*(\S+)/i.exec(fieldValue);
  if (explicit) {
    return { clef: abcClefToMusicXml(explicit[1]), start: explicit.index, end: explicit.index + explicit[0].length };
  }

  // Bare clef name, as in "K:C bass", "K:bass" or "V:1 treble-8"
  const words = [...fieldValue.matchAll(/\S+/g)];
  for (const word of hasKeyTonic(fieldValue) ? words.slice(1) : words) {
    if (word[0].includes('=')) continue;
    const bare = word[0].toLowerCase().replace(/([+-]?(?:8|15)(?:va|vb)?)$/, '');
    if (ABC_CLEF_NAMES[bare] && bare !== 'none') {
      return { clef: abcClefToMusicXml(word[0]), start: word.index!, end: word.index! + word[0].length };
    }
  }
  return undefined;
}

export function parseKeySignature(keyStr: string): KeySignature {
  if (!keyStr || keyStr.trim() === '' || keyStr.trim().toLowerCase() === 'none' || !hasKeyTonic(keyStr)) {
    return { fifths: 0, mode: 'major' };
  }

  const trimmed = keyStr.trim();

  // Match key note (e.g., C, C#, Cb, c, c#)
  const keyMatch = trimmed.match(/^([A-Ga-g])(#|b)?/);
  if (!keyMatch) {
    return { fifths: 0, mode: 'major' };
  }

  const keyNote = keyMatch[1].toUpperCase();
  const keyAccidental = keyMatch[2] || '';
  const keyName = keyNote + keyAccidental;

  // Extract mode
  const remainder = trimmed.slice(keyMatch[0].length).trim().toLowerCase();
  // Only the first three letters of a mode name count (ABC 2.1 §3.1.14), so
  // "mix" must not be read as "m" (minor)
  const word = remainder.match(/^[a-z]+/)?.[0] ?? '';
  const abbrev = word === 'm' ? 'm' : word.slice(0, 3);
  const mode = abbrev in MODE_OFFSET ? abbrev : '';

  // Get base fifths for the key note
  const baseFifths = KEY_FIFTHS[keyName];
  if (baseFifths === undefined) {
    return { fifths: 0, mode: 'major' };
  }

  const modeOffset = MODE_OFFSET[mode] ?? 0;
  const fifths = baseFifths + modeOffset;
  const modeValue = MODE_NAME[mode] ?? 'major';

  return { fifths, mode: modeValue };
}

export function parseTimeSignature(meterStr: string): TimeSignature {
  if (!meterStr || meterStr.trim() === '') {
    return { beats: '4', beatType: 4 };
  }

  const trimmed = meterStr.trim();

  if (trimmed === 'C' || trimmed.toLowerCase() === 'common') {
    return { beats: '4', beatType: 4, symbol: 'common' };
  }
  if (trimmed === 'C|' || trimmed.toLowerCase() === 'cut') {
    return { beats: '2', beatType: 2, symbol: 'cut' };
  }
  if (trimmed.toLowerCase() === 'none') {
    return { beats: '4', beatType: 4, senzaMisura: true };
  }

  const match = trimmed.match(/^(\d+)\/(\d+)$/);
  if (match) {
    return { beats: match[1], beatType: parseInt(match[2], 10) };
  }

  // Additive meters: (2+3+2)/8 or 3+2/8
  const additive = trimmed.match(/^\(?\s*(\d+(?:\s*\+\s*\d+)+)\s*\)?\/(\d+)$/);
  if (additive) {
    const groups = additive[1].split('+').map(g => parseInt(g.trim(), 10));
    return {
      beats: groups.join('+'),
      beatType: parseInt(additive[2], 10),
      beatsList: groups,
    };
  }

  return { beats: '4', beatType: 4 };
}

/** A K: value with its key set to `tonic` ("G", "Ador"), keeping its clef and other parameters. */
export function withKeyTonic(value: string, tonic: string): string {
  const m = value.match(/^(\s*)(\S*)(.*)$/s)!;
  return hasKeyTonic(value)
    ? m[1] + tonic + m[3]
    : m[1] + tonic + (value.trim() ? ' ' + value.trimStart() : '');
}
