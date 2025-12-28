# MusicXML Query & Accessor API

> **Query/Accessor機能の実装状況と計画**
>
> このドキュメントはQuery（読み取り）機能の実装チェックリストです。
> 実装が完了したらチェックを入れてください。

---

## 概要

MusicXMLは以下の3層構造を持つ:

```
Part (楽器)
├── Staff (物理的な譜表 - 1-based)
│   └── Voice (旋律線 - 論理的な声部)
└── Measure (小節)
    └── Entry (note, backup, forward, direction, etc.)
```

Query/Accessorは読み取り専用で、Scoreを変更しない純粋関数。

---

## 1. Score/Part アクセス

| 関数 | 説明 | 実装 |
|------|------|:----:|
| `getPartById(score, id)` | IDでPartを取得 | ✅ |
| `getPartIndex(score, id)` | IDからPartインデックスを取得 | ✅ |
| `getPartByIndex(score, index)` | インデックスでPartを取得 | ✅ |
| `getPartCount(score)` | Part数を取得 | ✅ |
| `getPartIds(score)` | 全PartのIDリストを取得 | ✅ |

---

## 2. Measure アクセス

| 関数 | 説明 | 実装 |
|------|------|:----:|
| `getMeasure(score, {part, measure})` | 小節番号でMeasure取得 | ✅ |
| `getMeasureByIndex(score, {part, measureIndex})` | インデックスでMeasure取得 | ✅ |
| `getMeasureCount(score, partIndex?)` | 小節数を取得 | ✅ |
| `getAttributesAtMeasure(score, {part, measure})` | 累積属性を取得 | ✅ |
| `getDivisions(score, {part, measure})` | divisions値を取得 | ✅ |
| `getDuration(score)` | 全体の長さ（divisions単位） | ✅ |
| `getMeasureEndPosition(measure)` | 小節終端位置を取得 | ✅ |

---

## 3. Staff アクセス ⭐ Phase 1 ✅

MusicXMLのStaff構造を正しく扱うための関数群。

### 3.1 基本情報

| 関数 | 説明 | 実装 |
|------|------|:----:|
| `hasMultipleStaves(score, partIndex)` | 複数Staff判定 | ✅ |
| `getStaveCount(score, partIndex)` | Staff数を取得 | ✅ |
| `getStaves(measure)` | Measure内の使用中Staff一覧 | ✅ |
| `getStaffRange(score, partIndex)` | Staff番号の範囲（min, max） | ✅ |

### 3.2 Staff別データ取得

| 関数 | 説明 | 実装 |
|------|------|:----:|
| `getNotesForStaff(measure, staff)` | Staff内のNoteを取得 | ✅ |
| `groupByStaff(measure)` | Staff単位でグループ化 | ✅ |
| `getEntriesForStaff(measure, staff)` | Staff内の全Entry（note以外含む）を取得 | ✅ |
| `getClefForStaff(score, {part, measure, staff})` | 特定Staffの音部記号を取得 | ✅ |
| `getVoicesForStaff(measure, staff)` | Staff内のVoice一覧 | ✅ |

### 3.3 Voice→Staff マッピング

`<staff>` 要素が省略されることがあるため、Voice番号からStaffを推測する機能。

| 関数 | 説明 | 実装 |
|------|------|:----:|
| `buildVoiceToStaffMap(measure)` | Voice→Staffマッピングを構築 | ✅ |
| `buildVoiceToStaffMapForPart(part)` | Part全体でマッピングを構築 | ✅ |
| `inferStaff(entry, voiceToStaffMap)` | Staff省略時の推測 | ✅ |
| `getEffectiveStaff(entry, measure)` | 明示的or推測でStaffを取得 | ✅ |

---

## 4. Voice アクセス

| 関数 | 説明 | 実装 |
|------|------|:----:|
| `getVoices(measure)` | Measure内のVoice一覧 | ✅ |
| `getNotesForVoice(measure, {voice, staff?})` | Voice内のNoteを取得 | ✅ |
| `groupByVoice(measure)` | Voice単位でグループ化 | ✅ |
| `getVoiceLine(score, {part, voice, staff?})` | 連続した旋律線（複数Measure横断） | ✅ |
| `getVoiceLineInRange(score, {part, voice, startMeasure, endMeasure})` | 範囲内の旋律線 | ✅ |

---

## 5. 位置・時間軸 ⭐ Phase 2 ✅

### 5.1 基本位置計算

| 関数 | 説明 | 実装 |
|------|------|:----:|
| `getAbsolutePosition(note, measure)` | 音符の絶対位置 | ✅ |
| `withAbsolutePositions(measure)` | 全音符に位置を付与 | ✅ |
| `getNormalizedPosition(note, measure, options)` | divisions正規化した位置 | ✅ |
| `getNormalizedDuration(note, options)` | divisions正規化したduration | ✅ |

