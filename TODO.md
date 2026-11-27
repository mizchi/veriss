# TODO

CSS × DOM の静的検査パターンを、**カテゴリごとに洗う**。実装したものは [docs/static-check-checklist.md](docs/static-check-checklist.md) に F 番号で移す。
モジュール分割の計画は [ADR-0016](docs/adr/0016-module-decomposition.md)(下の「構成の作業」)。

各パターンの完了条件:

- Chromium / Firefox / WebKit で挙動を実測する e2e(`e2e/layout-css-mistakes.spec.mjs`)。中身や条件を変えた複数の場合で測る(F97 の取り違えから)
- 単体テスト(`packages/veriss/test/css-mistakes.test.mjs`)
- 解析が Unknown を成功に変えないこと(判定できない値は Unknown のまま)
- lint の説明(新しいコードのとき `packages/adapter-core/src/lint.mjs`)とチェックリストの行

## 現在の予定(2026-11-20 時点、次に再開するとき用)

パターンの一覧(カテゴリ 1〜13)は F95 を除いて済み(89 / 90)。次は次の順で進める。

1. **パターンの追加を続ける**(新しい観点を足すときはカテゴリの表と一覧の両方に足す。[検査ルール一覧](docs/rule-catalog.md) の該当する役割の表にも行を足す)。まだ調べていない候補:
   - `:focus-visible` とキーボード / マウスでの見え方の差、`:has()` の重さと無効な引数
   - (済)`@container` の単位(`cqw` / `cqh`)を container のない要素で使う(F133)。`container-type: size` で高さが 0 になるのは既存の配置の検査(`E_LAYOUT_TRACKS`)で捕まる
   - `writing-mode: vertical-*` と物理プロパティ(`width` / `margin-top`)の取り違え
   - `inert` / `popover` と CSS の `display` の組み合わせ
   - `<picture>` / `srcset` と CSS の `width` / `object-fit`
   - 実ページから出た観点(重みは [handoff](docs/handoff.md) の「次にやること」、`tools/blocker-weights.mjs`): 中身で大きさの決まる flex item の
     中の img・フォーム部品、max-width の掛かる箱の種類、マイナスの inline margin(絶対配置・fixed の箱の px の margin は済み、I23。in-flow の箱は残り)、block の中の inline-level の箱(strut)、`text-box`、
     `border-collapse: collapse` の border、解析の作業量の上限
2. **構成の作業 M6**: `solve` の中の「効かない宣言」の判定(engine.mjs の reasons の塊)を `rules/` に移す。今回の F118・F124・F129 の「レイアウトが Unknown だと届かない」問題がこれで減る
3. **M7〜M9**: contrast を規則に、a11y を DOM と幾何に分ける、`packages/` に出す
4. **ADR-0017 の R2**(マージンの相殺の一般化)と **R3**(web-platform-tests の部分集合を回帰試験に)。R2 が Unknown を直接減らす
5. **保留の判断**: F95(`li` の display を変えてマーカーが消える)と F91(印刷)。どちらも利用者の判断待ち

作業の進め方の約束:

- ゲート `tools/gate.sh`(全パッケージの単体テスト、component-lint の eval が変わらないこと、css-mistakes の e2e を 3 ブラウザーで)を通してから commit し、main と claude ブランチへ push
  (claude ブランチからは PR を作って merge する。PR では CodeRabbit がレビューする)
- [検査ルール一覧](docs/rule-catalog.md) は main に push すると `.github/workflows/pages.yml` が https://mizchi.github.io/veriss/ に出す。
  実例の画像(NG / OK の組)は CI では作らないので、`tools/rule-catalog/examples.mjs` を変えたら `node tools/rule-catalog/shoot.mjs` で
  作り直して commit する(`node tools/rule-catalog/run.mjs all` で、NG に狙いのコードが出て OK が verified かを確かめる)
