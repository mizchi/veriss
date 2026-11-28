# コンポーネント検査の導入ガイド

Svelte と Linaria のコンポーネントを veriss の checker で検査し、出た指摘をたどって、正しい DOM の構造と
マークアップに直すまでの手順です。checker ごとの手順と、壊れた例・直した例の組は次のページにあります。

- [Svelte(`veriss-svelte`)](svelte.md) — 例: [`examples/svelte/`](../../examples/svelte/)
- [Linaria(`veriss-linaria`)](linaria.md) — 例: [`examples/linaria/`](../../examples/linaria/)

このページは両方に共通する部分(出力の読み方、オプション、package.json と CI、構造へ導くルール、検出しないもの)です。
オプションとルールの一覧は [component-lint.md](../component-lint.md)、すべての検査コードは [rule-catalog.md](../rule-catalog.md) にあります。

## 何をするか

checker はページを描きません。コンポーネントのソース(テンプレートと CSS)を読み、テンプレートの分岐(`{#if}`、
`class:x`、JSX の `&&`、`cx()` など)を **状態** として展開し、各状態を **viewport の幅と高さの範囲全体** で検査します。
はみ出し、場所を取らない画像、名前のない部品、コントラスト、コンポーネントの外に届くセレクタ、マークアップの仕様違反などを、
ソースの行と、その指摘が出る状態つきで報告します。

検査できなかったものは `info` として残し、合格にはしません(後述)。

## インストール

```sh
npm install -D veriss veriss-adapter-core veriss-svelte                  # Svelte 5
npm install -D veriss veriss-adapter-core veriss-react veriss-linaria    # Linaria (React)
```

`veriss-svelte` と `veriss-linaria` は、`veriss` と `veriss-adapter-core`(Linaria は `veriss-react` も)を
peerDependencies に持ちます。npm 7 以降は peer を自動で入れますが、pnpm や yarn の設定によっては入らないので、上のように並べて
入れておくのが確実です。Node.js 24 以降が要ります。

この repository の中では、`examples/*` が workspace の package なので `pnpm install` だけで動きます(`workspace:*`)。

## 出力の読み方

```
src/broken/ProfileCard.svelte:6  error    E_LAYOUT_ITEM_SIZE  .card requires 480px but receives 400px on inline axis at viewport 400px × 690px (also: 1 box inside it reaches past the viewport)
    fix: give the box room (a flexible track, max-width: 100%, min-width: 0) or let it shrink
src/broken/TagList.svelte:8  warning  E_A11Y_LIST  spec: .tag is a list item outside ul/ol (a markup conformance error; the rendering does not show it)  [tags ×2]
    fix: put only li (and script/template) directly inside ul/ol
src/broken/ProfileCard.svelte  info     ASSUMPTION  1 text box(es) sized by assumption (one line, no minimum width): text overflow is not checked

9 error(s), 3 warning(s), 30 not checked or assumed
```

1 行が 1 件です。`ファイル:行  重大度  コード  メッセージ  [状態]` の順で、次の行の `fix:` が直し方です。コンパイラが列を返す
指摘(下の「コンパイルできないコンポーネント」)は `ファイル:行:列` です。
最後の行が件数のまとめで、`error` が 1 件でもあれば終了コードは 1、なければ 0、引数の誤り(ファイルがない、知らないオプション、
値のないオプション)は 2 です。
各ファイルを何状態・何秒で解いたか(`ProfileCard.svelte: 1 states in 0.1s`)は stderr に出ます。

### 重大度

| 重大度 | 意味 | どう扱うか |
|---|---|---|
| `error` | ブラウザーで実際に壊れるもの(はみ出し、場所を取らない画像、名前のない部品、コントラスト不足、コンポーネントの外に届くセレクタ、状態の間のレイアウトシフト)。recommended のルールは Chromium での実測と照合済み | 直す。CI を落とす |
| `warning` | ほぼ確実な書き間違い(効かない宣言、固定の高さのテキスト、テンプレートと合わないセレクタ)。メッセージが `spec:` で始まるものは、描画には出ないマークアップの仕様違反(`tier: 'spec'`) | 直す。意図したものなら理由をコメントに残す |
| `info` | 検査しなかったもの(`not checked:`、`U_*` のコード)と、置いた仮定(`ASSUMPTION`)。recommended に含まれないルールの指摘も「outside the recommended rules」として info に残る | 読む。**合格ではない** |

