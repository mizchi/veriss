# 安全なサブセットは実ページの CSS をどれだけ覆うか(2026-11-28)

[safe-subset.md](../../docs/safe-subset.md) は「veriss が判定できる書き方」を書く側の規則にしたもの。この評価では、実際のページの
CSS がその規則にどれだけ収まるか、veriss が実際にどれだけ判定するかを測り、次に形式化する価値のある隙間を順位づける。

- 数字: [`evals/results/safe-subset-coverage/summary.json`](../results/safe-subset-coverage/summary.json)、表の全体は
  [`tables.md`](../results/safe-subset-coverage/tables.md)
- 道具: `tools/safe-subset-coverage.mjs`(入口)、`tools/corpus/capture.mjs`(コーパス)、`tools/subset-coverage.mjs`(測定)、
  `tools/subset-coverage-summary.mjs`(集計)。CI: `.github/workflows/safe-subset-coverage.yml`

> この版の数字は **ローカルで途中まで回した 45 / 65 ページ**(vlmkit 21、公開 24)のもの。重い測定は CI に移したので、
> 全ページの数字は CI の artifact で置き換える(末尾の「再現」)。静的な表のうち **セレクターの行は、この版では数え損ねている**
> (セレクターの並びを 1 つのセレクターとして読ませて失敗していた。直した道具は CI で回る)。宣言の行と動的な数字は影響を受けない。

## 結論

1. **実ページで veriss が判定できる要素はごくわずか**。390px で全要素の 2.2%(ページ平均 11.4%)、1280px で 2.9%(13.3%)。
   公開ページに限ると 1.5% / 2.7%。最初の 1 回で Unknown なしに判定できたページは 45 中 1 つ(vlmkit の pricing の型)だけ。
2. **ページを丸ごと止める理由が先に来る**。45 中 28 ページ(公開 24 中 23)で、CSS の 1 つのルールか at-rule がページ全体を Unknown にした。
   その大半は **@media の書き方**で、箱の配置とは関係がない:
   - `@media (min-width: 40em)` / `(width >= 40em)` / `(min-width: 37.5rem)`(em・rem の query): 8 ページ
   - `only screen and (…)`(`only` という語): 7 ページ
   - `(hover: hover)` / `(pointer: …)`: 8 ページ
   - `prefers-*` の規則がレイアウトを変える、または `(prefers-reduced-motion)` のような値のない形: 19 ページ
   - `@supports` の条件が対象ブラウザーで決まらない: 6 ページ、`@container` の em・rem の条件: 6 ページ
   これらは小さな最小例で再現した(下の「確かめた最小例」)。
3. **箱の段で多いのは、margin、中身で決まる大きさ、HTML の要素、解析の上限**。安全なサブセットの文書が既に「書くな」と言っているもの
   (float、段組、`border-*-radius` の角ごと、`mix-blend-mode`)は、実ページではほとんど効いていない(静的に 1.9% の宣言、動的にほぼ 0)。
4. **静的には宣言の 84% がサブセットの内**(in 54.8%、条件つき 29.1%)。外れの多くは文書が何も言っていない書き方(14.3%: `fr` の単位、
   `white-space: nowrap`、`vertical-align`、`text-wrap`、`min()` / `max()`、ベンダー接頭辞)で、文書が禁じる書き方(off)は 1.9%。
   つまり「規則に従わない CSS」より「規則がまだ書いていない CSS」と「規則の外の @media」が効いている。

## コーパス

[`evals/corpus/manifest.json`](../corpus/manifest.json) に各ページの出典、取得日、viewport(1280×900)、Chromium の版、ライセンスの注記、
スナップショットの sha256 がある。取得は `tools/corpus/capture.mjs`(`tools/corpus/sources.mjs` の一覧)。