- ゲートの実行中はソースを変えない(テストが途中の変更を読む)。測るだけの使い捨てスクリプトは `tools/_m.mjs` に置いて消す
- スクロールバーを測るときは Chromium を `ignoreDefaultArgs: ['--hide-scrollbars']` で起動する(F130)
- 実測は Chromium・Firefox(157)・WebKit。結果が分かれるものは `browsers` を付けて報告し、レイアウトは Unknown のまま

## 進み具合(カテゴリごと)

「観点」はそのカテゴリで調べる切り口。済 = 実測して実装したか、効いていると確かめて外したもの。

| カテゴリ | 済 / 観点 | 状態 |
|---|---|---|
| 1. 宣言ごと捨てられる値(構文) | 11 / 11 | 済 |
| 2. at-rule(`@media` ほか) | 8 / 8 | 済 |
| 3. 親の表示形式で効かない宣言(block / inline / flex / grid / positioned) | 10 / 10 | 済 |
| 4. 表 | 9 / 9 | 済 |
| 5. テキストと折り返し | 9 / 9 | 済 |
| 6. リスト・マーカー・カウンター | 4 / 5 | ほぼ済(1 つ保留) |
| 7. transform・重なり・描画 | 6 / 6 | 済 |
| 8. フォーム部品・置換要素 | 8 / 8 | 済 |
| 9. セレクタ × DOM(状態・構造) | 8 / 8 | 済 |
| 10. ブラウザで結果が違うもの | 5 / 5 | 済 |
| 11. 単位と計算値の落とし穴(書いた値と計算値が違う) | 5 / 5 | 済 |
| 12. HTML 要素ごとの既定の振る舞いとリセット CSS | 4 / 4 | 済 |
| 13. 状態のセレクタとカスケードの順 | 2 / 2 | 済 |
| 合計 | 89 / 90(99%) | |

観点を足したら分母が増える。カテゴリの中で新しい観点が見つかったら、表と下の一覧の両方に足す。

### 1. 宣言ごと捨てられる値(構文)

- [x] calc の `+` / `-` の空白(F89)
- [x] `!important` の綴り(F86)
- [x] 単位のない長さ(F93)
- [x] `font-family` の名前・`font` ショートハンド(F99、F100)
- [x] grid のトラック(F101)
- [x] grid-template-areas(F52)
- [x] 未定義の custom property / `var()` の不正(既存 `W_CSS_VAR_INVALID`)
- [x] 色の関数(F107。健全性の修正も)
- [x] `transition` / `animation` の不正な値(F114)
- [x] `url()` の引用符のない空白、`background` ショートハンドの `/` の位置(F115)
- [x] プロパティが受け付けないキーワード(F109: `position: center`、`display: flexbox` など)

### 2. at-rule

- [x] `@media` の `var()`、単位のない長さ、`and(`(F78、F79、F87)
- [x] `@import` の位置(既存 `W_CSS_IMPORT_IGNORED`)
- [x] `@keyframes` の `!important`、存在しない名前(既存)
- [x] `@container` の当たらない query(既存)
- [x] `@supports` の不正な条件(F110: `and(` / `or(` / `not(`。括弧のない条件などはもともと Unknown)
- [x] `@layer` の順序と、層の外の規則(F112: 詳細度で勝つのに層で負ける宣言)
- [x] `@font-face` の不正な宣言(F113)
- [x] `@property` の不正な `syntax` / `initial-value`(F111。健全性の修正も)

### 3. 親の表示形式で効かない宣言

- [x] flex / grid の子の項目プロパティを block の子に(既存)
- [x] block コンテナの `gap`(F92)
- [x] inline の箱の幅・高さ・縦の margin・transform(既存、F36)
- [x] inline 系の箱の `margin: auto`(F103)
- [x] `display: contents` の箱のプロパティ(F30 ほか)
- [x] position: static の inset、z-index(既存)
- [x] absolute の `float`、`margin: auto`(F77、F38)
- [x] `columns` を flex / grid に、段組の外の `column-span`(F34、F81)
- [x] `aspect-ratio` を表と inline に(F98)
- [x] absolute / fixed の子の flex 項目プロパティ(`order`、`flex-grow`)(F118)。flex の中の absolute の子の配置そのものは Unknown のまま(flex の経路で containing block の大きさが最後に決まるため。insets が両軸で決まる子から対応する余地あり)

