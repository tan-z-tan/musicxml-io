# musicxml-io 仕様書

> **A TypeScript library for parsing, manipulating, and serializing MusicXML with high round-trip fidelity.**
>
> Parse and serialize MusicXML 1.0-4.0 with a MusicXML-compatible internal representation. Provides accessor functions for convenient Staff/Voice traversal and pure-function operations for transposition, note editing, and more.

## 概要

**musicxml-io** は、MusicXMLファイルのパース・シリアライズと、音楽的に安全な操作APIを提供するTypeScriptライブラリ。

### ゴール

1. **Import/Export**: MusicXML 1.0〜4.0の読み書き
2. **Round-trip精度**: import → export で元ファイルを高精度に再現
3. **操作API**: 移調、音符追加/削除など、音楽的に破綻しにくい操作関数
4. **互換性**: 主要ソフト (MuseScore, Finale, Sibelius, Dorico) で動作

### 非ゴール

- レンダリング (SVG/Canvas描画)
- 音声再生 (MIDI/Audio)
- リアルタイム共同編集 (Yjs統合は別パッケージ)

---

## アーキテクチャ

```
┌─────────────────────────────────────────────────────────────────┐
│                        musicxml-io                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │   Parser    │───►│   Score     │◄───│ Serializer  │         │
│  │ (Import)    │    │  (Model)    │    │  (Export)   │         │
│  └─────────────┘    └──────┬──────┘    └─────────────┘         │
│                            │                                    │
│                    ┌───────┴───────┐                            │
│                    │               │                            │
│              ┌─────▼─────┐  ┌──────▼──────┐                     │
│              │ Accessors │  │ Operations  │                     │
│              │ (Query)   │  │ (Pure Fn)   │                     │
│              └───────────┘  └─────────────┘                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

入力:                    内部:                    出力:
MusicXML String    →    Score Model    →    MusicXML String
(.xml, .musicxml)       (MusicXML互換)       (.xml, .musicxml)
(.mxl 圧縮形式)                              (.mxl 圧縮形式)
```

---

## データモデル (内部表現)

### 設計方針

1. **MusicXML互換**: 構造をMusicXMLと1対1対応させ、round-trip精度を最大化
2. **アクセサ関数**: Staff/Voice単位のアクセスは便利関数で提供
3. **Immutable-friendly**: 操作は新しいオブジェクトを返す
4. **型安全**: TypeScriptで厳密に型定義
5. **シリアライズ可能**: JSON.stringify/parseで永続化可能

### なぜMusicXML互換構造か

```
階層化アプローチの問題:
- Import時: backup/forward を解析して絶対位置に変換 → 複雑
- Export時: 絶対位置から backup/forward を再生成 → 複雑
- Round-trip: 元のvoice番号、backup位置が失われる → 互換性低下

MusicXML互換アプローチ:
- Import: ほぼそのまま読み込み → シンプル
- Export: ほぼそのまま出力 → シンプル
- Round-trip: 元の構造を保持 → 高精度
- 使いやすさ: アクセサ関数で補完
```

### 構造概要

```
Score
├── metadata: ScoreMetadata
├── partList: PartInfo[]           # パート定義 (楽器名等)
└── parts: Part[]
    └── measures: Measure[]
        ├── attributes?: MeasureAttributes
        ├── entries: MeasureEntry[]   # MusicXML順序を保持 (note, backup, forward, direction)
        └── barline?: Barline
```

### 型定義

