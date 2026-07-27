/**
 * ABC decoration table (ABC standard v2.1 §4.14).
 *
 * Maps ABC decoration spellings — both the `!name!` long form and the
 * single-character shorthand — onto the MusicXML-oriented internal model, and
 * back again. Decorations that have no MusicXML counterpart (Irish roll,
 * phrase marks, ...) are preserved verbatim as `<words>` directions so that
 * they still survive a round-trip.
 *
 * Where several ABC spellings mean the same thing (`!trill!` and `T`, or
 * `!accent!`, `!emphasis!` and `!>!`), serialization emits the spelling marked
 * as canonical. That transformation is stable: serializing twice yields the
 * same text.
 */

import type {
  ArticulationType,
  OrnamentType,
  TechnicalType,
  DynamicsValue,
} from './types';

/** Semantic target a decoration maps onto in the internal model. */
export type AbcDecorationTarget =
  | { kind: 'articulation'; articulation: ArticulationType }
  | { kind: 'ornament'; ornament: OrnamentType }
  | { kind: 'technical'; technical: TechnicalType }
  | { kind: 'fingering'; fingering: string }
  | { kind: 'fermata'; inverted?: boolean }
  | { kind: 'arpeggiate' }
  | { kind: 'trill-line'; wavyLineType: 'start' | 'stop' }
  | { kind: 'dynamics'; value: DynamicsValue }
  | { kind: 'wedge'; wedge: 'crescendo' | 'diminuendo'; stop: boolean }
  | { kind: 'segno' }
  | { kind: 'coda' }
  | { kind: 'words'; text: string };

interface DecorationDef {
  /** Every ABC spelling accepted for this decoration. */
  spellings: string[];
  /** The spelling emitted when serializing back to ABC. */
  canonical: string;
  target: AbcDecorationTarget;
}

/**
 * Decorations that map onto the internal model.
 *
 * Shorthand spellings are listed without delimiters; long-form spellings are
 * listed as the bare name (the surrounding `!` or `+` is stripped before
 * lookup).
 */
const DECORATIONS: DecorationDef[] = [
  // --- Articulations ---------------------------------------------------
  { spellings: ['.', 'staccato'], canonical: '.', target: { kind: 'articulation', articulation: 'staccato' } },
  { spellings: ['L', 'accent', 'emphasis', '>'], canonical: 'L', target: { kind: 'articulation', articulation: 'accent' } },
  { spellings: ['marcato'], canonical: '!marcato!', target: { kind: 'articulation', articulation: 'strong-accent' } },
  { spellings: ['tenuto'], canonical: '!tenuto!', target: { kind: 'articulation', articulation: 'tenuto' } },
  { spellings: ['breath'], canonical: '!breath!', target: { kind: 'articulation', articulation: 'breath-mark' } },

  // --- Ornaments -------------------------------------------------------
  { spellings: ['T', 'trill'], canonical: 'T', target: { kind: 'ornament', ornament: 'trill-mark' } },
  { spellings: ['M', 'lowermordent', 'mordent'], canonical: 'M', target: { kind: 'ornament', ornament: 'mordent' } },
  { spellings: ['P', 'uppermordent', 'pralltriller'], canonical: 'P', target: { kind: 'ornament', ornament: 'inverted-mordent' } },
  { spellings: ['turn', 'gruppetto'], canonical: '!turn!', target: { kind: 'ornament', ornament: 'turn' } },
  { spellings: ['invertedturn'], canonical: '!invertedturn!', target: { kind: 'ornament', ornament: 'inverted-turn' } },
  { spellings: ['trill('], canonical: '!trill(!', target: { kind: 'trill-line', wavyLineType: 'start' } },
  { spellings: ['trill)'], canonical: '!trill)!', target: { kind: 'trill-line', wavyLineType: 'stop' } },
  { spellings: ['arpeggio'], canonical: '!arpeggio!', target: { kind: 'arpeggiate' } },

  // --- Technical -------------------------------------------------------
  { spellings: ['u', 'upbow'], canonical: 'u', target: { kind: 'technical', technical: 'up-bow' } },
  { spellings: ['v', 'downbow'], canonical: 'v', target: { kind: 'technical', technical: 'down-bow' } },
  { spellings: ['open'], canonical: '!open!', target: { kind: 'technical', technical: 'open-string' } },
  { spellings: ['thumb'], canonical: '!thumb!', target: { kind: 'technical', technical: 'thumb-position' } },
  { spellings: ['snap'], canonical: '!snap!', target: { kind: 'technical', technical: 'snap-pizzicato' } },
  { spellings: ['+', 'plus'], canonical: '!plus!', target: { kind: 'technical', technical: 'stopped' } },

  // --- Fermatas --------------------------------------------------------
  { spellings: ['H', 'fermata'], canonical: 'H', target: { kind: 'fermata' } },
  { spellings: ['invertedfermata'], canonical: '!invertedfermata!', target: { kind: 'fermata', inverted: true } },

  // --- Wedges (hairpins) -----------------------------------------------
  { spellings: ['crescendo(', '<('], canonical: '!crescendo(!', target: { kind: 'wedge', wedge: 'crescendo', stop: false } },
  { spellings: ['crescendo)', '<)'], canonical: '!crescendo)!', target: { kind: 'wedge', wedge: 'crescendo', stop: true } },
  { spellings: ['diminuendo(', '>('], canonical: '!diminuendo(!', target: { kind: 'wedge', wedge: 'diminuendo', stop: false } },
  { spellings: ['diminuendo)', '>)'], canonical: '!diminuendo)!', target: { kind: 'wedge', wedge: 'diminuendo', stop: true } },

  // --- Navigation marks ------------------------------------------------
  { spellings: ['S', 'segno'], canonical: 'S', target: { kind: 'segno' } },
  { spellings: ['O', 'coda'], canonical: 'O', target: { kind: 'coda' } },
  { spellings: ['D.S.'], canonical: '!D.S.!', target: { kind: 'words', text: 'D.S.' } },
  { spellings: ['D.C.'], canonical: '!D.C.!', target: { kind: 'words', text: 'D.C.' } },
  { spellings: ['dacoda'], canonical: '!dacoda!', target: { kind: 'words', text: 'Da Coda' } },
  { spellings: ['dacapo'], canonical: '!dacapo!', target: { kind: 'words', text: 'Da Capo' } },
  { spellings: ['fine'], canonical: '!fine!', target: { kind: 'words', text: 'Fine' } },
];

