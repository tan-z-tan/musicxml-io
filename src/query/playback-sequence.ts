/**
 * Playback Sequence Generator
 *
 * Analyzes repeat structures, voltas (endings), and jump instructions
 * (D.C., D.S., Coda, Segno, Fine, To Coda) in a score to produce the
 * correct playback order of measures.
 *
 * This is the structural expansion that turns the written score into the
 * order a performer would actually play it. The MIDI exporter consumes
 * this so that repeats, 1st/2nd endings, and da capo / dal segno jumps are
 * reflected in the rendered audio.
 *
 * The algorithm is ported from the validated playback engine in the
 * Octava project and adapted to the typed musicxml-io Score model.
 */

import type { Score, Part, DirectionEntry, SoundEntry } from '../types';

/**
 * Volta (ending bracket) information
 */
interface VoltaInfo {
  measureIndex: number;
  numbers: number[]; // e.g., [1] for "1", [1, 2] for "1, 2"
  type: 'start' | 'stop' | 'discontinue';
}

/**
 * Jump instruction information
 */
interface JumpInfo {
  measureIndex: number;
  type: 'dc' | 'dc_al_fine' | 'dc_al_coda' | 'ds' | 'ds_al_fine' | 'ds_al_coda';
}

/**
 * Parsed playback control structures from a score
 */
export interface PlaybackControls {
  /** measure indices that carry a forward repeat (||:) */
  repeatStarts: number[];
  /** backward repeats (:||) with their repeat counts */
  repeatEnds: { measureIndex: number; times: number }[];
  /** volta brackets in document order */
  voltas: VoltaInfo[];
  /** jump instructions (D.C., D.S., and their al fine/al coda variants) */
  jumps: JumpInfo[];
  /** measure index of the segno symbol */
  segnoIndex: number | null;
  /** measure index of the coda symbol */
  codaIndex: number | null;
  /** measure index of the Fine marking */
  fineIndex: number | null;
  /** measure index of the "To Coda" marking */
  toCodaIndex: number | null;
}

/**
 * A measure to play, with the repeat-iteration context it was reached in.
 */
export interface PlaybackMeasure {
  /** Index of the measure in the original (written) score */
  measureIndex: number;
  /** Which repeat iteration produced this entry (1-based; 0 = not in a repeat) */
  repeatIteration: number;
}

/**
 * Parse an ending number string into an array of iteration numbers.
 * e.g. "1" -> [1], "1, 2" -> [1, 2], "1-3" -> [1, 2, 3]
 */
function parseEndingNumbers(numberStr: string): number[] {
  const numbers: number[] = [];
  const parts = numberStr.split(/[,\s]+/);

  for (const part of parts) {
    if (part.includes('-')) {
      const [start, end] = part.split('-').map((s) => parseInt(s.trim(), 10));
      if (!isNaN(start) && !isNaN(end)) {
        for (let i = start; i <= end; i++) {
          numbers.push(i);
        }
      }
    } else {
      const num = parseInt(part.trim(), 10);
      if (!isNaN(num)) {
        numbers.push(num);
      }
    }
  }

  return numbers.length > 0 ? numbers : [1];
}

/**
 * Jump-instruction text classification.
 * Returns the structural jump type, or one of the location markers
 * ('fine' | 'to_coda' | 'coda' | 'segno') that text can also denote.
 */
type TextJumpType = JumpInfo['type'] | 'fine' | 'to_coda' | 'coda' | 'segno';

/**
 * Parse jump-instruction text (e.g. "D.C. al Fine") into a structural type.
 */
