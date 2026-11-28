# UA × reset の行列(`veriss/reset-matrix`)

コンポーネントやページは、ブラウザーの UA スタイルと、作者が先に読み込む reset のスタイルシートから始まります。
`analyzeResetMatrix` は、その初期状態の組(UA 3 つ × reset 7 つ = 21 の枝)ごとに今までの解析を 1 回ずつ流し、
レイアウトの性質がどの枝でも成り立つかを調べます。入力の空間が有限なので、property-based test を全数で回す形です。
壊れる枝は名前で返し、どの UA とどの reset の組で起きるかを、いちばん小さい組で言い直します(「firefox × none」)。

```js
import {analyzeResetMatrix} from 'veriss/reset-matrix';

const m = analyzeResetMatrix(
  {html: '<html lang="en"><body><main class="c"><div class="col"><textarea class="s" aria-label="Note"></textarea></div></main></body></html>',
   css: 'body{margin:0}.c{width:300px}.col{width:107px}.s{display:block;inline-size:100px;block-size:40px;resize:none}'},
  {viewport: {min: 400, max: 400, height: {min: 300, max: 300}}},
);
m.status;              // 'violated'
m.onlyIn[0].summary;   // 'firefox × none'(textarea の UA の border は Chromium と WebKit で 1px、Firefox で 2px)
m.onlyIn[0].in;        // ['firefox:none']
m.onlyIn[0].undecided; // ['chromium:normalize', 'chromium:destyle', ...](overflow: auto のスクロールバーは解析しない: Unknown)
m.onlyIn[0].absent;    // 解析が決まって、指摘が出なかった枝
```

返す値:

- `branches`: 枝ごとの `{id: 'firefox:none', ua, reset, status, findings, resetFindings, unknowns, report}`。`report` は解析の結果そのもの。
- `holdsEverywhere`: すべての枝で出る指摘。`onlyIn`: 一部の枝でだけ出る指摘。指摘は code・箱・プロパティで同じものとみなし
  (数値が枝で違っても 1 つ)、`in`(出た枝)、`absent`(解析が決まり、出なかった枝)、`undecided`(Unknown の枝)、`messages`(枝ごとの文)、
  `where` / `summary`(出た枝を覆ういちばん小さい UA × reset の積。積にならないときは reset ごとの積の和)を持つ。
- `unknowns`: 枝ごとの Unknown。`resetFindings`: reset のスタイルシートそのものにある指摘(normalize.css の vendor のセレクターの並び、
  Tailwind Preflight の同じ規則の一括指定と個別指定など)。ページの比較からは外し、reset ごとに 1 回だけ返す。
- `equivalent`: 結果(status、指摘と文、Unknown)が同じ枝のまとまり。どの枝も解析したうえでまとめている(`basis: 'identical results'`)。
- `status`: どれかの枝が violated なら violated(決まった失敗)。そうでなく Unknown の枝があれば unknown。verified はすべての枝が verified のときだけ。

健全さ: Unknown の枝は、指摘が出なかった枝(`absent`)に数えない。

オプション:

- `uas`、`resets`: 調べる軸(既定はすべて)。ほかのオプション(`viewport`、`images`、`boxes` など)は、そのまま各枝の解析に渡す。
- 各枝は `ua` をその UA にし、reset をページの CSS と作者の `reset` の前に置く(作者が読み込むのと同じ順)。
- `sample`、`seed`: 枝の空間から seed で決まる n 個を選ぶ(ほかに生成する次元と組み合わせるとき)。`space.sampled` にそう書き、
  `where` は解析した枝の上で言う。`enumerateBranches`、`sampleBranches`、`describeBranchSet` も単体で使える。
- `analyze`: 解析の関数(既定は `{html}` なら `analyzeHTML`、`{tree}` なら `analyzeLayout`)。

コンポーネントの CLI(`css-lint`、`veriss-svelte`、`veriss-linaria`)では `--resets none,modern-normalize,…|all`([コンポーネントの lint](component-lint.md) の「reset の行列」)。中の比較は同じ `compareBranches`。

## reset のデータ(`veriss/resets/manifest.json`)

reset は、ブラウザーが受け取る文字列そのものを、版を決めて `packages/veriss/src/resets/` に置いています。ライセンスの本文は
`licenses/` に、版・URL・sha256 と CSS 本体は `manifest.json`(`veriss-resets/1`)に 1 つにまとめ、vlmkit が同じ枝を実際のブラウザーで
描くときも、これを読みます。`tools/vendor-resets.mjs` が CSS から manifest を書き、テストは manifest が古いと失敗します。

| id | 名前 | 版 | ライセンス | 出どころ |
|---|---|---|---|---|
| `none` | UA のスタイルだけ | — | — | — |
| `modern-normalize` | modern-normalize | 3.0.1 | MIT | npm `modern-normalize@3.0.1` |
| `normalize` | normalize.css | 8.0.1 | MIT | npm `normalize.css@8.0.1` |
| `sanitize` | sanitize.css | 13.0.0 | CC0-1.0 | npm `sanitize.css@13.0.0` の `sanitize.css`(forms.css などの追加は含めない) |
| `josh-comeau` | Josh's Custom CSS Reset | 2026-11-20 | パブリックドメイン(作者の宣言) | https://www.joshwcomeau.com/css/custom-css-reset/ の最後の版 |
| `tailwind-preflight` | Tailwind CSS Preflight | 4.3.5 | MIT | npm `tailwindcss@4.3.5` の theme.css と preflight.css を、`@import "tailwindcss"` と同じ層の並びで `compile()` した出力(`--theme()` は解決済み) |
| `destyle` | destyle.css | 4.0.1 | MIT | npm `destyle.css@4.0.1` |