```typescript
// ============================================================
// Score (ルート)
// ============================================================
interface Score {
  metadata: ScoreMetadata;
  partList: PartInfo[];
  parts: Part[];
}

interface ScoreMetadata {
  workTitle?: string;
  workNumber?: string;
  movementTitle?: string;
  movementNumber?: string;
  creator?: {
    composer?: string;
    lyricist?: string;
    arranger?: string;
  };
  rights?: string;
  encoding?: {
    software?: string;
    encodingDate?: string;
  };
}

interface PartInfo {
  id: string;                    // "P1", "P2", ...
  name: string;                  // "Piano", "Violin", ...
  abbreviation?: string;         // "Pno.", "Vln.", ...
  midiInstrument?: {
    channel: number;
    program: number;
    volume?: number;
    pan?: number;
  };
}

// ============================================================
// Part / Measure
// ============================================================
interface Part {
  id: string;                    // PartInfo.id と対応
  measures: Measure[];
}

interface Measure {
  number: number;                // 小節番号 (1始まり)
  attributes?: MeasureAttributes;
  entries: MeasureEntry[];       // MusicXML順序を保持
  barline?: Barline;
}

interface MeasureAttributes {
  divisions?: number;            // duration の基準単位
  time?: TimeSignature;
  key?: KeySignature;
  clef?: Clef[];                 // Staff ごとに異なる可能性
  staves?: number;               // 譜表数 (ピアノ=2)
  transpose?: Transpose;
}

interface TimeSignature {
  beats: number;                 // 分子 (4)
  beatType: number;              // 分母 (4)
  symbol?: 'common' | 'cut';
}

interface KeySignature {
  fifths: number;                // -7 (Cb) 〜 +7 (C#)
  mode?: 'major' | 'minor';
}

interface Clef {
  sign: 'G' | 'F' | 'C' | 'percussion' | 'TAB';
  line: number;
  staff?: number;
}

interface Transpose {
  diatonic: number;
  chromatic: number;
  octaveChange?: number;
}

interface Barline {
  location: 'left' | 'right' | 'middle';
  barStyle?: 'regular' | 'dotted' | 'dashed' | 'heavy' | 'light-light' | 'light-heavy' | 'heavy-light' | 'heavy-heavy' | 'none';
  repeat?: {
    direction: 'forward' | 'backward';
    times?: number;
  };
  ending?: {
    number: string;
    type: 'start' | 'stop' | 'discontinue';
  };
}

// ============================================================
// MeasureEntry (MusicXML順序を保持するフラット構造)
// ============================================================
type MeasureEntry = NoteEntry | BackupEntry | ForwardEntry | DirectionEntry;

interface NoteEntry {
  type: 'note';
  pitch?: Pitch;                 // undefined = 休符
  duration: number;
  voice: number;                 // MusicXMLのvoice番号をそのまま保持
  staff?: number;                // 1, 2, ... (省略時は1)
  chord?: boolean;               // true = 直前のnoteと同時発音

  // Note details
  noteType?: NoteType;           // 'whole', 'half', 'quarter', ...
  dots?: number;
  accidental?: Accidental;
  stem?: 'up' | 'down' | 'none';

  // Connections
  tie?: TieInfo;
  beam?: BeamInfo[];

  // Notations
  notations?: Notation[];
  lyrics?: Lyric[];

  // Grace note
  grace?: {
    slash?: boolean;             // アッチャカトゥーラ
    stealTimePrevious?: number;
    stealTimeFollowing?: number;
  };

  // Tuplet
  timeModification?: {
    actualNotes: number;         // 3連符なら3
    normalNotes: number;         // 3連符なら2
    normalType?: NoteType;
  };
}

interface BackupEntry {
  type: 'backup';
  duration: number;
}

interface ForwardEntry {
  type: 'forward';
  duration: number;
  voice?: number;
  staff?: number;
}

interface DirectionEntry {
  type: 'direction';
  directionTypes: DirectionType[];
  placement?: 'above' | 'below';
  staff?: number;
  voice?: number;
  sound?: {
    tempo?: number;
    dynamics?: number;
  };
}

// ============================================================
// Pitch / Note詳細
// ============================================================
interface Pitch {
  step: 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';
  octave: number;                // 4 = 中央C
  alter?: number;                // -2, -1, 0, 1, 2 (半音単位)
}

type NoteType =
  | 'maxima' | 'long' | 'breve'
  | 'whole' | 'half' | 'quarter'
  | 'eighth' | '16th' | '32nd' | '64th' | '128th' | '256th' | '512th' | '1024th';

type Accidental =
  | 'sharp' | 'natural' | 'flat'
  | 'double-sharp' | 'double-flat'
  | 'natural-sharp' | 'natural-flat'
  | 'quarter-flat' | 'quarter-sharp'
  | 'three-quarters-flat' | 'three-quarters-sharp';

interface TieInfo {
  type: 'start' | 'stop' | 'continue';
}

interface BeamInfo {
  number: number;                // 1, 2, ... (連桁レベル)
  type: 'begin' | 'continue' | 'end' | 'forward hook' | 'backward hook';
}

// ============================================================
// Notation (装飾、アーティキュレーション)
// ============================================================
interface Notation {
  type: NotationType;
  placement?: 'above' | 'below';
  // type別の追加プロパティ...
}

type NotationType =
  // Articulation
  | 'accent' | 'strong-accent' | 'staccato' | 'staccatissimo'
  | 'tenuto' | 'detached-legato' | 'marcato'
  // Ornaments
  | 'trill-mark' | 'mordent' | 'inverted-mordent' | 'turn' | 'inverted-turn'
  // Technical
  | 'up-bow' | 'down-bow' | 'pizzicato' | 'harmonic'
  // Other
  | 'fermata' | 'arpeggiate'
  // Slur/Tied (スパナー)
  | 'slur' | 'tied';

// ============================================================
// Direction (強弱、テンポ、etc)
// ============================================================
type DirectionType =
  | { kind: 'dynamics'; value: DynamicsValue }
  | { kind: 'wedge'; type: 'crescendo' | 'diminuendo' | 'stop'; spread?: number }
  | { kind: 'metronome'; beatUnit: NoteType; perMinute: number; beatUnitDot?: boolean }
  | { kind: 'words'; text: string; fontStyle?: string; fontWeight?: string }
  | { kind: 'rehearsal'; text: string }
  | { kind: 'segno' }
  | { kind: 'coda' }
  | { kind: 'pedal'; type: 'start' | 'stop' | 'change' | 'continue' }
  | { kind: 'octave-shift'; type: 'up' | 'down' | 'stop'; size?: number };

type DynamicsValue =
  | 'ppppp' | 'pppp' | 'ppp' | 'pp' | 'p'
  | 'mp' | 'mf'
  | 'f' | 'ff' | 'fff' | 'ffff' | 'fffff'
  | 'sf' | 'sfz' | 'sfp' | 'fp' | 'rf' | 'rfz' | 'fz';

// ============================================================
// Lyrics
// ============================================================
interface Lyric {
  number?: number;               // 歌詞行番号
  syllabic?: 'single' | 'begin' | 'middle' | 'end';
  text: string;
  extend?: boolean;
}
```