### 4. 表

- [x] `overflow`、`padding`(collapse)、`gap`、`border-spacing`(F31、F60、F25)
- [x] セルの min/max-height、固定表の min/max-width(F43)
- [x] collapse の `border-radius`、行・行グループの `border-radius`(F59、F94)
- [x] collapse の `empty-cells`(F82)
- [x] 固定表の 1 行目以外の `width`(F96)
- [x] `table > tr`(tbody の挿入、F26)
- [x] 行・行グループの padding・margin・border・overflow(既存)
- [x] セルの `max-width`(自動表では効くと確かめて見送り)
- [x] `<col>` / `<colgroup>` に効かないプロパティ(F108)

### 5. テキストと折り返し

- [x] nowrap / pre の `overflow-wrap`(F80)
- [x] タブを潰す `white-space` の `tab-size`(F84)
- [x] 1 行のままの `word-break` / `line-break` / `hyphens` / `text-wrap-style`(F106)
- [x] inline の `text-align` / `text-indent`(F45)
- [x] `text-overflow` の条件(既存)
- [x] `text-decoration: none` で祖先の線は消えない(F58)
- [x] `letter-spacing` / `word-spacing` の不正: 3 ブラウザで `%` は有効、単位のない数は F93 で報告済み、と確かめた
- [x] `letter-spacing` / `word-spacing` の `auto`(F109 で報告)
- [x] `text-wrap: balance` が `white-space: nowrap` を打ち消す(折り返しが戻る)ことの知らせ(F119。`text-wrap: pretty` は Firefox で捨てられる)

### 6. リスト・マーカー・カウンター

- [x] list-item でない要素の `list-style-type` / `-position` / `-image`(既存、F88、F104)
- [x] 読まれないカウンター(F102)
- [x] `::marker` に効かないプロパティ(既存)
- [x] summary のマーカー(既存 `W_A11Y_SUMMARY_INDICATOR`)
- [ ] `li` の display を変えてマーカーが消える(F95、保留)

### 7. transform・重なり・描画

- [x] transform のない `transform-origin`(F83)
- [x] 祖先の後ろに回る負の z-index(F72)
- [x] `perspective`(重なり順が変わると確かめて見送り)
- [x] `transform-style: preserve-3d` が grouping property で平らになる・inline で効かない、fixed の子を閉じ込める(F117)。`backface-visibility` は受け付けるだけ(3D の transform は Unknown のまま)
- [x] `isolation` / `mix-blend-mode` の組み合わせ(F123。混ぜる要素自身の `isolation: isolate` は効かない。同じ規則の中だけ判定)
- [x] `will-change` の不正な値(`auto` や `all` を含むリスト、カンマなし)(F116)。知らない名前は有効で、効かないだけ(判定しない)

### 8. フォーム部品・置換要素

- [x] appearance auto の checkbox / select の背景・枠・行の高さ(F42、F75)
- [x] `input type=hidden`、`datalist`、置換要素の擬似要素(F68、F69、F32)
- [x] `object-fit` / `object-position`(既存、F39)
- [x] canvas の引き伸ばし(F71)
- [x] `select` / `input` の `padding`・`text-align` のブラウザ差(`padding`・`text-align`・`text-align-last` は揃った。差が出たのは select の `text-indent`: Firefox だけ 2 倍、F124)
- [x] `<option>` のスタイル(F121。ドロップダウンでは大きさ・余白が select に効かない。開いたメニューの描画は測っていない)
- [x] `<br>` の `margin`(Firefox だけ効く)(F120。`line-height` は WebKit だけ、ほかはどこでも効かない)
- [x] `<img>` / `<video>` の `width` / `height` 属性と CSS の優先(実測: CSS の width だけ、または max-width: 100% だけだと高さは属性のまま残り比率が崩れる。`height: auto` で保たれる。既存の `W_LAYOUT_IMAGE_DISTORTED` が属性の比率と描く大きさの差として報告する)