| 群 | ページ | 内容 |
|---|---:|---|
| vlmkit | 31 | `examples/sites/*`(docs 3、shop、dashboard、magazine、checkout、kanban、gallery)、intro page、solitaire、`fixtures/css-challenge/*` 9、`fixtures/responsive-patterns/patterns/*` 11 |
| 公開 | 34 | 文書(MDN、Python、react.dev、Vite、Tailwind、Primer、MUI、Bootstrap、Rust book、GOV.UK Design System)、百科(Wikipedia)、ニュース・ブログ(HN、Cloudflare、GitHub blog、overreacted、danluu、CSS-Tricks、Smashing、GOV.UK)、EC(IKEA、Shopify Dawn、Bootstrap checkout)、ダッシュボード(shadcn、Bootstrap、Tabler、MUI)、LP(shadcn、Radix、Astro、Svelte、Node.js、Stripe、Linear、Vercel、MUI、Bootstrap album) |
| 除外 | 2 | W3C TR(bot 確認のページが返った)、demo.vercel.store(404)。robots.txt で拒否されたページはなかった |

- スナップショットは vlmkit の veriss bridge(`packages/vlmkit-markup/src/inspect/veriss-bridge.ts`)と同じ形: script 実行後の DOM、head は
  meta と title だけ、body の style / link / script は空の template に置き換え、作者のシートの本文を文書順に連結(media 属性は `@media` で包む)。
  所有要素のないシート(`@import` の先、constructed sheet)は先頭か末尾に置き、`unordered` に数を残した(bridge は解析しない。ここでは含めた)。
- 公開ページのスナップショットは第三者のコンテンツなのでコミットしない(`.gitignore`)。vlmkit のページ(MIT)だけを小さな見本として置く。

### 偏り

- vlmkit のページはエージェントが書いたデモと、意図的に壊した fixture。作者が veriss を知らない点は公開ページと同じだが、規模が小さく、
  1 つの CSS ファイルで、ライブラリを使わない。公開ページは逆に、Tailwind・Bootstrap・MUI などのフレームワークと、数百 KB〜1.8 MB の CSS が多い。
- 公開ページは英語のトップや代表ページを 1 枚ずつ。ログインの要る管理画面、日本語のページ、メールは含まない。tools/blocker-weights.mjs を
  最初に回した非公開の管理アプリ(44 ページ)とは性質が違う。
- 1280px で取得した DOM を両方の幅で解析した(幅で DOM を作り替えるページは、390px の DOM と違う)。
- テキストは寸法を仮定した(`assumeText`: 1 行 24px)。フォントファイルを渡していないので、テキストの折り返しは判定していない。

## 方法

### 静的(宣言・セレクター・at-rule の在庫)

すべてのルールを PostCSS で読み、宣言を css-tree で値の形(キーワード、単位、関数)に分け、safe-subset.md の各節の規則で
**in**(文書が勧める形)/ **cond**(文書が条件つきで許す形)/ **off**(文書が Unknown と言う、または書くなと言う形)/ **unlisted**(文書が何も言わない形)
に分類した。ルールの重みは、状態の擬似クラスと擬似要素を外したセレクター(上位集合、§9 と同じ考え)がスナップショットで当たる要素の数
(Chromium で `querySelectorAll`、ネットワークも script もなし)。要素に当たらないルールは「死んだルール」として別に数えた
(全ルール 71,795 のうち生きているのは 14,874 = 21%。公開ページは 19%)。

### 動的(veriss が判定する割合)

`tools/blocker-weights.mjs` の方法を広げた。adapter-core の `analyzeStates` を 390px(dpr 3)と 1280px(dpr 1)のそれぞれ一点の幅で、
`ua: 'chromium'`(取得したブラウザーの UA の値: body の 8px の margin、p の margin、フォーム部品)、`assumeText`、overlay スクロールバーで回し、

- Unknown が箱にあれば、その箱を中身ごと HTML から外し、外した要素をその理由に数える(blocker-weights と同じ)。
- Unknown が CSS のルールや at-rule にあり、ページ全体を止めているなら、そのルールを CSS から外して続ける。要素には数えず、
  「ページ全体を止めた」として、どのページで止めたかを記録する。
- どちらでもなければ、残りの要素をすべてその理由に数えて止める。

を判定されるまで繰り返す(最大 400 手、1 ページ 1 幅あたり 300 秒。超えたら残りを「手順の上限」に数える)。どの理由にも数えなかった要素が
「判定された要素」。2048 要素・64 段・1 MB を超えるページは、先に同じ形の兄弟の連なりを 3 つに切り(切った要素は「入力の上限」に数える)、
1 MB を超える CSS からは要素に当たらないルールを除いた。外すと親の配置が変わるので、数字は「どの理由がどれだけ止めているか」の見積もりで、
判定の証明ではない。

