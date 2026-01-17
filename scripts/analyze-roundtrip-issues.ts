import { readFileSync } from 'fs';
import { parse } from '../src/importers/musicxml';
import { parseCompressed, isCompressed } from '../src/importers/musicxml-compressed';
import { serialize } from '../src/exporters/musicxml';
import { decodeBuffer } from '../src/file';
import type { Score, NoteEntry, DirectionEntry, MeasureEntry } from '../src/types';

interface Issue {
  category: string;
  description: string;
  location?: string;
  details?: string;
}

const filePath = process.argv[2] || 'tests/fixtures/musicxml_samples/BrahWiMeSample.musicxml';
const issues: Issue[] = [];

console.log(`\n=== Analyzing: ${filePath} ===\n`);

// Load and parse file
let original: string;
let score: Score;

const buffer = readFileSync(filePath);
if (isCompressed(buffer)) {
  const result = parseCompressed(buffer);
  original = result.xmlContent;
  score = result.score;
} else {
  original = decodeBuffer(buffer);
  score = parse(original);
}

const roundtrip = serialize(score);
const reparsed = parse(roundtrip);

// 1. Check XML declaration
console.log('=== 1. XML Declaration ===');
const origXmlDecl = original.match(/<\?xml[^?]*\?>/);
const rtXmlDecl = roundtrip.match(/<\?xml[^?]*\?>/);
console.log(`Original: ${origXmlDecl?.[0]}`);
console.log(`Roundtrip: ${rtXmlDecl?.[0]}`);
if (origXmlDecl?.[0] !== rtXmlDecl?.[0]) {
  issues.push({
    category: 'XML Declaration',
    description: 'XML declaration differs',
    details: `Original: ${origXmlDecl?.[0]}\nRoundtrip: ${rtXmlDecl?.[0]}`
  });
}

// 2. Check DOCTYPE
console.log('\n=== 2. DOCTYPE ===');
const origDoctype = original.match(/<!DOCTYPE[^>]*>/);
const rtDoctype = roundtrip.match(/<!DOCTYPE[^>]*>/);
console.log(`Original: ${origDoctype?.[0]?.substring(0, 80)}...`);
console.log(`Roundtrip: ${rtDoctype?.[0]?.substring(0, 80)}...`);
if (origDoctype?.[0] !== rtDoctype?.[0]) {
  issues.push({
    category: 'DOCTYPE',
    description: 'DOCTYPE differs (may be OK if functionally equivalent)',
  });
}

// 3. Check comments preservation
console.log('\n=== 3. XML Comments ===');
const origComments = original.match(/<!--[\s\S]*?-->/g) || [];
const rtComments = roundtrip.match(/<!--[\s\S]*?-->/g) || [];
console.log(`Original comment count: ${origComments.length}`);
console.log(`Roundtrip comment count: ${rtComments.length}`);
if (origComments.length !== rtComments.length) {
  issues.push({
    category: 'Comments',
    description: `XML comments lost: ${origComments.length} -> ${rtComments.length}`,
    details: origComments.slice(0, 5).join('\n')
  });
}

// 4. Check credits
console.log('\n=== 4. Credits ===');
console.log(`Original credits: ${score.credits?.length || 0}`);
console.log(`Reparsed credits: ${reparsed.credits?.length || 0}`);
if (score.credits) {
  for (let i = 0; i < score.credits.length; i++) {
    const oc = score.credits[i];
    const rc = reparsed.credits?.[i];
    if (!rc) {
      issues.push({
        category: 'Credits',
        description: `Credit ${i} missing in roundtrip`
      });
    } else {
      if (oc.type !== rc.type) {
        issues.push({
          category: 'Credits',
          description: `Credit type differs: ${oc.type} -> ${rc.type}`
        });
      }
    }
  }
}

// 5. Check directions
console.log('\n=== 5. Directions ===');
let origDirections = 0;
let origDynamics = 0;
let origWedges = 0;
let origWords = 0;
let origTempos = 0;
let origMetronomes = 0;
let origPedals = 0;