### 9. セレクタ × DOM

- [x] 状態の擬似クラス(`:placeholder-shown`、`:required`、`:read-write`、`:link`、`:focus-within` など、F35〜F63)
- [x] 構造の擬似クラス(`:empty`、`:last-child`、`:nth-child(of S)`、F29、F33、F70)
- [x] 当たらないセレクタ、親子関係の破綻(既存)
- [x] DOM のプロパティを属性で書いた、効かない属性(F64〜F67)
- [x] `hidden` 属性の上書き(既存 `W_A11Y_HIDDEN_OVERRIDDEN`)
- [x] `:visited` で効かないプロパティ(既存)
- [x] 重複した `id`(既存 `E_A11Y_DUPLICATE_ID` で検出済みと確かめた)
- [x] `:has()` の中の状態(解析は Unknown で健全。当たらない `:has()` は既存の `W_CSS_SELECTOR_UNMATCHED`)

### 10. ブラウザで結果が違うもの

- [x] block レイアウトの `justify-self` / `justify-items`(F105)
- [x] `<br>` の `margin`(カテゴリ 8 と同じ、F120)
- [x] `::-webkit-scrollbar` と `scrollbar-width` / `scrollbar-color`(F130。測り方: Chromium は `--hide-scrollbars` を外して従来型のスクロールバーにし、`offsetWidth - clientWidth` で幅を読む。WebKit は `::-webkit-scrollbar` の幅がそのまま測れる。Firefox は重ねて描くスクロールバーを止められないので `CSS.supports` で受け付けるかを読む)
- [x] `-webkit-` だけの書き方(`-webkit-line-clamp` 以外): 大きさのキーワード(F122)。`-webkit-box-reflect` などの描画だけのものは測れていない
- [x] フォーム部品の既定の大きさ(UA プロファイル `ua-profile.mjs` が Chromium・Firefox・WebKit ごとに持ち、cross-browser lint が差を報告する)

### 11. 単位と計算値の落とし穴

- [x] メディアクエリの `em` / `rem` がルートの `font-size` を見ない(F125)
- [x] `overflow-x: hidden` の横の `overflow-y: visible` が `auto` になる(F126)
- [x] html / body だけの `box-sizing` は継承されない(F127)
- [x] 縦の `margin` の % は幅に対する割合(F128)
- [x] container のない軸の `cqw` / `cqh` は small viewport の単位になる(F133)

### 12. HTML 要素ごとの既定の振る舞いとリセット CSS

- [x] リセット CSS で中央に来なくなる `<dialog>`(F129)
- [x] `<fieldset>` の既定の `min-inline-size: min-content`(実測: 3 ブラウザーとも中身の幅まで広がる。解析は UA の値をリセットされるまで特別に扱い、判定はしない)
- [x] `<sup>` / `<sub>` で行が高くなる(実測: 3 ブラウザーとも。解析は baseline 以外の vertical-align を Unknown にする)
- [x] `<details>` の `display: flex`、`<hr>` の `color`(実測: 3 ブラウザーとも効く。報告することはない)

### 13. 状態のセレクタとカスケードの順

- [x] 後の規則に負けて見えない `:hover` / `:focus` / `:active`(F131。LVHA の順)
- [x] セレクタリストの中の `-moz-` / `-ms-` の擬似で規則全体が捨てられる(F132)
- [x] vlmkit `check animation` の CSS の規則の静的な版: 同じ名前の `@keyframes`(F135)、`@property` のないカスタムプロパティの transition(F136)、綴り違いの transition のプロパティ(F137)、単位のない数の変数の時間(F138)、綴り違いの media feature(F139)
- 確かめて既存で足りていたもの: flex / grid コンテナの `text-overflow`(効かない宣言として報告済み)、中身のある `aspect-ratio`(理由付きの Unknown)