## 結果

### 動的: 判定された要素

| 幅 | 群 | ページ | 要素 | 判定された要素 | ページ平均 | 最後に判定 | 全体を止める理由が残る |
|---|---|---:|---:|---:|---:|---:|---:|
| 390px | 全体 | 45 | 39,998 | 862 (2.2%) | 11.4% | 29 | 16 |
| 390px | vlmkit | 21 | 4,428 | 339 (7.7%) | 21.2% | 19 | 2 |
| 390px | 公開 | 24 | 35,570 | 523 (1.5%) | 2.7% | 10 | 14 |
| 1280px | 全体 | 45 | 39,998 | 1,170 (2.9%) | 13.3% | 27 | 18 |
| 1280px | vlmkit | 21 | 4,428 | 204 (4.6%) | 21.9% | 16 | 5 |
| 1280px | 公開 | 24 | 35,570 | 966 (2.7%) | 5.7% | 11 | 13 |

「最後に判定」は剥がし終えたあと verified / violated になったページ。判定まで行っても、残る要素は少ない(Wikipedia 6,473 要素のうち 7、
Cloudflare blog 1,141 のうち 108)。外す箱の多くが中身の大きい容器だからで、**一番外側に近い 1 つの Unknown が、その下の全部を道連れにする**。

### ページ全体を止める理由(CSS の段)

1 つでページ全体を Unknown にする理由。ページ数は 45 ページ中(1280px。390px もほぼ同じ)。

| # | 系統 | ページ(公開) | 例 | 形式化の重さ |
|---:|---|---:|---|---|
| 1 | `prefers-*` の規則がレイアウトを変える / 値のない `(prefers-reduced-motion)` / size と混ぜた preference query | 19 (15) | `@media (prefers-reduced-motion: reduce) { .x { margin: 0 } }` | 中: 枝を足すか、レイアウトに効く宣言だけを分ける |
| 2 | `@media (hover)` / `(pointer)` | 8 (8) | `@media (hover: hover) { … }` | 安い: preference と同じく「描画だけなら可、レイアウトなら枝」 |
| 3 | `@media` の em・rem | 8 (7) | `(min-width: 40em)`, `(width>=48em)`, `(min-width:37.5rem)` | **安い**: media query の em / rem は初期値(16px)で解決する(ルートの font-size を変えても変わらない) |
| 4 | `@media` の `only` | 7 (7) | `only screen and (max-width: 767px)` | **最も安い**: `only` は古いブラウザー向けの語で、意味は `screen and …` と同じ |
| 5 | セレクター(状態の後の `~`、`::placeholder` を含む `:is()`、`:placeholder-shown`、`:link`、`::selection`) | 13 (10) | `.input:focus ~ .label`, `:is(.x *)::placeholder` | 中〜重 |
| 6 | `@supports` が対象ブラウザーで決まらない | 6 (6) | `@supports (-webkit-touch-callout: none)`, `(color: oklch(…))` | 安い〜中: 描画だけの宣言を包む `@supports` は配置に関係しない |
| 7 | `@container` の em・rem・範囲 | 6 (2) | `@container (min-width: 24rem)` | 安い(3 と同じ解決) |
| 8 | その他の @media(`(color-gamut: p3)`、`not all and (…)`、`)and (` の空白なし) | 5 (5) | | 安い(`color-gamut` は描画だけ) |
| 9 | 描画・字形だけのプロパティを配置の Unknown にする | 5 (2) | `text-rendering: optimizeLegibility`, `letter-spacing: Nrem`, `scroll-padding-top: calc(…)` | **安い**: `text-rendering` と `scroll-padding` は配置を変えない |

#### 確かめた最小例

`html,body{margin:0} .a{display:block;width:100px;height:10px}` に `@media <query> { .a { width: 50px } }` を足し、320〜1280px で解析した結果
(ルートの font-size を 62.5% にしても同じ)。

