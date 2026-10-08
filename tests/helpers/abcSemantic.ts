/**
 * Reduce a Score to one token per musical event, so two parses of ABC can be
 * compared on musical content (pitch, length, tuplets, ties, slurs, beams,
 * decorations, lyrics, bar lines, meter/key/clef) rather than on text.
 */
import type { Score, NoteEntry, Measure } from '../../src/types';

export function noteToken(n: NoteEntry, divisions: number): string {
  const parts: string[] = [];
  if (n.grace) parts.push('g');
  if (n.chord) parts.push('+');
  if (n.rest) parts.push('z');
  else if (n.pitch) parts.push(`${n.pitch.step}${n.pitch.alter ?? ''}${n.pitch.octave}`);
  else if (n.unpitched) parts.push('x');
  if (!n.grace) parts.push(`d${(n.duration / divisions).toFixed(4)}`);
  if (n.timeModification) parts.push(`t${n.timeModification.actualNotes}:${n.timeModification.normalNotes}`);
  const ties = (n.ties ?? (n.tie ? [n.tie] : [])).map(t => t.type).sort().join('');
  if (ties) parts.push(`tie:${ties}`);
  const b1 = n.beam?.find(b => b.number === 1)?.type;
  if (b1) parts.push(`b:${b1}`);
  for (const nt of n.notations ?? []) {
    const k = nt.type === 'slur' ? `slur:${(nt as any).slurType}` : nt.type === 'tuplet' ? `tuplet:${(nt as any).tupletType}` : nt.type === 'tied' ? '' : `${nt.type}:${(nt as any).articulation ?? (nt as any).ornament ?? (nt as any).technical ?? (nt as any).shape ?? (nt as any).dynamics ?? ''}`;
    if (k) parts.push(k);
  }
  for (const l of n.lyrics ?? []) parts.push(`ly${l.number ?? 1}:${l.text}:${l.syllabic ?? ''}`);
  return parts.join(' ');
}

export function measureTokens(m: Measure, divisions: number): string[] {
  const out: string[] = [];
  const a = m.attributes;
  if (a?.time) out.push(`TIME ${a.time.beats}/${a.time.beatType}`);
  if (a?.key) out.push(`KEY ${a.key.fifths} ${a.key.mode ?? ''}`);
  if (a?.clef) out.push(`CLEF ${a.clef.map(c => c.sign + c.line).join(',')}`);
  for (const b of m.barlines ?? []) out.push(`BAR ${b.location} ${b.barStyle ?? ''} ${b.repeat?.direction ?? ''} ${b.ending?.number ?? ''}`.trimEnd());
  for (const e of m.entries) {
    if (e.type === 'note') out.push(noteToken(e, divisions));
    else if (e.type === 'backup') out.push('BACKUP');
    else if (e.type === 'harmony') out.push(`HARM ${(e as any).root?.rootStep ?? ''}${(e as any).kind ?? ''}`);
    else if (e.type === 'direction') {
      for (const dt of (e as any).directionTypes ?? []) {
        if (dt.kind === 'words' && /^__abc_line/.test(dt.text)) continue;
        out.push(`DIR ${dt.kind}${dt.kind === 'words' ? ':' + dt.text : dt.kind === 'dynamics' ? ':' + JSON.stringify(dt.value ?? dt.dynamics) : ''}`);
      }
    }
  }
  return out;
}

export function abcSemanticTokens(score: Score): string[] {
  const out: string[] = [];
  score.parts.forEach((p, pi) => {
    let divisions = 1;
    p.measures.forEach((m, mi) => {
      if (m.attributes?.divisions) divisions = m.attributes.divisions;
      for (const t of measureTokens(m, divisions)) out.push(`P${pi} M${mi + 1} | ${t}`);
    });
  });
  return out;
}

/** Measures whose voices don't add up to the time signature (first/last bar exempt: pickups). */
export function badMeasures(score: Score): string[] {
  const out: string[] = [];
  score.parts.forEach((p, pi) => {
    let divisions = 1, beats = 0;
    p.measures.forEach((m, mi) => {
      if (m.attributes?.divisions) divisions = m.attributes.divisions;
      const t = m.attributes?.time;
      if (t) beats = (parseInt(t.beats, 10) * 4) / t.beatType;
      if (mi === 0 || mi === p.measures.length - 1 || !beats || m.attributes?.measureStyle) return;
      const voices: number[] = [0];
      for (const e of m.entries) {
        if (e.type === 'backup') voices.push(0);
        else if (e.type === 'note' && !e.chord && !e.grace) voices[voices.length - 1] += e.duration / divisions;
      }
      for (const v of voices) if (Math.abs(v - beats) > 0.01) { out.push(`P${pi} M${mi + 1}: ${v.toFixed(3)} beats, meter ${beats}`); break; }
    });
  });
  return out;
}