Josh Comeau の reset は npm の包みがなく、ページに「It's released without any restrictions, into the public domain」とあるので、
そのページの最終版を置いています(冒頭のコメントにリンクを残す)。

## reset を読めるようにした解析の変更

最初はどの reset でも、解析がページ全体で Unknown になりました。reset が使う書き方を、その効果が及ぶ箱だけ Unknown にするように直しました
(`packages/veriss/test/reset-stylesheets.test.mjs`)。

- `tab-size`・`-moz-tab-size`(modern-normalize、sanitize.css、Preflight の `html { tab-size: 4 }`): 継承する値として持ち、タブを残す
  `white-space`(pre、pre-wrap、break-spaces)の箱でだけ Unknown。
- コントロールの内部の部品の疑似要素(`::-webkit-file-upload-button`、`::file-selector-button`、spin button、search の飾り、日付の欄、
  `::-webkit-calendar-picker-indicator`)は、それを持つコントロールだけを Unknown にする。`::backdrop` は dialog と popover だけ。
  `:-moz-ui-invalid` はフォームのコントロールだけ。`:is()` / `:where()` の中の読める条件は残す(sanitize.css の
  `:where([aria-hidden="false" i][hidden]:not(:focus))`)。`:host` は文書のスタイルシートでは何にも当たらない。
- `::-moz-focus-inner`(normalize.css): Chromium と WebKit はその規則を捨て、Firefox 157 は大きな padding・border・margin を付けても
  ボタンの箱が変わらない(3 ブラウザーで測った)ので、何にも当たらないものとして扱う。
- 疑似要素の規則の中の `@supports` に入れ子の宣言(Preflight の `::placeholder`)、`interpolate-size`(Josh Comeau、アニメーションだけ)、
  `@supports (contain-intrinsic-size: 1px)`(Preflight の条件。3 ブラウザーの `CSS.supports` と照合)。
- `-webkit-appearance` は `appearance` の別名。`-moz-appearance` は Firefox だけが読む(Chromium と WebKit の profile では捨て、
  Firefox か profile のないときはコントロールの appearance と違えば Unknown)。
- reset のスタイルシートの中の一括指定と個別指定の衝突は、警告(`W_CSS_SHORTHAND_CONFLICT`)にする(作者の CSS では今までどおり error)。
- `ua` の profile があるときは、body の margin(8px)と p の margin(1em 0)を、3 ブラウザーで同じ UA の値として持つ。
  見出し、リスト、dl、dd の UA の margin は Unknown のまま。

## ブラウザーとの照合(`e2e/layout-reset-matrix.spec.mjs`)

代表的な部品ごとに、7 つの reset をそれぞれページの CSS の前に置いて、そのブラウザーで描き、そのブラウザーの UA × reset の枝の解析と
箱の位置と大きさ(1/64px 以内)を比べます。解析が決まった枝ではすべての箱が一致し、`E_LAYOUT_ITEM_SIZE` の指摘はブラウザーで親の
content box からはみ出す箱と一致すること、Unknown であるべき枝が Unknown のままであることを確かめます。解析の body の margin を
9px にずらすと、この spec は失敗します(空振りでないことの確認)。

macOS(Chromium 156、Firefox 157、WebKit 27.2、Playwright 1.64.1)で測った結果(v = verified、x = violated、? = Unknown。textarea の none 以外は 3 つの UA で同じ):

| 部品 | none | modern-normalize | normalize | sanitize | josh-comeau | tailwind-preflight | destyle |
|---|---|---|---|---|---|---|---|
| リスト(UA の padding 40px と 80px の箱) | x | x | x | x | x | v | v |
| ページ(body の UA の margin) | v | v | v | v | v | v | v |
| 見出し(h2) | ? | ? | ? | ? | v | v | v |
| 段落(p) | v | v | v | v | v | v | v |
| ボタン | v | v | v | v | v | v | v |
| 文字の入力欄 | v | v | v | v | v | v | v |
| 数値の入力欄 | v | ? | ? | ? | v | ? | ? |
| textarea(107px の列) | firefox だけ x | v | ? | v | v | v | ? |
| 画像のあるカード | v | v | v | v | v | v | v |

決まった枝はすべて、3 つのブラウザーで描いた箱と一致しました(合わなかった枝はありません)。ただし macOS の WebKit は、フォームの部品の
UA スタイルが Linux で測った profile と違う(文字の入力欄の padding 2px 5px、11px のフォント)ので、コントロールの部品(ボタン、
入力欄、数値、textarea)は WebKit では照合を skip しています(既存の `e2e/layout-ua-profiles.spec.mjs` も macOS の WebKit では
同じ理由で合いません)。Linux では照合します。

Unknown のまま残るもの:

- 見出しの UA の margin(em で書かれ、UA の見出しのフォントの大きさから決まる。その大きさも解析しない)。
  none、modern-normalize、normalize.css、sanitize.css は見出しの margin を消さない。
- 数値の入力欄の spin button(`::-webkit-inner-spin-button { height: auto }`、modern-normalize・normalize.css・sanitize.css・Preflight・destyle)。
- `overflow: auto` の textarea のスクロールバー(normalize.css、destyle)。
- reset のないチェックボックスと radio の既定の大きさ(`appearance: none` がないと解析しない。今までどおり)。
- リストの UA の margin(1em)と、入れ子のリストの 0。