### 5.2 位置ベースのQuery

| 関数 | 説明 | 実装 |
|------|------|:----:|
| `getEntriesAtPosition(measure, position, options?)` | 特定位置の全Entryを取得 | ✅ |
| `getNotesAtPosition(measure, position, options?)` | 特定位置のNoteを取得 | ✅ |
| `getEntriesInRange(measure, {start, end}, options?)` | 範囲内の全Entryを取得 | ✅ |
| `getNotesInRange(measure, {start, end}, options?)` | 範囲内のNoteを取得 | ✅ |
| `getVerticalSlice(score, {measureIndex, position})` | 全Part横断の同時発音 | ✅ |

---

## 6. Note検索・イテレーション

### 6.1 イテレーション

| 関数 | 説明 | 実装 |
|------|------|:----:|
| `iterateNotes(score)` | 全Noteをイテレート | ✅ |
| `getAllNotes(score)` | 全Noteを配列で取得 | ✅ |
| `iterateEntries(score)` | 全Entryをイテレート（note以外含む） | ✅ |

### 6.2 検索

| 関数 | 説明 | 実装 |
|------|------|:----:|
| `findNotes(score, filter)` | 条件でNote検索 | ✅ |
| `countNotes(score)` | Note数をカウント | ✅ |
| `hasNotes(measure)` | Noteが存在するか | ✅ |
| `isRestMeasure(measure)` | 全休符か判定 | ✅ |
| `findNotesWithNotation(score, notationType)` | 特定Notation付きNoteを検索 | ✅ |

### 6.3 ナビゲーション ⭐ Phase 3 ✅

| 関数 | 説明 | 実装 |
|------|------|:----:|
| `getNextNote(score, noteContext)` | 次のNote（同一voice内） | ✅ |
| `getPrevNote(score, noteContext)` | 前のNote（同一voice内） | ✅ |
| `getAdjacentNotes(score, noteContext)` | 前後のNoteをペアで取得 | ✅ |

---

## 7. 和音・グループ ⭐ Phase 5 ✅

| 関数 | 説明 | 実装 |
|------|------|:----:|
| `getChords(measure, filter?)` | 和音グループを取得 | ✅ |
| `getTiedNoteGroups(score, {part?})` | タイで繋がった音符群 | ✅ |
| `getSlurSpans(score, {part?})` | スラー区間（開始〜終了ペア） | ✅ |
| `getTupletGroups(score, {part?})` | 連符グループ | ✅ |
| `getBeamGroups(measure)` | 連桁グループ | ✅ |

---

## 8. Direction・Expression ⭐ Phase 4 ✅

### 8.1 Direction取得

| 関数 | 説明 | 実装 |
|------|------|:----:|
| `getDirections(score, {part?, measure?})` | Direction要素を取得 | ✅ |
| `getDirectionsAtPosition(measure, position)` | 特定位置のDirectionを取得 | ✅ |
| `findDirectionsByType(score, directionKind)` | 種類でDirectionを検索 | ✅ |

### 8.2 表情記号

| 関数 | 説明 | 実装 |
|------|------|:----:|
| `getDynamics(score, {part?})` | 強弱記号を取得 | ✅ |
| `getTempoMarkings(score)` | テンポ指示を取得 | ✅ |
| `getPedalMarkings(score, {part?})` | ペダル記号を取得 | ✅ |
| `getWedges(score, {part?})` | クレッシェンド/デクレッシェンドを取得 | ✅ |
| `getOctaveShifts(score, {part?})` | オクターブ記号を取得 | ✅ |

---

## 9. Harmony・Lyrics ⭐ Phase 6 ✅

### 9.1 Harmony（コード記号）

| 関数 | 説明 | 実装 |
|------|------|:----:|
| `getHarmonies(score, {part?})` | HarmonyEntryを取得 | ✅ |
| `getHarmonyAtPosition(measure, position)` | 特定位置のHarmonyを取得 | ✅ |
| `getChordProgression(score)` | コード進行をシンプルな形式で | ✅ |

### 9.2 Lyrics（歌詞）

| 関数 | 説明 | 実装 |
|------|------|:----:|
| `getLyrics(score, {part?, verse?})` | 歌詞を取得 | ✅ |
| `getLyricText(score, {part?, verse?})` | 歌詞テキストを連結 | ✅ |
| `getVerseCount(score, partIndex?)` | 歌詞行数を取得 | ✅ |

---

## 10. 構造・ナビゲーション ⭐ Phase 7 ✅

### 10.1 繰り返し構造