function parseJumpText(text: string): TextJumpType | null {
  const t = text.toLowerCase().replace(/\s+/g, ' ').trim();

  if (t.includes('d.c. al coda') || t.includes('da capo al coda')) return 'dc_al_coda';
  if (t.includes('d.c. al fine') || t.includes('da capo al fine')) return 'dc_al_fine';
  if (t.includes('d.c.') || t.includes('da capo')) return 'dc';
  if (t.includes('d.s. al coda') || t.includes('dal segno al coda')) return 'ds_al_coda';
  if (t.includes('d.s. al fine') || t.includes('dal segno al fine')) return 'ds_al_fine';
  if (t.includes('d.s.') || t.includes('dal segno')) return 'ds';
  if (t === 'fine') return 'fine';
  if (t.includes('to coda') || t.includes('al coda')) return 'to_coda';
  if (t === 'coda' || t === '\u{1D14C}') return 'coda';
  if (t === 'segno' || t === '\u{1D10B}') return 'segno';

  return null;
}

/**
 * Get the first <words> text from a direction entry, if any.
 */
function getFirstWordsText(entry: DirectionEntry): string | undefined {
  for (const dt of entry.directionTypes) {
    if (dt.kind === 'words' && dt.text) return dt.text;
  }
  return undefined;
}

function hasDirectionKind(entry: DirectionEntry, kind: 'segno' | 'coda'): boolean {
  return entry.directionTypes.some((dt) => dt.kind === kind);
}

/**
 * Extract repeat / volta / jump control structures from the structural part.
 *
 * Repeats and voltas apply to the whole system, so by convention we scan a
 * single part (the first by default). Jump instructions and segno/coda/fine
 * markers are read from both <direction> entries (words text + segno/coda
 * symbols) and standalone <sound> entries.
 */
export function extractPlaybackControls(part: Part): PlaybackControls {
  const controls: PlaybackControls = {
    repeatStarts: [],
    repeatEnds: [],
    voltas: [],
    jumps: [],
    segnoIndex: null,
    codaIndex: null,
    fineIndex: null,
    toCodaIndex: null,
  };

  // Raw sound-based jumps deferred until after the full scan, so that
  // al fine / al coda can be resolved against discovered Fine/Coda markers.
  const soundJumps: { measureIndex: number; base: 'dc' | 'ds' }[] = [];

  for (let measureIndex = 0; measureIndex < part.measures.length; measureIndex++) {
    const measure = part.measures[measureIndex];

    // --- Barlines: repeats and voltas ---
    if (measure.barlines) {
      for (const barline of measure.barlines) {
        if (barline.repeat) {
          if (barline.repeat.direction === 'forward') {
            controls.repeatStarts.push(measureIndex);
          } else if (barline.repeat.direction === 'backward') {
            controls.repeatEnds.push({
              measureIndex,
              times: barline.repeat.times ?? 2,
            });
          }
        }

        if (barline.ending) {
          const numbers = parseEndingNumbers(barline.ending.number);
          controls.voltas.push({
            measureIndex,
            numbers,
            type: barline.ending.type,
          });
        }
      }
    }

    // --- Entries: directions (words / segno / coda) and sounds ---
    for (const entry of measure.entries) {
      if (entry.type === 'direction') {
        const dir = entry as DirectionEntry;

        if (hasDirectionKind(dir, 'segno') && controls.segnoIndex === null) {
          controls.segnoIndex = measureIndex;
        }
        if (hasDirectionKind(dir, 'coda') && controls.codaIndex === null) {
          controls.codaIndex = measureIndex;
        }

        const words = getFirstWordsText(dir);
        if (words) {
          const jt = parseJumpText(words);
          if (jt === 'fine') {
            if (controls.fineIndex === null) controls.fineIndex = measureIndex;
          } else if (jt === 'to_coda') {
            if (controls.toCodaIndex === null) controls.toCodaIndex = measureIndex;
          } else if (jt === 'coda') {
            if (controls.codaIndex === null) controls.codaIndex = measureIndex;
          } else if (jt === 'segno') {
            if (controls.segnoIndex === null) controls.segnoIndex = measureIndex;
          } else if (jt) {
            controls.jumps.push({ measureIndex, type: jt });
          }
        }
      } else if (entry.type === 'sound') {
        const sound = entry as SoundEntry;
        if (sound.segno && controls.segnoIndex === null) controls.segnoIndex = measureIndex;
        if (sound.coda && controls.codaIndex === null) controls.codaIndex = measureIndex;
        if (sound.tocoda && controls.toCodaIndex === null) controls.toCodaIndex = measureIndex;
        if (sound.fine && controls.fineIndex === null) controls.fineIndex = measureIndex;
        if (sound.dacapo) soundJumps.push({ measureIndex, base: 'dc' });
        if (sound.dalsegno) soundJumps.push({ measureIndex, base: 'ds' });
      }
    }
  }

  // Resolve sound-based jumps now that Fine / To Coda markers are known.
  // Only add them if a words-based jump was not already recorded for the
  // same measure (words take precedence as the more explicit source).
  for (const sj of soundJumps) {
    if (controls.jumps.some((j) => j.measureIndex === sj.measureIndex)) continue;
    let type: JumpInfo['type'];
    if (controls.fineIndex !== null) {
      type = sj.base === 'dc' ? 'dc_al_fine' : 'ds_al_fine';
    } else if (controls.toCodaIndex !== null || controls.codaIndex !== null) {
      type = sj.base === 'dc' ? 'dc_al_coda' : 'ds_al_coda';
    } else {
      type = sj.base;
    }
    controls.jumps.push({ measureIndex: sj.measureIndex, type });
  }

  return controls;
}

