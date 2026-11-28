### 動的: 判定された要素の割合

| 幅 | 群 | ページ | 要素 | 判定された要素 | ページ平均 | 1 回目で判定 | 剥がして判定 | 全体を止める Unknown が残る |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| 390px | all | 45 | 39998 | 862 (2.2%) | 11.4% | 1 | 29 | 16 |
| 390px | vlmkit | 21 | 4428 | 339 (7.7%) | 21.2% | 1 | 19 | 2 |
| 390px | public | 24 | 35570 | 523 (1.5%) | 2.7% | 0 | 10 | 14 |
| 1280px | all | 45 | 39998 | 1170 (2.9%) | 13.3% | 1 | 27 | 18 |
| 1280px | vlmkit | 21 | 4428 | 204 (4.6%) | 21.9% | 1 | 16 | 5 |
| 1280px | public | 24 | 35570 | 966 (2.7%) | 5.7% | 0 | 11 | 13 |

### 隙間の系統(390px、score = 各ページで止めた要素の割合の和)

| # | 系統 | score | 止めた要素 | ページ | 公開ページ | ページ全体を止めた | 出現 |
|---:|---|---:|---:|---:|---:|---:|---:|
| 1 | 解析の上限(custom property の束縛数・作業量) (`analysis-limit`) | 7.85 | 8255 (20.6%) | 14 | 14 | 5 | 112 |
| 2 | margin(auto・%・相殺・UA 既定) (`margin`) | 5.80 | 5237 (13.1%) | 23 | 14 | 2 | 298 |
| 3 | 中身で決まる大きさ(intrinsic) (`intrinsic-content`) | 5.24 | 710 (1.8%) | 13 | 0 | 0 | 77 |
| 4 | HTML の要素・属性 (`element`) | 3.03 | 3508 (8.8%) | 18 | 14 | 1 | 62 |
| 5 | grid(トラック・配置) (`grid`) | 2.47 | 719 (1.8%) | 7 | 2 | 0 | 7 |
| 6 | テキストの性質(改行・字形) (`text-property`) | 2.29 | 1684 (4.2%) | 8 | 1 | 6 | 34 |
| 7 | 入力の上限(2048 要素・64 段・1 MB) (`input-bound`) | 2.08 | 9811 (24.5%) | 5 | 5 | 0 | 5 |
| 8 | その他 (`other`) | 1.91 | 2766 (6.9%) | 8 | 7 | 3 | 48 |
| 9 | min() / max() / clamp() と長さ (`math-function`) | 1.90 | 668 (1.7%) | 7 | 5 | 0 | 14 |
| 10 | 剥がし手順の上限 (`step-limit`) | 1.64 | 1702 (4.3%) | 5 | 5 | 5 | 5 |
| 11 | 表 (`table`) | 1.34 | 253 (0.6%) | 5 | 3 | 0 | 5 |
| 12 | inline 整形(行の中の箱) (`inline-formatting`) | 1.01 | 1025 (2.6%) | 16 | 15 | 0 | 356 |
| 13 | 絶対配置・sticky・fixed (`positioned`) | 0.88 | 619 (1.5%) | 6 | 3 | 0 | 8 |
| 14 | 擬似要素 (`pseudo`) | 0.68 | 76 (0.2%) | 1 | 0 | 0 | 12 |
| 15 | その他のセレクター (`selector-other`) | 0.66 | 579 (1.4%) | 8 | 5 | 7 | 3554 |
| 16 | 未対応のプロパティ(その他) (`unsupported-property`) | 0.57 | 1300 (3.3%) | 6 | 3 | 3 | 35 |
| 17 | テキストと子要素の混在 (`text-mixed`) | 0.49 | 220 (0.6%) | 12 | 7 | 1 | 93 |
| 18 | 画像・置換要素 (`image`) | 0.03 | 3 (0.0%) | 2 | 0 | 0 | 3 |
| 19 | フォーム部品 (`form-control`) | 0.01 | 1 (0.0%) | 1 | 0 | 0 | 1 |
| 20 | @media の利用者設定(prefers-*) (`preference-query`) | 0.00 | 0 (0.0%) | 19 | 15 | 19 | 10734 |
| 21 | @media (hover) / (pointer) (`media-hover-pointer`) | 0.00 | 0 (0.0%) | 8 | 8 | 8 | 11489 |
| 22 | その他の @media / @supports (`media-query-other`) | 0.00 | 0 (0.0%) | 5 | 5 | 5 | 3047 |
| 23 | 状態のセレクター (`state-selector`) | 0.00 | 0 (0.0%) | 6 | 6 | 6 | 459 |
| 24 | @media の em / rem (`media-em-unit`) | 0.00 | 0 (0.0%) | 8 | 7 | 8 | 11619 |
| 25 | @media の only (`media-only`) | 0.00 | 0 (0.0%) | 7 | 7 | 7 | 2222 |
| 26 | @container (`container-query`) | 0.00 | 0 (0.0%) | 6 | 2 | 6 | 234 |
| 27 | @supports(対象ブラウザーで決まらない条件) (`supports`) | 0.00 | 0 (0.0%) | 6 | 6 | 6 | 3326 |

#### 理由の上位 25(390px)