## 座標計算サブセット L1 の参照仕様([ADR-0018](docs/adr/0018-coordinate-subset.md)、`models/layout/`)

engine から独立した Z3 の仕様で、engine(範囲全体で UNSAT)と 3 ブラウザー(ランダムな設定)に照合する。第一段は済み。

- [x] 第一段: Grid(px・`minmax(0, fr)` のトラック、gap、線での配置、self の揃え)と Flex row・nowrap(basis・grow・shrink・min、
  justify-content、align)。中身のない項目、padding・border・margin なし
- [ ] はみ出す center・end の揃え(既定の overflow alignment)を 3 ブラウザーで測り、L1 に入れるか決める(今は位置を比べない)
- [ ] 第二段: padding・border・margin、`%` と `calc()`、文字を含む項目(ADR-0010 の幅の区間)
- [ ] `flex-wrap: wrap`(行の分け方が W の区間で変わる)、column、`max-width`(伸びるときの凍結)
- [ ] Grid の auto-placement、名前つきの線と領域、暗黙のトラック、`auto` の行、subgrid
- [ ] 性質(はみ出さない、重ならない、W に対して単調)を仕様の上で Z3 に確かめさせる。Lean で定理にするかは未決
- [ ] engine を仕様から作り直すか(今は照合だけ)

## 壊れた状態変化の CLS と、クリティカル CSS

- [x] 壊れた状態変化(12)と正しい版(6)を `models/layout/shift-cases.mjs` に。2 つの状態を同じ幅で Z3 に解かせ、動く幅を探す
  (`models/layout/shift.mjs`)。3 ブラウザーで反例の幅の動きと Chromium の layout-shift を確かめ、engine の `E_LAYOUT_HOVER_SHIFT` とも一致
- [x] クリティカル CSS の抽出(`packages/veriss/src/critical.mjs`、[docs/critical-css.md](docs/critical-css.md))。3 ブラウザーでファーストビューが同じ
- [x] Lean: L1 の定義(Flex は §9.7 の凍結の手順)と性質の証明(`models/lean/`)、oracle にした Z3 の仕様・engine との差分テスト
- [ ] Lean: 凍結の手順と「共通の水位」の式が同じ結果になることを証明する(今は差分テストで確かめている)
- [ ] Lean の oracle を CI で回す(elan を入れる手順を workflow に)
- [x] クリティカル CSS の文字: フォントで測った大きさで配置し、自由な文字列は空(いくらでも伸びうる)として配置する
- [ ] クリティカル CSS: 文字と要素が混ざった段落、`%` の長さで Unknown にならないように
- [x] 文字幅の型(ADR-0019、`models/text/`): OS × ブラウザーのフォントの組み合わせの区間。L1 の Flex の項目の自動の最小幅に入れ、
  Z3 が幅とフォントを同時に探す。Linux の 3 ブラウザーの E2E の記録、MoonBit、parley の三つを照合
- [ ] Windows・macOS の記録: workflow `text-widths` を手動で回し(main に入ってから)、job の summary を確かめ、artifact の `<platform>-widths.json` を commit する。
  記録のないうちは互換フォントで近似(安全な側に広げる)、Segoe UI・SF Pro・Consolas・Menlo は Unknown
- [ ] iOS・Android の記録(GitHub の runner にない。実機か、その OS のブラウザーで `tools/text-widths.mjs` を回す)
- [ ] 文字幅の型を engine とクリティカル CSS に入れる(今は L1 の仕様だけ)。`flex-basis: auto`(max-content)と折り返す文字
- [ ] engine の誤りを入れた版(mutant)を作り、L1 の仕様との照合で捕まることを示す

## 構成の作業([ADR-0016](docs/adr/0016-module-decomposition.md))

