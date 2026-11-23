# ADR-0018: 座標計算サブセットの再定義と、Z3 による独立した仕様

状態: 提案(第一段を実装)

## 背景

veriss の engine(`packages/veriss/src/layout/`)は、Grid と Flex の配置を viewport 幅のアフィン式として解き、Z3 で違反を探す。
どの CSS なら座標が確定するか(サブセット)は、engine のコードと [layout-checking.md](../layout-checking.md)・[ADR-0011](0011-flex-and-contents-subsets.md)
の文章に散らばっていて、engine から独立した定義がない。engine の誤りは、ブラウザーとの差分照合(e2e)でしか見つからない。

isle の `models/css_layout/contract.smt2` と `models/layout_contract/contract.smt2` は、engine から独立した Z3 の参照仕様だった。
ただし「4 つの箱」の例に固定した数行の式で、Grid・Flex の一般の座標計算ではない。考え方(生成した式と独立した仕様の XOR が UNSAT
なら一致、壊した仕様では SAT になって比較が空振りでないこと)は引き継ぐ。

## 判断

座標計算サブセット(以下 L1)を、**値の文法**と**座標の式**の二つで定義し直す。式は `models/layout/spec.mjs` が設定(JSON)から
SMT-LIB2(QF_LRA)として書き出す。engine のコードは使わない。L1 に入る CSS では、コンテナの内容幅 `W` を変数として、すべての箱の
border box の位置と大きさが `W` の区分線形な式で一意に決まる。L1 の外は Unknown(engine と同じ)。

仕様は三つの照合に使う。

1. 仕様 × 手計算(単体テスト): 式が意図どおりか
2. 仕様 × engine(範囲全体): engine が出す領域ごとのアフィン式と、仕様の式の差を Z3 に探させ、UNSAT なら幅の範囲全体で一致
3. 仕様 × Chromium・Firefox・WebKit(e2e): ランダムな設定と幅で実測と比べる。仕様が CSS の読み方として正しいか

### L1 の共通の前提

- `box-sizing` はどちらでもよいが、L1 の箱は padding・border・margin が 0(第一段)。座標は border box、コンテナの内容 box の左上が原点
- `writing-mode: horizontal-tb`、`direction: ltr`
- 項目は中身のない要素(文字を含む項目は ADR-0010 の文字の寸法を足す第二段)。中身がないので、自動の最小の大きさは 0
- 長さは px の有限小数。`%`・`em`・`calc()`・`min()`・`max()`・`clamp()`・キーワードの大きさ(`min-content` など)は第二段以降
- ブラウザーは長さを 1/64px に丸めるので、ブラウザーとの比較は 0.05px までの差を一致とみなす(式は有理数で厳密)

### Grid(第一段)

| 性質 | L1 で受け付ける値 |
|---|---|
| `grid-template-columns` | `<px>` と `minmax(0, <n>fr)` の並び(`repeat(<整数>, …)` は展開して同じ) |
| `grid-template-rows` | `<px>` の並び |
| `column-gap` / `row-gap` | `<px>` |
| `grid-column` / `grid-row` | 正の線の番号 `a / b`(a < b、明示したトラックの中) |
| 項目の `width` / `height` | `auto` か `<px>` |
| `justify-self` / `align-self` | `stretch`(既定)・`start`・`center`・`end` |

式(列。行も同じで、fr がないだけ):

- `F = W − Σ(px の列) − (列数 − 1) × column-gap`、`F⁺ = max(F, 0)`
- fr の和 `Σfr ≥ 1` なら `fr の列 = F⁺ × fr / Σfr`、`Σfr < 1` なら `F⁺ × fr`(CSS Grid §12.7.1)
- 列 c の開始 `X_c = Σ_{k<c}(列_k + column-gap)`
- 項目の領域: `x₀ = X_a`、`領域の幅 A = X_{b−1} + 列_{b−1} − X_a`
- `width: auto` かつ `stretch` なら `w = A`、`x = x₀`。それ以外は `w = <px>`、`x = x₀`(start・stretch)、`x₀ + (A − w)/2`(center)、`x₀ + A − w`(end)
- center・end は `w ≤ A` のときだけ L1(はみ出すときの既定の揃えは測るまで外す)

### Flex(第一段: `flex-direction: row`、`flex-wrap: nowrap`)