function countDirections(s: Score) {
  let directions = 0;
  let dynamics = 0;
  let wedges = 0;
  let words = 0;
  let tempos = 0;
  let metronomes = 0;
  let pedals = 0;

  for (const part of s.parts) {
    for (const measure of part.measures) {
      for (const entry of measure.entries) {
        if (entry.type === 'direction') {
          directions++;
          const dir = entry as DirectionEntry;
          if (dir.dynamics) dynamics++;
          if (dir.wedge) wedges++;
          if (dir.words) words++;
          if (dir.sound?.tempo) tempos++;
          if (dir.metronome) metronomes++;
          if (dir.pedal) pedals++;
        }
      }
    }
  }
  return { directions, dynamics, wedges, words, tempos, metronomes, pedals };
}

const origDirStats = countDirections(score);
const rtDirStats = countDirections(reparsed);

console.log('Directions:', origDirStats.directions, '->', rtDirStats.directions);
console.log('Dynamics:', origDirStats.dynamics, '->', rtDirStats.dynamics);
console.log('Wedges:', origDirStats.wedges, '->', rtDirStats.wedges);
console.log('Words:', origDirStats.words, '->', rtDirStats.words);
console.log('Tempos:', origDirStats.tempos, '->', rtDirStats.tempos);
console.log('Metronomes:', origDirStats.metronomes, '->', rtDirStats.metronomes);
console.log('Pedals:', origDirStats.pedals, '->', rtDirStats.pedals);

for (const [key, origVal] of Object.entries(origDirStats)) {
  const rtVal = rtDirStats[key as keyof typeof rtDirStats];
  if (origVal !== rtVal) {
    issues.push({
      category: 'Directions',
      description: `${key} count differs: ${origVal} -> ${rtVal}`
    });
  }
}

// 6. Check slurs (from notations array)
console.log('\n=== 6. Slurs ===');
function countSlurs(s: Score) {
  let slurStarts = 0;
  let slurStops = 0;
  let slurContinues = 0;

  for (const part of s.parts) {
    for (const measure of part.measures) {
      for (const entry of measure.entries) {
        if (entry.type === 'note') {
          const note = entry as NoteEntry;
          if (note.notations) {
            for (const notation of note.notations) {
              if (notation.type === 'slur') {
                const slur = notation as any;
                if (slur.slurType === 'start') slurStarts++;
                else if (slur.slurType === 'stop') slurStops++;
                else if (slur.slurType === 'continue') slurContinues++;
              }
            }
          }
        }
      }
    }
  }
  return { slurStarts, slurStops, slurContinues };
}

const origSlurs = countSlurs(score);
const rtSlurs = countSlurs(reparsed);
console.log('Slur starts:', origSlurs.slurStarts, '->', rtSlurs.slurStarts);
console.log('Slur stops:', origSlurs.slurStops, '->', rtSlurs.slurStops);
console.log('Slur continues:', origSlurs.slurContinues, '->', rtSlurs.slurContinues);

if (origSlurs.slurStarts !== rtSlurs.slurStarts || origSlurs.slurStops !== rtSlurs.slurStops) {
  issues.push({
    category: 'Slurs',
    description: `Slur count differs: starts ${origSlurs.slurStarts}->${rtSlurs.slurStarts}, stops ${origSlurs.slurStops}->${rtSlurs.slurStops}`
  });
}

// 7. Check ties
console.log('\n=== 7. Ties ===');
function countTies(s: Score) {
  let tieStarts = 0;
  let tieStops = 0;

  for (const part of s.parts) {
    for (const measure of part.measures) {
      for (const entry of measure.entries) {
        if (entry.type === 'note') {
          const note = entry as NoteEntry;
          if (note.tie) {
            if (note.tie.type === 'start' || note.tie.type === 'start-stop') tieStarts++;
            if (note.tie.type === 'stop' || note.tie.type === 'start-stop') tieStops++;
          }
          if (note.ties) {
            for (const tie of note.ties) {
              if (tie.type === 'start') tieStarts++;
              if (tie.type === 'stop') tieStops++;
            }
          }
        }
      }
    }
  }
  return { tieStarts, tieStops };
}