- [x] M1. `color/` を切り出す(色の解析・重ね合わせ・輝度・比・`backdrop`)
- [x] M2. import の向きを調べる境界テスト
- [x] M3. 構文の検査の結果を `notes[]` にまとめる(28 の配列)
- [x] M4. 捨てた宣言を `dropped[]` にまとめる(11 の `$…Inert`)
- [x] M5. `rules/css-mistakes` を engine から出す(`cssMistakes` と周りの検査 560 行を `createCssMistakes({ report, facts, tools })` に。後追いの `walkStyles` は style の段が単独で事実を出せるようになる M6 以降に回す)
- [ ] M6. `solve` の中の「効かない宣言」の判定を規則に移す
- [ ] M7. `rules/contrast`(レイアウトなしでも判定する)
- [ ] M8. a11y を DOM の規則と幾何の規則に分ける
- [ ] M9. `packages/` に出す

## 先行研究から採る作業([ADR-0017](docs/adr/0017-prior-art-css-formalization.md))

- [ ] R1. 規則の主張を visual logic の形(`∀b ∈ $(sel). 線形の主張`)の内部表現と評価器に分ける(重なり・画面外を書き直し、eval 不変)
- [ ] R2. マージンの相殺を正負の最大(VizAssert の 6 実数 + bool)で一般化し、container・空の箱を通る相殺を判定へ
- [ ] R3. web-platform-tests の部分集合(css2.1 §8.3、§10.8)をモデル全体の回帰試験にする(一致・Unknown・不一致、不一致ゼロ)
- [ ] R4. component 契約を Troika の independently-true で定義し、⋀Pc ⇒ Q を Z3 で確かめる
- [ ] R5. style 段の出力を「guard と値の組の列」(記号的 computed style)として型にする(M6 と合わせる)
- [ ] R6. 既定の font size を第三の変数にする(3 次元の cell の表現を先に決める)

## 保留

判断を保留しているもの。実装しない(候補から外した)わけではなく、決めることが決まったら候補に戻す。

- **F91. 段組の外の `break-before` / `break-after` / `break-inside`**: 画面では効かないが印刷では効く。
  - 保留の理由: 解析は画面(screen)だけを対象にしていて、印刷(`@media print` と改ページ)を対象にするかが決まっていない。対象外のまま「効かない」と警告すると、印刷用に書いた宣言を誤検知する。
  - 再開の条件: 印刷を扱うか決める。扱わないなら「画面では効かない」という警告にする。扱うならページ分割のモデルが要る。
- **F95. `display` を変えた `li` のマーカー**(`li{display:flex}` で箇条書きの点が消える):
  - 保留の理由: `list-style-type` が none でないままならマーカーが消えるが、ナビゲーションのように意図して消すことが多く、誤検知になりやすい。
  - 再開の条件: 警告する条件を決める(例: `list-style` をどこにも書いていない場合だけ、など)。

## 見送り

- **表のセルの `max-width`**(F97 として候補にしていた): 自動レイアウトの表では効く。折り返すテキストや幅のある箱が中にあるとき、列の幅の上限になる(3 ブラウザで実測)。最初の実測が 1 文字のセルで、差が出なかったので誤って候補にした。固定レイアウトの表では効かず、こちらは F43 で扱っている
- **変形された子のない要素の `perspective`**: none 以外はスタッキングコンテキストを作るので、子がなくても重なった兄弟との描画順が変わる(3 ブラウザで実測)。効かない宣言ではない
- **flex / grid コンテナの `text-indent`**: 継承されて item の行で効く(3 ブラウザで実測: item が字下げされる)ので誤検知になる

## 実装済み(最近)