| score | 要素 | ページ | 止めた | 理由 |
|---:|---:|---:|---:|---|
| 3.90 | 4398 | 4 | 4 | `U_LAYOUT_LIMIT An element has more than N custom-property bindings` |
| 3.24 | 3411 | 9 | 0 | `U_LAYOUT_LIMIT Combined layout analysis work limit exceeded` |
| 2.70 | 818 | 6 | 1 | `U_LAYOUT_CSS .x may be empty, so its own margins would collapse together; that margin collapsing is not modeled` |
| 2.35 | 2399 | 13 | 0 | `U_LAYOUT_GEOMETRY Reset native block margins explicitly before block checking` |
| 2.17 | 260 | 4 | 0 | `U_LAYOUT_GRID_FR .x a bare fr column (minmax(auto, fr)) has an item (.x , display: flex) whose min-content width is not modeled; its minimum` |
| 2.08 | 9811 | 5 | 0 | `BOUND more than 2000 elements or 60 levels (input cut to fit)` |
| 2.00 | 1645 | 2 | 2 | `U_LAYOUT_GEOMETRY Unsupported layout property: line-break (strict changes line breaking, which is not modeled)` |
| 1.64 | 1702 | 5 | 5 | `STEPS more than 400 peel steps or 300s` |
| 1.47 | 607 | 5 | 0 | `U_LAYOUT_GEOMETRY In-flow Grid children require explicit supported columns` |
| 1.10 | 176 | 2 | 0 | `U_LAYOUT_GRID_FR .x a bare fr column (minmax(auto, fr)) has an item placed by grid-row; its minimum is not known` |
| 1.06 | 119 | 9 | 0 | `U_LAYOUT_FLEX .x its content has text without a max-content width (.x give it a maxInlineSize contract); its content width is not known (giv` |
| 1.00 | 1803 | 1 | 1 | `U_LAYOUT_HTML HTML parse recovery: control-character-in-input-stream` |
| 1.00 | 584 | 1 | 1 | `U_LAYOUT_SCROLLBAR Body overflow propagation requires explicit overflow on html; set html overflow to auto or hidden` |
| 1.00 | 777 | 1 | 0 | `U_LAYOUT_ELEMENT Native or foreign element needs a size adapter: center` |
| 0.93 | 27 | 1 | 0 | `U_LAYOUT_GEOMETRY Use a bounded integer grid repeat` |
| 0.86 | 25 | 1 | 0 | `U_LAYOUT_GEOMETRY Unsupported CSS pixel length: minmax(Nrem, Nfr)` |
| 0.82 | 27 | 1 | 0 | `U_LAYOUT_TABLE border-collapse: collapse with a border on .x is not modeled (shared borders)` |
| 0.72 | 283 | 1 | 0 | `U_LAYOUT_CSS Unsupported CSS pixel length: calc(Npx + Npx + env(safe-area-inset-bottom))` |
| 0.71 | 446 | 1 | 1 | `U_ADAPTER_ANALYSIS the analysis of this state failed: Ambiguous layout contracts for .x` |
| 0.69 | 2000 | 1 | 1 | `U_LAYOUT_CSS @-moz-document nested in h1.x is not modeled` |
| 0.66 | 579 | 3 | 2 | `U_LAYOUT_SELECTOR Unsupported selector: .x` |
| 0.65 | 72 | 1 | 0 | `U_LAYOUT_PSEUDO .x generates a box that may change the layout (only text in a px-sized leaf, or included in the leaf's measured text, is mod` |
| 0.64 | 638 | 14 | 0 | `U_LAYOUT_INLINE .x is inline-level inside the block container .x its line layout is not modeled (give it display: block, or make .x a grid o` |
| 0.57 | 1293 | 1 | 0 | `U_LAYOUT_CSS Unsupported contain: content (it changes line breaking, shaping, containing blocks or paint, which are not modeled)` |
| 0.55 | 78 | 1 | 0 | `U_LAYOUT_FLEX The automatic minimum size of a flex item depends on its content; set min-height, or make it a scroll container` |

### 隙間の系統(1280px、score = 各ページで止めた要素の割合の和)