---

## アクセサ関数 (便利API)

MusicXML互換のフラット構造を、使いやすい形でアクセスするための関数群。

```typescript
import {
  getNotesForVoice,
  getNotesForStaff,
  groupByVoice,
  groupByStaff,
  getAbsolutePosition,
  withAbsolutePositions,
  getChords,
  iterateNotes,
} from 'musicxml-io/accessors';

// ============================================================
// Voice/Staff でフィルタリング
// ============================================================

// 特定の Voice の音符を取得
const voice1Notes: NoteEntry[] = getNotesForVoice(measure, { voice: 1 });

// 特定の Staff の音符を取得 (voice問わず)
const staff2Notes: NoteEntry[] = getNotesForStaff(measure, { staff: 2 });

// 特定の Staff + Voice の音符を取得
const notes: NoteEntry[] = getNotesForVoice(measure, { staff: 1, voice: 1 });

// ============================================================
// グルーピング
// ============================================================

interface VoiceGroup {
  staff: number;
  voice: number;
  notes: NoteEntry[];
}

// Staff/Voice でグループ化
const groups: VoiceGroup[] = groupByVoice(measure);
// → [
//   { staff: 1, voice: 1, notes: [...] },
//   { staff: 1, voice: 2, notes: [...] },
//   { staff: 2, voice: 3, notes: [...] },
// ]

// Staff でグループ化
const staffGroups = groupByStaff(measure);
// → [
//   { staff: 1, notes: [...] },
//   { staff: 2, notes: [...] },
// ]

// ============================================================
// 絶対位置の計算
// ============================================================

interface NoteWithPosition extends NoteEntry {
  absolutePosition: number;      // 小節先頭からの絶対位置 (divisions単位)
}

// 単一音符の絶対位置を計算
const position: number = getAbsolutePosition(note, measure);

// 全音符に絶対位置を付与
const notesWithPos: NoteWithPosition[] = withAbsolutePositions(measure);

// ============================================================
// 和音の取得
// ============================================================

interface Chord {
  position: number;
  duration: number;
  notes: NoteEntry[];            // 同時発音の音符群
}

// 和音としてグループ化
const chords: Chord[] = getChords(measure, { staff: 1, voice: 1 });

// ============================================================
// イテレータ
// ============================================================

// 全パート・全小節の音符をイテレート
for (const { part, measure, note, position } of iterateNotes(score)) {
  console.log(`Part ${part.id}, Measure ${measure.number}: ${note.pitch?.step}`);
}
```

---

## API設計

### パース / シリアライズ

