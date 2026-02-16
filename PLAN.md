# ABC Format Import/Export Plan

## 現状のまとめ

### Phase 1: ABC → Score → ABC ラウンドトリップ ✅ 完了

30/30 の ABC round-trip テスト + 128 ABC テスト全てパス。
ABC テキストを Score モデルにパースし、Score モデルから ABC テキストを再構築する。

音楽的内容（音符・ピッチ・デュレーション・調号・拍子・歌詞・和音記号・強弱・タイ・スラー・連符・装飾音・リピート等）は全て Score モデルの標準フィールドに正しくパースされている。

### 現在の実装の仕組み

ABC テキスト情報の保存先は2系統ある:

**1. `score.metadata.miscellaneous` (MusicXML round-trip で保持される)**
- `abc-header-order` — ヘッダー行の元の順番と文字列
- `abc-reference-number` — X: フィールドの値
- `abc-unit-note-length` — L: フィールドの値
- `abc-tempo` — Q: フィールドの元の文字列
- `abc-extra-fields` — R:, S:, N:, I: 等の非標準ヘッダー
- `abc-directives` — %% ディレクティブ
- `abc-voice-ids` — Voice ID の元の名前
- `abc-inline-voice-markers` — `[V:V1]` 等のインライン形式
- `abc-voice-declaration-lines` — スタンドアロン V: 宣言行
- `abc-line-breaks` — 改行位置（小節番号）
- `abc-lyrics-after-all` — 歌詞が全音楽の後にまとめて書かれているか
- `abc-lyrics-line-counts` — 各 w: 行のシラブル数

**2. `(entry as any).abcXxx` ランタイムプロパティ (MusicXML round-trip で失われる)**
- `abcSpaceBefore` — 音符/和音記号の前のスペース
- `abcTupletStart` — 連符グループの開始位置
- `abcExplicitNatural` — 明示的ナチュラル `=`
- `abcIndividualChordDuration` — コード内個別デュレーション
- `abcInlineField` — インライン `[L:1/32]` 等のフィールド変更
- `abcKeyChange` (measure) — インライン K: キー変更
- `abcSpaceBeforeBar` (measure) — 小節線前のスペース
- `abcSpaceBefore` (barline) — 小節線前のスペース
- `abcBarlineText` (barline) — 特殊小節線の元テキスト

---

## Phase 2: ABC → MusicXML → ABC ラウンドトリップ ✅ 完了

### ゴール

ABC フォーマットの音楽的内容を Score モデルに正しく落とし込み、MusicXML を経由しても ABC に再変換できることを検証する。

```
ABC text → parseAbc() → Score → serializeMusicXml() → MusicXML
→ parseMusicXml() → Score → serializeAbc() → ABC text
```

元の ABC と最終 ABC で**音楽的内容が一致**すること（書式的な差異は許容）。

### 分析: MusicXML 経由時に失われる情報

#### カテゴリ A: 書式ヒントのみ（失われて問題なし）

| プロパティ | 内容 | 理由 |
|-----------|------|------|
| `abcSpaceBefore` | 音符前のスペース | 純粋に見た目の問題 |
| `abcSpaceBeforeBar` | 小節線前のスペース | 同上 |
| `abcBarlineText` | `\|>\|` 等の元テキスト | `barStyle` に音楽的意味は保存済み |
| `abc-line-breaks` | 改行位置 | レイアウトの問題 |
| `abc-header-order` | ヘッダー順 | フォーマットの問題 |
| `abc-lyrics-after-all` | 歌詞配置方法 | レイアウトの問題 |
| `abc-lyrics-line-counts` | 歌詞行の分割 | 同上 |
| `abc-inline-voice-markers` | `[V:]` vs `V:` 形式 | 表記スタイルの問題 |
| `abc-voice-declaration-lines` | V: 宣言行 | 同上 |

#### カテゴリ B: 音楽内容は標準フィールドにもあるが、シリアライザが `as any` に依存

**これらが Phase 2 の修正対象。** 音楽的な情報自体は Score の標準フィールドに存在するが、現在の ABC シリアライザが `as any` プロパティの存在を前提としており、それがないと正しく ABC を出力できない。

---

### 修正項目 (全て完了)

#### B-1. 連符 (tuplet) の開始検出 — `abcTupletStart` 依存の除去 ✅

**現状**: `(note as any).abcTupletStart` フラグで連符の開始位置を判定。
**問題**: MusicXML 経由ではこのフラグが失われ、`(3CDE` が `C2/3D2/3E2/3` になる。
**音楽データ**: `note.timeModification` に `actualNotes`/`normalNotes` は正しく保存されている。

**修正方針**:
- シリアライザで `timeModification` を持つ連続ノートを走査
- 前のノートが `timeModification` を持たない（または異なるグループ）場合に連符開始と判定
- `abcTupletStart` フラグはフォールバック確認用に残してもよい