| 関数 | 説明 | 実装 |
|------|------|:----:|
| `getRepeatStructure(score)` | 繰り返し構造を取得 | ✅ |
| `findBarlines(score, {style?, repeat?})` | 特定barlineの位置 | ✅ |
| `getEndings(score)` | 1番括弧、2番括弧を取得 | ✅ |

### 10.2 構造変化点

| 関数 | 説明 | 実装 |
|------|------|:----:|
| `getKeyChanges(score)` | 調号変更点を取得 | ✅ |
| `getTimeChanges(score)` | 拍子変更点を取得 | ✅ |
| `getClefChanges(score, {part?, staff?})` | 音部記号変更点を取得 | ✅ |
| `getStructuralChanges(score)` | 全構造変化点をまとめて取得 | ✅ |

---

## 11. 比較・検証

| 関数 | 説明 | 実装 |
|------|------|:----:|
| `scoresEqual(a, b)` | Score比較 | ✅ |
| `measureRoundtrip(original, exported)` | Round-trip精度を計測 | ✅ |

---

## 12. ユーティリティ

| 関数 | 説明 | 実装 |
|------|------|:----:|
| `pitchToSemitone(pitch)` | PitchをMIDI番号に変換 | ✅ |
| `STEPS` | ['C', 'D', 'E', 'F', 'G', 'A', 'B'] | ✅ |
| `STEP_SEMITONES` | 各StepのセミトーンMap | ✅ |

---

## 実装優先度

### Phase 1: Staff強化 ✅
- [x] `getEntriesForStaff`
- [x] `buildVoiceToStaffMap`
- [x] `buildVoiceToStaffMapForPart`
- [x] `inferStaff`
- [x] `getEffectiveStaff`
- [x] `getClefForStaff`
- [x] `getVoicesForStaff`
- [x] `getStaffRange`

### Phase 2: 位置・旋律線 ✅
- [x] `getEntriesAtPosition`
- [x] `getNotesAtPosition`
- [x] `getEntriesInRange`
- [x] `getNotesInRange`
- [x] `getVerticalSlice`
- [x] `getVoiceLine`
- [x] `getVoiceLineInRange`

### Phase 3: ナビゲーション ✅
- [x] `getNextNote`
- [x] `getPrevNote`
- [x] `getAdjacentNotes`
- [x] `iterateEntries`

### Phase 4: Direction・Expression ✅
- [x] `getDirections`
- [x] `getDirectionsAtPosition`
- [x] `findDirectionsByType`
- [x] `getDynamics`
- [x] `getTempoMarkings`
- [x] `getPedalMarkings`
- [x] `getWedges`
- [x] `getOctaveShifts`

### Phase 5: グループ・スパン ✅
- [x] `getTiedNoteGroups`
- [x] `getSlurSpans`
- [x] `getTupletGroups`
- [x] `getBeamGroups`
- [x] `findNotesWithNotation`

### Phase 6: Harmony・Lyrics ✅
- [x] `getHarmonies`
- [x] `getHarmonyAtPosition`
- [x] `getChordProgression`
- [x] `getLyrics`
- [x] `getLyricText`
- [x] `getVerseCount`

### Phase 7: 構造 ✅
- [x] `getRepeatStructure`
- [x] `findBarlines`
- [x] `getEndings`
- [x] `getKeyChanges`
- [x] `getTimeChanges`
- [x] `getClefChanges`
- [x] `getStructuralChanges`

### Phase 8: 細かい追加 ✅
- [x] `getPartByIndex`
- [x] `getPartCount`
- [x] `getPartIds`

---

## 型定義（実装済み）