`info` の `not checked` は「問題がない」ではなく「見ていない」です。たとえば Linaria の例の `Menu.tsx` は、子の
`<MenuLink>` の中身を見ていないことを `U_REACT_COMPONENT` として出します。CI が通っても、その部分は検査されていません。
`not checked` を減らすには、メッセージが求める情報を渡します(`--images` で画像の大きさ、`--font` でフォント、px の幅など)。

### 状態

| 表示 | 意味 | 例 |
|---|---|---|
| `[dark=true]` | その指摘は `dark` が true の状態でだけ出る | `E_A11Y_CONTRAST  .title has contrast 2.24:1, below 4.5:1  [dark=true]` |
| `[tags ×2]` | `{#each tags}` / `.map()` の要素が 2 個の状態(既定では 0 個と 2 個を検査する。`--each-counts` で変える) | `E_A11Y_NAME  .remove has no accessible name …  [tags ×2]` |
| 表示なし | すべての状態で出る | |
| `{saved: true} and {saved: false}` | `E_LAYOUT_NOSHIFT` の比べた 2 つの状態 | `[data-noshift="canvas"] moves between {saved: true} and {saved: false}` |
| `(in chromium, webkit; not in firefox)` | `--ua` で複数のブラウザーを指定したとき、その一部でだけ成り立つ | 下の `--ua` |

同じ要素の同じ指摘は 1 件にまとめ、状態の表示には、まとめた状態に共通する条件だけを出します。

### JSON

`--format json` で、同じ内容が配列で出ます(`file`、`line`、列があれば `column`、`severity`、`code`、`message`、`fix`、`states`、spec の行は `tier`)。
stderr の時間の行と、最後のまとめの行は出ません。

```json
{"file": "src/broken/SignupForm.svelte", "line": 4, "severity": "error", "code": "E_A11Y_LABEL",
 "message": ".field has no label here: add a visible <label>, aria-label, aria-labelledby or title", "fix": "label the field", "states": "every state"}
```

## 最初に効くオプション

| オプション | 既定 | いつ使うか |
|---|---|---|
| `--viewport 320-1280` | `320-1280` | 検査する幅の範囲。コンポーネントが置かれる幅に合わせる(サイドバーの部品なら `240-360` など)。`--viewport 480-1280` にすると、例の `ProfileCard` の 480px のはみ出しは出なくなる |
| `--height 480-900` | `480-900` | 高さの範囲。fixed の部品やスクロールの終わりの判定に効く |
| `--page-css page.css` | `*{box-sizing:border-box;margin:0}` | コンポーネントを置くページの CSS(reset、html と body)。ページの CSS の誤りも出る(`html { font-size: 16px }` を渡すと全コンポーネントに `W_LAYOUT_ROOT_FONT_FIXED`)。フォームの部品の reset がページにあるなら渡しておくと、`W_LAYOUT_CONTROL_FONT` が出なくなる。reset は `:where(button, input, select, textarea) { font: inherit }` と書く(`--suggest-reset` もこの形を出す)。`button, input, select, textarea { … }` と型セレクタで書くと、そのコンポーネントにない要素のぶん `W_CSS_SELECTOR_UNMATCHED` が出る(下の「検出しないもの」) |
| `--font Roboto=fonts/Roboto.ttf` | なし | 計算後の font-family が Roboto のテキストを、フォントファイルで測る。渡さないとテキストは「1 行、最小幅なし」と仮定され、テキストのはみ出しは検査されない(`ASSUMPTION … text overflow is not checked`)。渡すと文字 200% の拡大も解析する(`E_A11Y_TEXT_RESIZE`)。繰り返し指定できる |
| `--images images.json` | なし | 画像ファイルの自然な大きさ(`{"/avatar.png": {"width": 128, "height": 128}}`)。ないと、高さを確保しない img は `U_LAYOUT_IMAGE`(not checked)になり、`E_LAYOUT_IMAGE_UNRESERVED` は出ない。ビルドの時に画像の header から作るのが確実 |
| `--trust-image-attributes` | なし | `--images` にない img の `width` / `height` 属性をファイルの大きさとみなす(仮定として info に出る) |
| `--ua chromium,firefox,webkit` | Chromium の既定 | フォームの部品の UA スタイルをブラウザーごとに使い、一部のブラウザーでだけ成り立つ指摘にブラウザーを添える。`--suggest-reset chromium,firefox,webkit` は、その差を消す最小の reset を出して終わる |
| `--resets all` | なし | reset(none、modern-normalize、normalize、sanitize、josh-comeau、tailwind-preflight、destyle)のどれを先に読み込んでも成り立つかを、UA × reset の枝ごとに検査する。`--ua` が UA の軸(省くと 3 つ)。一部の枝だけの指摘は `only in firefox × none` のように出る。`--sample N --seed S` で枝の一部だけ |
| `--profile strict` | `recommended` | `recommended` に、内容モデルだけが禁じる構造(`W_HTML_CONTENT_MODEL`: `<button>` や `<span>` の中の `<div>` など)を warning として足す。ブラウザーは書いたとおりに描くので recommended には入っていない。ベストプラクティスとして直したいときに選ぶ([component-lint.md](../component-lint.md) の「親子の構造と `strict`」) |
| `--profile all` | `recommended` | ブラウザーと照合していないルールも error / warning として出す。最初は recommended のまま使い、info の「outside the recommended rules」を読むほうがよい |