```typescript
import { parse, serialize } from 'musicxml-io';

// Import
const score: Score = parse(xmlString);
const score: Score = await parseFile('score.musicxml');
const score: Score = await parseCompressed('score.mxl');  // 圧縮形式

// Export
const xml: string = serialize(score);
const xml: string = serialize(score, { version: '3.1' });  // バージョン指定
await serializeToFile(score, 'output.musicxml');
await serializeCompressed(score, 'output.mxl');
```

### 操作関数 (Pure Functions)

```typescript
import {
  transpose,
  addNote,
  deleteNote,
  changeKey,
  changeTime,
  insertMeasure,
  deleteMeasure,
} from 'musicxml-io/operations';

// 移調 (半音単位)
const transposed: Score = transpose(score, 2);  // 全音上げ

// 音符追加 (backup/forward は自動調整)
const updated: Score = addNote(score, {
  partIndex: 0,
  measureIndex: 0,
  staff: 1,
  voice: 1,
  position: 0,              // 絶対位置で指定
  note: {
    pitch: { step: 'C', octave: 4 },
    duration: 4,
    noteType: 'quarter',
  }
});

// 調号変更
const newKey: Score = changeKey(score, { fifths: 2, mode: 'major' }, {
  fromMeasure: 5  // 5小節目から
});

// 拍子変更
const newTime: Score = changeTime(score, { beats: 3, beatType: 4 }, {
  fromMeasure: 10
});

// 小節挿入
const inserted: Score = insertMeasure(score, {
  afterMeasure: 4,  // 4小節目の後に挿入
  copyAttributes: true  // 拍子・調号を引き継ぐ
});
```

### クエリ / ユーティリティ

```typescript
import {
  getMeasure,
  findNotes,
  getDuration,
  getMeasureCount,
  getDivisions,
} from 'musicxml-io/query';

// 小節取得
const measure: Measure = getMeasure(score, { part: 0, measure: 5 });

// 特定条件の音符検索
const highNotes: NoteEntry[] = findNotes(score, {
  pitchRange: { min: { step: 'C', octave: 5 }, max: { step: 'C', octave: 6 } }
});

// 楽曲全体の長さ (divisions単位)
const totalDuration: number = getDuration(score);

// 指定位置の divisions を取得 (attributesを遡って検索)
const divisions: number = getDivisions(score, { part: 0, measure: 10 });
```

---

## テスト戦略

### ディレクトリ構造

```
musicxml-io/
├── src/
├── tests/
│   ├── fixtures/              # テスト用MusicXMLファイル
│   │   ├── basic/
│   │   │   ├── single-note.xml
│   │   │   ├── scale.xml
│   │   │   └── chord.xml
│   │   ├── voices/
│   │   │   ├── two-voices.xml
│   │   │   └── piano-grand-staff.xml
│   │   ├── complex/
│   │   │   ├── bach-invention.xml
│   │   │   └── beethoven-sonata.xml
│   │   └── musescore-exports/   # MuseScore 4 からのエクスポート
│   │       └── ...
│   ├── parser.test.ts
│   ├── serializer.test.ts
│   ├── roundtrip.test.ts       # import → export → diff
│   ├── accessors.test.ts
│   └── operations.test.ts
└── ...
```

### Round-trip テスト

```typescript
describe('Round-trip', () => {
  const fixtures = glob.sync('tests/fixtures/**/*.xml');

  for (const file of fixtures) {
    it(`should preserve ${path.basename(file)}`, () => {
      const original = fs.readFileSync(file, 'utf-8');
      const score = parse(original);
      const exported = serialize(score);
      const reparsed = parse(exported);

      // 構造比較 (XMLの空白差異は無視)
      expect(reparsed).toMatchScore(score);

      // または、正規化して文字列比較
      expect(normalize(exported)).toEqual(normalize(original));
    });
  }
});
```

### 変化率メトリクス

```typescript
interface RoundtripMetrics {
  file: string;
  originalSize: number;
  exportedSize: number;
  elementsPreserved: number;    // 保持された要素数
  elementsLost: number;         // 失われた要素数
  elementsAdded: number;        // 追加された要素数
  preservationRate: number;     // elementsPreserved / total
}

function measureRoundtrip(xmlPath: string): RoundtripMetrics {
  const original = parse(fs.readFileSync(xmlPath, 'utf-8'));
  const exported = parse(serialize(original));

  // 要素単位で比較...
}

// CI で実行、preservation rate が閾値を下回ったら失敗
```

---

## 段階的実装計画

### Phase 1: 基本パース/シリアライズ

