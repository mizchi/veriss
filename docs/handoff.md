# 引き継ぎ(2026-11-25)

isle から切り出した CSS 検証器(veriss)を、別のマシンで続けて開発するための文書。今どこにいて、何をどう続けるか。

## 今どこにいるか

- `main` に全部入っている(このセッションの作業も)。isle は veriss を git 依存で使う利用者になった(isle の `package.json` の `@mizchi/veriss` が commit を指す)
- **実ページの Unknown を減らす(2026-11-24〜25、PR #19〜#37)**: CSS-in-JS の管理画面の実ページ(44 ページ)に veriss を当て、
  止まりどころを 1 つずつ潰した。チェックリストの I1〜I18。自分で書く側の規約は [安全なサブセット](safe-subset.md)
  - 誤検出を直した: keyframes 名の大文字・小文字、辺ごとの border の一括指定、caret、`*` の擬似要素のリセット(1 万 7 千件 → 0)
  - Unknown を箱ごとにした: 未対応の宣言・セレクター・入力の段の問題が当たる箱だけを Unknown にし、ページ全体を止めない
  - 判定できるようにした: flex の container の absolute の子、% の幅の flex item と px の max-width(中央寄せの容器)、clip する祖先の中の
    containing block、折り返すテキストの `word-break: break-all`(Chromium の組の表)、配置を変える `:active`(押した状態で配置し直す)、
    `:has()` の中の `>` と子孫の結合子、`border-image: none`、block の流れの中の `width: fit-content` / `min-content` / `max-content`
  - mizchi/css の border の幅の誤りを見つけて直した(0.8.3)。オラクルは 0.8.3 を使い、border の全形式を比べる
  - 止まりどころの重みは `tools/blocker-weights.mjs` で測る(下の「次にやること」)
- **コンポーネントの CSS を中に閉じる(PR #33)**: コンポーネントの CSS がコンポーネントの外の要素に当たらないこと(外向き)を、
  `E_SCOPE_GLOBAL`(ページ全体に効く CSS で、どの compound にも固有のクラスがない)・`E_SCOPE_REACHES`・`E_SCOPE_OUTSIDE`・
  `E_SCOPE_ESCAPE` で保証する。styled-components にもスコープを付け、`createGlobalStyle` は escape。[component-lint.md](component-lint.md)
- **押せない部品の検査(2026-11-23〜24、PR #14・#15)**: 覆い(見えない層、stacking context に閉じ込められた z-index、`filter`)、`inert`、
  端末の safe area とヒンジ、fixed の箱の viewport 外。チェックリストの H1〜H20。端末のプロファイル(StatCounter・Playwright・手で書いた safe area)は
  [docs/devices.md](devices.md)。safe area とヒンジの照合は Chromium の DevTools Protocol でしかできない(Firefox・WebKit は未照合)
- **幅の測定(`frAutoMinimums`)の抜け**: PR #10・#11 と #14 のレビューで、測れないもの(流れの中の擬似要素、`aspect-ratio` の子孫、閉じた
  `details`、1 行に並ぶ inline-level の兄弟、`max-width` が掛かったままの base)を 0 や誤った値として使う型の抜けを直した。どれも Unknown にした。
  18 通りの子の形を 3 ブラウザーと比べる調べで、verified の値はすべて一致(残る抜けは見つかっていない)
- **静的検査のパターン**: [docs/static-check-checklist.md](static-check-checklist.md) に F1〜F133。カテゴリごとの進み具合と残りの観点は [TODO.md](../TODO.md)(89 / 90)
  - F26 の見逃しを直した(PR #2): 補われた tbody をセレクタの途中で飛ばす `.t > .r > td` も報告する(3 ブラウザーで照合済み)
  - F126 の健全性の修正: `clip` の横のスクロール値で `clip` が `hidden` になるのは Firefox・WebKit だけ(Chromium 156 は `clip`)。解析は Unknown
  - F133: container のない軸の `cqw` / `cqh` は `svw` / `svh` になる
  - 保留: F91(段組の外の `break-*`。印刷を対象にするか未決)、F95(`li{display:flex}` でマーカーが消える。警告の条件が未決)
  - 見送り(実測したら効いていた): flex の `text-indent`、`perspective`、表のセルの `max-width`
  - 健全性の修正: F89(`calc(100%-10px)` を 100%−10px として計算していた)、F99(引用符のない不正な `font-family` を適用していた)
- **モジュール分割**: [ADR-0016](adr/0016-module-decomposition.md)。M1〜M7 が済み、M8 から
  - M1 `src/color/`(色の数学。依存なし)
  - M2 `test/module-boundaries.test.mjs`(import の向きの検査)
  - M3 構文の段の結果を `notes[]` に(`src/rules/syntax-notes.mjs` が文言)
  - M4 捨てた宣言を `style.$dropped[]` に(`src/layout/dropped.mjs`)
  - M5 CSS の誤りの検査を `src/rules/css-mistakes.mjs` の `createCssMistakes({ report, facts, tools })` に
  - M6 効かない宣言の判定を `src/rules/inert-declarations.mjs` に(layout は親の display・flow の中かを渡すだけ)。style の検査は 1 本の walk(全 box・全 state)。所見の集合の差分は `tools/finding-set/`
  - M7 コントラストを `src/rules/contrast.mjs` に。レイアウトが Unknown のときも style の段の行で判定し、`W_A11Y_CONTRAST_UNPLACED`(警告)を出す
- **座標計算サブセット L1**: [ADR-0018](adr/0018-coordinate-subset.md)。Grid と Flex(row・nowrap)の座標を、engine から独立した
  Z3 の仕様(`models/layout/spec.mjs`)として定義し直した。engine の領域ごとの式と幅の範囲全体で一致(`tests/layout-spec.test.mjs`)、
  3 ブラウザーとランダムな設定で一致(`e2e/layout-spec.spec.mjs`)。次の段は TODO.md の「座標計算サブセット L1」
- **CLS の壊れた例**: `models/layout/shift-cases.mjs`(壊れた 12、正しい 6)。2 つの状態を同じ幅で Z3 に解かせ(`shift.mjs`)、
  3 ブラウザーで確かめた(`e2e/layout-shift.spec.mjs`)
- **クリティカル CSS**: `packages/veriss/src/critical.mjs`([docs/critical-css.md](critical-css.md))。engine の `sizes` の行に `display`
  と `float` を足した(block コンテナは内部で 1 列の grid として配置するが、行には block と書く)
- **文字幅の型**: [ADR-0019](adr/0019-text-width-type.md)。`models/text/width.mjs` の `textWidth` が、総称の family を OS × ブラウザーの
  表(`system-fonts.mjs`)で解決し、E2E の記録(`linux-widths.json`、`tools/text-widths.mjs`)か MoonBit の値 ± 許容で区間にする。
  L1 の Flex の仕様で、文字の min-content を区間の中の変数にした。parley(`tools/parley-widths`、Rust)は MoonBit と同じ値を出した
- **Lean**: `models/lean/`(Lean 4.36、elan で入れた。Mathlib なし)。L1 の定義・性質の証明(`sorry` なし)・oracle。`tests/lean-oracle.test.mjs` は Lean がない環境では飛ばす
- **検査ルール一覧**: [docs/rule-catalog.md](rule-catalog.md)(Web 版 https://mizchi.github.io/veriss/、README からリンク)。約 420 のコードを
  13 の役割に分け、「検査可 / 一部 / 仕様のみ / 差を報告 / Unknown」を表にし、役割ごとに NG / OK の実例の画像(`docs/rule-catalog/*.png`)を付けた
  - 実例は `tools/rule-catalog/examples.mjs`。`run.mjs all` で判定、`shoot.mjs` で画像、`build-page.mjs <出力先>` で Web 版
  - main に push すると `.github/workflows/pages.yml` が Pages に出す(画像は CI では作らない。例を変えたら手元で作り直して commit)
  - 新しい検査を足したら、一覧の役割の表にも行を足す
- **実験**: [experiments/style-language/](../experiments/style-language/README.md)(ADR-0014・0015 の構文案 A〜E と、今の veriss での扱い)

## 始め方

```sh
git clone https://github.com/mizchi/veriss && cd veriss
pnpm install
npx playwright install chromium firefox webkit   # e2e は 3 ブラウザで測る
tools/gate.sh                                     # push の前に毎回。20〜30 分かかる(eval が長い)
```

- ブラウザーが既定の場所にないときは `PLAYWRIGHT_BROWSERS_PATH` を指定する
- 1 つのパターンだけの e2e: `npx playwright test -c playwright.layout.config.mjs --trace off e2e/layout-css-mistakes.spec.mjs -g F106 --project=chromium --project=firefox --project=webkit`
- 解析器の読み方を見る: `node tools/probe.mjs '<css>' ['<html>']`
- 宣言が効くかを 3 ブラウザで比べる: `node tools/browser-diff.cjs '<css>' '<css + 宣言>' '<html>'`

## パターンを足す手順

1. 候補を 3 ブラウザで実測する(`tools/browser-diff.cjs`)。**中身と条件を変えて何通りも測る**(1 文字のセルで差が出ず、効く宣言を候補にしたことがある)。対照(効く場合)も一緒に測り、比較が空振りでないことを確かめる
2. 解析器の今の扱いを見る(`tools/probe.mjs`)。verified なのに値がブラウザーと違えば健全性のバグ(最優先)
3. 単体テストを先に書く(`packages/veriss/test/css-mistakes.test.mjs`)。落ちることを確かめる
4. 実装する。置き場所は検査の種類で決まる:
   - 宣言が文法上不正でブラウザーが捨てる → `css.mjs` の宣言の読み込みで `note('W_…', {...})` して宣言を捨て、`src/rules/syntax-notes.mjs` に文言を足す
   - computed style を作るときに捨てる(効かないので解に入れない) → `css.mjs` で `drop(values, reason, property, value)`、文言は `src/rules/css-mistakes.mjs`
   - box と祖先の style から判る → `src/rules/css-mistakes.mjs`(必要な事実は `createCssMistakes` の引数で受ける)
   - 判定できない値は **Unknown のまま**(成功に変えない)
5. e2e(`e2e/layout-css-mistakes.spec.mjs`)、新しいコードなら `packages/adapter-core/src/lint.mjs` の説明、チェックリストの行、TODO.md の観点を更新
6. `tools/gate.sh` が通ったら commit して push

## 次にやること

- **実ページの Unknown**: 止まりどころは 1 ページに何段も重なっていて、ページ単位では直した効果が見えない。`tools/blocker-weights.mjs` で
  箱単位の重みを測る(Unknown の箱を中身ごと外して解析し直し、外した要素の数を理由ごとに数える)。CSS-in-JS の管理画面 44 ページ
  (約 2 万要素、Noto Sans JP を `--font` で渡した)の上位(2026-11-25、I17 まで入った main):

  | 割合 | ページ | 理由 |
  |---|---|---|
  | 16.7% | 34 | 中身で大きさの決まる flex item の中に、幅の書かれていない img・フォーム部品(#40) |
  | 12.1% | 25 | `CSS max size clamping is not modeled`(max-width の掛かる箱の種類が足りない。#41) |
  | 9.9% | 10 | 0 でない inline 方向の margin(`margin: 0 -24px` で表をページの padding まで広げる) |
  | 9.6% | 31 | inline-flex の箱の内容幅。block の中に inline-level の箱が 1 つだけある形で、親のフォントの strut が要る(#42) |
  | 9.1% | 26 | 解析の作業量の上限(`U_LAYOUT_LIMIT`) |
  | 7.7% | 3 | テキストと子要素の混在 |
  | 7.6% | 9 | `border-collapse: collapse` で border のある表 |
  | 4.2% | 2 | `text-box`(ボタンの中の `text-box: cap alphabetic`) |

  - 外していくと 44 ページ中 19 ページが判定まで進み、25 ページは外せない Unknown(ページ全体のものなど)で止まった
  - 表は #37(fit-content)の前に測った。#37 で減った分は測り直していない
  - **この表は数え方の誤りで歪んでいた**(I20 で直した): アダプターが付けるクラス(`__text0`・`__ph0`)のせいで外す箱を見つけられず、
    ページの残り全部をその理由に数えていた。直した数え方で測り直すと(2026-11-26、I20 の branch)、44 ページ中 41 ページが判定まで
    進み、上位は max size clamping 19.9%・inline-flex の内容幅 16.3%・作業量の上限 14.2%・0 でない inline margin 11.2%・
    `border-collapse` 8.4%。#40 の理由は 0.7%(ロゴの img 41 か所。高さ % で幅が画像ファイルの比で決まる。それと幅 auto の
    text input 14 か所。どちらも Unknown が正しい。チェックリスト I20)
  - 続き: `width: fit-content; margin: 0 auto` の中央寄せ(#39)。各 issue に 3 ブラウザーの実測値と止まる文言を書いてある
  - 自分で書く側の規約は [安全なサブセット](safe-subset.md)。Unknown の原因を潰すたびに、サブセットの「書いてよい形」へ移す

- **eval の基準**: `evals/results/component-lint/` は Chromium 156(Playwright 1.64.1)で記録した。結果の `browser` が記録した版。別の版では文字の組み方の差で狭い幅の判定が動くので、gate で eval が変わったら、まず `browser` の行(gate が並べて出す)を見る
- **M6 の残り**: layout が style を書き換えて報告する inert(% の高さ → auto、block flow の auto の上下 margin → 0、block flow の grid 配置)と inline の box の効かない寸法は engine に残る。`solve` の正規化(`$blockFlow`・`$inertMain`・`$anonymousGridText`)を style の段に出せれば、規則に移せる
- **M7 の残り**: 状態・placeholder・欄の境界・文中リンク・フォーカスの輪郭の色の規則は、状態の幾何を読むので `accessibility.mjs` に残る。アイコンのコントラストは、制御の名前を幾何の行から読むので、レイアウトが Unknown のときは走らない
- **M8**: a11y を DOM の規則と幾何の規則に分ける。integrity と CLS も規則にする
- **M9**: 境界テストの許可が空になったら `packages/` に分ける
- **パターン**: TODO.md の残りの観点(色の関数の不正、`@supports` / `@layer` / `@font-face` / `@property`、`<col>`、`letter-spacing`、3D の transform、フォーム部品の差、重複した `id`、`:has()` の中の状態、ブラウザー差の測り方)
- **isle から移す候補(未移動)**:
  - `models/css_layout/`、`models/layout_contract/`(Z3 検査・契約検査を照合する独立した SMT 仕様)。isle のテストが読んでいる。veriss に置くなら `packages/veriss` の外では isle から読めないので、置き場所と isle のテストの参照を一緒に決める
  - `tests/types/css-verifier.mts`(veriss の型定義の検査)。veriss に TypeScript の検査を入れてから
  - isle の `package.json` が veriss の API を `@isle/prototype/layout/*` として公開し直している。残すか、利用者に veriss を直接使ってもらうか

## 落とし穴

### 開発環境と gate

- worktree に `node_modules` をシンボリックリンクでつながない。worktree で pnpm を動かすと、元の作業ツリーの `node_modules/.pnpm/node_modules`
  のリンクがその worktree 基準に張り替えられ、worktree を消すと壊れる(react-adapter のテストが `@babel/plugin-syntax-jsx` を見失った)。
  worktree ごとに `pnpm install --frozen-lockfile` する
- `tools/gate.sh` は Node 24 の `ℹ fail` を数えるようになった(以前は `# fail` だけで、単体テストの失敗を見落としていた)。root の 2 件
  (MoonBit の文字幅の較正、"compared 0")はこの環境で main でも落ちる
- gate の既知の失敗(main でも同じ): root の 2 件のほか、e2e の F119(Firefox)と F130(Chromium)。component-lint の eval は
  320〜375px の見出しの行が動くことがある(`evals/results/component-lint/` を `git restore` で戻し、コミットに混ぜない)
- ゲートの実行中に作業ツリーを変えると、結果がどの版のものか分からなくなる。ゲートの間はツリーの外(一時ディレクトリ)で準備する
- `css-mistakes.test.mjs` は 1 ファイルで 20 秒以上かかる(止まっているのではない)
- ブラウザーが Playwright の期待する場所にない環境(クラウドのセッションなど)では、e2e も `tools/eval-component-lint.mjs` も起動の時点で
  失敗する(「Executable doesn't exist」。eval は結果を書かないので、`git status evals/` だけ見ると変わっていないように見える)。
  e2e は `launchOptions.executablePath` を設定した一時の config で、eval は `chromium.launch` を差し替える `node --import <フック>` で回す
- a11y の e2e は `evals/results/layout-accessibility/` を書き換える(コミット済みの `report.json` は古い)。コミットに混ぜない
- 複数の PR が同じ箇所(チェックリストの末尾の「残り」の直前)に書き足すと、毎回そこが衝突する。git の rerere は以前の解き方を
  黙って再適用し、片方の記述を落とした。この repo では rerere を切ってある。解いたら必ず中身を確かめる
- この環境の `git diff` は外部の diff(difftastic)を通すので、出力はパッチにならない。パッチを取るときは `git diff --no-ext-diff`
- pnpm の git 依存では `workspace:*` が解決しない(内部パッケージは peerDependencies `*`)。`font_ffi.js` のビルド結果は `.gitignore` の否定でコミットしている

### ブラウザーでの実測と e2e

- e2e の F26 のように「ブラウザーで当たらない」と「警告が出る」を 1 つの印で比べる表には、「当たらないが警告も出ない」組
  (tbody を書いた表の `.t > .r > td`)を入れられない。そういう対照は単体テストに置く
- 撮影(`tools/rule-catalog/shoot.mjs`)でページを使い回すと、前の撮影のホバーやフォーカスが残る。撮影ごとに新しいページを開く
- Playwright の `setContent` はページのグローバルを持ち越す: script の `const` はブロックで包む
- WebKit の `::selection` の基準には `::selection{--z:1}` の規則が要る。canvas は描かれるのを待ってから撮る
- div を `display: list-item` にしてもマーカーは箱の左外に描かれて写らない(`ul > li` で比べる)。グラデーションは固有の大きさがないので `list-style-image` の対照に使えない(SVG の data URL を使う)
- `perspective` は none 以外でスタッキングコンテキストを作る。`text-wrap` はショートハンドで `text-wrap-mode` を wrap に戻す(`nowrap` の後に `text-wrap: balance` を書くと折り返しが戻る)
- quirks モード(doctype なし)の WebKit は単位のない長さを px として受ける。解析は標準モードを前提にする
- フォントを使う e2e: `setContent` の about:blank からは相対 URL のフォントを読めない(route したオリジンに `goto` する)。
  `document.fonts.ready` は読み込みが始まる前に解決することがあるので、`[...document.fonts].map(f => f.load())` を待つ。
  日本語は `<meta charset="utf-8">` と `text/html; charset=utf-8` を付ける(付けないと文字化けした行数を測る)
- Playwright の `expect(a).toBe(b)` の失敗表示は Expected が b、Received が a。モデルとブラウザーのどちらを a にしたかで読み違えやすい

### 実ページ

- 描画したページを CSSOM から取り出すと、ブラウザーは一括指定を書き出し直す(border: none → border-width: medium; border-style: none; border-color: currentcolor; border-image: none)。実ページの照合はソースの CSS と形が違う
- 動くページ(JS あり)で宣言を外して比べると、遅延して読まれるフォント(unicode-range で分割した web フォント)や再描画で画素が変わる。取り出したスナップショットを静的に開き、document.fonts.ready を待ってから比べる。角の数画素(差 1〜2)は描画のゆらぎ
- engine は最初の Unknown で配置を打ち切り、`sizes` を返さない。「判定できた箱の数」は直接数えられないので、
  `tools/blocker-weights.mjs` は Unknown の箱を中身ごと HTML から外して解析し直すのを繰り返し、外した要素の数を理由ごとに数える(見積もり)
- 診断の `path`(`P/0/3/…`)は要素の子の番号。P が html、P/0 が body で、head は数えない
- 実ページのテキストの寸法: unicode-range で分割した web フォント(Noto Sans JP の約 120 個の woff2)はそのまま渡せない。google/fonts の
  完全版(`text-metrics/fixtures/sources.json` の出典と同じ)を `--font` に渡す

## isle との関係

- isle は veriss を `github:mizchi/veriss#<commit>&path:packages/veriss` で使う。veriss を変えたら、isle の pin を上げて isle の照合テスト(`just css-verifier-check`、`just css-text-check`)を回す
- isle に残るのは isle の利用者側だけ: テンプレート → 箱の木(`lib/layout*`)、vite のビルド、`.isle` の例と eval、isle の構文(`layout SafeGrid { ... }`、`@noshift`)の文書