```typescript
// Voice→Staffマッピング
interface VoiceToStaffMap {
  get(voice: number): number | undefined;
  has(voice: number): boolean;
  entries(): IterableIterator<[number, number]>;
  size: number;
}

// 旋律線の音符（コンテキスト付き）
interface NoteWithContext {
  note: NoteEntry;
  part: Part;
  partIndex: number;
  measure: Measure;
  measureIndex: number;
  position: number;
}

// Entry with context
interface EntryWithContext {
  entry: MeasureEntry;
  part: Part;
  partIndex: number;
  measure: Measure;
  measureIndex: number;
  position: number;
}

// 位置ベースQuery用オプション
interface PositionQueryOptions {
  staff?: number;
  voice?: number;
  includeChordNotes?: boolean;
}

// Direction with context
interface DirectionWithContext {
  direction: DirectionEntry;
  part: Part;
  partIndex: number;
  measure: Measure;
  measureIndex: number;
  position: number;
}

// Staff range
interface StaffRange {
  min: number;
  max: number;
}

// Vertical slice
interface VerticalSlice {
  measureIndex: number;
  position: number;
  parts: Map<number, NoteEntry[]>;
}

// Voice line
interface VoiceLine {
  partIndex: number;
  voice: number;
  staff?: number;
  notes: NoteWithContext[];
}

// Adjacent notes
interface AdjacentNotes {
  prev: NoteWithContext | null;
  next: NoteWithContext | null;
}

// Dynamic with context
interface DynamicWithContext {
  dynamic: DynamicsValue;
  direction: DirectionEntry;
  part: Part;
  partIndex: number;
  measure: Measure;
  measureIndex: number;
  position: number;
}

// Tempo with context
interface TempoWithContext {
  beatUnit: NoteType;
  perMinute?: number | string;
  beatUnitDot?: boolean;
  direction: DirectionEntry;
  partIndex: number;
  measureIndex: number;
  position: number;
}

// Pedal with context
interface PedalWithContext {
  pedalType: 'start' | 'stop' | 'change' | 'continue';
  direction: DirectionEntry;
  partIndex: number;
  measureIndex: number;
  position: number;
}

// Wedge with context
interface WedgeWithContext {
  wedgeType: 'crescendo' | 'diminuendo' | 'stop';
  direction: DirectionEntry;
  partIndex: number;
  measureIndex: number;
  position: number;
}

// Octave shift with context
interface OctaveShiftWithContext {
  shiftType: 'up' | 'down' | 'stop';
  size?: number;
  direction: DirectionEntry;
  partIndex: number;
  measureIndex: number;
  position: number;
}

// Phase 5: Groups and Spans

// Tied note group
interface TiedNoteGroup {
  notes: NoteWithContext[];
  totalDuration: number;
}

// Slur span
interface SlurSpan {
  number: number;
  startNote: NoteWithContext;
  endNote: NoteWithContext;
  notes: NoteWithContext[];
}

// Tuplet group
interface TupletGroup {
  number: number;
  notes: NoteWithContext[];
  actualNotes: number;
  normalNotes: number;
}

// Beam group
interface BeamGroup {
  notes: NoteWithContext[];
  beamLevel: number;
}

// Notation type filter
type NotationType = Notation['type'];

// Phase 6: Harmony and Lyrics

// Harmony with context
interface HarmonyWithContext {
  harmony: HarmonyEntry;
  part: Part;
  partIndex: number;
  measure: Measure;
  measureIndex: number;
  position: number;
}

// Lyric with context
interface LyricWithContext {
  lyric: Lyric;
  note: NoteEntry;
  part: Part;
  partIndex: number;
  measure: Measure;
  measureIndex: number;
  position: number;
  verse: number;
}

// Assembled lyrics
interface AssembledLyrics {
  verse: number;
  text: string;
  syllables: { text: string; position: number; measureIndex: number }[];
}

// Phase 7: Structure

// Barline with context
interface BarlineWithContext {
  barline: Barline;
  partIndex: number;
  measureIndex: number;
  measureNumber: string;
}

// Repeat info
interface RepeatInfo {
  type: 'forward' | 'backward';
  times?: number;
  measureIndex: number;
  measureNumber: string;
}

// Ending info
interface EndingInfo {
  number: string;
  type: 'start' | 'stop' | 'discontinue';
  partIndex: number;
  measureIndex: number;
  measureNumber: string;
}

// Key change info
interface KeyChangeInfo {
  key: KeySignature;
  partIndex: number;
  measureIndex: number;
  measureNumber: string;
  position: number;
}

// Time change info
interface TimeChangeInfo {
  time: TimeSignature;
  partIndex: number;
  measureIndex: number;
  measureNumber: string;
}

// Clef change info
interface ClefChangeInfo {
  clef: Clef;
  staff: number;
  partIndex: number;
  measureIndex: number;
  measureNumber: string;
  position: number;
}

// Structural changes
interface StructuralChanges {
  keyChanges: KeyChangeInfo[];
  timeChanges: TimeChangeInfo[];
  clefChanges: ClefChangeInfo[];
}
```

---

## 参考: MusicXML Part/Staff/Voice 構造

```
Part (楽器) - 例: Piano
├── Staff 1 (右手 - ト音記号)
│   ├── Voice 1 (メロディー)
│   └── Voice 2 (対旋律)
├── Staff 2 (左手 - ヘ音記号)
│   └── Voice 3 (伴奏)
└── Measure 内の Entry 順序:
    Staff 1 の entries → backup → Staff 2 の entries
```

### 重要なポイント

1. **Staff は 1-based**: MusicXML仕様に準拠
2. **Staff 省略時は 1**: `<staff>` 要素が省略された場合のデフォルト
3. **Voice→Staff マッピング**: 実際には Voice 番号から Staff を推測できることが多い
4. **backup/forward**: Staff/Voice 間の時間移動に使用