- L1 の Lean による定義と証明、oracle による差分テスト。ランダムな設定の乱数の不具合(Flex がすべて 1 項目、Grid がすべて 1 列)を直した
- クリティカル CSS の抽出(`veriss/critical`)
- 壊れた状態変化の CLS を L1 の仕様の上で Z3 が検出(SAT の反例)、正しい版は UNSAT
- 座標計算サブセット L1 の参照仕様(ADR-0018、`models/layout/`): engine と幅の範囲全体で一致、3 ブラウザーとランダムな設定で一致
- eval の基準を Chromium 156 で記録し直した。結果に `browser`(記録したブラウザーの版)を書き、gate は eval が変わったときに記録と今回の版を並べて出す
- F133. container のない軸の container query の単位(`cqw` / `cqh` が `svw` / `svh` になる)
- F126 の健全性の修正: `clip` の横のスクロール値で `clip` を `hidden` にするのは Firefox と WebKit だけ(Chromium 156 は `clip` のまま)。`browsers` を付けて報告し、解析は Unknown
- F26 の 3 ブラウザー照合(Firefox・WebKit でも通った)
- F26 の見逃しの修正: 補われた tbody をセレクタの途中で飛ばす子の結合子(`.t > .r > td`、`table > tr .x`)も報告する(PR #2)
- [検査ルール一覧](docs/rule-catalog.md): 約 420 のコードを 13 の役割に分け、検査できるもの・Unknown のものを表にし、役割ごとに
  NG / OK の実例の画像を付けた。GitHub Pages(https://mizchi.github.io/veriss/)に出し、README からリンク(PR #1)
- F79. media query の単位なし長さ・単位前の空白
- F80. `white-space: nowrap` / `pre` の下の `overflow-wrap`
- F81. 段組の外の `column-span`
- F82. `border-collapse: collapse` の表の `empty-cells: hide`
- F83. transform のない `transform-origin`
- F86. `!important` の綴り間違い
- F87. media query の `and(`
- F88. list-item でない要素の `list-style-position`
- F89. calc の `+` / `-` の両側の空白(健全性の修正)
- F92. block コンテナの `gap`(子のない block と inline-block)
- F93. 単位のない長さ
- F84. 空白を詰める `white-space` の下の `tab-size`
- F94. 表の行・行グループの `border-radius`
- F96. 固定レイアウトの表で 1 行目以外のセルの `width`
- F98. 表のセル・行と inline 要素の `aspect-ratio`
- F99. 引用符のない `font-family` の不正な名前(健全性の修正)
- F100. size か family のない `font` ショートハンド
- F104. list-item でない要素の `list-style-image`
- F101. grid の不正なトラック
- F102. どこからも読まれない CSS カウンター
- F103. inline 系の箱の左右の `margin: auto`
- F105. block レイアウトの `justify-self` / `justify-items`(ブラウザで違う)
- F132. セレクタリストの中の `-moz-` / `-ms-` の擬似
- F131. 後の規則に負けて見えない `:hover` / `:focus` / `:active`
- F130. `::-webkit-scrollbar` と標準の `scrollbar-width` / `scrollbar-color`
- F129. リセット CSS で中央に来なくなる `<dialog>`
- F128. 縦の `margin` の % は幅に対する割合
- F127. html / body だけの `box-sizing` は継承されない
- F126. 片方の軸だけの `overflow: hidden`(もう片方の visible が auto になる)
- F125. メディアクエリの `em` / `rem` はルートの `font-size` を見ない
- F124. `select` の `text-indent`(Firefox だけ 2 倍)
- F123. `mix-blend-mode` と同じ要素の `isolation: isolate`
- F122. 一部のブラウザーしか受け付けない大きさのキーワード
- F121. ドロップダウンの `<option>` の大きさ・余白
- F120. `<br>` に書いたスタイル
- F119. `white-space: nowrap` の後の `text-wrap: balance`
- F118. absolute / fixed の箱の flex 項目プロパティ
- F117. `transform-style: preserve-3d` の平坦化と fixed の閉じ込め
- F116. 不正な `will-change`
- F115. 不正な `background` ショートハンド
- F114. 不正な `transition` / `animation`
- F113. 不正な `@font-face`
- F112. 層の順番だけで負ける宣言
- F111. 不正な `@property`(健全性の修正)
- F110. `@supports` の `and(` / `or(` / `not(`(健全性の修正)
- F109. プロパティが受け付けないキーワード
- F108. 表の列に効かないプロパティ
- F107. 不正な色(健全性の修正)
- F106. 1 行のままの `white-space` の下の `word-break` / `line-break` / `hyphens` / `text-wrap-style`