| # | 系統 | score | 止めた要素 | ページ | 公開ページ | ページ全体を止めた | 出現 |
|---:|---|---:|---:|---:|---:|---:|---:|
| 1 | 解析の上限(custom property の束縛数・作業量) (`analysis-limit`) | 7.38 | 7894 (19.7%) | 16 | 13 | 7 | 116 |
| 2 | 中身で決まる大きさ(intrinsic) (`intrinsic-content`) | 6.02 | 960 (2.4%) | 14 | 0 | 0 | 93 |
| 3 | margin(auto・%・相殺・UA 既定) (`margin`) | 5.96 | 5250 (13.1%) | 23 | 14 | 2 | 302 |
| 4 | HTML の要素・属性 (`element`) | 3.07 | 3516 (8.8%) | 20 | 14 | 1 | 70 |
| 5 | テキストの性質(改行・字形) (`text-property`) | 2.24 | 1678 (4.2%) | 8 | 1 | 6 | 32 |
| 6 | 入力の上限(2048 要素・64 段・1 MB) (`input-bound`) | 2.08 | 9811 (24.5%) | 5 | 5 | 0 | 5 |
| 7 | その他 (`other`) | 1.91 | 2764 (6.9%) | 8 | 7 | 3 | 47 |
| 8 | 剥がし手順の上限 (`step-limit`) | 1.64 | 1701 (4.3%) | 5 | 5 | 5 | 5 |
| 9 | min() / max() / clamp() と長さ (`math-function`) | 1.63 | 396 (1.0%) | 7 | 5 | 0 | 13 |
| 10 | grid(トラック・配置) (`grid`) | 1.38 | 962 (2.4%) | 5 | 2 | 0 | 12 |
| 11 | 表 (`table`) | 1.34 | 253 (0.6%) | 5 | 3 | 0 | 5 |
| 12 | inline 整形(行の中の箱) (`inline-formatting`) | 1.05 | 1029 (2.6%) | 17 | 15 | 0 | 359 |
| 13 | 絶対配置・sticky・fixed (`positioned`) | 0.79 | 363 (0.9%) | 3 | 2 | 0 | 5 |
| 14 | flex (`flex`) | 0.73 | 647 (1.6%) | 1 | 1 | 0 | 1 |
| 15 | 擬似要素 (`pseudo`) | 0.68 | 76 (0.2%) | 1 | 0 | 0 | 12 |
| 16 | 未対応のプロパティ(その他) (`unsupported-property`) | 0.58 | 1304 (3.3%) | 7 | 3 | 3 | 36 |
| 17 | テキストと子要素の混在 (`text-mixed`) | 0.49 | 220 (0.6%) | 12 | 7 | 1 | 93 |
| 18 | フォーム部品 (`form-control`) | 0.03 | 3 (0.0%) | 2 | 0 | 0 | 3 |
| 19 | 画像・置換要素 (`image`) | 0.01 | 1 (0.0%) | 1 | 0 | 0 | 1 |
| 20 | その他のセレクター (`selector-other`) | 0.00 | 0 (0.0%) | 7 | 4 | 7 | 3553 |
| 21 | @media の利用者設定(prefers-*) (`preference-query`) | 0.00 | 0 (0.0%) | 19 | 15 | 19 | 10734 |
| 22 | @media (hover) / (pointer) (`media-hover-pointer`) | 0.00 | 0 (0.0%) | 8 | 8 | 8 | 11489 |
| 23 | その他の @media / @supports (`media-query-other`) | 0.00 | 0 (0.0%) | 5 | 5 | 5 | 3047 |
| 24 | 状態のセレクター (`state-selector`) | 0.00 | 0 (0.0%) | 6 | 6 | 6 | 459 |
| 25 | @media の em / rem (`media-em-unit`) | 0.00 | 0 (0.0%) | 8 | 7 | 8 | 11619 |
| 26 | @media の only (`media-only`) | 0.00 | 0 (0.0%) | 7 | 7 | 7 | 2222 |
| 27 | @container (`container-query`) | 0.00 | 0 (0.0%) | 6 | 2 | 6 | 234 |
| 28 | @supports(対象ブラウザーで決まらない条件) (`supports`) | 0.00 | 0 (0.0%) | 6 | 6 | 6 | 3326 |

#### 理由の上位 25(1280px)

| score | 要素 | ページ | 止めた | 理由 |
|---:|---:|---:|---:|---|
| 3.90 | 4398 | 4 | 4 | `U_LAYOUT_LIMIT An element has more than N custom-property bindings` |
| 3.24 | 3412 | 9 | 0 | `U_LAYOUT_LIMIT Combined layout analysis work limit exceeded` |
| 2.70 | 818 | 6 | 1 | `U_LAYOUT_CSS .x may be empty, so its own margins would collapse together; that margin collapsing is not modeled` |
| 2.30 | 2398 | 12 | 0 | `U_LAYOUT_GEOMETRY Reset native block margins explicitly before block checking` |
| 2.08 | 9811 | 5 | 0 | `BOUND more than 2000 elements or 60 levels (input cut to fit)` |
| 2.00 | 1645 | 2 | 2 | `U_LAYOUT_GEOMETRY Unsupported layout property: line-break (strict changes line breaking, which is not modeled)` |
| 1.87 | 153 | 12 | 0 | `U_LAYOUT_FLEX .x its content has text without a max-content width (.x give it a maxInlineSize contract); its content width is not known (giv` |
| 1.64 | 1701 | 5 | 5 | `STEPS more than 400 peel steps or 300s` |
| 1.43 | 199 | 4 | 0 | `U_LAYOUT_GRID_FR .x a bare fr column (minmax(auto, fr)) has an item (.x , display: flex) whose min-content width is not modeled; its minimum` |
| 1.31 | 38 | 2 | 0 | `U_LAYOUT_GEOMETRY Unsupported CSS pixel length: minmax(Nrem, Nfr)` |
| 1.10 | 176 | 2 | 0 | `U_LAYOUT_GRID_FR .x a bare fr column (minmax(auto, fr)) has an item placed by grid-row; its minimum is not known` |
| 1.00 | 1803 | 1 | 1 | `U_LAYOUT_HTML HTML parse recovery: control-character-in-input-stream` |
| 1.00 | 584 | 1 | 1 | `U_LAYOUT_SCROLLBAR Body overflow propagation requires explicit overflow on html; set html overflow to auto or hidden` |
| 1.00 | 777 | 1 | 0 | `U_LAYOUT_ELEMENT Native or foreign element needs a size adapter: center` |
| 0.82 | 27 | 1 | 0 | `U_LAYOUT_TABLE border-collapse: collapse with a border on .x is not modeled (shared borders)` |
| 0.82 | 321 | 1 | 0 | `U_LAYOUT_FLEX The automatic minimum size of a flex item depends on its content; set min-height, or make it a scroll container` |
| 0.74 | 286 | 3 | 0 | `U_LAYOUT_SUBGRID Intrinsic row contributions across subgrids or row spans are not modeled; use independently sized parent rows` |
| 0.73 | 647 | 1 | 0 | `U_LAYOUT_FLEX An item whose automatic minimum depends on its content would shrink; set an explicit minimum or flex-shrink: N` |
| 0.69 | 2000 | 1 | 1 | `U_LAYOUT_CSS @-moz-document nested in h1.x is not modeled` |
| 0.67 | 640 | 15 | 0 | `U_LAYOUT_INLINE .x is inline-level inside the block container .x its line layout is not modeled (give it display: block, or make .x a grid o` |
| 0.65 | 72 | 1 | 0 | `U_LAYOUT_PSEUDO .x generates a box that may change the layout (only text in a px-sized leaf, or included in the leaf's measured text, is mod` |
| 0.57 | 1293 | 1 | 0 | `U_LAYOUT_CSS Unsupported contain: content (it changes line breaking, shaping, containing blocks or paint, which are not modeled)` |
| 0.56 | 587 | 4 | 0 | `U_LAYOUT_GEOMETRY In-flow Grid children require explicit supported columns` |
| 0.56 | 80 | 1 | 0 | `U_LAYOUT_FLEX .x its content has an item whose width is N%; its content width is not known (give it a px width or flex-basis)` |
| 0.50 | 10 | 1 | 0 | `U_LAYOUT_CSS .x is position: sticky; only top: N under the page scroll (no scrolling or clipping ancestor) is modeled, for the accessibility` |

