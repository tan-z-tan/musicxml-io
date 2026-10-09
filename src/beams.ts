import type { BeamInfo, NoteEntry, NoteType } from './types';

/** Number of beams a note of this type carries (0 = not beamable). */
export const BEAM_LEVELS: Partial<Record<NoteType, number>> = {
  eighth: 1, '16th': 2, '32nd': 3, '64th': 4, '128th': 5, '256th': 6, '512th': 7, '1024th': 8,
};

/** Beams a note carries: 1 for an eighth (dotted or not), 2 for a 16th ... 0 if it is not beamable. */
export function beamLevel(note: NoteEntry): number {
  return note.rest || !note.noteType ? 0 : BEAM_LEVELS[note.noteType] ?? 0;
}

/**
 * Give a group of beamable notes (in order, at least two) their `<beam>`
 * elements: level 1 joins the whole group; each further level joins runs of
 * notes that short, and a lone shorter note gets a hook pointing into the group.
 */
export function applyBeamGroup(group: NoteEntry[]): void {
  const levels = group.map(beamLevel);
  const beams: BeamInfo[][] = group.map(() => []);
  const maxLevel = Math.max(...levels);
  for (let lv = 1; lv <= maxLevel; lv++) {
    for (let i = 0; i < group.length; ) {
      if (levels[i] < lv) {
        i++;
        continue;
      }
      let j = i;
      while (j + 1 < group.length && levels[j + 1] >= lv) j++;
      if (i === j) {
        beams[i].push({ number: lv, type: i === group.length - 1 ? 'backward hook' : 'forward hook' });
      } else {
        for (let k = i; k <= j; k++) {
          beams[k].push({ number: lv, type: k === i ? 'begin' : k === j ? 'end' : 'continue' });
        }
      }
      i = j + 1;
    }
  }
  group.forEach((n, i) => {
    n.beam = beams[i];
  });
}