| query | 結果 |
|---|---|
| `(min-width: 600px)`, `screen and (min-width: 600px)`, `screen`, `print`, `(orientation: landscape)` | verified |
| `(min-width: 40em)`, `(width >= 40em)`, `(min-width:37.5rem)` | Unknown(`Unsupported media condition`) |
| `only screen and (min-width: 600px)`, `only screen` | Unknown |
| `(hover: hover)`, `(hover: none)` | Unknown |
| `(prefers-reduced-motion)`, `not (prefers-reduced-motion)` | Unknown(値のない形) |
| `(prefers-reduced-motion: reduce)` でレイアウトを変える | Unknown(`Preference media rules may only change paint and animation`) |

同じ条件(`ua: 'chromium'`、`defaultFontSize: 16`)で、箱の段の理由も最小例で確かめた。

| 入力 | 結果 |
|---|---|
| block の中の `div { margin-top: 10px }` | verified(作者の px の margin は判定する) |
| `h2 { margin: 0 0 16px } p { margin: 0 }` | verified |
| `<p>` を UA の margin のまま | Unknown: `margin-top: 1em needs a px font-size to resolve (font-size is medium)`。`defaultFontSize: 16` を渡しても `medium` が px にならない |
| `<ul>` を UA の margin のまま | Unknown: `Reset native block margins explicitly before block checking`(ua profile に ul の margin がない) |
| `<figure>` | Unknown: `Native or foreign element needs a size adapter: figure` |
| `body { text-rendering: optimizeLegibility }` | Unknown(body で止まるので、ページ全体) |
| `html { scroll-padding-top: calc(1rem + 2rem) }` | Unknown(html で止まるので、ページ全体) |

### 箱の段で止める理由(系統、1280px)

score は各ページで止めた要素の割合の和(10 ページで半分ずつ止めれば 5)。要素の重みとページ数の両方を持つ。

| # | 系統 | score | 止めた要素 | ページ | 主な理由 |
|---:|---|---:|---:|---:|---|
| 1 | 解析の上限 | 7.4 | 7,894 | 16 | `An element has more than N custom-property bindings`(Tailwind v4・MUI・Primer の設計トークン)、`Combined layout analysis work limit exceeded` |
| 2 | 中身で決まる大きさ | 6.0 | 960 | 14 | 素の `1fr` の列に中身で決まる最小幅の item、`flex-basis: auto` の中のテキスト、flex item の自動の最小サイズ |
| 3 | margin | 6.0 | 5,250 | 23 | `Reset native block margins explicitly`(ul などの UA の margin)、空になりうる箱の margin の相殺、親を突き抜ける margin、`em` の margin で font-size が `medium` / % |
| 4 | HTML の要素・属性 | 3.1 | 3,516 | 20 | `<center>`、`<figure>`、`<pre>`、カスタム要素(`astro-island`, `slider-component`)、寸法のない viewBox つき svg |
| 5 | テキストの性質 | 2.2 | 1,678 | 8 | `line-break: strict`(vlmkit の shop と magazine)、`text-wrap: pretty`、`word-break: auto-phrase`、`font-variant-numeric` |
| 6 | 入力の上限 | 2.1 | 9,811 | 5 | 2048 要素を超えるページ(Wikipedia、MDN、IKEA、Tabler、Linear) |
| 7 | min() / max() / clamp() と長さ | 1.6 | 396 | 7 | `max(24px, calc((100vw - 1120px) / 2))`、`calc(… + env(safe-area-inset-bottom))`、`minmax(Nrem, Nfr)` |
| 8 | grid | 1.4 | 962 | 5 | 列を明示しない grid の子、整数でない repeat、grid-row で置いた item |
| 9 | 表 | 1.3 | 253 | 5 | `border-collapse: collapse` と枠線、表の自動配置 |
| 10 | inline 整形 | 1.1 | 1,029 | 17 | block の中の inline-level の箱(`inline-flex` のボタン、バッジ)、baseline、`vertical-align: middle` |
| 11 | 絶対配置・sticky・fixed | 0.8 | 363 | 3 | 静的位置の軸の margin、clip する祖先 |
| 12 | 擬似要素 | 0.7 | 76 | 1 | 箱を作る `::before` |
| 13 | テキストと子要素の混在 | 0.5 | 220 | 12 | `*` のあるページの匿名の箱 |