/**
 * Build a map from measure index to the volta iteration numbers that play it.
 */
function buildVoltaRanges(voltas: VoltaInfo[], measureCount: number): Map<number, number[]> {
  const voltaRanges = new Map<number, number[]>();

  let currentVoltaStart: number | null = null;
  let currentVoltaNumbers: number[] = [];

  for (const volta of voltas) {
    if (volta.type === 'start') {
      currentVoltaStart = volta.measureIndex;
      currentVoltaNumbers = volta.numbers;
    } else if ((volta.type === 'stop' || volta.type === 'discontinue') && currentVoltaStart !== null) {
      for (let i = currentVoltaStart; i <= volta.measureIndex; i++) {
        voltaRanges.set(i, currentVoltaNumbers);
      }
      currentVoltaStart = null;
    }
  }

  // Unclosed volta extends to the end of the score.
  if (currentVoltaStart !== null) {
    for (let i = currentVoltaStart; i < measureCount; i++) {
      voltaRanges.set(i, currentVoltaNumbers);
    }
  }

  return voltaRanges;
}

/**
 * Generate the playback sequence: the list of measures in the order they
 * should be performed, with repeats expanded and voltas / jumps resolved.
 *
 * @param score - the score to analyze
 * @param options.partIndex - which part to read structure from (default: 0)
 */