### 静的: 生きている宣言の判定(最悪の判定で数える)

| 群 | 生きているルール / 全ルール | 生きている宣言 | in | cond | unlisted | off | セレクター in / cond / unlisted / off |
|---|---:|---:|---:|---:|---:|---:|---|
| all | 14874 / 71795 | 56589 | 54.8% | 29.1% | 14.3% | 1.9% | 12587 / 0 / 1912 / 375 |
| vlmkit | 1732 / 1982 | 6130 | 64.5% | 27.5% | 6.5% | 1.5% | 1612 / 0 / 104 / 16 |
| public | 13142 / 69813 | 50459 | 53.1% | 29.3% | 15.6% | 1.9% | 10975 / 0 / 1808 / 359 |

#### 節 1

| 書き方 | 判定 | 使うページ(公開) | 生きている出現 | 触れる要素(ページ平均) |
|---|---|---:|---:|---:|
| `display: inline-flex` | cond | 31 (18) | 184 | 11.2% |
| `display: flex` | in | 40 (23) | 864 | 10.6% |
| `alignment other than start` | cond | 41 (23) | 1024 | 10.1% |
| `display: block` | in | 38 (24) | 466 | 7.5% |
| `position: relative` | in | 33 (23) | 527 | 5.9% |
| `position: absolute` | cond | 35 (23) | 491 | 5.0% |
| `display: inline-block` | cond | 28 (22) | 209 | 3.7% |
| `form control` | cond | 39 (24) | 1003 | 3.3% |
| `display: none` | in | 36 (23) | 467 | 3.2% |
| `inline <svg>` | cond | 28 (22) | 1460 | 2.9% |
| `display: grid` | in | 36 (19) | 192 | 2.5% |
| `flex basis given` | in | 31 (21) | 186 | 1.5% |
| `grid columns: minmax(0, Nfr)` | in | 28 (13) | 127 | 1.3% |
| `flex-basis: auto (content size)` | cond | 18 (14) | 111 | 1.1% |
| `display: -ms-flexbox` | unlisted | 4 (4) | 135 | 0.8% |
| `display: -webkit-box` | unlisted | 5 (5) | 137 | 0.8% |
| `display: -webkit-flex` | unlisted | 3 (3) | 134 | 0.8% |
| `grid columns: bare fr` | cond | 26 (16) | 109 | 0.8% |

#### 節 2

| 書き方 | 判定 | 使うページ(公開) | 生きている出現 | 触れる要素(ページ平均) |
|---|---|---:|---:|---:|
| `value uses var()` | cond | 34 (23) | 7525 | 53.6% |
| `unit px` | in | 45 (24) | 4345 | 46.8% |
| `unit rem` | in | 30 (22) | 2839 | 14.7% |
| `unit %` | in | 38 (24) | 1364 | 10.5% |
| `unit lh` | unlisted | 5 (5) | 5 | 8.9% |
| `unit em` | in | 33 (22) | 815 | 6.7% |
| `calc()` | in | 29 (22) | 964 | 6.0% |
| `unit fr` | unlisted | 35 (19) | 260 | 1.9% |
| `unit pt` | unlisted | 4 (4) | 88 | 1.9% |
| `value uses attr()` | unlisted | 6 (5) | 7 | 1.6% |
| `intrinsic size keyword` | unlisted | 23 (18) | 117 | 1.0% |
| `<img>` | cond | 21 (20) | 586 | 1.0% |
| `unit vw` | in | 18 (14) | 121 | 0.8% |
| `unit vh` | in | 22 (14) | 52 | 0.4% |
| `min()` | unlisted | 12 (6) | 37 | 0.3% |
| `unit mm` | unlisted | 2 (2) | 8 | 0.2% |
| `max()` | unlisted | 7 (7) | 25 | 0.2% |
| `unit ch` | unlisted | 9 (7) | 26 | 0.1% |

#### 節 3