inline 整形はページ数(17)の割に score が低い。1 つずつは小さな箱(ボタン、バッジ)で、外しても周りが判定されるから。
逆に margin と解析の上限は、外側の容器や html で起きるので大きい。

### 静的: 文書の節ごとの被覆

生きているルールの宣言(レイアウトとテキストのプロパティ)56,589 個を、当たる検査のうち一番悪い判定で数えた。

| 群 | in | cond | unlisted | off |
|---|---:|---:|---:|---:|
| 全体 | 54.8% | 29.1% | 14.3% | 1.9% |
| vlmkit | 64.5% | 27.5% | 6.5% | 1.5% |
| 公開 | 53.1% | 29.3% | 15.6% | 1.9% |

節ごとの主なもの(使うページ数 / 45、触れる要素のページ平均):

- **§1 箱の並べ方**: `display: flex` 40 ページ、`inline-flex`(cond)31 ページで要素の 11%、`position: absolute`(cond)35 ページ、
  start 以外の揃え(cond)41 ページ。素の `fr`(cond)26 ページ、`minmax(0, Nfr)`(in)28 ページ。**float と段組は実質ゼロ**。
  `display: -webkit-box` などのベンダー値が 5 ページ(Bootstrap 系)。
- **§2 寸法**: `var()`(cond)が 34 ページで要素の 54% に当たる。単位は px・rem・%・em で大半。文書にない単位は `fr`(35 ページ)、
  `lh`(5)、`pt`(4)、`ch`(9)。`min()` 12 ページ、`max()` 7 ページ、`clamp()` は少ない。`fit-content` などのキーワード 23 ページ。
- **§3 テキスト**: `line-height` は px / 数値が大半。em・rem・%・`var()` の line-height(off)は 5〜7 ページで少数。`white-space: nowrap` 34 ページ、
  `vertical-align` 26 ページ、`text-wrap: balance / pretty` 14 / 11 ページは文書に記述がない。
- **§4 border**: 角ごとの radius(off)15 ページ、要素の 0.3%。`border-image` 2 ページ。
- **§5 状態**: 状態の後の結合子(off)28 ページ、状態以外の状態でレイアウトを変える(off)12 ページ、`:has()` に状態 9 ページ
  (この版はセレクターを数え損ねているので少なめ。CI の版で置き換える)。
- **§6 擬似要素**: `::-webkit-scrollbar`(off)10 ページ、`scrollbar-width`(in)12 ページ。
- **§7 HTML**: `<br>` 12 ページ、`<hr>` 10 ページ(off)。表は 14 ページ。
- **§8 使えない CSS**: SVG の `stroke-*` 8 ページ、`mix-blend-mode` 8 ページ、`scale(0)` 5 ページ。どれも触れる要素は 0.5% 未満。
- **文書にない at-rule**: `@media (hover)` 16 ページ、`@supports` 18 ページ、`@media (forced-colors)` 10 ページ、`@container` 15 ページ、
  `@starting-style` 3 ページ。safe-subset.md は @media の書き方を何も規定していない。

静的に「in」でも動的に止まる例が多い。素の `1fr` や `flex-basis: auto` は文書どおり cond(中身の最小幅が定数なら判定)だが、
実ページでは中身の最小幅がほとんど定数にならない。逆に文書の off(float、`mix-blend-mode`)は、静的に少なく、動的にもほぼ出ない。

## 順位: 次に形式化するもの

ページを止める数 × 止める要素で並べ、形式化の重さを付けた。

