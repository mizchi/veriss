# 親子の構造: HTML の内容モデルと ARIA の所有

コンポーネントの作者が正しい親子の構造を書けるように、veriss が何を検査するかを、HTML の内容モデル(content model)と
WAI-ARIA 1.2 の「Required Owned Elements / Required Context Role」に照らして一覧にしたもの。チェックリストの番号は
[static-check-checklist.md](static-check-checklist.md)(F27 と J1〜J6)、直し方の文言は `packages/adapter-core/src/lint.mjs`。

検査は 3 つの層に分かれる。

- **解析が組み替えるもの**: HTML の解析(パーサー)が、書いた木と違う木を作る。サーバーで描いた HTML、ブラウザーが解析する
  テンプレートは組み替わった木になり、スクリプトで DOM を組み立てる描画(React・Vue のクライアント側)は書いたとおりの木になるので、
  hydration で二つが食い違う。3 つのブラウザーの DOM で照合した(`recommended` の警告)。
- **描画・意味が変わるもの**: 解析は木を変えないが、ブラウザーの扱いが置き場所で変わる(summary・legend・label)。3 つのブラウザーで
  描画か DOM の API で照合した(`recommended` の警告)。
- **内容モデルだけが禁じるもの**: ブラウザーは書いたとおりに保って描き、測れる違いがない(`<button>` の中の `<div>` など)。
  `strict` の profile だけで警告にする(`recommended` では「outside the recommended rules」の info として残す)。
  ARIA と HTML の仕様違反で支援技術に意味があるもの(spec 層、`specRules`)は、これまでどおり `recommended` で `tier: 'spec'` の警告。

## 一覧