const origTies = countTies(score);
const rtTies = countTies(reparsed);
console.log('Tie starts:', origTies.tieStarts, '->', rtTies.tieStarts);
console.log('Tie stops:', origTies.tieStops, '->', rtTies.tieStops);

// 8. Check lyrics
console.log('\n=== 8. Lyrics ===');
function countLyrics(s: Score) {
  let lyrics = 0;
  let syllabics = { single: 0, begin: 0, middle: 0, end: 0 };

  for (const part of s.parts) {
    for (const measure of part.measures) {
      for (const entry of measure.entries) {
        if (entry.type === 'note') {
          const note = entry as NoteEntry;
          if (note.lyrics) {
            lyrics += note.lyrics.length;
            for (const lyric of note.lyrics) {
              if (lyric.syllabic) {
                syllabics[lyric.syllabic as keyof typeof syllabics]++;
              }
            }
          }
        }
      }
    }
  }
  return { lyrics, syllabics };
}

const origLyrics = countLyrics(score);
const rtLyrics = countLyrics(reparsed);
console.log('Total lyrics:', origLyrics.lyrics, '->', rtLyrics.lyrics);
console.log('Syllabics:', JSON.stringify(origLyrics.syllabics), '->', JSON.stringify(rtLyrics.syllabics));

// 9. Check articulations (from notations array)
console.log('\n=== 9. Articulations ===');
function countArticulations(s: Score) {
  const arts: Record<string, number> = {};

  for (const part of s.parts) {
    for (const measure of part.measures) {
      for (const entry of measure.entries) {
        if (entry.type === 'note') {
          const note = entry as NoteEntry;
          if (note.notations) {
            for (const notation of note.notations) {
              if (notation.type === 'articulation') {
                const artType = (notation as any).articulation || 'unknown';
                arts[artType] = (arts[artType] || 0) + 1;
              }
            }
          }
        }
      }
    }
  }
  return arts;
}

const origArts = countArticulations(score);
const rtArts = countArticulations(reparsed);
console.log('Original articulations:', JSON.stringify(origArts));
console.log('Roundtrip articulations:', JSON.stringify(rtArts));

// 10. Check ornaments (from notations array)
console.log('\n=== 10. Ornaments ===');
function countOrnaments(s: Score) {
  const orns: Record<string, number> = {};

  for (const part of s.parts) {
    for (const measure of part.measures) {
      for (const entry of measure.entries) {
        if (entry.type === 'note') {
          const note = entry as NoteEntry;
          if (note.notations) {
            for (const notation of note.notations) {
              if (notation.type === 'ornament') {
                const ornType = (notation as any).ornament || 'unknown';
                orns[ornType] = (orns[ornType] || 0) + 1;
              }
            }
          }
        }
      }
    }
  }
  return orns;
}

const origOrns = countOrnaments(score);
const rtOrns = countOrnaments(reparsed);
console.log('Original ornaments:', JSON.stringify(origOrns));
console.log('Roundtrip ornaments:', JSON.stringify(rtOrns));

// 11. Check beams
console.log('\n=== 11. Beams ===');
function countBeams(s: Score) {
  let beamCount = 0;

  for (const part of s.parts) {
    for (const measure of part.measures) {
      for (const entry of measure.entries) {
        if (entry.type === 'note') {
          const note = entry as NoteEntry;
          if (note.beams) {
            beamCount += note.beams.length;
          }
        }
      }
    }
  }
  return beamCount;
}

const origBeams = countBeams(score);
const rtBeams = countBeams(reparsed);
console.log('Beam count:', origBeams, '->', rtBeams);

// 12. Check harmonies
console.log('\n=== 12. Harmonies ===');
function countHarmonies(s: Score) {
  let harmonyCount = 0;

  for (const part of s.parts) {
    for (const measure of part.measures) {
      for (const entry of measure.entries) {
        if (entry.type === 'harmony') {
          harmonyCount++;
        }
      }
    }
  }
  return harmonyCount;
}

const origHarmonies = countHarmonies(score);
const rtHarmonies = countHarmonies(reparsed);
console.log('Harmony count:', origHarmonies, '->', rtHarmonies);