`--ua` の例(幅 100px のボタンの「Publish now」を Roboto で測る):

```
U.svelte:2  error    E_LAYOUT_CONTENT  .publish requires 86.72px but receives 84px on inline axis at viewport 800px × 690px (in chromium, webkit; not in firefox)
```

`--resets` の例(幅 107px の列に置いた content-box の textarea。UA の border は Chromium と WebKit で 1px、Firefox で 2px):

```svelte
<!-- Note.svelte -->
<div class="col"><textarea class="s" aria-label="Note"></textarea></div>

<style>
  .col { width: 107px; }
  .s { display: block; inline-size: 100px; block-size: 40px; resize: none; }
</style>
```

```
$ npx veriss-svelte --viewport 400 --height 300 --resets all Note.svelte
Note.svelte: 21 branches (chromium, firefox, webkit × none, modern-normalize, normalize, sanitize, josh-comeau, tailwind-preflight, destyle)
  only in firefox × none, normalize (not decided in chromium:sanitize, …, webkit:destyle):
    Note.svelte:1  error    E_LAYOUT_ITEM_SIZE  .s requires 108px but receives 107px on inline axis at viewport 400px × 300px
        fix: give the box room (a flexible track, max-width: 100%, min-width: 0) or let it shrink
  not decided in chromium:sanitize, …, webkit:destyle: not checked: .s: a rule the analysis cannot read (its selector) may repaint it or an ancestor

1 error(s), 0 warning(s) across the branches; 2 branch(es) with an error; 9 branch(es) not decided
```

Firefox で、textarea の box を変えない reset(none と normalize.css)のときだけはみ出します。modern-normalize、Josh Comeau の reset は `box-sizing: border-box` で収め、sanitize.css・Preflight・destyle は、解析が読めない規則が textarea を塗り直しうるので決まっていません(合格ではない)。直すなら `box-sizing: border-box` か `max-inline-size: 100%` を `.s` に書きます。

知らないオプションは引数の誤り(終了コード 2)で、何も検査せずに、いちばん近い既知のオプションを示します:

```
veriss-svelte: unknown option --image; did you mean --images? (run with no files for the usage)
```

## コンパイルできないコンポーネント(`E_ADAPTER_COMPILE`)

コンパイラが拒否するコンポーネントはビルドできないので、その位置の `error` になります。checker は止まらず、残りのファイルも検査します。
Svelte 5 は `<p>` の中の `<div>` を拒否します(HTML の解析器が `<div>` の前で `<p>` を閉じるため。例: [ArticleMeta.svelte](../../examples/svelte/src/broken/ArticleMeta.svelte)):

```
src/broken/ArticleMeta.svelte:5:1  error    E_ADAPTER_COMPILE  the component does not compile (element_invalid_closing_tag_autoclosed): `</p>` attempted to close element that was already automatically closed by `<div>` (cannot nest `<div>` inside `<p>`); nothing else in it was checked
    fix: a <p> holds phrasing content only (text, <span>, <a>, <strong>, <img>…), so the HTML parser closes it before the <div>: make the <p> a <div> container, or make the <div> inside it a <span>
```

Svelte のコンパイルエラー、JSX / TSX の構文エラー(import した module の中のものはそのファイルで)、Vue SFC の解析エラーと
`<script setup>` の構文エラーが対象です。パーサーが立ち直れない Svelte と React では、そのファイルのほかの検査はしません
(「nothing else in it was checked」)。Vue の解析エラーは以前は info(`U_VUE_PARSE`)でしたが、今は error で、立ち直った
テンプレートは続けて検査します。

コンパイルの誤りでない例外は checker の不具合で、そのファイルの `W_LINT_ANALYSIS_FAILED`(warning)になり、残りのファイルは検査を
続けます。状態ごとの解析の例外も同じコードの warning になります。コンポーネントを添えて報告してください。

## package.json と CI