**難易度**: 低 — 連続するノートの `timeModification` を比較するだけ

#### B-2. インライン単位音符長変更 — `abcInlineField` 依存の除去 ✅

**実装**: `[L:1/32]` を `DirectionEntry` の `directionTypes: [{ kind: 'words', text: '[L:1/32]' }]` として保存。
MusicXML round-trip で `<direction><direction-type><words>[L:1/32]</words>` として保持される。
シリアライザは `abcInlineField` プロパティの他に、`words` direction type のテキストから `[L:...]` パターンを検出して処理。

#### B-3. インラインキー変更 — `abcKeyChange` 依存の除去 ✅

**実装**: シリアライザで前の小節と現在の小節の `attributes.key` を比較。
変更がある場合に `K:` + `serializeKey()` で自動出力。`abcKeyChange` はフォールバックとして残存。

#### B-4. 明示的ナチュラル記号 — `abcExplicitNatural` 依存の除去 ✅

**実装**: ABC パーサーで明示的ナチュラルに `accidental: { value: 'natural' }` を設定。
MusicXML round-trip で `<accidental>natural</accidental>` として保持。
シリアライザは `abcExplicitNatural` の他に `note.accidental?.value === 'natural'` でも判定。

#### B-5. コード内個別デュレーション — `abcIndividualChordDuration` 依存の除去 ✅

**実装**: `detectChordIndividualDurations()` ヘルパーでコード内ノートの `duration` を比較。
全て同じなら `[CEG]2`、異なれば `[C/E/G/]` 形式で出力。`abcIndividualChordDuration` はフォールバック。

#### B-6. `[L:]` direction エントリの MusicXML 保持 ✅

**実装**: B-2 と統合。`<words>[L:1/32]</words>` として MusicXML round-trip で保持される。

---

### テスト計画

#### 新規テストの追加

```typescript
describe('ABC → MusicXML → ABC round-trip', () => {
  for (const file of abcFixtures) {
    it(`should preserve musical content: ${file}`, () => {
      const abc = readFixture(file);
      const score1 = parseAbc(abc);
      const xml = serializeMusicXml(score1);
      const score2 = parseMusicXml(xml);
      const abc2 = serializeAbc(score2);

      // 比較: 音楽的内容の一致（書式は許容）
      const score3 = parseAbc(abc2);
      // 音符数、ピッチ、デュレーション、調号、拍子が一致
      expectMusicallyEqual(score1, score3);
    });
  }
});
```

#### 比較の粒度

完全一致（文字列比較）ではなく、音楽的等価性を検証:
- 各パートの音符数が一致
- 各音符のピッチ（step, octave, alter）が一致
- 各音符のデュレーションが一致
- 調号・拍子記号が一致
- 歌詞テキストが一致
- リピート・エンディングが一致

書式的な差異は許容:
- スペースの有無
- 改行位置
- ヘッダー順序
- `[V:V1]` vs `V:V1` の記法差異
- `[L:]` の位置（音楽的に等価なら OK）

---

### 実装順序 (全て完了)

| 順序 | 修正項目 | 状態 |
|------|----------|------|
| 1 | B-1: 連符開始検出 | ✅ |
| 2 | B-2/B-6: インライン L: 変更 + MusicXML保持 | ✅ |
| 3 | B-3: インラインキー変更 | ✅ |
| 4 | B-4: 明示的ナチュラル | ✅ |
| 5 | B-5: コード内個別デュレーション | ✅ |
| 6 | テスト追加 (音楽的等価性 + ABC文字列比較) | ✅ |

### テスト結果

- 30個の ABC fixture 全てで音楽的等価性テストをパス
- 28/30 で ABC 文字列比較もパス（スペース除去後）
- 残り2個は音楽的に等価だが書式差異あり（非標準バーライン `|>|`、コード記法の等価形式）

---

## Phase 1 修正履歴 (完了)

<details>
<summary>展開: 全16項目の修正詳細</summary>

### 1. L: 単位音符長の保存・復元 ✅
### 2. ヘッダーフィールド保存 ✅
### 3. ノート間スペース保存 ✅
### 4. Voice ID 保存 ✅
### 5. Q: テンポ形式保存 ✅
### 6. タプレット記法 ✅
### 7. 不可視レスト x ✅
### 8. グレースノートグループ化 ✅
### 9. Volta 記号 ✅
### 10. 歌詞インターリーブ ✅
### 11. 行継続バックスラッシュ ✅
### 12. インライン [V:] マーカー ✅
### 13. 特殊バーライン |>| ✅
### 14. インライン K: キー変更 ✅
### 15. バーライン前後スペース ✅
### 16. = ナチュラル記号の保存 ✅

</details>