| 書き方 | 判定 | 使うページ(公開) | 生きている出現 | 触れる要素(ページ平均) |
|---|---|---:|---:|---:|
| `line-height: px / number` | in | 40 (24) | 556 | 15.4% |
| `white-space: nowrap` | unlisted | 34 (23) | 162 | 5.2% |
| `vertical-align ≠ baseline` | unlisted | 26 (22) | 169 | 3.3% |
| `text-wrap: pretty` | unlisted | 11 (6) | 29 | 1.3% |
| `text-wrap: balance` | unlisted | 14 (9) | 33 | 0.9% |
| `text mixed with non-phrasing children` | cond | 28 (21) | 267 | 0.7% |
| `line-height: other (Nem)` | off | 5 (5) | 24 | 0.6% |
| `line-height: other (Nrem)` | off | 7 (6) | 31 | 0.5% |
| `line-height: other (N%)` | off | 2 (2) | 4 | 0.5% |
| `line-height: other (var(--line-height,var(--default-line-height)))` | off | 1 (1) | 1 | 0.4% |
| `line-height: other (calc(Nem + Nvw))` | off | 1 (1) | 4 | 0.4% |
| `line-height: other (var(--tw-leading,var(--text-sm--line-height)))` | off | 3 (3) | 10 | 0.3% |
| `line-height: other (Npt)` | off | 2 (2) | 6 | 0.2% |
| `line-height: other (calc(N + N / var(--font-body-scale)))` | off | 1 (1) | 21 | 0.2% |
| `line-height: other (calc(var(--height) - Npx))` | off | 1 (1) | 1 | 0.2% |
| `line-height: other (var(--tw-leading,var(--text-base--line-height)))` | off | 3 (3) | 3 | 0.2% |
| `line-height: other (var(--skapa-line-height,N))` | off | 1 (1) | 2 | 0.1% |
| `line-height: other (var(--tw-leading,var(--text-sm--line-height,calc(N / N))))` | off | 1 (1) | 10 | 0.1% |

#### 節 4

| 書き方 | 判定 | 使うページ(公開) | 生きている出現 | 触れる要素(ページ平均) |
|---|---|---:|---:|---:|
| `border-radius shorthand` | in | 44 (23) | 843 | 26.3% |
| `per-corner border-*-radius` | off | 15 (14) | 70 | 0.3% |
| `border-image` | off | 2 (2) | 6 | 0.0% |

#### 節 5

| 書き方 | 判定 | 使うページ(公開) | 生きている出現 | 触れる要素(ページ平均) |
|---|---|---:|---:|---:|
| `unparsed selector` | unlisted | 44 (24) | 1912 | 81.5% |
| `other state rule that changes layout` | off | 12 (10) | 27 | 4.6% |
| `hover/focus/active rule that changes layout` | cond | 21 (19) | 133 | 2.2% |
| `state before a combinator` | off | 28 (22) | 211 | 1.7% |
| `two states in one compound` | off | 7 (7) | 58 | 0.5% |
| `:has() down the tree` | in | 7 (7) | 38 | 0.1% |
| `:has() with a state` | off | 9 (9) | 69 | 0.0% |
| `:has() with a later + / ~` | off | 0 (0) | 0 | 0.0% |

#### 節 6

| 書き方 | 判定 | 使うページ(公開) | 生きている出現 | 触れる要素(ページ平均) |
|---|---|---:|---:|---:|
| `scrollbar-width` | in | 12 (12) | 34 | 4.5% |
| `::-webkit-scrollbar` | off | 10 (10) | 34 | 2.3% |
| `::-webkit-scrollbar-thumb` | off | 7 (7) | 12 | 2.2% |
| `::-webkit-scrollbar-track` | off | 4 (4) | 6 | 2.2% |
| `scrollbar-gutter` | in | 3 (3) | 3 | 0.0% |
| `::-webkit-scrollbar-corner` | off | 1 (1) | 1 | 0.0% |

#### 節 7

| 書き方 | 判定 | 使うページ(公開) | 生きている出現 | 触れる要素(ページ平均) |
|---|---|---:|---:|---:|
| `<td>` | unlisted | 14 (7) | 821 | 3.7% |
| `<th>` | unlisted | 13 (6) | 169 | 0.8% |
| `<table>` | unlisted | 14 (7) | 46 | 0.2% |
| `<br>` | off | 12 (12) | 151 | 0.2% |
| `<col>` | off | 1 (0) | 24 | 0.1% |
| `<hr>` | off | 10 (10) | 25 | 0.1% |
| `<iframe>` | cond | 5 (5) | 20 | 0.0% |
| `<colgroup>` | off | 1 (0) | 8 | 0.0% |
| `<canvas>` | cond | 2 (2) | 3 | 0.0% |
| `width/height attribute on a non-media element` | off | 1 (1) | 3 | 0.0% |
| `<video>` | cond | 2 (2) | 2 | 0.0% |

#### 節 8

| 書き方 | 判定 | 使うページ(公開) | 生きている出現 | 触れる要素(ページ平均) |
|---|---|---:|---:|---:|
| `SVG stroke-* in CSS` | off | 8 (5) | 80 | 0.5% |
| `mix-blend-mode` | off | 8 (8) | 17 | 0.1% |
| `pointer-events: SVG value` | off | 3 (3) | 3 | 0.0% |
| `transform: scale(0)` | off | 5 (4) | 5 | 0.0% |

#### 節 at-rule