checker は glob を展開しません。シェルが展開した一覧を受け取ります。npm scripts は `sh` で動くので、`src/**/*.svelte` の
`**` は `*` と同じ 1 階層にしか当たりません(`src/App.svelte` も `src/a/b/C.svelte` も漏れる)。git の pathspec を使うと、
深さによらず全部を渡せます。

```json
{
  "scripts": {
    "lint:components": "veriss-svelte --viewport 320-1280 --images images.json $(git ls-files '*.svelte')"
  }
}
```

Linaria なら `veriss-linaria … $(git ls-files 'src/*.tsx')` です(pathspec の `*` は `/` にも当たるので、`src/` の下すべて)。
`git ls-files` が出すのは git に追加したファイルだけなので、手元で新しく作ったファイルは `git add` するまで検査されません。

GitHub Actions:

```yaml
name: components
on: [push, pull_request]
jobs:
  veriss:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run lint:components
```

終了コードが 1(error あり)なら job が落ちます。warning だけでは落ちません。warning でも落としたいなら、`--format json` の
出力を数えるスクリプトを挟みます。

```sh
npx veriss-svelte --format json $(git ls-files '*.svelte') | node -e 'const a = JSON.parse(require("fs").readFileSync(0, "utf8")); const n = a.filter(m => m.severity !== "info").length; console.log(`${n} error(s) and warning(s)`); process.exit(n ? 1 : 0)'
```

## 正しい構造へ導くルール

checker の指摘は、コンポーネントの境界、HTML の仕様、状態の間の配置について、書き手が守るべき構造を表しています。
指摘を消すために CSS を足すのではなく、指摘が求める構造に直します。

### コンポーネントのスコープ(`E_SCOPE_*`)

