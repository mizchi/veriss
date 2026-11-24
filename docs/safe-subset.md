# veriss で判定できる書き方(安全なサブセット)

veriss は、判定できない書き方に出会うと Unknown にする(成功にはしない)。このページは、自分で書くコンポーネントやページを、
veriss が判定できる形で書くための規約である。エンジンが何を計算するかは [layout-checking.md](layout-checking.md) にあり、
ここではそれを「書く側の規則」に直している。

各項目は次の 3 つを持つ。

- **書いてよい形**
- **外れたときに出る Unknown**(メッセージの先頭)
- **代わりの書き方**

自分で書き換えられない CSS(コンポーネントライブラリの CSS)の扱いは、最後の節にある。

## 1. 箱の並べ方

- 子を並べる箱は、grid か flex にする。
  - flex は `flex-direction: row | column`、`flex-wrap: nowrap`(row なら `wrap` も可)、すべての item で `order: 0`。
- grid の列は、px か `minmax(0, Nfr)` にする。
  - 素の `1fr` は、中身による最小幅を持つ。veriss がそれを判定できるのは、中身の最小幅が定数で分かる場合だけで、それ以外は Unknown になる。確実に判定させるには `minmax(0, 1fr)` と書く。
- `float` と段組(`columns`)は使わない(`Unsupported layout property: clear` / `columns`)。
- `position: absolute` / `fixed` の箱には、両方の軸に inset を書く(`top` か `bottom`、`left` か `right`)のが確実。
  - 書かない軸は静的位置(流れの中にあったときの位置)に置かれる。
  - veriss が静的位置を求められるのは次の場合。
    - grid の container の中。
    - block の container の中。
    - flex の container の中で、container が始点に揃えるとき。ltr で、`justify-content`・`align-content`・item の `align-self`(stretch は flex-start 扱い)が始点のもので、始点の margin がないとき。
  - flex で中央揃えなどにしていると、その軸は Unknown になる。
  - absolute の箱の containing block(`position: relative` の箱)は、スクロールする祖先や `overflow: hidden` の祖先の中にあってよい。
    箱と containing block の間に clip する祖先を挟まない(その祖先は箱を clip しないので、判定が難しくなる)。
- flex の item には、主軸の大きさを書く(px か % の `width` / `flex-basis`、または `flex: 1` のように basis 0 で伸ばす)。
  - % の `width` の item は、既定の `flex-shrink: 1` と `min-width: auto` のままでよい。ただし、veriss が判定できるのは、行が縮まない(item の合計が container に収まる)ときだけ。縮む行では、中身で決まる最小幅が要るので Unknown になる。縮ませたい item には `min-width: 0` を書く。
  - % の `width` / `flex-basis` に px の `max-width` を組み合わせた item(中央寄せの最大幅の容器 `width: 100%; max-width: 1280px; margin: 0 auto`)は判定できる。`max-width` を % にすると Unknown になる。
  - `flex-basis: auto` で幅も auto の item は、中身の大きさで決まる。veriss がそれを求められるのは、テキストの寸法が分かる葉の箱など一部だけで、それ以外は Unknown になる(`flex-basis: auto with an auto width uses the content size`)。
- 意図して重ねる箱は、`position: absolute` か、grid の同じ領域に置いたうえで、重なりを宣言する
  (宣言のない重なりは `E_LAYOUT_OVERLAP`)。

## 2. 寸法

- 長さは px、%、viewport 単位、`rem` / `em`(既定のフォントサイズで解決する)、`calc()`(演算子の両側に空白)。
- `box-sizing: border-box` を推奨する。content-box の `width: 100%` は、padding と border の分だけはみ出す(`W_LAYOUT_CONTENT_BOX_FULL`)。
- 画像と動画には、`max-width: 100%` と、`aspect-ratio` か `width` / `height` 属性を付ける。

## 3. テキスト