| 関係 | 仕様 | ブラウザーの挙動(実測) | コード | 層 |
|---|---|---|---|---|
| `<p>` の中のブロック(`<div>`、`<ul>`、`<table>`…)と `</p>` | HTML §13.2.6.4.7 | `<p>` が閉じ、`</p>` は空の `<p>` になる | `W_HTML_RESTRUCTURED`(`implied`、F27) | 組み替え |
| `<a>` の中の `<a>`、`<button>` の中の `<button>`、見出しの中の見出し、`<select>` の中の `<input>` | 同上 | 外の要素が早く閉じる | `W_HTML_RESTRUCTURED`(`unclosed`、F27) | 組み替え |
| 表の中でセルの外に書いた要素 | 同上(foster parenting) | 表の前へ移る | `W_HTML_RESTRUCTURED`(`fostered`、F27) | 組み替え |
| `<form>` の中の `<form>` | 同上 | 内側の開始タグが捨てられる | `W_HTML_RESTRUCTURED`(`nested-form`、F27) | 組み替え |
| 表の外の `<td>`・`<th>`・`<tr>`・`<tbody>`・`<thead>`・`<tfoot>`・`<caption>`・`<col>`・`<colgroup>` | 同上("in body" で無視) | 開始タグが捨てられ、中の文字だけが残る | `W_HTML_RESTRUCTURED`(`dropped`、**J1**) | 組み替え |
| 同じ種類の中の、終了タグを省ける要素(`li` の中の `li`、`dd`/`dt` の中の `dd`/`dt`、`option`/`optgroup`、セルの中のセル・行・行グループ、`rt`/`rp`) | 同上(省ける終了タグ) | 内側の開始タグが外を閉じ、次の兄弟になる | `W_HTML_RESTRUCTURED`(`auto-closed`、**J2**) | 組み替え |
| 表の直下の `<tr>`(tbody を省く) | 同上 | tbody が補われる(誤りではない) | `W_CSS_SELECTOR_IMPLIED_PARENT`(`table > tr` が当たらない、F26) | 組み替え(セレクタ) |
| `<details>` の子でない `<summary>` | HTML §4.11.1 | details は自前の「Details」を出し、summary は開閉しない | `W_HTML_SUMMARY_OUTSIDE`(**J3**) | 描画 |
| `<fieldset>` の子でない `<legend>` | HTML §4.10.16、§15.3.13 | 枠の上に描かれず、グループの名前にならない | `W_HTML_LEGEND_OUTSIDE`(**J4**) | 描画 |
| 複数のコントロールを含む `<label>` | HTML §4.10.4(labeled control) | 最初の(または for の)コントロールだけを label する(`control.labels`) | `W_HTML_LABEL_EXTRA_CONTROL`(**J5**) | 意味 |
| `<label for>` がラベル付けできない要素を指す | HTML §4.10.4 | 何も label しない | `E_A11Y_LABEL_FOR` | spec |
| DOM で組み立てた木の、`<p>` の中の flow の要素(`div`、`ul`、`table`、見出し、`p`) | HTML §4.4.1 | DOM の API で作ると 3 ブラウザーとも中に保って描く。同じマークアップを解析すると `<p>` が閉じる(hydration で食い違う) | `E_HTML_PARAGRAPH_CONTENT`(**J7**) | spec |
| `<a>`・`<button>` の中の操作要素 | HTML §4.5.1 / §4.10.6 | 描かれる幅で報告 | `E_A11Y_NESTED_INTERACTIVE` | spec |
| `ul`/`ol` の外の `li`、`ul`/`ol` の `li` でない子 | HTML §4.4.8 | — | `E_A11Y_LIST` | spec |
| `dl` の外の `dt`/`dd`、`dl` の子 | HTML §4.4.9 | — | `E_A11Y_DL` | spec |
| `th` 以外の `scope` | HTML §4.9.10 | — | `E_A11Y_SCOPE` | spec |
| ARIA の必要な文脈: `listitem`→`list`、`option`→`listbox`/`group`、`tab`→`tablist`、`menuitem*`→`menu`/`menubar`/`group`、`treeitem`→`tree`/`group`、`row`→`table`/`grid`/`treegrid`/`rowgroup`、セル→`row`、`rowgroup`→`table`/`grid`/`treegrid` | WAI-ARIA 1.2 | — | `E_A11Y_ROLE_PARENT` | spec |
| ARIA の必要な所有: `list`、`listbox`、`tablist`、`menu`、`menubar`、`tree`、`grid`、`table`、`row`、**`treegrid`、`rowgroup`、`feed`** | WAI-ARIA 1.2 | — | `E_A11Y_ROLE_CHILDREN` | spec |
| phrasing だけを受ける要素(`button`、`label`、`span`、`strong`、見出し、`legend`、`summary`…)の中の flow の要素 | HTML §3.2.5.2 | 書いたとおり保ち描く(見出しは button の中でも Chromium の a11y tree で heading のまま) | `W_HTML_CONTENT_MODEL`(`flow-in-phrasing`、**J6**) | strict |
| `header`/`footer` の中の `header`/`footer` | HTML §4.3.8–9 | 同上 | `W_HTML_CONTENT_MODEL`(`header-footer`、J6) | strict |
| `select`/`datalist` の外の `option`/`optgroup` | HTML §4.10.10 | 同上 | `W_HTML_CONTENT_MODEL`(`option-outside`、J6) | strict |
| `figure` の子でない `figcaption` | HTML §4.4.13 | 同上 | `W_HTML_CONTENT_MODEL`(`figcaption-outside`、J6) | strict |
| `label` の中の `label` | HTML §4.10.4 | 同上(内側のコントロールは両方に label される) | `W_HTML_CONTENT_MODEL`(`label-in-label`、J6) | strict |

### 検査しないもの

| 関係 | 理由 |
|---|---|
| `<select>` の中の `option`・`optgroup`・`hr` 以外(`<div>`、`<span>`) | 3 つのブラウザー(Playwright の Chromium・Firefox・WebKit)は customizable select の解析で保つが、veriss の使う parse5 8.0.1 は捨てる。解析の木がブラウザーと違うので、何も主張しない |
| `aria-owns` による所有 | 辿らない。`aria-owns` のある木の所有の検査は、DOM の親子だけを見る |
| `<caption>` が表の最初の子でない、`<figcaption>` が最初でも最後でもない | 置き場所による描画の違いを測っていない |
| `address`・`dt` の中の見出しや sectioning、`main` の置き場所 | 未実装(`main` はページ全体のルール `W_A11Y_*` が見る) |
| `<template>` の中、`svg`・`math` の中 | 解析の規則が違うので比べない |