コンポーネントの CSS はコンポーネントの中で閉じている、というのが前提です。どの要素にどのスタイルが当たるかが、
コンポーネントの定義だけから決まるようにします([component-lint.md のスコープ](../component-lint.md#コンポーネントのスコープ))。

| コード | 書いてしまうもの | 直し方 |
|---|---|---|
| `E_SCOPE_ESCAPE` | Svelte / Linaria の `:global(…)` | 外の要素はそれを描くコンポーネントで塗る。テーマなどの文脈は prop(`class:dark={dark}`、`cx(a, dark && b)`)かカスタムプロパティで渡す。ページの reset は `--page-css` に渡すページの CSS に置く |
| `E_SCOPE_OUTSIDE` | Linaria の `.theme-dark &`(祖先や兄弟のクラスに頼る) | 同じく prop で状態にする。状態にすると、checker はその状態も検査する(例: `dark` の状態のコントラスト) |
| `E_SCOPE_REACHES` | Linaria の `& a`、`& > li` が、子のコンポーネントの描く要素に当たる | そのスタイルを子のコンポーネントに書く(子のクラスか variant の prop) |
| `E_SCOPE_GLOBAL` | コンポーネントのクラスを通らないセレクタ(Vue の通常の `<style>` など) | コンポーネントのクラスで選ぶ |
| `E_SCOPE_CONTRACT` | 子のコンポーネントのタグに付けた `data-noshift` | 子の中で宣言するか、自分の要素で包んでそこに付ける |

`E_SCOPE_*` には `W_CSS_SELECTOR_RELATION`(「テンプレートの構造とセレクタが合わない」)が並んで出ることが多く、同じ原因です。
直せば両方消えます。

Svelte はセレクタのすべての部分をスコープするので、`.theme-dark .panel` のような祖先のクラスは(`:global` なしでは)当たらず、
`E_SCOPE_OUTSIDE` ではなく未使用のセレクタ(`W_CSS_SELECTOR_*`)として出ます。

### HTML の仕様と内容モデル(`spec:` の warning)

マークアップだけで決まり描画には出ない仕様違反は、`spec:` で始まる warning です。今あるもの(`packages/adapter-core/src/lint.mjs`
の `specRules`):

- 内容モデル: `ul` / `ol` の直下の `li` 以外、`ul` / `ol` の外の `li`(`E_A11Y_LIST`)、`dl` の子(`E_A11Y_DL`)、role の親子関係
  (`E_A11Y_ROLE_CHILDREN`、`E_A11Y_ROLE_PARENT`)、入れ子の操作要素(`E_A11Y_NESTED_INTERACTIVE`、リンクの中のボタンなど)
- 属性: 存在しない ARIA 属性や値、role の必須属性、存在しない id への参照、id の重複、label の `for`、`autocomplete`、`lang`、
  `th` の `scope`
- HTML の解析で組み替わる構造(`<p>` の中の `<div>`、入れ子の `<a>`、`<form>` の中の `<form>`)は `W_HTML_RESTRUCTURED` ですが、
  これはソースの HTML の位置から判定するので、DOM API で木を組み立てる React には当たりません(下の「検出しないもの」)。
  Svelte では、Svelte のコンパイラ自身が `<p>` の中の `<div>` を拒否し、checker はそれを `E_ADAPTER_COMPILE`(error)として出します
  (上の「コンパイルできないコンポーネント」)。

内容モデルのルールは別の PR で増えています。一覧の文書ができたら、ここからリンクします。

### レイアウトシフトの契約(`data-noshift`)

状態が変わっても動いてはいけない要素に `data-noshift="名前"` を付けます。checker は状態どうしを、検査するすべての幅で比べます。

```svelte
<div class="canvas" data-noshift="canvas" data-noshift-on="saved"></div>
```

- `data-noshift-on="saved"`: `saved` だけが違う状態どうしを比べる(省略するとすべての組)。
- 動けば `E_LAYOUT_NOSHIFT`(error)。どの幅で、上・左・幅・高さのどれがいくつからいくつに変わるかが出る。
- どちらかの状態で箱が決まらないときは `U_LAYOUT_NOSHIFT`(not checked)。合格ではない。

直し方は、変わる中身の場所を先に確保する(固定のトラック、min-height)、重ねる(`position: absolute`)、契約を成り立つべき状態に
絞る(`data-noshift-on`)のどれかです。例: [SaveStatus.svelte](../../examples/svelte/src/broken/SaveStatus.svelte)。

### テキストの期待(`data-text-*`、`--font` と組み合わせる)

- `data-text-one-line`: そのテキストは 1 行に収まるはず。収まらない幅で `E_LAYOUT_CONTENT`。例: [PublishButton.svelte](../../examples/svelte/src/broken/PublishButton.svelte)。
- `data-text-max-length="16"`: 動的なテキスト(`{name}`)の最大文字数。その長さ以下のどの文字列でも収まるかを、最悪の幅で検査する。
  文字集合は `data-text-chars="…"`(既定は印字可能な ASCII)。`white-space: nowrap` か `data-text-one-line` が要る。
  最悪の文字列を探すので重い(この repository の Mac で、2 項目の `{#each}` のタグ 1 つに付けて 39 秒かかった)。
- props の型が文字列リテラルの union(`status: 'Active' | 'Pending review'`)なら、値ごとに状態を作って測る。

`--font` を渡さないと、テキストは測られず、これらの期待は検査されません(仮定として info に出ます)。

## 検出しないもの

例を作る中で、現実的な書き間違いのうち次のものは指摘されないか、別の形で出ました。checker の限界として知っておいてください。

- **React(Linaria)の `<p>` の中の `<div>`**: 何も出ない。React は DOM API で木を作るので `W_HTML_RESTRUCTURED` の対象外。
  実行時の React の警告(validateDOMNesting)とハイドレーションの不一致で気づくことになる。
- **配置が Unknown の部分の内容モデル**: `ul` の外の `li` の `E_A11Y_LIST` は、その部分の配置が解けたときにだけ出る。
  例の `TagList.svelte` は、タグの文字の箱に幅がない(`.text` の幅を消す)と `U_LAYOUT_FLEX`(not checked)になり、`E_A11Y_LIST` も
  消える(`E_A11Y_NAME` はマークアップから出る)。`not checked` が出ている部分は、内容モデルも見ていないと考える。
- **ルートが `<li>` のコンポーネント**: 単独で検査すると、ページに直接置いたものとして `E_A11Y_LIST`(`ul` / `ol` の外の `li`)が出る。
  親の `<ul>` の中で使うなら、その warning は置き場所による。`<li>` は親のコンポーネントに書き、子は `<li>` の中身を描くようにすると
  どちらのファイルも検査が通る(例の `Menu.tsx` と `MenuLink.tsx`)。
- **子のコンポーネントの中身**: 親のファイルでは見ない(`U_REACT_COMPONENT` / `U_SVELTE_*`)。子のファイルも checker に渡す。
- **ページの CSS の型セレクタ**: `--page-css` に `button, input, select, textarea { font: inherit }` を渡すと、コンポーネントに
  `input` などがなければ、その部分ごとに `W_CSS_SELECTOR_UNMATCHED`(warning)が出る。`html`、`body`、`*` で始まるセレクタと、
  `:where(…)` で包んだものは出ない。
- **行番号のない指摘**: Linaria の `E_SCOPE_ESCAPE` と `E_SCOPE_REACHES` は行番号なしで出る。クラスのない要素の指摘は、メッセージの
  箱の名前が空になる(`spec:  is a list item outside ul/ol`)。