- テキストと子要素を、同じ箱の中に混ぜない。
  - 混ぜたいときは、テキストを `<span>` で包む。
  - 混ざっていると、テキストは名前のない箱(anonymous box)になる。ページに `*` のセレクターがあると veriss は span で包めず、
    Unknown になる(`… mixes text with child elements …`)。
- テキストの寸法は、次のどちらかで与える。
  - テキストの契約(`boxes` オプション)
  - フォントファイル(`--font`)
  - どちらもなければ、1 行 24px と仮定するので、文字のはみ出しは判定しない。
- `line-height` は px か数値にする。
- `word-break: break-all` は、フォントファイルで測るテキストにだけ使える。測ったテキストは、break-all の改行で判定する(Chromium の改行)。
  寸法を仮定するテキストは Unknown になる。`keep-all` と `line-break` は、折り返すテキストでは Unknown になる。
  - break-all の中でも、`$ % + \\` が漢字・かなの隣にある場合と、`-` の後に Latin-1 の文字が来る場合は Unknown になる(前後の文字で改行が変わる)。
- `text-box`(`text-box-trim`)は使わない(Unknown)。

## 4. border と背景

- `border` / `border-top` などの一括指定は、width・style・color をどの順でも書いてよい(省略も可)。
- 角丸は `border-radius` の一括指定で書く。角ごとの longhand(`border-top-left-radius` など)は、当たる箱が Unknown になる。
- `border-image` は使わない(`border-image: none` のリセットはよい)。
- 枠のない箱には `border: none` か `border: 0` と書く。style を書かずに幅だけ書くと、border は描かれず、`W_CSS_BORDER_NO_STYLE` になる。

## 5. 状態(`:hover` / `:focus` / `:active` / `:checked` …)

- 状態のルールは、次の 2 つの範囲で書く。
  - 描画だけを変える: `color`、`background`、`border-*-color`、`border-radius`、`outline`、`box-shadow`、`text-decoration`、
    `opacity`、`visibility`、`cursor`
  - `transform` / `translate` / `scale` / `rotate` で箱を動かす
- `:hover` と `:focus` でレイアウトを変えるルールは、veriss が hover・focus した状態で配置し直して検査する。
- `:active` でレイアウトを変えるルール(押したときに中身を下げる `padding-top` など)は、veriss が押した状態(マウスとキー)で配置し直して検査する。
  押した状態だけで起きる違反は「押している間」として報告する。押したときのずれは、入力に続くずれなので報告しない。
  - hover で別の箱がずれれば `E_LAYOUT_HOVER_SHIFT`、focus でずれれば `W_LAYOUT_FOCUS_SHIFT` になる。
- それ以外の状態(`:checked`、`:target`、`:disabled` との組み合わせなど)で、レイアウトを変えない。
  - 変えると Unknown になる(`State selector rules may only change paint …`)。
- 1 つの複合セレクターに書ける状態は 1 つ(`.btn:hover:not([disabled])` は可、`.btn:hover:focus` は Unknown)。
- 状態を結合子の前に置かない(`.check:checked + span::before`、`.row:hover > td`)。
  - Unknown になる(`… a state or pseudo-element before a combinator`)。
  - 代わりに、状態を持つ要素自身か、スタイルを当てる要素に属性を付けて、属性セレクターで書く。
    例: `<span data-checked="true">` と `[data-checked="true"]::before`。属性セレクターは veriss が読める。属性の値をどう展開して検査するかは、アダプターの対応範囲([component-lint.md](component-lint.md))による。
- `:has()` の引数は、先頭の結合子(`>`、`+`、`~`、なしは子孫)のあと、`>` と子孫の結合子で下へたどれる(`.btn:has(> span:only-child > svg)`)。
  引数の中で状態を使うものと、2 つ目以降に `+` / `~` を使うものは Unknown になる。

## 6. 擬似要素

- `::before` / `::after` には `content` を書く。ないと生成されず、`W_CSS_PSEUDO_NO_CONTENT` になる。
  - `*, *::before, *::after { box-sizing: border-box }` のような全称のリセットは、報告しない。