| 性質 | L1 で受け付ける値 |
|---|---|
| コンテナの `height` | `<px>` |
| `gap`(`column-gap`) | `<px>` |
| `flex-basis` | `<px>`(項目の `width` は書かない) |
| `flex-grow` | 0 以上の数 |
| `flex-shrink` | 0 か 1 以上(和が 1 未満になる凍結を避ける) |
| `min-width` | `<px>`(既定 0)。`min-width ≤ flex-basis` |
| `justify-content` | `flex-start`(`normal`・`start`)・`flex-end`(`end`)・`center`・`space-between`・`space-around`・`space-evenly` |
| `align-items` / `align-self` | `stretch`(既定)・`flex-start`・`center`・`flex-end` |
| 項目の `height` | `auto` か `<px>` |

式(n 個の項目、`T = W − (n − 1) × gap`、`free = T − Σ basis`):

- 伸びるとき(`free ≥ 0`): `Σgrow = 0` なら `size = basis`。`Σgrow ≥ 1` なら `size = basis + free × grow / Σgrow`、`Σgrow < 1` なら
  `basis + free × grow`(CSS Flexbox §9.7)。max がないので凍結はない
- 縮むとき(`free < 0`): `s = shrink × basis` とし、ある `t ≥ 0` について `size = max(min, basis − s × t)`(`s = 0` なら basis)、
  `Σ size = T`。そのような t がない(すべて min でも T を超える)ときは `size = (s > 0 ? min : basis)`。
  §9.7 の凍結の繰り返しは、min だけで凍る場合、この「共通の t による水位の式」と同じ結果になる(凍結した項目は min に止まり、
  残りは縮め係数に比例して同じ t で縮む)。凍結の手順を式で書かずに、結果の性質で定義する
- 余り `L = T − Σ size`。`L ≥ 0` のとき `justify-content` で配る(between は `L/(n−1)` を間に、around は `L/n` の半分ずつ両側に、
  evenly は `L/(n+1)`)。`L < 0` のときは `flex-start` と `space-between`(flex-start に戻る)だけを L1 とする
- 交差軸: `height: auto` かつ `stretch` なら `h = コンテナの height`、`y = 0`。それ以外は `h = <px>`、`y` は start で 0、center で
  `(H − h)/2`、end で `H − h`(はみ出すときは start だけ L1)

### 第二段以降(この ADR の範囲外として記録)

文字を含む項目(ADR-0010 の幅の区間)、padding・border・margin、`%` と `calc()`、`flex-wrap: wrap`(行の分け方が W の区間で変わる)、
column、`max-width`(伸びるときの凍結)、Grid の auto-placement・名前つきの線と領域・暗黙のトラック・`auto` の行、subgrid。
engine はこれらの一部をすでに扱う。仕様に足すときは、同じく三つの照合を通す。

## 検証

- `tests/layout-spec.test.mjs`: 手計算との一致、engine との範囲全体での一致(違いが UNSAT)、壊した仕様(fr の配り方を変えたもの)で
  SAT になること
- `e2e/layout-spec.spec.mjs`: ランダムな L1 の設定を 3 ブラウザーで描き、仕様の座標と 0.05px まで一致すること

## Lean による定義と証明(実装済み)

`models/lean/`(Lean 4.36、Mathlib なし)に三つ目の定義を置いた。Flex は §9.7 の凍結の手順そのもので書き、Z3 の仕様(結果の性質)と
独立にした。証明した性質: fr の空きと単位が負にならない、固定のトラックが収まり fr の和が 1 以上ならトラックと gap が幅をちょうど
埋める、凍結の手順が項目を入れ替えない、どの項目も min を下回らない。実行ファイルを oracle にして、Z3 の仕様と(有理数で厳密に)、
engine と(領域の式をその幅で評価して)、ランダムな設定 × 12 の幅で一致することを確かめた(`tests/lean-oracle.test.mjs`)。

**照合の不具合の修正**: ランダムな設定を作る乱数(xorshift32)が、小さな種で最初にとても小さな値を出していた。そのため、Flex の設定は
すべて項目 1 つ、Grid はすべて 1 列で、照合が一部の場合しか試していなかった(Lean に誤りを入れた版で比較が落ちなかったことで気づいた)。
種を混ぜて最初の値を捨てるように直し、engine との範囲全体の照合(Grid 115・Flex 477 の領域)、3 ブラウザーとの照合、Lean との照合を
回し直して、どれも一致した。

## 未決の点

- Lean で証明する性質を広げる(凍結の手順と「共通の水位」の式が同じ結果になること、W に対して単調、重ならない)
- engine を仕様から作り直すか(今は照合だけ)
