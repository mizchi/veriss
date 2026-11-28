# veriss の開発

ユーザーには日本語で答える。

veriss は、CSS と DOM(HTML、box tree、コンポーネントの状態)から、すべての viewport 幅にわたる配置・アクセシビリティ・
CSS の書き間違いを、ページを描かずに静的に検査するライブラリ。[mizchi/isle](https://github.com/mizchi/isle) はその利用者の一つ。

## 原則

- 健全さを最優先する。未対応、被覆不足、上限超過、timeout、ブラウザーで違う挙動は Unknown にし、成功へ変えない。
- 警告(W_*)を足すときは、Chromium・Firefox・WebKit で実測してから入れ、`e2e/` に同じ判定を比べる検査を置く。
  ブラウザーで結果が違うものは報告しないか Unknown にする。解析を Unknown にしたうえで、違うこと自体を
  知らせる警告(どのブラウザーがどうするかを `browsers` に書く。例: F105 `W_LAYOUT_ALIGN_BROWSER_DEPENDENT`)は出してよい。
- 候補は中身と条件を変えて何通りも測る。効く場合(対照)も一緒に測り、比べた結果が空振りでないことを確かめる。
- 新しい検査は `docs/static-check-checklist.md` に、何を測ったかと一緒に書く。
- `packages/veriss/src/` は Isle、ProgramIR、compiler、playwright を import しない(`tests/veriss-package.test.mjs`)。
- TDD で進める。探索 → Red → Green → Refactoring。

## 続けるとき

- 今どこにいて何を続けるかは `docs/handoff.md`、残りの観点は `TODO.md`、モジュールの分け方は `docs/adr/0016-module-decomposition.md`。
- 検査の置き場所: 文法の誤り → `css.mjs` の `note()` と `src/rules/syntax-notes.mjs`。捨てる宣言 → `css.mjs` の `drop()`。
  box の style から判る誤り → `src/rules/css-mistakes.mjs`。`src/rules/` と `src/color/` は段(`src/layout/`)を import しない
  (`packages/veriss/test/module-boundaries.test.mjs`)。

## ツールと検証

- push の前に `tools/gate.sh`(既定は全 package の単体テストだけ。1 分ほど)。ブラウザーの e2e と component-lint の eval は PR の CI
  (`.github/workflows/ci.yml`: 単体テスト、テストごとに切った e2e の shard、fuzz の固定 regressions、eval を attempt ごとに)で回る。
  seed つきの fuzz は毎日 `fuzz.yml` で回り、結果は https://mizchi.github.io/veriss/fuzz/ 。macOS は毎週、被覆は手動。
  どこで何が走るかは `docs/handoff.md` の「どこで何が走るか」。重い検査(ブラウザーの e2e 全体、fuzz)を手元の Mac で回さない
- `node tools/probe.mjs '<css>'` で解析器の読み方を、`node tools/browser-diff.cjs '<css>' '<css + 宣言>' '<html>'` で 3 ブラウザーの差を見る。

- Node.js 24+、pnpm 12。`pnpm install --frozen-lockfile` が通る状態を保つ。
- `pnpm test`: すべての package の単体テスト。`pnpm test:e2e -- --project chromium|firefox|webkit`: ブラウザーとの照合。
- `packages/veriss/text-metrics` と `oracle` は MoonBit(`pnpm build:text-metrics`、`pnpm build:oracle`)。text-metrics の
  build 出力(`font_ffi.js`)は git 依存の利用者のために commit しておく。変えたら作り直して commit する。
- 利用者(isle)は `github:mizchi/veriss#<commit>&path:packages/veriss` で依存する。package 間の依存は peerDependencies
  (workspace 内では devDependencies の `workspace:*`)にする。git 依存では `workspace:` が解決できない。