## 健全さ: コンポーネントの根と、外から来る子

- **コンポーネントの根**: adapter はコンポーネントをページの body の中に置いて解析するが、実際の親は呼び出し側の要素である。
  根の要素の親(またはそこまでの generic な祖先)だけで決まる指摘には `atRoot: true` を付け、component lint はそれを警告にせず
  「not checked: … the caller's element decides this」の info にする。対象は `E_A11Y_LIST`(根の `li`)、`E_A11Y_DL`(根の `dt`/`dd`)、
  `E_A11Y_ROLE_PARENT`(role を持つ祖先がない)、根の表の部品(`<tr>` を描く行のコンポーネント、J1)、根の `summary`/`legend`
  (J3、J4)、根の `option`・`figcaption`(J6)。API の `page: true` ではページの body なので、そのまま報告する。
- **外から来る子**: slot、`{children}`、子のコンポーネント(`<!--isle-boundary…-->`)の中身は分からない。検査はテンプレートに書いた
  要素だけを見るので、その中身について違反を主張しない(例: `<label>` の中の slot がコントロールを描くかは見ず、書いたコントロールが
  2 つ以上あるときだけ J5 を出す)。
- **配置が Unknown の箱**: マークアップだけで決まる構造の規則(`E_A11Y_LIST`、`E_A11Y_DL`、`E_A11Y_ROLE_PARENT`、`E_A11Y_ROLE_CHILDREN`)は、
  配置が決まらない状態(`U_LAYOUT_FLEX` など)でも木だけで判定する(以前は、どこかが Unknown だと a11y の規則全体が走らず消えていた)。
- **解析し直した木**: adapter は文字の印を付けるためにマークアップを解析して書き直すので、解析の段では組み替えが見えなくなる。そこで
  `htmlRestructurings`(`veriss/html`)が書いたままのマークアップから組み替えを探し、`data-src-line` の行で報告する。
  adapter のテンプレート(React・Vue)は DOM の API で組み立てられ、ブラウザーの中では組み替わらないので、`<p>` の中の flow の要素は
  解析の組み替え(空の `<p>`)ではなく `E_HTML_PARAGRAPH_CONTENT`(spec 層)として、その `<p>` の行で報告する(`{dom: true}`)。
  Svelte はコンパイラーがこの入れ子を拒む。

## 新しい規則の実測(`e2e/layout-content-model.spec.mjs`、3 ブラウザー)

- J1: `<div><td>`、`<div><tr><td>`、`<section><caption>`、`<div><thead>…` で要素がなくなる(`.p > .d` が null)。表の中と、tbody を省いた表は保つ(対照)。
- J2: `li`/`li`、`dd`/`dd`、`dt`/`dd`、`option`/`option`、`optgroup`/`optgroup`、`td`/`td`、セルの中の `tr` で内側が兄弟になる。
  終了タグを省いた書き方(`<li>a<li>b</ul>`、`<td>a<td>b</tr>`)、本当に入れ子のリストと表は報告しない(対照)。
- J3: `summary.click()` が details を開くのは子のときだけ(他の内容の後ろでも開く。div の中では開かない)。
- J4: legend の上端が fieldset の上端(枠の上)に来るのは子のときだけ(後ろに書いても枠の上。div の中では padding の内側)。
- J5: `control.labels` に label が入るのは、最初のラベル付けできる要素(hidden の input は除く)か、for の指す要素だけ。
- J7: `createElement` で作った `<p>` の中の `div`・`ul`・`table`・`h2`・`p` は、3 ブラウザーとも子のまま、`<p>` の箱の中に高さを持って描かれる。
  その `innerHTML` を解析し直すと、どれも `<p>` の外に出る(`span` は対照で、中に残る)。
- J6: 8 通りとも、ブラウザーは書いたとおりの親子で保ち、高さを持って描く(組み替えない)。Chromium の accessibility tree では、
  `<button>` や `<label>` の中の `<h2>` も heading のまま(測る前の仮説「button の中の見出しは見出しでなくなる」は外れたので、
  メッセージに書かない)。