| # | 隙間 | 効き | 重さ | 何をするか |
|---:|---|---|---|---|
| 1 | `@media` の `only`、em / rem、`)and (`、`not all and` | 7〜8 ページを丸ごと止める | **安い** | query の構文を広げる。em / rem は 16px(媒体特性の初期値)で解決。ブラウザーの `matchMedia` で照合する e2e を足す |
| 2 | 描画だけの性質(`text-rendering`、`scroll-padding-*`、`color-gamut`、`@supports` で描画だけを包む) | 5 + 6 ページを丸ごと止める | **安い** | 「配置を変えない」の一覧に入れる。3 ブラウザーで箱が同じことを測る |
| 3 | `(hover)` / `(pointer)` / 値のない preference query | 8 + 19 ページ | 安い〜中 | preference と同じ扱い(描画だけなら可)にし、値のない形を `: reduce` などに正規化。レイアウトを変える規則は、既存の状態の枝(hover した状態の再配置)と同じく枝を作る |
| 4 | custom property の束縛数の上限・解析の作業量の上限 | 16 ページ、要素の 20% | 中 | Tailwind v4・MUI のトークン(1 要素に数百の `--*`)。使われない束縛を遅延して解決する、作業量の上限を見直す |
| 5 | UA の block margin(ul、figure、pre などと、`font-size: medium` の上の `1em`) | 12〜13 ページ(公開 12)、ほかに `medium` の em が 8 ページ | **安い**(medium)〜中(profile) | `font-size: medium` を `defaultFontSize` で解決する。`ua: 'chromium'` の profile に、body と p のほかリスト・figure・pre・blockquote の margin を足す(reset-matrix と同じ測り方) |
| 6 | margin の相殺(空の箱、親を突き抜ける上の margin) | 6〜8 ページ、大きな容器で起きる | 重 | block flow の margin collapsing の一部(親子の上端、空の箱)を形式化 |
| 7 | 中身で決まる最小幅(素の `1fr`、`flex-basis: auto`、flex item の自動の最小サイズ) | 14 ページ、vlmkit で特に多い | 重 | min-content の計算を葉のテキスト(フォントの寸法つき)と px の箱から上へ伝える。文書は `minmax(0, 1fr)` と `min-width: 0` を勧め続ける |
| 8 | 2048 要素の上限 | 5 ページ(大きな文書) | 中 | 繰り返しを 1 つの型として扱う、上限を上げる。測定ではページの一部しか見られない |
| 9 | inline 整形(block の中の inline-flex / バッジ / `vertical-align`) | 17 ページだが箱は小さい | 重 | I22 の外(2 つ以上並ぶ、中央寄せ)の行の配置 |
| 10 | `<figure>` / `<pre>` / `<center>` / カスタム要素 | 20 ページ | 安い〜中 | figure と pre は UA の margin と `white-space` を持つ block。カスタム要素は `display: inline` の既定(作者の CSS がなければ) |

float・段組・角ごとの radius・`mix-blend-mode` は、文書が既に禁じていて、実ページでもほとんど使われない。形式化を急ぐ理由はない。

## 書く側に勧めること(safe-subset.md に足す候補)

- `@media` は px で書く(`(min-width: 768px)`)。`only` を書かない。em / rem のブレークポイントは、veriss が対応するまで px に直す。
- `@media (hover: hover)` と `prefers-*` の中では、色・影・transition だけを変える。レイアウトを変えるなら状態のセレクター(`:hover`)で書く。
- `text-rendering`、`scroll-padding` は(今は)ページ全体を止める。必要なら html にだけ書くのでも同じなので、対応までは外す。
- 見出し・リスト・figure の margin は reset で明示的に 0 にするか、値を書く(`h1 { margin: 0 0 16px }`)。
- 文書の §8 の表は実ページでほとんど効かない。代わりに、上の @media の規則を §8 か新しい節(at-rule)に書くと、実ページでの効きが大きい。

## 再現

```sh
# ローカルの見本(数秒)
VLMKIT_DIR=~/ghq/github.com/mizchi/vlmkit node tools/safe-subset-coverage.mjs --out test-results/safe-subset-coverage \
  --set local --only vlmkit-responsive-hero,vlmkit-responsive-pricing
# 全体(CI: Actions → safe-subset-coverage → Run workflow)
node tools/safe-subset-coverage.mjs --out <dir> --vlmkit <checkout> --set all --jobs 4 --budget 120000
```

出力は `<dir>/coverage.json`(ページごと、約 20 MB)、`summary.json`、`tables.md`、`corpus/manifest.json`。終了コードは測定が走れば 0
(被覆の数字は報告で、gate ではない)。公開ページは robots.txt の `*` の群に従い、1 ページずつ、既定 3 秒の間隔で取得する。