```
Week 1-2:
□ Score, Part, Measure の基本構造
□ 単純な Note, Rest のパース
□ attributes (divisions, time, key, clef)
□ 基本的なシリアライズ
□ Round-trip テスト (単音、スケール)
```

### Phase 2: Voice/Staff / backup/forward

```
Week 3-4:
□ backup, forward のパース/シリアライズ
□ voice, staff 属性の保持
□ chord (和音) 対応
□ アクセサ関数 (getNotesForVoice, groupByStaff, etc.)
□ グランドスタッフ (ピアノ) テスト
```

### Phase 3: Notation/Direction

```
Week 5-6:
□ Articulation (スタッカート、アクセント等)
□ Dynamics (強弱記号)
□ Slur, Tie
□ Beam (連桁)
□ Lyrics (歌詞)
□ Direction (テンポ、ペダル等)
```

### Phase 4: 操作API

```
Week 7-8:
□ transpose()
□ addNote(), deleteNote() (backup/forward自動調整)
□ insertMeasure(), deleteMeasure()
□ changeKey(), changeTime()
```

### Phase 5: 圧縮形式/互換性

```
Week 9-10:
□ .mxl 圧縮形式の読み書き
□ MusicXML 3.1 エクスポートオプション
□ 主要ソフトとの互換性テスト (MuseScore, Finale, Sibelius, Dorico)
```

---

## 懸念点と対策

### 1. backup/forward の自動生成 (操作API)

**問題**: addNote() などで音符を追加する際、backup/forward を適切に挿入する必要がある

**対策**:
```typescript
function addNote(score: Score, options: AddNoteOptions): Score {
  // 1. 挿入位置を特定
  // 2. 同じ voice の既存音符の位置を確認
  // 3. 必要に応じて backup/forward を挿入/調整
  // 4. 新しい Measure.entries を構築
}
```

### 2. Divisions の一貫性

**問題**: パートや小節によって divisions が異なる可能性

**対策**:
- 内部では元の divisions をそのまま保持
- アクセサ関数で正規化した position を計算可能に

```typescript
// 正規化した位置を取得 (共通divisionsベース)
const normalizedPos = getNormalizedPosition(note, measure, { baseDivisions: 480 });
```

### 3. 空白・コメントの保持

**問題**: XML の空白やコメントが失われる

**対策**:
- Round-trip テストでは正規化して比較
- 厳密な保持が必要な場合は別途オプション

---

## 参考実装

### 既存ライブラリの調査結果

| ライブラリ | 言語 | 参考になる点 |
|-----------|------|-------------|
| **music21** | Python | データモデル設計、操作API |
| **MuseScore** | C++ | MusicXML互換性の参照実装 |
| **@stringsync/musicxml** | TypeScript | パーサー実装 |
| **Verovio** | C++ | MEI/MusicXML変換 |

### MuseScoreのMusicXML実装を参照

MuseScoreは最も互換性が高いと評判なので、エッジケースの処理を参考にする:
- https://github.com/musescore/MuseScore/tree/master/src/importexport/musicxml

---

## ライセンス

MIT License (予定)

---

## 付録: MusicXML 4.0 主要要素

```
score-partwise
├── work
│   ├── work-number
│   └── work-title
├── identification
│   ├── creator (type: composer, lyricist, arranger)
│   ├── rights
│   └── encoding
├── part-list
│   └── score-part (id)
│       ├── part-name
│       ├── part-abbreviation
│       └── midi-instrument
└── part (id)
    └── measure (number)
        ├── attributes
        │   ├── divisions
        │   ├── key (fifths, mode)
        │   ├── time (beats, beat-type)
        │   ├── clef (sign, line)
        │   └── staves
        ├── note
        │   ├── pitch (step, alter, octave) | rest
        │   ├── duration
        │   ├── voice
        │   ├── type
        │   ├── dot
        │   ├── accidental
        │   ├── tie
        │   ├── staff
        │   ├── beam
        │   ├── notations
        │   │   ├── tied
        │   │   ├── slur
        │   │   ├── articulations
        │   │   ├── ornaments
        │   │   ├── dynamics
        │   │   └── fermata
        │   └── lyric
        ├── backup (duration)
        ├── forward (duration)
        ├── direction
        │   ├── direction-type
        │   │   ├── dynamics
        │   │   ├── wedge
        │   │   ├── metronome
        │   │   ├── words
        │   │   └── pedal
        │   └── sound (tempo, dynamics)
        └── barline
            ├── bar-style
            ├── repeat
            └── ending
```