// 13. Check print elements
console.log('\n=== 13. Print Elements ===');
function countPrints(s: Score) {
  let prints = 0;

  for (const part of s.parts) {
    for (const measure of part.measures) {
      if (measure.print) prints++;
    }
  }
  return prints;
}

const origPrints = countPrints(score);
const rtPrints = countPrints(reparsed);
console.log('Print elements:', origPrints, '->', rtPrints);

// 14. Check barlines
console.log('\n=== 14. Barlines ===');
function countBarlines(s: Score) {
  let barlines = 0;
  let repeats = 0;
  let endings = 0;

  for (const part of s.parts) {
    for (const measure of part.measures) {
      if (measure.barlines) {
        barlines += measure.barlines.length;
        for (const bl of measure.barlines) {
          if (bl.repeat) repeats++;
          if (bl.ending) endings++;
        }
      }
    }
  }
  return { barlines, repeats, endings };
}

const origBarlines = countBarlines(score);
const rtBarlines = countBarlines(reparsed);
console.log('Barlines:', origBarlines.barlines, '->', rtBarlines.barlines);
console.log('Repeats:', origBarlines.repeats, '->', rtBarlines.repeats);
console.log('Endings:', origBarlines.endings, '->', rtBarlines.endings);

// 15. Check grace notes
console.log('\n=== 15. Grace Notes ===');
function countGraceNotes(s: Score) {
  let graceCount = 0;

  for (const part of s.parts) {
    for (const measure of part.measures) {
      for (const entry of measure.entries) {
        if (entry.type === 'note') {
          const note = entry as NoteEntry;
          if (note.grace) graceCount++;
        }
      }
    }
  }
  return graceCount;
}

const origGrace = countGraceNotes(score);
const rtGrace = countGraceNotes(reparsed);
console.log('Grace notes:', origGrace, '->', rtGrace);

// 16. Check tuplets
console.log('\n=== 16. Tuplets ===');
function countTuplets(s: Score) {
  let tupletStarts = 0;
  let tupletStops = 0;

  for (const part of s.parts) {
    for (const measure of part.measures) {
      for (const entry of measure.entries) {
        if (entry.type === 'note') {
          const note = entry as NoteEntry;
          if (note.tuplet) {
            if (note.tuplet.type === 'start') tupletStarts++;
            if (note.tuplet.type === 'stop') tupletStops++;
          }
        }
      }
    }
  }
  return { tupletStarts, tupletStops };
}

const origTuplets = countTuplets(score);
const rtTuplets = countTuplets(reparsed);
console.log('Tuplet starts:', origTuplets.tupletStarts, '->', rtTuplets.tupletStarts);
console.log('Tuplet stops:', origTuplets.tupletStops, '->', rtTuplets.tupletStops);

// 17. Check defaults (page layout, etc.)
console.log('\n=== 17. Defaults ===');
console.log('Original defaults:', score.defaults ? 'present' : 'missing');
console.log('Reparsed defaults:', reparsed.defaults ? 'present' : 'missing');
if (score.defaults) {
  console.log('  Scaling:', score.defaults.scaling ? 'yes' : 'no', '->', reparsed.defaults?.scaling ? 'yes' : 'no');
  console.log('  Page layout:', score.defaults.pageLayout ? 'yes' : 'no', '->', reparsed.defaults?.pageLayout ? 'yes' : 'no');
  console.log('  System layout:', score.defaults.systemLayout ? 'yes' : 'no', '->', reparsed.defaults?.systemLayout ? 'yes' : 'no');
  console.log('  Staff layout:', score.defaults.staffLayout ? 'yes' : 'no', '->', reparsed.defaults?.staffLayout ? 'yes' : 'no');
  console.log('  Appearance:', score.defaults.appearance ? 'yes' : 'no', '->', reparsed.defaults?.appearance ? 'yes' : 'no');
  console.log('  Music font:', score.defaults.musicFont ? 'yes' : 'no', '->', reparsed.defaults?.musicFont ? 'yes' : 'no');
  console.log('  Word font:', score.defaults.wordFont ? 'yes' : 'no', '->', reparsed.defaults?.wordFont ? 'yes' : 'no');
  console.log('  Lyric font:', score.defaults.lyricFont ? 'yes' : 'no', '->', reparsed.defaults?.lyricFont ? 'yes' : 'no');
}