| 書き方 | 判定 | 使うページ(公開) | 生きている出現 | 触れる要素(ページ平均) |
|---|---|---:|---:|---:|
| `@layer` | in | 9 (9) | 703 | 0.0% |
| `@media (width)` | in | 6 (6) | 370 | 0.0% |
| `@media range syntax` | in | 6 (6) | 375 | 0.0% |
| `@container` | cond | 15 (10) | 270 | 0.0% |
| `@supports` | unlisted | 18 (18) | 580 | 0.0% |
| `@media (prefers-reduced-motion)` | cond | 26 (19) | 466 | 0.0% |
| `@media (scripting)` | unlisted | 1 (1) | 1 | 0.0% |
| `@media (hover)` | unlisted | 16 (16) | 398 | 0.0% |
| `@media (min-width)` | in | 29 (21) | 3131 | 0.0% |
| `@media (max-width)` | in | 36 (21) | 1041 | 0.0% |
| `@media type only (print)` | in | 13 (13) | 648 | 0.0% |
| `@media (forced-colors)` | unlisted | 10 (10) | 176 | 0.0% |
| `@media (prefers-color-scheme)` | cond | 13 (10) | 90 | 0.0% |
| `@media (pointer)` | unlisted | 8 (8) | 65 | 0.0% |
| `@media (orientation)` | unlisted | 3 (3) | 24 | 0.0% |
| `@starting-style` | unlisted | 3 (3) | 4 | 0.0% |
| `@media (-ms-high-contrast)` | unlisted | 4 (4) | 47 | 0.0% |
| `@media type only (screen)` | in | 4 (4) | 39 | 0.0% |

#### 節 other

| 書き方 | 判定 | 使うページ(公開) | 生きている出現 | 触れる要素(ページ平均) |
|---|---|---:|---:|---:|
| `vendor property` | unlisted | 29 (23) | 2733 | 29.0% |
| `container-type` | cond | 12 (7) | 25 | 0.4% |
| `contain: paint` | unlisted | 2 (2) | 2 | 0.0% |
| `contain: layout style` | unlisted | 1 (1) | 2 | 0.0% |
| `content-visibility: auto` | unlisted | 2 (2) | 3 | 0.0% |
| `contain: unset` | unlisted | 2 (2) | 2 | 0.0% |
| `content-visibility: unset` | unlisted | 2 (2) | 2 | 0.0% |
| `contain: content` | unlisted | 1 (1) | 1 | 0.0% |
| `content-visibility: hidden` | unlisted | 0 (0) | 0 | 0.0% |
| `content-visibility: visible` | unlisted | 0 (0) | 0 | 0.0% |
| `contain: layout` | unlisted | 0 (0) | 0 | 0.0% |
| `contain: size` | unlisted | 0 (0) | 0 | 0.0% |
| `contain: layout paint` | unlisted | 0 (0) | 0 | 0.0% |
| `contain: var(--tw-contain-size,) var(--tw-contain-layout,) var(--tw-contain-paint,) var(--tw-contain-style,)` | unlisted | 0 (0) | 0 | 0.0% |
| `contain: layout paint size` | unlisted | 0 (0) | 0 | 0.0% |

#### 節 css-variables

| 書き方 | 判定 | 使うページ(公開) | 生きている出現 | 触れる要素(ページ平均) |
|---|---|---:|---:|---:|
| `custom property definition` | in | 34 (23) | 15489 | 23.6% |

#### セレクターの機能(生きているルール)

| 機能 | 使うページ(公開) | 生きている出現 | 触れる要素(ページ平均) |
|---|---:|---:|---:|
| `combinator 'descendant'` | 42 (24) | 3236 | 29.3% |
| `universal *` | 28 (21) | 274 | 28.0% |
| `:focus-visible` | 24 (17) | 386 | 24.5% |
| `::-webkit-search-decoration` | 12 (12) | 15 | 20.0% |
| `::-webkit-inner-spin-button` | 8 (8) | 10 | 15.6% |
| `:hover` | 38 (24) | 795 | 13.6% |
| `:-moz-focusring` | 6 (6) | 6 | 13.3% |
| `:-moz-ui-invalid` | 6 (6) | 6 | 13.3% |
| `::-webkit-file-upload-button` | 6 (6) | 14 | 13.3% |
| `::file-selector-button` | 6 (6) | 26 | 13.3% |
| `:not` | 27 (22) | 482 | 12.5% |
| `::placeholder` | 22 (16) | 39 | 11.6% |
| `::selection` | 7 (6) | 10 | 11.1% |
| `::-webkit-outer-spin-button` | 5 (5) | 7 | 11.1% |
| `:focus` | 28 (19) | 244 | 10.6% |
| `::-webkit-date-and-time-value` | 6 (6) | 6 | 8.9% |
| `::-webkit-datetime-edit` | 6 (6) | 10 | 8.9% |
| `::-webkit-calendar-picker-indicator` | 5 (5) | 8 | 8.9% |
| `::-webkit-datetime-edit-fields-wrapper` | 4 (4) | 4 | 8.9% |
| `::-webkit-datetime-edit-year-field` | 5 (5) | 5 | 8.9% |
| `::-webkit-datetime-edit-month-field` | 5 (5) | 5 | 8.9% |
| `::-webkit-datetime-edit-day-field` | 5 (5) | 5 | 8.9% |
| `::-webkit-datetime-edit-hour-field` | 5 (5) | 5 | 8.9% |
| `::-webkit-datetime-edit-minute-field` | 5 (5) | 5 | 8.9% |
| `::-webkit-datetime-edit-second-field` | 5 (5) | 5 | 8.9% |
| `::-webkit-datetime-edit-millisecond-field` | 5 (5) | 5 | 8.9% |
| `::-webkit-datetime-edit-meridiem-field` | 4 (4) | 4 | 8.9% |
| `:where` | 14 (14) | 556 | 8.6% |
| `[attribute]` | 29 (22) | 702 | 5.0% |
| `:disabled` | 14 (13) | 103 | 5.0% |