export function generatePlaybackSequence(
  score: Score,
  options?: { partIndex?: number }
): PlaybackMeasure[] {
  const partIndex = options?.partIndex ?? 0;
  const part = score.parts[partIndex];
  if (!part) return [];

  const measureCount = part.measures.length;
  const sequence: PlaybackMeasure[] = [];
  if (measureCount === 0) return sequence;

  const controls = extractPlaybackControls(part);

  // Fast path: nothing structural, play straight through.
  if (
    controls.repeatStarts.length === 0 &&
    controls.repeatEnds.length === 0 &&
    controls.voltas.length === 0 &&
    controls.jumps.length === 0
  ) {
    for (let i = 0; i < measureCount; i++) {
      sequence.push({ measureIndex: i, repeatIteration: 0 });
    }
    return sequence;
  }

  const voltaRanges = buildVoltaRanges(controls.voltas, measureCount);

  const sortedRepeatStarts = [...controls.repeatStarts].sort((a, b) => a - b);
  const sortedRepeatEnds = [...controls.repeatEnds].sort((a, b) => a.measureIndex - b.measureIndex);

  // For each repeat end, find its matching forward repeat (or the measure
  // after the previous repeat section if none is marked).
  const repeatSections = new Map<number, { startIndex: number; times: number }>();
  const voltaToRepeatEnd = new Map<number, number>();
  const usedRepeatStarts = new Set<number>();

  let lastRepeatEndMeasure = -1;
  for (const repeatEnd of sortedRepeatEnds) {
    let startIndex: number | null = null;
    for (const startMeasure of sortedRepeatStarts) {
      if (
        startMeasure <= repeatEnd.measureIndex &&
        startMeasure > lastRepeatEndMeasure &&
        !usedRepeatStarts.has(startMeasure)
      ) {
        startIndex = startMeasure;
      } else if (startMeasure > repeatEnd.measureIndex) {
        break;
      }
    }

    if (startIndex === null) {
      startIndex = lastRepeatEndMeasure + 1;
    } else {
      usedRepeatStarts.add(startIndex);
    }

    repeatSections.set(repeatEnd.measureIndex, {
      startIndex,
      times: repeatEnd.times,
    });

    lastRepeatEndMeasure = repeatEnd.measureIndex;

    // Associate volta measures with this repeat section (inside it, or
    // immediately following the repeat end for 2nd/3rd endings).
    voltaRanges.forEach((_iterations, voltaMeasure) => {
      const isInsideRepeat = voltaMeasure >= startIndex! && voltaMeasure <= repeatEnd.measureIndex;
      const isImmediatelyAfter =
        voltaMeasure > repeatEnd.measureIndex && !voltaToRepeatEnd.has(voltaMeasure);

      if (isInsideRepeat) {
        voltaToRepeatEnd.set(voltaMeasure, repeatEnd.measureIndex);
      } else if (isImmediatelyAfter) {
        let belongsToLaterRepeat = false;
        for (const otherEnd of sortedRepeatEnds) {
          if (otherEnd.measureIndex > repeatEnd.measureIndex) {
            const otherSection = repeatSections.get(otherEnd.measureIndex);
            if (
              otherSection &&
              voltaMeasure >= otherSection.startIndex &&
              voltaMeasure <= otherEnd.measureIndex
            ) {
              belongsToLaterRepeat = true;
              break;
            }
          }
        }
        if (!belongsToLaterRepeat) {
          voltaToRepeatEnd.set(voltaMeasure, repeatEnd.measureIndex);
        }
      }
    });
  }

  // --- Traversal state machine ---
  let currentMeasure = 0;
  const repeatCounts = new Map<number, number>(); // repeatEndIndex -> current iteration
  let lastRepeatEndIndex: number | null = null;
  let lastRepeatIteration = 0;
  let inRepeatJump = false; // a D.C./D.S. jump has already been taken
  let stopAtFine = false;
  let jumpToCoda = false;

  const maxIterations = measureCount * 10 + 10;
  let iterations = 0;

  while (currentMeasure < measureCount && iterations < maxIterations) {
    iterations++;

    const voltaIterations = voltaRanges.get(currentMeasure);

    // Determine repeat-iteration context for the current measure.
    let repeatIteration = 0;
    let inRepeatSection = false;
    let currentRepeatEndIndex: number | null = null;

    for (const [endIndex, section] of repeatSections) {
      if (currentMeasure >= section.startIndex && currentMeasure <= endIndex) {
        inRepeatSection = true;
        currentRepeatEndIndex = endIndex;
        repeatIteration = repeatCounts.get(endIndex) || 1;
        break;
      }
    }

    if (inRepeatSection && currentRepeatEndIndex !== null) {
      lastRepeatEndIndex = currentRepeatEndIndex;
      lastRepeatIteration = repeatIteration;
    }

    // Skip volta measures that do not belong to the current iteration.
    if (voltaIterations) {
      let effectiveIteration = repeatIteration;
      if (!inRepeatSection) {
        const associatedRepeatEnd = voltaToRepeatEnd.get(currentMeasure);
        if (associatedRepeatEnd !== undefined) {
          effectiveIteration = repeatCounts.get(associatedRepeatEnd) || 1;
        } else if (lastRepeatEndIndex !== null) {
          effectiveIteration = lastRepeatIteration;
        }
      }

      if (!voltaIterations.includes(effectiveIteration)) {
        currentMeasure++;
        continue;
      }
    }

    sequence.push({
      measureIndex: currentMeasure,
      repeatIteration: inRepeatSection ? repeatIteration : 0,
    });

    // Stop at Fine when in a D.C./D.S. al Fine pass.
    if (stopAtFine && controls.fineIndex === currentMeasure) {
      break;
    }

    // "To Coda" jump (after playing this measure).
    if (jumpToCoda && controls.toCodaIndex === currentMeasure && controls.codaIndex !== null) {
      currentMeasure = controls.codaIndex;
      jumpToCoda = false;
      continue;
    }

    // Repeat end inside a marked repeat section.
    const repeatSection = repeatSections.get(currentMeasure);
    if (repeatSection) {
      const currentCount = repeatCounts.get(currentMeasure) || 1;
      if (currentCount < repeatSection.times) {
        repeatCounts.set(currentMeasure, currentCount + 1);
        currentMeasure = repeatSection.startIndex;
        continue;
      }
    }

    // Volta brackets sitting after the repeat end barline (2nd/3rd endings).
    if (voltaIterations && !inRepeatSection) {
      const associatedRepeatEnd = voltaToRepeatEnd.get(currentMeasure);
      if (associatedRepeatEnd !== undefined) {
        const repeatSectionForVolta = repeatSections.get(associatedRepeatEnd);
        if (repeatSectionForVolta) {
          const currentCount = repeatCounts.get(associatedRepeatEnd) || 1;
          if (currentCount < repeatSectionForVolta.times) {
            repeatCounts.set(associatedRepeatEnd, currentCount + 1);
            currentMeasure = repeatSectionForVolta.startIndex;
            continue;
          }
        }
      }
    }

    // Jump instructions (D.C. / D.S. family). Only the first one is taken.
    const jumpAtMeasure = controls.jumps.find((j) => j.measureIndex === currentMeasure);
    if (jumpAtMeasure && !inRepeatJump) {
      inRepeatJump = true;

      switch (jumpAtMeasure.type) {
        case 'dc':
          currentMeasure = 0;
          continue;
        case 'dc_al_fine':
          currentMeasure = 0;
          stopAtFine = true;
          continue;
        case 'dc_al_coda':
          currentMeasure = 0;
          jumpToCoda = true;
          continue;
        case 'ds':
          if (controls.segnoIndex !== null) {
            currentMeasure = controls.segnoIndex;
            continue;
          }
          break;
        case 'ds_al_fine':
          if (controls.segnoIndex !== null) {
            currentMeasure = controls.segnoIndex;
            stopAtFine = true;
            continue;
          }
          break;
        case 'ds_al_coda':
          if (controls.segnoIndex !== null) {
            currentMeasure = controls.segnoIndex;
            jumpToCoda = true;
            continue;
          }
          break;
      }
    }

    currentMeasure++;
  }

  return sequence;
}

/**
 * Whether a score contains any repeat / volta / jump structures that would
 * make its playback order differ from its written order.
 */
export function hasPlaybackControls(score: Score, options?: { partIndex?: number }): boolean {
  const part = score.parts[options?.partIndex ?? 0];
  if (!part) return false;
  const controls = extractPlaybackControls(part);
  return (
    controls.repeatStarts.length > 0 ||
    controls.repeatEnds.length > 0 ||
    controls.voltas.length > 0 ||
    controls.jumps.length > 0 ||
    controls.segnoIndex !== null ||
    controls.codaIndex !== null
  );
}