// 18. Check all notations types
console.log('\n=== 18. All Notations Types ===');
function countAllNotations(s: Score) {
  const counts: Record<string, number> = {};

  for (const part of s.parts) {
    for (const measure of part.measures) {
      for (const entry of measure.entries) {
        if (entry.type === 'note') {
          const note = entry as NoteEntry;
          if (note.notations) {
            for (const notation of note.notations) {
              counts[notation.type] = (counts[notation.type] || 0) + 1;
            }
          }
        }
      }
    }
  }
  return counts;
}

const origNotations = countAllNotations(score);
const rtNotations = countAllNotations(reparsed);
console.log('Original notations:', JSON.stringify(origNotations, null, 2));
console.log('Roundtrip notations:', JSON.stringify(rtNotations, null, 2));

for (const [type, count] of Object.entries(origNotations)) {
  const rtCount = rtNotations[type] || 0;
  if (count !== rtCount) {
    issues.push({
      category: 'Notations',
      description: `${type} count differs: ${count} -> ${rtCount}`
    });
  }
}

// 19. Check specific XML elements that may be lost
console.log('\n=== 19. Specific XML Element Checks ===');

// Check for elements in original that might be lost
const elementsToCheck = [
  { name: 'wedge', pattern: /<wedge[^>]*>/g },
  { name: 'dynamics', pattern: /<dynamics[^>]*>/g },
  { name: 'articulations', pattern: /<articulations[^>]*>/g },
  { name: 'ornaments', pattern: /<ornaments[^>]*>/g },
  { name: 'technical', pattern: /<technical[^>]*>/g },
  { name: 'fermata', pattern: /<fermata[^>]*>/g },
  { name: 'arpeggiate', pattern: /<arpeggiate[^>]*>/g },
  { name: 'tremolo', pattern: /<tremolo[^>]*>/g },
  { name: 'glissando', pattern: /<glissando[^>]*>/g },
  { name: 'slide', pattern: /<slide[^>]*>/g },
  { name: 'coda', pattern: /<coda[^>]*>/g },
  { name: 'segno', pattern: /<segno[^>]*>/g },
  { name: 'pedal', pattern: /<pedal[^>]*>/g },
  { name: 'metronome', pattern: /<metronome[^>]*>/g },
  { name: 'octave-shift', pattern: /<octave-shift[^>]*>/g },
  { name: 'bracket', pattern: /<bracket[^>]*>/g },
  { name: 'dashes', pattern: /<dashes[^>]*>/g },
];

for (const el of elementsToCheck) {
  const origMatches = original.match(el.pattern) || [];
  const rtMatches = roundtrip.match(el.pattern) || [];
  if (origMatches.length !== rtMatches.length) {
    console.log(`${el.name}: ${origMatches.length} -> ${rtMatches.length}`);
    issues.push({
      category: 'XML Elements',
      description: `${el.name} count differs: ${origMatches.length} -> ${rtMatches.length}`
    });
  }
}

// Summary
console.log('\n========================================');
console.log('=== ISSUES SUMMARY ===');
console.log('========================================');

if (issues.length === 0) {
  console.log('\n✅ No significant issues found!');
} else {
  console.log(`\n❌ Found ${issues.length} issues:\n`);

  const byCategory: Record<string, Issue[]> = {};
  for (const issue of issues) {
    if (!byCategory[issue.category]) {
      byCategory[issue.category] = [];
    }
    byCategory[issue.category].push(issue);
  }

  for (const [category, catIssues] of Object.entries(byCategory)) {
    console.log(`\n[${category}]`);
    for (const issue of catIssues) {
      console.log(`  - ${issue.description}`);
      if (issue.location) console.log(`    Location: ${issue.location}`);
      if (issue.details) console.log(`    Details: ${issue.details.substring(0, 100)}...`);
    }
  }
}

console.log('\n');