// Fingerings !0! .. !5!
for (let n = 0; n <= 5; n++) {
  DECORATIONS.push({
    spellings: [String(n)],
    canonical: `!${n}!`,
    target: { kind: 'fingering', fingering: String(n) },
  });
}

/** ABC dynamics decorations, e.g. `!mf!`. */
export const ABC_DYNAMICS = new Set<string>([
  'pppppp', 'ppppp', 'pppp', 'ppp', 'pp', 'p',
  'mp', 'mf',
  'f', 'ff', 'fff', 'ffff', 'fffff', 'ffffff',
  'sf', 'sfz', 'sffz', 'sfp', 'sfpp', 'fp', 'rf', 'rfz', 'fz', 'pf',
]);

/**
 * Single-character shorthand decorations (ABC v2.1 §4.14).
 *
 * `~` (Irish roll), `J` (slide) and `R` (roll) have no MusicXML counterpart
 * and are preserved as `<words>`; the rest resolve through {@link DECORATIONS}.
 */
export const ABC_SHORTHAND_DECORATIONS = new Set<string>([
  '.', '~', 'H', 'J', 'L', 'M', 'O', 'P', 'R', 'S', 'T', 'u', 'v',
]);

const BY_SPELLING = new Map<string, DecorationDef>();
for (const def of DECORATIONS) {
  for (const spelling of def.spellings) {
    BY_SPELLING.set(spelling, def);
  }
}

/** Stable key identifying a decoration target, used for the reverse lookup. */
function targetKey(target: AbcDecorationTarget): string {
  switch (target.kind) {
    case 'articulation': return `articulation:${target.articulation}`;
    case 'ornament': return `ornament:${target.ornament}`;
    case 'technical': return `technical:${target.technical}`;
    case 'fingering': return `fingering:${target.fingering}`;
    case 'fermata': return `fermata:${target.inverted ? 'inverted' : 'upright'}`;
    case 'arpeggiate': return 'arpeggiate';
    case 'trill-line': return `trill-line:${target.wavyLineType}`;
    case 'dynamics': return `dynamics:${target.value}`;
    case 'wedge': return `wedge:${target.wedge}:${target.stop ? 'stop' : 'start'}`;
    case 'segno': return 'segno';
    case 'coda': return 'coda';
    case 'words': return `words:${target.text}`;
  }
}

const CANONICAL_BY_TARGET = new Map<string, string>();
for (const def of DECORATIONS) {
  CANONICAL_BY_TARGET.set(targetKey(def.target), def.canonical);
}

/**
 * Resolve an ABC decoration to its semantic target.
 *
 * @param spelling Decoration text with any `!` / `+` delimiters removed.
 * @returns The target, or `null` when the decoration has no internal-model
 *   counterpart and should be preserved verbatim.
 */
export function lookupAbcDecoration(spelling: string): AbcDecorationTarget | null {
  if (ABC_DYNAMICS.has(spelling)) {
    return { kind: 'dynamics', value: spelling as DynamicsValue };
  }
  const def = BY_SPELLING.get(spelling);
  return def ? def.target : null;
}

/**
 * Reverse lookup: the ABC spelling to emit for a semantic target.
 *
 * @returns The canonical spelling, or `null` when the target does not
 *   originate from an ABC decoration.
 */
export function abcDecorationFor(target: AbcDecorationTarget): string | null {
  if (target.kind === 'dynamics') {
    return ABC_DYNAMICS.has(target.value) ? `!${target.value}!` : null;
  }
  return CANONICAL_BY_TARGET.get(targetKey(target)) ?? null;
}