#### at-rule

| at-rule | 判定 | 使うページ(公開) | 出現 |
|---|---|---:|---:|
| `@media (max-width)` | in | 36 (21) | 1041 |
| `@media (min-width)` | in | 29 (21) | 3131 |
| `@media (prefers-reduced-motion)` | cond | 26 (19) | 466 |
| `@keyframes` | n/a | 23 (20) | 484 |
| `@font-face` | n/a | 20 (20) | 584 |
| `@supports` | unlisted | 18 (18) | 580 |
| `@media (hover)` | unlisted | 16 (16) | 398 |
| `@container` | cond | 15 (10) | 270 |
| `@media type only (print)` | in | 13 (13) | 648 |
| `@media (prefers-color-scheme)` | cond | 13 (10) | 90 |
| `@media (forced-colors)` | unlisted | 10 (10) | 176 |
| `@layer` | in | 9 (9) | 703 |
| `@property` | n/a | 9 (9) | 680 |
| `@media (pointer)` | unlisted | 8 (8) | 65 |
| `@media (width)` | in | 6 (6) | 370 |
| `@media range syntax` | in | 6 (6) | 375 |
| `@charset` | n/a | 5 (5) | 13 |
| `@media (-ms-high-contrast)` | unlisted | 4 (4) | 47 |
| `@media type only (screen)` | in | 4 (4) | 39 |
| `@-moz-document` | unlisted | 4 (4) | 4 |
| `@media (min-height)` | in | 4 (4) | 41 |
| `@media (min-resolution)` | unlisted | 4 (4) | 14 |
| `@media (orientation)` | unlisted | 3 (3) | 24 |
| `@starting-style` | unlisted | 3 (3) | 4 |
| `@-webkit-keyframes` | n/a | 3 (3) | 20 |

#### ページごと