- `::-webkit-scrollbar` は使わない(Unknown)。
  - スクロールバーの幅は `scrollbar-width`、場所の確保は `scrollbar-gutter: stable` で書く。
  - Chromium と Safari は、`scrollbar-width` / `scrollbar-color` があると `::-webkit-scrollbar` を無視する(F130)。

## 7. HTML の要素と属性

- 寸法と色は CSS で書く。
  - `width` / `height` 属性を使ってよいのは、`img`・`video`・`canvas`・`iframe` と `svg` だけ。表の `th width="320px"` は、
    当たる要素が Unknown になる(`HTML rendering attribute needs an adapter: width`)。CSS の `width` で書く。
  - それ以外の要素では、`width` / `height` / `size` / `color` / `align` などは効かない(`W_HTML_ATTRIBUTE_INERT`)。
  - iframe の `frameborder` は `"0"` か `"no"` で書く(UA の 2px の枠線が消える)。`"yes"` や `""` はエンジンで解釈が違う(Unknown)。
    `scrolling`・`marginwidth`・`marginheight` は iframe の中にだけ効くので、受け付ける。
- コンポーネントの props を DOM に漏らさない。
  - styled-components では transient props(`$size`)にする。
  - 漏れても描画には効かないので、veriss は止まらない。ただし `size` などの HTML の属性名は警告になる。
- `<hr>`、`<br>`、`<col>` / `<colgroup>` は、今は大きさを持つ箱として扱えない(`Native or foreign element needs a size adapter`)。
  - 区切り線は、`border-top` を持つ `<div role="separator">` か、`border-bottom` で書く。
  - 改行は、ブロックを分けて書く。
  - 表の列幅は、`th` / `td` の CSS で書く。
- `contenteditable` は Unknown になる(フォーカスと編集の挙動を持つため)。

## 8. 使えない CSS(Unknown になるもの)

| 書き方 | 代わり |
|---|---|
| `float`、`columns` | grid / flex |
| `transform: scale(0)`(畳む・隠す) | `visibility: hidden` か `opacity: 0`、閉じるなら `display: none` |
| `mix-blend-mode` | なし(描画の合成は判定しない) |
| `text-box` | `line-height` と padding で揃える |
| `border-image` | `border` と `background` |
| 角ごとの `border-*-radius` | `border-radius` の一括指定 |
| SVG の `stroke-*` を CSS で書く | svg の属性で書く(`stroke-width="2"`) |

当たる要素がページにない場合、これらのルールは何もしないので、Unknown にはならない。

## 9. 書き換えられない CSS(コンポーネントライブラリ)

- ライブラリの CSS がサブセットの外にあっても、Unknown になるのは、そのルールが当たりうる箱だけである。
  - 宣言を読めないルールは、当たる箱だけが Unknown になる。
  - セレクターを読めないルールは、擬似クラスと擬似要素を外したセレクターに当たる箱だけが Unknown になる(どの状態で当たる箱も含む、上位集合)。描画だけを変えるルールなら、配置は判定され、その箱の色(コントラスト)だけを判定しない。
  - 要素や属性を読めない場合(大きさを持たない要素、効く属性、テキストと子要素の混在)も、その箱だけが Unknown になる。隠れている箱なら何も変わらない。
  - ページにないコンポーネントのルールは、何もしない。
- Unknown の箱の大きさに依存する箱(同じ container の後ろの兄弟、親)は、判定されない。そこから先は止まる。
- 結果の status は、Unknown の箱が 1 つでもあれば `unknown` になる。
  - ほかの箱の違反(`E_*`)は報告されるので、違反を探す目的には使える。
  - 「ページ全体が正しい」と言うには、Unknown の箱をなくす必要がある。ライブラリのコンポーネントを包むか、テーマで上書きする。

## このページの更新

veriss が新しい書き方を判定できるようになったら、その項目を「書いてよい形」へ移す。そのとき、次も合わせて更新する。

- [static-check-checklist.md](static-check-checklist.md) の対応する項目
- Unknown のメッセージ

3 ブラウザーでの実測が前提である。