| ページ | 種類 | 系 | 要素 | 390px 判定 / 主な系統 | 1280px 判定 / 主な系統 |
|---|---|---|---:|---|---|
| astro-home | landing | tailwind | 1803 | 0.0% unknown (page-level Unknown); element 1803 | 0.0% unknown (page-level Unknown); element 1803 |
| bootstrap-dashboard | app-dashboard | bootstrap | 269 | 23.8% violated; table 105, margin 87, inline-formatting 10 | 23.8% violated; table 105, margin 87, inline-formatting 10 |
| bootstrap-docs | docs | bootstrap | 1069 | 11.5% violated; margin 812, element 54, inline-formatting 37 | 11.4% violated; margin 819, element 54, inline-formatting 37 |
| cloudflare-blog | news-blog | custom | 1141 | 9.5% verified; analysis-limit 856, inline-formatting 107, element 38 | 9.5% verified; analysis-limit 856, inline-formatting 107, element 38 |
| css-tricks | news-blog | wordpress | 1230 | 0.0% unknown (page-level Unknown); analysis-limit 1230 | 0.0% unknown (page-level Unknown); analysis-limit 1230 |
| gov-uk | news-blog | govuk-frontend | 582 | 0.0% unknown (step limit); step-limit 305, margin 229, inline-formatting 34 | 0.0% unknown (step limit); step-limit 306, margin 229, inline-formatting 33 |
| govuk-design-system | docs | govuk-frontend | 1274 | 0.0% unknown (step limit); step-limit 576, margin 548, inline-formatting 68 | 0.0% unknown (step limit); step-limit 576, margin 548, inline-formatting 68 |
| hacker-news | news-blog | table-layout | 780 | 0.4% verified; element 777 | 0.4% verified; element 777 |
| ikea-home | commerce | custom (skapa) | 4575 | 0.0% unknown (step limit); input-bound 3917, step-limit 252, inline-formatting 184 | 0.0% unknown (step limit); input-bound 3917, step-limit 252, inline-formatting 184 |
| mui-dashboard | app-dashboard | mui | 2197 | 0.0% unknown (page-level Unknown); analysis-limit 1981, input-bound 216 | 0.0% unknown (page-level Unknown); analysis-limit 1981, input-bound 216 |
| mui-docs | docs | mui | 379 | 0.0% unknown (page-level Unknown); analysis-limit 379 | 0.0% unknown (page-level Unknown); analysis-limit 379 |
| mui-home | landing | mui | 808 | 0.0% unknown (page-level Unknown); analysis-limit 808 | 0.0% unknown (page-level Unknown); analysis-limit 808 |
| nodejs-home | landing | tailwind | 1106 | 1.5% verified; grid 569, element 284, inline-formatting 156 | 1.5% verified; grid 569, element 284, inline-formatting 156 |
| python-tutorial | docs | sphinx | 627 | 0.0% unknown (page-level Unknown); analysis-limit 446, margin 144, math-function 23 | 71.1% violated; margin 144, math-function 23, text-mixed 14 |
| radix-home | landing | radix themes | 881 | 1.4% verified; selector-other 579, other 101, analysis-limit 85 | 1.4% verified; flex 647, other 99, analysis-limit 85 |
| react-learn | docs | tailwind | 2285 | 0.0% unknown (step limit); unsupported-property 1293, margin 402, input-bound 286 | 0.0% unknown (step limit); unsupported-property 1293, margin 402, input-bound 286 |
| rust-book | docs | mdbook | 584 | 0.0% unknown (page-level Unknown); other 584 | 0.0% unknown (page-level Unknown); other 584 |
| shopify-dawn | commerce | shopify dawn | 1221 | 4.1% verified; element 361, positioned 351, math-function 311 | 3.9% verified; element 361, positioned 351, math-function 313 |
| smashing | news-blog | custom | 753 | 0.0% unknown (step limit); step-limit 403, margin 165, text-mixed 72 | 0.0% unknown (step limit); step-limit 401, margin 165, text-mixed 72 |
| stripe-home | landing | custom | 2892 | 0.0% unknown (page-level Unknown); other 2000, input-bound 892 | 0.0% unknown (page-level Unknown); other 2000, input-bound 892 |
| svelte-home | landing | custom (svelte) | 346 | 1.2% verified; analysis-limit 228, inline-formatting 62, element 38 | 1.2% verified; analysis-limit 228, inline-formatting 62, element 38 |
| vercel-home | landing | tailwind + geist | 1076 | 12.5% violated; analysis-limit 727, margin 150, inline-formatting 52 | 12.5% violated; analysis-limit 727, margin 150, inline-formatting 52 |
| vite-guide | docs | vitepress | 1219 | 0.0% unknown (page-level Unknown); analysis-limit 1137, inline-formatting 80, margin 2 | 0.0% unknown (page-level Unknown); analysis-limit 1137, inline-formatting 80, margin 2 |
| vlmkit-css-challenge-admin-panel | fixture | custom | 146 | 1.4% verified; intrinsic-content 144 | 1.4% verified; intrinsic-content 144 |
| vlmkit-css-challenge-blog-magazine | fixture | custom | 83 | 4.8% verified; intrinsic-content 79 | 50.6% verified; intrinsic-content 34, inline-formatting 3, form-control 2 |
| vlmkit-css-challenge-form-app | fixture | custom | 117 | 1.7% verified; margin 110, intrinsic-content 5 | 1.7% verified; margin 110, intrinsic-content 5 |
| vlmkit-css-challenge-grid-complex | fixture | custom | 131 | 1.5% verified; intrinsic-content 129 | 1.5% verified; intrinsic-content 129 |
| vlmkit-css-challenge-landing-product | fixture | custom | 118 | 5.9% verified; margin 62, intrinsic-content 46, image 2 | 5.1% verified; margin 62, intrinsic-content 50 |
| vlmkit-css-challenge-page | fixture | custom | 143 | 16.8% verified; intrinsic-content 99, inline-formatting 17, margin 3 | 13.3% verified; intrinsic-content 104, inline-formatting 17, margin 3 |
| vlmkit-responsive-card-grid | fixture | custom | 29 | 6.9% verified; grid 27 | 55.2% violated; math-function 13 |
| vlmkit-responsive-container-card | fixture | custom | 29 | 13.8% verified; math-function 25 | 13.8% verified; math-function 25 |
| vlmkit-responsive-data-table | fixture | custom | 33 | 18.2% verified; table 27 | 18.2% verified; table 27 |
| vlmkit-responsive-drawer | fixture | custom | 20 | 85.0% violated; intrinsic-content 2, margin 1 | 25.0% violated; positioned 10, margin 4, intrinsic-content 1 |
| vlmkit-responsive-masthead | fixture | custom | 25 | 32.0% verified; intrinsic-content 13, text-property 4 | 20.0% verified; intrinsic-content 17, text-property 3 |
| vlmkit-responsive-media-object | fixture | custom | 22 | 9.1% verified; grid 20 | 54.5% verified; intrinsic-content 10 |
| vlmkit-responsive-pricing | fixture | custom | 29 | 100.0% verified;  | 100.0% verified;  |
| vlmkit-responsive-sidebar-layout | fixture | custom | 32 | 87.5% verified; element 2, text-mixed 2 | 87.5% violated; element 2, text-mixed 2 |
| vlmkit-sites-dashboard | app-dashboard | custom | 393 | 5.9% verified; math-function 283, intrinsic-content 86, margin 1 | 4.1% verified; intrinsic-content 371, unsupported-property 4, form-control 1 |
| vlmkit-sites-docs | docs | custom | 333 | 12.0% violated; margin 183, positioned 66, intrinsic-content 18 | 0.0% unknown (page-level Unknown); margin 184, grid 93, analysis-limit 20 |
| vlmkit-sites-docs-cli | docs | custom | 694 | 7.3% violated; margin 460, positioned 66, table 50 | 0.0% unknown (page-level Unknown); margin 461, grid 104, table 50 |
| vlmkit-sites-docs-migrations | docs | custom | 295 | 26.4% violated; positioned 66, intrinsic-content 55, text-mixed 40 | 0.0% unknown (page-level Unknown); grid 107, intrinsic-content 51, analysis-limit 44 |
| vlmkit-sites-magazine | news-blog | custom | 934 | 0.0% unknown (page-level Unknown); text-property 934 | 0.0% unknown (page-level Unknown); text-property 934 |
| vlmkit-sites-shop | commerce | custom | 711 | 0.0% unknown (page-level Unknown); text-property 711 | 0.0% unknown (page-level Unknown); text-property 711 |
| vlmkit-solitaire | app-dashboard | custom | 111 | 9.0% violated; pseudo 76, intrinsic-content 8, text-mixed 7 | 9.0% verified; pseudo 76, intrinsic-content 8, text-mixed 7 |
| wikipedia-css | reference | mediawiki | 6473 | 0.1% verified; input-bound 4500, margin 1784, analysis-limit 118 | 0.1% verified; input-bound 4500, margin 1784, analysis-limit 118 |
